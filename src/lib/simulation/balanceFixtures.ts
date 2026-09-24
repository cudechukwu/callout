import type { VisibleAttribute } from "@/lib/data/types";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { AttributeSelection, FighterSnapshot } from "./types";
import { mockSourceFighter } from "./testFixtures";

/**
 * Builds a fighter from an explicit per-attribute rating map, with every
 * pick's hidden speed/defense values pinned to `hiddenBaseline` (default
 * neutral 3.0) unless overridden per-attribute via `hiddenOverrides`.
 *
 * This isolates exactly what a balance test wants to vary: e.g. "only
 * cardio differs, everything else — including the hidden composite
 * inputs — is neutral" would be impossible to construct reliably with
 * buildUniformSnapshot (whole-fighter) or real CSV fighters (whose
 * hidden values vary incidentally along with whatever visible attribute
 * you picked them for).
 */
export function buildArchetypeSnapshot(
  id: string,
  name: string,
  attributeValues: Record<VisibleAttribute, number>,
  hiddenBaseline = 3.0,
  hiddenOverrides: Partial<Record<VisibleAttribute, { speed?: number; defense?: number }>> = {}
): FighterSnapshot {
  const selections = VISIBLE_ATTRIBUTES.reduce((acc, attribute) => {
    const value = attributeValues[attribute];
    const hidden = hiddenOverrides[attribute];
    const sourceFighter = mockSourceFighter(
      // Deterministic id from attribute index — uniqueness within one
      // snapshot is all that matters here, these never touch a real DB.
      VISIBLE_ATTRIBUTES.indexOf(attribute) + 1,
      `${name}-${attribute}`,
      {
        [attribute]: value,
        speed: hidden?.speed ?? hiddenBaseline,
        defense: hidden?.defense ?? hiddenBaseline,
      }
    );
    acc[attribute] = { sourceFighter };
    return acc;
  }, {} as Record<VisibleAttribute, AttributeSelection>);
  return { id, name, selections };
}

function uniform(value: number): Record<VisibleAttribute, number> {
  return VISIBLE_ATTRIBUTES.reduce(
    (acc, attr) => ({ ...acc, [attr]: value }),
    {} as Record<VisibleAttribute, number>
  );
}

/** All 8 attributes at 5.0 — the theoretical ceiling build. */
export const ALL_ELITE = buildArchetypeSnapshot("allElite", "All Elite", uniform(5), 5);

/** All 8 attributes at 1.0 — the theoretical floor build. */
export const ALL_WEAK = buildArchetypeSnapshot("allWeak", "All Weak", uniform(1), 1);

/** All 8 attributes at 3.0 — dead-neutral, used for identical-build symmetry checks. */
export const NEUTRAL_A = buildArchetypeSnapshot("neutralA", "Neutral A", uniform(3), 3);
export const NEUTRAL_B = buildArchetypeSnapshot("neutralB", "Neutral B", uniform(3), 3);

/** Striking-forward build: elite boxing/kickboxing/power/speed, weak grappling. */
export const ELITE_STRIKER = buildArchetypeSnapshot(
  "eliteStriker",
  "Elite Striker",
  {
    wrestling: 2,
    submissions: 2,
    boxing: 5,
    kickboxing: 5,
    power: 4.8,
    cardio: 3.5,
    chin: 4,
    fightIq: 3.8,
  },
  4.5 // fast, evasive hidden profile — consistent with a striking archetype
);

/** Grappling-forward build: elite wrestling/submissions/cardio, weak striking. */
export const ELITE_WRESTLER = buildArchetypeSnapshot(
  "eliteWrestler",
  "Elite Wrestler",
  {
    wrestling: 5,
    submissions: 4.8,
    boxing: 2,
    kickboxing: 2,
    power: 3.5,
    cardio: 4.8,
    chin: 4,
    fightIq: 3.8,
  },
  3.5
);

/** Identical except cardio: 5.0 vs 2.0, everything else pinned to 3.0. */
export const HIGH_CARDIO = buildArchetypeSnapshot(
  "highCardio",
  "High Cardio",
  { ...uniform(3), cardio: 5 },
  3
);
export const LOW_CARDIO = buildArchetypeSnapshot(
  "lowCardio",
  "Low Cardio",
  { ...uniform(3), cardio: 2 },
  3
);

/** Identical except chin: 5.0 vs 2.0, everything else pinned to 3.0. */
export const HIGH_CHIN = buildArchetypeSnapshot(
  "highChin",
  "High Chin",
  { ...uniform(3), chin: 5 },
  3
);
export const LOW_CHIN = buildArchetypeSnapshot("lowChin", "Low Chin", { ...uniform(3), chin: 2 }, 3);

/** Identical except wrestling: 5.0 vs 2.0, everything else pinned to 3.0. */
export const HIGH_WRESTLING = buildArchetypeSnapshot(
  "highWrestling",
  "High Wrestling",
  { ...uniform(3), wrestling: 5 },
  3
);
export const LOW_WRESTLING = buildArchetypeSnapshot(
  "lowWrestling",
  "Low Wrestling",
  { ...uniform(3), wrestling: 2 },
  3
);

/** One attribute (power) maxed, everything else neutral — vs a fully neutral fighter. */
export const SINGLE_STAT_POWER = buildArchetypeSnapshot(
  "singleStatPower",
  "Single Stat Power",
  { ...uniform(3), power: 5 },
  3
);

