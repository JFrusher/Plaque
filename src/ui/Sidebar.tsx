import { DataPanel } from "./panels/DataPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { FontsPanel } from "./panels/FontsPanel";
import { GeometryPanel } from "./panels/GeometryPanel";
import { GuidesPanel } from "./panels/GuidesPanel";
import { IconRulesPanel } from "./panels/IconRulesPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Controls">
      <DataPanel />
      <GeometryPanel />
      <ElementsPanel />
      <InspectorPanel />
      <IconRulesPanel />
      <FontsPanel />
      <GuidesPanel />
    </aside>
  );
}
