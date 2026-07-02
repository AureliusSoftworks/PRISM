import type {
  ZenLiveActionContextInput,
  ZenLiveActionInterruptInput,
  ZenLiveActionMoodHint,
  ZenLiveActionReactionRequest,
  ZenLiveActionReactionResponse,
  ZenLiveActionSource,
} from "@localai/shared";
import type { LlmProvider, ProviderMessage } from "./providers.ts";

const MAX_ACTION_CHARS = 180;
const MAX_CONTEXT_ACTION_CHARS = 120;
const SHOW_ACTION_MIN_CONFIDENCE = 0.46;
const INTERRUPT_MIN_CONFIDENCE = 0.88;

const OUT_OF_PERSONA_ACTION_RE = /\b(?:twerk(?:s|ing)?|striptease|porn|sexual|horny|meme\s+lord|yeet|skibidi|rizz|fortnite|dab(?:s|bing)?|floss(?:es|ing)?|cartwheel(?:s|ing)?\s+uncontrollably)\b/iu;
const TRAILING_SPEECH_BRIDGE_RE =
  /(?:[,:;]?\s*(?:and\s+)?(?:says?|saying|asks?|asking|replies?|replying|responds?|responding|tells?|telling|whispers?|whispering|murmurs?|murmuring|adds?|adding|speaks?|speaking|sings?|singing|croons?|crooning)\b\s*(?:softly|warmly|quietly|gently|candidly|brightly|kindly|slowly|under\s+.*)?[.!?\u2026;:,]*)+$/iu;

