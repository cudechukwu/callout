import type {
  FighterFightStats,
  FighterSnapshot,
  FightMethod,
  FightPosition,
  FightResult,
  RNG,
  SimulationEvent,
} from "./types";
import { CLINCH, DISTANCE, roleFor } from "./types";
import { createCombatant, type Combatant } from "./combatant";
import {
  ACTION_CLASS,
  LEG_DAMAGE_INFLUENCE,
  RESOLUTION,
  selectAction,
  STRIKE_ACTIONS,
  STRIKE_PROFILE,
  SUBMISSION_ACTIONS,
  TAKEDOWN_ACTIONS,
  type ActionClass,
  type ExchangeAction,
} from "./actions";
import {
  computeActionEnergyCost,
  computeFatiguePerformanceModifiers,
  recoverBetweenRounds,
  spendEnergy,
  type FatiguePerformanceModifiers,
} from "./fatigue";
import {
  applyDamage,
  bodyDamageFatigueMultiplier,
  koRiskModifier,
  tkoStoppageRisk,
  legDamageSpeedMultiplier,
} from "./damage";
import type { DamageZone } from "./types";
import { clamp } from "./math";

const MAX_ROUNDS = 3;
const EXCHANGES_PER_ROUND = 22; // midpoint of the design doc's 20-25 range
export const ROUND_DURATION_SECONDS = 300; // 5 minutes
const EXCHANGE_DURATION_SECONDS = ROUND_DURATION_SECONDS / EXCHANGES_PER_ROUND;

/**
 * How strongly a stat gap moves each kind of contest: probability =
 * 0.5 + gap x sensitivity (clamped 10-90%). Split by domain because one
 * global factor could not be tuned without side effects: raising it
 * enough for top builds to win consistently (20-0 Rampages attainable)
 * also made wrestling absurdly dominant (see BALANCE_REPORT.md >
 * Sensitivity). Simulation callers may pass a different tuning to
 * simulateFight; the tuning scripts do.
 */
export interface SimulationTuning {
  /** Who gets to act, off the initiative gap (distance and clinch).
   * Initiative is built from speed, Fight IQ and cardio, so raising this
   * also raises the value of Fight IQ and cardio. */
  readonly initiativeSensitivity: number;
  /** Contested-action success, by action class. */
  readonly contestSensitivity: Readonly<Record<ActionClass, number>>;
}

/** Validated in scripts/rampage-validation.ts (frozen builds, bank and
 * seeds): a 98-99 OVR build wins ~77% of fights against the CPU field
 * (~0.5% perfect 20-fight Rampages), a 93-95 build ~73.5%; wrestling
 * stays ~82% (High vs Low), Striker vs Wrestler ~43%. Previous default:
 * .08 everywhere (a 98-99 build won ~68%, 20-0 essentially never). */
export const DEFAULT_TUNING: SimulationTuning = {
  initiativeSensitivity: 0.22,
  contestSensitivity: {
    striking: 0.18,
    takedown: 0.1,
    grappling: 0.08,
    movement: 0.12,
  },
};

function emptyStats(): FighterFightStats {
  return {
    significantStrikesAttempted: 0,
    significantStrikesLanded: 0,
    takedownsAttempted: 0,
    takedownsLanded: 0,
    controlSeconds: 0,
    submissionAttempts: 0,
    headDamageDealt: 0,
    bodyDamageDealt: 0,
    legDamageDealt: 0,
  };
}

/**
 * Everything a single exchange's resolution needs. Bundled into one
 * object rather than threaded through long parameter lists — every
 * helper below takes this plus whatever it's specifically acting on.
 *
 * `position` is mutable (reassigned, not mutated in place) by
 * successful transitions — see applySuccessfulAction. `stats` is the
 * fight's cumulative box score; `roundStats` is reset every round and
 * is what decision scoring actually reads — see scoreRound.
 */
