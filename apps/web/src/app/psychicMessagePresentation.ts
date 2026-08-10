import type {
  AutoRecoveryTraceV1,
  AutoRouteDecisionV1,
  PsychicThoughtPayload,
  ReasoningEffort,
} from "@localai/shared";

export interface PsychicPresentationMessageLike {
  role: string;
  model?: string;
  psychicThought?: PsychicThoughtPayload;
  autoRecovery?: AutoRecoveryTraceV1;
  autoRoute?: AutoRouteDecisionV1;
  turbo?: boolean;
}

export interface AssistantGenerationMetadata {
  model: string;
  effort: ReasoningEffort;
  automatic: boolean;
  turbo: boolean;
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
  const concreteModel =
    assistant.model?.trim() ||
    assistant.autoRoute?.model.trim() ||
    psychicSource?.psychicThought?.model?.trim() ||
    "Model not recorded";
  const automatic = assistant.autoRoute !== undefined;
  return {
    model: automatic ? `${concreteModel} [auto]` : concreteModel,
    effort: assistant.autoRecovery
      ? "none"
      : (assistant.autoRoute?.reasoningEffort ??
        psychicSource?.psychicThought?.effort ??
        "auto"),
    automatic,
    turbo: assistant.turbo === true,
  };
}
