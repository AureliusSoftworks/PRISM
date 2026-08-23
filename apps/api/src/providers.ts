import { createHash } from "node:crypto";
import { getAppConfig } from "@localai/config";
import {
  anthropicReasoningEffortForRequest,
  modelSupportsTurboMode,
  normalizeProviderReasoningEffort,
  openAiReasoningEffortForRequest,
  type ProviderReasoningEffort,
  type UsagePurpose,
} from "@localai/shared";
import {
  recordDeveloperTranscriptEvent,
  recordEstimatedEmbeddingUsage,
  recordTextUsage,
  usagePurpose,
} from "./usage.ts";
import { isPrivateNetworkHttpUrl } from "./local-network-host.ts";

/**
 * Caps how long `/api/models` hangs while probing `/api/tags` or OpenAI’s model list.
 * Without this, unreachable hosts often stall until the TCP stack times out (~minutes).
 */
const REMOTE_TAGS_PROBE_TIMEOUT_MS = 15_000;

export interface ProviderImageInput {
  /** MIME type is kept explicit so online providers receive a valid data source. */
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  /** Raw base64 only; provider adapters own their wire format. */
  data: string;
}

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional contextual image input. Never persisted in developer transcripts. */
  images?: ProviderImageInput[];
}

function ollamaProviderMessages(messages: ProviderMessage[]): Array<
  Record<string, unknown>
> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.images?.length
      ? { images: message.images.map((image) => image.data) }
      : {}),
  }));
}

function openAiProviderMessages(messages: ProviderMessage[]): Array<
  Record<string, unknown>
