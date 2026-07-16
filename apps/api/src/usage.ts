import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  UsageBreakdownItem,
  UsageEventType,
  UsagePrivacyScope,
  UsageProviderName,
  UsagePurpose,
  UsageRange,
  UsageRecentEvent,
  UsageResponse,
  UsageTokenCountSource,
  UsageTotals,
} from "@localai/shared";

type UsageMode = "zen" | "sandbox" | "coffee" | "story" | "system" | string | null;

interface UsageSession {
  db: DatabaseSync;
  userId: string;
  requestId: string;
  privacyScope: UsagePrivacyScope;
  mode?: UsageMode;
  surface: string;
  conversationId?: string | null;
  messageId?: string | null;
  botId?: string | null;
  developerSequence: number;
}

export interface UsageSessionInput {
  db: DatabaseSync;
  userId: string;
  privacyScope?: UsagePrivacyScope;
  mode?: UsageMode;
  surface: string;
  conversationId?: string | null;
  messageId?: string | null;
  botId?: string | null;
  requestId?: string;
}

export interface UsageTextEventInput {
  provider: UsageProviderName;
  model: string;
  purpose?: UsagePurpose;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cachedInputTokens?: number | null;
  tokenCountSource: UsageTokenCountSource;
  durationMs?: number | null;
  loadDurationMs?: number | null;
  promptDurationMs?: number | null;
  completionDurationMs?: number | null;
  createdAt?: string;
  /** Provider-level diagnostic detail used only by explicit Developer Transcript exports. */
  developer?: Omit<DeveloperTranscriptEventInput, "kind" | "purpose" | "provider" | "model" | "createdAt">;
}

export interface DeveloperTranscriptEventInput {
  kind: "llm" | "search" | "tool";
  purpose: string;
  provider?: string | null;
  model?: string | null;
  request?: unknown;
  rawOutput?: unknown;
  parsedOutput?: unknown;
  stopReason?: string | null;
  streaming?: boolean;
  error?: string | null;
  durationMs?: number | null;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cachedInputTokens?: number | null;
    tokenCountSource?: UsageTokenCountSource;
  };
  fallback?: boolean;
  createdAt?: string;
}

export interface UsageImageEventInput {
  provider: UsageProviderName;
  model: string;
  purpose?: UsagePurpose;
  imageCount?: number | null;
  imageSize?: string | null;
  imageQuality?: string | null;
  durationMs?: number | null;
  createdAt?: string;
}

const usageStorage = new AsyncLocalStorage<UsageSession>();

const ONLINE_PROVIDERS = new Set<UsageProviderName>(["openai", "anthropic"]);

const USAGE_RANGE_MS: Record<Exclude<UsageRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

type TextPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  source: "builtin";
  note: string;
};

type ImagePrice = {
  outputUsdPerMillion: number;
  source: "builtin";
  note: string;
};

