import type { FightResult } from "@/lib/simulation/types";

const METHOD_LABELS: Record<FightResult["method"], string> = {
  KO: "Knockout",
  TKO: "TKO",
  SUB: "Submission",
  DEC: "Decision",
};

interface RampageProgress {
  fightNumber: number;
  total: number;
  onNext: () => void;
  onSimulateRest: () => void;
  onFinish: () => void;
}

interface FightResultScreenProps {
  result: FightResult;
  playerId: string;
  playerName: string;
  opponentId: string;
  opponentName: string;
  /** Career record including this fight. */
  record: { wins: number; losses: number };
  /** Present only during a rampage — replaces the rematch button with
   * next-fight / sim-the-rest / final-results controls. */
  rampage?: RampageProgress;
  onRematch: () => void;
  onNewFighter: () => void;
}

function StatRow({
  label,
  playerValue,
  opponentValue,
}: {
  label: string;
  playerValue: string;
  opponentValue: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="font-mono text-sm tabular-nums text-text">{playerValue}</span>
      <span className="text-center text-xs text-text-faint uppercase">{label}</span>
      <span className="text-right font-mono text-sm tabular-nums text-text">{opponentValue}</span>
    </div>
  );
}

export function FightResultScreen({
  result,
  playerId,
  playerName,
  opponentId,
  opponentName,
  record,
  rampage,
  onRematch,
  onNewFighter,
}: FightResultScreenProps) {
  const won = result.winnerId === playerId;
  const playerStats = result.stats[playerId]!;
  const opponentStats = result.stats[opponentId]!;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="flex items-baseline justify-between">
        <p
          className={`font-display text-2xl font-black tracking-tight uppercase ${
            won ? "text-accent" : "text-text-muted"
          }`}
        >
          {won ? "Victory" : "Defeat"}
        </p>
        <p className="font-mono text-sm text-text-muted">
          {rampage && `Fight ${rampage.fightNumber}/${rampage.total} · `}
          {record.wins}–{record.losses}
        </p>
      </div>
      <h1 className="mt-1 font-display text-4xl font-black tracking-tight uppercase">
        {METHOD_LABELS[result.method]}
        {result.method !== "DEC" &&
          ` — Round ${result.round} · ${formatControlTime(result.roundTimeSeconds)}`}
      </h1>

      <div className="mt-8 border border-border bg-surface px-5 py-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium text-text">{playerName}</span>
          <span className="font-medium text-text">{opponentName}</span>
        </div>
        <StatRow
          label="Sig. strikes"
          playerValue={`${playerStats.significantStrikesLanded}/${playerStats.significantStrikesAttempted}`}
          opponentValue={`${opponentStats.significantStrikesLanded}/${opponentStats.significantStrikesAttempted}`}
        />
        <StatRow
          label="Takedowns"
          playerValue={`${playerStats.takedownsLanded}/${playerStats.takedownsAttempted}`}
          opponentValue={`${opponentStats.takedownsLanded}/${opponentStats.takedownsAttempted}`}
        />
        <StatRow
          label="Control"
          playerValue={formatControlTime(playerStats.controlSeconds)}
          opponentValue={formatControlTime(opponentStats.controlSeconds)}
        />
        <StatRow
          label="Sub. attempts"
          playerValue={String(playerStats.submissionAttempts)}
          opponentValue={String(opponentStats.submissionAttempts)}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {rampage ? (
          rampage.fightNumber < rampage.total ? (
            <>
              <button
                onClick={rampage.onNext}
                className="bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
              >
                Next fight
              </button>
              <button
                onClick={rampage.onSimulateRest}
                className="border border-border px-8 py-4 font-display text-lg font-bold tracking-wide text-text uppercase transition-colors hover:border-border-strong"
              >
                Sim the remaining {rampage.total - rampage.fightNumber}
              </button>
            </>
          ) : (
            <button
              onClick={rampage.onFinish}
              className="bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
            >
              Final results
            </button>
          )
        ) : (
          <>
            <button
              onClick={onRematch}
              className="bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
            >
              Run it back
            </button>
            <button
              onClick={onNewFighter}
              className="border border-border px-8 py-4 font-display text-lg font-bold tracking-wide text-text uppercase transition-colors hover:border-border-strong"
            >
              Build new fighter
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function formatControlTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
