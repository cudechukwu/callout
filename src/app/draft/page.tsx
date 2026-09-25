"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { computeYourCalls } from "@/lib/draft/answerSheet";
import { computeOverall } from "@/lib/draft/overall";
import { RAMPAGE_LENGTH, recordOf, toFightRecord, type FightRecord } from "@/lib/rampage";
import { Avatar } from "@/components/Avatar";
import { DraftScreen } from "@/components/DraftScreen";
import { FighterSheet } from "@/components/FighterSheet";
import { FightViewer } from "@/components/FightViewer";
import { FightResultScreen } from "@/components/FightResultScreen";
import { RampageSummary } from "@/components/RampageSummary";
import { RunHud } from "@/components/RunHud";
import { TaleOfTape } from "@/components/TaleOfTape";
import { primaryButton, secondaryButton } from "@/components/ui";
import { isRunActive, setRunActive } from "@/lib/runGuard";

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
/** How long a pick's lock-in animation plays before the next round deals. */
const PICK_LOCK_MS = 480;

export default function DraftPage() {
  // Runs entirely client-side for now — there's no backend/persistence
  // layer yet, so there's nothing server-authoritative to hand this off
  // to. Per DESIGN_FINAL.md's anti-cheat section, ranked fights will
  // eventually need the server to own the seed and re-derive the draft;
  // this is fine for local/anonymous play but isn't the final trust
  // boundary.
  const rngRef = useRef<RNG | null>(null);

  // Deliberately null until mount: this page is server-rendered for the
  // initial HTML, and Math.random() run during that pass would produce
  // different candidates than the client's hydration pass. Generating the
  // seed only inside useEffect keeps the first paint identical on both.
  const [state, setState] = useState<DraftSessionState | null>(null);
  const [phase, setPhase] = useState<Phase>("drafting");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const pickTimer = useRef<number | null>(null);

  const [playerSnapshot, setPlayerSnapshot] = useState<FighterSnapshot | null>(null);
  // The cards shown each round, kept for the reveal's "Your calls".
  const [draftHistory, setDraftHistory] = useState<DraftSessionState["history"]>([]);
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

  const playerOverall = useMemo(
    () => (playerSnapshot ? computeOverall(playerSnapshot.selections) : 0),
    [playerSnapshot]
  );
  const yourCalls = useMemo(() => computeYourCalls(draftHistory), [draftHistory]);
  const opponentOverall = useMemo(
    () => (opponent ? computeOverall(opponent.selections) : 0),
    [opponent]
  );

  // A run counts as in progress once a pick is made or a fight is fought.
  // Leaving then loses the fighter and record (nothing is saved yet), so
  // the top bar and the browser both ask first.
  const runInProgress =
    state !== null && (state.roundIndex > 0 || phase !== "drafting" || history.length > 0);
  useEffect(() => {
    setRunActive(runInProgress);
    if (!runInProgress) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!isRunActive()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [runInProgress]);
  useEffect(() => () => setRunActive(false), []);

  useEffect(() => {
    rngRef.current = createRng(Math.floor(Math.random() * 2 ** 31));
    setState(startDraft(rngRef.current));
    return () => {
      if (pickTimer.current !== null) window.clearTimeout(pickTimer.current);
    };
  }, []);

  function handlePick(fighterId: number) {
    if (!state || pendingId !== null) return;
    setPendingId(fighterId);
    // Let the pick lock in visibly before the next round is dealt. While
    // it plays, further clicks are ignored (see `pendingId` above).
    pickTimer.current = window.setTimeout(() => {
      const next = selectCandidate(state, fighterId, rngRef.current!);
      setState(next);
      setPendingId(null);
      if (isDraftComplete(next)) setPhase("naming");
    }, PICK_LOCK_MS);
  }

  function handleReroll() {
    if (!state || pendingId !== null) return;
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
    setDraftHistory(state.history);
    setPhase("complete");
  }

  function runFight(player: FighterSnapshot, cpu: FighterSnapshot) {
    const result = simulateFight(player, cpu, rngRef.current!);
    setFightResult(result);
    setMoments(narrateFight(result.events, { [player.id]: player.name, [cpu.id]: cpu.name }));
  }

  function handleFindFight() {
    if (!playerSnapshot) return;
    const cpuId = typeof crypto !== "undefined" ? crypto.randomUUID() : `cpu-${Date.now()}`;
    const takenNames = new Set(rampageFights.map((fight) => fight.opponentName));
    const cpu = generateCpuFighter(rngRef.current!, cpuId, randomCpuName(rngRef.current!, takenNames));
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
    setDraftHistory([]);
    setOpponent(null);
    setFightResult(null);
    setMoments([]);
    setHistory([]);
    setRampageStart(null);
    recordedResultRef.current = null;
    setName("");
    setNameError(null);
    setPendingId(null);
    setPhase("drafting");
    setState(startDraft(rngRef.current!));
  }

  if (phase === "naming") {
    return (
      <main className="animate-screen-in mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="animate-rise-in">
          <p className="text-chalk">Draft complete</p>
          <h1 className="mt-1 font-display text-[clamp(1.9rem,6vw,2.75rem)] leading-none font-semibold tracking-[0.07em] uppercase">
            Name your fighter
          </h1>
        </div>
        <Avatar
          name={name.trim() || "Your fighter"}
          corner="red"
          className="cut animate-rise-in mt-6 aspect-[4/3] w-full"
        />
        <form onSubmit={handleNameSubmit} className="mt-6" noValidate>
          <label htmlFor="fighter-name" className="sr-only">
            Fighter name
          </label>
          <input
            id="fighter-name"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="Nightshift"
            maxLength={NAME_MAX}
            aria-describedby={nameError ? "fighter-name-error" : undefined}
            className="cut-sm w-full bg-panel px-4 py-4 font-display text-3xl font-bold tracking-wide text-bone uppercase placeholder:text-chalk-faint placeholder:normal-case focus:bg-panel-raised focus:outline-2 focus:outline-belt-gold"
          />
          {nameError && (
            <p id="fighter-name-error" className="mt-2 text-sm text-corner-red-bright">
              {nameError}
            </p>
          )}
          <button type="submit" className={`${primaryButton} mt-4 w-full`}>
            Reveal my fighter
          </button>
        </form>
      </main>
    );
  }

  if (!state) {
    // Covers the brief window before useEffect generates the random seed
    // on mount — also what the server renders, so the first client paint
    // matches it exactly (no hydration mismatch).
    return (
      <main className="animate-screen-in flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
        <p className="text-chalk">Setting up the draft…</p>
      </main>
    );
  }

  // Everything after the draft shares one run bar, so the run feels
  // continuous: who you are, how strong you are, how it's going.
  const hud =
    playerSnapshot && phase !== "drafting" && phase !== "complete" ? (
      <RunHud
        name={playerSnapshot.name}
        overall={playerOverall}
        record={recordOf(rampageStart === null ? history : rampageFights)}
        rampage={
          rampageStart === null
            ? undefined
            : {
                fights: rampageFights,
                total: RAMPAGE_LENGTH,
                inProgress: phase === "opponentReveal" || phase === "fighting",
              }
        }
      />
    ) : null;

  if (phase === "complete" && playerSnapshot) {
    return (
      <>
        <main className="animate-screen-in mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
          <div>
            <p className="text-chalk">Your fighter is ready</p>
          </div>
          <FighterSheet
            name={playerSnapshot.name}
            selections={playerSnapshot.selections}
            overall={playerOverall}
            calls={yourCalls}
            reveal
          />
          <div
            className="animate-rise-in sticky bottom-0 -mx-4 flex flex-col gap-3 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pt-6 pb-4 sm:flex-row"
            style={{ animationDelay: "1800ms" }}
          >
            <button
              onClick={() => {
                setRampageStart(null);
                handleFindFight();
              }}
              className={`${primaryButton} sm:flex-1`}
            >
              Find a fight
            </button>
            <button onClick={handleStartRampage} className={`${secondaryButton} sm:flex-1`}>
              Rampage: {RAMPAGE_LENGTH} fights
            </button>
          </div>
        </main>
      </>
    );
  }

  if (phase === "opponentReveal" && playerSnapshot && opponent) {
    return (
      <>
        {hud}
        <main className="animate-screen-in mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
          {rampageStart !== null && (
            <p className="text-center text-chalk">
              Fight {rampageFights.length + 1} of {RAMPAGE_LENGTH}
            </p>
          )}
          <TaleOfTape
            player={{
              name: playerSnapshot.name,
              overall: playerOverall,
              selections: playerSnapshot.selections,
              record: recordOf(rampageStart === null ? history : rampageFights),
            }}
            cpu={{ name: opponent.name, overall: opponentOverall, selections: opponent.selections }}
          />
          <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pt-6 pb-4">
            <button onClick={() => setPhase("fighting")} className={`${primaryButton} mx-auto block w-full max-w-sm`}>
              Start fight
            </button>
          </div>
        </main>
      </>
    );
  }

  if (phase === "fighting" && fightResult && playerSnapshot && opponent) {
    return (
      <>
        {hud}
        <FightViewer
          moments={moments}
          playerId={playerSnapshot.id}
          playerName={playerSnapshot.name}
          opponentId={opponent.id}
          opponentName={opponent.name}
          onComplete={handleFightComplete}
        />
      </>
    );
  }

  if (phase === "result" && fightResult && playerSnapshot && opponent) {
    return (
      <>
        {hud}
        <FightResultScreen
          result={fightResult}
          playerId={playerSnapshot.id}
          playerName={playerSnapshot.name}
          opponentId={opponent.id}
          opponentName={opponent.name}
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
          onStartRampage={rampageStart === null ? handleStartRampage : undefined}
          onRematch={handleRematch}
          onNewFighter={handleNewFighter}
        />
      </>
    );
  }

  if (phase === "rampageSummary" && playerSnapshot) {
    return (
      <>
        {hud}
        <RampageSummary
          fighterName={playerSnapshot.name}
          overall={playerOverall}
          fights={rampageFights}
          onRampageAgain={handleStartRampage}
          onNewFighter={handleNewFighter}
        />
      </>
    );
  }

  // phase === "drafting"
  return <DraftScreen state={state} pendingId={pendingId} onPick={handlePick} onReroll={handleReroll} />;
}
