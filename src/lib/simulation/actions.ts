import type { PositionRole } from "./types";
import type { DerivedStats, FullAttributeRatings } from "./derivedStats";
import type { FatigueCostAction } from "./fatigue";

/**
 * Every exchange action is also a fatigue-cost category — see fatigue.ts
 * > ACTION_ENERGY_COST. One action vocabulary, not two that have to be
 * kept in sync.
 */
export type ExchangeAction = FatigueCostAction;

/**
 * Which actions are available for each role, straight from
 * DESIGN_FINAL.md > Game Design: Fight Simulation > Actions by Position.
 * Keyed by PositionRole (types.ts), not the raw FightPosition union —
 * a fighter's role ("distance"/"clinch"/"top"/"bottom") is derived from
 * FightPosition via roleFor(), since distance/clinch are symmetric
 * (both fighters get the same menu) and only ground splits by role.
 */
const ACTION_MENU: Record<PositionRole, readonly ExchangeAction[]> = {
  distance: [
    "jab",
    "powerShot",
    "kick",
    "clinchEntry",
    "takedownAttempt",
    "defensiveMovement",
  ],
  clinch: ["clinchStrike", "clinchTakedown", "disengage"],
  // "improvePosition" is deliberately absent — see engine.ts's comment
  // above its old case in applySuccessfulAction. It used to sit here
  // with a real cost, a real contest, and a real selection weight, but
  // both its success and failure paths left FightPosition completely
  // unchanged (this engine has no guard/mount/side-control sub-states
  // for it to actually improve toward), so it was a contest whose
  // outcome had no mechanical consequence — a review correctly called
  // this "fake complexity." Its RESOLUTION/ACTION_CLASS/preference/cost
  // entries are left defined (unused) so re-adding it here is a
  // one-line change once ground sub-positions exist to make it mean
  // something.
  top: ["groundStrike", "submissionAttempt", "allowStandUp"],
  bottom: ["escape", "bottomStrike", "standUpAttempt"],
};

export function eligibleActions(role: PositionRole): readonly ExchangeAction[] {
  return ACTION_MENU[role];
}

/**
 * How much a fighter's own derived stats bias them toward each action.
 * `baseline` ensures every legal action has some chance even for a
 * fighter with nothing in that stat; `scale` is how much a maxed-out
 * (5.0) stat adds on top. A flatWeight action (e.g. disengage) isn't
 * tied to any stat — it's chosen at a roughly constant rate regardless
 * of build.
 *
 * These weights are a first-pass design judgment, not tuned data. The
 * balance harness (next chunk) is what actually validates whether e.g.
 * elite wrestlers take down elite strikers at a sane rate — expect
 * these numbers to move.
 */
type PreferenceSpec =
  | { stat: keyof DerivedStats; baseline: number; scale: number }
  | { flatWeight: number };

const ACTION_PREFERENCE: Record<ExchangeAction, PreferenceSpec> = {
  jab: { stat: "strikeOffense", baseline: 1.0, scale: 2.0 },
  powerShot: { stat: "knockoutThreat", baseline: 0.4, scale: 2.0 },
  kick: { stat: "strikeOffense", baseline: 0.6, scale: 1.5 },
  clinchEntry: { stat: "takedownOffense", baseline: 0.3, scale: 1.0 },
  takedownAttempt: { stat: "takedownOffense", baseline: 0.5, scale: 2.0 },
  defensiveMovement: { flatWeight: 0.3 },

  clinchStrike: { stat: "strikeOffense", baseline: 0.8, scale: 1.5 },
  clinchTakedown: { stat: "takedownOffense", baseline: 0.6, scale: 1.5 },
  disengage: { flatWeight: 0.4 },

  groundStrike: { stat: "strikeOffense", baseline: 1.0, scale: 1.5 },
  // v0.1 (baseline 0.5, scale 2.0) combined with checkForSubmissionFinish's
  // old 0.25 base to produce a 54-84% submission-finish rate in the
  // balance harness — see engine.ts > checkForSubmissionFinish for the
  // full explanation. Lowered here too since both factors compound.
  submissionAttempt: { stat: "submissionOffense", baseline: 0.3, scale: 1.0 },
  improvePosition: { stat: "takedownOffense", baseline: 0.4, scale: 1.0 },
  allowStandUp: { flatWeight: 0.15 },

  escape: { stat: "submissionEscape", baseline: 0.5, scale: 1.5 },
  bottomStrike: { stat: "strikeOffense", baseline: 0.5, scale: 1.0 },
  standUpAttempt: { stat: "submissionEscape", baseline: 0.6, scale: 1.5 },
};

