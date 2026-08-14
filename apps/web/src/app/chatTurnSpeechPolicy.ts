import type { EnglishVoiceEngine, VoiceMode } from "@localai/shared";

import type { ChatPresentation } from "./chatVoicePolicy";

export type ChatTurnSpeechSelection = Readonly<{
  voiceMode: VoiceMode;
  englishVoiceEngine: EnglishVoiceEngine;
}>;

export type ChatTurnSpeechLock = Readonly<{
  runId: string;
  selection: ChatTurnSpeechSelection;
}>;

/** Freeze the speaking type and engine that own one Chat/Zen reply. */
export function beginChatTurnSpeechLock(
  runId: string,
  selection: ChatTurnSpeechSelection,
): ChatTurnSpeechLock {
  return Object.freeze({
    runId,
    selection: Object.freeze({ ...selection }),
  });
}

/** An active reply always wins over later account-setting changes. */
export function resolveChatTurnSpeechSelection(
  configuredSelection: ChatTurnSpeechSelection,
  lock: ChatTurnSpeechLock | null,
): ChatTurnSpeechSelection {
  return lock?.selection ?? configuredSelection;
}

export function chatTurnSpeechTypeLocked(
  lock: ChatTurnSpeechLock | null,
): boolean {
  return lock !== null;
}

/** Only the run that acquired the lock may release it. */
export function releaseChatTurnSpeechLock(
  lock: ChatTurnSpeechLock | null,
  runId: string,
): ChatTurnSpeechLock | null {
  return lock?.runId === runId ? null : lock;
}

export const CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER = 2.5;

/** Text presentation has its own clock; audible speech never changes this rate. */
export function chatTurnStreamRateMultiplier(
  presentation: ChatPresentation | null,
  streamRate: number,
): number {
  if (presentation === null) return 1;
  const safeRate = Number.isFinite(streamRate) && streamRate > 0 ? streamRate : 1;
  const surfaceRate =
    presentation === "chat" ? CHAT_TRANSCRIPT_STREAM_RATE_MULTIPLIER : 1;
  return 1 / (safeRate * surfaceRate);
}
