/**
 * Content addressing for uploaded assets.
 *
 * An asset's id is derived from its bytes, which buys two things: the same crest
 * uploaded twice is stored once, and a relink can be *verified* rather than
 * assumed (S-D1.4). SHA-256 comes from the platform — no dependency, and nothing
 * leaves the device.
 */
const SHA_PREFIX = "sha256-";
/** 128 bits of SHA-256. Collision risk is nil at this scale and ids stay readable. */
const HEX_LENGTH = 32;

export type AssetKind = "img" | "user";

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `img:sha256-…` for images, `user:sha256-…` for uploaded fonts. */
export async function assetId(kind: AssetKind, data: Uint8Array): Promise<string> {
  return `${kind}:${SHA_PREFIX}${(await sha256Hex(data)).slice(0, HEX_LENGTH)}`;
}

/**
 * Does this file's content match the id the design is asking for?
 *
 * Ids written before content addressing encoded identity instead: images carried
 * `img:<name>:<byte length>`, fonts carried `user:<name>`. Those are checked on
 * their own terms rather than rejected, because a project from last month is
 * exactly the case relinking exists for.
 */
export async function matchesAssetId(
  id: string,
  file: { name: string; data: Uint8Array },
): Promise<boolean> {
  const colon = id.indexOf(":");
  const kind = colon === -1 ? "" : id.slice(0, colon);
  const rest = colon === -1 ? "" : id.slice(colon + 1);

  if (rest.startsWith(SHA_PREFIX)) {
    return id === (await assetId(kind as AssetKind, file.data));
  }
  if (kind === "img") return id === `img:${file.name}:${file.data.length}`;
  if (kind === "user") return id === `user:${file.name}`;
  return false;
}
