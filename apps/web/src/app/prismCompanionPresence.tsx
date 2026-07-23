"use client";

import { useLayoutEffect } from "react";

const suppressionCounts = new Map<string, number>();
const listeners = new Set<() => void>();
let suppressed = false;

function publishSuppression(): void {
  const nextSuppressed = suppressionCounts.size > 0;
  if (nextSuppressed === suppressed) return;
  suppressed = nextSuppressed;
  for (const listener of listeners) listener();
}

export function setPrismCompanionSuppressed(
  reason: string,
  shouldSuppress: boolean,
): void {
  if (shouldSuppress) {
    suppressionCounts.set(reason, (suppressionCounts.get(reason) ?? 0) + 1);
  } else {
    const nextCount = (suppressionCounts.get(reason) ?? 0) - 1;
    if (nextCount > 0) suppressionCounts.set(reason, nextCount);
    else suppressionCounts.delete(reason);
  }
  publishSuppression();
}

export function subscribePrismCompanionSuppression(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPrismCompanionSuppressedSnapshot(): boolean {
  return suppressed;
}

export function getPrismCompanionSuppressedServerSnapshot(): boolean {
  return false;
}

export function PrismCompanionPresenceBoundary({
  reason,
}: {
  reason: string;
}): null {
  useLayoutEffect(() => {
    setPrismCompanionSuppressed(reason, true);
    return () => setPrismCompanionSuppressed(reason, false);
  }, [reason]);
  return null;
}
