import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import { generateCandidates } from "./candidates";
import { DRAFT_POOL, poolByTier } from "./draftPool";
import { DRAFT_VERSION, generateDraftPlan, OFFERS_PER_ROUND } from "./plan";
import {
  isAlreadyUsed,
  isDraftComplete,
  reroll,
  selectCandidate,
  startDraftFromPlan,
  type DraftSessionState,
} from "./session";

describe("generateDraftPlan", () => {
  it("is a pure function of the seed", () => {
    expect(generateDraftPlan(123)).toEqual(generateDraftPlan(123));
    expect(generateDraftPlan("abc")).toEqual(generateDraftPlan("abc"));
    expect(generateDraftPlan(1)).not.toEqual(generateDraftPlan(2));
  });

  it("records its version and covers every attribute once, with 3 offers a round", () => {
    const plan = generateDraftPlan(7);
    expect(plan.draftVersion).toBe(DRAFT_VERSION);
    expect(new Set(plan.attributeOrder)).toEqual(new Set(VISIBLE_ATTRIBUTES));
    expect(plan.rounds.map((r) => r.attribute)).toEqual(plan.attributeOrder);
    for (const round of plan.rounds) expect(round.offers).toHaveLength(OFFERS_PER_ROUND);
  });

  it("round-trips through JSON (it is stored server-side)", () => {
    const plan = generateDraftPlan(99);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("never repeats a fighter within an offer or within a round", () => {
    for (let seed = 0; seed < 500; seed++) {
      for (const round of generateDraftPlan(seed).rounds) {
        const all = round.offers.flat();
        expect(new Set(all).size, `seed ${seed}`).toBe(all.length);
      }
    }
  });

  it("fresh-card rule: every offer has a fighter no earlier round showed", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const shownBefore = new Set<number>();
      for (const round of generateDraftPlan(seed).rounds) {
        for (const offer of round.offers) {
          expect(offer.some((id) => !shownBefore.has(id)), `seed ${seed}`).toBe(true);
        }
        round.offers.flat().forEach((id) => shownBefore.add(id));
      }
    }
  });

  it("keeps the usual tier odds on base boards", () => {
    // Share of elite fighters on base boards vs the plain generator.
    const eliteShare = (ids: number[], attribute: (typeof VISIBLE_ATTRIBUTES)[number]) => {
      const elite = new Set(poolByTier(attribute, DRAFT_POOL).elite.map((f) => f.id));
      return ids.filter((id) => elite.has(id)).length;
    };
    let planElite = 0;
    let plainElite = 0;
    let cards = 0;
    for (let seed = 0; seed < 1500; seed++) {
      const plan = generateDraftPlan(seed);
      plan.rounds.forEach((round, r) => {
        planElite += eliteShare([...round.offers[0]!], round.attribute);
        const plain = generateCandidates(round.attribute, new Set(), createRng(`plain:${seed}:${r}`));
        plainElite += eliteShare(plain.map((f) => f.id), round.attribute);
        cards += 3;
      });
    }
    expect(Math.abs(planElite / cards - plainElite / cards)).toBeLessThan(0.03);
  });
});

/** Plays a draft on `plan` with random picks and random reroll timing. */
function randomPath(plan: ReturnType<typeof generateDraftPlan>, pathSeed: number) {
  const rng = createRng(`path:${pathSeed}`);
  let state: DraftSessionState = startDraftFromPlan(plan);
  let minSelectable = 3;
  while (!isDraftComplete(state)) {
    if (state.rerollsRemaining > 0 && rng.next() < 0.25) state = reroll(state);
    const selectable = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    minSelectable = Math.min(minSelectable, selectable.length);
    if (selectable.length === 0) break;
    state = selectCandidate(state, selectable[Math.floor(rng.next() * selectable.length)]!.id);
  }
  return { state, minSelectable };
}

describe("drafting on a plan", () => {
  it("no legal path ever reaches a board with nothing to pick", () => {
    for (let seed = 0; seed < 400; seed++) {
      const plan = generateDraftPlan(seed);
      for (let path = 0; path < 10; path++) {
        const { state, minSelectable } = randomPath(plan, seed * 10 + path);
        expect(minSelectable, `seed ${seed} path ${path}`).toBeGreaterThanOrEqual(1);
        expect(isDraftComplete(state)).toBe(true);
      }
    }
  });

  it("two players with different picks see identical boards and reroll offers", () => {
    const plan = generateDraftPlan("duel");
    let a = startDraftFromPlan(plan);
    let b = startDraftFromPlan(plan);
    while (!isDraftComplete(a)) {
      // B rerolls the first two rounds; the offer on each reroll must match A's.
      if (b.rerollsRemaining > 0) {
        a = reroll(a);
        b = reroll(b);
      }
      expect(b.currentCandidates!.map((f) => f.id)).toEqual(a.currentCandidates!.map((f) => f.id));
      const aPick = a.currentCandidates!.find((f) => !isAlreadyUsed(a, f.id))!;
      const bPick = [...b.currentCandidates!].reverse().find((f) => !isAlreadyUsed(b, f.id))!;
      a = selectCandidate(a, aPick.id);
      b = selectCandidate(b, bPick.id);
    }
  });

  it("the round's offers match the plan, in order", () => {
    const plan = generateDraftPlan(5);
    let state = startDraftFromPlan(plan);
    for (let offer = 0; offer < OFFERS_PER_ROUND; offer++) {
      expect(state.currentCandidates!.map((f) => f.id)).toEqual([...plan.rounds[0]!.offers[offer]!]);
      if (offer < OFFERS_PER_ROUND - 1) state = reroll(state);
    }
  });

  it("an already-used fighter stays on the board but cannot be picked", () => {
    // Find a plan where a picked fighter comes round again.
    for (let seed = 0; seed < 500; seed++) {
      const plan = generateDraftPlan(seed);
      let state = startDraftFromPlan(plan);
      while (!isDraftComplete(state)) {
        const repeat = state.currentCandidates!.find((f) => isAlreadyUsed(state, f.id));
        if (repeat) {
          expect(() => selectCandidate(state, repeat.id)).toThrow(/already used/);
          return;
        }
        const firstTaken = state.currentCandidates!.find((f) => !isAlreadyUsed(state, f.id))!;
        // Take the elite-looking first card every round to maximise repeats.
        state = selectCandidate(state, firstTaken.id);
      }
    }
    throw new Error("No repeated fighter found in 500 plans");
  });

  it("records which offer each pick came from", () => {
    let state = startDraftFromPlan(generateDraftPlan(8));
    state = reroll(state);
    state = selectCandidate(state, state.currentCandidates!.find((f) => !isAlreadyUsed(state, f.id))!.id);
    expect(state.history[0]!.offerIndex).toBe(1);
    expect(state.offerIndex).toBe(0);
  });
});
