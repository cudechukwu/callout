import { VISIBLE_ATTRIBUTES, type VisibleAttribute } from "../data/types";
import { buildFullAttributeRatings } from "../simulation/derivedStats";
import type { AttributeSelections } from "../simulation/types";
import { classifyTier } from "./tiers";

/**
 * A fighter's identity: how to describe what you built. Display-only, like
 * OVR: nothing in the simulation may import this (a test guards that), and
 * every word maps to a real stat in the engine. A style never implies a
 * counter or a matchup edge; at equal overall the engine has none.
 *
 * Tags are judged against FIXED population numbers (below), not against
 * whoever happens to be playing, so the same fighter gets the same identity
 * today and in six months. The numbers come from
 * `scripts/identity-calibration.ts`; re-run it, paste the block, and bump
 * IDENTITY_VERSION only if the draft pool or ratings change materially.
 */
export const IDENTITY_VERSION = 1;

type Feature =
  | "boxing" | "kickboxing" | "power" | "wrestling" | "submissions"
  | "cardio" | "chin" | "fightIq" | "defense" | "speed"
  | "striking" | "grappling";

// 30000 drafted builds, seed 2468, draft skill uniform 0-1
const POPULATION: Readonly<Record<Feature, { mean: number; sd: number }>> = {
  boxing: { mean: 4.5762, sd: 0.3603 },
  kickboxing: { mean: 4.6013, sd: 0.4005 },
  power: { mean: 4.6321, sd: 0.4015 },
  wrestling: { mean: 4.6186, sd: 0.4822 },
  submissions: { mean: 4.5623, sd: 0.5365 },
  cardio: { mean: 4.6158, sd: 0.394 },
  chin: { mean: 4.655, sd: 0.2664 },
  fightIq: { mean: 4.6065, sd: 0.3381 },
  defense: { mean: 4.6702, sd: 0.1109 },
  speed: { mean: 4.5273, sd: 0.1877 },
  striking: { mean: 4.6032, sd: 0.2412 },
  grappling: { mean: 4.5904, sd: 0.3714 },
};

export type FighterStyle =
  | "Complete Fighter"
  | "Balanced"
  | "Power Striker"
  | "Technical Striker"
  | "Pressure Wrestler"
  | "Submission Hunter"
  | "Glass Cannon"
  | "Iron Man"
  | "Defensive Specialist";

export type FighterTrait = "Explosive" | "Elusive" | "Heavy Hands" | "Relentless" | "Iron Chin" | "Cerebral";
export type BestWeapon = "Striking" | "Grappling" | "Knockout power";

export interface WeakLink {
  attribute: VisibleAttribute;
  /** The real fighter picked for it. */
  fighterName: string;
}

export interface FighterIdentity {
  style: FighterStyle;
  /** One standout quality, or null when nothing clearly stands out. */
  trait: FighterTrait | null;
  bestWeapon: BestWeapon;
  /** Only present for a genuine hole; null means "no major weaknesses". */
  weakLink: WeakLink | null;
}

/** A trait is only shown when its z-score clears this bar. */
const TRAIT_MIN_Z = 0.9;
/** A pick is a weak link only if it is a wildcard-tier rating (under 3.9). */
const WEAK_LINK_TIER = "wildcard";

const TRAITS: ReadonlyArray<{ feature: Feature; trait: FighterTrait }> = [
  { feature: "speed", trait: "Explosive" },
  { feature: "defense", trait: "Elusive" },
  { feature: "power", trait: "Heavy Hands" },
  { feature: "cardio", trait: "Relentless" },
  { feature: "chin", trait: "Iron Chin" },
  { feature: "fightIq", trait: "Cerebral" },
];

/** Traits a style already says, so a fighter is never "Power Striker · Heavy Hands". */
const IMPLIED_BY_STYLE: Partial<Record<FighterStyle, readonly FighterTrait[]>> = {
  "Power Striker": ["Heavy Hands"],
  "Iron Man": ["Relentless", "Iron Chin"],
  "Defensive Specialist": ["Elusive"],
  "Glass Cannon": ["Iron Chin", "Elusive"],
};

function zScores(selections: AttributeSelections): Record<Feature, number> {
  const r = buildFullAttributeRatings(selections);
  const raw: Record<Feature, number> = {
    boxing: r.boxing,
    kickboxing: r.kickboxing,
    power: r.power,
    wrestling: r.wrestling,
    submissions: r.submissions,
    cardio: r.cardio,
    chin: r.chin,
    fightIq: r.fightIq,
    defense: r.defense,
    speed: r.speed,
    striking: (r.boxing + r.kickboxing + r.power) / 3,
    grappling: (r.wrestling + r.submissions) / 2,
  };
  const z = {} as Record<Feature, number>;
  for (const feature of Object.keys(raw) as Feature[]) {
    z[feature] = (raw[feature] - POPULATION[feature].mean) / POPULATION[feature].sd;
  }
  return z;
}

function styleOf(z: Record<Feature, number>): FighterStyle {
  const lean = z.striking - z.grappling;
  const fragility = (z.chin + z.defense) / 2;
  if (z.striking >= 0.5 && fragility <= -0.6) return "Glass Cannon";
  if (lean >= 0.7) {
    return z.power >= z.boxing && z.power >= z.kickboxing ? "Power Striker" : "Technical Striker";
  }
  if (lean <= -0.7) return z.wrestling >= z.submissions ? "Pressure Wrestler" : "Submission Hunter";
  if (z.striking >= 0.35 && z.grappling >= 0.35) return "Complete Fighter";
  if (z.cardio >= 0.9 && z.chin >= 0.3) return "Iron Man";
  if (z.defense >= 0.8 && z.speed >= 0.4) return "Defensive Specialist";
  return "Balanced";
}

function traitOf(z: Record<Feature, number>, style: FighterStyle): FighterTrait | null {
  const skip = IMPLIED_BY_STYLE[style] ?? [];
  let best: FighterTrait | null = null;
  let bestZ = TRAIT_MIN_Z;
  for (const { feature, trait } of TRAITS) {
    if (skip.includes(trait)) continue;
    if (z[feature] >= bestZ) {
      bestZ = z[feature];
      best = trait;
    }
  }
  return best;
}

function bestWeaponOf(z: Record<Feature, number>): BestWeapon {
  if (z.grappling >= z.striking && z.grappling >= z.power) return "Grappling";
  return z.power > z.striking ? "Knockout power" : "Striking";
}

function weakLinkOf(selections: AttributeSelections): WeakLink | null {
  let worst: WeakLink | null = null;
  let worstRating = Infinity;
  for (const attribute of VISIBLE_ATTRIBUTES) {
    const pick = selections[attribute].sourceFighter;
    const rating = pick[attribute];
    if (classifyTier(rating) === WEAK_LINK_TIER && rating < worstRating) {
      worstRating = rating;
      worst = { attribute, fighterName: pick.name };
    }
  }
  return worst;
}

export function computeIdentity(selections: AttributeSelections): FighterIdentity {
  const z = zScores(selections);
  const style = styleOf(z);
  return {
    style,
    trait: traitOf(z, style),
    bestWeapon: bestWeaponOf(z),
    weakLink: weakLinkOf(selections),
  };
}
