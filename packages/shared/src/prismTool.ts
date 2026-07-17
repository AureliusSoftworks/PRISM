/**
 * Inline assistant tool payloads (e.g. AskQuestion chips) appended after prose.
 *
 * Mirrors the BOT_META sentinel pattern: delimited blocks the server strips so
 * `messages.content` stays human-readable while structured UI state lives in
 * `tool_payload` (and is re-attached at read time as `chatMessage.askQuestion`).
 */

import type {
  AutoFallbackAttemptTraceV1,
  AutoFallbackFailureReason,
  AutoFallbackProvider,
  AutoRecoveryTraceV1,
} from "./autoFallback.js";
import type { ListenerReactionPlanV1 } from "./listenerReaction.js";

function normalizeStoredAutoRecoveryTrace(
  value: unknown
): AutoRecoveryTraceV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const provider = (candidate: unknown): AutoFallbackProvider | null =>
    candidate === "local" || candidate === "openai" || candidate === "anthropic"
      ? candidate
      : null;
  const finalProvider = provider(row.finalProvider);
  const finalModel = typeof row.finalModel === "string" ? row.finalModel.trim().slice(0, 240) : "";
  if (row.v !== 1 || !finalProvider || !finalModel || !Array.isArray(row.attempts)) {
    return undefined;
  }
  const validReasons = new Set<AutoFallbackFailureReason>([
    "timeout",
    "provider_error",
    "unavailable",
    "empty",
    "refusal",
    "invalid_output",
  ]);
  const attempts = row.attempts
    .slice(0, 3)
    .map((candidate): AutoFallbackAttemptTraceV1 | null => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const attempt = candidate as Record<string, unknown>;
      const attemptProvider = provider(attempt.provider);
      const model = typeof attempt.model === "string" ? attempt.model.trim().slice(0, 240) : "";
      const outcome = attempt.outcome === "failed" || attempt.outcome === "succeeded"
        ? attempt.outcome
        : null;
      const reason = typeof attempt.reason === "string" &&
        validReasons.has(attempt.reason as AutoFallbackFailureReason)
        ? attempt.reason as AutoFallbackFailureReason
        : undefined;
      if (!attemptProvider || !model || !outcome || (outcome === "failed" && !reason)) return null;
      return {
        provider: attemptProvider,
        model,
        durationMs:
          typeof attempt.durationMs === "number" && Number.isFinite(attempt.durationMs)
            ? Math.max(0, Math.round(attempt.durationMs))
            : 0,
        outcome,
        ...(reason ? { reason } : {}),
      };
    })
    .filter((attempt): attempt is AutoFallbackAttemptTraceV1 => attempt !== null);
  if (attempts.length === 0 || attempts.at(-1)?.outcome !== "succeeded") return undefined;
  return {
    v: 1,
    attempts,
    finalProvider,
    finalModel,
    crossedOnline: row.crossedOnline === true,
  };
}

export const PRISM_TOOL_START = "<<<PRISM_TOOL>>>";
export const PRISM_TOOL_END = "<<<END_PRISM_TOOL>>>";

// Models often interpolate spaces or odd breaks; anchored patterns keep false positives unlikely.
const PRISM_TOOL_START_PATTERN = /<<<\s*PRISM\s*_?\s*TOOL\s*>>>/gi;
const PRISM_TOOL_END_PATTERN = /<<<\s*END\s*_?\s*PRISM\s*_?\s*TOOL\s*>>>/gi;

/** Models sometimes emit XML-like `<PRISM_TOOL>…</PRISM_TOOL>` instead of `<<<PRISM_TOOL>>>`. */
const XML_PRISM_TOOL_OPEN_PATTERN = /<\s*PRISM\s*_?\s*TOOL\s*>/gi;
const XML_PRISM_TOOL_CLOSE_PATTERN = /<\s*\/\s*PRISM\s*_?\s*TOOL\s*>/gi;

export interface AskQuestionOption {
  id: string;
  label: string;
}

export interface AskQuestionPayload {
  v: 1;
  name: "AskQuestion";
  prompt: string;
  options: AskQuestionOption[];
}

export interface TellFictionalStoryPayload {
  v: 1;
  name: "tellFictionalStory";
  continueLabel?: string;
  bookmarkLabel?: string;
  finishLabel?: string;
}

/**
 * Persisted attachment when the assistant runs image generation (`images` row).
 */
export interface SentGeneratedImagePayload {
  imageId: string;
  prompt: string;
  displayUrl: string;
  revisedPrompt?: string;
  /** Image pipeline model id (ComfyUI workflow, checkpoint id, Ollama image model, OpenAI image model, …). */
  imageModel?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  displayUrl?: string;
  source?: string;
  snippet?: string;
  thumbnailUrl?: string;
  faviconUrl?: string;
  publishedAt?: string;
}

export interface WebSearchRequestPayload {
  v: 1;
  name: "WebSearch";
  query: string;
}

export interface WebSearchPayload {
  v: 1;
  name: "WebSearch";
  query: string;
  provider: "brave";
  fetchedAt: string;
  results: WebSearchResult[];
}

export interface CoffeeAmbientActionPayload {
  v: 1;
  name: "coffeeAmbientAction";
  source: "scripted";
  category: "sip" | "cup" | "power";
  action: string;
}

export interface CoffeeUserActionPayload {
  v: 1;
  name: "coffeeUserAction";
  source: "user";
  action: string;
  occurredAt: string;
}

export interface CoffeeReplaySocialSnapshotPayload {
  disposition: number;
  valuesFriction: number;
  restraint: number;
  engagement: number;
  leavePressure: number;
}

export interface CoffeeReplayArrivalEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "arrival";
  botId: string;
  occurredAt: string;
  walkDurationMs?: number;
  nameplateDelayMs?: number;
}

export interface CoffeeReplayMoodEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "mood";
  botId: string;
  occurredAt: string;
  social: CoffeeReplaySocialSnapshotPayload;
}

export interface CoffeeReplayTopOffEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "topOff";
  botId: string;
  occurredAt: string;
  progressBefore: number;
  progressAfter: number;
  toppedOffAt: string;
}

export interface CoffeeReplayPlayerDepartureEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "playerDeparture";
  occurredAt: string;
}

export interface CoffeeReplayBotDepartureEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "botDeparture";
  botId: string;
  seatIndex: number;
  occurredAt: string;
}

export interface CoffeeReplayListenerReactionEventPayload {
  v: 1;
  name: "coffeeReplayEvent";
  kind: "listenerReaction";
  botId: string;
  occurredAt: string;
  plan: ListenerReactionPlanV1;
}

export type CoffeeReplayEventPayload =
  | CoffeeReplayArrivalEventPayload
  | CoffeeReplayMoodEventPayload
  | CoffeeReplayTopOffEventPayload
  | CoffeeReplayPlayerDepartureEventPayload
  | CoffeeReplayBotDepartureEventPayload
  | CoffeeReplayListenerReactionEventPayload;

export type ZenDisplayAlign = "start" | "center" | "end";

export interface ZenDisplayPlacement {
  /** Normalized horizontal placement within the available Zen text region. */
  x?: number;
  /** Normalized vertical placement within the available Zen text region. */
  y?: number;
  align?: ZenDisplayAlign;
}

