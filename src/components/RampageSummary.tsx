import type { FightMethod } from "@/lib/simulation/types";
import { summarizeRampage, RAMPAGE_LENGTH, type FightRecord } from "@/lib/rampage";
import { Avatar } from "@/components/Avatar";
import { RunGrid } from "@/components/RunTrack";
import { primaryButton, secondaryButton } from "@/components/ui";

const METHOD_LABELS: Record<FightMethod, string> = {
  KO: "Knockout",
  TKO: "TKO",
  SUB: "Submission",
  DEC: "Decision",
};
const METHODS: readonly FightMethod[] = ["KO", "TKO", "SUB", "DEC"];

interface RampageSummaryProps {
  fighterName: string;
  overall: number;
  fights: readonly FightRecord[];
  onRampageAgain: () => void;
  onNewFighter: () => void;
}

export function RampageSummary({
  fighterName,
  overall,
  fights,
  onRampageAgain,
  onNewFighter,
}: RampageSummaryProps) {
  const summary = summarizeRampage(fights);
  const perfect = summary.fights === RAMPAGE_LENGTH && summary.losses === 0;

  return (
    <main className="animate-screen-in mx-auto w-full max-w-3xl px-4 py-8">
      <section className={`cut animate-rise-in px-6 py-8 sm:px-10 ${perfect ? "bg-belt-gold text-canvas" : "bg-panel"}`}>
        <div className="flex items-center gap-4">
          <Avatar name={fighterName} corner="red" className="cut-sm h-16 w-16 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-2xl leading-none font-semibold tracking-[0.06em] uppercase">
              {fighterName}
            </p>
            <p className={`mt-1 text-sm ${perfect ? "text-canvas/80" : "text-chalk"}`}>
              <span className={`font-numeric text-lg font-bold ${perfect ? "text-canvas" : "text-belt-gold"}`}>
                {overall}
              </span>{" "}
              overall
            </p>
          </div>
        </div>
        <p className={`mt-6 text-sm ${perfect ? "text-canvas/80" : "text-chalk"}`}>
          {perfect ? "Perfect rampage" : "Rampage complete"}
        </p>
        <p className="font-display text-7xl leading-[0.85] font-bold tabular-nums sm:text-8xl">
          {summary.wins}–{summary.losses}
        </p>
        <dl className="mt-5 grid grid-cols-3 gap-4">
          {[
            [`${summary.winPercent}%`, "Won"],
            [String(summary.longestWinStreak), "Best streak"],
            [`${summary.finishes}`, "Ended early"],
          ].map(([value, label]) => (
            <div key={label}>
              <dd className="font-numeric text-3xl leading-none font-bold">{value}</dd>
              <dt className={`mt-1 text-xs ${perfect ? "text-canvas/80" : "text-chalk"}`}>{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="cut mt-4 bg-panel px-5 py-5 sm:px-8" aria-label="How the fights ended">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-8 border-b border-line pb-2 text-sm text-chalk">
          <span>How they ended</span>
          <span className="text-right">Won</span>
          <span className="text-right">Lost</span>
        </div>
        {METHODS.map((method) => (
          <div
            key={method}
            className="grid grid-cols-[1fr_auto_auto] gap-x-8 border-b border-line py-2 last:border-b-0"
          >
            <span className="text-bone">{METHOD_LABELS[method]}</span>
            <span className="text-right font-numeric text-xl leading-none font-bold text-corner-red-bright">
              {summary.winsByMethod[method]}
            </span>
            <span className="text-right font-numeric text-xl leading-none font-bold text-chalk">
              {summary.lossesByMethod[method]}
            </span>
          </div>
        ))}
      </section>

      <section className="cut mt-4 bg-panel px-5 py-5 sm:px-8" aria-label="Every fight">
        <p className="mb-3 text-sm text-chalk">Every opponent</p>
        <RunGrid fights={fights} />
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button onClick={onRampageAgain} className={`${primaryButton} sm:flex-1`}>
          Rampage again
        </button>
        <button onClick={onNewFighter} className={`${secondaryButton} sm:flex-1`}>
          Build new fighter
        </button>
      </div>
    </main>
  );
}