export function computeActionWeight(
  action: ExchangeAction,
  derived: DerivedStats
): number {
  const spec = ACTION_PREFERENCE[action];
  if ("flatWeight" in spec) return spec.flatWeight;
  const statValue = derived[spec.stat]; // 1.0-5.0
  return spec.baseline + (statValue / 5.0) * spec.scale;
}

/**
 * Weighted-random pick among the actions legal for `role`, biased by
 * the acting fighter's own derived stats. `roll` must be a single
 * rng.next() draw in [0, 1) — the caller owns the RNG so this function
 * stays a pure, testable unit.
 */
export function selectAction(
  role: PositionRole,
  derived: DerivedStats,
  roll: number
): ExchangeAction {
  const actions = eligibleActions(role);
  const weights = actions.map((action) => computeActionWeight(action, derived));
  const total = weights.reduce((sum, w) => sum + w, 0);

  const threshold = roll * total;
  let cumulative = 0;
  for (let i = 0; i < actions.length; i++) {
    cumulative += weights[i]!;
    if (threshold < cumulative) return actions[i]!;
  }
  // Floating-point edge case (roll very close to 1.0): fall back to the
  // last action rather than returning undefined.
  return actions[actions.length - 1]!;
}

/** Actions that represent a strike landing — used to gate damage/KO logic. */
export const STRIKE_ACTIONS: ReadonlySet<ExchangeAction> = new Set([
  "jab",
  "powerShot",
  "kick",
  "clinchStrike",
  "groundStrike",
  "bottomStrike",
]);

export const TAKEDOWN_ACTIONS: ReadonlySet<ExchangeAction> = new Set([
  "takedownAttempt",
  "clinchTakedown",
]);

export const SUBMISSION_ACTIONS: ReadonlySet<ExchangeAction> = new Set([
  "submissionAttempt",
]);

/**
 * How fatigue and leg damage should scale a contested action. Replaces
 * an earlier version where every non-takedown action fell through an
 * `else` branch straight to the fatigue speedMultiplier, and — after
 * leg damage was made to apply everywhere — every contested action
 * (including submission offense/defense/escape) got the full leg-speed
 * penalty. Both were undocumented, accidental couplings: fatigue makes
 * a fighter's grip and positional control worse too, not just their
 * speed, and a damaged leg has little to do with jiu-jitsu technique on
 * the ground. This table makes each category's dependence explicit
 * instead of implicit.
 */
export type ActionClass = "striking" | "takedown" | "grappling" | "movement";

export const ACTION_CLASS: Record<ExchangeAction, ActionClass> = {
  jab: "striking",
  powerShot: "striking",
  kick: "striking",
  clinchStrike: "striking",
  groundStrike: "striking",
  bottomStrike: "striking",

  takedownAttempt: "takedown",
  clinchTakedown: "takedown",

  submissionAttempt: "grappling",
  improvePosition: "grappling",

  escape: "movement",
  standUpAttempt: "movement",
  clinchEntry: "movement",
  disengage: "movement",
  defensiveMovement: "movement",
  allowStandUp: "movement",
};

/**
 * How much of the raw leg-damage speed penalty (damage.ts >
 * legDamageSpeedMultiplier) actually applies to each action class.
 * 1.0 = full penalty, 0.0 = none. Grappling technique (submissions,
 * positional control) depends on hips/grip/leverage far more than leg
 * speed specifically, so it gets little; pure movement (closing
 * distance, standing up, escaping) depends on it the most.
 */
export const LEG_DAMAGE_INFLUENCE: Record<ActionClass, number> = {
  striking: 0.5,
  takedown: 0.75,
  movement: 1.0,
  grappling: 0.0,
};

/**
 * Whether landing this action succeeds is a contested roll between two
 * stats ("contest"), or the action always succeeds by definition
 * ("auto") — e.g. allowStandUp is the top fighter's own choice, not
 * something the bottom fighter can resist.
 */
export type ResolutionSpec =
  | {
      kind: "contest";
      attackerStat: (derived: DerivedStats, ratings: FullAttributeRatings) => number;
      defenderStat: (derived: DerivedStats, ratings: FullAttributeRatings) => number;
    }
  | { kind: "auto" };

const strikeContest: ResolutionSpec = {
  kind: "contest",
  attackerStat: (d) => d.strikeOffense,
  defenderStat: (_d, r) => r.defense,
};

const takedownContest: ResolutionSpec = {
  kind: "contest",
  attackerStat: (d) => d.takedownOffense,
  defenderStat: (d) => d.takedownDefense,
};

