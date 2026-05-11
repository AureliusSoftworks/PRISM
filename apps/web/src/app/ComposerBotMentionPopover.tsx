"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type React from "react";
import styles from "./page.module.css";
import type { BotMentionPick } from "./botMention";
import {
  COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX,
  computeMentionMenuFixedStyle,
} from "./composerMentionPortal";

const THEME_CONTRAST_RATIO = 4.5;

export interface ComposerBotMentionPopoverProps {
  open: boolean;
  caretRect: DOMRect | null;
  /** Element to read CSS variables from (e.g. compose form). */
  themeSource: Element | null;
  bots: readonly BotMentionPick[];
  resolvedTheme: "light" | "dark";
  /** Row index for keyboard highlight (clamped internally). */
  highlightIndex: number;
  onHighlightIndexChange: (next: number) => void;
  /** Only when `bots.length === 1`: click row completes stage-1. */
  onSingleMatchClick: () => void;
  /** Renders the glyph for a bot (wired to app `BotGlyph`). */
  renderBotGlyph: (glyph: string | null) => React.ReactNode;
  normalizeAccentForTheme: (hex: string, theme?: "light" | "dark") => string;
  surfaceBgForContrast: string;
  ensureContrast: (
    foreground: string,
    background: string,
    targetRatio?: number
  ) => string;
  /** Clicks inside this subtree (e.g. composer shell) do not dismiss the menu. */
  excludeInteractionRef?: RefObject<Element | null>;
  /** Close the menu when the user presses outside the menu and outside {@link excludeInteractionRef}. */
  onDismiss?: () => void;
}

/**
 * Caret-anchored bot list for @-mentions (no filter bar; rows are not
 * click-pickable unless there is exactly one match).
 */
export function ComposerBotMentionPopover({
  open,
  caretRect,
  themeSource,
  bots,
  resolvedTheme,
  highlightIndex,
  onHighlightIndexChange,
  onSingleMatchClick,
  renderBotGlyph,
  normalizeAccentForTheme,
  surfaceBgForContrast,
  ensureContrast,
  excludeInteractionRef,
  onDismiss,
}: ComposerBotMentionPopoverProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const portalStyle = useMemo(() => {
    if (!open || !caretRect) return null;
    return computeMentionMenuFixedStyle(caretRect, themeSource);
  }, [caretRect, open, themeSource]);

  const [viewportNudge, setViewportNudge] = useState({ x: 0, y: 0 });

  const adjustedStyle = useMemo((): React.CSSProperties | null => {
    if (!portalStyle) return null;
    const L = portalStyle.left;
    const T = portalStyle.top;
    const leftNum = typeof L === "number" ? L : Number(L);
    const topNum = typeof T === "number" ? T : Number(T);
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
    if (!open || !caretRect || !portalStyle) {
      setViewportNudge({ x: 0, y: 0 });
      return;
    }
    const menu = menuRef.current;
    if (!menu) return;
    const r = menu.getBoundingClientRect();
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const vw = globalThis.window.innerWidth;
    const vh = globalThis.window.innerHeight;
    let x = 0;
    let y = 0;
    if (r.right > vw - pad) x += vw - pad - r.right;
    if (r.left + x < pad) x = pad - r.left;
    if (r.bottom > vh - pad) y += vh - pad - r.bottom;
    if (r.top + y < pad) y = pad - r.top;
    setViewportNudge((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
  }, [open, caretRect, portalStyle, bots.length]);

  const safeHighlight = Math.max(0, Math.min(highlightIndex, Math.max(0, bots.length - 1)));

  useEffect(() => {
    if (!open || bots.length === 0) return;
    const row = menuRef.current?.querySelector<HTMLElement>(
      `[data-mention-index="${safeHighlight}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [open, bots.length, safeHighlight, viewportNudge]);

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
      className={styles.composeBotMenu}
      style={adjustedStyle}
      role="listbox"
      aria-label="Mention a bot"
    >
      <div className={styles.composeBotListbox}>
        {bots.length === 0 && (
          <div className={styles.composeBotNoMatches} role="presentation">
            No bots match.
          </div>
        )}
        {bots.map((b, index) => {
          const accent = b.color
            ? normalizeAccentForTheme(b.color, resolvedTheme)
            : null;
          const optionStyle: React.CSSProperties | undefined = accent
            ? ({
                "--bot-color": accent,
                "--bot-menu-color":
                  resolvedTheme === "light"
                    ? ensureContrast(
                        accent,
                        surfaceBgForContrast,
                        THEME_CONTRAST_RATIO
                      )
                    : accent,
              } as React.CSSProperties)
            : undefined;
          const active = index === safeHighlight;
          return (
            <div
              key={b.id}
              data-mention-index={index}
              data-mention-row="true"
              role="option"
              aria-selected={active ? "true" : "false"}
              className={styles.composeBotOption}
              style={optionStyle}
              data-clickable-single={bots.length === 1 ? "true" : undefined}
              onMouseEnter={() => onHighlightIndexChange(index)}
              onMouseDown={(event) => {
                if (bots.length !== 1) return;
                event.preventDefault();
                onSingleMatchClick();
              }}
            >
              <span className={styles.composeBotOptionGlyph} aria-hidden="true">
                {renderBotGlyph(b.glyph)}
              </span>
              <span className={styles.composeBotOptionName}>{b.name}</span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