export interface ZenDisplayLinePlacement extends ZenDisplayPlacement {
  /** Zero-based rendered line index after normal newline splitting. */
  index: number;
}

export interface ZenDisplayMetadata {
  v: 1;
  placement?: ZenDisplayPlacement;
  lines?: ZenDisplayLinePlacement[];
}

export type StoredMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export interface StoredAssistantMoodPayload {
  key: StoredMoodKey;
  confidence?: number;
}

export type StoredZenAssistantTurnKind =
  | "persona-transition"
  | "zen-autonomy"
  | "zen-live-action-interrupt";

export interface StoredZenAssistantTurnPayload {
  kind: StoredZenAssistantTurnKind;
  fromBotId?: string | null;
  toBotId?: string | null;
  activeBotId?: string | null;
  style?: "new-speaks" | "previous-introduces";
}

export interface StoredAssistantToolEnvelope {
  v: 1;
  askQuestion?: AskQuestionPayload;
  tellFictionalStory?: TellFictionalStoryPayload;
  mood?: StoredAssistantMoodPayload;
  /** Display-only Zen layout hint. Ignored by non-Zen clients. */
  zenDisplay?: ZenDisplayMetadata;
  /** Internal Zen turn marker used by server-side checkpoint extraction. */
  zenTurn?: StoredZenAssistantTurnPayload;
  /** Persisted assistant-generated image attachment (never the raw model stub). */
  sentGeneratedImage?: SentGeneratedImagePayload;
  /** Persisted web results shown as an assistant-side source card. */
  webSearch?: WebSearchPayload;
  /** Coffee-only scripted ambient action shown as table UI, not transcript prose. */
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  /** Coffee-only user action cue shown as ambient context, not a table turn. */
  coffeeUserAction?: CoffeeUserActionPayload;
  /** Coffee-only hidden state beats used by replay, not visible transcript prose. */
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  /** Privacy-safe record of a successful Auto recovery. */
  autoRecovery?: AutoRecoveryTraceV1;
}

/** Narrow storage shape for SQLite `messages.tool_payload` rows. */
export type StoredAssistantToolPayload = AskQuestionPayload | StoredAssistantToolEnvelope;

export interface ParsedAssistantTurn {
  /** Text shown in the transcript and fed back into the LLM prompt. */
  displayContent: string;
  /** Parsed AskQuestion when the envelope was valid and complete. */
  askQuestion?: AskQuestionPayload;
  /** Story-continuation action rail shown after long fictional prose. */
  tellFictionalStory?: TellFictionalStoryPayload;
  /** Optional display-only Zen layout hint. */
  zenDisplay?: ZenDisplayMetadata;
  /**
   * Model asked to synthesize/describe an image for `sendGeneratedImage` tool JSON.
   * Server runs generation and persists `SentGeneratedImagePayload` on `tool_payload`.
   */
  sendGeneratedImage?: { prompt: string };
  /** Model asked Prism to fetch fresh web context before answering. */
  webSearch?: WebSearchRequestPayload;
}

export interface ParsedStoredAssistantToolPayload {
  askQuestion?: AskQuestionPayload;
  tellFictionalStory?: TellFictionalStoryPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
  zenDisplay?: ZenDisplayMetadata;
  zenTurn?: StoredZenAssistantTurnPayload;
  sentGeneratedImage?: SentGeneratedImagePayload;
  webSearch?: WebSearchPayload;
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  coffeeUserAction?: CoffeeUserActionPayload;
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  autoRecovery?: AutoRecoveryTraceV1;
}

/// Many models wrap the envelope in a markdown fence; raw fences make JSON.parse fail
/// while delimiters still match—prose strips but AskQuestion drops (empty chip rail).
function stripMarkdownFences(blob: string): string {
  let s = blob.trim();
  if (!s.startsWith("```")) return s;

  const firstLineBreak = s.indexOf("\n");
  if (firstLineBreak === -1) {
    return s.replace(/^```[a-zA-Z0-9]*\s*/, "").replace(/```$/, "").trim();
  }
  s = s.slice(firstLineBreak + 1);
  const fenceClose = s.lastIndexOf("```");
  if (fenceClose !== -1) {
    s = s.slice(0, fenceClose);
  }
  return s.trim();
}

function normalizeAskQuestionEnvelope(parsed: unknown): AskQuestionPayload | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const row = parsed as Record<string, unknown>;
  const parsedVersion =
    typeof row.v === "number"
      ? row.v
      : typeof row.v === "string"
        ? Number(row.v.trim())
        : Number.NaN;
  if (!Number.isNaN(parsedVersion) && parsedVersion !== 1) return undefined;

  const rawName = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (rawName && rawName !== "askquestion") return undefined;

  const prompt = [
    row.prompt,
    row.question,
    row.title,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
  if (!prompt) return undefined;
  if (!Array.isArray(row.options)) return undefined;

  const labels = row.options
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const opt = item as Record<string, unknown>;
      if (typeof opt.label === "string") return opt.label.trim();
      if (typeof opt.text === "string") return opt.text.trim();
      if (typeof opt.title === "string") return opt.title.trim();
      if (typeof opt.value === "string") return opt.value.trim();
      return "";
    })
    .filter((label) => label.length > 0);

  // Keep UX deterministic: PRISM chips expect binary yes/no or up to four real choices.
  const optionCount = labels.length === 2 ? 2 : labels.length >= 3 ? Math.min(labels.length, 4) : 0;
  if (optionCount === 0) return undefined;

  return {
    v: 1,
    name: "AskQuestion",
    prompt,
    options: labels.slice(0, optionCount).map((label, index) => ({
      id: String.fromCharCode(97 + index),
      label,
    })),
  };
}

function normalizeStoryChipLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.replace(/\s+/g, " ").trim();
  if (!label) return undefined;
  return label.length > 64 ? `${label.slice(0, 61).trimEnd()}...` : label;
}

function normalizeTellFictionalStoryEnvelope(
  parsed: unknown
): TellFictionalStoryPayload | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const row = parsed as Record<string, unknown>;
  const parsedVersion =
    typeof row.v === "number"
      ? row.v
      : typeof row.v === "string"
        ? Number(row.v.trim())
        : Number.NaN;
  if (!Number.isNaN(parsedVersion) && parsedVersion !== 1) return undefined;

  const rawName = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (rawName && rawName !== "tellfictionalstory") return undefined;

  const continueLabel = normalizeStoryChipLabel(
    row.continueLabel ?? row.continueStoryLabel ?? row.continue
  );
  const bookmarkLabel = normalizeStoryChipLabel(
    row.bookmarkLabel ?? row.bookmarkStoryLabel ?? row.bookmark
  );
  const finishLabel = normalizeStoryChipLabel(
    row.finishLabel ?? row.finishStoryLabel ?? row.finish
  );

  if (!rawName && !continueLabel && !bookmarkLabel && !finishLabel) return undefined;

  return {
    v: 1,
    name: "tellFictionalStory",
    ...(continueLabel ? { continueLabel } : {}),
    ...(bookmarkLabel ? { bookmarkLabel } : {}),
    ...(finishLabel ? { finishLabel } : {}),
  };
}

