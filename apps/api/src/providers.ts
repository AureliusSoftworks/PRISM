import { createHash } from "node:crypto";
import { getAppConfig } from "@localai/config";
import {
  openAiModelSupportsReasoningEffort,
  reasoningEffortForRequest,
  type ReasoningEffort,
  type UsagePurpose,
} from "@localai/shared";
import {
  recordEstimatedEmbeddingUsage,
  recordTextUsage,
  usagePurpose,
} from "./usage.ts";

/**
 * Caps how long `/api/models` hangs while probing `/api/tags` or OpenAI’s model list.
 * Without this, unreachable hosts often stall until the TCP stack times out (~minutes).
 */
const REMOTE_TAGS_PROBE_TIMEOUT_MS = 15_000;

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Optional per-call generation overrides, typically supplied by a Bot's configuration. */
export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  reasoningEffort?: ReasoningEffort;
  usagePurpose?: UsagePurpose;
  /** Cancels in-flight provider work when the originating chat request is stopped. */
  signal?: AbortSignal;
  /** Ask providers that support it to constrain the visible reply to a JSON object. */
  jsonMode?: boolean;
  /** Optional JSON Schema for providers that support structured JSON output. */
  jsonSchema?: Record<string, unknown>;
  jsonSchemaName?: string;
}

export type ProviderName = "local" | "openai" | "anthropic";

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
  generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string>;
  embedText(text: string): Promise<number[]>;
}

interface OpenAiConfig {
  apiKey: string;
}

interface AnthropicConfig {
  apiKey: string;
}

interface DualOllamaWorkloadOptions {
  secondaryOllamaHost?: string | null;
  experimentalDualOllama?: boolean;
}

const config = getAppConfig();

// Model lists change only when a provider configuration or the API process
// changes. Keep discovery out of the browser-refresh path: it probes local
// Ollama plus any configured cloud catalogs and can otherwise make every page
// load feel like the models themselves are restarting.
const modelCatalogCache = new Map<string, Promise<ModelCatalog>>();

function modelCatalogCacheKey(
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null,
  anthropicApiKey?: string
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      primaryOllamaHost: config.ollamaHost,
      primaryOllamaModel: config.ollamaModel,
      secondaryOllamaHost: secondaryOllamaHost?.trim() ?? "",
      openAiApiKey: openAiApiKey?.trim() ?? "",
      anthropicApiKey: anthropicApiKey?.trim() ?? "",
    }))
    .digest("hex");
}

/** Test-only reset; production cache lifetime is the API process lifetime. */
export function resetModelCatalogCacheForTests(): void {
  modelCatalogCache.clear();
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
 * Reasoning-style models reject non-default `temperature`; omit the field so
 * the API uses its default (1).
 */
export function openAiModelUsesFixedDefaultTemperature(modelId: string): boolean {
  return openAiReasoningStyleChatApi(modelId);
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
  } = {}
): ModelCatalogEntry {
  return {
    id,
    label: options.label ?? modelLabelFromId(id, provider),
    provider,
    isDefault: id === defaultId || undefined,
    ...(options.localHost ? { localHost: options.localHost } : {}),
    ...(options.hostLabel ? { hostLabel: options.hostLabel } : {}),
  };
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
  const secondaryHost = secondaryOllamaHost?.trim();
  if (!secondaryHost) {
    return disabledDualOllamaStatus("not_configured", { configured: false });
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
  const [
    discoveredLocal,
    discoveredSecondaryLocal,
    discoveredOpenAi,
    discoveredAnthropic,
  ] = await Promise.all([
    discoverLocalModelIds(config.ollamaHost),
    secondaryOllamaHost ? discoverLocalModelIds(secondaryOllamaHost) : Promise.resolve([]),
    discoverOpenAiModelIds(openAiApiKey),
    discoverAnthropicModelIds(anthropicApiKey),
  ]);
  const localIds = uniqueModelIdsByLabel([config.ollamaModel, ...discoveredLocal]);
  const secondaryLocalIds = uniqueModelIdsByLabel(discoveredSecondaryLocal);
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
        })
      ),
      ...secondaryLocalIds.map((id) =>
        toCatalogEntry(encodeSecondaryOllamaModelId(id), "local", config.ollamaModel, {
          label: `${modelLabelFromId(id, "local")} (Paired host)`,
          localHost: "secondary",
          hostLabel: "Paired host",
        })
      ),
    ],
    online: [
      ...onlineIds.map((id) => toCatalogEntry(id, "openai", OPENAI_DEFAULT_MODEL)),
      ...anthropicIds.map((id) => toCatalogEntry(id, "anthropic", ANTHROPIC_DEFAULT_MODEL)),
    ],
    defaults: {
      local: config.ollamaModel,
      online: OPENAI_DEFAULT_MODEL,
    },
  };
}

