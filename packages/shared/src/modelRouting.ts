/**
 * Auto model resolution — shared by the API and the web composer so labels match
 * what the server actually runs.
 */

import {
  modelSupportsTurboMode,
  resolveModelReasoningEffortCapability,
  type ModelReasoningEffortPreference,
} from "./reasoningEffort.ts";

export const REQUIRED_LOCAL_MODELS = {
  chat: "llama3.2",
  embedding: "nomic-embed-text",
} as const;

export const REQUIRED_PRIMARY_LOCAL_MODEL_ID = REQUIRED_LOCAL_MODELS.chat;
export const DISABLED_MODEL_CHOICE = "disabled";
const REQUIRED_VISIBLE_LOCAL_MODEL_ID_SET = new Set<string>([REQUIRED_PRIMARY_LOCAL_MODEL_ID]);

export type AutoModelProvider =
  | "local"
  | "ollama_cloud"
  | "openai"
  | "anthropic";
export type ResponseLane = "local" | "online";

export const AUTO_MODEL_ROUTING_POLICY_VERSION = 1 as const;

export type ModelSelectionV1 =
  | { kind: "auto" }
  | { kind: "fixed"; provider: AutoModelProvider; modelId: string };

export type AutoRouteReasonCode =
  | "light_request"
  | "standard_request"
  | "deep_request"
  | "structured_output"
  | "tool_use"
  | "research"
  | "long_context"
  | "high_stakes"
  | "surface_complexity"
  | "known_cost_preferred"
  | "only_viable_candidate";

export interface AutoRoutingContextV1 {
  surface?: string;
  inputText?: string;
  inputTokens?: number;
  outputTokens?: number;
  structuredOutput?: boolean;
  toolUse?: boolean;
  research?: boolean;
  highStakes?: boolean;
  simulatedEffortEnabled?: boolean;
}

export interface AutoRouteDecisionV1 {
  v: typeof AUTO_MODEL_ROUTING_POLICY_VERSION;
  lane: ResponseLane;
  provider: AutoModelProvider;
  model: string;
  reasoningEffort: ModelReasoningEffortPreference;
  reasonCodes: AutoRouteReasonCode[];
}

export function normalizeAutoRouteDecisionV1(
  value: unknown,
): AutoRouteDecisionV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.v !== AUTO_MODEL_ROUTING_POLICY_VERSION) return undefined;
  if (record.lane !== "local" && record.lane !== "online") return undefined;
  if (
    record.provider !== "local" &&
    record.provider !== "ollama_cloud" &&
    record.provider !== "openai" &&
    record.provider !== "anthropic"
  ) {
    return undefined;
  }
  const model =
    typeof record.model === "string" ? record.model.trim().slice(0, 240) : "";
  if (!model) return undefined;
  const reasoningEffort =
    typeof record.reasoningEffort === "string" &&
    ["none", "minimal", "low", "medium", "high", "xhigh"].includes(
      record.reasoningEffort,
    )
      ? (record.reasoningEffort as ModelReasoningEffortPreference)
      : null;
  if (!reasoningEffort || !Array.isArray(record.reasonCodes)) return undefined;
  const allowedReasons = new Set<AutoRouteReasonCode>([
    "light_request",
    "standard_request",
    "deep_request",
    "structured_output",
    "tool_use",
    "research",
    "long_context",
    "high_stakes",
    "surface_complexity",
    "known_cost_preferred",
    "only_viable_candidate",
  ]);
  const reasonCodes = record.reasonCodes.filter(
    (reason): reason is AutoRouteReasonCode =>
      typeof reason === "string" &&
      allowedReasons.has(reason as AutoRouteReasonCode),
  );
  if (reasonCodes.length === 0) return undefined;
  return {
    v: AUTO_MODEL_ROUTING_POLICY_VERSION,
    lane: record.lane,
    provider: record.provider,
    model,
    reasoningEffort,
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}

