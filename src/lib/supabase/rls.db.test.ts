import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDraftPlan } from "@/lib/draft/plan";

/**
 * Row-level security and constraint tests (MULTIPLAYER_DESIGN.md §10, §15).
 * Runs against a real Supabase project: `npm run test:db`. It creates
 * throwaway users, and deleting them at the end cascades to every row the
 * test made.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;

const TABLES = [
  "series",
  "series_participants",
  "draft_rounds",
  "draft_participants",
  "draft_builds",
  "draft_actions",
  "fights",
  "series_requests",
] as const;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, noSession);
const createdUsers: string[] = [];

async function signedInUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `rls-test-${label}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = createClient(URL, PUBLISHABLE, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

/** Rows the caller can see; a permission error counts as seeing nothing. */
async function visibleRows(client: SupabaseClient, table: string, columns: string, match: Record<string, unknown>) {
  const { data, error } = await client.from(table).select(columns).match(match);
  return error ? [] : (data ?? []);
}

let alice: Awaited<ReturnType<typeof signedInUser>>;
let bob: Awaited<ReturnType<typeof signedInUser>>;
let carol: Awaited<ReturnType<typeof signedInUser>>;
const seriesId = randomUUID();
const roundId = randomUUID();

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

beforeAll(async () => {
  if (!URL || !PUBLISHABLE || !SECRET) throw new Error("Supabase env vars missing (.env.local)");
  [alice, bob, carol] = await Promise.all([signedInUser("alice"), signedInUser("bob"), signedInUser("carol")]);

  const plan = generateDraftPlan("rls-test");
  await must(admin.from("series").insert({ id: seriesId, invite_token: randomBytes(16).toString("base64url"), created_by: alice.id, status: "active" }));
  await must(admin.from("series_participants").insert([
    { series_id: seriesId, user_id: alice.id, seat: 1, display_name: "Alice" },
    { series_id: seriesId, user_id: bob.id, seat: 2, display_name: "Bob" },
  ]));
  await must(admin.from("draft_rounds").insert({
    id: roundId, series_id: seriesId, round_number: 1, draft_seed: plan.seed, draft_plan: plan,
    draft_version: plan.draftVersion, pool_version: 1, ratings_version: 1, engine_version: "0.1",
  }));
  await must(admin.from("draft_participants").insert([
    { draft_round_id: roundId, user_id: alice.id, progress: 1 },
    { draft_round_id: roundId, user_id: bob.id, progress: 1 },
  ]));
  await must(admin.from("draft_builds").insert([
    { draft_round_id: roundId, user_id: alice.id, rerolls_left: 2 },
    { draft_round_id: roundId, user_id: bob.id, rerolls_left: 1 },
  ]));
  const [aliceCard, bobCard] = [plan.rounds[0]!.offers[0]![0], plan.rounds[0]!.offers[1]![0]];
  await must(admin.from("draft_actions").insert([
    { draft_round_id: roundId, user_id: alice.id, sequence: 1, action_type: "pick", round_index: 0, offer_index: 0, fighter_id: aliceCard },
    { draft_round_id: roundId, user_id: bob.id, sequence: 1, action_type: "reroll", round_index: 0, offer_index: 0 },
    { draft_round_id: roundId, user_id: bob.id, sequence: 2, action_type: "pick", round_index: 0, offer_index: 1, fighter_id: bobCard },
  ]));
}, 60_000);

afterAll(async () => {
  // Deleting the users cascades to every row created above.
  await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
}, 60_000);

