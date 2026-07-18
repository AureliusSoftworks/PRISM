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
  preferredLocalModel: string | null | undefined;
  preferredOnlineModel: string | null | undefined;
  hiddenModelIds: readonly string[];
  catalog: CatalogShapeForAuto | null | undefined;
}): AutoFallbackModelRef | null {
  const modelChoice = args.modelChoice?.trim() ?? "";
  if (isDisabledModelChoice(modelChoice)) return null;
  const resolved = resolveAutoModel({
    provider: args.provider,
    explicitModelOverride:
      modelChoice && modelChoice !== AUTO_MODEL_CHOICE ? modelChoice : null,
    preferredModel:
      args.provider === "local"
        ? args.preferredLocalModel
        : args.preferredOnlineModel,
    hiddenModelIds: [...args.hiddenModelIds],
    catalog: args.catalog ?? { local: [], online: [] },
  });
  return { provider: resolved.provider, model: resolved.model };
}

export function encodeAutoFallbackPickerValue(ref: AutoFallbackModelRef): string {
  return `${ref.provider}${PICKER_SEPARATOR}${ref.model}`;
}

export function decodeAutoFallbackPickerValue(value: unknown): AutoFallbackModelRef | null {
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
  if (existing.length >= AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  const used = new Set(existing.map(autoFallbackModelKey));
  const next = args.available.find(
    (candidate) => !used.has(autoFallbackModelKey(candidate)),
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
  if (!Number.isInteger(args.index) || args.index < 0 || args.index >= existing.length) {
    return args.chain ? normalizeAutoFallbackChain(args.chain) : null;
  }
  const fallbacks = existing.filter((_, index) => index !== args.index);
  return fallbacks.length > 0
    ? { v: AUTO_FALLBACK_CHAIN_VERSION, fallbacks }
    : null;
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
    resolved && resolved.every((entry) => runnableKeys.has(autoFallbackModelKey(entry)))
  );
}

export function autoFallbackResponseModeForSend(args: {
  autoEnabled: boolean;
  primary: AutoFallbackModelRef;
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): AutoResponseMode {
  return autoResponseModeForProvider(
    args.primary.provider,
    args.autoEnabled,
    autoFallbackAvailableForPrimary(args),
  );
}
