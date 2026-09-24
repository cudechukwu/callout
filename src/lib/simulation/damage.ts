import type { DamageZone } from "./types";
import { clamp } from "./math";

/**
 * Three zones, each 0 (untouched) to 100 (maximally damaged). See
 * DESIGN_FINAL.md > Damage System — head raises KO risk, body
 * accelerates fatigue, leg reduces speed. Hidden from the player during
 * MVP fights; only referenced by the engine and the explanation layer.
 */
export interface DamageState {
  head: number;
  body: number;
  leg: number;
}

export const INITIAL_DAMAGE_STATE: DamageState = { head: 0, body: 0, leg: 0 };

export function applyDamage(
  state: DamageState,
  zone: DamageZone,
  amount: number
): DamageState {
  return { ...state, [zone]: clamp(state[zone] + amount, 0, 100) };
}

/**
 * KO risk modifier from accumulated head damage. This is a modifier the
 * engine adds to a strike's base KO probability, not a probability on
 * its own — see engine.ts checkForKnockout for how it's applied.
 *
 * Breakpoints are calibrated to the head damage the simulation actually
 * produces, not to the full 0-100 scale: a neutral fight ends around 13
 * (p99 ~34), so the original 20/40/60/80 breakpoints left the upper tiers
 * effectively unreachable (see BALANCE_REPORT.md > Finish-rate tuning).
 * The 0-100 damage scale itself is unchanged — body and leg damage share
 * it and drive different mechanics.
 */
export function koRiskModifier(headDamage: number): number {
  if (headDamage < 8) return 0;
  if (headDamage < 16) return 0.15;
  if (headDamage < 24) return 0.35;
  if (headDamage < 32) return 0.6;
  return 1.0;
}

/**
 * Referee-stoppage (TKO) chance per landed head strike that didn't
 * already produce a KO, from accumulated head damage alone. Convex: no
 * risk while fresh, small once clearly hurt, rising steeply once badly
 * hurt, then flat. Same calibrated domain as koRiskModifier — see
 * BALANCE_REPORT.md > Finish-rate tuning. Attacker/defender scaling is
 * applied by the engine, not here.
 */
export const TKO_DAMAGE_FLOOR = 12;
export const TKO_DAMAGE_CEILING = 60;
export const TKO_MAX_RISK = 0.25;

export function tkoStoppageRisk(headDamage: number): number {
  if (headDamage <= TKO_DAMAGE_FLOOR) return 0;
  const progress = Math.min(
    (headDamage - TKO_DAMAGE_FLOOR) / (TKO_DAMAGE_CEILING - TKO_DAMAGE_FLOOR),
    1
  );
  return TKO_MAX_RISK * Math.pow(progress, 1.5);
}

/**
 * Body damage accelerates fatigue accrual. 1.0x at no damage, up to
 * 1.5x at fully damaged — meant to be applied as a multiplier on top of
 * fatigueCostMultiplier() from fatigue.ts, not to replace it.
 */
export function bodyDamageFatigueMultiplier(bodyDamage: number): number {
  return 1.0 + (bodyDamage / 100) * 0.5;
}

/**
 * Leg damage reduces speed. 1.0x at no damage, down to 0.6x at fully
 * damaged leg — never reaches 0, a fighter with a hurt leg is slowed,
 * not immobilized.
 */
export function legDamageSpeedMultiplier(legDamage: number): number {
  return 1.0 - (legDamage / 100) * 0.4;
}
