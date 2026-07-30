"use client";

import { useMemo, useState } from "react";
import type {
  SlateProjectSummary,
  SlateSectionSummary,
  SlateStructureItem,
} from "@localai/shared";
import styles from "./slateStoryMap.module.css";

interface SlateStoryMapRow {
  item: SlateStructureItem;
  section: SlateSectionSummary | null;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

interface SlateStoryMapProps {
  title: string;
  projectId: string;
  projects: readonly SlateProjectSummary[];
  items: readonly SlateStructureItem[];
  sections: readonly SlateSectionSummary[];
  selectedId: string | null;
  busy: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenProjects: () => void;
  onOpenProject: (projectId: string) => void;
  onSelect: (item: SlateStructureItem) => void;
  onShape: () => void;
  onAddScene: () => void;
  onMutate: (itemId: string, patch: Partial<SlateStructureItem>) => void;
  onSave: () => void;
  onMove: (itemId: string, direction: -1 | 1) => void;
  onRemove: (itemId: string) => void;
}

function inferredDepth(
  item: SlateStructureItem,
  previousKinds: readonly SlateStructureItem["kind"][],
): number {
  if (item.kind === "act") return 0;
  if (item.kind === "chapter") {
    return previousKinds.includes("act") ? 1 : 0;
  }
  if (previousKinds.includes("chapter")) return 2;
  return previousKinds.includes("act") ? 1 : 0;
}

export function slateStoryMapRows(
  items: readonly SlateStructureItem[],
  sections: readonly SlateSectionSummary[],
): SlateStoryMapRow[] {
  const sectionByStructureId = new Map(
    sections
      .filter((section) => section.structureItemId)
      .map((section) => [section.structureItemId as string, section]),
  );
  const structureIdBySectionId = new Map(
    sections
      .filter((section) => section.structureItemId)
      .map((section) => [section.id, section.structureItemId as string]),
  );
  const rows = items.map((item, index) => {
    const section = sectionByStructureId.get(item.id) ?? null;
    const parentId = section?.parentSectionId
      ? (structureIdBySectionId.get(section.parentSectionId) ?? null)
      : null;
    let depth = 0;
    if (parentId) {
      const parentIndex = items.findIndex((candidate) => candidate.id === parentId);
      if (parentIndex >= 0) {
        const parent = items[parentIndex];
        depth = parent?.kind === "chapter" ? 2 : 1;
      }
    } else {
      depth = inferredDepth(
        item,
        items.slice(0, index).map((candidate) => candidate.kind),
      );
    }
    return {
      item,
      section,
      depth,
      parentId,
      hasChildren: false,
    };
  });
  return rows.map((row, index) => ({
    ...row,
    hasChildren: rows
      .slice(index + 1)
      .some(
        (candidate) =>
          candidate.parentId === row.item.id ||
          (candidate.depth > row.depth &&
            !rows
              .slice(index + 1, rows.indexOf(candidate))
              .some((between) => between.depth <= row.depth)),
      ),
  }));
}

export function SlateStoryMap({
  title,
  projectId,
  projects,
  items,
  sections,
  selectedId,
  busy,
  collapsed,
  onToggleCollapsed,
  onOpenProjects,
  onOpenProject,
  onSelect,
  onShape,
  onAddScene,
  onMutate,
  onSave,
  onMove,
  onRemove,
}: SlateStoryMapProps): React.JSX.Element {
  const [foldedIds, setFoldedIds] = useState<Set<string>>(() => new Set());
  const rows = useMemo(
    () => slateStoryMapRows(items, sections),
    [items, sections],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    const foldedDepths: number[] = [];
    rows.forEach((row) => {
      while (
        foldedDepths.length > 0 &&
        row.depth <= (foldedDepths.at(-1) ?? -1)
      ) {
        foldedDepths.pop();
      }
      if (foldedDepths.length > 0) hidden.add(row.item.id);
      if (foldedIds.has(row.item.id)) foldedDepths.push(row.depth);
    });
    return hidden;
  }, [foldedIds, rows]);

