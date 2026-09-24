import { Avatar } from "@/components/Avatar";
import { RunPips } from "@/components/RunTrack";
import type { FightRecord } from "@/lib/rampage";

interface RunHudProps {
  name: string;
  overall: number;
  record: { wins: number; losses: number };
  /** Present during a rampage: shows the 20-fight tracker. */
  rampage?: {
    fights: readonly FightRecord[];
    total: number;
    inProgress: boolean;
  };
}

/**
 * The bar that stays across every screen after the draft, so the run
 * feels like one continuous thing: who you are, how strong you are, and
 * how it is going.
 */
export function RunHud({ name, overall, record, rampage }: RunHudProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} corner="red" className="cut-sm h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-base leading-none font-semibold tracking-[0.06em] text-bone uppercase">
              {name}
            </p>
            <p className="mt-0.5 text-xs text-chalk">
              <span className="font-numeric text-sm font-bold text-belt-gold">{overall}</span> overall
            </p>
          </div>
        </div>
        <p className="font-numeric text-2xl leading-none font-bold text-bone" aria-label="Record">
          {record.wins}–{record.losses}
        </p>
        {rampage && (
          <div className="flex min-w-[10rem] flex-1 items-center gap-3 max-sm:order-last max-sm:basis-full">
            <RunPips fights={rampage.fights} total={rampage.total} inProgress={rampage.inProgress} />
            <p className="shrink-0 text-xs text-chalk">
              {Math.min(rampage.fights.length + (rampage.inProgress ? 1 : 0), rampage.total)}/{rampage.total}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
