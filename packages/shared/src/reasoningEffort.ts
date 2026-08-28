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
/** Provider-only overdrive. Never persisted or exposed as an ordinary ladder stop. */
export type MaxReasoningEffort = "max";
export type ProviderReasoningEffort = ReasoningEffort | MaxReasoningEffort;
export type NativeReasoningEffortProvider =
  | "local"
  | "ollama_cloud"
  | "openai"
  | "anthropic";
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

/**
 * Simulated-effort token and note budgets bake a thrifty “local Fast”
 * default into the ladder: lean at minimal/low/medium, richer at high/xhigh.
 * Native provider Fast (ONLINE service tier) remains a separate future control.
 *
 * Eval harnesses may temporarily select `legacy` to A/B against the pre-thrifty
 * budgets. Product runtime always uses `thrifty` unless an eval sets otherwise.
 */
/**
 * Full heavy simulated-effort Psychic spine (plan first, then text passes).
 * Legacy `revision` remains readable for older stored thoughts; new runs emit
 * `synthesis` instead.
 */
export const SIMULATED_EFFORT_PASS_NAMES = [
  "plan",
  "alternatives",
  "draft",
  "audit",
  "red_team",
  "constraint_lock",
  "revise_draft",
  "compliance_sweep",
  "synthesis",
  "revision",
] as const;

export type SimulatedEffortPassName = (typeof SIMULATED_EFFORT_PASS_NAMES)[number];

/** Private text passes after the initial Plan JSON (excludes plan + legacy revision). */
export type SimulatedEffortTextPassName = Exclude<
  SimulatedEffortPassName,
  "plan" | "revision"
>;

export type SimulatedEffortBudgetProfile = "thrifty" | "legacy";

/**
 * `standard` — product default for LOCAL models without native effort.
 * `deep` — experimental heavy spine (Alternatives → … → Compliance Sweep).
 */
export type SimulatedEffortLadderProfile = "standard" | "deep";

/** Lean product-default LOCAL simulated ladder. */
function standardSimulatedEffortLadderPasses(
  effort: ReasoningEffort,
): readonly SimulatedEffortPassName[] {
  switch (effort) {
    case "minimal":
    case "low":
      return ["plan"];
    case "medium":
      return ["plan", "audit"];
    case "high":
      return ["plan", "draft", "audit"];
    case "xhigh":
      return ["plan", "draft", "audit", "synthesis"];
    case "none":
    case "auto":
    default:
      return [];
  }
}

/**
 * Experimental deep ladder: heavy-from-Minimal. XHigh adds Compliance Sweep
 * before Synthesis.
 */
function deepSimulatedEffortLadderPasses(
  effort: ReasoningEffort,
): readonly SimulatedEffortPassName[] {
  switch (effort) {
    case "minimal":
      return ["plan", "alternatives", "draft"];
    case "low":
      return ["plan", "alternatives", "draft", "audit", "red_team"];
    case "medium":
      return [
        "plan",
        "alternatives",
        "draft",
        "audit",
        "red_team",
        "constraint_lock",
        "synthesis",
      ];
    case "high":
      return [
        "plan",
        "alternatives",
        "draft",
        "audit",
        "red_team",
        "constraint_lock",
        "revise_draft",
        "synthesis",
      ];
    case "xhigh":
      return [
        "plan",
        "alternatives",
        "draft",
        "audit",
        "red_team",
        "constraint_lock",
        "revise_draft",
        "compliance_sweep",
        "synthesis",
      ];
    case "none":
    case "auto":
    default:
      return [];
  }
}

export function normalizeSimulatedEffortLadderProfile(
  value: unknown,
): SimulatedEffortLadderProfile {
  return value === "deep" ? "deep" : "standard";
}

export function simulatedEffortLadderPasses(
  effort: ReasoningEffort,
  profile: SimulatedEffortLadderProfile = "standard",
): readonly SimulatedEffortPassName[] {
  return profile === "deep"
    ? deepSimulatedEffortLadderPasses(effort)
    : standardSimulatedEffortLadderPasses(effort);
}

