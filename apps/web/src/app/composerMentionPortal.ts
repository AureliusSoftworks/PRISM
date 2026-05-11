import type React from "react";

/** Match `page.tsx` compose popovers so mention menu matches ComposerBotPicker. */
export const COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX = 12;
export const COMPOSE_MENTION_MENU_MAX_WIDTH_PX = 360;
export const COMPOSE_MENTION_MENU_MIN_WIDTH_PX = 260;
export const COMPOSE_MENTION_MENU_PORTAL_Z_INDEX = 2500;

/** Matches `.composeBotMenu { max-height: min(420px, …) }` for layout math. */
const MENTION_MENU_MAX_HEIGHT_CAP_PX = 420;
/** Minimum space (px) we want below the caret before preferring open-upward. */
const MENTION_MENU_MIN_OPEN_BELOW_PX = 160;

export const COMPOSE_MENTION_MENU_PORTAL_THEME_VARS = [
  "--bg",
  "--bg-surface",
  "--bg-deep",
  "--bg-hover",
  "--bg-active",
  "--fg",
  "--fg-muted",
  "--fg-subtle",
  "--line",
  "--line-strong",
  "--accent",
  "--accent-ink",
  "--accent-text",
  "--accent-soft",
  "--accent-glow",
  "--shadow-sm",
] as const;

/**
 * Fixed style for a caret-anchored mention menu: prefers below the caret,
 * flips above when needed, clamps to the viewport, and caps height for
 * internal scrolling.
 */
export function computeMentionMenuFixedStyle(
  caretRect: DOMRect,
  themeSource: Element | null,
  floorMinWidth: number = COMPOSE_MENTION_MENU_MIN_WIDTH_PX
): React.CSSProperties {
  const vw = globalThis.window.innerWidth;
  const vh = globalThis.window.innerHeight;
  const pad = COMPOSE_MENTION_MENU_VIEWPORT_PAD_PX;
  const gap = 6;
  const maxW = Math.min(COMPOSE_MENTION_MENU_MAX_WIDTH_PX, vw - pad * 2);
  const minWidth = Math.min(Math.max(caretRect.width || 0, floorMinWidth), maxW);
  // Clamp `left` using max width so the menu cannot extend past the
  // right edge when it grows to `maxWidth` (wider than `minWidth`).
  const left = Math.max(pad, Math.min(caretRect.left, vw - maxW - pad));

  const maxHeightCap = Math.min(MENTION_MENU_MAX_HEIGHT_CAP_PX, Math.max(0, vh - 2 * pad));
  const topIfBelow = caretRect.bottom + gap;
  const spaceBelow = vh - pad - topIfBelow;
  const spaceAbove = caretRect.top - pad - gap;

  let top: number;
  let maxHeight: number;

  if (spaceBelow >= MENTION_MENU_MIN_OPEN_BELOW_PX || spaceBelow >= spaceAbove) {
    top = topIfBelow;
    maxHeight = Math.min(maxHeightCap, Math.max(80, spaceBelow));
  } else {
    maxHeight = Math.min(maxHeightCap, Math.max(80, spaceAbove));
    top = Math.max(pad, caretRect.top - gap - maxHeight);
  }

  if (top + maxHeight + pad > vh) {
    maxHeight = Math.max(80, vh - pad - top);
  }
  if (top < pad) {
    top = pad;
    maxHeight = Math.min(maxHeightCap, Math.max(80, vh - pad - top));
  }

  const themeVars: Record<string, string> = {};
  if (themeSource) {
    const computedStyle = globalThis.window.getComputedStyle(themeSource);
    for (const varName of COMPOSE_MENTION_MENU_PORTAL_THEME_VARS) {
      const value = computedStyle.getPropertyValue(varName).trim();
      if (value) {
        themeVars[varName] = value;
      }
    }
  }
  return {
    position: "fixed",
    left,
    top,
    bottom: "auto",
    minWidth,
    maxWidth: maxW,
    maxHeight,
    overflow: "hidden",
    zIndex: COMPOSE_MENTION_MENU_PORTAL_Z_INDEX,
    ...themeVars,
  } as React.CSSProperties;
}