describe("before the reveal", () => {
  it("a participant sees the series, both players and both progress counts", async () => {
    expect(await visibleRows(alice.client, "series", "id,status", { id: seriesId })).toHaveLength(1);
    expect(await visibleRows(alice.client, "series_participants", "user_id", { series_id: seriesId })).toHaveLength(2);
    expect(await visibleRows(alice.client, "draft_participants", "user_id,progress", { draft_round_id: roundId })).toHaveLength(2);
    expect(await visibleRows(alice.client, "draft_rounds", "id,status", { id: roundId })).toHaveLength(1);
  });

  it("a participant sees only their own build and actions", async () => {
    const builds = await visibleRows(alice.client, "draft_builds", "user_id", { draft_round_id: roundId });
    expect(builds).toEqual([{ user_id: alice.id }]);
    const actions = (await visibleRows(bob.client, "draft_actions", "user_id", { draft_round_id: roundId })) as unknown as { user_id: string }[];
    expect(actions.length).toBe(2);
    expect(actions.every((a) => a.user_id === bob.id)).toBe(true);
  });

  it("the seed, plan and invite token are never selectable", async () => {
    for (const columns of ["draft_seed", "draft_plan", "*"]) {
      const { error } = await alice.client.from("draft_rounds").select(columns).eq("id", roundId);
      expect(error, `draft_rounds.${columns}`).not.toBeNull();
    }
    const { error } = await alice.client.from("series").select("invite_token").eq("id", seriesId);
    expect(error).not.toBeNull();
  });

  it("an outsider sees nothing", async () => {
    for (const table of TABLES) {
      const { data } = await carol.client.from(table).select(table === "series" ? "id" : table === "draft_rounds" ? "id" : "*");
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("a request with no session sees nothing", async () => {
    const nobody = createClient(URL, PUBLISHABLE, noSession);
    for (const table of TABLES) {
      const { data } = await nobody.from(table).select("*");
      expect(data ?? [], table).toEqual([]);
    }
  });
});

describe("clients can never write", () => {
  it("rejects inserts, updates and deletes on every table", async () => {
    const attempts = [
      alice.client.from("series").insert({ invite_token: "x", created_by: alice.id }),
      alice.client.from("series").update({ status: "closed" }).eq("id", seriesId).select("id"),
      alice.client.from("series_participants").update({ display_name: "Hacker" }).eq("user_id", bob.id).select("user_id"),
      alice.client.from("draft_rounds").update({ status: "revealed" }).eq("id", roundId).select("id"),
      alice.client.from("draft_participants").update({ progress: 8 }).eq("user_id", alice.id).select("user_id"),
      alice.client.from("draft_builds").update({ rerolls_left: 2 }).eq("user_id", alice.id).select("user_id"),
      alice.client.from("draft_actions").insert({ draft_round_id: roundId, user_id: alice.id, sequence: 9, action_type: "reroll", round_index: 1, offer_index: 1 }),
      alice.client.from("draft_actions").delete().eq("user_id", alice.id).select("id"),
      alice.client.from("fights").insert({ series_id: seriesId, draft_round_id: roundId, fight_number: 1, fight_seed: "x", engine_version: "x", method: "KO", finish_round: 1, finish_time: 1, result_json: {}, winner_user_id: alice.id }),
      alice.client.from("series_requests").delete().eq("series_id", seriesId).select("id"),
    ];
    for (const [i, attempt] of attempts.entries()) {
      const { data, error } = await attempt;
      const changed = Array.isArray(data) ? data.length : data ? 1 : 0;
      expect(error !== null || changed === 0, `attempt ${i} went through`).toBe(true);
    }
    // And nothing actually changed.
    const progress = await must<{ progress: number }>(admin.from("draft_participants").select("progress").eq("user_id", alice.id).single());
    expect(progress.progress).toBe(1);
    const round = await must<{ status: string }>(admin.from("draft_rounds").select("status").eq("id", roundId).single());
    expect(round.status).toBe("drafting");
  });
});

describe("database constraints", () => {
  it("allows only one pick per player per round", async () => {
    const { error } = await admin.from("draft_actions").insert({
      draft_round_id: roundId, user_id: alice.id, sequence: 2, action_type: "pick", round_index: 0, offer_index: 0, fighter_id: 1,
    });
    expect(error?.code).toBe("23505");
  });

  it("allows only one pending rivalry request per series, and series-wide fight numbers", async () => {
    const fight = { series_id: seriesId, draft_round_id: roundId, fight_seed: "f", engine_version: "0.1", method: "DEC", finish_round: 3, finish_time: 300, result_json: {} };
    const [first] = await must(admin.from("fights").insert({ ...fight, fight_number: 1 }).select("id"));
    const duplicate = await admin.from("fights").insert({ ...fight, fight_number: 1 });
    expect(duplicate.error?.code).toBe("23505");

    await must(admin.from("series_requests").insert({ series_id: seriesId, kind: "run_it_back", after_fight_id: first!.id, requested_by: alice.id }));
    const second = await admin.from("series_requests").insert({ series_id: seriesId, kind: "redraft", after_fight_id: first!.id, requested_by: bob.id });
    expect(second.error?.code).toBe("23505");
  });
});

describe("after the reveal", () => {
  beforeAll(async () => {
    await must(admin.from("draft_rounds").update({ status: "revealed", revealed_at: new Date().toISOString() }).eq("id", roundId));
  });

  it("both players see both builds and both action logs", async () => {
    expect(await visibleRows(alice.client, "draft_builds", "user_id", { draft_round_id: roundId })).toHaveLength(2);
    expect(await visibleRows(alice.client, "draft_actions", "id", { draft_round_id: roundId })).toHaveLength(3);
  });

  it("the seed and plan stay server-only", async () => {
    const { error } = await alice.client.from("draft_rounds").select("draft_plan").eq("id", roundId);
    expect(error).not.toBeNull();
  });

  it("an outsider still sees nothing", async () => {
    expect(await visibleRows(carol.client, "draft_builds", "user_id", { draft_round_id: roundId })).toEqual([]);
    expect(await visibleRows(carol.client, "fights", "id", { series_id: seriesId })).toEqual([]);
  });
});

describe("profiles", () => {
  it("a player creates and edits only their own profile, only name and picture", async () => {
    expect((await alice.client.from("profiles").insert({ id: alice.id, display_name: "Alice", avatar_key: "pfp-01" })).error).toBeNull();
    expect((await bob.client.from("profiles").insert({ id: alice.id, display_name: "Fake" })).error).not.toBeNull();
    expect((await bob.client.from("profiles").insert({ id: bob.id, display_name: "Bob" })).error).toBeNull();

    const hijack = await bob.client.from("profiles").update({ display_name: "Hacked" }).eq("id", alice.id).select("id");
    expect(hijack.data ?? []).toEqual([]);
    const created = await alice.client.from("profiles").update({ created_at: "2000-01-01" } as never).eq("id", alice.id);
    expect(created.error).not.toBeNull();
    expect((await alice.client.from("profiles").update({ avatar_key: "pfp-02" }).eq("id", alice.id)).error).toBeNull();
    expect((await alice.client.from("profiles").update({ avatar_key: "../../etc" }).eq("id", alice.id)).error).not.toBeNull();
    expect((await alice.client.from("profiles").delete().eq("id", alice.id).select("id")).data ?? []).toEqual([]);
  });

  it("signed-in players can read profiles; signed-out visitors cannot", async () => {
    const { data } = await carol.client.from("profiles").select("display_name, avatar_key").eq("id", alice.id).single();
    expect(data).toEqual({ display_name: "Alice", avatar_key: "pfp-02" });
    const nobody = createClient(URL, PUBLISHABLE, noSession);
    expect((await nobody.from("profiles").select("id")).data ?? []).toEqual([]);
  });
});

describe("guests", () => {
  it("anonymous sign-in is enabled", async () => {
    const guest = createClient(URL, PUBLISHABLE, noSession);
    const { data, error } = await guest.auth.signInAnonymously();
    expect(error).toBeNull();
    createdUsers.push(data.user!.id);
    expect(data.user!.is_anonymous).toBe(true);
  });
});