export function normalizeZenLiveActionText(
  value: unknown,
  maxChars = MAX_ACTION_CHARS
): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalized = value.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^\*+|\*+$/gu, "").trim();
  normalized = normalized.replace(/^[("'\u201c\u2018]+|[)"'\u201d\u2019]+$/gu, "").trim();
  normalized = normalized.replace(
    /\s*(?:"[^"]*(?:"|$)|\u201c[^\u201d]*(?:\u201d|$)|\u2018[^\u2019]*(?:\u2019|$))/gu,
    " "
  ).trim();
  normalized = normalized.replace(TRAILING_SPEECH_BRIDGE_RE, "").trim();
  normalized = normalized.replace(/[.!?\u2026;:,]+$/u, "").trim();
  if (!normalized) return undefined;
  if (Array.from(normalized).length > maxChars) {
    normalized = `${Array.from(normalized)
      .slice(0, Math.max(1, maxChars - 3))
      .join("")
      .trimEnd()}...`;
  }
  return normalized;
}

export function normalizeZenLiveActionMoodHint(
  value: unknown
): ZenLiveActionMoodHint {
  if (typeof value !== "string") return "neutral";
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/gu, "_");
  switch (normalized) {
    case "attentive":
    case "focused":
    case "watching":
      return "attentive";
    case "amused":
    case "playful":
    case "happy":
      return "amused";
    case "confused":
    case "curious":
    case "puzzled":
      return "confused";
    case "stern":
    case "commanding":
    case "annoyed":
    case "angry":
      return "stern";
    case "waiting":
    case "idle":
    case "patient":
      return "waiting";
    case "warm":
    case "kind":
    case "gentle":
      return "warm";
    default:
      return "neutral";
  }
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function actionKey(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function readObjectFromJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

export function normalizeZenLiveActionSource(value: unknown): ZenLiveActionSource | undefined {
  return value === "draft_action" || value === "idle" ? value : undefined;
}

export function normalizeZenLiveActionReactionRequest(
  value: unknown
): ZenLiveActionReactionRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const source = normalizeZenLiveActionSource(record.source);
  if (!source) return undefined;
  const activeBotId = normalizeZenLiveActionText(record.activeBotId, 120) ?? null;
  const personaName = normalizeZenLiveActionText(record.personaName, 80);
  const userAction = normalizeZenLiveActionText(record.userAction, MAX_CONTEXT_ACTION_CHARS);
  const previousBotAction = normalizeZenLiveActionText(record.previousBotAction, MAX_CONTEXT_ACTION_CHARS);
  const conversationId = normalizeZenLiveActionText(record.conversationId, 120);
  const idleMs =
    typeof record.idleMs === "number" && Number.isFinite(record.idleMs)
      ? Math.max(0, Math.round(record.idleMs))
      : undefined;
  const clientSequenceId =
    normalizeZenLiveActionText(record.clientSequenceId, 80) ??
    normalizeZenLiveActionText(record.clientSequence, 80);
  if (!clientSequenceId) return undefined;
  if (source === "draft_action" && !userAction) return undefined;
  return {
    source,
    activeBotId,
    ...(personaName ? { personaName } : {}),
    ...(userAction ? { userAction } : {}),
    ...(previousBotAction ? { previousBotAction } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(idleMs !== undefined ? { idleMs } : {}),
    clientSequenceId,
  };
}

export function normalizeZenLiveActionContextInput(
  value: unknown
): ZenLiveActionContextInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.source !== "live_action") return undefined;
  const activeBotId = normalizeZenLiveActionText(record.activeBotId, 120) ?? null;
  const userAction = normalizeZenLiveActionText(record.userAction, MAX_CONTEXT_ACTION_CHARS);
  const botAction = normalizeZenLiveActionText(record.botAction, MAX_CONTEXT_ACTION_CHARS);
  const clientSequenceId = normalizeZenLiveActionText(record.clientSequenceId, 80);
  if (!userAction && !botAction) return undefined;
  return {
    source: "live_action",
    activeBotId,
    ...(userAction ? { userAction } : {}),
    ...(botAction ? { botAction } : {}),
    moodHint: normalizeZenLiveActionMoodHint(record.moodHint),
    ...(clientSequenceId ? { clientSequenceId } : {}),
  };
}

export function normalizeZenLiveActionInterruptInput(
  value: unknown
): ZenLiveActionInterruptInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.source !== "live_action_interrupt") return undefined;
  const activeBotId = normalizeZenLiveActionText(record.activeBotId, 120) ?? null;
  const userAction = normalizeZenLiveActionText(record.userAction, MAX_CONTEXT_ACTION_CHARS);
  const botAction = normalizeZenLiveActionText(record.botAction, MAX_CONTEXT_ACTION_CHARS);
  const reason = normalizeZenLiveActionText(record.reason, 180);
  const clientTurnId =
    normalizeZenLiveActionText(record.clientTurnId, 80) ??
    `live-action-${Date.now().toString(36)}`;
  if (!userAction || !botAction) return undefined;
  return {
    source: "live_action_interrupt",
    activeBotId,
    userAction,
    botAction,
    moodHint: normalizeZenLiveActionMoodHint(record.moodHint),
    ...(reason ? { reason } : {}),
    clientTurnId,
  };
}

export function parseZenLiveActionReactionResponse(
  raw: string,
  request: ZenLiveActionReactionRequest
): ZenLiveActionReactionResponse {
  const record = readObjectFromJson(raw);
  if (!record) {
    return silentReaction(request);
  }
  const requestedKind = record.kind === "interrupt_candidate"
    ? "interrupt_candidate"
    : record.kind === "show_action"
      ? "show_action"
      : "silent";
  const botAction = normalizeZenLiveActionText(record.botAction ?? record.action);
  const confidence = clampConfidence(record.confidence);
  const moodHint = normalizeZenLiveActionMoodHint(record.moodHint ?? record.mood);
  const interruptReason = normalizeZenLiveActionText(record.interruptReason ?? record.reason, 180);
  if (requestedKind === "silent") {
    return silentReaction(request, moodHint, confidence);
  }
  if (!botAction) {
    return silentReaction(request, moodHint, confidence);
  }
  if (actionKey(botAction) === actionKey(request.previousBotAction)) {
    return silentReaction(request, moodHint, confidence);
  }
  if (OUT_OF_PERSONA_ACTION_RE.test(botAction)) {
    return silentReaction(request, moodHint, confidence);
  }
  if (requestedKind === "interrupt_candidate") {
    if (request.source === "idle" || confidence < INTERRUPT_MIN_CONFIDENCE) {
      return confidence >= SHOW_ACTION_MIN_CONFIDENCE
        ? showActionReaction(request, botAction, moodHint, confidence)
        : silentReaction(request, moodHint, confidence);
    }
    return {
      kind: "interrupt_candidate",
      botAction,
      moodHint,
      confidence,
      botId: request.activeBotId,
      clientSequenceId: request.clientSequenceId,
      ...(interruptReason ? { interruptReason } : {}),
    };
  }
  if (confidence < SHOW_ACTION_MIN_CONFIDENCE) {
    return silentReaction(request, moodHint, confidence);
  }
  return showActionReaction(request, botAction, moodHint, confidence);
}

