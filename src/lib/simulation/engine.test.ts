import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  DEFAULT_TUNING,
  effectiveInitiative,
  scaledLegPenalty,
  scoreDecision,
  scoreRound,
  simulateFight,
} from "./engine";
import { createCombatant } from "./combatant";
import { legDamageSpeedMultiplier } from "./damage";
import type { ActionClass } from "./actions";
import type { FighterFightStats } from "./types";
import {
  buildUniformSnapshot,
  ELITE_SOURCE_FIGHTER,
  NEUTRAL_SOURCE_FIGHTER,
  WEAK_SOURCE_FIGHTER,
} from "./testFixtures";

const VALID_METHODS = new Set(["KO", "TKO", "SUB", "DEC"]);

describe("simulateFight — tuning", () => {
  const strong = buildUniformSnapshot("a", "Strong", ELITE_SOURCE_FIGHTER);
  const average = buildUniformSnapshot("b", "Average", NEUTRAL_SOURCE_FIGHTER);

  it("omitting the tuning is identical to passing the default tuning", () => {
    for (let seed = 0; seed < 25; seed++) {
      expect(simulateFight(strong, average, createRng(seed))).toEqual(
        simulateFight(strong, average, createRng(seed), DEFAULT_TUNING)
      );
    }
  });

  it("higher sensitivity lets the stronger fighter win more often", () => {
    const sharper = {
      initiativeSensitivity: 0.2,
      contestSensitivity: { striking: 0.2, takedown: 0.2, grappling: 0.2, movement: 0.2 },
    };
    const runs = 600;
    let defaultWins = 0;
    let sharperWins = 0;
    for (let seed = 0; seed < runs; seed++) {
      if (simulateFight(strong, average, createRng(seed)).winnerId === "a") defaultWins++;
      if (simulateFight(strong, average, createRng(seed), sharper).winnerId === "a") sharperWins++;
    }
    expect(sharperWins).toBeGreaterThan(defaultWins);
  });
});

