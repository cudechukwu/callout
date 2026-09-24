"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

/**
 * The arena photo, dimmed, behind every screen except the landing page
 * (which shows it at full strength). It keeps the game screens in the same
 * world as the hero instead of floating on flat black.
 */
export function AmbientBackdrop() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Image
        src="/avatars/hero2.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-[78%_top] opacity-55"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/60 to-canvas" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas/80 via-canvas/25 to-canvas/80" />
    </div>
  );
}
