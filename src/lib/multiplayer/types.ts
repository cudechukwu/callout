import type { VisibleAttribute } from "@/lib/data/types";
import type { FightResult } from "@/lib/simulation/types";

export type Picks = readonly { readonly attribute: VisibleAttribute; readonly fighterId: number }[];

/** Present once both players have locked in: both builds and the fight. */
export interface RevealView {
  readonly myUserId: string;
  readonly opponentUserId: string;
  readonly opponentPicks: Picks;
  /** Null for the moment between the reveal and the fight being stored. */
  readonly fight: {
    readonly id: string;
    readonly number: number;
    /** The stored result: playback never re-simulates. */
    readonly result: FightResult;
  } | null;
}

/**
 * What the server tells one player about their challenge. Fighter ids only:
 * the client resolves names from the pool it already ships. Never contains
 * the seed, the plan or future boards, and the opponent's picks only once
 * both players have locked in.
 */
export interface DraftView {
  readonly seriesId: string;
  readonly roundId: string;
  readonly inviteToken: string;
  readonly me: { readonly name: string; readonly seat: number };
  /** Null until someone accepts the challenge. */
  readonly opponent: { readonly name: string; readonly progress: number; readonly locked: boolean } | null;
  readonly attributeOrder: readonly VisibleAttribute[];
  readonly roundIndex: number;
  readonly offerIndex: number;
  /** The board in front of the player; null once all eight picks are in. */
  readonly offer: readonly [number, number, number] | null;
  readonly picks: Picks;
  readonly rerollsLeft: number;
  /** Number of actions recorded; the next action must carry sequence + 1. */
  readonly sequence: number;
  readonly locked: boolean;
  readonly roundStatus: "drafting" | "revealed" | "abandoned";
  readonly reveal: RevealView | null;
}

/** What an invite link resolves to for the person opening it. */
export type InviteStatus =
  | { readonly status: "participant"; readonly roundId: string }
  | { readonly status: "open"; readonly challengerName: string }
  | { readonly status: "full" }
  | { readonly status: "expired" }
  | { readonly status: "not_found" };

export const DISPLAY_NAME_MAX = 24;
