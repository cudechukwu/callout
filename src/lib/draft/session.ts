import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import type { AttributeSelection, FighterSnapshot, RNG } from "@/lib/simulation/types";
import { generateDraftPlan, OFFERS_PER_ROUND, type DraftPlan } from "./plan";
import { DRAFT_POOL, poolByTier } from "./draftPool";
import { classifyTier, type DraftTier } from "./tiers";
import { createRng } from "@/lib/simulation/rng";

/** Locked in LOCKED_DECISIONS.md > Decision 2: a single pool of 2
 * rerolls usable at any point across the whole draft, not per-round. */
const TOTAL_REROLLS = OFFERS_PER_ROUND - 1;

type CandidateTrio = readonly [SourceFighter, SourceFighter, SourceFighter];

/** What was on the board in one round and which fighter was taken. Kept so
 * the reveal can grade your calls against the cards you were actually shown. */
export interface BoardRecord {
  readonly attribute: VisibleAttribute;
  /** The board the pick was made from (after any rerolls that round). */
  readonly cards: CandidateTrio;
  readonly pickedId: number;
  /** 0 = base board, 1-2 = rerolled offers. */
  readonly offerIndex: number;
}

/**
 * Immutable draft state. Every action below (startDraft/reroll/
 * selectCandidate) is a pure function: (state, ...) -> new state. No
 * method mutates its input, so every transition is independently testable
 * and trivially replayable.
 *
 * Every board comes from `plan`, fixed when the draft starts (see plan.ts),
 * so the actions need no RNG: the same plan and the same choices always
 * give the same draft. Boards can repeat a fighter you already used; such
 * cards stay on the board and cannot be picked (see `isAlreadyUsed`).
 */
export interface DraftSessionState {
  readonly plan: DraftPlan;
  /**
   * Single-player: a fighter you already used is swapped out of any board
   * for a fresh one of the same tier, so you never see "Already used".
   * Challenges keep the plan's boards exactly (both players must see the
   * same cards), so there a used fighter shows greyed out.
   */
  readonly solo: boolean;
  readonly attributeOrder: readonly VisibleAttribute[];
  readonly roundIndex: number; // index into attributeOrder; === length means complete
  /** Which of the round's planned offers is showing: 0 base, 1-2 rerolls. */
  readonly offerIndex: number;
  readonly currentCandidates: CandidateTrio | null;
  readonly selections: ReadonlyMap<VisibleAttribute, SourceFighter>;
  readonly usedFighterIds: ReadonlySet<number>;
  readonly rerollsRemaining: number;
  /** One record per completed round, in order. */
  readonly history: readonly BoardRecord[];
}

const fighterIndexes = new WeakMap<readonly SourceFighter[], Map<number, SourceFighter>>();

function fighterById(pool: readonly SourceFighter[], id: number): SourceFighter {
  let index = fighterIndexes.get(pool);
  if (!index) {
    index = new Map(pool.map((f) => [f.id, f]));
    fighterIndexes.set(pool, index);
  }
  const fighter = index.get(id);
  if (!fighter) throw new Error(`Fighter id ${id} is in the draft plan but not in the pool`);
  return fighter;
}

/** Nearest tiers first, for a replacement when a tier has no one left. */
const NEAREST_TIERS: Record<DraftTier, readonly DraftTier[]> = {
  elite: ["elite", "strong", "solid", "wildcard"],
  strong: ["strong", "elite", "solid", "wildcard"],
  solid: ["solid", "strong", "wildcard", "elite"],
  wildcard: ["wildcard", "solid", "strong", "elite"],
};

