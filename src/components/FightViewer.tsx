"use client";

import { useEffect, useState } from "react";
import type { MomentTally, NarratedMoment } from "@/lib/broadcast/narrate";
import { Avatar } from "@/components/Avatar";
import { formatClock } from "@/components/ui";

interface FightViewerProps {
  moments: NarratedMoment[];
  playerId: string;
  playerName: string;
  opponentId: string;
  opponentName: string;
  onComplete: () => void;
  /** Time between each revealed moment. Exposed for tests — production
   * callers should use the default. */
  revealIntervalMs?: number;
}

const EMPTY_TALLY: MomentTally = { strikes: 0, takedowns: 0, submissionAttempts: 0 };
const FINISH_LABELS = { KO: "Knockout", TKO: "TKO", SUB: "Submission" } as const;
const FEED_LENGTH = 6;

function Stat({ value, label, align }: { value: number; label: string; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="font-numeric text-3xl leading-none font-bold text-bone">{value}</p>
      <p className="mt-0.5 text-[11px] text-chalk">{label}</p>
    </div>
  );
}

/**
 * Plays a finished fight back like a broadcast: a live scoreboard on
 * top, the newest moment biggest, and a finish that lands with weight.
 * The simulation has already run; this only paces the reveal.
 */
export function FightViewer({
  moments,
  playerId,
  playerName,
  opponentId,
  opponentName,
  onComplete,
  revealIntervalMs = 650,
}: FightViewerProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const visible = moments.slice(0, revealedCount);
  const latest = visible[visible.length - 1];
  const finish = latest?.finishMethod;

  useEffect(() => {
    if (revealedCount >= moments.length) {
      // Give a finish time to land before moving on.
      const timeout = setTimeout(onComplete, finish ? 2600 : 1200);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setRevealedCount((c) => c + 1), revealIntervalMs);
    return () => clearTimeout(timeout);
  }, [revealedCount, moments.length, onComplete, revealIntervalMs, finish]);

  const mine = latest?.tally[playerId] ?? EMPTY_TALLY;
  const theirs = latest?.tally[opponentId] ?? EMPTY_TALLY;
  const feed = visible.slice(-FEED_LENGTH).reverse();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-3 flex justify-end">
        <button
          onClick={onComplete}
          className="text-sm text-chalk underline decoration-dotted underline-offset-4 transition-colors hover:text-bone"
        >
          Skip to result
        </button>
      </div>

      <section aria-label="Scoreboard" className="cut bg-panel px-4 py-4 sm:px-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Avatar name={playerName} corner="red" className="cut-sm h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
            <p className="font-display text-xl leading-[0.95] font-black tracking-wide break-words uppercase sm:text-3xl">
              {playerName}
            </p>
          </div>
          <div className="text-center">
            <p className="font-display text-sm font-bold text-chalk">
              Round {latest?.round ?? 1}
            </p>
            <p className="font-numeric text-3xl leading-none font-bold text-bone">
              {formatClock(latest?.fightTimeSeconds ?? 0)}
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-2 sm:flex-row-reverse sm:items-center sm:gap-3">
            <Avatar name={opponentName} corner="white" className="cut-sm h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
            <p className="text-right font-display text-xl leading-[0.95] font-black tracking-wide break-words uppercase sm:text-3xl">
              {opponentName}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-t border-line pt-3">
          <div className="flex gap-6">
            <Stat value={mine.strikes} label="Strikes landed" align="left" />
            <Stat value={mine.takedowns} label="Takedowns" align="left" />
          </div>
          <span aria-hidden="true" className="h-8 w-px bg-line" />
          <div className="flex justify-end gap-6">
            <Stat value={theirs.takedowns} label="Takedowns" align="right" />
            <Stat value={theirs.strikes} label="Strikes landed" align="right" />
          </div>
        </div>
      </section>

      {finish && latest && (
        <div
          key={latest.tally ? revealedCount : 0}
          className={`animate-finish-slam mt-4 px-4 py-5 text-center ${
            latest.actorId === playerId ? "bg-corner-red text-bone" : "bg-corner-white text-canvas"
          } cut`}
        >
          <p className="font-display text-6xl leading-none font-black tracking-wide uppercase sm:text-8xl">
            {FINISH_LABELS[finish]}
          </p>
        </div>
      )}

      <ol className="mt-4 flex flex-col gap-2" aria-live="polite">
        {feed.map((moment, index) => {
          const isMine = moment.subjectId === playerId;
          const isFinish = moment.emphasis === "finish";
          return (
            <li
              key={`${moment.round}-${moment.fightTimeSeconds}-${revealedCount - index}`}
              className={`${isMine ? "animate-from-left border-l-4 border-corner-red" : "animate-from-right border-r-4 border-corner-white text-right"} bg-panel px-4 ${
                index === 0 ? "py-4" : "py-2"
              }`}
              style={{ opacity: Math.max(0.35, 1 - index * 0.16) }}
            >
              <p
                className={`leading-snug ${
                  index === 0 ? "text-xl font-semibold sm:text-2xl" : "text-base"
                } ${isFinish ? "text-belt-gold" : "text-bone"}`}
              >
                {moment.text}
              </p>
              <p className="mt-0.5 text-xs text-chalk">
                Round {moment.round}, {formatClock(moment.fightTimeSeconds)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
