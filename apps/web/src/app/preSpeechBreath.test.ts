import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PRE_SPEECH_BREATH_URLS,
  hasAuthoredBreathDirection,
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

  it("stays sparse while favoring Signal's close-micro studio", () => {
    const countFor = (surface: "chat" | "coffee" | "signal" | "story") =>
      Array.from({ length: 1_000 }, (_, index) =>
        resolvePreSpeechBreathPlan({
          seed: `sample-${index}`,
          text: LONG_LINE,
          surface,
          mood: "neutral",
        }),
      ).filter(Boolean).length;
    const chatCount = countFor("chat");
    const signalCount = countFor("signal");
    const storyCount = countFor("story");
    assert.ok(chatCount >= 150 && chatCount <= 250, `chat=${chatCount}`);
    assert.ok(
      signalCount >= 290 && signalCount <= 390,
      `signal=${signalCount}`,
    );
    assert.ok(storyCount >= 110 && storyCount <= 210, `story=${storyCount}`);
    assert.ok(signalCount > chatCount && chatCount > storyCount);
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
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const surface of ["chat", "coffee", "signal", "story"] as const) {
      assert.match(pageSource, new RegExp(`surface: ["']${surface}["']`, "u"));
    }
    assert.match(
      pageSource,
      /authoredPerformanceText: \[[\s\S]{0,120}performanceText,[\s\S]{0,120}profile\.elevenLabsDirection/u,
    );
    assert.match(pageSource, /!signalStageSoundcheckMessageIsEphemeral\(message\)/u);
    assert.match(pageSource, /const preSpeechBreath = playerMessage\s*\? null/u);
  });

  it("plays presence before speech and lets missing assets fail silently", () => {
    const effectsSource = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const englishSource = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    const bottishSource = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    assert.match(effectsSource, /fetch\(url, \{ cache: "force-cache" \}\)/u);
    assert.match(effectsSource, /\.catch\(\(\) => null\)/u);
    assert.match(effectsSource, /activeVoiceChannels\.presence/u);
    assert.match(effectsSource, /voiceStartsAt/u);
    assert.doesNotMatch(effectsSource, /postGapMs/u);
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
