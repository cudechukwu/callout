import { describe, expect, it } from "vitest";
import { CLINCH, DISTANCE, roleFor, type FightPosition } from "./types";

describe("roleFor", () => {
  it("returns 'distance' for both fighters at distance", () => {
    expect(roleFor(DISTANCE, "a")).toBe("distance");
    expect(roleFor(DISTANCE, "b")).toBe("distance");
  });

  it("returns 'clinch' for both fighters in clinch", () => {
    expect(roleFor(CLINCH, "a")).toBe("clinch");
    expect(roleFor(CLINCH, "b")).toBe("clinch");
  });

  it("assigns exactly one top and everyone else bottom on the ground", () => {
    const position: FightPosition = { kind: "ground", topFighterId: "a" };
    expect(roleFor(position, "a")).toBe("top");
    expect(roleFor(position, "b")).toBe("bottom");
    // Any id that isn't the top fighter's id is "bottom" — this is what
    // makes "exactly one top, implicitly everyone else bottom" hold by
    // construction. There's no separate bottomFighterId that could
    // disagree with topFighterId, unlike the old per-fighter Position
    // record this type replaced.
    expect(roleFor(position, "literally-anyone-else")).toBe("bottom");
  });
});
