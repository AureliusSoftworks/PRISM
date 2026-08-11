export const TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY =
  "prism:turbo-applet-context:v1";

export interface TurboAppletSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Records the applet that currently owns Turbo for this browser session.
 * Returns true when Turbo must be disabled because the applet context changed.
 */
export function syncTurboAppletSessionContext(
  storage: TurboAppletSessionStorage | null,
  previousRuntimeContext: string | null,
  nextContext: string,
): boolean {
  let previousContext = previousRuntimeContext;
  if (previousContext === null && storage) {
    try {
      previousContext = storage.getItem(
        TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY,
      );
    } catch {
      previousContext = null;
    }
  }

  if (storage) {
    try {
      storage.setItem(TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY, nextContext);
    } catch {
      // A blocked session store keeps the conservative fresh-load reset below.
    }
  }

  return previousContext !== nextContext;
}
