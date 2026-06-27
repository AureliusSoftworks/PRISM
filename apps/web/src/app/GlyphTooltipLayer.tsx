"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./glyph-tooltip.module.css";

const TOOLTIP_TRIGGER_SELECTOR = "[data-glyph-tooltip]";
const TOOLTIP_SHOW_DELAY_MS = 600;
const TOOLTIP_VIEWPORT_MARGIN_PX = 8;
const TOOLTIP_ANCHOR_GAP_PX = 10;

type TooltipSource = "pointer" | "focus";

interface TooltipSnapshot {
  anchor: HTMLElement;
  label: string;
  source: TooltipSource;
}

interface TooltipPosition {
  top: number;
  left: number;
  side: "top" | "bottom";
}

function tooltipPositionsEqual(
  first: TooltipPosition | null,
  second: TooltipPosition
): boolean {
  return (
    first !== null &&
    first.side === second.side &&
    Math.abs(first.top - second.top) < 0.5 &&
    Math.abs(first.left - second.left) < 0.5
  );
}

function findTooltipAnchor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest(TOOLTIP_TRIGGER_SELECTOR);
  return anchor instanceof HTMLElement ? anchor : null;
}

function extractTooltipLabel(anchor: HTMLElement | null): string | null {
  if (!anchor) return null;
  const label = anchor.dataset.glyphTooltip?.trim();
  return label && label.length > 0 ? label : null;
}

