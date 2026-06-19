export interface BrowserShortcutKeyEvent {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  targetIsEditable?: boolean;
}

export interface BrowserShortcutWheelEvent {
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented?: boolean;
}

const DEVTOOLS_CTRL_SHIFT_KEYS = new Set(["C", "I", "J", "K"]);
const DEVTOOLS_META_ALT_KEYS = new Set(["C", "I", "J", "U"]);
const FUNCTION_BROWSER_KEYS = new Set([
  "F1",
  "F3",
  "F5",
  "F6",
  "F7",
  "F10",
  "F11",
  "F12",
]);
const BROWSER_NAVIGATION_KEYS = new Set([
  "BrowserBack",
  "BrowserFavorites",
  "BrowserForward",
  "BrowserHome",
  "BrowserRefresh",
  "BrowserSearch",
  "LaunchApplication1",
  "LaunchApplication2",
]);
const CTRL_OR_META_BROWSER_KEYS = new Set([
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "N",
  "O",
  "P",
  "R",
  "S",
  "T",
  "U",
  "W",
]);
const ZOOM_KEYS = new Set(["+", "-", "0", "=", "_"]);
const ZOOM_CODES = new Set(["Equal", "Minus", "NumpadAdd", "NumpadSubtract"]);
const CTRL_OR_META_TAB_KEYS = new Set(["Tab", "PageDown", "PageUp"]);

function normalizeShortcutKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function isNumberTabShortcut(key: string): boolean {
  return /^[1-9]$/u.test(key);
}

function isZoomShortcut(event: BrowserShortcutKeyEvent, key: string): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  return ZOOM_KEYS.has(key) || ZOOM_CODES.has(event.code ?? "");
}

export function shouldBlockBrowserKeyboardShortcut(
  event: BrowserShortcutKeyEvent
): boolean {
  if (event.defaultPrevented) return false;

  const key = normalizeShortcutKey(event.key);
  const code = event.code ?? "";
  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  if (FUNCTION_BROWSER_KEYS.has(key)) return true;
  if (BROWSER_NAVIGATION_KEYS.has(key) || BROWSER_NAVIGATION_KEYS.has(code)) {
    return true;
  }

  if (!event.targetIsEditable && key === "Backspace") return true;
  if (isZoomShortcut(event, key)) return true;

  if (event.ctrlKey && event.shiftKey && DEVTOOLS_CTRL_SHIFT_KEYS.has(key)) {
    return true;
  }

  if (event.metaKey && event.altKey && DEVTOOLS_META_ALT_KEYS.has(key)) {
    return true;
  }

  if (ctrlOrMeta && CTRL_OR_META_BROWSER_KEYS.has(key)) return true;
  if (ctrlOrMeta && CTRL_OR_META_TAB_KEYS.has(key)) return true;
  if (ctrlOrMeta && isNumberTabShortcut(key)) return true;

  if (ctrlOrMeta && event.shiftKey && key === "Delete") return true;

  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (key === "ArrowLeft" || key === "ArrowRight") return true;
    if (key === "D" || key === "Home" || key === "F4") return true;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey) {
    if (key === "[" || key === "]") return true;
    if (!event.targetIsEditable && (key === "ArrowLeft" || key === "ArrowRight")) {
      return true;
    }
  }

  return false;
}

export function shouldBlockBrowserWheelShortcut(
  event: BrowserShortcutWheelEvent
): boolean {
  if (event.defaultPrevented) return false;
  return event.ctrlKey || event.metaKey;
}
