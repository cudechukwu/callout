"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceFighter, VisibleAttribute } from "@/lib/data/types";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { DRAFT_POOL } from "@/lib/draft/draftPool";
import { mp, MpRequestError, supabaseBrowser } from "@/lib/multiplayer/client";
import type { DraftView } from "@/lib/multiplayer/types";
import { Avatar } from "@/components/Avatar";
import { DraftScreen, type DraftBoardState } from "@/components/DraftScreen";
import { primaryButton } from "@/components/ui";

const PICK_LOCK_MS = 480;
/** Fallback when realtime is unavailable; realtime normally refreshes first. */
const POLL_MS = 6000;

const FIGHTERS = new Map(DRAFT_POOL.map((f) => [f.id, f]));
const fighter = (id: number): SourceFighter => FIGHTERS.get(id)!;

/** The server's view as the board the draft screen already knows how to draw. */
function toBoard(view: DraftView): DraftBoardState {
  return {
    attributeOrder: view.attributeOrder,
    roundIndex: view.roundIndex,
    currentCandidates: view.offer
      ? (view.offer.map(fighter) as unknown as DraftBoardState["currentCandidates"])
      : null,
    selections: new Map(view.picks.map((p) => [p.attribute, fighter(p.fighterId)])),
    usedFighterIds: new Set(view.picks.map((p) => p.fighterId)),
    rerollsRemaining: view.rerollsLeft,
  };
}

export function ChallengeDraft({ roundId }: { roundId: string }) {
  const [view, setView] = useState<DraftView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    try {
      setView(await mp<DraftView>("view", { roundId }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the draft");
    }
  }, [roundId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live updates: the opponent joining, picking and locking in.
  const seriesId = view?.seriesId;
  useEffect(() => {
    if (!seriesId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`round:${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_participants", filter: `draft_round_id=eq.${roundId}` },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "series_participants", filter: `series_id=eq.${seriesId}` },
        () => void refresh()
      )
      .subscribe();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [roundId, seriesId, refresh]);

  async function send(action: "act" | "lock", body: Record<string, unknown>, minDelay = 0) {
    if (!view || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const [next] = await Promise.all([
        mp<DraftView>(action, { roundId, ...body }),
        new Promise((resolve) => window.setTimeout(resolve, minDelay)),
      ]);
      setView(next);
      setError(null);
    } catch (e) {
      setError(e instanceof MpRequestError ? e.message : "Connection problem. Try again.");
      inFlight.current = false;
      await refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
      setPendingId(null);
    }
  }

  const board = useMemo(() => (view ? toBoard(view) : null), [view]);

  if (!view || !board) {
    return (
      <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
        <p className="text-chalk">{error ?? "Loading the draft…"}</p>
      </main>
    );
  }

  const opponentLine = view.opponent ? (
    <p className="text-sm text-chalk">
      <span className="text-bone">{view.opponent.name}</span>{" "}
      {view.opponent.locked ? "locked in" : `${view.opponent.progress}/8`}
    </p>
  ) : (
    <InviteButton token={view.inviteToken} />
  );

  if (view.offer) {
    return (
      <>
        <DraftScreen
          state={board}
          pendingId={pendingId}
          aside={opponentLine}
          onPick={(fighterId) => {
            if (busy) return;
            setPendingId(fighterId);
            void send("act", { sequence: view.sequence + 1, action: { type: "pick", fighterId } }, PICK_LOCK_MS);
          }}
          onReroll={() => {
            if (busy) return;
            void send("act", { sequence: view.sequence + 1, action: { type: "reroll" } });
          }}
        />
        {error && <Toast message={error} />}
      </>
    );
  }

  return (
    <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col justify-center px-4 py-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-chalk">{view.locked ? "Locked in" : "Draft complete"}</p>
          <h1 className="mt-1 font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase">
            {view.me.name}
          </h1>
        </div>
        {opponentLine}
      </div>

      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {view.attributeOrder.map((attribute: VisibleAttribute) => {
          const pick = view.picks.find((p) => p.attribute === attribute)!;
          const f = fighter(pick.fighterId);
          return (
            <li key={attribute} className="cut-sm overflow-hidden border border-line/70 bg-panel/30">
              <Avatar name={f.name} corner="red" className="aspect-[4/3] w-full" />
              <div className="px-3 py-2">
                <p className="text-xs text-chalk">{ATTRIBUTE_LABELS[attribute]}</p>
                <p className="truncate font-display text-sm font-semibold tracking-[0.06em] uppercase">{f.name}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {view.locked ? (
        <p className="mt-8 text-center text-lg">
          {!view.opponent
            ? "Locked in. Waiting for someone to take the challenge."
            : view.opponent.locked
              ? "Both fighters are locked in."
              : `Waiting for ${view.opponent.name} (${view.opponent.progress}/8)`}
        </p>
      ) : (
        <div className="mt-8">
          <button onClick={() => void send("lock", {})} disabled={busy} className={`${primaryButton} w-full`}>
            Lock in fighter
          </button>
          <p className="mt-2 text-center text-sm text-chalk">Final. No changes after this.</p>
        </div>
      )}
      {error && <Toast message={error} />}
    </main>
  );
}

function InviteButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        const url = `${window.location.origin}/c/${token}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="cut-sm bg-corner-red px-3 py-1.5 font-display text-sm font-semibold tracking-[0.08em] text-bone uppercase transition-colors hover:bg-corner-red-bright"
    >
      {copied ? "Link copied" : "Copy challenge link"}
    </button>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div role="status" className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <p className="cut-sm bg-panel-raised px-4 py-2 text-sm text-bone shadow-lg">{message}</p>
    </div>
  );
}
