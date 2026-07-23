"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import styles from "./prism-blocking-loader.module.css";

export interface PrismBlockingLoaderProps {
  open: boolean;
  title: string;
  detail: string;
  stepLabel: string;
  progress?: number | null;
  theme?: "light" | "dark";
  onCancel?: () => void;
  cancelLabel?: string;
  footer?: string;
}

function normalizedProgress(progress: number | null | undefined): number | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress));
}

export function PrismBlockingLoader({
  open,
  title,
  detail,
  stepLabel,
  progress = null,
  theme = "dark",
  onCancel,
  cancelLabel = "Cancel operation",
  footer = "Keep this window open while the light takes shape.",
}: PrismBlockingLoaderProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const detailId = useId();
  const normalized = normalizedProgress(progress);
  const progressPercent = normalized === null ? null : Math.round(normalized * 100);

  useEffect(() => {
    if (!open) return;
    const overlay = rootRef.current;
    if (!overlay) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblingStates = Array.from(document.body.children)
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay,
      )
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblingStates.forEach(({ element }) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay.focus({ preventScroll: true });

    return () => {
      siblingStates.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const progressStyle = {
    "--prism-blocking-progress": `${progressPercent ?? 38}%`,
  } as CSSProperties;

  return (
    <>
      <PrismCompanionPresenceBoundary reason="blocking-loader" />
      {createPortal(
        <div
          ref={rootRef}
          className={styles.backdrop}
          data-prism-blocking-loader="true"
          data-theme={theme}
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-labelledby={titleId}
          aria-describedby={detailId}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel?.();
            } else if (event.key === "Tab") {
              event.preventDefault();
              (cancelButtonRef.current ?? rootRef.current)?.focus({
                preventScroll: true,
              });
            }
          }}
        >
          <section className={styles.card} role="status" aria-live="polite">
            {onCancel ? (
              <button
                ref={cancelButtonRef}
                type="button"
                className={styles.cancelButton}
                onClick={onCancel}
                aria-label={cancelLabel}
                title={cancelLabel}
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
            <PrismOrb className={styles.prismOrb} />
            <span className={styles.eyebrow}>PRISM is working</span>
            <h2 id={titleId}>{title}</h2>
            <p id={detailId}>{detail}</p>
            <div className={styles.progressBlock} style={progressStyle}>
              <div className={styles.progressMeta}>
                <span>{stepLabel}</span>
                <strong>
                  {progressPercent === null ? "Working" : `${progressPercent}%`}
                </strong>
              </div>
              <div
                className={styles.progressTrack}
                data-indeterminate={
                  progressPercent === null ? "true" : undefined
                }
                role="progressbar"
                aria-label={stepLabel}
                aria-valuemin={progressPercent === null ? undefined : 0}
                aria-valuemax={progressPercent === null ? undefined : 100}
                aria-valuenow={progressPercent ?? undefined}
              >
                <span className={styles.progressFill} />
              </div>
            </div>
            <small>{footer}</small>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
