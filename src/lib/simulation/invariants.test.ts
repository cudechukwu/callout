import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { simulateFight } from "./engine";
import { runMatchupStudy } from "./harness";
import {
  ALL_ELITE,
  ALL_WEAK,
  BALANCED,
  ELITE_STRIKER,
  ELITE_WRESTLER,
  HIGH_CARDIO,
  HIGH_CHIN,
  HIGH_WRESTLING,
  LOW_CARDIO,
  LOW_CHIN,
  LOW_WRESTLING,
  NEUTRAL_A,
  NEUTRAL_B,
  SINGLE_STAT_POWER,
  strikerWithWrestlingInvestment,
  STRIKER_WITH_TD_DEFENSE,
  SUBMISSION_SPECIALIST,
} from "./balanceFixtures";

/**
 * These are the DESIGN_FINAL.md / LOCKED_DECISIONS.md balance invariants,
 * run at a moderate iteration count (fast enough for the default test
 * suite) rather than the full 100k used for actual tuning — see
 * scripts/balance-report.ts for that. Bounds here are deliberately loose:
 * their job is to catch a REGRESSION back toward a broken state (e.g.
 * submission rate returning to 54-84%), not to enforce a specific tuning
 * target. Tightening these further should follow more harness iterations,
 * not precede them.
 */
const ITERATIONS = 3000;

describe("structural invariants", () => {
  it("identical seed produces a bit-for-bit identical fight, every time", () => {
    for (const seed of [0, 1, 42, 9999]) {
      const first = simulateFight(NEUTRAL_A, NEUTRAL_B, createRng(seed));
      const second = simulateFight(NEUTRAL_A, NEUTRAL_B, createRng(seed));
      expect(second).toEqual(first);
    }
  });

  it("a fight never exceeds 3 rounds or 900 seconds of simulated time", () => {
    for (let seed = 0; seed < 500; seed++) {
      const result = simulateFight(ELITE_STRIKER, ELITE_WRESTLER, createRng(seed));
      expect(result.round).toBeLessThanOrEqual(3);
      expect(result.roundTimeSeconds).toBeLessThanOrEqual(300); // per-round time, not cumulative
    }
  });

  it("every round after the first starts standing at distance, not wherever the previous round ended", () => {
    // Regression test for a real bug: v0.1 initialized position once
    // before the round loop and never reset it between rounds, so round
    // 2 could begin with a fighter still on the ground from round 1's
    // final exchange. Verified here by reconstructing, from the event
    // log alone, whether any ground-only action occurred in a round
    // before that round established ground position for itself via a
    // landed takedown.
    const GROUND_ONLY_ACTIONS = new Set([
      "groundStrike",
      "bottomStrike",
      "submissionAttempt",
      "escape",
      "standUpAttempt",
      "improvePosition",
      "allowStandUp",
    ]);

    function actionOf(event: { type: string; metadata?: Record<string, unknown> }): string | undefined {
      if (typeof event.metadata?.action === "string") return event.metadata.action;
      // Success/Failed-suffixed events encode the action in the type itself.
      const match = /^(.+?)(Success|Failed)$/.exec(event.type);
      return match?.[1];
    }

    for (let seed = 0; seed < 300; seed++) {
      const result = simulateFight(ELITE_WRESTLER, ELITE_STRIKER, createRng(seed));

      for (let round = 1; round <= 3; round++) {
        const roundEvents = result.events.filter((e) => e.round === round);
        if (roundEvents.length === 0) continue; // fight ended before this round

        const firstGroundOnlyIndex = roundEvents.findIndex((e) =>
          GROUND_ONLY_ACTIONS.has(actionOf(e) ?? "")
        );
        if (firstGroundOnlyIndex === -1) continue; // no ground activity this round

        const firstTakedownLandedIndex = roundEvents.findIndex((e) => e.type === "takedownLanded");

        expect(
          firstTakedownLandedIndex,
          `seed ${seed} round ${round}: ground-only action occurred with no takedown establishing it this round`
        ).toBeGreaterThanOrEqual(0);
        expect(firstTakedownLandedIndex).toBeLessThan(firstGroundOnlyIndex);
      }
    }
  });

  it("a submission never occurs from a distance or clinch position", () => {
    // Structural, not statistical: submissionAttempt simply isn't in the
    // distance/clinch action menus (see actions.ts > ACTION_MENU), so
    // this can't happen by construction. Verified here via events: any
    // "submission" event must be immediately preceded by the fighter
    // having been in topGround, which we approximate by checking no
    // "submission" event appears before at least one "takedownLanded"
    // event in the same fight (submissions require ground position,
    // which requires a takedown first in this engine).
    for (let seed = 0; seed < 500; seed++) {
      const result = simulateFight(ELITE_WRESTLER, ELITE_STRIKER, createRng(seed));
      const submissionIndex = result.events.findIndex((e) => e.type === "submission");
      if (submissionIndex === -1) continue;
      const firstTakedownIndex = result.events.findIndex((e) => e.type === "takedownLanded");
      expect(
        firstTakedownIndex,
        `seed ${seed}: submission occurred with no prior takedown`
      ).toBeGreaterThanOrEqual(0);
      expect(firstTakedownIndex).toBeLessThan(submissionIndex);
    }
  });
});

