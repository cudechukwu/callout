# Balance Report — Simulation Engine v0.1

**Status:** v0.1 balance adopted (see "Adopted tuning") and **frozen pending human playtesting.** Do not rebalance from synthetic tests alone; change it only when a playtest observation produces a specific hypothesis. Sections before "Adopted tuning" are a chronological log measured under earlier versions of the engine.
**Tool:** `npm run balance:report [iterations]` (default 20,000/matchup)
**Test coverage:** `src/lib/simulation/invariants.test.ts` (regression guards, 3,000/matchup)

This exists because `DESIGN_FINAL.md` and `LOCKED_DECISIONS.md` both say, correctly: **don't hand-tune coefficients by intuition — build the harness, then let it expose problems.** This is that process, with real before/after numbers, not just the target table those docs proposed before any fight had ever been simulated.

---

## Timeline

### Baseline (first working engine, before any tuning)

Ran `npm run balance:report 20000` immediately after `simulateFight()` was first complete:

| Matchup | Win rate | KO | TKO | SUB | DEC |
|---|---|---|---|---|---|
| All-Elite vs All-Weak | 99.9% | 20.4% | 0.0% | **79.4%** | 0.1% |
| Neutral vs Neutral | 50.1% | 10.2% | 0.0% | **53.8%** | 36.0% |
| Elite Striker vs Elite Wrestler | **10.2%** (striker) | 6.8% | 0.0% | **83.9%** | 9.3% |
| High Cardio vs Low Cardio | 59.0% | — | — | — | — |
| High Chin vs Low Chin | 52.2% | — | — | — | — |
| High Wrestling vs Low Wrestling | 82.4% | 8.6% | 0.0% | 65.1% | 26.4% |
| Single Stat (Power) vs Neutral | 51.7% | — | — | — | — |

**Two problems immediately visible:**
1. Submissions were winning 54-84% of fights across the board — nowhere close to realistic.
2. The Elite Striker vs Elite Wrestler matchup was 10/90 — directly contradicting `DESIGN_FINAL.md`'s explicit requirement: *"wrestlers are not universally stronger than strikers."*

---

### Fix 1: Submission finish-rate compounding

**Root cause:** Once a fighter reaches top position, they keep acting ~72% of the time (by design — the fighter in control dictates pace). At ~22 exchanges/round, that's 15+ consecutive opportunities. `submissionAttempt` was selected on ~36% of those (selection weight), and each landed attempt had a flat 25% base finish chance. Individually those numbers looked reasonable; compounded across a sustained top-control sequence, they approached "almost certain to finish" long before any single coefficient looked broken.

**Changes:**
- `checkForSubmissionFinish` base probability: `0.25` → `0.08` (range tightened to `[0.02, 0.5]`)
- `submissionAttempt` selection weight (`actions.ts`): baseline `0.5`→`0.3`, scale `2.0`→`1.0`

**Result (20,000/matchup):**

| Matchup | SUB rate before | SUB rate after |
|---|---|---|
| Neutral vs Neutral | 53.8% | **11.9%** |
| Elite Striker vs Elite Wrestler | 83.9% | 44.1% |
| All-Elite vs All-Weak | 79.4% | 56.4% |

Neutral matchup's SUB rate is now in a realistic range, with **decisions becoming the dominant outcome (71-74%)**, matching real MMA finish-rate distributions. Extreme matchups (all-elite vs all-weak) still show an elevated SUB rate — expected, since a fighter with zero defensive stats has no realistic counter once controlled.

---

### Fix 2: Ground-control time distribution

**Hypothesis:** The 0.72 top-acts-probability baseline gave the trapped fighter too few escape attempts per round, contributing to the striker-vs-wrestler imbalance.

**Change:** `topActsProbability` baseline `0.72` → `0.62` (range `[0.55,0.9]` → `[0.5,0.8]`)

**Result:** Elite Striker vs Elite Wrestler win rate: **unchanged at 16.1%** (was 16.1% before this specific change — the earlier submission fix had already moved it 10.2%→16.1%). Finish-method mix shifted (SUB 50.4%→44.1%, DEC 39.2%→44.9%) but win rate didn't move. **This told us position-time wasn't the dominant lever for this specific imbalance** — informative negative result, kept the change since it's directionally correct and harmless to everything else, but moved on to find the real cause rather than iterating blindly on this same lever.

---

### Fix 3: Decision-scoring formula (the actual root cause)

**Diagnosis:** Ran a targeted diagnostic (not part of the shipped harness — a one-off script) over 2,000 Elite-Striker-vs-Elite-Wrestler fights, isolating decisions specifically:

```
Striker avg significant strikes landed/attempted: 7.3 / 12.7
Wrestler avg significant strikes landed: 3.5
Wrestler avg takedowns landed: 2.42
Wrestler avg control seconds: 249.5
Wrestler avg submission attempts: 3.18

Decisions: 908, of which striker out-struck wrestler but still lost: 681 (75%)
```

The striker was landing **more than double** the wrestler's significant strikes and losing the decision **75% of the time anyway**. The old scoring formula (`strikes×1.0 + takedowns×5.0 + control×0.05/sec + subAttempts×3.0`) gave a wrestler with those average stats ~34 points from grappling alone — no realistic striking output could compete.

