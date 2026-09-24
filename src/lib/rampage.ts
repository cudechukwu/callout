import type { FightMethod, FightResult } from "./simulation/types";

/** Fights in one rampage — see the product notes: a run of consecutive
 * fights summarized by a final score rather than fight-by-fight. */
export const RAMPAGE_LENGTH = 20;

/** The slice of a finished fight the record and rampage summary need.
 * Deliberately small: the full FightResult (event log, stats) isn't
 * kept, so a whole rampage stays cheap to hold in memory. */
export interface FightRecord {
  opponentName: string;
  won: boolean;
  method: FightMethod;
  round: number;
  /** Seconds into the finishing round (300 for a decision). */
  roundTimeSeconds: number;
}

export interface RampageSummary {
  fights: number;
  wins: number;
  losses: number;
  winPercent: number;
  winsByMethod: Record<FightMethod, number>;
  lossesByMethod: Record<FightMethod, number>;
  /** Fights that ended before the judges (KO, TKO or SUB), both sides. */
  finishes: number;
  longestWinStreak: number;
}

function emptyMethodCounts(): Record<FightMethod, number> {
  return { KO: 0, TKO: 0, SUB: 0, DEC: 0 };
}

export function toFightRecord(
  result: FightResult,
  playerId: string,
  opponentName: string
): FightRecord {
  return {
    opponentName,
    won: result.winnerId === playerId,
    method: result.method,
    round: result.round,
    roundTimeSeconds: result.roundTimeSeconds,
  };
}

export function recordOf(fights: readonly FightRecord[]): { wins: number; losses: number } {
  const wins = fights.filter((fight) => fight.won).length;
  return { wins, losses: fights.length - wins };
}

export function summarizeRampage(fights: readonly FightRecord[]): RampageSummary {
  const winsByMethod = emptyMethodCounts();
  const lossesByMethod = emptyMethodCounts();
  let longestWinStreak = 0;
  let currentStreak = 0;
  let finishes = 0;

  for (const fight of fights) {
    (fight.won ? winsByMethod : lossesByMethod)[fight.method]++;
    if (fight.method !== "DEC") finishes++;
    currentStreak = fight.won ? currentStreak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, currentStreak);
  }

  const { wins, losses } = recordOf(fights);
  return {
    fights: fights.length,
    wins,
    losses,
    winPercent: fights.length === 0 ? 0 : Math.round((wins / fights.length) * 100),
    winsByMethod,
    lossesByMethod,
    finishes,
    longestWinStreak,
  };
}