/** Max chars for assistant image prompt request (protects pipelines from runaway blobs). */
const SEND_GENERATED_IMAGE_PROMPT_CAP = 2000;

function truncateSendGeneratedImagePrompt(prompt: string): string {
  return prompt.length > SEND_GENERATED_IMAGE_PROMPT_CAP
    ? prompt.slice(0, SEND_GENERATED_IMAGE_PROMPT_CAP)
    : prompt;
}

function normalizeSendGeneratedImageRequestFromRecord(
  row: Record<string, unknown>
): { prompt: string } | undefined {
  const sg = row.sendGeneratedImage;
  if (!sg || typeof sg !== "object") return undefined;
  const p = (sg as Record<string, unknown>).prompt;
  if (typeof p !== "string" || !p.trim()) return undefined;
  return { prompt: truncateSendGeneratedImagePrompt(p.trim()) };
}

function normalizeStoredSentGeneratedImagePayload(
  value: unknown
): SentGeneratedImagePayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const imageId = typeof row.imageId === "string" ? row.imageId.trim() : "";
  const displayUrl = typeof row.displayUrl === "string" ? row.displayUrl.trim() : "";
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!imageId || !displayUrl || !prompt) return undefined;
  const revised =
    typeof row.revisedPrompt === "string" && row.revisedPrompt.trim()
      ? row.revisedPrompt.trim()
      : undefined;
  const imageModel =
    typeof row.imageModel === "string" && row.imageModel.trim()
      ? row.imageModel.trim()
      : undefined;
  return {
    imageId,
    displayUrl,
    prompt,
    ...(revised ? { revisedPrompt: revised } : {}),
    ...(imageModel ? { imageModel } : {}),
  };
}

const WEB_SEARCH_QUERY_CAP = 500;
const WEB_SEARCH_TEXT_CAP = 500;
const WEB_SEARCH_RESULT_CAP = 5;

function truncateWebSearchText(text: string, maxLength = WEB_SEARCH_TEXT_CAP): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength).trimEnd() : collapsed;
}

function normalizeWebSearchUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeWebSearchRequestFromRecord(
  row: Record<string, unknown>
): WebSearchRequestPayload | undefined {
  const rawName = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  const raw =
    rawName === "websearch"
      ? row
      : row.webSearch && typeof row.webSearch === "object"
        ? (row.webSearch as Record<string, unknown>)
        : undefined;
  if (!raw) return undefined;
  const query = truncateWebSearchText(
    typeof raw.query === "string" ? String(raw.query) : "",
    WEB_SEARCH_QUERY_CAP
  );
  if (!query) return undefined;
  return { v: 1, name: "WebSearch", query };
}

function normalizeStoredWebSearchPayload(value: unknown): WebSearchPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const rawName = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (rawName && rawName !== "websearch") return undefined;
  const query = truncateWebSearchText(
    typeof row.query === "string" ? row.query : "",
    WEB_SEARCH_QUERY_CAP
  );
  const provider = row.provider === "brave" ? "brave" : undefined;
  const fetchedAt = typeof row.fetchedAt === "string" ? row.fetchedAt.trim() : "";
  const results = Array.isArray(row.results)
    ? row.results
        .map((item): WebSearchResult | null => {
          if (!item || typeof item !== "object") return null;
          const result = item as Record<string, unknown>;
          const title = truncateWebSearchText(
            typeof result.title === "string" ? result.title : "",
            140
          );
          const url = normalizeWebSearchUrl(result.url);
          if (!title || !url) return null;
          const displayUrl = truncateWebSearchText(
            typeof result.displayUrl === "string" ? result.displayUrl : "",
            160
          );
          const source = truncateWebSearchText(
            typeof result.source === "string" ? result.source : "",
            120
          );
          const snippet = truncateWebSearchText(
            typeof result.snippet === "string" ? result.snippet : "",
            360
          );
          const thumbnailUrl = normalizeWebSearchUrl(result.thumbnailUrl);
          const faviconUrl = normalizeWebSearchUrl(result.faviconUrl);
          const publishedAt = truncateWebSearchText(
            typeof result.publishedAt === "string" ? result.publishedAt : "",
            80
          );
          return {
            title,
            url,
            ...(displayUrl ? { displayUrl } : {}),
            ...(source ? { source } : {}),
            ...(snippet ? { snippet } : {}),
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            ...(faviconUrl ? { faviconUrl } : {}),
            ...(publishedAt ? { publishedAt } : {}),
          };
        })
        .filter((item): item is WebSearchResult => Boolean(item))
        .slice(0, WEB_SEARCH_RESULT_CAP)
    : [];
  if (!query || provider !== "brave" || !fetchedAt || results.length === 0) return undefined;
  return {
    v: 1,
    name: "WebSearch",
    query,
    provider,
    fetchedAt,
    results,
  };
}

function normalizeCoffeeAmbientActionPayload(
  value: unknown
): CoffeeAmbientActionPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.name !== "coffeeAmbientAction" || row.source !== "scripted") {
    return undefined;
  }
  const category =
    row.category === "sip" || row.category === "cup" || row.category === "power"
      ? row.category
      : undefined;
  const action = typeof row.action === "string" ? row.action.replace(/\s+/g, " ").trim() : "";
  if (!category || !action || action.length > 80) return undefined;
  return {
    v: 1,
    name: "coffeeAmbientAction",
    source: "scripted",
    category,
    action,
  };
}

function normalizeCoffeeUserActionPayload(value: unknown): CoffeeUserActionPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.name !== "coffeeUserAction" || row.source !== "user") {
    return undefined;
  }
  const action = typeof row.action === "string" ? row.action.replace(/\s+/g, " ").trim() : "";
  const occurredAtRaw = typeof row.occurredAt === "string" ? row.occurredAt.trim() : "";
  const occurredAtMs = Date.parse(occurredAtRaw);
  if (!action || action.length > 160 || !Number.isFinite(occurredAtMs)) return undefined;
  return {
    v: 1,
    name: "coffeeUserAction",
    source: "user",
    action,
    occurredAt: new Date(occurredAtMs).toISOString(),
  };
}

function clampCoffeeReplayUnitValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function normalizeCoffeeReplayIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return undefined;
  return trimmed;
}

function normalizeCoffeeReplayDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(30_000, Math.round(value)));
}

function normalizeCoffeeReplayBotId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : undefined;
}

function normalizeCoffeeReplaySocialSnapshot(
  value: unknown
): CoffeeReplaySocialSnapshotPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const disposition = clampCoffeeReplayUnitValue(row.disposition);
  const valuesFriction = clampCoffeeReplayUnitValue(row.valuesFriction);
  const restraint = clampCoffeeReplayUnitValue(row.restraint);
  const engagement = clampCoffeeReplayUnitValue(row.engagement);
  const leavePressure = clampCoffeeReplayUnitValue(row.leavePressure);
  if (
    disposition === undefined ||
    valuesFriction === undefined ||
    restraint === undefined ||
    engagement === undefined ||
    leavePressure === undefined
  ) {
    return undefined;
  }
  return {
    disposition,
    valuesFriction,
    restraint,
    engagement,
    leavePressure,
  };
}

