import { describe, expect, it } from "vitest";
import { DRAFT_POOL } from "./draft/draftPool";
import { generateDraftPlan } from "./draft/plan";
import { isAlreadyUsed, isDraftComplete, reroll, selectCandidate, startDraftFromPlan } from "./draft/session";
import { createRng } from "./simulation/rng";
import { boardPortraits, draftFaces } from "./avatars";

const WOMEN = new Set(["Amanda Nunes", "Cris Cyborg", "Jessica Andrade", "Joanna Jedrzejczyk", "Kayla Harrison", "Mackenzie Dern", "Ronda Rousey", "Rose Namajunas", "Tatiana Suarez", "Valentina Shevchenko", "Zhang Weili"]);

describe("board faces", () => {
  it("never repeats a face on a board, keeps genders, and locks picked faces", () => {
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRng(`faces:${seed}`);
      let state = startDraftFromPlan(generateDraftPlan(seed));
      const lockedAtPick = new Map<number, string>();
      while (!isDraftComplete(state)) {
        if (state.rerollsRemaining > 0 && rng.next() < 0.2) state = reroll(state);
        const { picked, board } = draftFaces(state.history, state.currentCandidates);
        const cards = state.currentCandidates!;
        expect(new Set(cards.map((c) => board.get(c.id))).size, `seed ${seed}`).toBe(3);
        for (const card of cards) {
          expect(board.get(card.id)!.includes("/w-"), card.name).toBe(WOMEN.has(card.name));
          // A fighter picked earlier and back on the board keeps his face.
          if (isAlreadyUsed(state, card.id)) expect(board.get(card.id)).toBe(picked.get(card.id));
        }
        const choices = cards.filter((c) => !isAlreadyUsed(state, c.id));
        const pick = choices[Math.floor(rng.next() * choices.length)]!;
        lockedAtPick.set(pick.id, board.get(pick.id)!);
        state = selectCandidate(state, pick.id);
      }
      // Every pick keeps the face it had on the board it was picked from.
      const { picked } = draftFaces(state.history, null);
      for (const [id, face] of lockedAtPick) expect(picked.get(id)).toBe(face);
    }
  });

  it("a locked face changes at most one other card on the board", () => {
    let checked = 0;
    for (let i = 0; i + 3 <= DRAFT_POOL.length; i++) {
      const cards = DRAFT_POOL.slice(i, i + 3);
      const plain = boardPortraits(cards);
      for (const face of ["/fighters/m-01.jpg", "/fighters/m-02.jpg", "/fighters/w-01.jpg"]) {
        const target = cards.find((c) => (plain.get(c.id)!.includes("/w-")) === face.includes("/w-"));
        if (!target) continue;
        const withLock = boardPortraits(cards, new Map([[target.id, face]]));
        const changed = cards.filter((c) => c.id !== target.id && withLock.get(c.id) !== plain.get(c.id));
        expect(changed.length).toBeLessThanOrEqual(1);
        expect(new Set(cards.map((c) => withLock.get(c.id))).size).toBe(3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("gives the same board the same faces (refresh, or the other player)", () => {
    const cards = DRAFT_POOL.slice(0, 3);
    expect(boardPortraits(cards)).toEqual(boardPortraits([...cards].reverse()));
  });
});
