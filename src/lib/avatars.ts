/**
 * Fighter portraits (fictional, AI-generated; /public/fighters). A fighter's
 * picture is chosen by hashing their name, so the same fighter always gets
 * the same picture everywhere. Real fighters get a portrait of their own
 * gender; made-up names (your fighter, CPU aliases) can get any.
 *
 * To add portraits: drop square images in /public/fighters and list them
 * below. More portraits mean fewer repeats on a board of three cards.
 */
const MEN = ["/fighters/m-01.jpg", "/fighters/m-02.jpg", "/fighters/m-03.jpg", "/fighters/m-04.jpg", "/fighters/m-05.jpg", "/fighters/m-06.jpg"];
const WOMEN = ["/fighters/w-01.jpg"];

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

/** The portrait for a name, or undefined when there are none for that group. */
export function portraitFor(name: string, isPoolFighter: boolean): string | undefined {
  const list = WOMEN_FIGHTERS.has(name) ? WOMEN : isPoolFighter ? MEN : AVATAR_IMAGES;
  return list.length > 0 ? list[hashName(name) % list.length] : undefined;
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
