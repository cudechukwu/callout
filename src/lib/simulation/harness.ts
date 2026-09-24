import type { FighterSnapshot, FightMethod } from "./types";
import { createRng } from "./rng";
import { ROUND_DURATION_SECONDS, simulateFight } from "./engine";

const METHODS: FightMethod[] = ["KO", "TKO", "SUB", "DEC"];

export interface MatchupResult {
  label: string;
  iterations: number;
  fighterAId: string;
  fighterBId: string;
  fighterAWins: number;
  fighterBWins: number;
  fighterAWinRate: number;
  methodCounts: Record<FightMethod, number>;
  methodRates: Record<FightMethod, number>;
  averageRound: number;
  /** Total elapsed fight time, NOT the raw per-round FightResult.roundTimeSeconds
   * summed directly — that field resets every round, so a naive sum
   * silently undercounted every fight that didn't end in round 1 (a bug
   * caught by review: a full 15-minute decision was being counted as
   * 300s instead of 900s). See FightResult.roundTimeSeconds in types.ts. */
  averageElapsedFightSeconds: number;
  /** Average per-fighter box score, for diagnosing WHY a win rate looks
   * the way it does rather than only observing that it does. Added
   * after a review noted decision scoring currently ignores damage
   * dealt entirely (a jab and a head kick both count as one landed
   * strike) — this is the data needed to check that hypothesis before
   * changing the scoring formula. */
  averageStats: Record<string, {
    significantStrikesLanded: number;
    takedownsLanded: number;
    controlSeconds: number;
    submissionAttempts: number;
    headDamageDealt: number;
    bodyDamageDealt: number;
    legDamageDealt: number;
  }>;
}

/**
 * Runs `iterations` fights between the same two fighters, varying only
 * the seed, and aggregates the outcomes. `seedOffset` lets multiple
 * studies run without their seed ranges overlapping (not that it would
 * matter for correctness — each fight is independent regardless — but
 * it keeps results reproducible per named study).
 */
export function runMatchupStudy(
  label: string,
  fighterA: FighterSnapshot,
  fighterB: FighterSnapshot,
  iterations: number,
  seedOffset = 0
): MatchupResult {
  let fighterAWins = 0;
  let fighterBWins = 0;
  const methodCounts: Record<FightMethod, number> = { KO: 0, TKO: 0, SUB: 0, DEC: 0 };
  let roundSum = 0;
  let timeSum = 0;

  const statSums: Record<string, Record<string, number>> = {
    [fighterA.id]: {
      significantStrikesLanded: 0,
      takedownsLanded: 0,
      controlSeconds: 0,
      submissionAttempts: 0,
      headDamageDealt: 0,
      bodyDamageDealt: 0,
      legDamageDealt: 0,
    },
    [fighterB.id]: {
      significantStrikesLanded: 0,
      takedownsLanded: 0,
      controlSeconds: 0,
      submissionAttempts: 0,
      headDamageDealt: 0,
      bodyDamageDealt: 0,
      legDamageDealt: 0,
    },
  };

  for (let i = 0; i < iterations; i++) {
    const result = simulateFight(fighterA, fighterB, createRng(seedOffset + i));
    if (result.winnerId === fighterA.id) fighterAWins++;
    else fighterBWins++;
    methodCounts[result.method]++;
    roundSum += result.round;
    timeSum += (result.round - 1) * ROUND_DURATION_SECONDS + result.roundTimeSeconds;

    for (const fighterId of [fighterA.id, fighterB.id]) {
      const fighterStats = result.stats[fighterId]!;
      const sums = statSums[fighterId]!;
      sums.significantStrikesLanded! += fighterStats.significantStrikesLanded;
      sums.takedownsLanded! += fighterStats.takedownsLanded;
      sums.controlSeconds! += fighterStats.controlSeconds;
      sums.submissionAttempts! += fighterStats.submissionAttempts;
      sums.headDamageDealt! += fighterStats.headDamageDealt;
      sums.bodyDamageDealt! += fighterStats.bodyDamageDealt;
      sums.legDamageDealt! += fighterStats.legDamageDealt;
    }
  }

  const averageStats = Object.fromEntries(
    Object.entries(statSums).map(([fighterId, sums]) => [
      fighterId,
      {
        significantStrikesLanded: sums.significantStrikesLanded! / iterations,
        takedownsLanded: sums.takedownsLanded! / iterations,
        controlSeconds: sums.controlSeconds! / iterations,
        submissionAttempts: sums.submissionAttempts! / iterations,
        headDamageDealt: sums.headDamageDealt! / iterations,
        bodyDamageDealt: sums.bodyDamageDealt! / iterations,
        legDamageDealt: sums.legDamageDealt! / iterations,
      },
    ])
  ) as MatchupResult["averageStats"];

  const methodRates = METHODS.reduce((acc, method) => {
    acc[method] = methodCounts[method] / iterations;
    return acc;
  }, {} as Record<FightMethod, number>);

  return {
    label,
    iterations,
    fighterAId: fighterA.id,
    fighterBId: fighterB.id,
    fighterAWins,
    fighterBWins,
    fighterAWinRate: fighterAWins / iterations,
    methodCounts,
    methodRates,
    averageRound: roundSum / iterations,
    averageElapsedFightSeconds: timeSum / iterations,
    averageStats,
  };
}

/** Renders a MatchupResult as a single readable line, for report scripts. */
export function formatMatchupResult(result: MatchupResult): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    `${result.label.padEnd(28)} ` +
    `${result.fighterAId} win rate: ${pct(result.fighterAWinRate).padEnd(7)} | ` +
    `KO ${pct(result.methodRates.KO).padEnd(6)} ` +
    `TKO ${pct(result.methodRates.TKO).padEnd(6)} ` +
    `SUB ${pct(result.methodRates.SUB).padEnd(6)} ` +
    `DEC ${pct(result.methodRates.DEC).padEnd(6)} ` +
    `| avg round ${result.averageRound.toFixed(2)}`
  );
}
