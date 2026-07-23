import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botcastReplayTimeline,
  type BotcastMessage,
  type BotcastReplayEvent,
} from "./botcast.ts";
import {
  SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
  signalPicklesMagicEnabled,
  signalPicklesReactionPending,
  signalPicklesSipAt,
  signalPicklesSipCueForMessage,
  signalPicklesTriggerMessageCount,
  signalProducerBriefWithoutPickles,
} from "./signalPickles.ts";

function message(id: string, speakerRole: "host" | "guest"): BotcastMessage {
  return {
    id,
    episodeId: "episode-1",
    speakerRole,
    botId: `${speakerRole}-bot`,
    content: "A line.",
    stageActionText: null,
    voicePerformanceText: null,
    moodKey: "neutral",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function sipEvent(
  overrides: Partial<BotcastReplayEvent["payload"]> = {},
): BotcastReplayEvent {
  return {
    id: "sip-event",
    episodeId: "episode-1",
    sequence: 4,
    kind: "audio_cue",
    payload: {
      kind: "coffee_sip",
      source: "pickles",
      role: "guest",
      messageId: "message-2",
      atMs: 4_000,
      durationMs: SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
      ...overrides,
    },
    occurredAt: "2026-01-01T00:00:04.000Z",
  };
}

describe("Signal PICKLES beat", () => {
  it("recognizes only the standalone magic word and removes it from prompts", () => {
    assert.equal(signalPicklesMagicEnabled("Make it PICKLES, please."), true);
    assert.equal(signalPicklesMagicEnabled("pickles"), true);
    assert.equal(signalPicklesMagicEnabled("unpickles"), false);
    assert.equal(
      signalProducerBriefWithoutPickles(
        "Explore the premise. PICKLES, then return to the stakes.",
      ),
      "Explore the premise. then return to the stakes.",
    );
    assert.equal(signalProducerBriefWithoutPickles("PICKLES"), "");
  });

  it("chooses one deterministic trigger inside the safe interview window", () => {
    for (const episodeId of ["a", "b", "c", "episode-42"]) {
      const trigger = signalPicklesTriggerMessageCount(episodeId);
      assert.ok(trigger >= 3 && trigger <= 6);
      assert.equal(trigger, signalPicklesTriggerMessageCount(episodeId));
    }
  });

  it("normalizes the saved slow sip and activates it only inside its window", () => {
    const event = sipEvent();
    assert.deepEqual(signalPicklesSipCueForMessage([event], "message-2"), {
      role: "guest",
      messageId: "message-2",
      atMs: 4_000,
      durationMs: SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
    });
    assert.equal(signalPicklesSipAt([event], 3_999), null);
    assert.equal(signalPicklesSipAt([event], 4_000)?.role, "guest");
    assert.equal(
      signalPicklesSipAt(
        [event],
        4_000 + SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
      ),
      null,
    );
    assert.equal(
      signalPicklesSipCueForMessage(
        [sipEvent({ source: "producer" })],
        "message-2",
      ),
      null,
    );
  });

  it("requires the other participant's immediate next turn to react", () => {
    const messages = [message("message-1", "host"), message("message-2", "guest")];
    assert.equal(
      signalPicklesReactionPending({ events: [sipEvent()], messages })?.role,
      "guest",
    );
    assert.equal(
      signalPicklesReactionPending({
        events: [sipEvent()],
        messages: [...messages, message("message-3", "host")],
      }),
      null,
    );
  });

  it("holds the saved replay timeline until the slow sip is back down", () => {
    const messages = [message("message-1", "host"), message("message-2", "guest")];
    const event = sipEvent({ role: "host", messageId: "message-1" });
    const timeline = botcastReplayTimeline(messages, [event]);
    assert.ok(
      timeline.messageStartMs[1]! >=
        4_000 + SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
    );
  });
});
