import {
  botPowerResponseIsSilentV1,
  socialSilenceMessageIsMarkedV1,
  type SocialSilenceMarkerV1,
} from "@localai/shared";
import {
  PRISM_BOT_MARKDOWN_LINK_RE,
  tokenizeBotMentionSource,
} from "./botMention.ts";

export type CoffeeUserRevealFlowState =
  | "idle"
  | "playerComposing"
  | "botThinking"
  | "cooldown"
  | "userTableTyping"
  | "tableTyping";

export function coffeeComposerUsesRichInput(args: {
  variant: "chat" | "coffee-global" | "coffee-table" | "signal" | "debate";
  markdownEditorEnabled: boolean;
}): boolean {
  return (
    args.markdownEditorEnabled ||
    // Coffee's live table needs rich mention-chip rendering. Signal's producer
    // answer field is intentionally plain unless the writer opts into Markdown:
    // its controlled rich-editor update can replace the focused editing surface
    // while the live stage rerenders.
    args.variant === "coffee-table"
  );
}

export function coffeeShouldQueueAssistantRevealAfterUserTyping(
  state: CoffeeUserRevealFlowState,
): boolean {
  return state === "userTableTyping";
}

export function coffeeShouldWaitForPendingBotRevealBeforeNextTurn(
  state: CoffeeUserRevealFlowState,
): boolean {
  return state === "tableTyping";
}

export function coffeeRevealPreparationMayCommit(args: {
  preparedEpoch: number;
  currentEpoch: number;
}): boolean {
  return args.preparedEpoch === args.currentEpoch;
}

/** True when this table line was cut off and must not finish typing or seal. */
export function coffeeRevealLineIsCutOffV1(
  messageId: string | null | undefined,
  cutOffMessageId: string | null | undefined,
): boolean {
  const id = messageId?.trim();
  if (!id) return false;
  return cutOffMessageId?.trim() === id;
}

/**
 * A cut-off line must not seal as if the speaker finished. Voice `onEnd` after
 * an abort would otherwise dump the rest of the table text.
 */
export function coffeeRevealVoiceEndSealsTableLineV1(args: {
  messageId: string;
  activeMessageId: string | null | undefined;
  cutOffMessageId: string | null | undefined;
}): boolean {
  const messageId = args.messageId.trim();
  if (!messageId) return false;
  if (coffeeRevealLineIsCutOffV1(messageId, args.cutOffMessageId)) return false;
  return args.activeMessageId?.trim() === messageId;
}

export function coffeeArrivalAutoplayCanScheduleNow(
  state: CoffeeUserRevealFlowState,
): boolean {
  return state === "idle" || state === "playerComposing";
}

export function coffeeArrivalAutoplayRetryDelayMs(
  state: CoffeeUserRevealFlowState,
  requestedDelayMs = 850,
): number {
  if (coffeeArrivalAutoplayCanScheduleNow(state)) return 0;
  const boundedDelayMs = Number.isFinite(requestedDelayMs)
    ? Math.max(120, Math.round(requestedDelayMs))
    : 850;
  if (
    state === "tableTyping" ||
    state === "cooldown" ||
    state === "userTableTyping"
  ) {
    return Math.min(420, boundedDelayMs);
  }
  return Math.min(900, Math.max(320, boundedDelayMs));
}

export function coffeePendingSubmittedUserLineVisible(args: {
  state: CoffeeUserRevealFlowState;
  userRevealText: string;
  sessionFinished: boolean;
  persistedUserMessageVisible?: boolean;
}): boolean {
  return (
    args.state !== "userTableTyping" &&
    !args.sessionFinished &&
    args.persistedUserMessageVisible !== true &&
    args.userRevealText.trim().length > 0
  );
}

/**
 * `queueCoffeeReveal` updates pending-conversation deps while the player line may
 * still be in `userTableTyping`. Restarting that typewriter from zero makes the
 * finished line vanish until the bot starts speaking — skip the restart once the
 * reveal has settled (or the full display length is already on screen).
 */
export function coffeeUserTableTypingShouldRestart(args: {
  settled: boolean;
  visibleLength: number;
  fullDisplayLength: number;
}): boolean {
  if (args.settled) return false;
  if (args.fullDisplayLength <= 0) return false;
  return args.visibleLength < args.fullDisplayLength;
}

/** The stored player message from a completed Coffee turn, without display rewriting. */
export function coffeeSubmittedUserMessageFromTurn<
  T extends { role: string; content: string },
>(messages: readonly T[]): T | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim().length > 0) {
      return message;
    }
  }
  return null;
}

export function coffeePersistedUserLineOwnsPendingReveal<
  T extends { role: string; content: string },