/**
 * Nothing maxed, nothing weak — the "jack of all trades" build. Used to
 * test whether a specific archetype (e.g. ELITE_WRESTLER) is dominant
 * against *everyone*, or just against a specific weakness. See
 * BALANCE_REPORT.md > "Reclassified" — this fixture is what showed
 * ELITE_WRESTLER's edge over ELITE_STRIKER isn't "wrestling beats
 * striking" as categories (a balanced build loses to the pure striker
 * too), it's specifically about takedown defense.
 */
export const BALANCED = buildArchetypeSnapshot(
  "balanced",
  "Balanced",
  {
    wrestling: 3.5,
    submissions: 3.5,
    boxing: 3.5,
    kickboxing: 3.5,
    power: 3.5,
    cardio: 3.5,
    chin: 3.5,
    fightIq: 3.5,
  },
  3.5
);

/**
 * Elite submissions, weak wrestling — tests whether a wrestler's edge
 * is specifically about takedown offense/defense, or "any grappling
 * competency." (It's the former: this build, despite 5.0 submissions,
 * loses to ELITE_WRESTLER even harder than ELITE_STRIKER does, because
 * it still can't stop the takedown that puts it in danger in the first
 * place.)
 */
export const SUBMISSION_SPECIALIST = buildArchetypeSnapshot(
  "subSpecialist",
  "Submission Specialist",
  {
    wrestling: 2.0,
    submissions: 5.0,
    boxing: 2.5,
    kickboxing: 2.5,
    power: 3.0,
    cardio: 4.0,
    chin: 3.5,
    fightIq: 4.0,
  },
  3.0
);

/**
 * ELITE_STRIKER with wrestling bumped from 2.0 to 3.2 — everything else
 * identical. Tests sensitivity: how much does a striker's outcome
 * against ELITE_WRESTLER improve with just SOME takedown defense,
 * rather than none at all.
 */
export const STRIKER_WITH_TD_DEFENSE = buildArchetypeSnapshot(
  "strikerWithDefense",
  "Striker With TD Defense",
  {
    wrestling: 3.2,
    submissions: 2.0,
    boxing: 5.0,
    kickboxing: 5.0,
    power: 4.8,
    cardio: 3.5,
    chin: 4.0,
    fightIq: 3.8,
  },
  4.5
);
// NOTE: STRIKER_WITH_TD_DEFENSE is NOT budget-neutral relative to
// ELITE_STRIKER — wrestling was raised 2.0->3.2 without removing
// anything elsewhere (total budget 30.1 -> 31.3). A review correctly
// flagged that the resulting win-rate shift (66.7% -> 58.0% for the
// wrestler) could partly reflect "this fighter got stronger overall,"
// not "takedown defense specifically matters." Left in place for
// backward compatibility with existing tests, but superseded for rigor
// by strikerWithWrestlingInvestment() below, which holds total budget
// exactly constant.

/**
 * Budget-neutral wrestling-investment sweep, starting from the
 * ELITE_STRIKER profile. `wrestlingDelta` (0 to 3.0) is added to
 * wrestling and removed proportionally — 40% boxing / 40% kickboxing /
 * 20% power — so total stat budget is IDENTICAL at every point on the
 * sweep (verified: 0.4+0.4+0.2 = 1.0, exactly offsetting the +1.0
 * added to wrestling per unit delta). At delta=0 this is exactly
 * ELITE_STRIKER.
 *
 * Exists specifically to answer the confound STRIKER_WITH_TD_DEFENSE
 * left open: does raising wrestling close the gap against
 * ELITE_WRESTLER because of takedown defense, or because the fighter
 * got better overall? See scripts/wrestling-sweep.ts and
 * BALANCE_REPORT.md for the actual run and analysis.
 */
export function strikerWithWrestlingInvestment(wrestlingDelta: number): FighterSnapshot {
  return buildArchetypeSnapshot(
    `strikerWrestling${wrestlingDelta.toFixed(1)}`,
    `Striker+Wrestling${wrestlingDelta.toFixed(1)}`,
    {
      wrestling: 2.0 + wrestlingDelta,
      submissions: 2.0,
      boxing: 5.0 - wrestlingDelta * 0.4,
      kickboxing: 5.0 - wrestlingDelta * 0.4,
      power: 4.8 - wrestlingDelta * 0.2,
      cardio: 3.5,
      chin: 4.0,
      fightIq: 3.8,
    },
    4.5
  );
}

/**
 * The complementary sweep: starting from ELITE_WRESTLER, `wrestlingDelta`
 * is REMOVED from wrestling and added back proportionally (same 40/40/20
 * split) into boxing/kickboxing/power — also budget-neutral. At delta=0
 * this is exactly ELITE_WRESTLER. Tests whether the marginal value of
 * wrestling is symmetric: does a wrestler sacrificing wrestling for
 * striking lose ground against a fixed elite striker at a similar rate
 * to how a striker gains ground by investing the reverse direction?
 */
export function wrestlerWithWrestlingDivestment(wrestlingDelta: number): FighterSnapshot {
  return buildArchetypeSnapshot(
    `wrestlerDivest${wrestlingDelta.toFixed(1)}`,
    `Wrestler-Wrestling${wrestlingDelta.toFixed(1)}`,
    {
      wrestling: 5.0 - wrestlingDelta,
      submissions: 4.8,
      boxing: 2.0 + wrestlingDelta * 0.4,
      kickboxing: 2.0 + wrestlingDelta * 0.4,
      power: 3.5 + wrestlingDelta * 0.2,
      cardio: 4.8,
      chin: 4.0,
      fightIq: 3.8,
    },
    3.5
  );
}
