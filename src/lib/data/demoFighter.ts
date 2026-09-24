import { SOURCE_FIGHTERS } from "./generated/fighters";
import { VISIBLE_ATTRIBUTES } from "./types";
import type { VisibleAttribute } from "./types";
import type { AttributeSelection, AttributeSelections } from "@/lib/simulation/types";

function findFighter(name: string) {
  const fighter = SOURCE_FIGHTERS.find((f) => f.name === name);
  if (!fighter) throw new Error(`Demo fighter lookup failed: "${name}" not in source data`);
  return fighter;
}

const DEMO_PICKS: Record<VisibleAttribute, string> = {
  wrestling: "Khabib Nurmagomedov",
  submissions: "Charles Oliveira",
  boxing: "Anderson Silva",
  kickboxing: "Alex Pereira",
  power: "Francis Ngannou",
  cardio: "Max Holloway",
  chin: "Dustin Poirier",
  fightIq: "Jon Jones",
};

/**
 * A hand-picked, real-data showcase build for marketing surfaces (the
 * landing page hero) — not randomly drafted, so it reliably reads as
 * "elite" on first load rather than depending on RNG. Every name here
 * is a real row in fighter_data.csv, looked up by name so a CSV
 * regeneration would fail loudly (via findFighter's throw) rather than
 * silently showing stale data if a name ever changed.
 */
export const DEMO_SELECTIONS: AttributeSelections = VISIBLE_ATTRIBUTES.reduce(
  (acc, attribute) => {
    acc[attribute] = { sourceFighter: findFighter(DEMO_PICKS[attribute]) };
    return acc;
  },
  {} as Record<VisibleAttribute, AttributeSelection>
) as AttributeSelections;
