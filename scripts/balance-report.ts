/**
 * Runs the balance harness across the named archetype matchups and
 * prints a summary table. This is a tuning tool, not a CI check — run
 * it manually after touching any simulation coefficient, per
 * DESIGN_FINAL.md > Balance Validation.
 *
 * Usage: npx tsx scripts/balance-report.ts [iterations]
 * Default iterations: 20,000 per matchup (~0.1ms/fight -> ~2s/matchup).
 * Use a larger number (e.g. 100000) for a final pre-launch sweep.
 */
import { formatMatchupResult, runMatchupStudy } from "../src/lib/simulation/harness";
import {
  ALL_ELITE,
  ALL_WEAK,
  BALANCED,
  ELITE_STRIKER,
  ELITE_WRESTLER,
  HIGH_CARDIO,
  HIGH_CHIN,
  HIGH_WRESTLING,
  LOW_CARDIO,
  LOW_CHIN,
  LOW_WRESTLING,
  NEUTRAL_A,
  NEUTRAL_B,
  SINGLE_STAT_POWER,
  STRIKER_WITH_TD_DEFENSE,
  SUBMISSION_SPECIALIST,
} from "../src/lib/simulation/balanceFixtures";

const iterations = Number(process.argv[2]) || 20_000;

const matchups: Array<[string, Parameters<typeof runMatchupStudy>[1], Parameters<typeof runMatchupStudy>[2]]> = [
  ["All-Elite vs All-Weak", ALL_ELITE, ALL_WEAK],
  ["Identical (Neutral vs Neutral)", NEUTRAL_A, NEUTRAL_B],
  ["Elite Striker vs Elite Wrestler", ELITE_STRIKER, ELITE_WRESTLER],
  ["High Cardio vs Low Cardio", HIGH_CARDIO, LOW_CARDIO],
  ["High Chin vs Low Chin", HIGH_CHIN, LOW_CHIN],
  ["High Wrestling vs Low Wrestling", HIGH_WRESTLING, LOW_WRESTLING],
  ["Single Stat (Power) vs Neutral", SINGLE_STAT_POWER, NEUTRAL_A],
  // Added to check WHY wrestling beats striking here, not just that it
  // does — see BALANCE_REPORT.md > "Reclassified."
  ["Wrestler vs Balanced", ELITE_WRESTLER, BALANCED],
  ["Wrestler vs Submission Specialist", ELITE_WRESTLER, SUBMISSION_SPECIALIST],
  ["Wrestler vs Striker+TDDefense", ELITE_WRESTLER, STRIKER_WITH_TD_DEFENSE],
  ["Balanced vs Pure Striker", BALANCED, ELITE_STRIKER],
];

console.log(`Running ${matchups.length} matchups x ${iterations.toLocaleString()} fights each...\n`);

const start = performance.now();
for (const [label, a, b] of matchups) {
  const result = runMatchupStudy(label, a, b, iterations);
  console.log(formatMatchupResult(result));
}
const elapsed = performance.now() - start;

console.log(`\nTotal: ${(matchups.length * iterations).toLocaleString()} fights in ${(elapsed / 1000).toFixed(1)}s`);
