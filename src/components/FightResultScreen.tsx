import type { FightResult } from "@/lib/simulation/types";
import { Avatar } from "@/components/Avatar";
import { formatClock, primaryButton, secondaryButton } from "@/components/ui";

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
  playerNumber,
  opponentNumber,
}: {
  label: string;
  playerValue: string;
  opponentValue: string;
  playerNumber: number;
  opponentNumber: number;
}) {
  const total = playerNumber + opponentNumber || 1;
  return (
    <div className="py-2.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
        <span className="font-numeric text-2xl leading-none font-bold text-bone">{playerValue}</span>
        <span className="text-center text-sm text-chalk">{label}</span>
        <span className="text-right font-numeric text-2xl leading-none font-bold text-bone">{opponentValue}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 gap-[3px]" aria-hidden="true">
        <div className="flex justify-end bg-line" style={{ width: "50%" }}>
          <div className="h-full bg-corner-red" style={{ width: `${(playerNumber / total) * 100}%` }} />
        </div>
        <div className="bg-line" style={{ width: "50%" }}>
          <div className="h-full bg-corner-white" style={{ width: `${(opponentNumber / total) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function FightResultScreen({
  result,
  playerId,
  playerName,
  opponentId,
  opponentName,
  rampage,
  onRematch,
  onNewFighter,
}: FightResultScreenProps) {
  const won = result.winnerId === playerId;
  const me = result.stats[playerId]!;
  const them = result.stats[opponentId]!;
  const winnerName = won ? playerName : opponentName;

  return (
    <main className="animate-screen-in mx-auto w-full max-w-3xl px-4 py-8">
      <section
        className={`cut animate-rise-in relative overflow-hidden px-6 py-8 sm:px-10 ${won ? "bg-corner-red" : "bg-panel-raised"}`}
      >
        <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-52 sm:block">
          <Avatar name={winnerName} corner={won ? "red" : "white"} className="h-full w-full opacity-90" />
        </div>
        <p
          className={`font-display text-6xl leading-[0.9] font-semibold tracking-[0.07em] uppercase sm:text-7xl ${
            won ? "text-bone" : "text-chalk"
          }`}
        >
          {won ? "Win" : "Loss"}
        </p>
        <p className="mt-3 font-display text-xl font-semibold tracking-[0.07em] text-bone uppercase sm:text-2xl">
          {METHOD_LABELS[result.method]}
          {result.method !== "DEC" && (
            <span className="ml-3 text-bone/80">
              Round {result.round}, {formatClock(result.roundTimeSeconds)}
            </span>
          )}
        </p>
        <p className={`mt-1 text-sm ${won ? "text-bone/85" : "text-chalk"}`}>
          {winnerName} takes it
          {result.method === "DEC" ? " on the scorecards." : "."}
        </p>
      </section>

      <section className="cut mt-4 bg-panel px-5 py-4 sm:px-8" aria-label="Fight stats">
        <div className="mb-1 flex justify-between border-b border-line pb-2">
          <span className="font-display text-base font-semibold tracking-[0.06em] uppercase">{playerName}</span>
          <span className="font-display text-base font-semibold tracking-[0.06em] uppercase">{opponentName}</span>
        </div>
        <StatRow
          label="Significant strikes"
          playerValue={`${me.significantStrikesLanded}/${me.significantStrikesAttempted}`}
          opponentValue={`${them.significantStrikesLanded}/${them.significantStrikesAttempted}`}
          playerNumber={me.significantStrikesLanded}
          opponentNumber={them.significantStrikesLanded}
        />
        <StatRow
          label="Takedowns"
          playerValue={`${me.takedownsLanded}/${me.takedownsAttempted}`}
          opponentValue={`${them.takedownsLanded}/${them.takedownsAttempted}`}
          playerNumber={me.takedownsLanded}
          opponentNumber={them.takedownsLanded}
        />
        <StatRow
          label="Control time"
          playerValue={formatClock(me.controlSeconds)}
          opponentValue={formatClock(them.controlSeconds)}
          playerNumber={me.controlSeconds}
          opponentNumber={them.controlSeconds}
        />
        <StatRow
          label="Submission attempts"
          playerValue={String(me.submissionAttempts)}
          opponentValue={String(them.submissionAttempts)}
          playerNumber={me.submissionAttempts}
          opponentNumber={them.submissionAttempts}
        />
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {rampage ? (
          rampage.fightNumber < rampage.total ? (
            <>
              <button onClick={rampage.onNext} className={`${primaryButton} sm:flex-1`}>
                Next fight
              </button>
              <button onClick={rampage.onSimulateRest} className={`${secondaryButton} sm:flex-1`}>
                Sim the remaining {rampage.total - rampage.fightNumber}
              </button>
            </>
          ) : (
            <button onClick={rampage.onFinish} className={`${primaryButton} sm:flex-1`}>
              Final results
            </button>
          )
        ) : (
          <>
            <button onClick={onRematch} className={`${primaryButton} sm:flex-1`}>
              Run it back
            </button>
            <button onClick={onNewFighter} className={`${secondaryButton} sm:flex-1`}>
              Build new fighter
            </button>
          </>
        )}
      </div>
    </main>
  );
}
