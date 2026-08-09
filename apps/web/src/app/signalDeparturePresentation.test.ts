import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotcastEpisode, BotcastMessage } from "@localai/shared";
import { signalDepartureRoleAfterPresentedMessage } from "./signalDeparturePresentation.ts";

describe("Signal departure presentation", () => {
  it("does not apply a baked walkout until the departing bot's final line has aired", () => {
    const episode = {
      events: [
        {
          id: "departure",
          episodeId: "episode",
          sequence: 1,
          kind: "departure",
          payload: { botId: "guest", speakerRole: "guest" },
          occurredAt: "2026-08-09T04:46:56.300Z",
        },
        {
          id: "departure-camera",
          episodeId: "episode",
          sequence: 2,
          kind: "camera_suggestion",
          payload: {
            reason: "departure",
            speakerRole: "guest",
            messageId: "guest-final",
            atMs: 149_150,
          },
          occurredAt: "2026-08-09T04:46:56.300Z",
        },
      ],
    } as unknown as Pick<BotcastEpisode, "events">;
    const earlierGuest = {
      id: "guest-earlier",
      speakerRole: "guest",
    } as Pick<BotcastMessage, "id" | "speakerRole">;
    const hostBetween = {
      id: "host-between",
      speakerRole: "host",
    } as Pick<BotcastMessage, "id" | "speakerRole">;
    const finalGuest = {
      id: "guest-final",
      speakerRole: "guest",
    } as Pick<BotcastMessage, "id" | "speakerRole">;

    assert.equal(
      signalDepartureRoleAfterPresentedMessage({
        episode,
        message: earlierGuest,
      }),
      null,
    );
    assert.equal(
      signalDepartureRoleAfterPresentedMessage({
        episode,
        message: hostBetween,
      }),
      null,
    );
    assert.equal(
      signalDepartureRoleAfterPresentedMessage({
        episode,
        message: finalGuest,
      }),
      "guest",
    );
  });
});
