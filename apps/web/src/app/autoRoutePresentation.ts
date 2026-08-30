import type {
  AutoRecoveryTraceV1,
  AutoRouteDecisionV1,
  ProviderReasoningEffort,
} from "@localai/shared";

export type AppletResponseLane = "local" | "online";
export type AppletModelProvider = "local" | "ollama_cloud" | "openai" | "anthropic";

export interface ActualAppletRoute {
  provider: AppletModelProvider;
  model: string;
  effort?: ProviderReasoningEffort | null;
  turbo?: boolean;
  autoRoute?: AutoRouteDecisionV1;
  autoRecovery?: AutoRecoveryTraceV1;
}

export interface AutoRouteLivePresentation {
  modelLabel: string;
  actualRoute: ActualAppletRoute | null;
  automatic: boolean;
  choosing: boolean;
}

/**
 * The persisted shape shared by Chat and Coffee transcripts. Keep this
 * deliberately structural: the presenter must never ask a provider or inspect
 * a catalogue merely to determine the last route that actually completed.
 */
export interface PersistedAppletModelTurn {
  role?: string;
  provider?: AppletModelProvider;
  model?: string;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  autoRoute?: AutoRouteDecisionV1;
  autoRecovery?: AutoRecoveryTraceV1;
  /** Assistant-shaped deterministic rows must not become live routing state. */
  botPowerExactResponse?: unknown;
}

function trimModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A stale ONLINE completion must never relabel a LOCAL applet. This is only a
 * presentation guard; model execution remains server-authoritative.
 */
export function routeMatchesAppletLane(
  route: ActualAppletRoute | null | undefined,
  lane: AppletResponseLane,
): route is ActualAppletRoute {
  if (!route || !trimModel(route.model)) return false;
  if (lane === "local") return route.provider === "local";
  if (route.provider !== "local") return true;
  return false;
}

/** The recovery final is the only concrete route a completed turn may expose. */
export function finalActualAppletRoute(
  route: ActualAppletRoute | null | undefined,
): ActualAppletRoute | null {
  if (
    !route ||
    !trimModel(route.model) ||
    (route.provider !== "local" &&
      route.provider !== "ollama_cloud" &&
      route.provider !== "openai" &&
      route.provider !== "anthropic")
  ) {
    return null;
  }
  const recovery = route.autoRecovery;
  if (recovery?.finalProvider && trimModel(recovery.finalModel)) {
    return {
      ...route,
      provider: recovery.finalProvider,
      model: recovery.finalModel.trim(),
    };
  }
  return { ...route, model: route.model.trim() };
}

/**
 * Chooses the newest server-persisted model turn in a single applet/session
 * lane. Reverse traversal makes an older completion unable to relabel a newer
 * one after out-of-order UI reconciliation.
 */
export function latestActualAppletRoute(
  turns: readonly PersistedAppletModelTurn[],
  lane: AppletResponseLane,
): ActualAppletRoute | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (
      turn?.role !== "assistant" ||
      turn.botPowerExactResponse ||
      !turn.autoRoute ||
      turn.autoRoute.lane !== lane
    ) {
      continue;
    }
    const route = finalActualAppletRoute({
      provider: turn.autoRecovery?.finalProvider ?? turn.provider ?? turn.autoRoute?.provider ?? "local",
      model: turn.autoRecovery?.finalModel ?? turn.model ?? turn.autoRoute?.model ?? "",
      effort: turn.autoRecovery
        ? turn.autoRecovery.attempts.at(-1)?.reasoningEffort ?? "none"
        : (turn.reasoningEffort ?? turn.autoRoute?.reasoningEffort),
      turbo: turn.autoRecovery ? false : turn.turbo,
      autoRoute: turn.autoRoute,
      autoRecovery: turn.autoRecovery,
    });
    if (routeMatchesAppletLane(route, lane)) return route;
  }
  return null;
}

/**
 * Produces the small, shared live status without consulting catalogues or
 * starting discovery. `actualRoute` must be from persisted/session payloads,
 * never a contextual client preview.
 */
export function presentAppletModelRoute(args: {
  modelIsAuto: boolean;
  fixedModelLabel: string;
  /** Account-facing catalogue label for the observed concrete route. */
  actualModelLabel?: string;
  lane: AppletResponseLane;
  actualRoute?: ActualAppletRoute | null;
  choosing?: boolean;
}): AutoRouteLivePresentation {
  if (!args.modelIsAuto) {
    return {
      modelLabel: args.fixedModelLabel.trim() || "Model",
      actualRoute: null,
      automatic: false,
      choosing: false,
    };
  }
  const actualRoute = finalActualAppletRoute(args.actualRoute);
  if (routeMatchesAppletLane(actualRoute, args.lane)) {
    const actualModelLabel = args.actualModelLabel?.trim() || actualRoute.model;
    return {
      modelLabel: `Auto → ${actualModelLabel}`,
      actualRoute,
      automatic: true,
      choosing: false,
    };
  }
  const choosing = args.choosing === true;
  return {
    modelLabel: choosing ? "Auto → Choosing…" : "Auto → Awaiting first turn",
    actualRoute: null,
    automatic: true,
    choosing,
  };
}

export function providerDisplayName(provider: AppletModelProvider): string {
  return provider === "local"
    ? "LOCAL"
    : provider === "openai"
      ? "OpenAI"
      : "Anthropic";
}
