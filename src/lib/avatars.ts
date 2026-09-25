import { DRAFT_POOL } from "@/lib/draft/draftPool";

/**
 * Fighter portraits (fictional, AI-generated; /public/fighters). A fighter's
 * picture is fixed, so the same fighter always gets the same picture
 * everywhere. Real fighters get a portrait of their own
 * gender; made-up names (your fighter, CPU aliases) can get any.
 *
 * To add portraits: drop square images in /public/fighters and list them
 * below. More portraits mean fewer repeats on a board of three cards.
 */
const MEN = Array.from({ length: 10 }, (_, i) => `/fighters/m-${String(i + 1).padStart(2, "0")}.jpg`);
const WOMEN = Array.from({ length: 3 }, (_, i) => `/fighters/w-${String(i + 1).padStart(2, "0")}.jpg`);

/** Women in the draft pool (names as in the fighter data). */
const WOMEN_FIGHTERS = new Set([
  "Amanda Nunes",
  "Cris Cyborg",
  "Jessica Andrade",
  "Joanna Jedrzejczyk",
  "Kayla Harrison",
  "Mackenzie Dern",
  "Ronda Rousey",
  "Rose Namajunas",
  "Tatiana Suarez",
  "Valentina Shevchenko",
  "Zhang Weili",
]);

/** Kept for callers that only need to know whether portraits exist. */
export const AVATAR_IMAGES: readonly string[] = [...MEN, ...WOMEN];

/**
 * Real fighters are dealt portraits in turn (by id, within their group), so
 * every portrait is used about equally; hashing alone gave one image 8 of
 * the 11 women. Made-up names fall back to a hash of the name.
 */
const POOL_PORTRAITS: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const sorted = [...DRAFT_POOL].sort((a, b) => a.id - b.id);
  let men = 0;
  let women = 0;
  for (const fighter of sorted) {
    if (WOMEN_FIGHTERS.has(fighter.name)) {
      if (WOMEN.length > 0) map.set(fighter.name, WOMEN[women++ % WOMEN.length]!);
    } else if (MEN.length > 0) {
      map.set(fighter.name, MEN[men++ % MEN.length]!);
    }
  }
  return map;
})();

/** The portrait for a name, or undefined when there is none for it. */
export function portraitFor(name: string): string | undefined {
  const dealt = POOL_PORTRAITS.get(name);
  if (dealt) return dealt;
  return AVATAR_IMAGES.length > 0 ? AVATAR_IMAGES[hashName(name) % AVATAR_IMAGES.length] : undefined;
}

/** Small stable hash so a name always maps to the same look. */
export function hashName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}
