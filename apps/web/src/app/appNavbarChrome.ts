/**
 * App-wide shared navbar chrome: idle auto-hide, Prism summon pin, and Wield reveal.
 * Driven from page shells + PrismCompanion without prop drilling.
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

let visible = true;
let autoHideArmed = false;
let autoHideEnabled = true;
/** Live Coffee / Debate / Signal sits: collapse the shared navbar entirely. */
let sessionHidden = false;
let pinned = false;
let dropdownHoldCount = 0;
let controlHoldCount = 0;
let companionOpen = false;
let wielding = false;
let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function clearAutoHideTimer(): void {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function isDropdownHeld(): boolean {
  return dropdownHoldCount > 0;
}

function isControlHeld(): boolean {
  return controlHoldCount > 0;
}

/** True when any explicit hold should keep the bar painted. */
function isVisibilityHeld(): boolean {
  return pinned || isDropdownHeld() || isControlHeld();
}

/** True when idle tuck should wait (menus, Control-root, companion pin). */
function blocksIdleHide(): boolean {
  return companionOpen || isVisibilityHeld();
}

function computeHidden(): boolean {
  if (companionOpen) return false;
  // Explicit holds always keep shortcut targets in view.
  if (isVisibilityHeld()) return false;
  // Wield is a Zen visibility hold; other modes already keep the bar present.
  if (wielding) return false;
  return !visible;
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
  if (computeHidden()) root.setAttribute("data-app-navbar-hidden", "true");
  else root.removeAttribute("data-app-navbar-hidden");
  if (sessionHidden) {
    root.setAttribute("data-app-navbar-session-hidden", "true");
  } else {
    root.removeAttribute("data-app-navbar-session-hidden");
  }
}

function commit(): void {
  syncDocumentAttributes();
  emit();
}

function maybeScheduleAfterRelease(): void {
  if (
    autoHideEnabled &&
    autoHideArmed &&
    !wielding &&
    !blocksIdleHide()
  ) {
    scheduleAppNavbarAutoHide();
  }
}

export function getAppNavbarChromeSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: computeHidden() || sessionHidden,
    sessionHidden,
    companionOpen,
    wielding,
    pinned,
    dropdownHeld: isDropdownHeld(),
    controlHeld: isControlHeld(),
    autoHideEnabled,
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
    autoHideEnabled: true,
  };
}

/**
 * Fully hide and collapse the shared navbar for locked live applet sessions
 * (Coffee arriving/live, Debate baking/live, Signal on-air). Independent of
 * Zen idle tuck — restores when the sit ends.
 */
export function setAppNavbarSessionHidden(hidden: boolean): void {
  if (sessionHidden === hidden) return;
  sessionHidden = hidden;
  commit();
}

/** Drain session-hide between unit tests. */
export function clearAppNavbarSessionHiddenForTests(): void {
  if (!sessionHidden) return;
  sessionHidden = false;
  commit();
}

/** Drain leftover dropdown / Control holds between unit tests. */
export function clearAppNavbarDropdownHoldsForTests(): void {
  if (dropdownHoldCount === 0 && controlHoldCount === 0) return;
  dropdownHoldCount = 0;
  controlHoldCount = 0;
  clearAutoHideTimer();
  visible = true;
  commit();
}

