import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NFR-1: zero backend.
 *
 * Plaque promises that a guest list never leaves the device. That promise is
 * only as good as the built bundle, so this test reads the actual build output
 * and fails if anything in it points at another origin — a CDN font, an
 * analytics beacon, an API. A comment claiming "no network" is not evidence;
 * this is.
 */

const DIST = "dist";

/**
 * Hosts whose URLs legitimately appear as inert strings: XML namespaces, PDF
 * metadata schemas, and the documentation links libraries print inside error
 * messages. None of them is ever requested.
 *
 * Anything NOT on this list fails the test. That is the point — a font CDN, an
 * analytics beacon or an API host added by a future dependency has to be seen
 * and consciously justified, not quietly shipped.
 */
const ALLOWED_HOSTS = new Set([
  "www.w3.org",
  "ns.adobe.com",
  "www.aiim.org",
  "purl.org",
  "iptc.org",
  // Documentation links inside React and pdf-lib error messages.
  "react.dev",
  "reactjs.org",
  "github.com",
]);

function buildIfNeeded(): void {
  if (existsSync(DIST)) return;
  execSync("npx vite build", { stdio: "pipe" });
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

describe("the built bundle", () => {
  buildIfNeeded();
  const textFiles = filesIn(DIST).filter((f) => /\.(js|css|html)$/.test(f));

  it("produces something to ship", () => {
    expect(textFiles.length).toBeGreaterThan(0);
  });

  it("names no host outside the allowed list", () => {
    const found: string[] = [];
    for (const file of textFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/https?:\/\/([^\s"'`)\\/]+)/g)) {
        const host = match[1]!;
        if (ALLOWED_HOSTS.has(host)) continue;
        found.push(`${file}: ${host}`);
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });

  it("never fetches an absolute URL", () => {
    // The one fetch() in Plaque reads the app's OWN bundled font files by
    // relative URL. An absolute one would mean guest data could reach a server.
    const source = textFiles
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/fetch\(\s*["'`]https?:/);
    expect(source).not.toMatch(/new WebSocket\(/);
    expect(source).not.toMatch(/sendBeacon/);
    expect(source).not.toMatch(/new XMLHttpRequest\(/);
  });

  it("embeds the favicon rather than fetching one", () => {
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    expect(html).toMatch(/rel="icon"\s+href="data:image\/svg\+xml/);
  });

  it("bundles the fonts it needs", () => {
    expect(filesIn(DIST).filter((f) => f.endsWith(".ttf")).length).toBeGreaterThanOrEqual(6);
  });
});
