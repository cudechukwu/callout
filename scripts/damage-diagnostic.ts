/**
 * Head-damage diagnostic for finish-rate tuning. Answers "does the
 * simulation actually reach the damage range koRiskModifier is defined
 * over?" and "what kind of finishes are we producing?" — see
 * BALANCE_REPORT.md > Finish-rate tuning.
 *
 * Head damage is reconstructed from the event log (strikeLanded events
 * with zone === "head"), so it needs no engine changes. The KO/TKO
 * finishing strike is logged before the finish event, so "before" is
 * the total minus that final strike's damage.
 *
 * Usage: npx tsx scripts/damage-diagnostic.ts [iterations]
 */
import { simulateFight } from "../src/lib/simulation/engine";
import { createRng } from "../src/lib/simulation/rng";
import {
  ALL_ELITE,
  ALL_WEAK,
  BALANCED,
  ELITE_STRIKER,
  ELITE_WRESTLER,
  HIGH_CHIN,
  LOW_CHIN,
  NEUTRAL_A,
  NEUTRAL_B,
  SINGLE_STAT_POWER,
} from "../src/lib/simulation/balanceFixtures";
import type { FighterSnapshot, FightMethod } from "../src/lib/simulation/types";

const iterations = Number(process.argv[2]) || 10_000;

const matchups: Array<[string, FighterSnapshot, FighterSnapshot]> = [
  ["Neutral vs Neutral", NEUTRAL_A, NEUTRAL_B],
  ["Power vs Neutral", SINGLE_STAT_POWER, NEUTRAL_A],
  ["High Chin vs Low Chin", HIGH_CHIN, LOW_CHIN],
  ["Elite Striker vs Balanced", ELITE_STRIKER, BALANCED],
  ["Elite Wrestler vs Balanced", ELITE_WRESTLER, BALANCED],
  ["Elite Striker vs Elite Wrestler", ELITE_STRIKER, ELITE_WRESTLER],
  ["All-Elite vs All-Weak", ALL_ELITE, ALL_WEAK],
];

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))]!;
}

const fmt = (n: number) => (Number.isNaN(n) ? "  -  " : n.toFixed(1).padStart(5));

for (const [label, a, b] of matchups) {
  const endingHeadDamage: number[] = []; // per fighter per fight, all fights
  const before: Record<FightMethod, number[]> = { KO: [], TKO: [], SUB: [], DEC: [] };
  const after: Record<FightMethod, number[]> = { KO: [], TKO: [], SUB: [], DEC: [] };
  const counts: Record<FightMethod, number> = { KO: 0, TKO: 0, SUB: 0, DEC: 0 };

  for (let i = 0; i < iterations; i++) {
    const result = simulateFight(a, b, createRng(i));
    counts[result.method]++;

    const total: Record<string, number> = { [a.id]: 0, [b.id]: 0 };
    let lastHit = 0;
    for (const event of result.events) {
      if (event.type !== "strikeLanded") continue;
      const meta = event.metadata as { zone?: string; damageAmount?: number } | undefined;
      if (meta?.zone !== "head") continue;
      const amount = meta.damageAmount ?? 0;
      total[event.targetId] = Math.min(100, total[event.targetId]! + amount);
      lastHit = amount;
    }

    for (const id of [a.id, b.id]) endingHeadDamage.push(total[id]!);

    if (result.method === "KO" || result.method === "TKO") {
      const loserId = result.winnerId === a.id ? b.id : a.id;
      after[result.method].push(total[loserId]!);
      before[result.method].push(Math.max(0, total[loserId]! - lastHit));
    } else {
      // Decisions/submissions: report the more-damaged fighter's ending damage.
      after[result.method].push(Math.max(total[a.id]!, total[b.id]!));
    }
  }

  const frac = (t: number) =>
    ((100 * endingHeadDamage.filter((v) => v >= t).length) / endingHeadDamage.length).toFixed(1);
  const pct = (m: FightMethod) => ((100 * counts[m]) / iterations).toFixed(1).padStart(5) + "%";

  console.log(`\n${label}`);
  console.log(
    `  finish mix   KO ${pct("KO")}  TKO ${pct("TKO")}  SUB ${pct("SUB")}  DEC ${pct("DEC")}`
  );
  console.log(
    `  head dmg at end (per fighter)  p50 ${fmt(median(endingHeadDamage))}  p90 ${fmt(percentile(endingHeadDamage, 0.9))}  p99 ${fmt(percentile(endingHeadDamage, 0.99))}  | >=10: ${frac(10)}%  >=20: ${frac(20)}%  >=30: ${frac(30)}%  >=40: ${frac(40)}%`
  );
  console.log(
    `  KO  victim head dmg   before ${fmt(median(before.KO))}  after ${fmt(median(after.KO))}   (n=${counts.KO})`
  );
  console.log(
    `  TKO victim head dmg   before ${fmt(median(before.TKO))}  after ${fmt(median(after.TKO))}   (n=${counts.TKO})`
  );
  console.log(`  SUB fights, worse head dmg  median ${fmt(median(after.SUB))}`);
  console.log(`  DEC fights, worse head dmg  median ${fmt(median(after.DEC))}`);
}