describe("balance regression guards (loose bounds — see file header)", () => {
  it("identical builds land close to a 50/50 split", () => {
    const result = runMatchupStudy("identical", NEUTRAL_A, NEUTRAL_B, ITERATIONS);
    expect(result.fighterAWinRate).toBeGreaterThan(0.4);
    expect(result.fighterAWinRate).toBeLessThan(0.6);
  });

  it("submission finish rate for a neutral matchup stays well below its old broken value (54%)", () => {
    const result = runMatchupStudy("neutral-sub-rate", NEUTRAL_A, NEUTRAL_B, ITERATIONS);
    expect(result.methodRates.SUB).toBeLessThan(0.3);
  });

  it("submission finish rate for the most extreme grappling mismatch stays below its old broken value (84%)", () => {
    const result = runMatchupStudy(
      "wrestler-sub-rate",
      ELITE_WRESTLER,
      ELITE_STRIKER,
      ITERATIONS
    );
    expect(result.methodRates.SUB).toBeLessThan(0.6);
  });

  it("a single maxed-out attribute does not dominate a fight on its own", () => {
    const result = runMatchupStudy("single-stat", SINGLE_STAT_POWER, NEUTRAL_A, ITERATIONS);
    expect(result.fighterAWinRate).toBeLessThan(0.65);
  });

  it("higher cardio provides a real, non-trivial advantage without being deterministic", () => {
    const result = runMatchupStudy("cardio", HIGH_CARDIO, LOW_CARDIO, ITERATIONS);
    expect(result.fighterAWinRate).toBeGreaterThan(0.52);
    expect(result.fighterAWinRate).toBeLessThan(0.85);
  });

  it("higher chin measurably reduces exposure to being finished, without being deterministic", () => {
    const highChinResult = runMatchupStudy("chin", HIGH_CHIN, LOW_CHIN, ITERATIONS);
    expect(highChinResult.fighterAWinRate).toBeGreaterThan(0.5);
    expect(highChinResult.fighterAWinRate).toBeLessThan(0.85);
  });

  it("higher wrestling increases win rate through control/takedowns, and is not deterministic", () => {
    const result = runMatchupStudy("wrestling", HIGH_WRESTLING, LOW_WRESTLING, ITERATIONS);
    expect(result.fighterAWinRate).toBeGreaterThan(0.55);
    expect(result.fighterAWinRate).toBeLessThan(0.95);
  });

  it("an all-elite build beats an all-weak build the vast majority of the time", () => {
    const result = runMatchupStudy("elite-vs-weak", ALL_ELITE, ALL_WEAK, ITERATIONS);
    expect(result.fighterAWinRate).toBeGreaterThan(0.75);
  });

  it(
    "elite striker loses to elite wrestler at a stable, understood rate (not a target — a floor)",
    () => {
      // Reclassified from "known open issue" — see BALANCE_REPORT.md >
      // "Reclassified." The ~52% target this used to chase was a
      // pre-simulation guess, never re-examined across three tuning
      // passes. A broader matchup sweep showed this isn't "wrestling
      // beats striking" (a BALANCED build loses to the SAME striker;
      // ELITE_WRESTLER beats BALANCED harder than it beats the
      // striker) — it's that grappling weakness compounds (trapped on
      // the ground) in a way striking weakness doesn't. This bound
      // exists to catch a REGRESSION (e.g. the wrestler suddenly
      // winning 95%), not to push the number toward 50%.
      const result = runMatchupStudy(
        "striker-vs-wrestler",
        ELITE_STRIKER,
        ELITE_WRESTLER,
        ITERATIONS
      );
      expect(result.fighterAWinRate).toBeGreaterThan(0.25);
      expect(result.fighterAWinRate).toBeLessThan(0.45);
    }
  );

  it("wrestling's edge is about takedown defense specifically, not 'grappling beats striking' generally", () => {
    // A balanced (jack-of-all-trades) build LOSES to the pure striker —
    // proof the striker isn't just weak overall, it's specifically
    // vulnerable to being taken down and held there.
    const balancedVsStriker = runMatchupStudy(
      "balanced-vs-striker",
      BALANCED,
      ELITE_STRIKER,
      ITERATIONS
    );
    expect(balancedVsStriker.fighterAWinRate).toBeLessThan(0.5);
  });

  it("even elite submissions don't save a build that can't stop the takedown", () => {
    // SUBMISSION_SPECIALIST has 5.0 submissions (higher than
    // ELITE_WRESTLER's own 4.8) but 2.0 wrestling — it should lose to
    // ELITE_WRESTLER even harder than ELITE_STRIKER does, since it
    // still can't prevent being put in danger in the first place.
    const wrestlerVsSubSpecialist = runMatchupStudy(
      "wrestler-vs-subspecialist",
      ELITE_WRESTLER,
      SUBMISSION_SPECIALIST,
      ITERATIONS
    );
    const wrestlerVsStriker = runMatchupStudy(
      "wrestler-vs-striker-compare",
      ELITE_WRESTLER,
      ELITE_STRIKER,
      ITERATIONS
    );
    expect(wrestlerVsSubSpecialist.fighterAWinRate).toBeGreaterThan(
      wrestlerVsStriker.fighterAWinRate
    );
  });

  it("a little takedown defense goes a long way — the gap shrinks sharply with modest wrestling", () => {
    // STRIKER_WITH_TD_DEFENSE is identical to ELITE_STRIKER except
    // wrestling 2.0 -> 3.2. If the mechanism really is "can't stop the
    // takedown," a modest bump should meaningfully close the gap.
    const withoutDefense = runMatchupStudy(
      "wrestler-vs-no-defense",
      ELITE_WRESTLER,
      ELITE_STRIKER,
      ITERATIONS
    );
    const withDefense = runMatchupStudy(
      "wrestler-vs-some-defense",
      ELITE_WRESTLER,
      STRIKER_WITH_TD_DEFENSE,
      ITERATIONS
    );
    expect(withDefense.fighterAWinRate).toBeLessThan(withoutDefense.fighterAWinRate);
  });

  it("budget-neutral wrestling investment monotonically improves the striker's odds against a fixed elite wrestler", () => {
    // The rigorous version of the test above: STRIKER_WITH_TD_DEFENSE
    // added wrestling WITHOUT removing stat budget elsewhere, which a
    // review correctly flagged as confounding "wrestling defense
    // matters" with "this fighter is just stronger overall."
    // strikerWithWrestlingInvestment() holds total budget exactly
    // constant (delta added to wrestling, same delta removed
    // proportionally from boxing/kickboxing/power) — see
    // scripts/wrestling-sweep.ts for the full 7-point curve and
    // BALANCE_REPORT.md for the analysis. This test locks in the
    // coarse shape: low investment should clearly underperform high
    // investment, holding everything else about the trade constant.
    const low = runMatchupStudy(
      "wrestling-invest-low",
      strikerWithWrestlingInvestment(0),
      ELITE_WRESTLER,
      ITERATIONS
    );
    const mid = runMatchupStudy(
      "wrestling-invest-mid",
      strikerWithWrestlingInvestment(1.5),
      ELITE_WRESTLER,
      ITERATIONS
    );
    const high = runMatchupStudy(
      "wrestling-invest-high",
      strikerWithWrestlingInvestment(3.0),
      ELITE_WRESTLER,
      ITERATIONS
    );
    expect(mid.fighterAWinRate).toBeGreaterThan(low.fighterAWinRate);
    expect(high.fighterAWinRate).toBeGreaterThan(mid.fighterAWinRate);
    // Full investment (budget-neutral) should be competitive, not just
    // "less bad" — the measured curve reaches ~53% at max investment.
    expect(high.fighterAWinRate).toBeGreaterThan(0.45);
  });
});
