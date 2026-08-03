import type { PsychicThoughtPayload, ReasoningEffort } from "@localai/shared";

export interface PsychicPresentationMessageLike {
  role: string;
  model?: string;
  psychicThought?: PsychicThoughtPayload;
}

export interface AssistantGenerationMetadata {
  model: string;
  effort: ReasoningEffort | null;
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
  const model =
    assistant.model?.trim() || psychicSource?.psychicThought?.model?.trim() || "";
  if (!model && !psychicSource?.psychicThought?.effort) return null;
  return {
    model: model || "Model not recorded",
    effort: psychicSource?.psychicThought?.effort ?? null,
  };
}
