import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ReplayManifestV1,
  ReplayVoiceTakeRecordV1,
} from "@localai/shared";
import {
  REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS,
  generateReplayPremiumSegment,
  planReplayPremiumSegments,
} from "../replay-premium.ts";

function fixture(lines: Array<{
  id: string;
  speakerId: string;
  speakerName: string;
  voiceId: string;
  text: string;
  moodKey?: "neutral" | "warm";
}>): { manifest: ReplayManifestV1; takes: ReplayVoiceTakeRecordV1[] } {
  const now = "2026-07-22T00:00:00.000Z";
  return {
    manifest: {
      v: 1,
      surface: "signal",
      sourceId: "episode-1",
      title: "Premium fixture",
      createdAt: now,
      completedAt: now,
      privacyMode: "online",
      participants: lines.map((line, index) => ({
        id: line.speakerId,
        name: line.speakerName,
        kind: "bot",
        role: index % 2 === 0 ? "host" : "guest",
        color: null,
        glyph: null,
        seatIndex: index,
        visible: true,
      })),
      utterances: lines.map((line, index) => ({
        id: line.id,
        sourceMessageId: line.id,
        speakerId: line.speakerId,
        speakerRole: index % 2 === 0 ? "host" : "guest",
        text: line.text,
        spokenText: line.text,
        moodKey: line.moodKey ?? "neutral",
        audible: true,
        visible: true,
        createdAt: now,
      })),
      events: [],
      visual: { theme: "dark", accentColor: null, atmosphereImageUrl: null },
    },
    takes: lines.map((line, index) => ({
      id: `take-${line.id}`,
      recordingId: "recording-1",
      status: "captured",
      audioUrl: null,
      audioContentType: null,
      audioSizeBytes: null,
      createdAt: now,
      updatedAt: now,
      snapshot: {
        v: 1,
        sourceKey: line.id,
        sourceMessageId: line.id,
        sourceEventId: null,
        speakerId: line.speakerId,
        speakerName: line.speakerName,
        spokenText: line.text,
        performanceText: null,
        mode: "english",
        requestedEngine: "elevenlabs",
        resolvedEngine: "elevenlabs",
        profile: {
          v: 1,
          baseVoiceId: `base-${index}`,
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
          elevenLabsVoiceId: line.voiceId,
        },
        moodKey: line.moodKey ?? "neutral",
        effectsEnabled: true,
        gain: 1,
        stereoPan: 0,
        channel: "primary",
        seed: `${line.speakerId}:${line.id}`,
        audible: true,
        durationMs: 1_000,
        alignment: null,
      },
    })),
  };
}

