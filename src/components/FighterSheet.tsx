import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_NUMBERS } from "@/lib/config";
import { ratingToDisplay } from "@/lib/ratings";
import type { AttributeSelections } from "@/lib/simulation/types";
import { Avatar, type Corner } from "@/components/Avatar";
import { CountUp } from "@/components/CountUp";

interface FighterSheetProps {
  name: string;
  selections: AttributeSelections;
  overall: number;
  corner?: Corner;
  /** Plays the reveal: OVR counts up, bars fill in turn, gold sweep. */
  reveal?: boolean;
  record?: { wins: number; losses: number };
}

/**
 * The finished fighter: who you built, what each pick contributes, and
 * how strong the whole is. Shown once a build is complete, when the
 * per-attribute numbers are finally revealed.
 */
export function FighterSheet({
  name,
  selections,
  overall,
  corner = "red",
  reveal = false,
  record,
}: FighterSheetProps) {
  const barColor = corner === "blue" ? "bg-corner-blue" : "bg-corner-red";
  const values = VISIBLE_ATTRIBUTES.map((a) => ratingToDisplay(selections[a].sourceFighter[a]));
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  // Only call out a best pick / weak link when there is a real spread;
  // every row that ties for the extreme gets the tag.
  const hasSpread = highest > lowest;

  return (
    <div className="cut relative bg-panel">
      <div className="grid sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="relative">
          <Avatar name={name} corner={corner} className="aspect-[5/3] w-full sm:h-full sm:aspect-auto sm:min-h-[22rem]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas/80 to-transparent px-5 pt-16 pb-4">
            <h2 className="font-display text-4xl leading-none font-black tracking-wide text-bone uppercase">
              {name}
            </h2>
            {record && (
              <p className="mt-1 font-numeric text-lg text-chalk">
                {record.wins}–{record.losses}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-7">
          <div className="flex items-end justify-between border-b border-line pb-4">
            <p className="text-sm text-chalk">Overall</p>
            <p className="font-display text-7xl leading-[0.8] font-black text-belt-gold">
              {reveal ? <CountUp value={overall} delayMs={500} /> : <span className="font-numeric">{overall}</span>}
            </p>
          </div>
          <dl className="mt-3">
            {VISIBLE_ATTRIBUTES.map((attribute, index) => {
              const pick = selections[attribute].sourceFighter;
              const value = values[index]!;
              const callout = !hasSpread
                ? null
                : value === highest
                  ? "Best pick"
                  : value === lowest
                    ? "Weak link"
                    : null;
              return (
                <div
                  key={attribute}
                  className={`grid items-center gap-3 py-[7px] ${
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
                      className={`h-full w-full ${barColor} ${reveal ? "animate-bar-fill" : ""}`}
                      style={
                        {
                          "--fill": value / 100,
                          transform: reveal ? undefined : `scaleX(${value / 100})`,
                          transformOrigin: "left center",
                          animationDelay: `${700 + index * 110}ms`,
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
