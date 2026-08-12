export const LIVE_SESSION_EFFORT_LABELS = {
  auto: "Default",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
} as const;

export type LiveSessionEffortKey = keyof typeof LIVE_SESSION_EFFORT_LABELS;

export type LiveSessionRoutingChipLabels = {
  modelLabel: string;
  effortLabel: string;
  effortKey: LiveSessionEffortKey;
  automatic: boolean;
  turbo: boolean;
};

/**
 * Quiet routing summary for live Coffee / Debate / Signal sits. Auto resolves
 * to the concrete route while retaining provenance in visible prose.
 */
export function liveSessionRoutingChipLabels(args: {
  modelIsAuto: boolean;
  modelLabel: string;
  effort: LiveSessionEffortKey | null | undefined;
  turbo?: boolean;
}): LiveSessionRoutingChipLabels {
  const effortKey = args.effort ?? "auto";
  const concreteModelLabel = args.modelLabel.trim() || "Model";
  return {
    modelLabel: args.modelIsAuto
      ? `${concreteModelLabel} [auto]`
      : concreteModelLabel,
    effortLabel: LIVE_SESSION_EFFORT_LABELS[effortKey],
    effortKey,
    automatic: args.modelIsAuto,
    turbo: args.turbo === true,
  };
}
