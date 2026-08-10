import type { EnglishVoiceEngine, VoiceMode } from "@localai/shared";

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

/**
 * The text stream-rate setting belongs only to silent Mute presentation.
 * Spoken modes are timed by their rendered audio clock.
 */
export function chatTurnStreamRateMultiplier(
  selection: ChatTurnSpeechSelection,
  streamRate: number,
): number {
  if (selection.voiceMode !== "mute") return 1;
  const safeRate = Number.isFinite(streamRate) && streamRate > 0 ? streamRate : 1;
  return 1 / safeRate;
}
