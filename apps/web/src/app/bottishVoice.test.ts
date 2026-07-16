import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildBottishPlan,
  buildBabbleRoboticPlan,
  encodeBottishPlanWave,
  FIXED_BOTTISH_TONE,
  fitBottishPlanToDuration,
  scaleBottishPlanForDeliveryRate,
  mixBabbleMediaWave,
  normalizeBottishPlaybackProfile,
  prepareBottishVoice,
  readBabbleVoiceSynthesisClip,
  stopBottishVoice,
} from "./bottishVoice.ts";

const neutral = {
  v: 1 as const,
  baseVoiceId: "voice-1" as const,
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
};

describe("Bottish speech plan", () => {
  it("changes mood delivery tempo without reviving authored Bottish pace", () => {
    const source = buildBottishPlan("Mood changes this line.", neutral, "mood-rate");
    const joyful = scaleBottishPlanForDeliveryRate(source, 1.18);
    const strained = scaleBottishPlanForDeliveryRate(source, 0.94);
    assert.ok(joyful.durationMs < source.durationMs);
    assert.ok(strained.durationMs > source.durationMs);
    assert.equal(
      joyful.alignment.characters.join(""),
      source.alignment.characters.join(""),
    );
  });

  it("falls back procedurally for a startup-era metadata-only response", async () => {
    const legacyResponse = Response.json({
      ok: true,
      synthesis: { text: "beep boop" },
    });
    assert.equal(await readBabbleVoiceSynthesisClip(legacyResponse), null);

    const timedResponse = Response.json({
      ok: true,
      audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
      audioContentType: "audio/wav",
      alignment: null,
    });
    const clip = await readBabbleVoiceSynthesisClip(timedResponse);
    assert.ok(clip);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [1, 2, 3]);
  });

  it("is deterministic for a message and profile", () => {
    assert.deepEqual(
      buildBottishPlan("Hello, bot!", neutral, "message-1"),
      buildBottishPlan("Hello, bot!", neutral, "message-1")
    );
  });

  it("maps Pitch and base voice into audible plan changes", () => {
    const base = buildBottishPlan("Testing voice controls.", neutral, "same");
    const changed = buildBottishPlan(
      "Testing voice controls.",
      {
        v: 1,
        baseVoiceId: "voice-4",
        pitch: 0.8,
        warmth: 0,
        pace: 0,
        lilt: 0.9,
      },
      "same"
    );
    assert.notEqual(changed.notes[0]?.frequencyHz, base.notes[0]?.frequencyHz);
    assert.notEqual(changed.notes[1]?.frequencyHz, base.notes[1]?.frequencyHz);
  });

  it("builds deterministic clean Babble accents with bounded processing", () => {
    const lowSavedTone = buildBabbleRoboticPlan(
      "A longer conversational reply with enough syllables for robot punctuation.",
      { ...neutral, signal: -1 },
      "hybrid"
    );
    const highSavedTone = buildBabbleRoboticPlan(
      "A longer conversational reply with enough syllables for robot punctuation.",
      { ...neutral, signal: 1 },
      "hybrid"
    );
    assert.deepEqual(
      lowSavedTone,
      highSavedTone,
    );
    assert.deepEqual(
      highSavedTone,
      buildBabbleRoboticPlan(
        "A longer conversational reply with enough syllables for robot punctuation.",
        { ...neutral, signal: 1 },
        "hybrid"
      )
    );
    assert.ok(highSavedTone.accents.length <= 28);
    assert.ok(highSavedTone.accents.length >= 18);
    assert.ok(highSavedTone.accents.every((accent) => accent.gain <= 0.16));
    assert.ok(highSavedTone.gates.every((gate) => gate.depth <= 0.12));
    assert.ok(highSavedTone.gates.every((gate) => gate.durationMs <= 24));
    assert.equal(highSavedTone.drive, 0);
    assert.equal(highSavedTone.buzzDepth, 0);
    assert.equal(highSavedTone.lowpassHz, 20_000);
    assert.equal(highSavedTone.bitDepth, 16);
    assert.equal(highSavedTone.sampleHoldFrames, 1);
  });

  it("bakes deterministic robot accents into the media fallback WAV", () => {
    const silentCarrier = encodeBottishPlanWave({
      notes: [],
      durationMs: 1_200,
      alignment: {
        characters: [],
        characterStartTimesSeconds: [],
        characterEndTimesSeconds: [],
      },
    });
    const mixed = mixBabbleMediaWave(
      silentCarrier,
      "The robot fallback should still sound like Bottish.",
      neutral,
      "media-hybrid",
      true,
    );
    assert.deepEqual(
      new Uint8Array(mixed),
      new Uint8Array(mixBabbleMediaWave(
        silentCarrier,
        "The robot fallback should still sound like Bottish.",
        neutral,
        "media-hybrid",
        true,
      )),
    );
    assert.deepEqual(
      new Uint8Array(mixed),
      new Uint8Array(mixBabbleMediaWave(
        silentCarrier,
        "The robot fallback should still sound like Bottish.",
        neutral,
        "media-hybrid",
      )),
    );
    assert.ok(new Int16Array(mixed, 44).some((sample) => sample !== 0));
  });

  it("leaves the media fallback WAV untouched when voice effects are disabled", () => {
    const silentCarrier = encodeBottishPlanWave({
      notes: [],
      durationMs: 1_200,
      alignment: {
        characters: [],
        characterStartTimesSeconds: [],
        characterEndTimesSeconds: [],
      },
    });
    const originalBytes = new Uint8Array(silentCarrier.slice(0));
    const unmixed = mixBabbleMediaWave(
      silentCarrier,
      "The clean fallback should remain clean.",
      neutral,
      "media-hybrid-clean",
      false,
    );

    assert.strictEqual(unmixed, silentCarrier);
    assert.deepEqual(new Uint8Array(unmixed), originalBytes);
  });

  it("ignores legacy Tone, Lilt, Pace, and Warmth values", () => {
    const base = buildBottishPlan("Testing removed controls.", neutral, "same");
    const legacyValues = buildBottishPlan(
      "Testing removed controls.",
      { ...neutral, pace: 1, warmth: -1, lilt: 1, signal: -1 },
      "same"
    );
    assert.deepEqual(legacyValues, base);
  });

  it("keeps the neutral mix bright and clearly audible", () => {
    const plan = buildBottishPlan("Hello, bot!", neutral, "audibility");
    assert.ok((plan.notes[0]?.gain ?? 0) >= 0.25);
    assert.ok((plan.notes[0]?.lowpassHz ?? 0) >= 6000);
  });

  it("ignores persisted tone values and normalizes synthesis to the safe fixed tone", () => {
    const lowSavedTone = buildBottishPlan(
      "Signal check",
      { ...neutral, signal: -1 },
      "signal"
    );
    const highSavedTone = buildBottishPlan(
      "Signal check",
      { ...neutral, signal: 1 },
      "signal"
    );
    assert.deepEqual(lowSavedTone, highSavedTone);
    assert.equal(
      normalizeBottishPlaybackProfile({ ...neutral, signal: -1 }).bottishTone,
      FIXED_BOTTISH_TONE,
    );
    assert.equal(
      normalizeBottishPlaybackProfile({ ...neutral, signal: 1 }).bottishTone,
      FIXED_BOTTISH_TONE,
    );
  });

  it("renders a playable PCM wave for the media fallback", () => {
    const plan = buildBottishPlan("Hello there.", neutral, "media-fallback");
    const wave = encodeBottishPlanWave(plan);
    const view = new DataView(wave);
    assert.equal(String.fromCharCode(...new Uint8Array(wave, 0, 4)), "RIFF");
    assert.equal(view.getUint32(24, true), 24_000);
    assert.ok(new Int16Array(wave, 44).some((sample) => sample !== 0));
  });

  it("pre-authorizes and reuses media fallback playback", () => {
    const source = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    assert.match(source, /export async function prepareBottishVoice\(\)[\s\S]*?beginMediaUnlock\(\);/);
    assert.match(
      source,
      /export async function prepareBottishVoice\(\)[\s\S]*?if \(preparedMedia\)[\s\S]*?return;[\s\S]*?beginMediaUnlock\(\);/
    );
    assert.match(source, /const audio = preparedMedia \?\? new Audio\(\)/);
    assert.match(source, /releaseActiveMedia\(!error\)/);
  });

  it("keeps the authorized fallback element across a conversation handoff", async () => {
    const originalAudio = globalThis.Audio;
    const instances: FakeAudio[] = [];
    class FakeAudio {
      src: string;
      preload = "";
      volume = 1;
      currentTime = 0;

      constructor(src = "") {
        this.src = src;
        instances.push(this);
      }

      play(): Promise<void> {
        return Promise.resolve();
      }

      pause(): void {}
      load(): void {}
      removeAttribute(name: string): void {
        if (name === "src") this.src = "";
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      writable: true,
      value: FakeAudio,
    });
    try {
      await prepareBottishVoice();
      const authorized = instances[0];
      assert.ok(authorized);

      stopBottishVoice({ preservePreparedMedia: true });
      await prepareBottishVoice();

      assert.equal(instances.length, 1);
      assert.equal(instances[0], authorized);
      stopBottishVoice();
    } finally {
      stopBottishVoice();
      if (typeof originalAudio === "undefined") {
        Reflect.deleteProperty(globalThis, "Audio");
      } else {
        Object.defineProperty(globalThis, "Audio", {
          configurable: true,
          writable: true,
          value: originalAudio,
        });
      }
    }
  });

  it("preserves the send gesture's media unlock until live Zen playback", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const effectStart = pageSource.indexOf("const shouldRun =\n      view === \"chat\"");
    const effectEnd = pageSource.indexOf("const zenLiveReplyActionText", effectStart);
    assert.notEqual(effectStart, -1);
    assert.notEqual(effectEnd, -1);
    const liveBottishEffect = pageSource.slice(effectStart, effectEnd);
    assert.match(liveBottishEffect, /liveBottishRevealKeyRef\.current = revealKey;/);
    assert.match(
      liveBottishEffect,
      /stopBottishVoice\(\{ preservePreparedMedia: true \}\);/
    );
    assert.match(liveBottishEffect, /enqueueRobotVoiceMode\(\{/);
    assert.match(liveBottishEffect, /mode: liveRobotVoiceMode/);
    assert.doesNotMatch(
      liveBottishEffect,
      /liveBottishRevealKeyRef\.current = revealKey;[\s\S]*?stopBottishVoice\(\);[\s\S]*?enqueueRobotVoiceMode\(\{/
    );

    const conversationChangeStart = pageSource.indexOf(
      "const conversationChanged = voiceConversationIdRef.current !== detail.id"
    );
    const conversationChangeEnd = pageSource.indexOf(
      "const unseen = assistantMessages.filter",
      conversationChangeStart
    );
    const conversationChange = pageSource.slice(
      conversationChangeStart,
      conversationChangeEnd
    );
    assert.match(
      conversationChange,
      /stopBottishVoice\(\{[\s\S]*?preservePreparedMedia:[\s\S]*?settings\?\.voiceMode === "bottish"[\s\S]*?settings\?\.voiceMode === "babble"/
    );
  });

  it("caps extremely long replies", () => {
    const plan = buildBottishPlan("a".repeat(5000), neutral, "long");
    assert.equal(plan.notes.length, 420);
  });

  it("fits Bottish to the visible streaming window", () => {
    const original = buildBottishPlan("A streamed reply with several words.", neutral, "stream");
    const fitted = fitBottishPlanToDuration(original, original.durationMs + 640);
    assert.equal(fitted.durationMs, original.durationMs + 640);
    assert.equal(fitted.notes.length, original.notes.length);
    assert.equal(fitted.notes[0]?.frequencyHz, original.notes[0]?.frequencyHz);
    assert.ok((fitted.notes.at(-1)?.startMs ?? 0) < fitted.durationMs);
  });

  it("never speeds Bottish up to fit a short streaming window", () => {
    const original = buildBottishPlan("A streamed reply with several words.", neutral, "no-turbo");
    const fitted = fitBottishPlanToDuration(original, 640);
    assert.equal(fitted, original);
  });

  it("keeps the natural duration when no streaming window is supplied", () => {
    const original = buildBottishPlan("Natural preview timing.", neutral, "preview");
    assert.equal(fitBottishPlanToDuration(original, undefined), original);
  });

  it("carries character timing for audio-driven text reveal", () => {
    const plan = buildBottishPlan("Hi, bot!", neutral, "aligned");
    assert.equal(plan.alignment.characters.join(""), "Hi, bot!");
    assert.equal(plan.alignment.characterStartTimesSeconds.length, 8);
    assert.equal(
      plan.alignment.characterEndTimesSeconds.every((end, index) =>
        end >= (plan.alignment.characterStartTimesSeconds[index] ?? 0)
      ),
      true
    );
  });
});
