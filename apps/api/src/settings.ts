import type { ComfyUiWorkflowRegistration } from "@localai/shared";
import { validateComfyUiWorkflowsPayload } from "@localai/shared";
import { sanitizeHiddenModelIds } from "./model-routing.ts";

/**
 * Pure validation + merge logic for PATCH /api/settings.
 *
 * Extracted from `server.ts` so the theme/provider/lock/openAiKey semantics
 * can be unit-tested without standing up an HTTP server. This file keeps
 * runtime dependencies minimal (shared validation for ComfyUI workflow JSON);
 * every merge branch is a plain function of `body` and `current`, which is
 * what makes it safe to pin in tests and cheap to reason about when adding
 * new fields.
 *
 * Any future setting added to the PATCH handler should be plumbed through
 * `resolveNextSettings` with a matching test case in
 * `__tests__/settings.test.ts` so the exact "I wiped but still logged in"
 * class of regression (server silently dropping a valid value from a new
 * client) cannot happen again.
 */
export type Theme = "light" | "dark" | "system";
export type Provider = "local" | "openai" | "anthropic";

const LOOPBACK_OLLAMA_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
  "host.docker.internal",
]);

/** Current persisted settings loaded from the users table. */
export interface CurrentSettings {
  displayName: string;
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
  composerWritingAssist: number;
  /** 1 = show left-edge stripe on assistant bubbles when the copyright lenient fallback answered. */
  fallbackModelMessageStripe: number;
  hiddenBotModelIds: string;
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalFallbackModel: string | null;
  lenientLocalImageFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  preferredLocalImageModel: string | null;
  preferredOpenAiImageModel: string | null;
  /** Parsed `users.comfyui_workflows` JSON; empty when unset or invalid. */
  comfyUiWorkflows: ComfyUiWorkflowRegistration[];
  /** Null/empty → server `OLLAMA_AUXILIARY_MODEL` (default llama3.2). */
  prismDefaultLlmModel: string | null;
  /** Null/empty → use normal hub chat model for turns that emit `sendGeneratedImage`. */
  prismImageToolLlmModel: string | null;
  primaryOllamaHost: string;
}

/** Shape of the next-settings result, with OpenAI key intent captured separately. */
export interface NextSettings {
  displayName: string;
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
  composerWritingAssist: number;
  fallbackModelMessageStripe: number;
  hiddenBotModelIds: string[];
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalFallbackModel: string | null;
  lenientLocalImageFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  preferredLocalImageModel: string | null;
  preferredOpenAiImageModel: string | null;
  comfyUiWorkflows: ComfyUiWorkflowRegistration[];
  prismDefaultLlmModel: string | null;
  prismImageToolLlmModel: string | null;
  /**
   * Intent for the OpenAI API key:
   *   - "replace": caller sent a non-empty string; encrypt it
   *   - "clear": caller sent explicit null; blank the stored key
   *   - "keep": caller sent undefined or an empty/whitespace string;
   *     leave the stored key alone
   */
  openAiKeyIntent: { action: "replace"; plaintext: string } | { action: "clear" } | { action: "keep" };
  anthropicKeyIntent: { action: "replace"; plaintext: string } | { action: "clear" } | { action: "keep" };
  elevenLabsKeyIntent: { action: "replace"; plaintext: string } | { action: "clear" } | { action: "keep" };
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isProvider(value: unknown): value is Provider {
  return value === "local" || value === "openai" || value === "anthropic";
}

function normalizeOllamaHostValue(input: string): string {
  const raw = input.trim();
  if (!raw) {
    return "";
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(
    /\/\/0\.0\.0\.0(?=$|[:\/])/i,
    "//127.0.0.1"
  );
  normalized = normalized.replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Second Ollama host must be a valid host or URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Second Ollama host must use http:// or https://.");
  }
  return normalized;
}

function normalizeComfyUiHostValue(input: string): string {
  const raw = input.trim();
  if (!raw) {
    return "";
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(
    /\/\/0\.0\.0\.0(?=$|[:\/])/i,
    "//127.0.0.1"
  );
  normalized = normalized.replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("ComfyUI host must be a valid host or URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ComfyUI host must use http:// or https://.");
  }
  return normalized;
}

function canonicalOllamaHostname(host: string): string {
  try {
    const parsed = new URL(normalizeOllamaHostValue(host));
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return LOOPBACK_OLLAMA_HOSTNAMES.has(hostname) ? "loopback" : hostname;
  } catch {
    return host.trim().toLowerCase();
  }
}

export function normalizeSecondaryOllamaHostInput(
  value: unknown,
  primaryOllamaHost: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.trim().length === 0) {
    return null;
  }

  const normalized = normalizeOllamaHostValue(value);
  if (
    canonicalOllamaHostname(normalized) === canonicalOllamaHostname(primaryOllamaHost)
  ) {
    throw new Error("Second Ollama host must use a different IP address than the primary host.");
  }
  return normalized;
}

/**
 * Normalize a host value for *connectivity checks only*.
 *
 * Unlike `normalizeSecondaryOllamaHostInput`, this intentionally does NOT
 * enforce the "must differ from primary host" rule. The settings UI uses it
 * for immediate status probes while the user is typing so valid hosts (even
 * the primary one) can report real reachability.
 */