> {
  return messages.map((message) =>
    message.images?.length
      ? {
          role: message.role,
          content: [
            { type: "text", text: message.content },
            ...message.images.map((image) => ({
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.data}`,
                detail: "auto",
              },
            })),
          ],
        }
      : { role: message.role, content: message.content },
  );
}

function anthropicProviderConversationMessages(
  messages: ProviderMessage[],
): Array<Record<string, unknown>> {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.images?.length
        ? [
            { type: "text", text: message.content },
            ...message.images.map((image) => ({
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.data,
              },
            })),
          ]
        : message.content,
    }));
}

/** Keep raw image bytes out of development transcripts and usage diagnostics. */
function redactProviderImageData(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    if (key === "images") return value.map(() => "<image omitted>");
    return value.map((item) => redactProviderImageData(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactProviderImageData(child, childKey),
      ]),
    );
  }
  if (
    typeof value === "string" &&
    (value.startsWith("data:image/") || (key === "data" && value.length > 128))
  ) {
    return "<image omitted>";
  }
  return value;
}

/** Optional per-call generation overrides, typically supplied by a Bot's configuration. */
export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  reasoningEffort?: ProviderReasoningEffort;
  /** Requests the provider's supported premium low-latency service tier. */
  turbo?: boolean;
  usagePurpose?: UsagePurpose;
  /** Cancels in-flight provider work when the originating chat request is stopped. */
  signal?: AbortSignal;
  /** Ask providers that support it to constrain the visible reply to a JSON object. */
  jsonMode?: boolean;
  /** Optional JSON Schema for providers that support structured JSON output. */
  jsonSchema?: Record<string, unknown>;
  jsonSchemaName?: string;
  /**
   * Lets callers with their own ordered recovery policy suppress the provider's
   * bundled llama3.2 failsafe. Without this, one failed ONLINE attempt can
   * silently spend another full model timeout in LOCAL before the caller's
   * configured ONLINE fallback gets a chance to run.
   */
  allowFinalLocalFallback?: boolean;
  /** Ollama-only residency override for system-owned local lanes. */
  ollamaKeepAlive?: string | number;
  /**
   * Local-only native chain-of-thought override. Leave unset to let the
   * provider derive it from usage purpose + reasoning effort; `false` always
   * disables it. Structured-output requests never think regardless.
   */
  think?: boolean;
  /** Receives the model's own chain-of-thought when native thinking ran. */
  onNativeThinking?: (thinking: string) => void;
}

export type ProviderName = "local" | "openai" | "anthropic";

export function defaultModelIdForProvider(provider: ProviderName): string {
  return provider === "local"
    ? config.ollamaModel
    : provider === "anthropic"
      ? ANTHROPIC_DEFAULT_MODEL
      : OPENAI_DEFAULT_MODEL;
}

export type ApiKeyAuthSource = "account" | "server" | "none";

export interface ProviderApiKeyAuthStatus {
  configured: boolean;
  authenticated: boolean;
  source: ApiKeyAuthSource;
  status: "missing" | "authenticated" | "invalid" | "unreachable";
  modelCount: number;
  message?: string;
}

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: ProviderName;
  isDefault?: boolean;
  localHost?: "primary" | "secondary";
  hostLabel?: string;
  /** LOCAL model reports the Ollama native `thinking` capability. */
  thinking?: boolean;
  /** Model accepts image inputs in ordinary conversational requests. */
  supportsImageInput?: boolean;
  /** When set, this entry is only for the Images panel (not chat text models). */
  imageSource?: "ollama" | "comfyui" | "comfyui-workflow" | "comfyui-remote";
}

export interface ModelCatalog {
  local: ModelCatalogEntry[];
  online: ModelCatalogEntry[];
  defaults: {
    local: string;
    online: string;
  };
}

export interface LocalModelHostStatus {
  configured: boolean;
  reachable: boolean;
  modelCount: number;
}

export interface DualOllamaWorkloadStatus {
  configured: boolean;
  enabled: boolean;
  primaryReachable: boolean;
  secondaryReachable: boolean;
  modelParity: boolean;
  primaryModelCount: number;
  secondaryModelCount: number;
  sharedModelIds: string[];
  missingOnPrimary: string[];
  missingOnSecondary: string[];
  reason:
    | "not_configured"
    | "primary_unreachable"
    | "secondary_unreachable"
    | "empty_catalog"
    | "model_mismatch"
    | "ready";
}

export interface LlmProvider {
  name: ProviderName;
  /** Safe, user-visible model context for provider diagnostics. */
  diagnosticModel?: string;
  generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string>;
  embedText(text: string): Promise<number[]>;
}

export type LocalModelRequestFailureKind =
  | "service_unavailable"
  | "endpoint_not_found"
  | "model_unavailable"
  | "authentication_or_configuration"
  | "request_failed";

const LOCAL_MODEL_REQUEST_ERROR_MESSAGES: Record<
  LocalModelRequestFailureKind,
  string
> = {
  service_unavailable: "Local model service is unavailable.",
  endpoint_not_found: "Local chat endpoint was not found.",
  model_unavailable: "Configured local model is unavailable.",
  authentication_or_configuration:
    "Local model authentication or configuration failed.",
  request_failed: "Local model request failed.",
};

/**
 * Categorized local-provider failure with a deliberately redacted message.
 * Hostnames, credentials, and raw response bodies must not cross this boundary.
 */
export class LocalModelRequestError extends Error {
  public readonly kind: LocalModelRequestFailureKind;
  public readonly status?: number;

  public constructor(
    kind: LocalModelRequestFailureKind,
    status?: number,
    options: { pairedHostMissing?: boolean; pairedHostUnsafe?: boolean } = {}
  ) {
    super(
      options.pairedHostUnsafe
        ? "Paired Ollama host must be on the private network."
        : options.pairedHostMissing
        ? "Paired Ollama host is not configured."
        : LOCAL_MODEL_REQUEST_ERROR_MESSAGES[kind]
    );
    this.name = "LocalModelRequestError";
    this.kind = kind;
    this.status = status;
  }
}

interface OpenAiConfig {
  apiKey: string;
}

interface AnthropicConfig {
  apiKey: string;
}

export interface DualOllamaWorkloadOptions {
  secondaryOllamaHost?: string | null;
  experimentalDualOllama?: boolean;
}

export interface ResolvedLocalOllamaTarget {
  host: string;
  model: string;
  hostKind: "primary" | "secondary";
}

type LocalOllamaResponseObserver = (
  target: ResolvedLocalOllamaTarget,
) => void;
type LocalOllamaActivityObserver = (
  target: ResolvedLocalOllamaTarget,
  active: boolean,
) => void;

let localOllamaResponseObserver: LocalOllamaResponseObserver | null = null;
let localOllamaActivityObserver: LocalOllamaActivityObserver | null = null;

export function setLocalOllamaResponseObserver(
  observer: LocalOllamaResponseObserver | null,
): void {
  localOllamaResponseObserver = observer;
}

export function setLocalOllamaActivityObserver(
  observer: LocalOllamaActivityObserver | null,
): void {
  localOllamaActivityObserver = observer;
}

const config = getAppConfig();

// Model lists change only when a provider configuration or the API process
// changes. Keep discovery out of the browser-refresh path: it probes local
// Ollama plus any configured cloud catalogs and can otherwise make every page
// load feel like the models themselves are restarting.
const modelCatalogCache = new Map<string, Promise<ModelCatalog>>();

function privateSecondaryOllamaHost(
  secondaryOllamaHost: string | null | undefined,
): string | null {
  const trimmed = secondaryOllamaHost?.trim();
  return trimmed && isPrivateNetworkHttpUrl(trimmed) ? trimmed : null;
}

function modelCatalogCacheKey(
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null,
  anthropicApiKey?: string
): string {
  const privateSecondaryHost = privateSecondaryOllamaHost(secondaryOllamaHost);
  return createHash("sha256")
    .update(JSON.stringify({
      primaryOllamaHost: config.ollamaHost,
      primaryOllamaModel: config.ollamaModel,
      secondaryOllamaHost: privateSecondaryHost ?? "",
      openAiApiKey: openAiApiKey?.trim() ?? "",
      anthropicApiKey: anthropicApiKey?.trim() ?? "",
    }))
    .digest("hex");
}

/** Test-only reset; production cache lifetime is the API process lifetime. */
export function resetModelCatalogCacheForTests(): void {
  modelCatalogCache.clear();
}

/**
 * Some Ollama chat templates emit a literal role marker when the prompt ends on
 * a trailing system message after the last user turn. Strip a leading
 * assistant/user/system line so that template artifact never reaches players.
 */
export function stripLeadingChatRoleMarker(text: string): string {
  return text.replace(/^\s*(?:assistant|user|system)(?:\s*\r?\n+|\s*$)/i, "");
}

export const SECONDARY_OLLAMA_MODEL_PREFIX = "ollama-secondary:";
const DUAL_OLLAMA_WORKLOAD_STATUS_CACHE_MS = 30_000;

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";
const OPENAI_FALLBACK_MODELS = [
  OPENAI_DEFAULT_MODEL,
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4.1-nano",
  "gpt-5",
  "gpt-5-2025-08-07",
  "gpt-5-chat-latest",
  "gpt-5-codex",
  "gpt-5-mini",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano",
  "gpt-5-nano-2025-08-07",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",
  "gpt-5-search-api",
  "gpt-5-search-api-2025-10-14",
  "gpt-5.1",
  "gpt-5.1-2025-11-13",
  "gpt-5.1-chat-latest",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-chat-latest",
  "gpt-5.2-codex",
  "gpt-5.2-pro",
  "gpt-5.2-pro-2025-12-11",
  "gpt-5.3-chat-latest",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-2026-03-05",
  "gpt-5.4-mini",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.4-pro",
  "gpt-5.4-pro-2026-03-05",
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.5-pro",
  "gpt-5.5-pro-2026-04-23",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;
const ANTHROPIC_FALLBACK_MODELS = [
  ANTHROPIC_DEFAULT_MODEL,
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-haiku-4-5",
  "claude-sonnet-4-5-20250929",
] as const;
const OPENAI_CHAT_MODEL_PREFIXES = [
  "gpt-",
  "chatgpt-",
  "o1",
  "o3",
  "o4",
  "o5",
] as const;
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_CHAT_MODEL_PREFIXES = ["claude-"] as const;

/**
 * Chat models whose API shape differs from classic GPT-4: completion token
 * field name and fixed sampling (temperature must be omitted — only default).
 */
function openAiReasoningStyleChatApi(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    normalized.startsWith("o5")
  ) {
    return true;
  }
  if (normalized.startsWith("gpt-5")) {
    return true;
  }
  return false;
}

/**
 * Some chat models reject `max_tokens` and require `max_completion_tokens`
 * instead (same meaning: cap on tokens generated in the reply). OpenAI does
 * not publish a single exhaustive list; we match known families and extend
 * when new models surface the same 400.
 */
export function openAiModelUsesMaxCompletionTokens(modelId: string): boolean {
  return openAiReasoningStyleChatApi(modelId);
}

/**
 * OpenAI reasoning models count hidden reasoning against
 * `max_completion_tokens`. Bot maxTokens is authored as the public reply
 * budget, so reserve separate headroom for reasoning instead of letting High
 * and XHigh silently truncate the visible answer.
 */
export function openAiReasoningAwareCompletionTokenLimit(
  modelId: string,
  maxTokens: number,
  reasoningEffort: ProviderReasoningEffort | undefined,
): number {
  const requested = openAiReasoningEffortForRequest(modelId, reasoningEffort);
  const reserve = requested === "minimal"
    ? 256
    : requested === "low"
      ? 512
      : requested === "medium"
        ? 1_024
        : requested === "high"
          ? 1_536
          : requested === "xhigh"
            ? 2_048
            : requested === "max"
              ? 4_096
              : 0;
  return Math.min(32_768, Math.max(1, Math.round(maxTokens)) + reserve);
}

/**
 * Reasoning-style models reject non-default `temperature`; omit the field so
 * the API uses its default (1).
 */
export function openAiModelUsesFixedDefaultTemperature(modelId: string): boolean {
  return openAiReasoningStyleChatApi(modelId);
}

/**
 * Anthropic models released after Claude Opus 4.6 reject non-default
 * sampling controls. Keep this model capability centralized so newer Claude
 * models can use their fixed defaults without changing legacy model behavior.
 */
export function anthropicModelUsesFixedDefaultSampling(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (normalized === "claude-mythos-preview") return true;
  const version = normalized.match(
    /^claude-[a-z0-9]+-(\d+)(?:-(\d+))?(?:-\d{8})?$/
  );
  if (!version) return false;
  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major > 4 || (major === 4 && minor >= 7);
}

/**
 * Cap on how many characters of an OpenAI error body we echo back through
 * the API surface. OpenAI messages are usually short (<200 chars) but we
 * guard against pathological bodies (HTML error pages from a proxy, etc.)
 * so we don't dump multi-KB strings into the user's toast.
 */
const OPENAI_ERROR_MESSAGE_MAX_CHARS = 500;

export function fallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(12).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = index % vector.length;
    vector[bucket] += text.charCodeAt(index) / 255;
  }
  const magnitude = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

export async function embedTextLocal(
  text: string,
  options: DualOllamaWorkloadOptions = {}
): Promise<number[]> {
  const requestedModel = config.ollamaEmbeddingModel || "nomic-embed-text";
  const secondaryModel = await resolveDualOllamaWorkloadModelId(
    requestedModel,
    options
  );
  const ollamaHost = secondaryModel ? options.secondaryOllamaHost!.trim() : config.ollamaHost;
  const model = secondaryModel ?? requestedModel;
  const startedAt = Date.now();
  try {
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: text
      })
    });
    if (!response.ok) {
      return fallbackEmbedding(text);
    }
    const payload = (await response.json()) as { embedding?: number[] };
    recordEstimatedEmbeddingUsage({
      provider: "local",
      model,
      text,
      purpose: "embedding",
      durationMs: Date.now() - startedAt,
    });
    return payload.embedding ?? fallbackEmbedding(text);
  } catch {
    return fallbackEmbedding(text);
  }
}

/**
 * Pull the human-readable reason out of a failed OpenAI response.
 *
 * OpenAI returns a JSON body shaped like:
 *   { "error": { "message": "...", "type": "...", "code": "..." } }
 *
 * but proxies, rate-limit pages, and network intermediaries can return
 * HTML or plain text instead, so we fall back to the raw body and finally
 * an empty string if the body cannot be read at all. The caller is
 * responsible for composing the final error message.
 */
export async function readOpenAiErrorMessage(
  response: Response
): Promise<string> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown };
    };
    const message = parsed.error?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return truncateForDisplay(message.trim());
    }
  } catch {
    // Body wasn't JSON; fall through to raw-text fallback.
  }
  return truncateForDisplay(trimmed);
}

function truncateForDisplay(value: string): string {
  if (value.length <= OPENAI_ERROR_MESSAGE_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, OPENAI_ERROR_MESSAGE_MAX_CHARS)}...`;
}

function titleCaseModelToken(token: string): string {
  const lower = token.toLowerCase();
  const known: Record<string, string> = {
    api: "API",
    b: "B",
    chatgpt: "ChatGPT",
    code: "Code",
    codellama: "Code Llama",
    codex: "Codex",
    deepseek: "DeepSeek",
    distill: "Distill",
    gemma: "Gemma",
    gpt: "GPT",
    instruct: "Instruct",
    llama: "Llama",
    llava: "LLaVA",
    mini: "Mini",
    mistral: "Mistral",
    mixtral: "Mixtral",
    nano: "Nano",
    opus: "Opus",
    phi: "Phi",
    pro: "Pro",
    qwen: "Qwen",
    r1: "R1",
    search: "Search",
    sonnet: "Sonnet",
    tinyllama: "TinyLlama",
    vl: "VL",
  };
  if (known[lower]) return known[lower];
  if (/^\d+(?:\.\d+)?b$/i.test(token)) return token.toUpperCase();
  if (/^o\d/.test(lower)) return lower;
  if (/^[a-z]+\d+(?:\.\d+)?$/i.test(token)) {
    const match = token.match(/^([a-z]+)(\d+(?:\.\d+)?)$/i);
    if (match) return `${titleCaseModelToken(match[1]!)} ${match[2]}`;
  }
  return token.toUpperCase() === token
    ? token
    : `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`;
}

function isUnsupportedReasoningEffortError(detail: string): boolean {
  return /reasoning[_\s-]*effort/i.test(detail) && /invalid|unknown|unsupported|not supported/i.test(detail);
}

function formatOpenAiSnapshotSuffix(datePart: string | undefined): string {
  if (!datePart) return "";
  const isoDate = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return ` (${isoDate[1]}-${isoDate[2]}-${isoDate[3]})`;
  const compactDate = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) return ` (${compactDate[1]}-${compactDate[2]}-${compactDate[3]})`;
  return ` (${datePart})`;
}

function openAiModelLabelFromId(id: string): string | null {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "chatgpt-4o-latest") return "ChatGPT-4o";
  const oSeries = normalized.match(/^(o\d)(?:-(mini))?$/);
  if (oSeries) {
    return [oSeries[1], oSeries[2] ? "Mini" : ""].filter(Boolean).join(" ");
  }
  const codex = normalized.match(/^gpt-(\d+(?:\.\d+)?)-codex(?:-(max|mini))?$/);
  if (codex) {
    return [
      `GPT-${codex[1]}`,
      "Codex",
      codex[2] ? titleCaseModelToken(codex[2]) : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const search = normalized.match(/^gpt-(\d+(?:\.\d+)?)-search-api(?:-(\d{4}-\d{2}-\d{2}))?$/);
  if (search) {
    return `GPT-${search[1]} Search${formatOpenAiSnapshotSuffix(search[2])}`;
  }
  const chatLatest = normalized.match(/^gpt-(\d+(?:\.\d+)?)-chat-latest$/);
  if (chatLatest) return `GPT-${chatLatest[1]}`;
  const frontierTier = normalized.match(
    /^gpt-(\d+(?:\.\d+)?)-(sol|terra|luna)$/,
  );
  if (frontierTier) {
    return `GPT-${frontierTier[1]} ${titleCaseModelToken(frontierTier[2]!)}`;
  }
  const versioned = normalized.match(
    /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano|pro))?(?:-(\d{4}-\d{2}-\d{2}))?$/
  );
  if (versioned) {
    return [
      `GPT-${versioned[1]}`,
      versioned[2] ? titleCaseModelToken(versioned[2]) : "",
    ]
      .filter(Boolean)
      .join(" ") + formatOpenAiSnapshotSuffix(versioned[3]);
  }
  return null;
}

function anthropicModelLabelFromId(id: string): string | null {
  const normalized = id.trim().toLowerCase();
  if (!normalized.startsWith("claude-")) return null;
  const latest = normalized.match(/^claude-(\d)-(\d)-(sonnet|haiku)-latest$/);
  if (latest) {
    return `${latest[1]}.${latest[2]} ${titleCaseModelToken(latest[3]!)}`;
  }
  const named = normalized.match(
    /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?(?:-(\d{8}))?$/
  );
  if (named) {
    const version = named[3] ? `${named[2]}.${named[3]}` : named[2]!;
    return `${titleCaseModelToken(named[1]!)} ${version}${formatOpenAiSnapshotSuffix(named[4])}`;
  }
  return null;
}

function modelLabelFromId(id: string, provider?: ProviderName): string {
  const providerLabel =
    provider === "openai"
      ? openAiModelLabelFromId(id)
      : provider === "anthropic"
        ? anthropicModelLabelFromId(id)
        : null;
  if (providerLabel) return providerLabel;

  const parts = id
    .replace(SECONDARY_OLLAMA_MODEL_PREFIX, "")
    .split(/[-_:]/)
    .filter(Boolean)
    .filter((part, index, allParts) =>
      !(index === allParts.length - 1 && part.toLowerCase() === "latest")
    );
  const displayParts = parts.length > 0 ? parts : [id];
  return displayParts.map(titleCaseModelToken).join(" ");
}

function uniqueModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function modelLabelKey(id: string): string {
  return modelLabelFromId(id).toLocaleLowerCase();
}

function uniqueModelIdsByLabel(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    const key = modelLabelKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function canonicalAnthropicCatalogModelId(id: string): string {
  const normalized = id.trim().toLowerCase();
  switch (normalized) {
    case "claude-haiku-4-5-20251001":
      return "claude-haiku-4-5";
    default:
      return id.trim();
  }
}

function uniqueAnthropicModelIds(ids: string[]): string[] {
  return uniqueModelIds(ids.map(canonicalAnthropicCatalogModelId));
}

function encodeSecondaryOllamaModelId(id: string): string {
  return `${SECONDARY_OLLAMA_MODEL_PREFIX}${id.trim()}`;
}

function openAiChatVariantBaseId(id: string): string | null {
  const normalized = id.trim().toLowerCase();
  const match = normalized.match(/^gpt-(\d+(?:\.\d+)?)-chat-latest$/);
  return match ? `gpt-${match[1]}` : null;
}

function preferOpenAiChatVariants(ids: string[]): string[] {
  const chatVariantByBase = new Map<string, string>();
  for (const rawId of ids) {
    const id = rawId.trim();
    const baseId = openAiChatVariantBaseId(id);
    if (baseId) chatVariantByBase.set(baseId, id);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawId of ids) {
    const id = rawId.trim();
    if (!id) continue;
    const replacement = chatVariantByBase.get(id.toLowerCase()) ?? id;
    if (seen.has(replacement)) continue;
    seen.add(replacement);
    result.push(replacement);
  }
  return result;
}

export function parseSecondaryOllamaModelId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed.startsWith(SECONDARY_OLLAMA_MODEL_PREFIX)) {
    return null;
  }
  const modelId = trimmed.slice(SECONDARY_OLLAMA_MODEL_PREFIX.length).trim();
  return modelId.length > 0 ? modelId : null;
}

function toCatalogEntry(
  id: string,
  provider: ProviderName,
  defaultId: string,
  options: {
    label?: string;
    localHost?: "primary" | "secondary";
    hostLabel?: string;
    thinking?: boolean;
    supportsImageInput?: boolean;
  } = {}
): ModelCatalogEntry {
  return {
    id,
    label: options.label ?? modelLabelFromId(id, provider),
    provider,
    isDefault: id === defaultId || undefined,
    ...(options.localHost ? { localHost: options.localHost } : {}),
    ...(options.hostLabel ? { hostLabel: options.hostLabel } : {}),
    ...(options.thinking ? { thinking: true } : {}),
    ...(options.supportsImageInput ? { supportsImageInput: true } : {}),
  };
}

/** Conservative model-family capability map for provider catalogs. */
export function onlineModelSupportsImageInput(
  provider: Extract<ProviderName, "openai" | "anthropic">,
  modelId: string,
): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (provider === "anthropic") {
    return /^(?:claude-3|claude-(?:sonnet|opus|haiku)-[4-9])/u.test(id);
  }
  return /^(?:gpt-4(?:o|\.1|\.5)|gpt-5|chatgpt-4o|o[134](?:-|$))/u.test(id);
}

function isAllowedOpenAiChatModel(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("embedding") ||
    normalized.includes("whisper") ||
    normalized.includes("tts") ||
    normalized.includes("dall-e") ||
    normalized.includes("image") ||
    normalized.includes("audio") ||
    normalized.includes("realtime") ||
    normalized.includes("moderation")
  ) {
    return false;
  }
  return OPENAI_CHAT_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isAllowedAnthropicChatModel(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;
  return ANTHROPIC_CHAT_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function discoverLocalModelIds(ollamaHost: string): Promise<string[]> {
  return (await discoverLocalModels(ollamaHost)).modelIds;
}

async function discoverLocalModels(
  ollamaHost: string
): Promise<{ reachable: boolean; modelIds: string[] }> {
  for (const host of localModelHostCandidates(ollamaHost)) {
    const modelIds = await fetchLocalModelIds(host);
    if (modelIds) return { reachable: true, modelIds };
  }
  return { reachable: false, modelIds: [] };
}

async function fetchLocalModelIds(ollamaHost: string): Promise<string[] | null> {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      models?: Array<{ name?: unknown; model?: unknown }>;
    };
    return uniqueModelIds(
      (payload.models ?? [])
        .map((model) =>
          typeof model.name === "string"
            ? model.name
            : typeof model.model === "string"
              ? model.model
              : ""
        )
    );
  } catch {
    return null;
  }
}