export interface AutoModelPriceV1 {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const MODEL_VISIBILITY_DEFAULTS_VERSION = 6;

/** ONLINE Auto: -1 max OpenAI lean, 0 balanced, +1 max Anthropic lean. */
export const ONLINE_AUTO_PROVIDER_BIAS_MIN = -1;
export const ONLINE_AUTO_PROVIDER_BIAS_MAX = 1;
export const ONLINE_AUTO_PROVIDER_BIAS_DEFAULT = 0;
/**
 * Soft ranking nudge at full lean — on the order of one latency step so
 * near-ties flip, but clearly cheaper/faster other-provider models still win.
 */
export const ONLINE_AUTO_PROVIDER_BIAS_WEIGHT = 10_000;

export const ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION = 1 as const;
export type OnlineAutoProviderId = "openai" | "anthropic" | "ollama_cloud";
export interface OnlineAutoProviderWeightsV1 {
  v: typeof ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION;
  openai: number;
  anthropic: number;
  ollama_cloud: number;
}
export const BALANCED_ONLINE_AUTO_PROVIDER_WEIGHTS: OnlineAutoProviderWeightsV1 = {
  v: ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION,
  openai: 1 / 3,
  anthropic: 1 / 3,
  ollama_cloud: 1 / 3,
};

/** Normalize persisted/UI weights, using the old two-provider lean as migration input. */
export function normalizeOnlineAutoProviderWeights(
  value: unknown,
  legacyBias?: unknown,
): OnlineAutoProviderWeightsV1 {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const raw = (["openai", "anthropic", "ollama_cloud"] as const).map((key) =>
      typeof record[key] === "number" && Number.isFinite(record[key])
        ? Math.max(0, record[key] as number)
        : 0,
    );
    const total = raw.reduce((sum, weight) => sum + weight, 0);
    if (total > 0) {
      return {
        v: ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION,
        openai: raw[0] / total,
        anthropic: raw[1] / total,
        ollama_cloud: raw[2] / total,
      };
    }
  }
  if (typeof legacyBias === "number" && Number.isFinite(legacyBias)) {
    const bias = clampOnlineAutoProviderBias(legacyBias);
    return {
      v: ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION,
      openai: (1 - bias) / 3,
      anthropic: (1 + bias) / 3,
      ollama_cloud: 1 / 3,
    };
  }
  return { ...BALANCED_ONLINE_AUTO_PROVIDER_WEIGHTS };
}

export function parseStoredOnlineAutoProviderWeights(
  value: unknown,
  legacyBias?: unknown,
): OnlineAutoProviderWeightsV1 {
  if (typeof value !== "string") {
    return normalizeOnlineAutoProviderWeights(value, legacyBias);
  }
  try {
    return normalizeOnlineAutoProviderWeights(JSON.parse(value), legacyBias);
  } catch {
    return normalizeOnlineAutoProviderWeights(null, legacyBias);
  }
}

export function serializeOnlineAutoProviderWeights(value: unknown): string {
  return JSON.stringify(normalizeOnlineAutoProviderWeights(value));
}

export function formatOnlineAutoProviderWeightsLabel(value: unknown): string {
  const weights = normalizeOnlineAutoProviderWeights(value);
  const rounded = [
    Math.round(weights.openai * 100),
    Math.round(weights.anthropic * 100),
    Math.round(weights.ollama_cloud * 100),
  ];
  const delta = 100 - rounded.reduce((sum, weight) => sum + weight, 0);
  rounded[rounded.indexOf(Math.max(...rounded))] += delta;
  return `OpenAI ${rounded[0]}% · Anthropic ${rounded[1]}% · Ollama Cloud ${rounded[2]}%`;
}

/** Minimal catalog shape: only model ids are read. */
export interface CatalogShapeForAuto {
  local: readonly { id: string }[];
  online: readonly {
    id: string;
    provider?: AutoModelProvider;
    supportsStructuredOutput?: boolean;
  }[];
}

export interface ResolveAutoModelInput {
  provider: AutoModelProvider;
  lane?: ResponseLane;
  explicitModelOverride?: string | null;
  /** @deprecated Account defaults no longer participate in contextual Auto. */
  preferredModel?: string | null;
  hiddenModelIds: string[];
  catalog: CatalogShapeForAuto;
  /**
   * Soft ONLINE Auto lean between OpenAI (-1) and Anthropic (+1).
   * Ignored for LOCAL. Clamped to [-1, 1]; default 0 = neutrality.
   */
  onlineAutoProviderBias?: number | null;
  /** Server-authoritative three-provider ONLINE Auto preference. */
  onlineAutoProviderWeights?: OnlineAutoProviderWeightsV1 | null;
  routingContext?: AutoRoutingContextV1;
  /** Restrict contextual ONLINE Auto to models eligible for Turbo. */
  turboOnly?: boolean;
  priceForModel?: (
    provider: AutoModelProvider,
    modelId: string,
  ) => AutoModelPriceV1 | null;
}

