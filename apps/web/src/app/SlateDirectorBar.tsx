"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SlateDirectorScope } from "./slateManuscriptDocument";
import { slateDirectorWordTarget } from "./slateManuscriptDocument";
import styles from "./slateDirectorBar.module.css";

interface SlateDirectorBarProps {
  direction: string;
  scope: SlateDirectorScope;
  targetLabel: string;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  unstickDisabled?: boolean;
  onDirectionChange: (value: string) => void;
  onScopeChange: (scope: SlateDirectorScope) => void;
  onRun: () => void;
  onUnstick: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

export function SlateDirectorBar({
  direction,
  scope,
  targetLabel,
  actionLabel,
  busy,
  disabled,
  unstickDisabled = false,
  onDirectionChange,
  onScopeChange,
  onRun,
  onUnstick,
  onKeyDown,
}: SlateDirectorBarProps): React.JSX.Element {
  return (
    <section
      className={styles.bar}
      data-tutorial-target="slate-direction"
      aria-label="Director bar"
    >
      <div className={styles.scope}>
        <span>Scope</span>
        <div role="group" aria-label="Direction scope">
          {(["beat", "passage", "scene"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-active={scope === candidate ? "true" : undefined}
              aria-pressed={scope === candidate}
              onClick={() => onScopeChange(candidate)}
            >
              {candidate[0]?.toUpperCase()}
              {candidate.slice(1)}
            </button>
          ))}
        </div>
        <small>≈ {slateDirectorWordTarget(scope)} words</small>
      </div>
      <label className={styles.direction}>
        <span>
          Direct Slate
          <small>{targetLabel}</small>
        </span>
        <textarea
          value={direction}
          rows={2}
          placeholder="Tell Slate what should happen, change, or feel different…"
          onChange={(event) => onDirectionChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.unstick}
          disabled={unstickDisabled}
          onClick={onUnstick}
        >
          Unstick me
        </button>
        <button
          type="button"
          className={styles.run}
          data-tutorial-target="slate-draft"
          disabled={disabled || busy}
          onClick={onRun}
        >
          {busy ? "Slate is working…" : actionLabel}
        </button>
        <small>⌘ Enter</small>
      </div>
    </section>
  );
}