interface ExchangeContext {
  readonly actor: Combatant;
  readonly defender: Combatant;
  readonly action: ExchangeAction;
  position: FightPosition;
  readonly rng: RNG;
  readonly events: SimulationEvent[];
  readonly stats: Record<string, FighterFightStats>;
  readonly roundStats: Record<string, FighterFightStats>;
  readonly round: number;
  readonly fightTimeSeconds: number;
  readonly tuning: SimulationTuning;
  nextSequence(): number;
}

interface ExchangeOutcome {
  finished: boolean;
  winnerId?: string;
  method?: FightMethod;
}

function logEvent(
  ctx: ExchangeContext,
  type: string,
  actorId: string,
  targetId: string,
  metadata?: Record<string, unknown>
): void {
  ctx.events.push({
    sequence: ctx.nextSequence(),
    round: ctx.round,
    fightTimeSeconds: ctx.fightTimeSeconds,
    type,
    actorId,
    targetId,
    metadata,
  });
}

/** Increments a stat field in BOTH the cumulative box score and the
 * current round's tally, so there's exactly one call site per stat
 * change instead of two that could drift out of sync. */
function bumpStat(
  ctx: ExchangeContext,
  fighterId: string,
  field: keyof FighterFightStats,
  amount = 1
): void {
  ctx.stats[fighterId]![field] += amount;
  ctx.roundStats[fighterId]![field] += amount;
}

/** Increments the "attempted" counter for whichever box-score category
 * this action belongs to. Called once per resolved exchange regardless
 * of success — "landed" counters are incremented separately, only on
 * the success path, so there's exactly one place each counter changes. */
function recordAttempt(ctx: ExchangeContext, actorId: string, action: ExchangeAction): void {
  if (STRIKE_ACTIONS.has(action)) bumpStat(ctx, actorId, "significantStrikesAttempted");
  else if (TAKEDOWN_ACTIONS.has(action)) bumpStat(ctx, actorId, "takedownsAttempted");
  else if (SUBMISSION_ACTIONS.has(action)) bumpStat(ctx, actorId, "submissionAttempts");
}

/**
 * Which fatigue-tier field governs a given action class's attacker-side
 * execution. Replaces a bare `TAKEDOWN_ACTIONS.has(action) ? X : Y`
 * else-branch that silently routed every non-takedown contest —
 * including submission offense and pure positional escapes — through
 * the same "speed" penalty. Grappling still borrows speedMultiplier for
 * now (there's no dedicated grapplingMultiplier fatigue tier yet — see
 * fatigue.ts > FatiguePerformanceModifiers); the point of this table is
 * that the choice is explicit and named, not that every value is final.
 */
const FATIGUE_MULTIPLIER_FOR_CLASS: Record<ActionClass, keyof FatiguePerformanceModifiers> = {
  striking: "speedMultiplier",
  movement: "speedMultiplier",
  takedown: "takedownSuccessMultiplier",
  grappling: "speedMultiplier",
};

/**
 * Scales the raw leg-damage speed penalty (damage.ts >
 * legDamageSpeedMultiplier, 0.6-1.0) down toward 1.0 (no penalty)
 * according to how much a given action class actually depends on leg
 * speed — see actions.ts > LEG_DAMAGE_INFLUENCE. At influence=1.0 this
 * returns the raw multiplier unchanged; at influence=0.0 it always
 * returns 1.0 regardless of how damaged the leg is.
 */
export function scaledLegPenalty(legDamage: number, actionClass: ActionClass): number {
  const rawMultiplier = legDamageSpeedMultiplier(legDamage);
  const influence = LEG_DAMAGE_INFLUENCE[actionClass];
  return 1 - (1 - rawMultiplier) * influence;
}

/**
 * Initiative folded through the same live degradations that apply to
 * every other contested stat (see resolveExchange) — fatigue AND leg
 * damage. v0.1 applied only the fatigue speedMultiplier here, and never
 * leg damage to anything except two specific actions (clinchEntry/
 * disengage) — meaning a fighter with a fully damaged leg still reacted
 * and closed distance at full speed everywhere else, including
 * initiative.
 *
 * Note this applies both multipliers to the WHOLE initiative value
 * (which itself blends speed/fightIq/cardio), not just its speed
 * component — a simplification carried over from v0.1, called out
 * explicitly rather than silently: decomposing initiative to discount
 * only its speed share would require duplicating derivedStats.ts's
 * weights here. Worth revisiting if it turns out to matter empirically.
 */
