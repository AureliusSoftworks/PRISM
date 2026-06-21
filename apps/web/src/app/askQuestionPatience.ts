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
  nowMs: number;
  lastTypingAtMs: number | null;
  typingIdleMs?: number;
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
  if (!input.active || input.pendingReply || input.documentHidden) return true;
  if (input.lastTypingAtMs === null) return false;
  const typingIdleMs = Math.max(
    0,
    Math.round(input.typingIdleMs ?? ASK_QUESTION_PATIENCE_TYPING_IDLE_MS)
  );
  return input.nowMs - input.lastTypingAtMs < typingIdleMs;
}

export function shouldReportAskQuestionPatienceExpiry(input: {
  expired: boolean;
  alreadyReported: boolean;
}): boolean {
  return input.expired && !input.alreadyReported;
}
