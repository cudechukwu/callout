import "server-only";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VisibleAttribute } from "@/lib/data/types";
import { computeYourCalls } from "@/lib/draft/answerSheet";
import { computeOverall } from "@/lib/draft/overall";
import { generateDraftPlan, type DraftPlan } from "@/lib/draft/plan";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { isDraftComplete, toFighterSnapshot, type DraftSessionState } from "@/lib/draft/session";
import { simulateFight } from "@/lib/simulation/engine";
import { createRng } from "@/lib/simulation/rng";
import type { AttributeSelections, FighterSnapshot, FightResult } from "@/lib/simulation/types";
import type { Database } from "@/lib/supabase/database.types";
import { ENGINE_VERSION, POOL_VERSION, RATINGS_VERSION } from "@/lib/versions";
import { applyDraftAction, replayDraft, type DraftActionInput } from "./replay";
import {
  DISPLAY_NAME_MAX,
  type BuildSummary,
  type DraftView,
  type InviteStatus,
  type Picks,
  type RevealView,
  type RivalryView,
} from "./types";

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

export interface Caller {
  readonly id: string;
  /** A guest (anonymous) session rather than a real account. */
  readonly guest: boolean;
}

/** The caller, from the access token their browser sends. */
export async function requireUser(request: Request): Promise<Caller> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) throw new MpError(401, "unauthenticated", "Sign in first");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new MpError(401, "unauthenticated", "Session expired");
  return { id: data.user.id, guest: Boolean(data.user.is_anonymous) };
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

/** Sending a challenge needs an account; accepting one only needs a name. */
export async function createSeries(caller: Caller, rawName: unknown) {
  if (caller.guest) throw new MpError(403, "account_required", "Create an account to send a challenge");
  const userId = caller.id;
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
  me: { name: string; seat: number; avatarKey: string | null };
  opponent: { userId: string; name: string; avatarKey: string | null } | null;
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
  const profiles = check(
    await admin().from("profiles").select("id, avatar_key").in("id", participants.map((p) => p.user_id))
  );
  const avatarOf = (id: string) => profiles.find((p) => p.id === id)?.avatar_key ?? null;

  return {
    seriesId: round.series_id,
    inviteToken: series.invite_token,
    status: round.status as DraftView["roundStatus"],
    plan,
    me: { name: mine.display_name, seat: mine.seat, avatarKey: avatarOf(userId) },
    opponent: other ? { userId: other.user_id, name: other.display_name, avatarKey: avatarOf(other.user_id) } : null,
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
          avatarKey: opponent.avatarKey,
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
    reveal: loaded.status === "revealed" && opponent ? await loadReveal(roundId, userId, opponent.userId) : null,
    rivalry: await loadRivalry(loaded.seriesId, userId),
  };
}

export async function getView(userId: string, roundId: unknown): Promise<DraftView> {
  let loaded = await loadRound(userId, roundId);
  if (await ensureRevealAndFight(roundId as string, loaded)) loaded = await loadRound(userId, roundId);
  return toView(userId, roundId as string, loaded);
}

type StoredPicks = { picks: Record<string, number> };

function picksOf(snapshot: unknown): Picks {
  const picks = (snapshot as StoredPicks | null)?.picks ?? {};
  return Object.entries(picks).map(([attribute, fighterId]) => ({
    attribute: attribute as VisibleAttribute,
    fighterId,
  }));
}

const POOL_BY_ID = new Map(DRAFT_POOL.map((f) => [f.id, f]));

function fighterFromPicks(id: string, name: string, picks: Picks): FighterSnapshot {
  const selections = Object.fromEntries(
    picks.map((p) => [p.attribute, { sourceFighter: POOL_BY_ID.get(p.fighterId)! }])
  ) as unknown as AttributeSelections;
  return { id, name, selections };
}

/**
 * Once both players are locked: reveal the round and resolve Fight 1.
 * Safe to call from any request, any number of times: the status change is
 * conditional, and the series-wide fight number is unique, so however many
 * requests race here, exactly one fight is stored. Returns true if it
 * changed anything.
 */