export class LocalOllamaProvider implements LlmProvider {
  public readonly name = "local" as const;
  private readonly secondaryOllamaHost: string | null;
  private readonly experimentalDualOllama: boolean;

  public constructor(options: DualOllamaWorkloadOptions = {}) {
    this.secondaryOllamaHost = options.secondaryOllamaHost?.trim() || null;
    this.experimentalDualOllama = options.experimentalDualOllama === true;
  }

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const requestedModel = options?.model?.trim() || config.ollamaModel;
    const secondaryModel = parseSecondaryOllamaModelId(requestedModel);
    if (secondaryModel && !this.secondaryOllamaHost) {
      throw new Error("Paired Ollama host is not configured.");
    }
    const dualWorkloadModel = secondaryModel
      ? null
      : await resolveDualOllamaWorkloadModelId(requestedModel, {
          secondaryOllamaHost: this.secondaryOllamaHost,
          experimentalDualOllama: this.experimentalDualOllama,
        });
    const ollamaHost =
      secondaryModel || dualWorkloadModel ? this.secondaryOllamaHost! : config.ollamaHost;
    const model = secondaryModel ?? dualWorkloadModel ?? requestedModel;
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
    const requestBody: Record<string, unknown> = {
      model,
      stream: false,
      messages,
      // Thinking-capable models (Qwen3, DeepSeek-R1, etc.) otherwise default to
      // routing the visible reply into `message.thinking` and leave `content` empty,
      // which breaks Prism chat (and any follow-up like sendGeneratedImage / Comfy).
      think: false,
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
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`Local model request failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      message?: { content?: string; thinking?: string; tool_calls?: unknown };
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
      prompt_eval_duration?: number;
      eval_duration?: number;
    };
    const msg = payload.message;
    const trimmedContent =
      typeof msg?.content === "string" ? msg.content.trim() : "";
    const trimmedThinking =
      typeof msg?.thinking === "string" ? msg.thinking.trim() : "";
    const toolCalls = msg?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

    let text = trimmedContent;
    if (!text && trimmedThinking.length > 0) {
      // Last resort when the server still omits `content` (older Ollama / edge builds).
      text = trimmedThinking;
    }

    if (!text) {
      if (hasToolCalls) {
        throw new Error(
          "Local model returned tool calls instead of assistant text. Prism chat expects normal prose in `message.content` — disable native tool calling for this model in Ollama, or pick a different chat model."
        );
      }
      throw new Error(
        "Local chat model returned no assistant text (empty `message.content`). " +
          "If you use a thinking-style model, update Ollama or try another chat model. " +
          "This step is separate from ComfyUI: the Images button uses your local image model only after the assistant has produced a reply."
      );
    }
    const inputTokens =
      typeof payload.prompt_eval_count === "number" ? payload.prompt_eval_count : null;
    const outputTokens = typeof payload.eval_count === "number" ? payload.eval_count : null;
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
      durationMs:
        typeof payload.total_duration === "number"
          ? payload.total_duration / 1_000_000
          : Date.now() - startedAt,
      loadDurationMs:
        typeof payload.load_duration === "number" ? payload.load_duration / 1_000_000 : null,
      promptDurationMs:
        typeof payload.prompt_eval_duration === "number"
          ? payload.prompt_eval_duration / 1_000_000
          : null,
      completionDurationMs:
        typeof payload.eval_duration === "number" ? payload.eval_duration / 1_000_000 : null,
    });
    return text;
  }

  public async embedText(text: string): Promise<number[]> {
    return embedTextLocal(text, {
      secondaryOllamaHost: this.secondaryOllamaHost,
      experimentalDualOllama: this.experimentalDualOllama,
    });
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
    const modelId = options?.model?.trim() || OPENAI_DEFAULT_MODEL;
    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages
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
        requestBody.max_completion_tokens = options.maxTokens;
      } else {
        requestBody.max_tokens = options.maxTokens;
      }
    }
    const reasoningEffort = reasoningEffortForRequest(options?.reasoningEffort);
    if (reasoningEffort && openAiModelSupportsReasoningEffort(modelId)) {
      requestBody.reasoning_effort = reasoningEffort;
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
    let response = await sendRequest(requestBody);
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
        const retryBody = { ...requestBody };
        delete retryBody.reasoning_effort;
        console.warn(
          `[openai] reasoning_effort rejected for model=${modelUsed}; retrying without effort detail=${
            detail || "<empty body>"
          }`
        );
        startedAt = Date.now();
        response = await sendRequest(retryBody);
        if (response.ok) {
          delete requestBody.reasoning_effort;
        } else {
          const retryDetail = await readOpenAiErrorMessage(response);
          console.error(
            `[openai] chat completion failed status=${response.status} model=${modelUsed} detail=${
              retryDetail || "<empty body>"
            }`
          );
          throw new Error(formatOpenAiError("OpenAI request failed", response.status, retryDetail));
        }
      } else {
        console.error(
          `[openai] chat completion failed status=${response.status} model=${modelUsed} detail=${
            detail || "<empty body>"
          }`
        );
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
    recordTextUsage({
      provider: "openai",
      model: modelId,
      purpose: usagePurpose(options?.usagePurpose),
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
      cachedInputTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? null,
      tokenCountSource: payload.usage ? "provider_reported" : "unavailable",
      durationMs: Date.now() - startedAt,
    });
    const content = payload.choices?.[0]?.message?.content?.trim();
    const refusal = payload.choices?.[0]?.message?.refusal?.trim();
    const finishReason = payload.choices?.[0]?.finish_reason?.trim().toLowerCase();
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
    const requestedModelId = options?.model?.trim() || "";
    const modelId = isAllowedAnthropicChatModel(requestedModelId)
      ? requestedModelId
      : ANTHROPIC_DEFAULT_MODEL;
    const systemMessages = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean);
    const conversationMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));
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
    if (typeof options?.temperature === "number") {
      requestBody.temperature = options.temperature;
    }
    if (typeof options?.topP === "number") {
      requestBody.top_p = options.topP;
    }
    if (typeof options?.topK === "number") {
      requestBody.top_k = options.topK;
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

    const startedAt = Date.now();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.anthropicConfig.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });
    if (!response.ok) {
      const detail = await readOpenAiErrorMessage(response);
      console.error(
        `[anthropic] messages failed status=${response.status} model=${modelId} detail=${
          detail || "<empty body>"
        }`
      );
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
      durationMs: Date.now() - startedAt,
    });
    const content = (payload.content ?? [])
      .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
      .join("")
      .trim();
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
 * Resolved local model for Prism-only lanes (titles, summarization, memory
 * inference, Coffee router, image prompt suggestions). Per-user Settings
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
    async generateResponse(
      messages: ProviderMessage[],
      options?: GenerateOptions
    ): Promise<string> {
      return inner.generateResponse(messages, {
        ...options,
        model: auxiliaryModel,
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
