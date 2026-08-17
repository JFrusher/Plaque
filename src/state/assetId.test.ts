import { describe, expect, it } from "vitest";
import { assetId, matchesAssetId, sha256Hex } from "./assetId";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("sha256Hex", () => {
  it("matches the published digest of an empty input", () => {
    // Guards against a swapped algorithm or a byte-order slip in the hex step.
    return expect(sha256Hex(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("assetId", () => {
  it("gives identical content the same id, so one crest is stored once", async () => {
    expect(await assetId("img", bytes(1, 2, 3))).toBe(await assetId("img", bytes(1, 2, 3)));
  });

  it("separates images from fonts, and content from content", async () => {
    expect(await assetId("img", bytes(1))).not.toBe(await assetId("user", bytes(1)));
    expect(await assetId("img", bytes(1))).not.toBe(await assetId("img", bytes(2)));
  });
});

describe("matchesAssetId", () => {
  it("accepts the same bytes under any filename", async () => {
    const id = await assetId("img", bytes(9, 9, 9));
    expect(await matchesAssetId(id, { name: "moved-crest.png", data: bytes(9, 9, 9) })).toBe(true);
  });

  it("rejects different bytes under the right filename", async () => {
    const id = await assetId("img", bytes(9, 9, 9));
    expect(await matchesAssetId(id, { name: "crest.png", data: bytes(9, 9, 8) })).toBe(false);
  });

  it("verifies pre-hash image ids on their own terms", async () => {
    expect(await matchesAssetId("img:crest.png:3", { name: "crest.png", data: bytes(1, 2, 3) })).toBe(
      true,
    );
    expect(await matchesAssetId("img:crest.png:3", { name: "crest.png", data: bytes(1, 2) })).toBe(
      false,
    );
  });

  it("verifies pre-hash font ids by filename, which is all they recorded", async () => {
    expect(await matchesAssetId("user:Bespoke.ttf", { name: "Bespoke.ttf", data: bytes(1) })).toBe(
      true,
    );
    expect(await matchesAssetId("user:Bespoke.ttf", { name: "Other.ttf", data: bytes(1) })).toBe(
      false,
    );
  });

  it("refuses an id it cannot interpret rather than guessing", async () => {
    expect(await matchesAssetId("nonsense", { name: "a", data: bytes(1) })).toBe(false);
  });
});
