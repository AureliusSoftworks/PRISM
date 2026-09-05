import {
  AUTO_FALLBACK_CHAIN_VERSION,
  AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT,
  autoFallbackModelKey,
  autoFallbackResolvedChain,
  isDisabledModelChoice,
  normalizeAutoFallbackChain,
  normalizeAutoFallbackModelRef,
  resolveAutoModel,
  type AutoFallbackChainV1,
  type AutoFallbackModelRef,
  type CatalogShapeForAuto,
  type OnlineAutoProviderWeightsV1,
} from "@localai/shared";
import {
  autoResponseModeForProvider,
  type AutoResponseMode,
} from "./providerMode.ts";

const PICKER_SEPARATOR = "::";
const AUTO_MODEL_CHOICE = "auto";

export function autoFallbackPrimaryForSelection(args: {
  provider: AutoFallbackModelRef["provider"];
  modelChoice: string | null | undefined;
  hiddenModelIds: readonly string[];
  catalog: CatalogShapeForAuto | null | undefined;
  onlineAutoProviderBias?: number | null;
  onlineAutoProviderWeights?: OnlineAutoProviderWeightsV1 | null;
  onlineAutoQualityPosture?: import("@localai/shared").OnlineAutoQualityPosture | null;
}): AutoFallbackModelRef | null {
  const storedChoice = args.modelChoice?.trim() ?? "";
  const modelChoice = isDisabledModelChoice(storedChoice) ? AUTO_MODEL_CHOICE : storedChoice;
  const resolved = resolveAutoModel({
    provider: args.provider,
    lane: args.provider === "local" ? "local" : "online",
    explicitModelOverride:
      modelChoice && modelChoice !== AUTO_MODEL_CHOICE ? modelChoice : null,
    hiddenModelIds: [...args.hiddenModelIds],
    catalog: args.catalog ?? { local: [], online: [] },
    onlineAutoProviderBias: args.onlineAutoProviderBias,
    onlineAutoProviderWeights: args.onlineAutoProviderWeights,
    onlineAutoQualityPosture: args.onlineAutoQualityPosture,
  });
  return { provider: resolved.provider, model: resolved.model };
}

export function encodeAutoFallbackPickerValue(
  ref: AutoFallbackModelRef,
): string {
  return `${ref.provider}${PICKER_SEPARATOR}${ref.model}`;
}

export function decodeAutoFallbackPickerValue(
  value: unknown,
): AutoFallbackModelRef | null {
  if (typeof value !== "string") return null;
  const separator = value.indexOf(PICKER_SEPARATOR);
  if (separator <= 0) return null;
  return normalizeAutoFallbackModelRef({
    provider: value.slice(0, separator),
    model: value.slice(separator + PICKER_SEPARATOR.length),
  });
}

export function autoFallbackChainWithEntry(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  index: number;
  next: AutoFallbackModelRef;
  available: readonly AutoFallbackModelRef[];
}): AutoFallbackChainV1 | null {
  const next = normalizeAutoFallbackModelRef(args.next);
  if (!next) return null;
  const existing = normalizeAutoFallbackChain(args.chain)?.fallbacks ?? [];
  if (
    !Number.isInteger(args.index) ||
    args.index < 0 ||
    args.index > existing.length ||
    args.index >= AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT
  ) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  const availableKeys = new Set(args.available.map(autoFallbackModelKey));
  if (!availableKeys.has(autoFallbackModelKey(next))) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  const fallbacks = [...existing];
  fallbacks[args.index] = next;
  const nextLane = next.provider === "local" ? "local" : "online";
  if (
    fallbacks.filter((entry) =>
      nextLane === "local"
        ? entry.provider === "local"
        : entry.provider !== "local",
    ).length > AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT
  ) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  if (new Set(fallbacks.map(autoFallbackModelKey)).size !== fallbacks.length) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  return {
    v: AUTO_FALLBACK_CHAIN_VERSION,
    fallbacks,
  };
}