const TEXT_PRICING: Record<string, TextPrice> = {
  "gpt-5.4-mini": {
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.5,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.4-nano": {
    inputUsdPerMillion: 0.2,
    outputUsdPerMillion: 1.25,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.3-chat-latest": {
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.3-codex": {
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.2": {
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.2-chat-latest": {
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.2-codex": {
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.2-pro": {
    inputUsdPerMillion: 21,
    outputUsdPerMillion: 168,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.1": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.1-chat-latest": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.1-codex": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.1-codex-max": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5.1-codex-mini": {
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-chat-latest": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-codex": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-mini": {
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-nano": {
    inputUsdPerMillion: 0.05,
    outputUsdPerMillion: 0.4,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-pro": {
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 120,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-5-search-api": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-4o-mini": {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-4o": {
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-4.1": {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 8,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-4.1-mini": {
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "gpt-4.1-nano": {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "chatgpt-4o-latest": {
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 15,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "o3": {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 8,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "o3-pro": {
    inputUsdPerMillion: 20,
    outputUsdPerMillion: 80,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "o4-mini": {
    inputUsdPerMillion: 1.1,
    outputUsdPerMillion: 4.4,
    source: "builtin",
    note: "Estimated OpenAI API text pricing catalog.",
  },
  "claude-3-5-sonnet-latest": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    source: "builtin",
    note: "Estimated Anthropic API text pricing catalog.",
  },
  "claude-sonnet-4-6": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    source: "builtin",
    note: "Estimated Anthropic API text pricing catalog.",
  },
  "claude-sonnet-4-5": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    source: "builtin",
    note: "Estimated Anthropic API text pricing catalog.",
  },
  "claude-opus-4-8": {
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
    source: "builtin",
    note: "Estimated Anthropic API text pricing catalog.",
  },
  "claude-haiku-4-5": {
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5,
    source: "builtin",
    note: "Estimated Anthropic API text pricing catalog.",
  },
};

const IMAGE_PRICING: Record<string, ImagePrice> = {
  "gpt-image-2": {
    outputUsdPerMillion: 30,
    source: "builtin",
    note: "Estimated OpenAI API image output-token pricing catalog.",
  },
  "gpt-image-1.5": {
    outputUsdPerMillion: 32,
    source: "builtin",
    note: "Estimated OpenAI API image output-token pricing catalog.",
  },
  "gpt-image-1-mini": {
    outputUsdPerMillion: 8,
    source: "builtin",
    note: "Estimated OpenAI API image output-token pricing catalog.",
  },
  "gpt-image-1": {
    outputUsdPerMillion: 40,
    source: "builtin",
    note: "Estimated OpenAI API image output-token pricing catalog.",
  },
  "chatgpt-image-latest": {
    outputUsdPerMillion: 32,
    source: "builtin",
    note: "Estimated OpenAI API image output-token pricing catalog.",
  },
};

const IMAGE_OUTPUT_TOKENS: Record<string, Record<string, number>> = {
  low: {
    "1024x1024": 272,
    "1024x1536": 408,
    "1536x1024": 400,
  },
  medium: {
    "1024x1024": 1056,
    "1024x1536": 1584,
    "1536x1024": 1568,
  },
  high: {
    "1024x1024": 4160,
    "1024x1536": 6240,
    "1536x1024": 6208,
  },
};

type UsageAggregateRow = {
  event_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  local_tokens: number | null;
  online_tokens: number | null;
  image_count: number | null;
  estimated_cost_micro_usd: number | null;
  provider_reported_events: number | null;
  estimated_token_events: number | null;
  unpriced_online_events: number | null;
};

type UsageBreakdownRow = UsageAggregateRow & {
  key: string | null;
  provider: string | null;
  model: string | null;
  purpose: string | null;
};

type UsageRecentRow = {
  id: string;
  created_at: string;
  surface: string;
  mode: string | null;
  purpose: string;
  provider: string;
  model: string;
  event_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  token_count_source: string;
  image_count: number | null;
  image_size: string | null;
  image_quality: string | null;
  cost_micro_usd: number | null;
  pricing_snapshot_json: string | null;
};

function normalizeUsagePurpose(value: string | null | undefined): UsagePurpose {
  switch (value) {
    case "chat_reply":
    case "chat_boundary":
    case "chat_fallback":
    case "chat_web_search_followup":
    case "conversation_title":
    case "coffee_turn":
    case "coffee_router":
    case "coffee_summary":
    case "composer_cleanup":
    case "embedding":
    case "image_generation":
    case "image_prompt":
    case "memory_inference":
    case "memory_summary":
    case "prompt_wildcard":
    case "psychic_planning":
    case "slate_draft":
    case "slate_revision":
    case "slate_shape":
    case "story_generation":
    case "zen_live_action":
    case "system_unlabeled":
      return value;
    default:
      return "system_unlabeled";
  }
}

function normalizeProvider(value: string | null | undefined): UsageProviderName {
  switch (value) {
    case "local":
    case "openai":
    case "anthropic":
    case "ollama":
    case "comfyui":
      return value;
    default:
      return "unknown";
  }
}

function normalizeEventType(value: string | null | undefined): UsageEventType {
  return value === "embedding" || value === "image" || value === "text" ? value : "text";
}

function normalizeTokenSource(value: string | null | undefined): UsageTokenCountSource {
  return value === "provider_reported" || value === "estimated" || value === "unavailable"
    ? value
    : "unavailable";
}

function nullableInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function estimateTokensFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function providerLabel(provider: UsageProviderName): string {
  if (provider === "local") return "Local";
  if (provider === "ollama") return "Ollama";
  if (provider === "comfyui") return "ComfyUI";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Unknown";
}

function purposeLabel(purpose: UsagePurpose): string {
  return purpose
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function priceForTextModel(provider: UsageProviderName, model: string): TextPrice | null {
  if (!ONLINE_PROVIDERS.has(provider)) return null;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;
  if (TEXT_PRICING[normalized]) return TEXT_PRICING[normalized];
  const withoutSnapshot = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (TEXT_PRICING[withoutSnapshot]) return TEXT_PRICING[withoutSnapshot];
  if (provider === "anthropic" && normalized.includes("sonnet")) {
    return TEXT_PRICING["claude-sonnet-4-6"] ?? null;
  }
  if (provider === "anthropic" && normalized.includes("opus")) {
    return TEXT_PRICING["claude-opus-4-8"] ?? null;
  }
  if (provider === "anthropic" && normalized.includes("haiku")) {
    return TEXT_PRICING["claude-haiku-4-5"] ?? null;
  }
  return null;
}

function priceForImageModel(provider: UsageProviderName, model: string): ImagePrice | null {
  if (provider !== "openai") return null;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;
  return IMAGE_PRICING[normalized] ?? null;
}

function normalizeImageQuality(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  if (normalized === "standard") return "medium";
  if (normalized === "hd") return "high";
  return null;
}

function normalizeImageSize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "1024x1024" || normalized === "1024x1536" || normalized === "1536x1024") {
    return normalized;
  }
  if (normalized === "1024x1792") return "1024x1536";
  if (normalized === "1792x1024") return "1536x1024";
  return null;
}

function estimateImageOutputTokens(args: {
  provider: UsageProviderName;
  model: string;
  imageCount: number | null;
  imageSize: string | null;
  imageQuality: string | null;
}): number | null {
  if (!priceForImageModel(args.provider, args.model)) return null;
  const quality = normalizeImageQuality(args.imageQuality);
  const size = normalizeImageSize(args.imageSize);
  if (!quality || !size) return null;
  const perImageTokens = IMAGE_OUTPUT_TOKENS[quality]?.[size];
  if (!perImageTokens) return null;
  return perImageTokens * Math.max(1, args.imageCount ?? 1);
}

function estimateUsageCostMicroUsd(args: {
  provider: UsageProviderName;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  eventType: UsageEventType;
  imageSize: string | null;
  imageQuality: string | null;
}): { costMicroUsd: number | null; snapshot: string | null } {
  if (args.eventType === "text") {
    const price = priceForTextModel(args.provider, args.model);
    if (!price) return { costMicroUsd: null, snapshot: null };
    const inputTokens = args.inputTokens ?? 0;
    const outputTokens = args.outputTokens ?? 0;
    const costMicroUsd = Math.round(
      inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion
    );
    return {
      costMicroUsd,
      snapshot: JSON.stringify({
        kind: "text",
        source: price.source,
        inputUsdPerMillion: price.inputUsdPerMillion,
        outputUsdPerMillion: price.outputUsdPerMillion,
        note: price.note,
      }),
    };
  }
  if (args.eventType === "image") {
    const price = priceForImageModel(args.provider, args.model);
    if (!price || args.outputTokens === null) return { costMicroUsd: null, snapshot: null };
    return {
      costMicroUsd: Math.round(args.outputTokens * price.outputUsdPerMillion),
      snapshot: JSON.stringify({
        kind: "image",
        source: price.source,
        outputUsdPerMillion: price.outputUsdPerMillion,
        outputTokenEstimateOnly: true,
        imageSize: normalizeImageSize(args.imageSize),
        imageQuality: normalizeImageQuality(args.imageQuality),
        note: price.note,
      }),
    };
  }
  return { costMicroUsd: null, snapshot: null };
}

function currentSession(): UsageSession | undefined {
  return usageStorage.getStore();
}

function safeDiagnosticJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (typeof item !== "object" || item === null) return item;
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
      return item;
    });
  } catch {
    return JSON.stringify({ error: "Diagnostic payload could not be serialized." });
  }
}

