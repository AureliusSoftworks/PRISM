import { modelSupportsTurboMode } from "@localai/shared";

export interface TurboModelShortcutCandidate {
  id: string;
  provider: "local" | "openai" | "anthropic";
  disabledReason?: string;
}

/**
 * Chooses the first Fast-capable candidate from Prism's existing price and
 * preference ordering. An ONLINE route stays with its current provider when
 * that provider offers Fast; LOCAL falls through to the preferred ONLINE order.
 */
export function turboModelShortcutCandidate(
  candidates: readonly TurboModelShortcutCandidate[],
  activeProvider: TurboModelShortcutCandidate["provider"],
  preferredModelId?: string | null,
): TurboModelShortcutCandidate | null {
  const supportsTurbo = (candidate: TurboModelShortcutCandidate): boolean =>
    !candidate.disabledReason &&
    modelSupportsTurboMode(candidate.provider, candidate.id);
  const sameProvider = candidates.find(
    (candidate) =>
      candidate.provider === activeProvider &&
      candidate.id === preferredModelId &&
      supportsTurbo(candidate),
  ) ?? candidates.find(
    (candidate) => candidate.provider === activeProvider && supportsTurbo(candidate),
  );
  if (sameProvider) return sameProvider;
  const preferred = candidates.find(
    (candidate) => candidate.id === preferredModelId && supportsTurbo(candidate),
  );
  return preferred ?? candidates.find(supportsTurbo) ?? null;
}
