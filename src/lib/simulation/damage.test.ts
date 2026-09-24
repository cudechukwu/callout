import { describe, expect, it } from "vitest";
import {
  applyDamage,
  bodyDamageFatigueMultiplier,
  INITIAL_DAMAGE_STATE,
  koRiskModifier,
  tkoStoppageRisk,
  TKO_DAMAGE_CEILING,
  TKO_DAMAGE_FLOOR,
  TKO_MAX_RISK,
  legDamageSpeedMultiplier,
  type DamageState,
} from "./damage";

describe("applyDamage", () => {
  it("increases only the targeted zone", () => {
    const result = applyDamage(INITIAL_DAMAGE_STATE, "head", 15);
    expect(result.head).toBeCloseTo(15, 9);
    expect(result.body).toBe(0);
    expect(result.leg).toBe(0);
  });

  it("accumulates across multiple hits to the same zone", () => {
    let state: DamageState = INITIAL_DAMAGE_STATE;
    state = applyDamage(state, "body", 10);
    state = applyDamage(state, "body", 15);
    expect(state.body).toBeCloseTo(25, 9);
  });

  it("clamps at 100 even when cumulative damage would exceed it", () => {
    let state: DamageState = INITIAL_DAMAGE_STATE;
    for (let i = 0; i < 20; i++) {
      state = applyDamage(state, "leg", 10);
    }
    expect(state.leg).toBe(100);
  });

  it("clamps at 0 and never goes negative", () => {
    const result = applyDamage(INITIAL_DAMAGE_STATE, "head", -50);
    expect(result.head).toBe(0);
  });
});

describe("koRiskModifier", () => {
  it("matches the calibrated breakpoints exactly", () => {
    expect(koRiskModifier(0)).toBe(0);
    expect(koRiskModifier(7.9)).toBe(0);
    expect(koRiskModifier(8)).toBeCloseTo(0.15, 9);
    expect(koRiskModifier(15.9)).toBeCloseTo(0.15, 9);
    expect(koRiskModifier(16)).toBeCloseTo(0.35, 9);
    expect(koRiskModifier(23.9)).toBeCloseTo(0.35, 9);
    expect(koRiskModifier(24)).toBeCloseTo(0.6, 9);
    expect(koRiskModifier(31.9)).toBeCloseTo(0.6, 9);
    expect(koRiskModifier(32)).toBeCloseTo(1.0, 9);
    expect(koRiskModifier(100)).toBeCloseTo(1.0, 9);
  });

  it("is monotonically non-decreasing as head damage rises", () => {
    const samples = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,...,100
    const modifiers = samples.map(koRiskModifier);
    for (let i = 1; i < modifiers.length; i++) {
      expect(modifiers[i]).toBeGreaterThanOrEqual(modifiers[i - 1]!);
    }
  });
});

describe("tkoStoppageRisk", () => {
  it("is zero at and below the floor", () => {
    expect(tkoStoppageRisk(0)).toBe(0);
    expect(tkoStoppageRisk(TKO_DAMAGE_FLOOR)).toBe(0);
  });

  it("reaches the max risk at the ceiling and stays flat above it", () => {
    expect(tkoStoppageRisk(TKO_DAMAGE_CEILING)).toBeCloseTo(TKO_MAX_RISK, 9);
    expect(tkoStoppageRisk(100)).toBeCloseTo(TKO_MAX_RISK, 9);
  });

  it("is convex: the second half of the range adds more risk than the first", () => {
    const mid = (TKO_DAMAGE_FLOOR + TKO_DAMAGE_CEILING) / 2;
    const firstHalf = tkoStoppageRisk(mid) - tkoStoppageRisk(TKO_DAMAGE_FLOOR);
    const secondHalf = tkoStoppageRisk(TKO_DAMAGE_CEILING) - tkoStoppageRisk(mid);
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it("is monotonically non-decreasing as head damage rises", () => {
    let previous = 0;
    for (let d = 0; d <= 100; d += 2.5) {
      const risk = tkoStoppageRisk(d);
      expect(risk).toBeGreaterThanOrEqual(previous);
      previous = risk;
    }
  });
});

describe("bodyDamageFatigueMultiplier", () => {
  it("is 1.0x at no body damage", () => {
    expect(bodyDamageFatigueMultiplier(0)).toBeCloseTo(1.0, 9);
  });

  it("is 1.5x at maximum body damage", () => {
    expect(bodyDamageFatigueMultiplier(100)).toBeCloseTo(1.5, 9);
  });

  it("increases monotonically with body damage", () => {
    const samples = [0, 25, 50, 75, 100];
    const multipliers = samples.map(bodyDamageFatigueMultiplier);
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1]!);
    }
  });
});

describe("legDamageSpeedMultiplier", () => {
  it("is 1.0x at no leg damage", () => {
    expect(legDamageSpeedMultiplier(0)).toBeCloseTo(1.0, 9);
  });

  it("is 0.6x at maximum leg damage — slowed, never immobilized", () => {
    expect(legDamageSpeedMultiplier(100)).toBeCloseTo(0.6, 9);
  });

  it("decreases monotonically with leg damage and never reaches 0", () => {
    const samples = [0, 25, 50, 75, 100];
    const multipliers = samples.map(legDamageSpeedMultiplier);
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeLessThan(multipliers[i - 1]!);
    }
    for (const m of multipliers) {
      expect(m).toBeGreaterThan(0);
    }
  });
});