export function effectiveInitiative(combatant: Combatant): number {
  const mods = computeFatiguePerformanceModifiers(combatant.fatigue);
  // Initiative is closest in spirit to the "movement" action class
  // (reaction time, explosiveness) — treated the same way here for
  // consistency with resolveExchange's per-class leg scaling.
  return (
    combatant.derived.initiative *
    mods.speedMultiplier *
    scaledLegPenalty(combatant.damage.leg, "movement")
  );
}

/**
 * Picks who acts this exchange. On the ground, position dominates: the
 * top fighter acts most of the time (matches the real sport — the
 * fighter in control dictates pace), with a small lean from initiative
 * and a floor/ceiling so the bottom fighter always retains some chance
 * to attempt an escape. At distance/clinch, it's a pure initiative
 * contest scaled by the same skill-diff formula as everything else.
 *
 * Both branches use effectiveInitiative (fatigue + leg damage applied),
 * not raw derived.initiative — an earlier version used raw initiative
 * on the ground only, meaning a fighter with a fully damaged leg and no
 * energy left still acted with pristine initiative once grappling.
 */
function determineActor(
  fighterA: Combatant,
  fighterB: Combatant,
  position: FightPosition,
  rng: RNG,
  tuning: SimulationTuning
): { actor: Combatant; defender: Combatant } {
  if (position.kind === "ground") {
    const top = position.topFighterId === fighterA.id ? fighterA : fighterB;
    const bottom = top === fighterA ? fighterB : fighterA;
    const diff = effectiveInitiative(top) - effectiveInitiative(bottom);
    const topActsProbability = clamp(0.62 + diff * 0.02, 0.5, 0.8);
    return rng.next() < topActsProbability
      ? { actor: top, defender: bottom }
      : { actor: bottom, defender: top };
  }

  const diff = effectiveInitiative(fighterA) - effectiveInitiative(fighterB);
  const aActsProbability = clamp(0.5 + diff * tuning.initiativeSensitivity, 0.1, 0.9);
  return rng.next() < aActsProbability
    ? { actor: fighterA, defender: fighterB }
    : { actor: fighterB, defender: fighterA };
}

/**
 * KO check, run only after a strike lands to the head. `defender.damage`
 * already reflects this hit (applied before this is called), so
 * koRiskModifier sees post-hit accumulation, per DESIGN_FINAL.md >
 * Finish Mechanics: "KO probability increases based on... accumulated
 * head damage." Coefficients (0.03 baseline, /0.2 resistance floor) are
 * first-pass judgment calls — exactly what the harness validates.
 */
function checkForKnockout(
  actor: Combatant,
  defender: Combatant,
  action: ExchangeAction,
  rng: RNG
): boolean {
  const profile = STRIKE_PROFILE[action];
  if (!profile) return false; // not a knockout-capable action

  const riskMod = koRiskModifier(defender.damage.head);
  const powerFactor = actor.derived.knockoutThreat / 5.0;
  const resistanceFactor = Math.max(defender.derived.knockoutResistance / 5.0, 0.2);

  const baseChance = 0.03 * profile.koWeight;
  const finalChance = clamp(
    baseChance * (1 + riskMod) * (powerFactor / resistanceFactor),
    0,
    0.95
  );

  return rng.next() < finalChance;
}

/**
 * Whether a landed submission attempt converts into an actual tap-out.
 * See BALANCE_REPORT.md for why this is 0.08 base rather than the
 * original 0.25 — the harness caught a 54-84% fight-ending-in-
 * submission rate driven by this compounding with the selection weight
 * in actions.ts. Note this and the initial contest in resolveExchange
 * both key off the same submissionOffense/submissionDefense gap — an
 * acknowledged double-gate (establish, then finish) that amplifies a
 * submission-skill advantage nonlinearly. Not fixed here; flagged for
 * the harness to measure directly (attempts established vs. attempts
 * that actually finish) rather than only inferring it from overall SUB%.
 */
