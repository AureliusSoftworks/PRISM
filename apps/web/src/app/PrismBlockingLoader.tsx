"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PrismOrb } from "./PrismOrb";
import { requestPrismCompanionView } from "./prismCompanionViews.ts";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import styles from "./prism-blocking-loader.module.css";
import {
  formatBlockingLoaderElapsed,
  refractionEtaLabel,
  REFRACTION_CANCEL_WARNING,
  blockingLoaderCancelAction,
  blockingLoaderFocusIndex,
} from "./prismBlockingLoaderFormat";
import { beginPrismFullscreenBlockingAudioMute } from "./prismFullscreenBlockingAudio.ts";
import {
  animatePrismOrbHandoff,
  companionDockRectFromNormalizedPosition,
  queryPrismCompanionAvatar,
  queryPrismLoaderOrbSlot,
} from "./prismOrbHandoff.ts";
import {
  setPrismSoftSynthesisExpanded,
  usePrismSoftSynthesisUi,
} from "./prismSoftSynthesisUi.ts";
import {
  clampPrismCompanionPosition,
  type PrismCompanionPosition,
} from "./prismCompanionPhysics.ts";
import {
  getPrismCompanionVisualServerSnapshot,
  getPrismCompanionVisualSnapshot,
  subscribePrismCompanionVisualSnapshot,
} from "./prismCompanionVisualSnapshot.ts";

export { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat";

export type PrismBlockingLoaderPlacement = "fullscreen" | "docked";

interface PrismBlockingLoaderBaseProps {
  open: boolean;
  title: string;
  detail: string;
  stepLabel: string;
  progress?: number | null;
  /** ISO timestamp or epoch ms when the operation began — drives the elapsed timer. */
  startedAt?: string | number | null;
  /** Measured comparable successes, never animation progress. */
  estimatedDurationMs?: number | null;
  operationId?: string | number;
  theme?: "light" | "dark";
  /**
   * `fullscreen` hard-blocks the app (invent / head-start bake).
   * `docked` is the soft-wait shell — anchored around Prism; starts minimized via soft UI store.
   */
  /** Overrides the default “PRISM is working” eyebrow. */
  eyebrow?: string;
  cancelLabel?: string;
  /** Confirm dialog title when stopping a hard wait. */
  cancelConfirmTitle?: string;
  /** Confirm dialog body when stopping a hard wait. */
  cancelConfirmDetail?: string;
  footer?: string;
  /** Optional body content under the progress block (e.g. mixed Active/Queued lists). */
  children?: ReactNode;
  /** Active (in-flight) jobs — shown under an Active heading when provided. */
  activeChildren?: ReactNode;
  /** Queued jobs — shown under a Queued heading when provided. */
  queuedChildren?: ReactNode;
  /** Optional footer actions under the shared footer copy (docked soft waits). */
  footerActions?: ReactNode;
  /**
   * Render inside this element instead of `document.body`. A modal `<dialog>`
   * lives in the top layer, so a body-level overlay would sit beneath it; the
   * loader must be hosted inside that dialog to cover the viewport above it.
   */
  portalTarget?: Element | null;
}

/** Fullscreen callers must deliberately distinguish refraction from saved preparation. */
export type PrismBlockingLoaderProps = PrismBlockingLoaderBaseProps & (
  | { placement: "docked"; operation?: never; onCancel?: () => void }
  | { placement?: "fullscreen"; operation: "refraction"; onCancel: () => void }
  | { placement?: "fullscreen"; operation: "preparation"; onCancel?: () => void }
);

function normalizedProgress(progress: number | null | undefined): number | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress));
}

function softDockPositionStyle(position: PrismCompanionPosition): CSSProperties {
  return {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    right: "auto",
    bottom: "auto",
  };
}

