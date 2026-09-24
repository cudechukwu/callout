import { describe, expect, it } from "vitest";
import {
  ACTION_ENERGY_COST,
  applyActionCost,
  computeFatiguePerformanceModifiers,
  fatigueCostMultiplier,
  recoverBetweenRounds,
  type FatigueState,
} from "./fatigue";

describe("fatigueCostMultiplier", () => {
  it("is 1.0 at neutral (3.0) fatigueResistance", () => {
    expect(fatigueCostMultiplier(3.0)).toBeCloseTo(1.0, 9);
  });

  it("is 0.75 at max (5.0) fatigueResistance — 25% cheaper actions", () => {
    expect(fatigueCostMultiplier(5.0)).toBeCloseTo(0.75, 9);
  });

  it("is 1.2 at min (1.0) fatigueResistance — 20% costlier actions", () => {
    expect(fatigueCostMultiplier(1.0)).toBeCloseTo(1.2, 9);
  });

  it("decreases monotonically as fatigueResistance rises", () => {
    const samples = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
    const multipliers = samples.map(fatigueCostMultiplier);
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeLessThanOrEqual(multipliers[i - 1]!);
    }
  });
});

describe("applyActionCost", () => {
  const fresh: FatigueState = { energy: 100, cumulativeFatigue: 0 };

  it("matches the exact scaled cost for a neutral fighter", () => {
    // jab costs 5, multiplier at 3.0 resistance is 1.0 -> scaledCost = 5
    const result = applyActionCost(fresh, "jab", 3.0);
    expect(result.energy).toBeCloseTo(95, 9);
    expect(result.cumulativeFatigue).toBeCloseTo(5 * 0.2, 9); // 1.0
  });

  it("matches the exact scaled cost for a high-cardio fighter", () => {
    // powerShot costs 12, multiplier at 5.0 resistance is 0.75 -> scaledCost = 9
    const result = applyActionCost(fresh, "powerShot", 5.0);
    expect(result.energy).toBeCloseTo(91, 9);
    expect(result.cumulativeFatigue).toBeCloseTo(9 * 0.2, 9); // 1.8
  });

  it("matches the exact scaled cost for a low-cardio fighter", () => {
    // powerShot costs 12, multiplier at 1.0 resistance is 1.2 -> scaledCost = 14.4
    const result = applyActionCost(fresh, "powerShot", 1.0);
    expect(result.energy).toBeCloseTo(85.6, 9);
    expect(result.cumulativeFatigue).toBeCloseTo(14.4 * 0.2, 9); // 2.88
  });

  it("a fresher fighter spends less energy on the same action than a gassed one costs cumulatively", () => {
    const highCardio = applyActionCost(fresh, "powerShot", 5.0);
    const lowCardio = applyActionCost(fresh, "powerShot", 1.0);
    expect(highCardio.energy).toBeGreaterThan(lowCardio.energy);
    expect(highCardio.cumulativeFatigue).toBeLessThan(lowCardio.cumulativeFatigue);
  });

  it("never drops energy below 0 even after many costly actions", () => {
    let state = fresh;
    for (let i = 0; i < 50; i++) {
      state = applyActionCost(state, "powerShot", 1.0); // worst case: low cardio
    }
    expect(state.energy).toBeGreaterThanOrEqual(0);
  });

  it("never raises cumulativeFatigue above 100 even after many costly actions", () => {
    let state: FatigueState = { energy: 100, cumulativeFatigue: 0 };
    for (let i = 0; i < 200; i++) {
      state = applyActionCost(state, "powerShot", 1.0);
    }
    expect(state.cumulativeFatigue).toBeLessThanOrEqual(100);
  });

  it("every defined action has a positive base cost", () => {
    for (const [action, cost] of Object.entries(ACTION_ENERGY_COST)) {
      expect(cost, `${action} cost should be positive`).toBeGreaterThan(0);
    }
  });
});

