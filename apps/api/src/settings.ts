import type {
  ComfyUiWorkflowRegistration,
  EnglishVoiceEngine,
  VoiceMode,
} from "@localai/shared";
import {
  DEFAULT_PRISM_MOOD_SENSITIVITY,
  isComfyUiRemoteWorkflowModelId,
  isComfyUiWorkflowModelId,
  MAX_PRISM_MOOD_SENSITIVITY,
  MIN_PRISM_MOOD_SENSITIVITY,
  normalizePrismMoodSensitivity,
  validateComfyUiWorkflowsPayload,
  normalizeBotVoiceVolume,
  normalizeVoiceMode,
  BOT_AUDIO_VOICE_IDS,
  parseStoredAutoFallbackChain,
  normalizeAutoFallbackChain,
  serializeAutoFallbackChain,
  type BotAudioVoiceId,
  type ImageProviderName,
  isImageProviderName,
} from "@localai/shared";
import { sanitizeHiddenModelIds } from "./model-routing.ts";
import { requirePrivateNetworkHttpUrl } from "./local-network-host.ts";

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

export interface ElevenLabsVoiceBank {
  [voiceId: string]: string | null;
}

export function normalizeElevenLabsVoiceBank(value: unknown): ElevenLabsVoiceBank {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(BOT_AUDIO_VOICE_IDS.map((slot) => {
    const raw = record[slot];
    const voiceId = typeof raw === "string" ? raw.trim().slice(0, 160) : "";
    return [slot, voiceId || null];
  })) as Record<BotAudioVoiceId, string | null>;
}

export function parseStoredElevenLabsVoiceBank(value: string | null | undefined): ElevenLabsVoiceBank {
  if (!value) return normalizeElevenLabsVoiceBank({});
  try { return normalizeElevenLabsVoiceBank(JSON.parse(value)); } catch { return normalizeElevenLabsVoiceBank({}); }
}

function normalizeElevenLabsVoiceModel(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, 160);
  return normalized || null;
}

export function normalizeElevenLabsVoiceCollectionId(
  value: unknown,
  fallback: string | null = null
): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, 160);
  return normalized || null;
}

export const DEFAULT_ZEN_WALLPAPER_OPACITY = 0.28;
export const MIN_ZEN_WALLPAPER_OPACITY = 0.05;
export const MAX_ZEN_WALLPAPER_OPACITY = 1;
export const DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED = true;
export const DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED = true;
export const DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED = true;
export const DEFAULT_ZEN_WALLPAPER_STYLE_NOTES = "";
export const MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH = 320;
export const DEFAULT_ZEN_SESSION_IDLE_GAP_MS = 12 * 60 * 60 * 1000;
export const MIN_ZEN_SESSION_IDLE_GAP_MS = 15 * 60 * 1000;
export const MAX_ZEN_SESSION_IDLE_GAP_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_ZEN_FRESH_START_GAP_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ZEN_FRESH_START_GAP_MS = DEFAULT_ZEN_SESSION_IDLE_GAP_MS;
export const MAX_ZEN_FRESH_START_GAP_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_ZEN_RECENT_CONTEXT_MESSAGES = 30;
export const MIN_ZEN_RECENT_CONTEXT_MESSAGES = 10;
export const MAX_ZEN_RECENT_CONTEXT_MESSAGES = 80;
export const DEFAULT_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL = 30;
export const MIN_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL = 3;
export const MAX_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL = 100;
export const DEFAULT_ZEN_MOOD_SENSITIVITY = DEFAULT_PRISM_MOOD_SENSITIVITY;
export const MIN_ZEN_MOOD_SENSITIVITY = MIN_PRISM_MOOD_SENSITIVITY;
export const MAX_ZEN_MOOD_SENSITIVITY = MAX_PRISM_MOOD_SENSITIVITY;
export const DEFAULT_ZEN_CANVAS_TYPING_SPEED = 1;
export const MIN_ZEN_CANVAS_TYPING_SPEED = 0.25;
export const MAX_ZEN_CANVAS_TYPING_SPEED = 3;
export const DEFAULT_ZEN_MESSAGE_FONT_MIN_PX = 15.8;
export const DEFAULT_ZEN_MESSAGE_FONT_MAX_PX = 32.8;
export const MIN_ZEN_MESSAGE_FONT_SIZE_PX = 12;
export const MAX_ZEN_MESSAGE_FONT_SIZE_PX = 42;
export const DEFAULT_ZEN_ASK_QUESTION_PATIENCE_ENABLED = false;
export const DEFAULT_ZEN_ASK_QUESTION_PATIENCE_MS = 60_000;
export const MIN_ZEN_ASK_QUESTION_PATIENCE_MS = 10_000;
export const MAX_ZEN_ASK_QUESTION_PATIENCE_MS = 60_000;
export const STEP_ZEN_ASK_QUESTION_PATIENCE_MS = 10_000;
export type ZenPersonaTransitionChoice =
  | "random"
  | "new-speaks"
  | "previous-introduces"
  | "off";
