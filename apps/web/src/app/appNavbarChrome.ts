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
  autoHideEnabled: boolean;
};

type Listener = () => void;

let visible = true;
let autoHideArmed = false;
let autoHideEnabled = true;
let pinned = false;
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

function computeHidden(): boolean {
  if (companionOpen) return false;
  // Wield tuck is Zen-only; other modes keep the bar even while Wielding.
  if (wielding && autoHideEnabled) return true;
  if (pinned) return false;
  return !visible;
}

function syncDocumentAttributes(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (companionOpen) root.setAttribute("data-prism-companion-open", "true");
  else root.removeAttribute("data-prism-companion-open");
  if (wielding) root.setAttribute("data-prism-wielding", "true");
  else root.removeAttribute("data-prism-wielding");
  if (computeHidden()) root.setAttribute("data-app-navbar-hidden", "true");
  else root.removeAttribute("data-app-navbar-hidden");
}

function commit(): void {
  syncDocumentAttributes();
  emit();
}

export function getAppNavbarChromeSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: computeHidden(),
    companionOpen,
    wielding,
    pinned,
    autoHideEnabled,
  };
}

export function getAppNavbarChromeServerSnapshot(): AppNavbarChromeSnapshot {
  return {
    hidden: false,
    companionOpen: false,
    wielding: false,
    pinned: false,
    autoHideEnabled: true,
  };
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
  } else if (
    autoHideEnabled &&
    autoHideArmed &&
    !companionOpen &&
    !wielding
  ) {
    scheduleAppNavbarAutoHide();
  }
  commit();
}

export function setAppNavbarCompanionOpen(open: boolean): void {
  if (companionOpen === open) return;
  companionOpen = open;
  if (open) {
    clearAutoHideTimer();
    visible = true;
  } else if (
    autoHideEnabled &&
    autoHideArmed &&
    !wielding &&
    !pinned
  ) {
    scheduleAppNavbarAutoHide();
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
    if (
      autoHideEnabled &&
      autoHideArmed &&
      !companionOpen &&
      !pinned
    ) {
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
    !companionOpen &&
    !wielding &&
    !pinned
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
  if (companionOpen || pinned) {
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
  if (!companionOpen && !wielding && !pinned) {
    scheduleAppNavbarAutoHide();
  }
}

export function scheduleAppNavbarAutoHide(): void {
  if (
    !autoHideEnabled ||
    !autoHideArmed ||
    companionOpen ||
    wielding ||
    pinned
  ) {
    return;
  }
  clearAutoHideTimer();
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null;
    if (!autoHideEnabled || companionOpen || wielding || pinned) return;
    visible = false;
    commit();
  }, APP_NAVBAR_REVEAL_HOLD_MS);
}

export function revealAppNavbarFromPointerClientY(clientY: number): void {
  if (!computeHidden()) return;
  if (clientY > APP_NAVBAR_REVEAL_EDGE_PX) return;
  revealAppNavbarTemporarily();
}