**Change:**
```
Old: strikes×1.0 + takedowns×5.0 + control×0.05 + subAttempts×3.0
New: strikes×2.0 + takedowns×2.5 + control×0.015 + subAttempts×1.5
```

At the sampled averages above: old formula gave wrestler=34.0 vs striker=7.3 (wrestler wins by 26.7). New formula gives wrestler=14.6 vs striker=14.6 (**near parity** for that specific sample).

**Result (20,000/matchup):** Elite Striker vs Elite Wrestler win rate: **16.1% → 27.9%** for the striker. Real, verified movement in the right direction. Other matchups stayed stable or improved slightly (High Wrestling vs Low Wrestling: 83.0%→79.1%, moving toward a healthier range).

---

### Fix 4: Structural correctness bugs (round reset + per-round decision scoring)

**A second-pass architecture review** (after Fixes 1-3, on the code as it stood with a 27.9%/72.1% striker/wrestler split) found two real semantic bugs that were flagged as more fundamental than anything coefficient-tuning could fix — and warned that the balance numbers above might partly be *compensating* for broken mechanics rather than reflecting genuine style balance:

1. **Rounds never reset position.** `positions` was initialized once before the round loop and never touched again between rounds. A fighter who ended round 1 on the ground started round 2 on the ground too — MMA rounds always restart standing. This mechanically favored whichever fighter controlled the *end* of a round, compounding across all 3 rounds.

2. **Decisions scored the whole fight's cumulative stats once, not round-by-round.** `computeRoundScore` was named for per-round scoring but was actually called once at the end on 15 minutes of aggregated totals. A fighter who dominated rounds 1-2 could lose the "decision" to an opponent who only dominated round 3 — not how MMA judging works, and it meant a large, late accumulation (e.g. sustained round-3 control) could outweigh clearly winning the fight overall.

**Fixes:**
- Position now resets to `distance` at the start of every round.
- Per-round stats are now tracked separately (`roundStats`, reset each round) alongside the cumulative box score (`stats`, unchanged). Each round is scored independently via `computeRoundScore` and produces a single round winner (ties broken by RNG). The fight's decision winner is whoever wins the majority of the 3 rounds — not the fighter with the higher 15-minute cumulative total.
- Also, while in this code: leg damage now degrades every mobility-dependent action (previously only `clinchEntry`/`disengage`) and initiative (previously not at all) — a fighter with a badly damaged leg is now actually slower everywhere, not just when explicitly entering/exiting the clinch.

Also fixed as part of the same review: `AttributeSelection`'s redundant `attribute` field (could disagree with its own object key, same bug class as the earlier sourceFighter-lookup fix — removed rather than validated), `FightPosition` changed from two independently-mutable per-fighter records to one shared discriminated union (eliminates "both fighters topGround at once" as a representable state), `FightResult.timeSeconds` renamed to `roundTimeSeconds` after discovering the harness was silently summing round-relative time as if it were total elapsed time, and `Combatant`'s initial fatigue/damage now spread into fresh objects instead of sharing a reference between both fighters.

**Result (20,000/matchup, zero coefficient changes — pure correctness fix):**

| Matchup | Before (Fix 3) | After (Fix 4) |
|---|---|---|
| Elite Striker vs Elite Wrestler | 27.9% | **34.1%** |
| Neutral vs Neutral | 50.0% | 49.5% |
| High Wrestling vs Low Wrestling | 79.1% | 75.3% |
| High Cardio vs Low Cardio | 64.5% | 62.9% |
| High Chin vs Low Chin | 53.1% | 52.7% |
| Single Stat (Power) vs Neutral | 52.5% | 52.2% |
| All-Elite vs All-Weak | 99.9% | 99.9% |

**This confirms the review's exact hypothesis:** a meaningful chunk of the remaining striker/wrestler imbalance really was the state-machine bugs, not a coefficient problem — fixing mechanics alone (no tuning) moved the gap another 6.2 points. Everything else held stable, which is what you want from a correctness fix: it shouldn't reshuffle matchups that were already behaving reasonably.

---

### Fix 5: Judge-RNG isolation + action-class-scoped fatigue/leg modifiers

**A second review pass** (on the code as it stood after Fix 4, at 34.1%/65.9%) found two more architectural issues, both fixed for correctness/modeling-intent reasons rather than because they were expected to move the striker/wrestler number:

1. **Judging could alter the physical fight it was judging.** `scoreRound`'s tie-break consumed an `rng.next()` draw *inside* the round loop — a tied round shifted every subsequent RNG draw, meaning rounds 2-3's actual events depended on whether round 1 happened to tie. Determinism (same seed → same result) was never broken, but changing judging logic later could silently change a stored fight's replay even though nothing about the physical simulation changed. **Fix:** round-by-round stats are now collected into `completedRounds` during the loop with no scoring; `scoreDecision` only runs — and only then consumes RNG — after all 3 rounds have fully finished. Judging now operates strictly on a frozen snapshot of what already happened.

