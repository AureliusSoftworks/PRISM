/**
 * A voice heartbeat is evidence of healthy playback only when the audible
 * media clock actually advances. Some media engines can keep emitting the
 * same timestamp after output has stalled; treating those duplicate callbacks
 * as progress turns a bounded recovery timer into an infinite one.
 */
export function signalVoiceProgressHeartbeatAdvanced(args: {
  previousElapsedMs: number;
  elapsedMs: number;
}): boolean {
  if (!Number.isFinite(args.elapsedMs)) return false;
  const previousElapsedMs = Number.isFinite(args.previousElapsedMs)
    ? Math.max(0, args.previousElapsedMs)
    : 0;
  return Math.max(0, args.elapsedMs) > previousElapsedMs;
}
