import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";

/**
 * Deterministic RNG interface. The engine only ever calls rng.next().
 * Swapping the underlying PRNG implementation (rng.ts) never touches
 * simulation logic. See DESIGN_FINAL.md > Deterministic Replay.
 */
export interface RNG {
  /** Returns a float in [0, 1). */
  next(): number;
}

/**
 * A single drafted pick: the FULL frozen source-fighter row it was
 * picked from — not just an id to join against elsewhere, and not
 * tagged with which attribute it was picked for (that's already the key
 * in `AttributeSelections`; storing it again on the value would let the
 * two disagree, e.g. `selections.boxing = { attribute: "wrestling", ... }`,
 * with nothing catching it — the same class of unenforced-invariant bug
 * this type already exists to eliminate for the sourceFighter/rating
 * split. If a serialized snapshot ever needs the attribute name
 * alongside the row, derive it from `Object.entries(selections)`, don't
 * store it twice.).
 *
 * This is deliberate. An earlier version stored {sourceFighterId, rating}
 * here and required a second `sourceFighters` lookup object to resolve
 * hidden Speed/Defense. That created an unenforced invariant (the lookup
 * entry for "boxing" must actually be the same fighter as
 * selections.boxing) that nothing in the type system guaranteed — two
 * independently-constructed objects could silently disagree, corrupting
 * simulation input with no error anywhere. Embedding the row directly
 * makes that class of bug impossible: there is only one object, so
 * there's nothing to fall out of sync.
 *
 * It also fixes determinism: hidden attributes must derive from the
 * source values *as they were when this fighter/fight was frozen*, not
 * from a live source_fighters table that an admin may retune later.
 * Embedding the row is what actually makes a FighterSnapshot self-
 * contained enough to replay bit-for-bit. See DESIGN_FINAL.md >
 * Deterministic Replay.
 *
 * Trust boundary: this type is safe for the simulation engine to trust
 * blindly. It is NOT safe to construct from client input — the API layer
 * building a FighterSnapshot must resolve `sourceFighter` server-side by
 * id from the authoritative SOURCE_FIGHTERS table, never accept a
 * fighter row the client sent directly.
 *
 * `readonly` throughout: the guarantee this type exists for is "snapshot
 * inputs cannot change while simulating/replaying" — the compiler should
 * help enforce that, not just the docstring.
 */
export interface AttributeSelection {
  readonly sourceFighter: Readonly<SourceFighter>;
}

export type AttributeSelections = Readonly<
  Record<VisibleAttribute, AttributeSelection>
>;

export interface FighterSnapshot {
  readonly id: string;
  readonly name: string;
  readonly selections: AttributeSelections;
}

/**
 * The shared fight state for where the two fighters are relative to each
 * other. Modeled as ONE value both fighters are checked against — not a
 * `Record<fighterId, Position>` per fighter — because that per-fighter
 * form let two independent entries disagree (e.g. both fighters "topGround"
 * at once, or one "distance" while the other is "clinch") with nothing in
 * the type system preventing it. This union makes that class of
 * impossible state unrepresentable: there is no `topFighterId` without a
 * corresponding, implied `bottomFighterId` being "whoever isn't that."
 */
export type FightPosition =
  | { readonly kind: "distance" }
  | { readonly kind: "clinch" }
  | { readonly kind: "ground"; readonly topFighterId: string };

export const DISTANCE: FightPosition = { kind: "distance" };
export const CLINCH: FightPosition = { kind: "clinch" };

/**
 * A fighter's role determines their action menu (see actions.ts >
 * ACTION_MENU). Distance and clinch are symmetric — both fighters share
 * the same menu — so only ground splits into top/bottom.
 */
export type PositionRole = "distance" | "clinch" | "top" | "bottom";

export function roleFor(position: FightPosition, fighterId: string): PositionRole {
  if (position.kind === "ground") {
    return position.topFighterId === fighterId ? "top" : "bottom";
  }
  return position.kind;
}

export const POSITION_ROLES: readonly PositionRole[] = [
  "distance",
  "clinch",
  "top",
  "bottom",
];

export const DAMAGE_ZONES = ["head", "body", "leg"] as const;
export type DamageZone = (typeof DAMAGE_ZONES)[number];

export type FightMethod = "KO" | "TKO" | "SUB" | "DEC";

export interface SimulationEvent {
  sequence: number;
  round: number;
  fightTimeSeconds: number;
  type: string;
  actorId: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface FighterFightStats {
  significantStrikesAttempted: number;
  significantStrikesLanded: number;
  takedownsAttempted: number;
  takedownsLanded: number;
  controlSeconds: number;
  submissionAttempts: number;
  /**
   * Cumulative damage dealt to each of the opponent's zones (damage.ts
   * scale, unbounded sum across the round/fight — NOT the opponent's
   * clamped 0-100 DamageState). Currently diagnostic only: computeRoundScore
   * (engine.ts) does not use these yet — decision scoring counts landed
   * strikes uniformly regardless of type or damage, which a review flagged
   * as a likely contributor to underweighting high-impact striking versus
   * high-volume grappling. Added so that can be measured directly (e.g.
   * via the harness) before changing the scoring formula, rather than
   * guessing at another coefficient. See BALANCE_REPORT.md.
   */
  headDamageDealt: number;
  bodyDamageDealt: number;
  legDamageDealt: number;
}

export interface FightResult {
  winnerId: string;
  method: FightMethod;
  round: number;
  /**
   * Time WITHIN `round`, in seconds (0-300) — NOT elapsed fight time.
   * A round-3 decision has `round: 3, roundTimeSeconds: 300`; a round-2
   * finish at 1:30 has `round: 2, roundTimeSeconds: 90`. To get total
   * elapsed fight time: `(round - 1) * ROUND_DURATION_SECONDS +
   * roundTimeSeconds`. Named explicitly (not `timeSeconds`) after a bug
   * where the harness summed this field directly and silently
   * undercounted every fight that didn't end in round 1.
   */
  roundTimeSeconds: number;
  events: SimulationEvent[];
  stats: Record<string, FighterFightStats>;
}

export interface SimulationConfig {
  seed: number;
  engineVersion: string;
}