function normalizeStoredListenerReactionPlan(
  value: unknown,
): ListenerReactionPlanV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const id = (candidate: unknown): string | undefined =>
    typeof candidate === "string" && candidate.trim() && candidate.trim().length <= 160
      ? candidate.trim()
      : undefined;
  const speakerBotId = id(row.speakerBotId);
  const listenerBotId = id(row.listenerBotId);
  const messageId = id(row.messageId);
  const seed = id(row.seed);
  const targetSource = row.targetSource === "role" ||
      row.targetSource === "direct" || row.targetSource === "inferred"
    ? row.targetSource
    : undefined;
  const visualAction = row.visualAction === "nod" ||
      row.visualAction === "lean_in" || row.visualAction === "head_tilt" ||
      row.visualAction === "soft_smile" || row.visualAction === "thoughtful_hmm"
    ? row.visualAction
    : undefined;
  const spokenCue = row.spokenCue === "mm-hm" || row.spokenCue === "I see" ||
      row.spokenCue === "hmm"
    ? row.spokenCue
    : undefined;
  if (
    row.v !== 1 || row.name !== "listenerReaction" || !speakerBotId ||
    !listenerBotId || speakerBotId === listenerBotId || !messageId || !seed ||
    !targetSource || !visualAction || typeof row.targetProgress !== "number" ||
    !Number.isFinite(row.targetProgress) || row.targetProgress < 0.3 ||
    row.targetProgress > 0.75 || typeof row.cameraCutEligible !== "boolean"
  ) return undefined;
  return {
    v: 1,
    name: "listenerReaction",
    speakerBotId,
    listenerBotId,
    messageId,
    targetSource,
    visualAction,
    ...(spokenCue ? { spokenCue } : {}),
    targetProgress: row.targetProgress,
    seed,
    cameraCutEligible: row.cameraCutEligible,
  };
}

export function normalizeCoffeeReplayEventPayload(
  value: unknown
): CoffeeReplayEventPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.name !== "coffeeReplayEvent") return undefined;
  const occurredAt = normalizeCoffeeReplayIso(row.occurredAt);
  if (!occurredAt) return undefined;
  if (row.kind === "playerDeparture") {
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "playerDeparture",
      occurredAt,
    };
  }
  const botId = normalizeCoffeeReplayBotId(row.botId);
  if (!botId) return undefined;
  if (row.kind === "listenerReaction") {
    const plan = normalizeStoredListenerReactionPlan(row.plan);
    if (!plan || plan.listenerBotId !== botId) return undefined;
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "listenerReaction",
      botId,
      occurredAt,
      plan,
    };
  }
  if (row.kind === "botDeparture") {
    const seatIndex =
      typeof row.seatIndex === "number" &&
      Number.isInteger(row.seatIndex) &&
      row.seatIndex >= 0 &&
      row.seatIndex <= 4
        ? row.seatIndex
        : undefined;
    if (seatIndex === undefined) return undefined;
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "botDeparture",
      botId,
      seatIndex,
      occurredAt,
    };
  }
  if (row.kind === "arrival") {
    const walkDurationMs = normalizeCoffeeReplayDurationMs(row.walkDurationMs);
    const nameplateDelayMs = normalizeCoffeeReplayDurationMs(row.nameplateDelayMs);
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "arrival",
      botId,
      occurredAt,
      ...(walkDurationMs !== undefined ? { walkDurationMs } : {}),
      ...(nameplateDelayMs !== undefined ? { nameplateDelayMs } : {}),
    };
  }
  if (row.kind === "mood") {
    const social = normalizeCoffeeReplaySocialSnapshot(row.social);
    if (!social) return undefined;
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "mood",
      botId,
      occurredAt,
      social,
    };
  }
  if (row.kind === "topOff") {
    const progressBefore = clampCoffeeReplayUnitValue(row.progressBefore);
    const progressAfter = clampCoffeeReplayUnitValue(row.progressAfter);
    const toppedOffAt = normalizeCoffeeReplayIso(row.toppedOffAt);
    if (
      progressBefore === undefined ||
      progressAfter === undefined ||
      !toppedOffAt
    ) {
      return undefined;
    }
    return {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "topOff",
      botId,
      occurredAt,
      progressBefore,
      progressAfter,
      toppedOffAt,
    };
  }
  return undefined;
}

function normalizeCoffeeReplayEventPayloads(value: unknown): CoffeeReplayEventPayload[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values
    .map(normalizeCoffeeReplayEventPayload)
    .filter((event): event is CoffeeReplayEventPayload => event !== undefined)
    .slice(0, 8);
}

function parseVersion(value: unknown): number {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
}

function roundedNormalizedCoordinate(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function normalizeZenDisplayCoordinate(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return roundedNormalizedCoordinate(value);
}

function normalizeZenDisplayAlign(value: unknown): ZenDisplayAlign | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "start" || normalized === "left") return "start";
  if (normalized === "center" || normalized === "middle") return "center";
  if (normalized === "end" || normalized === "right") return "end";
  return undefined;
}

function normalizeZenDisplayPlacement(value: unknown): ZenDisplayPlacement | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const x = normalizeZenDisplayCoordinate(row.x);
  const y = normalizeZenDisplayCoordinate(row.y);
  const align = normalizeZenDisplayAlign(row.align);
  if (x === undefined && y === undefined && align === undefined) return undefined;
  return {
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(align ? { align } : {}),
  };
}

function normalizeZenDisplayLinePlacement(value: unknown): ZenDisplayLinePlacement | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const indexRaw = row.index;
  if (typeof indexRaw !== "number" || !Number.isInteger(indexRaw) || indexRaw < 0) {
    return undefined;
  }
  const placement = normalizeZenDisplayPlacement(row);
  if (!placement) return undefined;
  return {
    index: Math.min(indexRaw, 80),
    ...placement,
  };
}

export function normalizeZenDisplayMetadata(value: unknown): ZenDisplayMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const version = parseVersion(row.v);
  if (!Number.isNaN(version) && version !== 1) return undefined;

  const placement = normalizeZenDisplayPlacement(row.placement);
  const rawLines = Array.isArray(row.lines)
    ? row.lines
    : Array.isArray(row.linePlacements)
      ? row.linePlacements
      : [];
  const seen = new Set<number>();
  const lines = rawLines
    .map(normalizeZenDisplayLinePlacement)
    .filter((line): line is ZenDisplayLinePlacement => {
      if (!line || seen.has(line.index)) return false;
      seen.add(line.index);
      return true;
    })
    .slice(0, 12);

  if (!placement && lines.length === 0) return undefined;
  return {
    v: 1,
    ...(placement ? { placement } : {}),
    ...(lines.length > 0 ? { lines } : {}),
  };
}

function normalizeBotIdMarker(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeStoredZenAssistantTurnPayload(
  value: unknown
): StoredZenAssistantTurnPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const kind =
    row.kind === "persona-transition" ||
    row.kind === "zen-autonomy" ||
    row.kind === "zen-live-action-interrupt"
      ? row.kind
      : undefined;
  if (!kind) return undefined;
  const fromBotId = normalizeBotIdMarker(row.fromBotId);
  const toBotId = normalizeBotIdMarker(row.toBotId);
  const activeBotId = normalizeBotIdMarker(row.activeBotId);
  const style =
    row.style === "previous-introduces" || row.style === "new-speaks"
      ? row.style
      : undefined;
  return {
    kind,
    ...(fromBotId !== undefined ? { fromBotId } : {}),
    ...(toBotId !== undefined ? { toBotId } : {}),
    ...(activeBotId !== undefined ? { activeBotId } : {}),
    ...(style ? { style } : {}),
  };
}

