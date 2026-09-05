export const LEGACY_BROWSER_BEARER_STORAGE_KEYS = Object.freeze([
  "prism_native_session_token",
  "prism_client_access_token",
] as const);

interface RemovableStorage {
  removeItem(key: string): void;
}

/**
 * Browser authentication is cookie-only. Remove bearer values left by older
 * desktop/browser builds without ever reading or copying them into JavaScript.
 */
export function purgeLegacyBrowserBearerCredentials(args: {
  localStorage?: RemovableStorage | null;
  sessionStorage?: RemovableStorage | null;
}): void {
  for (const storage of [args.localStorage, args.sessionStorage]) {
    if (!storage) continue;
    for (const key of LEGACY_BROWSER_BEARER_STORAGE_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Cookie-backed auth remains available when storage is inaccessible.
      }
    }
  }
}
