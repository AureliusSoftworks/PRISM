import {
  AUTO_FALLBACK_CHAIN_VERSION,
  autoFallbackModelKey,
  autoFallbackResolvedChain,
  normalizeAutoFallbackModelRef,
  type AutoFallbackChainV1,
  type AutoFallbackModelRef,
} from "@localai/shared";

const PICKER_SEPARATOR = "::";

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
  index: 0 | 1;
  next: AutoFallbackModelRef;
  available: readonly AutoFallbackModelRef[];
}): AutoFallbackChainV1 | null {
  const next = normalizeAutoFallbackModelRef(args.next);
  if (!next) return null;
  const existing = args.chain?.fallbacks ?? [null, null];
  const otherIndex = args.index === 0 ? 1 : 0;
  let other = normalizeAutoFallbackModelRef(existing[otherIndex]);
  if (!other || autoFallbackModelKey(other) === autoFallbackModelKey(next)) {
    other = args.available.find(
      (candidate) => autoFallbackModelKey(candidate) !== autoFallbackModelKey(next)
    ) ?? null;
  }
  if (!other) return null;
  const fallbacks = args.index === 0 ? [next, other] : [other, next];
  return {
    v: AUTO_FALLBACK_CHAIN_VERSION,
    fallbacks: fallbacks as [AutoFallbackModelRef, AutoFallbackModelRef],
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
    resolved && resolved.every((entry) => runnableKeys.has(autoFallbackModelKey(entry)))
  );
}
