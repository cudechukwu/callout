import type { FighterSnapshot } from "./types";
import {
  buildFullAttributeRatings,
  computeDerivedStats,
  type DerivedStats,
  type FullAttributeRatings,
} from "./derivedStats";
import { INITIAL_FATIGUE_STATE, type FatigueState } from "./fatigue";
import { INITIAL_DAMAGE_STATE, type DamageState } from "./damage";

/**
 * A fighter's engine-internal state for the duration of one simulated
 * fight. `ratings` and `derived` are the frozen "build" — computed once
 * from the snapshot and never mutated. `fatigue` and `damage` are the
 * live, mutable state the exchange loop updates every step.
 *
 * This split matters: ratings/derived answer "how good is this build,"
 * fatigue/damage answer "how is this specific fight going" — conflating
 * them would make it impossible to reason about either independently,
 * and would break replay (a snapshot must always derive the same
 * ratings/derived regardless of how far into a fight it is).
 */
export interface Combatant {
  readonly id: string;
  readonly name: string;
  readonly ratings: FullAttributeRatings;
  readonly derived: DerivedStats;
  fatigue: FatigueState;
  damage: DamageState;
}

export function createCombatant(snapshot: FighterSnapshot): Combatant {
  const ratings = buildFullAttributeRatings(snapshot.selections);
  const derived = computeDerivedStats(ratings);
  return {
    id: snapshot.id,
    name: snapshot.name,
    ratings,
    derived,
    // Spread, not a direct reference: every update function in
    // fatigue.ts/damage.ts returns a new object rather than mutating in
    // place, so sharing INITIAL_FATIGUE_STATE/INITIAL_DAMAGE_STATE
    // across both fighters is safe today — but it's one future direct-
    // mutation bug away from fighter A and fighter B silently sharing
    // state. Cheap to rule out entirely.
    fatigue: { ...INITIAL_FATIGUE_STATE },
    damage: { ...INITIAL_DAMAGE_STATE },
  };
}
