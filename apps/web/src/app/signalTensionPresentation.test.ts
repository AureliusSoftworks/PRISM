import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotcastEpisode, BotcastMessage } from "@localai/shared";
import { signalEpisodeBeforeResponseIsHeard } from "./signalTensionPresentation.ts";

const episode = (overrides: Partial<BotcastEpisode>): BotcastEpisode =>
  ({
    id: "episode-1",
    tensionStage: "calm",
    warningCount: 0,
    ...overrides,
  }) as BotcastEpisode;

const message = (speakerRole: "host" | "guest"): BotcastMessage =>
  ({ id: `${speakerRole}-1`, speakerRole }) as BotcastMessage;

describe("Signal tension presentation", () => {
  it("holds a host-carried transition until the host line is heard", () => {
    const committed = episode({ tensionStage: "resistance" });
    const staged = signalEpisodeBeforeResponseIsHeard({
      previousEpisode: episode({}),
      committedEpisode: committed,
      responseMessage: message("host"),
    });
    assert.equal(staged.tensionStage, "calm");
    assert.equal(committed.tensionStage, "resistance");
  });

  it("shows a guest semantic reaction before the guest answers", () => {
    const committed = episode({ tensionStage: "warning", warningCount: 1 });
    const staged = signalEpisodeBeforeResponseIsHeard({
      previousEpisode: episode({ tensionStage: "resistance" }),
      committedEpisode: committed,
      responseMessage: message("guest"),
    });
    assert.equal(staged, committed);
  });

  it("keeps the final Host sign-off live until its presentation completes", () => {
    const committed = episode({ status: "completed" });
    const staged = signalEpisodeBeforeResponseIsHeard({
      previousEpisode: episode({ status: "live" }),
      committedEpisode: committed,
      responseMessage: message("host"),
    });

    assert.equal(staged.status, "live");
    assert.equal(committed.status, "completed");
  });

  it("keeps a final Guest coda live until its presentation completes", () => {
    const committed = episode({ status: "completed" });
    const staged = signalEpisodeBeforeResponseIsHeard({
      previousEpisode: episode({ status: "live" }),
      committedEpisode: committed,
      responseMessage: message("guest"),
    });

    assert.equal(staged.status, "live");
    assert.equal(staged.tensionStage, committed.tensionStage);
    assert.equal(committed.status, "completed");
  });
});
