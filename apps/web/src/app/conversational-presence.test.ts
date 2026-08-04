import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signal = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debate = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const tutorials = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("conversational presence surfaces", () => {
  it("keeps Coffee lookahead private until a cursor-checked commit", () => {
    assert.match(
      page,
      /\/api\/coffee\/sessions\/\$\{encodeURIComponent\(conversation\.id\)\}\/turn-preparations/u,
    );
    assert.match(
      page,
      /preparedStatus\?\.phase === "ready"[\s\S]{0,500}\/api\/turn-preparations\/\$\{encodeURIComponent\(preparedStatus\.id\)\}\/commit/u,
    );
    assert.match(page, /prepareCoffeeLookaheadRef\.current\(args\.conversation, pendingMessage\)/u);
    assert.match(page, /discardCoffeePreparedTurn\("The player changed the Coffee table state\."\)/u);
  });

  it("prepares Signal handoffs only after playback begins and invalidates on direction", () => {
    assert.match(
      signal,
      /notifyPlaybackStart[\s\S]{0,180}prepareNextTurn\(\)/u,
    );
    assert.match(
      signal,
      /\/api\/botcast\/episodes\/\$\{encodeURIComponent\(currentEpisode\.id\)\}\/turn-preparations/u,
    );
    assert.match(
      signal,
      /readyPreparation[\s\S]{0,500}\/api\/turn-preparations\/\$\{encodeURIComponent\(readyPreparation\.id\)\}\/commit/u,
    );
    assert.match(signal, /discardPreparedAdvance\("Signal state changed before handoff\."\)/u);
  });

  it("prepares every Debate utterance without advancing Proceedings", () => {
    assert.match(
      debate,
      /\/api\/debates\/\$\{encodeURIComponent\(session\.id\)\}\/turn-preparations/u,
    );
    assert.match(
      debate,
      /for \(const utterance of current\.provisionalUtterances\)/u,
    );
    assert.match(
      debate,
      /prepared\.revision === previous\.revision[\s\S]{0,360}\/api\/turn-preparations\/\$\{encodeURIComponent\(prepared\.id\)\}\/commit/u,
    );
    assert.match(
      debate,
      /setTranscriptVisibleThroughSequence\([\s\S]{0,180}previous\?\.events\.at\(-1\)\?\.sequence/u,
    );
  });

  it("keeps cues out of Chat and presents show cues as ordinary speech", () => {
    assert.match(page, /BOT_RESPONSE_CUE_MAX_PLAYBACK_MS/u);
    assert.match(page, /exactResponseRequired:[\s\S]{0,100}botRequiresExactResponse/u);
    assert.match(
      page,
      /if \(!botResponseCuesEnabledForSurfaceV1\(args\.surface\)\)/u,
    );
    assert.match(page, /responseCueBot &&\s*view !== "chat"/u);
    assert.match(
      page,
      /const showThinkingIndicator =\s*!activeCoffeeResponseCue/u,
    );
    assert.doesNotMatch(page, /Response cue ·/u);
    assert.doesNotMatch(signal, /Response cue ·|data-response-cue/u);
    assert.match(signal, /<strong>\{presenceBeat\.speaker\.name\}<\/strong>/u);
    assert.doesNotMatch(debate, /Response cue ·|data-response-cue/u);
    assert.match(debate, /<strong>\{beat\.speaker\.name\}<\/strong>/u);
    assert.match(debate, /heardBotPresenceBeatTextV1\(beat\)/u);
    assert.match(
      tutorials,
      /Chat and immersive Zen wait for the real reply instead of inserting a filler response/u,
    );
    assert.match(tutorials, /appears naturally as table speech/u);
    assert.match(tutorials, /appears like any other on-air line/u);
    assert.doesNotMatch(tutorials, /labeled response cue/u);
  });
});
