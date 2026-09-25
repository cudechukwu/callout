import "server-only";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VisibleAttribute } from "@/lib/data/types";
import { computeYourCalls } from "@/lib/draft/answerSheet";
import { computeOverall } from "@/lib/draft/overall";
import { generateDraftPlan, type DraftPlan } from "@/lib/draft/plan";
import { isDraftComplete, toFighterSnapshot, type DraftSessionState } from "@/lib/draft/session";
import type { Database } from "@/lib/supabase/database.types";
import { ENGINE_VERSION, POOL_VERSION, RATINGS_VERSION } from "@/lib/versions";
import { applyDraftAction, replayDraft, type DraftActionInput } from "./replay";
import { DISPLAY_NAME_MAX, type DraftView, type InviteStatus } from "./types";

/**
 * Server commands for friend challenges (MULTIPLAYER_DESIGN.md > Server
 * commands). Every write happens here, with the secret key; players can
 * only read, and only what row-level security allows.
 *
 * There are no multi-statement transactions over the API, so every command
 * is written to be safe under races and retries: unique constraints decide
 * who wins (seat 2, action sequence numbers), and a player's draft is
 * always rebuilt from their action log rather than trusted from a cache.
 */

export class MpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Admin = SupabaseClient<Database>;
let adminClient: Admin | null = null;

function admin(): Admin {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
    adminClient = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

const UNIQUE_VIOLATION = "23505";

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** The row(s) a query returned; throws on a database error. */
function check<R extends Result>(result: R): NonNullable<R["data"]> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R["data"]>;
}

/** Like check, for queries that may legitimately find nothing. */
function maybe<R extends Result>(result: R): NonNullable<R["data"]> | null {
  if (result.error) throw result.error;
  return (result.data ?? null) as NonNullable<R["data"]> | null;
}

/** The caller's user id, from the access token their browser sends. */
export async function requireUserId(request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) throw new MpError(401, "unauthenticated", "Sign in first");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new MpError(401, "unauthenticated", "Session expired");
  return data.user.id;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX) {
    throw new MpError(400, "bad_name", `Names are 1-${DISPLAY_NAME_MAX} characters`);
  }
  return name;
}

async function createDraftRound(seriesId: string, roundNumber: number, userIds: readonly string[]) {
  const seed = randomBytes(12).toString("hex");
  const plan = generateDraftPlan(seed);
  const round = check(
    await admin()
      .from("draft_rounds")
      .insert({
        series_id: seriesId,
        round_number: roundNumber,
        draft_seed: seed,
        draft_plan: plan as never,
        draft_version: plan.draftVersion,
        pool_version: POOL_VERSION,
        ratings_version: RATINGS_VERSION,
        engine_version: ENGINE_VERSION,
      })
      .select("id")
      .single()
  );
  for (const userId of userIds) await addDrafter(round.id, userId);
  return round.id;
}

async function addDrafter(roundId: string, userId: string) {
  check(await admin().from("draft_participants").upsert({ draft_round_id: roundId, user_id: userId }, { ignoreDuplicates: true }));
  check(await admin().from("draft_builds").upsert({ draft_round_id: roundId, user_id: userId }, { ignoreDuplicates: true }));
}

export async function createSeries(userId: string, rawName: unknown) {
  const name = cleanName(rawName);
  const inviteToken = randomBytes(16).toString("base64url");
  const series = check(
    await admin().from("series").insert({ invite_token: inviteToken, created_by: userId }).select("id").single()
  );
  try {
    check(await admin().from("series_participants").insert({ series_id: series.id, user_id: userId, seat: 1, display_name: name }));
    const roundId = await createDraftRound(series.id, 1, [userId]);
    return { inviteToken, roundId };
  } catch (error) {
    await admin().from("series").delete().eq("id", series.id);
    throw error;
  }
}

async function latestRoundId(seriesId: string): Promise<string> {
  const round = check(
    await admin()
      .from("draft_rounds")
      .select("id")
      .eq("series_id", seriesId)
      .order("round_number", { ascending: false })
      .limit(1)
      .single()
  );
  return round.id;
}