function supportsFineHover(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function GlyphTooltipLayer(): React.JSX.Element | null {
  const tooltipId = useId();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeSnapshotRef = useRef<TooltipSnapshot | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipSnapshot | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [canHover, setCanHover] = useState<boolean>(() => supportsFineHover());

  const clearShowTimer = useCallback((): void => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const detachDescription = useCallback((): void => {
    const anchor = activeSnapshotRef.current?.anchor;
    if (!anchor) return;
    const describedBy = anchor.getAttribute("aria-describedby");
    if (!describedBy) return;
    const nextTokens = describedBy
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && token !== tooltipId);
    if (nextTokens.length > 0) {
      anchor.setAttribute("aria-describedby", nextTokens.join(" "));
    } else {
      anchor.removeAttribute("aria-describedby");
    }
  }, [tooltipId]);

  const hideTooltip = useCallback((): void => {
    const hadActiveTooltip =
      activeSnapshotRef.current !== null || showTimerRef.current !== null;
    clearShowTimer();
    detachDescription();
    activeSnapshotRef.current = null;
    if (!hadActiveTooltip) return;
    setTooltip((current) => (current === null ? current : null));
    setPosition((current) => (current === null ? current : null));
  }, [clearShowTimer, detachDescription]);

  const showTooltip = useCallback((snapshot: TooltipSnapshot): void => {
    activeSnapshotRef.current = snapshot;
    const describedBy = snapshot.anchor.getAttribute("aria-describedby");
    if (!describedBy) {
      snapshot.anchor.setAttribute("aria-describedby", tooltipId);
    } else if (!describedBy.split(/\s+/).includes(tooltipId)) {
      snapshot.anchor.setAttribute("aria-describedby", `${describedBy} ${tooltipId}`);
    }
    setTooltip(snapshot);
  }, [tooltipId]);

  const scheduleTooltip = useCallback((anchor: HTMLElement, source: TooltipSource): void => {
    const label = extractTooltipLabel(anchor);
    if (!label) {
      hideTooltip();
      return;
    }
    clearShowTimer();
    const snapshot: TooltipSnapshot = { anchor, label, source };
    showTimerRef.current = window.setTimeout(() => {
      const currentLabel = extractTooltipLabel(anchor);
      if (!anchor.isConnected || currentLabel !== label) {
        showTimerRef.current = null;
        return;
      }
      showTooltip(snapshot);
      showTimerRef.current = null;
    }, TOOLTIP_SHOW_DELAY_MS);
  }, [clearShowTimer, hideTooltip, showTooltip]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = (): void => setCanHover(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent): void => {
      if (!canHover || event.pointerType !== "mouse") return;
      const anchor = findTooltipAnchor(event.target);
      if (!anchor) {
        hideTooltip();
        return;
      }
      if (activeSnapshotRef.current?.anchor === anchor) return;
      scheduleTooltip(anchor, "pointer");
    };

    const handlePointerOut = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      const activeAnchor = activeSnapshotRef.current?.anchor;
      if (!activeAnchor) {
        clearShowTimer();
        return;
      }
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && activeAnchor.contains(nextTarget)) {
        return;
      }
      hideTooltip();
    };

    const handleFocusIn = (event: FocusEvent): void => {
      const anchor = findTooltipAnchor(event.target);
      if (!anchor) return;
      scheduleTooltip(anchor, "focus");
    };

    const handleFocusOut = (event: FocusEvent): void => {
      const activeAnchor = activeSnapshotRef.current?.anchor;
      if (!activeAnchor) {
        clearShowTimer();
        return;
      }
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && activeAnchor.contains(nextTarget)) {
        return;
      }
      hideTooltip();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") hideTooltip();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", hideTooltip, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", hideTooltip, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [canHover, clearShowTimer, hideTooltip, scheduleTooltip]);

  useEffect(() => {
    return () => {
      clearShowTimer();
      detachDescription();
    };
  }, [clearShowTimer, detachDescription]);

  useEffect(() => {
    if (!tooltip || typeof MutationObserver === "undefined") return;

    const anchor = tooltip.anchor;
    const hideIfAnchorIsStale = (): void => {
      const currentLabel = extractTooltipLabel(anchor);
      if (!anchor.isConnected || currentLabel !== tooltip.label) {
        hideTooltip();
      }
    };

    hideIfAnchorIsStale();

    const observer = new MutationObserver(hideIfAnchorIsStale);
    observer.observe(anchor, {
      attributes: true,
      attributeFilter: ["data-glyph-tooltip"],
    });

    return () => observer.disconnect();
  }, [hideTooltip, tooltip]);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const anchorRect = tooltip.anchor.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    const fitsTop =
      anchorRect.top - tooltipRect.height - TOOLTIP_ANCHOR_GAP_PX >= TOOLTIP_VIEWPORT_MARGIN_PX;
    const side: "top" | "bottom" = fitsTop ? "top" : "bottom";
    const top =
      side === "top"
        ? anchorRect.top - tooltipRect.height - TOOLTIP_ANCHOR_GAP_PX
        : anchorRect.bottom + TOOLTIP_ANCHOR_GAP_PX;
    const unclampedLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    const maxLeft = window.innerWidth - tooltipRect.width - TOOLTIP_VIEWPORT_MARGIN_PX;
    const left = Math.min(Math.max(unclampedLeft, TOOLTIP_VIEWPORT_MARGIN_PX), maxLeft);

    const nextPosition = { top, left, side };
    setPosition((current) =>
      tooltipPositionsEqual(current, nextPosition) ? current : nextPosition
    );
  }, [tooltip]);

  useEffect(() => {
    if (!tooltip) return;
    const reposition = (): void => {
      if (!tooltipRef.current || !activeSnapshotRef.current) return;
      const anchorRect = activeSnapshotRef.current.anchor.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const fitsTop =
        anchorRect.top - tooltipRect.height - TOOLTIP_ANCHOR_GAP_PX >= TOOLTIP_VIEWPORT_MARGIN_PX;
      const side: "top" | "bottom" = fitsTop ? "top" : "bottom";
      const top =
        side === "top"
          ? anchorRect.top - tooltipRect.height - TOOLTIP_ANCHOR_GAP_PX
          : anchorRect.bottom + TOOLTIP_ANCHOR_GAP_PX;
      const unclampedLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      const maxLeft = window.innerWidth - tooltipRect.width - TOOLTIP_VIEWPORT_MARGIN_PX;
      const left = Math.min(Math.max(unclampedLeft, TOOLTIP_VIEWPORT_MARGIN_PX), maxLeft);
      const nextPosition = { top, left, side };
      setPosition((current) =>
        tooltipPositionsEqual(current, nextPosition) ? current : nextPosition
      );
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [tooltip]);

  if (!tooltip || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      className={`${styles.glyphTooltip} ${
        position?.side === "bottom" ? styles.glyphTooltipBottom : styles.glyphTooltipTop
      }`}
      style={
        position
          ? {
              top: `${position.top}px`,
              left: `${position.left}px`,
            }
          : {
              visibility: "hidden",
              top: "-9999px",
              left: "-9999px",
            }
      }
    >
      {tooltip.label}
    </div>,
    document.body
  );
}
