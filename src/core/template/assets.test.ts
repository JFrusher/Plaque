import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_ID } from "../../assets/fonts";
import type { ImageElement, Template, TextElement } from "../types";
import { missingAssets } from "./assets";

const text = (over: Partial<TextElement> = {}): TextElement => ({
  id: "t1",
  kind: "text",
  x: 0,
  y: 0,
  w: 40,
  h: 10,
  z: 1,
  template: "{{Name}}",
  fontId: DEFAULT_FONT_ID,
  fontSizePt: 14,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#000000",
  letterSpacingMm: 0,
  fit: { mode: "shrink", minFontSizePt: 8, maxLines: 2, anchor: "align" },
  ...over,
});

const image = (over: Partial<ImageElement> = {}): ImageElement => ({
  id: "i1",
  kind: "image",
  x: 0,
  y: 0,
  w: 20,
  h: 20,
  z: 2,
  imageId: "img:sha256-abc",
  fit: "contain",
  opacity: 1,
  ...over,
});

const template = (elements: Template["elements"]): Template => ({ elements, backgroundHex: null });

const nothing = () => false;
const everything = () => true;

describe("missingAssets", () => {
  it("finds nothing when every asset is present", () => {
    expect(missingAssets(template([text(), image()]), everything, everything)).toEqual([]);
  });

  it("names a missing image by the id the design still references", () => {
    const found = missingAssets(template([image()]), nothing, everything);
    expect(found).toEqual([{ id: "img:sha256-abc", kind: "image", elementIds: ["i1"] }]);
  });

  it("treats a bundled font as present even before it has loaded", () => {
    // Fonts load asynchronously; reporting them missing on the first frame would
    // block export on a race.
    expect(missingAssets(template([text()]), everything, nothing)).toEqual([]);
  });

  it("reports an uploaded font that is no longer on this device", () => {
    const found = missingAssets(template([text({ fontId: "user:Bespoke.ttf" })]), everything, nothing);
    expect(found).toEqual([{ id: "user:Bespoke.ttf", kind: "font", elementIds: ["t1"] }]);
  });

  it("groups every element affected by one missing asset", () => {
    const found = missingAssets(
      template([image(), image({ id: "i2" }), text({ fontId: "user:x" })]),
      nothing,
      nothing,
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ kind: "image", elementIds: ["i1", "i2"] });
    expect(found[1]).toMatchObject({ kind: "font", elementIds: ["t1"] });
  });

  it("ignores an image element with no image chosen yet", () => {
    expect(missingAssets(template([image({ imageId: null })]), nothing, nothing)).toEqual([]);
  });
});
