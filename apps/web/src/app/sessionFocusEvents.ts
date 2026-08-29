"use client";

import { useEffect, useRef } from "react";

export type LiveSessionFocusSurface =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "debate"
  | "story";
export type LiveSessionFocusTransition = "away" | "returned";
export interface LiveSessionFocusEventV1 {
  v: 1;
  surface: LiveSessionFocusSurface;
  sessionId: string;
  transition: LiveSessionFocusTransition;
  occurredAt: string;
}

const pendingWrites = new Map<string, Promise<void>>();
const sessionKey = (surface: LiveSessionFocusSurface, sessionId: string) =>
  `${surface}:${sessionId}`;

function rememberPendingWrite(key: string, write: Promise<void>): void {
  const settled = write.catch(() => undefined).then(() => undefined);
  pendingWrites.set(key, settled);
  void settled.finally(() => {
    if (pendingWrites.get(key) === settled) pendingWrites.delete(key);
  });
}

export async function waitForPendingSessionFocusWrites(
  surface: LiveSessionFocusSurface,
  sessionId: string,
): Promise<void> {
  await pendingWrites.get(sessionKey(surface, sessionId.trim()));
}

export async function loadLiveSessionFocusEvents(
  surface: LiveSessionFocusSurface,
  sessionId: string,
): Promise<LiveSessionFocusEventV1[]> {
  await waitForPendingSessionFocusWrites(surface, sessionId);
  const response = await fetch(
    `/api/session-focus-events?surface=${encodeURIComponent(surface)}&sessionId=${encodeURIComponent(sessionId)}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) throw new Error("Could not load PRISM focus timeline.");
  const payload = await response.json() as { events?: LiveSessionFocusEventV1[] };
  return Array.isArray(payload.events) ? payload.events : [];
}

function recordFocusTransition(
  surface: LiveSessionFocusSurface,
  sessionId: string,
  transition: LiveSessionFocusTransition,
): void {
  const key = sessionKey(surface, sessionId);
  const occurredAt = new Date().toISOString();
  const write = (pendingWrites.get(key) ?? Promise.resolve()).then(() =>
    fetch("/api/session-focus-events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface, sessionId, transition, occurredAt }),
    }).then((response) => {
      if (!response.ok) throw new Error("Could not record PRISM focus transition.");
    }),
  );
  rememberPendingWrite(key, write);
}

/** Tracks only whether PRISM itself is foregrounded; never external app/window identity. */
export function useLiveSessionFocusEvents(
  surface: LiveSessionFocusSurface,
  sessionId: string | null | undefined,
  active = true,
): void {
  const stateRef = useRef<boolean | null>(null);
  useEffect(() => {
    const id = sessionId?.trim();
    if (!active || !id) {
      stateRef.current = null;
      return;
    }
    const foreground = () => document.visibilityState === "visible" && document.hasFocus();
    stateRef.current = foreground();
    const sync = () => {
      const next = foreground();
      const previous = stateRef.current;
      if (previous === next) return;
      stateRef.current = next;
      recordFocusTransition(surface, id, next ? "returned" : "away");
    };
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, sessionId, surface]);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function normalizedEvents(events: readonly LiveSessionFocusEventV1[]): LiveSessionFocusEventV1[] {
  const ordered = [...events]
    .filter((event) => (event.transition === "away" || event.transition === "returned") && Number.isFinite(Date.parse(event.occurredAt)))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.transition.localeCompare(b.transition));
  return ordered.filter((event, index) => index === 0 || ordered[index - 1].transition !== event.transition);
}

function focusMarker(event: LiveSessionFocusEventV1, previousAway: string | null): string {
  if (event.transition === "away") {
    return `> **Window focus · ${event.occurredAt}** — PRISM left the foreground. The session may have continued while PRISM was not focused.`;
  }
  const duration = previousAway === null ? null : Date.parse(event.occurredAt) - Date.parse(previousAway);
  return `> **Window focus · ${event.occurredAt}** — PRISM returned to the foreground${duration === null ? "." : ` after ${formatDuration(duration)}.`}`;
}

const ISO_TIMESTAMP =
  "(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z)";
const LIST_TIMESTAMP = new RegExp(
  `^\\s*-\\s*(?:At|Created|Started|Updated|Completed|Occurred at|Recorded|Timestamp):\\s*${ISO_TIMESTAMP}\\s*$`,
  "iu",
);
const CHAT_MESSAGE_TIMESTAMP = new RegExp(`_\\(${ISO_TIMESTAMP}\\)_\\s*$`, "u");

function transcriptTimestamp(line: string): number | null {
  const rawTimestamp =
    line.match(LIST_TIMESTAMP)?.[1] ??
    line.match(CHAT_MESSAGE_TIMESTAMP)?.[1];
  const timestampMs = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN;
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

/** Inserts deterministic timeline markers beside the nearest preceding transcript timestamp. */
export function annotateTranscriptWithFocusEvents(
  transcript: string,
  events: readonly LiveSessionFocusEventV1[] | null | undefined,
): string {
  const normalized = normalizedEvents(events ?? []);
  if (!transcript.trim() || normalized.length === 0) return transcript.trimEnd();
  const lines = transcript.trimEnd().split(/\r?\n/u);
  const anchors = lines.flatMap((line, index) => {
    const ms = transcriptTimestamp(line);
    return ms === null ? [] : [{ index, ms }];
  });
  let awayAt: string | null = null;
  const inserts = normalized.map((event, order) => {
    const marker = focusMarker(event, awayAt);
    if (event.transition === "away") awayAt = event.occurredAt;
    else awayAt = null;
    const eventMs = Date.parse(event.occurredAt);
    const anchor =
      anchors.filter((candidate) => candidate.ms <= eventMs).at(-1) ??
      anchors[0];
    return { index: anchor ? anchor.index + 1 : lines.length, marker, order };
  });
  if (awayAt) {
    const current = inserts.at(-1);
    if (current?.marker.includes("PRISM left the foreground")) {
      current.marker = `${current.marker} No foreground return was recorded before live-session tracking ended.`;
    }
  }
  for (const insert of inserts.sort((a, b) => b.index - a.index || b.order - a.order)) {
    lines.splice(insert.index, 0, insert.marker);
  }
  return lines.join("\n").trimEnd();
}
