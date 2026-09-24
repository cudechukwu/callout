import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import type { AttributeSelections } from "@/lib/simulation/types";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_RATINGS } from "@/lib/config";

export interface FighterCardProps {
  name: string;
  selections: AttributeSelections;
  record?: { wins: number; losses: number };
  /** Overall rating, shown once a build is complete. Display-only — see
   * src/lib/draft/overall.ts. Omitted while drafting and on the demo card. */
  overall?: number;
  /** Staggers the 8 attribute rows in on mount — the one deliberate
   * reveal moment this component owns. Off by default so the card can
   * also be used inline (draft summaries, opponent previews) without
   * replaying the animation every time. */
  animateIn?: boolean;
  className?: string;
}

export function FighterCard({
  name,
  selections,
  record,
  overall,
  animateIn = false,
  className = "",
}: FighterCardProps) {
  return (
    <div
      className={`border border-t-[3px] border-border border-t-accent bg-surface ${className}`}
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-5">
        <h3 className="font-display text-2xl font-semibold leading-none tracking-[0.06em] uppercase">
          {name}
        </h3>
        {record && (
          <span className="font-mono text-lg text-text-muted whitespace-nowrap">
            {record.wins}–{record.losses}
          </span>
        )}
      </div>
      {overall !== undefined && (
        <div className="flex items-baseline gap-2 border-b border-border px-6 py-3">
          <span className="font-display text-4xl font-bold leading-none tabular-nums text-accent">
            {overall}
          </span>
          <span className="font-mono text-sm tracking-widest text-text-muted uppercase">OVR</span>
        </div>
      )}

      <dl>
        {VISIBLE_ATTRIBUTES.map((attribute, index) => {
          const pick = selections[attribute].sourceFighter;
          return (
            <div
              key={attribute}
              className={`flex items-end justify-between gap-4 px-6 py-3 ${
                index !== VISIBLE_ATTRIBUTES.length - 1 ? "border-b border-border" : ""
              } ${animateIn ? "animate-row-in" : ""}`}
              style={animateIn ? { animationDelay: `${index * 60}ms` } : undefined}
            >
              <div className="min-w-0">
                <dt className="text-xs tracking-wide text-text-muted">
                  {ATTRIBUTE_LABELS[attribute]}
                </dt>
                <dd className="truncate font-medium text-text">{pick.name}</dd>
              </div>
              {SHOW_ATTRIBUTE_RATINGS && (
                <dd className="font-mono text-2xl font-medium tabular-nums text-text shrink-0">
                  {pick[attribute].toFixed(1)}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