export async function generateZenLiveActionReaction(args: {
  provider: LlmProvider;
  request: ZenLiveActionReactionRequest;
  personaName: string;
  personaSystemPrompt?: string;
  signal?: AbortSignal;
}): Promise<ZenLiveActionReactionResponse> {
  const messages = buildZenLiveActionReactionMessages(args);
  const raw = await args.provider.generateResponse(messages, {
    temperature: 0.45,
    maxTokens: 180,
    jsonMode: true,
    signal: args.signal,
    usagePurpose: "zen_live_action",
  });
  return parseZenLiveActionReactionResponse(raw, args.request);
}

function buildZenLiveActionReactionMessages(args: {
  request: ZenLiveActionReactionRequest;
  personaName: string;
  personaSystemPrompt?: string;
}): ProviderMessage[] {
  const { request, personaName, personaSystemPrompt } = args;
  return [
    {
      role: "system",
      content: [
        "You write one compact visible body-language status for a fictional chat persona in Zen Mode.",
        "Return JSON only: {\"kind\":\"silent|show_action|interrupt_candidate\",\"botAction\":\"...\",\"moodHint\":\"neutral|attentive|amused|confused|stern|waiting|warm\",\"confidence\":0.0,\"interruptReason\":\"...\"}.",
        "The status appears as a small peripheral action plate, not a chat message.",
        "Never invent random memes, sexual behavior, slapstick that breaks the persona, or actions that contradict the persona.",
        "Use interrupt_candidate only for rare, high-confidence, persona-significant moments where the assistant should speak before the user sends. Otherwise use show_action or silent.",
        "For idle beats, never interrupt. Use only subtle believable waiting actions.",
        "Use one readable stage direction, usually 8-24 words, without surrounding asterisks.",
        "Do not include dialogue, quote marks, or speech bridge words such as saying, asking, replying, or telling.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Persona: ${personaName || "Prism"}.`,
        personaSystemPrompt
          ? `Persona instructions:\n${personaSystemPrompt.slice(0, 1200)}`
          : "Persona instructions: default Prism companion.",
        `Source: ${request.source}.`,
        request.conversationId ? `Conversation id: ${request.conversationId}.` : "Conversation id: none.",
        request.userAction ? `Latest visible user action: *${request.userAction}*.` : "Latest visible user action: none.",
        request.previousBotAction ? `Previous visible bot action: *${request.previousBotAction}*.` : "Previous visible bot action: none.",
        request.idleMs !== undefined ? `Idle ms: ${request.idleMs}.` : "Idle ms: 0.",
      ].join("\n\n"),
    },
  ];
}

function silentReaction(
  request: ZenLiveActionReactionRequest,
  moodHint: ZenLiveActionMoodHint = "neutral",
  confidence = 0
): ZenLiveActionReactionResponse {
  return {
    kind: "silent",
    moodHint,
    confidence: Math.max(0, Math.min(1, confidence)),
    botId: request.activeBotId,
    clientSequenceId: request.clientSequenceId,
  };
}

function showActionReaction(
  request: ZenLiveActionReactionRequest,
  botAction: string,
  moodHint: ZenLiveActionMoodHint,
  confidence: number
): ZenLiveActionReactionResponse {
  return {
    kind: "show_action",
    botAction,
    moodHint,
    confidence,
    botId: request.activeBotId,
    clientSequenceId: request.clientSequenceId,
  };
}
