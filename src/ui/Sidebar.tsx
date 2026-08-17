import { memo } from "react";
import { DataPanel } from "./panels/DataPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { FontsPanel } from "./panels/FontsPanel";
import { GeometryPanel } from "./panels/GeometryPanel";
import { GuidesPanel } from "./panels/GuidesPanel";
import { IconRulesPanel } from "./panels/IconRulesPanel";
import { ImagesPanel } from "./panels/ImagesPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import styles from "./Sidebar.module.css";

function SidebarInner() {
  return (
    <aside className={styles.sidebar} aria-label="Controls">
      <DataPanel />
      <GeometryPanel />
      <ElementsPanel />
      <InspectorPanel />
      <IconRulesPanel />
      <ImagesPanel />
      <FontsPanel />
      <GuidesPanel />
    </aside>
  );
}

/**
 * The sidebar takes no props, so memoising it stops the whole control column
 * re-rendering every time App re-renders — which, during a drag, is every frame.
 * Each panel subscribes to its own slice of the store and re-renders only when
 * that slice changes.
 */
export const Sidebar = memo(SidebarInner);
