/**
 * App-wide shared navbar chrome: idle auto-hide, Prism summon pin, and Wield hide.
 * Driven from page shells + PrismCompanion without prop drilling.
 */

export const APP_NAVBAR_REVEAL_EDGE_PX = 72;
export const APP_NAVBAR_REVEAL_HOLD_MS = 3200;

export type AppNavbarChromeSnapshot = {
  hidden: boolean;
  companionOpen: boolean;
  wielding: boolean;
  pinned: boolean;
  dropdownHeld: boolean;
  autoHideEnabled: boolean;
};

type Listener = () => void;

let visible = true;
let autoHideArmed = false;
let autoHideEnabled = true;
let pinned = false;
let dropdownHoldCount = 0;
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

/** True when idle tuck should wait (menus, overflow, companion pin). */
function blocksIdleHide(): boolean {
  return companionOpen || pinned || isDropdownHeld();
}

function computeHidden(): boolean {
  if (companionOpen) return false;
  // Wield tuck is Zen-only; other modes keep the bar even while Wielding.
  if (wielding && autoHideEnabled) return true;
  if (pinned || isDropdownHeld()) return false;
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
  if (computeHidden()) root.setAttribute("data-app-navbar-hidden", "true");
  else root.removeAttribute("data-app-navbar-hidden");
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
    hidden: computeHidden(),
    companionOpen,
    wielding,
    pinned,
    dropdownHeld: isDropdownHeld(),
    autoHideEnabled,
  };
}

export function getAppNavbarChromeServerSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: false,
    companionOpen: false,
    wielding: false,
    pinned: false,
    dropdownHeld: false,
    autoHideEnabled: true,
  };
}

/** Drain leftover dropdown holds between unit tests. */
export function clearAppNavbarDropdownHoldsForTests(): void {
  if (dropdownHoldCount === 0) return;
  dropdownHoldCount = 0;
  clearAutoHideTimer();
  visible = true;
  commit();
}

export function subscribeAppNavbarChrome(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Idle auto-hide and Wield tuck are Zen-only for now.
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
    if (dropdownHoldCount === 0) {
      maybeScheduleAfterRelease();
    }
    commit();
  };
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
    if (autoHideEnabled) {
      visible = false;
      autoHideArmed = true;
    }
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
