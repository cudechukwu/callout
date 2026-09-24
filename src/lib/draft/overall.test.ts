import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "../data/types";
import { ALL_ELITE, ALL_WEAK, buildArchetypeSnapshot } from "../simulation/balanceFixtures";
import { OVR_MAX, OVR_MIN, computeOverall } from "./overall";

function uniformBuild(value: number) {
  const ratings = Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, value])) as Record<
    (typeof VISIBLE_ATTRIBUTES)[number],
    number
  >;
  return buildArchetypeSnapshot(`u${value}`, `Uniform ${value}`, ratings, value);
}

describe("computeOverall", () => {
  it("rises with build quality across the range drafted builds actually occupy", () => {
    const scores = [4.0, 4.4, 4.7, 5.0].map((v) => computeOverall(uniformBuild(v).selections));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    }
  });

  it("stays within the displayed range at the extremes", () => {
    expect(computeOverall(ALL_ELITE.selections)).toBeLessThanOrEqual(OVR_MAX);
    expect(computeOverall(ALL_WEAK.selections)).toBe(OVR_MIN);
  });

  it("is deterministic and an integer", () => {
    const build = uniformBuild(4.5);
    const first = computeOverall(build.selections);
    expect(computeOverall(build.selections)).toBe(first);
    expect(Number.isInteger(first)).toBe(true);
  });
});

describe("OVR isolation", () => {
  it("is never imported by the simulation, so it cannot influence fights", () => {
    const dir = join(__dirname, "../simulation");
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => /from\s+["'][^"']*\/overall["']/.test(readFileSync(join(dir, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
