export const SIGNAL_ONLINE_VOICE_TIMEOUT_MS = 15_000;
export const SIGNAL_OPENING_ONLINE_VOICE_TIMEOUT_MS = 30_000;

export function signalOnlineVoiceTimeoutMs(
  episodeBookend?: "opening" | "closing",
): number {
  return episodeBookend === "opening"
    ? SIGNAL_OPENING_ONLINE_VOICE_TIMEOUT_MS
    : SIGNAL_ONLINE_VOICE_TIMEOUT_MS;
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
