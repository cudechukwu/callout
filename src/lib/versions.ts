/**
 * Versions stored with every multiplayer draft round, so a stored game
 * always means what it meant when it was played (MULTIPLAYER_DESIGN.md >
 * Versioning). The draft plan's own version lives in draft/plan.ts.
 *
 * Bump POOL_VERSION when the draft pool rule or membership changes,
 * RATINGS_VERSION when any fighter rating changes, and ENGINE_VERSION when
 * the simulation changes what a seed produces.
 */
export const POOL_VERSION = 1;
export const RATINGS_VERSION = 1;
export const ENGINE_VERSION = "0.1";