/** Text passes after Plan for Chat Psychic simulation. */
export function simulatedEffortTextPasses(
  effort: ReasoningEffort,
  profile: SimulatedEffortLadderProfile = "standard",
): SimulatedEffortTextPassName[] {
  return simulatedEffortLadderPasses(effort, profile).filter(
    (pass): pass is SimulatedEffortTextPassName => pass !== "plan",
  );
}

let simulatedEffortBudgetProfile: SimulatedEffortBudgetProfile = "thrifty";

export function getSimulatedEffortBudgetProfile(): SimulatedEffortBudgetProfile {
  return simulatedEffortBudgetProfile;
}

/** Eval-only switch. Prefer `withSimulatedEffortBudgetProfile` for scoped runs. */
export function setSimulatedEffortBudgetProfile(
  profile: SimulatedEffortBudgetProfile,
): void {
  simulatedEffortBudgetProfile = profile;
}

export async function withSimulatedEffortBudgetProfile<T>(
  profile: SimulatedEffortBudgetProfile,
  run: () => Promise<T>,
): Promise<T> {
  const previous = simulatedEffortBudgetProfile;
  simulatedEffortBudgetProfile = profile;
  try {
    return await run();
  } finally {
    simulatedEffortBudgetProfile = previous;
  }
}

function resolveSimulatedEffortTier(
  value: unknown,
): Exclude<ReasoningEffort, "auto" | "none"> | null {
  const effort = normalizeReasoningEffort(value);
  if (effort === "auto" || effort === "none") return null;
  return effort;
}

/** Max tokens for one Coffee/Signal/Debate/Story private preparation pass. */
export function simulatedSurfacePreparationMaxTokens(value: unknown): number {
  const effort = resolveSimulatedEffortTier(value);
  if (simulatedEffortBudgetProfile === "legacy") {
    return effort === "minimal" ? 120 : 220;
  }
  switch (effort) {
    case "minimal":
      return 72;
    case "low":
      return 96;
    case "medium":
      return 140;
    case "high":
      return 220;
    case "xhigh":
      return 320;
    default:
      return 96;
  }
}

/** Cap retained private notes injected before the visible generation. */
export function simulatedSurfacePreparationNoteMaxChars(value: unknown): number {
  if (simulatedEffortBudgetProfile === "legacy") return 1_800;
  switch (resolveSimulatedEffortTier(value)) {
    case "minimal":
      return 480;
    case "low":
      return 640;
    case "medium":
      return 900;
    case "high":
      return 1_400;
    case "xhigh":
      return 1_800;
    default:
      return 640;
  }
}

/** Max tokens for Chat Psychic plan JSON (summary + scratchpad + guidance). */
export function simulatedPsychicPlanningMaxTokens(value: unknown): number {
  const effort = resolveSimulatedEffortTier(value);
  if (simulatedEffortBudgetProfile === "legacy") {
    switch (effort) {
      case "xhigh":
        return 900;
      case "high":
        return 720;
      case "medium":
        return 560;
      case "low":
        return 420;
      case "minimal":
        return 300;
      default:
        return 260;
    }
  }
  switch (effort) {
    case "minimal":
      // Room for valid plan JSON on small locals (gemma3:4b failed at 200).
      return 300;
    case "low":
      return 340;
    case "medium":
      return 400;
    case "high":
      return 720;
    case "xhigh":
      return 900;
    default:
      return 260;
  }
}

