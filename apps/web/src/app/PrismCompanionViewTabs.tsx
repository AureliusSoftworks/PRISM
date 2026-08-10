"use client";

import {
  requestPrismCompanionView,
  type PrismCompanionView,
} from "./prismCompanionViews.ts";
import styles from "./prism-companion-view-tabs.module.css";

const VIEWS: ReadonlyArray<{
  id: PrismCompanionView;
  label: string;
}> = [
  { id: "synthesis", label: "Synthesis" },
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
];

export function PrismCompanionViewTabs({
  activeView,
  synthesisJobCount = 0,
}: {
  activeView: PrismCompanionView;
  synthesisJobCount?: number;
}): React.JSX.Element {
  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label="Prism view"
      data-prism-view-switcher="true"
    >
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          className={styles.tab}
          data-view={view.id}
          aria-selected={activeView === view.id}
          onClick={() => requestPrismCompanionView(view.id)}
        >
          <span>{view.label}</span>
          {view.id === "synthesis" && synthesisJobCount > 0 ? (
            <span className={styles.count} aria-label={`${synthesisJobCount} active`}>
              {synthesisJobCount > 99 ? "99+" : synthesisJobCount}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
