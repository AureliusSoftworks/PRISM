import { extractStageDirections, looksLikeSpokenProseMiswrappedAsAction, tokenizeBotMentionSource } from "./botMention.ts";
import { normalizeCoffeeMessageDelivery } from "./coffee-voice-text.ts";
import {
  coffeeCupSipMessageGapForDuration,
  coffeeInterruptionTranscriptSegments,
  listenerReactionSpokenTextV1,
  normalizeListenerReactionPlanV1,
  resolveBotIdentityMirrorVoiceV1,
  resolveBotIdentityShapeshiftVoiceV1,
  socialSilenceMessageIsMarkedV1,
  type CoffeeInterruptionEvent,
  type CoffeeInterruptionTranscriptSegmentKind,
  type CoffeeAmbientActionPayload,
  type CoffeeAsidePayload,
  type CoffeeStageActionPayload,
  type CoffeeUserActionPayload,
  type CoffeeCupTopOffSnapshot,
  type CoffeeReplayBaristaDeliveryEventPayload,
  type CoffeeReplayBotDepartureEventPayload,
  type CoffeeReplayEventPayload,
  type CoffeeReplayPlayerDepartureEventPayload,
  type CoffeeReplayPlayerSipEventPayload,
  type CoffeeReplaySocialSnapshotPayload,
  type CoffeeReplayTopOffEventPayload,
  type CoffeeSessionSettings,
  type BotIdentityMirrorStateV1,
  type BotIdentityShapeshiftStateV1,
  type BotFalseNameStateV1,
  type ListenerReactionPlanV1,
  type SocialSilenceMarkerV1,
  type BotPowerMutePerformanceV1,
  type AutoRecoveryTraceV1,
  type AutoRouteDecisionV1,
  type ProviderReasoningEffort,
} from "@localai/shared";
import {
  formatSessionReviewDuration,
  SESSION_REVIEW_FORMAT_VERSION,
  sessionReviewDirectionLines,
  sessionReviewRecordingSummaryLines,
  sessionReviewTranscriptCoverageLines,
  sessionReviewStableJson,
  type SessionReviewRecordingEvidence,
} from "./sessionReviewEvidence.ts";
import { LIVE_SESSION_EFFORT_LABELS } from "./liveSessionChromeLabels.ts";
import { assistantGenerationMetadata } from "./psychicMessagePresentation.ts";

const COFFEE_SESSION_SYNOPSIS_PREFIX = "Session synopsis:";

export function coffeeTextMentionsInternalAccountMetadata(text: string): boolean {
  return /\b(?:your\s+)?account\s+(?:display\s+name\s+is|has\s+not\s+provided\s+a\s+display\s+name\s+yet)\b/i.test(
    text
  );
}

export function coffeeSystemSynopsisIsDisplayable(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX) &&
    !coffeeTextMentionsInternalAccountMetadata(trimmed)
  );
}

export interface CoffeeReplayMessageLike {
  id?: string;
  role: string;
  content: string;
  botName?: string;
  botId?: string | null;
  botColor?: string;
  botGlyph?: string;
  speechIntentRevealAvailable?: true;
  createdAt?: string;
  provider?: string | null;
  model?: string | null;
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  coffeeStageAction?: CoffeeStageActionPayload;
  coffeeUserAction?: CoffeeUserActionPayload;
  coffeeInterruption?: CoffeeInterruptionEvent;
  coffeeAside?: CoffeeAsidePayload;
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  botPowerMutePerformance?: BotPowerMutePerformanceV1;
  socialSilence?: SocialSilenceMarkerV1;
  moodKey?: string;
  autoRecovery?: AutoRecoveryTraceV1;
  autoRoute?: AutoRouteDecisionV1;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  botPowerExactResponse?:
    | "speech_copy"
    | "hearing_repeat"
    | "intermittent_mute"
    | "speech_obfuscation";
  coffeeTurnRoute?: unknown;
  coffeeObserverProjection?: unknown;
  crosstalkReclaim?: unknown;
  transcriptInterruptionSegment?: {
    sourceMessageId: string;
    kind: CoffeeInterruptionTranscriptSegmentKind;
  };
}

export interface CoffeeTranscriptBotIdentity {
  id: string;
  name?: string;
  color?: string;
  glyph?: string;
}

/**
 * Expand hidden interruption carriers into ordinary transcript-only speaker
 * rows. Synthetic rows intentionally inherit no replay or interruption state.
 */
