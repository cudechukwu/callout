"use client";

import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_RATINGS } from "@/lib/config";
import { ATTRIBUTE_BLURB, ATTRIBUTE_SHORT, ratingToDisplay } from "@/lib/ratings";
import type { DraftSessionState } from "@/lib/draft/session";
import { Avatar } from "@/components/Avatar";

interface DraftScreenProps {
  state: DraftSessionState;
  /** Fighter id whose pick is locking in (the card animates, input pauses). */
  pendingId: number | null;
  onPick: (fighterId: number) => void;
  onReroll: () => void;
}

export function DraftScreen({ state, pendingId, onPick, onReroll }: DraftScreenProps) {
  const attribute = state.attributeOrder[state.roundIndex]!;
  const candidates = state.currentCandidates!;
  const total = state.attributeOrder.length;
  const busy = pendingId !== null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pt-6 pb-6">
      <div className="flex items-center justify-between text-sm text-chalk">
        <p>
          Pick {state.roundIndex + 1} of {total}
        </p>
        <button
          onClick={onReroll}
          disabled={state.rerollsRemaining === 0 || busy}
          className="cut-sm bg-panel-raised px-3 py-1.5 font-medium text-bone transition-colors hover:bg-line disabled:text-chalk-faint disabled:hover:bg-panel-raised"
        >
          Reroll ({state.rerollsRemaining} left)
        </button>
      </div>

      <div key={`head-${state.roundIndex}`} className="animate-rise-in mt-5">
        <h1 className="font-display text-7xl leading-[0.85] font-black tracking-wide uppercase sm:text-8xl">
          {ATTRIBUTE_LABELS[attribute]}
        </h1>
        <p className="mt-2 max-w-md text-chalk">{ATTRIBUTE_BLURB[attribute]}</p>
      </div>

      <div
        key={`cards-${state.roundIndex}-${candidates.map((c) => c.id).join("-")}`}
        className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {candidates.map((fighter, index) => {
          const selected = pendingId === fighter.id;
          return (
            <div
              key={fighter.id}
              className="animate-deal-in"
              style={{ animationDelay: `${index * 110}ms` }}
            >
              <button
                onClick={() => onPick(fighter.id)}
                disabled={busy}
                className={`cut group relative flex w-full items-center gap-4 overflow-hidden bg-panel text-left transition-all duration-200 sm:block ${
                  selected
                    ? "animate-lock-in bg-panel-raised"
                    : busy
                      ? "opacity-35"
                      : "hover:-translate-y-1 hover:bg-panel-raised"
                }`}
                aria-label={`Pick ${fighter.name} for ${ATTRIBUTE_LABELS[attribute]}`}
              >
                <Avatar
                  name={fighter.name}
                  corner={selected ? "red" : "neutral"}
                  className="h-24 w-24 shrink-0 sm:h-auto sm:w-full sm:aspect-[3/4]"
                />
                <div className="min-w-0 flex-1 pr-4 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-canvas sm:via-canvas/85 sm:to-transparent sm:px-4 sm:pt-16 sm:pb-4">
                  <p className="font-display text-3xl leading-[0.9] font-black tracking-wide text-bone uppercase sm:text-4xl">
                    {fighter.name}
                  </p>
                  {SHOW_ATTRIBUTE_RATINGS && (
                    <p className="mt-1 font-numeric text-xl font-bold text-belt-gold">
                      {ratingToDisplay(fighter[attribute])}
                    </p>
                  )}
                  <p
                    className={`mt-2 text-sm font-medium transition-colors ${
                      selected ? "text-belt-gold" : "text-chalk group-hover:text-corner-red-bright"
                    }`}
                  >
                    {selected ? "Locked in" : `Use for ${ATTRIBUTE_LABELS[attribute]}`}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <nav aria-label="Your picks so far" className="mt-auto pt-8">
        <ol className="grid grid-cols-8 gap-1.5">
          {state.attributeOrder.map((slotAttribute, index) => {
            const picked = state.selections.get(slotAttribute);
            const isCurrent = index === state.roundIndex;
            return (
              <li key={slotAttribute} className="min-w-0">
                <div
                  className={`cut-sm relative aspect-square overflow-hidden ${
                    isCurrent ? "outline-2 outline-belt-gold" : ""
                  } ${picked || isCurrent ? "" : "opacity-40"}`}
                >
                  {picked ? (
                    <Avatar name={picked.name} corner="red" className="h-full w-full" />
                  ) : (
                    <div className="h-full w-full bg-panel" />
                  )}
                </div>
                <p
                  className={`mt-1 truncate text-center font-display text-sm leading-none font-bold tracking-wide ${
                    isCurrent ? "text-belt-gold" : picked ? "text-bone" : "text-chalk-faint"
                  }`}
                >
                  {ATTRIBUTE_SHORT[slotAttribute]}
                </p>
              </li>
            );
          })}
        </ol>
      </nav>
    </main>
  );
}
