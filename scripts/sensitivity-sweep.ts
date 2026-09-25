/**
 * Controlled sensitivity experiment. Freezes everything except the tuning
 * — the target player builds, a 500-build CPU bank, and every fight seed
 * are generated ONCE from dedicated RNG streams before any configuration
 * runs — so each configuration replays exactly the same fights and only
 * the tuning differs. (An earlier version shared one RNG across
 * generation and simulation; engine changes shifted the stream and each
 * run picked different fighters, so its figures were not comparable.)
 *
 * Reports, per configuration: field win rate and perfect-rampage
 * probability for fixed builds at several OVRs, plus the archetype
 * balance fixtures (wrestling reach, striker vs wrestler, cardio).
 *
 * Usage: npx tsx scripts/sensitivity-sweep.ts
 */
import { VISIBLE_ATTRIBUTES } from "../src/lib/data/types";
import { generateCpuFighter } from "../src/lib/draft/cpuFighter";
import { computeOverall } from "../src/lib/draft/overall";
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft, toFighterSnapshot } from "../src/lib/draft/session";
import {
  BALANCED,
  ELITE_STRIKER,
  ELITE_WRESTLER,
  HIGH_CARDIO,
  HIGH_WRESTLING,
  LOW_CARDIO,
  buildArchetypeSnapshot,
  LOW_WRESTLING,
  NEUTRAL_A,
  NEUTRAL_B,
  SINGLE_STAT_POWER,
} from "../src/lib/simulation/balanceFixtures";
import { DEFAULT_TUNING, simulateFight, type SimulationTuning } from "../src/lib/simulation/engine";
import { createRng } from "../src/lib/simulation/rng";
import type { FighterSnapshot } from "../src/lib/simulation/types";

const TARGET_OVRS = [70, 80, 90, 95, 98];
const SEEDS_PER_OPPONENT = 40;
const FIXTURE_FIGHTS = 10_000;

// ---- frozen inputs ----
const bankRng = createRng(1001);
const bank: FighterSnapshot[] = Array.from({ length: 500 }, (_, i) =>
  generateCpuFighter(bankRng, `cpu${i}`, `cpu${i}`)
);
const targetRng = createRng(2002);
function draftOne(): FighterSnapshot {
  const skill = targetRng.next();
  let state = startDraft(targetRng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]!;
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const best = candidates.reduce((a, b) => (b[attribute] > a[attribute] ? b : a));
    const pick = targetRng.next() < skill ? best : candidates[Math.floor(targetRng.next() * candidates.length)]!;
    state = selectCandidate(state, pick.id);
  }
  return toFighterSnapshot(state, "player", "player");
}
const targets: Array<{ ovr: number; fighter: FighterSnapshot }> = TARGET_OVRS.map((target) => {
  for (let attempts = 0; attempts < 50_000; attempts++) {
    const fighter = draftOne();
    const ovr = computeOverall(fighter.selections);
    if (Math.abs(ovr - target) <= 1) return { ovr, fighter };
  }
  throw new Error(`no build found near OVR ${target}`);
});

// ---- configurations ----
const u = (v: number): SimulationTuning => ({
  initiativeSensitivity: 0.08,
  contestSensitivity: { striking: v, takedown: v, grappling: v, movement: v },
});
const uniformAll = (v: number): SimulationTuning => ({
  initiativeSensitivity: v,
  contestSensitivity: { striking: v, takedown: v, grappling: v, movement: v },
});
const split = (s: number, t: number, g: number, m: number, init = 0.08): SimulationTuning => ({
  initiativeSensitivity: init,
  contestSensitivity: { striking: s, takedown: t, grappling: g, movement: m },
});

const round1: Array<[string, SimulationTuning]> = [
  ["ALL uniform .08 (current)", DEFAULT_TUNING],
  ["ALL uniform .12", uniformAll(0.12)],
  ["ALL uniform .16", uniformAll(0.16)],
  ["ALL uniform .20", uniformAll(0.2)],
  ["init .08, contests .20", u(0.2)],
  ["init .20, contests .08", split(0.08, 0.08, 0.08, 0.08, 0.2)],
  ["strike .20 only", split(0.2, 0.08, 0.08, 0.08)],
  ["strike .20 td .10 grap .10 move .12", split(0.2, 0.1, 0.1, 0.12)],
  ["strike .18 td .12 grap .08 move .14", split(0.18, 0.12, 0.08, 0.14)],
  ["strike .24 td .08 grap .08 move .12", split(0.24, 0.08, 0.08, 0.12)],
];

