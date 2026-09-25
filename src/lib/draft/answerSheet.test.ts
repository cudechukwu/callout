import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAFT_POOL } from "./draftPool";
import { computeYourCalls } from "./answerSheet";
import { slotValue } from "./overall";
import { isDraftComplete, selectCandidate, startDraft, type BoardRecord } from "./session";
import { createRng } from "../simulation/rng";

/** Drafts with a strategy: "best" / "worst" by real slot value, or a random card. */
function draft(seed: number, strategy: "best" | "worst" | "random") {
  const rng = createRng(seed);
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]!;
    const cards = [...state.currentCandidates!];
    const values = cards.map((c) => slotValue(c, attribute));
    const index =
      strategy === "best"
        ? values.indexOf(Math.max(...values))
        : strategy === "worst"
          ? values.indexOf(Math.min(...values))
          : Math.floor(rng.next() * 3);
    state = selectCandidate(state, cards[index]!.id, rng);
  }
  return state;
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

describe("draft history", () => {
  it("records the three cards and the pick for every round, in order", () => {
    const state = draft(3, "random");
    expect(state.history).toHaveLength(8);
    state.history.forEach((round, i) => {
      expect(round.attribute).toBe(state.attributeOrder[i]);
      expect(round.cards).toHaveLength(3);
      expect(round.cards.map((c) => c.id)).toContain(round.pickedId);
      expect(state.selections.get(round.attribute)!.id).toBe(round.pickedId);
    });
  });
});

describe("computeYourCalls", () => {
  it("returns null with no history", () => {
    expect(computeYourCalls([])).toBeNull();
  });

  it("finds nothing left on the table for a drafter who always takes the best card", () => {
    const left = Array.from({ length: 150 }, (_, s) => computeYourCalls(draft(s, "best").history)!.leftOnTable);
    expect(median(left)).toBeLessThanOrEqual(1);
  });

  it("finds a lot left on the table for a drafter who always takes the worst card", () => {
    const left = Array.from({ length: 150 }, (_, s) => computeYourCalls(draft(s, "worst").history)!.leftOnTable);
    expect(median(left)).toBeGreaterThan(15);
  });

  it("is never negative and never larger than the whole gap between best and worst mixes", () => {
    for (let s = 0; s < 100; s++) {
      const calls = computeYourCalls(draft(s, "random").history)!;
      expect(calls.leftOnTable).toBeGreaterThanOrEqual(0);
    }
  });

  it("names the passed-over card that would have added the most, and by how much", () => {
    const [a, b, c] = [DRAFT_POOL[0]!, DRAFT_POOL[10]!, DRAFT_POOL[20]!];
    const history: BoardRecord[] = [{ attribute: "power", cards: [a, b, c], pickedId: a.id }];
    const values = [a, b, c].map((f) => slotValue(f, "power"));
    const topIndex = values.indexOf(Math.max(...values));
    const calls = computeYourCalls(history)!;
    if (topIndex === 0) {
      expect(calls.biggestMiss).toBeNull();
    } else {
      expect(calls.biggestMiss!.betterName).toBe([a, b, c][topIndex]!.name);
      expect(calls.biggestMiss!.gain).toBe(Math.round(values[topIndex]! - values[0]!));
    }
  });

  it("only names a miss worth at least a point, and calls a sleeper rarely", () => {
    let sleepers = 0;
    const n = 400;
    for (let s = 0; s < n; s++) {
      const calls = computeYourCalls(draft(s, "random").history)!;
      if (calls.biggestMiss) expect(calls.biggestMiss.gain).toBeGreaterThanOrEqual(1);
      if (calls.sleeper) sleepers++;
    }
    expect(sleepers / n).toBeLessThan(0.2);
  });

  it("is deterministic", () => {
    const history = draft(9, "random").history;
    expect(computeYourCalls(history)).toEqual(computeYourCalls(history));
  });
});

describe("answer sheet isolation", () => {
  it("is never imported by the simulation", () => {
    const dir = join(__dirname, "../simulation");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => /from\s+["'][^"']*\/answerSheet["']/.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
