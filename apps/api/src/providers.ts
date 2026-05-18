import { getAppConfig } from "@localai/config";

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
}

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: "local" | "openai";
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

export interface LlmProvider {
  name: "local" | "openai";
  generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string>;
  embedText(text: string): Promise<number[]>;
}

interface OpenAiConfig {
  apiKey: string;
}

const config = getAppConfig();
export const SECONDARY_OLLAMA_MODEL_PREFIX = "ollama-secondary:";

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_FALLBACK_MODELS = [
  OPENAI_DEFAULT_MODEL,
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
] as const;
const OPENAI_CHAT_MODEL_PREFIXES = [
  "gpt-",
  "o1",
  "o3",
  "o4",
] as const;

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
    normalized.startsWith("o4")
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

export async function embedTextLocal(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${config.ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaEmbeddingModel || "nomic-embed-text",
        prompt: text
      })
    });
    if (!response.ok) {
      return fallbackEmbedding(text);
    }
    const payload = (await response.json()) as { embedding?: number[] };
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

function modelLabelFromId(id: string): string {
  const parts = id
    .split(/[-_:]/)
    .filter(Boolean)
    .filter((part, index, allParts) =>
      !(index === allParts.length - 1 && part.toLowerCase() === "latest")
    );
  const displayParts = parts.length > 0 ? parts : [id];
  return displayParts
    .map((part) =>
      part.toUpperCase() === part
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join(" ");
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

function removeModelIdsWithLabels(ids: string[], excludedIds: string[]): string[] {
  const excludedLabels = new Set(excludedIds.map(modelLabelKey));
  return ids.filter((id) => !excludedLabels.has(modelLabelKey(id)));
}

function encodeSecondaryOllamaModelId(id: string): string {
  return `${SECONDARY_OLLAMA_MODEL_PREFIX}${id.trim()}`;
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
  provider: "local" | "openai",
  defaultId: string,
  options: {
    label?: string;
    localHost?: "primary" | "secondary";
    hostLabel?: string;
  } = {}
): ModelCatalogEntry {
  return {
    id,
    label: options.label ?? modelLabelFromId(id),
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

async function discoverLocalModelIds(ollamaHost: string): Promise<string[]> {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return [];
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
    return [];
  }
}

export async function checkLocalModelHostStatus(
  ollamaHost: string | null | undefined
): Promise<LocalModelHostStatus> {
  const normalizedHost = ollamaHost?.trim();
  if (!normalizedHost) {
    return { configured: false, reachable: false, modelCount: 0 };
  }
  const hostCandidates = [normalizedHost];
  const seenCandidates = new Set<string>([normalizedHost]);
  try {
    // Some local setups resolve `localhost` to IPv6 first (::1) even when
    // Ollama only listens on IPv4. Probe 127.0.0.1 as a fallback.
    const parsedHost = new URL(normalizedHost);
    const hostname = parsedHost.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::ffff:127.0.0.1" ||
      hostname === "host.docker.internal"
    ) {
      const loopbackIpv4 = new URL(normalizedHost);
      loopbackIpv4.hostname = "127.0.0.1";
      const loopbackIpv4Candidate = loopbackIpv4.toString().replace(/\/$/, "");
      if (!seenCandidates.has(loopbackIpv4Candidate)) {
        hostCandidates.push(loopbackIpv4Candidate);
        seenCandidates.add(loopbackIpv4Candidate);
      }

      // If this API's primary host is pinned to a LAN IP in env, also probe
      // that address for loopback inputs.
      const primaryHostCandidate = config.ollamaHost.trim();
      if (primaryHostCandidate && !seenCandidates.has(primaryHostCandidate)) {
        hostCandidates.push(primaryHostCandidate);
        seenCandidates.add(primaryHostCandidate);
      }
    }
  } catch {
    // Keep the original candidate; malformed hosts are treated as unreachable.
  }

  for (const host of hostCandidates) {
    try {
      const response = await fetch(`${host}/api/tags`, {
        signal: AbortSignal.timeout(REMOTE_TAGS_PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as {
        models?: Array<{ name?: unknown; model?: unknown }>;
      };
      const modelIds = uniqueModelIds(
        (payload.models ?? [])
          .map((model) =>
            typeof model.name === "string"
              ? model.name
              : typeof model.model === "string"
                ? model.model
                : ""
          )
      );
      return { configured: true, reachable: true, modelCount: modelIds.length };
    } catch {
      // Try next host candidate.
    }
  }

  return { configured: true, reachable: false, modelCount: 0 };
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

export async function buildModelCatalog(
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null
): Promise<ModelCatalog> {
  const [discoveredLocal, discoveredSecondaryLocal, discoveredOnline] = await Promise.all([
    discoverLocalModelIds(config.ollamaHost),
    secondaryOllamaHost ? discoverLocalModelIds(secondaryOllamaHost) : Promise.resolve([]),
    discoverOpenAiModelIds(openAiApiKey),
  ]);
  const localIds = uniqueModelIdsByLabel([config.ollamaModel, ...discoveredLocal]);
  const secondaryLocalIds = removeModelIdsWithLabels(
    uniqueModelIdsByLabel(discoveredSecondaryLocal),
    localIds
  );
  const onlineIds = uniqueModelIds([
    OPENAI_DEFAULT_MODEL,
    ...discoveredOnline,
    ...OPENAI_FALLBACK_MODELS,
  ]);
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
          label: `${modelLabelFromId(id)} (Second host)`,
          localHost: "secondary",
          hostLabel: "Second host",
        })
      ),
    ],
    online: onlineIds.map((id) => toCatalogEntry(id, "openai", OPENAI_DEFAULT_MODEL)),
    defaults: {
      local: config.ollamaModel,
      online: OPENAI_DEFAULT_MODEL,
    },
  };
}

export class LocalOllamaProvider implements LlmProvider {
  public readonly name = "local" as const;
  private readonly secondaryOllamaHost: string | null;

  public constructor(options: { secondaryOllamaHost?: string | null } = {}) {
    this.secondaryOllamaHost = options.secondaryOllamaHost?.trim() || null;
  }

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const requestedModel = options?.model?.trim() || config.ollamaModel;
    const secondaryModel = parseSecondaryOllamaModelId(requestedModel);
    if (secondaryModel && !this.secondaryOllamaHost) {
      throw new Error("Second Ollama host is not configured.");
    }
    const ollamaHost = secondaryModel ? this.secondaryOllamaHost! : config.ollamaHost;
    const model = secondaryModel ?? requestedModel;
    const ollamaOptions: Record<string, unknown> = {};
    if (typeof options?.temperature === "number") {
      ollamaOptions.temperature = options.temperature;
    }
    if (typeof options?.maxTokens === "number") {
      // Ollama uses `num_predict` for the max-generation-tokens cap.
      ollamaOptions.num_predict = options.maxTokens;
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
    if (Object.keys(ollamaOptions).length > 0) {
      requestBody.options = ollamaOptions;
    }

    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      throw new Error(`Local model request failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      message?: { content?: string; thinking?: string; tool_calls?: unknown };
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
    return text;
  }

  public async embedText(text: string): Promise<number[]> {
    return embedTextLocal(text);
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
    if (
      typeof options?.temperature === "number" &&
      !openAiModelUsesFixedDefaultTemperature(modelId)
    ) {
      requestBody.temperature = options.temperature;
    }
    if (typeof options?.maxTokens === "number") {
      if (openAiModelUsesMaxCompletionTokens(modelId)) {
        requestBody.max_completion_tokens = options.maxTokens;
      } else {
        requestBody.max_tokens = options.maxTokens;
      }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.openAiConfig.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      // Surface OpenAI's actual reason (e.g. "model 'foo' does not exist",
      // "Incorrect API key provided", context-length errors) instead of a
      // bare status code. Log the full detail server-side too so a dev
      // tailing the terminal can diagnose without the user re-hitting it.
      const detail = await readOpenAiErrorMessage(response);
      const modelUsed = (requestBody.model as string) ?? OPENAI_DEFAULT_MODEL;
      console.error(
        `[openai] chat completion failed status=${response.status} model=${modelUsed} detail=${
          detail || "<empty body>"
        }`
      );
      throw new Error(formatOpenAiError("OpenAI request failed", response.status, detail));
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; refusal?: string };
        finish_reason?: string;
      }>;
    };
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

export function getAuxiliaryProvider(prismDefaultLlmModel?: string | null): LlmProvider {
  const auxiliaryModel = resolveAuxiliaryOllamaModel(prismDefaultLlmModel);
  const inner = new LocalOllamaProvider();
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
      return embedTextLocal(text);
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
  preferredProvider: "local" | "openai",
  openAiApiKey?: string,
  secondaryOllamaHost?: string | null
): LlmProvider {
  if (preferredProvider === "openai") {
    if (!openAiApiKey) {
      throw new Error(
        "OpenAI is selected but no API key is available. Save a key in Settings or set OPENAI_API_KEY in the server environment."
      );
    }
    return new OpenAiProvider({ apiKey: openAiApiKey });
  }
  return new LocalOllamaProvider({ secondaryOllamaHost });
}