export function PrismBlockingLoader({
  open,
  title,
  detail,
  stepLabel,
  progress = null,
  startedAt = null,
  estimatedDurationMs,
  operationId,
  theme,
  placement = "fullscreen",
  operation,
  eyebrow = "PRISM is working",
  onCancel,
  cancelLabel = "Cancel operation",
  cancelConfirmTitle,
  cancelConfirmDetail,
  footer = "Keep this window open while the light takes shape.",
  children,
  activeChildren,
  queuedChildren,
  footerActions,
  portalTarget = null,
}: PrismBlockingLoaderProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepWaitingRef = useRef<HTMLButtonElement | null>(null);
  const confirmPanelRef = useRef<HTMLDivElement | null>(null);
  const orbSlotRef = useRef<HTMLSpanElement | null>(null);
  const titleId = useId();
  const detailId = useId();
  const confirmTitleId = useId();
  const confirmDetailId = useId();
  const softUi = usePrismSoftSynthesisUi();
  const companionVisual = useSyncExternalStore(
    subscribePrismCompanionVisualSnapshot,
    getPrismCompanionVisualSnapshot,
    getPrismCompanionVisualServerSnapshot,
  );
  const [confirming, setConfirming] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hardCompanionSuppressed, setHardCompanionSuppressed] = useState(false);
  const [loaderOrbVisible, setLoaderOrbVisible] = useState(false);
  const hardRestorePositionRef = useRef<PrismCompanionPosition | null>(null);
  const normalized = normalizedProgress(progress);
  const progressPercent = normalized === null ? null : Math.round(normalized * 100);
  const elapsedLabel =
    startedAt != null && startedAt !== ""
      ? formatBlockingLoaderElapsed(startedAt, nowMs)
      : null;
  const docked = placement === "docked";
  const refraction = !docked && operation === "refraction";
  const confirmationTitle = cancelConfirmTitle ?? (refraction ? "Cancel this refraction?" : "Stop preparing?");
  // The regeneration warning cannot be silently replaced with checkpoint copy.
  const confirmationDetail = refraction
    ? [REFRACTION_CANCEL_WARNING, cancelConfirmDetail].filter(Boolean).join(" ")
    : cancelConfirmDetail ?? "Progress so far is kept. You can continue later from where you left off.";
  const etaLabel = refraction ? refractionEtaLabel(startedAt, estimatedDurationMs, nowMs) : null;
  const showPortal = open && (!docked || softUi.expanded);

  useLayoutEffect(() => {
    if (!open) {
      setConfirming(false);
      setHardCompanionSuppressed(false);
      setLoaderOrbVisible(false);
      return;
    }
    if (docked) return;
    if (!showPortal) return;
    const overlay = rootRef.current;
    if (!overlay) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblingStates = Array.from(document.body.children)
      // A host that contains the overlay (a top-layer dialog) must stay live,
      // or the loader inside it would inherit `inert` and lose its cancel focus.
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay && !element.contains(overlay),
      )
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblingStates.forEach(({ element }) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (cancelButtonRef.current ?? overlay).focus({ preventScroll: true });

    return () => {
      siblingStates.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [docked, open, showPortal]);

  // Capture the opener in the modal lifetime above before moving focus. A
  // replacement run resets its confirmation without replacing that opener.
  useLayoutEffect(() => {
    setConfirming(false);
    if (open) cancelButtonRef.current?.focus({ preventScroll: true });
  }, [open, operation, operationId]);

  useEffect(() => {
    if (!open || startedAt == null || startedAt === "") return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open, startedAt]);

  // Fullscreen hard waits mute avatar thinking / SFX under the overlay.
  useEffect(() => {
    if (!open || docked) return;
    return beginPrismFullscreenBlockingAudioMute();
  }, [docked, open]);

  useEffect(() => {
    if (!confirming) return;
    keepWaitingRef.current?.focus({ preventScroll: true });
  }, [confirming]);

  // Hard open: fly companion orb into the loader slot, then suppress companion.
  useLayoutEffect(() => {
    if (!open || docked || !showPortal) return;
    let cancelled = false;
    setHardCompanionSuppressed(false);
    setLoaderOrbVisible(false);

    const run = async (): Promise<void> => {
      const companion = queryPrismCompanionAvatar();
      if (companion) {
        const companionPos = companion.getBoundingClientRect();
        hardRestorePositionRef.current = clampPrismCompanionPosition({
          x: (companionPos.left + companionPos.width / 2) / window.innerWidth,
          y: (companionPos.top + companionPos.height / 2) / window.innerHeight,
        });
      }
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      if (cancelled) return;
      const slot =
        orbSlotRef.current ??
        queryPrismLoaderOrbSlot(rootRef.current) ??
        queryPrismLoaderOrbSlot();
      await animatePrismOrbHandoff({
        from: companion,
        to: slot,
      });
      if (cancelled) return;
      setLoaderOrbVisible(true);
      setHardCompanionSuppressed(true);
    };
    void run();

    return () => {
      cancelled = true;
      const restore = hardRestorePositionRef.current;
      const slot =
        orbSlotRef.current ??
        queryPrismLoaderOrbSlot(rootRef.current) ??
        queryPrismLoaderOrbSlot();
      if (restore) {
        void animatePrismOrbHandoff({
          from: slot,
          to: companionDockRectFromNormalizedPosition(restore),
        });
      }
      setHardCompanionSuppressed(false);
      setLoaderOrbVisible(false);
    };
  }, [docked, open, showPortal]);

  if (!open || typeof document === "undefined") return null;
  if (docked && !softUi.expanded) return null;

  const progressStyle = {
    "--prism-blocking-progress": `${progressPercent ?? 38}%`,
  } as CSSProperties;

  const requestCancel = (): void => {
    if (!onCancel) return;
    setConfirming(blockingLoaderCancelAction(confirming, "request").confirming);
  };

  const confirmCancel = (): void => {
    const action = blockingLoaderCancelAction(confirming, "confirm");
    setConfirming(false);
    if (action.cancel) onCancel?.();
  };

  const keepWaiting = (): void => {
    setConfirming(false);
    cancelButtonRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (confirming) keepWaiting();
      else if (onCancel) requestCancel();
      else if (docked) minimizeSoft();
    } else if (event.key === "Tab" && (!docked || confirming)) {
      const scope = confirming ? confirmPanelRef.current : rootRef.current;
      const buttons = Array.from(scope?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ) ?? []).filter((element) => element.tabIndex >= 0 && !element.closest("[inert]"));
      event.preventDefault();
      event.stopPropagation();
      const index = blockingLoaderFocusIndex(buttons.indexOf(document.activeElement as HTMLElement), buttons.length, event.shiftKey);
      (buttons[index] ?? rootRef.current)?.focus({ preventScroll: true });
    }
  };

  const minimizeSoft = (): void => {
    if (!docked || confirming) return;
    setPrismSoftSynthesisExpanded(false);
  };

  const jobSections =
    activeChildren != null || queuedChildren != null ? (
      <div className={styles.jobSections}>
        {activeChildren ? (
          <div className={styles.jobSection} data-job-section="active">
            <span className={styles.jobSectionLabel}>Active</span>
            {activeChildren}
          </div>
        ) : null}
        {queuedChildren ? (
          <div className={styles.jobSection} data-job-section="queued">
            <span className={styles.jobSectionLabel}>Queued</span>
            {queuedChildren}
          </div>
        ) : null}
      </div>
    ) : (
      children
    );

  const card = (
    <section
      className={styles.card}
      role="status"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      {docked ? (
        <button
          type="button"
          className={styles.chatReturn}
          onClick={() => requestPrismCompanionView("chat")}
        >
          Return to Prism chat
        </button>
      ) : null}
      {onCancel ? (
        <button
          ref={cancelButtonRef}
          type="button"
          className={styles.cancelButton}
          onClick={requestCancel}
          aria-label={cancelLabel}
          title={cancelLabel}
          data-prism-refraction-cancel={refraction ? "true" : undefined}
          tabIndex={confirming ? -1 : 0}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
      <span
        ref={orbSlotRef}
        className={styles.prismOrbSlot}
        data-prism-blocking-orb-slot="true"
        data-orb-visible={!docked && loaderOrbVisible ? "true" : undefined}
      >
        {!docked && loaderOrbVisible ? (
          <PrismOrb className={styles.prismOrb} />
        ) : null}
      </span>
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
        {etaLabel ? (
          <div className={styles.elapsedRow} data-prism-refraction-eta="true">
            <span>{etaLabel}</span>
          </div>
        ) : null}
      </div>
      {jobSections}
      <small>{footer}</small>
      {footerActions ? (
        <div className={styles.footerActions}>{footerActions}</div>
      ) : null}
      {confirming && onCancel ? (
        <div
          ref={confirmPanelRef}
          className={styles.confirmPanel}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDetailId}
        >
          <strong id={confirmTitleId}>{confirmationTitle}</strong>
          <p id={confirmDetailId}>{confirmationDetail}</p>
          <div className={styles.confirmActions}>
            <button
              ref={keepWaitingRef}
              type="button"
              className={styles.confirmKeep}
              onClick={keepWaiting}
            >
              Keep waiting
            </button>
            <button
              type="button"
              className={styles.confirmStop}
              onClick={confirmCancel}
            >
              {refraction ? "Cancel refraction" : docked ? "Cancel" : "Stop"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <>
      {!docked && hardCompanionSuppressed ? (
        <PrismCompanionPresenceBoundary reason="blocking-loader" />
      ) : null}
      {createPortal(
        docked ? (
          <>
            <button
              type="button"
              className={styles.softDismiss}
              aria-label="Minimize soft synthesis"
              onClick={minimizeSoft}
            />
            <aside
              ref={rootRef}
              className={styles.docked}
              data-prism-blocking-loader="true"
              data-prism-blocking-placement="docked"
              data-prism-soft-orb-anchored="true"
              data-theme={theme}
              data-dock={
                companionVisual.position.x < 0.34
                  ? "left"
                  : companionVisual.position.x > 0.66
                    ? "right"
                    : "center"
              }
              data-vertical={
                companionVisual.position.y < 0.5 ? "below" : "above"
              }
              data-confirming={confirming ? "true" : undefined}
              data-viewport-safe-area="bottom"
              aria-busy="true"
              style={softDockPositionStyle(companionVisual.position)}
              onKeyDown={handleKeyDown}
            >
              {card}
            </aside>
          </>
        ) : (
          <div
            ref={rootRef}
            className={styles.backdrop}
            data-prism-blocking-loader="true"
            data-prism-blocking-placement="fullscreen"
            data-prism-blocking-operation={operation}
            data-theme={theme}
            data-confirming={confirming ? "true" : undefined}
            role="dialog"
            aria-modal="true"
            aria-busy={!confirming}
            aria-labelledby={titleId}
            aria-describedby={detailId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            {card}
          </div>
        ),
        portalTarget ?? document.body,
      )}
    </>
  );
}