  if (collapsed) {
    return (
      <aside
        className={styles.collapsedRail}
        data-tutorial-target="slate-structure"
      >
        <button
          type="button"
          aria-label="Open Story Map"
          title="Open Story Map"
          onClick={onToggleCollapsed}
        >
          <span aria-hidden="true">☷</span>
          <strong>Story Map</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.rail} data-tutorial-target="slate-structure">
      <header className={styles.header}>
        <div>
          <p>Story Map</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Collapse Story Map"
          title="Collapse Story Map"
          onClick={onToggleCollapsed}
        >
          ‹
        </button>
      </header>

      <div className={styles.projectControls}>
        <select
          aria-label="Open Slate project"
          value={projectId}
          onChange={(event) => onOpenProject(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={onOpenProjects}>
          Projects
        </button>
      </div>

      <button
        type="button"
        className={styles.shape}
        data-tutorial-target="slate-shape"
        disabled={busy}
        onClick={onShape}
      >
        {items.length > 0 ? "Reshape plan" : "Shape with Slate"}
      </button>

      <nav className={styles.tree} aria-label="Story Map">
        {rows.map((row, index) =>
          hiddenIds.has(row.item.id) ? null : (
            <div
              key={row.item.id}
              className={styles.row}
              data-selected={row.item.id === selectedId ? "true" : undefined}
              data-depth={row.depth}
              style={{ "--story-depth": row.depth } as React.CSSProperties}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  className={styles.fold}
                  aria-label={`${foldedIds.has(row.item.id) ? "Expand" : "Collapse"} ${row.item.title}`}
                  aria-expanded={!foldedIds.has(row.item.id)}
                  onClick={() =>
                    setFoldedIds((current) => {
                      const next = new Set(current);
                      if (next.has(row.item.id)) next.delete(row.item.id);
                      else next.add(row.item.id);
                      return next;
                    })
                  }
                >
                  {foldedIds.has(row.item.id) ? "›" : "⌄"}
                </button>
              ) : (
                <span className={styles.leaf} aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                className={styles.rowMain}
                onClick={() => onSelect(row.item)}
              >
                <span>{row.item.kind}</span>
                <strong>{row.item.title}</strong>
                <small>
                  {row.item.status}
                  {row.section?.proseLength
                    ? ` · ${row.section.proseLength.toLocaleString()} chars`
                    : ""}
                </small>
              </button>
              {row.item.locked ? (
                <span className={styles.locked} title="Locked">
                  ◆
                </span>
              ) : null}
              <span className={styles.sequence}>{index + 1}</span>
            </div>
          ),
        )}
      </nav>

      <button type="button" className={styles.add} onClick={onAddScene}>
        + Add scene
      </button>

      {selected ? (
        <section className={styles.selectedEditor} aria-label="Selected story beat">
          <div>
            <span>{selected.kind}</span>
            <div>
              <button
                type="button"
                disabled={busy || items[0]?.id === selected.id}
                aria-label={`Move ${selected.title} up`}
                onClick={() => onMove(selected.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || items.at(-1)?.id === selected.id}
                aria-label={`Move ${selected.title} down`}
                onClick={() => onMove(selected.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={
                  selected.locked
                    ? `Unlock ${selected.title}`
                    : `Lock ${selected.title}`
                }
                onClick={() =>
                  onMutate(selected.id, { locked: !selected.locked })
                }
                onBlur={onSave}
              >
                {selected.locked ? "◆" : "◇"}
              </button>
            </div>
          </div>
          <input
            value={selected.title}
            aria-label="Structure item title"
            onChange={(event) =>
              onMutate(selected.id, { title: event.target.value })
            }
            onBlur={onSave}
          />
          <textarea
            value={selected.summary}
            aria-label={`${selected.title} summary`}
            rows={3}
            onChange={(event) =>
              onMutate(selected.id, { summary: event.target.value })
            }
            onBlur={onSave}
          />
          <textarea
            value={selected.direction}
            aria-label={`${selected.title} direction`}
            placeholder="Direction for this section"
            rows={2}
            onChange={(event) =>
              onMutate(selected.id, { direction: event.target.value })
            }
            onBlur={onSave}
          />
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(selected.id)}
          >
            Remove from map
          </button>
        </section>
      ) : null}
    </aside>
  );
}