export function clampOnlineAutoProviderBias(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ONLINE_AUTO_PROVIDER_BIAS_DEFAULT;
  }
  return Math.min(
    ONLINE_AUTO_PROVIDER_BIAS_MAX,
    Math.max(ONLINE_AUTO_PROVIDER_BIAS_MIN, value),
  );
}

/** Human label for Settings / status chrome. */
export function formatOnlineAutoProviderBiasLabel(value: unknown): string {
  const bias = clampOnlineAutoProviderBias(value);
  if (Math.abs(bias) < 0.05) return "Balanced";
  const percent = Math.round(Math.abs(bias) * 100);
  return bias < 0 ? `Lean OpenAI ${percent}%` : `Lean Anthropic ${percent}%`;
}

function providerBiasScoreDelta(
  provider: AutoModelProvider,
  bias: number,
): number {
  if (bias === 0 || provider === "local") return 0;
  if (provider === "openai") return bias * ONLINE_AUTO_PROVIDER_BIAS_WEIGHT;
  if (provider === "anthropic") return -bias * ONLINE_AUTO_PROVIDER_BIAS_WEIGHT;
  return 0;
}

function providerWeightScoreDelta(
  provider: AutoModelProvider,
  weights: OnlineAutoProviderWeightsV1,
): number {
  if (provider === "local") return 0;
  if (weights[provider] <= Number.EPSILON) {
    return Number.MAX_SAFE_INTEGER / 8;
  }
  return (1 / 3 - weights[provider]) * ONLINE_AUTO_PROVIDER_BIAS_WEIGHT * 3;
}

export interface ResolvedAutoModel {
  provider: AutoModelProvider;
  model: string;
  usedRequiredLocalFallback: boolean;
  autoRoute?: AutoRouteDecisionV1;
}

export interface ModelForDefaultVisibility {
  id: string;
  provider?: AutoModelProvider;
}

export function isDisabledModelChoice(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === DISABLED_MODEL_CHOICE;
}

const COMMON_OPENAI_CHAT_MODEL_PATTERNS = [
  /^gpt-5(?:\.\d+)?(?:-(?:mini|chat-latest|sol|terra|luna))?$/,
  /^gpt-4\.1(?:-mini)?$/,
  /^gpt-4o(?:-mini)?$/,
  /^chatgpt-4o-latest$/,
  /^o3(?:-mini)?$/,
  /^o4-mini$/,
  /^o5(?:-mini)?$/,
] as const;

const COMMON_ANTHROPIC_CHAT_MODEL_PATTERNS = [
  /^claude-(?:sonnet|opus|haiku)-4(?:-\d+)?$/,
  /^claude-3-5-sonnet-latest$/,
] as const;

function isModelIdHiddenByDefaultForNonChatUse(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;

  if (/\bembedding\b/.test(id) || /\bembed\b/.test(id)) {
    return true;
  }

  return (
    /\bllava\b/.test(id) ||
    /\bbakllava\b/.test(id) ||
    /\bmoondream\b/.test(id) ||
    /\bminicpm-v\b/.test(id) ||
    /\bqwen[^\w]*(?:2\.?\d*-)?vl\b/.test(id) ||
    /\bllama[^\w]*[^\s]*vision\b/.test(id) ||
    /\b(?:llama|gemma)[^\w]*[^\s:-]*-vision\b/.test(id) ||
    /\bvision\b/.test(id) ||
    /\bvl-?\d/.test(id)
  );
}

export function sanitizeHiddenModelIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => !REQUIRED_VISIBLE_LOCAL_MODEL_ID_SET.has(id))
    )
  );
}

export function isCommonOnlineChatModel(model: ModelForDefaultVisibility): boolean {
  const provider = model.provider ?? "openai";
  if (provider === "local") return true;
  const normalized = model.id.trim().toLowerCase();
  if (!normalized) return false;
  if (isModelIdHiddenByDefaultForNonChatUse(normalized)) return false;
  if (
    normalized.includes("preview") ||
    normalized.includes("search") ||
    normalized.includes("codex") ||
    normalized.includes("pro") ||
    /(?:^|[-_])test(?:$|[-_])/.test(normalized) ||
    normalized.includes("eval") ||
    normalized.includes("experimental") ||
    normalized.includes("snapshot") ||
    /-\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    /-\d{8}$/.test(normalized)
  ) {
    return false;
  }
  if (provider === "ollama_cloud") return true;
  const patterns =
    provider === "anthropic"
      ? COMMON_ANTHROPIC_CHAT_MODEL_PATTERNS
      : COMMON_OPENAI_CHAT_MODEL_PATTERNS;
  return patterns.some((pattern) => pattern.test(normalized));
}

