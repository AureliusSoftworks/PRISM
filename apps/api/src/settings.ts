/**
 * Pure validation + merge logic for PATCH /api/settings.
 *
 * Extracted from `server.ts` so the theme/provider/lock/openAiKey semantics
 * can be unit-tested without standing up an HTTP server. This file intentionally
 * has zero runtime dependencies beyond types — every branch is a plain function
 * of `body` and `current`, which is what makes it safe to pin in tests and
 * cheap to reason about when adding new fields.
 *
 * Any future setting added to the PATCH handler should be plumbed through
 * `resolveNextSettings` with a matching test case in
 * `__tests__/settings.test.ts` so the exact "I wiped but still logged in"
 * class of regression (server silently dropping a valid value from a new
 * client) cannot happen again.
 */
export type Theme = "light" | "dark" | "system";
export type Provider = "local" | "openai";

/** Current persisted settings loaded from the users table. */
export interface CurrentSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
}

/** Shape of the next-settings result, with OpenAI key intent captured separately. */
export interface NextSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
  /**
   * Intent for the OpenAI API key:
   *   - "replace": caller sent a non-empty string; encrypt it
   *   - "clear": caller sent explicit null; blank the stored key
   *   - "keep": caller sent undefined or an empty/whitespace string;
   *     leave the stored key alone
   */
  openAiKeyIntent: { action: "replace"; plaintext: string } | { action: "clear" } | { action: "keep" };
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isProvider(value: unknown): value is Provider {
  return value === "local" || value === "openai";
}

/**
 * Merge an incoming PATCH body into the current settings, validating each
 * field. Unknown or invalid fields fall through to the existing value — this
 * is the whole point: a partial PATCH cannot accidentally clobber other
 * settings, and sending a future-dated field the server doesn't recognise is
 * a no-op rather than a crash.
 */
export function resolveNextSettings(
  body: Record<string, unknown>,
  current: CurrentSettings
): NextSettings {
  const theme: Theme = isTheme(body.theme) ? body.theme : current.theme;
  const preferredProvider: Provider = isProvider(body.preferredProvider)
    ? body.preferredProvider
    : current.preferredProvider;
  const providerLocked =
    typeof body.providerLocked === "boolean"
      ? Number(body.providerLocked)
      : current.providerLocked;
  const autoMemory =
    typeof body.autoMemory === "boolean"
      ? Number(body.autoMemory)
      : current.autoMemory;

  let openAiKeyIntent: NextSettings["openAiKeyIntent"] = { action: "keep" };
  if (typeof body.openAiApiKey === "string") {
    const trimmed = body.openAiApiKey.trim();
    if (trimmed.length > 0) {
      openAiKeyIntent = { action: "replace", plaintext: trimmed };
    }
    // Empty / whitespace string → keep. This is what lets the Settings
    // form save other fields without wiping a stored key when the field
    // is left blank.
  } else if (body.openAiApiKey === null) {
    openAiKeyIntent = { action: "clear" };
  }

  return { theme, preferredProvider, providerLocked, autoMemory, openAiKeyIntent };
}
