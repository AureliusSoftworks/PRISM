import type {
  ModelReasoningEffortCapabilityV1,
  ProviderReasoningEffort,
  ReasoningEffort,
} from "@localai/shared";

export type ModelEffortCapabilityMode =
  ModelReasoningEffortCapabilityV1["mode"];

export const MODEL_EFFORT_DEFAULT_ICON_PATH = "/reasoning-effort/default.svg";

export const MODEL_EFFORT_ICON_PATHS: Record<ReasoningEffort, string> = {
  auto: MODEL_EFFORT_DEFAULT_ICON_PATH,
  none: "/reasoning-effort/none.svg",
  minimal: "/reasoning-effort/minimal.svg",
  low: "/reasoning-effort/low.svg",
  medium: "/reasoning-effort/medium.svg",
  high: "/reasoning-effort/high.svg",
  xhigh: "/reasoning-effort/xhigh.svg",
};

export const MODEL_EFFORT_MAX_ICON_PATH = "/reasoning-effort/max.svg";

export function modelEffortRequestValue(
  capability: ModelReasoningEffortCapabilityV1,
  ordinaryEffort: ReasoningEffort,
  maxEnabled: boolean,
): ProviderReasoningEffort {
  return maxEnabled &&
    ordinaryEffort === "xhigh" &&
    capability.mode === "native" &&
    capability.supportsMax
    ? "max"
    : ordinaryEffort;
}

export function modelEffortBaseline(
  capability: ModelReasoningEffortCapabilityV1,
): ReasoningEffort {
  return capability.mode === "simulated" ? "none" : "auto";
}

export function modelEffortValueForCapability(
  capability: ModelReasoningEffortCapabilityV1,
  stored: ReasoningEffort | null | undefined,
): ReasoningEffort {
  return stored && stored !== "auto" && capability.levels.includes(stored)
    ? stored
    : modelEffortBaseline(capability);
}

export function modelEffortSliderLevels(
  capability: ModelReasoningEffortCapabilityV1,
): ReasoningEffort[] {
  if (capability.mode === "unavailable") return [];
  return capability.mode === "simulated"
    ? [...capability.levels]
    : ["auto", ...capability.levels];
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