export function defaultHiddenModelIdsForCatalog(catalog: {
  local?: readonly ModelForDefaultVisibility[];
  online: readonly ModelForDefaultVisibility[];
}): string[] {
  return sanitizeHiddenModelIds(
    [
      ...(catalog.local ?? []).filter((model) =>
        isModelIdHiddenByDefaultForNonChatUse(model.id)
      ),
      ...catalog.online.filter((model) => !isCommonOnlineChatModel(model)),
    ]
      .map((model) => model.id)
  );
}

export function reconcileHiddenModelIdsForCatalog(
  ids: string[],
  catalog: {
    local?: readonly ModelForDefaultVisibility[];
    online: readonly ModelForDefaultVisibility[];
  }
): string[] {
  const defaultHidden = new Set(defaultHiddenModelIdsForCatalog(catalog));
  const catalogIds = new Set(
    [...(catalog.local ?? []), ...catalog.online]
      .map((model) => model.id.trim())
      .filter(Boolean)
  );
  return sanitizeHiddenModelIds(ids).filter(
    (id) => !catalogIds.has(id) || defaultHidden.has(id)
  );
}

function laneCatalogModels(
  catalog: CatalogShapeForAuto,
  lane: ResponseLane,
): Array<{
  id: string;
  provider: AutoModelProvider;
  supportsStructuredOutput?: boolean;
}> {
  if (lane === "local") {
    return catalog.local.map((model) => ({ id: model.id, provider: "local" }));
  }
  return catalog.online.map((model) => ({
    id: model.id,
    provider: model.provider ?? "openai",
    supportsStructuredOutput: model.supportsStructuredOutput,
  }));
}

function inferOnlineProviderFromModelId(modelId: string): Exclude<AutoModelProvider, "local"> | null {
  const normalized = modelId.trim().toLowerCase();
  if (
    normalized.startsWith("ollama-cloud-direct:") ||
    normalized.endsWith(":cloud") ||
    normalized.endsWith("-cloud")
  ) {
    return "ollama_cloud";
  }
  if (normalized.startsWith("claude-")) return "anthropic";
  if (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "openai";
  }
  return null;
}

function catalogProviderForModel(
  catalog: CatalogShapeForAuto,
  modelId: string
): AutoModelProvider | null {
  if (catalog.local.some((model) => model.id === modelId)) {
    return "local";
  }
  const online = catalog.online.find((model) => model.id === modelId);
  return online?.provider ?? (online ? "openai" : null);
}

function providerForCandidateModel(
  requestedProvider: AutoModelProvider,
  catalog: CatalogShapeForAuto,
  modelId: string
): AutoModelProvider | null {
  const catalogProvider = catalogProviderForModel(catalog, modelId);
  const inferredProvider = catalogProvider ?? inferOnlineProviderFromModelId(modelId);

  if (requestedProvider === "local") {
    return inferredProvider === null || inferredProvider === "local" ? "local" : null;
  }

  if (inferredProvider === "local") {
    return null;
  }
  return inferredProvider ?? requestedProvider;
}

function firstVisibleRoutableModel(
  ids: string[],
  hidden: Set<string>,
  requestedProvider: AutoModelProvider,
  catalog: CatalogShapeForAuto
): { provider: AutoModelProvider; model: string } | null {
  for (const rawId of ids) {
    const model = rawId.trim();
    if (!model || hidden.has(model)) continue;
    const provider = providerForCandidateModel(requestedProvider, catalog, model);
    if (provider) return { provider, model };
  }
  return null;
}

const ROUTING_EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ModelReasoningEffortPreference[];

function estimatedInputTokens(context: AutoRoutingContextV1 | undefined): number {
  if (typeof context?.inputTokens === "number" && Number.isFinite(context.inputTokens)) {
    return Math.max(0, Math.round(context.inputTokens));
  }
  return Math.ceil((context?.inputText?.trim().length ?? 0) / 4);
}