async function ensureRevealAndFight(roundId: string, loaded: LoadedRound): Promise<boolean> {
  const lockedCount = [...loaded.lockedAt.values()].filter(Boolean).length;
  if (loaded.status === "drafting" && (!loaded.opponent || lockedCount < 2)) return false;
  if (loaded.status === "abandoned") return false;

  let changed = false;
  if (loaded.status === "drafting") {
    await admin()
      .from("draft_rounds")
      .update({ status: "revealed", revealed_at: new Date().toISOString() })
      .eq("id", roundId)
      .eq("status", "drafting");
    changed = true;
  }

  const existing = check(await admin().from("fights").select("id").eq("draft_round_id", roundId).limit(1));
  if (existing.length > 0) return changed;

  await createFight(loaded.seriesId, roundId);
  return true;
}

/**
 * Resolves a new fight between the two builds of a draft round and stores
 * it. The series-wide fight number is unique, so if two requests race,
 * one insert fails and exactly one fight exists.
 */
async function createFight(seriesId: string, roundId: string): Promise<void> {
  const players = check(
    await admin().from("series_participants").select("user_id, seat, display_name").eq("series_id", seriesId).order("seat")
  );
  const builds = check(
    await admin().from("draft_builds").select("user_id, build_snapshot").eq("draft_round_id", roundId)
  );
  const [red, white] = players.map((p) =>
    fighterFromPicks(p.user_id, p.display_name, picksOf(builds.find((b) => b.user_id === p.user_id)?.build_snapshot))
  );
  if (!red || !white) throw new Error("Both builds are needed for a fight");

  const { count } = await admin()
    .from("fights")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId);
  const seed = randomBytes(4).readUInt32BE() % 2 ** 31;
  const result = simulateFight(red, white, createRng(seed));
  const inserted = await admin().from("fights").insert({
    series_id: seriesId,
    draft_round_id: roundId,
    fight_number: (count ?? 0) + 1,
    fight_seed: String(seed),
    engine_version: ENGINE_VERSION,
    winner_user_id: result.winnerId,
    method: result.method,
    finish_round: result.round,
    finish_time: Math.round(result.roundTimeSeconds),
    result_json: result as never,
  });
  if (inserted.error && inserted.error.code !== UNIQUE_VIOLATION) throw inserted.error;
}

