/**
 * App-wide shared navbar chrome state. The navbar is a permanent instrument:
 * these compatibility hooks may annotate companion and input state, but no
 * caller may hide or collapse the bar.
 */

export const APP_NAVBAR_REVEAL_EDGE_PX = 72;
export const APP_NAVBAR_REVEAL_HOLD_MS = 3200;

export type AppNavbarChromeSnapshot = {
  hidden: boolean;
  sessionHidden: boolean;
  companionOpen: boolean;
  wielding: boolean;
  pinned: boolean;
  dropdownHeld: boolean;
  controlHeld: boolean;
  autoHideEnabled: boolean;
};

type Listener = () => void;

let pinned = false;
let dropdownHoldCount = 0;
let controlHoldCount = 0;
let companionOpen = false;
let wielding = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function isDropdownHeld(): boolean {
  return dropdownHoldCount > 0;
}

function isControlHeld(): boolean {
  return controlHoldCount > 0;
}

function syncDocumentAttributes(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (companionOpen) root.setAttribute("data-prism-companion-open", "true");
  else root.removeAttribute("data-prism-companion-open");
  if (wielding) root.setAttribute("data-prism-wielding", "true");
  else root.removeAttribute("data-prism-wielding");
  if (isDropdownHeld()) {
    root.setAttribute("data-app-navbar-dropdown-held", "true");
  } else {
    root.removeAttribute("data-app-navbar-dropdown-held");
  }
  if (isControlHeld()) {
    root.setAttribute("data-app-navbar-control-held", "true");
  } else {
    root.removeAttribute("data-app-navbar-control-held");
  }
  // Clear attributes left by an older bundle during hot reload. Permanent
  // navbar visibility is enforced here as well as in CSS/layout.
  root.removeAttribute("data-app-navbar-hidden");
  root.removeAttribute("data-app-navbar-session-hidden");
}

function commit(): void {
  syncDocumentAttributes();
  emit();
}

export function getAppNavbarChromeSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: false,
    sessionHidden: false,
    companionOpen,
    wielding,
    pinned,
    dropdownHeld: isDropdownHeld(),
    controlHeld: isControlHeld(),
    autoHideEnabled: false,
  };
}

export function getAppNavbarChromeServerSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: false,
    sessionHidden: false,
    companionOpen: false,
    wielding: false,
    pinned: false,
    dropdownHeld: false,
    controlHeld: false,
    autoHideEnabled: false,
  };
}

/** Compatibility no-op: session surfaces lock controls instead of hiding. */
export function setAppNavbarSessionHidden(hidden: boolean): void {
  void hidden;
  commit();
}

/** Clear any stale DOM attribute left by an older hot-reloaded bundle. */
export function clearAppNavbarSessionHiddenForTests(): void {
  commit();
}

/** Drain leftover dropdown / Control holds between unit tests. */
export function clearAppNavbarDropdownHoldsForTests(): void {
  if (dropdownHoldCount === 0 && controlHoldCount === 0) return;
  dropdownHoldCount = 0;
  controlHoldCount = 0;
  commit();
}

export function subscribeAppNavbarChrome(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Compatibility no-op: auto-hide is permanently disabled. */
export function setAppNavbarAutoHideEnabled(enabled: boolean): void {
  void enabled;
  commit();
}

export function pinAppNavbar(next: boolean): void {
  if (pinned === next) return;
  pinned = next;
  commit();
}

/**
 * Keep the navbar visible while a portaled navbar dropdown is open.
 * Callers should invoke from a useEffect and return the release function.
 * Ref-counted so model + voice + app switcher can overlap safely.
 */
export function holdAppNavbarForDropdown(): () => void {
  dropdownHoldCount += 1;
  commit();
  return () => {
    dropdownHoldCount = Math.max(0, dropdownHoldCount - 1);
    commit();
  };
}

/**
 * Keep the navbar visible while Control is held or the Control-root shortcut
 * compass is showing. Keeps shortcut targets in view alongside Zen Wield.
 */
export function holdAppNavbarForControlShortcuts(): () => void {
  controlHoldCount += 1;
  commit();
  return () => {
    controlHoldCount = Math.max(0, controlHoldCount - 1);
    commit();
  };
}

/**
 * Reveal the shared navbar before a Control-root shortcut mutates UI.
 * Prefer this immediately before opening a picker or flipping a toggle.
 */
export function revealAppNavbarForShortcutAction(): void {
  commit();
}

export function setAppNavbarCompanionOpen(open: boolean): void {
  if (companionOpen === open) return;
  companionOpen = open;
  commit();
}

export function setAppNavbarWielding(next: boolean): void {
  if (wielding === next) return;
  wielding = next;
  commit();
}

export function revealAppNavbarTemporarily(): void {
  commit();
}

export function revealAppNavbarForFreshSurface(): void {
  commit();
}

/** Keep the bar up while the pointer/focus is in the navbar itself. */
export function showAppNavbarWhileInteracting(): void {
  commit();
}

/** Compatibility no-op: immersion never removes global navigation. */
export function hideAppNavbarForImmersion(): void {
  commit();
}

/** Compatibility no-op: idle tuck is permanently disabled. */
export function armAppNavbarAutoHide(): void {
  commit();
}

export function scheduleAppNavbarAutoHide(): void {
  commit();
}

export function revealAppNavbarFromPointerClientY(clientY: number): void {
  void clientY;
  commit();
}