function routingComplexity(context: AutoRoutingContextV1 | undefined): {
  score: number;
  reasons: AutoRouteReasonCode[];
} {
  let score = 0;
  const reasons: AutoRouteReasonCode[] = [];
  const inputTokens = estimatedInputTokens(context);
  if (inputTokens >= 8_000) {
    score += 2;
    reasons.push("long_context");
  } else if (inputTokens >= 2_000) {
    score += 1;
    reasons.push("long_context");
  }
  if (context?.structuredOutput) {
    score += 1;
    reasons.push("structured_output");
  }
  if (context?.toolUse) {
    score += 1;
    reasons.push("tool_use");
  }
  if (context?.research) {
    score += 2;
    reasons.push("research");
  }
  if (context?.highStakes) {
    score += 2;
    reasons.push("high_stakes");
  }
  if (/^(?:debate|signal|story|slate|continuity)$/u.test(context?.surface ?? "")) {
    score += 1;
    reasons.push("surface_complexity");
  }
  reasons.unshift(score <= 0 ? "light_request" : score <= 2 ? "standard_request" : "deep_request");
  return { score, reasons };
}

function modelSizeBillions(modelId: string): number | null {
  const normalized = modelId.trim().toLowerCase();
  const match = normalized.match(/(?:^|[-_:])([0-9]+(?:\.[0-9]+)?)b(?:$|[-_:])/u);
  return match ? Number(match[1]) : null;
}

function routingProfile(provider: AutoModelProvider, modelId: string): {
  capability: number;
  latency: number;
  known: boolean;
} {
  const id = modelId.trim().toLowerCase();
  if (provider === "local") {
    const size = modelSizeBillions(id);
    if (size !== null) {
      if (size <= 4) return { capability: 1, latency: 1, known: true };
      if (size <= 10) return { capability: 2, latency: 2, known: true };
      if (size <= 35) return { capability: 3, latency: 3, known: true };
      return { capability: 4, latency: 4, known: true };
    }
    if (/llama3\.2|gemma3|qwen/u.test(id)) {
      return { capability: 2, latency: 2, known: true };
    }
    return { capability: 2, latency: 5, known: false };
  }
  if (/nano|haiku|4o-mini/u.test(id)) {
    return { capability: 1, latency: 1, known: true };
  }
  if (/mini|luna/u.test(id)) {
    return { capability: 2, latency: 2, known: true };
  }
  if (/fable|mythos/u.test(id)) {
    return { capability: 4, latency: 5, known: true };
  }
  if (/opus|pro|sol|(?:^|-)o[345](?:-|$)/u.test(id)) {
    return { capability: 4, latency: 4, known: true };
  }
  if (/sonnet|terra|gpt-5|gpt-4\.1|gpt-4o/u.test(id)) {
    return { capability: 3, latency: 3, known: true };
  }
  return { capability: 2, latency: 5, known: false };
}

function clampAutoEffort(args: {
  provider: AutoModelProvider;
  modelId: string;
  target: ModelReasoningEffortPreference;
  simulatedEffortEnabled: boolean;
}): ModelReasoningEffortPreference {
  const capability = resolveModelReasoningEffortCapability({
    provider: args.provider,
    modelId: args.modelId,
    simulatedEffortEnabled: args.simulatedEffortEnabled,
  });
  if (capability.mode === "unavailable" || capability.levels.length === 0) {
    return "none";
  }
  const targetIndex = Math.max(
    0,
    Math.min(
      ROUTING_EFFORT_ORDER.length - 1,
      ROUTING_EFFORT_ORDER.indexOf(
        args.target as (typeof ROUTING_EFFORT_ORDER)[number],
      ),
    ),
  );
  const supported = capability.levels.filter(
    (level): level is (typeof ROUTING_EFFORT_ORDER)[number] =>
      ROUTING_EFFORT_ORDER.includes(
        level as (typeof ROUTING_EFFORT_ORDER)[number],
      ),
  );
  const atOrBelow = supported.filter(
    (level) => ROUTING_EFFORT_ORDER.indexOf(level) <= targetIndex,
  );
  return atOrBelow.at(-1) ?? supported[0] ?? "none";
}

