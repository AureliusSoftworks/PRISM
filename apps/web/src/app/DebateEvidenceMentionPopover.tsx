"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type React from "react";
import composeStyles from "./page.module.css";
import {
  COMPOSE_MENTION_MENU_CARET_GAP_PX,
  COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX,
  computeMentionMenuFixedStyle,
} from "./composerMentionPortal";
import type { DebateEvidenceMentionPick } from "./debateEvidenceMention";

export interface DebateEvidenceMentionPopoverProps {
  open: boolean;
  caretRect: DOMRect | null;
  themeSource: Element | null;
  picks: readonly DebateEvidenceMentionPick[];
  highlightIndex: number;
  onHighlightIndexChange: (next: number) => void;
  onPickIndex: (index: number) => void;
  excludeInteractionRef?: RefObject<Element | null>;
  onDismiss?: () => void;
}

/**
 * Caret-anchored evidence picker for Debate Participant `@` mentions.
 * Reuses the shared compose menu chrome so it feels like bot mentions.
 */
export function DebateEvidenceMentionPopover({
  open,
  caretRect,
  themeSource,
  picks,
  highlightIndex,
  onHighlightIndexChange,
  onPickIndex,
  excludeInteractionRef,
  onDismiss,
}: DebateEvidenceMentionPopoverProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const portalStyle = useMemo(() => {
    if (!open || !caretRect) return null;
    return computeMentionMenuFixedStyle(caretRect, themeSource);
  }, [caretRect, open, themeSource]);

  const [viewportNudge, setViewportNudge] = useState({ x: 0, y: 0 });

  const adjustedStyle = useMemo((): React.CSSProperties | null => {
    if (!portalStyle) return null;
    const leftNum =
      typeof portalStyle.left === "number"
        ? portalStyle.left
        : Number(portalStyle.left);
    const topNum =
      typeof portalStyle.top === "number"
        ? portalStyle.top
        : Number(portalStyle.top);
    if (Number.isFinite(leftNum) && Number.isFinite(topNum)) {
      return {
        ...portalStyle,
        left: leftNum + viewportNudge.x,
        top: topNum + viewportNudge.y,
      };
    }
    return portalStyle;
  }, [portalStyle, viewportNudge]);

  useLayoutEffect(() => {
    if (!open || !caretRect || !portalStyle) return;
    const menu = menuRef.current;
    if (!menu) return;
    const r = menu.getBoundingClientRect();
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const vw = globalThis.window.innerWidth;
    const vh = globalThis.window.innerHeight;
    const portalLeftNum =
      typeof portalStyle.left === "number"
        ? portalStyle.left
        : Number(portalStyle.left);
    const portalTopNum =
      typeof portalStyle.top === "number"
        ? portalStyle.top
        : Number(portalStyle.top);
    if (!Number.isFinite(portalLeftNum) || !Number.isFinite(portalTopNum)) {
      return;
    }
    let x = 0;
    let y = 0;
    const opensAbove =
      Number.isFinite(portalTopNum) && portalTopNum < caretRect.top;
    if (opensAbove) {
      const shellRect = excludeInteractionRef?.current?.getBoundingClientRect();
      const anchorTop =
        shellRect && shellRect.width > 0 && shellRect.height > 0
          ? Math.min(caretRect.top, shellRect.top)
          : caretRect.top;
      const desiredTop = Math.max(
        pad,
        anchorTop - COMPOSE_MENTION_MENU_CARET_GAP_PX - r.height,
      );
      y = desiredTop - portalTopNum;
    }
    if (portalLeftNum + x + r.width > vw - pad) {
      x += vw - pad - (portalLeftNum + x + r.width);
    }
    if (portalLeftNum + x < pad) x = pad - portalLeftNum;
    if (portalTopNum + y + r.height > vh - pad) {
      y += vh - pad - (portalTopNum + y + r.height);
    }
    if (portalTopNum + y < pad) y = pad - portalTopNum;
    const frame = window.requestAnimationFrame(() => {
      setViewportNudge((prev) =>
        prev.x === x && prev.y === y ? prev : { x, y },
      );
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, caretRect, portalStyle, picks.length, excludeInteractionRef]);

  const safeHighlight = Math.max(
    0,
    Math.min(highlightIndex, Math.max(0, picks.length - 1)),
  );

  useLayoutEffect(() => {
    if (!open || picks.length === 0) return;
    const listbox = listboxRef.current;
    const row = menuRef.current?.querySelector<HTMLElement>(
      `[data-mention-index="${safeHighlight}"]`,
    );
    if (!listbox || !row) return;
    const rowRect = row.getBoundingClientRect();
    const listRect = listbox.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      listbox.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      listbox.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [open, picks.length, safeHighlight, viewportNudge]);

  useEffect(() => {
    if (!open || !onDismiss) return;
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      const shell = excludeInteractionRef?.current;
      if (shell?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open, onDismiss, excludeInteractionRef]);

  if (!open || !adjustedStyle || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className={`${composeStyles.composeBotMenu} ${composeStyles.composeCommandMenu}`}
      style={adjustedStyle}
      data-debate-evidence-mention="true"
    >
      <div
        ref={listboxRef}
        className={composeStyles.composeBotListbox}
        role="listbox"
        aria-label="Cite frozen evidence"
      >
        {picks.length === 0 ? (
          <div className={composeStyles.composeBotNoMatches} role="presentation">
            No evidence matches.
          </div>
        ) : null}
        {picks.map((pick, index) => {
          const active = index === safeHighlight;
          return (
            <button
              key={`${pick.markerKind}:${pick.id}`}
              type="button"
              data-mention-index={index}
              data-mention-row="true"
              data-command-kind="evidence-mention"
              role="option"
              aria-selected={active ? "true" : "false"}
              className={`${composeStyles.composeBotOption} ${composeStyles.composeCommandOption}`}
              onMouseEnter={() => onHighlightIndexChange(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPickIndex(index);
              }}
            >
              <span
                className={composeStyles.composeBotOptionGlyph}
                aria-hidden="true"
              >
                {pick.glyph ?? "📄"}
              </span>
              <span className={composeStyles.composeCommandText}>
                <span className={composeStyles.composeBotOptionName}>
                  {pick.pickerLabel}
                </span>
                <span className={composeStyles.composeCommandMeta}>
                  {pick.kindLabel}
                  {pick.id ? ` · ${pick.id}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
