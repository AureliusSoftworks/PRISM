"use client";

import { useLayoutEffect } from "react";
import type { AppletSessionNoteContext } from "./appletSessionNotes";

const suppressionCounts = new Map<string, number>();
const listeners = new Set<() => void>();
let suppressed = false;
const noteContexts = new Map<string, AppletSessionNoteContext>();
let activeNoteContext: AppletSessionNoteContext | null = null;

function publishSuppression(): void {
  const nextSuppressed = suppressionCounts.size > 0;
  if (nextSuppressed === suppressed) return;
  suppressed = nextSuppressed;
  for (const listener of listeners) listener();
}

function publishNoteContext(): void {
  const next = Array.from(noteContexts.values()).at(-1) ?? null;
  if (
    next?.surface === activeNoteContext?.surface &&
    next?.sessionId === activeNoteContext?.sessionId
  ) {
    return;
  }
  activeNoteContext = next;
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

export function getPrismCompanionSessionNoteSnapshot(): AppletSessionNoteContext | null {
  return activeNoteContext;
}

export function getPrismCompanionSessionNoteServerSnapshot(): AppletSessionNoteContext | null {
  return null;
}

export function prismCompanionDisabledByMainPanel(
  panel: string | null,
  avatarStudioOpen: boolean,
): boolean {
  return panel !== null || avatarStudioOpen;
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

export function PrismCompanionSessionNoteBoundary({
  reason,
  surface,
  sessionId,
}: AppletSessionNoteContext & { reason: string }): null {
  useLayoutEffect(() => {
    const context = { surface, sessionId: sessionId.trim() };
    if (!context.sessionId) return;
    noteContexts.set(reason, context);
    publishNoteContext();
    return () => {
      noteContexts.delete(reason);
      publishNoteContext();
    };
  }, [reason, sessionId, surface]);
  return null;
}
