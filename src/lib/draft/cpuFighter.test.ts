import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import { generateCpuFighter, randomCpuName } from "./cpuFighter";

describe("generateCpuFighter", () => {
  it("produces a valid, complete FighterSnapshot", () => {
    const snapshot = generateCpuFighter(createRng(1), "cpu-1", "THE GATEKEEPER");
    expect(snapshot.id).toBe("cpu-1");
    expect(snapshot.name).toBe("THE GATEKEEPER");
    for (const attribute of VISIBLE_ATTRIBUTES) {
      expect(snapshot.selections[attribute].sourceFighter).toBeDefined();
    }
  });

  it("never picks the same fighter twice", () => {
    for (let seed = 0; seed < 30; seed++) {
      const snapshot = generateCpuFighter(createRng(seed), "cpu", "CPU");
      const ids = VISIBLE_ATTRIBUTES.map((a) => snapshot.selections[a].sourceFighter.id);
      expect(new Set(ids).size, `seed ${seed}: duplicate fighter in CPU build`).toBe(8);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateCpuFighter(createRng(7), "x", "X");
    const b = generateCpuFighter(createRng(7), "x", "X");
    for (const attribute of VISIBLE_ATTRIBUTES) {
      expect(a.selections[attribute].sourceFighter.id).toBe(b.selections[attribute].sourceFighter.id);
    }
  });

  it("varies builds across seeds (not always the same picks)", () => {
    const wrestlingPicks = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const snapshot = generateCpuFighter(createRng(seed), "x", "X");
      wrestlingPicks.add(snapshot.selections.wrestling.sourceFighter.id);
    }
    expect(wrestlingPicks.size).toBeGreaterThan(1);
  });
});

describe("randomCpuName", () => {
  it("always returns a non-empty string", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(randomCpuName(createRng(seed)).length).toBeGreaterThan(0);
    }
  });
});