function checkForSubmissionFinish(
  actor: Combatant,
  defender: Combatant,
  rng: RNG
): boolean {
  const diff = actor.derived.submissionOffense - defender.derived.submissionDefense;
  const probability = clamp(0.08 + diff * 0.06, 0.02, 0.5);
  return rng.next() < probability;
}

/**
 * Referee stoppage, run after a head strike that didn't KO. Separate
 * from checkForKnockout: KO is "this strike ended it" (power vs. chin,
 * amplified by damage); TKO is "this fighter has taken too much" — driven
 * by accumulated head damage, so it can end a fight with no single
 * knockout blow. Power/resistance scaling is clamped so a stat gap
 * shifts stoppage odds without deciding them.
 */
function checkForStoppage(actor: Combatant, defender: Combatant, rng: RNG): boolean {
  const risk = tkoStoppageRisk(defender.damage.head);
  if (risk <= 0) return false;
  const statFactor = clamp(
    actor.derived.knockoutThreat / Math.max(defender.derived.knockoutResistance, 0.5),
    0.5,
    2
  );
  return rng.next() < clamp(risk * statFactor, 0, 0.95);
}

function pickDamageZone(
  zoneWeights: { head: number; body: number; leg: number },
  roll: number
): DamageZone {
  if (roll < zoneWeights.head) return "head";
  if (roll < zoneWeights.head + zoneWeights.body) return "body";
  return "leg";
}

function applyStrike(ctx: ExchangeContext): ExchangeOutcome {
  const { actor, defender, action, rng } = ctx;
  const profile = STRIKE_PROFILE[action]!; // guaranteed present: actions.ts fails fast at load if any STRIKE_ACTIONS entry lacks one

  const zone = pickDamageZone(profile.zoneWeights, rng.next());
  const fatigueMods = computeFatiguePerformanceModifiers(actor.fatigue);
  const damageAmount =
    profile.baseDamage * (actor.derived.strikePower / 3.0) * fatigueMods.powerMultiplier;

  defender.damage = applyDamage(defender.damage, zone, damageAmount);
  bumpStat(ctx, actor.id, "significantStrikesLanded");
  bumpStat(
    ctx,
    actor.id,
    zone === "head" ? "headDamageDealt" : zone === "body" ? "bodyDamageDealt" : "legDamageDealt",
    damageAmount
  );

  logEvent(ctx, "strikeLanded", actor.id, defender.id, { action, zone, damageAmount });

  if (zone === "head") {
    if (checkForKnockout(actor, defender, action, rng)) {
      logEvent(ctx, "knockout", actor.id, defender.id);
      return { finished: true, winnerId: actor.id, method: "KO" };
    }
    if (checkForStoppage(actor, defender, rng)) {
      logEvent(ctx, "tko", actor.id, defender.id);
      return { finished: true, winnerId: actor.id, method: "TKO" };
    }
  }

  return { finished: false };
}

function applySubmissionAttempt(ctx: ExchangeContext): ExchangeOutcome {
  const { actor, defender, rng } = ctx;
  logEvent(ctx, "submissionAttempt", actor.id, defender.id);

  const finished = checkForSubmissionFinish(actor, defender, rng);
  if (finished) {
    logEvent(ctx, "submission", actor.id, defender.id);
    return { finished: true, winnerId: actor.id, method: "SUB" };
  }
  logEvent(ctx, "submissionDefended", actor.id, defender.id);
  return { finished: false };
}