/**
 * Persist one session-scoped developer diagnostic event. Private/incognito usage sessions
 * deliberately skip this durable trace, matching their no-persistence contract.
 */
export function recordDeveloperTranscriptEvent(args: DeveloperTranscriptEventInput): void {
  const session = currentSession();
  if (!session || session.privacyScope === "private") return;
  session.developerSequence += 1;
  const payload = {
    ...(args.request !== undefined ? { request: args.request } : {}),
    ...(args.rawOutput !== undefined ? { rawOutput: args.rawOutput } : {}),
    ...(args.parsedOutput !== undefined ? { parsedOutput: args.parsedOutput } : {}),
    ...(args.stopReason !== undefined ? { stopReason: args.stopReason } : {}),
    streaming: args.streaming === true,
    ...(args.error ? { error: args.error } : {}),
    ...(typeof args.durationMs === "number" && Number.isFinite(args.durationMs)
      ? { durationMs: Math.max(0, args.durationMs) }
      : {}),
    ...(args.usage ? { usage: args.usage } : {}),
    ...(args.fallback === true ? { fallback: true } : {}),
  };
  try {
    session.db
      .prepare(
        `INSERT INTO developer_transcript_events (
          id, user_id, conversation_id, message_id, bot_id, request_id,
          request_sequence, event_kind, purpose, provider, model, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        session.userId,
        sessionLinkedValue(session, session.conversationId),
        sessionLinkedValue(session, session.messageId),
        sessionLinkedValue(session, session.botId),
        session.requestId,
        session.developerSequence,
        args.kind,
        args.purpose.trim() || "system_unlabeled",
        args.provider?.trim() || null,
        args.model?.trim() || null,
        safeDiagnosticJson(payload),
        args.createdAt ?? new Date().toISOString()
      );
  } catch (error) {
    console.warn(
      "[developer-transcript] failed to record event:",
      error instanceof Error ? error.message : error
    );
  }
}

function sessionLinkedValue<T extends string | null | undefined>(
  session: UsageSession,
  value: T
): string | null {
  if (session.privacyScope === "private") return null;
  return value?.trim() || null;
}

function insertUsageEvent(
  session: UsageSession,
  args: UsageTextEventInput & {
    eventType: UsageEventType;
    imageCount?: number | null;
    imageSize?: string | null;
    imageQuality?: string | null;
  }
): void {
  const inputTokens = nullableInt(args.inputTokens);
  const outputTokens = nullableInt(args.outputTokens);
  const totalTokens =
    nullableInt(args.totalTokens) ??
    (inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null);
  const eventType = normalizeEventType(args.eventType);
  const provider = normalizeProvider(args.provider);
  const model = args.model.trim() || "unknown";
  const imageSize = args.imageSize?.trim() || null;
  const imageQuality = args.imageQuality?.trim() || null;
  const { costMicroUsd, snapshot } = estimateUsageCostMicroUsd({
    provider,
    model,
    inputTokens,
    outputTokens,
    eventType,
    imageSize,
    imageQuality,
  });
  const createdAt = args.createdAt ?? new Date().toISOString();
  const durationMs = nullableInt(args.durationMs);
  try {
    session.db
      .prepare(
        `INSERT INTO usage_events (
          id, user_id, conversation_id, message_id, bot_id, request_id,
          privacy_scope, mode, surface, purpose, provider, model, event_type,
          input_tokens, output_tokens, total_tokens, cached_input_tokens,
          image_count, image_size, image_quality,
          duration_ms, load_duration_ms, prompt_duration_ms, completion_duration_ms,
          token_count_source, cost_micro_usd, pricing_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        session.userId,
        sessionLinkedValue(session, session.conversationId),
        sessionLinkedValue(session, session.messageId),
        sessionLinkedValue(session, session.botId),
        session.requestId,
        session.privacyScope,
        session.mode ?? null,
        session.surface,
        normalizeUsagePurpose(args.purpose),
        provider,
        model,
        eventType,
        inputTokens,
        outputTokens,
        totalTokens,
        nullableInt(args.cachedInputTokens),
        nullableInt(args.imageCount),
        imageSize,
        imageQuality,
        durationMs,
        nullableInt(args.loadDurationMs),
        nullableInt(args.promptDurationMs),
        nullableInt(args.completionDurationMs),
        args.tokenCountSource,
        costMicroUsd,
        snapshot,
        createdAt
      );
  } catch (error) {
    console.warn("[usage] failed to record usage event:", error instanceof Error ? error.message : error);
  }
}

export function runWithUsageSession<T>(
  input: UsageSessionInput,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return usageStorage.run(createUsageSession(input), fn);
}

export function enterUsageSession(input: UsageSessionInput): void {
  usageStorage.enterWith(createUsageSession(input));
}

function createUsageSession(input: UsageSessionInput): UsageSession {
  const session: UsageSession = {
    db: input.db,
    userId: input.userId,
    requestId: input.requestId ?? randomUUID(),
    privacyScope: input.privacyScope ?? "normal",
    surface: input.surface,
    developerSequence: 0,
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.botId !== undefined ? { botId: input.botId } : {}),
  };
  return session;
}

