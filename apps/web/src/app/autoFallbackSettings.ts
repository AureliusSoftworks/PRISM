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
  hiddenModelIds: readonly string[];
  catalog: CatalogShapeForAuto | null | undefined;
}): AutoFallbackModelRef | null {
  const storedChoice = args.modelChoice?.trim() ?? "";
  const modelChoice = isDisabledModelChoice(storedChoice) ? AUTO_MODEL_CHOICE : storedChoice;
  const resolved = resolveAutoModel({
    provider: args.provider,
    explicitModelOverride:
      modelChoice && modelChoice !== AUTO_MODEL_CHOICE ? modelChoice : null,
    hiddenModelIds: [...args.hiddenModelIds],
    catalog: args.catalog ?? { local: [], online: [] },
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
 * AUTO's editor may be entered whenever Settings contains at least one
 * runnable fallback. The currently selected Primary is intentionally ignored:
 * it may duplicate the only fallback, and AUTO is where the user can choose a
 * different Primary without first changing the LOCAL/ONLINE route.
 */
export function autoFallbackSelectablePrimary(args: {
  chain: AutoFallbackChainV1 | null | undefined;
  runnable: readonly AutoFallbackModelRef[];
}): AutoFallbackModelRef | null {
  return (
    args.runnable.find((primary) =>
      autoFallbackAvailableForPrimary({
        primary,
        chain: args.chain,
        runnable: args.runnable,
      }),
    ) ?? null
  );
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
