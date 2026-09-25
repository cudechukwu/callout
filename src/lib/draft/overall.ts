import { buildFullAttributeRatings, type FullAttributeRatings } from "../simulation/derivedStats";
import type { AttributeSelections } from "../simulation/types";

/**
 * Overall (OVR): a display-only summary of a build's general strength.
 *
 * It is NOT an input to the simulation and never may be — fights run on
 * the derived stats; OVR is computed from the same ratings for display
 * only (a test guards that nothing under simulation/ imports this file).
 * It is also not a win probability: a build's OVR says how it fares
 * against the average CPU build, not against any specific opponent, so
 * a lower-OVR wrestler can and does beat a higher-OVR striker.
 *
 * Weights come from `scripts/ovr-calibration.ts`: least-squares fit of
 * win rate against a field of random CPU builds on the engine's full 10
 * ratings (8 visible + hidden speed/defense) — 5,000 sampled drafts x 150
 * fights, held-out R^2 = 0.89 (vs 0.75 for a plain average of the 8
 * visible ratings). Last refit after the draft pool changed from 55 to 70
 * fighters (BALANCE_REPORT.md > Draft pool); before that, after the
 * per-domain sensitivity change. Re-run that script and paste the output
 * here if the engine or draft pool changes materially.
 */
const WIN_RATE_INTERCEPT = -2.8237;
const WIN_RATE_WEIGHTS: Readonly<Record<keyof FullAttributeRatings, number>> = {
  wrestling: 0.1034,
  submissions: 0.0345,
  boxing: 0.0602,
  kickboxing: 0.0339,
  power: 0.021,
  cardio: 0.0884,
  chin: 0.0176,
  fightIq: 0.1197,
  defense: 0.1417,
  speed: 0.1218,
};

/** OVR 70 = wins half its fights against the average CPU build. */
const OVR_AT_EVEN = 70;
/**
 * One OVR point per (1 / OVR_PER_WIN_RATE) of win rate against the field.
 * Chosen so the scale is fully used: the best possible draft from the
 * whole pool lands ~98, always taking the best of 3 lands ~90, random
 * drafting ~72 — so 95+ is reachable but takes a near-perfect build.
 */
const OVR_PER_WIN_RATE = 108;
export const OVR_MIN = 40;
export const OVR_MAX = 99;

/** Predicted win rate against the average CPU build (not against any
 * particular opponent). Exposed for calibration and tests. */
export function predictedFieldWinRate(selections: AttributeSelections): number {
  const ratings = buildFullAttributeRatings(selections);
  let predicted = WIN_RATE_INTERCEPT;
  for (const key of Object.keys(WIN_RATE_WEIGHTS) as Array<keyof FullAttributeRatings>) {
    predicted += ratings[key] * WIN_RATE_WEIGHTS[key];
  }
  return predicted;
}

export function computeOverall(selections: AttributeSelections): number {
  const raw = OVR_AT_EVEN + (predictedFieldWinRate(selections) - 0.5) * OVR_PER_WIN_RATE;
  return Math.round(Math.min(OVR_MAX, Math.max(OVR_MIN, raw)));
}
