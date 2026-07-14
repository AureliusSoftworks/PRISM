import {
  modelSupportsNativeReasoningEffort,
  type ReasoningEffort,
} from "@localai/shared";

export type ChatZenReasoningEffortProvider = "local" | "openai" | "anthropic";

export type ChatZenReasoningEffortAvailability = {
  visible: true;
  enabled: boolean;
  disabledReason?: string;
};

const AUTO_MODEL_CHOICE = "auto";

export function resolveChatZenReasoningEffortAvailability({
  provider,
  modelChoice,
  experimentalAllModelEffortEnabled = false,
}: {
  provider: ChatZenReasoningEffortProvider;
  modelChoice: string;
  experimentalAllModelEffortEnabled?: boolean;
}): ChatZenReasoningEffortAvailability {
  if (provider === "local") {
    return experimentalAllModelEffortEnabled
      ? { visible: true, enabled: true }
      : {
          visible: true,
          enabled: false,
          disabledReason: "Enable experimental simulated effort for local models.",
        };
  }

  if (
    modelChoice !== AUTO_MODEL_CHOICE &&
    modelSupportsNativeReasoningEffort(provider, modelChoice)
  ) {
    return { visible: true, enabled: true };
  }

  if (modelChoice === AUTO_MODEL_CHOICE) {
    return {
      visible: true,
      enabled: false,
      disabledReason: "Choose a reasoning-capable online model to set effort.",
    };
  }

  return {
    visible: true,
    enabled: false,
    disabledReason: "This online model does not support native effort.",
  };
}

export function reasoningEffortForSend(
  provider: ChatZenReasoningEffortProvider,
  modelOverride: string | undefined,
  effort: ReasoningEffort,
  experimentalAllModelEffortEnabled = false
): ReasoningEffort | undefined {
  if (effort === "auto" || effort === "none") return undefined;
  if (provider === "local") {
    return experimentalAllModelEffortEnabled ? effort : undefined;
  }
  if (!modelOverride) return undefined;
  return modelSupportsNativeReasoningEffort(provider, modelOverride)
    ? effort
    : undefined;
}
