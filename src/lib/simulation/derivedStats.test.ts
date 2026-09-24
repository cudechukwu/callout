import { describe, expect, it } from "vitest";
import type { SourceFighter } from "@/lib/data/types";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import {
  assertValidWeights,
  buildFullAttributeRatings,
  computeDerivedStats,
  deriveHiddenAttributes,
} from "./derivedStats";
import type { AttributeSelection, AttributeSelections } from "./types";
import type { VisibleAttribute } from "@/lib/data/types";

/**
 * Builds a minimal SourceFighter row. Only the fields a given test cares
 * about need to be distinct; everything else defaults to a neutral 3.0
 * so it can't accidentally influence an assertion.
 */
function mockSourceFighter(
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

/** Builds selections where every attribute is picked from the same fighter. */
function uniformSelections(sourceFighter: SourceFighter): AttributeSelections {
  return VISIBLE_ATTRIBUTES.reduce((acc, attribute) => {
    acc[attribute] = { sourceFighter };
    return acc;
  }, {} as Record<VisibleAttribute, AttributeSelection>);
}

describe("deriveHiddenAttributes", () => {
  it("computes speed using each pick's own CSV speed value", () => {
    const selections: AttributeSelections = {
      wrestling: {
        sourceFighter: mockSourceFighter(1, "Wrestler", { speed: 2.0, defense: 3.0 }),
      },
      boxing: {
        sourceFighter: mockSourceFighter(2, "Boxer", { speed: 4.0, defense: 5.0 }),
      },
      kickboxing: {
        sourceFighter: mockSourceFighter(3, "Kicker", { speed: 5.0, defense: 2.0 }),
      },
      submissions: {
        sourceFighter: mockSourceFighter(4, "Grappler", { speed: 1.0, defense: 4.0 }),
      },
      power: { sourceFighter: mockSourceFighter(5, "Puncher") },
      cardio: { sourceFighter: mockSourceFighter(6, "Engine") },
      chin: {
        sourceFighter: mockSourceFighter(7, "Rock", { speed: 3.0, defense: 1.0 }),
      },
      fightIq: {
        sourceFighter: mockSourceFighter(8, "Professor", { speed: 2.5, defense: 3.5 }),
      },
    };

    const hidden = deriveHiddenAttributes(selections);

    // speed = boxing*.35 + kickboxing*.35 + fightIq*.15 + wrestling*.15
    //       = 4.0*.35 + 5.0*.35 + 2.5*.15 + 2.0*.15 = 3.825
    expect(hidden.speed).toBeCloseTo(3.825, 9);

    // defense = wrestling*.30 + boxing*.20 + kickboxing*.20
    //         + submissions*.15 + chin*.15
    //         = 3.0*.3 + 5.0*.2 + 2.0*.2 + 4.0*.15 + 1.0*.15 = 3.05
    expect(hidden.defense).toBeCloseTo(3.05, 9);
  });

  it("keeps each attribute's contribution independent of the others", () => {
    // Regression guard for the bug class this refactor eliminated: two
    // fighters differing ONLY in their boxing pick must produce
    // different hidden speed, and identical hidden defense (boxing
    // pick's speed feeds Speed but its defense also feeds Defense — so
    // vary a field that ISN'T shared, to isolate the effect).
    const base = mockSourceFighter(1, "Base", { speed: 3.0 });
    const fasterBoxer = mockSourceFighter(2, "Faster", { speed: 5.0 });

    const withBase = uniformSelections(base);
    const withFasterBoxing: AttributeSelections = {
      ...withBase,
      boxing: { sourceFighter: fasterBoxer },
    };

    const baseHidden = deriveHiddenAttributes(withBase);
    const boostedHidden = deriveHiddenAttributes(withFasterBoxing);

    expect(boostedHidden.speed).toBeGreaterThan(baseHidden.speed);
  });
});

describe("weight table validation", () => {
  it("all-3.0 fighter produces exactly 3.0 hidden speed/defense", () => {
    // Only true if the weight tables genuinely sum to 1.0 — this is an
    // indirect check that assertValidWeights actually ran and passed
    // for the two real tables (HIDDEN_SPEED_WEIGHTS/HIDDEN_DEFENSE_WEIGHTS)
    // at module load.
    const selections = uniformSelections(mockSourceFighter(1, "Neutral"));
    const hidden = deriveHiddenAttributes(selections);

    expect(hidden.speed).toBeCloseTo(3.0, 9);
    expect(hidden.defense).toBeCloseTo(3.0, 9);
  });

  it("accepts a well-formed convex combination", () => {
    expect(() =>
      assertValidWeights({ boxing: 0.6, wrestling: 0.4 }, "test")
    ).not.toThrow();
  });

  it("rejects an empty weight table", () => {
    expect(() => assertValidWeights({}, "test")).toThrow(/at least one/);
  });

  it("rejects weights that don't sum to 1.0", () => {
    expect(() =>
      assertValidWeights({ boxing: 0.5, wrestling: 0.3 }, "test")
    ).toThrow(/must sum to 1.0/);
  });

  it("rejects a negative weight even if the set sums to 1.0", () => {
    // 1.5 + -0.5 = 1.0, but a negative weight is nonsensical for a
    // convex combination — must be rejected on its own, not just by sum.
    expect(() =>
      assertValidWeights({ boxing: 1.5, wrestling: -0.5 }, "test")
    ).toThrow(/must be in \(0, 1\]/);
  });

  it("rejects a weight greater than 1", () => {
    expect(() =>
      assertValidWeights({ boxing: 1.2, wrestling: -0.2 }, "test")
    ).toThrow(/must be in \(0, 1\]/);
  });
});

describe("computeDerivedStats", () => {
  const baseline = {
    wrestling: 3.0,
    submissions: 3.0,
    boxing: 3.0,
    kickboxing: 3.0,
    power: 3.0,
    cardio: 3.0,
    chin: 3.0,
    fightIq: 3.0,
    defense: 3.0,
    speed: 3.0,
  };

  it("preserves a uniform rating across every derived stat", () => {
    const uniform = {
      wrestling: 3.7,
      submissions: 3.7,
      boxing: 3.7,
      kickboxing: 3.7,
      power: 3.7,
      cardio: 3.7,
      chin: 3.7,
      fightIq: 3.7,
      defense: 3.7,
      speed: 3.7,
    };

    const derived = computeDerivedStats(uniform);

    for (const [stat, value] of Object.entries(derived)) {
      expect(value, `${stat} should equal 3.7 for a uniform 3.7 fighter`).toBeCloseTo(
        3.7,
        9
      );
    }
  });

  it("matches the documented formula exactly for a non-uniform fighter", () => {
    const ratings = {
      wrestling: 4.5,
      submissions: 2.1,
      boxing: 3.8,
      kickboxing: 4.9,
      power: 5.0,
      cardio: 2.6,
      chin: 3.3,
      fightIq: 4.1,
      defense: 3.9,
      speed: 4.4,
    };

    const derived = computeDerivedStats(ratings);

    expect(derived.knockoutThreat).toBeCloseTo(
      ratings.power * 0.5 +
        ratings.boxing * 0.25 +
        ratings.speed * 0.15 +
        ratings.fightIq * 0.1,
      9
    );
    expect(derived.takedownOffense).toBeCloseTo(
      ratings.wrestling * 0.7 + ratings.fightIq * 0.2 + ratings.power * 0.1,
      9
    );
    expect(derived.submissionEscape).toBeCloseTo(
      ratings.submissions * 0.4 + ratings.wrestling * 0.4 + ratings.speed * 0.2,
      9
    );
  });

  it("stays within [1, 5] for any input inside the valid rating range", () => {
    // Every weight set is a convex combination of inputs in [1,5], so
    // every output must also land in [1,5] — this would catch a
    // mis-added coefficient that pushes a weight set's sum above 1.0.
    const low = {
      wrestling: 1,
      submissions: 1,
      boxing: 1,
      kickboxing: 1,
      power: 1,
      cardio: 1,
      chin: 1,
      fightIq: 1,
      defense: 1,
      speed: 1,
    };
    const high = {
      wrestling: 5,
      submissions: 5,
      boxing: 5,
      kickboxing: 5,
      power: 5,
      cardio: 5,
      chin: 5,
      fightIq: 5,
      defense: 5,
      speed: 5,
    };

    const EPSILON = 1e-9; // float rounding on weighted sums, not a real bound violation
    for (const ratings of [low, high, baseline]) {
      const derived = computeDerivedStats(ratings);
      for (const [stat, value] of Object.entries(derived)) {
        expect(value, `${stat} out of range`).toBeGreaterThanOrEqual(1 - EPSILON);
        expect(value, `${stat} out of range`).toBeLessThanOrEqual(5 + EPSILON);
      }
    }
  });

  it("raising power increases knockoutThreat and strikePower but not takedownDefense", () => {
    const withPower = { ...baseline, power: 5.0 };

    const base = computeDerivedStats(baseline);
    const boosted = computeDerivedStats(withPower);

    expect(boosted.knockoutThreat).toBeGreaterThan(base.knockoutThreat);
    expect(boosted.strikePower).toBeGreaterThan(base.strikePower);
    expect(boosted.takedownDefense).toBeCloseTo(base.takedownDefense, 9);
  });

  it("raising wrestling increases takedownOffense/Defense but not strikeOffense", () => {
    const withWrestling = { ...baseline, wrestling: 5.0 };

    const base = computeDerivedStats(baseline);
    const boosted = computeDerivedStats(withWrestling);

    expect(boosted.takedownOffense).toBeGreaterThan(base.takedownOffense);
    expect(boosted.takedownDefense).toBeGreaterThan(base.takedownDefense);
    expect(boosted.strikeOffense).toBeCloseTo(base.strikeOffense, 9);
  });

  it("raising cardio increases fatigueResistance and initiative", () => {
    const withCardio = { ...baseline, cardio: 5.0 };

    const base = computeDerivedStats(baseline);
    const boosted = computeDerivedStats(withCardio);

    expect(boosted.fatigueResistance).toBeGreaterThan(base.fatigueResistance);
    expect(boosted.initiative).toBeGreaterThan(base.initiative);
  });
});

describe("buildFullAttributeRatings", () => {
  it("reads visible ratings from each pick's own sourceFighter row", () => {
    const selections: AttributeSelections = {
      wrestling: {
        sourceFighter: mockSourceFighter(1, "Wrestler", { wrestling: 4.5, speed: 2.0, defense: 3.0 }),
      },
      boxing: {
        sourceFighter: mockSourceFighter(2, "Boxer", { boxing: 4.2, speed: 4.0, defense: 5.0 }),
      },
      kickboxing: {
        sourceFighter: mockSourceFighter(3, "Kicker", { kickboxing: 4.8, speed: 5.0, defense: 2.0 }),
      },
      submissions: {
        sourceFighter: mockSourceFighter(4, "Grappler", { submissions: 4.1, speed: 1.0, defense: 4.0 }),
      },
      power: {
        sourceFighter: mockSourceFighter(5, "Puncher", { power: 4.9 }),
      },
      cardio: {
        sourceFighter: mockSourceFighter(6, "Engine", { cardio: 4.7 }),
      },
      chin: {
        sourceFighter: mockSourceFighter(7, "Rock", { chin: 4.6, speed: 3.0, defense: 1.0 }),
      },
      fightIq: {
        sourceFighter: mockSourceFighter(8, "Professor", { fightIq: 4.4, speed: 2.5, defense: 3.5 }),
      },
    };

    const full = buildFullAttributeRatings(selections);

    expect(full.wrestling).toBe(4.5);
    expect(full.boxing).toBe(4.2);
    expect(full.kickboxing).toBe(4.8);
    expect(full.submissions).toBe(4.1);
    expect(full.power).toBe(4.9);
    expect(full.cardio).toBe(4.7);
    expect(full.chin).toBe(4.6);
    expect(full.fightIq).toBe(4.4);
    expect(full.speed).toBeGreaterThan(0);
    expect(full.defense).toBeGreaterThan(0);
  });

  it("can never mix up which fighter's rating belongs to which attribute", () => {
    // Two visibly different fighters. If wrestling and boxing were ever
    // resolved through the wrong entry, this would catch it immediately
    // since the values are deliberately far apart.
    const wrestler = mockSourceFighter(1, "Wrestler", { wrestling: 5.0, boxing: 1.0 });
    const boxer = mockSourceFighter(2, "Boxer", { wrestling: 1.0, boxing: 5.0 });

    const selections: AttributeSelections = {
      ...uniformSelections(mockSourceFighter(3, "Filler")),
      wrestling: { sourceFighter: wrestler },
      boxing: { sourceFighter: boxer },
    };

    const full = buildFullAttributeRatings(selections);

    expect(full.wrestling).toBe(5.0);
    expect(full.boxing).toBe(5.0);
  });
});
