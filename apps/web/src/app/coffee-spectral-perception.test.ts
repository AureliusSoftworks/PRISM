import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Coffee spectral replay presentation", () => {
  it("requests replay observer truth and restores live observer messages on exit", () => {
    assert.match(pageSource, /transcript\?perspective=replay/u);
    assert.match(
      pageSource,
      /coffeeLiveObserverMessagesRef\.current = sourceConversation\.messages/u,
    );
    assert.match(
      pageSource,
      /const liveMessages = coffeeLiveObserverMessagesRef\.current[\s\S]{0,500}messages: liveMessages/u,
    );
  });

  it("mixes full perception overlap on two spatial channels at minus three dB", () => {
    assert.match(pageSource, /event\.kind === "perceptionOverlap"/u);
    assert.match(
      pageSource,
      /nextLen >= Math\.ceil\(fullLength \* perceptionOverlapEvent\.startRatio\)/u,
    );
    assert.match(
      pageSource,
      /playCoffeePerceptionOverlapVoice\(overlappingMessage\)/u,
    );
    assert.match(pageSource, /channel: "crosstalk"/u);
    assert.match(pageSource, /stereoPan:[\s\S]{0,80}-0\.42 : 0\.42/u);
    assert.ok(
      pageSource.match(/Math\.SQRT1_2/gu)?.length ?? 0 >= 2,
      "both replay voices should be attenuated by 3 dB",
    );
  });

  it("shows two labeled caption lanes and stops overlap during transport changes", () => {
    assert.match(pageSource, /data-perception-overlap="true"/u);
    assert.match(pageSource, /styles\.coffeePerceptionOverlapLane/u);
    assert.match(
      pageCss,
      /\.coffeePerceptionOverlapLane\s*\{[\s\S]{0,500}\}/u,
    );
    assert.ok(
      pageSource.match(/coffeePerceptionOverlapVoiceAbortRef\.current\?\.abort\(\)/gu)
        ?.length ?? 0 >= 4,
      "pause, seek, step, and state exit should stop the overlap channel",
    );
    assert.match(
      pageSource,
      /replayPerceptionOverlapMessage\?\.botId === bot\.id/u,
    );
  });
});
