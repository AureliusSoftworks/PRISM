import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

function sourceBlock(marker: string): string {
  const start = signalSource.indexOf(marker);
  assert.notEqual(start, -1, `${marker} is no longer in the Signal source`);
  const end = signalSource.indexOf("\n      };", start);
  assert.notEqual(end, -1, `${marker} no longer reads as a single block`);
  return signalSource.slice(start, end);
}

describe("Signal turn lookahead", () => {
  it("records the wait it just measured before preparing the next turn", () => {
    const block = sourceBlock("const notifyPlaybackStart");
    const holdAt = block.indexOf("onPlaybackStart?.()");
    const prepareAt = block.indexOf("prepareNextTurn");
    assert.notEqual(holdAt, -1, "playback start no longer closes the hold");
    assert.notEqual(prepareAt, -1, "playback start no longer prepares ahead");
    assert.equal(
      holdAt < prepareAt,
      true,
      // A hold written after the preparation snapshot claims the same episode
      // event sequence, so the prepared turn is rejected at commit and the
      // audience sits through the generation the lookahead was hiding.
      "the session-clock hold must be recorded before the next turn is prepared",
    );
  });

  it("keeps the episode running when a prepared turn cannot commit", () => {
    assert.match(signalSource, /requestForegroundAdvance/u);
    assert.match(
      signalSource,
      /turn-preparations[\s\S]{0,400}?\/commit[\s\S]{0,400}?catch\(\s*\(commitError/u,
    );
  });

  it("releases a prepared turn a Producer cue has overtaken", () => {
    assert.match(
      signalSource,
      /discardPreparedAdvance\("A Producer cue redirects the host's next turn\."\)/u,
    );
  });
});
