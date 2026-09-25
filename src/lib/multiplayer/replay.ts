import type { SourceFighter } from "@/lib/data/types";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import type { DraftPlan } from "@/lib/draft/plan";
import { reroll, selectCandidate, startDraftFromPlan, type DraftSessionState } from "@/lib/draft/session";

/**
 * A multiplayer draft is its plan plus the player's action log. The server
 * never trusts a stored "current state": it replays the log through the
 * same session code single-player uses, so an illegal action fails here
 * exactly as it would in single-player.
 */
export type DraftActionInput = { type: "reroll" } | { type: "pick"; fighterId: number };

export interface RecordedAction {
  readonly action_type: string;
  readonly fighter_id: number | null;
  readonly round_index: number;
  readonly offer_index: number;
}

/** Applies one action, returning the new state and the row to record. */
export function applyDraftAction(
  state: DraftSessionState,
  action: DraftActionInput,
  pool: readonly SourceFighter[] = DRAFT_POOL
): { state: DraftSessionState; record: RecordedAction } {
  const record = {
    action_type: action.type,
    fighter_id: action.type === "pick" ? action.fighterId : null,
    round_index: state.roundIndex,
    offer_index: state.offerIndex,
  };
  const next = action.type === "pick" ? selectCandidate(state, action.fighterId, pool) : reroll(state, pool);
  return { state: next, record };
}

/** Rebuilds a player's draft from the plan and their actions, in sequence order. */
export function replayDraft(
  plan: DraftPlan,
  actions: readonly RecordedAction[],
  pool: readonly SourceFighter[] = DRAFT_POOL
): DraftSessionState {
  let state = startDraftFromPlan(plan, pool);
  for (const stored of actions) {
    const action: DraftActionInput =
      stored.action_type === "pick" ? { type: "pick", fighterId: stored.fighter_id! } : { type: "reroll" };
    const { state: next, record } = applyDraftAction(state, action, pool);
    if (record.round_index !== stored.round_index || record.offer_index !== stored.offer_index) {
      throw new Error("Stored draft actions do not match the plan");
    }
    state = next;
  }
  return state;
}
