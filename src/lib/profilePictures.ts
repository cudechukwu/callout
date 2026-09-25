import { MEN_PORTRAITS, WOMEN_PORTRAITS } from "@/lib/portraits.generated";

/**
 * Pictures a player can choose for their profile: for now, the fighter
 * portraits. The key (e.g. "m-01") is what the profiles table stores, so a
 * portrait that is later deleted just falls back to a silhouette.
 */
export interface ProfilePicture {
  readonly key: string;
  readonly src: string;
}

export const PROFILE_PICTURES: readonly ProfilePicture[] = [...MEN_PORTRAITS, ...WOMEN_PORTRAITS].map((src) => ({
  key: src.replace(/^.*\//, "").replace(/\.jpg$/, ""),
  src,
}));

const BY_KEY = new Map(PROFILE_PICTURES.map((p) => [p.key, p.src]));

/** The image for a stored key, or undefined (falls back to a silhouette). */
export function pictureSrc(key: string | null | undefined): string | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