/**
 * Parses Prism tool-block JSON possibly containing AskQuestion, sendGeneratedImage request, or both.
 */
function normalizePrismToolBlockPayload(parsed: unknown): {
  askQuestion?: AskQuestionPayload;
  tellFictionalStory?: TellFictionalStoryPayload;
  sendGeneratedImage?: { prompt: string };
  webSearch?: WebSearchRequestPayload;
  zenDisplay?: ZenDisplayMetadata;
} {
  const askFlat = normalizeAskQuestionEnvelope(parsed);
  const storyFlat = normalizeTellFictionalStoryEnvelope(parsed);
  let pairSend: { prompt: string } | undefined;
  let webSearch: WebSearchRequestPayload | undefined;
  let zenDisplay: ZenDisplayMetadata | undefined;
  if (parsed && typeof parsed === "object") {
    const row = parsed as Record<string, unknown>;
    pairSend = normalizeSendGeneratedImageRequestFromRecord(row);
    webSearch = normalizeWebSearchRequestFromRecord(row);
    zenDisplay = normalizeZenDisplayMetadata(row.zenDisplay);
  }
  if (askFlat || storyFlat) {
    return {
      ...(askFlat ? { askQuestion: askFlat } : {}),
      ...(storyFlat ? { tellFictionalStory: storyFlat } : {}),
      ...(pairSend ? { sendGeneratedImage: pairSend } : {}),
      ...(webSearch ? { webSearch } : {}),
      ...(zenDisplay ? { zenDisplay } : {}),
    };
  }
  if (!parsed || typeof parsed !== "object") return {};
  const row = parsed as Record<string, unknown>;
  let askNested: AskQuestionPayload | undefined;
  if (row.askQuestion !== undefined) {
    askNested = normalizeAskQuestionEnvelope(row.askQuestion);
  }
  const storyNested = normalizeTellFictionalStoryEnvelope(row.tellFictionalStory);
  pairSend = normalizeSendGeneratedImageRequestFromRecord(row);
  const out: {
    askQuestion?: AskQuestionPayload;
    tellFictionalStory?: TellFictionalStoryPayload;
    sendGeneratedImage?: { prompt: string };
    webSearch?: WebSearchRequestPayload;
    zenDisplay?: ZenDisplayMetadata;
  } = {};
  if (askNested) out.askQuestion = askNested;
  if (storyNested) out.tellFictionalStory = storyNested;
  if (pairSend) out.sendGeneratedImage = pairSend;
  if (webSearch) out.webSearch = webSearch;
  if (zenDisplay) out.zenDisplay = zenDisplay;
  return out;
}

/** Locate the last Prism tool opener; prefers flexible pattern, then exact sentinel. */
function findLastFlexibleStart(raw: string): {
  matchStart: number;
  innerBegin: number;
} | null {
  let chosen: RegExpExecArray | null = null;
  PRISM_TOOL_START_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRISM_TOOL_START_PATTERN.exec(raw)) !== null) {
    chosen = m;
  }
  if (!chosen?.[0]) {
    const exactIdx = raw.lastIndexOf(PRISM_TOOL_START);
    if (exactIdx === -1) return null;
    const afterExact = exactIdx + PRISM_TOOL_START.length;
    let innerBegin = afterExact;
    if (raw.slice(afterExact).startsWith("\r\n")) innerBegin += 2;
    else if (raw.slice(afterExact).startsWith("\n")) innerBegin += 1;
    return { matchStart: exactIdx, innerBegin };
  }
  const idx = chosen.index!;
  let innerBegin = idx + chosen[0].length;
  const sliceAfter = raw.slice(innerBegin);
  if (sliceAfter.startsWith("\r\n")) innerBegin += 2;
  else if (sliceAfter.startsWith("\n")) innerBegin += 1;
  return { matchStart: idx, innerBegin };
}

/** First flexible closer at or after innerBegin — returns span end for prose splice. */
function findFlexibleClosingSpan(
  raw: string,
  innerBegin: number
): { innerEnd: number; closeEndExclusive: number } | null {
  PRISM_TOOL_END_PATTERN.lastIndex = 0;
  const tail = raw.slice(innerBegin);
  const m = PRISM_TOOL_END_PATTERN.exec(tail);
  if (!m || m.index === undefined) {
    const exactIdx = raw.indexOf(PRISM_TOOL_END, innerBegin);
    if (exactIdx === -1) return null;
    return {
      innerEnd: exactIdx,
      closeEndExclusive: exactIdx + PRISM_TOOL_END.length,
    };
  }
  const innerEnd = innerBegin + m.index;
  return {
    innerEnd,
    closeEndExclusive: innerEnd + m[0].length,
  };
}

/** Extract prose + inner JSON blob when both delimiters appear in order (last block wins). */
function extractLastToolBlock(raw: string): {
  prose: string;
  innerJson: string | null;
} {
  const startInfo = findLastFlexibleStart(raw);
  if (!startInfo) return { prose: raw, innerJson: null };

  const closing = findFlexibleClosingSpan(raw, startInfo.innerBegin);
  if (!closing) {
    // Incomplete tail during streaming: never leak raw tool framing/JSON to UI.
    // Keep everything before the opener; drop the dangling marker/blob.
    const proseBeforeTail = raw.slice(0, startInfo.matchStart).trimEnd();
    return { prose: proseBeforeTail, innerJson: null };
  }
  const innerJson = raw.slice(startInfo.innerBegin, closing.innerEnd).trim();
  const prose =
    `${raw.slice(0, startInfo.matchStart)}${raw.slice(closing.closeEndExclusive)}`.trimEnd();
  return { prose, innerJson };
}

/** Last `<PRISM_TOOL>…</PRISM_TOOL>` block (case-insensitive); inner must contain `{` to limit false positives. */
function findLastXmlPrismToolOpen(raw: string): { matchStart: number; innerBegin: number } | null {
  XML_PRISM_TOOL_OPEN_PATTERN.lastIndex = 0;
  let chosen: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = XML_PRISM_TOOL_OPEN_PATTERN.exec(raw)) !== null) {
    chosen = m;
  }
  if (!chosen?.[0] || chosen.index === undefined) return null;
  const idx = chosen.index;
  let innerBegin = idx + chosen[0].length;
  const sliceAfter = raw.slice(innerBegin);
  if (sliceAfter.startsWith("\r\n")) innerBegin += 2;
  else if (sliceAfter.startsWith("\n")) innerBegin += 1;
  return { matchStart: idx, innerBegin };
}

function findXmlPrismToolCloseSpan(
  raw: string,
  innerBegin: number
): { innerEnd: number; closeEndExclusive: number } | null {
  const tail = raw.slice(innerBegin);
  XML_PRISM_TOOL_CLOSE_PATTERN.lastIndex = 0;
  const m = XML_PRISM_TOOL_CLOSE_PATTERN.exec(tail);
  if (!m || m.index === undefined) return null;
  const innerEnd = innerBegin + m.index;
  return {
    innerEnd,
    closeEndExclusive: innerEnd + m[0].length,
  };
}

