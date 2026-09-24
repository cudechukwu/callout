/**
 * Parses fighter_data.csv into a typed, generated TS module.
 *
 * Run with: npm run seed:fighters
 *
 * Output: src/lib/data/generated/fighters.ts
 *
 * This is a build-time step, not a runtime dependency — the generated file
 * is committed so the app never needs to parse CSV at request time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SourceFighter } from "../src/lib/data/types";

const CSV_PATH = resolve(import.meta.dirname, "../fighter_data.csv");
const OUTPUT_PATH = resolve(
  import.meta.dirname,
  "../src/lib/data/generated/fighters.ts"
);

const CSV_COLUMN_ORDER: Array<keyof Omit<SourceFighter, "id">> = [
  "name",
  "wrestling",
  "submissions",
  "boxing",
  "kickboxing",
  "defense",
  "cardio",
  "power",
  "chin",
  "fightIq",
  "speed",
];

function parseCsv(raw: string): SourceFighter[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // First line is the header (Fighter,Wrestling,Submissions,...) — skip it.
  const dataLines = lines.slice(1);

  const fighters: SourceFighter[] = dataLines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());

    if (cells.length !== CSV_COLUMN_ORDER.length) {
      throw new Error(
        `Row ${index + 2}: expected ${CSV_COLUMN_ORDER.length} columns, got ${cells.length} ("${line}")`
      );
    }

    const record: Partial<SourceFighter> = { id: index + 1 };

    CSV_COLUMN_ORDER.forEach((column, columnIndex) => {
      const cell = cells[columnIndex];
      if (cell === undefined) {
        throw new Error(`Row ${index + 2}: missing value for "${column}"`);
      }
      if (column === "name") {
        record.name = cell;
      } else {
        const value = Number.parseFloat(cell);
        if (Number.isNaN(value)) {
          throw new Error(
            `Row ${index + 2}: "${column}" is not a number ("${cell}")`
          );
        }
        record[column] = value;
      }
    });

    return record as SourceFighter;
  });

  return fighters;
}

function validate(fighters: SourceFighter[]): void {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (const fighter of fighters) {
    if (seenNames.has(fighter.name)) {
      errors.push(`Duplicate fighter name: "${fighter.name}"`);
    }
    seenNames.add(fighter.name);

    for (const column of CSV_COLUMN_ORDER) {
      if (column === "name") continue;
      const value = fighter[column];
      if (value < 1.0 || value > 5.0) {
        errors.push(
          `"${fighter.name}".${column} = ${value} is out of range [1.0, 5.0]`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`CSV validation failed:\n  ${errors.join("\n  ")}`);
  }
}

function main() {
  const raw = readFileSync(CSV_PATH, "utf-8");
  const fighters = parseCsv(raw);
  validate(fighters);

  const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: fighter_data.csv
 * Regenerate with: npm run seed:fighters
 *
 * ${fighters.length} fighters.
 */`;

  const body = `import type { SourceFighter } from "../types";

export const SOURCE_FIGHTERS: SourceFighter[] = ${JSON.stringify(fighters, null, 2)};
`;

  writeFileSync(OUTPUT_PATH, `${banner}\n\n${body}`, "utf-8");

  console.log(`✓ Parsed ${fighters.length} fighters from fighter_data.csv`);
  console.log(`✓ Validation passed (all ratings in [1.0, 5.0], no duplicate names)`);
  console.log(`✓ Wrote ${OUTPUT_PATH}`);
}

main();