function contextualAutoRoute(input: ResolveAutoModelInput): AutoRouteDecisionV1 | null {
  const lane: ResponseLane = input.lane ?? (input.provider === "local" ? "local" : "online");
  const hidden = new Set(sanitizeHiddenModelIds(input.hiddenModelIds));
  const candidates = laneCatalogModels(input.catalog, lane)
    .map((candidate) => ({ ...candidate, id: candidate.id.trim() }))
    .filter(
      (candidate) =>
        candidate.id &&
        !hidden.has(candidate.id) &&
        (!input.routingContext?.structuredOutput ||
          candidate.supportsStructuredOutput !== false) &&
        (!input.turboOnly || modelSupportsTurboMode(candidate.provider, candidate.id)),
    );
  if (candidates.length === 0) return null;

  const complexity = routingComplexity(input.routingContext);
  const capabilityFloor = complexity.score <= 0 ? 1 : complexity.score <= 2 ? 2 : complexity.score <= 4 ? 3 : 4;
  const profiled = candidates.map((candidate) => ({
    ...candidate,
    profile: routingProfile(candidate.provider, candidate.id),
  }));
  const capable = profiled.filter((candidate) => candidate.profile.capability >= capabilityFloor);
  const viable = capable.length > 0
    ? capable
    : profiled.filter(
        (candidate) => candidate.profile.capability === Math.max(...profiled.map((entry) => entry.profile.capability)),
      );
  const inputTokens = estimatedInputTokens(input.routingContext);
  const outputTokens = Math.max(1, Math.round(input.routingContext?.outputTokens ?? 800));
  // Provider weights apply only inside the ONLINE lane. The legacy scalar is
  // retained solely as a migration input when no weight object is present.
  const providerBias =
    lane === "online"
      ? clampOnlineAutoProviderBias(input.onlineAutoProviderBias)
      : ONLINE_AUTO_PROVIDER_BIAS_DEFAULT;
  const providerWeights = normalizeOnlineAutoProviderWeights(
    input.onlineAutoProviderWeights,
    providerBias,
  );
  const ranked = viable
    .map((candidate) => {
      const price = input.priceForModel?.(candidate.provider, candidate.id) ?? null;
      const estimatedCost = price
        ? inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion
        : candidate.provider === "local"
          ? 0
          : Number.MAX_SAFE_INTEGER / 4;
      return {
        ...candidate,
        price,
        score:
          estimatedCost +
          candidate.profile.latency * 10_000 +
          (candidate.profile.known ? 0 : 1_000_000_000) +
          (input.onlineAutoProviderWeights
            ? providerWeightScoreDelta(candidate.provider, providerWeights)
            : providerBiasScoreDelta(candidate.provider, providerBias)),
      };
    })
    .sort((left, right) =>
      left.score - right.score ||
      left.provider.localeCompare(right.provider) ||
      left.id.localeCompare(right.id),
    );
  const selected = ranked[0];
  if (!selected) return null;
  const targetEffort: ModelReasoningEffortPreference =
    complexity.score <= 0
      ? "none"
      : complexity.score <= 2
        ? "low"
        : complexity.score <= 4
          ? "medium"
          : complexity.score <= 6
            ? "high"
            : "xhigh";
  const reasonCodes = [...complexity.reasons];
  if (selected.price) reasonCodes.push("known_cost_preferred");
  if (ranked.length === 1) reasonCodes.push("only_viable_candidate");
  return {
    v: AUTO_MODEL_ROUTING_POLICY_VERSION,
    lane,
    provider: selected.provider,
    model: selected.id,
    reasoningEffort: clampAutoEffort({
      provider: selected.provider,
      modelId: selected.id,
      target: targetEffort,
      simulatedEffortEnabled: input.routingContext?.simulatedEffortEnabled === true,
    }),
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}

export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  const hidden = new Set(sanitizeHiddenModelIds(input.hiddenModelIds));
  const explicit = input.explicitModelOverride?.trim() || null;
  if (explicit) {
    const structuredUnsupported =
      input.routingContext?.structuredOutput === true &&
      input.catalog.online.some(
        (model) =>
          model.id === explicit && model.supportsStructuredOutput === false,
      );
    const fixed = structuredUnsupported
      ? null
      : firstVisibleRoutableModel(
          [explicit],
          hidden,
          input.provider,
          input.catalog,
        );
    if (fixed) {
      return {
        provider: fixed.provider,
        model: fixed.model,
        usedRequiredLocalFallback: false,
      };
    }
  }

  const autoRoute = contextualAutoRoute(input);
  if (autoRoute) {
    return {
      provider: autoRoute.provider,
      model: autoRoute.model,
      usedRequiredLocalFallback: false,
      autoRoute,
    };
  }

  const lane: ResponseLane = input.lane ?? (input.provider === "local" ? "local" : "online");
  if (lane === "online") {
    const provider = input.provider === "anthropic" ? "anthropic" : "openai";
    return {
      provider,
      model:
        provider === "anthropic"
          ? "claude-sonnet-4-6"
          : "gpt-4o-mini",
      usedRequiredLocalFallback: false,
    };
  }
  return {
    provider: "local",
    model: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
    usedRequiredLocalFallback: true,
  };
}
