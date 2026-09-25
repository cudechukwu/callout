"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { computeOverall } from "@/lib/draft/overall";
import { narrateFight } from "@/lib/broadcast/narrate";
import type { DraftView, Picks, RevealView } from "@/lib/multiplayer/types";
import type { AttributeSelections } from "@/lib/simulation/types";
import { FightResultScreen } from "@/components/FightResultScreen";
import { FightViewer } from "@/components/FightViewer";
import { TaleOfTape } from "@/components/TaleOfTape";
import { primaryButton, secondaryButton } from "@/components/ui";

const POOL_BY_ID = new Map(DRAFT_POOL.map((f) => [f.id, f]));

function selectionsOf(picks: Picks): AttributeSelections {
  return Object.fromEntries(
    picks.map((p) => [p.attribute, { sourceFighter: POOL_BY_ID.get(p.fighterId)! }])
  ) as unknown as AttributeSelections;
}

/** Remembers in this browser which fights have been watched, so a return
 * visit goes straight to the result instead of replaying it. */
const watchedKey = (fightId: string) => `five-star:watched:${fightId}`;
function hasWatched(fightId: string): boolean {
  try {
    return window.localStorage.getItem(watchedKey(fightId)) === "1";
  } catch {
    return false;
  }
}
function markWatched(fightId: string) {
  try {
    window.localStorage.setItem(watchedKey(fightId), "1");
  } catch {
    // Private mode: the fight just plays again next time.
  }
}

type Stage = "tape" | "fight" | "result";

/**
 * After both lock in: the two fighters head to head, then the fight the
 * server already resolved, played back from its stored events. Each player
 * sees it from their own corner (red is always you).
 */
export function ChallengeFight({ view, reveal }: { view: DraftView; reveal: RevealView & { fight: NonNullable<RevealView["fight"]> } }) {
  const { fight } = reveal;
  const [stage, setStage] = useState<Stage>(() => (hasWatched(fight.id) ? "result" : "tape"));
  const opponentName = view.opponent?.name ?? "Opponent";

  const mine = useMemo(() => selectionsOf(view.picks), [view.picks]);
  const theirs = useMemo(() => selectionsOf(reveal.opponentPicks), [reveal.opponentPicks]);
  const moments = useMemo(
    () =>
      narrateFight(fight.result.events, {
        [reveal.myUserId]: view.me.name,
        [reveal.opponentUserId]: opponentName,
      }),
    [fight.result.events, reveal.myUserId, reveal.opponentUserId, view.me.name, opponentName]
  );

  if (stage === "tape") {
    return (
      <main className="animate-screen-in mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <TaleOfTape
          player={{ name: view.me.name, overall: computeOverall(mine), selections: mine, tag: "You" }}
          cpu={{ name: opponentName, overall: computeOverall(theirs), selections: theirs, tag: "Opponent" }}
        />
        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pt-6 pb-4">
          <button onClick={() => setStage("fight")} className={`${primaryButton} mx-auto block w-full max-w-sm`}>
            Start fight
          </button>
        </div>
      </main>
    );
  }

  if (stage === "fight") {
    return (
      <FightViewer
        moments={moments}
        playerId={reveal.myUserId}
        playerName={view.me.name}
        opponentId={reveal.opponentUserId}
        opponentName={opponentName}
        onComplete={() => {
          markWatched(fight.id);
          setStage("result");
        }}
      />
    );
  }

  return (
    <FightResultScreen
      result={fight.result}
      playerId={reveal.myUserId}
      playerName={view.me.name}
      opponentId={reveal.opponentUserId}
      opponentName={opponentName}
      actions={
        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={() => setStage("tape")} className={`${secondaryButton} sm:flex-1`}>
            Watch again
          </button>
          <Link href="/challenge" className={`${primaryButton} text-center sm:flex-1`}>
            New challenge
          </Link>
        </div>
      }
    />
  );
}