/** Dispatches a successfully-landed action to its position/stat effects. */
function applySuccessfulAction(ctx: ExchangeContext): ExchangeOutcome {
  const { actor, defender, action } = ctx;

  if (STRIKE_ACTIONS.has(action)) return applyStrike(ctx);
  if (SUBMISSION_ACTIONS.has(action)) return applySubmissionAttempt(ctx);

  if (TAKEDOWN_ACTIONS.has(action)) {
    ctx.position = { kind: "ground", topFighterId: actor.id };
    bumpStat(ctx, actor.id, "takedownsLanded");
    // action included so takedownAttempt (from distance) and
    // clinchTakedown (from clinch) stay distinguishable in the log —
    // both otherwise share this event type.
    logEvent(ctx, "takedownLanded", actor.id, defender.id, { action });
    return { finished: false };
  }

  switch (action) {
    case "escape":
    case "standUpAttempt":
    case "allowStandUp":
    case "disengage":
      ctx.position = DISTANCE;
      logEvent(ctx, `${action}Success`, actor.id, defender.id);
      return { finished: false };
    case "clinchEntry":
      ctx.position = CLINCH;
      logEvent(ctx, "clinchEntrySuccess", actor.id, defender.id);
      return { finished: false };
    case "improvePosition":
      // Unreachable via normal play — removed from actions.ts's "top"
      // menu because both its success AND failure paths left
      // FightPosition unchanged (no ground sub-positions exist for it
      // to actually improve toward), making it a contest with zero
      // mechanical consequence. Case kept, not deleted, so this stays
      // correct if the action is ever re-added once guard/mount/side-
      // control sub-states exist — see actions.ts's comment on "top".
      logEvent(ctx, "improvePositionSuccess", actor.id, defender.id);
      return { finished: false };
    case "defensiveMovement":
      // No position/stat change by design (this action's value is
      // purely "the opponent doesn't get hit this exchange" — spending
      // an exchange defensively rather than committing to offense).
      // Still logged explicitly rather than falling through silently,
      // so a replay/broadcast layer never sees an unexplained gap
      // where an exchange happened but nothing was recorded.
      logEvent(ctx, "defensiveMovement", actor.id, defender.id);
      return { finished: false };
    default:
      return { finished: false };
  }
}

/** Position consequences of a *failed* contested action — mostly "stay
 * where you were," logged distinctly so a replay/broadcast layer can
 * tell a stuffed takedown from one that was never attempted. */
function applyFailedAction(ctx: ExchangeContext): void {
  const { actor, defender, action } = ctx;
  if (STRIKE_ACTIONS.has(action)) {
    logEvent(ctx, "strikeMissed", actor.id, defender.id, { action });
    return;
  }
  if (TAKEDOWN_ACTIONS.has(action)) {
    logEvent(ctx, "takedownStuffed", actor.id, defender.id, { action });
    return;
  }
  logEvent(ctx, `${action}Failed`, actor.id, defender.id);
}

/**
 * Resolves one chosen action: determine success via the shared
 * probability model, spend energy regardless of outcome (attempting
 * costs something even when it fails), then dispatch to success/failure
 * handling.
 */
function resolveExchange(ctx: ExchangeContext): ExchangeOutcome {
  const { actor, defender, action, rng } = ctx;
  const spec = RESOLUTION[action];

  let success: boolean;
  if (spec.kind === "auto") {
    success = true;
  } else {
    const actorMods = computeFatiguePerformanceModifiers(actor.fatigue);
    const defenderMods = computeFatiguePerformanceModifiers(defender.fatigue);
    const actionClass = ACTION_CLASS[action];

    let attackerStat = spec.attackerStat(actor.derived, actor.ratings);
    let defenderStat = spec.defenderStat(defender.derived, defender.ratings);

    attackerStat *= actorMods[FATIGUE_MULTIPLIER_FOR_CLASS[actionClass]];
    defenderStat *= defenderMods.defenseMultiplier;

    // Leg damage degrades mobility-dependent execution for both sides,
    // scaled by how much THIS action class actually depends on leg
    // speed (see actions.ts > LEG_DAMAGE_INFLUENCE) — a badly hurt leg
    // meaningfully hurts a takedown shot or closing distance, but
    // shouldn't crater submission technique on the ground.
    attackerStat *= scaledLegPenalty(actor.damage.leg, actionClass);
    defenderStat *= scaledLegPenalty(defender.damage.leg, actionClass);

    const diff = attackerStat - defenderStat;
    const probability = clamp(0.5 + diff * ctx.tuning.contestSensitivity[actionClass], 0.1, 0.9);
    success = rng.next() < probability;
  }

  const bodyMult = bodyDamageFatigueMultiplier(actor.damage.body);
  const cost = computeActionEnergyCost(action, actor.derived.fatigueResistance) * bodyMult;
  actor.fatigue = spendEnergy(actor.fatigue, cost);

  recordAttempt(ctx, actor.id, action);

  if (!success) {
    applyFailedAction(ctx);
    return { finished: false };
  }
  return applySuccessfulAction(ctx);
}

