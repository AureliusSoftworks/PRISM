export type PrismVisualLifecycle = "foreground" | "suspended";

export interface PrismVisualLifecycleSnapshot {
  lifecycle: PrismVisualLifecycle;
  visible: boolean;
  focused: boolean;
  pageHidden: boolean;
  systemPaused: boolean;
  reducedMotion: boolean;
  revision: number;
}

export type PrismVisualLifecycleEvent =
  | { type: "visibility"; hidden: boolean }
  | { type: "focus" }
  | { type: "blur" }
  | { type: "pagehide" }
  | { type: "pageshow"; hidden: boolean; focused: boolean }
  | { type: "system-pause"; active: boolean }
  | { type: "reduced-motion"; matches: boolean };

type Listener = () => void;

export function resolvePrismVisualLifecycle(options: {
  hidden: boolean;
  focused: boolean;
  pageHidden: boolean;
  systemPaused?: boolean;
}): PrismVisualLifecycle {
  return options.hidden ||
    !options.focused ||
    options.pageHidden ||
    options.systemPaused
    ? "suspended"
    : "foreground";
}

export class PrismVisualLifecycleController {
  private snapshotValue: PrismVisualLifecycleSnapshot;

  constructor(options: {
    hidden: boolean;
    focused: boolean;
    reducedMotion: boolean;
    pageHidden?: boolean;
    systemPaused?: boolean;
  }) {
    const pageHidden = options.pageHidden ?? false;
    const systemPaused = options.systemPaused ?? false;
    this.snapshotValue = {
      lifecycle: resolvePrismVisualLifecycle({
        hidden: options.hidden,
        focused: options.focused,
        pageHidden,
        systemPaused,
      }),
      visible: !options.hidden,
      focused: options.focused,
      pageHidden,
      systemPaused,
      reducedMotion: options.reducedMotion,
      revision: 0,
    };
  }

  get snapshot(): PrismVisualLifecycleSnapshot {
    return this.snapshotValue;
  }

  dispatch(event: PrismVisualLifecycleEvent): PrismVisualLifecycleSnapshot {
    let hidden = !this.snapshotValue.visible;
    let focused = this.snapshotValue.focused;
    let pageHidden = this.snapshotValue.pageHidden;
    let systemPaused = this.snapshotValue.systemPaused;
    let reducedMotion = this.snapshotValue.reducedMotion;

    switch (event.type) {
      case "visibility":
        hidden = event.hidden;
        if (!event.hidden) pageHidden = false;
        break;
      case "focus":
        focused = true;
        pageHidden = false;
        break;
      case "blur":
        focused = false;
        break;
      case "pagehide":
        pageHidden = true;
        break;
      case "pageshow":
        pageHidden = false;
        hidden = event.hidden;
        focused = event.focused;
        break;
      case "system-pause":
        systemPaused = event.active;
        break;
      case "reduced-motion":
        reducedMotion = event.matches;
        break;
    }

    const lifecycle = resolvePrismVisualLifecycle({
      hidden,
      focused,
      pageHidden,
      systemPaused,
    });
    const next = {
      lifecycle,
      visible: !hidden,
      focused,
      pageHidden,
      systemPaused,
      reducedMotion,
      revision: this.snapshotValue.revision + 1,
    } satisfies PrismVisualLifecycleSnapshot;
    this.snapshotValue = next;
    return next;
  }
}

const SERVER_SNAPSHOT: PrismVisualLifecycleSnapshot = {
  lifecycle: "suspended",
  visible: false,
  focused: false,
  pageHidden: true,
  systemPaused: false,
  reducedMotion: false,
  revision: 0,
};

const listeners = new Set<Listener>();
const systemPauseReasons = new Set<string>();
let currentSnapshot = SERVER_SNAPSHOT;
let releaseBrowserListeners: (() => void) | null = null;
let publishSystemPause: ((active: boolean) => void) | null = null;
let browserOwnerCount = 0;

function emit(snapshot: PrismVisualLifecycleSnapshot): void {
  currentSnapshot = snapshot;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.prismVisualLifecycle =
      snapshot.lifecycle;
    if (snapshot.systemPaused) {
      document.documentElement.dataset.prismSystemPaused = "true";
    } else {
      document.documentElement.removeAttribute("data-prism-system-paused");
    }
    document.documentElement.dataset.prismReducedMotion = snapshot.reducedMotion
      ? "true"
      : "false";
  }
  for (const listener of listeners) listener();
}

function attachBrowserListeners(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new PrismVisualLifecycleController({
    hidden: document.hidden,
    focused: document.hasFocus(),
    reducedMotion: reducedMotion.matches,
    systemPaused: systemPauseReasons.size > 0,
  });
  emit(controller.snapshot);

  const publish = (event: PrismVisualLifecycleEvent): void => {
    emit(controller.dispatch(event));
  };
  const handleVisibility = (): void =>
    publish({ type: "visibility", hidden: document.hidden });
  const handleFocus = (): void => publish({ type: "focus" });
  const handleBlur = (): void => publish({ type: "blur" });
  const handlePageHide = (): void => publish({ type: "pagehide" });
  const handlePageShow = (): void =>
    publish({
      type: "pageshow",
      hidden: document.hidden,
      focused: document.hasFocus(),
    });
  const handleReducedMotion = (event: MediaQueryListEvent): void =>
    publish({ type: "reduced-motion", matches: event.matches });
  publishSystemPause = (active: boolean): void => {
    publish({ type: "system-pause", active });
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  reducedMotion.addEventListener("change", handleReducedMotion);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    reducedMotion.removeEventListener("change", handleReducedMotion);
    publishSystemPause = null;
    document.documentElement.removeAttribute("data-prism-visual-lifecycle");
    document.documentElement.removeAttribute("data-prism-system-paused");
    document.documentElement.removeAttribute("data-prism-reduced-motion");
    currentSnapshot = SERVER_SNAPSHOT;
  };
}

export function acquirePrismVisualLifecycle(): () => void {
  browserOwnerCount += 1;
  if (!releaseBrowserListeners) {
    releaseBrowserListeners = attachBrowserListeners();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    browserOwnerCount = Math.max(0, browserOwnerCount - 1);
    if (browserOwnerCount > 0) return;
    releaseBrowserListeners?.();
    releaseBrowserListeners = null;
  };
}

export function getPrismVisualLifecycleSnapshot(): PrismVisualLifecycleSnapshot {
  return currentSnapshot;
}

export function getPrismVisualLifecycleServerSnapshot(): PrismVisualLifecycleSnapshot {
  return SERVER_SNAPSHOT;
}

export function getPrismSystemPausedSnapshot(): boolean {
  return currentSnapshot.systemPaused;
}

export function getPrismSystemPausedServerSnapshot(): boolean {
  return false;
}

export function setPrismSystemPause(reason: string, active: boolean): void {
  const wasPaused = systemPauseReasons.size > 0;
  if (active) systemPauseReasons.add(reason);
  else systemPauseReasons.delete(reason);
  const isPaused = systemPauseReasons.size > 0;
  if (wasPaused !== isPaused) publishSystemPause?.(isPaused);
}

export function subscribePrismVisualLifecycle(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetPrismVisualLifecycleForTests(): void {
  releaseBrowserListeners?.();
  releaseBrowserListeners = null;
  browserOwnerCount = 0;
  currentSnapshot = SERVER_SNAPSHOT;
  systemPauseReasons.clear();
  listeners.clear();
}