export function normalizeOllamaHostForStatusCheck(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeOllamaHostValue(trimmed);
}

/**
 * Normalize ComfyUI base URL for connectivity probes (same rules as Ollama URL normalization).
 */
export function normalizeComfyUiHostForStatusCheck(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return normalizeComfyUiHostValue(trimmed);
  } catch {
    return null;
  }
}

export function normalizeComfyUiHostInput(
  value: unknown
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.trim().length === 0) {
    return null;
  }
  return normalizeComfyUiHostValue(value.trim());
}

export function parseHiddenBotModelIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sanitizeHiddenModelIds(Array.from(
      new Set(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ));
  } catch {
    return [];
  }
}

function readHiddenBotModelIds(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return parseHiddenBotModelIds(fallback);
  return sanitizeHiddenModelIds(Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ));
}

function readPreferredModel(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, 80);
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

export function sanitizeAnthropicKeyInput(input: string): string {
  return sanitizeOpenAiKeyInput(input);
}

export function sanitizeElevenLabsKeyInput(input: string): string {
  return sanitizeOpenAiKeyInput(input);
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
  const displayName = readDisplayName(body.displayName, current.displayName);
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
  const composerWritingAssist =
    typeof body.composerWritingAssist === "boolean"
      ? Number(body.composerWritingAssist)
      : current.composerWritingAssist;
  const fallbackModelMessageStripe =
    typeof body.fallbackModelMessageStripe === "boolean"
      ? Number(body.fallbackModelMessageStripe)
      : current.fallbackModelMessageStripe;
  const hiddenBotModelIds = readHiddenBotModelIds(
    body.hiddenBotModelIds,
    current.hiddenBotModelIds
  );
  const preferredLocalModel = readPreferredModel(
    body.preferredLocalModel,
    current.preferredLocalModel
  );
  const preferredOnlineModel = readPreferredModel(
    body.preferredOnlineModel,
    current.preferredOnlineModel
  );
  const lenientLocalFallbackModel = readPreferredModel(
    body.lenientLocalFallbackModel,
    current.lenientLocalFallbackModel
  );
  const lenientLocalImageFallbackModel = readPreferredModel(
    body.lenientLocalImageFallbackModel,
    current.lenientLocalImageFallbackModel
  );
  const normalizedSecondaryOllamaHost = normalizeSecondaryOllamaHostInput(
    body.secondaryOllamaHost,
    current.primaryOllamaHost
  );
  const secondaryOllamaHost =
    normalizedSecondaryOllamaHost === undefined
      ? current.secondaryOllamaHost
      : normalizedSecondaryOllamaHost;

  const normalizedComfyUiHost = normalizeComfyUiHostInput(body.comfyUiHost);
  const comfyUiHost =
    normalizedComfyUiHost === undefined ? current.comfyUiHost : normalizedComfyUiHost;

  const preferredLocalImageModel = readPreferredModel(
    body.preferredLocalImageModel,
    current.preferredLocalImageModel
  );
  const preferredOpenAiImageModel = readPreferredModel(
    body.preferredOpenAiImageModel,
    current.preferredOpenAiImageModel
  );
  const prismDefaultLlmModel = readPreferredModel(
    body.prismDefaultLlmModel,
    current.prismDefaultLlmModel
  );
  const prismImageToolLlmModel = readPreferredModel(
    body.prismImageToolLlmModel,
    current.prismImageToolLlmModel
  );

  const comfyUiWorkflows =
    body.comfyUiWorkflows === undefined
      ? current.comfyUiWorkflows
      : validateComfyUiWorkflowsPayload(body.comfyUiWorkflows);

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

  let anthropicKeyIntent: NextSettings["anthropicKeyIntent"] = { action: "keep" };
  if (typeof body.anthropicApiKey === "string") {
    const sanitized = sanitizeAnthropicKeyInput(body.anthropicApiKey);
    if (sanitized.length > 0) {
      anthropicKeyIntent = { action: "replace", plaintext: sanitized };
    }
  } else if (body.anthropicApiKey === null) {
    anthropicKeyIntent = { action: "clear" };
  }

  let elevenLabsKeyIntent: NextSettings["elevenLabsKeyIntent"] = { action: "keep" };
  if (typeof body.elevenLabsApiKey === "string") {
    const sanitized = sanitizeElevenLabsKeyInput(body.elevenLabsApiKey);
    if (sanitized.length > 0) {
      elevenLabsKeyIntent = { action: "replace", plaintext: sanitized };
    }
  } else if (body.elevenLabsApiKey === null) {
    elevenLabsKeyIntent = { action: "clear" };
  }

  return {
    displayName,
    theme,
    preferredProvider,
    providerLocked,
    autoMemory,
    composerWritingAssist,
    fallbackModelMessageStripe,
    hiddenBotModelIds,
    preferredLocalModel,
    preferredOnlineModel,
    lenientLocalFallbackModel,
    lenientLocalImageFallbackModel,
    secondaryOllamaHost,
    comfyUiHost,
    preferredLocalImageModel,
    preferredOpenAiImageModel,
    comfyUiWorkflows,
    prismDefaultLlmModel,
    prismImageToolLlmModel,
    openAiKeyIntent,
    anthropicKeyIntent,
    elevenLabsKeyIntent,
  };
}