2. **The leg-damage fix from Fix 4 was too broad.** Applying `legDamageSpeedMultiplier` to every contested action's attacker/defender stat (per the first review's "every mechanic consuming speed goes through this" recommendation) meant a damaged leg also degraded submission offense, submission defense, and ground escape by up to 40% — grappling technique that has little to do with leg speed specifically. **Fix:** introduced `ActionClass` (`striking`/`takedown`/`grappling`/`movement`) with a `LEG_DAMAGE_INFLUENCE` table scaling the penalty per class (1.0 for movement, 0.75 for takedowns, 0.5 for striking, 0.0 for grappling) — and replaced the fatigue system's implicit `TAKEDOWN_ACTIONS.has(action) ? X : Y` else-branch with the same explicit per-class table, so which fatigue tier governs an action is a named lookup, not an accident of which actions happened to be enumerated.

Also fixed in the same pass: ground-position `determineActor` was comparing raw `derived.initiative` while distance/clinch compared `effectiveInitiative` (fatigue + leg damage applied) — an inconsistency where a fully gassed, leg-damaged fighter kept pristine initiative the moment a fight hit the ground. Both branches now use `effectiveInitiative`.

**Also added, not yet acted on:** `FighterFightStats` now tracks `headDamageDealt`/`bodyDamageDealt`/`legDamageDealt` per round, surfaced in the harness's `averageStats`. This exists because `computeRoundScore` currently weighs every landed significant strike identically (a jab and a head kick both score 2.0) — a review flagged this as a likely contributor to the striker/wrestler gap, since a striker landing fewer but more damaging strikes gets no credit for the difference. The data is now collected so this can be checked directly in the next diagnostic pass, instead of guessing at another coefficient.

**Result (20,000/matchup):** Elite Striker vs Elite Wrestler **34.1% → 33.7%** — within sampling noise, as expected. These were correctness/intent fixes, not balance tuning; the fact that nothing moved meaningfully confirms neither bug was a major contributor to *this specific* matchup, even though both were real problems worth fixing on their own terms. Every other matchup also held within noise.

---

## Current State (after Fix 5)

| Matchup | Win rate | KO | TKO | SUB | DEC |
|---|---|---|---|---|---|
| All-Elite vs All-Weak | 99.9% | 42.1% | 0.2% | 51.6% | 6.1% |
| Neutral vs Neutral | 49.6% | 14.5% | 0.0% | 10.6% | 74.8% |
| **Elite Striker vs Elite Wrestler** | **33.7%** (striker) | 12.3% | 0.0% | 37.5% | 50.2% |
| High Cardio vs Low Cardio | 63.1% | 14.5% | 0.0% | 10.9% | 74.6% |
| High Chin vs Low Chin | 52.8% | 14.3% | 0.0% | 10.6% | 75.1% |
| High Wrestling vs Low Wrestling | 75.5% | 13.7% | 0.0% | 16.2% | 70.0% |
| Single Stat (Power) vs Neutral | 52.2% | 17.4% | 0.0% | 10.6% | 72.0% |

### ✅ Genuinely healthy now:
- Neutral-vs-neutral symmetry: 49.6% (noise-level variance from 50%)
- Neutral-vs-neutral finish distribution: DEC 75% / KO 15% / SUB 11% — matches real MMA's rough shape (majority decision, minority finishes)
- Cardio, chin, and single-stat isolation tests all show meaningful-but-not-deterministic effects (52-63% range)
- No single attribute produces a >65% win rate on its own
- Judging is now provably isolated from the physical simulation (see `scoreRound`/`scoreDecision` purity tests in `engine.test.ts`)
- Leg damage now scales by what it actually should affect, not a blanket penalty on everything

### 🔬 Directionally understood, then properly verified (not "closed" — see below):

**Elite Striker vs Elite Wrestler at 33.7%/66.3% is very likely intentional design, not a bug** — but the first pass at explaining *why* had a real methodological gap, caught by review and then fixed with a controlled experiment. Documenting the full arc here because the correction matters as much as the conclusion.

**First pass (incomplete):** After five rounds of engine fixes plateaued the number (10.2%→16.1%→27.9%→34.1%→33.7%), ran a broader matchup sweep:

```
Wrestler vs Pure Striker:              66.7%
Wrestler vs Balanced (3.5 everywhere): 72.9%   ← HIGHER than vs the pure striker
Wrestler vs Submission Specialist:     83.5%   ← highest of all
Wrestler vs Striker+modest TD defense: 58.0%   ← drops with SOME wrestling (2.0→3.2)
Balanced vs Pure Striker:              striker wins 59.3%
```

This correctly ruled out "wrestling beats striking as categories" (`ELITE_STRIKER` ≈ `ELITE_WRESTLER` in total budget, and the striker beats a balanced build). But it was declared "closed" too quickly. **A review caught the flaw:** `STRIKER_WITH_TD_DEFENSE` raised wrestling 2.0→3.2 *without removing stat budget elsewhere* (total went 30.1→31.3) — so the 66.7%→58.0% shift could have been partly "this fighter is just stronger overall," not "takedown defense specifically matters."

**Second pass (controlled):** Built a budget-neutral sweep (`scripts/wrestling-sweep.ts`, `strikerWithWrestlingInvestment()`/`wrestlerWithWrestlingDivestment()` in `balanceFixtures.ts`) — wrestling moves in 0.5 steps, each point's increase removed proportionally (40% boxing / 40% kickboxing / 20% power) so total budget is *exactly* constant at every step. Two directions, 20,000 fights/point:

```
SWEEP A — striker investing in wrestling, vs FIXED Elite Wrestler:
Wrestling  2.0    2.5    3.0    3.5    4.0    4.5    5.0
Win rate   33.7%  36.1%  38.9%  42.1%  45.4%  49.0%  53.0%

SWEEP B — wrestler divesting from wrestling, vs FIXED Elite Striker:
Wrestling  5.0    4.5    4.0    3.5    3.0    2.5    2.0
Win rate   66.7%  62.6%  58.3%  52.7%  48.3%  44.0%  40.0%
```

**This is a clean, monotonic, almost-linear relationship in both directions** — no cliff, no plateau, if anything slightly *accelerating* returns at the high end rather than diminishing. And it lets us finally answer the confound question with a number instead of a guess: at wrestling=3.2, the budget-neutral striker wins **~40.2%** (interpolated) — versus the original confounded test's **42.0%**. **The budget confound was real but small: ~1.8 of the observed 8.3-point improvement (≈22%) was "free stats," ≈78% was genuinely wrestling-specific.** The review's caution was justified; the original directional conclusion survives with its magnitude only modestly revised, not overturned.

**The more interesting finding is at the far end of Sweep A:** a striker who fully commits — wrestling maxed to 5.0, sacrificing boxing/kickboxing down to 3.8 and power to 4.2, same total budget throughout — actually *wins the majority* (53.0%) against the very wrestler that beat their unmodified self 66.7% of the time. Trading offense for defense, in strictly equal amounts, flips the matchup. That's a genuinely well-behaved marginal-value curve, and it's good evidence the engine isn't just "wrestling good" — it's "the matchup outcome tracks how much of your budget you've committed to not being controlled," which is exactly the kind of legible, learnable strategic texture a draft game wants.

**Status: no longer treated as suspicious, and now actually verified rather than asserted.** The "~52% striker win" target in `DESIGN_FINAL.md` remains retired as a pre-simulation guess (see that doc's Balance Validation section) — but "retired" is a claim about the target, not a claim that the current numbers are definitely correct. Continued monitoring should extend this same budget-neutral sweep methodology to the other 7 attributes (marginal-value curves per stat) before treating any single attribute's value as fully understood.

**One methodological gap this sweep still has** (caught by a later review, not yet fixed): the sweep held each archetype's *hidden* speed/defense baseline constant across its own sweep (so the monotonicity finding is unaffected), but never normalized the hidden baseline *between* the two archetypes — `ELITE_STRIKER`/its sweep variants use hiddenBaseline=4.5, `ELITE_WRESTLER`/its sweep variants use 3.5. That 1.0-point hidden gap is present at every point of both sweeps equally, so it doesn't distort the *shape* of either curve, but it does mean the absolute percentages (33.7% and 66.7% as the two baselines) aren't purely "8-visible-stat-budget-neutral" comparisons — they still carry this constant hidden offset. Worth normalizing in the next round of controlled experiments.

---

### Fix 6: `improvePosition` removed (real behavior bug, not a tuning issue)

**A third review pass** found something the balance discussion had been dancing around: `improvePosition` (available to the top fighter on the ground) had a real contest (`takedownOffense` vs `submissionEscape`), cost energy, and had a selection weight that scaled with a fighter's wrestling — but its success AND failure paths both left `FightPosition` completely unchanged. This engine has no guard/mount/side-control sub-states for it to actually "improve" toward. So it was, mechanically, a fighter spending an exchange and energy to roll a contest whose outcome changed nothing — "fake complexity," per the review.

**Fix:** removed from the `top` action menu (`actions.ts`). Its `RESOLUTION`/`ACTION_CLASS`/preference-weight/cost entries are left defined but unused, so re-adding it is a one-line change whenever ground sub-positions get built.

**This measurably changed the balance numbers again** — removing a "safe" 4th option funnels the top fighter's selection probability into the remaining three (`groundStrike`, `submissionAttempt`, `allowStandUp`), making top control meaningfully more dangerous:

| Matchup | Before Fix 6 | After Fix 6 |
|---|---|---|
| Elite Striker vs Elite Wrestler | 33.7% | **28.5%** |
| High Wrestling vs Low Wrestling | 75.5% | 76.9% |
| Neutral vs Neutral | 49.6% | 49.7% |

This is expected and mechanically explained, not a red flag — it's exactly the kind of shift you'd predict from removing a diluting no-op action. It does mean the specific percentages quoted throughout the "Sweep A/B" tables above (Fix 5-era) are now slightly stale; the *shapes* and *conclusions* of those sweeps aren't invalidated (the redistribution rule and monotonicity argument don't depend on `improvePosition` existing), but a fresh run would shift every number in them by a similar few points. Re-run `npm run balance:wrestling-sweep` before citing exact figures from that section going forward.

**Also fixed in this pass** (cheap, unambiguous, no balance impact):
- `simulateFight` now throws immediately if both fighters share an id (every internal state structure is `Record<fighterId, ...>`; two identical ids would silently collapse into one entry).
- `defensiveMovement` now logs an explicit event instead of silently doing nothing — it's a real "opponent doesn't get hit this exchange" mechanic, but was previously invisible to any future replay/broadcast layer.

### ⚠️ Still open:

