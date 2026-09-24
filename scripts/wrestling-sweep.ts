/**
 * Budget-neutral wrestling-investment sweep. Answers a specific
 * methodological gap a review caught in the original striker-vs-
 * wrestler diagnosis: STRIKER_WITH_TD_DEFENSE (balanceFixtures.ts)
 * raised wrestling 2.0->3.2 without removing stat budget elsewhere,
 * so its improved win rate against ELITE_WRESTLER (66.7% -> 58.0%)
 * couldn't be cleanly attributed to "takedown defense specifically
 * matters" vs. "this fighter is just stronger overall."
 *
 * This sweep holds total stat budget exactly constant at every point
 * (see strikerWithWrestlingInvestment/wrestlerWithWrestlingDivestment
 * in balanceFixtures.ts for the redistribution rule), in both
 * directions, so the resulting curve isolates the marginal value of
 * wrestling investment specifically.
 *
 * Usage: npx tsx scripts/wrestling-sweep.ts [iterations]
 * Default: 20,000/point (14 points total -> ~15s).
 */
import { runMatchupStudy } from "../src/lib/simulation/harness";
import {
  ELITE_STRIKER,
  ELITE_WRESTLER,
  strikerWithWrestlingInvestment,
  wrestlerWithWrestlingDivestment,
} from "../src/lib/simulation/balanceFixtures";

const iterations = Number(process.argv[2]) || 20_000;
const DELTAS = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

function row(wrestlingValue: string, winRate: number, ko: number, sub: number, dec: number): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return `${wrestlingValue.padEnd(10)} ${pct(winRate).padEnd(8)} KO ${pct(ko).padEnd(7)} SUB ${pct(sub).padEnd(7)} DEC ${pct(dec)}`;
}

console.log(`Budget-neutral wrestling sweep — ${iterations.toLocaleString()} fights/point\n`);

console.log("SWEEP A: Striker investing in wrestling (removed from boxing/kickboxing/power 40/40/20),");
console.log("         fighting a FIXED Elite Wrestler. Win rate is the INVESTING fighter's.");
console.log("Wrestling  WinRate");
for (const delta of DELTAS) {
  const fighter = strikerWithWrestlingInvestment(delta);
  const result = runMatchupStudy(`sweepA-${delta}`, fighter, ELITE_WRESTLER, iterations);
  console.log(
    row((2.0 + delta).toFixed(1), result.fighterAWinRate, result.methodRates.KO, result.methodRates.SUB, result.methodRates.DEC)
  );
}

console.log("\nSWEEP B: Wrestler divesting from wrestling (added to boxing/kickboxing/power 40/40/20),");
console.log("         fighting a FIXED Elite Striker. Win rate is the DIVESTING fighter's.");
console.log("Wrestling  WinRate");
for (const delta of DELTAS) {
  const fighter = wrestlerWithWrestlingDivestment(delta);
  const result = runMatchupStudy(`sweepB-${delta}`, fighter, ELITE_STRIKER, iterations);
  console.log(
    row((5.0 - delta).toFixed(1), result.fighterAWinRate, result.methodRates.KO, result.methodRates.SUB, result.methodRates.DEC)
  );
}