export function coffeeTranscriptMessagesWithInterruptions(args: {
  messages: readonly CoffeeReplayMessageLike[];
  bots?: readonly CoffeeTranscriptBotIdentity[];
}): CoffeeReplayMessageLike[] {
  const botById = new Map(
    (args.bots ?? [])
      .filter((bot) => bot.id.trim().length > 0)
      .map((bot) => [bot.id, bot] as const),
  );
  for (const message of args.messages) {
    const botId = message.botId?.trim();
    if (!botId || botById.has(botId)) continue;
    botById.set(botId, {
      id: botId,
      ...(message.botName ? { name: message.botName } : {}),
      ...(message.botColor ? { color: message.botColor } : {}),
      ...(message.botGlyph ? { glyph: message.botGlyph } : {}),
    });
  }

  const existingIds = new Set(
    args.messages
      .map((message) => message.id?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  return args.messages.flatMap((message, index) => {
    const sourceMessageId = message.id?.trim() || `coffee-message-${index}`;
    const segments = coffeeInterruptionTranscriptSegments({
      sourceMessageId,
      sourceContent: message.content,
      interruption: message.coffeeInterruption,
    });
    const projected = segments.flatMap((segment) => {
      if (existingIds.has(segment.id)) return [];
      existingIds.add(segment.id);
      const bot = botById.get(segment.speakerBotId);
      return [{
        id: segment.id,
        role: "assistant",
        content: segment.text,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
        botId: segment.speakerBotId,
        ...(bot?.name ? { botName: bot.name } : {}),
        ...(bot?.color ? { botColor: bot.color } : {}),
        ...(bot?.glyph ? { botGlyph: bot.glyph } : {}),
        transcriptInterruptionSegment: {
          sourceMessageId: segment.sourceMessageId,
          kind: segment.kind,
        },
      } satisfies CoffeeReplayMessageLike];
    });
    return [message, ...projected];
  });
}

export function coffeeListenerReactionForMessage(
  message: Pick<CoffeeReplayMessageLike, "coffeeReplayEvents">,
): ListenerReactionPlanV1 | null {
  for (const event of message.coffeeReplayEvents ?? []) {
    if (event.kind !== "listenerReaction") continue;
    const plan = normalizeListenerReactionPlanV1(event.plan);
    if (plan) return plan;
  }
  return null;
}

export interface CoffeeReplayPlayhead {
  nowMs: number;
  sessionStartedAtMs: number;
  sessionEndsAtMs: number;
  progress: number;
}

function clampReplayUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function coffeeReplayPlayhead(args: {
  conversationStartedAt?: string | null;
  durationMinutes?: number | null;
  messages: readonly Pick<CoffeeReplayMessageLike, "createdAt">[];
  messageIndex: number;
  revealFraction: number;
}): CoffeeReplayPlayhead {
  const durationMinutes =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes
      : 1;
  const durationMs = durationMinutes * 60_000;
  const parsedConversationStart = Date.parse(args.conversationStartedAt ?? "");
  const parsedMessageTimes = args.messages
    .map((message) => Date.parse(message.createdAt ?? ""))
    .filter((value) => Number.isFinite(value));
  const firstValidMessageAt = parsedMessageTimes[0];
  const sessionStartedAtMs = Number.isFinite(parsedConversationStart)
    ? parsedConversationStart
    : (firstValidMessageAt ?? 0);
  const nominalSessionEndsAtMs = sessionStartedAtMs + durationMs;
  const latestValidMessageAt = parsedMessageTimes.length > 0
    ? Math.max(...parsedMessageTimes)
    : Number.NEGATIVE_INFINITY;
  const sessionEndsAtMs = Math.max(
    nominalSessionEndsAtMs,
    latestValidMessageAt,
  );
  const replayDurationMs = sessionEndsAtMs - sessionStartedAtMs;
  const messageCount = args.messages.length;
  if (messageCount === 0) {
    return {
      nowMs: sessionStartedAtMs,
      sessionStartedAtMs,
      sessionEndsAtMs,
      progress: 0,
    };
  }
  const fallbackAt = (index: number): number =>
    messageCount <= 1
      ? sessionStartedAtMs
      : sessionStartedAtMs +
        replayDurationMs * (Math.max(0, Math.min(messageCount - 1, index)) / (messageCount - 1));
  let previousAt = sessionStartedAtMs;
  const messageTimeline = args.messages.map((message, index) => {
    const parsed = Date.parse(message.createdAt ?? "");
    const candidate = Number.isFinite(parsed) ? parsed : fallbackAt(index);
    const bounded = Math.max(
      sessionStartedAtMs,
      Math.min(sessionEndsAtMs, candidate),
    );
    previousAt = Math.max(previousAt, bounded);
    return previousAt;
  });
  const messageIndex = clampCoffeeReplayMessageIndex(
    messageCount,
    args.messageIndex,
  );
  const currentAt = messageTimeline[messageIndex] ?? sessionStartedAtMs;
  const nextAt =
    messageTimeline[messageIndex + 1] ?? sessionEndsAtMs;
  const revealFraction = clampReplayUnit(args.revealFraction);
  const nowMs = currentAt + Math.max(0, nextAt - currentAt) * revealFraction;
  return {
    nowMs,
    sessionStartedAtMs,
    sessionEndsAtMs,
    progress: clampReplayUnit((nowMs - sessionStartedAtMs) / replayDurationMs),
  };
}

export interface CoffeeReviewClipboardBotLike {
  id: string;
  name: string;
}

export interface CoffeeReviewClipboardContext {
  conversationId?: string | null;
  title?: string | null;
  topic?: string | null;
  phase?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  durationMinutes?: number | null;
  incognito?: boolean | null;
  groupId?: string | null;
  bots?: readonly CoffeeReviewClipboardBotLike[];
  absentBotIds?: readonly string[];
  settings?: Partial<CoffeeSessionSettings> | null;
  recordingEvidence?: SessionReviewRecordingEvidence;
}

export interface CoffeeReplayAction {
  action: string;
  messageId: string | null;
  messageIndex: number;
  createdAt?: string;
}

export interface CoffeeActionBotContext {
  name?: string | null;
  systemPrompt?: string | null;
  glyph?: string | null;
}

export interface CoffeeReplayState {
  hasReplayEvents: boolean;
  arrivedBotIds: Set<string>;
  walkingInBotIds: Set<string>;
  nameplatePendingBotIds: Set<string>;
  socialByBotId: Record<string, CoffeeReplaySocialSnapshotPayload>;
  topOffsByBotId: Record<string, CoffeeCupTopOffSnapshot>;
  currentEvents: CoffeeReplayEventPayload[];
  activeTopOffEvent: CoffeeReplayTopOffEventPayload | null;
  departingBotIds: Set<string>;
  departedBotIds: Set<string>;
  botDepartureEvent: CoffeeReplayBotDepartureEventPayload | null;
  playerPresent: boolean;
  playerDeparting: boolean;
  playerDepartureEvent: CoffeeReplayPlayerDepartureEventPayload | null;
  latestBaristaDelivery: CoffeeReplayBaristaDeliveryEventPayload | null;
  activeBaristaDelivery: CoffeeReplayBaristaDeliveryEventPayload | null;
  playerSipCount: number;
  activePlayerSip: CoffeeReplayPlayerSipEventPayload | null;
  identityMirrorByHolderBotId: Record<string, BotIdentityMirrorStateV1>;
  identityShapeshiftByHolderBotId: Record<string, BotIdentityShapeshiftStateV1>;
  falseNameByHolderBotId: Record<string, BotFalseNameStateV1>;
}

/** State used by voice playback for one message; the triggering message changes later turns. */
export function coffeeIdentityMirrorStateBeforeMessage(
  messages: readonly CoffeeReplayMessageLike[],
  messageIndex: number,
  holderBotId: string,
): BotIdentityMirrorStateV1 | null {
  let state: BotIdentityMirrorStateV1 | null = null;
  const end = Math.max(0, Math.min(messages.length, Math.floor(messageIndex)));
  for (let index = 0; index < end; index += 1) {
    for (const event of coffeeReplayEventsForMessage(messages[index])) {
      if (
        event.kind === "identityMirror" &&
        event.state.holderBotId === holderBotId
      ) {
        state = event.state;
      }
    }
  }
  return state;
}

/** Sticky Library/Marketplace form before the named message index. */
export function coffeeIdentityShapeshiftStateBeforeMessage(
  messages: readonly CoffeeReplayMessageLike[],
  messageIndex: number,
  holderBotId: string,
): BotIdentityShapeshiftStateV1 | null {
  let state: BotIdentityShapeshiftStateV1 | null = null;
  const end = Math.max(0, Math.min(messages.length, Math.floor(messageIndex)));
  for (let index = 0; index < end; index += 1) {
    for (const event of coffeeReplayEventsForMessage(messages[index])) {
      if (
        event.kind === "identityShapeshift" &&
        event.state.holderBotId === holderBotId
      ) {
        state = event.state;
      }
    }
  }
  return state;
}

/** Prefer identity-mirror voice, then shapeshift, then the holder's authored voice. */
export function coffeeBorrowedIdentityVoiceBeforeMessage(
  messages: readonly CoffeeReplayMessageLike[],
  messageIndex: number,
  holderBotId: string,
  holderAuthoredVoice: unknown,
  holderVoiceOverride: unknown,
) {
  const mirror = coffeeIdentityMirrorStateBeforeMessage(
    messages,
    messageIndex,
    holderBotId,
  );
  if (mirror) {
    return resolveBotIdentityMirrorVoiceV1(
      mirror,
      holderAuthoredVoice,
      holderVoiceOverride,
    );
  }
  const shapeshift = coffeeIdentityShapeshiftStateBeforeMessage(
    messages,
    messageIndex,
    holderBotId,
  );
  return resolveBotIdentityShapeshiftVoiceV1(
    shapeshift,
    holderAuthoredVoice,
    holderVoiceOverride,
  );
}

export const COFFEE_REPLAY_PLAYER_THINKING_MIN_MS = 800;
export const COFFEE_REPLAY_PLAYER_THINKING_MAX_MS = 3_500;
export const COFFEE_REPLAY_TOP_OFF_CHAIN_MS = 3_000;

const COFFEE_PLAYER_SESSION_END_PATTERNS = [
  /\b(?:let(?:'s| us)|we should|i think we should)\s+(?:end|stop|wrap(?: this| things)? up|call it)\b/iu,
  /\b(?:end|stop|wrap up|finish)\s+(?:this|the|our)\s+coffee\s+session\b/iu,
  /\b(?:call it a night|leave it there|stop here|wrap this up)\b/iu,
  /\b(?:i (?:should|need|have to|must) (?:to )?(?:get going|go|head out|leave)|i(?:'m| am) (?:heading out|leaving))\b/iu,
  /\b(?:catch (?:you|y['’]?all|everyone|you all) later|goodbye (?:everyone|everybody|all)|see (?:you|y['’]?all|everyone|you all) later)\b/iu,
] as const;

export function coffeePlayerMessageSignalsSessionEnd(text: string): boolean {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return false;
  return COFFEE_PLAYER_SESSION_END_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export function coffeeReplayCompletionHoldMs(
  message: Pick<
    CoffeeReplayMessageLike,
    "coffeeReplayEvents" | "coffeeUserAction" | "socialSilence"
  >,
  reducedMotion: boolean,
): number {
  const events = message.coffeeReplayEvents ?? [];
  if (events.some((event) => event.kind === "botDeparture")) {
    return reducedMotion ? 120 : 2_700;
  }
  if (events.some((event) => event.kind === "playerDeparture")) {
    return reducedMotion ? 120 : 1_280;
  }
  if (events.some((event) => event.kind === "baristaDelivery")) {
    return reducedMotion ? 140 : 2_400;
  }
  if (events.some((event) => event.kind === "playerSip")) {
    return reducedMotion ? 120 : 900;
  }
  if (message.coffeeUserAction) {
    return reducedMotion ? 120 : 1_100;
  }
  if (message.socialSilence?.provenance === "social") {
    return message.socialSilence.holdMs;
  }
  return 420;
}

function coffeeReplayGraphemeCount(text: string): number {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}

export function coffeeReplayPlayerThinkingDurationMs(text: string): number {
  const correlatedMs = 650 + coffeeReplayGraphemeCount(text.trim()) * 18;
  return Math.max(
    COFFEE_REPLAY_PLAYER_THINKING_MIN_MS,
    Math.min(COFFEE_REPLAY_PLAYER_THINKING_MAX_MS, Math.round(correlatedMs))
  );
}

export function coffeeReplayTopOffsChain(
  previous: Pick<CoffeeReplayTopOffEventPayload, "occurredAt"> | null | undefined,
  next: Pick<CoffeeReplayTopOffEventPayload, "occurredAt"> | null | undefined
): boolean {
  if (!previous || !next) return false;
  const gapMs = Date.parse(next.occurredAt) - Date.parse(previous.occurredAt);
  return Number.isFinite(gapMs) && gapMs >= 0 && gapMs <= COFFEE_REPLAY_TOP_OFF_CHAIN_MS;
}

export function coffeeConversationHasMeaningfulTableDialogue(
  messages: readonly Pick<CoffeeReplayMessageLike, "role" | "content">[]
): boolean {
  return messages.some((message) => {
    if (message.role !== "user" && message.role !== "assistant") return false;
    return normalizeCoffeeMessageDelivery(message.content).hasDialogue;
  });
}

const COFFEE_ACTION_FACIAL_HAIR_RE = /\b(?:beard|mustache|moustache|goatee)\b/i;
const COFFEE_ACTION_EXPLICIT_NO_FACIAL_HAIR_RE =
  /\b(?:beardless|clean-shaven|no\s+(?:beard|mustache|moustache|goatee))\b/i;
const COFFEE_ACTION_EXPLICIT_FACIAL_HAIR_RE =
  /\b(?:bearded|has\s+(?:a\s+)?(?:beard|mustache|moustache|goatee)|with\s+(?:a\s+)?(?:beard|mustache|moustache|goatee))\b/i;
const COFFEE_ACTION_KNOWN_NO_FACIAL_HAIR_RE =
  /\b(?:mr\.?\s*krabs|eugene\s+krabs|squidward|spongebob|patrick\s+star|sandy\s+cheeks|plankton|sheldon\s+j\.?\s*plankton)\b/i;
export const COFFEE_SIP_ACTION_MIN_MESSAGE_GAP = 3;
const COFFEE_SIP_ACTION_RE =
  /\b(?:sips?|sipping|drinks?|drinking|takes?\s+(?:a\s+)?(?:quick|small|slow|quiet|deliberate|long)?\s*sip|raises?\s+(?:(?:his|her|their|the)\s+)?(?:cup|mug)\s+(?:to|toward)\s+(?:his|her|their|the)?\s*(?:mouth|lips)|lifts?\s+(?:(?:his|her|their|the)\s+)?(?:cup|mug)\s+(?:to|toward)\s+(?:his|her|their|the)?\s*(?:mouth|lips))\b/i;

function stripCoffeeVisibleQuoteMarks(text: string): string {
  return text
    .replace(/[“”"]/g, "")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripCoffeeActionBotMentionArtifacts(text: string): string {
  const markdownReduced = tokenizeBotMentionSource(text)
    .map((segment) => (segment.kind === "mention" ? segment.displayName : segment.text))
    .join("");

  return markdownReduced
    .replace(/\(\s*prism-bot:\/\/[^)\s]+\s*\)/gi, "")
    .replace(/\bprism-bot:\/\/[^\s),.;!?]+/gi, "")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/\b(?:at|towards?|to|from|with|for)\s*$/iu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function coffeeActionContextRejectsFacialHair(
  bot: CoffeeActionBotContext | null | undefined
): boolean {
  const identity = `${bot?.name ?? ""} ${bot?.systemPrompt ?? ""} ${bot?.glyph ?? ""}`.trim();
  if (!identity) return false;
  if (COFFEE_ACTION_EXPLICIT_NO_FACIAL_HAIR_RE.test(identity)) return true;
  if (COFFEE_ACTION_EXPLICIT_FACIAL_HAIR_RE.test(identity)) return false;
  return COFFEE_ACTION_KNOWN_NO_FACIAL_HAIR_RE.test(identity);
}

export function sanitizeCoffeeActionForBot(
  action: string,
  bot?: CoffeeActionBotContext | null
): string {
  const collapsed = stripCoffeeVisibleQuoteMarks(
    stripCoffeeActionBotMentionArtifacts(action).replace(/\s+/g, " ").trim()
  );
  if (!collapsed) return "";
  if (coffeeActionIsSip(collapsed)) return "";
  // Dialogue that leaked into the action field belongs on the table line.
  if (looksLikeSpokenProseMiswrappedAsAction(collapsed)) return "";
  if (!COFFEE_ACTION_FACIAL_HAIR_RE.test(collapsed)) return collapsed;
  if (!coffeeActionContextRejectsFacialHair(bot)) return collapsed;

  return collapsed
    .replace(
      /\b(?:strokes?|rubs?|scratches?|tugs?(?:\s+at)?|twirls?|smooths?|combs?)\s+(?:(?:his|her|their|the)\s+)?(?:beard|mustache|moustache|goatee)\b/gi,
      "taps the table"
    )
    .replace(/\b(?:his|her|their|the)\s+(?:beard|mustache|moustache|goatee)\b/gi, "the table")
    .replace(/\b(?:beard|mustache|moustache|goatee)\b/gi, "face")
    .replace(/\s+/g, " ")
    .trim();
}

export function coffeeActionIsSip(action: string): boolean {
  return COFFEE_SIP_ACTION_RE.test(action.replace(/\s+/g, " ").trim());
}

export function coffeeActionCanDisplayWhileSpeaking(
  action: string,
  spokenText: string
): boolean {
  return !coffeeActionIsSip(action) || spokenText.trim().length === 0;
}

export function coffeeActionSipMessageGapForDuration(
  durationMinutes?: number | null
): number {
  return coffeeCupSipMessageGapForDuration(
    durationMinutes,
    COFFEE_SIP_ACTION_MIN_MESSAGE_GAP
  );
}

export function coffeeActionPassesSipCadence(
  action: string,
  messageIndex: number,
  previousSipMessageIndex: number | null | undefined,
  minMessageGap = COFFEE_SIP_ACTION_MIN_MESSAGE_GAP
): boolean {
  if (!coffeeActionIsSip(action)) return true;
  if (typeof previousSipMessageIndex !== "number") return true;
  return messageIndex - previousSipMessageIndex >= minMessageGap;
}

export function coffeeActionAnimationStartedAtMs(
  message: Pick<CoffeeReplayMessageLike, "id" | "createdAt">,
  firstVisibleAtMsByMessageId?: ReadonlyMap<string, number> | null
): number {
  const localStartedAt =
    message.id && firstVisibleAtMsByMessageId
      ? firstVisibleAtMsByMessageId.get(message.id)
      : undefined;
  if (typeof localStartedAt === "number" && Number.isFinite(localStartedAt)) {
    return localStartedAt;
  }
  return Date.parse(message.createdAt ?? "");
}

export function clampCoffeeReplayMessageIndex(messageCount: number, index: number): number {
  if (!Number.isFinite(messageCount) || messageCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(messageCount - 1, Math.floor(index)));
}

export function coffeeReplayVisibleMessages<T>(
  messages: readonly T[],
  replayMessageIndex: number
): T[] {
  if (messages.length === 0) return [];
  const clampedIndex = clampCoffeeReplayMessageIndex(messages.length, replayMessageIndex);
  return messages.slice(0, clampedIndex + 1);
}

export function coffeeReplayMessageRevealInProgress(args: {
  replayActive: boolean;
  replayMessageKey: string | null;
  typewriterMessageKey: string | null;
  displayLength: number;
  visibleLength: number;
}): boolean {
  if (!args.replayActive || !args.replayMessageKey || args.displayLength <= 0) {
    return false;
  }
  return (
    args.typewriterMessageKey !== args.replayMessageKey ||
    args.visibleLength < args.displayLength
  );
}

export function coffeeReplayShouldWaitForVoiceClock(args: {
  replayPlaying: boolean;
  voiceEnabled: boolean;
  visibleLength: number;
  voiceClockReady: boolean;
}): boolean {
  return (
    args.replayPlaying &&
    args.voiceEnabled &&
    args.visibleLength <= 0 &&
    !args.voiceClockReady
  );
}

export function coffeeStageActionTimelineMessages<T>(args: {
  messages: readonly T[];
  replayMessages: readonly T[];
  sessionFinished: boolean;
  replayActive: boolean;
}): readonly T[] {
  if (args.sessionFinished && !args.replayActive) return [];
  return args.replayActive ? args.replayMessages : args.messages;
}

export function coffeeReplayEventsForMessage(
  message: Pick<CoffeeReplayMessageLike, "coffeeReplayEvents"> | null | undefined
): CoffeeReplayEventPayload[] {
  return Array.isArray(message?.coffeeReplayEvents) ? message.coffeeReplayEvents : [];
}

export function coffeeReplayMessageHasStateEvent(
  message: Pick<CoffeeReplayMessageLike, "coffeeReplayEvents"> | null | undefined
): boolean {
  return coffeeReplayEventsForMessage(message).length > 0;
}

export function coffeeReplayStateAt(
  messages: readonly CoffeeReplayMessageLike[],
  replayMessageIndex: number
): CoffeeReplayState {
  const clampedIndex = clampCoffeeReplayMessageIndex(messages.length, replayMessageIndex);
  const arrivedBotIds = new Set<string>();
  const walkingInBotIds = new Set<string>();
  const nameplatePendingBotIds = new Set<string>();
  const socialByBotId: Record<string, CoffeeReplaySocialSnapshotPayload> = {};
  const topOffsByBotId: Record<string, CoffeeCupTopOffSnapshot> = {};
  const currentEvents: CoffeeReplayEventPayload[] = [];
  let hasReplayEvents = false;
  let activeTopOffEvent: CoffeeReplayTopOffEventPayload | null = null;
  const departingBotIds = new Set<string>();
  const departedBotIds = new Set<string>();
  let botDepartureEvent: CoffeeReplayBotDepartureEventPayload | null = null;
  let playerPresent = true;
  let playerDeparting = false;
  let playerDepartureEvent: CoffeeReplayPlayerDepartureEventPayload | null = null;
  let latestBaristaDelivery: CoffeeReplayBaristaDeliveryEventPayload | null = null;
  let activeBaristaDelivery: CoffeeReplayBaristaDeliveryEventPayload | null = null;
  let playerSipCount = 0;
  let activePlayerSip: CoffeeReplayPlayerSipEventPayload | null = null;
  const identityMirrorByHolderBotId: Record<string, BotIdentityMirrorStateV1> = {};
  const identityShapeshiftByHolderBotId: Record<string, BotIdentityShapeshiftStateV1> = {};
  const falseNameByHolderBotId: Record<string, BotFalseNameStateV1> = {};

  for (let index = 0; index < messages.length && index <= clampedIndex; index += 1) {
    const isCurrentMessage = index === clampedIndex;
    for (const event of coffeeReplayEventsForMessage(messages[index])) {
      hasReplayEvents = true;
      if (isCurrentMessage) currentEvents.push(event);
      if (event.kind === "arrival") {
        arrivedBotIds.add(event.botId);
        if (isCurrentMessage) {
          walkingInBotIds.add(event.botId);
          nameplatePendingBotIds.add(event.botId);
        }
      } else if (event.kind === "mood") {
        socialByBotId[event.botId] = event.social;
      } else if (event.kind === "topOff") {
        topOffsByBotId[event.botId] = {
          progressBefore: event.progressBefore,
          progressAfter: event.progressAfter,
          toppedOffAt: event.toppedOffAt,
        };
        if (isCurrentMessage) {
          activeTopOffEvent = event;
        }
      } else if (event.kind === "botDeparture") {
        botDepartureEvent = event;
        if (isCurrentMessage) {
          departingBotIds.add(event.botId);
        } else {
          departedBotIds.add(event.botId);
        }
      } else if (event.kind === "playerDeparture") {
        playerDepartureEvent = event;
        if (isCurrentMessage) {
          playerDeparting = true;
        } else {
          playerPresent = false;
        }
      } else if (event.kind === "baristaDelivery") {
        latestBaristaDelivery = event;
        if (isCurrentMessage) activeBaristaDelivery = event;
      } else if (event.kind === "playerSip") {
        playerSipCount = event.sipCount;
        if (isCurrentMessage) activePlayerSip = event;
      } else if (event.kind === "identityMirror") {
        identityMirrorByHolderBotId[event.state.holderBotId] = event.state;
      } else if (event.kind === "identityShapeshift") {
        identityShapeshiftByHolderBotId[event.state.holderBotId] = event.state;
      } else if (event.kind === "falseName") {
        falseNameByHolderBotId[event.state.holderBotId] = event.state;
      }
    }
  }

  return {
    hasReplayEvents,
    arrivedBotIds,
    walkingInBotIds,
    nameplatePendingBotIds,
    socialByBotId,
    topOffsByBotId,
    currentEvents,
    activeTopOffEvent,
    departingBotIds,
    departedBotIds,
    botDepartureEvent,
    playerPresent,
    playerDeparting,
    playerDepartureEvent,
    latestBaristaDelivery,
    activeBaristaDelivery,
    playerSipCount,
    activePlayerSip,
    identityMirrorByHolderBotId,
    identityShapeshiftByHolderBotId,
    falseNameByHolderBotId,
  };
}

export function coffeeTranscriptVisibleMessages<
  T extends {
    role: string;
    content: string;
    socialSilence?: SocialSilenceMarkerV1;
    transcriptInterruptionSegment?: unknown;
  },
>(
  messages: readonly T[]
): T[] {
  return messages.filter((message) => {
    if (
      message.role === "system" &&
      message.content.trim().startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX) &&
      !coffeeSystemSynopsisIsDisplayable(message.content)
    ) {
      return false;
    }
    if (message.role === "system") {
      return message.content.trim().length > 0;
    }
    if (message.transcriptInterruptionSegment) {
      return message.content.trim().length > 0;
    }
    if (
      socialSilenceMessageIsMarkedV1({
        content: message.content,
        marker: message.socialSilence,
        mode: "coffee",
      })
    ) {
      return false;
    }
    return normalizeCoffeeMessageDelivery(message.content).hasDialogue;
  });
}

export interface CoffeePublicTranscriptDeveloperCounts {
  visibleMessages: number;
  storedEvents: number;
  dialogue: number;
  systemRows: number;
  actions: number;
  silence: number;
  interruptionSegments: number;
}

export interface CoffeePublicTranscriptProjection {
  projectedRows: CoffeeReplayMessageLike[];
  visibleRows: CoffeeReplayMessageLike[];
  developerCounts: CoffeePublicTranscriptDeveloperCounts;
}

/**
 * Canonical public Coffee transcript. Table Talk, Review, copy, and download
 * must all consume this projection so intentional silence and internal event
 * rows cannot disagree across surfaces.
 */
export function projectCoffeePublicTranscript(args: {
  messages: readonly CoffeeReplayMessageLike[];
  bots?: readonly CoffeeTranscriptBotIdentity[];
}): CoffeePublicTranscriptProjection {
  const projectedRows = coffeeTranscriptMessagesWithInterruptions(args);
  const visibleRows = coffeeTranscriptVisibleMessages(projectedRows);
  const silence = args.messages.filter((message) =>
    socialSilenceMessageIsMarkedV1({
      content: message.content,
      marker: message.socialSilence,
      mode: "coffee",
    }),
  ).length;
  const actions = args.messages.filter(
    (message) =>
      Boolean(message.coffeeAmbientAction) ||
      Boolean(message.coffeeStageAction) ||
      Boolean(message.coffeeUserAction),
  ).length;
  const interruptionSegments = projectedRows.filter((message) =>
    Boolean(message.transcriptInterruptionSegment),
  ).length;
  const systemRows = args.messages.filter(
    (message) => message.role === "system",
  ).length;
  const dialogue = visibleRows.filter(
    (message) => message.role === "user" || message.role === "assistant",
  ).length;
  return {
    projectedRows,
    visibleRows,
    developerCounts: {
      visibleMessages: visibleRows.length,
      storedEvents: args.messages.length,
      dialogue,
      systemRows,
      actions,
      silence,
      interruptionSegments,
    },
  };
}

function coffeeReviewTableText(
  message: Pick<
    CoffeeReplayMessageLike,
    "role" | "content" | "transcriptInterruptionSegment"
  >,
): string {
  if (message.transcriptInterruptionSegment) {
    return stripCoffeeVisibleQuoteMarks(
      message.content.replace(/\s+/gu, " ").trim(),
    );
  }
  const content = extractStageDirections(message.content).mainText;
  return stripCoffeeVisibleQuoteMarks(content.replace(/\s+/g, " ").trim());
}

function coffeeReviewSpeaker(message: CoffeeReplayMessageLike): string {
  if (message.role === "assistant") return message.botName?.trim() || "Bot";
  if (message.role === "user") return "You";
  return "Session";
}

function coffeeReviewValue(label: string, raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? `${label}: ${trimmed}` : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return `${label}: ${raw}`;
  if (typeof raw === "boolean") return `${label}: ${raw ? "yes" : "no"}`;
  return null;
}

function coffeeReviewSettingsText(settings: Partial<CoffeeSessionSettings> | null | undefined): string {
  if (!settings) return "";
  const parts: string[] = [];
  if (typeof settings.responseLength === "string") {
    parts.push(`responseLength=${settings.responseLength}`);
  }
  if (typeof settings.tableEnergy === "string") {
    parts.push(`tableEnergy=${settings.tableEnergy}`);
  }
  if (typeof settings.crossTalk === "string") {
    parts.push(`crossTalk=${settings.crossTalk}`);
  }
  if (typeof settings.memoryCallbacks === "string") {
    parts.push(`memoryCallbacks=${settings.memoryCallbacks}`);
  }
  if (typeof settings.responseDelayBias === "number") {
    parts.push(`responseDelayBias=${settings.responseDelayBias}`);
  }
  if (typeof settings.breathingRoom === "number") {
    parts.push(`breathingRoom=${settings.breathingRoom}`);
  }
  if (typeof settings.stayOnThread === "boolean") {
    parts.push(`stayOnThread=${settings.stayOnThread ? "yes" : "no"}`);
  }
  if (typeof settings.givePlayerLastWord === "boolean") {
    parts.push(`givePlayerLastWord=${settings.givePlayerLastWord ? "yes" : "no"}`);
  }
  return parts.join("; ");
}

function coffeeReviewReplayEventCountsText(events: readonly CoffeeReplayEventPayload[]): string {
  if (events.length === 0) return "none recorded";
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([kind, count]) => `${kind}=${count}`)
    .join("; ");
}

function coffeeReviewUnitValue(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

function coffeeReviewPercent(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function coffeeReviewCupFillPercent(consumptionProgress: number): string {
  if (!Number.isFinite(consumptionProgress)) return "n/a";
  return coffeeReviewPercent(
    1 - Math.max(0, Math.min(1, consumptionProgress)),
  );
}

function coffeeReviewBotLabel(
  botId: string,
  botNameById: ReadonlyMap<string, string>
): string {
  const name = botNameById.get(botId);
  return name ? `${name} (${botId})` : botId;
}

function coffeeReviewReplayEventLine(
  event: CoffeeReplayEventPayload,
  botNameById: ReadonlyMap<string, string>
): string {
  if (event.kind === "playerDeparture") {
    return `- ${event.occurredAt} playerDeparture: player left the table early`;
  }
  if (event.kind === "playerSip") {
    return `- ${event.occurredAt} playerSip: ${event.drinkName} sip ${event.sipCount}/6 (fill=${event.fillId}, image=${event.imageId ?? "none"})`;
  }
  if (event.kind === "baristaDelivery") {
    return `- ${event.occurredAt} baristaDelivery: ${event.barista.name} delivered ${event.drink.name} (${event.drink.choice}, image=${event.drink.imageId ?? "none"}, fallback=${event.drink.fallback ? "yes" : "no"})`;
  }
  const bot = coffeeReviewBotLabel(event.botId, botNameById);
  if (event.kind === "arrival") {
    const timing = [
      typeof event.walkDurationMs === "number" ? `walk=${event.walkDurationMs}ms` : "",
      typeof event.nameplateDelayMs === "number" ? `nameplate=${event.nameplateDelayMs}ms` : "",
    ].filter(Boolean);
    return `- ${event.occurredAt} arrival: ${bot}${timing.length ? ` (${timing.join(", ")})` : ""}`;
  }
  if (event.kind === "topOff") {
    return `- ${event.occurredAt} topOff: ${bot} cup ${coffeeReviewCupFillPercent(
      event.progressBefore
    )} -> ${coffeeReviewCupFillPercent(event.progressAfter)}`;
  }
  if (event.kind === "emptyCupAttempt") {
    return `- ${event.occurredAt} emptyCupAttempt: ${bot} forgot the ${event.fillId} cup was empty (${event.attemptNumber}/${event.maxAttempts})`;
  }
  if (event.kind === "botDeparture") {
    return `- ${event.occurredAt} botDeparture: ${bot} left seat ${event.seatIndex + 1}`;
  }
  if (event.kind === "listenerReaction") {
    const speaker = coffeeReviewBotLabel(
      event.plan.speakerBotId,
      botNameById,
    );
    const spokenCue = listenerReactionSpokenTextV1(event.plan);
    const audible = spokenCue
      ? ` + ${spokenCue}`
      : event.plan.vocalFoley
        ? ` + [${event.plan.vocalFoley}]`
        : "";
    return `- ${event.occurredAt} listenerReaction: ${bot} ${event.plan.visualAction}${audible} while ${speaker} spoke (${event.plan.targetSource}, ${Math.round(
      event.plan.targetProgress * 100,
    )}%)`;
  }
  if (event.kind === "identityMirror") {
    return `- ${event.occurredAt} identityMirror: ${bot} copied ${event.state.targetBotName} (${event.state.targetBotId})`;
  }
  if (event.kind === "identityShapeshift") {
    return `- ${event.occurredAt} identityShapeshift: ${bot} became ${event.state.targetBotName} (${event.state.targetSource}:${event.state.targetBotId})`;
  }
  if (event.kind === "falseName") {
    return `- ${event.occurredAt} falseName: ${bot} believes they are ${event.state.believedName}`;
  }
  if (event.kind === "powerMoodBoost") {
    const source = coffeeReviewBotLabel(event.sourceBotId, botNameById);
    return `- ${event.occurredAt} powerMoodBoost: ${source} lifted ${bot} via ${event.powerName} (${event.strength}, disposition ${coffeeReviewUnitValue(event.dispositionBefore)} -> ${coffeeReviewUnitValue(event.dispositionAfter)}, sourceMessage=${event.sourceMessageId})`;
  }
  if (event.kind === "powerMoodDrain") {
    const source = botNameById.get(event.sourceBotId) ?? event.sourceBotId;
    return `- ${event.occurredAt} powerMoodDrain: ${bot} directly addressed ${source} and was drained by ${event.powerName} (${event.strength}, disposition ${coffeeReviewUnitValue(event.dispositionBefore)} -> ${coffeeReviewUnitValue(event.dispositionAfter)}, sourceMessage=${event.sourceMessageId})`;
  }
  if (event.kind === "powerAnnoyance") {
    const source = coffeeReviewBotLabel(event.sourceBotId, botNameById);
    return `- ${event.occurredAt} powerAnnoyance: ${source} mildly annoyed ${bot} (${event.strength}, disposition ${coffeeReviewUnitValue(event.dispositionBefore)} -> ${coffeeReviewUnitValue(event.dispositionAfter)}, sourceMessage=${event.sourceMessageId})`;
  }
  if (event.kind === "perceptionOverlap") {
    const preceding = coffeeReviewBotLabel(
      event.precedingBotId,
      botNameById,
    );
    return `- ${event.occurredAt} perceptionOverlap: ${bot} began over ${preceding} at ${Math.round(event.startRatio * 100)}% (${event.precedingMessageId} -> ${event.overlappingMessageId})`;
  }
  if (event.kind === "directionalIrritation") {
    const target = coffeeReviewBotLabel(event.targetBotId, botNameById);
    const deliveryBits = [
      event.delivery ? `tier=${event.delivery.tier}` : "",
      event.delivery?.snarkCue ? `snark=${event.delivery.snarkCue}` : "",
      event.delivery?.vocalFoley ? `foley=${event.delivery.vocalFoley}` : "",
    ].filter(Boolean);
    return `- ${event.occurredAt} directionalIrritation: ${bot} -> ${target} ${coffeeReviewUnitValue(
      event.transition.before,
    )} -> ${coffeeReviewUnitValue(event.transition.after)} (${event.transition.reason}${
      deliveryBits.length ? `; ${deliveryBits.join(", ")}` : ""
    })`;
  }
  if (event.kind === "mood") {
    return `- ${event.occurredAt} mood: ${bot} disposition=${coffeeReviewUnitValue(
      event.social.disposition,
    )}; valuesFriction=${coffeeReviewUnitValue(
      event.social.valuesFriction,
    )}; restraint=${coffeeReviewUnitValue(event.social.restraint)}; engagement=${coffeeReviewUnitValue(
      event.social.engagement,
    )}; leavePressure=${coffeeReviewUnitValue(event.social.leavePressure)}`;
  }
  const _exhaustive: never = event;
  return `- ${(_exhaustive as CoffeeReplayEventPayload).occurredAt} unknown replay event`;
}

function coffeeReviewTimestamp(value: string | null | undefined): string {
  if (!value) return "None";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function coffeeReviewIndentBlock(value: string | null | undefined): string {
  const normalized = value?.trim() || "[none]";
  return normalized
    .split(/\r?\n/u)
    .map((line) => `    ${line || " "}`)
    .join("\n");
}

function coffeeReviewTurnOffset(
  message: CoffeeReplayMessageLike,
  sessionStartedAt: string | null | undefined,
): string {
  const messageAt = Date.parse(message.createdAt ?? "");
  const startedAt = Date.parse(sessionStartedAt ?? "");
  return Number.isFinite(messageAt) && Number.isFinite(startedAt)
    ? formatSessionReviewDuration(Math.max(0, messageAt - startedAt))
    : "None";
}

function coffeeReviewTurnActions(message: CoffeeReplayMessageLike): string[] {
  if (message.transcriptInterruptionSegment) return [];
  const actions = [
    ...coffeeActionsForMessage(message),
    message.coffeeUserAction?.action?.trim() ?? "",
  ].filter(Boolean);
  return Array.from(new Set(actions));
}

function coffeeReviewInterruptionEvidence(
  interruption: CoffeeInterruptionEvent | undefined,
): string {
  if (!interruption) return "None recorded";
  const reviewEvidence = Object.fromEntries(
    Object.entries(interruption).filter(([key]) => key !== "reactionText"),
  );
  return sessionReviewStableJson(reviewEvidence);
}

function coffeeReviewGenerationEvidence(
  message: CoffeeReplayMessageLike,
): string {
  if (message.role === "user") return "Not applicable (human-authored)";
  if (message.transcriptInterruptionSegment) {
    return "Not applicable (persisted interruption projection)";
  }
  const provider =
    message.provider === "local" ||
    message.provider === "openai" ||
    message.provider === "anthropic"
      ? message.provider
      : undefined;
  const metadata = assistantGenerationMetadata(
    {
      role: message.role,
      provider,
      model: message.model ?? undefined,
      autoRoute: message.autoRoute,
      autoRecovery: message.autoRecovery,
      reasoningEffort: message.reasoningEffort,
      turbo: message.turbo,
      botPowerExactResponse: message.botPowerExactResponse,
    },
    null,
  );
  if (!metadata) {
    return message.botPowerExactResponse
      ? "Deterministic Power response (no model generation)"
      : "Unknown (legacy or unrecorded)";
  }
  return [
    metadata.model,
    `Effort ${LIVE_SESSION_EFFORT_LABELS[metadata.effort]}`,
    metadata.turbo ? "Turbo" : null,
    metadata.recovered
      ? `Recovered after ${metadata.recoveryAttemptCount} attempt${metadata.recoveryAttemptCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

function coffeeReviewEventSourceMessageId(
  event: CoffeeReplayEventPayload,
  carrierMessageId: string | undefined,
): string {
  const sourceMessageId =
    "sourceMessageId" in event && typeof event.sourceMessageId === "string"
      ? event.sourceMessageId.trim()
      : "";
  return sourceMessageId || carrierMessageId?.trim() || "none";
}

export function formatCoffeeReviewClipboardText(args: {
  messages: readonly CoffeeReplayMessageLike[];
  context?: CoffeeReviewClipboardContext;
}): string {
  const { context } = args;
  const replayEventEntries = args.messages.flatMap((message) =>
    (message.coffeeReplayEvents ?? []).map((event) => ({
      event,
      carrierMessageId: message.id,
    })),
  );
  const replayEvents = replayEventEntries.map(({ event }) => event);
  const projection = projectCoffeePublicTranscript({
    messages: args.messages,
    bots: context?.bots,
  });
  const messages = projection.projectedRows;
  const botNameById = new Map<string, string>();
  for (const bot of context?.bots ?? []) {
    if (bot.id.trim() && bot.name.trim()) botNameById.set(bot.id, bot.name);
  }
  for (const message of messages) {
    if (message.botId && message.botName?.trim()) {
      botNameById.set(message.botId, message.botName.trim());
    }
  }

  const visibleMessages = projection.visibleRows;
  const attendedBotIds = new Set<string>();
  for (const event of replayEvents) {
    if (event.kind === "arrival") attendedBotIds.add(event.botId);
  }
  for (const message of visibleMessages) {
    if (message.role === "assistant" && message.botId) {
      attendedBotIds.add(message.botId);
    }
  }
  const storedAbsentBotIds = context?.absentBotIds ?? [];
  const departedBotIds = storedAbsentBotIds.filter((botId) => attendedBotIds.has(botId));
  const absentBotIds = storedAbsentBotIds.filter((botId) => !attendedBotIds.has(botId));
  const absentBotIdSet = new Set(absentBotIds);
  const rosterBotIds: string[] = [];
  const addRosterBotId = (botId: string | null | undefined): void => {
    const normalized = botId?.trim() ?? "";
    if (!normalized || absentBotIdSet.has(normalized) || rosterBotIds.includes(normalized)) return;
    rosterBotIds.push(normalized);
  };
  for (const bot of context?.bots ?? []) addRosterBotId(bot.id);
  for (const event of replayEvents) {
    if (event.kind === "arrival") addRosterBotId(event.botId);
  }
  for (const message of visibleMessages) {
    if (message.role === "assistant") addRosterBotId(message.botId);
  }
  const transcriptLines = visibleMessages
    .map((message) => {
      const text = coffeeReviewTableText(message);
      return text ? `${coffeeReviewSpeaker(message)}: ${text}` : null;
    })
    .filter((line): line is string => line !== null);
  const roster = rosterBotIds
    .map((botId) => coffeeReviewBotLabel(botId, botNameById))
    .join(", ");
  const absent = absentBotIds
    .map((botId) => coffeeReviewBotLabel(botId, botNameById))
    .join(", ");
  const departed = departedBotIds
    .map((botId) => coffeeReviewBotLabel(botId, botNameById))
    .join(", ");
  const observedModels = Array.from(
    new Set(
      messages
        .filter((message) => message.role === "assistant")
        .map((message) => {
          const provider = typeof message.provider === "string" ? message.provider.trim() : "";
          const model = typeof message.model === "string" ? message.model.trim() : "";
          if (!provider && !model) return "";
          return model ? `${provider || "provider"}:${model}` : provider;
        })
        .filter(Boolean)
    )
  );
  const settings = coffeeReviewSettingsText(context?.settings);
  const reviewTurns = visibleMessages.filter((message) => {
    if (message.role !== "assistant" && message.role !== "user") return false;
    return Boolean(
      coffeeReviewTableText(message) ||
        coffeeReviewTurnActions(message).length > 0 ||
        message.coffeeInterruption ||
        message.socialSilence ||
        message.crosstalkReclaim ||
        message.transcriptInterruptionSegment,
    );
  });
  const turnLines = reviewTurns.flatMap((message, index) => {
    const actions = coffeeReviewTurnActions(message);
    const visibleText = coffeeReviewTableText(message);
    const humanAuthored = message.role === "user";
    const projected = Boolean(message.transcriptInterruptionSegment);
    const provider =
      typeof message.provider === "string" && message.provider.trim()
        ? message.provider.trim()
        : "unknown";
    const model =
      typeof message.model === "string" && message.model.trim()
        ? message.model.trim()
        : "provider default or unrecorded";
    const actionText = actions.length ? actions.join(" | ") : null;
    return [
      `### Turn ${String(index + 1).padStart(2, "0")} | ${coffeeReviewTurnOffset(
        message,
        context?.createdAt,
      )} | ${coffeeReviewSpeaker(message)} (${message.role})`,
      "",
      `- Message ID: ${message.id?.trim() || `coffee-review-turn-${index + 1}`}`,
      `- Source message ID: ${
        message.transcriptInterruptionSegment?.sourceMessageId ?? "Same as message"
      }`,
      `- Bot ID: ${message.botId?.trim() || (humanAuthored ? "player" : "unknown")}`,
      `- Recorded: ${coffeeReviewTimestamp(message.createdAt)}`,
      `- Turn routing: ${
        humanAuthored
          ? "human-authored"
          : projected
            ? "persisted interruption projection"
            : `${provider} -> ${model}`
      }`,
      `- Generation: ${coffeeReviewGenerationEvidence(message)}`,
      `- Speaker selection: ${
        humanAuthored || projected
          ? "Not applicable"
          : message.coffeeTurnRoute === undefined
            ? "Unknown (legacy or unrecorded)"
            : sessionReviewStableJson(message.coffeeTurnRoute)
      }`,
      `- AUTO recovery: ${
        humanAuthored || projected
          ? "Not applicable"
          : message.autoRecovery === undefined
            ? "None recorded"
            : sessionReviewStableJson(message.autoRecovery)
      }`,
      `- Output provenance: ${
        humanAuthored
          ? "human-authored"
          : projected
            ? "projected from persisted interruption metadata; not a generated message"
            : "recorded post-processing result; raw provider draft not preserved"
      }`,
      `- Delivery mood: ${message.moodKey?.trim() || "None recorded"}`,
      `- Observer projection: ${
        message.coffeeObserverProjection === undefined
          ? "None recorded"
          : sessionReviewStableJson(message.coffeeObserverProjection)
      }`,
      `- Social silence: ${
        message.socialSilence === undefined
          ? "None recorded"
          : sessionReviewStableJson(message.socialSilence)
      }`,
      `- Crosstalk reclaim: ${
        message.crosstalkReclaim === undefined
          ? "None recorded"
          : sessionReviewStableJson(message.crosstalkReclaim)
      }`,
      `- Interruption: ${
        coffeeReviewInterruptionEvidence(message.coffeeInterruption)
      }`,
      "- Action:",
      coffeeReviewIndentBlock(actionText),
      "- Visible transcript:",
      coffeeReviewIndentBlock(visibleText),
      "",
    ];
  });

  // Every message id the export actually carries, in any section — the
  // reconciliation set for the coverage check below.
  const presentMessageIds = new Set<string>();
  for (const message of messages) {
    if (typeof message.id === "string" && message.id.trim()) {
      presentMessageIds.add(message.id.trim());
    }
    // Interruption rows are projections of a real message; credit the source
    // so a split turn never reads as a missing one.
    const segment = message.transcriptInterruptionSegment;
    const sourceId =
      segment && typeof segment === "object" && "sourceMessageId" in segment
        ? (segment as { sourceMessageId?: unknown }).sourceMessageId
        : undefined;
    if (typeof sourceId === "string" && sourceId.trim()) {
      presentMessageIds.add(sourceId.trim());
    }
  }

  const contextLines = [
    coffeeReviewValue("Title", context?.title),
    coffeeReviewValue("Topic", context?.topic),
    coffeeReviewValue("Session ID", context?.conversationId),
    coffeeReviewValue("Phase", context?.phase),
    coffeeReviewValue("Created", context?.createdAt),
    coffeeReviewValue("Updated", context?.updatedAt),
    typeof context?.durationMinutes === "number" && Number.isFinite(context.durationMinutes)
      ? `Duration: ${context.durationMinutes} minutes`
      : null,
    coffeeReviewValue("Incognito", context?.incognito),
    coffeeReviewValue("Group ID", context?.groupId),
    roster ? `Roster: ${roster}` : null,
    absent ? `Absent bots: ${absent}` : null,
    departed ? `Departed bots: ${departed}` : null,
    settings ? `Settings: ${settings}` : null,
    observedModels.length ? `Observed models/providers: ${observedModels.join("; ")}` : null,
    `Visible transcript messages: ${transcriptLines.length}`,
    `Replay events: ${coffeeReviewReplayEventCountsText(replayEvents)}`,
  ].filter((line): line is string => line !== null);

  return [
    "# PRISM Coffee Review Export",
    "",
    `Review format: ${SESSION_REVIEW_FORMAT_VERSION}`,
    "",
    ...contextLines,
    "",
    "## Faithful Recording Evidence",
    "",
    ...sessionReviewRecordingSummaryLines(context?.recordingEvidence),
    "",
    "## Transcript Coverage",
    "",
    ...sessionReviewTranscriptCoverageLines({
      evidence: context?.recordingEvidence,
      presentMessageIds,
    }),
    "",
    "## Detailed Turns",
    "",
    ...(turnLines.length ? turnLines : ["No reviewable turns were recorded.", ""]),
    "## Table Prose",
    ...(transcriptLines.length ? transcriptLines : ["(No visible table prose.)"]),
    ...(replayEvents.length
      ? [
          "",
          "## Replay Events",
          ...replayEvents.map((event) => coffeeReviewReplayEventLine(event, botNameById)),
        ]
      : []),
    ...(replayEventEntries.length
      ? [
          "",
          "## Replay Event Log",
          ...replayEventEntries.map(
            ({ event, carrierMessageId }, index) =>
              `- #${String(index + 1).padStart(4, "0")} | ${coffeeReviewTimestamp(
                event.occurredAt,
              )} | ${event.kind} | sourceMessageId=${coffeeReviewEventSourceMessageId(
                event,
                carrierMessageId,
              )} | payload=${sessionReviewStableJson(event)}`,
          ),
        ]
      : []),
    "",
    "## Private Replay Direction Log",
    "",
    "This section is diagnostic evidence for review. It is not part of the user-facing transcript download.",
    "",
    ...sessionReviewDirectionLines(context?.recordingEvidence),
    "",
    "## Review Notes",
    "",
    "Use Detailed Turns for user-visible quality and per-line provenance. Use Replay Events and the private direction log for arrivals, thinking, moods, overlaps, cups, actions, departures, recording, and seek-state fidelity.",
    "Recorded assistant text is post-processing output unless an explicit raw-draft field says otherwise. Do not describe it as raw provider output merely because no repair was recorded.",
  ].join("\n");
}

export function coffeeActionsForMessage(message: CoffeeReplayMessageLike): string[] {
  const stageAction = message.coffeeStageAction?.action
    ? stripCoffeeVisibleQuoteMarks(message.coffeeStageAction.action.replace(/\s+/g, " ").trim())
    : "";
  const sanitizedStageAction = stageAction
    ? sanitizeCoffeeActionForBot(stageAction)
    : "";
  if (sanitizedStageAction) return [sanitizedStageAction];
  const actions = extractStageDirections(message.content).actions
    .map((action) =>
      sanitizeCoffeeActionForBot(
        stripCoffeeVisibleQuoteMarks(action.replace(/\s+/g, " ").trim()),
      ),
    )
    .filter((action) => action.length > 0);
  const ambientAction =
    message.coffeeAmbientAction?.source === "scripted"
      ? sanitizeCoffeeActionForBot(
          stripCoffeeVisibleQuoteMarks(
            message.coffeeAmbientAction.action.replace(/\s+/g, " ").trim(),
          ),
        )
      : "";
  return ambientAction && !actions.includes(ambientAction)
    ? [...actions, ambientAction]
    : actions;
}

export function collectCoffeeReplayActionsForBot(
  messages: readonly CoffeeReplayMessageLike[],
  botName: string
): CoffeeReplayAction[] {
  const normalizedBotName = botName.trim();
  if (!normalizedBotName) return [];
  const out: CoffeeReplayAction[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant" || message.botName !== normalizedBotName) return;
    for (const action of coffeeActionsForMessage(message)) {
      const trimmed = sanitizeCoffeeActionForBot(action).replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      out.push({
        action: trimmed,
        messageId: message.id ?? null,
        messageIndex,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      });
    }
  });
  return out;
}
