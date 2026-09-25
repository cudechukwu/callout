import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VISIBLE_ATTRIBUTES } from "../data/types";
import { ALL_ELITE, ALL_WEAK, buildArchetypeSnapshot, ELITE_STRIKER, ELITE_WRESTLER } from "../simulation/balanceFixtures";
import { createRng } from "../simulation/rng";
import { computeIdentity } from "./identity";
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft } from "./session";

function drafted(seed: number, skill: number) {
  const rng = createRng(seed);
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]!;
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const best = candidates.reduce((a, b) => (b[attribute] > a[attribute] ? b : a));
    state = selectCandidate(state, (rng.next() < skill ? best : candidates[Math.floor(rng.next() * candidates.length)]!).id);
  }
  const selections: Record<string, { sourceFighter: unknown }> = {};
  for (const [k, f] of state.selections) selections[k] = { sourceFighter: f };
  return selections as never;
}

describe("computeIdentity", () => {
  it("is deterministic: the same build always gets the same identity", () => {
    const build = drafted(7, 0.6);
    expect(computeIdentity(build)).toEqual(computeIdentity(build));
  });

  it("calls a build that is elite everywhere a complete fighter with no weak link", () => {
    const identity = computeIdentity(ALL_ELITE.selections);
    expect(identity.weakLink).toBeNull();
    expect(["Complete Fighter", "Balanced"]).toContain(identity.style);
  });

  it("names a weak link only for a genuinely weak pick", () => {
    const weak = computeIdentity(ALL_WEAK.selections);
    expect(weak.weakLink).not.toBeNull();
    expect(VISIBLE_ATTRIBUTES).toContain(weak.weakLink!.attribute);
    // A build whose lowest pick is still solid-tier has no weak link.
    const values = Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, 4.6])) as Record<(typeof VISIBLE_ATTRIBUTES)[number], number>;
    values.boxing = 4.1;
    expect(computeIdentity(buildArchetypeSnapshot("s", "s", values, 4.6).selections).weakLink).toBeNull();
  });

  it("reads an all-in striker and an all-in wrestler as opposites", () => {
    const striker = computeIdentity(ELITE_STRIKER.selections);
    const wrestler = computeIdentity(ELITE_WRESTLER.selections);
    expect(["Power Striker", "Technical Striker", "Glass Cannon"]).toContain(striker.style);
    expect(["Pressure Wrestler", "Submission Hunter"]).toContain(wrestler.style);
    expect(wrestler.bestWeapon).toBe("Grappling");
  });

  it("never repeats what the style already says in the trait", () => {
    for (let seed = 0; seed < 600; seed++) {
      const { style, trait } = computeIdentity(drafted(seed, (seed % 10) / 9));
      if (style === "Power Striker") expect(trait).not.toBe("Heavy Hands");
      if (style === "Iron Man") expect(["Relentless", "Iron Chin"]).not.toContain(trait);
      if (style === "Defensive Specialist") expect(trait).not.toBe("Elusive");
    }
  });

  it("gives real variety: no style dominates and many combinations occur", () => {
    const styles: Record<string, number> = {};
    const combos = new Set<string>();
    const n = 1500;
    for (let seed = 0; seed < n; seed++) {
      const { style, trait } = computeIdentity(drafted(1000 + seed, (seed % 20) / 19));
      styles[style] = (styles[style] ?? 0) + 1;
      combos.add(`${style}+${trait}`);
    }
    expect(Math.max(...Object.values(styles)) / n).toBeLessThan(0.3);
    expect(combos.size).toBeGreaterThanOrEqual(25);
  });
});

describe("identity isolation", () => {
  it("is never imported by the simulation, so it cannot influence fights", () => {
    const dir = join(__dirname, "../simulation");
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => /from\s+["'][^"']*\/identity["']/.test(readFileSync(join(dir, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