export const DEFAULT_ZEN_PERSONA_TRANSITION_CHOICE: ZenPersonaTransitionChoice = "random";

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
  preferredImageProvider: ImageProviderName;
  providerLocked: number;
  autoMemory: number;
  composerWritingAssist: number;
  experimentalDualOllamaEnabled: number;
  experimentalAllModelEffortEnabled: number;
  coffeeExperimentalTableAngleEnabled: number;
  signalImmersiveVoiceEffectsEnabled: number;
  psychicModeEnabled: number;
  /** Saved preference only. Auto is still gated per Zen/Coffee context. */
  autoSwitchModel: number;
  /** Versioned JSON stored in `users.auto_fallback_chain`. */
  autoFallbackChain: string | null;
  hiddenBotModelIds: string;
  hiddenComfyUiWorkflowIds: string;
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalImageFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  preferredLocalImageModel: string | null;
  preferredOpenAiImageModel: string | null;
  preferredZenWallpaperLocalImageModel: string | null;
  preferredZenWallpaperOpenAiImageModel: string | null;
  zenWallpaperOpacity: number | null;
  zenWallpaperTextMaskEnabled: number | null;
  zenWallpaperGrayscaleEnabled: number | null;
  zenWallpaperBlurredEdgesEnabled: number | null;
  zenWallpaperStyleNotes: string | null;
  zenSessionIdleGapMs: number | null;
  zenFreshStartGapMs: number | null;
  zenRecentContextMessages: number | null;
  zenWallpaperRegenMessageInterval: number | null;
  zenMoodSensitivity: number | null;
  zenCanvasTypingSpeed: number | null;
  zenMessageFontMinPx: number | null;
  zenMessageFontMaxPx: number | null;
  zenAskQuestionPatienceEnabled: number | null;
  zenAskQuestionPatienceMs: number | null;
  zenAutonomyEnabled: number | null;
  zenPersonaTransitionChoice: string | null;
  /** Parsed `users.comfyui_workflows` JSON; empty when unset or invalid. */
  comfyUiWorkflows: ComfyUiWorkflowRegistration[];
  /** Null/empty → server `OLLAMA_AUXILIARY_MODEL` (default llama3.2). */
  prismDefaultLlmModel: string | null;
  /** Null/empty → use normal hub chat model for turns that emit `sendGeneratedImage`. */
  prismImageToolLlmModel: string | null;
  primaryOllamaHost: string;
  voiceMode: VoiceMode | string | null;
  voiceEffectsEnabled: number;
  voiceVolume: number | null;
  /** Compatibility column storing the selected ONLINE engine; LOCAL is always builtin. */
  englishVoiceEngine: EnglishVoiceEngine | string | null;
  defaultSystemVoiceName: string | null;
  defaultElevenLabsVoiceId: string | null;
  elevenLabsVoiceBank: string | null;
  elevenLabsVoiceModel: string | null;
  elevenLabsVoiceCollectionId: string | null;
}

