import assert from "node:assert/strict";
import test from "node:test";
import {
  SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX,
  signalStageSoundcheckExchangeIndex,
  signalStageSoundcheckMessageIsEphemeral,
  signalStageSoundcheckMessages,
} from "./signalStageSoundcheck.ts";

test("Signal stage soundcheck selects bounded local exchange variants", () => {
  assert.equal(signalStageSoundcheckExchangeIndex(0), 0);
  assert.equal(signalStageSoundcheckExchangeIndex(0.999999), 3);
  assert.equal(signalStageSoundcheckExchangeIndex(-5), 0);
  assert.equal(signalStageSoundcheckExchangeIndex(Number.NaN), 0);
});

test("Signal stage soundcheck creates a private host and guest voice exchange", () => {
  const messages = signalStageSoundcheckMessages({
    showId: "show-1",
    hostBotId: "host-1",
    hostName: "Mira",
    guestBotId: "guest-1",
    guestName: "Sol",
    runId: 7,
    exchangeIndex: 2,
    createdAt: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(
    messages.map(({ speakerRole, botId }) => ({ speakerRole, botId })),
    [
      { speakerRole: "host", botId: "host-1" },
      { speakerRole: "guest", botId: "guest-1" },
    ],
  );
  assert.match(messages[0].content, /Sol/u);
  assert.match(messages[1].content, /Mira/u);
  assert.ok(messages.every(signalStageSoundcheckMessageIsEphemeral));
  assert.ok(
    messages.every(({ id, episodeId }) =>
      id.startsWith(episodeId) &&
      episodeId.startsWith(SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX),
    ),
  );
  assert.ok(
    messages.every(({ voicePerformanceText }) => voicePerformanceText === null),
  );
});

test("Signal stage soundcheck never asks a host to level check with itself", () => {
  assert.deepEqual(
    signalStageSoundcheckMessages({
      showId: "show-1",
      hostBotId: "host-1",
      hostName: "Mira",
      guestBotId: "host-1",
      guestName: "Mira",
      runId: 8,
    }),
    [],
  );
});

test("ordinary saved Signal messages are never treated as ephemeral soundchecks", () => {
  assert.equal(
    signalStageSoundcheckMessageIsEphemeral({
      id: "saved-message",
      episodeId: "saved-episode",
    }),
    false,
  );
  assert.equal(
    signalStageSoundcheckMessageIsEphemeral({
      id: `${SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX}show:1:host`,
      episodeId: "saved-episode",
    }),
    false,
  );
});