>(args: { messages: readonly T[]; userRevealText: string }): boolean {
  const normalizedPending = args.userRevealText.replace(/\s+/g, " ").trim();
  if (!normalizedPending) return false;
  const latestStoredUserMessage = coffeeSubmittedUserMessageFromTurn(
    args.messages,
  );
  return (
    latestStoredUserMessage?.content.replace(/\s+/g, " ").trim() ===
    normalizedPending
  );
}

export function coffeeTableMessageContentIsVisible(
  content: string,
  socialSilence?: SocialSilenceMarkerV1,
  options?: { keepPowerMuteEllipsis?: boolean },
): boolean {
  const normalized = content.trim();
  // Hard Mute / social-silence "..." is intentional table presence — keep it.
  if (
    options?.keepPowerMuteEllipsis === true &&
    botPowerResponseIsSilentV1(normalized)
  ) {
    return true;
  }
  return (
    /[\p{L}\p{N}]/u.test(normalized) ||
    socialSilenceMessageIsMarkedV1({
      content: normalized,
      marker: socialSilence,
      mode: "coffee",
    })
  );
}

/** Sentence-case player prose for display without rewriting persisted message source. */
export function coffeeSentenceCaseTableProse(text: string): string {
  for (const segment of tokenizeBotMentionSource(text)) {
    if (segment.kind === "mention") {
      if (/\p{L}/u.test(segment.displayName)) return text;
      continue;
    }
    const firstLetter = segment.text.match(/\p{L}/u);
    if (!firstLetter || firstLetter.index === undefined) continue;
    const sourceIndex = segment.srcStart + firstLetter.index;
    const sentenceInitial = firstLetter[0].toLocaleUpperCase();
    if (sentenceInitial === firstLetter[0]) return text;
    return `${text.slice(0, sourceIndex)}${sentenceInitial}${text.slice(
      sourceIndex + firstLetter[0].length,
    )}`;
  }
  return text;
}

export function coffeeCenterFeedMessagesDuringPendingReveal<
  T extends { id: string },
>(args: {
  messages: readonly T[];
  pendingMessageId?: string | null;
  revealInProgress: boolean;
}): T[] {
  if (!args.revealInProgress || !args.pendingMessageId)
    return [...args.messages];
  return args.messages.filter(
    (message) => message.id !== args.pendingMessageId,
  );
}

export function coffeeShouldIgnoreStaleTurnResponse(response: {
  stale?: boolean;
  speakerBotId?: string | null;
}): boolean {
  return response.stale === true || !response.speakerBotId;
}

export function coffeeEmptyTurnAutoplayRetryDelayMs(args: {
  speakerBotId?: string | null;
  stale?: boolean;
  autoplayPaused: boolean;
  sessionPhase: string;
  sessionRemainingMs: number | null;
}): number | null {
  if (args.speakerBotId) return null;
  if (args.autoplayPaused) return null;
  if (args.sessionPhase !== "arriving" && args.sessionPhase !== "live")
    return null;
  if (args.sessionRemainingMs !== null && args.sessionRemainingMs <= 0)
    return null;
  return args.stale === true ? 360 : 850;
}

export function coffeeLoopTimerOwnsAutoplayTurn(args: {
  timerPresent: boolean;
  scheduledForMs: number | null;
  nowMs: number;
}): boolean {
  if (!args.timerPresent) return false;
  return args.scheduledForMs === null || args.scheduledForMs > args.nowMs;
}

/** Remaining delay on Coffee's monotonic autoplay deadline. */
export function coffeeMonotonicDeadlineRemainingMs(
  deadlineMs: number,
  nowMs: number,
): number {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, deadlineMs - nowMs);
}

export interface CoffeeAwkwardSilencePressure {
  pressure: number;
  focus: string | null;
}

/**
 * Wall-clock dead-air pressure. Any new player or bot message resets it by
 * becoming the latest activity timestamp; it never mutates the saved topic.
 */
export function coffeeAwkwardSilencePressure(args: {
  lastActivityAtMs: number | null;
  sessionStartedAtMs: number | null;
  nowMs: number;
  savedTopic?: string | null;
}): CoffeeAwkwardSilencePressure {
  const anchorMs = args.lastActivityAtMs ?? args.sessionStartedAtMs;
  if (anchorMs === null || !Number.isFinite(anchorMs) || !Number.isFinite(args.nowMs)) {
    return { pressure: 0, focus: null };
  }
  const inactiveMs = Math.max(0, args.nowMs - anchorMs);
  if (inactiveMs < 35_000) return { pressure: 0, focus: null };
  const pressure = Math.min(1, (inactiveMs - 35_000) / 40_000);
  const topic = args.savedTopic?.trim();
  if (inactiveMs < 65_000) {
    return {
      pressure,
      focus:
        "An awkward silence has settled. Break it naturally by questioning, contrasting, or making concrete one specific claim from the visible exchange. Do not offer a generic aphorism.",
    };
  }
  return {
    pressure,
    focus: [
      "The prior exchange has stalled. Make one natural pivot to a concrete new angle",
      topic ? `that grows from the saved topic ${JSON.stringify(topic)}` : "that grows from the saved topic",
      "without renaming or rewriting that topic. Ask something answerable or introduce a specific object, choice, consequence, or action.",
    ].join(" "),
  };
}

