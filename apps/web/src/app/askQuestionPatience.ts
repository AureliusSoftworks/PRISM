export const ASK_QUESTION_PATIENCE_TYPING_IDLE_MS = 1_500;

export interface AskQuestionPatienceAdvanceInput {
  durationMs: number;
  elapsedMs: number;
  fromMs: number;
  toMs: number;
  paused: boolean;
}

export interface AskQuestionPatienceAdvanceResult {
  elapsedMs: number;
  remainingMs: number;
  progress: number;
  expired: boolean;
}

export interface AskQuestionPatiencePauseInput {
  active: boolean;
  pendingReply: boolean;
  documentHidden: boolean;
  composerRevealed?: boolean;
  nowMs: number;
  lastTypingAtMs: number | null;
  typingIdleMs?: number;
}

export interface AskQuestionInteractionKeyInput {
  conversationId: string;
  assistantMessageId: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
}

export interface PendingAskQuestionMessageLike {
  id: string;
  role: string;
  askQuestionTimedOut?: boolean;
}

export interface PendingAskQuestionLike {
  name: "AskQuestion";
  options: readonly unknown[];
}

export function getPendingAskQuestionState<
  TMessage extends PendingAskQuestionMessageLike,
  TAskQuestion extends PendingAskQuestionLike,
>(
  messages: readonly TMessage[] | undefined,
  resolveAskQuestion: (message: TMessage) => TAskQuestion | undefined,
  locallyClosedAssistantMessageIds?: ReadonlySet<string>
): { askQuestion: TAskQuestion; assistantMessageId: string } | undefined {
  if (!messages || messages.length === 0) return undefined;
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  const tail = lastUserIndex < 0 ? messages : messages.slice(lastUserIndex + 1);
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const message = tail[i]!;
    if (message.role !== "assistant") continue;
    const askQuestion = resolveAskQuestion(message);
    if (
      !askQuestion ||
      askQuestion.name !== "AskQuestion" ||
      (askQuestion.options.length !== 2 && askQuestion.options.length !== 3) ||
      message.askQuestionTimedOut === true ||
      locallyClosedAssistantMessageIds?.has(message.id)
    ) {
      return undefined;
    }
    return { askQuestion, assistantMessageId: message.id };
  }
  return undefined;
}

export function normalizeAskQuestionPatienceDurationMs(
  value: unknown,
  fallback = 75_000,
  min = 20_000,
  max = 180_000
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, Math.round(normalized)));
}

export function advanceAskQuestionPatience(
  input: AskQuestionPatienceAdvanceInput
): AskQuestionPatienceAdvanceResult {
  const durationMs = Math.max(1, Math.round(input.durationMs));
  const baseElapsed = Math.max(0, Math.min(durationMs, Math.round(input.elapsedMs)));
  const deltaMs = input.paused ? 0 : Math.max(0, input.toMs - input.fromMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, baseElapsed + Math.round(deltaMs)));
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  return {
    elapsedMs,
    remainingMs,
    progress: remainingMs / durationMs,
    expired: remainingMs <= 0,
  };
}

export function shouldPauseAskQuestionPatience(
  input: AskQuestionPatiencePauseInput
): boolean {
  if (!input.active || input.pendingReply || input.documentHidden || input.composerRevealed) {
    return true;
  }
  if (input.lastTypingAtMs === null) return false;
  const typingIdleMs = Math.max(
    0,
    Math.round(input.typingIdleMs ?? ASK_QUESTION_PATIENCE_TYPING_IDLE_MS)
  );
  return input.nowMs - input.lastTypingAtMs < typingIdleMs;
}

export function buildAskQuestionInteractionKey(
  input: AskQuestionInteractionKeyInput
): string {
  return JSON.stringify({
    conversationId: input.conversationId,
    assistantMessageId: input.assistantMessageId,
    prompt: input.prompt,
    options: input.options.map((option) => ({
      id: option.id,
      label: option.label,
    })),
  });
}

export function shouldReportAskQuestionPatienceExpiry(input: {
  expired: boolean;
  alreadyReported: boolean;
}): boolean {
  return input.expired && !input.alreadyReported;
}
