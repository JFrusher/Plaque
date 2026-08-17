import { describe, expect, it } from "vitest";
import { defaultCard, defaultSheet, defaultTemplate } from "../core/template/defaults";
import {
  PROJECT_FORMAT,
  buildProject,
  fromBase64,
  parseProject,
  projectFileName,
  toBase64,
} from "./projectFile";

const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);

const project = () =>
  buildProject({
    card: defaultCard(),
    sheet: defaultSheet(),
    template: defaultTemplate(["First Name", "Last Name"]),
    headers: ["First Name", "Last Name"],
    rows: [{ "First Name": "Charis", "Last Name": "Smith" }],
    csvIssues: [],
    fileName: "guests.csv",
    uploadedIcons: { crest: "0 0 24 24|M0 0H24V24Z" },
    snapEnabled: true,
    fonts: [{ id: "user:a", family: "A", fileName: "a.ttf", data: bytes }],
    images: [
      { id: "img:b", name: "b.png", mime: "image/png", data: bytes, naturalW: 2, naturalH: 1 },
    ],
  });

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
  });

  it("handles a payload past the argument-spread limit", () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(() => toBase64(big)).not.toThrow();
    expect(fromBase64(toBase64(big)).length).toBe(big.length);
  });

  it("round-trips an empty buffer", () => {
    expect(fromBase64(toBase64(new Uint8Array())).length).toBe(0);
  });
});

describe("buildProject", () => {
  it("stamps the format so a stray JSON file is not mistaken for one", () => {
    expect(project().format).toBe(PROJECT_FORMAT);
    expect(project().version).toBe(1);
  });

  it("carries uploaded fonts and images inside the file", () => {
    const p = project();
    expect(p.fonts[0]).toMatchObject({ id: "user:a", family: "A", name: "a.ttf" });
    expect(p.images[0]).toMatchObject({ id: "img:b", mime: "image/png", naturalW: 2 });
    expect([...fromBase64(p.fonts[0]!.data)]).toEqual([...bytes]);
    expect([...fromBase64(p.images[0]!.data)]).toEqual([...bytes]);
  });

  it("carries the guest list and the design", () => {
    const p = project();
    expect(p.rows).toHaveLength(1);
    expect(p.template.elements.length).toBeGreaterThan(0);
    expect(p.uploadedIcons["crest"]).toBeDefined();
  });
});

describe("parseProject", () => {
  it("round-trips a project it built", () => {
    const result = parseProject(JSON.stringify(project()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.rows).toEqual(project().rows);
    expect(result.project.fonts).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(parseProject("{nope")).toMatchObject({ ok: false });
  });

  it("rejects a JSON file that is not a Plaque project", () => {
    const r = parseProject(JSON.stringify({ hello: "world" }));
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/not a Plaque project/);
  });

  it("rejects a project from another version rather than half-applying it", () => {
    const r = parseProject(JSON.stringify({ ...project(), version: 99 }));
    expect(r.ok === false && r.reason).toMatch(/different version/);
  });

  it("rejects a project missing its design or guest list", () => {
    const { card: _c, ...noCard } = project();
    expect(parseProject(JSON.stringify(noCard))).toMatchObject({ ok: false });
    expect(parseProject(JSON.stringify({ ...project(), rows: null }))).toMatchObject({ ok: false });
    expect(
      parseProject(JSON.stringify({ ...project(), template: { backgroundHex: null } })),
    ).toMatchObject({ ok: false });
  });

  it("tolerates a project saved before it had assets", () => {
    const { fonts: _f, images: _i, ...older } = project();
    const r = parseProject(JSON.stringify(older));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.fonts).toEqual([]);
    expect(r.project.images).toEqual([]);
  });
});

describe("projectFileName", () => {
  it("names the project after the guest list", () => {
    expect(projectFileName("guests-150.csv")).toBe("guests-150.plaque.json");
  });

  it("falls back when there is no guest list", () => {
    expect(projectFileName(null)).toBe("place-cards.plaque.json");
    expect(projectFileName(".csv")).toBe("place-cards.plaque.json");
  });
});
