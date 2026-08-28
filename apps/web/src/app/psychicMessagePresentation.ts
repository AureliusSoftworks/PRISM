import type {
  AutoRecoveryTraceV1,
  AutoRouteDecisionV1,
  PsychicThoughtPayload,
  ProviderReasoningEffort,
} from "@localai/shared";
import {
  finalActualAppletRoute,
  providerDisplayName,
  type ActualAppletRoute,
} from "./autoRoutePresentation.ts";

export interface PsychicPresentationMessageLike {
  role: string;
  provider?: "local" | "ollama_cloud" | "openai" | "anthropic";
  model?: string;
  psychicThought?: PsychicThoughtPayload;
  autoRecovery?: AutoRecoveryTraceV1;
  autoRoute?: AutoRouteDecisionV1;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  /** A Ready Power supplied the response rather than a language model. */
  botPowerExactResponse?: unknown;
}

export interface AssistantGenerationMetadata {
  model: string;
  effort: ProviderReasoningEffort;
  automatic: boolean;
  turbo: boolean;
  recovered: boolean;
  recoveryAttemptCount: number;
}

export function psychicSourceForAssistantMessage<
  T extends PsychicPresentationMessageLike,
>(messages: readonly T[], assistantIndex: number): T | null {
  const assistant = messages[assistantIndex];
  if (!assistant || assistant.role !== "assistant") return null;
  if (assistant.psychicThought) return assistant;

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate) continue;
    if (candidate.role === "assistant") return null;
    if (candidate.role === "user") {
      return candidate.psychicThought ? candidate : null;
    }
  }
  return null;
}

export function assistantGenerationMetadata(
  assistant: PsychicPresentationMessageLike,
  psychicSource: PsychicPresentationMessageLike | null,
): AssistantGenerationMetadata | null {
  if (assistant.role !== "assistant") return null;
  // Deterministic/power authored replies are assistant-shaped but not model
  // generations. Do not invent provenance for them.
  if ("botPowerExactResponse" in assistant && assistant.botPowerExactResponse) {
    return null;
  }
  const provider =
    assistant.autoRecovery?.finalProvider ??
    assistant.provider ??
    assistant.autoRoute?.provider ??
    psychicSource?.psychicThought?.provider;
  if (
    provider !== "local" &&
    provider !== "ollama_cloud" &&
    provider !== "openai" &&
    provider !== "anthropic"
  ) {
    return null;
  }
  const route = finalActualAppletRoute({
    provider,
    model:
      assistant.autoRecovery?.finalModel ??
      assistant.model ??
      assistant.autoRoute?.model ??
      psychicSource?.psychicThought?.model ??
      "",
    autoRoute: assistant.autoRoute,
    autoRecovery: assistant.autoRecovery,
    turbo: assistant.turbo,
  } satisfies ActualAppletRoute);
  if (!route) return null;
  const automatic = assistant.autoRoute !== undefined;
  return {
    model: `${automatic ? "Auto → " : ""}${providerDisplayName(route.provider)} · ${route.model}`,
    // Recovery attempts intentionally use the fast no-reasoning fallback.
    // This annotation is frozen with the turn, never inferred from a later
    // route preference.
    effort: assistant.autoRecovery
      ? "none"
      : (assistant.autoRoute?.reasoningEffort ??
        assistant.reasoningEffort ??
        psychicSource?.psychicThought?.effort ??
        "auto"),
    automatic,
    turbo: route.turbo === true,
    recovered: assistant.autoRecovery !== undefined,
    recoveryAttemptCount: assistant.autoRecovery?.attempts.length ?? 0,
  };
}
