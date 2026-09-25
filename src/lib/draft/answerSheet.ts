import type { VisibleAttribute } from "../data/types";
import { slotValue, slotVisibleValue } from "./overall";
import type { BoardRecord } from "./session";

/**
 * "Your calls": how well the eight picks used the cards the player was
 * actually shown, by Five-Star's own ratings. It grades decisions, not luck:
 * a player dealt weak boards can still draft nearly perfectly. Display-only,
 * like OVR and identity (nothing in the simulation may import it).
 *
 * "Best from the cards you saw" is a hindsight upper bound, not a promise:
 * had a different card been taken earlier, later boards would have been
 * dealt differently, so the best combination of shown cards may never have
 * been reachable. It is worded that way in the UI.
 */
export interface YourCalls {
  /** OVR points between what was built and the best mix of the shown cards. */
  leftOnTable: number;
  bestPick: { attribute: VisibleAttribute; fighterName: string; edge: number } | null;
  /** Only when a passed-over card would have added at least one point. */
  biggestMiss: { attribute: VisibleAttribute; pickedName: string; betterName: string; gain: number } | null;
  /** Rare: a modest-looking pick whose hidden speed/defense carried real value. */
  sleeper: { attribute: VisibleAttribute; fighterName: string; gain: number } | null;
}

const MIN_MISS = 1;
const MIN_SLEEPER_GAIN = 2;
/** A pick counts as a sleeper only if its own rating for the slot is under this. */
const SLEEPER_MAX_RATING = 4.4;
/** What a typical fighter's hidden speed and defense are worth, to measure "above typical". */
const TYPICAL_SPEED = 4.5;
const TYPICAL_DEFENSE = 4.7;

const typicalHidden = (attribute: VisibleAttribute): number =>
  slotValue(
    {
      id: -2, name: "typical", wrestling: 0, submissions: 0, boxing: 0, kickboxing: 0,
      power: 0, cardio: 0, chin: 0, fightIq: 0, speed: TYPICAL_SPEED, defense: TYPICAL_DEFENSE,
    },
    attribute
  );

export function computeYourCalls(history: readonly BoardRecord[]): YourCalls | null {
  if (history.length === 0) return null;

  const rounds = history.map((round) => {
    const values = round.cards.map((card) => slotValue(card, round.attribute));
    const pickedIndex = round.cards.findIndex((card) => card.id === round.pickedId);
    return { round, values, pickedIndex, picked: round.cards[pickedIndex]! };
  });

  const actual = rounds.reduce((sum, r) => sum + r.values[r.pickedIndex]!, 0);

  // Best mix of the shown cards, each fighter used at most once (3^rounds tries).
  let best = -Infinity;
  const search = (i: number, used: Set<number>, total: number) => {
    if (i === rounds.length) {
      best = Math.max(best, total);
      return;
    }
    rounds[i]!.round.cards.forEach((card, c) => {
      if (used.has(card.id)) return;
      used.add(card.id);
      search(i + 1, used, total + rounds[i]!.values[c]!);
      used.delete(card.id);
    });
  };
  search(0, new Set(), 0);

  let bestPick: YourCalls["bestPick"] = null;
  let bestEdge = -Infinity;
  let biggestMiss: YourCalls["biggestMiss"] = null;
  let biggestRegret = MIN_MISS;
  let sleeper: YourCalls["sleeper"] = null;
  let sleeperGain = MIN_SLEEPER_GAIN;

  for (const r of rounds) {
    const pickedValue = r.values[r.pickedIndex]!;
    const others = r.values.filter((_, i) => i !== r.pickedIndex);
    const edge = pickedValue - others.reduce((a, b) => a + b, 0) / others.length;
    if (edge > bestEdge) {
      bestEdge = edge;
      bestPick = { attribute: r.round.attribute, fighterName: r.picked.name, edge: Math.round(edge) };
    }

    const topIndex = r.values.indexOf(Math.max(...r.values));
    const regret = r.values[topIndex]! - pickedValue;
    if (regret >= biggestRegret) {
      biggestRegret = regret;
      biggestMiss = {
        attribute: r.round.attribute,
        pickedName: r.picked.name,
        betterName: r.round.cards[topIndex]!.name,
        gain: Math.round(regret),
      };
    }

    if (r.picked[r.round.attribute] < SLEEPER_MAX_RATING) {
      const hidden = pickedValue - slotVisibleValue(r.picked, r.round.attribute);
      const gain = hidden - typicalHidden(r.round.attribute);
      if (gain >= sleeperGain) {
        sleeperGain = gain;
        sleeper = { attribute: r.round.attribute, fighterName: r.picked.name, gain: Math.round(gain) };
      }
    }
  }

  return {
    leftOnTable: Math.max(0, Math.round(best - actual)),
    bestPick: bestEdge >= 1 ? bestPick : null,
    biggestMiss,
    sleeper,
  };
}
