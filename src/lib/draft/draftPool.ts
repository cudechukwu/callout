import { SOURCE_FIGHTERS } from "@/lib/data/generated/fighters";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import { classifyTier, type DraftTier } from "./tiers";

/**
 * Rank used to set each attribute's quality bar. The bar is the rating of
 * the fighter at this rank; everyone at or above it is eligible for that
 * attribute. Final pool size is the UNION across all 8 attributes — well
 * under 8 x this, since a well-rounded fighter clears the bar in several
 * attributes at once. Lands near the "~70 recognizable fighters" target
 * from DESIGN_FINAL.md; see draftPool.test.ts for the measured size
 * against the real 317-fighter CSV.
 */
const CUTOFF_RANK = 10;

/**
 * Everyone whose rating for `attribute` is at least the rating of the
 * fighter at CUTOFF_RANK. Ties at the bar are ALL kept: the number 10 sets
 * a quality threshold, not a headcount. (An earlier version took exactly
 * ten and broke ties alphabetically, which silently dropped elite names
 * such as Jones, Makhachev and Usman from Wrestling for no reason a player
 * could defend.)
 */
function eligibleFighters(attribute: VisibleAttribute, rank: number): SourceFighter[] {
  const byRating = [...SOURCE_FIGHTERS].sort(
    (a, b) => b[attribute] - a[attribute] || a.name.localeCompare(b.name)
  );
  const cutoff = byRating[Math.min(rank, byRating.length) - 1]![attribute];
  return byRating.filter((fighter) => fighter[attribute] >= cutoff);
}

/**
 * The curated draft pool: union, across the 8 attributes, of every fighter at or above that
 * attribute's quality bar (the rating of its 10th-ranked fighter),
 * out of the full 317. This is what candidate generation (next chunk)
 * samples from instead of the whole roster — DESIGN_FINAL.md's
 * rationale is that opportunity cost ("I already used Pereira") only
 * feels real if the same recognizable names keep reappearing across
 * categories, which a uniform sample across all 317 essentially never
 * produces.
 *
 * Because a fighter's strengths are attribute-specific, this ALSO
 * produces tier diversity for free: a fighter included here for elite
 * Power (but weak Wrestling) shows up as a genuine wildcard-tier option
 * when drafting Wrestling, without a separately curated "weak fighters"
 * list. Verified empirically in draftPool.test.ts, not just assumed.
 */
export function buildDraftPool(): SourceFighter[] {
  const pool = new Map<number, SourceFighter>();
  for (const attribute of VISIBLE_ATTRIBUTES) {
    for (const fighter of eligibleFighters(attribute, CUTOFF_RANK)) {
      pool.set(fighter.id, fighter);
    }
  }
  // Sorted by id for a stable, deterministic iteration order — Map
  // insertion order would otherwise depend on VISIBLE_ATTRIBUTES'
  // ordering, which is an implementation detail that shouldn't leak
  // into anything that iterates the pool.
  return [...pool.values()].sort((a, b) => a.id - b.id);
}

/** Computed once at module load — the pool doesn't change at runtime. */
export const DRAFT_POOL: readonly SourceFighter[] = buildDraftPool();

/**
 * Groups the draft pool by tier for a single attribute. Candidate
 * generation (next chunk) calls this once per attribute per draft
 * round to know what's available in each tier before sampling.
 */
export function poolByTier(
  attribute: VisibleAttribute,
  pool: readonly SourceFighter[] = DRAFT_POOL
): Record<DraftTier, SourceFighter[]> {
  const groups: Record<DraftTier, SourceFighter[]> = {
    elite: [],
    strong: [],
    solid: [],
    wildcard: [],
  };
  for (const fighter of pool) {
    groups[classifyTier(fighter[attribute])].push(fighter);
  }
  return groups;
}
