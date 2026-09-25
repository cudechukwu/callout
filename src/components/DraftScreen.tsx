"use client";

import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_RATINGS } from "@/lib/config";
import { ATTRIBUTE_BLURB, ATTRIBUTE_SHORT, ratingToDisplay } from "@/lib/ratings";
import { isAlreadyUsed, type DraftSessionState } from "@/lib/draft/session";
import { Avatar } from "@/components/Avatar";
import { draftFaces } from "@/lib/avatars";

/** Just what the board needs, so a challenge draft (built from the server's
 * view) can use the same screen as a local draft. */
export type DraftBoardState = Pick<
  DraftSessionState,
  "attributeOrder" | "roundIndex" | "currentCandidates" | "selections" | "usedFighterIds" | "rerollsRemaining" | "history"
>;

interface DraftScreenProps {
  state: DraftBoardState;
  /** Fighter id whose pick is locking in (the card animates, input pauses). */
  pendingId: number | null;
  onPick: (fighterId: number) => void;
  onReroll: () => void;
  /** Extra status above the reroll button (a challenge shows the opponent here). */
  aside?: React.ReactNode;
}

export function DraftScreen({ state, pendingId, onPick, onReroll, aside }: DraftScreenProps) {
  const attribute = state.attributeOrder[state.roundIndex]!;
  const candidates = state.currentCandidates!;
  const total = state.attributeOrder.length;
  const busy = pendingId !== null;
  const faces = draftFaces(state.history, candidates);

  return (
    <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem-1px)] w-full max-w-4xl flex-col px-4 pt-5 pb-4 md:h-[calc(100svh-3.5rem-1px)]">
      <div className="flex shrink-0 items-end justify-between gap-6">
        <div key={`head-${state.roundIndex}`} className="animate-rise-in">
          <p className="text-sm text-chalk">
            Pick {state.roundIndex + 1} of {total}
          </p>
          <h1 className="font-display text-[clamp(1.75rem,3.4vw,2.6rem)] leading-none font-semibold tracking-[0.07em] uppercase">
            {ATTRIBUTE_LABELS[attribute]}
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-chalk">{ATTRIBUTE_BLURB[attribute]}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {aside}
          <button
            onClick={onReroll}
            disabled={state.rerollsRemaining === 0 || busy}
            className="pb-0.5 text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone disabled:text-chalk-faint disabled:no-underline"
          >
            Reroll ({state.rerollsRemaining} left)
          </button>
        </div>
      </div>

      {/* The cards and the pick rail share the height left over and sit
          centred in it as one unit: cards grow to a sensible size, never
          stretch, and the whole screen fits without scrolling. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-5">
      <div className="min-h-0 flex-1 md:max-h-[23rem] md:min-h-[13rem]">
      <div
        key={`cards-${state.roundIndex}-${candidates.map((c) => c.id).join("-")}`}
        className="grid h-full w-full gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {candidates.map((fighter, index) => {
          const selected = pendingId === fighter.id;
          const used = isAlreadyUsed(state, fighter.id);
          return (
            <div key={fighter.id} className="animate-deal-in min-h-0" style={{ animationDelay: `${index * 110}ms` }}>
              <button
                onClick={() => onPick(fighter.id)}
                disabled={busy || used}
                aria-label={
                  used
                    ? `${fighter.name}, already used`
                    : `Pick ${fighter.name} for ${ATTRIBUTE_LABELS[attribute]}`
                }
                className={`group relative flex h-full w-full items-stretch overflow-hidden border text-left backdrop-blur-[3px] transition-all duration-200 sm:flex-col ${
                  selected
                    ? "animate-lock-in border-bone bg-panel/50"
                    : used
                      ? "cursor-not-allowed border-line/40 bg-panel/10 opacity-35 grayscale"
                      : busy
                      ? "border-line/70 bg-panel/20 opacity-40"
                      : "border-line/70 bg-panel/25 hover:-translate-y-1 hover:border-bone/70 hover:bg-panel/45"
                }`}
              >
                {/* Red is your fighter: it wipes in on hover and fills when the pick locks. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 bottom-0 z-10 h-[3px] origin-left bg-corner-red transition-transform duration-300 ${
                    selected ? "scale-x-100" : used ? "scale-x-0" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
                <Avatar
                  name={fighter.name}
                  src={faces.board.get(fighter.id)}
                  corner="neutral"
                  translucent
                  className="h-20 w-20 shrink-0 sm:h-auto sm:min-h-0 sm:w-full sm:flex-1"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-center px-3.5 py-2.5 sm:flex-none sm:py-3">
                  <p className="font-display text-base leading-tight font-semibold tracking-[0.06em] uppercase sm:text-lg">
                    {fighter.name}
                  </p>
                  {SHOW_ATTRIBUTE_RATINGS && (
                    <p className="mt-1 font-numeric text-lg text-belt-gold">{ratingToDisplay(fighter[attribute])}</p>
                  )}
                  <p
                    className={`mt-0.5 text-sm transition-colors ${
                      selected ? "font-medium text-bone" : used ? "text-chalk" : "text-chalk group-hover:text-bone"
                    }`}
                  >
                    {selected ? "Locked in" : used ? "Already used" : `Use for ${ATTRIBUTE_LABELS[attribute]}`}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      </div>

      <nav aria-label="Your picks so far" className="shrink-0">
        <ol className="flex gap-2">
          {state.attributeOrder.map((slotAttribute, index) => {
            const picked = state.selections.get(slotAttribute);
            const isCurrent = index === state.roundIndex;
            return (
              <li key={slotAttribute} className="w-14 shrink-0 sm:w-[3.75rem]">
                <div
                  className={`relative aspect-square overflow-hidden ${
                    isCurrent ? "outline-2 outline-bone" : ""
                  } ${picked || isCurrent ? "" : "opacity-40"}`}
                >
                  {picked ? (
                    <Avatar name={picked.name} src={faces.picked.get(picked.id)} corner="red" className="h-full w-full" />
                  ) : (
                    <div className="h-full w-full border border-line/60 bg-panel/40" />
                  )}
                </div>
                <p
                  className={`mt-1 truncate text-center font-display text-xs leading-none font-semibold tracking-[0.1em] ${
                    isCurrent ? "text-bone" : picked ? "text-bone/80" : "text-chalk-faint"
                  }`}
                >
                  {ATTRIBUTE_SHORT[slotAttribute]}
                </p>
              </li>
            );
          })}
        </ol>
      </nav>
      </div>
    </main>
  );
}