function offerFor(
  plan: DraftPlan,
  roundIndex: number,
  offerIndex: number,
  pool: readonly SourceFighter[],
  solo = false,
  used: ReadonlySet<number> = new Set()
): CandidateTrio {
  const round = plan.rounds[roundIndex]!;
  const cards = round.offers[offerIndex]!.map((id) => fighterById(pool, id));
  if (!solo || !cards.some((card) => used.has(card.id))) return cards as unknown as CandidateTrio;

  // Swap each used fighter for one of the same tier that hasn't been used,
  // isn't on this board and isn't in this round's other offers (a reroll
  // should still show new names). Seeded by the plan and the picks so far,
  // so the same draft always shows the same board.
  const attribute = round.attribute;
  const tiers = poolByTier(attribute, pool);
  const taken = new Set<number>([...used, ...round.offers.flat()]);
  const rng = createRng(`${plan.seed}:solo:${roundIndex}:${offerIndex}:${[...used].sort((a, b) => a - b).join(",")}`);
  const swapped = cards.map((card) => {
    if (!used.has(card.id)) return card;
    for (const tier of NEAREST_TIERS[classifyTier(card[attribute])]) {
      const options = tiers[tier].filter((f) => !taken.has(f.id));
      if (options.length > 0) {
        const replacement = options[Math.floor(rng.next() * options.length)]!;
        taken.add(replacement.id);
        return replacement;
      }
    }
    return card; // pool exhausted: not reachable with 70 fighters and 8 picks
  });
  return swapped as unknown as CandidateTrio;
}

export function isDraftComplete(state: DraftSessionState): boolean {
  return state.roundIndex >= state.attributeOrder.length;
}

/** A card showing a fighter this draft already used: visible, not pickable. */
export function isAlreadyUsed(state: Pick<DraftSessionState, "usedFighterIds">, fighterId: number): boolean {
  return state.usedFighterIds.has(fighterId);
}

/** Starts a draft on a given plan (multiplayer, shared seeds, tests). */
export function startDraftFromPlan(
  plan: DraftPlan,
  pool: readonly SourceFighter[] = DRAFT_POOL,
  { solo = false }: { solo?: boolean } = {}
): DraftSessionState {
  return {
    plan,
    solo,
    attributeOrder: plan.attributeOrder,
    roundIndex: 0,
    offerIndex: 0,
    currentCandidates: offerFor(plan, 0, 0, pool),
    selections: new Map(),
    usedFighterIds: new Set(),
    rerollsRemaining: TOTAL_REROLLS,
    history: [],
  };
}

/** Starts a single-player draft (no repeats) on a fresh plan seeded from `rng`. */
export function startDraft(
  rng: RNG,
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  const seed = Math.floor(rng.next() * 2 ** 31);
  return startDraftFromPlan(generateDraftPlan(seed, pool), pool, { solo: true });
}

/** Shows the round's next planned offer. Does not touch selections or
 * usedFighterIds: nothing was picked, so nothing was spent. */
export function reroll(
  state: DraftSessionState,
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  if (isDraftComplete(state)) {
    throw new Error("Cannot reroll: draft is already complete");
  }
  if (state.rerollsRemaining <= 0) {
    throw new Error("No rerolls remaining");
  }
  const offerIndex = state.offerIndex + 1;
  return {
    ...state,
    offerIndex,
    currentCandidates: offerFor(state.plan, state.roundIndex, offerIndex, pool, state.solo, state.usedFighterIds),
    rerollsRemaining: state.rerollsRemaining - 1,
  };
}

/**
 * Locks in one of the 3 current cards for the current attribute, then
 * either advances to the next round's base board or completes the draft.
 * A fighter already used for another attribute cannot be picked again.
 */
export function selectCandidate(
  state: DraftSessionState,
  fighterId: number,
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
  if (isAlreadyUsed(state, fighterId)) {
    throw new Error(`${chosen.name} is already used in this draft`);
  }

  const attribute = state.attributeOrder[state.roundIndex]!;
  const selections = new Map(state.selections);
  selections.set(attribute, chosen);
  const usedFighterIds = new Set(state.usedFighterIds);
  usedFighterIds.add(chosen.id);

  const roundIndex = state.roundIndex + 1;
  const complete = roundIndex >= state.attributeOrder.length;

  return {
    plan: state.plan,
    solo: state.solo,
    attributeOrder: state.attributeOrder,
    roundIndex,
    offerIndex: 0,
    currentCandidates: complete ? null : offerFor(state.plan, roundIndex, 0, pool, state.solo, usedFighterIds),
    selections,
    usedFighterIds,
    rerollsRemaining: state.rerollsRemaining,
    history: [
      ...state.history,
      { attribute, cards: state.currentCandidates!, pickedId: fighterId, offerIndex: state.offerIndex },
    ],
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