/**
 * Score for ONE round's stats (not the cumulative fight — see
 * scoreRound/roundStats). Reweighted from v0.1 after the harness showed
 * a striker landing 2x their opponent's significant strikes still lost
 * 75% of decisions under the old weights (strikes x1.0, takedowns x5.0,
 * control x0.05/sec, subAttempts x3.0 gave a wrestler ~34 points from
 * grappling alone regardless of who actually won the exchanges). See
 * BALANCE_REPORT.md for the full before/after. Still a first-pass
 * calibration — rerun scripts/balance-report.ts after any further change.
 */
function computeRoundScore(stats: FighterFightStats): number {
  return (
    stats.significantStrikesLanded * 2.0 +
    stats.takedownsLanded * 2.5 +
    stats.controlSeconds * 0.015 +
    stats.submissionAttempts * 1.5
  );
}

/**
 * Scores one round and returns its winner. Ties are broken by an
 * explicit RNG roll (not "always fighterA") so replay stays
 * deterministic without privileging whichever fighter is passed first.
 *
 * This is intentionally simple majority scoring (whoever wins more of
 * the round's box score wins the round), not full 10-9/10-8 point
 * totaling — that's a reasonable future refinement (a fighter could in
 * principle lose 2 close rounds and win 1 blowout round under points
 * scoring but not under simple-majority), but simple majority already
 * fixes the actual bug this replaced: v0.1 scored the ENTIRE fight's
 * cumulative stats once at the end, meaning a fighter who dominated
 * rounds 1-2 could still lose the "decision" to an opponent who only
 * dominated round 3, which is not how MMA judging works.
 *
 * Deliberately NOT called during the round loop — see scoreDecision.
 */
export function scoreRound(
  roundStats: Record<string, FighterFightStats>,
  fighterAId: string,
  fighterBId: string,
  rng: RNG
): string {
  const scoreA = computeRoundScore(roundStats[fighterAId]!);
  const scoreB = computeRoundScore(roundStats[fighterBId]!);
  if (scoreA === scoreB) return rng.next() < 0.5 ? fighterAId : fighterBId;
  return scoreA > scoreB ? fighterAId : fighterBId;
}

/**
 * Scores all 3 completed rounds and determines the decision winner.
 * Called ONLY after the physical fight is entirely finished (all 3
 * rounds ran with no finish) — not incrementally after each round.
 *
 * This matters beyond tidiness: scoreRound consumes an RNG draw on a
 * tied round. If judging happened inside the round loop, that draw
 * would shift every subsequent rng.next() call, meaning ROUND 2/3's
 * physical events would depend on whether round 1 happened to tie —
 * the judge would be reaching into the cage and changing what happens
 * next. Scoring only after the fight ends means judging can never
 * influence the fight it's judging, and — as a bonus — means changing
 * judging rules later (e.g. removing the tie-break, or moving to
 * points scoring) can never alter a stored fight's physical replay,
 * only its recorded decision.
 */
export function scoreDecision(
  completedRounds: Array<Record<string, FighterFightStats>>,
  fighterAId: string,
  fighterBId: string,
  rng: RNG
): string {
  const roundsWon: Record<string, number> = { [fighterAId]: 0, [fighterBId]: 0 };
  for (const roundStats of completedRounds) {
    const winnerId = scoreRound(roundStats, fighterAId, fighterBId, rng);
    roundsWon[winnerId]!++;
  }
  // Every round has exactly one winner, so this always resolves to a
  // clear majority across 3 rounds — no fight-level tie-break needed.
  return roundsWon[fighterAId]! > roundsWon[fighterBId]! ? fighterAId : fighterBId;
}

