"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type React from "react";
import styles from "./page.module.css";
import type { BotMentionPick } from "./botMention";
import {
  COMPOSE_MENTION_MENU_CARET_GAP_PX,
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
  onPickIndex: (index: number) => void;
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
  /** Optional compact controls shown below mention rows. */
  footer?: React.ReactNode;
}

/**
 * Caret-anchored bot picker for @-mentions. It follows the command/wildcard
 * popout shape: the active @ query remains in the composer and filters rows.
 */
export function ComposerBotMentionPopover({
  open,
  caretRect,
  themeSource,
  bots,
  resolvedTheme,
  highlightIndex,
  onHighlightIndexChange,
  onPickIndex,
  renderBotGlyph,
  normalizeAccentForTheme,
  surfaceBgForContrast,
  ensureContrast,
  excludeInteractionRef,
  onDismiss,
  footer,
}: ComposerBotMentionPopoverProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
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
    if (!open || !caretRect || !portalStyle) return;
    const menu = menuRef.current;
    if (!menu) return;
    const r = menu.getBoundingClientRect();
    const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
    const vw = globalThis.window.innerWidth;
    const vh = globalThis.window.innerHeight;
    const portalTop = portalStyle.top;
    const portalLeft = portalStyle.left;
    const portalLeftNum = typeof portalLeft === "number" ? portalLeft : Number(portalLeft);
    const portalTopNum = typeof portalTop === "number" ? portalTop : Number(portalTop);
    if (!Number.isFinite(portalLeftNum) || !Number.isFinite(portalTopNum)) {
      return;
    }
    let x = 0;
    let y = 0;
    const opensAbove = Number.isFinite(portalTopNum) && portalTopNum < caretRect.top;
    if (opensAbove) {
      const shellRect = excludeInteractionRef?.current?.getBoundingClientRect();
      const anchorTop =
        shellRect && shellRect.width > 0 && shellRect.height > 0
          ? Math.min(caretRect.top, shellRect.top)
          : caretRect.top;
      const desiredTop = Math.max(
        pad,
        anchorTop - COMPOSE_MENTION_MENU_CARET_GAP_PX - r.height
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
      setViewportNudge((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, caretRect, portalStyle, bots.length, excludeInteractionRef]);

  const safeHighlight = Math.max(0, Math.min(highlightIndex, Math.max(0, bots.length - 1)));

  useLayoutEffect(() => {
    if (!open || bots.length === 0) return;
    const listbox = listboxRef.current;
    const row = menuRef.current?.querySelector<HTMLElement>(
      `[data-mention-index="${safeHighlight}"]`
    );
    if (!listbox || !row) return;
    const rowRect = row.getBoundingClientRect();
    const listRect = listbox.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      listbox.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      listbox.scrollTop += rowRect.bottom - listRect.bottom;
    }
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
      className={`${styles.composeBotMenu} ${styles.composeCommandMenu}`}
      style={adjustedStyle}
    >
      <div
        ref={listboxRef}
        className={styles.composeBotListbox}
        role="listbox"
        aria-label="Mention a bot"
      >
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
            <button
              key={b.id}
              type="button"
              data-mention-index={index}
              data-mention-row="true"
              data-command-kind="mention"
              role="option"
              aria-selected={active ? "true" : "false"}
              className={`${styles.composeBotOption} ${styles.composeCommandOption}`}
              style={optionStyle}
              onMouseEnter={() => onHighlightIndexChange(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPickIndex(index);
              }}
            >
              <span className={styles.composeBotOptionGlyph} aria-hidden="true">
                {renderBotGlyph(b.glyph)}
              </span>
              <span className={styles.composeCommandText}>
                <span className={styles.composeBotOptionName}>{b.pickerLabel ?? b.name}</span>
              </span>
            </button>
          );
        })}
      </div>
      {footer ? <div className={styles.composeBotMenuFooter}>{footer}</div> : null}
    </div>,
    document.body
  );
}