describe("simulateFight — fight clock", () => {
  it("never reports a finish or event at 0:00, and never past the round length", () => {
    const a = buildUniformSnapshot("a", "Fighter A", ELITE_SOURCE_FIGHTER);
    const b = buildUniformSnapshot("b", "Fighter B", WEAK_SOURCE_FIGHTER);
    for (let seed = 0; seed < 300; seed++) {
      const result = simulateFight(a, b, createRng(seed));
      expect(result.roundTimeSeconds).toBeGreaterThan(0);
      expect(result.roundTimeSeconds).toBeLessThanOrEqual(300);
      for (const event of result.events) {
        expect(event.fightTimeSeconds).toBeGreaterThan(0);
        expect(event.fightTimeSeconds).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe("simulateFight — determinism", () => {
  it("produces a bit-for-bit identical result for the same seed", () => {
    const a = buildUniformSnapshot("a", "Fighter A", NEUTRAL_SOURCE_FIGHTER);
    const b = buildUniformSnapshot("b", "Fighter B", ELITE_SOURCE_FIGHTER);

    const result1 = simulateFight(a, b, createRng(42));
    const result2 = simulateFight(a, b, createRng(42));

    expect(result1).toEqual(result2);
  });

  it("produces different results for different seeds (RNG is actually being consumed)", () => {
    const a = buildUniformSnapshot("a", "Fighter A", NEUTRAL_SOURCE_FIGHTER);
    const b = buildUniformSnapshot("b", "Fighter B", NEUTRAL_SOURCE_FIGHTER);

    const results = [1, 2, 3, 4, 5].map((seed) => simulateFight(a, b, createRng(seed)));
    const uniqueEventCounts = new Set(results.map((r) => r.events.length));

    // With identical builds, different seeds should not all produce the
    // exact same event count/sequence — if they did, the RNG wouldn't
    // actually be influencing the fight.
    expect(uniqueEventCounts.size).toBeGreaterThan(1);
  });
});

describe("simulateFight — structural validity", () => {
  const a = buildUniformSnapshot("a", "Fighter A", NEUTRAL_SOURCE_FIGHTER);
  const b = buildUniformSnapshot("b", "Fighter B", NEUTRAL_SOURCE_FIGHTER);

  it("always returns a valid method, round, and winner across many seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = simulateFight(a, b, createRng(seed));

      expect(VALID_METHODS.has(result.method), `seed ${seed}: bad method ${result.method}`).toBe(
        true
      );
      expect(result.round, `seed ${seed}: round out of range`).toBeGreaterThanOrEqual(1);
      expect(result.round, `seed ${seed}: round out of range`).toBeLessThanOrEqual(3);
      expect(
        result.winnerId === "a" || result.winnerId === "b",
        `seed ${seed}: winnerId "${result.winnerId}" is not one of the fighters`
      ).toBe(true);
      expect(result.events.length, `seed ${seed}: no events logged`).toBeGreaterThan(0);
      expect(result.stats["a"], `seed ${seed}: missing stats for fighter a`).toBeDefined();
      expect(result.stats["b"], `seed ${seed}: missing stats for fighter b`).toBeDefined();
    }
  });

  it("a decision always lands in round 3 at the full round duration", () => {
    // Find at least one decision among a spread of seeds — if none of
    // these produce a DEC, loosen this to a mock/forced scenario, but
    // in practice a neutral-vs-neutral matchup will decision fairly
    // often since finishes aren't guaranteed.
    let sawDecision = false;
    for (let seed = 0; seed < 200; seed++) {
      const result = simulateFight(a, b, createRng(seed));
      if (result.method === "DEC") {
        sawDecision = true;
        expect(result.round).toBe(3);
        expect(result.roundTimeSeconds).toBe(300);
      }
    }
    expect(sawDecision, "expected at least one decision across 200 seeds").toBe(true);
  });

  it("never produces negative or absurd fight statistics", () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = simulateFight(a, b, createRng(seed));
      for (const fighterStats of Object.values(result.stats)) {
        expect(fighterStats.significantStrikesAttempted).toBeGreaterThanOrEqual(0);
        expect(fighterStats.significantStrikesLanded).toBeGreaterThanOrEqual(0);
        expect(fighterStats.significantStrikesLanded).toBeLessThanOrEqual(
          fighterStats.significantStrikesAttempted
        );
        expect(fighterStats.takedownsAttempted).toBeGreaterThanOrEqual(0);
        expect(fighterStats.takedownsLanded).toBeGreaterThanOrEqual(0);
        expect(fighterStats.takedownsLanded).toBeLessThanOrEqual(
          fighterStats.takedownsAttempted
        );
        expect(fighterStats.controlSeconds).toBeGreaterThanOrEqual(0);
        expect(fighterStats.controlSeconds).toBeLessThanOrEqual(900); // 3 rounds x 300s ceiling
        expect(fighterStats.submissionAttempts).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("simulateFight — coarse balance sanity (full validation is the harness's job)", () => {
  it("an all-5.0 fighter beats an all-1.0 fighter meaningfully more than half the time", () => {
    const elite = buildUniformSnapshot("elite", "Elite", ELITE_SOURCE_FIGHTER);
    const weak = buildUniformSnapshot("weak", "Weak", WEAK_SOURCE_FIGHTER);

    const ITERATIONS = 300;
    let eliteWins = 0;
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const result = simulateFight(elite, weak, createRng(seed));
      if (result.winnerId === "elite") eliteWins++;
    }

    const winRate = eliteWins / ITERATIONS;
    // Loose bound on purpose — this just proves the direction and
    // magnitude are sane, not that 0.08 is the final tuned coefficient.
    expect(winRate, `elite win rate was ${winRate}`).toBeGreaterThan(0.6);
  });

  it("identical builds win roughly half the time each, regardless of argument order", () => {
    const x = buildUniformSnapshot("x", "X", NEUTRAL_SOURCE_FIGHTER);
    const y = buildUniformSnapshot("y", "Y", NEUTRAL_SOURCE_FIGHTER);

    const ITERATIONS = 300;
    let xWins = 0;
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const result = simulateFight(x, y, createRng(seed + 10_000));
      if (result.winnerId === "x") xWins++;
    }

    const winRate = xWins / ITERATIONS;
    expect(winRate, `x win rate was ${winRate}, expected roughly 0.5`).toBeGreaterThan(0.35);
    expect(winRate, `x win rate was ${winRate}, expected roughly 0.5`).toBeLessThan(0.65);
  });

  it("argument order doesn't systematically favor whichever fighter is passed first", () => {
    const strong = buildUniformSnapshot("strong", "Strong", ELITE_SOURCE_FIGHTER);
    const weak = buildUniformSnapshot("weak", "Weak", WEAK_SOURCE_FIGHTER);

    const ITERATIONS = 200;
    let strongWinsWhenFirst = 0;
    let strongWinsWhenSecond = 0;

    for (let seed = 0; seed < ITERATIONS; seed++) {
      const asFirst = simulateFight(strong, weak, createRng(seed));
      if (asFirst.winnerId === "strong") strongWinsWhenFirst++;

      const asSecond = simulateFight(weak, strong, createRng(seed));
      if (asSecond.winnerId === "strong") strongWinsWhenSecond++;
    }

    const rateWhenFirst = strongWinsWhenFirst / ITERATIONS;
    const rateWhenSecond = strongWinsWhenSecond / ITERATIONS;

    // Generous tolerance — the two call orders draw RNG in different
    // sequences so exact equality isn't expected, but a large gap would
    // indicate a hidden bias toward "fighterA" in determineActor or
    // elsewhere.
    expect(
      Math.abs(rateWhenFirst - rateWhenSecond),
      `first-slot win rate ${rateWhenFirst} vs second-slot win rate ${rateWhenSecond}`
    ).toBeLessThan(0.2);
  });
});

describe("effectiveInitiative", () => {
  it("decreases as leg damage increases", () => {
    const snapshot = buildUniformSnapshot("x", "X", NEUTRAL_SOURCE_FIGHTER);
    const combatant = createCombatant(snapshot);
    const fresh = effectiveInitiative(combatant);

    combatant.damage = { ...combatant.damage, leg: 100 };
    const hurtLeg = effectiveInitiative(combatant);

    expect(hurtLeg).toBeLessThan(fresh);
  });

  it("decreases as energy drops (fatigue)", () => {
    const snapshot = buildUniformSnapshot("x", "X", NEUTRAL_SOURCE_FIGHTER);
    const combatant = createCombatant(snapshot);
    const fresh = effectiveInitiative(combatant);

    combatant.fatigue = { energy: 0, cumulativeFatigue: 100 };
    const gassed = effectiveInitiative(combatant);

    expect(gassed).toBeLessThan(fresh);
  });
});

describe("scaledLegPenalty", () => {
  const CLASSES: ActionClass[] = ["striking", "takedown", "grappling", "movement"];

  it("equals the raw leg-damage multiplier at full influence (movement)", () => {
    expect(scaledLegPenalty(100, "movement")).toBeCloseTo(legDamageSpeedMultiplier(100), 9);
    expect(scaledLegPenalty(50, "movement")).toBeCloseTo(legDamageSpeedMultiplier(50), 9);
  });

  it("is always 1.0 (no penalty) for grappling, regardless of leg damage", () => {
    // Directly targets the "overcorrection" this replaced: a fighter's
    // submission technique on the ground shouldn't crater because their
    // leg is damaged the way their takedown shot or footwork would.
    for (const legDamage of [0, 25, 50, 75, 100]) {
      expect(scaledLegPenalty(legDamage, "grappling")).toBeCloseTo(1.0, 9);
    }
  });

  it("never improves (increases) as leg damage rises, for every action class", () => {
    for (const actionClass of CLASSES) {
      const samples = [0, 25, 50, 75, 100].map((dmg) => scaledLegPenalty(dmg, actionClass));
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
      }
    }
  });

  it("never produces a value above 1.0 for any class or damage level — a hurt leg is never a buff", () => {
    for (const actionClass of CLASSES) {
      for (const legDamage of [0, 25, 50, 75, 100]) {
        expect(scaledLegPenalty(legDamage, actionClass)).toBeLessThanOrEqual(1.0);
      }
    }
  });
});

describe("scoreRound / scoreDecision — judging cannot influence the physical fight", () => {
  function stats(overrides: Partial<FighterFightStats> = {}): FighterFightStats {
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
      ...overrides,
    };
  }

  it("scoreRound is a pure function of already-decided round stats", () => {
    // Both receive the SAME finished round data — scoreRound never
    // regenerates or re-simulates anything, only reads what already
    // happened. This is what makes "judging can't change the fight"
    // true: judging operates on a frozen snapshot, not live state.
    const roundStats = {
      a: stats({ significantStrikesLanded: 10 }),
      b: stats({ significantStrikesLanded: 3 }),
    };
    const first = scoreRound(roundStats, "a", "b", createRng(1));
    const second = scoreRound(roundStats, "a", "b", createRng(1));
    expect(first).toBe(second);
    expect(first).toBe("a"); // clearly ahead on the box score, no tie-break needed
  });

  it("scoreDecision run twice on the same completed rounds with the same seed gives the same winner", () => {
    const completedRounds = [
      { a: stats({ significantStrikesLanded: 10 }), b: stats({ significantStrikesLanded: 3 }) },
      { a: stats({ significantStrikesLanded: 2 }), b: stats({ significantStrikesLanded: 8 }) },
      { a: stats({ significantStrikesLanded: 10 }), b: stats({ significantStrikesLanded: 3 }) },
    ];
    const winner1 = scoreDecision(completedRounds, "a", "b", createRng(5));
    const winner2 = scoreDecision(completedRounds, "a", "b", createRng(5));
    expect(winner1).toBe(winner2);
    expect(winner1).toBe("a"); // wins rounds 1 and 3
  });

  it("a tied round's tie-break roll never changes which rounds were already won going in", () => {
    // Two fighters who tie every round (identical stats) still resolve
    // to SOME winner via scoreDecision's RNG tie-breaks — but that RNG
    // consumption happens entirely within scoreDecision/scoreRound,
    // never touching the completedRounds data that was passed in. Two
    // different seeds are free to disagree on the winner; what matters
    // is that neither call mutates its input.
    const tiedRound = { a: stats({ significantStrikesLanded: 5 }), b: stats({ significantStrikesLanded: 5 }) };
    const completedRounds = [tiedRound, tiedRound, tiedRound];
    const before = JSON.parse(JSON.stringify(completedRounds));

    scoreDecision(completedRounds, "a", "b", createRng(1));
    scoreDecision(completedRounds, "a", "b", createRng(2));

    expect(completedRounds).toEqual(before);
  });
});

describe("simulateFight — input validation", () => {
  it("throws if both fighters share the same id", () => {
    // Every internal Record is keyed by fighter id — two snapshots
    // with the same id would silently collapse into one entry instead
    // of producing a coherent (or loudly incoherent) result.
    const a = buildUniformSnapshot("same-id", "A", NEUTRAL_SOURCE_FIGHTER);
    const b = buildUniformSnapshot("same-id", "B", ELITE_SOURCE_FIGHTER);
    expect(() => simulateFight(a, b, createRng(1))).toThrow(/distinct fighter IDs/);
  });
});

describe("defensiveMovement", () => {
  it("logs an event rather than leaving a silent gap in the fight log", () => {
    // Build a fighter who can ONLY select defensiveMovement by giving
    // it overwhelming preference weight relative to everything else —
    // not directly testable in isolation since selectAction is
    // probabilistic, so instead run enough fights and confirm at least
    // one "defensiveMovement" event appears somewhere in a normal fight
    // (it's in the distance menu for every fighter, with a nonzero
    // flat weight, so across enough seeds it must get chosen sometimes).
    const a = buildUniformSnapshot("a", "A", NEUTRAL_SOURCE_FIGHTER);
    const b = buildUniformSnapshot("b", "B", NEUTRAL_SOURCE_FIGHTER);

    let sawDefensiveMovementEvent = false;
    for (let seed = 0; seed < 200 && !sawDefensiveMovementEvent; seed++) {
      const result = simulateFight(a, b, createRng(seed));
      if (result.events.some((e) => e.type === "defensiveMovement")) {
        sawDefensiveMovementEvent = true;
      }
    }
    expect(sawDefensiveMovementEvent, "expected at least one logged defensiveMovement event across 200 fights").toBe(true);
  });
});
