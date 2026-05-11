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

export type AutoModelProvider = "local" | "openai";

/** Minimal catalog shape: only model ids are read. */
export interface CatalogShapeForAuto {
  local: readonly { id: string }[];
  online: readonly { id: string }[];
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

function firstVisibleModelId(ids: string[], hidden: Set<string>): string | null {
  return ids.find((id) => id.trim().length > 0 && !hidden.has(id)) ?? null;
}

function providerCatalogIds(catalog: CatalogShapeForAuto, provider: AutoModelProvider): string[] {
  return provider === "local"
    ? catalog.local.map((model) => model.id)
    : catalog.online.map((model) => model.id);
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
