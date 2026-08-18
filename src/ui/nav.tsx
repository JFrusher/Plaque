import type { ComponentType, ReactNode } from "react";
import type { CardElement } from "../core/types";
import type { PlaqueState } from "../state/store";
import { DataPanel } from "./panels/DataPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { FontsPanel } from "./panels/FontsPanel";
import { CardPanel, SheetPanel } from "./panels/GeometryPanel";
import { GuidesPanel } from "./panels/GuidesPanel";
import { IconRulesPanel } from "./panels/IconRulesPanel";
import { ImagesPanel } from "./panels/ImagesPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { PrintSetupPanel } from "./panels/PrintSetupPanel";

/**
 * The sidebar's information architecture, as data.
 *
 * Three levels, and each one is a different kind of thing:
 *
 *   1. NavSection — a domain of the job. Guest list in, card and sheet decided,
 *      design made, print proved. Collapsible, and the only level with an icon.
 *   2. NavItem — a module view inside a domain. This is what a panel is.
 *   3. SubGroup (in ui/controls) — field groups inside a panel, declared where
 *      the fields are because that is the only place their conditions are known.
 *
 * There is no router in Plaque — every panel edits the one document on screen —
 * so an item names a component rather than a route.
 */

/** Everything the sidebar chrome needs from the store, and nothing else. */
export interface NavCounts {
  rows: number;
  elements: number;
  icons: number;
  images: number;
  fonts: number;
  printers: number;
  selectedKind: CardElement["kind"] | null;
}

/**
 * Primitive counts only. The selector runs on every store write — including
 * every frame of a drag — so it must be cheap, and it must return values that
 * compare equal when nothing the chrome shows has changed.
 */
export function navCounts(s: PlaqueState): NavCounts {
  const elements = s.template.elements;
  return {
    rows: s.rows.length,
    elements: elements.length,
    icons: elements.reduce((n, el) => (el.kind === "icon" ? n + 1 : n), 0),
    images: s.images.size,
    fonts: s.fonts.size,
    printers: s.printers.length,
    selectedKind: elements.find((el) => el.id === s.selectedId)?.kind ?? null,
  };
}

export interface NavItem {
  id: string;
  title: string;
  Component: ComponentType;
  /** Level-2 disclosure state on load. */
  open: boolean;
  /** Right-aligned counter. Null hides it; 0 would print, so return null. */
  badge?: (c: NavCounts) => number | string | null;
  /** True when this panel is about whatever is selected on the card. */
  active?: (c: NavCounts) => boolean;
}

export interface NavSection {
  id: string;
  title: string;
  icon: ReactNode;
  /** Level-1 disclosure state on load. */
  open: boolean;
  items: NavItem[];
}

const stroke = {
  width: 1.5,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden="true"
      fill={stroke.fill}
      stroke={stroke.stroke}
      strokeWidth={stroke.width}
      strokeLinecap={stroke.strokeLinecap}
      strokeLinejoin={stroke.strokeLinejoin}
    >
      {children}
    </svg>
  );
}

export const NAV: NavSection[] = [
  {
    id: "data",
    title: "Guest list",
    open: true,
    icon: (
      <Icon>
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <path d="M1.75 6.25h12.5M6.25 6.25v7" />
      </Icon>
    ),
    items: [
      {
        id: "data",
        title: "Guest list",
        Component: DataPanel,
        open: true,
        badge: (c) => (c.rows > 0 ? c.rows : null),
      },
    ],
  },
  {
    id: "format",
    title: "Format",
    open: true,
    icon: (
      <Icon>
        <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" />
        <path d="M8 3.75v8.5" />
      </Icon>
    ),
    items: [
      { id: "card", title: "Card", Component: CardPanel, open: true },
      { id: "sheet", title: "Sheet", Component: SheetPanel, open: true },
    ],
  },
  {
    id: "design",
    title: "Design",
    open: true,
    icon: (
      <Icon>
        <path d="M2.5 10.5 10 3a1.8 1.8 0 0 1 2.5 2.5L5 13l-3 .5z" />
      </Icon>
    ),
    items: [
      {
        id: "elements",
        title: "Elements",
        Component: ElementsPanel,
        open: true,
        badge: (c) => (c.elements > 0 ? c.elements : null),
      },
      {
        id: "inspector",
        title: "Selected element",
        Component: InspectorPanel,
        open: true,
        active: (c) => c.selectedKind !== null,
      },
      {
        id: "icons",
        title: "Icon rules",
        Component: IconRulesPanel,
        open: false,
        badge: (c) => (c.icons > 0 ? c.icons : null),
        active: (c) => c.selectedKind === "icon",
      },
      {
        id: "images",
        title: "Images",
        Component: ImagesPanel,
        open: false,
        badge: (c) => (c.images > 0 ? c.images : null),
        active: (c) => c.selectedKind === "image",
      },
      {
        id: "fonts",
        title: "Fonts",
        Component: FontsPanel,
        open: false,
        badge: (c) => c.fonts,
      },
    ],
  },
  {
    id: "output",
    title: "Output",
    open: false,
    icon: (
      <Icon>
        <path d="M4.75 6.25V2.75h6.5v3.5" />
        <rect x="1.75" y="6.25" width="12.5" height="5" rx="1.5" />
        <path d="M4.75 9.25h6.5v4h-6.5z" />
      </Icon>
    ),
    items: [
      { id: "guides", title: "Guides and background", Component: GuidesPanel, open: false },
      {
        id: "print",
        title: "Print setup",
        Component: PrintSetupPanel,
        open: false,
        badge: (c) => (c.printers > 0 ? c.printers : null),
      },
    ],
  },
];
