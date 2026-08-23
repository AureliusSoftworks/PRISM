import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PRE_SPEECH_BREATH_URLS,
  hasAuthoredBreathDirection,
  preSpeechBreathPlaybackTiming,
  resolvePreSpeechBreathPlan,
} from "./preSpeechBreath.ts";

const LONG_LINE =
  "I have been thinking about that carefully, and there is one part of the answer that matters most.";

describe("pre-speech breath planning", () => {
  it("is deterministic and only chooses bundled neutral assets", () => {
    const args = {
      seed: "episode-4:message-8",
      text: LONG_LINE,
      surface: "signal" as const,
      mood: "strained" as const,
    };
    const first = resolvePreSpeechBreathPlan(args);
    assert.deepEqual(first, resolvePreSpeechBreathPlan(args));
    if (first) {
      assert.ok(
        (PRE_SPEECH_BREATH_URLS[first.intensity] as readonly string[]).includes(
          first.url,
        ),
      );
      assert.ok(first.gain > 0 && first.gain < 1);
      assert.ok(first.voiceOverlapMs >= 90 && first.voiceOverlapMs <= 180);
    }
  });

  it("ships every planned breath as a substantive local audio asset", () => {
    for (const url of Object.values(PRE_SPEECH_BREATH_URLS).flat()) {
      const asset = new URL(`../../public/${url.slice(1)}`, import.meta.url);
      assert.ok(statSync(asset).size > 8_000, url);
    }
  });

  it("uses deterministic short pre-rolls with a protected speech onset", () => {
    const plan = {
      url: PRE_SPEECH_BREATH_URLS.natural[0]!,
      intensity: "natural" as const,
      gain: 0.66,
      voiceOverlapMs: 140,
    };
    const timing = preSpeechBreathPlaybackTiming(plan, 758);
    assert.deepEqual(timing, {
      playbackDurationMs: 480,
      voiceStartOffsetMs: 340,
      releaseFadeMs: 90,
    });
    assert.deepEqual(timing, preSpeechBreathPlaybackTiming(plan, 758));

    const shortAssetTiming = preSpeechBreathPlaybackTiming(plan, 120);
    assert.deepEqual(shortAssetTiming, {
      playbackDurationMs: 120,
      voiceStartOffsetMs: 0,
      releaseFadeMs: 90,
    });

    for (const intensity of ["micro", "natural", "deliberate"] as const) {
      const bounded = preSpeechBreathPlaybackTiming(
        { ...plan, intensity },
        1_000,
      );
      assert.ok(bounded.voiceStartOffsetMs < 500, intensity);
      assert.ok(bounded.voiceStartOffsetMs < bounded.playbackDurationMs, intensity);
    }
  });

  it("stays sparse while favoring Signal's close-micro studio", () => {
    const countFor = (
      surface: "chat" | "coffee" | "debate" | "signal" | "story",
    ) =>
      Array.from({ length: 1_000 }, (_, index) =>
        resolvePreSpeechBreathPlan({
          seed: `sample-${index}`,
          text: LONG_LINE,
          surface,
          mood: "neutral",
        }),
      ).filter(Boolean).length;
    const chatCount = countFor("chat");
    const debateCount = countFor("debate");
    const signalCount = countFor("signal");
    const storyCount = countFor("story");
    assert.ok(chatCount >= 150 && chatCount <= 250, `chat=${chatCount}`);
    assert.ok(
      signalCount >= 290 && signalCount <= 390,
      `signal=${signalCount}`,
    );
    assert.ok(
      debateCount >= 230 && debateCount <= 330,
      `debate=${debateCount}`,
    );
    assert.ok(storyCount >= 110 && storyCount <= 210, `story=${storyCount}`);
    assert.ok(signalCount > chatCount && chatCount > storyCount);
    assert.ok(signalCount > debateCount && debateCount > chatCount);
  });

  it("skips short lines, authored breath directions, and disabled effects", () => {
    assert.equal(
      resolvePreSpeechBreathPlan({
        seed: "short",
        text: "Yes, absolutely.",
        surface: "chat",
      }),
      null,
    );
    assert.equal(
      resolvePreSpeechBreathPlan({
        seed: "authored",
        text: LONG_LINE,
        surface: "signal",
        authoredPerformanceText: `[breathes deeply] ${LONG_LINE}`,
      }),
      null,
    );
    assert.equal(
      resolvePreSpeechBreathPlan({
        seed: "disabled",
        text: LONG_LINE,
        surface: "coffee",
        enabled: false,
      }),
      null,
    );
    assert.equal(
      resolvePreSpeechBreathPlan({
        seed: "breathless",
        text: LONG_LINE,
        surface: "chat",
        breathless: true,
      }),
      null,
    );
    assert.equal(
      hasAuthoredBreathDirection("*takes a breath* Then answers."),
      true,
    );
    assert.equal(
      hasAuthoredBreathDirection("The room needs breathing space."),
      false,
    );
    assert.equal(hasAuthoredBreathDirection("slow respirator rhythm"), true);
  });
});