export function autoFallbackChainWithAddedEntry(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  available: readonly AutoFallbackModelRef[];
}): AutoFallbackChainV1 | null {
  const existing = normalizeAutoFallbackChain(args.chain)?.fallbacks ?? [];
  const used = new Set(existing.map(autoFallbackModelKey));
  const next = args.available.find(
    (candidate) => {
      if (used.has(autoFallbackModelKey(candidate))) return false;
      const sameLaneCount = existing.filter((entry) =>
        candidate.provider === "local"
          ? entry.provider === "local"
          : entry.provider !== "local",
      ).length;
      return sameLaneCount < AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT;
    },
  );
  if (!next) return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  return {
    v: AUTO_FALLBACK_CHAIN_VERSION,
    fallbacks: [...existing, next],
  };
}

export function autoFallbackChainWithoutEntry(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  index: number;
}): AutoFallbackChainV1 | null {
  const existing = normalizeAutoFallbackChain(args.chain)?.fallbacks ?? [];
  if (
    !Number.isInteger(args.index) ||
    args.index < 0 ||
    args.index >= existing.length
  ) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  const fallbacks = existing.filter((_, index) => index !== args.index);
  return fallbacks.length > 0
    ? { v: AUTO_FALLBACK_CHAIN_VERSION, fallbacks }
    : null;
}

export function autoFallbackChainWithMovedEntry(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  fromIndex: number;
  toIndex: number;
}): AutoFallbackChainV1 | null {
  const normalized = normalizeAutoFallbackChain(args.chain);
  const existing = normalized?.fallbacks ?? [];
  if (
    !Number.isInteger(args.fromIndex) ||
    !Number.isInteger(args.toIndex) ||
    args.fromIndex < 0 ||
    args.toIndex < 0 ||
    args.fromIndex >= existing.length ||
    args.toIndex >= existing.length
  ) {
    return normalized;
  }
  if (args.fromIndex === args.toIndex) return normalized;

  const from = existing[args.fromIndex]!;
  const to = existing[args.toIndex]!;
  const fromLane = from.provider === "local" ? "local" : "online";
  const toLane = to.provider === "local" ? "local" : "online";
  if (fromLane !== toLane) return normalized;

  const laneEntries = existing.filter((entry) =>
    fromLane === "local"
      ? entry.provider === "local"
      : entry.provider !== "local",
  );
  const fromLaneIndex = laneEntries.findIndex(
    (entry) => autoFallbackModelKey(entry) === autoFallbackModelKey(from),
  );
  const toLaneIndex = laneEntries.findIndex(
    (entry) => autoFallbackModelKey(entry) === autoFallbackModelKey(to),
  );
  const [moved] = laneEntries.splice(fromLaneIndex, 1);
  if (!moved) return normalized;
  laneEntries.splice(toLaneIndex, 0, moved);

  let nextLaneIndex = 0;
  return {
    v: AUTO_FALLBACK_CHAIN_VERSION,
    fallbacks: existing.map((entry) => {
      const entryLane = entry.provider === "local" ? "local" : "online";
      return entryLane === fromLane ? laneEntries[nextLaneIndex++]! : entry;
    }),
  };
}

export function autoFallbackAvailableForPrimary(args: {
  primary: AutoFallbackModelRef | null | undefined;
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): boolean {
  if (!args.primary) return false;
  const runnableKeys = new Set(args.runnable.map(autoFallbackModelKey));
  const resolved = autoFallbackResolvedChain(args.primary, args.chain);
  return Boolean(
    resolved &&
    resolved.every((entry) => runnableKeys.has(autoFallbackModelKey(entry))),
  );
}

/**
 * Contextual Auto is available whenever the selected privacy lane has a
 * runnable model. Saved entries only influence recovery order; they are not a
 * prerequisite because the runtime appends the rest of the eligible catalog.
 */
export function autoFallbackSelectablePrimary(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): AutoFallbackModelRef | null {
  return args.runnable[0] ?? null;
}

export function autoFallbackModeSelectable(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): boolean {
  return autoFallbackSelectablePrimary(args) !== null;
}

export function autoFallbackResponseModeForSend(args: {
  autoEnabled: boolean;
  primary: AutoFallbackModelRef;
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): AutoResponseMode {
  return autoResponseModeForProvider(args.primary.provider, false);
}
