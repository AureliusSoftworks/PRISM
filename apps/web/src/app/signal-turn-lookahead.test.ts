import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const preparationWaitSource = readFileSync(
  new URL("./signalTurnPreparationWait.ts", import.meta.url),
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

  it("waits on the server instead of polling speculative turns on the UI thread", () => {
    assert.match(
      preparationWaitSource,
      /SIGNAL_PREPARATION_POLL_WAIT_MS/u,
    );
    assert.doesNotMatch(signalSource, /SIGNAL_PREPARATION_POLL_MS/u);
  });

  it("gives speculative generation a bounded runway before foreground recovery", () => {
    assert.match(
      preparationWaitSource,
      /SIGNAL_PREPARATION_MAX_WAIT_MS = 30_000/u,
    );
    assert.match(signalSource, /preparationTimedOut/u);
    assert.match(signalSource, /preparation_timeout/u);
    assert.match(
      signalSource,
      /preparationTimedOut[\s\S]{0,260}?discardPreparedAdvance/u,
      "a timed-out speculative job must be cancelled before foreground recovery",
    );
  });

  it("authorizes voice prefetch against the exact prepared turn", () => {
    assert.match(
      signalSource,
      /onPrefetchUtterance\?\.\([\s\S]{0,900}?signalTurnPreparationId: preparation\.id/u,
    );
    assert.match(
      signalSource,
      /utterance\.signalListenerReactionPlan[\s\S]{0,900}?onPrefetchListenerReaction\?\.\([\s\S]{0,900}?signalTurnPreparationId: preparation\.id/u,
    );
  });

  it("invalidates prepared audio when a cue, stale commit, or reroute overtakes it", () => {
    assert.match(
      signalSource,
      /prepared\.prefetchedMessageId[\s\S]{0,180}?onInvalidatePrefetchedUtterance/u,
    );
    assert.match(
      signalSource,
      /catch\(\(commitError[\s\S]{0,500}?onInvalidatePrefetchedUtterance/u,
    );
    assert.match(
      signalSource,
      /response\.message\.content !== committedProvisional\.text[\s\S]{0,180}?onInvalidatePrefetchedUtterance/u,
    );
  });

  it("prefetches every known Watch line and waits for Premium readiness before playback", () => {
    assert.match(
      signalSource,
      /const prefetchKnownWatchEpisodeVoices = useCallback/u,
    );
    assert.match(
      signalSource,
      /for \(const message of currentEpisode\.messages\)[\s\S]{0,700}?onPrefetchUtterance\(message, bot\)/u,
    );
    assert.match(
      signalSource,
      /await prefetchKnownWatchEpisodeVoices\(bakedEpisode\);/u,
    );
    assert.match(
      signalSource,
      /await beginEpisodeIntroBookend\(watchBookend, presentationEpisode\.id\);[\s\S]{0,260}?setEpisodePreRoll\(null\)/u,
    );
  });

  it("releases a prepared turn a Producer cue has overtaken", () => {
    assert.match(
      signalSource,
      /discardPreparedAdvance\("A Producer cue redirects the host's next turn\."\)/u,
    );
  });
});
