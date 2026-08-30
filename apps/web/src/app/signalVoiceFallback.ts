export const SIGNAL_ONLINE_VOICE_TIMEOUT_MS = 15_000;
export const SIGNAL_ONLINE_VOICE_TIMEOUT_MAX_MS = 45_000;
/** Extra preferred-voice patience for long closings and tagged performance text. */
export const SIGNAL_ONLINE_VOICE_TIMEOUT_MS_PER_CHAR = 35;
/** Mirrors the API worker's bounded local synthesis budget. */
export const SIGNAL_BUILTIN_VOICE_TIMEOUT_MS = 60_000;
/** Lets playback lifecycle callbacks settle after synthesis returns. */
export const SIGNAL_VOICE_START_SETTLE_GRACE_MS = 5_000;

export type SignalVoiceEngineFamily = "builtin" | "elevenlabs";

/** Normalizes transport-specific engine labels into an audible voice family. */
export function signalVoiceEngineFamily(
  engineUsed: string | null | undefined,
): SignalVoiceEngineFamily | null {
  const normalized = engineUsed?.trim().toLowerCase() ?? "";
  if (normalized === "elevenlabs") return "elevenlabs";
  if (normalized === "builtin" || normalized.startsWith("builtin-")) {
    return "builtin";
  }
  return null;
}

/** Once a participant speaks, every later clip in that episode must match. */
export function signalVoiceClipMatchesEpisodeEngine(args: {
  engineUsed: string | null | undefined;
  selectedEngine: SignalVoiceEngineFamily;
  pinnedEngine: SignalVoiceEngineFamily | null;
}): boolean {
  return (
    signalVoiceEngineFamily(args.engineUsed) ===
    (args.pinnedEngine ?? args.selectedEngine)
  );
}

/**
 * Scales the ElevenLabs wait so a long closing line is not aborted into the
 * builtin pack while a shorter mid-show line keeps the snappy 15s floor.
 */
export function signalOnlineVoiceTimeoutMs(textLength: number): number {
  const length = Number.isFinite(textLength)
    ? Math.max(0, Math.floor(textLength))
    : 0;
  return Math.min(
    SIGNAL_ONLINE_VOICE_TIMEOUT_MAX_MS,
    SIGNAL_ONLINE_VOICE_TIMEOUT_MS +
      length * SIGNAL_ONLINE_VOICE_TIMEOUT_MS_PER_CHAR,
  );
}

/**
 * Signal's outer playback watchdog must not cancel a healthy voice request
 * before the selected engine's own bounded recovery path can finish.
 */
export function signalVoiceStartTimeoutMs(args: {
  textLength: number;
  voiceMode: "mute" | "english" | "babble" | "bottish";
  englishVoiceEngine: "builtin" | "elevenlabs";
}): number {
  if (args.voiceMode !== "english") return SIGNAL_ONLINE_VOICE_TIMEOUT_MS;
  const preferredBudgetMs =
    args.englishVoiceEngine === "elevenlabs"
      ? signalOnlineVoiceTimeoutMs(args.textLength)
      : 0;
  return (
    preferredBudgetMs +
    SIGNAL_BUILTIN_VOICE_TIMEOUT_MS +
    SIGNAL_VOICE_START_SETTLE_GRACE_MS
  );
}

/**
 * Prefetch must not poison playback with a builtin clip when Premium was
 * requested — playback can still retry ElevenLabs with a fresh timeout.
 */
export function signalPreferredVoiceClipReady(
  clip: { engineUsed: string | null } | null | undefined,
  preferredEngine: string,
): boolean {
  if (!clip) return false;
  if (preferredEngine !== "elevenlabs") return true;
  return clip.engineUsed === "elevenlabs";
}

export async function requestSignalVoiceWithFallback<T>(args: {
  requestPreferred: (signal: AbortSignal) => Promise<T>;
  requestBuiltin: (signal: AbortSignal) => Promise<T>;
  parentSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<T> {
  if (args.parentSignal?.aborted) {
    throw args.parentSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const preferredController = new AbortController();
  const abortPreferred = (): void => preferredController.abort();
  args.parentSignal?.addEventListener("abort", abortPreferred, { once: true });
  const timeout = setTimeout(
    abortPreferred,
    Math.max(1, args.timeoutMs ?? SIGNAL_ONLINE_VOICE_TIMEOUT_MS),
  );

  try {
    return await args.requestPreferred(preferredController.signal);
  } catch (error) {
    if (args.parentSignal?.aborted) throw error;
    return args.requestBuiltin(
      args.parentSignal ?? new AbortController().signal,
    );
  } finally {
    clearTimeout(timeout);
    args.parentSignal?.removeEventListener("abort", abortPreferred);
  }
}
