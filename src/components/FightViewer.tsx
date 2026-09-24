"use client";

import { useEffect, useState } from "react";
import type { NarratedMoment } from "@/lib/broadcast/narrate";

interface FightViewerProps {
  moments: NarratedMoment[];
  onComplete: () => void;
  /** Time between each revealed moment. Exposed for tests — production
   * callers should use the default. */
  revealIntervalMs?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Reveals narrated fight moments one at a time rather than all at once
 * — the simulation already finished instantly server-side (or
 * client-side, for now); this is purely the presentation layer
 * building suspense, per DESIGN_FINAL.md > Fight Presentation.
 */
export function FightViewer({ moments, onComplete, revealIntervalMs = 650 }: FightViewerProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount >= moments.length) {
      const timeout = setTimeout(onComplete, 1200);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setRevealedCount((c) => c + 1), revealIntervalMs);
    return () => clearTimeout(timeout);
  }, [revealedCount, moments.length, onComplete, revealIntervalMs]);

  const visible = moments.slice(0, revealedCount);
  let lastRound = 0;

  return (
    <div className="flex flex-col">
      <button
        onClick={onComplete}
        className="mb-6 self-end font-mono text-sm text-text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-text"
      >
        Skip to result
      </button>
      {visible.map((moment, index) => {
        const showRoundHeader = moment.round !== lastRound;
        lastRound = moment.round;
        return (
          <div key={index}>
            {showRoundHeader && (
              <h2 className="mt-8 mb-2 font-display text-2xl font-black uppercase text-text-muted first:mt-0">
                Round {moment.round}
              </h2>
            )}
            <p
              className={`py-1.5 text-base leading-snug ${
                moment.emphasis === "finish" ? "font-bold text-accent" : "text-text"
              }`}
            >
              <span className="mr-2 font-mono text-xs text-text-faint">
                {formatTime(moment.fightTimeSeconds)}
              </span>
              {moment.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
