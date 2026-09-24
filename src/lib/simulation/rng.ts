import seedrandom from "seedrandom";
import type { RNG } from "./types";

/**
 * Seeded, deterministic RNG. Same seed always produces the same sequence
 * of next() calls — this is what makes fight replay possible.
 *
 * The `seedrandom` dependency is isolated here on purpose: nothing in
 * engine.ts imports it directly. If we ever swap PRNG libraries, this
 * is the only file that changes.
 */
export function createRng(seed: number | string): RNG {
  const generator = seedrandom(seed.toString());
  return {
    next: () => generator(),
  };
}
