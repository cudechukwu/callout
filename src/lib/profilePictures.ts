/**
 * Pictures a player can choose for their profile. Files live in
 * /public/pfp; the key is what the profiles table stores, so keep keys
 * stable once players have picked them (add new ones, don't rename).
 */
export interface ProfilePicture {
  readonly key: string;
  readonly src: string;
}

export const PROFILE_PICTURES: readonly ProfilePicture[] = [];

const BY_KEY = new Map(PROFILE_PICTURES.map((p) => [p.key, p.src]));

/** The image for a stored key, or undefined (falls back to a silhouette). */
export function pictureSrc(key: string | null | undefined): string | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
