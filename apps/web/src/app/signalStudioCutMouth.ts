import type { ReplayMouthCueV2 } from "@localai/shared";

export function compactSignalStudioCutMouthCues(
  cues: readonly ReplayMouthCueV2[],
): ReplayMouthCueV2[] {
  const sorted = [...cues].sort((left, right) => left.atMs - right.atMs);
  return sorted.filter(
    (cue, index) => index === 0 || cue.shape !== sorted[index - 1]?.shape,
  );
}
