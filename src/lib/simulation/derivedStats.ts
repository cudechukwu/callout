import type { VisibleAttribute } from "@/lib/data/types";
import type { AttributeSelections } from "./types";

/**
 * Ratings for all 8 visible + 2 hidden attributes, on the source 1.0-5.0
 * scale. This is the flat input the rest of the engine works from.
 * Readonly: once built, nothing downstream should mutate a fighter's
 * base ratings — a fight's fatigue/damage state lives elsewhere.
 */
export interface FullAttributeRatings {
  readonly wrestling: number;
  readonly submissions: number;
  readonly boxing: number;
  readonly kickboxing: number;
  readonly power: number;
  readonly cardio: number;
  readonly chin: number;
  readonly fightIq: number;
  readonly defense: number;
  readonly speed: number;
}

/**
 * Hidden Speed/Defense are NOT simple averages of the two "closest"
 * visible picks — they're weighted composites pulling from the actual
 * CSV speed/defense values of several picks, so a fast Boxing pick still
 * contributes speed even though Speed itself isn't drafted.
 *
 * Weights are a locked decision (DESIGN_FINAL.md > Game Design: Draft
 * System > Why 8 Attributes, Not 10) and must sum to 1.0 each. Wrestling
 * contributing 15% to Speed is intentional (explosiveness/reaction time
 * of the wrestling pick reasonably informs composite speed) — this is
 * documented in DESIGN_FINAL.md alongside this file; if either changes,
 * update both.
 */
const HIDDEN_SPEED_WEIGHTS: Partial<Record<VisibleAttribute, number>> = {
  boxing: 0.35,
  kickboxing: 0.35,
  fightIq: 0.15,
  wrestling: 0.15,
};

const HIDDEN_DEFENSE_WEIGHTS: Partial<Record<VisibleAttribute, number>> = {
  wrestling: 0.3,
  boxing: 0.2,
  kickboxing: 0.2,
  submissions: 0.15,
  chin: 0.15,
};

/**
 * Validates that a weight table is actually a convex combination: every
 * weight in (0, 1], and the set sums to 1.0. Catches both typos (a
 * forgotten coefficient making the sum 0.85) and nonsense (a negative
 * weight canceling another out to fake a sum of 1.0).
 */
export function assertValidWeights(
  weights: Partial<Record<VisibleAttribute, number>>,
  label: string
): void {
  const entries = Object.entries(weights);

  if (entries.length === 0) {
    throw new Error(`${label} must contain at least one weight`);
  }

  for (const [attribute, weight] of entries) {
    if (weight == null || !Number.isFinite(weight) || weight <= 0 || weight > 1) {
      throw new Error(
        `${label}.${attribute} must be in (0, 1], got ${weight}`
      );
    }
  }

  const sum = entries.reduce((acc, [, weight]) => acc + (weight ?? 0), 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`${label} weights must sum to 1.0, got ${sum}`);
  }
}

// Fail fast at module load if someone edits a weight table and forgets
// to rebalance it — cheaper than discovering it via a weird sim result.
assertValidWeights(HIDDEN_SPEED_WEIGHTS, "HIDDEN_SPEED_WEIGHTS");
assertValidWeights(HIDDEN_DEFENSE_WEIGHTS, "HIDDEN_DEFENSE_WEIGHTS");

function weightedComposite(
  selections: AttributeSelections,
  weights: Partial<Record<VisibleAttribute, number>>,
  sourceField: "speed" | "defense"
): number {
  let total = 0;
  for (const [attribute, weight] of Object.entries(weights) as Array<
    [VisibleAttribute, number]
  >) {
    const selection = selections[attribute];
    total += selection.sourceFighter[sourceField] * weight;
  }
  return total;
}

/**
 * Derives the two hidden attributes from the CSV rows of whichever
 * fighters were picked for the visible attributes. Reads only from
 * `selections` — every pick already carries its own frozen source row,
 * so there's no second lookup object that could disagree with it.
 */
