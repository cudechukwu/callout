# Five-Star MMA: Design Document (Final)

**Status:** Locked for Implementation  
**Platform:** Responsive web app (mobile-first)  
**Core Loop:** Build fighter → Fight → Understand result → Improve/retry → Challenge/share  
**Product Category:** Social simulation game / fantasy MMA  
**Readiness:** Ready for Week 1 execution  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Thesis & Core Loop](#product-thesis--core-loop)
3. [Market & Data Validation](#market--data-validation)
4. [MVP Experience Flow](#mvp-experience-flow)
5. [Product Identity](#product-identity)
6. [Game Design: Draft System](#game-design-draft-system)
7. [Game Design: Fight Simulation](#game-design-fight-simulation)
8. [Game Design: Competition & Matchmaking](#game-design-competition--matchmaking)
9. [Persistence & Social Features](#persistence--social-features)
10. [Technical Architecture](#technical-architecture)
11. [Database Schema](#database-schema)
12. [Week 1 Parallel Tracks](#week-1-parallel-tracks)
13. [Success Metrics](#success-metrics)
14. [Legal & Brand](#legal--brand)
15. [MVP Expansion Roadmap](#mvp-expansion-roadmap)

---

## Executive Summary

**Five-Star MMA** is a lightweight competitive MMA simulation where users build a virtual fighter by selecting attributes from elite MMA athletes, then prove their build through asynchronous battles.

### Central Fantasy

> **Build the perfect fighter. Prove that your build can survive everyone else's.**

### MVP Success Question

Will users care enough about the fighter they create to **repeatedly fight, improve their record, and share that fighter** with others?

### Why This Works

1. Market validation (82 to Zero proved format viability)
2. Rich data ready (317 fighters, all attributes complete)
3. Immediate comprehension (mechanic understood in seconds)
4. High replayability (draft choices create asymmetric matchups)
5. Viral mechanics built-in (challenge links, shareable cards)
6. Low operational friction (asynchronous = simple infra)

---

## Product Thesis & Core Loop

Most sports simulations fail by being either **too shallow** (random) or **too complex** (spreadsheet).

Five-Star MMA sits deliberately in between.

### What Players Think

| Stage | Thought |
|-------|---------|
| **First draft** | "I choose abilities that make up my fighter." |
| **After 3 fights** | "Maybe I shouldn't have locked Khabib into Wrestling." |
| **After 10 fights** | "My striker gets destroyed by grapplers. New build needed." |
| **When sharing** | "My fighter is 12–1. Can you beat him?" |

The novelty is **ownership**. A fighter becomes your identity.

### Core Loop Timing

**First experience: 60–120 seconds total**
```
Landing → Draft (8 attr × ~5 sec) → Name → Card reveal → 
Matchmaking → Tale of tape → Fight (30–45 sec reveal) → 
Result + explanation → Record update
```

**Returning user: <10 seconds to next fight**
```
Login → Card → Find Fight → Watch → Fight Again
```

---

## Market & Data Validation

### Fighter Pool

- **317 unique MMA athletes** with complete data
- **1.0–5.0 rating scale** (normalized)
- **Strong archetype diversity** (pure strikers, grapplers, balanced, specialists)
- **No missing values** (100% data completeness)

### Visible Draft Attributes (8)

| Attribute | Meaning | Specialist Example |
|-----------|---------|-------------------|
| **Wrestling** | Takedown offense, control | Khabib (5.0) |
| **Submissions** | Sub offense, escape threat | Charles Oliveira (5.0) |
| **Boxing** | Hand combinations, footwork | Conor McGregor (4.8) |
| **Kickboxing** | Kicks, range control | Mirko Cro Cop (5.0) |
| **Power** | Strike damage, KO threat | Francis Ngannou (5.0) |
| **Cardio** | Stamina, durability | Max Holloway (5.0) |
| **Chin** | Damage absorption | Dustin Poirier (5.0) |
| **Fight IQ** | Strategy, adjustment | Jon Jones (5.0) |

### Hidden Attributes (Simulation Only)

Both are weighted composites of the *actual CSV speed/defense values* of whichever fighters were picked for the 8 visible attributes — not derived from the visible ratings themselves. Locked implementation (`src/lib/simulation/derivedStats.ts`):

```
speed   = boxing.speed × 0.35 + kickboxing.speed × 0.35
        + fightIq.speed × 0.15 + wrestling.speed × 0.15

defense = wrestling.defense × 0.30 + boxing.defense × 0.20
        + kickboxing.defense × 0.20 + submissions.defense × 0.15
        + chin.defense × 0.15
```

Wrestling contributing 15% to hidden Speed is intentional — a wrestler's explosiveness/reaction time reasonably informs composite speed, not just striking picks. If either formula changes, update both the code and this section — never let them drift.

**Why hidden:** 8 choices feel good on mobile. Full simulation depth preserved via weighted composites from CSV.

### Data Quality

✅ Clear archetype representation
✅ Realistic distribution (most 2.5–4.5, elite 4.6+)
✅ No single attribute dominates
✅ Specialist fighters create rock-paper-scissors dynamics

---

## MVP Experience Flow

### Landing Page

```
═══════════════════════════════════════════════════════════

         FIVE-STAR MMA

     BUILD THE PERFECT FIGHTER

   Choose the abilities.
   Enter the cage.
   See how long you survive.

      [ BUILD MY FIGHTER ]

═══════════════════════════════════════════════════════════

    12,841 fights today (or omit during early dev)

    EXAMPLE FIGHTER CARD
    ────────────────────
    NIGHTSHIFT
    Record: 18–2
    
    WRESTLING
    Khabib Nurmagomedov — 5.0
    [... 7 more attributes ...]
```

---

### Draft Flow

**8 attributes appear in randomized order.**

For each attribute, show 3 fighters:

```
WRESTLING (ROUND 1 OF 8)

┌──────────────────────────────┐
│ Khabib Nurmagomedov          │
│ Wrestling: 5.0               │
│ (Elite tier)                 │
│ [ SELECT ]                   │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Kamaru Usman                 │
│ Wrestling: 4.9               │
│ (Strong tier)                │
│ [ SELECT ]                   │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Beneil Dariush               │
│ Wrestling: 2.7               │
│ (Solid/Upside tier)          │
│ [ SELECT ]                   │
└──────────────────────────────┘

[ 2 REROLLS REMAINING ]
[ 1 / 8 ]
```

#### Draft Pool Strategy (Locked)

Curated pool of ~70 recognizable fighters per attribute.

**Slot distributions:**

| Slot | Elite (4.8–5.0) | Strong (4.4–4.7) | Solid (3.9–4.3) | Wildcard (<3.9) |
|------|-----------------|------------------|-----------------|-----------------|
| 1 | 50% | 40% | 10% | — |
| 2 | 20% | 50% | 30% | — |
| 3 | 10% | 25% | 35% | 30% |

**Effect:** Fighters reappear across attributes, making opportunity cost real.

> "Should I lock Pereira for Kickboxing now, or wait for Power?"

#### Constraint: One Per Fighter

Once selected, cannot be reused.

**Rationale:** Creates strategic tension, prevents copy-cat builds.

#### Rerolls

2 total rerolls across entire draft.

Refreshes all 3 options for current attribute.

#### Fighter Naming

After draft:

```
┌────────────────────────────────┐
│ NAME YOUR FIGHTER              │
├────────────────────────────────┤
│                                │
│ [ ________________ ]           │
│ (e.g., NIGHTSHIFT, APEX)       │
│                                │
│ [ CONTINUE ]                   │
└────────────────────────────────┘
```

Rules:
- 3–20 characters
- Display name can have spaces
- Handle (URL-safe) auto-generated from display name
- Locked after first ranked fight

---

### Fighter Card

**Pre-ranked:**

```
NIGHTSHIFT
Record: 0–0

WRESTLING
Khabib Nurmagomedov        5.0

BOXING
Conor McGregor             4.8

[... 6 more ...]
```

**Post-ranked:**

```
NIGHTSHIFT
Record: 4–1
Elo: 1,247
Streak: W4

WRESTLING
Khabib Nurmagomedov        5.0
[... rest ...]
```

**Note:** No "Build Quality" score shown. Users form own opinions.

---

### Matchmaking & Opponent Reveal

**Find Fight** triggers matchmaking:

```
MATCHMAKING COMPLETE

YOUR FIGHTER
NIGHTSHIFT
Record: 4–1
Elo: 1,042

     VS

OPPONENT
WRESTLEGOD
Record: 3–2
Elo: 1,079

[ FIGHT ]  [ FIND DIFFERENT OPPONENT ]
```

Search radius: ±100 Elo initially, expands if no matches.

---

### Fight Presentation

Simulation completes server-side **instantly**.

Client reveals result gradually to create drama:

```
ROUND 1

0:31  NIGHTSHIFT lands sharp jabs.
0:47  WRESTLEGOD changes levels...
0:49  TAKEDOWN SECURED.
1:03  NIGHTSHIFT works back to feet.
1:47  Big right hand!

⚠️ WRESTLEGOD IS HURT

[ROUND 1 COMPLETE]

ROUND 2
[continuing...]
```

**Pacing:** ~30–45 seconds total fight reveal.

---

### Result Screen

#### Win

```
🏆 VICTORY 🏆

KNOCKOUT — ROUND 2, 1:42

NIGHTSHIFT
5–1
+28 Elo
1,070 (↑ from 1,042)

═══════════════════════════════

KEYS TO THE FIGHT

POWER ADVANTAGE
5.0 vs 4.2
You created significantly more KO danger 
during striking exchanges.

CARDIO ADVANTAGE
5.0 vs 3.9
Your opponent faded in Round 2.

WHERE YOU WERE VULNERABLE

WRESTLING
4.0 vs 5.0
Opponent completed 2 of 3 takedowns.

═══════════════════════════════

STATISTICS

Significant strikes: 51 / 89 vs 28 / 74
Takedowns: 1 / 2 vs 2 / 3
Control time: 0:42 vs 2:18
Submission attempts: 1 vs 0

═══════════════════════════════

[ RUN IT BACK ]  [ CHANGE BUILD ]
[ SHARE RESULT ]  [ FIGHTER PROFILE ]
```

#### Loss

```
YOUR FIRST LOSS

SUBMISSION — ROUND 3

NIGHTSHIFT
4–2
-15 Elo
1,027 (↓ from 1,042)

═══════════════════════════════

HE BEAT YOU WHERE YOU'RE WEAKEST

WRESTLING (4.0 vs 5.0)
He controlled this fight on the mat. 
Your takedown defense needs work.

CARDIO (5.0 vs 4.8)
Similar stamina. Fight came down to 
better decisions late.

═══════════════════════════════

[ RUN IT BACK ]  [ FIGHTER PROFILE ]
```

**Explanation approach:**

Extract actual evidence from simulation (TD attempts, success %, control time).

No invented causality coefficients.

---

## Product Identity

### Visual Language

**Premium sports broadcast × fight poster × underground gaming**

Dark, bold, clean. Not a spreadsheet.

### Design System

**Colors:**
- Background: #0F0F0F (near black)
- Surfaces: #1A1A1A (charcoal)
- Text: #F5F5F5 (off-white)
- Accent: #FF3333 (blood red, sparingly)
- Highlight: #FFD700 (gold for elite)

**Typography:**
- Display (fighter names, big numbers): Bold condensed sans-serif (Oswald, DM Sans)
- Body: Clean sans-serif (Inter, SF Pro)
- Stats: Monospace

**Motion:**
- Card selection: subtle slam (100–150ms)
- Reveal: staggered fade-in
- Impact: screen shake on major events

**Restraint:**
- No gradients unless essential
- No animation overload
- Dark mode primary
- Consistent 8px grid spacing

---

## Game Design: Draft System

### Why Draft Matters

**The draft IS the game.**

Simulation validates your choices.

Draft creates attachment.

### Draft Pool Architecture

**Curated 70 fighters** (subset of 317) per attribute.

Classify by tier:
- Elite (4.8–5.0): Clear best
- Strong (4.4–4.7): Top-tier
- Solid (3.9–4.3): Very good
- Wildcard (<3.9): Interesting

**Slot weightings** (per section above):
- **Slot 1:** Pushes elite choices
- **Slot 2:** Forces strong/solid balance
- **Slot 3:** Introduces chaos + discovery

**Effect:** Players see desirable fighters multiple times across attributes, creating real opportunity cost.

### Why 8 Attributes, Not 10

**Time budget:**
- 8 × ~5 sec per choice = ~40 seconds
- + naming, reveal, matchmaking = 60–90 sec total
- Achievable on mobile

**Depth:**
- 8 visible + 2 hidden = full simulation complexity
- Hidden Speed/Defense derived from CSV actual values
- No strategy lost; cleaner UX gained

---

## Game Design: Fight Simulation

### Architecture

**Pure function:**
```
simulateFight(fighterA, fighterB, seed, rng) → Fight
```

**No database access during simulation.**

Testable, deterministic, portable.

### Inputs

Fighter snapshots (frozen at fight time):

```json
{
  "name": "NIGHTSHIFT",
  "selections": {
    "wrestling": { "fighter": "Khabib", "csv_rating": 5.0 },
    // ... 8 attributes
  }
}
```

### Structure

**3 rounds, ~5 min per round, 20–25 exchanges per round (~75 total).**

Each exchange:
1. Determine initiative (speed, fight IQ, fatigue, RNG)
2. Choose preferred action (strikers favor striking, etc.)
3. Resolve action (compare skill vs defense)
4. Apply damage + fatigue
5. Check finish conditions
6. Update position

### Positions

- **Distance** (neutral striking range)
- **Clinch** (close quarters, tied up)
- **Top Ground** (on top, dominant)
- **Bottom Ground** (underneath, defender)

### Actions by Position

**Distance:**
Jab, power shot, kick, clinch, takedown attempt, evasion

**Clinch:**
Strike, takedown, disengage

**Top Ground:**
Ground strikes, submission attempt, position improve, allow stand-up

**Bottom Ground:**
Escape, strike, position improve, stand-up attempt

### Probability Model

Base formula (bounded randomness):

```
skill_diff = attacker_skill - defender_skill
base_prob = 0.5 + (skill_diff × adjustment_factor)
clamp(probability, 0.10, 0.90)

Apply situational modifiers:
  - Fatigue
  - Position advantage
  - Recent fight pattern
  - Cumulative damage
```

**Result:** Better builds win more often (~75–85% elite vs novice), but not always. Matchups matter.

### Fatigue System

**Two pools:**

**Energy (per-round):**
- Resets ~80% between rounds
- High-cardio recovers better
- When depleted: speed −30%, power −25%, takedown success −15%

**Cumulative Fatigue (across fight):**
- Does NOT reset
- Accumulates from all actions + damage
- Affects recovery rate between rounds

**Effect:** Max Holloway (5.0 cardio) outlasts early-round pressure. Lower cardio fighters fade Round 3.

### Damage System

Track three zones:
- **Head:** Increases KO vulnerability
- **Body:** Accelerates fatigue
- **Leg:** Reduces speed

Example: Head damage 70%+ → KO risk +100%.

### Finish Conditions

**Knockout:**
Triggered when head damage + recent impact exceed threshold.
Depends on: chin, defense, accumulated damage.

**Submission:**
Only from advantageous positions (top ground, clinch rear).
Depends on: submission skill, opponent escape skill, position.

**Decision (if no finish):**
Score each round based on:
- Effective striking
- Damage dealt
- Grappling control
- Submission attempts

Judges: Unanimous, Split, or Majority decision.

### Derived Stats (Hidden, Used in Simulation)

```
takedown_offense = wrestling × 0.70 + fight_iq × 0.20 + power × 0.10
takedown_defense = wrestling × 0.60 + speed × 0.20 + defense × 0.20
knockout_threat = power × 0.50 + boxing × 0.25 + speed × 0.15 + fight_iq × 0.10
cardio_efficiency = cardio × 0.70 + chin × 0.20 + fight_iq × 0.10
[... etc ...]
```

### Deterministic Replay (Locked)

Every fight stores:

```json
{
  "seed": 482910472,
  "engine_version": "v0.1",
  "fighter_data_version": "20260921-v1",
  "fighter_a_snapshot": { /* full attributes */ },
  "fighter_b_snapshot": { /* full attributes */ },
  "result": { /* winner, method, round, time */ }
}
```

**Seeded RNG (NOT Math.random()):**

```typescript
import seedrandom from 'seedrandom';

const rng = seedrandom(seed.toString());
// All randomness: rng.next() returns 0.0–1.0
```

**Replay:** Same seed + same engine version = bit-for-bit identical fight.

### Balance Validation (Week 1)

Before any UI, build a 100k battle harness. **Note on target numbers:** the table below is the *original pre-simulation estimate* — written before a single fight had ever run, kept here for history. The actual validated numbers (`BALANCE_REPORT.md`, `src/lib/simulation/invariants.test.ts`) superseded it, and one target turned out to be wrong in an instructive way:

```
Elite Striker vs Novice:     ~80% elite win        [not yet re-validated post-engine-rewrite]
Elite Wrestler vs Novice:    ~78% elite win        [not yet re-validated post-engine-rewrite]
Elite Striker vs Elite Wrestler: ~52% striker win  [WRONG — see below]
Identical fighters:          ~50% each             [confirmed: 49.6%]
5.0 cardio vs 2.0 cardio:    ~58% high-cardio win  [confirmed: ~63%]
```

**The "~52%" elite-striker-vs-elite-wrestler target was never re-examined after multiple tuning passes chased it — it was a guess, not a derived number, and it was wrong.** Actual measured result fluctuates in the 66-72% range for the wrestler as engine correctness fixes have landed (see `BALANCE_REPORT.md` for the exact current number — it has moved several times as real bugs were fixed, e.g. a no-op `improvePosition` action was removed, which alone shifted it ~5 points, and will keep moving as more engine work lands; don't treat any single snapshot as final). What's been established methodologically, and holds regardless of the exact current number: an initial diagnosis (matchup sweep against balanced/submission-specialist builds) correctly ruled out "wrestling beats striking as categories," but used a fixture that wasn't stat-budget-neutral, confounding "takedown defense matters" with "this fighter got stronger overall." A follow-up **budget-neutral wrestling-investment sweep** (`scripts/wrestling-sweep.ts`) fixed this — wrestling moves in fixed steps with the delta redistributed proportionally so total stat budget is identical throughout — and found a clean, monotonic, near-linear relationship between wrestling investment and win rate, with the budget confound accounting for only ~22% of the originally-observed improvement, not most of it. At full budget-neutral investment, the striker archetype actually flips the matchup by trading offense for defense in equal amounts.

The real mechanic: grappling weakness compounds (taken down → trapped → damage/control/sub-attempts accumulate while stuck), striking weakness doesn't (losing exchanges at distance isn't a trap). That's an intentional-feeling asymmetry, not a bug — it echoes a real MMA truism (control the position, control the fight) — so **the target is no longer "~50%,"** it's "no archetype should be able to farm every other archetype, and each attribute's marginal value should be measurable and legible." Only wrestling has been swept this rigorously so far — the other 7 attributes should get the same budget-neutral treatment before any of them are assumed balanced. See `BALANCE_REPORT.md` for full numbers and methodology.

Run invariant tests:
- Same seed = identical fight
- Swap A ↔ B positions → same statistics
- No submission from impossible state
- No KO after fight already ended
- Energy never negative
- No single stat predicts >70% win alone (confirmed: single-maxed-stat builds land ~52%)

---

## Game Design: Competition & Matchmaking

### Two Fight Types (Locked)

#### RANKED FIGHTS (Server-Matchmade)

```
Opponent:        System selects (cannot preview + dodge)
Affects:         Ranked Record + Elo
Defense limit:   Max 5 per 24h (then 75%→50%→25% rating impact)
Decline:         Can decline & requeue for different opponent
```

#### CHALLENGE FIGHTS (Peer-Initiated)

```
Trigger:         Friend sends: fivestarmma.com/f/nightshift
Opponent:        Specific fighter (no choice)
Affects:         Head-to-head record only (local, not global)
Rating impact:   NO RANKED ELO in v1 MVP
Rematches:       Unlimited
```

**Why split:**
- Ranked = competitive integrity
- Challenge = social feature
- Prevents griefing (ranked limited, challenge unlimited)

### Elo System

Starting rating: **1000**

After each fight:
- Winner gains rating
- Loser loses rating
- Magnitude depends on expected outcome (upset = more swing)

Display: **Elo: 1,247**

---

### Record: Ranked is Prestigious

Fighter card shows:

```
NIGHTSHIFT

RANKED RECORD
34–7
Elo: 1,512
Streak: W6

HEAD-TO-HEAD
vs CHRIS:  3–2
vs ALEX:   1–0
```

Challenge battles don't appear on global card.

---

### Fighter Immutability (Locked)

**Before first ranked fight:**
- Can build/rebuild attributes
- Can rename
- Can practice (CPU fights optional)

**After first ranked fight:**
- Build LOCKED forever
- Record permanent
- Handle/name frozen
- Want to try new build? → Retire this fighter, create new (0–0)

**Why:** Identity protection. Record means something.

---

## Persistence & Social Features

### User Accounts

**Authentication:** Google, Apple, Email magic link (no passwords)

**Anonymous-first flow:**

```
User lands on /f/nightshift

↓ Server issues: signed guest_token (7-day expiry)

↓ User builds + fights CPU (all local to token)

↓ Result: "Save your fighter?"

↓ User signs up (Google/Apple)

↓ Server verifies token → reruns CPU fight → persists everything

↓ Token invalidated
```

**No guest database needed.** Fights regenerated from seed + snapshot.

### Fighter Persistence

Each fighter maintains:
- Ranked record (wins / losses)
- Finish breakdown (KOs, Subs, Decisions)
- Current streak
- Best streak
- Elo rating
- Total fights
- Created date
- Immutable build

### Fighter Profile

```
@nightshift

FIGHTER: NIGHTSHIFT

RANKED RECORD
34–7

9 KO
4 SUB
5 DEC

Streak: W6
Best: W12

Elo: 1,512

RECENT FIGHTS
🟢 vs SubmissionLab — KO R2 — 2 days ago
🟢 vs CageKing — DEC — 4 days ago
🔴 vs TopDog — SUB R1 — 5 days ago

[ CHALLENGE ME ]  [ SHARE FIGHTER ]
```

---

### Challenge System (Viral Core)

Every fighter gets a shareable link:

```
fivestarmma.com/f/nightshift
```

When friend visits:

```
NIGHTSHIFT IS CALLING YOU OUT

Record: 34–7
Elo: 1,512

[ BUILD A FIGHTER AND FACE THEM ]
```

**Flow:**
1. Friend clicks link
2. Lands on fighter profile + CTA
3. Clicks "BUILD"
4. Drafts their fighter
5. First opponent: automatically the fighter who challenged them

**This is the viral loop.**

---

### Sharing

Three share surfaces generate social cards:

**Fighter Card:**
```
"Think your fighter beats mine?"
[1080×1920px vertical image]
fivestarmma.com/f/nightshift
```

**Fight Result:**
```
"NIGHTSHIFT def. WRESTLEGOD — KO R2"
[1080×1920px vertical image]
fivestarmma.com/fight/AK39D
```

**Challenge Link:**
```
"Build a fighter and fight mine"
fivestarmma.com/f/nightshift
```

Images generated server-side (sharp/satori), cached in Vercel Blob.

---

## Technical Architecture

### Stack (Locked)

| Layer | Technology | Rationale |
|-------|---|---|
| Frontend | Next.js 16 LTS | Vercel native, SSR for social cards |
| Language | TypeScript | Type safety across full stack |
| UI | React 19 + Tailwind 4 | Fast iteration, consistency |
| API | Next.js API Routes | Colocated, simple |
| Database | PostgreSQL 15+ (Supabase) | JSONB snapshots, transactions |
| ORM | Prisma 5.8+ | Type-safe, migrations |
| Auth | Auth.js (nextauth) | No password management |
| Random | seedrandom 3.0+ | Deterministic seeding |
| Analytics | PostHog | User behavior (mandatory) |
| Errors | Sentry | Crash reporting (mandatory) |
| Hosting | Vercel + Supabase | No ops burden |

### Why Supabase (Over Self-Hosted)

- No infrastructure management
- Backup/recovery built-in
- Row-level security (for future)
- Reasonable pricing
- Easy to scale

### Why Auth.js (Over Supabase Auth)

- More flexible provider setup
- Industry standard
- Clean TypeScript support
- Can swap providers later

---

## Database Schema

### Core Tables

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  auth_provider VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Fighters (user-created)
CREATE TABLE fighters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) UNIQUE NOT NULL,
  handle VARCHAR(50) UNIQUE NOT NULL,
  elo INT DEFAULT 1000,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  ko_wins INT DEFAULT 0,
  submission_wins INT DEFAULT 0,
  decision_wins INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  fights_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Fighter Selections (the 8 picks)
CREATE TABLE fighter_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fighter_id UUID NOT NULL REFERENCES fighters(id) ON DELETE CASCADE,
  attribute_name VARCHAR(50) NOT NULL,
  source_fighter_id INT NOT NULL REFERENCES source_fighters(id),
  source_fighter_name VARCHAR(100),
  source_value DECIMAL(3,1),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fighter_id, attribute_name)
);

-- Source Fighters (the 317 from CSV)
CREATE TABLE source_fighters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  wrestling DECIMAL(3,1),
  submissions DECIMAL(3,1),
  boxing DECIMAL(3,1),
  kickboxing DECIMAL(3,1),
  defense DECIMAL(3,1),
  cardio DECIMAL(3,1),
  power DECIMAL(3,1),
  chin DECIMAL(3,1),
  fight_iq DECIMAL(3,1),
  speed DECIMAL(3,1),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Fights
CREATE TABLE fights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fighter_a_id UUID NOT NULL REFERENCES fighters(id),
  fighter_b_id UUID NOT NULL REFERENCES fighters(id),
  winner_id UUID NOT NULL REFERENCES fighters(id),
  
  -- Snapshots (immutable)
  fighter_a_snapshot JSONB NOT NULL,
  fighter_b_snapshot JSONB NOT NULL,
  
  -- Versioning for reproducibility
  seed BIGINT NOT NULL,
  engine_version VARCHAR(20),
  fighter_data_version VARCHAR(20),
  
  -- Results
  result_method VARCHAR(20), -- 'KO', 'TKO', 'SUB', 'DEC'
  result_round INT,
  result_time_seconds INT,
  
  -- Rating changes
  fighter_a_elo_before INT,
  fighter_b_elo_before INT,
  fighter_a_elo_after INT,
  fighter_b_elo_after INT,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Idempotency
  idempotency_key UUID UNIQUE
);

-- Fight Events (per-exchange details for replay)
CREATE TABLE fight_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id UUID NOT NULL REFERENCES fights(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  round INT NOT NULL,
  fight_time_seconds INT,
  event_type VARCHAR(100),
  actor_id UUID NOT NULL REFERENCES fighters(id),
  target_id UUID NOT NULL REFERENCES fighters(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Fight Statistics
CREATE TABLE fight_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id UUID NOT NULL REFERENCES fights(id) ON DELETE CASCADE,
  fighter_id UUID NOT NULL REFERENCES fighters(id),
  
  significant_strikes_attempted INT DEFAULT 0,
  significant_strikes_landed INT DEFAULT 0,
  takedowns_attempted INT DEFAULT 0,
  takedowns_landed INT DEFAULT 0,
  control_seconds INT DEFAULT 0,
  submission_attempts INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fight_id, fighter_id)
);
```

### Indexes

```sql
CREATE INDEX idx_fighters_handle ON fighters(handle);
CREATE INDEX idx_fighters_user_id ON fighters(user_id);
CREATE INDEX idx_fighters_elo ON fighters(elo DESC);
CREATE INDEX idx_fights_fighter_a_created ON fights(fighter_a_id, created_at DESC);
CREATE INDEX idx_fights_fighter_b_created ON fights(fighter_b_id, created_at DESC);
CREATE INDEX idx_fights_created ON fights(created_at DESC);
CREATE INDEX idx_fights_idempotency_key ON fights(idempotency_key) UNIQUE;
CREATE INDEX idx_source_fighters_name ON source_fighters(name);
```

---

## Week 1 Parallel Tracks

**Do NOT build sequentially. Build two systems in parallel.**

### TRACK A: Draft Prototype

**Goal:** Validate that picking fighters is addictive.

**Scope:**
- Ugly UI (no design system yet)
- 8-attribute draft
- Curated 70 fighters per attribute
- Tier-weighted slot distribution
- Generates visual fighter card
- Can see picks before locking
- Can restart/reroll
- NO simulation yet

**Testing:**
- Show to 20 MMA fans
- Watch: Do they want another draft immediately?
- Do they send their card to a friend?
- Do they iterate on builds?

**Output:** Evidence that draft loop works or needs rethinking.

**Tech:** React + Tailwind (fast iteration, not polished)

### TRACK B: Simulation Harness

**Goal:** Validate that fights feel coherent.

**Scope:**
- Headless (no UI, no database)
- 8-attribute input
- Seeded RNG
- Fight snapshots
- 100k battle runs
- Invariant test suite
- Output: balance matrices

**Testing:**
- Elite Striker vs Novice: Is it 78–84% elite win?
- Elite Wrestler vs Elite Striker: ~52% matchup?
- Identical builds: ~50%?
- 5.0 cardio vs 2.0 cardio: Measurable late-round difference?

**Output:** Validated probability model. Ready for game integration.

**Tech:** TypeScript + Jest (no database yet)

---

## Success Metrics

### Primary (North Star)

**Second Fight Rate:** % of players who complete second fight after first
- Target: >60%
- Why: First could be curiosity; second = genuine interest

**Challenge Rate:** % of saved fighters that generate ≥1 challenge link
- Target: >40%
- Why: Indicates willingness to share

**Challenge Conversion:** % of challenge recipients who complete fighter build
- Target: >25%
- Why: Measures viral loop

### Secondary

**Retention:**
- D1: >40% return within 24h
- D7: >20% return within 7d

**Engagement:**
- Avg fights/fighter: >3
- Median fighter lifetime: >7 fights
- Rematch rate: >30%

**Quality:**
- Crash rate: <0.1%
- Fight consistency: 100% (same seed = same result)

### Instrumentation (Mandatory from Week 1)

PostHog events:
```
landing_viewed
attribute_selected
reroll_used
build_completed
first_fight_started
first_fight_completed
second_fight_started ← CRITICAL
account_created
fighter_saved
challenge_link_created
challenge_link_clicked
challenge_completed
fighter_shared
```

Sentry errors (all crashes tracked).

---

## Legal & Brand

### Fighter Names & Likenesses

**Current status:** Real fighter names used.

**Before public launch:** Require legal review by sports-IP attorney.

**Recommended phases:**

| Phase | Approach | Status |
|-------|----------|--------|
| Private MVP | Real names (documented) | Proceed |
| Friend beta | Real names (documented) | Proceed |
| Public beta | Legal review completed | Hold until cleared |
| v1.0 public | Clear legal path decided | After review |

**Data provenance (document before public launch):**

```
Fighter Rating Source
- Creator: [Your friend]
- Methodology: Expert evaluation
- Date: [When created]
- License: Internal (MVP)
- Copyright: [Your company]

Use of Fighter Names
- Current: Real names with disclaimer
- Legal status: Pending review
```

### Brand Strategy

**Do:**
- Own league branding (Five-Star MMA, unique logo)
- Custom terminology
- Distinct UI (no UFC branding)

**Don't:**
- Use UFC logos/colors
- Claim UFC affiliation
- Use copyrighted fight footage

---

## MVP Expansion Roadmap

**Post-Launch (Not MVP):**

1. **Rivalries** — Track H2H records
2. **Championships** — Belts, persistent rankings
3. **Events** — Showcase featured cards
4. **Weight classes** — Separate competitive pools
5. **Seasons** — Fresh ladder, persistent records
6. **Gyms** — Team/group feature
7. **Training** — Slow evolution mechanics
8. **Dynamic commentary** — LLM-powered
9. **Mobile app** — React Native or native
10. **Licensed imagery** — Real fighter photos (post-legal-review)

---

## Release Readiness

**MVP launches when:**

- ✅ Draft feels genuinely strategic (Track A validation)
- ✅ Simulation feels coherent (Track B validation)
- ✅ Fighter card is share-worthy
- ✅ Result explanations are accurate
- ✅ Mobile performance: <3s page load
- ✅ Challenge flow works end-to-end
- ✅ Users can create accounts & save fighters
- ✅ No obvious exploits
- ✅ Visual design is distinct
- ✅ Invariant tests pass 100%
- ✅ Legal path decided

---

## Document Status

**Version:** Final (Consolidated)  
**Date:** Week 0 Lock (After Friend Review Round 2)  
**Readiness:** Ready for Week 1 Execution  

**Sign-offs required before coding:**

- [ ] Chukwudi (agrees all decisions)
- [ ] Friend (agrees all decisions)
- [ ] Team lead (agrees Week 1 scope)

---

**This is the single authoritative design document.**

Reference it for any question during implementation.

Archived documents (DESIGN_CORRECTIONS.md, WEEK_0_DESIGN_DECISIONS.md, LOCKED_DECISIONS.md) are for historical reference only.

---

**When developers ask: "What should we do here?"**

Answer: "Check DESIGN_FINAL.md."

Done.
