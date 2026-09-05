"use client";

import { useEffect, useRef } from "react";

import type {
  AppletSessionNoteContext,
  AppletSessionNoteSurface,
  AppletTranscriptFrameSampleV1,
} from "./appletSessionNotes";
import { currentPrismFrameRate } from "./prismFrameRate.ts";

export interface AppletTranscriptFrameEntry {
  id: string;
  createdAt: string;
}

const APPLET_TRANSCRIPT_FRESH_ENTRY_MS = 10_000;
const APPLET_TRANSCRIPT_FRAME_SAMPLE_EVENT =
  "prism:applet-transcript-frame-sample";

export interface AppletTranscriptFrameSampleEventDetail {
  surface: AppletSessionNoteSurface;
  sessionId: string;
  sample: AppletTranscriptFrameSampleV1;
}

export function subscribeAppletTranscriptFrameSample(
  listener: (detail: AppletTranscriptFrameSampleEventDetail) => void,
): () => void {
  const handleSample = (event: Event): void => {
    listener(
      (event as CustomEvent<AppletTranscriptFrameSampleEventDetail>).detail,
    );
  };
  window.addEventListener(APPLET_TRANSCRIPT_FRAME_SAMPLE_EVENT, handleSample);
  return () =>
    window.removeEventListener(APPLET_TRANSCRIPT_FRAME_SAMPLE_EVENT, handleSample);
}

export async function recordAppletTranscriptFrameSample(
  context: AppletSessionNoteContext,
  entryId: string,
): Promise<void> {
  const snapshot = currentPrismFrameRate();
  const normalizedEntryId = entryId.trim();
  if (!snapshot || !normalizedEntryId) return;
  const capturedAt = new Date().toISOString();
  await fetch("/api/transcript-frame-samples", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...context,
      entryId: normalizedEntryId,
      fps: snapshot.fps,
      capturedAt,
    }),
  }).then((response) => {
    if (!response.ok) throw new Error("Could not record transcript frame rate.");
  });
  window.dispatchEvent(
    new CustomEvent<AppletTranscriptFrameSampleEventDetail>(
      APPLET_TRANSCRIPT_FRAME_SAMPLE_EVENT,
      {
        detail: {
          surface: context.surface,
          sessionId: context.sessionId,
          sample: {
            entryId: normalizedEntryId,
            fps: snapshot.fps,
            capturedAt,
          },
        },
      },
    ),
  );
}

export function useAppletTranscriptFrameRate(
  surface: AppletSessionNoteSurface,
  sessionId: string | null | undefined,
  entries: readonly AppletTranscriptFrameEntry[],
): void {
  const seenBySessionRef = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId) return;
    const sessionKey = `${surface}:${normalizedSessionId}`;
    let seen = seenBySessionRef.current.get(sessionKey);
    const initializing = !seen;
    if (!seen) {
      seen = new Set<string>();
      seenBySessionRef.current.set(sessionKey, seen);
    }
    const nowMs = Date.now();
    for (const entry of entries) {
      if (!entry.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const createdAtMs = Date.parse(entry.createdAt);
      const freshOnInitialization =
        Number.isFinite(createdAtMs) &&
        Math.abs(nowMs - createdAtMs) <= APPLET_TRANSCRIPT_FRESH_ENTRY_MS;
      if (!initializing || freshOnInitialization) {
        void recordAppletTranscriptFrameSample(
          { surface, sessionId: normalizedSessionId },
          entry.id,
        ).catch(() => undefined);
      }
    }
    if (seenBySessionRef.current.size > 16) {
      const oldestKey = seenBySessionRef.current.keys().next().value;
      if (typeof oldestKey === "string" && oldestKey !== sessionKey) {
        seenBySessionRef.current.delete(oldestKey);
      }
    }
  }, [entries, sessionId, surface]);
}

function frameSampleMetadataLine(sample: AppletTranscriptFrameSampleV1): string {
  return `- Frame rate: ${sample.fps} FPS`;
}

export function annotateAppletTranscriptFrameRates(
  transcript: string,
  samples: readonly AppletTranscriptFrameSampleV1[] | null | undefined,
): string {
  if (!transcript || !samples?.length) return transcript.trimEnd();
  const lines = transcript.split(/\r?\n/u);
  for (const sample of [...samples].reverse()) {
    const entryId = sample.entryId.trim();
    if (!entryId) continue;
    const idLineIndex = lines.findIndex((line) => line.includes(entryId));
    if (idLineIndex < 0) continue;
    const blockEnd = lines.findIndex(
      (line, index) => index > idLineIndex && /^#{2,3}\s/u.test(line),
    );
    const searchEnd = blockEnd < 0 ? lines.length : blockEnd;
    const timestampLineIndex = lines.findIndex(
      (line, index) =>
        index >= idLineIndex &&
        index < searchEnd &&
        /^-\s*(?:Recorded|At|Created|Started):/u.test(line),
    );
    const insertionIndex =
      timestampLineIndex >= 0 ? timestampLineIndex + 1 : idLineIndex + 1;
    const metadataLine = frameSampleMetadataLine(sample);
    if (lines[insertionIndex] !== metadataLine) {
      lines.splice(insertionIndex, 0, metadataLine);
    }
  }
  return lines.join("\n").trimEnd();
}
