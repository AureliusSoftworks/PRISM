export type PrismSceneAudioStopper = () => void;

/**
 * Run every stop even if one browser audio backend is already torn down.
 * Scene exits are a hard ownership boundary: no stale clip may survive merely
 * because an unrelated audio backend failed while stopping.
 */
export function runPrismSceneAudioStopSequence(
  stoppers: readonly PrismSceneAudioStopper[],
): void {
  for (const stop of stoppers) {
    try {
      stop();
    } catch {
      // Best-effort cleanup must continue across independent audio backends.
    }
  }
}
