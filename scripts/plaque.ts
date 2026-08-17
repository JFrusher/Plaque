/**
 * `plaque build job.plaque.json -o out.pdf` — the same core, headless (F4).
 *
 * One code path with the browser: this reads a project file, runs `buildJob`,
 * and hands the result to the same `renderPdf`. That is what makes a byte-diff
 * against a fixture meaningful — if the CLI had its own pipeline it would only
 * ever prove things about itself.
 *
 * Output is deterministic by default so CI can diff builds; `--dated` restores
 * real timestamps for a PDF meant for a human.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BUNDLED_FONTS } from "../src/assets/fonts";
import { buildJob } from "../src/core/job";
import { makeResolveOptions } from "../src/core/template/resolve";
import { loadFont, type LoadedFont } from "../src/core/text/measure";
import { defaultCard, defaultSheet } from "../src/core/template/defaults";
import { parseProject } from "../src/state/projectFile";
import { renderPdf } from "../src/render/pdf/renderPdf";

interface Options {
  input: string;
  output: string;
  dated: boolean;
  slug: boolean;
}

function parseArgs(argv: string[]): Options | null {
  const [command, ...rest] = argv;
  if (command !== "build" || rest.length === 0) return null;

  const positional = rest.filter((a) => !a.startsWith("-"));
  const input = positional[0];
  if (!input) return null;

  const outFlag = rest.indexOf("-o");
  const output = outFlag >= 0 ? rest[outFlag + 1] : undefined;

  return {
    input,
    output: output ?? input.replace(/\.plaque\.json$/, "").replace(/\.json$/, "") + ".pdf",
    dated: rest.includes("--dated"),
    slug: rest.includes("--slug"),
  };
}

function usage(): never {
  console.error(
    [
      "Usage: plaque build <job.plaque.json> [-o out.pdf] [--slug] [--dated]",
      "",
      "  --slug   print the provenance strip and its 100mm rule on every sheet",
      "  --dated  use the real time rather than a fixed one (output stops being",
      "           byte-reproducible)",
    ].join("\n"),
  );
  process.exit(2);
}

/** Bundled faces only. An uploaded font travels inside the project file. */
function bundledFonts(): Map<string, LoadedFont> {
  return new Map(
    BUNDLED_FONTS.map((f) => [
      f.id,
      loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
    ]),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) usage();

  const parsed = parseProject(readFileSync(options.input, "utf8"));
  if (!parsed.ok) {
    console.error(`${options.input}: ${parsed.reason}`);
    process.exit(1);
  }
  const { project, notes } = parsed;
  for (const note of notes) console.log(`migrated: ${note}`);

  const fonts = bundledFonts();
  for (const font of project.fonts) {
    // Uploaded faces ride inside the file, so a job builds the same on a machine
    // that has never seen them.
    const data = Uint8Array.from(Buffer.from(font.data, "base64"));
    try {
      fonts.set(font.id, loadFont(font.id, font.family, data));
    } catch (e) {
      console.error(`${font.name}: ${e instanceof Error ? e.message : "could not be parsed"}`);
      process.exit(1);
    }
  }

  const images = new Map(
    project.images.map((image) => [
      image.id,
      {
        id: image.id,
        url: "",
        data: Uint8Array.from(Buffer.from(image.data, "base64")),
        mime: image.mime,
        naturalW: image.naturalW,
        naturalH: image.naturalH,
      },
    ]),
  );

  const job = buildJob({
    template: project.template,
    card: { ...defaultCard(), ...project.card },
    sheet: { ...defaultSheet(), ...project.sheet },
    rows: project.rows,
    headers: project.headers,
    ...(project.rowIds ? { rowIds: project.rowIds } : {}),
    resolve: makeResolveOptions(fonts, project.uploadedIcons, images, project.assetNames ?? {}),
  });

  const { bytes, pageCount, notSubset } = await renderPdf({
    sheets: job.sheets,
    fonts,
    title: project.fileName ?? "Plaque",
    deterministic: !options.dated,
    ...(options.slug
      ? { slug: { texts: job.slugTexts, ruleMm: job.slugRuleMm } }
      : {}),
  });

  writeFileSync(options.output, bytes);

  const blocking = job.warnings.filter(
    (w) => w.kind === "missing-font" || w.kind === "missing-image" || w.kind === "missing-glyph",
  );
  for (const warning of blocking.slice(0, 10)) console.error(`warning: ${warning.detail}`);

  console.log(
    `${options.output} — ${job.artefactCount} artefacts, ${pageCount} pages, ` +
      `${Math.round(bytes.byteLength / 1024)}KB, build ${job.buildHash}` +
      (notSubset.length ? ` (not subset: ${notSubset.join(", ")})` : ""),
  );

  // A blocking warning is an exit code, not just a line of output: CI has to be
  // able to fail on a job that would print blanks.
  if (blocking.length > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
