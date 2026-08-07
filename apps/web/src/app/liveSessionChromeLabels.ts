export const LIVE_SESSION_EFFORT_LABELS = {
  auto: "Auto",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
} as const;

export type LiveSessionEffortKey = keyof typeof LIVE_SESSION_EFFORT_LABELS;

export type LiveSessionRoutingChipLabels = {
  modelLabel: string;
  effortLabel: string;
};

/**
 * Quiet locked routing summary for live Coffee / Debate / Signal sits.
 * Auto model keeps effort as Auto so the chip never invents a fixed depth.
 */
export function liveSessionRoutingChipLabels(args: {
  modelIsAuto: boolean;
  modelLabel: string;
  effort: LiveSessionEffortKey | null | undefined;
}): LiveSessionRoutingChipLabels {
  const modelLabel = args.modelIsAuto
    ? "Auto"
    : args.modelLabel.trim() || "Model";
  if (args.modelIsAuto) {
    return { modelLabel, effortLabel: LIVE_SESSION_EFFORT_LABELS.auto };
  }
  const effortKey = args.effort ?? "auto";
  return {
    modelLabel,
    effortLabel: LIVE_SESSION_EFFORT_LABELS[effortKey],
  };
}