function localModelHostCandidates(ollamaHost: string): string[] {
  const hostCandidates = [ollamaHost];
  const seenCandidates = new Set<string>([ollamaHost]);
  try {
    // Some local setups resolve `localhost` to IPv6 first (::1) even when
    // Ollama only listens on IPv4. Probe 127.0.0.1 as a fallback.
    const parsedHost = new URL(ollamaHost);
    const hostname = parsedHost.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::ffff:127.0.0.1" ||
      hostname === "host.docker.internal"
    ) {
      const loopbackIpv4 = new URL(ollamaHost);
      loopbackIpv4.hostname = "127.0.0.1";
      const loopbackIpv4Candidate = loopbackIpv4.toString().replace(/\/$/, "");
      if (!seenCandidates.has(loopbackIpv4Candidate)) {
        hostCandidates.push(loopbackIpv4Candidate);
        seenCandidates.add(loopbackIpv4Candidate);
      }

      const primaryHostCandidate = config.ollamaHost.trim();
      if (primaryHostCandidate && !seenCandidates.has(primaryHostCandidate)) {
        hostCandidates.push(primaryHostCandidate);
        seenCandidates.add(primaryHostCandidate);
      }
    }
  } catch {
    // Keep the original candidate; malformed hosts are treated as unreachable.
  }
  return hostCandidates;
}

