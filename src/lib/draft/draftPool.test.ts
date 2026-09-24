import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { SOURCE_FIGHTERS } from "@/lib/data/generated/fighters";
import { buildDraftPool, DRAFT_POOL, poolByTier } from "./draftPool";

describe("buildDraftPool", () => {
  it("is deterministic — same computation always produces the same pool", () => {
    const a = buildDraftPool();
    const b = buildDraftPool();
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });

  it("has no duplicate fighters", () => {
    const ids = DRAFT_POOL.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only contains fighters that actually exist in the source data", () => {
    const sourceIds = new Set(SOURCE_FIGHTERS.map((f) => f.id));
    for (const fighter of DRAFT_POOL) {
      expect(sourceIds.has(fighter.id)).toBe(true);
    }
  });

  it("lands in a reasonable range around the ~70 target (LOCKED_DECISIONS.md Decision 2)", () => {
    // Not a hard "must be exactly 70" — the target is "curated,
    // recognizable, small enough for opportunity cost to matter," not
    // a magic number. Loose bounds to catch a real miscalibration
    // (e.g. TOP_K_PER_ATTRIBUTE set so high the pool basically becomes
    // the full 317) without being brittle to a K tweak of +/-2.
    expect(DRAFT_POOL.length).toBeGreaterThan(40);
    expect(DRAFT_POOL.length).toBeLessThan(100);
  });

  it("every attribute has at least one elite-tier fighter in the pool", () => {
    // Structural sanity check: if this fails, TOP_K_PER_ATTRIBUTE is
    // too small or something upstream broke — the "elite" slot in
    // candidate generation would have nothing to draw from.
    for (const attribute of VISIBLE_ATTRIBUTES) {
      const tiers = poolByTier(attribute);
      expect(tiers.elite.length, `${attribute} has no elite-tier pool members`).toBeGreaterThan(0);
    }
  });
});

describe("poolByTier", () => {
  it("every pool fighter is classified into exactly one tier per attribute", () => {
    for (const attribute of VISIBLE_ATTRIBUTES) {
      const tiers = poolByTier(attribute);
      const total =
        tiers.elite.length + tiers.strong.length + tiers.solid.length + tiers.wildcard.length;
      expect(total).toBe(DRAFT_POOL.length);
    }
  });

  it("classification matches the fighter's actual rating for that attribute", () => {
    const tiers = poolByTier("wrestling");
    for (const fighter of tiers.elite) {
      expect(fighter.wrestling).toBeGreaterThanOrEqual(4.8);
    }
    for (const fighter of tiers.wildcard) {
      expect(fighter.wrestling).toBeLessThan(3.9);
    }
  });
});
