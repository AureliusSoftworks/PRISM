import type {
  ModelReasoningEffortCapabilityV1,
  ReasoningEffort,
} from "@localai/shared";

export const MODEL_EFFORT_ICON_PATHS: Record<ReasoningEffort, string> = {
  auto: "/reasoning-effort/default.svg",
  none: "/reasoning-effort/none.svg",
  minimal: "/reasoning-effort/minimal.svg",
  low: "/reasoning-effort/low.svg",
  medium: "/reasoning-effort/medium.svg",
  high: "/reasoning-effort/high.svg",
  xhigh: "/reasoning-effort/xhigh.svg",
};

export function modelEffortSliderLevels(
  capability: ModelReasoningEffortCapabilityV1,
): ReasoningEffort[] {
  return ["auto", ...capability.levels];
}

export function modelEffortSliderIndex(
  levels: readonly ReasoningEffort[],
  value: ReasoningEffort,
): number {
  const index = levels.indexOf(value);
  return index >= 0 ? index : 0;
}

export function modelEffortSliderProgress(
  levels: readonly ReasoningEffort[],
  value: ReasoningEffort,
): number {
  if (levels.length <= 1) return 0;
  return (modelEffortSliderIndex(levels, value) / (levels.length - 1)) * 100;
}

export function modelEffortStep(
  levels: readonly ReasoningEffort[],
  value: ReasoningEffort,
  direction: -1 | 1,
): ReasoningEffort {
  if (levels.length === 0) return "auto";
  const currentIndex = modelEffortSliderIndex(levels, value);
  const nextIndex = Math.min(
    levels.length - 1,
    Math.max(0, currentIndex + direction),
  );
  return levels[nextIndex] ?? "auto";
}

/** Scroll down/right advances through the visibly ordered effort stops. */
export function modelEffortWheelDirection(
  deltaX: number,
  deltaY: number,
): -1 | 0 | 1 {
  const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  return dominantDelta === 0 ? 0 : dominantDelta > 0 ? 1 : -1;
}