/**
 * Simulates one fight, start to finish. Pure function: same snapshots +
 * same seed always produce the same FightResult (see rng.ts) — this is
 * what makes a stored fight replayable. No database access, no I/O.
 */
export function simulateFight(
  fighterASnapshot: FighterSnapshot,
  fighterBSnapshot: FighterSnapshot,
  rng: RNG,
  tuning: SimulationTuning = DEFAULT_TUNING
): FightResult {
  // Every stats/positions/roundsWon structure in this function is
  // Record<fighterId, ...> — two snapshots with the same id would
  // silently collapse into one entry rather than failing loudly, and
  // whichever fighter's data was written last would just overwrite the
  // other's. Cheap to catch here instead of producing a nonsensical
  // fight result.
  if (fighterASnapshot.id === fighterBSnapshot.id) {
    throw new Error(
      `simulateFight requires two distinct fighter IDs, got "${fighterASnapshot.id}" for both`
    );
  }

  const fighterA = createCombatant(fighterASnapshot);
  const fighterB = createCombatant(fighterBSnapshot);

  const stats: Record<string, FighterFightStats> = {
    [fighterA.id]: emptyStats(),
    [fighterB.id]: emptyStats(),
  };

  const completedRounds: Array<Record<string, FighterFightStats>> = [];

  const events: SimulationEvent[] = [];
  let sequenceCounter = 0;
  const nextSequence = () => sequenceCounter++;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Every round starts standing at distance, regardless of how the
    // previous round ended — MMA rounds always restart this way. v0.1
    // initialized position once before the round loop and never reset
    // it, so round 2 could begin with a fighter still on the ground
    // from round 1's final exchange.
    let position: FightPosition = DISTANCE;

    const roundStats: Record<string, FighterFightStats> = {
      [fighterA.id]: emptyStats(),
      [fighterB.id]: emptyStats(),
    };

    for (let exchange = 0; exchange < EXCHANGES_PER_ROUND; exchange++) {
      // Time at the END of this exchange, so a first-exchange finish reads
      // 0:14 rather than 0:00, and the last exchange lands on 5:00.
      const fightTimeSeconds = Math.round((exchange + 1) * EXCHANGE_DURATION_SECONDS);

      // Control-time accrual: whoever is on top during this exchange's
      // time slice banks it, regardless of what happens in the
      // exchange itself.
      if (position.kind === "ground") {
        const topId = position.topFighterId;
        stats[topId]!.controlSeconds += EXCHANGE_DURATION_SECONDS;
        roundStats[topId]!.controlSeconds += EXCHANGE_DURATION_SECONDS;
      }

      const { actor, defender } = determineActor(fighterA, fighterB, position, rng, tuning);
      const role = roleFor(position, actor.id);
      const action = selectAction(role, actor.derived, rng.next());

      const ctx: ExchangeContext = {
        actor,
        defender,
        action,
        position,
        rng,
        events,
        stats,
        roundStats,
        round,
        fightTimeSeconds,
        tuning,
        nextSequence,
      };

      const outcome = resolveExchange(ctx);
      position = ctx.position; // may have been reassigned by a successful transition

      if (outcome.finished) {
        return {
          winnerId: outcome.winnerId!,
          method: outcome.method!,
          round,
          roundTimeSeconds: fightTimeSeconds,
          events,
          stats,
        };
      }
    }

    // NOT scored here — see scoreDecision's docstring for why judging
    // must wait until the whole physical fight has finished.
    completedRounds.push(roundStats);

    if (round < MAX_ROUNDS) {
      fighterA.fatigue = recoverBetweenRounds(fighterA.fatigue, fighterA.derived.fatigueResistance);
      fighterB.fatigue = recoverBetweenRounds(fighterB.fatigue, fighterB.derived.fatigueResistance);
    }
  }

  const winnerId = scoreDecision(completedRounds, fighterA.id, fighterB.id, rng);

  return {
    winnerId,
    method: "DEC",
    round: MAX_ROUNDS,
    roundTimeSeconds: ROUND_DURATION_SECONDS,
    events,
    stats,
  };
}