export function patchUsageSession(
  patch: Partial<Pick<UsageSessionInput, "conversationId" | "messageId" | "botId" | "mode" | "surface">>
): void {
  const session = currentSession();
  if (!session) return;
  if (patch.conversationId !== undefined) session.conversationId = patch.conversationId;
  if (patch.messageId !== undefined) session.messageId = patch.messageId;
  if (patch.botId !== undefined) session.botId = patch.botId;
  if (patch.mode !== undefined) session.mode = patch.mode;
  if (patch.surface !== undefined) session.surface = patch.surface;
  if (session.privacyScope === "private") return;
  if (
    patch.conversationId === undefined &&
    patch.messageId === undefined &&
    patch.botId === undefined
  ) {
    return;
  }
  try {
    const conversationId = sessionLinkedValue(session, session.conversationId);
    const messageId = sessionLinkedValue(session, session.messageId);
    const botId = sessionLinkedValue(session, session.botId);
    session.db
      .prepare(
        `UPDATE usage_events
         SET conversation_id = COALESCE(conversation_id, ?),
             message_id = COALESCE(message_id, ?),
             bot_id = COALESCE(bot_id, ?)
         WHERE user_id = ? AND request_id = ? AND privacy_scope != 'private'`
      )
      .run(conversationId, messageId, botId, session.userId, session.requestId);
    session.db
      .prepare(
        `UPDATE developer_transcript_events
         SET conversation_id = COALESCE(conversation_id, ?),
             message_id = COALESCE(message_id, ?),
             bot_id = COALESCE(bot_id, ?)
         WHERE user_id = ? AND request_id = ?`
      )
      .run(conversationId, messageId, botId, session.userId, session.requestId);
  } catch (error) {
    console.warn(
      "[usage] failed to patch persisted request linkage:",
      error instanceof Error ? error.message : error
    );
  }
}

