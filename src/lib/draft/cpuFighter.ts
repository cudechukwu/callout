import type { SourceFighter } from "@/lib/data/types";
import type { FighterSnapshot, RNG } from "@/lib/simulation/types";
import { DRAFT_POOL } from "./draftPool";
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft, toFighterSnapshot } from "./session";

/**
 * Fictional CPU identities — per DESIGN_FINAL.md > AI/NPC Usage, these
 * must read as obviously non-human opponents, never disguised as real
 * players. Display layer should still tag them "CPU" explicitly; the
 * name alone isn't sufficient signal on its own.
 */
const CPU_NAMES = [
  "THE GATEKEEPER",
  "BLACK MAMBA",
  "IRON JAW",
  "NIGHT TRAIN",
  "THE BUTCHER",
  "RED WOLF",
  "STONE FIST",
  "THE REAPER",
] as const;

const CPU_PREFIXES = ["IRON", "RED", "BLACK", "NIGHT", "STONE", "GHOST", "STEEL", "CRIMSON"] as const;
const CPU_SUFFIXES = ["VIPER", "WOLF", "JACKAL", "HAMMER", "TITAN", "COBRA", "FALCON", "BULL"] as const;

/** ~70 distinct aliases — enough that a 20-fight rampage never repeats
 * one, since each CPU is a different build and a reused name would look
 * like the same fighter's stats changing. */
const ALL_CPU_NAMES: readonly string[] = [
  ...new Set([
    ...CPU_NAMES,
    ...CPU_PREFIXES.flatMap((prefix) => CPU_SUFFIXES.map((suffix) => `${prefix} ${suffix}`)),
  ]),
];

/** Picks a random alias, avoiding any in `taken` (falls back to a repeat
 * only if every alias is somehow taken). */
export function randomCpuName(rng: RNG, taken: ReadonlySet<string> = new Set()): string {
  const available = ALL_CPU_NAMES.filter((name) => !taken.has(name));
  const names = available.length > 0 ? available : ALL_CPU_NAMES;
  return names[Math.floor(rng.next() * names.length)]!;
}

/**
 * Auto-plays a full draft to produce a CPU opponent — same curated
 * pool, same one-per-fighter constraint, same tier-weighted candidates
 * a human would see. Each round picks randomly among the 3 shown
 * (not always the best-rated), so CPU builds vary across fights rather
 * than all converging on one "obviously correct" pick.
 */
export function generateCpuFighter(
  rng: RNG,
  id: string,
  name: string,
  pool: readonly SourceFighter[] = DRAFT_POOL
): FighterSnapshot {
  let state = startDraft(rng, pool);
  while (!isDraftComplete(state)) {
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const pick = candidates[Math.floor(rng.next() * candidates.length)]!;
    state = selectCandidate(state, pick.id, pool);
  }
  return toFighterSnapshot(state, id, name);
}
