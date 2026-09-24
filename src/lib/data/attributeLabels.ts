import type { VisibleAttribute } from "./types";

/** Display labels for the 8 visible attributes — the raw keys (e.g.
 * "fightIq") are camelCase identifiers, not copy. */
export const ATTRIBUTE_LABELS: Record<VisibleAttribute, string> = {
  wrestling: "Wrestling",
  submissions: "Submissions",
  boxing: "Boxing",
  kickboxing: "Kickboxing",
  power: "Power",
  cardio: "Cardio",
  chin: "Chin",
  fightIq: "Fight IQ",
};
