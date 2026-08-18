import { centreOf } from "../../core/geometry/transform";
import { fitIcon } from "../../core/template/iconFit";
import { fitImage } from "../../core/template/imageFit";
import { layoutLines } from "../../core/text/layout";
import type { LoadedFont } from "../../core/text/measure";
import type { ResolvedElement } from "../../core/types";
import { ptToMm } from "../../core/units";

export interface ElementViewProps {
  element: ResolvedElement;
  fonts: Map<string, LoadedFont>;
}

/**
 * Renders one resolved element in millimetre user units.
 *
 * This component makes no layout decisions. Sizes, line breaks and baselines
 * all arrive already decided by core/, which is what keeps the preview and the
 * PDF in agreement.
 */
export function ElementView({ element: el, fonts }: ElementViewProps) {
  const centre = centreOf({ x: el.x, y: el.y, w: el.w, h: el.h });
  const spin =
    el.rotationDeg === 0 ? undefined : `rotate(${el.rotationDeg} ${centre.x} ${centre.y})`;

  return <g transform={spin}>{renderBody(el, fonts)}</g>;
}

function renderBody(el: ResolvedElement, fonts: Map<string, LoadedFont>) {
  switch (el.kind) {
    case "text": {
      const font = fonts.get(el.fontId);
      if (!font || el.lines.length === 0) return null;
      const lines = layoutLines(font, {
        lines: el.lines,
        fontSizePt: el.fontSizePt,
        lineHeight: el.lineHeight,
        align: el.align,
        vAlign: el.vAlign,
        anchor: el.anchor,
        letterSpacingMm: el.letterSpacingMm,
        w: el.w,
        h: el.h,
        ...(el.optical ? { optical: el.optical } : {}),
      });
      return (
        <text
          fill={el.colorHex}
          fontFamily={`"${font.family}"`}
          fontSize={ptToMm(el.fontSizePt)}
          {...(el.letterSpacingMm ? { letterSpacing: el.letterSpacingMm } : {})}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={el.x + line.baseline.x} y={el.y + line.baseline.y}>
              {line.text}
            </tspan>
          ))}
        </text>
      );
    }

    case "icon": {
      if (!el.pathD) return null;
      const fit = fitIcon({ x: el.x, y: el.y, w: el.w, h: el.h }, el.view);
      return (
        <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.scale}) translate(${-el.view.x} ${-el.view.y})`}>
          <path d={el.pathD} fill={el.colorHex} />
          {el.cutD && <path d={el.cutD} fill={el.cutHex} />}
        </g>
      );
    }

    case "image": {
      // A named placeholder, never a blank space: the user has to be able to see
      // which file went missing without hunting for it (S-D1.4).
      if (el.missingName) {
        return (
          <g>
            <rect
              x={el.x}
              y={el.y}
              width={el.w}
              height={el.h}
              fill="none"
              stroke="#b3261e"
              strokeWidth={0.3}
              strokeDasharray="1.5 1.5"
            />
            {/* Left-aligned, and deliberately not text-anchored: handing any
                placement to the browser is the invariant this file must not
                break, even for an error label. */}
            <text x={el.x + 1} y={el.y + el.h / 2} fill="#b3261e" fontSize={Math.min(3, el.h / 3)}>
              {el.missingName} missing
            </text>
          </g>
        );
      }
      if (!el.image) return null;
      // The same fitter the PDF uses, so what is on screen is what prints —
      // and `contain` goes through the icon fitter inside it, so an image and
      // an icon in identical boxes still land in identical places.
      const box = { x: el.x, y: el.y, w: el.w, h: el.h };
      const placed = fitImage(
        box,
        { w: el.image.naturalW, h: el.image.naturalH },
        {
          fit: el.fit,
          ...(el.zoom === undefined ? {} : { zoom: el.zoom }),
          ...(el.focusX === undefined ? {} : { focusX: el.focusX }),
          ...(el.focusY === undefined ? {} : { focusY: el.focusY }),
        },
      );
      const art = (
        <image
          href={el.image.url}
          x={placed.x}
          y={placed.y}
          width={placed.drawnW}
          height={placed.drawnH}
          opacity={el.opacity}
          preserveAspectRatio="none"
        />
      );
      if (!placed.clip) return art;
      const clipId = `crop-${el.id}`;
      return (
        <g>
          <clipPath id={clipId}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>{art}</g>
        </g>
      );
    }

    case "rect":
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill={el.fillHex ?? "none"}
          stroke={el.strokeHex ?? "none"}
          strokeWidth={el.strokeWidthMm}
          {...(el.dashed ? { strokeDasharray: `${el.strokeWidthMm * 3} ${el.strokeWidthMm * 3}` } : {})}
        />
      );

    case "line": {
      // Matches the PDF renderer: a line runs along the longer axis of its box.
      const horizontal = el.w >= el.h;
      const [x1, y1, x2, y2] = horizontal
        ? [el.x, el.y + el.h / 2, el.x + el.w, el.y + el.h / 2]
        : [el.x + el.w / 2, el.y, el.x + el.w / 2, el.y + el.h];
      return (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={el.strokeHex}
          strokeWidth={el.strokeWidthMm}
          {...(el.dashed ? { strokeDasharray: `${el.strokeWidthMm * 3} ${el.strokeWidthMm * 3}` } : {})}
        />
      );
    }
  }
}