export function attachUsageEventsToMessage(args: {
  conversationId: string;
  messageId: string;
  botId?: string | null;
}): void {
  const session = currentSession();
  if (!session || session.privacyScope === "private") return;
  session.conversationId = args.conversationId;
  session.messageId = args.messageId;
  if (args.botId !== undefined) session.botId = args.botId;
  try {
    session.db
      .prepare(
        `UPDATE usage_events
         SET conversation_id = COALESCE(conversation_id, ?),
             message_id = COALESCE(message_id, ?),
             bot_id = COALESCE(bot_id, ?)
         WHERE user_id = ?
           AND request_id = ?
           AND privacy_scope != 'private'
           AND message_id IS NULL`
      )
      .run(
        args.conversationId,
        args.messageId,
        args.botId ?? null,
        session.userId,
        session.requestId
      );
    session.db
      .prepare(
        `UPDATE developer_transcript_events
         SET conversation_id = COALESCE(conversation_id, ?),
             message_id = COALESCE(message_id, ?),
             bot_id = COALESCE(bot_id, ?)
         WHERE user_id = ?
           AND request_id = ?
           AND message_id IS NULL`
      )
      .run(
        args.conversationId,
        args.messageId,
        args.botId ?? null,
        session.userId,
        session.requestId
      );
  } catch (error) {
    console.warn(
      "[usage] failed to attach usage events:",
      error instanceof Error ? error.message : error
    );
  }
}