describe("pre-speech breath integration", () => {
  it("routes every immersive bot surface through the shared planner", () => {
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    for (const surface of ["chat", "coffee", "signal", "story"] as const) {
      assert.match(pageSource, new RegExp(`surface: ["']${surface}["']`, "u"));
    }
    assert.match(
      pageSource,
      /surface: playbackSurface[\s\S]{0,120}authoredPerformanceText: message\.voicePerformanceText/u,
    );
    assert.match(
      pageSource,
      /!signalStageSoundcheckMessageIsEphemeral\(message\)/u,
    );
    assert.match(
      pageSource,
      /const preSpeechBreath = playerMessage\s*\? null/u,
    );
    assert.match(
      pageSource,
      /playbackSurface: "signal" \| "debate" = "signal"/u,
    );
    assert.match(pageSource, /surface: playbackSurface/u);
    assert.match(pageSource, /"debate",\s*utterance\.format/u);
    assert.match(pageSource, /breathless: botPowerIsBreathlessV1/u);
    assert.match(pageSource, /breathless: speakerBreathless/u);
  });

  it("plays presence before speech and lets missing assets fail silently", () => {
    const effectsSource = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    assert.match(effectsSource, /fetch\(url, \{ cache: "force-cache" \}\)/u);
    assert.match(effectsSource, /\.catch\(\(\) => null\)/u);
    assert.match(effectsSource, /activeVoiceChannels\.presence/u);
    assert.match(effectsSource, /PRE_SPEECH_BREATH_LOAD_BUDGET_MS = 120/u);
    assert.match(effectsSource, /preSpeechBreathPlaybackTiming\(/u);
    assert.match(effectsSource, /source\.start\(startedAt, 0, playbackDurationSeconds\)/u);
    assert.match(effectsSource, /voiceStartsAt/u);
    assert.match(effectsSource, /attackSeconds/u);
    assert.match(effectsSource, /highpass\.frequency\.value = 140/u);
    assert.match(effectsSource, /lowpass\.frequency\.value = 7_000/u);
    assert.doesNotMatch(effectsSource, /postGapMs/u);
    const signalSource = readFileSync(
      new URL("./signalStudioCutAudio.ts", import.meta.url),
      "utf8",
    );
    assert.match(signalSource, /preSpeechBreathPlaybackTiming\(/u);
    assert.match(signalSource, /cursorMs - breathTiming\.voiceStartOffsetMs/u);
    assert.match(signalSource, /sourceDurationSeconds: breathTiming\.playbackDurationMs \/ 1_000/u);
    assert.match(signalSource, /fadeOutMs: breathTiming\.releaseFadeMs/u);
    assert.ok(
      englishSource.indexOf("await playPreSpeechBreath") <
        englishSource.indexOf("played = await playRealtimeVoiceBytes"),
    );
    assert.ok(
      bottishSource.indexOf("await playPreSpeechBreath") <
        bottishSource.indexOf("const played = await playRealtimeVoiceBytes"),
    );
  });
});