export async function checkLocalModelHostStatus(
  ollamaHost: string | null | undefined
): Promise<LocalModelHostStatus> {
  const normalizedHost = ollamaHost?.trim();
  if (!normalizedHost) {
    return { configured: false, reachable: false, modelCount: 0 };
  }
  if (!isPrivateNetworkHttpUrl(normalizedHost)) {
    return { configured: true, reachable: false, modelCount: 0 };
  }

  const discovered = await discoverLocalModels(normalizedHost);
  return {
    configured: true,
    reachable: discovered.reachable,
    modelCount: discovered.modelIds.length,
  };
}

const dualOllamaWorkloadStatusCache = new Map<
  string,
  { expiresAt: number; status: DualOllamaWorkloadStatus }
>();

function sortedModelIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function uniqueSortedModelIds(ids: readonly string[]): string[] {
  return sortedModelIds(uniqueModelIds([...ids]));
}

function disabledDualOllamaStatus(
  reason: DualOllamaWorkloadStatus["reason"],
  overrides: Partial<DualOllamaWorkloadStatus> = {}
): DualOllamaWorkloadStatus {
  return {
    configured: reason !== "not_configured",
    enabled: false,
    primaryReachable: false,
    secondaryReachable: false,
    modelParity: false,
    primaryModelCount: 0,
    secondaryModelCount: 0,
    sharedModelIds: [],
    missingOnPrimary: [],
    missingOnSecondary: [],
    reason,
    ...overrides,
  };
}

export async function checkDualOllamaWorkloadStatus(
  secondaryOllamaHost: string | null | undefined,
  options: { useCache?: boolean } = {}
): Promise<DualOllamaWorkloadStatus> {
  const configuredHost = secondaryOllamaHost?.trim();
  const secondaryHost = privateSecondaryOllamaHost(secondaryOllamaHost);
  if (!configuredHost) {
    return disabledDualOllamaStatus("not_configured", { configured: false });
  }
  if (!secondaryHost) {
    return disabledDualOllamaStatus("secondary_unreachable", { configured: true });
  }

  const cacheKey = `${config.ollamaHost} -> ${secondaryHost}`;
  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = dualOllamaWorkloadStatusCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status;
    }
  }

  const [primary, secondary] = await Promise.all([
    discoverLocalModels(config.ollamaHost),
    discoverLocalModels(secondaryHost),
  ]);
  const primaryModelIds = uniqueSortedModelIds(primary.modelIds);
  const secondaryModelIds = uniqueSortedModelIds(secondary.modelIds);
  const primarySet = new Set(primaryModelIds);
  const secondarySet = new Set(secondaryModelIds);
  const sharedModelIds = primaryModelIds.filter((id) => secondarySet.has(id));
  const missingOnPrimary = secondaryModelIds.filter((id) => !primarySet.has(id));
  const missingOnSecondary = primaryModelIds.filter((id) => !secondarySet.has(id));
  const primaryModelCount = primaryModelIds.length;
  const secondaryModelCount = secondaryModelIds.length;

  let status: DualOllamaWorkloadStatus;
  if (!primary.reachable) {
    status = disabledDualOllamaStatus("primary_unreachable", {
      configured: true,
      primaryReachable: false,
      secondaryReachable: secondary.reachable,
      primaryModelCount,
      secondaryModelCount,
      sharedModelIds,
      missingOnPrimary,
      missingOnSecondary,
    });
  } else if (!secondary.reachable) {
    status = disabledDualOllamaStatus("secondary_unreachable", {
      configured: true,
      primaryReachable: true,
      secondaryReachable: false,
      primaryModelCount,
      secondaryModelCount,
      sharedModelIds,
      missingOnPrimary,
      missingOnSecondary,
    });
  } else if (primaryModelCount === 0 || secondaryModelCount === 0) {
    status = disabledDualOllamaStatus("empty_catalog", {
      configured: true,
      primaryReachable: true,
      secondaryReachable: true,
      primaryModelCount,
      secondaryModelCount,
      sharedModelIds,
      missingOnPrimary,
      missingOnSecondary,
    });
  } else if (sharedModelIds.length === 0) {
    status = disabledDualOllamaStatus("model_mismatch", {
      configured: true,
      primaryReachable: true,
      secondaryReachable: true,
      primaryModelCount,
      secondaryModelCount,
      sharedModelIds,
      missingOnPrimary,
      missingOnSecondary,
    });
  } else {
    status = {
      configured: true,
      enabled: true,
      primaryReachable: true,
      secondaryReachable: true,
      modelParity: true,
      primaryModelCount,
      secondaryModelCount,
      sharedModelIds,
      missingOnPrimary,
      missingOnSecondary,
      reason: "ready",
    };
  }

  if (useCache) {
    dualOllamaWorkloadStatusCache.set(cacheKey, {
      expiresAt: Date.now() + DUAL_OLLAMA_WORKLOAD_STATUS_CACHE_MS,
      status,
    });
  }
  return status;
}

async function resolveDualOllamaWorkloadModelId(
  requestedModel: string,
  options: DualOllamaWorkloadOptions
): Promise<string | null> {
  if (!options.experimentalDualOllama || !options.secondaryOllamaHost?.trim()) {
    return null;
  }
  if (parseSecondaryOllamaModelId(requestedModel)) {
    return null;
  }
  const status = await checkDualOllamaWorkloadStatus(options.secondaryOllamaHost);
  if (!status.enabled || !status.sharedModelIds.includes(requestedModel)) {
    return null;
  }
  return requestedModel;
}

/**
 * Resolves the exact Ollama host/model pair used for a local request. Model
 * preparation and text generation must share this path or one host can be
 * warmed while the other receives the real turn.
 */
export async function resolveLocalOllamaTarget(
  requestedModel: string,
  options: DualOllamaWorkloadOptions = {},
): Promise<ResolvedLocalOllamaTarget> {
  const modelId = requestedModel.trim() || config.ollamaModel;
  const configuredSecondaryHost = options.secondaryOllamaHost?.trim() || null;
  const secondaryHost = privateSecondaryOllamaHost(configuredSecondaryHost);
  const secondaryModel = parseSecondaryOllamaModelId(modelId);
  if (secondaryModel && !secondaryHost) {
    throw new LocalModelRequestError(
      "authentication_or_configuration",
      undefined,
      configuredSecondaryHost
        ? { pairedHostUnsafe: true }
        : { pairedHostMissing: true },
    );
  }
  const dualWorkloadModel = secondaryModel
    ? null
    : await resolveDualOllamaWorkloadModelId(modelId, {
        secondaryOllamaHost: secondaryHost,
        experimentalDualOllama: options.experimentalDualOllama === true,
      });
  const useSecondary = Boolean(secondaryModel || dualWorkloadModel);
  return {
    host: useSecondary ? secondaryHost! : config.ollamaHost,
    model: secondaryModel ?? dualWorkloadModel ?? modelId,
    hostKind: useSecondary ? "secondary" : "primary",
  };
}

/** Caps one `/api/show` capability probe so chat turns cannot stall on it. */
const LOCAL_THINKING_PROBE_TIMEOUT_MS = 4_000;
/** Extra num_predict budget for the chain-of-thought ahead of the reply. */
const LOCAL_NATIVE_THINKING_TOKEN_HEADROOM = 1_024;
const LOCAL_THINKING_CAPABILITY_TTL_MS = 5 * 60_000;
const LOCAL_THINKING_CAPABILITY_ERROR_TTL_MS = 60_000;

const localThinkingCapabilityCache = new Map<
  string,
  { value: boolean; expiresAt: number }
>();
const localImageInputCapabilityCache = new Map<
  string,
  { value: boolean; expiresAt: number }
>();

export function resetLocalThinkingCapabilityCacheForTests(): void {
  localThinkingCapabilityCache.clear();
  localImageInputCapabilityCache.clear();
}

