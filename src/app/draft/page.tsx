"use client";

import { useEffect, useRef, useState } from "react";
import {
  isDraftComplete,
  reroll,
  selectCandidate,
  startDraft,
  toFighterSnapshot,
  type DraftSessionState,
} from "@/lib/draft/session";
import { generateCpuFighter, randomCpuName } from "@/lib/draft/cpuFighter";
import { createRng } from "@/lib/simulation/rng";
import { simulateFight } from "@/lib/simulation/engine";
import type { FighterSnapshot, FightResult, RNG } from "@/lib/simulation/types";
import { narrateFight, type NarratedMoment } from "@/lib/broadcast/narrate";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_RATINGS } from "@/lib/config";
import { computeOverall } from "@/lib/draft/overall";
import {
  RAMPAGE_LENGTH,
  recordOf,
  toFightRecord,
  type FightRecord,
} from "@/lib/rampage";
import { FighterCard } from "@/components/FighterCard";
import { FightViewer } from "@/components/FightViewer";
import { FightResultScreen } from "@/components/FightResultScreen";
import { RampageSummary } from "@/components/RampageSummary";

type Phase =
  | "drafting"
  | "naming"
  | "complete"
  | "opponentReveal"
  | "fighting"
  | "result"
  | "rampageSummary";

const NAME_MIN = 3;
const NAME_MAX = 20;