export function recordTextUsage(args: UsageTextEventInput): void {
  const session = currentSession();
  if (!session) return;
  const createdAt = args.createdAt ?? new Date().toISOString();
  insertUsageEvent(session, {
    ...args,
    createdAt,
    eventType: "text",
  });
  if (args.developer) {
    recordDeveloperTranscriptEvent({
      kind: "llm",
      purpose: args.purpose ?? "system_unlabeled",
      provider: args.provider,
      model: args.model,
      ...args.developer,
      durationMs: args.developer.durationMs ?? args.durationMs ?? null,
      usage: args.developer.usage ?? {
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: args.totalTokens,
        cachedInputTokens: args.cachedInputTokens,
        tokenCountSource: args.tokenCountSource,
      },
      createdAt,
    });
  }
}

export function recordEstimatedEmbeddingUsage(args: {
  provider: UsageProviderName;
  model: string;
  text: string;
  purpose?: UsagePurpose;
  durationMs?: number | null;
}): void {
  const session = currentSession();
  if (!session) return;
  const inputTokens = estimateTokensFromText(args.text);
  insertUsageEvent(session, {
    provider: args.provider,
    model: args.model,
    purpose: args.purpose ?? "embedding",
    inputTokens,
    outputTokens: 0,
    totalTokens: inputTokens,
    tokenCountSource: "estimated",
    durationMs: args.durationMs,
    eventType: "embedding",
  });
}

export function recordImageUsage(args: UsageImageEventInput): void {
  const session = currentSession();
  if (!session) return;
  const provider = normalizeProvider(args.provider);
  const imageCount = nullableInt(args.imageCount) ?? 1;
  const estimatedOutputTokens = estimateImageOutputTokens({
    provider,
    model: args.model,
    imageCount,
    imageSize: args.imageSize ?? null,
    imageQuality: args.imageQuality ?? null,
  });
  insertUsageEvent(session, {
    provider,
    model: args.model,
    purpose: args.purpose ?? "image_generation",
    inputTokens: null,
    outputTokens: estimatedOutputTokens,
    totalTokens: estimatedOutputTokens,
    tokenCountSource: estimatedOutputTokens === null ? "unavailable" : "estimated",
    durationMs: args.durationMs,
    eventType: "image",
    imageCount,
    imageSize: args.imageSize ?? null,
    imageQuality: args.imageQuality ?? null,
    createdAt: args.createdAt,
  });
}

export function usagePurpose(value: UsagePurpose | undefined): UsagePurpose {
  return value ?? "system_unlabeled";
}

function rangeStartFor(range: UsageRange, now: Date): string | null {
  if (range === "all") return null;
  return new Date(now.getTime() - USAGE_RANGE_MS[range]).toISOString();
}

