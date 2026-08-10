import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("./qa-voice-sync/page.tsx", import.meta.url),
  "utf8",
);
const labSource = readFileSync(
  new URL("./qa-voice-sync/VoiceSyncLab.tsx", import.meta.url),
  "utf8",
);
const labCss = readFileSync(
  new URL("./qa-voice-sync/voiceSyncLab.module.css", import.meta.url),
  "utf8",
);
const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Voice Sync Lab is a server-gated development-only route", () => {
  assert.match(routeSource, /import \{ notFound \} from "next\/navigation"/u);
  assert.match(
    routeSource,
    /if \(process\.env\.NODE_ENV === "production"\) notFound\(\)/u,
  );
  assert.doesNotMatch(routeSource, /["']use client["']/u);
  assert.match(routeSource, /return <VoiceSyncLab \/>/u);
});

test("Voice Sync Lab consumes the shared trace and production mouth path", () => {
  assert.match(labSource, /type VoiceAlignmentTraceV1/u);
  assert.match(labSource, /normalizeVoiceAlignmentTraceV1/u);
  assert.match(labSource, /exportVoiceAlignmentTraceJsonV1/u);
  assert.match(labSource, /from "@localai\/shared"/u);
  assert.match(labSource, /synthesizeVoiceSyncLabClip/u);
  assert.match(labSource, /from "\.\.\/voiceSyncLabAudio"/u);
  assert.match(labSource, /crtSpeechMouthShapeAtAlignedElapsedMs/u);
  assert.match(labSource, /englishCrtVisemeTimeline/u);
  assert.match(labSource, /coffeeSeatPlateGlyph/u);
  assert.doesNotMatch(labSource, /new Audio\s*\(/u);
  assert.doesNotMatch(labSource, /createOscillator\s*\(/u);
});

test("Voice Sync Lab exposes the complete diagnostic control and truth hierarchy", () => {
  for (const label of [
    "Phrase under test",
    "Stress corpus",
    "Engine",
    "Voice profile",
    "Voice effect",
    "Surface context (metadata)",
    "Generate trace",
    "Play production",
    "Play",
    "Pause",
    "Loop",
    "0.25",
    "Mouth Δ",
    "App-bus first-open vs speech Δ",
    "App-bus last-open vs speech Δ",
    "Device-est. first-open vs speech Δ",
    "Device-est. last-open vs speech Δ",
    "Decoded waveform",
    "Engine character / phoneme / viseme",
    "Final audio activity",
    "Rendered mouth transitions",
    "Shh at cursor",
    "Immediate audio cutoff",
    "Immediate mouth close",
    "Export JSON",
    "Export app-output WAV",
  ]) {
    assert.ok(labSource.includes(label), `missing Voice Sync Lab contract: ${label}`);
  }
  assert.match(labSource, /negative leads · positive lags/u);
  assert.match(labSource, /silenceOpenViolationCount/u);
  assert.match(labSource, /Synthetic reference/u);
  assert.match(labSource, /captured app-output WAV is export-only and unregistered/u);
  assert.match(labSource, /softwareClockVerified && shhCaptureFrame !== null/u);
  assert.match(labSource, /timeline marker inspection-only/u);
  assert.match(labSource, /capturedAppOutputWav && softwareClockVerified/u);
  assert.match(labSource, /source bytes; captured output unregistered/u);
  assert.match(labSource, /captured output; clock verification unavailable/u);
  assert.match(labSource, /characterSpans/u);
  assert.match(labSource, /origin: "heuristic" as const/u);
  assert.match(labSource, /playVoiceSyncLabClip/u);
  assert.match(labSource, /captureFinalPcm: true/u);
  assert.match(labSource, /productionSessionRef\.current\.shh\(\)/u);
  assert.match(labSource, /immediateCutoffObserved/u);
  assert.match(labSource, /mouthClosedImmediately/u);
  assert.match(labSource, /cutoffToleranceFrames/u);
  assert.match(labSource, /effectsEnabled: true/u);
  for (const accessibleName of [
    "Engine",
    "Voice profile",
    "Voice effect",
    "Surface context",
    "System voice",
  ]) {
    assert.match(labSource, new RegExp(`aria-label="${accessibleName}"`, "u"));
  }
  assert.match(labSource, /ONLINE \/ external/u);
  assert.match(labSource, /Device latency estimate/u);
  assert.match(labSource, /Physical speaker loopback · not measured/u);
  assert.match(labSource, /context metadata; renderer not mounted/u);
  assert.match(labSource, /Mouth Δ is view-only/u);
  assert.match(labSource, /mouthTransitions: calibration\.mouthTransitions/u);
  assert.match(labSource, /captured software app-output WAV; same frame-zero clock as trace/u);
  assert.match(labSource, /rawSoftwareBusWavBytes/u);
  assert.match(labCss, /data-status="aligned"/u);
  assert.match(labCss, /data-status="partial"/u);
  assert.match(labCss, /data-status="unaligned"/u);
});

test("Voice Sync Lab keeps signed-out and ephemeral states explicit", () => {
  assert.match(labSource, /Signed out\. Production synthesis requires authentication/u);
  assert.match(labSource, /role=\{notice\.kind === "error" \? "alert" : "status"\}/u);
  assert.match(labSource, /No final software app-output PCM measurement yet/u);
  assert.match(labSource, /This lab does not persist state/u);
  assert.match(labSource, /external provider/u);
  assert.match(labSource, /add it to a canonical conversation/u);
  assert.doesNotMatch(labSource, /localStorage|sessionStorage|indexedDB/u);
  assert.match(labCss, /height: 100svh/u);
  assert.match(labCss, /overflow-y: auto/u);
  assert.match(labCss, /@media \(max-width: 1360px\)[\s\S]*?\.setupPanel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u);
});

test("local Developer Tools expose the Voice Sync Lab route", () => {
  assert.match(
    homeSource,
    /className=\{`\$\{styles\.devToolsPill\} \$\{styles\.devToolsLabLink\}`\}[\s\S]*?href="\/qa-voice-sync"/u,
  );
});
