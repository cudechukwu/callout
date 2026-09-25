import type { SourceFighter } from "@/lib/data/types";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { MEN_PORTRAITS, WOMEN_PORTRAITS } from "@/lib/portraits.generated";

/**
 * Fighter portraits (fictional, AI-generated; /public/fighters). They are
 * stand-ins, not likenesses, so a real fighter has no permanent face.
 * Instead, faces are dealt per board (see boardPortraits): the three cards
 * always show three different faces of the right gender, and once a
 * fighter is picked, his face is locked for the rest of that draft.
 *
 * To add or remove portraits: put source images in /public/avatars named
 * m-*.png (men) or w-*.png (women), delete the ones you don't want, and run
 * `npm run portraits`.
 */
const MEN = MEN_PORTRAITS;
const WOMEN = WOMEN_PORTRAITS;

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

/** Every portrait; made-up names (your fighter, CPU aliases) can get any. */
export const AVATAR_IMAGES: readonly string[] = [...MEN, ...WOMEN];

/**
 * Fallback faces for real fighters shown outside a draft board (e.g. a CPU
 * build): dealt in turn by id within gender, so each is used about equally.
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

/**
 * Faces for one board of cards: every card gets a face of its gender, no
 * two cards share one, and cards whose face is already locked (a fighter
 * you picked earlier, back as "Already used") keep it. Deterministic in
 * the board's contents, so a refresh, or the other player in a challenge,
 * sees the same faces.
 */
export function boardPortraits(
  cards: readonly SourceFighter[],
  locked: ReadonlyMap<number, string> = new Map()
): Map<number, string> {
  const listFor = (card: SourceFighter) => (WOMEN_FIGHTERS.has(card.name) ? WOMEN : MEN);
  const seed = hashName(cards.map((c) => c.id).sort((a, b) => a - b).join(","));
  const sorted = [...cards].sort((a, b) => a.id - b.id);

  // 1. The board's own faces: the same for everyone who sees this board.
  const faces = new Map<number, string>();
  const used = new Set<string>();
  sorted.forEach((card, i) => {
    const list = listFor(card);
    const free = list.filter((face) => !used.has(face));
    const choices = free.length > 0 ? free : list;
    if (choices.length === 0) return;
    const face = choices[(seed + i * 7) % choices.length]!;
    faces.set(card.id, face);
    used.add(face);
  });

  // 2. A fighter you already picked keeps his face. Only a card that now
  //    clashes with it is moved, so everything else still matches what the
  //    other player sees.
  const lockedHere = sorted.filter((card) => locked.has(card.id));
  if (lockedHere.length === 0) return faces;
  for (const card of lockedHere) faces.set(card.id, locked.get(card.id)!);
  const pinned = new Set(lockedHere.map((card) => locked.get(card.id)!));
  for (const card of sorted) {
    if (locked.has(card.id) || !pinned.has(faces.get(card.id)!)) continue;
    const taken = new Set(faces.values());
    const list = listFor(card);
    const free = list.filter((face) => !taken.has(face));
    if (free.length > 0) faces.set(card.id, free[seed % free.length]!);
  }
  return faces;
}

/** Just what face-dealing needs from one past round of a draft. */
export interface PickedBoard {
  readonly cards: readonly SourceFighter[];
  readonly pickedId: number;
}

/**
 * Replays a draft's boards to find every picked fighter's locked face and
 * the faces for the board in front of the player now.
 */
export function draftFaces(
  history: readonly PickedBoard[],
  current: readonly SourceFighter[] | null
): { picked: Map<number, string>; board: Map<number, string> } {
  const picked = new Map<number, string>();
  for (const round of history) {
    const face = boardPortraits(round.cards, picked).get(round.pickedId);
    if (face) picked.set(round.pickedId, face);
  }
  return { picked, board: current ? boardPortraits(current, picked) : new Map() };
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