export async function lookupInvite(userId: string, token: unknown): Promise<InviteStatus> {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) return { status: "not_found" };
  const series = maybe(
    await admin().from("series").select("id, expires_at").eq("invite_token", token).maybeSingle()
  );
  if (!series) return { status: "not_found" };
  const participants = check(
    await admin().from("series_participants").select("user_id, seat, display_name").eq("series_id", series.id)
  );
  if (participants.some((p) => p.user_id === userId)) {
    return { status: "participant", roundId: await latestRoundId(series.id) };
  }
  if (new Date(series.expires_at).getTime() < Date.now()) return { status: "expired" };
  if (participants.length >= 2) return { status: "full" };
  const challenger = participants.find((p) => p.seat === 1);
  return { status: "open", challengerName: challenger?.display_name ?? "Your friend" };
}

export async function joinSeries(userId: string, token: unknown, rawName: unknown): Promise<{ roundId: string }> {
  const invite = await lookupInvite(userId, token);
  if (invite.status === "participant") return { roundId: invite.roundId };
  if (invite.status !== "open") throw new MpError(409, invite.status, "This challenge can't be joined");
  const name = cleanName(rawName);

  const series = check(await admin().from("series").select("id").eq("invite_token", token as string).single());
  const joined = await admin()
    .from("series_participants")
    .insert({ series_id: series.id, user_id: userId, seat: 2, display_name: name });
  if (joined.error?.code === UNIQUE_VIOLATION) throw new MpError(409, "full", "This challenge is full");
  check(joined);
  check(await admin().from("series").update({ status: "active" }).eq("id", series.id));

  const roundId = await latestRoundId(series.id);
  await addDrafter(roundId, userId);
  return { roundId };
}

interface LoadedRound {
  seriesId: string;
  inviteToken: string;
  status: DraftView["roundStatus"];
  plan: DraftPlan;
  me: { name: string; seat: number };
  opponent: { userId: string; name: string } | null;
  actionCount: number;
  state: DraftSessionState;
  lockedAt: Map<string, string | null>;
}

async function loadRound(userId: string, roundId: unknown): Promise<LoadedRound> {
  if (typeof roundId !== "string") throw new MpError(400, "bad_round", "Missing round");
  const round = maybe(
    await admin()
      .from("draft_rounds")
      .select("series_id, status, draft_plan, series(invite_token)")
      .eq("id", roundId)
      .maybeSingle()
  );
  if (!round) throw new MpError(404, "not_found", "No such draft");
  const participants = check(
    await admin().from("series_participants").select("user_id, seat, display_name").eq("series_id", round.series_id)
  );
  const mine = participants.find((p) => p.user_id === userId);
  if (!mine) throw new MpError(403, "not_participant", "Not your draft");
  const other = participants.find((p) => p.user_id !== userId);

  const actions = check(
    await admin()
      .from("draft_actions")
      .select("action_type, fighter_id, round_index, offer_index")
      .eq("draft_round_id", roundId)
      .eq("user_id", userId)
      .order("sequence")
  );
  const drafters = check(
    await admin().from("draft_participants").select("user_id, locked_at").eq("draft_round_id", roundId)
  );
  const plan = round.draft_plan as unknown as DraftPlan;
  const series = round.series as unknown as { invite_token: string };

  return {
    seriesId: round.series_id,
    inviteToken: series.invite_token,
    status: round.status as DraftView["roundStatus"],
    plan,
    me: { name: mine.display_name, seat: mine.seat },
    opponent: other ? { userId: other.user_id, name: other.display_name } : null,
    actionCount: actions.length,
    state: replayDraft(plan, actions),
    lockedAt: new Map(drafters.map((d) => [d.user_id, d.locked_at])),
  };
}

async function opponentProgress(roundId: string, opponentId: string): Promise<number> {
  const { count } = await admin()
    .from("draft_actions")
    .select("id", { count: "exact", head: true })
    .eq("draft_round_id", roundId)
    .eq("user_id", opponentId)
    .eq("action_type", "pick");
  return count ?? 0;
}

async function toView(userId: string, roundId: string, loaded: LoadedRound): Promise<DraftView> {
  const { state, opponent } = loaded;
  return {
    seriesId: loaded.seriesId,
    roundId,
    inviteToken: loaded.inviteToken,
    me: loaded.me,
    opponent: opponent
      ? {
          name: opponent.name,
          progress: await opponentProgress(roundId, opponent.userId),
          locked: Boolean(loaded.lockedAt.get(opponent.userId)),
        }
      : null,
    attributeOrder: state.attributeOrder,
    roundIndex: state.roundIndex,
    offerIndex: state.offerIndex,
    offer: state.currentCandidates
      ? (state.currentCandidates.map((f) => f.id) as unknown as [number, number, number])
      : null,
    picks: [...state.selections.entries()].map(([attribute, fighter]) => ({
      attribute: attribute as VisibleAttribute,
      fighterId: fighter.id,
    })),
    rerollsLeft: state.rerollsRemaining,
    sequence: loaded.actionCount,
    locked: Boolean(loaded.lockedAt.get(userId)),
    roundStatus: loaded.status,
  };
}

