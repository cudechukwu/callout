import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { AttributeSelection, AttributeSelections, FighterSnapshot } from "./types";

/**
 * Synthetic fighter/snapshot builders for tests AND balance tooling —
 * consumed by *.test.ts files directly, and by balanceFixtures.ts,
 * which scripts/balance-report.ts (not a test) also imports. Not part
 * of the public simulation API; never imported from engine.ts or any
 * shipped runtime code path.
 */
export function mockSourceFighter(
  id: number,
  name: string,
  overrides: Partial<Omit<SourceFighter, "id" | "name">> = {}
): SourceFighter {
  return {
    id,
    name,
    wrestling: 3.0,
    submissions: 3.0,
    boxing: 3.0,
    kickboxing: 3.0,
    defense: 3.0,
    cardio: 3.0,
    power: 3.0,
    chin: 3.0,
    fightIq: 3.0,
    speed: 3.0,
    ...overrides,
  };
}

/** Builds a fighter whose all 8 visible attributes come from one uniform source fighter. */
export function buildUniformSnapshot(
  id: string,
  name: string,
  sourceFighter: SourceFighter
): FighterSnapshot {
  // Built as a plain mutable Record during construction, then returned
  // as the readonly AttributeSelections — assigning a mutable object
  // where a Readonly<> is expected is fine; only mutating a value
  // that's already typed Readonly<> is disallowed.
  const selections = VISIBLE_ATTRIBUTES.reduce((acc, attribute) => {
    acc[attribute] = { sourceFighter };
    return acc;
  }, {} as Record<VisibleAttribute, AttributeSelection>);
  return { id, name, selections };
}

export const ELITE_SOURCE_FIGHTER = mockSourceFighter(1001, "Elite", {
  wrestling: 5,
  submissions: 5,
  boxing: 5,
  kickboxing: 5,
  defense: 5,
  cardio: 5,
  power: 5,
  chin: 5,
  fightIq: 5,
  speed: 5,
});

export const WEAK_SOURCE_FIGHTER = mockSourceFighter(1002, "Weak", {
  wrestling: 1,
  submissions: 1,
  boxing: 1,
  kickboxing: 1,
  defense: 1,
  cardio: 1,
  power: 1,
  chin: 1,
  fightIq: 1,
  speed: 1,
});

export const NEUTRAL_SOURCE_FIGHTER = mockSourceFighter(1003, "Neutral", {
  wrestling: 3,
  submissions: 3,
  boxing: 3,
  kickboxing: 3,
  defense: 3,
  cardio: 3,
  power: 3,
  chin: 3,
  fightIq: 3,
  speed: 3,
});
