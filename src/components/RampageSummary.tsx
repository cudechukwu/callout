import type { FightMethod } from "@/lib/simulation/types";
import { summarizeRampage, type FightRecord } from "@/lib/rampage";

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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="font-mono text-sm tracking-widest text-text-faint uppercase">
        Rampage complete
      </p>
      <h1 className="mt-1 font-display text-4xl font-black tracking-tight uppercase">
        {fighterName}
      </h1>
      <p className="mt-1 font-mono text-sm tracking-widest text-text-muted uppercase">
        {overall} OVR
      </p>
      <p className="mt-2 font-display text-6xl font-black tabular-nums text-accent">
        {summary.wins}–{summary.losses}
      </p>
      <p className="mt-1 font-mono text-sm text-text-muted">
        {summary.winPercent}% wins · best streak {summary.longestWinStreak} ·{" "}
        {summary.finishes} of {summary.fights} fights finished early
      </p>

      <div className="mt-8 border border-border bg-surface px-5 py-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-border pb-2 text-xs text-text-faint uppercase">
          <span>Method</span>
          <span className="text-right">Won</span>
          <span className="text-right">Lost</span>
        </div>
        {METHODS.map((method) => (
          <div
            key={method}
            className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-border py-2.5 last:border-b-0"
          >
            <span className="text-sm text-text">{METHOD_LABELS[method]}</span>
            <span className="text-right font-mono text-sm tabular-nums text-text">
              {summary.winsByMethod[method]}
            </span>
            <span className="text-right font-mono text-sm tabular-nums text-text-muted">
              {summary.lossesByMethod[method]}
            </span>
          </div>
        ))}
      </div>

      <ol className="mt-6 max-h-64 overflow-y-auto border border-border bg-surface">
        {fights.map((fight, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs text-text-faint">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-text">{fight.opponentName}</span>
            <span className="font-mono text-xs text-text-muted">
              {METHOD_LABELS[fight.method]}
              {fight.method !== "DEC" &&
                ` R${fight.round} ${Math.floor(fight.roundTimeSeconds / 60)}:${String(
                  Math.round(fight.roundTimeSeconds % 60)
                ).padStart(2, "0")}`}
            </span>
            <span className={`w-4 text-right font-bold ${fight.won ? "text-accent" : "text-text-faint"}`}>
              {fight.won ? "W" : "L"}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={onRampageAgain}
          className="bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
        >
          Rampage again
        </button>
        <button
          onClick={onNewFighter}
          className="border border-border px-8 py-4 font-display text-lg font-bold tracking-wide text-text uppercase transition-colors hover:border-border-strong"
        >
          Build new fighter
        </button>
      </div>
    </main>
  );
}