/** Max tokens for a Chat Psychic private text pass (after Plan). */
export function simulatedPsychicPrivatePassMaxTokens(
  value: unknown,
  passName: Exclude<SimulatedEffortPassName, "plan">,
): number {
  const effort = resolveSimulatedEffortTier(value);
  if (simulatedEffortBudgetProfile === "legacy") {
    switch (passName) {
      case "draft":
      case "revise_draft":
        return effort === "xhigh" ? 1_100 : 900;
      case "audit":
      case "red_team":
      case "compliance_sweep":
        return effort === "medium" ? 420 : effort === "xhigh" ? 760 : 620;
      case "alternatives":
      case "constraint_lock":
      case "synthesis":
      case "revision":
        return 760;
    }
  }
  switch (passName) {
    case "draft":
      return effort === "xhigh" ? 1_200 : effort === "high" ? 800 : 640;
    case "revise_draft":
      return effort === "xhigh" ? 1_400 : 900;
    case "audit":
    case "red_team":
      if (effort === "xhigh") return 800;
      if (effort === "high") return 520;
      if (effort === "medium") return 320;
      return 280;
    case "compliance_sweep":
      return effort === "xhigh" ? 900 : 520;
    case "alternatives":
      return effort === "xhigh" ? 700 : effort === "high" ? 520 : 360;
    case "constraint_lock":
      return effort === "xhigh" ? 480 : 320;
    case "synthesis":
    case "revision":
      return effort === "xhigh" ? 800 : 520;
  }
}

/** Soft cap on persisted/parsed Chat Psychic scratchpad text by effort. */
export function simulatedPsychicScratchpadMaxChars(value: unknown): number {
  if (simulatedEffortBudgetProfile === "legacy") return 4_000;
  switch (resolveSimulatedEffortTier(value)) {
    case "minimal":
      return 1_600;
    case "low":
      return 2_400;
    case "medium":
      return 3_600;
    case "high":
      return 5_200;
    case "xhigh":
      return 8_000;
    default:
      return 2_400;
  }
}

/** Soft cap on Chat Psychic answerGuidance text by effort. */
export function simulatedPsychicAnswerGuidanceMaxChars(value: unknown): number {
  if (simulatedEffortBudgetProfile === "legacy") return 1_400;
  switch (resolveSimulatedEffortTier(value)) {
    case "minimal":
      return 500;
    case "low":
      return 700;
    case "medium":
      return 900;
    case "high":
      return 1_200;
    case "xhigh":
      return 1_400;
    default:
      return 700;
  }
}

/** Soft cap on Chat Psychic private draft/audit/revision artifacts. */
export function simulatedPsychicPrivateArtifactMaxChars(value: unknown): number {
  if (simulatedEffortBudgetProfile === "legacy") return 3_200;
  switch (resolveSimulatedEffortTier(value)) {
    case "medium":
      return 1_600;
    case "high":
      return 2_400;
    case "xhigh":
      return 4_000;
    case "minimal":
      return 1_200;
    case "low":
      return 1_400;
    default:
      return 1_400;
  }
}

/** Whether prompt wording should ask for thrifty short private notes. */
export function simulatedEffortUsesThriftyPrompting(): boolean {
  return simulatedEffortBudgetProfile === "thrifty";
}

/** Maximum wall time for one complete response attempt, including any
 * simulated preparation passes and the final visible generation. */
export function reasoningGenerationBudgetMs(
  value: unknown,
  model?: {
    provider: NativeReasoningEffortProvider;
    modelId: string;
  },
): number {
  if (normalizeProviderReasoningEffort(value) === "max") return 600_000;
  const effort = normalizeReasoningEffort(value);
  // Heavy-from-Minimal ladder: more private passes need longer wall clocks.
  if (effort === "xhigh") return 480_000;
  if (effort === "high") return 360_000;
  if (effort === "medium") return 240_000;
  if (effort === "low") return 180_000;
  if (effort === "minimal") return 120_000;
  if (effort === "auto") {
    const usesNativeReasoning = model
      ? model.provider === "openai"
        ? openAiModelSupportsReasoningEffort(model.modelId)
        : model.provider === "anthropic"
          ? anthropicModelSupportsReasoningEffort(model.modelId)
          : false
      : true;
    return usesNativeReasoning ? 180_000 : 120_000;
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

export interface ModelTurboPreferenceV1 {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  turbo: true;
  updatedAt?: string;
}

/** Reserved persisted preference key for contextual ONLINE Auto Turbo. */
export const AUTO_MODEL_TURBO_PREFERENCE_ID = "__prism_auto_turbo__";

export function isAutoModelTurboPreferenceId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() === AUTO_MODEL_TURBO_PREFERENCE_ID
  );
}

