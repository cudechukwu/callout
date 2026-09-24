/**
 * The 8 attributes players draft directly.
 * Order here is canonical; UI randomizes presentation order per draft session.
 */
export const VISIBLE_ATTRIBUTES = [
  "wrestling",
  "submissions",
  "boxing",
  "kickboxing",
  "power",
  "cardio",
  "chin",
  "fightIq",
] as const;

export type VisibleAttribute = (typeof VISIBLE_ATTRIBUTES)[number];

/**
 * Derived at simulation time from the CSV values of whichever fighters
 * were picked for the visible attributes. Never drafted directly.
 * See DESIGN_FINAL.md > Game Design: Draft System.
 */
export const HIDDEN_ATTRIBUTES = ["defense", "speed"] as const;

export type HiddenAttribute = (typeof HIDDEN_ATTRIBUTES)[number];

export type Attribute = VisibleAttribute | HiddenAttribute;

/**
 * A single row from fighter_data.csv, fully typed.
 * Ratings are on the source 1.0-5.0 scale exactly as provided.
 */
export interface SourceFighter {
  id: number;
  name: string;
  wrestling: number;
  submissions: number;
  boxing: number;
  kickboxing: number;
  defense: number;
  cardio: number;
  power: number;
  chin: number;
  fightIq: number;
  speed: number;
}

export type SourceFighterAttributeKey = Exclude<keyof SourceFighter, "id" | "name">;