export async function getView(userId: string, roundId: unknown): Promise<DraftView> {
  const loaded = await loadRound(userId, roundId);
  return toView(userId, roundId as string, loaded);
}

function parseAction(raw: unknown): DraftActionInput {
  const body = raw as { type?: unknown; fighterId?: unknown } | null;
  if (body?.type === "reroll") return { type: "reroll" };
  if (body?.type === "pick" && Number.isInteger(body.fighterId)) return { type: "pick", fighterId: body.fighterId as number };
  throw new MpError(400, "bad_action", "Unknown action");
}

/**
 * Records one reroll or pick. `sequence` is the number the client expects
 * this action to be (its last seen count + 1): a retried request is
 * recognised and answered with the current view, a stale one is refused.
 */
export async function act(userId: string, roundId: unknown, sequence: unknown, rawAction: unknown): Promise<DraftView> {
  const action = parseAction(rawAction);
  if (!Number.isInteger(sequence) || (sequence as number) < 1) throw new MpError(400, "bad_sequence", "Missing sequence");
  const loaded = await loadRound(userId, roundId);
  const id = roundId as string;

  if (loaded.status !== "drafting") throw new MpError(409, "round_closed", "This draft is over");
  if (loaded.lockedAt.get(userId)) throw new MpError(409, "locked", "Your fighter is locked in");

  const seq = sequence as number;
  if (seq <= loaded.actionCount) {
    // Most likely a retry of something already recorded: answer with the truth.
    return toView(userId, id, loaded);
  }
  if (seq !== loaded.actionCount + 1) throw new MpError(409, "stale", "Out of sync");

  let applied: ReturnType<typeof applyDraftAction>;
  try {
    applied = applyDraftAction(loaded.state, action);
  } catch (error) {
    throw new MpError(400, "illegal_action", error instanceof Error ? error.message : "Not allowed");
  }

  const inserted = await admin()
    .from("draft_actions")
    .insert({ draft_round_id: id, user_id: userId, sequence: seq, ...applied.record });
  if (inserted.error?.code === UNIQUE_VIOLATION) {
    return getView(userId, id); // a concurrent request got there first
  }
  check(inserted);

  // Caches for realtime and quick reads; the action log stays the truth.
  await admin()
    .from("draft_participants")
    .update({ progress: applied.state.roundIndex })
    .eq("draft_round_id", id)
    .eq("user_id", userId);
  await admin()
    .from("draft_builds")
    .update({ rerolls_left: applied.state.rerollsRemaining, offer_index: applied.state.offerIndex })
    .eq("draft_round_id", id)
    .eq("user_id", userId);

  return getView(userId, id);
}

/** Locks the player's eight picks. Final; safe to repeat. */
export async function lock(userId: string, roundId: unknown): Promise<DraftView> {
  const loaded = await loadRound(userId, roundId);
  const id = roundId as string;
  if (loaded.lockedAt.get(userId)) return toView(userId, id, loaded);
  if (loaded.status !== "drafting") throw new MpError(409, "round_closed", "This draft is over");
  if (!isDraftComplete(loaded.state)) throw new MpError(400, "incomplete", "Make all eight picks first");

  const snapshot = toFighterSnapshot(loaded.state, userId, loaded.me.name);
  const overall = computeOverall(snapshot.selections);
  const calls = computeYourCalls(loaded.state.history);
  check(
    await admin()
      .from("draft_builds")
      .update({
        actual_ovr: overall,
        best_seen_ovr: overall + (calls?.leftOnTable ?? 0),
        build_snapshot: {
          ratingsVersion: RATINGS_VERSION,
          picks: Object.fromEntries([...loaded.state.selections].map(([attribute, f]) => [attribute, f.id])),
        },
      })
      .eq("draft_round_id", id)
      .eq("user_id", userId)
  );
  check(
    await admin()
      .from("draft_participants")
      .update({ locked_at: new Date().toISOString(), progress: 8 })
      .eq("draft_round_id", id)
      .eq("user_id", userId)
      .is("locked_at", null)
  );
  return getView(userId, id);
}
