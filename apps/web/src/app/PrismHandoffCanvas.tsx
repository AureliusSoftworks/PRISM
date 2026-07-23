"use client";

import { useEffect, useRef, useState } from "react";
import type { SlateHandoffPreview } from "@localai/shared";
import styles from "./prismHandoffCanvas.module.css";

interface SlateProjectChoice {
  id: string;
  title: string;
}

interface PrismHandoffCanvasProps {
  handoff: SlateHandoffPreview;
  projects: SlateProjectChoice[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCommit: (input: {
    target: "new_project" | "existing_project" | "zen";
    projectId?: string;
    title?: string;
  }) => void | Promise<void>;
}

export default function PrismHandoffCanvas({
  handoff,
  projects,
  busy,
  error,
  onCancel,
  onCommit,
}: PrismHandoffCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<"new_project" | "existing_project">(
    "new_project",
  );
  const [title, setTitle] = useState("From Zen");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const toSlate = handoff.direction === "zen-to-slate";
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    if (!toSlate) canvasRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !canvasRef.current) return;
      const focusable = Array.from(
        canvasRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        canvasRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [toSlate]);

  const selectedProjectId = projectId || projects[0]?.id || "";
  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prism-handoff-title"
      aria-describedby="prism-handoff-boundary"
      tabIndex={-1}
    >
      <div className={styles.light} aria-hidden="true" />
      <div className={styles.orb} aria-hidden="true">
        <span>△</span>
      </div>
      <section className={styles.preview}>
        <p className={styles.eyebrow}>Exact source preview</p>
        <h2 id="prism-handoff-title">
          {toSlate ? "Carry this into Slate?" : "Discuss this in Zen?"}
        </h2>
        <p className={styles.sourceLabel}>{handoff.sourceLabel}</p>
        <blockquote>{handoff.sourceText}</blockquote>
        <p id="prism-handoff-boundary" className={styles.boundary}>
          Only this selection will cross surfaces. The surrounding conversation,
          manuscript, Continuity, and memories stay where they are.
        </p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>

      {toSlate ? (
        <section className={styles.choices} aria-label="Choose Slate destination">
          <button
            type="button"
            className={styles.choice}
            data-selected={target === "new_project" ? "true" : undefined}
            onClick={() => setTarget("new_project")}
          >
            <strong>New project</strong>
            <span>Use the selection as an editable creative spark.</span>
          </button>
          <button
            type="button"
            className={styles.choice}
            data-selected={target === "existing_project" ? "true" : undefined}
            disabled={projects.length === 0}
            onClick={() => setTarget("existing_project")}
          >
            <strong>Add to project</strong>
            <span>Attach a source card without changing manuscript prose.</span>
          </button>
          {target === "new_project" ? (
            <label className={styles.field}>
              <span>Project title</span>
              <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} autoFocus />
            </label>
          ) : (
            <label className={styles.field}>
              <span>Project</span>
              <select value={selectedProjectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
            </label>
          )}
          <footer>
            <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || (target === "new_project" ? !title.trim() : !selectedProjectId)}
              onClick={() => void onCommit(
                target === "new_project"
                  ? { target, title: title.trim() }
                  : { target, projectId: selectedProjectId },
              )}
            >
              {busy ? "Transferring…" : target === "new_project" ? "Create in Slate" : "Add to Slate"}
            </button>
          </footer>
        </section>
      ) : (
        <section className={styles.choices}>
          <div className={styles.zenChoice}>
            <strong>Open Zen with this excerpt staged</strong>
            <span>Nothing is sent to a bot until you choose Send.</span>
          </div>
          <footer>
            <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void onCommit({ target: "zen" })}>
              {busy ? "Preparing…" : "Open Zen"}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
