"use client";

import { useState } from "react";
import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_NUMBERS } from "@/lib/config";
import type { YourCalls } from "@/lib/draft/answerSheet";
import { computeIdentity } from "@/lib/draft/identity";
import { ratingToDisplay } from "@/lib/ratings";
import type { AttributeSelections } from "@/lib/simulation/types";
import { Avatar, type Corner } from "@/components/Avatar";
import { CountUp } from "@/components/CountUp";

interface FighterSheetProps {
  name: string;
  selections: AttributeSelections;
  overall: number;
  corner?: Corner;
  /** Plays the reveal: OVR counts up, the recipe lines in, gold sweep. */
  reveal?: boolean;
  record?: { wins: number; losses: number };
  /** How well the picks used the cards you were shown. Omitted for fighters with no draft history. */
  calls?: YourCalls | null;
}

/**
 * The finished fighter, character first: who you made (name, overall, style,
 * one standout trait), the eight real fighters it is built from, and what it
 * is best at. The per-skill bars sit behind "View full build".
 */
export function FighterSheet({
  name,
  selections,
  overall,
  corner = "red",
  reveal = false,
  record,
  calls,
}: FighterSheetProps) {
  const [showBuild, setShowBuild] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showMissName, setShowMissName] = useState(false);
  const identity = computeIdentity(selections);
  const barColor = corner === "white" ? "bg-corner-white" : "bg-corner-red";

  const values = VISIBLE_ATTRIBUTES.map((a) => ratingToDisplay(selections[a].sourceFighter[a]));
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const hasSpread = highest > lowest;
  const delay = (index: number) => ({ animationDelay: `${700 + index * 90}ms` });

  return (
    <div className="cut relative bg-panel">
      <div className="grid sm:grid-cols-[minmax(0,13rem)_1fr]">
        {/* Phone: a compact header row. Larger screens: a tall portrait. */}
        <div className="flex items-center gap-4 border-b border-line px-5 py-4 sm:hidden">
          <Avatar name={name} corner={corner} className="cut-sm h-20 w-20 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-none font-semibold tracking-[0.06em] text-bone uppercase">
              {name}
            </h2>
            {record && (
              <p className="mt-1 font-numeric text-lg text-chalk">
                {record.wins}–{record.losses}
              </p>
            )}
          </div>
        </div>
        <div className="hidden self-start sm:block">
          <Avatar name={name} corner={corner} className="aspect-[3/4] w-full" />
        </div>

        <div className="px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="hidden font-display text-3xl leading-none font-semibold tracking-[0.06em] text-bone uppercase sm:block">
                {name}
              </h2>
              <p className="font-display text-xl font-semibold tracking-[0.08em] text-bone uppercase sm:mt-2">
                {identity.style}
              </p>
              {identity.trait && <p className="mt-0.5 text-sm text-chalk">{identity.trait}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-6xl leading-[0.8] font-bold text-belt-gold">
                {reveal ? <CountUp value={overall} delayMs={500} /> : <span className="font-numeric">{overall}</span>}
              </p>
              <p className="mt-1 text-xs text-chalk">overall</p>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm text-chalk">Built from</p>
            <dl className="mt-2">
              {VISIBLE_ATTRIBUTES.map((attribute, index) => (
                <div
                  key={attribute}
                  className={`flex items-baseline justify-between gap-4 border-b border-line/50 py-[7px] last:border-b-0 ${reveal ? "animate-rise-in" : ""}`}
                  style={reveal ? delay(index) : undefined}
                >
                  <dt className="text-sm text-chalk">{ATTRIBUTE_LABELS[attribute]}</dt>
                  <dd className="truncate text-right font-medium text-bone">
                    {selections[attribute].sourceFighter.name}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <dt className="text-sm text-chalk">Best weapon</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold tracking-[0.06em] text-bone uppercase">
                {identity.bestWeapon}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-chalk">{identity.weakLink ? "Weak link" : "Weaknesses"}</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold tracking-[0.06em] text-bone uppercase">
                {identity.weakLink ? (
                  <>
                    {ATTRIBUTE_LABELS[identity.weakLink.attribute]}
                    <span className="block font-body text-sm font-normal tracking-normal text-chalk normal-case">
                      {identity.weakLink.fighterName}
                    </span>
                  </>
                ) : (
                  "None major"
                )}
              </dd>
            </div>
          </dl>

          {calls && (
            <section aria-label="Your draft" className="mt-4 border-t border-line pt-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-chalk">Left on the table</p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    {calls.leftOnTable < 1 ? (
                      <span className="font-display text-2xl leading-none font-semibold tracking-[0.06em] text-bone uppercase">
                        Nothing
                      </span>
                    ) : (
                      <>
                        <span className="font-display text-4xl leading-none font-bold text-bone">
                          {calls.leftOnTable}
                        </span>
                        <span className="text-sm text-chalk">overall</span>
                      </>
                    )}
                  </p>
                </div>
                <dl className="flex gap-5 text-right">
                  <div>
                    <dt className="text-xs text-chalk">You built</dt>
                    <dd className="font-display text-2xl leading-none font-bold text-bone">{overall}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-chalk">From your cards</dt>
                    <dd className="font-display text-2xl leading-none font-bold text-bone">
                      {Math.min(99, overall + calls.leftOnTable)}
                    </dd>
                  </div>
                </dl>
              </div>

              <button
                type="button"
                onClick={() => setShowReview((v) => !v)}
                aria-expanded={showReview}
                className="mt-3 text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone"
              >
                {showReview ? "Hide my picks" : "Review my picks"}
              </button>

              {showReview && (
                <dl className="mt-3 space-y-3 border-t border-line pt-3">
                  {calls.bestPick && (
                    <div>
                      <dt className="text-xs text-chalk">Best pick</dt>
                      <dd className="mt-0.5 font-medium text-bone">
                        {calls.bestPick.fighterName}
                        <span className="font-normal text-chalk">, {ATTRIBUTE_LABELS[calls.bestPick.attribute]}</span>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-chalk">Biggest miss</dt>
                    <dd className="mt-0.5">
                      {calls.biggestMiss ? (
                        <>
                          <span className="font-medium text-bone">
                            {ATTRIBUTE_LABELS[calls.biggestMiss.attribute]}
                          </span>
                          <span className="block text-sm text-chalk">
                            A card on your board would have added +{calls.biggestMiss.gain} overall.
                          </span>
                          {showMissName ? (
                            <span className="mt-1 block text-sm text-bone">
                              {calls.biggestMiss.betterName} was there instead of {calls.biggestMiss.pickedName}.
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowMissName(true)}
                              className="mt-1 text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone"
                            >
                              Show me
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="font-medium text-bone">No real misses</span>
                      )}
                    </dd>
                  </div>
                  {calls.sleeper && (
                    <div>
                      <dt className="text-xs text-chalk">Sleeper</dt>
                      <dd className="mt-0.5 font-medium text-bone">
                        {calls.sleeper.fighterName}
                        <span className="font-normal text-chalk">, {ATTRIBUTE_LABELS[calls.sleeper.attribute]}</span>
                        <span className="block text-sm font-normal text-chalk">
                          Hidden speed and defense added +{calls.sleeper.gain} overall.
                        </span>
                      </dd>
                    </div>
                  )}
                  <p className="text-xs text-chalk-faint">
                    Based on Five-Star&rsquo;s ratings and the cards you were shown.
                  </p>
                </dl>
              )}
            </section>
          )}

          <button
            type="button"
            onClick={() => setShowBuild((v) => !v)}
            aria-expanded={showBuild}
            className="mt-5 text-sm font-medium text-bone/80 underline decoration-bone/30 underline-offset-4 transition-colors hover:text-bone"
          >
            {showBuild ? "Hide full build" : "View full build"}
          </button>

          {showBuild && (
            <dl className="mt-3 border-t border-line pt-2">
              {VISIBLE_ATTRIBUTES.map((attribute, index) => {
                const pick = selections[attribute].sourceFighter;
                const value = values[index]!;
                const callout =
                  identity.weakLink?.attribute === attribute
                    ? "Weak link"
                    : hasSpread && value === highest
                      ? "Best pick"
                      : null;
                return (
                  <div
                    key={attribute}
                    className={`grid items-center gap-3 py-[6px] ${
                      SHOW_ATTRIBUTE_NUMBERS ? "grid-cols-[6.5rem_1fr_2.25rem]" : "grid-cols-[6.5rem_1fr_4.5rem]"
                    }`}
                  >
                    <dt className="min-w-0">
                      <span className="block text-sm leading-tight font-medium text-bone">
                        {ATTRIBUTE_LABELS[attribute]}
                      </span>
                      <span className="block truncate text-xs leading-tight text-chalk">{pick.name}</span>
                    </dt>
                    <dd className="h-2 overflow-hidden bg-line" aria-hidden="true">
                      <div
                        className={`animate-bar-fill h-full w-full ${barColor}`}
                        style={
                          {
                            "--fill": value / 100,
                            animationDelay: `${index * 70}ms`,
                          } as React.CSSProperties
                        }
                      />
                    </dd>
                    <dd className="text-right">
                      {SHOW_ATTRIBUTE_NUMBERS ? (
                        <span className="font-numeric text-xl leading-none font-bold text-bone">{value}</span>
                      ) : (
                        callout && (
                          <span
                            className={`text-xs font-semibold ${
                              callout === "Best pick" ? "text-belt-gold" : "text-corner-red-bright"
                            }`}
                          >
                            {callout}
                          </span>
                        )
                      )}
                      <span className="sr-only">{`${value} out of 99`}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      </div>
      {reveal && (
        <div
          aria-hidden="true"
          className="animate-gold-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-belt-gold/40 to-transparent"
        />
      )}
    </div>
  );
}
