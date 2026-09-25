import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import { simulateFight } from "@/lib/simulation/engine";
import { DRAFT_POOL } from "./draftPool";
import { classifyTier } from "./tiers";
import {
  isAlreadyUsed,
  isDraftComplete,
  reroll,
  selectCandidate,
  startDraft,
  toFighterSnapshot,
  type DraftSessionState,
} from "./session";

/** Plays a full 8-round draft, always picking the first card it can take. */
function playFullDraft(rng: ReturnType<typeof createRng>): DraftSessionState {
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const pick = state.currentCandidates!.find((f) => !isAlreadyUsed(state, f.id))!;
    state = selectCandidate(state, pick.id);
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

    const next = selectCandidate(state, pick.id);

    expect(next.roundIndex).toBe(1);
    expect(next.selections.get(attribute)).toEqual(pick);
    expect(next.usedFighterIds.has(pick.id)).toBe(true);
    expect(next.currentCandidates).toHaveLength(3);
  });

  it("throws if the fighter id isn't one of the current candidates", () => {
    const rng = createRng(1);
    const state = startDraft(rng);
    expect(() => selectCandidate(state, -999999)).toThrow(/not one of the current candidates/);
  });

  it("throws if called on an already-complete draft", () => {
    const rng = createRng(1);
    const finished = playFullDraft(rng);
    expect(isDraftComplete(finished)).toBe(true);
    expect(() => selectCandidate(finished, 1)).toThrow(/already complete/);
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

    const rerolled = reroll(state);

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
    state = reroll(state);
    state = reroll(state);
    expect(state.rerollsRemaining).toBe(0);
    expect(() => reroll(state)).toThrow(/no rerolls remaining/i);
  });

  it("throws if called on an already-complete draft", () => {
    const rng = createRng(1);
    const finished = playFullDraft(rng);
    expect(() => reroll(finished)).toThrow(/already complete/);
  });

  it("rerolling then selecting still enforces one-per-fighter correctly", () => {
    const rng = createRng(9);
    let state = startDraft(rng);
    state = reroll(state);
    const pick = state.currentCandidates![0]!;
    state = selectCandidate(state, pick.id);
    expect(state.usedFighterIds.has(pick.id)).toBe(true);
    // If the picked fighter comes round again he shows, but as used.
    for (const fighter of state.currentCandidates!) {
      if (fighter.id === pick.id) expect(isAlreadyUsed(state, fighter.id)).toBe(true);
    }
  });
});

describe("reroll — fresh candidates", () => {
  it("never shows any of the three candidates that were just discarded", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      const state = startDraft(rng);
      const discarded = new Set(state.currentCandidates!.map((f) => f.id));
      const rerolled = reroll(state);
      for (const fighter of rerolled.currentCandidates!) {
        expect(discarded.has(fighter.id)).toBe(false);
      }
    }
  });
});

describe("single-player never shows a fighter you already used", () => {
  it("swaps used fighters for unused ones of the same tier, across rerolls", () => {
    let swaps = 0;
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRng(seed);
      let state = startDraft(rng);
      expect(state.solo).toBe(true);
      while (!isDraftComplete(state)) {
        if (state.rerollsRemaining > 0 && rng.next() < 0.25) state = reroll(state);
        const cards = state.currentCandidates!;
        expect(new Set(cards.map((f) => f.id)).size).toBe(3);
        for (const card of cards) expect(isAlreadyUsed(state, card.id), `seed ${seed}`).toBe(false);
        // Compare with the plan's board to check replacements keep the tier.
        const round = state.plan.rounds[state.roundIndex]!;
        const planned = round.offers[state.offerIndex]!;
        planned.forEach((id, i) => {
          if (id !== cards[i]!.id) {
            swaps++;
            const attribute = round.attribute;
            const plannedFighter = DRAFT_POOL.find((f) => f.id === id)!;
            expect(classifyTier(cards[i]![attribute])).toBe(classifyTier(plannedFighter[attribute]));
          }
        });
        state = selectCandidate(state, cards[Math.floor(rng.next() * 3)]!.id);
      }
    }
    expect(swaps).toBeGreaterThan(100); // repeats do come up, and get swapped
  });

  it("is deterministic: the same draft shows the same swapped boards", () => {
    const a = playFullDraft(createRng(21));
    const b = playFullDraft(createRng(21));
    expect(a.history).toEqual(b.history);
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