/** Whether this Ollama model reports the native `thinking` capability. */
async function ollamaModelSupportsThinking(
  host: string,
  model: string,
): Promise<boolean> {
  const cacheKey = `${host}::${model}`;
  const cached = localThinkingCapabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = false;
  let ttlMs = LOCAL_THINKING_CAPABILITY_TTL_MS;
  try {
    const response = await fetch(`${host}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(LOCAL_THINKING_PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        capabilities?: unknown;
      };
      value =
        Array.isArray(payload.capabilities) &&
        payload.capabilities.includes("thinking");
    } else {
      ttlMs = LOCAL_THINKING_CAPABILITY_ERROR_TTL_MS;
    }
  } catch {
    ttlMs = LOCAL_THINKING_CAPABILITY_ERROR_TTL_MS;
  }
  localThinkingCapabilityCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

/** Whether this Ollama model reports the native `vision` capability. */
async function ollamaModelSupportsImageInput(
  host: string,
  model: string,
): Promise<boolean> {
  const cacheKey = `${host}::${model}`;
  const cached = localImageInputCapabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = false;
  let ttlMs = LOCAL_THINKING_CAPABILITY_TTL_MS;
  try {
    const response = await fetch(`${host}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(LOCAL_THINKING_PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      const payload = (await response.json()) as { capabilities?: unknown };
      value =
        Array.isArray(payload.capabilities) &&
        payload.capabilities.includes("vision");
    } else {
      ttlMs = LOCAL_THINKING_CAPABILITY_ERROR_TTL_MS;
    }
  } catch {
    ttlMs = LOCAL_THINKING_CAPABILITY_ERROR_TTL_MS;
  }
  localImageInputCapabilityCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

/** Server-authoritative image-input gate for the resolved provider/model. */
export async function providerModelSupportsImageInput(
  provider: ProviderName,
  modelId: string,
  options: DualOllamaWorkloadOptions = {},
): Promise<boolean> {
  if (provider !== "local") {
    return onlineModelSupportsImageInput(provider, modelId);
  }
  try {
    const target = await resolveLocalOllamaTarget(modelId, options);
    return await ollamaModelSupportsImageInput(target.host, target.model);
  } catch {
    return false;
  }
}

/**
 * Whether the resolved local model natively thinks. Never throws: an
 * unreachable host or unsafe paired-host reference reports `false`, which
 * callers treat as "keep the simulated ladder".
 */
export async function localModelSupportsNativeThinking(
  model?: string | null,
  options: DualOllamaWorkloadOptions = {},
): Promise<boolean> {
  try {
    const target = await resolveLocalOllamaTarget(
      model?.trim() || config.ollamaModel,
      options,
    );
    return await ollamaModelSupportsThinking(target.host, target.model);
  } catch {
    return false;
  }
}

/** Visible conversational turns where an unset Effort thinks by default. */
const LOCAL_NATIVE_THINK_DEFAULT_PURPOSES: ReadonlySet<UsagePurpose> = new Set([
  "chat_reply",
  "chat_fallback",
]);
/** Visible turns where thinking follows an explicitly chosen Effort only, so
 * multi-bot tables and long-form generators keep their fast default. */
const LOCAL_NATIVE_THINK_EFFORT_PURPOSES: ReadonlySet<UsagePurpose> = new Set([
  "coffee_turn",
  "botcast_turn",
  "debate_generation",
  "story_generation",
]);

/**
 * Effort→thinking mapping for thinking-capable local models: None never
 * thinks, Minimal and above always think, and an unset Effort thinks on the
 * 1:1 chat lanes (the Minimal default). Structured output and private
 * preparation passes never think.
 */
function localNativeThinkRequested(options?: GenerateOptions): boolean {
  if (options?.think === false) return false;
  if (options?.jsonSchema || options?.jsonMode) return false;
  if (options?.think === true) return true;
  const purpose = options?.usagePurpose;
  if (!purpose) return false;
  const effort = normalizeProviderReasoningEffort(options?.reasoningEffort);
  if (effort === "none") return false;
  if (effort === "auto") return LOCAL_NATIVE_THINK_DEFAULT_PURPOSES.has(purpose);
  return (
    LOCAL_NATIVE_THINK_DEFAULT_PURPOSES.has(purpose) ||
    LOCAL_NATIVE_THINK_EFFORT_PURPOSES.has(purpose)
  );
}

/**
 * Thinking-capable models drift toward their trained assistant identity mid
 * chain-of-thought — a small R1 distill will happily reintroduce itself as
 * DeepSeek-R1 over an authored persona. Whenever native thinking runs, pin
 * the persona again at the recency seam of the prompt.
 */
export const LOCAL_NATIVE_THINKING_PERSONA_GUARD = [
  "Private reminder: stay fully in the character defined by your",
  "instructions above, including while reasoning privately. Never say you",
  "are the underlying language model and never name your model, vendor, or",
  "training unless your instructions themselves do.",
].join(" ");

/** Salvages chain-of-thought a model inlined as `<think>…</think>` tags. */
function splitInlineThinkBlock(text: string): {
  text: string;
  thinking: string;
} {
  const match = text.match(/^<think>([\s\S]*?)<\/think>\s*/u);
  if (!match) return { text, thinking: "" };
  return {
    text: text.slice(match[0].length).trim(),
    thinking: (match[1] ?? "").trim(),
  };
}

async function discoverOpenAiModelIds(openAiApiKey?: string): Promise<string[]> {
  if (!openAiApiKey) return [];
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${openAiApiKey}` },
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    return uniqueModelIds(
      (payload.data ?? [])
        .map((model) => (typeof model.id === "string" ? model.id : ""))
        .filter(isAllowedOpenAiChatModel)
        .sort((a, b) => a.localeCompare(b))
    );
  } catch {
    return [];
  }
}

function missingProviderApiKeyStatus(): ProviderApiKeyAuthStatus {
  return {
    configured: false,
    authenticated: false,
    source: "none",
    status: "missing",
    modelCount: 0,
  };
}

function failedProviderApiKeyStatus(
  source: ApiKeyAuthSource,
  status: "invalid" | "unreachable",
  message?: string
): ProviderApiKeyAuthStatus {
  return {
    configured: true,
    authenticated: false,
    source,
    status,
    modelCount: 0,
    ...(message ? { message } : {}),
  };
}

function authenticatedProviderApiKeyStatus(
  source: ApiKeyAuthSource,
  modelCount: number
): ProviderApiKeyAuthStatus {
  return {
    configured: true,
    authenticated: true,
    source,
    status: "authenticated",
    modelCount,
  };
}

function failedAuthStatusFromResponseStatus(status: number): "invalid" | "unreachable" {
  return status === 401 || status === 403 ? "invalid" : "unreachable";
}

export async function checkOpenAiApiKeyStatus(
  openAiApiKey?: string,
  source: ApiKeyAuthSource = openAiApiKey?.trim() ? "account" : "none"
): Promise<ProviderApiKeyAuthStatus> {
  const key = openAiApiKey?.trim();
  if (!key) return missingProviderApiKeyStatus();
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await readOpenAiErrorMessage(response);
      return failedProviderApiKeyStatus(
        source,
        failedAuthStatusFromResponseStatus(response.status),
        detail || `Provider returned ${response.status}.`
      );
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    return authenticatedProviderApiKeyStatus(source, payload.data?.length ?? 0);
  } catch {
    return failedProviderApiKeyStatus(source, "unreachable", "Could not reach OpenAI.");
  }
}

async function discoverAnthropicModelIds(anthropicApiKey?: string): Promise<string[]> {
  if (!anthropicApiKey) return [];
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    return uniqueModelIds(
      (payload.data ?? [])
        .map((model) => (typeof model.id === "string" ? model.id : ""))
        .filter(isAllowedAnthropicChatModel)
        .sort((a, b) => a.localeCompare(b))
    );
  } catch {
    return [];
  }
}

export async function checkAnthropicApiKeyStatus(
  anthropicApiKey?: string,
  source: ApiKeyAuthSource = anthropicApiKey?.trim() ? "account" : "none"
): Promise<ProviderApiKeyAuthStatus> {
  const key = anthropicApiKey?.trim();
  if (!key) return missingProviderApiKeyStatus();
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await readOpenAiErrorMessage(response);
      return failedProviderApiKeyStatus(
        source,
        failedAuthStatusFromResponseStatus(response.status),
        detail || `Provider returned ${response.status}.`
      );
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    return authenticatedProviderApiKeyStatus(source, payload.data?.length ?? 0);
  } catch {
    return failedProviderApiKeyStatus(source, "unreachable", "Could not reach Anthropic.");
  }
}

export async function buildModelCatalog(
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null,
  anthropicApiKey?: string
): Promise<ModelCatalog> {
  const cacheKey = modelCatalogCacheKey(
    openAiApiKey,
    secondaryOllamaHost,
    anthropicApiKey
  );
  const cached = modelCatalogCache.get(cacheKey);
  if (cached) return cached;
  const catalog = buildUncachedModelCatalog(
    openAiApiKey,
    secondaryOllamaHost,
    anthropicApiKey
  );
  modelCatalogCache.set(cacheKey, catalog);
  try {
    return await catalog;
  } catch (error) {
    modelCatalogCache.delete(cacheKey);
    throw error;
  }
}

async function buildUncachedModelCatalog(
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null,
  anthropicApiKey?: string
): Promise<ModelCatalog> {
  const privateSecondaryHost = privateSecondaryOllamaHost(secondaryOllamaHost);
  const [
    discoveredLocal,
    discoveredSecondaryLocal,
    discoveredOpenAi,
    discoveredAnthropic,
  ] = await Promise.all([
    discoverLocalModelIds(config.ollamaHost),
    privateSecondaryHost ? discoverLocalModelIds(privateSecondaryHost) : Promise.resolve([]),
    discoverOpenAiModelIds(openAiApiKey),
    discoverAnthropicModelIds(anthropicApiKey),
  ]);
  const localIds = uniqueModelIdsByLabel([config.ollamaModel, ...discoveredLocal]);
  const secondaryLocalIds = uniqueModelIdsByLabel(discoveredSecondaryLocal);
  const probeThinkingIds = async (
    host: string | null,
    ids: string[],
  ): Promise<Set<string>> => {
    if (!host || ids.length === 0) return new Set();
    const flags = await Promise.all(
      ids.map((id) => ollamaModelSupportsThinking(host, id)),
    );
    return new Set(ids.filter((_, index) => flags[index]));
  };
  const probeImageInputIds = async (
    host: string | null,
    ids: string[],
  ): Promise<Set<string>> => {
    if (!host || ids.length === 0) return new Set();
    const flags = await Promise.all(
      ids.map((id) => ollamaModelSupportsImageInput(host, id)),
    );
    return new Set(ids.filter((_, index) => flags[index]));
  };
  const [
    primaryThinkingIds,
    secondaryThinkingIds,
    primaryImageInputIds,
    secondaryImageInputIds,
  ] = await Promise.all([
    probeThinkingIds(config.ollamaHost, localIds),
    probeThinkingIds(privateSecondaryHost, secondaryLocalIds),
    probeImageInputIds(config.ollamaHost, localIds),
    probeImageInputIds(privateSecondaryHost, secondaryLocalIds),
  ]);
  const onlineIds = openAiApiKey
    ? preferOpenAiChatVariants(
        uniqueModelIds([
          OPENAI_DEFAULT_MODEL,
          ...discoveredOpenAi,
          ...OPENAI_FALLBACK_MODELS,
        ])
      )
    : [];
  const anthropicIds = anthropicApiKey
    ? uniqueAnthropicModelIds([
        ANTHROPIC_DEFAULT_MODEL,
        ...discoveredAnthropic,
        ...ANTHROPIC_FALLBACK_MODELS,
      ])
    : [];
  return {
    local: [
      ...localIds.map((id) =>
        toCatalogEntry(id, "local", config.ollamaModel, {
          localHost: "primary",
          hostLabel: "Primary host",
          thinking: primaryThinkingIds.has(id),
          supportsImageInput: primaryImageInputIds.has(id),
        })
      ),
      ...secondaryLocalIds.map((id) =>
        toCatalogEntry(encodeSecondaryOllamaModelId(id), "local", config.ollamaModel, {
          label: `${modelLabelFromId(id, "local")} (Paired host)`,
          localHost: "secondary",
          hostLabel: "Paired host",
          thinking: secondaryThinkingIds.has(id),
          supportsImageInput: secondaryImageInputIds.has(id),
        })
      ),
    ],
    online: [
      ...onlineIds.map((id) =>
        toCatalogEntry(id, "openai", OPENAI_DEFAULT_MODEL, {
          supportsImageInput: onlineModelSupportsImageInput("openai", id),
        }),
      ),
      ...anthropicIds.map((id) =>
        toCatalogEntry(id, "anthropic", ANTHROPIC_DEFAULT_MODEL, {
          supportsImageInput: onlineModelSupportsImageInput("anthropic", id),
        }),
      ),
    ],
    defaults: {
      local: config.ollamaModel,
      online: OPENAI_DEFAULT_MODEL,
    },
  };
}

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

async function classifyLocalModelHttpFailure(
  response: Response
): Promise<LocalModelRequestFailureKind> {
  let evidence = "";
  try {
    const raw = (await response.text()).slice(0, 1_000);
    try {
      const payload = JSON.parse(raw) as unknown;
      if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        evidence = [record.error, record.message]
          .filter((value): value is string => typeof value === "string")
          .join(" ");
      } else if (typeof payload === "string") {
        evidence = payload;
      }
    } catch {
      evidence = raw;
    }
  } catch {
    // Status-only classification still gives a safe, useful fallback.
  }

  const normalized = evidence.toLowerCase();
  const modelUnavailable =
    /\bmodel\b[\s\S]{0,120}\b(not found|missing|does not exist|unavailable|failed to load|cannot load)\b/u.test(
      normalized
    ) || /\b(pull|download)\b[\s\S]{0,80}\bmodel\b/u.test(normalized);
  if (modelUnavailable) return "model_unavailable";

  const authenticationOrConfiguration =
    /\b(unauthori[sz]ed|forbidden|authentication|credentials?|api[-_ ]?key|permission denied|not configured|configuration error|invalid configuration)\b/u.test(
      normalized
    );
  if (authenticationOrConfiguration) return "authentication_or_configuration";

  if (response.status === 404) return "endpoint_not_found";
  if ([400, 401, 403, 407, 422].includes(response.status)) {
    return "authentication_or_configuration";
  }
  if ([408, 425, 429].includes(response.status) || response.status >= 500) {
    return "service_unavailable";
  }
  return "request_failed";
}

export class LocalOllamaProvider implements LlmProvider {
  public readonly name = "local" as const;
  private readonly secondaryOllamaHost: string | null;
  private readonly secondaryOllamaHostRejected: boolean;
  private readonly experimentalDualOllama: boolean;

  public constructor(options: DualOllamaWorkloadOptions = {}) {
    const configuredSecondaryHost = options.secondaryOllamaHost?.trim() || null;
    this.secondaryOllamaHost = privateSecondaryOllamaHost(configuredSecondaryHost);
    this.secondaryOllamaHostRejected = Boolean(
      configuredSecondaryHost && !this.secondaryOllamaHost,
    );
    this.experimentalDualOllama = options.experimentalDualOllama === true;
  }

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    return generateWithFinalLocalOllamaFallback({
      messages,
      options,
      skipFinalLocalFallback:
        (options?.model?.trim() || config.ollamaModel) === FINAL_LOCAL_OLLAMA_FALLBACK_MODEL,
      generate: () => this.generateResponseDirect(messages, options),
    });
  }

  private async generateResponseDirect(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    if (
      this.secondaryOllamaHostRejected &&
      parseSecondaryOllamaModelId(options?.model?.trim() || config.ollamaModel)
    ) {
      throw new LocalModelRequestError(
        "authentication_or_configuration",
        undefined,
        { pairedHostUnsafe: true },
      );
    }
    const target = await resolveLocalOllamaTarget(
      options?.model?.trim() || config.ollamaModel,
      {
        secondaryOllamaHost: this.secondaryOllamaHost,
        experimentalDualOllama: this.experimentalDualOllama,
      },
    );
    const ollamaHost = target.host;
    const model = target.model;
    const ollamaOptions: Record<string, unknown> = {};
    if (typeof options?.temperature === "number") {
      ollamaOptions.temperature = options.temperature;
    }
    if (typeof options?.maxTokens === "number") {
      // Ollama uses `num_predict` for the max-generation-tokens cap.
      ollamaOptions.num_predict = options.maxTokens;
    }
    if (typeof options?.topP === "number") {
      ollamaOptions.top_p = options.topP;
    }
    if (typeof options?.topK === "number") {
      ollamaOptions.top_k = options.topK;
    }
    if (typeof options?.repetitionPenalty === "number") {
      ollamaOptions.repeat_penalty = options.repetitionPenalty;
    }
    // Thinking-capable models (Qwen3, DeepSeek-R1, etc.) otherwise default to
    // routing the visible reply into `message.thinking` and leave `content`
    // empty, which breaks Prism chat (and any follow-up like
    // sendGeneratedImage / Comfy). Thinking is therefore explicit: the
    // effort→thinking mapping requests it, the capability probe confirms the
    // model actually supports it, and everything else stays `think: false`.
    const think =
      localNativeThinkRequested(options) &&
      (await ollamaModelSupportsThinking(ollamaHost, model));
    if (think && typeof ollamaOptions.num_predict === "number") {
      // Ollama counts thinking tokens against num_predict; keep room for the
      // visible reply after the chain-of-thought.
      ollamaOptions.num_predict =
        ollamaOptions.num_predict + LOCAL_NATIVE_THINKING_TOKEN_HEADROOM;
    }
    const outboundMessages = think
      ? [
          ...messages,
          {
            role: "system" as const,
            content: LOCAL_NATIVE_THINKING_PERSONA_GUARD,
          },
        ]
      : messages;
    const requestBody: Record<string, unknown> = {
      model,
      stream: false,
      messages: ollamaProviderMessages(outboundMessages),
      keep_alive: options?.ollamaKeepAlive ?? "10m",
      think,
    };
    if (options?.jsonSchema) {
      requestBody.format = options.jsonSchema;
    } else if (options?.jsonMode) {
      requestBody.format = "json";
    }
    if (Object.keys(ollamaOptions).length > 0) {
      requestBody.options = ollamaOptions;
    }

    const startedAt = Date.now();
    let response: Response;
    try {
      localOllamaActivityObserver?.(target, true);
      response = await fetch(`${ollamaHost}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });
    } catch (error) {
      if (isAbortFailure(error, options?.signal)) {
        recordDeveloperTranscriptEvent({
          kind: "llm",
          purpose: usagePurpose(options?.usagePurpose),
          provider: "local",
          model,
          request: redactProviderImageData(requestBody),
          error: "Local model request was aborted by the caller.",
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "local",
        model,
        request: redactProviderImageData(requestBody),
        error: "Local model service was unavailable.",
        durationMs: Date.now() - startedAt,
      });
      throw new LocalModelRequestError("service_unavailable");
    } finally {
      localOllamaActivityObserver?.(target, false);
    }
    if (!response.ok) {
      const failureKind = await classifyLocalModelHttpFailure(response);
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "local",
        model,
        request: redactProviderImageData(requestBody),
        error: LOCAL_MODEL_REQUEST_ERROR_MESSAGES[failureKind],
        durationMs: Date.now() - startedAt,
      });
      throw new LocalModelRequestError(failureKind, response.status);
    }
    const payload = (await response.json()) as {
      message?: { content?: string; thinking?: string; tool_calls?: unknown };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
      prompt_eval_duration?: number;
      eval_duration?: number;
    };
    const msg = payload.message;
    const trimmedContent =
      typeof msg?.content === "string"
        ? stripLeadingChatRoleMarker(msg.content.trim())
        : "";
    const trimmedThinking =
      typeof msg?.thinking === "string"
        ? stripLeadingChatRoleMarker(msg.thinking.trim())
        : "";
    const toolCalls = msg?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

    let text = trimmedContent;
    let nativeThinking = trimmedThinking;
    if (text) {
      // Some model builds inline the block instead of using `message.thinking`,
      // even when `think:false` was requested (e.g. an imported GGUF whose
      // Ollama manifest doesn't declare the `thinking` capability, so the
      // request-time `think` flag never reaches the model's own template).
      const inline = splitInlineThinkBlock(text);
      if (inline.text) {
        text = inline.text;
        nativeThinking = nativeThinking || inline.thinking;
      }
    }
    if (!text && trimmedThinking.length > 0) {
      // Last resort when the server still omits `content` (older Ollama / edge builds).
      text = trimmedThinking;
      nativeThinking = "";
    }
    if (think && nativeThinking && text !== nativeThinking) {
      options?.onNativeThinking?.(nativeThinking);
    }

    if (!text) {
      if (hasToolCalls) {
        recordDeveloperTranscriptEvent({
          kind: "llm",
          purpose: usagePurpose(options?.usagePurpose),
          provider: "local",
          model,
          request: redactProviderImageData(requestBody),
          rawOutput: payload,
          stopReason: payload.done_reason ?? null,
          error: "Local model returned tool calls instead of assistant text.",
          durationMs: Date.now() - startedAt,
        });
        throw new Error(
          "Local model returned tool calls instead of assistant text. Prism chat expects normal prose in `message.content` — disable native tool calling for this model in Ollama, or pick a different chat model."
        );
      }
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "local",
        model,
        request: redactProviderImageData(requestBody),
        rawOutput: payload,
        stopReason: payload.done_reason ?? null,
        error: "Local model returned no assistant text.",
        durationMs: Date.now() - startedAt,
      });
      throw new Error(
        "Local chat model returned no assistant text (empty `message.content`). " +
          "If you use a thinking-style model, update Ollama or try another chat model. " +
          "This step is separate from ComfyUI: the Images button uses your local image model only after the assistant has produced a reply."
      );
    }
    const inputTokens =
      typeof payload.prompt_eval_count === "number" ? payload.prompt_eval_count : null;
    const outputTokens = typeof payload.eval_count === "number" ? payload.eval_count : null;
    const durationMs =
      typeof payload.total_duration === "number"
        ? payload.total_duration / 1_000_000
        : Date.now() - startedAt;
    recordTextUsage({
      provider: "local",
      model,
      purpose: usagePurpose(options?.usagePurpose),
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens !== null || outputTokens !== null
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : null,
      tokenCountSource:
        inputTokens !== null || outputTokens !== null ? "provider_reported" : "unavailable",
      durationMs,
      loadDurationMs:
        typeof payload.load_duration === "number" ? payload.load_duration / 1_000_000 : null,
      promptDurationMs:
        typeof payload.prompt_eval_duration === "number"
          ? payload.prompt_eval_duration / 1_000_000
          : null,
      completionDurationMs:
        typeof payload.eval_duration === "number" ? payload.eval_duration / 1_000_000 : null,
      developer: {
        request: redactProviderImageData(requestBody),
        rawOutput: payload,
        parsedOutput: text,
        stopReason: payload.done_reason ?? null,
        streaming: false,
        durationMs,
      },
    });
    localOllamaResponseObserver?.(target);
    return text;
  }

  public async embedText(text: string): Promise<number[]> {
    return embedTextLocal(text, {
      secondaryOllamaHost: this.secondaryOllamaHost,
      experimentalDualOllama: this.experimentalDualOllama,
    });
  }
}

