import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("Signal live mouth sync", () => {
  it("commits the audible speaking state synchronously at voice start", () => {
    const primaryPlayback = source.indexOf(
      "const voicePlaybackEligible = Boolean(",
    );
    const start = source.indexOf(
      "onStart: (durationMs, alignment) => {",
      primaryPlayback,
    );
    const end = source.indexOf("onSegmentTiming: (timing) => {", start);
    assert.ok(
      primaryPlayback >= 0 && start >= 0 && end > start,
      "Signal primary voice lifecycle must be present",
    );
    const onStart = source.slice(start, end);
    assert.match(onStart, /flushSync\(\(\) => \{[\s\S]{0,220}setLiveSpeech\(/u);
    assert.doesNotMatch(
      onStart,
      /startTransition\(\(\) => \{[\s\S]{0,220}setLiveSpeech\(/u,
      "the mouth owner cannot wait in a transition after audio has begun",
    );
    assert.match(
      source,
      /replayFaithfulBeat &&\s+args\.activeMessage\?\.speakerRole === role[\s\S]{0,100}signalReplayMouthSampleElapsedMs/u,
      "replay correction must not pull an intentional crosstalk mouth forward",
    );
  });
});
