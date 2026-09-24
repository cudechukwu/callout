/**
 * Fighter avatar images. Empty for now, so every fighter gets a generated
 * silhouette (see components/Avatar.tsx). To use your own silhouettes: drop
 * the files in /public/avatars and list their paths here, e.g.
 *   export const AVATAR_IMAGES = ["/avatars/01.png", "/avatars/02.png"];
 * A fighter's image is chosen by hashing their name, so the same fighter
 * always gets the same picture everywhere. Square images work best.
 */
export const AVATAR_IMAGES: readonly string[] = [];

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