describe("Signal Premium voice planning", () => {
  it("batches distinct actors into exact message-boundary Dialogue chunks", () => {
    const line = "x".repeat(980);
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "rick", speakerName: "Rick", voiceId: "rick-voice", text: line },
      { id: "two", speakerId: "morty", speakerName: "Morty", voiceId: "morty-voice", text: line },
      { id: "three", speakerId: "rick", speakerName: "Rick", voiceId: "rick-voice", text: line },
    ]);
    const segments = planReplayPremiumSegments(manifest, takes);
    assert.equal(segments.length, 2);
    assert.equal(segments[0]?.strategy, "dialogue");
    assert.deepEqual(
      segments.flatMap((segment) => segment.inputs.map((input) => input.text)),
      [line, line, line],
    );
    assert.ok(
      segments.every(
        (segment) =>
          segment.inputs.reduce((sum, input) => sum + Array.from(input.text).length, 0) <=
          REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS,
      ),
    );
  });

  it("isolates bots that share one actor and preserves stable per-bot seeds", () => {
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "rick", speakerName: "Rick", voiceId: "shared-actor", text: "Listen, Morty." },
      { id: "two", speakerId: "morty", speakerName: "Morty", voiceId: "shared-actor", text: "Aw geez." },
    ]);
    const first = planReplayPremiumSegments(manifest, takes);
    const second = planReplayPremiumSegments(manifest, takes);
    assert.deepEqual(first.map((segment) => segment.strategy), ["isolated_tts", "isolated_tts"]);
    assert.deepEqual(first.map((segment) => segment.inputHash), second.map((segment) => segment.inputHash));
  });

  it("keeps single-actor runs as complete per-message TTS segments", () => {
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "host", speakerName: "Host", voiceId: "host-voice", text: "First." },
      { id: "two", speakerId: "host", speakerName: "Host", voiceId: "host-voice", text: "Second." },
    ]);
    const segments = planReplayPremiumSegments(manifest, takes);
    assert.deepEqual(
      segments.map((segment) => ({
        strategy: segment.strategy,
        messages: segment.inputs.map((input) => input.sourceMessageId),
      })),
      [
        { strategy: "isolated_tts", messages: ["one"] },
        { strategy: "isolated_tts", messages: ["two"] },
      ],
    );
  });

  it("sanitizes isolated shared-actor text and uses distinct stable bot seeds", async () => {
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "rick", speakerName: "Rick", voiceId: "shared-actor", text: "Listen, Morty.", moodKey: "warm" },
      { id: "two", speakerId: "morty", speakerName: "Morty", voiceId: "shared-actor", text: "Aw geez.", moodKey: "warm" },
    ]);
    takes[0]!.snapshot.performanceText = "[walks to the microphone] Listen, Morty.";
    takes[0]!.snapshot.profile = {
      ...takes[0]!.snapshot.profile,
      elevenLabsDirection: "dry",
    };
    const segments = planReplayPremiumSegments(manifest, takes);
    const requests: Array<{ text: string; model_id: string; seed: number }> = [];
    for (const segment of segments) {
      await generateReplayPremiumSegment({
        segment,
        apiKey: "test-key",
        fetchImpl: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as {
            text: string;
            model_id: string;
            seed: number;
          };
          requests.push(body);
          return new Response(JSON.stringify({
            audio_base64: Buffer.from("isolated-audio").toString("base64"),
          }), { status: 200, headers: { "content-type": "application/json" } });
        },
      });
    }
    assert.doesNotMatch(requests[0]?.text ?? "", /walks to the microphone/u);
    assert.match(requests[0]?.text ?? "", /^\[dry\] \[warmly\] Listen, Morty\.$/u);
    assert.equal(requests[0]?.model_id, "eleven_v3");
    assert.notEqual(requests[0]?.seed, requests[1]?.seed);
    const repeatedSeeds: number[] = [];
    for (const segment of segments) {
      await generateReplayPremiumSegment({
        segment,
        apiKey: "test-key",
        fetchImpl: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { seed: number };
          repeatedSeeds.push(body.seed);
          return new Response(JSON.stringify({
            audio_base64: Buffer.from("isolated-audio").toString("base64"),
          }), { status: 200, headers: { "content-type": "application/json" } });
        },
      });
    }
    assert.deepEqual(requests.map((request) => request.seed), repeatedSeeds);
  });

  it("keeps neutral untagged and adds only sparse saved mood direction", () => {
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "a", speakerName: "A", voiceId: "voice-a", text: "Exact *emphasis* remains.", moodKey: "neutral" },
      { id: "two", speakerId: "b", speakerName: "B", voiceId: "voice-b", text: "Warm line.", moodKey: "warm" },
    ]);
    const inputs = planReplayPremiumSegments(manifest, takes).flatMap((segment) => segment.inputs);
    assert.equal(inputs[0]?.text, "Exact *emphasis* remains.");
    assert.match(inputs[1]?.text ?? "", /^\[[^\]]+\] Warm line\.$/u);
  });

  it("maps Dialogue timestamp segments back to saved message IDs", async () => {
    const { manifest, takes } = fixture([
      { id: "one", speakerId: "a", speakerName: "A", voiceId: "voice-a", text: "Hello." },
      { id: "two", speakerId: "b", speakerName: "B", voiceId: "voice-b", text: "Hi." },
    ]);
    const segment = planReplayPremiumSegments(manifest, takes)[0]!;
    const generated = await generateReplayPremiumSegment({
      segment,
      apiKey: "test-key",
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { inputs: Array<{ text: string }> };
        assert.deepEqual(body.inputs.map((input) => input.text), ["Hello.", "Hi."]);
        return new Response(JSON.stringify({
          audio_base64: Buffer.from("premium-audio").toString("base64"),
          voice_segments: [
            { dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: 0.7 },
            { dialogue_input_index: 1, start_time_seconds: 0.7, end_time_seconds: 1.2 },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    assert.deepEqual(generated.timings, [
      { sourceMessageId: "one", startMs: 0, endMs: 700, alignment: null },
      { sourceMessageId: "two", startMs: 700, endMs: 1_200, alignment: null },
    ]);
  });
});