export function deriveHiddenAttributes(
  selections: AttributeSelections
): { speed: number; defense: number } {
  return {
    speed: weightedComposite(selections, HIDDEN_SPEED_WEIGHTS, "speed"),
    defense: weightedComposite(selections, HIDDEN_DEFENSE_WEIGHTS, "defense"),
  };
}

/**
 * Flattens a fighter's selections + derived hidden attributes into the
 * full 10-value rating set the simulation math operates on. Visible
 * ratings are read from each pick's own sourceFighter row (not a
 * separately-stored "rating" field) so there's exactly one place a
 * rating value can come from.
 */
export function buildFullAttributeRatings(
  selections: AttributeSelections
): FullAttributeRatings {
  const hidden = deriveHiddenAttributes(selections);
  return {
    wrestling: selections.wrestling.sourceFighter.wrestling,
    submissions: selections.submissions.sourceFighter.submissions,
    boxing: selections.boxing.sourceFighter.boxing,
    kickboxing: selections.kickboxing.sourceFighter.kickboxing,
    power: selections.power.sourceFighter.power,
    cardio: selections.cardio.sourceFighter.cardio,
    chin: selections.chin.sourceFighter.chin,
    fightIq: selections.fightIq.sourceFighter.fightIq,
    defense: hidden.defense,
    speed: hidden.speed,
  };
}

/**
 * Hidden fighting stats used by the exchange loop. Every weight set
 * below sums to 1.0 — see DESIGN_FINAL.md > Game Design: Fight
 * Simulation > Derived Stats. Kept in one place so rebalancing means
 * editing coefficients here, not hunting through engine.ts.
 *
 * Note on "effective" influence: because Chin and Wrestling also feed
 * into hidden Defense (see weight tables above), their real-world
 * influence on e.g. knockoutResistance is slightly higher than the
 * coefficient below suggests (~64.5% effective for Chin, not 60%, once
 * its indirect contribution via Defense is included). This is intended,
 * not a bug — but it's exactly the kind of thing the balance harness
 * should surface, not something to hand-tune away here.
 */
export interface DerivedStats {
  readonly strikeOffense: number;
  readonly strikePower: number;
  readonly knockoutThreat: number;
  readonly takedownOffense: number;
  readonly takedownDefense: number;
  readonly submissionOffense: number;
  readonly submissionDefense: number;
  readonly knockoutResistance: number;
  readonly submissionEscape: number;
  readonly fatigueResistance: number;
  readonly initiative: number;
}

export function computeDerivedStats(r: FullAttributeRatings): DerivedStats {
  return {
    strikeOffense: r.boxing * 0.5 + r.kickboxing * 0.3 + r.speed * 0.2,
    strikePower: r.power * 0.6 + r.boxing * 0.25 + r.kickboxing * 0.15,
    knockoutThreat:
      r.power * 0.5 + r.boxing * 0.25 + r.speed * 0.15 + r.fightIq * 0.1,

    takedownOffense: r.wrestling * 0.7 + r.fightIq * 0.2 + r.power * 0.1,
    takedownDefense: r.wrestling * 0.6 + r.speed * 0.2 + r.defense * 0.2,
    submissionOffense:
      r.submissions * 0.65 + r.wrestling * 0.2 + r.fightIq * 0.15,
    submissionDefense:
      r.submissions * 0.5 + r.wrestling * 0.3 + r.fightIq * 0.2,

    knockoutResistance: r.chin * 0.6 + r.defense * 0.3 + r.cardio * 0.1,
    submissionEscape: r.submissions * 0.4 + r.wrestling * 0.4 + r.speed * 0.2,
    fatigueResistance: r.cardio * 0.7 + r.chin * 0.2 + r.fightIq * 0.1,

    initiative: r.speed * 0.4 + r.fightIq * 0.4 + r.cardio * 0.2,
  };
}
