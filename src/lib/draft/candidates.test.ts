import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import { generateCandidates } from "./candidates";
import { classifyTier } from "./tiers";
import { DRAFT_POOL } from "./draftPool";

describe("generateCandidates", () => {
  it("always returns 3 distinct fighters", () => {
    for (let seed = 0; seed < 200; seed++) {
      const candidates = generateCandidates("wrestling", new Set(), createRng(seed));
      const ids = candidates.map((f) => f.id);
      expect(new Set(ids).size, `seed ${seed}: duplicate candidate`).toBe(3);
    }
  });

  it("never returns a fighter that's already used", () => {
    // Exclude a big chunk of the pool and confirm none leak through.
    const excluded = new Set(DRAFT_POOL.slice(0, 20).map((f) => f.id));
    for (let seed = 0; seed < 200; seed++) {
      const candidates = generateCandidates("boxing", excluded, createRng(seed));
      for (const fighter of candidates) {
        expect(excluded.has(fighter.id), `seed ${seed}: returned excluded fighter ${fighter.name}`).toBe(
          false
        );
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateCandidates("power", new Set(), createRng(42));
    const b = generateCandidates("power", new Set(), createRng(42));
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });

  it("works for every visible attribute without throwing", () => {
    for (const attribute of VISIBLE_ATTRIBUTES) {
      expect(() => generateCandidates(attribute, new Set(), createRng(1))).not.toThrow();
    }
  });

  it("degrades gracefully instead of throwing when most of the pool is excluded", () => {
    // Exclude all but a handful of fighters — this should still return
    // 3 distinct candidates via the fallback chain, not throw, as long
    // as at least 3 pool members remain at all.
    const keepIds = new Set(DRAFT_POOL.slice(0, 4).map((f) => f.id));
    const excluded = new Set(DRAFT_POOL.filter((f) => !keepIds.has(f.id)).map((f) => f.id));

    expect(() => generateCandidates("chin", excluded, createRng(7))).not.toThrow();
    const candidates = generateCandidates("chin", excluded, createRng(7));
    expect(new Set(candidates.map((f) => f.id)).size).toBe(3);
  });

  it("throws a clear error when fewer than 3 fighters remain available", () => {
    const keepIds = new Set(DRAFT_POOL.slice(0, 2).map((f) => f.id));
    const excluded = new Set(DRAFT_POOL.filter((f) => !keepIds.has(f.id)).map((f) => f.id));
    expect(() => generateCandidates("cardio", excluded, createRng(1))).toThrow(/pool exhausted/);
  });
});

describe("generateCandidates — tier-weighting shape", () => {
  it("slot 1 is elite-tier more often than slot 3, across many draws", () => {
    // Statistical check of the locked slot distributions (50/40/10/0
    // for slot 1 vs 10/25/35/30 for slot 3) — not exact percentages,
    // just confirming the intended lean actually shows up empirically
    // rather than trusting the weight table blindly.
    const ITERATIONS = 2000;
    let slot1EliteCount = 0;
    let slot3EliteCount = 0;

    for (let seed = 0; seed < ITERATIONS; seed++) {
      const [slot1, , slot3] = generateCandidates("fightIq", new Set(), createRng(seed));
      if (classifyTier(slot1.fightIq) === "elite") slot1EliteCount++;
      if (classifyTier(slot3.fightIq) === "elite") slot3EliteCount++;
    }

    expect(slot1EliteCount).toBeGreaterThan(slot3EliteCount);
  });

  it("slot 3 produces wildcard-tier picks sometimes, slot 1 never does", () => {
    const ITERATIONS = 2000;
    let slot1WildcardCount = 0;
    let slot3WildcardCount = 0;

    for (let seed = 0; seed < ITERATIONS; seed++) {
      const [slot1, , slot3] = generateCandidates("submissions", new Set(), createRng(seed));
      if (classifyTier(slot1.submissions) === "wildcard") slot1WildcardCount++;
      if (classifyTier(slot3.submissions) === "wildcard") slot3WildcardCount++;
    }

    expect(slot1WildcardCount).toBe(0);
    expect(slot3WildcardCount).toBeGreaterThan(0);
  });
});