function baseWhere(args: {
  userId: string;
  rangeStart: string | null;
  conversationId?: string | null;
}): { where: string; params: string[] } {
  const clauses = ["user_id = ?"];
  const params: string[] = [args.userId];
  if (args.rangeStart) {
    clauses.push("created_at >= ?");
    params.push(args.rangeStart);
  }
  if (args.conversationId) {
    clauses.push("conversation_id = ?");
    params.push(args.conversationId);
  }
  return {
    where: clauses.join(" AND "),
    params,
  };
}

function aggregateSelect(): string {
  return `
    COUNT(*) AS event_count,
    COALESCE(SUM(COALESCE(input_tokens, 0)), 0) AS input_tokens,
    COALESCE(SUM(COALESCE(output_tokens, 0)), 0) AS output_tokens,
    COALESCE(SUM(COALESCE(total_tokens, 0)), 0) AS total_tokens,
    COALESCE(SUM(CASE WHEN provider IN ('local', 'ollama', 'comfyui') THEN COALESCE(total_tokens, 0) ELSE 0 END), 0) AS local_tokens,
    COALESCE(SUM(CASE WHEN provider IN ('openai', 'anthropic') THEN COALESCE(total_tokens, 0) ELSE 0 END), 0) AS online_tokens,
    COALESCE(SUM(COALESCE(image_count, 0)), 0) AS image_count,
    COALESCE(SUM(COALESCE(cost_micro_usd, 0)), 0) AS estimated_cost_micro_usd,
    COALESCE(SUM(CASE WHEN token_count_source = 'provider_reported' THEN 1 ELSE 0 END), 0) AS provider_reported_events,
    COALESCE(SUM(CASE WHEN token_count_source = 'estimated' THEN 1 ELSE 0 END), 0) AS estimated_token_events,
    COALESCE(SUM(CASE WHEN provider IN ('openai', 'anthropic') AND cost_micro_usd IS NULL THEN 1 ELSE 0 END), 0) AS unpriced_online_events
  `;
}

function totalsFromRow(row: UsageAggregateRow | undefined): UsageTotals {
  return {
    eventCount: Number(row?.event_count ?? 0),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    localTokens: Number(row?.local_tokens ?? 0),
    onlineTokens: Number(row?.online_tokens ?? 0),
    imageCount: Number(row?.image_count ?? 0),
    estimatedCostMicroUsd: Number(row?.estimated_cost_micro_usd ?? 0),
    providerReportedEvents: Number(row?.provider_reported_events ?? 0),
    estimatedTokenEvents: Number(row?.estimated_token_events ?? 0),
    unpricedOnlineEvents: Number(row?.unpriced_online_events ?? 0),
  };
}

function breakdownFromRow(
  row: UsageBreakdownRow,
  kind: "provider" | "model" | "purpose"
): UsageBreakdownItem {
  const provider = normalizeProvider(row.provider);
  const purpose = normalizeUsagePurpose(row.purpose);
  const model = row.model?.trim() || "unknown";
  const label =
    kind === "provider"
      ? providerLabel(provider)
      : kind === "purpose"
        ? purposeLabel(purpose)
        : model;
  return {
    key: row.key ?? label,
    label,
    ...(row.provider ? { provider } : {}),
    ...(row.model ? { model } : {}),
    ...(row.purpose ? { purpose } : {}),
    ...totalsFromRow(row),
  };
}

function recentFromRow(row: UsageRecentRow): UsageRecentEvent {
  const provider = normalizeProvider(row.provider);
  return {
    id: row.id,
    createdAt: row.created_at,
    surface: row.surface,
    mode: row.mode,
    purpose: normalizeUsagePurpose(row.purpose),
    provider,
    model: row.model,
    eventType: normalizeEventType(row.event_type),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    tokenCountSource: normalizeTokenSource(row.token_count_source),
    imageCount: row.image_count,
    imageSize: row.image_size,
    imageQuality: row.image_quality,
    estimatedCostMicroUsd: row.cost_micro_usd,
    costEstimated: row.cost_micro_usd !== null,
    unpriced: ONLINE_PROVIDERS.has(provider) && row.cost_micro_usd === null,
  };
}