/**
 * The included Ollama model is the final recovery path for text generation.
 * Keep this at the provider boundary so every normal provider caller gets the
 * same recovery without duplicating it in Chat, Coffee, or server routes.
 * Callers that already own an ordered, privacy-lane-scoped recovery chain may
 * explicitly suppress it for that request.
 */
const FINAL_LOCAL_OLLAMA_FALLBACK_MODEL = "llama3.2";

async function generateWithFinalLocalOllamaFallback(args: {
  messages: ProviderMessage[];
  options?: GenerateOptions;
  /** Avoid retrying the final llama3.2 model with itself. */
  skipFinalLocalFallback?: boolean;
  generate: () => Promise<string>;
}): Promise<string> {
  try {
    return await args.generate();
  } catch (primaryError) {
    // Cancellation is control flow, not a failed model response. Retrying it
    // would undermine the caller's stop request.
    if (
      args.skipFinalLocalFallback ||
      args.options?.allowFinalLocalFallback === false ||
      isAbortFailure(primaryError, args.options?.signal)
    ) {
      throw primaryError;
    }

    try {
      // Deliberately construct a primary-host provider with the included model:
      // this must not reuse a paired host, the failed provider, or its model.
      return await new LocalOllamaProvider().generateResponse(args.messages, {
        ...args.options,
        model: FINAL_LOCAL_OLLAMA_FALLBACK_MODEL,
      });
    } catch (fallbackError) {
      if (isAbortFailure(fallbackError, args.options?.signal)) {
        throw fallbackError;
      }
      // The user-facing error remains the original failure; the recovery path
      // is best-effort and must neither recurse nor obscure the root cause.
      throw primaryError;
    }
  }
}

