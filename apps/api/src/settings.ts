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
  hiddenBotModelIds: string;
}

/** Shape of the next-settings result, with OpenAI key intent captured separately. */
export interface NextSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
  hiddenBotModelIds: string[];
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

export function parseHiddenBotModelIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
  } catch {
    return [];
  }
}

function readHiddenBotModelIds(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return parseHiddenBotModelIds(fallback);
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

/**
 * Defensively strip shell/.env decoration that users commonly paste into the
 * Settings API-key field when copying from a `.env` line or quoted example.
 *
 * Handles, in order:
 *   - Outer whitespace
 *   - Outer matched quotes:    "sk-..."     -> sk-...
 *   - Leading `VAR=` prefix:   OPENAI_API_KEY=sk-...  -> sk-...
 *   - Inner matched quotes:    OPENAI_API_KEY="sk-..." -> sk-...
 *
 * The `[A-Z_][A-Z0-9_]*=` shape is deliberately restrictive: real OpenAI keys
 * start with `sk-` (contains a dash, which isn't in the class) so we can't
 * accidentally chop a legitimate prefix. Regression-tested in
 * `__tests__/settings.test.ts`.
 */
export function sanitizeOpenAiKeyInput(input: string): string {
  let value = input.trim();
  if (isWrappedInMatchedQuotes(value)) {
    value = value.slice(1, -1).trim();
  }
  const prefixMatch = value.match(/^[A-Z_][A-Z0-9_]*=/i);
  if (prefixMatch) {
    value = value.slice(prefixMatch[0].length).trim();
  }
  if (isWrappedInMatchedQuotes(value)) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function isWrappedInMatchedQuotes(value: string): boolean {
  if (value.length < 2) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'");
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
  const hiddenBotModelIds = readHiddenBotModelIds(
    body.hiddenBotModelIds,
    current.hiddenBotModelIds
  );

  let openAiKeyIntent: NextSettings["openAiKeyIntent"] = { action: "keep" };
  if (typeof body.openAiApiKey === "string") {
    // Defensive strip: users commonly paste the whole `.env` line
    // (`OPENAI_API_KEY=sk-...`) or a quoted variant. Without this, the
    // server would encrypt+store a bogus Bearer token and chat would 401
    // on every turn with the decorative characters as the key prefix.
    const sanitized = sanitizeOpenAiKeyInput(body.openAiApiKey);
    if (sanitized.length > 0) {
      openAiKeyIntent = { action: "replace", plaintext: sanitized };
    }
    // Empty / whitespace string → keep. This is what lets the Settings
    // form save other fields without wiping a stored key when the field
    // is left blank.
  } else if (body.openAiApiKey === null) {
    openAiKeyIntent = { action: "clear" };
  }

  return {
    theme,
    preferredProvider,
    providerLocked,
    autoMemory,
    hiddenBotModelIds,
    openAiKeyIntent,
  };
}
