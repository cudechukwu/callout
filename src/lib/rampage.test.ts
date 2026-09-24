import { describe, expect, it } from "vitest";
import { recordOf, summarizeRampage, type FightRecord } from "./rampage";

function fight(won: boolean, method: FightRecord["method"] = "DEC"): FightRecord {
  return { opponentName: "CPU", won, method, round: 3, roundTimeSeconds: 300 };
}

describe("recordOf", () => {
  it("counts wins and losses", () => {
    expect(recordOf([fight(true), fight(false), fight(true)])).toEqual({ wins: 2, losses: 1 });
  });

  it("is 0-0 with no fights", () => {
    expect(recordOf([])).toEqual({ wins: 0, losses: 0 });
  });
});

describe("summarizeRampage", () => {
  it("handles an empty rampage without dividing by zero", () => {
    const summary = summarizeRampage([]);
    expect(summary.fights).toBe(0);
    expect(summary.winPercent).toBe(0);
    expect(summary.longestWinStreak).toBe(0);
  });

  it("splits wins and losses by finish method", () => {
    const summary = summarizeRampage([
      fight(true, "KO"),
      fight(true, "DEC"),
      fight(false, "SUB"),
      fight(true, "TKO"),
    ]);
    expect(summary.winsByMethod).toEqual({ KO: 1, TKO: 1, SUB: 0, DEC: 1 });
    expect(summary.lossesByMethod).toEqual({ KO: 0, TKO: 0, SUB: 1, DEC: 0 });
    expect(summary.wins).toBe(3);
    expect(summary.losses).toBe(1);
    expect(summary.winPercent).toBe(75);
  });

  it("counts finishes on both sides, excluding decisions", () => {
    const summary = summarizeRampage([fight(true, "KO"), fight(false, "SUB"), fight(true, "DEC")]);
    expect(summary.finishes).toBe(2);
  });

  it("finds the longest win streak, resetting on each loss", () => {
    const summary = summarizeRampage(
      [true, true, false, true, true, true, false, true].map((won) => fight(won))
    );
    expect(summary.longestWinStreak).toBe(3);
  });
});
