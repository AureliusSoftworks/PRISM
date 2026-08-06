"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import styles from "./prism-blocking-loader.module.css";
import { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat";

export { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat";

export type PrismBlockingLoaderPlacement = "fullscreen" | "docked";

export interface PrismBlockingLoaderProps {
  open: boolean;
  title: string;
  detail: string;
  stepLabel: string;
  progress?: number | null;
  /** ISO timestamp or epoch ms when the operation began — drives the elapsed timer. */
  startedAt?: string | number | null;
  theme?: "light" | "dark";
  /**
   * `fullscreen` hard-blocks the app (invent / head-start bake).
   * `docked` is the soft-wait shell — side card, no inert, companion stays available.
   */
  placement?: PrismBlockingLoaderPlacement;
  /** Overrides the default “PRISM is working” eyebrow. */
  eyebrow?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Confirm dialog title when stopping a hard wait. */
  cancelConfirmTitle?: string;
  /** Confirm dialog body when stopping a hard wait. */
  cancelConfirmDetail?: string;
  footer?: string;
  /** Optional body content under the progress block (e.g. Signal asset rows). */
  children?: ReactNode;
  /** Optional footer actions under the shared footer copy (docked soft waits). */
  footerActions?: ReactNode;
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
  startedAt = null,
  theme = "dark",
  placement = "fullscreen",
  eyebrow = "PRISM is working",
  onCancel,
  cancelLabel = "Cancel operation",
  cancelConfirmTitle = "Stop preparing?",
  cancelConfirmDetail = "Progress so far is kept. You can continue later from where you left off.",
  footer = "Keep this window open while the light takes shape.",
  children,
  footerActions,
}: PrismBlockingLoaderProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepWaitingRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const detailId = useId();
  const confirmTitleId = useId();
  const confirmDetailId = useId();
  const [confirming, setConfirming] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const normalized = normalizedProgress(progress);
  const progressPercent = normalized === null ? null : Math.round(normalized * 100);
  const elapsedLabel =
    startedAt != null && startedAt !== ""
      ? formatBlockingLoaderElapsed(startedAt, nowMs)
      : null;
  const docked = placement === "docked";

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }
    if (docked) return;
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
  }, [docked, open]);

  useEffect(() => {
    if (!open || startedAt == null || startedAt === "") return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open, startedAt]);

  useEffect(() => {
    if (!confirming) return;
    keepWaitingRef.current?.focus({ preventScroll: true });
  }, [confirming]);

  if (!open || typeof document === "undefined") return null;

  const progressStyle = {
    "--prism-blocking-progress": `${progressPercent ?? 38}%`,
  } as CSSProperties;

  const requestCancel = (): void => {
    if (!onCancel) return;
    setConfirming(true);
  };

  const confirmCancel = (): void => {
    setConfirming(false);
    onCancel?.();
  };

  const card = (
    <section
      className={styles.card}
      role="status"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      {onCancel ? (
        <button
          ref={cancelButtonRef}
          type="button"
          className={styles.cancelButton}
          onClick={requestCancel}
          aria-label={cancelLabel}
          title={cancelLabel}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
      <PrismOrb className={styles.prismOrb} />
      <span className={styles.eyebrow}>{eyebrow}</span>
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
          data-indeterminate={progressPercent === null ? "true" : undefined}
          role="progressbar"
          aria-label={stepLabel}
          aria-valuemin={progressPercent === null ? undefined : 0}
          aria-valuemax={progressPercent === null ? undefined : 100}
          aria-valuenow={progressPercent ?? undefined}
        >
          <span className={styles.progressFill} />
        </div>
        {elapsedLabel ? (
          <div className={styles.elapsedRow} aria-live="polite">
            <span>Elapsed</span>
            <strong>{elapsedLabel}</strong>
          </div>
        ) : null}
      </div>
      {children}
      <small>{footer}</small>
      {footerActions ? (
        <div className={styles.footerActions}>{footerActions}</div>
      ) : null}
      {confirming && onCancel ? (
        <div
          className={styles.confirmPanel}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDetailId}
        >
          <strong id={confirmTitleId}>{cancelConfirmTitle}</strong>
          <p id={confirmDetailId}>{cancelConfirmDetail}</p>
          <div className={styles.confirmActions}>
            <button
              ref={keepWaitingRef}
              type="button"
              className={styles.confirmKeep}
              onClick={() => setConfirming(false)}
            >
              Keep waiting
            </button>
            <button
              type="button"
              className={styles.confirmStop}
              onClick={confirmCancel}
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <>
      {docked ? null : (
        <PrismCompanionPresenceBoundary reason="blocking-loader" />
      )}
      {createPortal(
        docked ? (
          <aside
            ref={rootRef}
            className={styles.docked}
            data-prism-blocking-loader="true"
            data-prism-blocking-placement="docked"
            data-theme={theme}
            data-confirming={confirming ? "true" : undefined}
            data-dev-panel-safe-area="bottom"
            aria-busy="true"
            onKeyDown={(event) => {
              if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                if (confirming) setConfirming(false);
                else requestCancel();
              }
            }}
          >
            {card}
          </aside>
        ) : (
          <div
            ref={rootRef}
            className={styles.backdrop}
            data-prism-blocking-loader="true"
            data-prism-blocking-placement="fullscreen"
            data-theme={theme}
            data-confirming={confirming ? "true" : undefined}
            role="dialog"
            aria-modal="true"
            aria-busy="true"
            aria-labelledby={titleId}
            aria-describedby={detailId}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (confirming) {
                  setConfirming(false);
                } else if (onCancel) {
                  requestCancel();
                }
              } else if (event.key === "Tab" && !confirming) {
                event.preventDefault();
                (cancelButtonRef.current ?? rootRef.current)?.focus({
                  preventScroll: true,
                });
              }
            }}
          >
            {card}
          </div>
        ),
        document.body,
      )}
    </>
  );
}
