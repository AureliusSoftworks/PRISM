import type { ModelCatalog } from "./providers.ts";

export const REQUIRED_PRIMARY_LOCAL_MODEL_ID = "llama3.2";

export type Provider = "local" | "openai";

export interface ResolveAutoModelInput {
  provider: Provider;
  explicitModelOverride?: string | null;
  botPreferredModel?: string | null;
  hiddenModelIds: string[];
  catalog: ModelCatalog;
}

export interface ResolvedAutoModel {
  provider: Provider;
  model: string;
  usedRequiredLocalFallback: boolean;
}

export function sanitizeHiddenModelIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => id !== REQUIRED_PRIMARY_LOCAL_MODEL_ID)
    )
  );
}

function firstVisibleModelId(ids: string[], hidden: Set<string>): string | null {
  return ids.find((id) => id.trim().length > 0 && !hidden.has(id)) ?? null;
}

function providerCatalogIds(catalog: ModelCatalog, provider: Provider): string[] {
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
