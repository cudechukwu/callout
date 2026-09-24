"use client";

import { useEffect, useRef, useState } from "react";
import { generateCpuFighter, randomCpuName } from "@/lib/draft/cpuFighter";
import { computeOverall } from "@/lib/draft/overall";
import { DEMO_SELECTIONS } from "@/lib/data/demoFighter";
import { narrateFight, type NarratedMoment } from "@/lib/broadcast/narrate";
import { simulateFight } from "@/lib/simulation/engine";
import { createRng } from "@/lib/simulation/rng";
import type { FighterSnapshot, FightMethod, RNG } from "@/lib/simulation/types";
import { Avatar } from "@/components/Avatar";
import { formatClock } from "@/components/ui";

const PLAYER: FighterSnapshot = { id: "demo-player", name: "Chiamaka", selections: DEMO_SELECTIONS };
const PLAYER_OVERALL = computeOverall(DEMO_SELECTIONS);
const STEP_MS = 480;
const HOLD_MS = 3400;
const EMPTY = { strikes: 0, takedowns: 0, submissionAttempts: 0 };
const METHOD_LABELS: Record<FightMethod, string> = {
  KO: "knockout",
  TKO: "TKO",
  SUB: "submission",
  DEC: "decision",
};

interface Fight {
  moments: NarratedMoment[];
  cpu: FighterSnapshot;
  cpuOverall: number;
  winnerName: string;
  method: FightMethod;
  round: number;
}

function buildFight(rng: RNG): Fight {
  // A showcase against a very weak opponent looks rigged, so pick CPUs in
  // a believable range (the typical CPU build rates ~70).
  let cpu = generateCpuFighter(rng, `demo-cpu-${Math.floor(rng.next() * 1e9)}`, randomCpuName(rng));
  for (let tries = 0; tries < 12 && computeOverall(cpu.selections) < 68; tries++) {
    cpu = generateCpuFighter(rng, cpu.id, cpu.name);
  }
  const result = simulateFight(PLAYER, cpu, rng);
  return {
    moments: narrateFight(result.events, { [PLAYER.id]: PLAYER.name, [cpu.id]: cpu.name }),
    cpu,
    cpuOverall: computeOverall(cpu.selections),
    winnerName: result.winnerId === PLAYER.id ? PLAYER.name : cpu.name,
    method: result.method,
    round: result.round,
  };
}

/**
 * A live broadcast on the landing page, and it is real: the actual
 * simulation runs in the visitor's browser, fight after fight, against a
 * fresh CPU each time. Nothing here is scripted or faked. Starts after
 * mount so the server and first client paint match.
 */
export function LiveFight() {
  const rngRef = useRef<RNG | null>(null);
  const [fight, setFight] = useState<Fight | null>(null);
  const [shown, setShown] = useState(0);
  const [fightNumber, setFightNumber] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    rngRef.current = createRng(Math.floor(Math.random() * 2 ** 31));
    const first = buildFight(rngRef.current);
    setFight(first);
    // Reduced motion: show one finished fight and hold it still.
    if (reduce) setShown(first.moments.length);
  }, []);

  useEffect(() => {
    if (!fight || reduceMotion) return;
    if (shown < fight.moments.length) {
      const t = window.setTimeout(() => setShown((n) => n + 1), STEP_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setFight(buildFight(rngRef.current!));
      setFightNumber((n) => n + 1);
      setShown(0);
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [fight, shown, reduceMotion]);

  const visible = fight ? fight.moments.slice(0, shown) : [];
  const latest = visible[visible.length - 1];
  const mine = latest?.tally[PLAYER.id] ?? EMPTY;
  const theirs = fight ? (latest?.tally[fight.cpu.id] ?? EMPTY) : EMPTY;
  const done = fight !== null && shown >= fight.moments.length;
  const feed = visible.slice(-4).reverse();

  return (
    <div className="cut relative bg-panel/90 backdrop-blur-sm" aria-label="Live simulated fight">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-bone">
          <span className="animate-live-dot h-2 w-2 rounded-full bg-corner-red" aria-hidden="true" />
          Live now
        </p>
        <p className="text-xs text-chalk">Fight {fightNumber}</p>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={PLAYER.name} corner="red" className="cut-sm h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-base leading-none font-semibold tracking-[0.06em] uppercase">{PLAYER.name}</p>
              <p className="mt-0.5 text-xs text-chalk">
                <span className="font-numeric text-sm font-bold text-belt-gold">{PLAYER_OVERALL}</span> overall
              </p>
            </div>
          </div>
          <div className="order-first col-span-2 text-center sm:order-none sm:col-span-1">
            <p className="text-xs text-chalk">Round {latest?.round ?? 1}</p>
            <p className="font-numeric text-2xl leading-none font-bold">{formatClock(latest?.fightTimeSeconds ?? 0)}</p>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-3">
            <div className="min-w-0 text-right">
              <p className="font-display text-base leading-none font-semibold tracking-[0.06em] uppercase">
                {fight?.cpu.name ?? " "}
              </p>
              <p className="mt-0.5 text-xs text-chalk">
                <span className="font-numeric text-sm font-bold text-belt-gold">{fight?.cpuOverall ?? "–"}</span> overall
              </p>
            </div>
            <Avatar name={fight?.cpu.name ?? "cpu"} corner="white" className="cut-sm h-11 w-11 shrink-0" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-t border-line pt-3">
          <div className="flex gap-5">
            <p><span className="font-numeric text-2xl font-bold">{mine.strikes}</span> <span className="text-xs text-chalk">strikes</span></p>
            <p><span className="font-numeric text-2xl font-bold">{mine.takedowns}</span> <span className="text-xs text-chalk">takedowns</span></p>
          </div>
          <span aria-hidden="true" className="h-6 w-px bg-line" />
          <div className="flex justify-end gap-5">
            <p><span className="font-numeric text-2xl font-bold">{theirs.takedowns}</span> <span className="text-xs text-chalk">takedowns</span></p>
            <p><span className="font-numeric text-2xl font-bold">{theirs.strikes}</span> <span className="text-xs text-chalk">strikes</span></p>
          </div>
        </div>
      </div>

      <ol className="mt-4 flex min-h-[13.5rem] flex-col gap-1.5 px-5 pb-5" aria-live="off">
        {done && fight ? (
          <li className="animate-finish-slam cut-sm bg-corner-red px-4 py-5 text-center">
            <p className="font-display text-2xl leading-none font-semibold tracking-[0.06em] text-bone uppercase">
              {fight.winnerName} wins
            </p>
            <p className="mt-1 text-sm text-bone/85">
              by {METHOD_LABELS[fight.method]}
              {fight.method !== "DEC" && `, round ${fight.round}`}
            </p>
          </li>
        ) : (
          feed.map((moment, index) => {
            const mineLine = moment.subjectId === PLAYER.id;
            return (
              <li
                key={`${shown - index}`}
                className={`${mineLine ? "animate-from-left border-l-4 border-corner-red" : "animate-from-right border-r-4 border-corner-white text-right"} bg-panel-raised/70 px-3 py-2 text-sm`}
                style={{ opacity: Math.max(0.3, 1 - index * 0.25) }}
              >
                {moment.text}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
