import type { IconViewBox } from "../../assets/icons";

export type ParsedIcon = { ok: true; d: string; view: IconViewBox } | { ok: false; reason: string };

/**
 * Turns an uploaded SVG into fill-only path data.
 *
 * Basic shapes are converted; anything that cannot become a filled path —
 * embedded bitmaps, live text, `<use>`, gradients, filters — is REJECTED with a
 * reason rather than silently dropped. Half an icon on a place card is worse
 * than a clear "this file will not work".
 */
export function parseSvgIcon(source: string): ParsedIcon {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) return { ok: false, reason: "That file is not valid SVG." };

  const svg = doc.querySelector("svg");
  if (!svg) return { ok: false, reason: "That file has no <svg> element." };

  const unsupported = svg.querySelector("image, text, use, foreignObject, filter, linearGradient, radialGradient, pattern, mask, clipPath");
  if (unsupported) {
    return {
      ok: false,
      reason: `A PDF icon has to be vector outlines, and this file uses <${unsupported.tagName}>. Convert strokes and text to paths, then try again.`,
    };
  }

  const parts: string[] = [];
  for (const node of svg.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line")) {
    const d = toPathData(node);
    if (d) parts.push(d);
  }

  if (parts.length === 0) {
    return { ok: false, reason: "No shapes were found in that file." };
  }

  return { ok: true, d: parts.join(" "), view: viewBoxOf(svg) };
}

function viewBoxOf(svg: Element): IconViewBox {
  const raw = svg.getAttribute("viewBox");
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    const [x, y, w, h] = parts;
    if (parts.length === 4 && [x, y, w, h].every((n) => Number.isFinite(n)) && w! > 0 && h! > 0) {
      return { x: x!, y: y!, w: w!, h: h! };
    }
  }
  // No viewBox: fall back to width/height, then to a sane square.
  const w = Number.parseFloat(svg.getAttribute("width") ?? "");
  const h = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { x: 0, y: 0, w, h };
  return { x: 0, y: 0, w: 24, h: 24 };
}

function toPathData(node: Element): string | null {
  const num = (name: string, fallback = 0) => {
    const value = Number.parseFloat(node.getAttribute(name) ?? "");
    return Number.isFinite(value) ? value : fallback;
  };

  switch (node.tagName.toLowerCase()) {
    case "path":
      return node.getAttribute("d");

    case "rect": {
      const [x, y, w, h] = [num("x"), num("y"), num("width"), num("height")];
      if (w <= 0 || h <= 0) return null;
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }

    case "circle": {
      const [cx, cy, r] = [num("cx"), num("cy"), num("r")];
      return r > 0 ? arcEllipse(cx, cy, r, r) : null;
    }

    case "ellipse": {
      const [cx, cy, rx, ry] = [num("cx"), num("cy"), num("rx"), num("ry")];
      return rx > 0 && ry > 0 ? arcEllipse(cx, cy, rx, ry) : null;
    }

    case "polygon":
    case "polyline": {
      const points = (node.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      if (points.length < 4 || points.some((n) => !Number.isFinite(n))) return null;
      const pairs: string[] = [];
      for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]} ${points[i + 1]}`);
      return `M${pairs.join("L")}Z`;
    }

    case "line":
      // A zero-area shape cannot be filled, and Plaque draws icons filled.
      return null;

    default:
      return null;
  }
}

/** Two half arcs, because a full ellipse cannot be one arc command. */
function arcEllipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}
