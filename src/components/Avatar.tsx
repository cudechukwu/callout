import { AVATAR_IMAGES, hashName, initialsOf } from "@/lib/avatars";

export type Corner = "red" | "blue" | "neutral";

const BACKDROP: Record<Corner, string> = {
  red: "radial-gradient(120% 90% at 50% 0%, #6b1f2b 0%, #2a1a26 55%, #17212f 100%)",
  blue: "radial-gradient(120% 90% at 50% 0%, #1f4b8f 0%, #1a2b47 55%, #17212f 100%)",
  neutral: "radial-gradient(120% 90% at 50% 0%, #3a4a66 0%, #1e2b3d 60%, #17212f 100%)",
};
const RIM: Record<Corner, string> = {
  red: "#ff5361",
  blue: "#7aa9ff",
  neutral: "#8e9aaf",
};

interface AvatarProps {
  name: string;
  corner?: Corner;
  /** Show initials over the silhouette (useful at small sizes). */
  initials?: boolean;
  className?: string;
}

/**
 * A stylized silhouette, generated from the fighter's name (no real
 * likeness). Swaps to a supplied image if AVATAR_IMAGES is populated.
 * Decorative: the fighter's name is always shown next to it.
 */
export function Avatar({ name, corner = "neutral", initials = false, className = "" }: AvatarProps) {
  const hash = hashName(name);

  if (AVATAR_IMAGES.length > 0) {
    const src = AVATAR_IMAGES[hash % AVATAR_IMAGES.length]!;
    return (
      <div
        aria-hidden="true"
        className={`relative overflow-hidden ${className}`}
        style={{ background: BACKDROP[corner] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  const hair = hash % 6;
  const beard = (hash >> 3) % 3 === 0;
  const broad = (hash >> 5) % 2 === 0;
  const shoulders = broad
    ? "M2 100 C 6 70, 26 63, 50 63 C 74 63, 94 70, 98 100 Z"
    : "M12 100 C 16 72, 32 65, 50 65 C 68 65, 84 72, 88 100 Z";
  const fill = "#090e17";
  const rim = RIM[corner];

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden ${className}`}
      style={{ background: BACKDROP[corner] }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice">
        {/* rim light behind the bust */}
        <ellipse cx="50" cy="46" rx="26" ry="30" fill={rim} opacity="0.12" />
        <path d={shoulders} fill={fill} stroke={rim} strokeOpacity="0.35" strokeWidth="0.8" />
        <rect x="43" y="52" width="14" height="16" fill={fill} />
        {hair === 2 && <circle cx="50" cy="38" r="23" fill={fill} />}
        {hair === 4 && <path d="M32 40 C 30 62, 34 68, 38 68 L 40 44 Z M68 40 C 70 62, 66 68, 62 68 L 60 44 Z" fill={fill} />}
        <ellipse cx="50" cy="42" rx="15" ry="18" fill={fill} stroke={rim} strokeOpacity="0.4" strokeWidth="0.8" />
        {hair === 1 && <path d="M35 36 C 36 22, 64 22, 65 36 C 60 30, 40 30, 35 36 Z" fill={fill} />}
        {hair === 3 && (
          <>
            <path d="M35 36 C 36 24, 64 24, 65 36 C 60 31, 40 31, 35 36 Z" fill={fill} />
            <circle cx="50" cy="19" r="6" fill={fill} />
          </>
        )}
        {hair === 5 && <path d="M34 34 C 36 20, 64 20, 66 34 L 66 30 C 60 24, 40 24, 34 30 Z" fill={fill} />}
        {beard && <path d="M36 46 C 38 62, 62 62, 64 46 C 60 54, 40 54, 36 46 Z" fill={fill} />}
      </svg>
      {initials && (
        <span className="absolute inset-x-0 bottom-1 text-center font-display text-[0.7em] font-extrabold tracking-wide text-bone/90">
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}
