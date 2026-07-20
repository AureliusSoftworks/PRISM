/**
 * Auto model resolution — shared by the API and the web composer so labels match
 * what the server actually runs.
 */

export const REQUIRED_LOCAL_MODELS = {
  chat: "llama3.2",
  embedding: "nomic-embed-text",
} as const;

export const REQUIRED_PRIMARY_LOCAL_MODEL_ID = REQUIRED_LOCAL_MODELS.chat;
export const DISABLED_MODEL_CHOICE = "disabled";
const REQUIRED_VISIBLE_LOCAL_MODEL_ID_SET = new Set<string>([REQUIRED_PRIMARY_LOCAL_MODEL_ID]);

export type AutoModelProvider = "local" | "openai" | "anthropic";

export const MODEL_VISIBILITY_DEFAULTS_VERSION = 5;

/** Minimal catalog shape: only model ids are read. */
export interface CatalogShapeForAuto {
  local: readonly { id: string }[];
  online: readonly { id: string; provider?: AutoModelProvider }[];
}

export interface ResolveAutoModelInput {
  provider: AutoModelProvider;
  explicitModelOverride?: string | null;
  preferredModel?: string | null;
  hiddenModelIds: string[];
  catalog: CatalogShapeForAuto;
}

export interface ResolvedAutoModel {
  provider: AutoModelProvider;
  model: string;
  usedRequiredLocalFallback: boolean;
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

function providerCatalogIds(catalog: CatalogShapeForAuto, provider: AutoModelProvider): string[] {
  if (provider === "local") {
    return catalog.local.map((model) => model.id);
  }
  return catalog.online
    .filter((model) => (model.provider ?? "openai") === provider)
    .map((model) => model.id);
}

function inferOnlineProviderFromModelId(modelId: string): Exclude<AutoModelProvider, "local"> | null {
  const normalized = modelId.trim().toLowerCase();
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

  if (inferredProvider === "local" ||
      (requestedProvider === "anthropic" && inferredProvider === "openai")) {
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

export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  const hidden = new Set(sanitizeHiddenModelIds(input.hiddenModelIds));
  const explicit = input.explicitModelOverride?.trim() || null;
  const preferred = input.preferredModel?.trim() || null;
  const providerCatalog = providerCatalogIds(input.catalog, input.provider);
  const leadingCandidates = [explicit, preferred].filter(
    (model): model is string => Boolean(model)
  );
  const leadingCandidateSet = new Set(leadingCandidates);
  const providerCandidates = [
    ...leadingCandidates,
    ...providerCatalog.filter((model) => !leadingCandidateSet.has(model)),
  ];
  const providerModel = firstVisibleRoutableModel(
    providerCandidates,
    hidden,
    input.provider,
    input.catalog
  );
  if (providerModel) {
    return {
      provider: providerModel.provider,
      model: providerModel.model,
      usedRequiredLocalFallback: false,
    };
  }

  return {
    provider: "local",
    model: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
    usedRequiredLocalFallback: true,
  };
}
