import assert from "node:assert/strict";
import test from "node:test";

import { annotateTranscriptWithFocusEvents } from "./sessionFocusEvents.ts";

test("focus annotations are ordered beside transcript anchors with multiple cycles", () => {
  const transcript = [
    "# Review",
    "",
    "## First turn",
    "",
    "- At: 2026-08-29T12:00:00.000Z",
    "Hello.",
    "",
    "## Second turn",
    "",
    "- At: 2026-08-29T12:02:00.000Z",
    "Again.",
  ].join("\n");
  const annotated = annotateTranscriptWithFocusEvents(transcript, [
    { v: 1, surface: "debate", sessionId: "d1", transition: "away", occurredAt: "2026-08-29T12:00:20.000Z" },
    { v: 1, surface: "debate", sessionId: "d1", transition: "returned", occurredAt: "2026-08-29T12:00:50.000Z" },
    { v: 1, surface: "debate", sessionId: "d1", transition: "away", occurredAt: "2026-08-29T12:02:20.000Z" },
  ]);
  assert.match(
    annotated,
    /> \*\*Window focus · 2026-08-29T12:00:20.000Z\*\* — PRISM left the foreground[\s\S]*?> \*\*Window focus · 2026-08-29T12:00:50.000Z\*\* — PRISM returned to the foreground after 30s\./u,
  );
  assert.match(
    annotated,
    /> \*\*Window focus · 2026-08-29T12:02:20.000Z\*\* — PRISM left the foreground[\s\S]*No foreground return was recorded before live-session tracking ended\./u,
  );
});

test("focus annotations recognize Signal, Coffee, and Chat timestamp shapes", () => {
  const transcript = [
    "- Recorded: 2026-08-29T12:00:00.000Z",
    "Signal line.",
    "- Timestamp: 2026-08-29T12:01:00.000Z",
    "Developer call.",
    "**You** _(2026-08-29T12:02:00.000Z)_",
    "Chat line.",
  ].join("\n");
  const annotated = annotateTranscriptWithFocusEvents(transcript, [
    { v: 1, surface: "signal", sessionId: "s1", transition: "away", occurredAt: "2026-08-29T12:00:10.000Z" },
    { v: 1, surface: "signal", sessionId: "s1", transition: "returned", occurredAt: "2026-08-29T12:01:10.000Z" },
    { v: 1, surface: "signal", sessionId: "s1", transition: "away", occurredAt: "2026-08-29T12:02:10.000Z" },
  ]);
  const recordedAt = annotated.indexOf("- Recorded:");
  const firstMarker = annotated.indexOf("Window focus · 2026-08-29T12:00:10.000Z");
  const developerAt = annotated.indexOf("- Timestamp:");
  const secondMarker = annotated.indexOf("Window focus · 2026-08-29T12:01:10.000Z");
  const chatAt = annotated.indexOf("**You** _(");
  const thirdMarker = annotated.indexOf("Window focus · 2026-08-29T12:02:10.000Z");
  assert.ok(recordedAt < firstMarker && firstMarker < developerAt);
  assert.ok(developerAt < secondMarker && secondMarker < chatAt);
  assert.ok(chatAt < thirdMarker);
});
