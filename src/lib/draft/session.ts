import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import type { AttributeSelection, FighterSnapshot, RNG } from "@/lib/simulation/types";
import { generateCandidates } from "./candidates";
import { DRAFT_POOL } from "./draftPool";

/** Locked in LOCKED_DECISIONS.md > Decision 2: a single pool of 2
 * rerolls usable at any point across the whole draft, not per-round. */
const TOTAL_REROLLS = 2;

/**
 * Immutable draft state. Every action below (startDraft/reroll/
 * selectCandidate) is a pure function: (state, ...) -> new state. No
 * method mutates its input — the same pattern as the simulation
 * engine's ExchangeContext, chosen for the same reason: it makes every
 * transition independently testable and trivially replayable.
 *
 * `rng` is deliberately NOT stored on this type. It's a stream, not
 * data — storing it would make DraftSessionState look comparable/
 * serializable when part of it secretly wouldn't be. Callers thread an
 * RNG through each action explicitly, same as simulateFight threads it
 * through each exchange.
 */
/** What was on the board in one round and which fighter was taken. Kept so
 * the reveal can grade your calls against the cards you were actually shown. */
export interface BoardRecord {
  readonly attribute: VisibleAttribute;
  readonly cards: readonly [SourceFighter, SourceFighter, SourceFighter];
  readonly pickedId: number;
}

export interface DraftSessionState {
  readonly attributeOrder: readonly VisibleAttribute[];
  readonly roundIndex: number; // index into attributeOrder; === length means complete
  readonly currentCandidates: readonly [SourceFighter, SourceFighter, SourceFighter] | null;
  readonly selections: ReadonlyMap<VisibleAttribute, SourceFighter>;
  readonly usedFighterIds: ReadonlySet<number>;
  readonly rerollsRemaining: number;
  /** One record per completed round, in order. */
  readonly history: readonly BoardRecord[];
}

/**
 * generateCandidates builds each slot from a different tier mix (slot 1
 * leans elite, slot 3 carries the wildcard chance), so its output order
 * leaks quality. With ratings hidden, the whole point is choosing by
 * knowledge, so what players see is shuffled: the mix of quality stays
 * the same, but position no longer tells you which card is strongest.
 */
type CandidateTrio = readonly [SourceFighter, SourceFighter, SourceFighter];

function shuffleCandidates(candidates: CandidateTrio, rng: RNG): CandidateTrio {
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled as unknown as CandidateTrio;
}

export function isDraftComplete(state: DraftSessionState): boolean {
  return state.roundIndex >= state.attributeOrder.length;
}

/** Fisher-Yates shuffle, driven by the same seeded RNG as everything
 * else — this is what "randomized draft order" (DESIGN_FINAL.md >
 * Draft Order) actually means: not fixed per game, deterministic per
 * seed. */
function shuffleAttributes(rng: RNG): VisibleAttribute[] {
  const order = [...VISIBLE_ATTRIBUTES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const temp = order[i]!;
    order[i] = order[j]!;
    order[j] = temp;
  }
  return order;
}

export function startDraft(
  rng: RNG,
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  const attributeOrder = shuffleAttributes(rng);
  const currentCandidates = shuffleCandidates(
    generateCandidates(attributeOrder[0]!, new Set(), rng, pool),
    rng
  );
  return {
    attributeOrder,
    roundIndex: 0,
    currentCandidates,
    selections: new Map(),
    usedFighterIds: new Set(),
    rerollsRemaining: TOTAL_REROLLS,
    history: [],
  };
}

/** Refreshes the current round's 3 candidates. Does not touch
 * selections or usedFighterIds — nothing was picked, so nothing was
 * spent. */
export function reroll(
  state: DraftSessionState,
  rng: RNG,
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  if (isDraftComplete(state)) {
    throw new Error("Cannot reroll: draft is already complete");
  }
  if (state.rerollsRemaining <= 0) {
    throw new Error("No rerolls remaining");
  }
  const attribute = state.attributeOrder[state.roundIndex]!;
  // A reroll should show new names, so also exclude the three being
  // thrown away. If that ever leaves too few fighters for the attribute
  // (not expected with this pool), fall back to only excluding picks.
  const excluded = new Set(state.usedFighterIds);
  for (const candidate of state.currentCandidates ?? []) excluded.add(candidate.id);
  let generated: ReturnType<typeof generateCandidates>;
  try {
    generated = generateCandidates(attribute, excluded, rng, pool);
  } catch {
    generated = generateCandidates(attribute, state.usedFighterIds, rng, pool);
  }
  const currentCandidates = shuffleCandidates(generated, rng);
  return {
    ...state,
    currentCandidates,
    rerollsRemaining: state.rerollsRemaining - 1,
  };
}

/**
 * Locks in one of the 3 currently-displayed candidates for the current
 * attribute, then either advances to the next round (generating its
 * candidates, excluding every fighter used so far — this is where the
 * one-per-fighter constraint is actually enforced) or completes the
 * draft if this was the last attribute.
 */
export function selectCandidate(
  state: DraftSessionState,
  fighterId: number,
  rng: RNG,
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  if (isDraftComplete(state)) {
    throw new Error("Cannot select: draft is already complete");
  }
  const chosen = state.currentCandidates?.find((f) => f.id === fighterId);
  if (!chosen) {
    throw new Error(
      `Fighter id ${fighterId} is not one of the current candidates ` +
        `(${state.currentCandidates?.map((f) => f.id).join(", ")})`
    );
  }

  const attribute = state.attributeOrder[state.roundIndex]!;
  const selections = new Map(state.selections);
  selections.set(attribute, chosen);
  const usedFighterIds = new Set(state.usedFighterIds);
  usedFighterIds.add(chosen.id);

  const roundIndex = state.roundIndex + 1;
  const complete = roundIndex >= state.attributeOrder.length;
  const currentCandidates = complete
    ? null
    : shuffleCandidates(
        generateCandidates(state.attributeOrder[roundIndex]!, usedFighterIds, rng, pool),
        rng
      );

  return {
    attributeOrder: state.attributeOrder,
    roundIndex,
    currentCandidates,
    selections,
    usedFighterIds,
    rerollsRemaining: state.rerollsRemaining,
    history: [...state.history, { attribute, cards: state.currentCandidates!, pickedId: fighterId }],
  };
}

/**
 * Converts a completed draft into the FighterSnapshot the simulation
 * engine actually consumes. Throws if called before completion — the
 * caller should check isDraftComplete() (or handle the throw) rather
 * than this silently returning a partial/invalid snapshot.
 */
export function toFighterSnapshot(
  state: DraftSessionState,
  id: string,
  name: string
): FighterSnapshot {
  if (!isDraftComplete(state)) {
    throw new Error(
      `Cannot build a FighterSnapshot: draft is not complete (round ${state.roundIndex}/${state.attributeOrder.length})`
    );
  }

  const selections = VISIBLE_ATTRIBUTES.reduce((acc, attribute) => {
    const sourceFighter = state.selections.get(attribute);
    if (!sourceFighter) {
      // Should be unreachable if isDraftComplete is true — every round
      // writes a selection before advancing roundIndex — but a thrown
      // error here beats silently building a snapshot with a gap.
      throw new Error(`Draft marked complete but missing a selection for "${attribute}"`);
    }
    acc[attribute] = { sourceFighter };
    return acc;
  }, {} as Record<VisibleAttribute, AttributeSelection>);

  return { id, name, selections };
}
