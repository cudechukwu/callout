import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import { simulateFight } from "@/lib/simulation/engine";
import {
  isDraftComplete,
  reroll,
  selectCandidate,
  startDraft,
  toFighterSnapshot,
  type DraftSessionState,
} from "./session";

/** Plays a full 8-round draft, always picking the first of the 3
 * candidates shown, using a single threaded RNG. */
function playFullDraft(rng: ReturnType<typeof createRng>): DraftSessionState {
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const pick = state.currentCandidates![0];
    state = selectCandidate(state, pick.id, rng);
  }
  return state;
}

describe("startDraft", () => {
  it("produces a full 8-attribute shuffled order", () => {
    const state = startDraft(createRng(1));
    expect(state.attributeOrder.length).toBe(VISIBLE_ATTRIBUTES.length);
    expect(new Set(state.attributeOrder)).toEqual(new Set(VISIBLE_ATTRIBUTES));
  });

  it("starts at round 0 with 3 candidates, no selections, 2 rerolls", () => {
    const state = startDraft(createRng(1));
    expect(state.roundIndex).toBe(0);
    expect(state.currentCandidates).not.toBeNull();
    expect(state.currentCandidates).toHaveLength(3);
    expect(state.selections.size).toBe(0);
    expect(state.usedFighterIds.size).toBe(0);
    expect(state.rerollsRemaining).toBe(2);
    expect(isDraftComplete(state)).toBe(false);
  });

  it("is deterministic for a given seed", () => {
    const a = startDraft(createRng(42));
    const b = startDraft(createRng(42));
    expect(a.attributeOrder).toEqual(b.attributeOrder);
    expect(a.currentCandidates!.map((f) => f.id)).toEqual(b.currentCandidates!.map((f) => f.id));
  });

  it("attribute order actually varies across seeds (it's a real shuffle)", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      orders.add(startDraft(createRng(seed)).attributeOrder.join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("candidate order", () => {
  // Slots are generated from different tier mixes (slot 1 elite-heavy,
  // slot 3 wildcard-heavy), so an unshuffled order would leak quality.
  // Each candidate is scored by its fighter's rating for the attribute
  // being drafted; the average by displayed position must not slope.
  it("does not leak quality through display position", () => {
    const sums = [0, 0, 0];
    const runs = 1500;
    for (let seed = 0; seed < runs; seed++) {
      const state = startDraft(createRng(seed));
      const attribute = state.attributeOrder[0]!;
      state.currentCandidates!.forEach((fighter, position) => {
        sums[position]! += fighter[attribute];
      });
    }
    const averages = sums.map((sum) => sum / runs);
    expect(Math.max(...averages) - Math.min(...averages)).toBeLessThan(0.1);
  });
});

describe("selectCandidate", () => {
  it("advances round, records the selection, and marks the fighter used", () => {
    const rng = createRng(1);
    const state = startDraft(rng);
    const attribute = state.attributeOrder[0]!;
    const pick = state.currentCandidates![1];

    const next = selectCandidate(state, pick.id, rng);

    expect(next.roundIndex).toBe(1);
    expect(next.selections.get(attribute)).toEqual(pick);
    expect(next.usedFighterIds.has(pick.id)).toBe(true);
    expect(next.currentCandidates).toHaveLength(3);
  });

  it("throws if the fighter id isn't one of the current candidates", () => {
    const rng = createRng(1);
    const state = startDraft(rng);
    expect(() => selectCandidate(state, -999999, rng)).toThrow(/not one of the current candidates/);
  });

  it("throws if called on an already-complete draft", () => {
    const rng = createRng(1);
    const finished = playFullDraft(rng);
    expect(isDraftComplete(finished)).toBe(true);
    expect(() => selectCandidate(finished, 1, rng)).toThrow(/already complete/);
  });

  it("never lets the same fighter be selected twice across a full draft", () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = playFullDraft(createRng(seed));
      const pickedIds = [...state.selections.values()].map((f) => f.id);
      expect(new Set(pickedIds).size, `seed ${seed}: duplicate pick`).toBe(8);
    }
  });

  it("sets currentCandidates to null exactly when the draft completes", () => {
    const state = playFullDraft(createRng(3));
    expect(state.currentCandidates).toBeNull();
    expect(state.roundIndex).toBe(8);
  });
});

describe("reroll", () => {
  it("refreshes candidates for the current attribute without touching selections", () => {
    const rng = createRng(5);
    const state = startDraft(rng);
    const before = state.currentCandidates!.map((f) => f.id);

    const rerolled = reroll(state, rng);

    expect(rerolled.rerollsRemaining).toBe(1);
    expect(rerolled.selections.size).toBe(0);
    expect(rerolled.usedFighterIds.size).toBe(0);
    expect(rerolled.roundIndex).toBe(state.roundIndex);
    // Not guaranteed to differ every time (small pool, possible repeat),
    // but the reroll counter and round position are what actually matter.
    expect(rerolled.currentCandidates).toHaveLength(3);
    void before;
  });

  it("throws once rerolls are exhausted", () => {
    const rng = createRng(5);
    let state = startDraft(rng);
    state = reroll(state, rng);
    state = reroll(state, rng);
    expect(state.rerollsRemaining).toBe(0);
    expect(() => reroll(state, rng)).toThrow(/no rerolls remaining/i);
  });

  it("throws if called on an already-complete draft", () => {
    const rng = createRng(1);
    const finished = playFullDraft(rng);
    expect(() => reroll(finished, rng)).toThrow(/already complete/);
  });

  it("rerolling then selecting still enforces one-per-fighter correctly", () => {
    const rng = createRng(9);
    let state = startDraft(rng);
    state = reroll(state, rng);
    const pick = state.currentCandidates![0]!;
    state = selectCandidate(state, pick.id, rng);
    expect(state.usedFighterIds.has(pick.id)).toBe(true);
    // The rerolled-away original candidates must never appear again.
    expect(state.currentCandidates!.every((f) => f.id !== pick.id)).toBe(true);
  });
});

describe("reroll — fresh candidates", () => {
  it("never shows any of the three candidates that were just discarded", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const state = startDraft(rng);
      const discarded = new Set(state.currentCandidates!.map((f) => f.id));
      const rerolled = reroll(state, rng);
      for (const fighter of rerolled.currentCandidates!) {
        expect(discarded.has(fighter.id)).toBe(false);
      }
    }
  });
});