/** Shape of the next-settings result, with OpenAI key intent captured separately. */
export interface NextSettings {
  displayName: string;
  theme: Theme;
  preferredProvider: Provider;
  preferredImageProvider: ImageProviderName;
  providerLocked: number;
  autoMemory: number;
  composerWritingAssist: number;
  experimentalDualOllamaEnabled: number;
  experimentalAllModelEffortEnabled: number;
  coffeeExperimentalTableAngleEnabled: number;
  signalImmersiveVoiceEffectsEnabled: boolean;
  psychicModeEnabled: number;
  autoSwitchModel: number;
  autoFallbackChain: string | null;
  hiddenBotModelIds: string[];
  hiddenComfyUiWorkflowIds: string[];
  preferredLocalModel: string | null;
  preferredOnlineModel: string | null;
  lenientLocalImageFallbackModel: string | null;
  secondaryOllamaHost: string | null;
  comfyUiHost: string | null;
  preferredLocalImageModel: string | null;
  preferredOpenAiImageModel: string | null;
  preferredZenWallpaperLocalImageModel: string | null;
  preferredZenWallpaperOpenAiImageModel: string | null;
  zenWallpaperOpacity: number;
  zenWallpaperTextMaskEnabled: boolean;
  zenWallpaperGrayscaleEnabled: boolean;
  zenWallpaperBlurredEdgesEnabled: boolean;
  zenWallpaperStyleNotes: string;
  zenSessionIdleGapMs: number;
  zenFreshStartGapMs: number;
  zenRecentContextMessages: number;
  zenWallpaperRegenMessageInterval: number;
  zenMoodSensitivity: number;
  zenCanvasTypingSpeed: number;
  zenMessageFontMinPx: number;
  zenMessageFontMaxPx: number;
  zenAskQuestionPatienceEnabled: boolean;
  zenAskQuestionPatienceMs: number;
  zenAutonomyEnabled: boolean;
  zenPersonaTransitionChoice: ZenPersonaTransitionChoice;
  comfyUiWorkflows: ComfyUiWorkflowRegistration[];
  prismDefaultLlmModel: string | null;
  prismImageToolLlmModel: string | null;
  voiceMode: VoiceMode;
  voiceEffectsEnabled: boolean;
  voiceVolume: number;
  /** Selected ONLINE engine only; LOCAL English always resolves to builtin. */
  englishVoiceEngine: EnglishVoiceEngine;
  defaultSystemVoiceName: string | null;
  defaultElevenLabsVoiceId: string | null;
  elevenLabsVoiceBank: ElevenLabsVoiceBank;
  elevenLabsVoiceModel: string | null;
  elevenLabsVoiceCollectionId: string | null;
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
  braveSearchKeyIntent: { action: "replace"; plaintext: string } | { action: "clear" } | { action: "keep" };
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isProvider(value: unknown): value is Provider {
  return value === "local" || value === "openai" || value === "anthropic";
}

function isZenPersonaTransitionChoice(
  value: unknown
): value is ZenPersonaTransitionChoice {
  return (
    value === "random" ||
    value === "new-speaks" ||
    value === "previous-introduces" ||
    value === "off"
  );
}

export function normalizeZenPersonaTransitionChoice(
  value: unknown,
  fallback: ZenPersonaTransitionChoice = DEFAULT_ZEN_PERSONA_TRANSITION_CHOICE
): ZenPersonaTransitionChoice {
  return isZenPersonaTransitionChoice(value) ? value : fallback;
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
    throw new Error("Paired Ollama host must be a valid host or URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Paired Ollama host must use http:// or https://.");
  }
  return requirePrivateNetworkHttpUrl(normalized, "Paired Ollama host");
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
  return requirePrivateNetworkHttpUrl(normalized, "ComfyUI host");
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
    throw new Error("Paired Ollama host must use a different IP address than the primary host.");
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

function sanitizeHiddenComfyUiWorkflowIds(ids: string[]): string[] {
  return sanitizeHiddenModelIds(ids).filter(
    (id) => isComfyUiRemoteWorkflowModelId(id) || isComfyUiWorkflowModelId(id)
  );
}

export function parseHiddenComfyUiWorkflowIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sanitizeHiddenComfyUiWorkflowIds(Array.from(
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

function readHiddenComfyUiWorkflowIds(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return parseHiddenComfyUiWorkflowIds(fallback);
  return sanitizeHiddenComfyUiWorkflowIds(Array.from(
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

export function normalizeZenWallpaperOpacity(
  value: unknown,
  fallback = DEFAULT_ZEN_WALLPAPER_OPACITY
): number {
  const fallbackNumber =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : DEFAULT_ZEN_WALLPAPER_OPACITY;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallbackNumber;
  const clamped = Math.min(
    MAX_ZEN_WALLPAPER_OPACITY,
    Math.max(MIN_ZEN_WALLPAPER_OPACITY, normalized)
  );
  return Number(clamped.toFixed(2));
}

function normalizeBooleanLikeSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return Boolean(fallback);
}

export function normalizeZenWallpaperTextMaskEnabled(
  _value: unknown,
  _fallback = DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED
): boolean {
  return DEFAULT_ZEN_WALLPAPER_TEXT_MASK_ENABLED;
}

export function normalizeZenWallpaperGrayscaleEnabled(
  value: unknown,
  fallback = DEFAULT_ZEN_WALLPAPER_GRAYSCALE_ENABLED
): boolean {
  return normalizeBooleanLikeSetting(value, fallback);
}

export function normalizeZenWallpaperBlurredEdgesEnabled(
  value: unknown,
  fallback = DEFAULT_ZEN_WALLPAPER_BLURRED_EDGES_ENABLED
): boolean {
  return normalizeBooleanLikeSetting(value, fallback);
}

export function normalizeZenWallpaperStyleNotes(
  value: unknown,
  fallback = DEFAULT_ZEN_WALLPAPER_STYLE_NOTES
): string {
  if (value === undefined || typeof value !== "string") {
    return normalizeZenWallpaperStyleNotes(fallback, DEFAULT_ZEN_WALLPAPER_STYLE_NOTES);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH) {
    return normalized;
  }
  return normalized
    .slice(0, MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH)
    .trimEnd();
}

function normalizeNumberSetting(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const fallbackNumber =
    typeof fallback === "number" && Number.isFinite(fallback) ? fallback : min;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallbackNumber;
  return Math.min(max, Math.max(min, Math.round(normalized)));
}

export function normalizeZenSessionIdleGapMs(
  value: unknown,
  fallback = DEFAULT_ZEN_SESSION_IDLE_GAP_MS
): number {
  return normalizeNumberSetting(
    value,
    fallback,
    MIN_ZEN_SESSION_IDLE_GAP_MS,
    MAX_ZEN_SESSION_IDLE_GAP_MS
  );
}

export function normalizeZenFreshStartGapMs(
  value: unknown,
  fallback = DEFAULT_ZEN_FRESH_START_GAP_MS,
  idleGapMs = DEFAULT_ZEN_SESSION_IDLE_GAP_MS
): number {
  const minimum = Math.max(MIN_ZEN_FRESH_START_GAP_MS, normalizeZenSessionIdleGapMs(idleGapMs));
  return normalizeNumberSetting(value, Math.max(fallback, minimum), minimum, MAX_ZEN_FRESH_START_GAP_MS);
}

export function normalizeZenRecentContextMessages(
  value: unknown,
  fallback = DEFAULT_ZEN_RECENT_CONTEXT_MESSAGES
): number {
  return normalizeNumberSetting(
    value,
    fallback,
    MIN_ZEN_RECENT_CONTEXT_MESSAGES,
    MAX_ZEN_RECENT_CONTEXT_MESSAGES
  );
}

export function normalizeZenWallpaperRegenMessageInterval(
  value: unknown,
  fallback = DEFAULT_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL
): number {
  return normalizeNumberSetting(
    value,
    fallback,
    MIN_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL,
    MAX_ZEN_WALLPAPER_REGEN_MESSAGE_INTERVAL
  );
}

export function normalizeZenMoodSensitivity(
  value: unknown,
  fallback = DEFAULT_ZEN_MOOD_SENSITIVITY
): number {
  return normalizePrismMoodSensitivity(value, fallback);
}

export function normalizeZenCanvasTypingSpeed(
  value: unknown,
  fallback = DEFAULT_ZEN_CANVAS_TYPING_SPEED
): number {
  const fallbackNumber =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : DEFAULT_ZEN_CANVAS_TYPING_SPEED;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallbackNumber;
  const clamped = Math.min(
    MAX_ZEN_CANVAS_TYPING_SPEED,
    Math.max(MIN_ZEN_CANVAS_TYPING_SPEED, normalized)
  );
  return Number(clamped.toFixed(2));
}

function normalizePixelSizeSetting(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const fallbackNumber =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : min;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallbackNumber;
  const clamped = Math.min(max, Math.max(min, normalized));
  return Number(clamped.toFixed(1));
}

export function normalizeZenMessageFontMinPx(
  value: unknown,
  fallback = DEFAULT_ZEN_MESSAGE_FONT_MIN_PX
): number {
  return normalizePixelSizeSetting(
    value,
    fallback,
    MIN_ZEN_MESSAGE_FONT_SIZE_PX,
    MAX_ZEN_MESSAGE_FONT_SIZE_PX
  );
}

export function normalizeZenMessageFontMaxPx(
  value: unknown,
  fallback = DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
  minimum = MIN_ZEN_MESSAGE_FONT_SIZE_PX
): number {
  const normalizedMinimum = normalizeZenMessageFontMinPx(
    minimum,
    MIN_ZEN_MESSAGE_FONT_SIZE_PX
  );
  return normalizePixelSizeSetting(
    value,
    fallback,
    normalizedMinimum,
    MAX_ZEN_MESSAGE_FONT_SIZE_PX
  );
}

export function normalizeZenAskQuestionPatienceEnabled(
  value: unknown,
  fallback = DEFAULT_ZEN_ASK_QUESTION_PATIENCE_ENABLED
): boolean {
  return normalizeBooleanLikeSetting(value, fallback);
}

export function normalizeZenAskQuestionPatienceMs(
  value: unknown,
  fallback = DEFAULT_ZEN_ASK_QUESTION_PATIENCE_MS
): number {
  const clamped = normalizeNumberSetting(
    value,
    fallback,
    MIN_ZEN_ASK_QUESTION_PATIENCE_MS,
    MAX_ZEN_ASK_QUESTION_PATIENCE_MS
  );
  return Math.min(
    MAX_ZEN_ASK_QUESTION_PATIENCE_MS,
    Math.max(
      MIN_ZEN_ASK_QUESTION_PATIENCE_MS,
      Math.round(clamped / STEP_ZEN_ASK_QUESTION_PATIENCE_MS) *
        STEP_ZEN_ASK_QUESTION_PATIENCE_MS
    )
  );
}

export function normalizeZenAutonomyEnabled(
  value: unknown,
  fallback = false
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return fallback;
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

export function sanitizeBraveSearchKeyInput(input: string): string {
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
  const preferredImageProvider: ImageProviderName = isImageProviderName(
    body.preferredImageProvider
  )
    ? body.preferredImageProvider
    : current.preferredImageProvider;
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
  const experimentalDualOllamaEnabled =
    typeof body.experimentalDualOllamaEnabled === "boolean"
      ? Number(body.experimentalDualOllamaEnabled)
      : current.experimentalDualOllamaEnabled;
  const experimentalAllModelEffortEnabled =
    typeof body.experimentalAllModelEffortEnabled === "boolean"
      ? Number(body.experimentalAllModelEffortEnabled)
      : current.experimentalAllModelEffortEnabled;
  const coffeeExperimentalTableAngleEnabled =
    typeof body.coffeeExperimentalTableAngleEnabled === "boolean"
      ? Number(body.coffeeExperimentalTableAngleEnabled)
      : current.coffeeExperimentalTableAngleEnabled;
  const signalImmersiveVoiceEffectsEnabled =
    typeof body.signalImmersiveVoiceEffectsEnabled === "boolean"
      ? body.signalImmersiveVoiceEffectsEnabled
      : current.signalImmersiveVoiceEffectsEnabled === 1;
  const psychicModeEnabled =
    typeof body.psychicModeEnabled === "boolean"
      ? Number(body.psychicModeEnabled)
      : current.psychicModeEnabled;
  const requestedAutoSwitchModel =
    typeof body.autoModeEnabled === "boolean"
      ? Number(body.autoModeEnabled)
      : current.autoSwitchModel;
  const currentAutoFallbackChain = parseStoredAutoFallbackChain(
    current.autoFallbackChain
  );
  const requestedAutoFallbackChain =
    body.autoFallbackChain === undefined
      ? currentAutoFallbackChain
      : typeof body.autoFallbackChain === "string"
        ? parseStoredAutoFallbackChain(body.autoFallbackChain)
        : normalizeAutoFallbackChain(body.autoFallbackChain);
  const autoFallbackChain = requestedAutoFallbackChain
    ? serializeAutoFallbackChain(requestedAutoFallbackChain)
    : body.autoFallbackChain === null
      ? null
      : currentAutoFallbackChain
        ? serializeAutoFallbackChain(currentAutoFallbackChain)
        : null;
  const autoSwitchModel = autoFallbackChain ? requestedAutoSwitchModel : 0;
  const hiddenBotModelIds = readHiddenBotModelIds(
    body.hiddenBotModelIds,
    current.hiddenBotModelIds
  );
  const hiddenComfyUiWorkflowIds = readHiddenComfyUiWorkflowIds(
    body.hiddenComfyUiWorkflowIds,
    current.hiddenComfyUiWorkflowIds
  );
  const preferredLocalModel = readPreferredModel(
    body.preferredLocalModel,
    current.preferredLocalModel
  );
  const preferredOnlineModel = readPreferredModel(
    body.preferredOnlineModel,
    current.preferredOnlineModel
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
  const preferredZenWallpaperLocalImageModel = readPreferredModel(
    body.preferredZenWallpaperLocalImageModel,
    current.preferredZenWallpaperLocalImageModel
  );
  const preferredZenWallpaperOpenAiImageModel = readPreferredModel(
    body.preferredZenWallpaperOpenAiImageModel,
    current.preferredZenWallpaperOpenAiImageModel
  );
  const currentZenWallpaperOpacity = normalizeZenWallpaperOpacity(
    current.zenWallpaperOpacity
  );
  const zenWallpaperOpacity =
    body.zenWallpaperOpacity === undefined
      ? currentZenWallpaperOpacity
      : normalizeZenWallpaperOpacity(
          body.zenWallpaperOpacity,
          currentZenWallpaperOpacity
        );
  const currentZenWallpaperTextMaskEnabled =
    normalizeZenWallpaperTextMaskEnabled(current.zenWallpaperTextMaskEnabled);
  const zenWallpaperTextMaskEnabled =
    body.zenWallpaperTextMaskEnabled === undefined
      ? currentZenWallpaperTextMaskEnabled
      : normalizeZenWallpaperTextMaskEnabled(
          body.zenWallpaperTextMaskEnabled,
          currentZenWallpaperTextMaskEnabled
        );
  const currentZenWallpaperGrayscaleEnabled =
    normalizeZenWallpaperGrayscaleEnabled(current.zenWallpaperGrayscaleEnabled);
  const zenWallpaperGrayscaleEnabled =
    body.zenWallpaperGrayscaleEnabled === undefined
      ? currentZenWallpaperGrayscaleEnabled
      : normalizeZenWallpaperGrayscaleEnabled(
          body.zenWallpaperGrayscaleEnabled,
          currentZenWallpaperGrayscaleEnabled
        );
  const currentZenWallpaperBlurredEdgesEnabled =
    normalizeZenWallpaperBlurredEdgesEnabled(
      current.zenWallpaperBlurredEdgesEnabled
    );
  const zenWallpaperBlurredEdgesEnabled =
    body.zenWallpaperBlurredEdgesEnabled === undefined
      ? currentZenWallpaperBlurredEdgesEnabled
      : normalizeZenWallpaperBlurredEdgesEnabled(
          body.zenWallpaperBlurredEdgesEnabled,
          currentZenWallpaperBlurredEdgesEnabled
        );
  const currentZenWallpaperStyleNotes = normalizeZenWallpaperStyleNotes(
    current.zenWallpaperStyleNotes
  );
  const zenWallpaperStyleNotes =
    body.zenWallpaperStyleNotes === undefined
      ? currentZenWallpaperStyleNotes
      : normalizeZenWallpaperStyleNotes(
          body.zenWallpaperStyleNotes,
          currentZenWallpaperStyleNotes
        );
  const currentZenSessionIdleGapMs = normalizeZenSessionIdleGapMs(
    current.zenSessionIdleGapMs
  );
  const zenSessionIdleGapMs =
    body.zenSessionIdleGapMs === undefined
      ? currentZenSessionIdleGapMs
      : normalizeZenSessionIdleGapMs(
          body.zenSessionIdleGapMs,
          currentZenSessionIdleGapMs
        );
  const currentZenFreshStartGapMs = normalizeZenFreshStartGapMs(
    current.zenFreshStartGapMs,
    DEFAULT_ZEN_FRESH_START_GAP_MS,
    zenSessionIdleGapMs
  );
  const zenFreshStartGapMs =
    body.zenFreshStartGapMs === undefined
      ? currentZenFreshStartGapMs
      : normalizeZenFreshStartGapMs(
          body.zenFreshStartGapMs,
          currentZenFreshStartGapMs,
          zenSessionIdleGapMs
        );
  const currentZenRecentContextMessages = normalizeZenRecentContextMessages(
    current.zenRecentContextMessages
  );
  const zenRecentContextMessages =
    body.zenRecentContextMessages === undefined
      ? currentZenRecentContextMessages
      : normalizeZenRecentContextMessages(
          body.zenRecentContextMessages,
          currentZenRecentContextMessages
        );
  const currentZenWallpaperRegenMessageInterval =
    normalizeZenWallpaperRegenMessageInterval(
      current.zenWallpaperRegenMessageInterval
    );
  const zenWallpaperRegenMessageInterval =
    body.zenWallpaperRegenMessageInterval === undefined
      ? currentZenWallpaperRegenMessageInterval
      : normalizeZenWallpaperRegenMessageInterval(
          body.zenWallpaperRegenMessageInterval,
          currentZenWallpaperRegenMessageInterval
        );
  const currentZenMoodSensitivity = normalizeZenMoodSensitivity(
    current.zenMoodSensitivity
  );
  const zenMoodSensitivity =
    body.zenMoodSensitivity === undefined
      ? currentZenMoodSensitivity
      : normalizeZenMoodSensitivity(
          body.zenMoodSensitivity,
          currentZenMoodSensitivity
        );
  const currentZenCanvasTypingSpeed = normalizeZenCanvasTypingSpeed(
    current.zenCanvasTypingSpeed
  );
  const zenCanvasTypingSpeed =
    body.zenCanvasTypingSpeed === undefined
      ? currentZenCanvasTypingSpeed
      : normalizeZenCanvasTypingSpeed(
          body.zenCanvasTypingSpeed,
          currentZenCanvasTypingSpeed
        );
  const currentZenMessageFontMinPx = normalizeZenMessageFontMinPx(
    current.zenMessageFontMinPx
  );
  const zenMessageFontMinPx =
    body.zenMessageFontMinPx === undefined
      ? currentZenMessageFontMinPx
      : normalizeZenMessageFontMinPx(
          body.zenMessageFontMinPx,
          currentZenMessageFontMinPx
        );
  const currentZenMessageFontMaxPx = normalizeZenMessageFontMaxPx(
    current.zenMessageFontMaxPx,
    DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
    zenMessageFontMinPx
  );
  const zenMessageFontMaxPx =
    body.zenMessageFontMaxPx === undefined
      ? currentZenMessageFontMaxPx
      : normalizeZenMessageFontMaxPx(
          body.zenMessageFontMaxPx,
          currentZenMessageFontMaxPx,
          zenMessageFontMinPx
        );
  const currentZenAskQuestionPatienceEnabled =
    normalizeZenAskQuestionPatienceEnabled(
      current.zenAskQuestionPatienceEnabled
    );
  const zenAskQuestionPatienceEnabled =
    body.zenAskQuestionPatienceEnabled === undefined
      ? currentZenAskQuestionPatienceEnabled
      : normalizeZenAskQuestionPatienceEnabled(
          body.zenAskQuestionPatienceEnabled,
          currentZenAskQuestionPatienceEnabled
        );
  const currentZenAskQuestionPatienceMs =
    normalizeZenAskQuestionPatienceMs(current.zenAskQuestionPatienceMs);
  const zenAskQuestionPatienceMs =
    body.zenAskQuestionPatienceMs === undefined
      ? currentZenAskQuestionPatienceMs
      : normalizeZenAskQuestionPatienceMs(
          body.zenAskQuestionPatienceMs,
          currentZenAskQuestionPatienceMs
        );
  const currentZenAutonomyEnabled = normalizeZenAutonomyEnabled(
    current.zenAutonomyEnabled
  );
  const zenAutonomyEnabled =
    body.zenAutonomyEnabled === undefined
      ? currentZenAutonomyEnabled
      : normalizeZenAutonomyEnabled(
          body.zenAutonomyEnabled,
          currentZenAutonomyEnabled
        );
  const currentZenPersonaTransitionChoice = normalizeZenPersonaTransitionChoice(
    current.zenPersonaTransitionChoice
  );
  const zenPersonaTransitionChoice =
    body.zenPersonaTransitionChoice === undefined
      ? currentZenPersonaTransitionChoice
      : normalizeZenPersonaTransitionChoice(
          body.zenPersonaTransitionChoice,
          currentZenPersonaTransitionChoice
        );
  const prismDefaultLlmModel = readPreferredModel(
    body.prismDefaultLlmModel,
    current.prismDefaultLlmModel
  );
  const prismImageToolLlmModel = readPreferredModel(
    body.prismImageToolLlmModel,
    current.prismImageToolLlmModel
  );
  const voiceMode = normalizeVoiceMode(body.voiceMode, normalizeVoiceMode(current.voiceMode));
  const voiceEffectsEnabled = typeof body.voiceEffectsEnabled === "boolean"
    ? body.voiceEffectsEnabled
    : current.voiceEffectsEnabled !== 0;
  const voiceVolume = body.voiceVolume === undefined
    ? normalizeBotVoiceVolume(current.voiceVolume)
    : normalizeBotVoiceVolume(body.voiceVolume, normalizeBotVoiceVolume(current.voiceVolume));
  // The online selector currently has one installed provider. It is not an
  // opt-in toggle; the per-profile ElevenLabs voice is the explicit override.
  const englishVoiceEngine: EnglishVoiceEngine = "elevenlabs";
  // Account-level voice identities are retired. A settings save clears any
  // legacy values so only Prism/bot customization owns voice identity.
  const defaultSystemVoiceName = null;
  const defaultElevenLabsVoiceId = null;
  const elevenLabsVoiceBank = body.elevenLabsVoiceBank === undefined
    ? parseStoredElevenLabsVoiceBank(current.elevenLabsVoiceBank)
    : normalizeElevenLabsVoiceBank(body.elevenLabsVoiceBank);
  const elevenLabsVoiceModel = normalizeElevenLabsVoiceModel(
    body.elevenLabsVoiceModel,
    current.elevenLabsVoiceModel
  );
  const elevenLabsVoiceCollectionId = normalizeElevenLabsVoiceCollectionId(
    body.elevenLabsVoiceCollectionId,
    current.elevenLabsVoiceCollectionId
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

  let braveSearchKeyIntent: NextSettings["braveSearchKeyIntent"] = { action: "keep" };
  if (typeof body.braveSearchApiKey === "string") {
    const sanitized = sanitizeBraveSearchKeyInput(body.braveSearchApiKey);
    if (sanitized.length > 0) {
      braveSearchKeyIntent = { action: "replace", plaintext: sanitized };
    }
  } else if (body.braveSearchApiKey === null) {
    braveSearchKeyIntent = { action: "clear" };
  }

  return {
    displayName,
    theme,
    preferredProvider,
    preferredImageProvider,
    providerLocked,
    autoMemory,
    composerWritingAssist,
    experimentalDualOllamaEnabled,
    experimentalAllModelEffortEnabled,
    coffeeExperimentalTableAngleEnabled,
    signalImmersiveVoiceEffectsEnabled,
    psychicModeEnabled,
    autoSwitchModel,
    autoFallbackChain,
    hiddenBotModelIds,
    hiddenComfyUiWorkflowIds,
    preferredLocalModel,
    preferredOnlineModel,
    lenientLocalImageFallbackModel,
    secondaryOllamaHost,
    comfyUiHost,
    preferredLocalImageModel,
    preferredOpenAiImageModel,
    preferredZenWallpaperLocalImageModel,
    preferredZenWallpaperOpenAiImageModel,
    zenWallpaperOpacity,
    zenWallpaperTextMaskEnabled,
    zenWallpaperGrayscaleEnabled,
    zenWallpaperBlurredEdgesEnabled,
    zenWallpaperStyleNotes,
    zenSessionIdleGapMs,
    zenFreshStartGapMs,
    zenRecentContextMessages,
    zenWallpaperRegenMessageInterval,
    zenMoodSensitivity,
    zenCanvasTypingSpeed,
    zenMessageFontMinPx,
    zenMessageFontMaxPx,
    zenAskQuestionPatienceEnabled,
    zenAskQuestionPatienceMs,
    zenAutonomyEnabled,
    zenPersonaTransitionChoice,
    comfyUiWorkflows,
    prismDefaultLlmModel,
    prismImageToolLlmModel,
    voiceMode,
    voiceEffectsEnabled,
    voiceVolume,
    englishVoiceEngine,
    defaultSystemVoiceName,
    defaultElevenLabsVoiceId,
    elevenLabsVoiceBank,
    elevenLabsVoiceModel,
    elevenLabsVoiceCollectionId,
    openAiKeyIntent,
    anthropicKeyIntent,
    elevenLabsKeyIntent,
    braveSearchKeyIntent,
  };
}
