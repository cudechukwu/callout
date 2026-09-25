/**
 * Calibrates the Overall (OVR) formula. Samples drafted fighters, plays
 * each against a field of random CPU builds, and fits win rate against
 * the engine's 10 ratings (8 visible + hidden speed/defense) by least
 * squares. OVR is display-only: it summarizes a build's general quality
 * and is never read by the simulation — see src/lib/draft/overall.ts.
 *
 * Usage: npx tsx scripts/ovr-calibration.ts [fighters] [fightsPerFighter]
 */
import { VISIBLE_ATTRIBUTES } from "../src/lib/data/types";
import { generateCpuFighter } from "../src/lib/draft/cpuFighter";
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft, toFighterSnapshot } from "../src/lib/draft/session";
import { buildFullAttributeRatings, type FullAttributeRatings } from "../src/lib/simulation/derivedStats";
import { simulateFight } from "../src/lib/simulation/engine";
import { createRng } from "../src/lib/simulation/rng";
import type { FighterSnapshot, RNG } from "../src/lib/simulation/types";
import { ALL_ELITE, ALL_WEAK } from "../src/lib/simulation/balanceFixtures";

const N = Number(process.argv[2]) || 2500;
const FIGHTS = Number(process.argv[3]) || 80;
const KEYS = [...VISIBLE_ATTRIBUTES, "defense", "speed"] as const;

/** Drafts a fighter that takes the top-rated candidate with probability
 * `skill`, else a random one — spans random through greedy-optimal. */
function draftWithSkill(rng: RNG, id: string, skill: number): FighterSnapshot {
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]!;
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const best = candidates.reduce((a, b) => (b[attribute] > a[attribute] ? b : a));
    const pick = rng.next() < skill ? best : candidates[Math.floor(rng.next() * candidates.length)]!;
    state = selectCandidate(state, pick.id);
  }
  return toFighterSnapshot(state, id, id);
}

const rng = createRng(20260924);
const field: FighterSnapshot[] = Array.from({ length: 400 }, (_, i) =>
  generateCpuFighter(rng, `f${i}`, `f${i}`)
);

const rows: number[][] = [];
const winRates: number[] = [];
const skills: number[] = [];
for (let i = 0; i < N; i++) {
  const skill = [0, 0.5, 1][i % 3]!;
  const fighter = draftWithSkill(rng, `p${i}`, skill);
  let wins = 0;
  for (let j = 0; j < FIGHTS; j++) {
    const opponent = field[Math.floor(rng.next() * field.length)]!;
    if (simulateFight(fighter, opponent, rng).winnerId === fighter.id) wins++;
  }
  const ratings = buildFullAttributeRatings(fighter.selections);
  rows.push(KEYS.map((k) => ratings[k as keyof FullAttributeRatings]));
  winRates.push(wins / FIGHTS);
  skills.push(skill);
}

// Ordinary least squares with intercept via normal equations.
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}
function ols(X: number[][], y: number[]) {
  const Xi = X.map((r) => [1, ...r]);
  const k = Xi[0]!.length;
  const A = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => Xi.reduce((s, r) => s + r[i]! * r[j]!, 0))
  );
  const b = Array.from({ length: k }, (_, i) => Xi.reduce((s, r, n) => s + r[i]! * y[n]!, 0));
  const beta = solve(A, b);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const pred = Xi.map((r) => r.reduce((s, v, i) => s + v * beta[i]!, 0));
  const ssRes = y.reduce((s, v, i) => s + (v - pred[i]!) ** 2, 0);
  const ssTot = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  return { beta, r2: 1 - ssRes / ssTot };
}

// Hold out 20% (interleaved so all draft skills are in both sets): fit
// on the rest, then score the held-out set with that fit.
const isHoldout = (i: number) => i % 5 === 4;
const fitRows = rows.filter((_, i) => !isHoldout(i));
const fitWins = winRates.filter((_, i) => !isHoldout(i));
const testRows = rows.filter((_, i) => isHoldout(i));
const testWins = winRates.filter((_, i) => isHoldout(i));
{
  const fit = ols(fitRows, fitWins);
  const pred = testRows.map((r) => fit.beta[0]! + r.reduce((sum, v, i) => sum + v * fit.beta[i + 1]!, 0));
  const mean = testWins.reduce((a, v) => a + v, 0) / testWins.length;
  const ssRes = testWins.reduce((a, v, i) => a + (v - pred[i]!) ** 2, 0);
  const ssTot = testWins.reduce((a, v) => a + (v - mean) ** 2, 0);
  console.log(`Held-out (20%) R^2 from an 80% fit = ${(1 - ssRes / ssTot).toFixed(3)}  (in-sample fit reported below)`);
}

const full = ols(rows, winRates);
console.log(`Fighters: ${N}, fights each: ${FIGHTS}`);
console.log(`Full 10-rating fit  R^2 = ${full.r2.toFixed(3)}`);
KEYS.forEach((k, i) => console.log(`  ${k.padEnd(12)} ${full.beta[i + 1]!.toFixed(4)}`));
console.log(`  intercept    ${full.beta[0]!.toFixed(4)}`);

const avg8 = rows.map((r) => [r.slice(0, 8).reduce((s, v) => s + v, 0) / 8]);
console.log(`Plain avg of 8 visible  R^2 = ${ols(avg8, winRates).r2.toFixed(3)}`);
const avg10 = rows.map((r) => [r.reduce((s, v) => s + v, 0) / 10]);
console.log(`Plain avg of all 10     R^2 = ${ols(avg10, winRates).r2.toFixed(3)}`);

for (const s of [0, 0.5, 1]) {
  const wr = winRates.filter((_, i) => skills[i] === s);
  const sc = rows.filter((_, i) => skills[i] === s).map((r) => r.reduce((a, v) => a + v, 0) / 10);
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  console.log(`skill ${s}: median win rate vs field ${med(wr).toFixed(3)}, median avg rating ${med(sc).toFixed(2)}`);
}

// Show the resulting OVR distribution by draft skill (uses the shipped formula).
import { computeOverall } from "../src/lib/draft/overall";
console.log("\nShipped OVR by draft skill (median / min / max):");
for (const s of [0, 0.5, 1]) {
  const sample = Array.from({ length: 600 }, (_, i) =>
    computeOverall(draftWithSkill(rng, `o${s}-${i}`, s).selections)
  ).sort((a, b) => a - b);
  console.log(
    `  skill ${s}: ${sample[Math.floor(sample.length / 2)]} / ${sample[0]} / ${sample[sample.length - 1]}`
  );
}
console.log(`  All-Elite build: ${computeOverall(ALL_ELITE.selections)}, All-Weak build: ${computeOverall(ALL_WEAK.selections)}`);