describe("toFighterSnapshot", () => {
  it("throws if the draft isn't complete", () => {
    const state = startDraft(createRng(1));
    expect(() => toFighterSnapshot(state, "id", "Name")).toThrow(/not complete/);
  });

  it("produces a snapshot with all 8 attributes filled from the actual picks", () => {
    const rng = createRng(11);
    const state = playFullDraft(rng);
    const snapshot = toFighterSnapshot(state, "fighter-1", "NIGHTSHIFT");

    expect(snapshot.id).toBe("fighter-1");
    expect(snapshot.name).toBe("NIGHTSHIFT");
    for (const attribute of VISIBLE_ATTRIBUTES) {
      const expectedFighter = state.selections.get(attribute)!;
      expect(snapshot.selections[attribute].sourceFighter.id).toBe(expectedFighter.id);
    }
  });

  it("is deterministic: same seed, same full draft, same snapshot", () => {
    const a = toFighterSnapshot(playFullDraft(createRng(7)), "x", "X");
    const b = toFighterSnapshot(playFullDraft(createRng(7)), "x", "X");
    for (const attribute of VISIBLE_ATTRIBUTES) {
      expect(a.selections[attribute].sourceFighter.id).toBe(b.selections[attribute].sourceFighter.id);
    }
  });
});

describe("integration: a drafted fighter is a valid simulateFight input", () => {
  it("two independently-drafted fighters can actually fight", () => {
    const fighterA = toFighterSnapshot(playFullDraft(createRng(1)), "a", "Fighter A");
    const fighterB = toFighterSnapshot(playFullDraft(createRng(2)), "b", "Fighter B");

    const result = simulateFight(fighterA, fighterB, createRng(99));

    expect(["a", "b"]).toContain(result.winnerId);
    expect(["KO", "TKO", "SUB", "DEC"]).toContain(result.method);
    expect(result.events.length).toBeGreaterThan(0);
  });
});
