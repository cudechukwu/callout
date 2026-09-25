import type { VisibleAttribute } from "@/lib/data/types";

/**
 * What the server tells one player about their challenge. Fighter ids only:
 * the client resolves names from the pool it already ships. Never contains
 * the seed, the plan, future boards or the opponent's picks.
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
  readonly picks: readonly { readonly attribute: VisibleAttribute; readonly fighterId: number }[];
  readonly rerollsLeft: number;
  /** Number of actions recorded; the next action must carry sequence + 1. */
  readonly sequence: number;
  readonly locked: boolean;
  readonly roundStatus: "drafting" | "revealed" | "abandoned";
}

/** What an invite link resolves to for the person opening it. */
export type InviteStatus =
  | { readonly status: "participant"; readonly roundId: string }
  | { readonly status: "open"; readonly challengerName: string }
  | { readonly status: "full" }
  | { readonly status: "expired" }
  | { readonly status: "not_found" };

export const DISPLAY_NAME_MAX = 24;
