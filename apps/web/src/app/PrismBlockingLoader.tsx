"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import styles from "./prism-blocking-loader.module.css";
import { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat";
import { beginPrismFullscreenBlockingAudioMute } from "./prismFullscreenBlockingAudio.ts";
import {
  animatePrismOrbHandoff,
  companionDockRectFromNormalizedPosition,
  queryPrismCompanionAvatar,
  queryPrismLoaderOrbSlot,
} from "./prismOrbHandoff.ts";
import {
  setPrismSoftSynthesisExpanded,
  setPrismSoftSynthesisHandoffBusy,
  setPrismSoftSynthesisLodged,
  setPrismSoftSynthesisPosition,
  usePrismSoftSynthesisUi,
} from "./prismSoftSynthesisUi.ts";
import {
  clampPrismCompanionPosition,
  type PrismCompanionPosition,
} from "./prismCompanionPhysics.ts";

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
   * `docked` is the soft-wait shell — relocatable card; starts minimized via soft UI store.
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
  /** Optional body content under the progress block (e.g. mixed Active/Queued lists). */
  children?: ReactNode;
  /** Active (in-flight) jobs — shown under an Active heading when provided. */
  activeChildren?: ReactNode;
  /** Queued jobs — shown under a Queued heading when provided. */
  queuedChildren?: ReactNode;
  /** Optional footer actions under the shared footer copy (docked soft waits). */
  footerActions?: ReactNode;
}

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
    transform: "translate(-50%, -50%)",
  };
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
  activeChildren,
  queuedChildren,
  footerActions,
}: PrismBlockingLoaderProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepWaitingRef = useRef<HTMLButtonElement | null>(null);
  const orbSlotRef = useRef<HTMLSpanElement | null>(null);
  const titleId = useId();
  const detailId = useId();
  const confirmTitleId = useId();
  const confirmDetailId = useId();
  const softUi = usePrismSoftSynthesisUi();
  const [confirming, setConfirming] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hardCompanionSuppressed, setHardCompanionSuppressed] = useState(false);
  const [loaderOrbVisible, setLoaderOrbVisible] = useState(false);
  const [draggingCard, setDraggingCard] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PrismCompanionPosition;
    moved: boolean;
  } | null>(null);
  const hardRestorePositionRef = useRef<PrismCompanionPosition | null>(null);
  const softExpandGenerationRef = useRef(0);
  const softPositionRef = useRef(softUi.position);
  softPositionRef.current = softUi.position;
  const normalized = normalizedProgress(progress);
  const progressPercent = normalized === null ? null : Math.round(normalized * 100);
  const elapsedLabel =
    startedAt != null && startedAt !== ""
      ? formatBlockingLoaderElapsed(startedAt, nowMs)
      : null;
  const docked = placement === "docked";
  const showPortal = open && (!docked || softUi.expanded);

  useEffect(() => {
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
  }, [docked, open, showPortal]);

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
    setPrismSoftSynthesisHandoffBusy(true);

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
      setPrismSoftSynthesisHandoffBusy(false);
    };
    void run();

    return () => {
      cancelled = true;
      setPrismSoftSynthesisHandoffBusy(false);
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

  // Soft expand: fly companion into the soft card orb slot and lodge.
  useLayoutEffect(() => {
    if (!open || !docked || !softUi.expanded) return;
    const generation = ++softExpandGenerationRef.current;
    setLoaderOrbVisible(false);
    setPrismSoftSynthesisHandoffBusy(true);
    setPrismSoftSynthesisLodged(false);

    const run = async (): Promise<void> => {
      const companion = queryPrismCompanionAvatar();
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      if (generation !== softExpandGenerationRef.current) return;
      const slot =
        orbSlotRef.current ??
        queryPrismLoaderOrbSlot(rootRef.current) ??
        queryPrismLoaderOrbSlot();
      await animatePrismOrbHandoff({ from: companion, to: slot });
      if (generation !== softExpandGenerationRef.current) return;
      setLoaderOrbVisible(true);
      setPrismSoftSynthesisLodged(true);
      setPrismSoftSynthesisHandoffBusy(false);
    };
    void run();

    return () => {
      softExpandGenerationRef.current += 1;
      setPrismSoftSynthesisHandoffBusy(false);
      const companion = queryPrismCompanionAvatar();
      const slot =
        orbSlotRef.current ??
        queryPrismLoaderOrbSlot(rootRef.current) ??
        queryPrismLoaderOrbSlot();
      void animatePrismOrbHandoff({
        from: slot,
        to:
          companion ??
          companionDockRectFromNormalizedPosition(softPositionRef.current),
      }).finally(() => {
        setPrismSoftSynthesisLodged(false);
      });
      setLoaderOrbVisible(false);
    };
  }, [docked, open, softUi.expanded]);

  if (!open || typeof document === "undefined") return null;
  if (docked && !softUi.expanded) return null;

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

  const minimizeSoft = (): void => {
    if (!docked || confirming) return;
    setPrismSoftSynthesisExpanded(false);
  };

  const beginCardDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!docked || event.button !== 0 || event.isPrimary === false) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, textarea, select, [data-soft-job-action]",
      )
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: softUi.position,
      moved: false,
    };
    setDraggingCard(false);
  };

  const moveCardDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < 36) return;
    drag.moved = true;
    setDraggingCard(true);
    setPrismSoftSynthesisPosition(
      clampPrismCompanionPosition({
        x: drag.origin.x + dx / window.innerWidth,
        y: drag.origin.y + dy / window.innerHeight,
      }),
    );
  };

  const endCardDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingCard(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have ended.
    }
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
      data-dragging={draggingCard ? "true" : undefined}
      onPointerDown={docked ? beginCardDrag : undefined}
      onPointerMove={docked ? moveCardDrag : undefined}
      onPointerUp={docked ? endCardDrag : undefined}
      onPointerCancel={docked ? endCardDrag : undefined}
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
      <span
        ref={orbSlotRef}
        className={styles.prismOrbSlot}
        data-prism-blocking-orb-slot="true"
        data-orb-visible={loaderOrbVisible ? "true" : undefined}
      >
        {loaderOrbVisible ? <PrismOrb className={styles.prismOrb} /> : null}
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
      </div>
      {jobSections}
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
              {docked ? "Cancel" : "Stop"}
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
              data-theme={theme}
              data-confirming={confirming ? "true" : undefined}
              data-dev-panel-safe-area="bottom"
              aria-busy="true"
              style={softDockPositionStyle(softUi.position)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (confirming) setConfirming(false);
                  else if (onCancel) requestCancel();
                  else minimizeSoft();
                }
              }}
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
