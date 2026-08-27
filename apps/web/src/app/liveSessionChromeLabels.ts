import {
  presentAppletModelRoute,
  type ActualAppletRoute,
  type AppletResponseLane,
} from "./autoRoutePresentation.ts";

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
  /** Persisted/session route observed from the server; never a client preview. */
  actualRoute?: ActualAppletRoute | null;
  lane?: AppletResponseLane;
  choosing?: boolean;
}): LiveSessionRoutingChipLabels {
  const route = presentAppletModelRoute({
    modelIsAuto: args.modelIsAuto,
    fixedModelLabel: args.modelLabel,
    actualModelLabel: args.modelLabel,
    lane: args.lane ?? "local",
    actualRoute: args.actualRoute,
    choosing: args.choosing,
  });
  const effortKey = route.actualRoute?.effort ?? args.effort ?? "auto";
  return {
    modelLabel: route.modelLabel,
    effortLabel: LIVE_SESSION_EFFORT_LABELS[effortKey],
    effortKey,
    automatic: route.automatic,
    turbo: route.actualRoute?.turbo ?? args.turbo === true,
  };
}
