import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Signal live voice normalization", () => {
  it("shares Coffee's bounded live voice bus while retaining Signal's per-seat intent", () => {
    assert.match(pageSource, /function liveInterviewVoicePlaybackGain/u);
    assert.match(
      pageSource,
      /startCoffeeVoiceForReveal[\s\S]{0,4200}liveInterviewVoicePlaybackGain\(\{/u,
    );
    assert.match(
      pageSource,
      /playBotcastUtterance[\s\S]{0,4800}liveInterviewVoicePlaybackGain\(\{/u,
    );
    assert.match(
      pageSource,
      /participantLevel: voiceLevel/u,
    );
    assert.match(pageSource, /normalizeBotcastVoiceLevel\(args\.participantLevel\)/u);
    assert.match(pageSource, /gain: playbackVolume/u);
  });

  it("feeds Premium and free Signal delivery through the same normalized gain", () => {
    const signalPlayback = pageSource.slice(
      pageSource.indexOf("const playBotcastUtterance = useCallback"),
      pageSource.indexOf("const storyDiscoveredLocationIds", pageSource.indexOf("const playBotcastUtterance = useCallback")),
    );
    assert.match(signalPlayback, /enqueueRobotVoiceMode\([\s\S]{0,1200}globalVolume: playbackVolume/u);
    assert.match(signalPlayback, /enqueueChunkedEnglishVoice\([\s\S]{0,360}playbackVolume/u);
    assert.match(signalPlayback, /enqueueEnglishVoice\([\s\S]{0,360}playbackVolume/u);
    assert.match(
      signalPlayback,
      /loudnessNormalization:\s*playbackSurface === "signal" \? "interview" : undefined/u,
    );
    assert.doesNotMatch(
      signalPlayback,
      /loudnessNormalization:[^\n]*(?:elevenlabs|premium|free|babble|bottish)/iu,
    );
  });
});