describe("recoverBetweenRounds", () => {
  const wornDown: FatigueState = { energy: 20, cumulativeFatigue: 50 };

  it("matches the exact recovery for a neutral fighter", () => {
    const result = recoverBetweenRounds(wornDown, 3.0);
    // energyRecoveryFraction = 0.8, deficit = 80 -> +64 -> 84
    expect(result.energy).toBeCloseTo(84, 9);
    // cumulativeRecoveryFraction = 0.15 -> 50 * 0.85 = 42.5
    expect(result.cumulativeFatigue).toBeCloseTo(42.5, 9);
  });

  it("matches the exact recovery for a high-cardio fighter", () => {
    const result = recoverBetweenRounds(wornDown, 5.0);
    // recoveryFraction = 0.9, deficit 80 -> +72 -> 92
    expect(result.energy).toBeCloseTo(92, 9);
    // cumulativeRecoveryFraction = 0.21 -> 50 * 0.79 = 39.5
    expect(result.cumulativeFatigue).toBeCloseTo(39.5, 9);
  });

  it("matches the exact recovery for a low-cardio fighter", () => {
    const result = recoverBetweenRounds(wornDown, 1.0);
    // recoveryFraction = 0.7, deficit 80 -> +56 -> 76
    expect(result.energy).toBeCloseTo(76, 9);
    // cumulativeRecoveryFraction = 0.09 -> 50 * 0.91 = 45.5
    expect(result.cumulativeFatigue).toBeCloseTo(45.5, 9);
  });

  it("a high-cardio fighter recovers more energy and sheds more cumulative fatigue than a low-cardio fighter", () => {
    const high = recoverBetweenRounds(wornDown, 5.0);
    const low = recoverBetweenRounds(wornDown, 1.0);
    expect(high.energy).toBeGreaterThan(low.energy);
    expect(high.cumulativeFatigue).toBeLessThan(low.cumulativeFatigue);
  });

  it("never produces energy above 100 or cumulativeFatigue below 0", () => {
    const alreadyFresh: FatigueState = { energy: 100, cumulativeFatigue: 0 };
    const result = recoverBetweenRounds(alreadyFresh, 5.0);
    expect(result.energy).toBeLessThanOrEqual(100);
    expect(result.cumulativeFatigue).toBeGreaterThanOrEqual(0);
  });
});

describe("computeFatiguePerformanceModifiers", () => {
  it("applies no penalty at full energy and zero cumulative fatigue", () => {
    const modifiers = computeFatiguePerformanceModifiers({
      energy: 100,
      cumulativeFatigue: 0,
    });
    expect(modifiers).toEqual({
      speedMultiplier: 1.0,
      powerMultiplier: 1.0,
      takedownSuccessMultiplier: 1.0,
      defenseMultiplier: 1.0,
    });
  });

  it("applies tier-2 penalties in the 25-50% effective fatigue band", () => {
    // effective = (100-60)*0.7 + 20*0.3 = 28 + 6 = 34
    const modifiers = computeFatiguePerformanceModifiers({
      energy: 60,
      cumulativeFatigue: 20,
    });
    expect(modifiers.speedMultiplier).toBeCloseTo(0.9, 9);
    expect(modifiers.powerMultiplier).toBeCloseTo(0.92, 9);
    expect(modifiers.takedownSuccessMultiplier).toBeCloseTo(1.0, 9);
    expect(modifiers.defenseMultiplier).toBeCloseTo(1.0, 9);
  });

  it("applies tier-3 penalties in the 50-75% effective fatigue band", () => {
    // effective = (100-30)*0.7 + 50*0.3 = 49 + 15 = 64
    const modifiers = computeFatiguePerformanceModifiers({
      energy: 30,
      cumulativeFatigue: 50,
    });
    expect(modifiers.speedMultiplier).toBeCloseTo(0.8, 9);
    expect(modifiers.powerMultiplier).toBeCloseTo(0.85, 9);
    expect(modifiers.takedownSuccessMultiplier).toBeCloseTo(0.85, 9);
    expect(modifiers.defenseMultiplier).toBeCloseTo(1.0, 9);
  });

  it("applies the worst tier above 75% effective fatigue", () => {
    // effective = (100-5)*0.7 + 90*0.3 = 66.5 + 27 = 93.5
    const modifiers = computeFatiguePerformanceModifiers({
      energy: 5,
      cumulativeFatigue: 90,
    });
    expect(modifiers.speedMultiplier).toBeCloseTo(0.7, 9);
    expect(modifiers.powerMultiplier).toBeCloseTo(0.75, 9);
    expect(modifiers.takedownSuccessMultiplier).toBeCloseTo(0.75, 9);
    expect(modifiers.defenseMultiplier).toBeCloseTo(0.8, 9);
  });

  it("never improves as a fighter gets progressively more worn down", () => {
    let state: FatigueState = { energy: 100, cumulativeFatigue: 0 };
    let previous = computeFatiguePerformanceModifiers(state);

    for (let i = 0; i < 30; i++) {
      state = applyActionCost(state, "powerShot", 2.0);
      const current = computeFatiguePerformanceModifiers(state);

      expect(current.speedMultiplier).toBeLessThanOrEqual(previous.speedMultiplier);
      expect(current.powerMultiplier).toBeLessThanOrEqual(previous.powerMultiplier);
      expect(current.takedownSuccessMultiplier).toBeLessThanOrEqual(
        previous.takedownSuccessMultiplier
      );
      expect(current.defenseMultiplier).toBeLessThanOrEqual(previous.defenseMultiplier);

      previous = current;
    }
  });
});