export const RESOLUTION: Record<ExchangeAction, ResolutionSpec> = {
  jab: strikeContest,
  powerShot: strikeContest,
  kick: strikeContest,
  clinchStrike: strikeContest,
  groundStrike: strikeContest,
  bottomStrike: strikeContest,

  takedownAttempt: takedownContest,
  clinchTakedown: takedownContest,

  submissionAttempt: {
    kind: "contest",
    attackerStat: (d) => d.submissionOffense,
    defenderStat: (d) => d.submissionDefense,
  },

  // Escaping/standing up both fight against the top fighter's control —
  // modeled as the bottom fighter's escape ability vs. the top fighter's
  // takedownOffense (used here as a proxy for grappling control, not a
  // literal takedown).
  escape: {
    kind: "contest",
    attackerStat: (d) => d.submissionEscape,
    defenderStat: (d) => d.takedownOffense,
  },
  standUpAttempt: {
    kind: "contest",
    attackerStat: (d) => d.submissionEscape,
    defenderStat: (d) => d.takedownOffense,
  },
  improvePosition: {
    kind: "contest",
    attackerStat: (d) => d.takedownOffense,
    defenderStat: (d) => d.submissionEscape,
  },

  // Closing distance / breaking away are speed contests, not tied to
  // any single derived stat.
  clinchEntry: {
    kind: "contest",
    attackerStat: (_d, r) => r.speed,
    defenderStat: (_d, r) => r.speed,
  },
  disengage: {
    kind: "contest",
    attackerStat: (_d, r) => r.speed,
    defenderStat: (_d, r) => r.speed,
  },

  // Voluntary, uncontested actions.
  allowStandUp: { kind: "auto" },
  defensiveMovement: { kind: "auto" },
};

/**
 * Damage shape for each strike action: how hard it hits before power
 * scaling, which zones it tends to target, and its relative likelihood
 * of triggering a knockout check at all (a jab rarely ends fights; a
 * power shot often threatens to). See damage.ts for how these numbers
 * get applied.
 */
export interface StrikeProfile {
  baseDamage: number;
  zoneWeights: { head: number; body: number; leg: number };
  koWeight: number;
}

export const STRIKE_PROFILE: Partial<Record<ExchangeAction, StrikeProfile>> = {
  jab: { baseDamage: 2, zoneWeights: { head: 0.6, body: 0.3, leg: 0.1 }, koWeight: 0.3 },
  powerShot: {
    baseDamage: 6,
    zoneWeights: { head: 0.7, body: 0.2, leg: 0.1 },
    koWeight: 1.0,
  },
  kick: { baseDamage: 4, zoneWeights: { head: 0.3, body: 0.3, leg: 0.4 }, koWeight: 0.6 },
  clinchStrike: {
    baseDamage: 3,
    zoneWeights: { head: 0.5, body: 0.4, leg: 0.1 },
    koWeight: 0.5,
  },
  groundStrike: {
    baseDamage: 3.5,
    zoneWeights: { head: 0.55, body: 0.35, leg: 0.1 },
    koWeight: 0.6,
  },
  bottomStrike: {
    baseDamage: 2,
    zoneWeights: { head: 0.4, body: 0.4, leg: 0.2 },
    koWeight: 0.3,
  },
};

// Fail fast if a profile's zone weights don't distribute damage
// completely (e.g. a typo'd 0.4/0.3/0.2 that silently drops 10% of
// every hit's damage into the void). Same pattern as derivedStats.ts's
// assertValidWeights, applied here since this file has its own weight
// tables that formula shares the same failure mode.
for (const [action, profile] of Object.entries(STRIKE_PROFILE)) {
  const sum =
    profile!.zoneWeights.head + profile!.zoneWeights.body + profile!.zoneWeights.leg;
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(
      `STRIKE_PROFILE.${action}.zoneWeights must sum to 1.0, got ${sum}`
    );
  }
}

// Fail fast if any action is missing from either the preference table or
// the resolution table — both are keyed by the full ExchangeAction union,
// so TypeScript already enforces completeness at compile time via
// Record<ExchangeAction, ...>. This loop exists for the STRIKE_ACTIONS
// subset, which TypeScript can't check: every strike action must have a
// STRIKE_PROFILE entry, since resolveExchange (engine.ts) looks it up
// unconditionally for any successful strike.
for (const action of STRIKE_ACTIONS) {
  if (!STRIKE_PROFILE[action]) {
    throw new Error(`STRIKE_ACTIONS includes "${action}" but STRIKE_PROFILE has no entry for it`);
  }
}
