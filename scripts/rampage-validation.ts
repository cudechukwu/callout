/**
 * Validates a tuning on MANY independently drafted builds per top-end OVR
 * bucket (a single build per bucket can be unrepresentative: a 97 striker,
 * a 97 wrestler and a 97 all-rounder can behave very differently). Builds
 * fight a frozen 500-CPU bank; each tuning replays identical builds, bank
 * and seeds. Reports field win % spread across builds, and REAL 20-fight
 * rampage outcomes (random opponents from the bank), alongside the
 * independent-fights estimate.
 *
 * Usage: npx tsx scripts/rampage-validation.ts [buildsPerBucket] [rampagesPerBuild] [tuningsJson]
 */
import { generateCpuFighter } from "../src/lib/draft/cpuFighter";
import { computeOverall } from "../src/lib/draft/overall";
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft, toFighterSnapshot } from "../src/lib/draft/session";
import { DEFAULT_TUNING, simulateFight, type SimulationTuning } from "../src/lib/simulation/engine";
import { createRng } from "../src/lib/simulation/rng";
import type { FighterSnapshot } from "../src/lib/simulation/types";

const BUILDS = Number(process.argv[2]) || 30;
const RAMPAGES = Number(process.argv[3]) || 300;
const SEEDS_PER_OPPONENT = 20;
const BUCKETS: Array<[string, number, number]> = [
  ["90-92", 90, 92],
  ["93-95", 93, 95],
  ["96-97", 96, 97],
  ["98-99", 98, 99],
];

const CANDIDATE: SimulationTuning = {
  initiativeSensitivity: 0.2,
  contestSensitivity: { striking: 0.18, takedown: 0.1, grappling: 0.08, movement: 0.12 },
};
// Optional 4th arg overrides the tunings: JSON [[label, init, strike, td, grap, move], ...]
const tunings: Array<[string, SimulationTuning]> = process.argv[4]
  ? (JSON.parse(process.argv[4]) as Array<[string, number, number, number, number, number]>).map(
      ([label, init, st, td, gr, mv]) => [
        label,
        {
          initiativeSensitivity: init,
          contestSensitivity: { striking: st, takedown: td, grappling: gr, movement: mv },
        },
      ]
    )
  : [
      ["current (.08 everywhere)", DEFAULT_TUNING],
      ["candidate (.20/.18/.10/.08/.12)", CANDIDATE],
    ];

// ---- frozen inputs ----
const bankRng = createRng(3003);
const bank: FighterSnapshot[] = Array.from({ length: 500 }, (_, i) =>
  generateCpuFighter(bankRng, `cpu${i}`, `cpu${i}`)
);
const buildRng = createRng(4004);
function draftOne(): FighterSnapshot {
  const skill = 0.6 + buildRng.next() * 0.4;
  let state = startDraft(buildRng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]!;
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const best = candidates.reduce((a, b) => (b[attribute] > a[attribute] ? b : a));
    const pick = buildRng.next() < skill ? best : candidates[Math.floor(buildRng.next() * candidates.length)]!;
    state = selectCandidate(state, pick.id);
  }
  return toFighterSnapshot(state, "player", "player");
}
const buckets = new Map<string, FighterSnapshot[]>(BUCKETS.map(([name]) => [name, []]));
for (let attempts = 0; attempts < 400_000; attempts++) {
  const fighter = draftOne();
  const ovr = computeOverall(fighter.selections);
  for (const [name, lo, hi] of BUCKETS) {
    const list = buckets.get(name)!;
    if (ovr >= lo && ovr <= hi && list.length < BUILDS) list.push(fighter);
  }
  if ([...buckets.values()].every((l) => l.length >= BUILDS)) break;
}

function quantile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
}
const pct = (x: number, d = 0) => (100 * x).toFixed(d) + "%";

console.log(`Builds per bucket: ${BUCKETS.map(([n]) => `${n}: ${buckets.get(n)!.length}`).join(", ")} | bank ${bank.length} | ${RAMPAGES} real rampages per build\n`);

for (const [tuningLabel, tuning] of tunings) {
  console.log(`=== ${tuningLabel} ===`);
  console.log("bucket   | field win% median (p10-p90) | avg wins | P(18+) P(19+) P(20-0) real | P(20-0) est");
  for (const [name] of BUCKETS) {
    const builds = buckets.get(name)!;
    if (builds.length === 0) { console.log(`${name.padEnd(8)} | no builds found`); continue; }
    const rates: number[] = [];
    let total = 0, ge18 = 0, ge19 = 0, perfect = 0, winsSum = 0, estPerfect = 0;
    builds.forEach((fighter, bi) => {
      let wins = 0, n = 0;
      bank.forEach((cpu, b) => {
        for (let k = 0; k < SEEDS_PER_OPPONENT; k++) {
          const seed = 2_000_000 + bi * 50_000 + b * SEEDS_PER_OPPONENT + k;
          if (simulateFight(fighter, cpu, createRng(seed), tuning).winnerId === fighter.id) wins++;
          n++;
        }
      });
      const wr = wins / n;
      rates.push(wr);
      estPerfect += Math.pow(wr, 20);
      // Real 20-fight rampages: fresh random opponent each fight.
      const rr = createRng(6_000_000 + bi);
      for (let r = 0; r < RAMPAGES; r++) {
        let w = 0;
        for (let f = 0; f < 20; f++) {
          const cpu = bank[Math.floor(rr.next() * bank.length)]!;
          if (simulateFight(fighter, cpu, rr, tuning).winnerId === fighter.id) w++;
        }
        total++; winsSum += w;
        if (w >= 18) ge18++;
        if (w >= 19) ge19++;
        if (w === 20) perfect++;
      }
    });
    rates.sort((a, b) => a - b);
    console.log(
      `${name.padEnd(8)} | ${pct(quantile(rates, 0.5), 1).padStart(6)} (${pct(quantile(rates, 0.1))}-${pct(quantile(rates, 0.9))})`.padEnd(38) +
        ` | ${(winsSum / total).toFixed(1).padStart(5)} | ${pct(ge18 / total, 1).padStart(6)} ${pct(ge19 / total, 1).padStart(6)} ${pct(perfect / total, 2).padStart(7)} | ${pct(estPerfect / builds.length, 2)}`
    );
  }
  console.log();
}
