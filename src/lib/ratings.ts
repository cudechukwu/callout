import type { VisibleAttribute } from "@/lib/data/types";

/**
 * Source ratings run 1.0-5.0, but the draft pool is elite-heavy (the average
 * CPU build rates ~4.46). A plain rating x 20 would show almost everyone in
 * the 80s and 90s next to an OVR in the 70s, which reads as a bug. This
 * scale puts an average CPU attribute at ~70 (the same anchor as OVR: 70 is
 * average) and a 5.0 at 99, so attribute bars and OVR tell one story.
 */
const AVERAGE_POOL_RATING = 4.46;
export function ratingToDisplay(rating: number): number {
  const scaled = 70 + (rating - AVERAGE_POOL_RATING) * (29 / (5 - AVERAGE_POOL_RATING));
  return Math.min(99, Math.max(20, Math.round(scaled)));
}

/** Short tags for tight spaces such as the draft rail. */
export const ATTRIBUTE_SHORT: Record<VisibleAttribute, string> = {
  wrestling: "WRE",
  submissions: "SUB",
  boxing: "BOX",
  kickboxing: "KICK",
  power: "POW",
  cardio: "CAR",
  chin: "CHIN",
  fightIq: "IQ",
};

/** One line on what each pick contributes, shown on the draft screen. */
export const ATTRIBUTE_BLURB: Record<VisibleAttribute, string> = {
  wrestling: "Takedowns, takedown defense and control on the ground.",
  submissions: "Finishing from the mat, and surviving when you are caught.",
  boxing: "Hands: volume, accuracy and defense on the feet.",
  kickboxing: "Kicks, range and movement.",
  power: "What happens when your shot lands.",
  cardio: "How long you stay sharp when the fight gets long.",
  chin: "How much you can take before the lights go out.",
  fightIq: "Reads, timing and every decision in the cage.",
};
