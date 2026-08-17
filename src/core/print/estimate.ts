/**
 * A rough PDF size, without building one (S-D2.5).
 *
 * The preflight has to state a number before the user commits, and building 19
 * sheets to find out would defeat the point of asking first.
 *
 * ponytail: a crude linear model — fixed overhead, subsetted fonts, image bytes
 * verbatim, a flat cost per page. It is within about 30% in practice, which is
 * enough to answer "is this 2MB or 40MB". Upgrade path if that stops being
 * enough: build the document, then report the real length.
 */
export interface EstimateInput {
  pageCount: number;
  /** Byte length of each font that will be embedded. */
  fontBytes: number[];
  /** Byte length of each distinct image drawn. */
  imageBytes: number[];
  /** Text elements per card × cards, i.e. how many draw operations there are. */
  textDraws: number;
}

const DOC_OVERHEAD_BYTES = 2_000;
const PAGE_OVERHEAD_BYTES = 900;
/** Subsetting a face to the glyphs a guest list uses keeps roughly this share. */
const SUBSET_SHARE = 0.35;
/** Compressed content-stream cost of one drawn line of text. */
const TEXT_DRAW_BYTES = 45;

export function estimatePdfBytes(input: EstimateInput): number {
  const fonts = input.fontBytes.reduce((sum, n) => sum + n * SUBSET_SHARE, 0);
  const images = input.imageBytes.reduce((sum, n) => sum + n, 0);
  return Math.round(
    DOC_OVERHEAD_BYTES +
      fonts +
      images +
      input.pageCount * PAGE_OVERHEAD_BYTES +
      input.textDraws * TEXT_DRAW_BYTES,
  );
}

/** "1.4 MB". Deliberately coarse — it is an estimate and should read like one. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
