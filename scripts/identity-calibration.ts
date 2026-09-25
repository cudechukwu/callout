/**
 * Freezes the constants behind a fighter's identity (style, trait, best
 * weapon) in src/lib/draft/identity.ts. Drafts a large population of builds
 * across all skill levels and prints the mean and standard deviation of each
 * feature; identity.ts uses those as FIXED numbers, so a build gets the same
 * identity today and in six months regardless of who is playing. Re-run only
 * deliberately (and bump IDENTITY_VERSION) if the draft pool or ratings
 * change materially.
 *
 * Usage: npx tsx scripts/identity-calibration.ts [builds]
 */
import { isAlreadyUsed, isDraftComplete, selectCandidate, startDraft } from "../src/lib/draft/session";
import { buildFullAttributeRatings } from "../src/lib/simulation/derivedStats";
import { createRng } from "../src/lib/simulation/rng";

const N = Number(process.argv[2]) || 30_000;
const rng = createRng(2468);
const KEYS = ["boxing", "kickboxing", "power", "wrestling", "submissions", "cardio", "chin", "fightIq", "defense", "speed"] as const;

const rows: Array<Record<string, number>> = [];
for (let i = 0; i < N; i++) {
  const skill = rng.next();
  let state = startDraft(rng);
  while (!isDraftComplete(state)) {
    const attribute = state.attributeOrder[state.roundIndex]! as keyof typeof state.selections;
    const candidates = state.currentCandidates!.filter((f) => !isAlreadyUsed(state, f.id));
    const best = candidates.reduce((a, b) => ((b as never)[attribute] > (a as never)[attribute] ? b : a));
    const pick = rng.next() < skill ? best : candidates[Math.floor(rng.next() * candidates.length)]!;
    state = selectCandidate(state, pick.id);
  }
  const selections: Record<string, { sourceFighter: unknown }> = {};
  for (const [k, f] of state.selections) selections[k] = { sourceFighter: f };
  const r = buildFullAttributeRatings(selections as never) as unknown as Record<string, number>;
  rows.push({
    ...r,
    striking: (r.boxing! + r.kickboxing! + r.power!) / 3,
    grappling: (r.wrestling! + r.submissions!) / 2,
  });
}

const stats: Record<string, { mean: number; sd: number }> = {};
for (const key of [...KEYS, "striking", "grappling"]) {
  const values = rows.map((row) => row[key]!);
  const mean = values.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  stats[key] = { mean, sd };
}
console.log(`// ${N} drafted builds, seed 2468, draft skill uniform 0-1`);
console.log("const POPULATION: Readonly<Record<Feature, { mean: number; sd: number }>> = {");
for (const [key, { mean, sd }] of Object.entries(stats)) {
  console.log(`  ${key}: { mean: ${mean.toFixed(4)}, sd: ${sd.toFixed(4)} },`);
}
console.log("};");
