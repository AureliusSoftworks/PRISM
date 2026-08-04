export const REASONING_EFFORT_VALUES = [
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number];
export type RequestReasoningEffort = Exclude<ReasoningEffort, "auto">;
export type NativeReasoningEffortProvider = "local" | "openai" | "anthropic";
export type AnthropicRequestReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export const MODEL_REASONING_EFFORT_PREFERENCE_VALUES = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ModelReasoningEffortPreference =
  (typeof MODEL_REASONING_EFFORT_PREFERENCE_VALUES)[number];

/** Maximum wall time for one complete response attempt, including any
 * simulated preparation passes and the final visible generation. */
export function reasoningGenerationBudgetMs(
  value: unknown,
  model?: {
    provider: NativeReasoningEffortProvider;
    modelId: string;
  },
): number {
  const effort = normalizeReasoningEffort(value);
  if (effort === "xhigh") return 300_000;
  if (effort === "high") return 180_000;
  if (effort === "medium") return 120_000;
  if (effort === "auto") {
    const usesNativeReasoning = model
      ? model.provider === "openai"
        ? openAiModelSupportsReasoningEffort(model.modelId)
        : model.provider === "anthropic"
          ? anthropicModelSupportsReasoningEffort(model.modelId)
          : false
      : true;
    return usesNativeReasoning ? 180_000 : 60_000;
  }
  return 60_000;
}

/** AUTO may recover visibly, but must not turn one reply into an unbounded
 * sequence of long-running model attempts. */
export const REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS = 600_000;

export interface ModelReasoningEffortPreferenceV1 {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  effort: ModelReasoningEffortPreference;
  updatedAt?: string;
}

export interface ModelReasoningEffortCapabilityV1 {
  mode: "native" | "simulated" | "unavailable";
  levels: readonly ModelReasoningEffortPreference[];
  supportsNone: boolean;
  disabledReason?: string;
}

const OPENAI_BASE_REASONING_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const satisfies readonly ModelReasoningEffortPreference[];
const OPENAI_MODERN_REASONING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ModelReasoningEffortPreference[];
const OPENAI_GPT_5_1_REASONING_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ModelReasoningEffortPreference[];
const ANTHROPIC_REASONING_LEVELS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly ModelReasoningEffortPreference[];
const ANTHROPIC_XHIGH_REASONING_LEVELS = [
  ...ANTHROPIC_REASONING_LEVELS,
  "xhigh",
] as const satisfies readonly ModelReasoningEffortPreference[];
const LOCAL_SIMULATED_REASONING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ModelReasoningEffortPreference[];

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  if (typeof value !== "string") return "auto";
  const normalized = value.trim().toLowerCase();
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as ReasoningEffort)
    : "auto";
}

export function reasoningEffortForRequest(
  value: unknown
): RequestReasoningEffort | null {
  const normalized = normalizeReasoningEffort(value);
  return normalized === "auto" ? null : normalized;
}

export function normalizeModelReasoningEffortPreference(
  value: unknown,
): ModelReasoningEffortPreference | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "default") return null;
  return (
    MODEL_REASONING_EFFORT_PREFERENCE_VALUES as readonly string[]
  ).includes(normalized)
    ? (normalized as ModelReasoningEffortPreference)
    : null;
}

export function modelReasoningEffortPreferenceKey(
  provider: NativeReasoningEffortProvider,
  modelId: string,
): string {
  return `${provider}:${modelId.trim()}`;
}

export function openAiModelSupportsReasoningEffort(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("-search-api")) return false;
  if (normalized.endsWith("-chat-latest")) return false;
  if (/^(?:o1|o3|o4|o5)(?:-|$)/.test(normalized)) return true;
  return normalized.startsWith("gpt-5");
}

function openAiGpt5MinorVersion(modelId: string): number | null {
  const normalized = modelId.trim().toLowerCase();
  const match = normalized.match(/^gpt-5(?:\.(\d+))?(?:-|$)/);
  if (!match) return null;
  return Number(match[1] ?? 0);
}

function openAiModelIsFixedHigh(modelId: string): boolean {
  return /^gpt-5(?:\.\d+)?-pro(?:-|$)/.test(modelId.trim().toLowerCase());
}

export function openAiReasoningEffortLevels(
  modelId: string,
): readonly ModelReasoningEffortPreference[] {
  if (!openAiModelSupportsReasoningEffort(modelId)) return [];
  if (openAiModelIsFixedHigh(modelId)) return [];
  const minor = openAiGpt5MinorVersion(modelId);
  if (minor === 1) return OPENAI_GPT_5_1_REASONING_LEVELS;
  if (minor !== null && minor >= 2) return OPENAI_MODERN_REASONING_LEVELS;
  return OPENAI_BASE_REASONING_LEVELS;
}

export function openAiReasoningEffortForRequest(
  modelId: string,
  value: unknown,
): RequestReasoningEffort | null {
  const requested = reasoningEffortForRequest(value);
  if (!requested) return null;
  return openAiReasoningEffortLevels(modelId).includes(requested) ? requested : null;
}