export function coffeeVoicePlaybackOwnsAutoplayGate(args: {
  busy: boolean;
  activeMessageId: string | null | undefined;
}): boolean {
  return args.busy && Boolean(args.activeMessageId?.trim());
}

/**
 * A composing player never blocks the table: bots keep thinking, revealing,
 * and scheduling turns while text sits in the composer (Signal-style flow).
 */
export function coffeeAutoplayForceTurnShouldRun(args: {
  hasConversation: boolean;
  hasPresentBot: boolean;
  sessionPhase: string;
  autoplayPaused: boolean;
  requestInFlight: boolean;
  pendingReveal: boolean;
  timerPresent: boolean;
  timerScheduledForMs: number | null;
  sessionEndsAtMs: number | null;
  lastAssistantAtMs: number | null;
  sessionStartedAtMs: number | null;
  lastForcedAtMs: number;
  nowMs: number;
  deadlineGraceMs?: number;
  silenceRecoveryMs?: number;
}): boolean {
  if (!args.hasConversation || !args.hasPresentBot) return false;
  if (args.sessionPhase !== "arriving" && args.sessionPhase !== "live")
    return false;
  if (args.autoplayPaused) return false;
  if (args.requestInFlight || args.pendingReveal) return false;
  if (args.sessionEndsAtMs !== null && args.nowMs >= args.sessionEndsAtMs)
    return false;
  const deadlineGraceMs = Math.max(0, args.deadlineGraceMs ?? 1_500);
  const silenceRecoveryMs = Math.max(1_000, args.silenceRecoveryMs ?? 35_000);
  if (
    args.lastForcedAtMs > 0 &&
    args.nowMs - args.lastForcedAtMs < deadlineGraceMs
  ) {
    return false;
  }
  if (args.timerPresent && args.timerScheduledForMs !== null) {
    return args.nowMs >= args.timerScheduledForMs + deadlineGraceMs;
  }
  if (args.timerPresent) return false;
  const progressAtMs = args.lastAssistantAtMs ?? args.sessionStartedAtMs;
  return (
    progressAtMs !== null && args.nowMs - progressAtMs >= silenceRecoveryMs
  );
}

export function coffeeAutoplayWatchdogShouldWake(args: {
  hasConversation: boolean;
  sessionPhase: string;
  autoplayPaused: boolean;
  rhythmState: CoffeeUserRevealFlowState;
  loopScheduled: boolean;
  requestInFlight: boolean;
  sessionEndsAtMs: number | null;
  nowMs: number;
}): boolean {
  if (!args.hasConversation) return false;
  if (args.sessionPhase !== "arriving" && args.sessionPhase !== "live")
    return false;
  if (args.autoplayPaused) return false;
  if (!coffeeArrivalAutoplayCanScheduleNow(args.rhythmState)) return false;
  if (args.loopScheduled || args.requestInFlight) return false;
  return args.sessionEndsAtMs === null || args.nowMs < args.sessionEndsAtMs;
}

export function coffeeDirectedMentionBotIds(
  text: string,
  seatedBotIds: Iterable<string>,
): string[] {
  const allowed = new Set(
    [...seatedBotIds].map((id) => id.trim()).filter(Boolean),
  );
  if (allowed.size === 0 || text.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  for (const match of text.matchAll(re)) {
    const encodedId = match[2] ?? "";
    let botId = encodedId;
    try {
      botId = decodeURIComponent(encodedId).trim();
    } catch {
      botId = encodedId.trim();
    }
    if (!botId || !allowed.has(botId) || seen.has(botId)) continue;
    seen.add(botId);
    out.push(botId);
  }
  return out;
}

export function coffeeVisibleDirectedMentionBotIds(
  text: string,
  seatedBotIds: Iterable<string>,
  revealedDisplayLength: number,
): string[] {
  const allowed = new Set(
    [...seatedBotIds].map((id) => id.trim()).filter(Boolean),
  );
  if (allowed.size === 0 || text.length === 0 || revealedDisplayLength <= 0)
    return [];
  const seen = new Set<string>();
  const out: string[] = [];
  let displayCursor = 0;
  for (const segment of tokenizeBotMentionSource(text)) {
    if (segment.kind === "mention") {
      const displayLen = segment.displayName.length;
      if (
        revealedDisplayLength > displayCursor &&
        segment.botId &&
        allowed.has(segment.botId) &&
        !seen.has(segment.botId)
      ) {
        seen.add(segment.botId);
        out.push(segment.botId);
      }
      displayCursor += displayLen;
      continue;
    }
    displayCursor += segment.text.length;
  }
  return out;
}
