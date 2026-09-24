/**
 * Controlled per-attribute check: does putting one attribute at 5.0
 * (everything else neutral 3.0) beat the neutral fighter? Two variants:
 *
 *  - pinned:  hidden speed/defense held at 3.0, so only the attribute's
 *             direct effect on the engine is measured.
 *  - realistic: the boosted pick also carries hidden speed/defense of 5.0
 *             (as a real elite fighter's row would), so the attribute's
 *             indirect route through hidden composites is included.
 *
 * Unlike the OVR regression (a prediction tool, confounded by correlated
 * predictors), this isolates one variable at a time. Usage:
 *   npx tsx scripts/attribute-sweep.ts [iterations]
 */
import { VISIBLE_ATTRIBUTES } from "../src/lib/data/types";
import { buildArchetypeSnapshot, NEUTRAL_B } from "../src/lib/simulation/balanceFixtures";
import { runMatchupStudy } from "../src/lib/simulation/harness";

const iterations = Number(process.argv[2]) || 20_000;
const uniform3 = Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, 3])) as Record<
  (typeof VISIBLE_ATTRIBUTES)[number],
  number
>;

console.log(`One attribute 3.0 -> 5.0 vs all-3.0 neutral, ${iterations.toLocaleString()} fights each\n`);
console.log("attribute     pinned-hidden win%   realistic-hidden win%");
for (const attribute of VISIBLE_ATTRIBUTES) {
  const values = { ...uniform3, [attribute]: 5 };
  const pinned = buildArchetypeSnapshot("p", `p-${attribute}`, values, 3);
  const realistic = buildArchetypeSnapshot("r", `r-${attribute}`, values, 3, {
    [attribute]: { speed: 5, defense: 5 },
  });
  const a = runMatchupStudy(attribute, pinned, NEUTRAL_B, iterations);
  const b = runMatchupStudy(attribute, realistic, NEUTRAL_B, iterations);
  const pct = (r: typeof a) => ((100 * r.fighterAWins) / iterations).toFixed(1).padStart(5);
  console.log(`${attribute.padEnd(13)} ${pct(a).padStart(10)}%          ${pct(b).padStart(10)}%`);
}
