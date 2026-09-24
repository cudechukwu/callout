import { clamp } from "./math";

/**
 * Two separate pools, per DESIGN_FINAL.md > Fatigue System — this
 * distinction is the whole point:
 *
 * - `energy` resets ~80% between rounds. It's what makes a fighter feel
 *   "gassed" mid-round and recovered at the next bell.
 * - `cumulativeFatigue` does NOT meaningfully reset. It's what makes
 *   Round 3 different from Round 1 even for a fighter who "recovered."
 *
 * An earlier draft of this design used a single pool that fully reset
 * every round — which meant cardio could never produce a late-fight
 * story, since nothing carried across rounds. That's the bug this
 * two-pool model exists to avoid.
 */
export interface FatigueState {
  /** 0 (exhausted) to 100 (fresh). Depletes during a round, recovers between rounds. */
  energy: number;
  /** 0 (fresh) to 100 (fully worn down). Depletes slowly, barely recovers. */
  cumulativeFatigue: number;
}

export const INITIAL_FATIGUE_STATE: FatigueState = {
  energy: 100,
  cumulativeFatigue: 0,
};

/**
 * Base energy cost per action, before fatigueResistance scaling.
 * Values are relative, not calibrated to a specific unit — see
 * fatigue.test.ts for the actual per-round depletion this produces.
 *
 * Covers the full action menu across all four positions (see
 * actions.ts > ACTION_MENU) — every action a fighter can take costs
 * something, even a "passive" one like allowStandUp.
 */
export const ACTION_ENERGY_COST = {
  // distance
  jab: 5,
  powerShot: 12,
  kick: 9,
  clinchEntry: 6,
  takedownAttempt: 11,
  defensiveMovement: 3,
  // clinch
  clinchStrike: 8,
  clinchTakedown: 10,
  disengage: 4,
  // top ground
  groundStrike: 7,
  submissionAttempt: 10,
  improvePosition: 6,
  allowStandUp: 2,
  // bottom ground
  escape: 9,
  bottomStrike: 6,
  standUpAttempt: 8,
} as const;

export type FatigueCostAction = keyof typeof ACTION_ENERGY_COST;

/** How much cumulative fatigue rises per unit of energy spent. Kept low
 * on purpose — cumulative fatigue is meant to be a slow-building drag
 * across the whole fight, not a mirror of energy. */
const CUMULATIVE_FATIGUE_ACCRUAL_RATE = 0.2;

/**
 * Converts a fighter's `fatigueResistance` derived stat (1.0-5.0, neutral
 * at 3.0) into a cost multiplier: better cardio spends less energy per
 * action. Matches the design doc's "+/-20-25% at the extremes" language
 * with smooth interpolation instead of a hard threshold, so there's no
 * weird cliff at e.g. 4.49 vs 4.5.
 */
export function fatigueCostMultiplier(fatigueResistance: number): number {
  if (fatigueResistance >= 3.0) {
    const t = clamp((fatigueResistance - 3.0) / (5.0 - 3.0), 0, 1);
    return 1.0 - t * 0.25; // 3.0 -> 1.0x cost, 5.0 -> 0.75x cost
  }
  const t = clamp((3.0 - fatigueResistance) / (3.0 - 1.0), 0, 1);
  return 1.0 + t * 0.2; // 3.0 -> 1.0x cost, 1.0 -> 1.2x cost
}

/**
 * The energy cost of one action after fatigueResistance scaling, before
 * any further situational scaling (e.g. body damage — see damage.ts >
 * bodyDamageFatigueMultiplier). Exposed separately from applyActionCost
 * so the engine can layer additional multipliers on top without
 * duplicating the fatigueResistance math.
 */
export function computeActionEnergyCost(
  action: FatigueCostAction,
  fatigueResistance: number
): number {
  return ACTION_ENERGY_COST[action] * fatigueCostMultiplier(fatigueResistance);
}

/** Spends a precomputed energy cost against a fatigue state. */
export function spendEnergy(state: FatigueState, cost: number): FatigueState {
  return {
    energy: clamp(state.energy - cost, 0, 100),
    cumulativeFatigue: clamp(
      state.cumulativeFatigue + cost * CUMULATIVE_FATIGUE_ACCRUAL_RATE,
      0,
      100
    ),
  };
}

/**
 * Applies one action's energy cost. Higher fatigueResistance means a
 * smaller effective cost (see fatigueCostMultiplier) AND a smaller
 * cumulative-fatigue accrual, since both are derived from the same
 * scaled cost. Convenience wrapper around computeActionEnergyCost +
 * spendEnergy for callers that don't need extra scaling.
 */
export function applyActionCost(
  state: FatigueState,
  action: FatigueCostAction,
  fatigueResistance: number
): FatigueState {
  return spendEnergy(state, computeActionEnergyCost(action, fatigueResistance));
}

/**
 * Between-round recovery. Energy recovers substantially (baseline 80%
 * of its deficit, modulated by fatigueResistance); cumulative fatigue
 * only partially recedes — it's meant to persist.
 */
export function recoverBetweenRounds(
  state: FatigueState,
  fatigueResistance: number
): FatigueState {
  const resistanceAdjustment = (fatigueResistance - 3.0) * 0.05;
  const energyRecoveryFraction = clamp(0.8 + resistanceAdjustment, 0, 1);
  const energyDeficit = 100 - state.energy;
  const recoveredEnergy = clamp(
    state.energy + energyDeficit * energyRecoveryFraction,
    0,
    100
  );

  const cumulativeRecoveryFraction = clamp(
    0.15 + (fatigueResistance - 3.0) * 0.03,
    0,
    1
  );
  const recoveredCumulative = clamp(
    state.cumulativeFatigue * (1 - cumulativeRecoveryFraction),
    0,
    100
  );

  return { energy: recoveredEnergy, cumulativeFatigue: recoveredCumulative };
}

export interface FatiguePerformanceModifiers {
  speedMultiplier: number;
  powerMultiplier: number;
  takedownSuccessMultiplier: number;
  defenseMultiplier: number;
}

const NO_PENALTY: FatiguePerformanceModifiers = {
  speedMultiplier: 1.0,
  powerMultiplier: 1.0,
  takedownSuccessMultiplier: 1.0,
  defenseMultiplier: 1.0,
};

/**
 * Four-tier penalty structure straight from DESIGN_FINAL.md > Fatigue
 * System. The input blends current-round energy depletion (70% weight)
 * with cumulative fatigue (30% weight) — mostly about this round, but
 * dragged down by how worn down the fighter already is from earlier
 * rounds, which is what makes Round 3 feel different from Round 1 even
 * at the same energy level.
 */
export function computeFatiguePerformanceModifiers(
  state: FatigueState
): FatiguePerformanceModifiers {
  const effectiveFatiguePercent =
    (100 - state.energy) * 0.7 + state.cumulativeFatigue * 0.3;

  if (effectiveFatiguePercent < 25) return NO_PENALTY;
  if (effectiveFatiguePercent < 50) {
    return {
      speedMultiplier: 0.9,
      powerMultiplier: 0.92,
      takedownSuccessMultiplier: 1.0,
      defenseMultiplier: 1.0,
    };
  }
  if (effectiveFatiguePercent < 75) {
    return {
      speedMultiplier: 0.8,
      powerMultiplier: 0.85,
      takedownSuccessMultiplier: 0.85,
      defenseMultiplier: 1.0,
    };
  }
  return {
    speedMultiplier: 0.7,
    powerMultiplier: 0.75,
    takedownSuccessMultiplier: 0.75,
    defenseMultiplier: 0.8,
  };
}
