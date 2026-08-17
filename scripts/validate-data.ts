import cardPacks from "../src/data/card-presets.json";
import stockPacks from "../src/data/stock-presets.json";
import { validateCardPreset } from "../src/core/data/cardPresets";
import { validatePreset as validateStockPreset } from "../src/core/data/stockPresets";

/**
 * The build gate for contributed data (F1, S-B.3).
 *
 * "A malformed preset fails the build with the offending file and field named."
 * The app itself skips a bad entry rather than crashing on someone else's typo;
 * this is what stops that typo from ever shipping.
 *
 * Run by `npm run build` via the `prebuild` script, and by CI.
 */
type Check = { file: string; entries: unknown[]; validate: (value: unknown) => string | null };

const CHECKS: Check[] = [
  {
    file: "src/data/card-presets.json",
    entries: cardPacks.presets as unknown[],
    validate: validateCardPreset,
  },
  {
    file: "src/data/stock-presets.json",
    entries: stockPacks.presets as unknown[],
    validate: validateStockPreset,
  },
];

let failures = 0;

for (const check of CHECKS) {
  const seen = new Set<string>();
  for (const [index, entry] of check.entries.entries()) {
    const bad = check.validate(entry);
    const id = (entry as { id?: unknown }).id;
    const where = typeof id === "string" && id ? `"${id}"` : `entry ${index}`;

    if (bad) {
      console.error(`${check.file}: ${where} has an invalid "${bad}".`);
      failures++;
      continue;
    }
    // Two entries with the same id would show as two identical picker rows,
    // and only one of them would ever be selectable.
    if (typeof id === "string") {
      if (seen.has(id)) {
        console.error(`${check.file}: duplicate id "${id}".`);
        failures++;
      }
      seen.add(id);
    }
  }
  console.log(`${check.file}: ${check.entries.length} entries checked.`);
}

if (failures > 0) {
  console.error(`\n${failures} invalid ${failures === 1 ? "entry" : "entries"}. Build stopped.`);
  process.exit(1);
}