// Second round: combinations built from round 1's findings — initiative
// lifts cardio without touching wrestling, striking lifts strikers, and
// the takedown/grappling contests are what inflate wrestling.
const round2: Array<[string, SimulationTuning]> = [
  ["init .20 strike .20", split(0.2, 0.08, 0.08, 0.08, 0.2)],
  ["init .20 strike .20 move .12", split(0.2, 0.08, 0.08, 0.12, 0.2)],
  ["init .28 strike .20 move .12", split(0.2, 0.08, 0.08, 0.12, 0.28)],
  ["init .24 strike .24 move .12", split(0.24, 0.08, 0.08, 0.12, 0.24)],
  ["init .24 strike .20 td.08 grap.10 move.14", split(0.2, 0.08, 0.1, 0.14, 0.24)],
  ["init .28 strike .28 td.08 grap.08 move.12", split(0.28, 0.08, 0.08, 0.12, 0.28)],
];
// Third round: the middle ground between a gentle and an aggressive split,
// suggested after an independent replication of rounds 1-2.
const round3: Array<[string, SimulationTuning]> = [
  ["current .08 everywhere", DEFAULT_TUNING],
  ["A init.16 str.14 td.10 gr.08 mv.12", split(0.14, 0.1, 0.08, 0.12, 0.16)],
  ["B init.18 str.14 td.10 gr.08 mv.12", split(0.14, 0.1, 0.08, 0.12, 0.18)],
  ["C init.20 str.16 td.10 gr.08 mv.12", split(0.16, 0.1, 0.08, 0.12, 0.2)],
  ["D init.22 str.16 td.11 gr.08 mv.12", split(0.16, 0.11, 0.08, 0.12, 0.22)],
  ["E init.20 str.20 td.10 gr.08 mv.12", split(0.2, 0.1, 0.08, 0.12, 0.2)],
];
const configs = process.argv[2] === "round3" ? round3 : process.argv[2] === "round2" ? round2 : round1;

function winRate(a: FighterSnapshot, b: FighterSnapshot, tuning: SimulationTuning) {
  let wins = 0;
  let decisions = 0;
  for (let i = 0; i < FIXTURE_FIGHTS; i++) {
    const r = simulateFight(a, b, createRng(9_000_000 + i), tuning);
    if (r.winnerId === a.id) wins++;
    if (r.method === "DEC") decisions++;
  }
  return { win: wins / FIXTURE_FIGHTS, dec: decisions / FIXTURE_FIGHTS };
}

const pct = (x: number, d = 0) => (100 * x).toFixed(d).padStart(3 + (d ? d + 1 : 0)) + "%";

console.log(`Frozen: ${targets.length} builds (OVR ${targets.map((t) => t.ovr).join(", ")}), ${bank.length}-CPU bank, ${SEEDS_PER_OPPONENT} seeds/opponent\n`);
console.log(
  ["config".padEnd(38), ...targets.map((t) => `OVR${t.ovr}`.padStart(6)), " | exp.wins@95", "20-0@95", "20-0@98", " | HiWr/LoWr", "Str v Wr", "HiCard/LoCard", "Neut DEC", "Str v Bal"].join(" ")
);

for (const [label, tuning] of configs) {
  const rates = targets.map(({ fighter }, fi) => {
    let wins = 0;
    let n = 0;
    bank.forEach((cpu, b) => {
      for (let k = 0; k < SEEDS_PER_OPPONENT; k++) {
        const seed = 1_000_000 + fi * 100_000 + b * SEEDS_PER_OPPONENT + k;
        if (simulateFight(fighter, cpu, createRng(seed), tuning).winnerId === fighter.id) wins++;
        n++;
      }
    });
    return wins / n;
  });
  const wr95 = rates[TARGET_OVRS.indexOf(95)]!;
  const wr98 = rates[TARGET_OVRS.indexOf(98)]!;
  const hiwr = winRate(HIGH_WRESTLING, LOW_WRESTLING, tuning).win;
  const svw = winRate(ELITE_STRIKER, ELITE_WRESTLER, tuning).win;
  const card = winRate(HIGH_CARDIO, LOW_CARDIO, tuning).win;
  const neut = winRate(NEUTRAL_A, NEUTRAL_B, tuning).dec;
  const svb = winRate(ELITE_STRIKER, BALANCED, tuning).win;
  console.log(
    [
      label.padEnd(38),
      ...rates.map((r) => pct(r).padStart(6)),
      " |",
      (20 * wr95).toFixed(1).padStart(8),
      pct(Math.pow(wr95, 20), 2).padStart(8),
      pct(Math.pow(wr98, 20), 2).padStart(8),
      " |",
      pct(hiwr).padStart(10),
      pct(svw).padStart(8),
      pct(card).padStart(12),
      pct(neut).padStart(8),
      pct(svb).padStart(8),
    ].join(" ")
  );
  if (process.argv[2] === "round3") {
    // One attribute 3 -> 5 (realistic hidden) vs neutral: does any single
    // attribute become a monster? Sensitivity to initiative shows up here
    // in Fight IQ and Cardio.
    const base = Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, 3])) as Record<
      (typeof VISIBLE_ATTRIBUTES)[number],
      number
    >;
    const values = VISIBLE_ATTRIBUTES.map((attribute) => {
      const f = buildArchetypeSnapshot("x", `x-${attribute}`, { ...base, [attribute]: 5 }, 3, {
        [attribute]: { speed: 5, defense: 5 },
      });
      let w = 0;
      for (let i = 0; i < 4000; i++) {
        if (simulateFight(f, NEUTRAL_B, createRng(7_000_000 + i), tuning).winnerId === f.id) w++;
      }
      return { attribute, rate: w / 4000 };
    });
    const rates = values.map((v) => v.rate);
    console.log(
      "    attrs 3->5: " +
        values.map((v) => `${v.attribute.slice(0, 5)} ${pct(v.rate)}`).join("  ") +
        `   | spread ${pct(Math.max(...rates) - Math.min(...rates))}`
    );
  }
}
void BALANCED; void ELITE_STRIKER; void SINGLE_STAT_POWER;
