import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The hard offline gate (F5).
 *
 * Plaque promises a guest list never leaves the device. `src/offline.test.ts`
 * asserts that against the built bundle; this is the same check as a build step,
 * so the promise holds even for someone who ships without running the tests.
 *
 * Run by `npm run build` (postbuild) and by CI.
 */
const DIST = "dist";

/**
 * Hosts whose URLs appear as inert strings: XML namespaces, PDF metadata
 * schemas, and documentation links inside library error messages. Nothing here
 * is ever requested.
 *
 * Anything else fails the build. That is the point — a font CDN or an analytics
 * beacon pulled in by a future dependency has to be seen and justified, not
 * quietly shipped.
 */
const ALLOWED_HOSTS = new Set([
  "www.w3.org",
  "ns.adobe.com",
  "www.aiim.org",
  "purl.org",
  "iptc.org",
  "react.dev",
  "reactjs.org",
  "github.com",
]);

/** Ways a bundle could reach the network, none of which Plaque uses. */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/fetch\(\s*["'`]https?:/, "fetch() of an absolute URL"],
  [/new WebSocket\(/, "WebSocket"],
  [/sendBeacon/, "navigator.sendBeacon"],
  [/new XMLHttpRequest\(/, "XMLHttpRequest"],
  [/new EventSource\(/, "EventSource"],
  [/navigator\.geolocation/, "geolocation"],
];

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

if (!existsSync(DIST)) {
  console.error(`${DIST}/ does not exist — run the build first.`);
  process.exit(1);
}

const failures: string[] = [];
const textFiles = filesIn(DIST).filter((f) => /\.(js|css|html)$/.test(f));

if (textFiles.length === 0) failures.push("the build produced nothing to ship");

for (const file of textFiles) {
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(/https?:\/\/([^\s"'`)\\/]+)/g)) {
    const host = match[1]!;
    if (!ALLOWED_HOSTS.has(host)) failures.push(`${file}: names the host ${host}`);
  }
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(source)) failures.push(`${file}: uses ${what}`);
  }
}

const unique = [...new Set(failures)];
if (unique.length > 0) {
  console.error("Offline gate failed — the bundle could reach the network:\n");
  for (const failure of unique) console.error(`  ${failure}`);
  console.error("\nBuild stopped.");
  process.exit(1);
}

console.log(`offline gate: ${textFiles.length} bundled files, no route off the device.`);