async function loadReveal(roundId: string, userId: string, opponentId: string): Promise<RevealView> {
  const builds = check(
    await admin()
      .from("draft_builds")
      .select("user_id, build_snapshot, actual_ovr, best_seen_ovr")
      .eq("draft_round_id", roundId)
  );
  const summary = (id: string): BuildSummary | null => {
    const build = builds.find((b) => b.user_id === id);
    return build?.actual_ovr != null && build.best_seen_ovr != null
      ? { overall: build.actual_ovr, bestSeen: build.best_seen_ovr }
      : null;
  };
  // The newest fight of this round: after Run it back, that's the rematch.
  const fight = maybe(
    await admin()
      .from("fights")
      .select("id, fight_number, result_json")
      .eq("draft_round_id", roundId)
      .order("fight_number", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  return {
    myUserId: userId,
    opponentUserId: opponentId,
    opponentPicks: picksOf(builds.find((b) => b.user_id === opponentId)?.build_snapshot),
    me: summary(userId),
    opponent: summary(opponentId),
    fight: fight ? { id: fight.id, number: fight.fight_number, result: fight.result_json as unknown as FightResult } : null,
  };
}

async function loadRivalry(seriesId: string, userId: string): Promise<RivalryView> {
  const fights = check(
    await admin().from("fights").select("id, winner_user_id, fight_number").eq("series_id", seriesId).order("fight_number")
  );
  const latestFight = fights[fights.length - 1];
  const pending = maybe(
    await admin()
      .from("series_requests")
      .select("id, kind, requested_by, after_fight_id")
      .eq("series_id", seriesId)
      .eq("status", "pending")
      .maybeSingle()
  );
  const current = pending && pending.after_fight_id === latestFight?.id ? pending : null;
  return {
    wins: fights.filter((f) => f.winner_user_id === userId).length,
    losses: fights.filter((f) => f.winner_user_id && f.winner_user_id !== userId).length,
    fights: fights.length,
    pending: current
      ? { id: current.id, kind: current.kind as "run_it_back" | "redraft", mine: current.requested_by === userId }
      : null,
    latestRoundId: await latestRoundId(seriesId),
  };
}

/**
 * Asks for another fight (same builds) or a redraft (new cards). Needs the
 * other player's consent, except that if they already asked for the same
 * thing, asking back is agreeing. One pending request per series (a unique
 * index), and it names the fight it follows, so a stale request can never
 * be accepted after the series moved on.
 */
export async function requestRivalry(userId: string, roundId: unknown, rawKind: unknown): Promise<DraftView> {
  if (rawKind !== "run_it_back" && rawKind !== "redraft") throw new MpError(400, "bad_kind", "Unknown request");
  const loaded = await loadRound(userId, roundId);
  const id = roundId as string;
  const rivalry = await loadRivalry(loaded.seriesId, userId);
  if (rivalry.latestRoundId !== id || loaded.status !== "revealed") {
    throw new MpError(409, "moved_on", "This challenge has moved on");
  }
  const latestFight = maybe(
    await admin()
      .from("fights")
      .select("id")
      .eq("series_id", loaded.seriesId)
      .order("fight_number", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  if (!latestFight) throw new MpError(409, "no_fight", "Fight first");

  // Clear out a request left over from an earlier fight.
  await admin()
    .from("series_requests")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("series_id", loaded.seriesId)
    .eq("status", "pending")
    .neq("after_fight_id", latestFight.id);

  const pending = rivalry.pending;
  if (pending) {
    if (pending.mine) return getView(userId, id);
    if (pending.kind === rawKind) return respondRivalry(userId, id, pending.id, true);
    throw new MpError(409, "other_pending", "Answer their request first");
  }

  const inserted = await admin().from("series_requests").insert({
    series_id: loaded.seriesId,
    kind: rawKind,
    after_fight_id: latestFight.id,
    requested_by: userId,
  });
  if (inserted.error?.code === UNIQUE_VIOLATION) {
    // They asked at the same moment. Same thing: that's agreement.
    const theirs = (await loadRivalry(loaded.seriesId, userId)).pending;
    if (theirs && !theirs.mine && theirs.kind === rawKind) return respondRivalry(userId, id, theirs.id, true);
    return getView(userId, id);
  }
  check(inserted);
  return getView(userId, id);
}

/**
 * Accepts or declines the other player's request, or withdraws your own.
 * Only one call can move a request out of "pending" (conditional update),
 * so a double accept still makes one fight or one new draft.
 */
export async function respondRivalry(userId: string, roundId: unknown, requestId: unknown, accept: unknown): Promise<DraftView> {
  if (typeof requestId !== "string") throw new MpError(400, "bad_request", "Missing request");
  const loaded = await loadRound(userId, roundId);
  const id = roundId as string;
  const request = maybe(
    await admin()
      .from("series_requests")
      .select("id, kind, requested_by, status")
      .eq("id", requestId)
      .eq("series_id", loaded.seriesId)
      .maybeSingle()
  );
  if (!request || request.status !== "pending") return getView(userId, id);
  const mine = request.requested_by === userId;
  const accepting = accept === true && !mine;

  const moved = check(
    await admin()
      .from("series_requests")
      .update({ status: accepting ? "accepted" : "declined", resolved_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
  );
  if (moved.length === 0 || !accepting) return getView(userId, id);

  if (request.kind === "run_it_back") {
    await createFight(loaded.seriesId, id);
  } else {
    const players = check(await admin().from("series_participants").select("user_id").eq("series_id", loaded.seriesId));
    const rounds = check(await admin().from("draft_rounds").select("round_number").eq("series_id", loaded.seriesId));
    const next = Math.max(...rounds.map((r) => r.round_number)) + 1;
    const created = await createDraftRoundSafely(loaded.seriesId, next, players.map((p) => p.user_id));
    if (created) return getView(userId, created);
  }
  return getView(userId, id);
}

/** Creates the next draft round unless a racing request already did. */
async function createDraftRoundSafely(seriesId: string, roundNumber: number, userIds: string[]): Promise<string | null> {
  try {
    return await createDraftRound(seriesId, roundNumber, userIds);
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) return null;
    throw error;
  }
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
  if (loaded.lockedAt.get(userId)) return getView(userId, id);
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
