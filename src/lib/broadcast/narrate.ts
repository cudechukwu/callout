import type { SimulationEvent } from "@/lib/simulation/types";

/** Running count of what one fighter has done so far, for the live
 * scoreboard on the fight screen. */
export interface MomentTally {
  strikes: number;
  takedowns: number;
  submissionAttempts: number;
}

export interface NarratedMoment {
  round: number;
  fightTimeSeconds: number;
  text: string;
  emphasis?: "hurt" | "finish";
  /** Who did it (drives the finish banner colour). */
  actorId: string;
  /** Who the line is about, so the feed colours the right corner: for a
   * stuffed takedown or a defended submission that is the defender. */
  subjectId: string;
  /** Tally per fighter id after this moment. */
  tally: Readonly<Record<string, MomentTally>>;
  /** Set on the moment that ends the fight. */
  finishMethod?: "KO" | "TKO" | "SUB";
}

/**
 * Converts one strikeLanded event's metadata into a description.
 * Template-driven per DESIGN_FINAL.md > Commentary System — no LLM,
 * so this is fast, free, and deterministic (same events always narrate
 * the same way, which matters for replay).
 */
function strikeText(actorName: string, action: unknown, zone: unknown): string {
  const zoneLabel = typeof zone === "string" ? zone : "body";
  switch (action) {
    case "jab":
      return `${actorName} lands a sharp jab.`;
    case "powerShot":
      return `${actorName} connects with a heavy right hand!`;
    case "kick":
      return `${actorName} lands a kick to the ${zoneLabel}.`;
    case "clinchStrike":
      return `${actorName} lands a shot in the clinch.`;
    case "groundStrike":
      return `${actorName} lands ground strikes.`;
    case "bottomStrike":
      return `${actorName} lands a strike from the bottom.`;
    default:
      return `${actorName} lands a strike.`;
  }
}

/**
 * Filters the raw simulation event log (every exchange, including
 * misses and routine non-actions) down to the moments worth narrating,
 * and converts each into commentary text. This is deliberately a light
 * filter, not the full "broadcast director" DESIGN_FINAL.md describes
 * (selecting ~10-18 moments from ~75 raw exchanges) — it keeps
 * everything that actually happened (strikes landing, position
 * changes, finishes) and drops only the purely routine noise
 * (misses, defensive non-actions, stuffed attempts other than
 * takedowns). If fights read as too long in practice, tightening this
 * further is the next step — not guessing at it now.
 */
export function narrateFight(
  events: readonly SimulationEvent[],
  fighterNames: Readonly<Record<string, string>>
): NarratedMoment[] {
  const moments: NarratedMoment[] = [];
  const tally: Record<string, MomentTally> = {};
  for (const id of Object.keys(fighterNames)) {
    tally[id] = { strikes: 0, takedowns: 0, submissionAttempts: 0 };
  }

  for (const event of events) {
    const actorTally = tally[event.actorId];
    if (actorTally) {
      if (event.type === "strikeLanded") actorTally.strikes++;
      else if (event.type === "takedownLanded") actorTally.takedowns++;
      else if (event.type === "submissionAttempt") actorTally.submissionAttempts++;
    }
    const momentsBefore = moments.length;
    const actorName = fighterNames[event.actorId] ?? "Fighter";
    const targetName = fighterNames[event.targetId] ?? "Opponent";
    const base = {
      round: event.round,
      fightTimeSeconds: event.fightTimeSeconds,
      actorId: event.actorId,
      subjectId:
        event.type === "takedownStuffed" || event.type === "submissionDefended"
          ? event.targetId
          : event.actorId,
      tally: Object.fromEntries(
        Object.entries(tally).map(([id, counts]) => [id, { ...counts }])
      ) as Record<string, MomentTally>,
    };

    switch (event.type) {
      case "strikeLanded":
        moments.push({
          ...base,
          text: strikeText(actorName, event.metadata?.action, event.metadata?.zone),
        });
        break;
      case "takedownLanded":
        moments.push({ ...base, text: `${actorName} scores a takedown!` });
        break;
      case "takedownStuffed":
        moments.push({ ...base, text: `${targetName} stuffs the takedown!` });
        break;
      case "submissionAttempt":
        moments.push({ ...base, text: `${actorName} is hunting for a submission!` });
        break;
      case "submissionDefended":
        moments.push({ ...base, text: `${targetName} defends the submission attempt!` });
        break;
      case "submission":
        moments.push({
          ...base,
          text: `${actorName} locks it in — ${targetName} has to tap!`,
          emphasis: "finish",
        });
        break;
      case "knockout":
        moments.push({
          ...base,
          text: `KNOCKOUT! ${actorName} finishes it!`,
          emphasis: "finish",
        });
        break;
      case "tko":
        moments.push({
          ...base,
          text: `${targetName} can\u2019t take any more — the referee steps in!`,
          emphasis: "finish",
        });
        break;
      case "clinchEntrySuccess":
        moments.push({ ...base, text: `${actorName} closes the distance and clinches up.` });
        break;
      case "escapeSuccess":
        moments.push({ ...base, text: `${actorName} scrambles back to their feet!` });
        break;
      case "standUpAttemptSuccess":
        moments.push({ ...base, text: `${actorName} works back up to standing.` });
        break;
      case "allowStandUpSuccess":
        moments.push({ ...base, text: `${actorName} lets ${targetName} back to their feet.` });
        break;
      case "disengageSuccess":
        moments.push({ ...base, text: `${actorName} creates distance.` });
        break;
      default:
        // Routine noise, not narrated: strikeMissed, defensiveMovement,
        // clinchEntryFailed, disengageFailed, escapeFailed,
        // standUpAttemptFailed.
        break;
    }

    if (moments.length > momentsBefore) {
      const moment = moments[moments.length - 1]!;
      if (event.type === "knockout") moment.finishMethod = "KO";
      else if (event.type === "tko") moment.finishMethod = "TKO";
      else if (event.type === "submission") moment.finishMethod = "SUB";
    }
  }

  return moments;
}