function openAiPriorityModelFamily(
  modelId: string,
  family: string,
): boolean {
  return (
    modelId === family ||
    new RegExp(`^${family.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}-\\d{4}-\\d{2}-\\d{2}$`, "u").test(
      modelId,
    )
  );
}

/**
 * Models currently eligible for provider-native Turbo processing. Keep these
 * lists conservative: an unknown catalog entry should never receive a premium
 * tier request merely because its name resembles a supported family.
 */
export function modelSupportsTurboMode(
  provider: NativeReasoningEffortProvider,
  rawModelId: string,
): boolean {
  const modelId = rawModelId.trim().toLowerCase();
  if (!modelId) return false;
  if (provider === "anthropic") {
    return anthropicModelSupportsFastMode(modelId);
  }
  if (provider !== "openai") return false;
  return [
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-5.4",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5-mini",
    "gpt-5",
    "gpt-5.1-codex",
    "gpt-5-codex",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.1",
    "gpt-4o-mini",
    "gpt-4o",
    "o4-mini",
    "o3",
  ].some((family) => openAiPriorityModelFamily(modelId, family));
}

export interface ModelReasoningEffortCapabilityV1 {
  /**
   * `native-thinking` — Ollama model with its own trained chain-of-thought.
   * Default owns the model's native baseline. Models that accept `think: false`
   * also expose None; required-thinking families omit it.
   */
  mode: "native" | "native-thinking" | "simulated" | "unavailable";
  levels: readonly ModelReasoningEffortPreference[];
  supportsNone: boolean;
  /** Request-only native Max overdrive; deliberately absent from `levels`. */
  supportsMax: boolean;
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
const OPENAI_GPT_5_6_REASONING_LEVELS = [
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
/** Player-facing ladder for Ollama models whose thinking can be disabled. */
const OLLAMA_OPTIONAL_THINKING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
] as const satisfies readonly ModelReasoningEffortPreference[];
/** Player-facing ladder for Ollama families that cannot disable thinking. */
const OLLAMA_REQUIRED_THINKING_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const satisfies readonly ModelReasoningEffortPreference[];
/** Boolean-thinking models retain only None when simulation is unavailable. */
const OLLAMA_OPTIONAL_NATIVE_ONLY_LEVELS = [
  "none",
] as const satisfies readonly ModelReasoningEffortPreference[];
/** GPT-OSS has three provider-native tiers when simulation is unavailable. */
const OLLAMA_TIERED_NATIVE_ONLY_LEVELS = [
  "minimal",
  "low",
  "medium",
] as const satisfies readonly ModelReasoningEffortPreference[];

function normalizedOllamaModelId(modelId: string): string {
  return modelId
    .trim()
    .toLowerCase()
    .replace(/^ollama-cloud-direct:/u, "");
}

function ollamaModelMatchesFamily(modelId: string, family: string): boolean {
  const normalized = normalizedOllamaModelId(modelId);
  return normalized === family || normalized.startsWith(`${family}:`);
}

/**
 * Models whose published Ollama integration supports the native `think` flag.
 * Keep this deliberately narrow: daemon-discovered LOCAL models should use
 * their reported capability instead of inheriting a family-name guess.
 */
export function ollamaModelUsesTieredThinking(modelId: string): boolean {
  return ollamaModelMatchesFamily(modelId, "gpt-oss");
}

/**
 * Thinking families observed to ignore or reject a disabled-thinking state.
 * Keep this conservative and explicit: the generic Ollama `thinking`
 * capability alone does not say whether `think: false` is honored.
 */
function ollamaModelRequiresThinking(modelId: string): boolean {
  return ["gpt-oss", "kimi-k2.7-code", "nemotron-3-super"].some((family) =>
    ollamaModelMatchesFamily(modelId, family),
  );
}

export function ollamaModelIsKnownToSupportNativeThinking(modelId: string): boolean {
  return ollamaModelRequiresThinking(modelId);
}

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

export function normalizeProviderReasoningEffort(
  value: unknown,
): ProviderReasoningEffort {
  if (typeof value === "string" && value.trim().toLowerCase() === "max") {
    return "max";
  }
  return normalizeReasoningEffort(value);
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

export function openAiModelSupportsMaxReasoningEffort(
  modelId: string,
): boolean {
  return (
    openAiModelSupportsReasoningEffort(modelId) &&
    !openAiModelIsFixedHigh(modelId) &&
    openAiGpt5MinorVersion(modelId) === 6
  );
}

export function openAiReasoningEffortLevels(
  modelId: string,
): readonly ModelReasoningEffortPreference[] {
  if (!openAiModelSupportsReasoningEffort(modelId)) return [];
  if (openAiModelIsFixedHigh(modelId)) return [];
  const minor = openAiGpt5MinorVersion(modelId);
  if (minor === 1) return OPENAI_GPT_5_1_REASONING_LEVELS;
  if (minor === 6) return OPENAI_GPT_5_6_REASONING_LEVELS;
  if (minor !== null && minor >= 2) return OPENAI_MODERN_REASONING_LEVELS;
  return OPENAI_BASE_REASONING_LEVELS;
}

export function openAiReasoningEffortForRequest(
  modelId: string,
  value: unknown,
): RequestReasoningEffort | MaxReasoningEffort | null {
  if (normalizeProviderReasoningEffort(value) === "max") {
    return openAiModelSupportsMaxReasoningEffort(modelId) ? "max" : null;
  }
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
    /^claude-([a-z0-9]+)-(\d+)(?:-(\d+))?(?:-(\d{8}))?$/
  );
  if (!match) return null;
  const trailingNumber = match[3] ?? "";
  const minor = trailingNumber.length === 8 && !match[4]
    ? 0
    : Number(trailingNumber || 0);
  return {
    family: match[1] ?? "",
    major: Number(match[2]),
    minor,
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

/** Claude Fast mode is deliberately limited to exact Opus 4.8/5 aliases and snapshots. */
export function anthropicModelSupportsFastMode(modelId: string): boolean {
  const model = anthropicModelVersion(modelId);
  return (
    model?.family === "opus" &&
    ((model.major === 4 && model.minor === 8) ||
      (model.major === 5 && model.minor === 0))
  );
}

export function modelSupportsNativeReasoningEffort(
  provider: NativeReasoningEffortProvider,
  modelId: string
): boolean {
  if (provider === "openai") return openAiModelSupportsReasoningEffort(modelId);
  if (provider === "anthropic") return anthropicModelSupportsReasoningEffort(modelId);
  if (provider === "ollama_cloud") {
    return ollamaModelIsKnownToSupportNativeThinking(modelId);
  }
  return false;
}

export function resolveModelReasoningEffortCapability(args: {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  /** Pass `false` to make simulated Effort unavailable for non-native models. */
  simulatedEffortEnabled?: boolean;
  /** Ollama model reports its native `thinking` capability. */
  ollamaNativeThinking?: boolean;
  /** @deprecated Use `ollamaNativeThinking`; retained for persisted callers. */
  localNativeThinking?: boolean;
}): ModelReasoningEffortCapabilityV1 {
  const simulatedEnabled = args.simulatedEffortEnabled !== false;
  const reportedOllamaThinking =
    args.ollamaNativeThinking ?? args.localNativeThinking;
  const ollamaNativeThinking =
    reportedOllamaThinking === true ||
    (reportedOllamaThinking === undefined &&
      args.provider === "ollama_cloud" &&
      ollamaModelIsKnownToSupportNativeThinking(args.modelId));
  if (args.provider === "local" || args.provider === "ollama_cloud") {
    if (ollamaNativeThinking) {
      const requiredThinking = ollamaModelRequiresThinking(args.modelId);
      return {
        mode: "native-thinking",
        levels: simulatedEnabled
          ? requiredThinking
            ? OLLAMA_REQUIRED_THINKING_LEVELS
            : OLLAMA_OPTIONAL_THINKING_LEVELS
          : requiredThinking
            ? OLLAMA_TIERED_NATIVE_ONLY_LEVELS
            : OLLAMA_OPTIONAL_NATIVE_ONLY_LEVELS,
        supportsNone: !requiredThinking,
        supportsMax: false,
      };
    }
    if (simulatedEnabled) {
      return {
        mode: "simulated",
        levels: LOCAL_SIMULATED_REASONING_LEVELS,
        supportsNone: true,
        supportsMax: false,
      };
    }
    return {
      mode: "unavailable",
      levels: [],
      supportsNone: false,
      supportsMax: false,
      disabledReason: "Simulated Effort is disabled for this model.",
    };
  }
  if (args.provider === "openai") {
    const levels = openAiReasoningEffortLevels(args.modelId);
    return levels.length > 0
      ? {
          mode: "native",
          levels,
          supportsNone: levels.includes("none"),
          supportsMax: openAiModelSupportsMaxReasoningEffort(args.modelId),
        }
      : openAiModelIsFixedHigh(args.modelId)
        ? {
            mode: "unavailable",
            levels: [],
            supportsNone: false,
            supportsMax: false,
            disabledReason: "This model uses a fixed reasoning effort.",
          }
        : simulatedEnabled
          ? {
              mode: "simulated",
              levels: LOCAL_SIMULATED_REASONING_LEVELS,
              supportsNone: true,
              supportsMax: false,
            }
          : {
              mode: "unavailable",
              levels: [],
              supportsNone: false,
              supportsMax: false,
              disabledReason:
                "This model has no native thinking dial and simulated Effort is disabled.",
            };
  }
  if (anthropicModelSupportsReasoningEffort(args.modelId)) {
    const supportsNativeXHigh = anthropicModelSupportsXHighReasoningEffort(
      args.modelId,
    );
    const supportsNativeMax = anthropicModelSupportsMaxReasoningEffort(
      args.modelId,
    );
    const levels = supportsNativeXHigh || supportsNativeMax
      ? ANTHROPIC_XHIGH_REASONING_LEVELS
      : ANTHROPIC_REASONING_LEVELS;
    return {
      mode: "native",
      levels,
      supportsNone: false,
      supportsMax: supportsNativeXHigh && supportsNativeMax,
    };
  }
  return simulatedEnabled
    ? {
        mode: "simulated",
        levels: LOCAL_SIMULATED_REASONING_LEVELS,
        supportsNone: true,
        supportsMax: false,
      }
    : {
        mode: "unavailable",
        levels: [],
        supportsNone: false,
        supportsMax: false,
        disabledReason:
          "This model has no native thinking dial and simulated Effort is disabled.",
      };
}

export function effectiveModelReasoningEffort(args: {
  provider: NativeReasoningEffortProvider;
  modelId: string;
  preference: unknown;
  simulatedEffortEnabled?: boolean;
  /** Ollama model reports the native `thinking` capability. */
  ollamaNativeThinking?: boolean;
  /** @deprecated Use `ollamaNativeThinking`; retained for persisted callers. */
  localNativeThinking?: boolean;
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
  if (normalizeProviderReasoningEffort(value) === "max") {
    return anthropicModelSupportsMaxReasoningEffort(modelId) ? "max" : null;
  }
  const effort = reasoningEffortForRequest(value);
  if (!effort || effort === "none") return null;
  if (effort === "minimal") return "low";
  if (effort !== "xhigh") return effort;
  if (anthropicModelSupportsXHighReasoningEffort(modelId)) return "xhigh";
  if (anthropicModelSupportsMaxReasoningEffort(modelId)) return "max";
  return "high";
}
