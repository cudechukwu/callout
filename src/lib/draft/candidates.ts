import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import type { RNG } from "@/lib/simulation/types";
import { DRAFT_POOL, poolByTier } from "./draftPool";
import type { DraftTier } from "./tiers";

const TIER_ORDER: readonly DraftTier[] = ["elite", "strong", "solid", "wildcard"];

/**
 * Per-slot tier-weighting, locked in LOCKED_DECISIONS.md > Decision 2:
 * slot 1 leans elite, slot 2 is more mixed, slot 3 has real wildcard
 * chance. This is what makes drafting feel like drafting instead of
 * "always take the highest number" — a slot 3 pick might be your only
 * shot at a specific fighter before they're gone.
 */
type SlotDistribution = Record<DraftTier, number>;

const SLOT_DISTRIBUTIONS: readonly [SlotDistribution, SlotDistribution, SlotDistribution] = [
  { elite: 0.5, strong: 0.4, solid: 0.1, wildcard: 0 },
  { elite: 0.2, strong: 0.5, solid: 0.3, wildcard: 0 },
  { elite: 0.1, strong: 0.25, solid: 0.35, wildcard: 0.3 },
];

function assertValidDistribution(dist: SlotDistribution, label: string): void {
  for (const tier of TIER_ORDER) {
    const weight = dist[tier];
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error(`${label}.${tier} must be in [0, 1], got ${weight}`);
    }
  }
  const sum = TIER_ORDER.reduce((acc, tier) => acc + dist[tier], 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`${label} weights must sum to 1.0, got ${sum}`);
  }
}

SLOT_DISTRIBUTIONS.forEach((dist, i) => assertValidDistribution(dist, `SLOT_DISTRIBUTIONS[${i}]`));

/**
 * When a slot's preferred tier is fully depleted (every member already
 * used — a real risk late in an 8-round draft, since some attributes'
 * elite tier in the curated pool can be quite small), fall back to the
 * nearest quality tier rather than throwing. Order is "closest quality
 * first": a depleted elite tier falls back to strong before solid.
 */
const FALLBACK_ORDER: Record<DraftTier, readonly DraftTier[]> = {
  elite: ["elite", "strong", "solid", "wildcard"],
  strong: ["strong", "elite", "solid", "wildcard"],
  solid: ["solid", "strong", "wildcard", "elite"],
  wildcard: ["wildcard", "solid", "strong", "elite"],
};

function sampleTier(distribution: SlotDistribution, roll: number): DraftTier {
  let cumulative = 0;
  for (const tier of TIER_ORDER) {
    cumulative += distribution[tier];
    if (roll < cumulative) return tier;
  }
  return "wildcard"; // floating-point edge case (roll very close to 1.0)
}

function pickFromTier(
  tiers: Record<DraftTier, SourceFighter[]>,
  preferredTier: DraftTier,
  excluded: ReadonlySet<number>,
  roll: number
): SourceFighter {
  for (const tier of FALLBACK_ORDER[preferredTier]) {
    const available = tiers[tier].filter((f) => !excluded.has(f.id));
    if (available.length > 0) {
      const index = Math.floor(roll * available.length);
      // Guard the extremely unlikely roll === 1.0 case.
      return available[Math.min(index, available.length - 1)]!;
    }
  }
  throw new Error(
    "No available fighters remain for this attribute — draft pool exhausted. " +
      "This should be structurally impossible with an 8-round draft against a " +
      "~70-fighter pool; if it happens, DRAFT_POOL or CUTOFF_RANK needs revisiting."
  );
}

/**
 * Generates the 3 candidate fighters shown for one attribute at one
 * point in a draft, given which fighters are already off the table
 * (picked for a previous attribute this draft). The 3 results are
 * always distinct from each other AND from `alreadyUsedFighterIds` —
 * satisfies the one-per-fighter constraint without the caller having
 * to re-check anything.
 */
export function generateCandidates(
  attribute: VisibleAttribute,
  alreadyUsedFighterIds: ReadonlySet<number>,
  rng: RNG,
  pool: readonly SourceFighter[] = DRAFT_POOL
): [SourceFighter, SourceFighter, SourceFighter] {
  const tiers = poolByTier(attribute, pool);
  const excluded = new Set(alreadyUsedFighterIds);

  const candidates = SLOT_DISTRIBUTIONS.map((distribution) => {
    const preferredTier = sampleTier(distribution, rng.next());
    const fighter = pickFromTier(tiers, preferredTier, excluded, rng.next());
    excluded.add(fighter.id); // no duplicate across the 3 slots in this round
    return fighter;
  });

  return candidates as [SourceFighter, SourceFighter, SourceFighter];
}