export function subscribeAppNavbarChrome(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Idle auto-hide and Wield reveal are Zen-only for now.
 * Chat, Signal, Debate, Coffee, Slate, and other shells keep a persistent bar.
 */
export function setAppNavbarAutoHideEnabled(enabled: boolean): void {
  if (autoHideEnabled === enabled) return;
  autoHideEnabled = enabled;
  if (!enabled) {
    autoHideArmed = false;
    clearAutoHideTimer();
    visible = true;
  }
  commit();
}

export function pinAppNavbar(next: boolean): void {
  if (pinned === next) return;
  pinned = next;
  if (pinned) {
    clearAutoHideTimer();
    visible = true;
  } else {
    maybeScheduleAfterRelease();
  }
  commit();
}

/**
 * Keep the navbar visible while a portaled navbar dropdown is open.
 * Callers should invoke from a useEffect and return the release function.
 * Ref-counted so model + voice + app switcher can overlap safely.
 */
export function holdAppNavbarForDropdown(): () => void {
  dropdownHoldCount += 1;
  clearAutoHideTimer();
  visible = true;
  commit();
  return () => {
    dropdownHoldCount = Math.max(0, dropdownHoldCount - 1);
    if (!isVisibilityHeld()) {
      maybeScheduleAfterRelease();
    }
    commit();
  };
}

/**
 * Keep the navbar visible while Control is held or the Control-root shortcut
 * compass is showing. Keeps shortcut targets in view alongside Zen Wield.
 */
export function holdAppNavbarForControlShortcuts(): () => void {
  controlHoldCount += 1;
  clearAutoHideTimer();
  visible = true;
  commit();
  return () => {
    controlHoldCount = Math.max(0, controlHoldCount - 1);
    if (!isVisibilityHeld()) {
      maybeScheduleAfterRelease();
    }
    commit();
  };
}

/**
 * Reveal the shared navbar before a Control-root shortcut mutates UI.
 * Prefer this immediately before opening a picker or flipping a toggle.
 */
export function revealAppNavbarForShortcutAction(): void {
  clearAutoHideTimer();
  visible = true;
  commit();
}

export function setAppNavbarCompanionOpen(open: boolean): void {
  if (companionOpen === open) return;
  companionOpen = open;
  if (open) {
    clearAutoHideTimer();
    visible = true;
  } else {
    maybeScheduleAfterRelease();
  }
  commit();
}

export function setAppNavbarWielding(next: boolean): void {
  if (wielding === next) return;
  wielding = next;
  if (next) {
    clearAutoHideTimer();
    visible = true;
    if (autoHideEnabled) autoHideArmed = true;
  } else {
    visible = true;
    if (autoHideEnabled && autoHideArmed && !blocksIdleHide()) {
      scheduleAppNavbarAutoHide();
    } else if (!autoHideEnabled) {
      autoHideArmed = false;
      clearAutoHideTimer();
    }
  }
  commit();
}

export function revealAppNavbarTemporarily(): void {
  clearAutoHideTimer();
  visible = true;
  commit();
  if (
    autoHideEnabled &&
    autoHideArmed &&
    !wielding &&
    !blocksIdleHide()
  ) {
    scheduleAppNavbarAutoHide();
  }
}

export function revealAppNavbarForFreshSurface(): void {
  autoHideArmed = false;
  clearAutoHideTimer();
  visible = true;
  commit();
}

/** Keep the bar up while the pointer/focus is in the navbar itself. */
export function showAppNavbarWhileInteracting(): void {
  clearAutoHideTimer();
  visible = true;
  commit();
}

export function hideAppNavbarForImmersion(): void {
  if (!autoHideEnabled) return;
  if (blocksIdleHide()) {
    autoHideArmed = true;
    return;
  }
  autoHideArmed = true;
  clearAutoHideTimer();
  visible = false;
  commit();
}

/** Arm idle tuck without forcing an immediate hide. */
export function armAppNavbarAutoHide(): void {
  if (!autoHideEnabled) return;
  autoHideArmed = true;
  if (!wielding && !blocksIdleHide()) {
    scheduleAppNavbarAutoHide();
  }
}

export function scheduleAppNavbarAutoHide(): void {
  if (
    !autoHideEnabled ||
    !autoHideArmed ||
    wielding ||
    blocksIdleHide()
  ) {
    return;
  }
  clearAutoHideTimer();
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null;
    if (!autoHideEnabled || wielding || blocksIdleHide()) return;
    visible = false;
    commit();
  }, APP_NAVBAR_REVEAL_HOLD_MS);
}

export function revealAppNavbarFromPointerClientY(clientY: number): void {
  if (!computeHidden()) return;
  if (clientY > APP_NAVBAR_REVEAL_EDGE_PX) return;
  revealAppNavbarTemporarily();
}
