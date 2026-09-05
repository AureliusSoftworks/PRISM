import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botcastEpisodeModelSelectionKind,
  signalEpisodeModelPickerValue,
  type BotcastEpisode,
  type BotcastReplayEvent,
} from "./botcast.ts";

function routingEvent(
  modelSelectionKind: "auto" | "fixed",
): BotcastReplayEvent {
  return {
    id: "routing-1",
    episodeId: "ep-1",
    sequence: 1,
    kind: "routing",
    payload: {
      v: 1,
      lane: "online",
      modelSelectionKind,
      candidateAllowlist: [],
      fallbackChain: [],
      policyVersion: 1,
    },
    occurredAt: "2026-08-04T00:00:00.000Z",
  };
}

function episodeWith(
  events: BotcastReplayEvent[],
  model: string | null = "gpt-4o-mini",
): Pick<BotcastEpisode, "events" | "model"> {
  return { events, model };
}

describe("signalEpisodeModelPickerValue", () => {
  it("keeps showing Auto while a live Auto episode runs a concrete model", () => {
    assert.equal(
      signalEpisodeModelPickerValue({
        liveSessionActive: true,
        episode: episodeWith([routingEvent("auto")], "gpt-4o-mini"),
        draft: "",
        availableModelIds: ["gpt-4o-mini", "claude-sonnet-4-6"],
      }),
      "",
    );
  });

  it("shows the frozen fixed model while a live fixed episode is locked", () => {
    assert.equal(
      signalEpisodeModelPickerValue({
        liveSessionActive: true,
        episode: episodeWith([routingEvent("fixed")], "claude-sonnet-4-6"),
        draft: "",
        availableModelIds: ["gpt-4o-mini", "claude-sonnet-4-6"],
      }),
      "claude-sonnet-4-6",
    );
  });

  it("uses the draft before an episode is live", () => {
    assert.equal(
      signalEpisodeModelPickerValue({
        liveSessionActive: false,
        episode: episodeWith([routingEvent("auto")], "gpt-4o-mini"),
        draft: "gpt-4o-mini",
        availableModelIds: ["gpt-4o-mini"],
      }),
      "gpt-4o-mini",
    );
  });

  it("reads Auto vs fixed from the routing event", () => {
    assert.equal(
      botcastEpisodeModelSelectionKind(
        episodeWith([routingEvent("auto")]) as Pick<BotcastEpisode, "events">,
      ),
      "auto",
    );
    assert.equal(
      botcastEpisodeModelSelectionKind(
        episodeWith([routingEvent("fixed")]) as Pick<BotcastEpisode, "events">,
      ),
      "fixed",
    );
    assert.equal(
      botcastEpisodeModelSelectionKind({ events: [] }),
      null,
    );
  });
});
