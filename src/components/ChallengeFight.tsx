"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { computeOverall } from "@/lib/draft/overall";
import { narrateFight } from "@/lib/broadcast/narrate";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
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

type Stage = "tape" | "fight" | "result" | "compare";

const REQUEST_LABEL = { run_it_back: "Run it back", redraft: "Redraft" } as const;

interface ChallengeFightProps {
  view: DraftView;
  reveal: RevealView & { fight: NonNullable<RevealView["fight"]> };
  busy: boolean;
  onRequest: (kind: "run_it_back" | "redraft") => void;
  onRespond: (requestId: string, accept: boolean) => void;
}

/** "You lead 2–1", "Level 1–1", "David leads 2–1". */
function recordLine(wins: number, losses: number, opponentName: string): string {
  if (wins === losses) return `Level ${wins}–${losses}`;
  return wins > losses ? `You lead ${wins}–${losses}` : `${opponentName} leads ${losses}–${wins}`;
}

/**
 * After both lock in: the two fighters head to head, then the fight the
 * server already resolved, played back from its stored events. Each player
 * sees it from their own corner (red is always you).
 */
export function ChallengeFight({ view, reveal, busy, onRequest, onRespond }: ChallengeFightProps) {
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
    // Keyed on the fight, not the events array: a refresh brings a new
    // array for the same fight and must not rebuild the playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fight.id, reveal.myUserId, reveal.opponentUserId, view.me.name, opponentName]
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

  if (stage === "compare") {
    return (
      <CompareDrafts view={view} reveal={reveal} opponentName={opponentName} onBack={() => setStage("result")} />
    );
  }

  const { rivalry } = view;
  const pending = rivalry.pending;
  const quietLink =
    "text-sm font-medium text-chalk underline decoration-chalk/40 underline-offset-4 transition-colors hover:text-bone";

  return (
    <FightResultScreen
      result={fight.result}
      playerId={reveal.myUserId}
      playerName={view.me.name}
      opponentId={reveal.opponentUserId}
      opponentName={opponentName}
      actions={
        <>
          <p className="mb-4 text-center font-display text-lg font-semibold tracking-[0.07em] uppercase">
            {recordLine(rivalry.wins, rivalry.losses, opponentName)}
          </p>
          {pending && !pending.mine ? (
            <>
              <p className="mb-3 text-center">
                {opponentName} wants to {pending.kind === "run_it_back" ? "run it back" : "redraft"}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button disabled={busy} onClick={() => onRespond(pending.id, true)} className={`${primaryButton} sm:flex-1`}>
                  Accept
                </button>
                <button disabled={busy} onClick={() => onRespond(pending.id, false)} className={`${secondaryButton} sm:flex-1`}>
                  Decline
                </button>
              </div>
            </>
          ) : pending ? (
            <div className="text-center">
              <p className="text-lg">
                {REQUEST_LABEL[pending.kind]} sent. Waiting for {opponentName}.
              </p>
              <button disabled={busy} onClick={() => onRespond(pending.id, false)} className={`${quietLink} mt-2`}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button disabled={busy} onClick={() => onRequest("run_it_back")} className={`${primaryButton} w-full`}>
                Run it back
              </button>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button disabled={busy} onClick={() => onRequest("redraft")} className={`${secondaryButton} sm:flex-1`}>
                  Redraft
                </button>
                <button onClick={() => setStage("compare")} className={`${secondaryButton} sm:flex-1`}>
                  Compare drafts
                </button>
              </div>
            </>
          )}
          <div className="mt-5 flex justify-center gap-6">
            {pending && (
              <button onClick={() => setStage("compare")} className={quietLink}>
                Compare drafts
              </button>
            )}
            <button onClick={() => setStage("tape")} className={quietLink}>
              Watch again
            </button>
            <Link href="/challenge" className={quietLink}>
              New challenge
            </Link>
          </div>
        </>
      }
    />
  );
}

/**
 * Round by round, both picks side by side, then each build's overall and
 * how much it left on the table. Names only: it never says which fighter
 * someone should have taken.
 */
function CompareDrafts({
  view,
  reveal,
  opponentName,
  onBack,
}: {
  view: DraftView;
  reveal: RevealView;
  opponentName: string;
  onBack: () => void;
}) {
  const name = (picks: Picks, attribute: string) =>
    POOL_BY_ID.get(picks.find((p) => p.attribute === attribute)!.fighterId)!.name;
  const left = (s: RevealView["me"]) => (s ? Math.max(0, s.bestSeen - s.overall) : null);

  const cell = "px-3 py-2.5 sm:px-5";
  const headName = "font-display text-base font-semibold tracking-[0.06em] uppercase sm:text-lg";

  return (
    <main className="animate-screen-in mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase">
        Compare drafts
      </h1>
      <table className="cut mt-6 w-full bg-panel text-left">
        <thead>
          <tr className="border-b border-line">
            <th className={cell} />
            <th className={`${cell} ${headName} text-corner-red-bright`}>{view.me.name}</th>
            <th className={`${cell} ${headName}`}>{opponentName}</th>
          </tr>
        </thead>
        <tbody>
          {view.attributeOrder.map((attribute) => (
            <tr key={attribute} className="border-b border-line/50">
              <th scope="row" className={`${cell} text-sm font-normal text-chalk`}>
                {ATTRIBUTE_LABELS[attribute]}
              </th>
              <td className={`${cell} font-display tracking-[0.04em] uppercase`}>{name(view.picks, attribute)}</td>
              <td className={`${cell} font-display tracking-[0.04em] uppercase`}>{name(reveal.opponentPicks, attribute)}</td>
            </tr>
          ))}
          <tr className="border-b border-line/50">
            <th scope="row" className={`${cell} text-sm font-normal text-chalk`}>
              OVR
            </th>
            <td className={`${cell} font-numeric text-3xl font-bold text-belt-gold`}>{reveal.me?.overall ?? "–"}</td>
            <td className={`${cell} font-numeric text-3xl font-bold text-belt-gold`}>{reveal.opponent?.overall ?? "–"}</td>
          </tr>
          <tr>
            <th scope="row" className={`${cell} text-sm font-normal text-chalk`}>
              Left on the table
            </th>
            <td className={`${cell} font-numeric text-2xl font-bold`}>{left(reveal.me) ?? "–"}</td>
            <td className={`${cell} font-numeric text-2xl font-bold`}>{left(reveal.opponent) ?? "–"}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-sm text-chalk-faint">Based on Five-Star&rsquo;s ratings and the cards each of you was shown.</p>
      <button onClick={onBack} className={`${primaryButton} mt-6 w-full`}>
        Back to result
      </button>
    </main>
  );
}
