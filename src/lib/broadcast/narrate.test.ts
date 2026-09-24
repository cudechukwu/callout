import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@/lib/simulation/types";
import { narrateFight } from "./narrate";

const NAMES = { a: "NIGHTSHIFT", b: "WRESTLEGOD" };

function event(overrides: Partial<SimulationEvent>): SimulationEvent {
  return {
    sequence: 0,
    round: 1,
    fightTimeSeconds: 30,
    type: "strikeLanded",
    actorId: "a",
    targetId: "b",
    ...overrides,
  };
}

describe("narrateFight", () => {
  it("produces one moment per narratable event, preserving order", () => {
    const events: SimulationEvent[] = [
      event({ sequence: 0, type: "strikeLanded", metadata: { action: "jab", zone: "head" } }),
      event({ sequence: 1, type: "takedownLanded" }),
      event({ sequence: 2, type: "submissionAttempt" }),
    ];
    const moments = narrateFight(events, NAMES);
    expect(moments).toHaveLength(3);
    expect(moments[0]!.text).toContain("jab");
    expect(moments[1]!.text).toContain("takedown");
    expect(moments[2]!.text).toContain("submission");
  });

  it("filters out routine noise events entirely", () => {
    const events: SimulationEvent[] = [
      event({ type: "strikeMissed" }),
      event({ type: "defensiveMovement" }),
      event({ type: "clinchEntryFailed" }),
    ];
    expect(narrateFight(events, NAMES)).toHaveLength(0);
  });

  it("substitutes actor and target names correctly", () => {
    const events: SimulationEvent[] = [
      event({ type: "submission", actorId: "a", targetId: "b" }),
    ];
    const [moment] = narrateFight(events, NAMES);
    expect(moment!.text).toContain("NIGHTSHIFT");
    expect(moment!.text).toContain("WRESTLEGOD");
  });

  it("marks finishes (knockout/tko/submission) with emphasis: finish", () => {
    const events: SimulationEvent[] = [
      event({ type: "knockout" }),
      event({ type: "tko" }),
      event({ type: "submission" }),
    ];
    const moments = narrateFight(events, NAMES);
    expect(moments.every((m) => m.emphasis === "finish")).toBe(true);
  });

  it("non-finish moments have no emphasis", () => {
    const events: SimulationEvent[] = [event({ type: "takedownLanded" })];
    const [moment] = narrateFight(events, NAMES);
    expect(moment!.emphasis).toBeUndefined();
  });

  it("falls back to a generic label for unknown fighter ids", () => {
    const events: SimulationEvent[] = [
      event({ type: "takedownLanded", actorId: "unknown-id" }),
    ];
    const [moment] = narrateFight(events, NAMES);
    expect(moment!.text).toContain("Fighter");
  });

  it("produces different text for different strike actions", () => {
    const events: SimulationEvent[] = [
      event({ type: "strikeLanded", metadata: { action: "jab" } }),
      event({ type: "strikeLanded", metadata: { action: "powerShot" } }),
      event({ type: "strikeLanded", metadata: { action: "kick", zone: "leg" } }),
    ];
    const moments = narrateFight(events, NAMES);
    const texts = moments.map((m) => m.text);
    expect(new Set(texts).size).toBe(3);
    expect(texts[2]).toContain("leg");
  });
});
