import { getAppConfig } from "@localai/config";

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
}

export interface ModelCatalog {
  local: ModelCatalogEntry[];
  online: ModelCatalogEntry[];
  defaults: {
    local: string;
    online: string;
  };
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
 * Cap on how many characters of an OpenAI error body we echo back through
 * the API surface. OpenAI messages are usually short (<200 chars) but we
 * guard against pathological bodies (HTML error pages from a proxy, etc.)
 * so we don't dump multi-KB strings into the user's toast.
 */
const OPENAI_ERROR_MESSAGE_MAX_CHARS = 500;

function fallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(12).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = index % vector.length;
    vector[bucket] += text.charCodeAt(index) / 255;
  }
  const magnitude = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map((value) => value / magnitude);
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

function uniqueModelIdsByLabel(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    const key = modelLabelFromId(trimmed).toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function toCatalogEntry(
  id: string,
  provider: "local" | "openai",
  defaultId: string
): ModelCatalogEntry {
  return {
    id,
    label: modelLabelFromId(id),
    provider,
    isDefault: id === defaultId || undefined,
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

async function discoverLocalModelIds(): Promise<string[]> {
  try {
    const response = await fetch(`${config.ollamaHost}/api/tags`);
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

async function discoverOpenAiModelIds(openAiApiKey?: string): Promise<string[]> {
  if (!openAiApiKey) return [];
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${openAiApiKey}` },
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

export async function buildModelCatalog(openAiApiKey?: string): Promise<ModelCatalog> {
  const [discoveredLocal, discoveredOnline] = await Promise.all([
    discoverLocalModelIds(),
    discoverOpenAiModelIds(openAiApiKey),
  ]);
  const localIds = uniqueModelIdsByLabel([config.ollamaModel, ...discoveredLocal]);
  const onlineIds = uniqueModelIds([
    OPENAI_DEFAULT_MODEL,
    ...discoveredOnline,
    ...OPENAI_FALLBACK_MODELS,
  ]);
  return {
    local: localIds.map((id) => toCatalogEntry(id, "local", config.ollamaModel)),
    online: onlineIds.map((id) => toCatalogEntry(id, "openai", OPENAI_DEFAULT_MODEL)),
    defaults: {
      local: config.ollamaModel,
      online: OPENAI_DEFAULT_MODEL,
    },
  };
}

export class LocalOllamaProvider implements LlmProvider {
  public readonly name = "local" as const;

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const ollamaOptions: Record<string, unknown> = {};
    if (typeof options?.temperature === "number") {
      ollamaOptions.temperature = options.temperature;
    }
    if (typeof options?.maxTokens === "number") {
      // Ollama uses `num_predict` for the max-generation-tokens cap.
      ollamaOptions.num_predict = options.maxTokens;
    }
    const requestBody: Record<string, unknown> = {
      model: options?.model?.trim() || config.ollamaModel,
      stream: false,
      messages
    };
    if (Object.keys(ollamaOptions).length > 0) {
      requestBody.options = ollamaOptions;
    }

    const response = await fetch(`${config.ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      throw new Error(`Local model request failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      message?: { content?: string };
    };
    const content = payload.message?.content?.trim();
    if (!content) {
      // Surface empty responses as an error so the UI does not display a
      // placeholder "assistant" message and no empty row is persisted.
      throw new Error("Local model returned an empty response.");
    }
    return content;
  }

  public async embedText(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${config.ollamaHost}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
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
    const requestBody: Record<string, unknown> = {
      model: options?.model?.trim() || OPENAI_DEFAULT_MODEL,
      messages
    };
    if (typeof options?.temperature === "number") {
      requestBody.temperature = options.temperature;
    }
    if (typeof options?.maxTokens === "number") {
      requestBody.max_tokens = options.maxTokens;
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
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }
    return content;
  }

  public async embedText(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.openAiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text
      })
    });
    if (!response.ok) {
      const detail = await readOpenAiErrorMessage(response);
      console.error(
        `[openai] embeddings failed status=${response.status} detail=${
          detail || "<empty body>"
        }`
      );
      throw new Error(formatOpenAiError("OpenAI embedding failed", response.status, detail));
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    return payload.data?.[0]?.embedding ?? fallbackEmbedding(text);
  }
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
  openAiApiKey?: string
): LlmProvider {
  if (preferredProvider === "openai") {
    if (!openAiApiKey) {
      throw new Error(
        "OpenAI is selected but no API key is available. Save a key in Settings or set OPENAI_API_KEY in the server environment."
      );
    }
    return new OpenAiProvider({ apiKey: openAiApiKey });
  }
  return new LocalOllamaProvider();
}
