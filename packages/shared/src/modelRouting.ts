/**
 * Auto model resolution — shared by the API and the web composer so labels match
 * what the server actually runs.
 */
export const REQUIRED_LOCAL_MODELS = {
  chat: "llama3.2",
  embedding: "nomic-embed-text",
} as const;

export const REQUIRED_PRIMARY_LOCAL_MODEL_ID = REQUIRED_LOCAL_MODELS.chat;
const REQUIRED_LOCAL_MODEL_ID_SET = new Set<string>(Object.values(REQUIRED_LOCAL_MODELS));

export type AutoModelProvider = "local" | "openai" | "anthropic";

export const MODEL_VISIBILITY_DEFAULTS_VERSION = 1;

/** Minimal catalog shape: only model ids are read. */
export interface CatalogShapeForAuto {
  local: readonly { id: string }[];
  online: readonly { id: string; provider?: AutoModelProvider }[];
}

export interface ResolveAutoModelInput {
  provider: AutoModelProvider;
  explicitModelOverride?: string | null;
  botPreferredModel?: string | null;
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

const COMMON_OPENAI_CHAT_MODEL_PATTERNS = [
  /^gpt-5(?:\.\d+)?(?:-(?:mini|chat-latest))?$/,
  /^gpt-4\.1(?:-mini)?$/,
  /^gpt-4o(?:-mini)?$/,
  /^o3(?:-mini)?$/,
  /^o4-mini$/,
] as const;

const COMMON_ANTHROPIC_CHAT_MODEL_PATTERNS = [
  /^claude-(?:sonnet|opus|haiku)-4(?:-\d+)?$/,
  /^claude-3-5-(?:sonnet|haiku)-latest$/,
] as const;

export function sanitizeHiddenModelIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => !REQUIRED_LOCAL_MODEL_ID_SET.has(id))
    )
  );
}

export function isCommonOnlineChatModel(model: ModelForDefaultVisibility): boolean {
  const provider = model.provider ?? "openai";
  if (provider === "local") return true;
  const normalized = model.id.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("preview") ||
    /(?:^|[-_])test(?:$|[-_])/.test(normalized) ||
    normalized.includes("eval") ||
    normalized.includes("experimental") ||
    normalized.includes("snapshot") ||
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
  online: readonly ModelForDefaultVisibility[];
}): string[] {
  return sanitizeHiddenModelIds(
    catalog.online
      .filter((model) => !isCommonOnlineChatModel(model))
      .map((model) => model.id)
  );
}

function firstVisibleModelId(ids: string[], hidden: Set<string>): string | null {
  return ids.find((id) => id.trim().length > 0 && !hidden.has(id)) ?? null;
}

function providerCatalogIds(catalog: CatalogShapeForAuto, provider: AutoModelProvider): string[] {
  if (provider === "local") {
    return catalog.local.map((model) => model.id);
  }
  return catalog.online
    .filter((model) => (model.provider ?? "openai") === provider)
    .map((model) => model.id);
}

export function resolveAutoModel(input: ResolveAutoModelInput): ResolvedAutoModel {
  const hidden = new Set(sanitizeHiddenModelIds(input.hiddenModelIds));
  const explicit = input.explicitModelOverride?.trim() || null;
  const botPreferred = input.botPreferredModel?.trim() || null;
  const providerCandidates = [
    ...(explicit ? [explicit] : []),
    ...(botPreferred ? [botPreferred] : []),
    ...providerCatalogIds(input.catalog, input.provider),
  ];
  const providerModel = firstVisibleModelId(providerCandidates, hidden);
  if (providerModel) {
    return {
      provider: input.provider,
      model: providerModel,
      usedRequiredLocalFallback: false,
    };
  }

  return {
    provider: "local",
    model: REQUIRED_PRIMARY_LOCAL_MODEL_ID,
    usedRequiredLocalFallback: true,
  };
}
