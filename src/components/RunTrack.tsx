import type { FightMethod } from "@/lib/simulation/types";
import type { FightRecord } from "@/lib/rampage";
import { Avatar } from "@/components/Avatar";

const METHOD_LABELS: Record<FightMethod, string> = {
  KO: "Knockout",
  TKO: "TKO",
  SUB: "Submission",
  DEC: "Decision",
};

interface RunPipsProps {
  fights: readonly FightRecord[];
  total: number;
  /** A fight is being set up or played right now. */
  inProgress?: boolean;
}

/** Twenty segments, one per fight: red for a win, dark for a loss, a
 * pulsing gold ring on the fight in progress. */
export function RunPips({ fights, total, inProgress = false }: RunPipsProps) {
  const wins = fights.filter((f) => f.won).length;
  return (
    <div
      className="flex flex-1 gap-[3px]"
      role="img"
      aria-label={`${wins} wins and ${fights.length - wins} losses in ${fights.length} of ${total} fights`}
    >
      {Array.from({ length: total }, (_, i) => {
        const fight = fights[i];
        const isLatest = i === fights.length - 1;
        let style = "bg-line";
        if (fight) style = fight.won ? "bg-corner-red" : "bg-chalk-faint";
        else if (i === fights.length && inProgress) style = "bg-belt-gold animate-ring-pulse";
        return (
          <span
            key={i}
            className={`h-3 min-w-[6px] flex-1 skew-x-[-18deg] ${style} ${fight && isLatest ? "animate-pip-pop" : ""}`}
          />
        );
      })}
    </div>
  );
}

interface RunGridProps {
  fights: readonly FightRecord[];
}

/** The whole run at a glance: every opponent, and how each fight ended. */
export function RunGrid({ fights }: RunGridProps) {
  return (
    <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {fights.map((fight, index) => (
        <li
          key={index}
          className="animate-rise-in"
          style={{ animationDelay: `${Math.min(index * 45, 900)}ms` }}
          title={`${fight.opponentName}: ${fight.won ? "won" : "lost"} by ${METHOD_LABELS[fight.method]}`}
        >
          <div className="cut-sm relative aspect-square overflow-hidden">
            <Avatar name={fight.opponentName} corner="white" className="h-full w-full" />
            <div
              className={`absolute inset-0 ${fight.won ? "bg-corner-red/10" : "bg-canvas/70"}`}
            />
            <span className="absolute top-0.5 left-1 font-numeric text-xs font-bold text-bone/90">
              {index + 1}
            </span>
            <span
              className={`absolute right-0 bottom-0 px-1.5 py-0.5 font-display text-sm leading-none font-extrabold ${
                fight.won ? "bg-corner-red text-bone" : "bg-line-strong text-chalk"
              }`}
            >
              {fight.won ? "W" : "L"}
            </span>
          </div>
          <p className="mt-1 truncate text-center text-[11px] leading-tight text-chalk">
            {METHOD_LABELS[fight.method]}
          </p>
        </li>
      ))}
    </ol>
  );
}
