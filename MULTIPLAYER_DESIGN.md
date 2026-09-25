# Multiplayer MVP: Head-to-head draft duels

**Status:** proposed, not built. Nothing in this document changes the simulation engine, OVR, drafting odds, or balance (all frozen for playtesting).
**Owner decisions needed:** see [Open decisions](#16-open-decisions).

---

## 1. Summary

Two people draft a fighter from **identical cards**, without seeing each other's picks. When both lock in, the game reveals both fighters, simulates one fight, and offers **Run it back** (same fighters) or **Redraft** (new cards). Because both players get the same options, the result is a test of MMA judgment, not luck: *"we had the exact same options, you just built yours better."*

It works **asynchronously by link** (nobody has to be online at the same moment) and feels live when both players happen to be present.

### Goals
- A friend can be challenged with one link and finish a duel in about five minutes.
- The draft is fair: same cards, same rerolls, hidden picks until both lock.
- The result is trustworthy: the server deals the cards and runs the fight.
- Everything after the draft reuses what exists: reveal, identity, fight viewer, "Your calls".

### Non-goals for the MVP
Public matchmaking, ranked play, Elo, chat, spectators, tournaments, mandatory best-of series, timers, push notifications, native apps. Accounts are optional (guests by default).

---

## 2. The player experience

```
 CREATE ──► SHARE LINK ──► FRIEND JOINS ──► BOTH DRAFT (same cards, hidden picks)
                                              │   "David: 6/8 drafting"
                                              ▼
                       BOTH LOCKED ──► FIGHTER VS FIGHTER ──► ONE FIGHT ──► RESULT
                                                                              │
                                     ┌──────────── RUN IT BACK (same fighters, new fight)
                                     ├──────────── REDRAFT     (same players, new cards)
                                     └──────────── COMPARE DRAFTS / SETTLE IT
```

| Step | What the player sees |
|---|---|
| Create | Enters a name, gets a share link and a short code (`K7Q2XM`). Can start drafting immediately; no need to wait for the friend. |
| Join | Opens the link, enters a name, lands in the same draft. If the match already has two players: "This match is full." |
| Draft | The existing draft screen, plus a slim opponent bar: `David: 6/8`. Identical cards and rerolls for both players. |
| Lock | After pick 8, "Lock in fighter". Locked picks can't change. If the other player isn't done: "Waiting for David (5/8)". A refresh or a closed tab resumes exactly where you were. |
| Reveal | Both fighters appear head to head (overall, style, trait; per-skill bars dim the weaker side, as in the current head-to-head). |
| Fight | One fight, played back from the stored event log. Skip is allowed. |
| Result | The existing result screen from each player's own perspective (you are red, they are white), plus **Run it back** and **Redraft**. |
| After | **Compare drafts** (round by round, side by side) and **Settle it** (1,000 simulated fights between these two fighters, showing true odds). |

**Asynchronous by design.** If David takes an hour, the creator sees "Waiting for David" and can leave and return. Whoever opens the match after both have locked sees the reveal; the fight plays back for each player the first time they view it.

---

## 3. Rules (what makes it fair)

1. **Same seed, same cards.** Attribute order, the three cards for every round, and every reroll board are derived from one match seed. Both players see exactly the same options.
2. **Hidden picks.** You cannot see your opponent's picks until both are locked. The only thing visible is the count (`6/8`).
3. **One fighter per build.** As today, a fighter you have used cannot be used again *by you*. Your opponent can still use him.
4. **"Already used" cards.** Because boards cannot depend on anyone's picks (they must be identical), a fighter you already used may appear again on a later board. He is shown **greyed out with "Already used"**. This preserves the "should I save him?" dilemma that repeats create. See [§5](#5-deterministic-boards).
5. **Rerolls.** Two per player, same as single-player. A reroll on round *r* replaces that board with the next seeded variant for that round, which is the same replacement for both players.
6. **Lock-in is final.** No edits after locking.
7. **One fight first.** A forced best-of-3 dilutes the drama. Series emerge from players choosing **Run it back**.
8. **Server-authoritative.** The server deals cards, validates picks, runs the fight, and stores the result. Clients only render.

---

## 4. Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────────────┐
│ Browser (Next.js client)     │        │ Next.js server (route handlers)      │
│  • draft UI, reveal, viewer  │  HTTPS │  • create / join / deal board        │
│  • Supabase JS client:       │◄──────►│  • validate pick / reroll / lock     │
│      anonymous auth          │        │  • run fight, store event log        │
│      reads (RLS-protected)   │        │  • run-it-back / redraft / settle-it │
│      realtime subscriptions │        │  uses SERVICE ROLE key (server only) │
└──────────────┬───────────────┘        └───────────────────┬──────────────────┘
               │  reads + realtime (RLS)                    │ writes (bypass RLS)
               ▼                                            ▼
        ┌─────────────────────────────────────────────────────────┐
        │ Supabase: Postgres + Auth (anonymous) + Realtime + RLS  │
        └─────────────────────────────────────────────────────────┘

 Shared TypeScript modules (already in the repo, run in both places):
   draft boards · simulateFight · narrate · overall · identity · answerSheet
```

**Key principles**
- **Clients never write game state directly.** The database has no client `INSERT`/`UPDATE` policies. Every state change goes through a server route that validates it. Clients may only *read* what row-level security allows.
- **The seed never leaves the server** until the match is revealed. The server deals each round's board only when the player reaches it, so nobody can precompute future rounds (which would defeat opportunity cost). Consequence: in multiplayer the client needs **names only, not ratings**, while drafting.
- **The service-role key lives only in server environment variables.** Never in client code, never committed. The anon key is public by design.
- **Hosting.** The app is on Netlify today; Next route handlers run there as server functions. (Per `AGENTS.md`, read the bundled Next docs before writing route handlers; this version differs from older releases.)

---

## 5. Deterministic boards

Today `generateCandidates` excludes fighters you have already picked, which makes each round's cards depend on your picks. Two players with different picks would diverge. The boards must therefore be a pure function of `(seed, round, variant)`.

### Algorithm

```
attributeOrder = shuffle(VISIBLE_ATTRIBUTES, rng(seed + ":order"))

board(round r, variant v):
    rng      = rng(seed + ":board:" + r + ":" + v)
    exclude  = fighters shown in variants 0..v-1 of the same round r     // rerolls show new names
    cards    = 3 distinct fighters drawn with today's per-slot tier odds,
               never excluding anything a player picked
    return shuffled(cards, rng)                                          // display order shuffled

reserve(round r) = 3 extra fighters from rng(seed + ":reserve:" + r)     // edge case only
```

Per player, a card is **available** unless that player already used the fighter. The variant a player sees for round *r* equals the number of rerolls they spent on round *r* (their total across rounds is at most two).

### How often does "already used" bite? (measured, 20,000 simulated drafts)

| Measure | Result |
|---|---|
| Greyed cards per draft (of 24) | 1.2 |
| Drafts with at least one greyed card | 72% |
| Boards with 1+ greyed card | 14.2% |
| Boards with 2+ greyed cards | 0.87% |
| Boards with all 3 greyed | 0.016% (about 1 in 6,400 boards, or 1 in ~800 drafts) |

**Fallback for the last row:** if a player has fewer than one available card, the server serves the round's `reserve` cards instead. Same for both players (the reserve is seeded), only triggered for that player. It needs its own test.

### What this also improves
- **"Your calls" becomes exact.** With fixed boards, "best from your cards" is truly reachable (today it is a hindsight upper bound). The best legal path can be computed exactly by enumerating picks and reroll choices (about 3⁸ × the reroll placements, trivial). Both players get the *same* maximum, so "left on the table" compares fairly.
- **Single-player can use the same generator** with a random seed, which also enables shareable daily seeds later.

### Tests required
- Same `(seed, r, v)` always gives the same board; boards never depend on picks.
- Cards within a board are distinct; variant *v* never repeats earlier variants of that round.
- Tier odds match the current per-slot distributions (statistical test).
- Every legal pick history leaves at least one available card (with the reserve).
- Enumerated maximum equals brute force on small cases.

---

## 6. Data model (Supabase Postgres)

Sketch, not final SQL. All tables have RLS **enabled**, with SELECT policies only.

```sql
create type match_status as enum ('waiting', 'drafting', 'revealed', 'abandoned');

create table matches (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- short share code
  seed            bigint not null,                -- SECRET until revealed
  status          match_status not null default 'waiting',
  series_id       uuid,                           -- rivalry grouping (redrafts)
  parent_match_id uuid references matches(id),
  engine_version  text not null,
  pool_version    int  not null,                  -- draft pool rule version
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days'
);

create table match_players (
  match_id     uuid references matches(id) on delete cascade,
  user_id      uuid not null,                     -- auth.uid() (anonymous or real)
  seat         smallint not null check (seat in (1, 2)),
  display_name text not null,
  picks_made   smallint not null default 0,       -- the only pre-reveal progress signal
  rerolls      smallint[] not null default '{}',  -- rounds where a reroll was spent (max 2)
  locked_at    timestamptz,
  primary key (match_id, user_id),
  unique (match_id, seat)
);

create table match_picks (
  match_id    uuid references matches(id) on delete cascade,
  user_id     uuid not null,
  round_index smallint not null check (round_index between 0 and 7),
  attribute   text not null,
  variant     smallint not null default 0,        -- which reroll board the card came from
  fighter_id  int  not null,
  primary key (match_id, user_id, round_index),
  unique (match_id, user_id, fighter_id)          -- one fighter once, per player
);

create table match_fights (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid references matches(id) on delete cascade,
  fight_no    int  not null,
  kind        text not null check (kind in ('original', 'run_it_back')),
  seed        bigint not null,
  winner_id   uuid,
  method      text not null,                      -- KO | TKO | SUB | DEC
  round       smallint not null,
  round_time_seconds smallint not null,
  events      jsonb not null,                     -- full event log: replay never re-simulates
  stats       jsonb not null,
  summaries   jsonb not null,                     -- per player: overall, identity, calls, max possible
  engine_version text not null,
  created_at  timestamptz not null default now(),
  unique (match_id, fight_no)
);
```

**Optional in v1.5:** `series` (id, the two user ids) with a view for the head-to-head record, and an `analytics_events` table for the funnel in [§14](#14-playtest-metrics).

### Why store the event log
`simulateFight` uses one `Math.pow(x, 1.5)` (in the TKO risk curve). ECMAScript lets engines round non-integer powers slightly differently, so re-simulating on Safari versus Node could in theory diverge on a knife-edge roll. Storing the events makes playback identical everywhere and independent of future engine changes. (A separate one-line hardening: replace it with `x * Math.sqrt(x)`, which is exactly rounded. Not required if events are stored.) The random generator itself (`seedrandom`) is integer-based and identical across engines.

---

## 7. Security

### Identity
Supabase **anonymous sign-in** gives every visitor a real `auth.uid()` without an account, so row-level security works for guests. Later, a guest can **link a Google identity** without losing history.

### RLS policy matrix (SELECT only; there are no client write policies)

| Table | Who can read |
|---|---|
| `matches` | Participants (a row exists in `match_players` for `auth.uid()`). **`seed` must not be selectable by clients** (column privileges, or a view without it) until `status = 'revealed'`. |
| `match_players` | Participants of that match (names, `picks_made`, `locked_at`). |
| `match_picks` | Your own rows always. The other player's rows only when the match is `revealed`. |
| `match_fights` | Participants. |

Joining by code goes through a server route (clients cannot query matches by code, which would let anyone enumerate matches).

### Server routes (all validate the caller's JWT, then write with the service role)

| Route | Validation |
|---|---|
| `POST /api/matches` | Creates match + seed, seats the creator. |
| `POST /api/matches/join` | Code exists, match not full, not the creator's own second seat, not expired. |
| `GET  /api/matches/:id/board?round=r` | Only the round the player is on (previous picks all present). Returns `{id, name, used}` for three cards; never the seed. |
| `POST /api/matches/:id/pick` | Fighter is on that round's board (correct variant), not already used by this player, rounds in order, match is drafting. |
| `POST /api/matches/:id/reroll` | Fewer than two rerolls used, round not yet picked. |
| `POST /api/matches/:id/lock` | All eight picks present. If both locked: reveal (below). |
| `POST /api/matches/:id/run-it-back` | Match revealed; creates the next fight with a new fight seed. |
| `POST /api/matches/:id/redraft` | Creates a child match in the same series; the other player is invited. |
| `POST /api/matches/:id/settle` | Server simulates 1,000 fights, returns odds (cached). |

Add basic per-user and per-IP rate limits (anonymous sign-in is otherwise easy to farm).

### Reveal (one transaction)
When the second player locks: set `status = 'revealed'`, build both `FighterSnapshot`s from the picks, run `simulateFight`, compute each player's overall, identity, "Your calls" and exact maximum, store `match_fights` (with events), and publish. Realtime notifies both players.

---

## 8. State machine and lifecycle

```
waiting ──(second player joins)──► drafting ──(both locked)──► revealed
   │                                  │
   └───────────(expires_at)───────────┴────────────────────────► abandoned
```

| Situation | Behavior |
|---|---|
| Creator drafts before the friend joins | Allowed. Draft state is saved; the friend joins into the same seed. |
| Refresh / new tab mid-draft | Resume from stored picks and current round (own picks are readable by RLS). |
| Same user opens the link in two tabs | One seat; the tabs share progress. |
| Friend never joins or never finishes | `expires_at` (7 days): status `abandoned`; picks retained briefly, then a cleanup job deletes the match. |
| One player locks and leaves | The other can finish any time within the expiry; reveal happens on the second lock. |
| Simultaneous final lock | The reveal transaction is idempotent: it runs once (`unique (match_id, fight_no)`). |
| Creator opens their own link as "join" | Rejected. |
| Third person opens the link | "This match is full." |
| Engine or pool version changes mid-life | Matches pin `engine_version` and `pool_version`. Unfinished matches from an older version show a friendly "this match expired with an update" message. Finished fights still replay (events are stored). |

---

## 9. After the fight

### Result and re-fights
- **Run it back:** the same two fighters, a new fight seed, no consent needed (a fight costs nothing). The head-to-head record ticks up: `You 1 – 1 David`.
- **Redraft:** creates a child match with a new seed and the same players. The other player sees "Chiamaka wants a redraft" with an Accept button, and lands straight in the new draft.
- A series naturally forms out of choices ("settle it" third fight) rather than being forced.

### Compare drafts
Round by round, each player's pick side by side. It shows **names only, never ratings**, consistent with the rule that the game never names a missed fighter. This is the most shareable screen ("you took Cejudo over Cain??").

### Your calls (both players)
Reuses the existing block, computed on the *fixed* boards, so the numbers are exact and comparable: `You built 91, from your cards 94, left on the table 3` versus `They built 88, left on the table 6`. Show only after the fight, so the reveal stays a surprise.

### Settle it
One tap: the server simulates 1,000 fights between the two fighters and shows the true odds ("Ghost wins 58%"). It resolves "that was bullshit" without a mandatory series.

---

## 10. Reused code and changes needed

| Piece | Status |
|---|---|
| `simulateFight`, `narrate`, `FightViewer`, `FightResultScreen` | Reused as is. The viewer already takes narrated moments; feed it stored events. |
| `TaleOfTape`, `FighterSheet`, identity | Reused; the head-to-head takes a human opponent instead of a CPU. |
| `DraftScreen` | Reused; adds the opponent progress bar, "Already used" cards, and server-dealt boards. |
| `overall.ts`, `identity.ts` | Reused unchanged. |
| `answerSheet.ts` | Adjusted to take boards with variants; with fixed boards, adds the exact maximum. |
| `session.ts` / `candidates.ts` | **Refactor:** extract a pure `boards.ts` (§5). Single-player draft moves onto it. |
| Rampage | Untouched. |

---

## 11. Known limitations and hardening path

| Limitation | Impact | Hardening |
|---|---|---|
| Ratings ship in the JS bundle | A determined player could compute the best picks for a board. Fine for friends; not for ranked. | In multiplayer, boards already carry names only. Later: move OVR/identity/calls computation server-side, so no multiplayer client needs ratings. |
| Optimal play is discoverable | With a fixed seed, a solver finds the best draft. | Seeds stay secret until reveal, so nobody can solve *before* drafting. Post-reveal solving matters only for ranked. |
| No timers | A player can stall. | Expiry after 7 days for MVP; optional per-match draft timer later. |
| Anonymous accounts are cheap | Farming or spam. | Rate limits; optional captcha; Google linking for persistent identity. |
| Fighter names and rating opinions | People will dispute ratings. | The existing footer stays: "Based on Five-Star's ratings and the cards you were shown." |

---

## 12. Testing plan

- **Unit:** boards (§5), pick/reroll validation, lock and reveal idempotence, exact-maximum enumeration, event-log round trip.
- **RLS integration** (Supabase local stack via the CLI): the opponent's picks are unreadable before reveal and readable after; the seed is never selectable; a third user can read nothing; no client can write any table.
- **State machine:** every transition in §8, including the races (simultaneous lock, refresh mid-draft).
- **End-to-end (Playwright, two browser contexts):** create, join, draft in parallel, lock, reveal, watch the fight, run it back, redraft.
- **Statistical:** tier odds for the new generator match the current generator; greyed-card frequency stays near the measured 1.2 per draft.

---

## 13. Milestones

Sizes are relative (S small, M medium, L large).

| # | Milestone | Size | Done when |
|---|---|---|---|
| M0 | **Deterministic boards.** Pure `boards.ts`, "Already used" cards, seeded rerolls, reserve fallback, exact "Your calls". Single-player switched over. No backend. | M | All §5 tests pass; single-player plays identically from the player's view; "Your calls" is exact. |
| M1 | **Supabase foundation.** Project, anonymous auth, schema, RLS, local stack, migrations checked into the repo, generated types. | M | RLS integration tests pass. |
| M2 | **Create, join, draft.** Routes for create/join/board/pick/reroll/lock; lobby; opponent progress; resume on refresh. | L | Two browsers can draft the same cards without seeing each other's picks. |
| M3 | **Reveal and fight.** Reveal transaction, stored events, head-to-head reveal, playback, result from each perspective. | M | Both browsers show the same fight and result. |
| M4 | **Rematches.** Run it back, redraft with accept, head-to-head record. | M | A full duel loop works without leaving the match. |
| M5 | **After-fight extras.** Compare drafts, Your calls for both, Settle it. | M | Both players see the comparison after the fight. |
| M6 | **Hardening.** Rate limits, expiry cleanup, error states, funnel events, Google linking. | M | Ready for a public link. |

M0 is valuable on its own (it improves single-player) and does not depend on Supabase, so it can start immediately.

---

## 14. Playtest metrics

Track the funnel so the Sunday-style playtests answer real questions:

`match created → friend opened link → friend finished draft → both locked → fight watched → run it back or redraft clicked`

Also: how long drafts take, how many rerolls are used and when, how often "Already used" cards appear in real play, and whether the "Compare drafts" screen gets opened.

---

## 15. What we deliberately are not building yet

Matchmaking, ranked ladders, seasons, spectators, chat, tournaments, mandatory series, timers, notifications, native apps. Each can sit on top of this foundation later; none is needed to learn whether people enjoy duels.

---

## 16. Open decisions

1. **Guests only, or require Google sign-in?** Recommendation: guests first, link Google later.
2. **Run it back: consent or instant?** Recommendation: instant (a fight costs nothing).
3. **Redraft: must the other player accept?** Recommendation: yes; it changes what they are doing.
4. **Boards shown with "Already used" greyed cards, or hide them?** Recommendation: show greyed (keeps the dilemma; needs the reserve fallback).
5. **Expiry length:** 7 days proposed.
6. **Where do route handlers run?** Netlify functions today; revisit if the hosting changes.
7. **Prisma or Supabase's own client?** Recommendation: Supabase client with SQL migrations; leave Prisma dormant (it cannot use Supabase Realtime, and a typical Prisma connection uses a database role that bypasses row-level security).
