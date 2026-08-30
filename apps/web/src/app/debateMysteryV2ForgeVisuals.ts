import type { DebateMysteryCompilationStageV2 } from "@localai/shared";

export interface DebateMysteryForgeVisualState {
  /** Durable completion only. This never uses elapsed time or an ETA. */
  completion: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  saturation: number;
  opacity: number;
  blurPx: number;
}

/** Turns public durable Case Forge checkpoints into the exterior treatment. */
export function debateMysteryForgeVisualState(
  completedPasses: number,
  totalPasses: number,
  stage: DebateMysteryCompilationStageV2,
): DebateMysteryForgeVisualState {
  const boundedTotal = Number.isFinite(totalPasses) && totalPasses > 0
    ? totalPasses
    : 1;
  const completion = stage === "complete"
    ? 1
    : Math.min(1, Math.max(0, Number.isFinite(completedPasses) ? completedPasses / boundedTotal : 0));
  return {
    completion,
    brightness: 0.45 + completion * 0.55,
    contrast: 0.72 + completion * 0.36,
    grayscale: 1 - completion,
    saturation: completion,
    opacity: completion === 0 ? 0 : 0.18 + completion * 0.82,
    blurPx: Math.round((1 - completion) * 28 * 10) / 10,
  };
}