export function getUsageReport(args: {
  db: DatabaseSync;
  userId: string;
  range: UsageRange;
  conversationId?: string | null;
}): UsageResponse {
  const now = new Date();
  const rangeStart = rangeStartFor(args.range, now);
  const conversationId = args.conversationId?.trim() || null;
  const { where, params } = baseWhere({
    userId: args.userId,
    rangeStart,
    conversationId,
  });
  const totals = totalsFromRow(
    args.db.prepare(`SELECT ${aggregateSelect()} FROM usage_events WHERE ${where}`).get(
      ...params
    ) as UsageAggregateRow | undefined
  );
  const byProvider = args.db
    .prepare(
      `SELECT provider AS key, provider, NULL AS model, NULL AS purpose, ${aggregateSelect()}
       FROM usage_events
       WHERE ${where}
       GROUP BY provider
       ORDER BY total_tokens DESC, image_count DESC, event_count DESC
       LIMIT 12`
    )
    .all(...params)
    .map((row) => breakdownFromRow(row as UsageBreakdownRow, "provider"));
  const byModel = args.db
    .prepare(
      `SELECT provider || ':' || model AS key, provider, model, NULL AS purpose, ${aggregateSelect()}
       FROM usage_events
       WHERE ${where}
       GROUP BY provider, model
       ORDER BY total_tokens DESC, image_count DESC, event_count DESC
       LIMIT 18`
    )
    .all(...params)
    .map((row) => breakdownFromRow(row as UsageBreakdownRow, "model"));
  const byPurpose = args.db
    .prepare(
      `SELECT purpose AS key, NULL AS provider, NULL AS model, purpose, ${aggregateSelect()}
       FROM usage_events
       WHERE ${where}
       GROUP BY purpose
       ORDER BY total_tokens DESC, image_count DESC, event_count DESC
       LIMIT 18`
    )
    .all(...params)
    .map((row) => breakdownFromRow(row as UsageBreakdownRow, "purpose"));
  const recentEvents = args.db
    .prepare(
      `SELECT id, created_at, surface, mode, purpose, provider, model, event_type,
              input_tokens, output_tokens, total_tokens, token_count_source,
              image_count, image_size, image_quality, cost_micro_usd, pricing_snapshot_json
       FROM usage_events
       WHERE ${where} AND privacy_scope != 'private'
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(...params)
    .map((row) => recentFromRow(row as UsageRecentRow));
  const tracking = args.db
    .prepare("SELECT MIN(created_at) AS started_at FROM usage_events WHERE user_id = ?")
    .get(args.userId) as { started_at: string | null } | undefined;
  const trackingStartedAt = tracking?.started_at ?? null;
  const historyRow = args.db
    .prepare(
      `SELECT 1 AS found
       WHERE EXISTS (
         SELECT 1 FROM messages
         WHERE user_id = ?
           AND (? IS NULL OR created_at < ?)
           AND (? IS NULL OR conversation_id = ?)
       )
       OR EXISTS (
         SELECT 1 FROM images
         WHERE user_id = ?
           AND (? IS NULL OR created_at < ?)
           AND (? IS NULL OR conversation_id = ?)
       )`
    )
    .get(
      args.userId,
      trackingStartedAt,
      trackingStartedAt,
      conversationId,
      conversationId,
      args.userId,
      trackingStartedAt,
      trackingStartedAt,
      conversationId,
      conversationId
    ) as { found: number } | undefined;
  return {
    ok: true,
    range: args.range,
    rangeStart,
    generatedAt: now.toISOString(),
    totals,
    byProvider,
    byModel,
    byPurpose,
    recentEvents,
    trackingStartedAt,
    hasUntrackedHistory: Boolean(historyRow?.found),
    conversationScoped: Boolean(conversationId),
  };
}

export function parseUsageRange(value: string | null | undefined): UsageRange {
  return value === "24h" || value === "7d" || value === "30d" || value === "all"
    ? value
    : "7d";
}
