import { SOURCE_FIGHTERS } from "@/lib/data/generated/fighters";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import { classifyTier, type DraftTier } from "./tiers";

/**
 * How many top performers per attribute feed into the curated pool.
 * Final pool size is the UNION across all 8 attributes' top-K lists —
 * typically well under 8*K once overlap is accounted for, since a
 * well-rounded fighter can rank top-K in several attributes at once.
 * Tuned to land near the "~70 recognizable fighters" target from
 * LOCKED_DECISIONS.md > Decision 2 — see draftPool.test.ts for the
 * actual measured size against the real 317-fighter CSV.
 */
const TOP_K_PER_ATTRIBUTE = 10;

function topFightersByAttribute(attribute: VisibleAttribute, k: number): SourceFighter[] {
  return [...SOURCE_FIGHTERS]
    .sort((a, b) => b[attribute] - a[attribute] || a.name.localeCompare(b.name))
    .slice(0, k);
}

/**
 * The curated draft pool: union of the top-K fighters per attribute,
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
    for (const fighter of topFightersByAttribute(attribute, TOP_K_PER_ATTRIBUTE)) {
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