export default function DraftPage() {
  // Runs entirely client-side for now — there's no backend/persistence
  // layer yet, so there's nothing server-authoritative to hand this off
  // to. Per DESIGN_FINAL.md's anti-cheat section, ranked fights will
  // eventually need the server to own the seed and re-derive the draft;
  // this is fine for local/anonymous play but isn't the final trust
  // boundary.
  const rngRef = useRef<RNG | null>(null);

  // Deliberately null until mount: this page is server-rendered for the
  // initial HTML (it's still a "use client" component, which Next.js
  // SSRs before hydrating), and Math.random() run during that SSR pass
  // would produce different candidates than the client's own hydration
  // pass — a textbook hydration mismatch. Generating the random seed
  // only inside useEffect (client-only, post-mount) means the server
  // and the client's first paint both render the same simple loading
  // state, and the real randomized draft appears right after.
  const [state, setState] = useState<DraftSessionState | null>(null);
  const [phase, setPhase] = useState<Phase>("drafting");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [playerSnapshot, setPlayerSnapshot] = useState<FighterSnapshot | null>(null);
  const [opponent, setOpponent] = useState<FighterSnapshot | null>(null);
  const [fightResult, setFightResult] = useState<FightResult | null>(null);
  const [moments, setMoments] = useState<NarratedMoment[]>([]);

  // In-memory only — resets on refresh, by design for now. `history` is
  // every finished fight for the current fighter; a rampage is the slice
  // of it from `rampageStart` on (null when not in a rampage).
  const [history, setHistory] = useState<FightRecord[]>([]);
  const [rampageStart, setRampageStart] = useState<number | null>(null);
  const recordedResultRef = useRef<FightResult | null>(null);
  const rampageFights = rampageStart === null ? [] : history.slice(rampageStart);

  useEffect(() => {
    rngRef.current = createRng(Math.floor(Math.random() * 2 ** 31));
    setState(startDraft(rngRef.current));
  }, []);

  function handlePick(fighterId: number) {
    if (!state) return;
    const next = selectCandidate(state, fighterId, rngRef.current!);
    setState(next);
    if (isDraftComplete(next)) setPhase("naming");
  }

  function handleReroll() {
    if (!state) return;
    setState(reroll(state, rngRef.current!));
  }

  function handleNameSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!state) return;
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setNameError(`Names must be ${NAME_MIN}–${NAME_MAX} characters.`);
      return;
    }
    const id = typeof crypto !== "undefined" ? crypto.randomUUID() : `local-${Date.now()}`;
    setPlayerSnapshot(toFighterSnapshot(state, id, trimmed));
    setPhase("complete");
  }

  function runFight(player: FighterSnapshot, cpu: FighterSnapshot) {
    const result = simulateFight(player, cpu, rngRef.current!);
    setFightResult(result);
    setMoments(
      narrateFight(result.events, { [player.id]: player.name, [cpu.id]: cpu.name })
    );
  }

  function handleFindFight() {
    if (!playerSnapshot) return;
    const cpuId = typeof crypto !== "undefined" ? crypto.randomUUID() : `cpu-${Date.now()}`;
    const takenNames = new Set(rampageFights.map((fight) => fight.opponentName));
    const cpu = generateCpuFighter(
      rngRef.current!,
      cpuId,
      randomCpuName(rngRef.current!, takenNames)
    );
    setOpponent(cpu);
    runFight(playerSnapshot, cpu);
    setPhase("opponentReveal");
  }

  function handleFightComplete() {
    // FightViewer's completion callback can fire more than once across
    // re-renders; recording keyed by the result object keeps each fight
    // in the history exactly once. Recorded here, not when the fight is
    // simulated, so the record on screen never spoils a fight in progress.
    if (fightResult && playerSnapshot && opponent && recordedResultRef.current !== fightResult) {
      recordedResultRef.current = fightResult;
      const record = toFightRecord(fightResult, playerSnapshot.id, opponent.name);
      setHistory((previous) => [...previous, record]);
    }
    setPhase("result");
  }

  function handleStartRampage() {
    setRampageStart(history.length);
    handleFindFight();
  }

  function handleSimulateRest() {
    if (!playerSnapshot) return;
    const remaining = RAMPAGE_LENGTH - rampageFights.length;
    const simulated: FightRecord[] = [];
    const takenNames = new Set(rampageFights.map((fight) => fight.opponentName));
    for (let i = 0; i < remaining; i++) {
      const cpuId = typeof crypto !== "undefined" ? crypto.randomUUID() : `cpu-${Date.now()}-${i}`;
      const cpuName = randomCpuName(rngRef.current!, takenNames);
      takenNames.add(cpuName);
      const cpu = generateCpuFighter(rngRef.current!, cpuId, cpuName);
      const result = simulateFight(playerSnapshot, cpu, rngRef.current!);
      simulated.push(toFightRecord(result, playerSnapshot.id, cpu.name));
    }
    setHistory((previous) => [...previous, ...simulated]);
    setPhase("rampageSummary");
  }

  function handleRematch() {
    if (!playerSnapshot || !opponent) return;
    runFight(playerSnapshot, opponent);
    setPhase("fighting");
  }

  function handleNewFighter() {
    // Full reset — no persistence yet, so "new fighter" just restarts
    // the whole flow from a fresh draft.
    setPlayerSnapshot(null);
    setOpponent(null);
    setFightResult(null);
    setMoments([]);
    setHistory([]);
    setRampageStart(null);
    recordedResultRef.current = null;
    setName("");
    setPhase("drafting");
    setState(startDraft(rngRef.current!));
  }

  if (phase === "naming") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="font-display text-5xl font-black tracking-tight uppercase">
          Name your fighter
        </h1>
        <form onSubmit={handleNameSubmit} className="mt-8" noValidate>
          <input
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="Nightshift"
            maxLength={NAME_MAX}
            className="w-full border border-border bg-surface px-4 py-3 font-display text-2xl tracking-wide text-text uppercase placeholder:text-text-faint placeholder:normal-case focus:border-accent focus:outline-none"
          />
          {nameError && <p className="mt-2 text-sm text-accent">{nameError}</p>}
          <button
            type="submit"
            className="mt-6 w-full bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  if (!state) {
    // Covers the brief window before useEffect generates the random
    // seed on mount — also what the server renders, so the very first
    // client paint matches it exactly (no hydration mismatch).
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="font-mono text-sm text-text-muted">Loading draft…</p>
      </main>
    );
  }

  if (phase === "complete" && playerSnapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <p className="font-mono text-sm tracking-widest text-text-faint uppercase">
          Your fighter is ready
        </p>
        <FighterCard
          name={playerSnapshot.name}
          selections={playerSnapshot.selections}
          record={recordOf(history)}
          overall={computeOverall(playerSnapshot.selections)}
          animateIn
        />
        <button
          onClick={() => {
            setRampageStart(null);
            handleFindFight();
          }}
          className="bg-accent px-8 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
        >
          Find a fight
        </button>
        <button
          onClick={handleStartRampage}
          className="border border-border px-8 py-4 font-display text-lg font-bold tracking-wide text-text uppercase transition-colors hover:border-border-strong"
        >
          Rampage · {RAMPAGE_LENGTH} fights
        </button>
      </main>
    );
  }

  if (phase === "opponentReveal" && playerSnapshot && opponent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-12">
        {rampageStart !== null && (
          <p className="text-center font-mono text-sm tracking-widest text-text-faint uppercase">
            Rampage · Fight {rampageFights.length + 1} of {RAMPAGE_LENGTH}
          </p>
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs tracking-widest text-text-faint uppercase">You</p>
            <FighterCard
              name={playerSnapshot.name}
              selections={playerSnapshot.selections}
              record={recordOf(rampageStart === null ? history : rampageFights)}
              overall={computeOverall(playerSnapshot.selections)}
            />
          </div>
          <div>
            <p className="mb-2 font-mono text-xs tracking-widest text-text-faint uppercase">CPU</p>
            <FighterCard
              name={opponent.name}
              selections={opponent.selections}
              overall={computeOverall(opponent.selections)}
            />
          </div>
        </div>
        <button
          onClick={() => setPhase("fighting")}
          className="mx-auto bg-accent px-10 py-4 font-display text-lg font-bold tracking-wide text-bg uppercase transition-colors hover:bg-accent-hover"
        >
          Fight
        </button>
      </main>
    );
  }

  if (phase === "fighting" && fightResult) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-6 py-10">
        <FightViewer moments={moments} onComplete={handleFightComplete} />
      </main>
    );
  }

  if (phase === "result" && fightResult && playerSnapshot && opponent) {
    return (
      <FightResultScreen
        result={fightResult}
        playerId={playerSnapshot.id}
        playerName={playerSnapshot.name}
        opponentId={opponent.id}
        opponentName={opponent.name}
        record={recordOf(rampageStart === null ? history : rampageFights)}
        rampage={
          rampageStart === null
            ? undefined
            : {
                fightNumber: rampageFights.length,
                total: RAMPAGE_LENGTH,
                onNext: handleFindFight,
                onSimulateRest: handleSimulateRest,
                onFinish: () => setPhase("rampageSummary"),
              }
        }
        onRematch={handleRematch}
        onNewFighter={handleNewFighter}
      />
    );
  }

  if (phase === "rampageSummary" && playerSnapshot) {
    return (
      <RampageSummary
        fighterName={playerSnapshot.name}
        overall={computeOverall(playerSnapshot.selections)}
        fights={rampageFights}
        onRampageAgain={handleStartRampage}
        onNewFighter={handleNewFighter}
      />
    );
  }

  // phase === "drafting"
  const attribute = state.attributeOrder[state.roundIndex]!;
  const candidates = state.currentCandidates!;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-text-muted">
          Round {state.roundIndex + 1} of {state.attributeOrder.length}
        </span>
        <button
          onClick={handleReroll}
          disabled={state.rerollsRemaining === 0}
          className="font-mono text-sm text-text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-text disabled:text-text-faint disabled:no-underline"
        >
          Reroll ({state.rerollsRemaining})
        </button>
      </div>

      <h1 className="mt-6 font-display text-5xl font-black tracking-tight uppercase">
        {ATTRIBUTE_LABELS[attribute]}
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        Choose one fighter&rsquo;s ability. Once picked, they&rsquo;re off the board for
        every other attribute.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {candidates.map((fighter) => (
          <button
            key={fighter.id}
            onClick={() => handlePick(fighter.id)}
            className="flex items-center justify-between border border-border bg-surface px-6 py-5 text-left transition-colors hover:border-accent hover:bg-surface-raised"
          >
            <span className="font-medium text-text">{fighter.name}</span>
            {SHOW_ATTRIBUTE_RATINGS && (
              <span className="font-mono text-3xl font-medium tabular-nums text-text">
                {fighter[attribute].toFixed(1)}
              </span>
            )}
          </button>
        ))}
      </div>
    </main>
  );
}