export class OpenAiProvider implements LlmProvider {
  public readonly name = "openai" as const;
  private readonly openAiConfig: OpenAiConfig;

  public constructor(openAiConfig: OpenAiConfig) {
    this.openAiConfig = openAiConfig;
  }

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    return generateWithFinalLocalOllamaFallback({
      messages,
      options,
      generate: () => this.generateResponseDirect(messages, options),
    });
  }

  private async generateResponseDirect(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const modelId = options?.model?.trim() || OPENAI_DEFAULT_MODEL;
    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages: openAiProviderMessages(messages),
    };
    if (options?.jsonSchema) {
      requestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.jsonSchemaName?.trim() || "structured_response",
          strict: true,
          schema: options.jsonSchema,
        },
      };
    } else if (options?.jsonMode) {
      requestBody.response_format = { type: "json_object" };
    }
    if (
      typeof options?.temperature === "number" &&
      !openAiModelUsesFixedDefaultTemperature(modelId)
    ) {
      requestBody.temperature = options.temperature;
    }
    if (
      typeof options?.topP === "number" &&
      !openAiModelUsesFixedDefaultTemperature(modelId)
    ) {
      requestBody.top_p = options.topP;
    }
    if (typeof options?.maxTokens === "number") {
      if (openAiModelUsesMaxCompletionTokens(modelId)) {
        requestBody.max_completion_tokens =
          openAiReasoningAwareCompletionTokenLimit(
            modelId,
            options.maxTokens,
            options.reasoningEffort,
          );
      } else {
        requestBody.max_tokens = options.maxTokens;
      }
    }
    const reasoningEffort = openAiReasoningEffortForRequest(
      modelId,
      options?.reasoningEffort,
    );
    if (reasoningEffort) {
      requestBody.reasoning_effort = reasoningEffort;
    }
    if (options?.turbo && modelSupportsTurboMode("openai", modelId)) {
      requestBody.service_tier = "priority";
    }

    const sendRequest = (body: Record<string, unknown>) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.openAiConfig.apiKey}`
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

    let startedAt = Date.now();
    let response: Response;
    try {
      response = await sendRequest(requestBody);
    } catch (error) {
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "openai",
        model: modelId,
        request: redactProviderImageData(requestBody),
        error: isAbortFailure(error, options?.signal)
          ? "OpenAI request was aborted by the caller."
          : "OpenAI request could not reach the provider.",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
    if (!response.ok) {
      // Surface OpenAI's actual reason (e.g. "model 'foo' does not exist",
      // "Incorrect API key provided", context-length errors) instead of a
      // bare status code. Log the full detail server-side too so a dev
      // tailing the terminal can diagnose without the user re-hitting it.
      const detail = await readOpenAiErrorMessage(response);
      const modelUsed = (requestBody.model as string) ?? OPENAI_DEFAULT_MODEL;
      if (
        requestBody.reasoning_effort &&
        response.status === 400 &&
        isUnsupportedReasoningEffortError(detail)
      ) {
        recordDeveloperTranscriptEvent({
          kind: "llm",
          purpose: usagePurpose(options?.usagePurpose),
          provider: "openai",
          model: modelId,
          request: redactProviderImageData(requestBody),
          error: "OpenAI rejected the selected reasoning effort.",
          durationMs: Date.now() - startedAt,
        });
        console.error(
          `[openai] reasoning_effort rejected for model=${modelUsed}; preserving the selected effort detail=${
            detail || "<empty body>"
          }`
        );
        throw new Error(
          `OpenAI rejected the selected ${String(requestBody.reasoning_effort)} reasoning effort for ${modelUsed}. Choose a supported effort or retry with another model.`,
        );
      } else {
        console.error(
          `[openai] chat completion failed status=${response.status} model=${modelUsed} detail=${
            detail || "<empty body>"
          }`
        );
        recordDeveloperTranscriptEvent({
          kind: "llm",
          purpose: usagePurpose(options?.usagePurpose),
          provider: "openai",
          model: modelId,
          request: redactProviderImageData(requestBody),
          error: `OpenAI request failed with HTTP ${response.status}.`,
          durationMs: Date.now() - startedAt,
        });
        throw new Error(formatOpenAiError("OpenAI request failed", response.status, detail));
      }
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; refusal?: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: {
          cached_tokens?: number;
        };
      };
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    const refusal = payload.choices?.[0]?.message?.refusal?.trim();
    const finishReason = payload.choices?.[0]?.finish_reason?.trim().toLowerCase();
    const parsedOutput =
      refusal ??
      content ??
      (finishReason === "content_filter" ? "I cannot help with that request." : null);
    const durationMs = Date.now() - startedAt;
    recordTextUsage({
      provider: "openai",
      model: modelId,
      purpose: usagePurpose(options?.usagePurpose),
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
      cachedInputTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? null,
      tokenCountSource: payload.usage ? "provider_reported" : "unavailable",
      durationMs,
      developer: {
        request: redactProviderImageData(requestBody),
        rawOutput: payload,
        parsedOutput,
        stopReason: finishReason ?? null,
        streaming: false,
        fallback: false,
        ...(!parsedOutput ? { error: "OpenAI returned an empty response." } : {}),
        durationMs,
      },
    });
    if (refusal) {
      return refusal;
    }
    if (!content && finishReason === "content_filter") {
      // Normalize content-filter refusals into refusal prose so the fallback
      // router can detect and retry with the configured local model.
      return "I cannot help with that request.";
    }
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }
    return content;
  }

  public async embedText(text: string): Promise<number[]> {
    return embedTextLocal(text);
  }
}

export class AnthropicProvider implements LlmProvider {
  public readonly name = "anthropic" as const;
  private readonly anthropicConfig: AnthropicConfig;

  public constructor(anthropicConfig: AnthropicConfig) {
    this.anthropicConfig = anthropicConfig;
  }

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    return generateWithFinalLocalOllamaFallback({
      messages,
      options,
      generate: () => this.generateResponseDirect(messages, options),
    });
  }

  private async generateResponseDirect(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const requestedModelId = options?.model?.trim() || "";
    const modelId = isAllowedAnthropicChatModel(requestedModelId)
      ? requestedModelId
      : ANTHROPIC_DEFAULT_MODEL;
    const systemMessages = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean);
    const conversationMessages = anthropicProviderConversationMessages(messages);
    const requestBody: Record<string, unknown> = {
      model: modelId,
      max_tokens: options?.maxTokens ?? 2048,
      messages: conversationMessages.length > 0
        ? conversationMessages
        : [{ role: "user", content: "" }],
    };
    if (systemMessages.length > 0) {
      requestBody.system = systemMessages.join("\n\n");
    }
    const usesFixedDefaultSampling = anthropicModelUsesFixedDefaultSampling(modelId);
    if (!usesFixedDefaultSampling && typeof options?.temperature === "number") {
      requestBody.temperature = options.temperature;
    }
    // Legacy Anthropic models reject requests that specify both temperature
    // and top_p. Prefer the bot's temperature when both are configured, while
    // still honoring top_p on its own. Newer models reject all custom sampling.
    if (
      !usesFixedDefaultSampling &&
      typeof options?.temperature !== "number" &&
      typeof options?.topP === "number"
    ) {
      requestBody.top_p = options.topP;
    }
    if (!usesFixedDefaultSampling && typeof options?.topK === "number") {
      requestBody.top_k = options.topK;
    }
    const reasoningEffort = anthropicReasoningEffortForRequest(
      modelId,
      options?.reasoningEffort
    );
    if (reasoningEffort) {
      requestBody.output_config = { effort: reasoningEffort };
    }
    if (options?.jsonSchema || options?.jsonMode) {
      const jsonInstruction = options.jsonSchema
        ? `Return only a JSON object matching this JSON Schema: ${JSON.stringify(options.jsonSchema)}`
        : "Return only a JSON object.";
      requestBody.system =
        typeof requestBody.system === "string" && requestBody.system.length > 0
          ? `${requestBody.system}\n\n${jsonInstruction}`
          : jsonInstruction;
    }

    const diagnosticRequest = redactProviderImageData({
      messages,
      providerRequest: requestBody,
    });
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.anthropicConfig.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });
    } catch (error) {
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "anthropic",
        model: modelId,
        request: diagnosticRequest,
        error: isAbortFailure(error, options?.signal)
          ? "Anthropic request was aborted by the caller."
          : "Anthropic request could not reach the provider.",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
    if (!response.ok) {
      const detail = await readOpenAiErrorMessage(response);
      console.error(
        `[anthropic] messages failed status=${response.status} model=${modelId} detail=${
          detail || "<empty body>"
        }`
      );
      recordDeveloperTranscriptEvent({
        kind: "llm",
        purpose: usagePurpose(options?.usagePurpose),
        provider: "anthropic",
        model: modelId,
        request: diagnosticRequest,
        error: `Anthropic request failed with HTTP ${response.status}.`,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(formatOpenAiError("Anthropic request failed", response.status, detail));
    }
    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: unknown }>;
      stop_reason?: string | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    const content = (payload.content ?? [])
      .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
      .join("")
      .trim();
    const parsedOutput =
      content || (payload.stop_reason === "refusal" ? "I cannot help with that request." : null);
    const durationMs = Date.now() - startedAt;
    recordTextUsage({
      provider: "anthropic",
      model: modelId,
      purpose: usagePurpose(options?.usagePurpose),
      inputTokens: payload.usage?.input_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? null,
      totalTokens:
        typeof payload.usage?.input_tokens === "number" ||
        typeof payload.usage?.output_tokens === "number"
          ? (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0)
          : null,
      cachedInputTokens: payload.usage?.cache_read_input_tokens ?? null,
      tokenCountSource: payload.usage ? "provider_reported" : "unavailable",
      durationMs,
      developer: {
        request: diagnosticRequest,
        rawOutput: payload,
        parsedOutput,
        stopReason: payload.stop_reason ?? null,
        streaming: false,
        ...(!parsedOutput ? { error: "Anthropic returned an empty response." } : {}),
        durationMs,
      },
    });
    if (content) return content;
    if (payload.stop_reason === "refusal") {
      return "I cannot help with that request.";
    }
    throw new Error("Anthropic returned an empty response.");
  }

  public async embedText(text: string): Promise<number[]> {
    return embedTextLocal(text);
  }
}

/**
 * Resolved local model for quiet background/helper work (orchestration,
 * titles, summarization, memory inference, cleanup, Coffee routing, and helper
 * suggestions). Foreground generation such as Refract follows the global
 * privacy lane, Model/Auto, and Effort controls instead. Per-user Settings
 * override wins; otherwise `OLLAMA_AUXILIARY_MODEL` (default llama3.2).
 */
export function resolveAuxiliaryOllamaModel(prismDefaultLlmModel?: string | null): string {
  const trimmed = typeof prismDefaultLlmModel === "string" ? prismDefaultLlmModel.trim() : "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  return config.ollamaAuxiliaryModel || "llama3.2";
}

export function getAuxiliaryProvider(
  prismDefaultLlmModel?: string | null,
  options: DualOllamaWorkloadOptions = {}
): LlmProvider {
  const auxiliaryModel = resolveAuxiliaryOllamaModel(prismDefaultLlmModel);
  const inner = new LocalOllamaProvider(options);
  return {
    name: "local",
    diagnosticModel: auxiliaryModel,
    async generateResponse(
      messages: ProviderMessage[],
      options?: GenerateOptions
    ): Promise<string> {
      return inner.generateResponse(messages, {
        ...options,
        model: auxiliaryModel,
        // Auxiliary work must never pay a cold-start penalty while PRISM is
        // active. A negative keep_alive is Ollama's indefinite residency mode.
        ollamaKeepAlive: -1,
      });
    },
    async embedText(text: string): Promise<number[]> {
      return inner.embedText(text);
    }
  };
}

/**
 * Build a terse, single-line error message safe to put in a toast. Keeps
 * the status code for quick triage and tacks on the detail OpenAI gave us
 * (already length-capped by `readOpenAiErrorMessage`).
 */
function formatOpenAiError(
  prefix: string,
  status: number,
  detail: string
): string {
  if (!detail) {
    return `${prefix} (${status})`;
  }
  return `${prefix} (${status}): ${detail}`;
}

/**
 * Pick the LLM provider for a chat turn.
 *
 * LOCAL mode is a strict privacy invariant: the user's toggle is honored
 * unconditionally. No heuristic or hidden setting can escalate a LOCAL turn
 * to an external provider; that is what makes the LOCAL indicator
 * trustworthy.
 *
 * OPENAI mode requires a real API key — we throw rather than silently fall
 * back to LOCAL so the UI can surface the misconfiguration instead of
 * mislabelling the reply.
 */
export function selectProvider(
  preferredProvider: ProviderName,
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null,
  anthropicApiKey?: string
): LlmProvider {
  if (preferredProvider === "openai") {
    if (!openAiApiKey) {
      throw new Error(
        "OpenAI is selected but no API key is available. Save a key in Settings or set OPENAI_API_KEY in the server environment."
      );
    }
    return new OpenAiProvider({ apiKey: openAiApiKey });
  }
  if (preferredProvider === "anthropic") {
    if (!anthropicApiKey) {
      throw new Error(
        "Anthropic is selected but no API key is available. Save a key in Settings or set ANTHROPIC_API_KEY in the server environment."
      );
    }
    return new AnthropicProvider({ apiKey: anthropicApiKey });
  }
  return new LocalOllamaProvider({ secondaryOllamaHost });
}
