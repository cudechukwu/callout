import { describe, expect, it } from "vitest";
import type { DerivedStats } from "./derivedStats";
import {
  computeActionWeight,
  eligibleActions,
  RESOLUTION,
  selectAction,
  STRIKE_ACTIONS,
  STRIKE_PROFILE,
  SUBMISSION_ACTIONS,
  TAKEDOWN_ACTIONS,
} from "./actions";
import { ACTION_ENERGY_COST } from "./fatigue";
import { POSITION_ROLES } from "./types";

const NEUTRAL_DERIVED: DerivedStats = {
  strikeOffense: 3,
  strikePower: 3,
  knockoutThreat: 3,
  takedownOffense: 3,
  takedownDefense: 3,
  submissionOffense: 3,
  submissionDefense: 3,
  knockoutResistance: 3,
  submissionEscape: 3,
  fatigueResistance: 3,
  initiative: 3,
};

describe("eligibleActions", () => {
  it("returns a non-empty menu for every role", () => {
    for (const role of POSITION_ROLES) {
      expect(eligibleActions(role).length).toBeGreaterThan(0);
    }
  });

  it("every action in every menu has a fatigue cost defined", () => {
    for (const role of POSITION_ROLES) {
      for (const action of eligibleActions(role)) {
        expect(
          ACTION_ENERGY_COST[action],
          `${action} (from ${role}) missing from ACTION_ENERGY_COST`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every action in every menu has a resolution spec defined", () => {
    for (const role of POSITION_ROLES) {
      for (const action of eligibleActions(role)) {
        expect(RESOLUTION[action], `${action} (from ${role}) missing from RESOLUTION`).toBeDefined();
      }
    }
  });

  it("distance and clinch menus don't overlap with ground menus", () => {
    // Sanity check against copy-paste errors: a ground-only action
    // showing up in the distance menu would let a fighter, e.g.,
    // attempt a submission while standing.
    const groundActions = new Set([...eligibleActions("top"), ...eligibleActions("bottom")]);
    for (const action of eligibleActions("distance")) {
      expect(groundActions.has(action)).toBe(false);
    }
    for (const action of eligibleActions("clinch")) {
      expect(groundActions.has(action)).toBe(false);
    }
  });

  it("does not offer improvePosition — it has no mechanical effect until ground sub-positions exist", () => {
    // Both its success and failure paths left FightPosition unchanged
    // (no guard/mount/side-control sub-states to improve toward), so a
    // review correctly flagged it as a contest with zero consequence —
    // removed from the menu rather than left in as "fake complexity."
    // Its RESOLUTION/ACTION_CLASS/preference entries are still defined
    // for when it's re-added later.
    expect(eligibleActions("top")).not.toContain("improvePosition");
  });
});

describe("computeActionWeight", () => {
  it("flat-weight actions ignore derived stats entirely", () => {
    const low: DerivedStats = { ...NEUTRAL_DERIVED, submissionOffense: 1 };
    const high: DerivedStats = { ...NEUTRAL_DERIVED, submissionOffense: 5 };
    expect(computeActionWeight("disengage", low)).toBe(
      computeActionWeight("disengage", high)
    );
  });

  it("stat-based actions increase weight as the relevant stat rises", () => {
    const low: DerivedStats = { ...NEUTRAL_DERIVED, takedownOffense: 1 };
    const high: DerivedStats = { ...NEUTRAL_DERIVED, takedownOffense: 5 };
    expect(computeActionWeight("takedownAttempt", high)).toBeGreaterThan(
      computeActionWeight("takedownAttempt", low)
    );
  });

  it("stat-based actions are unaffected by unrelated stats", () => {
    const base = NEUTRAL_DERIVED;
    const withHigherCardio: DerivedStats = { ...NEUTRAL_DERIVED, fatigueResistance: 5 };
    expect(computeActionWeight("jab", withHigherCardio)).toBe(
      computeActionWeight("jab", base)
    );
  });
});

describe("selectAction", () => {
  it("is deterministic: same position/derived/roll always returns the same action", () => {
    const a = selectAction("distance", NEUTRAL_DERIVED, 0.42);
    const b = selectAction("distance", NEUTRAL_DERIVED, 0.42);
    expect(a).toBe(b);
  });

  it("roll=0 picks the first weighted bucket, roll just under 1 picks the last action", () => {
    const first = selectAction("clinch", NEUTRAL_DERIVED, 0);
    const menu = eligibleActions("clinch");
    expect(first).toBe(menu[0]);

    const last = selectAction("clinch", NEUTRAL_DERIVED, 0.999999999);
    expect(last).toBe(menu[menu.length - 1]);
  });

  it("always returns an action from the given role's menu", () => {
    for (const role of POSITION_ROLES) {
      const menu = eligibleActions(role);
      for (const roll of [0, 0.1, 0.25, 0.5, 0.75, 0.99]) {
        const action = selectAction(role, NEUTRAL_DERIVED, roll);
        expect(menu).toContain(action);
      }
    }
  });
});

describe("STRIKE_PROFILE", () => {
  it("every strike action has a profile whose zone weights sum to 1.0", () => {
    for (const action of STRIKE_ACTIONS) {
      const profile = STRIKE_PROFILE[action];
      expect(profile, `${action} missing STRIKE_PROFILE entry`).toBeDefined();
      const sum =
        profile!.zoneWeights.head + profile!.zoneWeights.body + profile!.zoneWeights.leg;
      expect(sum).toBeCloseTo(1.0, 9);
    }
  });

  it("has no entries for non-strike actions", () => {
    for (const action of Object.keys(STRIKE_PROFILE) as Array<
      keyof typeof STRIKE_PROFILE
    >) {
      expect(STRIKE_ACTIONS.has(action)).toBe(true);
    }
  });
});

describe("action category sets are mutually exclusive", () => {
  it("no action belongs to more than one of STRIKE/TAKEDOWN/SUBMISSION", () => {
    const allCategorized = [...STRIKE_ACTIONS, ...TAKEDOWN_ACTIONS, ...SUBMISSION_ACTIONS];
    const asSet = new Set(allCategorized);
    expect(asSet.size).toBe(allCategorized.length);
  });
});
