/**
 * Client helpers for progressive Spectator / Watch bake unlock + polling.
 */
import {
  liveBakeMayStartWatch,
  liveBakeUnlockProgressRatio,
  type LiveBakeArtifactV1,
} from "@localai/shared";

export const LIVE_BAKE_POLL_INTERVAL_MS = 1_500;

export {
  liveBakeMayStartWatch,
  liveBakeShouldResumeOnOpen,
  liveBakeBufferedPlaybackMs,
  liveBakeUnlockProgressRatio,
} from "@localai/shared";

export function liveBakeProgressRatio(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number | null {
  if (!artifact?.progress) return null;
  const total = artifact.progress.totalStepsEstimate;
  if (total == null || total <= 0) {
    // Servers only write a total once the bake is finished, so a bar driven by
    // steps alone is dead for the entire pre-start hold. Fall back to progress
    // toward the unlock gate, which is what the viewer is waiting on.
    return liveBakeUnlockProgressRatio(artifact);
  }
  return Math.min(1, Math.max(0, artifact.progress.completedSteps / total));
}
