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
 * fights, R^2 = 0.79 (vs 0.67 for a plain average of the 8 visible
 * ratings). Re-run that script and paste the output here if the engine
 * or draft pool changes materially.
 */
const WIN_RATE_INTERCEPT = -1.4112;
const WIN_RATE_WEIGHTS: Readonly<Record<keyof FullAttributeRatings, number>> = {
  wrestling: 0.0858,
  submissions: 0.0272,
  boxing: 0.0279,
  kickboxing: 0.0184,
  power: 0.0233,
  cardio: 0.0476,
  chin: 0.0145,
  fightIq: 0.0708,
  defense: 0.0501,
  speed: 0.0625,
};

/** OVR 70 = wins half its fights against the average CPU build. */
const OVR_AT_EVEN = 70;
/**
 * One OVR point per 0.625% of win rate against the field. Chosen so the
 * scale is fully used: the best possible draft from the whole pool lands
 * ~98, always taking the best of 3 lands ~90, random drafting ~73 — so
 * 95+ is reachable but takes a near-perfect build.
 */
const OVR_PER_WIN_RATE = 160;
export const OVR_MIN = 40;
export const OVR_MAX = 99;

export function computeOverall(selections: AttributeSelections): number {
  const ratings = buildFullAttributeRatings(selections);
  let predictedWinRate = WIN_RATE_INTERCEPT;
  for (const key of Object.keys(WIN_RATE_WEIGHTS) as Array<keyof FullAttributeRatings>) {
    predictedWinRate += ratings[key] * WIN_RATE_WEIGHTS[key];
  }
  const raw = OVR_AT_EVEN + (predictedWinRate - 0.5) * OVR_PER_WIN_RATE;
  return Math.round(Math.min(OVR_MAX, Math.max(OVR_MIN, raw)));
}
