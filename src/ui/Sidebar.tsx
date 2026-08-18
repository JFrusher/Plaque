import { memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePlaque } from "../state/store";
import { Panel } from "./controls";
import { NAV, navCounts } from "./nav";
import styles from "./Sidebar.module.css";

function SidebarInner() {
  // Counts and the selected element's kind, nothing else. These change when the
  // design gains or loses something — not while it is being dragged — so the
  // panels below re-render on the events a person would expect them to.
  const counts = usePlaque(useShallow(navCounts));
  const scroll = useRef<HTMLDivElement>(null);

  // Native <details> already holds open/closed. Setting .open on all of them is
  // less code than mirroring that state in React, and it reaches the level-3
  // groups inside the panels too.
  const setAll = (open: boolean) => {
    for (const d of scroll.current?.querySelectorAll("details") ?? []) d.open = open;
  };

  return (
    <aside className={styles.sidebar} aria-label="Controls">
      <div className={styles.scroll} ref={scroll}>
        {NAV.map((section) => {
          const active = section.items.some((item) => item.active?.(counts));
          return (
            <details
              key={section.id}
              className={active ? `${styles.section} ${styles.sectionActive}` : styles.section}
              open={section.open}
            >
              <summary className={styles.sectionSummary}>
                <span className={styles.sectionIcon}>{section.icon}</span>
                <span className={styles.sectionTitle}>{section.title}</span>
                <span className={styles.sectionChevron} aria-hidden="true">
                  ▸
                </span>
              </summary>
              <div className={styles.sectionBody}>
                {section.items.map(({ id, title, Component, open, badge, active: isActive }) => (
                  <Panel
                    key={id}
                    title={title}
                    open={open}
                    badge={badge?.(counts)}
                    active={isActive?.(counts) ?? false}
                  >
                    <Component />
                  </Panel>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.footerButton} onClick={() => setAll(true)}>
          Expand all
        </button>
        <button type="button" className={styles.footerButton} onClick={() => setAll(false)}>
          Collapse all
        </button>
      </div>
    </aside>
  );
}

/**
 * The sidebar subscribes only to counts, so the whole control column does not
 * re-render every time App does — which, during a drag, is every frame. Each
 * panel subscribes to its own slice of the store and re-renders only when that
 * slice changes.
 */
export const Sidebar = memo(SidebarInner);