function extractLastXmlPrismToolBlock(raw: string): { prose: string; innerJson: string | null } {
  const startInfo = findLastXmlPrismToolOpen(raw);
  if (!startInfo) return { prose: raw, innerJson: null };

  const closing = findXmlPrismToolCloseSpan(raw, startInfo.innerBegin);
  if (!closing) {
    const proseBeforeTail = raw.slice(0, startInfo.matchStart).trimEnd();
    return { prose: proseBeforeTail, innerJson: null };
  }
  const innerJson = raw.slice(startInfo.innerBegin, closing.innerEnd).trim();
  const prose =
    `${raw.slice(0, startInfo.matchStart)}${raw.slice(closing.closeEndExclusive)}`.trimEnd();
  if (!innerJson.includes("{")) {
    return { prose, innerJson: null };
  }
  return { prose, innerJson };
}

/** Last fenced code block whose interior parses to a Prism-style tool envelope. */
function extractLastStandaloneFencedToolJson(raw: string): {
  innerJson: string;
  prose: string;
} | null {
  const re = /```(?:[a-zA-Z0-9_-]+)?[\t ]*(?:\r?\n)?([\s\S]*?)```/g;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    matches.push(m);
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    const idx = match.index ?? 0;
    const fenceLen = match[0].length;
    const innerFence = match[1]?.trim() ?? "";
    const jsonCandidate = stripMarkdownFences(innerFence);
    try {
      const parsed = JSON.parse(jsonCandidate) as unknown;
      const block = normalizePrismToolBlockPayload(parsed);
      if (!block.askQuestion && !block.sendGeneratedImage && !block.zenDisplay) {
        continue;
      }
      const prose = `${raw.slice(0, idx)}${raw.slice(idx + fenceLen)}`.trimEnd();
      return { innerJson: innerFence, prose };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * LM Studio / HF-style sentinel: `<|sendGeneratedImage|>` then JSON (full envelope or flat `{prompt}`).
 */
const ALT_SEND_GENERATED_IMAGE_TOKEN = /<\|\s*send\s*_?\s*generated\s*_?\s*image\s*\|>/gi;

/**
 * When `<|sendGeneratedImage|>` prefixes JSON, accept a flat `{"prompt":"..."}` (optional `v`)
 * and coerce to the standard Prism envelope. Rejects extra keys to limit false positives.
 */
function coerceFlatPromptJsonAfterAltSentinel(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (row.sendGeneratedImage !== undefined || row.askQuestion !== undefined) return null;
  if (row.name !== undefined || row.options !== undefined) return null;
  const promptRaw = row.prompt;
  if (typeof promptRaw !== "string" || !promptRaw.trim()) return null;
  for (const key of Object.keys(row)) {
    if (key === "prompt") continue;
    if (key === "v") {
      const v = row.v;
      const n =
        typeof v === "number"
          ? v
          : typeof v === "string" && /^\d+$/.test(v.trim())
            ? Number(v.trim())
            : Number.NaN;
      if (n !== 1) return null;
      continue;
    }
    return null;
  }
  return JSON.stringify({
    v: 1 as const,
    sendGeneratedImage: { prompt: truncateSendGeneratedImagePrompt(promptRaw.trim()) },
  });
}

/**
 * Last `<|sendGeneratedImage|>` … JSON span: full tool envelope or flat `{prompt}` only after this token.
 */
function extractLastAltSendGeneratedImageSpan(raw: string): { innerJson: string; prose: string } | null {
  ALT_SEND_GENERATED_IMAGE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = ALT_SEND_GENERATED_IMAGE_TOKEN.exec(raw)) !== null) {
    last = m;
  }
  if (!last?.[0] || last.index === undefined) return null;

  const tokenStart = last.index;
  const afterToken = raw.slice(tokenStart + last[0].length);
  const leadingWs = afterToken.match(/^\s*/)?.[0]?.length ?? 0;
  const jsonRegion = afterToken.slice(leadingWs);
  if (!jsonRegion.includes("{")) return null;

  const openAt: number[] = [];
  for (let i = 0; i < jsonRegion.length; i++) {
    if (jsonRegion[i] === "{") openAt.push(i);
  }
  for (let k = openAt.length - 1; k >= 0; k--) {
    const openIdx = openAt[k]!;
    const tail = jsonRegion.slice(openIdx);
    try {
      const parsed = JSON.parse(tail) as unknown;
      const block = normalizePrismToolBlockPayload(parsed);
      if (block.askQuestion || block.sendGeneratedImage || block.zenDisplay) {
        const spanEnd = tokenStart + last[0].length + leadingWs + openIdx + tail.length;
        const prose = `${raw.slice(0, tokenStart)}${raw.slice(spanEnd)}`.trimEnd();
        return { innerJson: tail, prose };
      }
      const coerced = coerceFlatPromptJsonAfterAltSentinel(parsed);
      if (coerced) {
        const spanEnd = tokenStart + last[0].length + leadingWs + openIdx + tail.length;
        const prose = `${raw.slice(0, tokenStart)}${raw.slice(spanEnd)}`.trimEnd();
        return { innerJson: coerced, prose };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Some models append raw JSON (no fences, no Prism markers) that matches our tool envelope.
 */
function extractTrailingBareToolJson(raw: string): { innerJson: string; prose: string } | null {
  const s = raw.trimEnd();
  if (!s.includes("{")) return null;

  const openAt: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") openAt.push(i);
  }
  for (let k = openAt.length - 1; k >= 0; k--) {
    const openIdx = openAt[k]!;
    const tail = s.slice(openIdx);
    try {
      const parsed = JSON.parse(tail) as unknown;
      const block = normalizePrismToolBlockPayload(parsed);
      if (!block.askQuestion && !block.sendGeneratedImage && !block.zenDisplay) continue;
      return {
        innerJson: tail,
        prose: s.slice(0, openIdx).trimEnd(),
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * After extracting a Prism tool block, models often wrapped it in Markdown fences (` ```json `,
 * trailing ` ``` `); that shell can remain and render as a bogus code block beside real prose.
 */
function sanitizeProseAfterPrismToolExtraction(prose: string): string {
  let s = prose.trimEnd();
  for (let i = 0; i < 8; i += 1) {
    const before = s;
    s = s.replace(/\n```[a-zA-Z0-9_-]*\s*\n\s*```\s*$/is, "");
    s = s.replace(/\n```\s*$/is, "");
    s = s.replace(/\n```[a-zA-Z0-9_-]*\s*$/is, "");
    if (s === before) break;
  }
  return s.trimEnd();
}

/// True when `content` still embeds Prism tool framing (markers may have sloppy spacing).
export function assistantContentHasPrismToolFraming(raw: string | undefined | null): boolean {
  if (typeof raw !== "string" || raw.length < 16) return false;
  PRISM_TOOL_START_PATTERN.lastIndex = 0;
  if (PRISM_TOOL_START_PATTERN.test(raw) || raw.includes(PRISM_TOOL_START)) return true;
  XML_PRISM_TOOL_OPEN_PATTERN.lastIndex = 0;
  if (XML_PRISM_TOOL_OPEN_PATTERN.test(raw)) return true;
  ALT_SEND_GENERATED_IMAGE_TOKEN.lastIndex = 0;
  return ALT_SEND_GENERATED_IMAGE_TOKEN.test(raw);
}

/// Strip `<<<PRISM_TOOL>>>` … markers and optionally parse AskQuestion payloads from model output.
export function parseAssistantPrismTools(rawAssistantText: string): ParsedAssistantTurn {
  const trimmed = typeof rawAssistantText === "string" ? rawAssistantText : "";
  const prismSlice = extractLastToolBlock(trimmed);
  let prose = prismSlice.prose;
  let innerJson = prismSlice.innerJson;
  if (!innerJson) {
    const xmlPick = extractLastXmlPrismToolBlock(prose);
    prose = xmlPick.prose;
    if (xmlPick.innerJson) {
      innerJson = xmlPick.innerJson;
    }
  }
  if (!innerJson) {
    const fencePick = extractLastStandaloneFencedToolJson(prose);
    if (fencePick) {
      innerJson = fencePick.innerJson;
      prose = fencePick.prose;
    }
  }
  if (!innerJson) {
    const altPick = extractLastAltSendGeneratedImageSpan(prose);
    if (altPick) {
      innerJson = altPick.innerJson;
      prose = altPick.prose;
    }
  }
  if (!innerJson) {
    const barePick = extractTrailingBareToolJson(prose);
    if (barePick) {
      innerJson = barePick.innerJson;
      prose = barePick.prose;
    }
  }
  if (!innerJson) {
    return { displayContent: prose };
  }
  const cleanedProse = sanitizeProseAfterPrismToolExtraction(prose);
  const jsonText = stripMarkdownFences(innerJson);
  try {
    const block = normalizePrismToolBlockPayload(JSON.parse(jsonText) as unknown);
    if (!block.askQuestion && !block.tellFictionalStory && !block.sendGeneratedImage && !block.webSearch && !block.zenDisplay) {
      return { displayContent: cleanedProse };
    }
    return {
      displayContent: cleanedProse,
      ...(block.askQuestion ? { askQuestion: block.askQuestion } : {}),
      ...(block.tellFictionalStory ? { tellFictionalStory: block.tellFictionalStory } : {}),
      ...(block.sendGeneratedImage ? { sendGeneratedImage: block.sendGeneratedImage } : {}),
      ...(block.webSearch ? { webSearch: block.webSearch } : {}),
      ...(block.zenDisplay ? { zenDisplay: block.zenDisplay } : {}),
    };
  } catch {
    return { displayContent: cleanedProse };
  }
}

/** Deserialize stored `messages.tool_payload` JSON into typed AskQuestion metadata. */
export function parseStoredToolPayload(
  raw: string | null | undefined
): AskQuestionPayload | undefined {
  return parseStoredAssistantToolPayload(raw).askQuestion;
}

/** Deserialize stored `messages.tool_payload` into AskQuestion + mood metadata. */
export function parseStoredAssistantToolPayload(
  raw: string | null | undefined
): ParsedStoredAssistantToolPayload {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalizedAsk = normalizeAskQuestionEnvelope(parsed);
    if (normalizedAsk) {
      const root =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      const sent =
        root?.sentGeneratedImage !== undefined
          ? normalizeStoredSentGeneratedImagePayload(root.sentGeneratedImage)
          : undefined;
      const zenDisplay = root ? normalizeZenDisplayMetadata(root.zenDisplay) : undefined;
      const zenTurn = root
        ? normalizeStoredZenAssistantTurnPayload(root.zenTurn)
        : undefined;
      const story = root
        ? normalizeTellFictionalStoryEnvelope(root.tellFictionalStory)
        : undefined;
      const webSearch = root
        ? normalizeStoredWebSearchPayload(root.webSearch)
        : undefined;
      const coffeeAmbientAction = root
        ? normalizeCoffeeAmbientActionPayload(root.coffeeAmbientAction)
        : undefined;
      const coffeeUserAction = root
        ? normalizeCoffeeUserActionPayload(root.coffeeUserAction)
        : undefined;
      const coffeeReplayEvents = root
        ? normalizeCoffeeReplayEventPayloads(root.coffeeReplayEvents)
        : [];
      const autoRecovery = root
        ? normalizeStoredAutoRecoveryTrace(root.autoRecovery)
        : undefined;
      return {
        askQuestion: normalizedAsk,
        ...(sent ? { sentGeneratedImage: sent } : {}),
        ...(story ? { tellFictionalStory: story } : {}),
        ...(webSearch ? { webSearch } : {}),
        ...(zenDisplay ? { zenDisplay } : {}),
        ...(zenTurn ? { zenTurn } : {}),
        ...(coffeeAmbientAction ? { coffeeAmbientAction } : {}),
        ...(coffeeUserAction ? { coffeeUserAction } : {}),
        ...(coffeeReplayEvents.length > 0 ? { coffeeReplayEvents } : {}),
        ...(autoRecovery ? { autoRecovery } : {}),
      };
    }
    if (!parsed || typeof parsed !== "object") return {};
    const row = parsed as Record<string, unknown>;
    const askQuestion = normalizeAskQuestionEnvelope(row.askQuestion);
    const sentOnly = normalizeStoredSentGeneratedImagePayload(row.sentGeneratedImage);
    const webSearch = normalizeStoredWebSearchPayload(row.webSearch);
    const story = normalizeTellFictionalStoryEnvelope(row.tellFictionalStory);
    const zenDisplay = normalizeZenDisplayMetadata(row.zenDisplay);
    const zenTurn = normalizeStoredZenAssistantTurnPayload(row.zenTurn);
    const coffeeAmbientAction = normalizeCoffeeAmbientActionPayload(row.coffeeAmbientAction);
    const coffeeUserAction = normalizeCoffeeUserActionPayload(row.coffeeUserAction);
    const coffeeReplayEvents = normalizeCoffeeReplayEventPayloads(row.coffeeReplayEvents);
    const autoRecovery = normalizeStoredAutoRecoveryTrace(row.autoRecovery);
    const moodRow = row.mood;
    let moodKey: StoredMoodKey | undefined;
    let moodConfidence: number | undefined;
    if (moodRow && typeof moodRow === "object") {
      const moodRecord = moodRow as Record<string, unknown>;
      const key = typeof moodRecord.key === "string" ? moodRecord.key.trim() : "";
      if (
        key === "joyful" ||
        key === "warm" ||
        key === "neutral" ||
        key === "guarded" ||
        key === "strained"
      ) {
        moodKey = key;
      }
      const confidenceRaw = moodRecord.confidence;
      if (typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)) {
        moodConfidence = Math.max(0, Math.min(1, confidenceRaw));
      }
    }
    return {
      ...(askQuestion ? { askQuestion } : {}),
      ...(story ? { tellFictionalStory: story } : {}),
      ...(moodKey ? { moodKey } : {}),
      ...(moodConfidence !== undefined ? { moodConfidence } : {}),
      ...(zenDisplay ? { zenDisplay } : {}),
      ...(zenTurn ? { zenTurn } : {}),
      ...(sentOnly ? { sentGeneratedImage: sentOnly } : {}),
      ...(webSearch ? { webSearch } : {}),
      ...(coffeeAmbientAction ? { coffeeAmbientAction } : {}),
      ...(coffeeUserAction ? { coffeeUserAction } : {}),
      ...(coffeeReplayEvents.length > 0 ? { coffeeReplayEvents } : {}),
      ...(autoRecovery ? { autoRecovery } : {}),
    };
  } catch {
    return {};
  }
}

export function hydrateAssistantMessageParts(args: {
  content: string;
  toolPayload: string | null | undefined;
}): {
  content: string;
  askQuestion?: AskQuestionPayload;
  tellFictionalStory?: TellFictionalStoryPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
  zenDisplay?: ZenDisplayMetadata;
  sentGeneratedImage?: SentGeneratedImagePayload;
  webSearch?: WebSearchPayload;
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  coffeeUserAction?: CoffeeUserActionPayload;
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  autoRecovery?: AutoRecoveryTraceV1;
} {
  const stored = parseStoredAssistantToolPayload(args.toolPayload);
  const reparsed = parseAssistantPrismTools(args.content);
  const askQuestion = stored.askQuestion ?? reparsed.askQuestion;
  const tellFictionalStory =
    stored.tellFictionalStory ?? reparsed.tellFictionalStory;
  return {
    content: reparsed.displayContent,
    ...(askQuestion ? { askQuestion } : {}),
    ...(tellFictionalStory ? { tellFictionalStory } : {}),
    ...(stored.moodKey ? { moodKey: stored.moodKey } : {}),
    ...(stored.moodConfidence !== undefined
      ? { moodConfidence: stored.moodConfidence }
      : {}),
    ...(stored.zenDisplay ? { zenDisplay: stored.zenDisplay } : {}),
    ...(stored.sentGeneratedImage ? { sentGeneratedImage: stored.sentGeneratedImage } : {}),
    ...(stored.webSearch ? { webSearch: stored.webSearch } : {}),
    ...(stored.coffeeAmbientAction
      ? { coffeeAmbientAction: stored.coffeeAmbientAction }
      : {}),
    ...(stored.coffeeUserAction ? { coffeeUserAction: stored.coffeeUserAction } : {}),
    ...(stored.coffeeReplayEvents && stored.coffeeReplayEvents.length > 0
      ? { coffeeReplayEvents: stored.coffeeReplayEvents }
      : {}),
    ...(stored.autoRecovery ? { autoRecovery: stored.autoRecovery } : {}),
  };
}


/// Serialize validated AskQuestion for SQLite `messages.tool_payload`.
export function serializeAskQuestionTool(payload: AskQuestionPayload): string {
  return JSON.stringify(payload);
}

export function serializeAssistantToolPayload(args: {
  askQuestion?: AskQuestionPayload;
  tellFictionalStory?: TellFictionalStoryPayload;
  moodKey?: StoredMoodKey;
  moodConfidence?: number;
  zenDisplay?: ZenDisplayMetadata;
  zenTurn?: StoredZenAssistantTurnPayload;
  sentGeneratedImage?: SentGeneratedImagePayload;
  webSearch?: WebSearchPayload;
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  coffeeUserAction?: CoffeeUserActionPayload;
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  autoRecovery?: AutoRecoveryTraceV1;
}): string | null {
  const hasAsk = args.askQuestion !== undefined;
  const hasStory = args.tellFictionalStory !== undefined;
  const hasMood = args.moodKey !== undefined;
  const hasImage = args.sentGeneratedImage !== undefined;
  const webSearch = normalizeStoredWebSearchPayload(args.webSearch);
  const hasWebSearch = webSearch !== undefined;
  const zenDisplay = normalizeZenDisplayMetadata(args.zenDisplay);
  const hasZenDisplay = zenDisplay !== undefined;
  const zenTurn = normalizeStoredZenAssistantTurnPayload(args.zenTurn);
  const hasZenTurn = zenTurn !== undefined;
  const coffeeAmbientAction = normalizeCoffeeAmbientActionPayload(args.coffeeAmbientAction);
  const hasCoffeeAmbientAction = coffeeAmbientAction !== undefined;
  const coffeeUserAction = normalizeCoffeeUserActionPayload(args.coffeeUserAction);
  const hasCoffeeUserAction = coffeeUserAction !== undefined;
  const coffeeReplayEvents = normalizeCoffeeReplayEventPayloads(args.coffeeReplayEvents);
  const hasCoffeeReplayEvents = coffeeReplayEvents.length > 0;
  const autoRecovery = normalizeStoredAutoRecoveryTrace(args.autoRecovery);
  const hasAutoRecovery = autoRecovery !== undefined;
  if (
    !hasAsk &&
    !hasStory &&
    !hasMood &&
    !hasImage &&
    !hasWebSearch &&
    !hasZenDisplay &&
    !hasZenTurn &&
    !hasCoffeeAmbientAction &&
    !hasCoffeeUserAction &&
    !hasCoffeeReplayEvents &&
    !hasAutoRecovery
  ) {
    return null;
  }

  if (
    !hasAsk &&
    !hasStory &&
    !hasMood &&
    !hasWebSearch &&
    !hasZenDisplay &&
    !hasZenTurn &&
    !hasCoffeeAmbientAction &&
    !hasCoffeeUserAction &&
    !hasCoffeeReplayEvents &&
    !hasAutoRecovery &&
    hasImage
  ) {
    return JSON.stringify({ v: 1 as const, sentGeneratedImage: args.sentGeneratedImage! });
  }
  if (
    hasAsk &&
    !hasStory &&
    !hasMood &&
    !hasImage &&
    !hasWebSearch &&
    !hasZenDisplay &&
    !hasZenTurn &&
    !hasCoffeeAmbientAction &&
    !hasCoffeeUserAction &&
    !hasCoffeeReplayEvents &&
    !hasAutoRecovery
  ) {
    return serializeAskQuestionTool(args.askQuestion!);
  }

  const payload: StoredAssistantToolEnvelope = {
    v: 1,
    ...(hasAsk ? { askQuestion: args.askQuestion! } : {}),
    ...(hasStory ? { tellFictionalStory: args.tellFictionalStory! } : {}),
    ...(hasMood
      ? {
          mood: {
            key: args.moodKey!,
            ...(typeof args.moodConfidence === "number" &&
            Number.isFinite(args.moodConfidence)
              ? { confidence: Math.max(0, Math.min(1, args.moodConfidence)) }
              : {}),
          },
        }
      : {}),
    ...(hasZenDisplay ? { zenDisplay } : {}),
    ...(hasZenTurn ? { zenTurn } : {}),
    ...(hasImage ? { sentGeneratedImage: args.sentGeneratedImage! } : {}),
    ...(hasWebSearch ? { webSearch } : {}),
    ...(hasCoffeeAmbientAction ? { coffeeAmbientAction } : {}),
    ...(hasCoffeeUserAction ? { coffeeUserAction } : {}),
    ...(hasCoffeeReplayEvents ? { coffeeReplayEvents } : {}),
    ...(hasAutoRecovery ? { autoRecovery } : {}),
  };
  return JSON.stringify(payload);
}