1. **All-Elite vs All-Weak is 99.9%, essentially deterministic.** Unchanged. Lower priority — this is the most extreme possible matchup (max vs. min on every attribute) and isn't representative of realistic drafted builds, since the curated draft pool (`LOCKED_DECISIONS.md` Decision 2) intentionally biases toward Elite/Strong/Solid tiers.

2. **Full 100k-per-matchup validation hasn't been run.** All numbers above are from 20,000-fight samples. Run `npm run balance:report 100000` before treating any of these numbers as final.

3. **Harness observability is still averaged over all fights, not segmented.** `averageStats` mixes early finishes with decisions — if a future question is specifically "does decision judging undervalue striker damage," that needs a decisions-only breakdown, not an all-fights average. Same for a submission funnel (selected → contest-established → finished, currently only the final SUB% is visible) and fight geography (% time at distance/clinch/ground, takedown/escape success rates). Add these when a specific question needs them, not speculatively.

4. **Only wrestling has a budget-neutral marginal-value curve, and even that one has the hidden-baseline gap noted above.** The other 7 attributes haven't been swept this way. Given wrestling touches 5 of 11 `DerivedStats` directly plus both hidden composites (30% weight in hidden Defense, 15% in hidden Speed), it may have outsized reach — but boxing/kickboxing each contribute 35% to hidden Speed, so wrestling likely isn't uniquely privileged. Needs measuring per-attribute before drawing conclusions about draft-strategy dominance.

5. **Damage telemetry (`headDamageDealt`/etc.) is a raw unbounded sum, not clamped like the actual `DamageState` it derives from.** A leg that's already at 100 damage and takes another 70 raw damage will show `170` in the telemetry even though the fighter's actual state only reflects 100. Fine for measuring offensive output; would need to switch to "effective damage applied" (clamped) if this is ever fed into decision scoring rather than used as a read-only diagnostic.

---

## Finish-rate tuning (KO/TKO calibration)

**Problem:** even fights ended in decision ~72% of the time, TKO never occurred, and a moderate skill gap barely changed the finish rate (only the extreme All-Elite vs All-Weak matchup finished).

**Diagnostic first** (`npx tsx scripts/damage-diagnostic.ts`, which reconstructs head damage from the event log). Baseline, 10,000 fights/matchup:

| Matchup | Head dmg p50 / p99 | Fights reaching 40+ | KO victim dmg *before* the finishing strike |
|---|---|---|---|
| Neutral vs Neutral | 12.7 / 33.7 | 0.2% | 6.0 |
| Power vs Neutral | 14.9 / 45.2 | 2.3% | 7.7 |
| Elite Striker vs Balanced | 17.9 / 65.3 | 13.4% | 12.4 |

Two findings: (1) `koRiskModifier` was defined over 20/40/60/80 but fights almost never got there, so the accumulated-damage terms were effectively dead and KOs were near-pure lottery (median victim had 6 damage, inside the zero-modifier band); (2) decision fights routinely ended with the losing fighter at 19-35 head damage and no stoppage — TKO existed only as a label (`head >= 85` on a successful KO roll).

### Step 1a — recalibrate the head-damage domain (no output change)
`koRiskModifier` breakpoints 20/40/60/80 → **8/16/24/32**, same output multipliers (0/.15/.35/.6/1.0). Raw strike damage, the 0-100 scale, the 0.03 KO base, submissions, fatigue and action selection untouched (body/leg share the damage scale and drive fatigue/speed, so raising strike damage would have changed those too). This is still a balance change — KO reads post-hit damage — and was measured as one: Neutral DEC 71.5% → 69.8%, Elite Striker vs Balanced KO 19.7% → 24.7%, Power vs Neutral KO 18.2% → 21.5%.

### Step 2 — real TKO mechanic
`checkForKnockout` now always means KO. A separate `checkForStoppage` runs after any head strike that didn't KO: `tkoStoppageRisk(headDamage)` (0 below 12 damage, convex up to 0.25 at 60+) × clamp(knockoutThreat / knockoutResistance, 0.5, 2). TKO can now end a fight with no single knockout blow.

### Result (20,000/matchup)

| Matchup | KO | TKO | SUB | DEC | DEC before (Fix 5 table) |
|---|---|---|---|---|---|
| Neutral vs Neutral | 17.2% | 3.5% | 13.1% | 66.2% | 74.8% |
| Single Stat (Power) vs Neutral | 21.0% | 8.5% | 12.7% | 57.8% | 72.0% |
| High Wrestling vs Low Wrestling | 15.9% | 3.1% | 20.5% | 60.5% | 70.0% |
| Balanced vs Pure Striker | 22.4% | 20.8% | 15.3% | 41.4% | 62.8% |
| Elite Striker vs Elite Wrestler | 13.5% | 10.2% | 44.1% | 32.1% | 50.2% |
| All-Elite vs All-Weak | 40.5% | 13.5% | 45.7% | 0.3% | 6.1% |

Finish rate now tracks damage output: power and striking builds finish far more than neutral builds, wrestling builds still finish mostly by submission, and even builds remain the most decision-heavy.

