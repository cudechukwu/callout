/**
 * Draft tier for a single attribute rating. A fighter's tier is always
 * per-attribute, not a fixed label on the fighter — someone elite at
 * Power can simultaneously be a wildcard at Wrestling. That's what
 * makes the curated pool (draftPool.ts) produce natural tier diversity
 * without needing a separately curated "weak fighters" list.
 */
export type DraftTier = "elite" | "strong" | "solid" | "wildcard";

/**
 * Thresholds locked in LOCKED_DECISIONS.md > Decision 2 (Draft Pool
 * Strategy). Applied to the raw 1.0-5.0 CSV rating for one specific
 * attribute.
 */
export function classifyTier(rating: number): DraftTier {
  if (rating >= 4.8) return "elite";
  if (rating >= 4.4) return "strong";
  if (rating >= 3.9) return "solid";
  return "wildcard";
}
