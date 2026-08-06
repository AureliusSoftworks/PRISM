/**
 * Shared loading / progress helpers for Debate Spectator and Signal Watch
 * progressive bake unlock.
 */
import {
  humanizeLiveBakePhaseLabel,
  type LiveBakeArtifactV1,
  type LiveBakeProgressV1,
} from "@localai/shared";

export function liveBakeProgressLabel(
  progress: LiveBakeProgressV1 | null | undefined,
  fallback = "Preparing the show…",
): string {
  return humanizeLiveBakePhaseLabel(progress?.phaseLabel, fallback);
}

export function liveBakeProgressPercent(
  progress: LiveBakeProgressV1 | null | undefined,
): number | null {
  if (!progress) return null;
  const total = progress.totalStepsEstimate;
  if (total == null || total <= 0) return null;
  return Math.max(
    0,
    Math.min(100, Math.round((progress.completedSteps / total) * 100)),
  );
}

export function liveBakeStatusCopy(
  artifact: LiveBakeArtifactV1 | null | undefined,
): string {
  if (!artifact) return "Preparing…";
  switch (artifact.status) {
    case "pending":
      return "Waiting to bake";
    case "baking":
      return liveBakeProgressLabel(artifact.progress);
    case "ready":
      return "Ready";
    case "failed":
      return artifact.error?.trim() || "Bake failed";
    case "cancelled":
      return "Bake cancelled";
    default: {
      const _exhaustive: never = artifact.status;
      return String(_exhaustive);
    }
  }
}

/** Plain-language loading title for each surface. */
export function liveBakeSurfaceTitle(
  surface: LiveBakeArtifactV1["surface"] | "debate" | "signal",
): string {
  return surface === "debate"
    ? "Preparing the gallery"
    : "Preparing the broadcast";
}
