/**
 * Client helpers for progressive Spectator / Watch bake unlock + polling.
 */
import {
  liveBakeMayStartWatch,
  type LiveBakeArtifactV1,
} from "@localai/shared";

export const LIVE_BAKE_POLL_INTERVAL_MS = 1_500;

export {
  liveBakeMayStartWatch,
  liveBakeShouldResumeOnOpen,
  liveBakeBufferedPlaybackMs,
} from "@localai/shared";

export function liveBakeProgressRatio(
  artifact: LiveBakeArtifactV1 | null | undefined,
): number | null {
  if (!artifact?.progress) return null;
  const total = artifact.progress.totalStepsEstimate;
  if (total == null || total <= 0) return null;
  return Math.min(1, Math.max(0, artifact.progress.completedSteps / total));
}
