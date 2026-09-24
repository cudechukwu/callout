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
    <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-5xl flex-col px-4 pt-8 pb-6">
      <div className="flex items-end justify-between gap-6">
        <div key={`head-${state.roundIndex}`} className="animate-rise-in">
          <p className="text-sm text-chalk">
            Pick {state.roundIndex + 1} of {total}
          </p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4.4vw,3.25rem)] leading-none font-semibold tracking-[0.07em] uppercase">
            {ATTRIBUTE_LABELS[attribute]}
          </h1>
          <p className="mt-2 max-w-md text-chalk">{ATTRIBUTE_BLURB[attribute]}</p>
        </div>
        <button
          onClick={onReroll}
          disabled={state.rerollsRemaining === 0 || busy}
          className="shrink-0 pb-1 text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone disabled:text-chalk-faint disabled:no-underline"
        >
          Reroll ({state.rerollsRemaining} left)
        </button>
      </div>

      <div
        key={`cards-${state.roundIndex}-${candidates.map((c) => c.id).join("-")}`}
        className="mt-7 grid gap-3 sm:grid-cols-3 sm:gap-5"
      >
        {candidates.map((fighter, index) => {
          const selected = pendingId === fighter.id;
          return (
            <div key={fighter.id} className="animate-deal-in" style={{ animationDelay: `${index * 110}ms` }}>
              <button
                onClick={() => onPick(fighter.id)}
                disabled={busy}
                aria-label={`Pick ${fighter.name} for ${ATTRIBUTE_LABELS[attribute]}`}
                className={`group flex w-full items-stretch overflow-hidden border text-left backdrop-blur-sm transition-all duration-200 sm:flex-col ${
                  selected
                    ? "animate-lock-in border-belt-gold bg-panel-raised/90"
                    : busy
                      ? "border-line bg-panel/70 opacity-40"
                      : "border-line bg-panel/70 hover:-translate-y-1 hover:border-corner-red hover:bg-panel-raised/90"
                }`}
              >
                <Avatar
                  name={fighter.name}
                  corner={selected ? "red" : "neutral"}
                  className="h-24 w-24 shrink-0 sm:h-auto sm:w-full sm:aspect-[4/5]"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3 sm:py-4">
                  <p className="font-display text-lg leading-tight font-semibold tracking-[0.06em] uppercase sm:text-xl">
                    {fighter.name}
                  </p>
                  {SHOW_ATTRIBUTE_RATINGS && (
                    <p className="mt-1 font-numeric text-lg text-belt-gold">{ratingToDisplay(fighter[attribute])}</p>
                  )}
                  <p
                    className={`mt-1.5 text-sm transition-colors ${
                      selected ? "font-medium text-belt-gold" : "text-chalk group-hover:text-corner-red-bright"
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

      <nav aria-label="Your picks so far" className="mt-auto pt-10">
        <ol className="grid grid-cols-8 gap-1.5">
          {state.attributeOrder.map((slotAttribute, index) => {
            const picked = state.selections.get(slotAttribute);
            const isCurrent = index === state.roundIndex;
            return (
              <li key={slotAttribute} className="min-w-0">
                <div
                  className={`relative aspect-square overflow-hidden ${
                    isCurrent ? "outline-2 outline-belt-gold" : ""
                  } ${picked || isCurrent ? "" : "opacity-40"}`}
                >
                  {picked ? (
                    <Avatar name={picked.name} corner="red" className="h-full w-full" />
                  ) : (
                    <div className="h-full w-full bg-panel/70" />
                  )}
                </div>
                <p
                  className={`mt-1 truncate text-center font-display text-xs leading-none font-semibold tracking-[0.1em] ${
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
