import { describe, expect, it } from "vitest";
import { generateDraftPlan } from "@/lib/draft/plan";
import { isAlreadyUsed, isDraftComplete, startDraftFromPlan } from "@/lib/draft/session";
import { applyDraftAction, replayDraft, type RecordedAction } from "./replay";

function playAndRecord(seed: string) {
  const plan = generateDraftPlan(seed);
  let state = startDraftFromPlan(plan);
  const log: RecordedAction[] = [];
  let turn = 0;
  while (!isDraftComplete(state)) {
    const action =
      turn++ % 3 === 1 && state.rerollsRemaining > 0
        ? ({ type: "reroll" } as const)
        : ({ type: "pick", fighterId: state.currentCandidates!.find((f) => !isAlreadyUsed(state, f.id))!.id } as const);
    const result = applyDraftAction(state, action);
    log.push(result.record);
    state = result.state;
  }
  return { plan, state, log };
}

describe("replayDraft", () => {
  it("rebuilds exactly the state the actions produced", () => {
    const { plan, state, log } = playAndRecord("replay");
    const replayed = replayDraft(plan, log);
    expect([...replayed.selections.entries()].map(([a, f]) => [a, f.id])).toEqual(
      [...state.selections.entries()].map(([a, f]) => [a, f.id])
    );
    expect(replayed.rerollsRemaining).toBe(state.rerollsRemaining);
    expect(replayed.history).toEqual(state.history);
  });

  it("rebuilds partial drafts at any point", () => {
    const { plan, log } = playAndRecord("partial");
    for (let n = 0; n <= log.length; n++) {
      expect(() => replayDraft(plan, log.slice(0, n))).not.toThrow();
    }
  });

  it("rejects a log that doesn't fit the plan", () => {
    const { plan, log } = playAndRecord("tamper");
    const tampered = log.map((a, i) => (i === 0 ? { ...a, offer_index: 2 } : a));
    expect(() => replayDraft(plan, tampered)).toThrow(/do not match/);
    const badPick = [{ action_type: "pick", fighter_id: -1, round_index: 0, offer_index: 0 }];
    expect(() => replayDraft(plan, badPick)).toThrow(/not one of the current candidates/);
  });

  it("rejects a pick of an already-used fighter", () => {
    // Find a plan where the first pick comes round again, then try to reuse it.
    for (let seed = 0; seed < 300; seed++) {
      const plan = generateDraftPlan(seed);
      let state = startDraftFromPlan(plan);
      const log: RecordedAction[] = [];
      while (!isDraftComplete(state)) {
        const repeat = state.currentCandidates!.find((f) => isAlreadyUsed(state, f.id));
        if (repeat) {
          expect(() => applyDraftAction(state, { type: "pick", fighterId: repeat.id })).toThrow(/already used/);
          return;
        }
        const result = applyDraftAction(state, { type: "pick", fighterId: state.currentCandidates![0]!.id });
        log.push(result.record);
        state = result.state;
      }
    }
    throw new Error("no repeat found");
  });
});