type AnthropicModelVersion = {
  family: string;
  major: number;
  minor: number;
};

function anthropicModelVersion(modelId: string): AnthropicModelVersion | null {
  const normalized = modelId.trim().toLowerCase();
  const match = normalized.match(
    /^claude-([a-z0-9]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/
  );
  if (!match) return null;
  return {
    family: match[1] ?? "",
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
  };
}

export function anthropicModelSupportsReasoningEffort(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (normalized === "claude-mythos-preview") return true;
  const model = anthropicModelVersion(normalized);
  if (!model) return false;
  if (model.family === "opus") {
    return model.major > 4 || (model.major === 4 && model.minor >= 5);
  }
  if (model.family === "sonnet") {
    return model.major > 4 || (model.major === 4 && model.minor >= 6);
  }
  return (
    (model.family === "fable" || model.family === "mythos") &&
    model.major >= 5
  );
}

function anthropicModelSupportsXHighReasoningEffort(modelId: string): boolean {
  const model = anthropicModelVersion(modelId);
  if (!model) return false;
  if (model.family === "opus") {
    return model.major > 4 || (model.major === 4 && model.minor >= 7);
  }
  if (model.family === "sonnet") return model.major >= 5;
  return (
    (model.family === "fable" || model.family === "mythos") &&
    model.major >= 5
  );
}

function anthropicModelSupportsMaxReasoningEffort(modelId: string): boolean {
  if (!anthropicModelSupportsReasoningEffort(modelId)) return false;
  const model = anthropicModelVersion(modelId);
  return !(
    model?.family === "opus" &&
    model.major === 4 &&
    model.minor === 5
  );
}

export function modelSupportsNativeReasoningEffort(
  provider: NativeReasoningEffortProvider,
  modelId: string
): boolean {
  if (provider === "openai") return openAiModelSupportsReasoningEffort(modelId);
  if (provider === "anthropic") return anthropicModelSupportsReasoningEffort(modelId);
  return false;
}

export function resolveModelReasoningEffortCapability(args: {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  simulatedEffortEnabled?: boolean;
}): ModelReasoningEffortCapabilityV1 {
  if (args.provider === "local") {
    if (args.simulatedEffortEnabled === true) {
      return {
        mode: "simulated",
        levels: LOCAL_SIMULATED_REASONING_LEVELS,
        supportsNone: true,
      };
    }
    return {
      mode: "unavailable",
      levels: [],
      supportsNone: false,
      disabledReason:
        "Enable experimental simulated effort in Settings.",
    };
  }
  if (args.provider === "openai") {
    const levels = openAiReasoningEffortLevels(args.modelId);
    return levels.length > 0
      ? {
          mode: "native",
          levels,
          supportsNone: levels.includes("none"),
        }
      : args.simulatedEffortEnabled === true &&
          !openAiModelIsFixedHigh(args.modelId)
        ? {
            mode: "simulated",
            levels: LOCAL_SIMULATED_REASONING_LEVELS,
            supportsNone: true,
          }
        : {
            mode: "unavailable",
            levels: [],
            supportsNone: false,
            disabledReason: openAiModelIsFixedHigh(args.modelId)
              ? "This model uses a fixed reasoning effort."
              : "Enable experimental simulated effort in Settings.",
          };
  }
  if (anthropicModelSupportsReasoningEffort(args.modelId)) {
    const levels = anthropicModelSupportsXHighReasoningEffort(args.modelId)
      ? ANTHROPIC_XHIGH_REASONING_LEVELS
      : ANTHROPIC_REASONING_LEVELS;
    return {
      mode: "native",
      levels,
      supportsNone: false,
    };
  }
  if (args.simulatedEffortEnabled === true) {
    return {
      mode: "simulated",
      levels: LOCAL_SIMULATED_REASONING_LEVELS,
      supportsNone: true,
    };
  }
  return {
    mode: "unavailable",
    levels: [],
    supportsNone: false,
    disabledReason: "Enable experimental simulated effort in Settings.",
  };
}

export function effectiveModelReasoningEffort(args: {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  preference: unknown;
  simulatedEffortEnabled?: boolean;
}): ModelReasoningEffortPreference | null {
  const preference = normalizeModelReasoningEffortPreference(args.preference);
  if (!preference) return null;
  const capability = resolveModelReasoningEffortCapability(args);
  return capability.levels.includes(preference) ? preference : null;
}

export function anthropicReasoningEffortForRequest(
  modelId: string,
  value: unknown
): AnthropicRequestReasoningEffort | null {
  if (!anthropicModelSupportsReasoningEffort(modelId)) return null;
  const effort = reasoningEffortForRequest(value);
  if (!effort || effort === "none") return null;
  if (effort === "minimal") return "low";
  if (effort !== "xhigh") return effort;
  if (anthropicModelSupportsXHighReasoningEffort(modelId)) return "xhigh";
  if (anthropicModelSupportsMaxReasoningEffort(modelId)) return "max";
  return "high";
}
