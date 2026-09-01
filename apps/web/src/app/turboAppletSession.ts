export const TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY =
  "prism:turbo-applet-context:v1";

export interface TurboAppletSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function turboAppletSessionContextStorageKey(ownerId: string): string {
  return `${TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY}:${encodeURIComponent(
    ownerId,
  )}`;
}

/**
 * Records the applet that currently owns Turbo for this browser session.
 * Returns true when Turbo must be disabled because the applet context changed.
 */
export function syncTurboAppletSessionContext(
  storage: TurboAppletSessionStorage | null,
  previousRuntimeContext: string | null,
  nextContext: string,
  ownerId: string,
): boolean {
  const ownerStorageKey = turboAppletSessionContextStorageKey(ownerId);
  let previousContext = previousRuntimeContext;
  if (previousContext === null && storage) {
    try {
      previousContext = storage.getItem(ownerStorageKey);
    } catch {
      previousContext = null;
    }
  }

  if (storage) {
    try {
      // Never read the pre-namespace value. Removing it prevents a legacy
      // account identifier from remaining visible to later owners.
      storage.removeItem?.(TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY);
      storage.setItem(ownerStorageKey, nextContext);
    } catch {
      // A blocked session store keeps the conservative fresh-load reset below.
    }
  }

  return previousContext !== nextContext;
}