**Side effect (not intended):** Elite Striker vs Elite Wrestler moved **28.5% → 34.7%** for the striker — strikers can now win by stoppage before wrestlers grind out control. Directionally consistent with DESIGN_FINAL.md's "wrestlers are not universally stronger," but it was not a targeted change. Balanced vs Pure Striker also moved 43.9% → 37.9% (striker better). Re-run `npm run balance:wrestling-sweep` before quoting any Sweep A/B figures above.

**Deliberately not changed yet:** the 0.03 KO base, submissions, fatigue. Neutral is still 66% decisions (higher than UFC's ~50%) — by design for now, since matchup-level targets shouldn't converge to one distribution; revisit the 0.03 base only if the population-level mix looks too decision-heavy.

**Open follow-ups:**
- High Cardio vs Low Cardio has the same finish mix as Neutral (66% DEC): fatigue only affects defense in the final tier (0.8x at 75%+). Candidate for a fatigue-driven stoppage/defense change.
- Chin: High vs Low Chin total finish rate is symmetric by construction; the chin effect shows in *who* gets finished (win rate 53.3%), which is small. Worth a per-fighter finish breakdown.
- TKO constants (floor 12, ceiling 60, max 0.25, stat clamp 0.5-2) are first-pass values.

---

## Attribute value check and OVR validation

**Controlled per-attribute sweep** (`npx tsx scripts/attribute-sweep.ts`, 20,000 fights each): one attribute at 5.0, everything else 3.0, vs an all-3.0 neutral. "Pinned" holds hidden speed/defense at 3.0 (direct effect only); "realistic" gives the boosted pick hidden speed/defense of 5.0 like a real elite row.

| Attribute | Pinned hidden | Realistic hidden |
|---|---|---|
| Wrestling | 68.8% | 74.1% |
| Fight IQ | 64.2% | 66.0% |
| Cardio | 58.9% | 58.9% |
| Submissions | 55.9% | 57.8% |
| Boxing | 55.0% | 62.4% |
| Power | 54.8% | 54.8% |
| Kickboxing | 52.2% | 59.8% |
| Chin | 51.8% | 53.9% |

Wrestling and Fight IQ are clearly the strongest picks; Chin and Power are the weakest; Kickboxing looks weak on its own (52.2%) but gains ~7.6 points through hidden speed, so its value is largely indirect. This replaces the OVR regression weights as evidence about attribute value: those weights are a *prediction* tool, and their predictors are correlated (hidden speed/defense are built from the visible attributes), so a coefficient like kickboxing 0.018 vs wrestling 0.086 is not a causal statement. No attribute has been rebalanced from either result. Different attributes having different strategic value is acceptable; an attribute that feels irrelevant is not — Chin (about +2 points of win rate for +2.0 rating) is the one to watch.

**OVR holdout validation:** fitting on a random 80% of 5,000 sampled drafts and scoring the other 20% gives held-out R² 0.79 (in-sample 0.78; plain average of the 8 visible ratings: 0.65). No sign of overfitting.

---

## Sensitivity (skill expression at the top end)

**Question:** should a top build win a Rampage often enough that 20-0 is attainable? Baseline: builds around 95 OVR win only ~66% against the CPU field (~13/20 Rampage wins, 20-0 well under 0.1%). This is what OVR was defined to mean (70 OVR = 50% field win rate, one point per 0.625%), so it's not a bug — the question is whether the engine expresses skill strongly enough.

**Cause:** two things compound. The draft pool is elite-only (average CPU build rates 4.46/5.0; a 95 OVR build only 4.82, a ~0.36 gap), and `ADJUSTMENT_FACTOR = 0.08` turns such gaps into small contest edges.

**Plumbing (no behavior change):** `simulateFight` now takes an optional `SimulationTuning` (initiative sensitivity + contest sensitivity per action class: striking / takedown / grappling / movement). Defaults equal the old constant; verified byte-identical balance-report output before and after, and a test guards it.

**Experiment method:** `scripts/sensitivity-sweep.ts [round2]` freezes five player builds (OVR 70/81/89/94/97), a 500-CPU bank and every fight seed, so each configuration replays identical fights. (An earlier ad-hoc version shared one RNG between generation and simulation, so different runs silently picked different builds — its exact figures should be disregarded.)

**Round 1** (win % vs the CPU field; last four columns are archetype fixtures):

| Config | OVR 94 | OVR 97 | 20-0 @ 97 | High vs Low Wrestling | Striker vs Wrestler | High vs Low Cardio |
|---|---|---|---|---|---|---|
| all .08 (current) | 66% | 67% | 0.03% | 77% | 35% | 64% |
| all .12 | 70% | 72% | 0.14% | 84% | 31% | 67% |
| all .16 | 74% | 76% | 0.44% | 90% | 28% | 71% |
| all .20 | 77% | 80% | 1.2% | 93% | 24% | 74% |
| initiative .08, contests .20 | 74% | 77% | 0.5% | 93% | 23% | 66% |
| initiative .20, contests .08 | 70% | 72% | 0.13% | 78% | 36% | 73% |
| striking .20 only | 68% | 71% | 0.12% | 78% | 48% | 65% |

Findings: initiative sensitivity is what makes cardio matter (initiative includes cardio) without touching wrestling; takedown/grappling/movement contests drive the top-end gain but also inflate wrestling (elite builds are elite largely *through* wrestling); striking sensitivity mainly fixes striker-vs-wrestler.

**Round 2** (combinations of the levers that don't inflate wrestling):

| Config (init / strike / td / grap / move) | OVR 94 | OVR 97 | 20-0 @ 97 | High vs Low Wrestling | Striker vs Wrestler | High vs Low Cardio |
|---|---|---|---|---|---|---|
| .20 / .20 / .08 / .08 / .08 | 72% | 76% | 0.39% | 78% | 50% | 74% |
| .28 / .20 / .08 / .08 / .12 | 74% | 78% | 0.69% | 80% | 48% | 78% |
| .28 / .28 / .08 / .08 / .12 | 75% | 79% | 0.98% | 80% | 51% | 78% |

**Candidate (.28 / .28 / .08 / .08 / .12) — full check, not adopted:** reaches ~15 expected Rampage wins for a 95 build and ~1% perfect rampages for 97+, with wrestling near today's level and Striker vs Wrestler at 51% (the design doc's original target). Per-attribute value (one attribute 3→5 vs neutral) becomes far more even: wrestling 74→84%, boxing 63→83%, kickboxing 61→78%, Fight IQ 67→78%, cardio 60→69%, chin 54→61% — but Power stays ~55% (it only affects damage, never a contest). **Overshoot:** Striker vs Balanced goes 62% → 85% (39% TKO), Wrestler vs Submission Specialist 84% → 92%, and neutral decisions rise 66% → 69%. Needs a targeted tuning pass (e.g. striking nearer .20-.24, then re-check finish rates) before adopting; OVR would then need re-fitting (`scripts/ovr-calibration.ts`) since its scale is anchored to win rate.

**Not yet tested:** widening the quality spread among the three draft candidates (so a wrong pick costs more) instead of, or alongside, sharper combat.

---

## Adopted tuning (current defaults)

**`DEFAULT_TUNING` is now initiative .22 / striking .18 / takedown .10 / grappling .08 / movement .12** (was .08 everywhere). Chosen as the gentlest setting from the sweeps that put top builds where the product wants them; OVR was then refit against the new engine. Every number in the older sections above (Current State, Fix 1-6, Finish-rate tuning) was measured under the flat .08 engine and is now historical.

**Validation** (`npx tsx scripts/rampage-validation.ts`): 30 independently drafted builds per OVR bucket vs a frozen 500-CPU bank, plus 300 real 20-fight rampages per build. Builds within a bucket behave consistently (p10-p90 of field win % spans only ~2-3 points), so the result doesn't hinge on how a build was assembled.

| OVR bucket (refit) | Field win % median (p10-p90) | Avg Rampage wins | P(18+) | P(20-0) measured / estimated |
|---|---|---|---|---|
| 90-92 | 69.7% (68-71) | 14.0 | 3.4% | 0.11% / 0.08% |
| 93-95 | 72.0% (71-73) | 14.4 | 4.9% | 0.10% / 0.14% |
| 96-97 | 73.8% (73-75) | 14.8 | 7.1% | 0.22% / 0.24% |
| 98-99 | 76.0% (75-77) | 15.2 | 10.7% | 0.26% / 0.42% |

Before (flat .08): 98-99 builds won ~68% (13.5 wins), 20-0 ~0.02%. **Target was ~0.5-1% for 98-99; measured 0.26% and estimated 0.42%, i.e. slightly short.** Not tuned further on purpose: the plan is to lock and wait for human playtests. If real play wants 20-0 more attainable, the next step is a slightly stronger setting (e.g. .24/.22/.11/.08/.12 estimated ~0.8% for 98-99, at the cost of a more one-sided striker-vs-balanced).

**Archetype fixtures, 20,000 fights (was -> now):** Neutral decisions 66% -> 68%; High vs Low Cardio 64% -> 75%; High vs Low Wrestling 77% -> 82%; Striker vs Wrestler (striker) 35% -> 42%; Wrestler vs Balanced 74% -> 78%; Striker vs Balanced 62% -> 78%; Wrestler vs Submission Specialist 84% -> 92%; All-Elite vs All-Weak still ~100%. Finish mix for even fights is similar (KO 16%, TKO 3%, SUB 13%, DEC 68%).

**Power:** not broken. With hidden speed/defense pinned, a Power 5 fighter deals ~18 head damage per fight (second only to Boxing) and wins ~26% of fights by finish vs ~17% for a neutral fighter — its value is finishes/volatility, which raw win rate (55%) doesn't show. Left alone.

**OVR refit:** ten-rating fit R^2 rose 0.79 -> **0.90** (held-out 0.897; plain average of the 8 visible ratings 0.74) — ratings now explain far more of the outcome. Scale re-anchored so the best build reached by greedy picking (best card each round) is ~98. (Correction: this is NOT the true optimum. The exact best 8-fighter assignment, solved by dynamic programming, scores ~106 unclamped and hits the 99 cap; see Correction below.) Drafters who can see every rating: ~92 median, 95+ about a quarter of the time (hidden-rating players will be well below that). Random drafting centers on ~71.

**Known trade-offs:** specialists now beat balanced builds more decisively (Striker vs Balanced 78%); initiative sensitivity also raises Fight IQ and cardio value (both feed initiative); neutral fights are ~2 points more decision-heavy.

---

## Style interaction at matched OVR (finding for future Rampage/gauntlet design)

Question: does the engine have counter-play, i.e. do some builds systematically beat others regardless of overall strength? 40 drafted builds each of three styles (strikers, grapplers, mixed), all in OVR 80-86 (means 83.1 / 82.8 / 82.8), fought each other 6x per pairing:

| Player \ Opponent | Striker | Grappler | Mixed |
|---|---|---|---|
| Striker | 50% | 51% | 51% |
| Grappler | 50% | 50% | 51% |
| Mixed | 49% | 50% | 51% |

**At equal OVR, style makes essentially no difference (49-51%).** This is the other side of the OVR refit result (R^2 0.90): overall strength explains almost all of the outcome, so a specialist opponent behaves like a generic opponent of its OVR. Consistent with an earlier unmatched test (specialists built with deliberate weak spots lose to complete builds purely in OVR order: 92 > 76 > 60). The archetype fixtures do show style effects (e.g. Elite Striker vs Elite Wrestler 42%), but drafted builds sit in a narrow rating band (4-5 of 5), so style gaps between them are tiny. **Implication:** a curated "archetype gauntlet" whose fights are meant to test different weaknesses would collapse into "20 opponents of varying OVR" unless the engine first gains real style interaction. A cheap, measurable acceptance test for that work: this matched-OVR matrix should move well away from 50% (e.g. 35-65%) without hurting the top-end numbers above.

---

## Draft pool: 55 to 70 fighters (tie-break fix)

**Bug:** the curated pool took the top 10 fighters per skill and broke ties alphabetically. Many fighters tie at the cutoff (Wrestling: 15 fighters rated 4.9+, only 10 kept), so elite names were dropped for no defensible reason: Jon Jones, Islam Makhachev, Kamaru Usman and Curtis Blaydes in Wrestling; Petr Yan, Valentina Shevchenko, Jose Aldo, Khabib Nurmagomedov, Justin Gaethje, Randy Couture and Rose Namajunas elsewhere. 37 fighters with a 4.8+ skill were excluded, and the pool landed at 55, short of the ~70 target in DESIGN_FINAL.md.

**Fix:** for each skill the bar is the rating of its 10th-ranked fighter; everyone at or above the bar is eligible; the pool is the union across the 8 skills. The number 10 sets a quality threshold, not a headcount. Result: **70 fighters** (the design target), including every name above. Two tests guard it (no fighter tying the bar is ever cut; the named elites are present).

| Per draft (4,000 simulated) | 55 pool | 70 pool |
|---|---|---|
| Distinct fighters shown (of 24 cards) | 21.0 | 21.6 |
| Drafts with at least one repeat shown | 98% | 95% |
| A given fighter appears in a draft (median) | 39% | 30% |

**Engine and OVR re-checked once, no coefficients changed.** OVR refit on the new pool: held-out R^2 0.89 (was 0.90); every weight within a few percent of before; scale anchor unchanged (best possible build predicts 76.2% field win rate, so the slope stays 108; OVR still ~71 for random picks, ~82 half-informed, ~91 best-of-3). Rampage validation (30 builds per bucket, 300 real rampages each):

| OVR bucket | Field win % | Avg wins of 20 | P(18+) | Perfect run (measured / est.) |
|---|---|---|---|---|
| 90-92 | 69.8% | 14.0 | 3.3% | 0.08% / 0.08% |
| 93-95 | 71.8% | 14.4 | 5.3% | 0.13% / 0.14% |
| 96-97 | 74.0% | 14.8 | 7.3% | 0.19% / 0.25% |
| 98-99 | 75.6% | 15.2 | 10.6% | 0.44% / 0.40% |

Effectively unchanged from the 55-fighter pool. Balance stays frozen. The tier mix per skill shifted (e.g. Wrestling elite/strong/solid/wildcard is now 20/10/12/28).

---

## Correction: the true best build

Earlier notes said the "best possible build from the whole pool" scores ~98. That figure came from a greedy sampler (best card each round over random attribute orders), not the exact optimum. Solving the assignment exactly (score is additive across picks, so a subset dynamic programme is exact): the best build from the 317 fighters, and from the 70-fighter pool, is the same set, **~106 on the unclamped OVR scale (shown as 99, the cap)**: St-Pierre (Wrestling), Silva (Submissions), McGregor (Boxing), Adesanya (Kickboxing), Topuria (Power), Edgar (Cardio), Gaethje (Chin), Johnson (Fight IQ). The top 300 builds use only 27 distinct fighters. This does not affect the draft mode (players see 3 cards a round and cannot reach the optimum), but the OVR scale would saturate for any mode with free choice of fighters.

---

## How to continue this work

```bash
# Quick iteration (20k/matchup, ~10s)
npm run balance:report

# Full validation (100k/matchup, ~50s)
npm run balance:report 100000

# Fast regression check (part of the normal test suite)
npm test
```

**Process for any further change:** hypothesis → isolated diagnostic (add a one-off script, don't guess from the aggregate numbers alone) → targeted fix → re-run the *full* sweep (not just the matchup you're fixing) → update this document with before/after numbers. The Fix 2 entry above is a useful template for documenting a fix that *didn't* work as hypothesized — that's still valuable information, not wasted effort.
