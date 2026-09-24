"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isRunActive } from "@/lib/runGuard";

function Star() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="text-corner-red">
      <path
        fill="currentColor"
        d="M12 1.8l3 6.9 7.5.7-5.7 5 1.8 7.4L12 17.9 5.4 21.8l1.8-7.4-5.7-5 7.5-.7z"
      />
    </svg>
  );
}

/**
 * Site-wide top bar: the way home, a way to start playing, and the spot
 * where sign-in will live. Kept small on purpose. Sits over the hero on
 * the landing page and is a plain bar everywhere else. During a run it
 * asks before leaving, since nothing is saved yet.
 */
export function TopBar() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const onDraft = pathname.startsWith("/draft");

  function confirmLeave(event: React.MouseEvent) {
    if (!onDraft || !isRunActive()) return;
    if (!window.confirm("Leave this run? Your fighter and record aren't saved yet, so they'll be lost.")) {
      event.preventDefault();
    }
  }

  return (
    <header
      className={
        onLanding
          ? "absolute inset-x-0 top-0 z-30"
          : "relative z-30 border-b border-line bg-canvas/85 backdrop-blur"
      }
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-10">
        <Link
          href="/"
          onClick={confirmLeave}
          aria-label="Five-Star MMA, home"
          className="flex items-center gap-2 font-display text-lg leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-bone uppercase sm:text-xl"
        >
          <Star />
          Five-Star MMA
        </Link>

        <div className="flex items-center gap-2">
          {!onDraft && (
            <Link
              href="/draft"
              className="cut-sm bg-corner-red px-3 py-1.5 font-display text-base font-semibold tracking-[0.08em] whitespace-nowrap text-bone uppercase transition-colors hover:bg-corner-red-bright sm:px-4"
            >
              Play
            </Link>
          )}
          {/* Accounts don't exist yet; this marks where sign-in will go. */}
          <button
            type="button"
            disabled
            title="Accounts are coming soon"
            className="cut-sm flex items-center gap-2 bg-panel-raised/80 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-chalk disabled:cursor-not-allowed sm:px-4"
          >
            Sign in
            <span className="hidden text-xs text-chalk-faint sm:inline">soon</span>
          </button>
        </div>
      </div>
    </header>
  );
}
