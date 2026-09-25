# Multiplayer MVP: friend challenges (same cards, hidden picks)

**Status:** proposed, not built. Nothing here changes the simulation engine, OVR, drafting odds, or balance (all frozen for playtesting).
**Revision:** v2, after an independent review. See [§17 What changed and why](#17-what-changed-and-why).
**Decisions still open:** [§18](#18-open-decisions).

---

## 1. Product goal

Given the same MMA choices, who builds the better fighter?

Two people draft a fighter from **identical cards** without seeing each other's picks. When both lock in, the game reveals both fighters and resolves **one** authoritative fight. Then they can compare drafts, run it back, or redraft. Because both players get the same options, the result is a test of MMA judgment, not luck: *"we saw the exact same choices, how did you build a 92 and I built an 84?"*

It is **asynchronous by default** (nobody needs to be online at the same moment) and feels live when both players happen to be present. It is not built as a traditional realtime game server: drafting is discrete actions plus a deterministic simulation, so a persistent shared session backed by Supabase is the right shape, with Realtime as an enhancement only.

### Goals
- A friend can be challenged with one link and finish a duel in about five minutes.
- The draft is fair: same cards, same reroll offers, hidden picks until both lock.
- The result is trustworthy: the server deals the cards and runs the fight.
- After the draft, reuse what exists: reveal, identity, fight viewer, "Your calls".

### Non-goals for the MVP
Public matchmaking, ranked play, Elo, tournaments, chat, spectators, mandatory best-of series, timers, notifications, public leaderboards, seasons, the "settle it" 1,000-fight odds, and shared-pool drafting where one player's pick removes a fighter from the other. Accounts are optional (guests by default).

The first multiplayer question is: **do people send challenges, finish them, compare builds, and ask for another one?**

---

## 2. Domain model: three concepts

```
SERIES  (a rivalry between two people: "Chukwudi vs David")
  ├── DRAFT ROUND #1   one shared draft plan → one locked fighter per person
  │     ├── FIGHT 1
  │     └── FIGHT 2    (Run it back: same fighters, new fight seed, by consent)
  ├── DRAFT ROUND #2   (Redraft: same people, new seed, new plan, fresh builds, by consent)
  │     └── FIGHT 3
  └── ...
```

- **Series:** persistent, created once, holds the two participants and the head-to-head record.
- **Draft round:** one shared draft plan producing one fighter per participant.
- **Fight:** one deterministic simulation between two frozen fighters.

**Run it back** = same builds, new fight seed. **Redraft** = same people, new draft round. The record covers every fight in the series.

---

## 3. Player experience

```
 CREATE ──► SHARE LINK ──► FRIEND JOINS ──► BOTH DRAFT (same cards, hidden picks)
                                               │  "David: 6/8"
                                               ▼
                         BOTH LOCKED ──► FIGHTER VS FIGHTER ──► ONE FIGHT ──► RESULT
                                                                                │
                                   COMPARE DRAFTS ◄──────────────────────────────┤
                                   RUN IT BACK  (they must accept) ◄─────────────┤
                                   REDRAFT      (they must accept) ◄─────────────┘
```

| Step | What the player sees |
|---|---|
| Create | Taps **Challenge a friend**, enters a name, gets a share link. Can start drafting immediately; no waiting for the friend. |
| Join | Opens the link, enters a name, lands in the same draft round. A third person sees "This challenge is full." |
| Draft | The existing draft screen plus a slim opponent bar (`David: 6/8`). Identical cards and reroll offers for both. |
| Lock | After pick 8, **Lock in fighter**. Final. If the other player isn't done: "Waiting for David (5/8)". Refresh or a closed tab resumes exactly. |
| Reveal | Both fighters head to head: overall, style, trait, best weapon, weakness or "None major". Per-skill bars dim the weaker side. **No answer-sheet feedback yet.** |
| Fight | One fight, played back from the stored event log. Skip allowed. |
| Result | The existing result screen from each player's perspective (you red, they white). Then **Compare drafts**, **Run it back**, **Redraft**. |

If David takes an hour, the creator sees "Waiting for David" and can leave and come back. The reveal happens when the second player locks; each player sees the fight play back the first time they open it.

---

## 4. Rules (what makes it fair)

1. **Same cards.** Attribute order, the base cards of every round, and every reroll offer come from one draft plan. Both players see exactly the same options.
2. **Hidden picks.** Until both lock you can see only your opponent's progress count.
3. **One fighter once, per player.** A fighter you used cannot be used again by you. Your opponent can still use him.
4. **"Already used" cards.** A fighter may reappear on a later board. If you already used him he shows greyed out with **Already used**. This keeps the "should I save him?" dilemma alive.
5. **No dead ends, by construction.** Every offer contains at least one card no earlier round could have contained, so no legal history can leave a player without a selectable card. There is no player-specific emergency board. See [§6](#6-the-draft-plan).
6. **Rerolls.** Two per player. A reroll on round *r* shows the same next offer for both players. Reroll timing is a decision, so the total set of cards each player sees can legitimately differ.
7. **Lock-in is final.**
8. **One fight first.** No forced best-of-3.
9. **Server-authoritative.** The server deals cards, validates every action, resolves the fight, and stores the result. Clients only render.
10. **Rivalry fights need consent.** Run it back and Redraft both require the other player to accept.

---

## 5. Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────────────┐
│ Browser (Next.js client)     │        │ Next.js server (route handlers)      │
│  • draft UI, reveal, viewer  │  HTTPS │  • create / join / deal offers       │
│  • Supabase JS client:       │◄──────►│  • validate pick / reroll / lock     │
│      anonymous auth          │        │  • resolve fights, store event logs  │
│      RLS-protected reads     │        │  • rematch / redraft requests        │
│      realtime (UX only)      │        │  uses SERVICE ROLE key (server only) │
└──────────────┬───────────────┘        └───────────────────┬──────────────────┘
               │ reads + realtime                           │ writes (bypass RLS)
               ▼                                            ▼
        ┌─────────────────────────────────────────────────────────┐
        │ Supabase: Postgres (source of truth) + Auth + Realtime  │
        └─────────────────────────────────────────────────────────┘

 Shared TypeScript modules (already in the repo, used by the server):
   draft plan generator · simulateFight · narrate · overall · identity · answerSheet
```

**Principles**
- **Postgres is the source of truth.** Realtime only improves the experience (opponent joined, progress changed, both locked, fight resolved, rematch requested). The game must work after a refresh even if Realtime is disconnected.
- **Clients never write game state.** No client `INSERT`/`UPDATE` policies exist. Every state change is a server command. The browser never decides status transitions, seeds, opponent state, winners, or locked snapshots.
- **The seed never leaves the server** until the draft round is revealed. The server deals each round's offer only when the player reaches it, so nobody can inspect the URL or precompute later rounds. During drafting the client receives **names and ids only, never ratings, seeds, or future boards.**
- **The service-role key lives only in server environment variables.** Never in client code, never committed. The anon key is public by design.
- **Hosting.** The app is on Netlify; route handlers run there as server functions. (Per `AGENTS.md`, read the bundled Next docs before writing route handlers; this version differs from older releases.)

---

## 6. The draft plan

Today `generateCandidates` excludes fighters you already picked, so each round depends on your picks and two players diverge. The plan must be a pure function of `(seed, draft_version, pool_version)` that never looks at anyone's picks.

The server **generates the plan once and stores it** (server-only column), alongside the seed. Old rounds never regenerate with newer code.

### Structure

```
plan = {
  attributeOrder: [8 attributes],
  rounds: [ { attribute, offers: [ base, reroll1, reroll2 ] } × 8 ]   // each offer = 3 fighter ids
}
```

### Generation

```
order = shuffle(attributes, rng(seed:order))
seenBefore = {}                                   // fighters in ANY offer of any earlier round
for each round r:
    for each offer v in {base, reroll1, reroll2}:
        for attempt = 0, 1, 2 ...:
            cards = 3 distinct fighters at today's per-slot tier odds,
                    excluding fighters already shown in earlier offers of THIS round
                    (a reroll shows new names), drawn from rng(seed:r:v:attempt)
            accept the first attempt where at least one card is not in seenBefore
    seenBefore += every fighter in every offer of round r
```

The accepted attempt is stored, so every retry is deterministic. Display order within an offer is shuffled by the same RNG.

**The fresh-card rule is the no-dead-end guarantee.** A card no earlier round contained can't have been used by any player, so every offer always has at least one selectable card for everyone. It is enforced at generation time, so nobody ever sees a different board than their opponent.

### Measured (3,000 simulated plans, 24 offers each)

| | Unconstrained | Fresh-card rule |
|---|---|---|
| Offers needing a retry | none | 12% (average 0.12 retries per offer, max 10) |
| Offers that couldn't be satisfied | 0 | **0** |
| Boards with all 3 cards already used | 6 (in 3,000 drafts) | **0** |
| Greyed cards per draft (of 24) | 1.21 | 1.04 |
| Drafts that see no greyed card | 28% | 33% |
| Elite (4.8+) on the base board | 64% | 64% |
| Average best card on the base board | 4.79 | 4.79 |

Draft quality is unchanged; repeats are slightly rarer but still common (about two in three drafts show at least one greyed card).

### Tests required
- Same seed and versions always produce the same plan; the plan never depends on picks.
- Cards within an offer are distinct; later offers of a round never repeat earlier ones of that round.
- **Property test:** every offer contains at least one card absent from every earlier round; therefore no legal pick history can reach a board with zero selectable cards (test over many random histories, including reroll paths).
- Tier odds per slot match the current generator (statistical test).
- Two players given the same plan see identical base offers and identical reroll offers for the same round.

### Single-player
The single-player draft moves onto the same generator (random seed) **after** these tests are solid. That also enables shareable daily seeds later.

---

## 7. Versioning

Store all four on every draft round, since they change independently:

| Version | Changes when |
|---|---|
| `draft_version` | The board generation algorithm changes. |
| `pool_version` | The fighter pool rule or membership changes. |
| `ratings_version` | A fighter rating changes (alters OVR, identity, calls even if the engine did not). |
| `engine_version` | The simulation changes. |

At lock, **freeze a build snapshot** (fighter ids, derived ratings, OVR, style, trait, best weapon, weakness, ratings version). History is served from snapshots and stored fight results, never recomputed with current ratings or engine code.

---

## 8. Data model (Supabase Postgres)

Sketch, not final SQL. Every table has RLS **enabled**, with SELECT policies only.

```sql
create table series (
  id            uuid primary key default gen_random_uuid(),
  invite_token  text not null unique,            -- 128-bit random; the real credential
  status        text not null default 'open',    -- open | active | closed
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days'
);

create table series_participants (
  series_id     uuid references series(id) on delete cascade,
  user_id       uuid not null,                   -- auth.uid(): anonymous or linked
  seat          smallint not null check (seat in (1, 2)),
  display_name  text not null,
  joined_at     timestamptz not null default now(),
  primary key (series_id, user_id),
  unique (series_id, seat)
);

create table draft_rounds (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid references series(id) on delete cascade,
  round_number    int  not null,
  draft_seed      bigint not null,               -- SECRET until revealed
  draft_plan      jsonb  not null,               -- SECRET until revealed (the immutable plan)
  draft_version   int  not null,
  pool_version    int  not null,
  ratings_version int  not null,
  engine_version  text not null,
  status          text not null default 'drafting',  -- drafting | revealed | abandoned
  created_at      timestamptz not null default now(),
  revealed_at     timestamptz,
  unique (series_id, round_number)
);

create table draft_participants (
  draft_round_id   uuid references draft_rounds(id) on delete cascade,
  user_id          uuid not null,
  progress         smallint not null default 0,        -- the only pre-reveal signal visible to the opponent
  rerolls_left     smallint not null default 2,
  locked_at        timestamptz,
  actual_ovr       smallint,
  best_seen_ovr    smallint,
  build_snapshot   jsonb,                              -- frozen at lock
  primary key (draft_round_id, user_id)
);

-- Append-only: the truth of what each player saw and chose.
create table draft_actions (
  id              bigint generated always as identity primary key,
  draft_round_id  uuid references draft_rounds(id) on delete cascade,
  user_id         uuid not null,
  sequence        int  not null,                  -- per user, 1, 2, 3 ...
  action_type     text not null check (action_type in ('reroll', 'pick')),
  round_index     smallint not null,
  offer_index     smallint not null,              -- 0 base, 1, 2 reroll offers
  fighter_id      int,                            -- picks only
  created_at      timestamptz not null default now(),
  unique (draft_round_id, user_id, sequence)      -- idempotency / ordering
);

-- One pick per player per round, even if two pick() requests race.
create unique index one_pick_per_round
  on draft_actions (draft_round_id, user_id, round_index)
  where action_type = 'pick';

create table fights (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid references series(id) on delete cascade,
  draft_round_id  uuid references draft_rounds(id) on delete cascade,
  fight_number    int  not null,                  -- series-wide: 1, 2, 3 ... across draft rounds
  fight_seed      bigint not null,
  engine_version  text not null,
  status          text not null default 'resolved',
  winner_user_id  uuid,
  method          text not null,                  -- KO | TKO | SUB | DEC
  finish_round    smallint not null,
  finish_time     smallint not null,
  result_json     jsonb not null,                 -- full event log + stats: playback never re-simulates
  created_at      timestamptz not null default now(),
  unique (series_id, fight_number)
);

create table series_requests (                    -- consent for rivalry fights
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid references series(id) on delete cascade,
  kind            text not null check (kind in ('run_it_back', 'redraft')),
  after_fight_id  uuid not null references fights(id),  -- the state it answers; stale requests can't be accepted
  requested_by    uuid not null,
  status          text not null default 'pending',       -- pending | accepted | declined | expired
  created_at      timestamptz not null default now()
);

-- At most one open request per series at a time.
create unique index one_pending_request
  on series_requests (series_id)
  where status = 'pending';
```

`draft_actions` is the source of truth; `draft_participants` holds the convenient current state (progress, rerolls left, lock). **Store the full fight result** (event log and stats) so old rivalries replay identically, independent of future engine code. (The engine has one `Math.pow(x, 1.5)` in the TKO curve that browsers may round slightly differently; stored events sidestep that. The random generator, `seedrandom`, is integer-based and identical everywhere.)

---

## 9. Server commands

All authenticate the caller's session, validate, then write with the service role. Every command is **idempotent** or protected by a transaction and unique constraints.

| Command | What it does and validates |
|---|---|
| `createSeries()` | Creates the series, the creator's seat, draft round 1 and its plan. Returns the invite URL (opaque token). |
| `joinSeries(inviteToken, displayName)` | Atomically claims seat 2. Rejects if full, expired, or already the creator. |
| `getCurrentOffer(draftRoundId)` | Returns the player's current attribute, three cards (`id`, `name`, `alreadyUsed`), rerolls left, their progress and **only** the opponent's progress. Never the seed or future rounds. |
| `reroll(draftRoundId)` | Round not yet picked, rerolls left, appends an action, returns the next planned offer. |
| `pick(draftRoundId, fighterId)` | Fighter is on the current offer, not already used by this player, rounds in order, round still drafting. Appends an action and advances progress. |
| `lockDraft(draftRoundId)` | In one transaction: verify exactly eight legal picks, freeze the build snapshot and best-seen overall, mark locked. If both are locked: reveal the round (`status = revealed`) and create **Fight 1 exactly once**. |
| `resolveFight(fightId)` | Server only: read both snapshots, run the engine, store the immutable result. |
| `requestRunItBack(seriesId)` / `respond(requestId, accept)` | On acceptance: creates fight N+1 under the same draft round with a new fight seed. |
| `requestRedraft(seriesId)` / `respond(requestId, accept)` | On acceptance: creates the next draft round with a new seed and plan. |

**Rivalry requests, in one transaction:** only one request can be pending per series, and it names the fight it follows (`after_fight_id`). If the other player has already asked for the **same** thing, the second request counts as acceptance and the fight or draft is created immediately. If they asked for the **other** thing, the new request is refused and the player is shown theirs to accept or decline. A request whose `after_fight_id` is no longer the latest fight is expired, never accepted.

Add per-user and per-IP rate limits (anonymous sign-in is easy to farm). Room for a short human-friendly code is optional and low priority; **the long opaque token is the credential**, and any short code must be aggressively rate-limited.

---

## 10. Security and RLS

### Identity
Supabase **anonymous sign-in** gives every visitor a real `auth.uid()` so RLS works for guests. Later a guest can link Google, Apple, or email without losing history.

### What each participant can read

**Before reveal:**
- Series metadata, both display names, both progress values.
- **Only their own** actions, picks, and build state.

**Never before reveal:** the opponent's picks, the opponent's build snapshot, the draft plan or seed, an unresolved fight.

**After reveal:** both build snapshots, both action histories, and the comparison data.

Non-participants can read nothing.

| Table | SELECT policy |
|---|---|
| `series`, `series_participants` | Participants of that series. `invite_token` and joining go through server commands; clients cannot look up series by token. |
| `draft_rounds` | Participants, **excluding** `draft_seed` and `draft_plan` (column privileges or a view) until `status = 'revealed'`. |
| `draft_participants` | `progress`, `locked_at` visible to both participants; `build_snapshot`, `actual_ovr`, `best_seen_ovr` only to the owner until reveal. |
| `draft_actions` | Your own rows; the opponent's only after reveal. |
| `fights`, `series_requests` | Participants. |

The service-role key exists only on the server.

---

## 11. Lifecycle, edge cases, recovery

```
draft round:   drafting ──(both locked)──► revealed
                  │
                  └──(series expires)──► abandoned
```

| Situation | Behavior |
|---|---|
| Creator drafts before the friend joins | Allowed; the friend joins into the same round. |
| Refresh or new tab mid-draft | Reload state from the database and resume the exact round and offer. |
| Realtime disconnects | No state lost; refetch on reconnect. |
| Duplicate request | Idempotent or blocked by unique constraints. |
| Simultaneous final lock | Exactly one reveal transition and exactly one Fight 1. |
| Repeated fighter | Visible but disabled as **Already used**. |
| Player never finishes | The challenge stays pending until `expires_at` (7 days), then `abandoned`; cleanup deletes it later. |
| Third person opens the link | "This challenge is full." |
| Creator opens their own link as "join" | Rejected. |
| Versions change mid-life | Unfinished rounds pin their versions; finished fights still replay from stored results. |
| Rematch request ignored | Stays pending; expires. It never changes the record until accepted. |
| Both press Run it back at once | Treated as mutual acceptance: exactly one new fight. |
| Two pick requests race | The partial unique index rejects the second. |

---

## 12. After the fight

### Compare drafts (core screen)
Round by round, each player's pick side by side, with each build's overall and points left on the table. It shows **names only, never ratings**, and the game never names a fighter a player "should have" picked. Expandable per-player feedback: best pick, biggest miss, sleeper, full build.

```
                    YOU             DAVID
WRESTLING           GSP             CEJUDO
SUBMISSIONS         OLIVEIRA        MAIA
...
OVR                 92              88
LEFT ON TABLE       2               6
```

### Left on the table (per player)
**Best from the cards you actually saw:** the highest legal overall the player could have built using only cards shown to them, respecting one fighter per skill, one use per real fighter, and their actual reroll history. `left = best seen - built`. It is exact and reachable, because the plan is fixed.

Because reroll timing changes which cards each player sees, **the two players' maxima can legitimately differ**, and that is fine: reroll use is part of skill. A separate benchmark (the best result from any legal reroll use) is a possible later addition, and not shown in v1.

Footer, always: *Based on Five-Star's ratings and the cards you were shown.* Show the answer sheet **after** the fight so the reveal stays a surprise.

### Run it back and Redraft: both need the other player's agreement
- **Run it back:** one player requests; the other accepts (asynchronously is fine). On acceptance: same frozen builds, a new fight seed, a new authoritative fight, recorded in the series.
- **Redraft:** one player requests; the other accepts and lands straight in the new draft round.
- Without consent, a player could press Run it back until they fixed the record. Consent keeps the record honest. (A private, unrecorded "sim again" exhibition is a possible later add.)

### Not in the MVP: "Settle it"
Simulating 1,000 fights to show true odds is deliberately left out. Right after a loss the product should say **Run it back**, not hand the player an analytics readout of why the fight they just watched was unlikely. The infrastructure can support it later.

---

## 13. Reused code and changes needed

| Piece | Status |
|---|---|
| `simulateFight`, `narrate`, `FightViewer`, `FightResultScreen` | Reused. The viewer takes narrated moments; feed it stored events. |
| `TaleOfTape`, `FighterSheet`, identity | Reused; the head-to-head takes a human opponent instead of a CPU. |
| `DraftScreen` | Reused; adds the opponent progress bar, Already-used cards, and server-dealt offers. |
| `overall.ts`, `identity.ts` | Reused unchanged. |
| `answerSheet.ts` | Adjusted to take offers with reroll variants (best from cards seen). |
| `session.ts` / `candidates.ts` | **Refactor:** a pure plan generator (§6). Single-player moves onto it after the tests are solid. |
| Rampage | Untouched. |

---

## 14. Known limitations and hardening path

| Limitation | Impact | Hardening |
|---|---|---|
| Ratings ship in the single-player JS bundle | A determined player could compute optimal picks. Fine for friends. | Multiplayer offers carry names only. Later, run OVR, identity, and calls entirely server-side. |
| Ranked play | Needs the trust boundary fully server-side, including sensitive ratings and candidate logic. | Deliberately not in v1. |
| No timers | A player can stall. | 7-day expiry for the MVP; optional draft timer later. |
| Anonymous accounts are cheap | Farming or spam. | Rate limits; optional captcha; linking for durable identity. |
| Rating opinions | Players will dispute ratings. | The footer stays; the model is never presented as objective MMA truth. |

---

## 15. Testing and MVP acceptance

**Tests**
- **Unit:** the plan (§6, including the property test), action validation, lock and reveal idempotence, best-seen enumeration, result round trip.
- **RLS integration** on the Supabase local stack: the opponent's picks are unreadable before reveal and readable after; the seed and plan are never selectable; a third user reads nothing; no client can write any table.
- **State and concurrency:** simultaneous lock, refresh mid-draft, duplicate requests.
- **End to end (Playwright, two browser contexts):** create, join, draft in parallel, lock, reveal, watch, request and accept a rematch, redraft.

**Multiplayer is ready only when:**
- The same plan gives both players identical base offers, and the same reroll on the same round gives the same reroll offer.
- No legal draft path can dead-end.
- One player's used fighter can remain available to the other.
- Opponent picks cannot be read before both lock.
- Refresh restores exact state.
- Locking requires exactly eight legal picks and is irreversible.
- Simultaneous locks create one reveal and one Fight 1.
- The fight resolves server-side and both clients render the same stored result.
- Run it back keeps builds, changes the fight seed, and needs acceptance.
- Redraft creates a new draft round with a new seed, and needs acceptance.
- Compare drafts uses the cards actually shown; "left on the table" is legally reachable.
- No client can set a winner, a seed, or an opponent pick.

---

## 16. Milestones

Sizes are relative (S small, M medium, L large).

| # | Milestone | Size | Done when |
|---|---|---|---|
| M0 | **Deterministic draft plan.** Generator with the fresh-card rule, seeded reroll offers, Already-used cards, best-seen "Your calls". Single-player migrated after the tests pass. No backend. | M | All §6 tests pass; single-player plays the same from the player's view. |
| M1 | **Supabase foundation.** Project, anonymous auth, migrations in the repo, the §8 schema, RLS, local stack, generated types. | M | RLS integration tests pass. |
| M2 | **Challenge flow.** Create and join, server commands, independent drafting, progress, lock, resume on refresh. | L | Two browsers draft the same cards without seeing each other's picks. |
| M3 | **Reveal and fight.** Reveal transition, authoritative Fight 1, stored events, head-to-head reveal, playback from each perspective. | M | Both browsers show the same stored fight. |
| M4 | **Social payoff.** Compare drafts, left on the table for both, run it back and redraft with consent, series record. | M | A full rivalry loop works. |
| M5 | **Hardening and analytics.** Rate limits, expiry cleanup, error states, the funnel events, account linking. | M | Ready for a public link. |
| Later | Live-room polish, notifications, public matchmaking, ranked play (requires the server-side trust boundary). | | Only after usage proves demand. |

M0 is valuable on its own and needs no backend, so it can start immediately.

### Analytics (track from M2)
`challenge_created`, `challenge_link_copied`, `challenge_opened`, `challenge_joined`, `draft_started`, `draft_reroll_used`, `draft_locked`, `both_locked`, `fight_completed`, `compare_drafts_opened`, `run_it_back_requested`, `run_it_back_accepted`, `redraft_requested`, `redraft_accepted`, `series_second_fight_completed`.

Key metrics: challenge join rate, both-locked completion rate, fight-2 intent, actual second-fight completion, compare-drafts usage. The question that matters: **after fight 1, do the two people want another interaction?**

---

## 17. What changed and why

This is v2. After an independent review the following changed from v1:

| Change | Reason |
|---|---|
| **Removed the player-specific reserve board.** The no-dead-end guarantee is now enforced when the plan is generated (§6). | A reserve would have given one player different cards from the other, breaking the core promise. Measured: the rule is always satisfiable, board quality is unchanged. |
| "Both players get the same maximum" corrected. Left on the table is **best from the cards you actually saw**, and can differ when reroll use differs. | Rerolls change which cards a player sees. |
| Added the append-only `draft_actions` log. | It is the truth of what each player saw and chose, and it powers idempotency, analytics, exact feedback, and future replay. |
| Explicit `series` / `draft_rounds` / `fights` model now, replacing `matches` with a parent link. | The product already has a rivalry concept. |
| **Run it back now needs consent.** | Otherwise one player can repeat fights until the shared record looks different. |
| **"Settle it" removed from the MVP.** | After a loss the product should say "run it back", not show simulation odds. |
| Added `draft_version` and `ratings_version` alongside `engine_version` and `pool_version`. | They change independently and each alters what a stored game means. |
| Long opaque invite token is the credential; any short code is only a convenience. | A short code is guessable; the link must be the secret. |
| The plan is stored, not only re-derivable from the seed. | Old rounds must never regenerate differently after code changes. |
| v2.1: `fight_number` is series-wide (`unique (series_id, fight_number)`); one pick per player per round enforced by a partial unique index; one pending rivalry request per series, tied to the fight it follows, with matching requests counting as acceptance. | Make invalid states impossible in Postgres instead of relying on application code. |
| As built (M1, `supabase/migrations/`): private per-player state (rerolls, offer, OVRs, build snapshot) lives in its own `draft_builds` table; the seed, plan and invite token are never client-selectable, even after reveal (the server returns what the compare screen needs). | A row policy can't hide individual columns, so private columns needed their own table; clients never need the raw seed or plan. |

Kept exactly as first proposed: asynchronous challenges by link, identical cards with hidden picks, the seed secret and offers dealt round by round, server-authoritative fights, stored event logs, Supabase anonymous auth with RLS and server-only writes, and one fight first.

---

## 18. Open decisions

1. **Guests only, or require an account?** Recommendation: guests first; link accounts later.
2. **Expiry length:** 7 days proposed.
3. **Where do route handlers run?** Netlify functions today; revisit if hosting changes.
4. **Prisma or Supabase's own client?** Recommendation: Supabase client with SQL migrations; leave Prisma dormant (it cannot use Realtime, and a typical Prisma connection uses a role that bypasses row-level security).
5. **A private, unrecorded "sim again" exhibition?** Recommendation: not in the MVP.
6. **Show a "best from any legal reroll use" benchmark?** Recommendation: not in v1.
