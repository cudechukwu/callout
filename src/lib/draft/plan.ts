import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import { createRng } from "@/lib/simulation/rng";
import type { RNG } from "@/lib/simulation/types";
import { generateCandidates } from "./candidates";
import { DRAFT_POOL } from "./draftPool";

/**
 * The draft plan: every board a draft can show, fixed up front from a seed
 * and never dependent on anyone's picks. Two players given the same plan
 * see the same attribute order, the same base cards every round and the
 * same reroll offers (MULTIPLAYER_DESIGN.md > The draft plan).
 *
 * Because boards no longer skip fighters you already used, a fighter can
 * come round again; the draft shows him as "Already used". The fresh-card
 * rule below guarantees that never leaves a board with nothing to take.
 *
 * Bump DRAFT_VERSION whenever this algorithm changes what a seed produces:
 * stored multiplayer plans record the version they were generated with.
 */
export const DRAFT_VERSION = 1;

/** Base board plus one offer per possible reroll. */
export const OFFERS_PER_ROUND = 3;

/** Plenty: measured retries average 0.12 per offer, worst 10 in 72,000. */
const MAX_ATTEMPTS = 200;

export type OfferIds = readonly [number, number, number];

/** Serializable: fighter ids only, so it can be stored and sent as JSON. */
export interface DraftPlan {
  readonly seed: string;
  readonly draftVersion: number;
  readonly attributeOrder: readonly VisibleAttribute[];
  readonly rounds: readonly {
    readonly attribute: VisibleAttribute;
    /** [base, first reroll, second reroll] */
    readonly offers: readonly OfferIds[];
  }[];
}

function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Deals one offer: three distinct fighters at the usual per-slot tier odds,
 * none shown earlier in this round (a reroll shows new names), in shuffled
 * display order so position doesn't leak quality.
 *
 * Fresh-card rule: at least one card must be a fighter no earlier round
 * showed. Nobody can have used that fighter yet, so every board always has
 * a card every player can take. Retries are seeded, so the result is still
 * a pure function of the seed.
 */
function dealOffer(
  seed: string,
  round: number,
  offer: number,
  attribute: VisibleAttribute,
  shownThisRound: ReadonlySet<number>,
  shownBefore: ReadonlySet<number>,
  pool: readonly SourceFighter[]
): OfferIds {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng(`${seed}:${round}:${offer}:${attempt}`);
    const cards = generateCandidates(attribute, shownThisRound, rng, pool);
    if (cards.some((card) => !shownBefore.has(card.id))) {
      return shuffle(cards.map((card) => card.id), rng) as unknown as OfferIds;
    }
  }
  // Not reached in practice. If it ever is, swap one card for any fresh
  // fighter so the guarantee still holds.
  const rng = createRng(`${seed}:${round}:${offer}:fallback`);
  const cards = generateCandidates(attribute, shownThisRound, rng, pool).map((card) => card.id);
  const fresh = pool.filter((f) => !shownBefore.has(f.id) && !shownThisRound.has(f.id) && !cards.includes(f.id));
  if (fresh.length === 0) throw new Error("Draft pool too small for the fresh-card rule");
  cards[2] = fresh[Math.floor(rng.next() * fresh.length)]!.id;
  return shuffle(cards, rng) as unknown as OfferIds;
}

export function generateDraftPlan(seed: string | number, pool: readonly SourceFighter[] = DRAFT_POOL): DraftPlan {
  const seedKey = String(seed);
  const attributeOrder = shuffle(VISIBLE_ATTRIBUTES, createRng(`${seedKey}:order`));
  const shownBefore = new Set<number>();

  const rounds = attributeOrder.map((attribute, round) => {
    const shownThisRound = new Set<number>();
    const offers: OfferIds[] = [];
    for (let offer = 0; offer < OFFERS_PER_ROUND; offer++) {
      const ids = dealOffer(seedKey, round, offer, attribute, shownThisRound, shownBefore, pool);
      ids.forEach((id) => shownThisRound.add(id));
      offers.push(ids);
    }
    shownThisRound.forEach((id) => shownBefore.add(id));
    return { attribute, offers };
  });

  return { seed: seedKey, draftVersion: DRAFT_VERSION, attributeOrder, rounds };
}
