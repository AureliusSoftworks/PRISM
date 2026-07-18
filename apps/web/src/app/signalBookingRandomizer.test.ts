import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomSignalEpisodeGuestId } from "./signalBookingRandomizer.ts";

describe("Signal booking randomizer", () => {
  it("chooses a non-host guest and avoids the current guest", () => {
    const guestId = randomSignalEpisodeGuestId({
      candidateGuestIds: ["host-1", "guest-1", "guest-2", "guest-2"],
      hostBotId: "host-1",
      currentGuestId: "guest-1",
      random: () => 0,
    });
    assert.equal(guestId, "guest-2");
  });

  it("keeps the only eligible guest and returns null without one", () => {
    assert.equal(
      randomSignalEpisodeGuestId({
        candidateGuestIds: ["host-1", "guest-1"],
        hostBotId: "host-1",
        currentGuestId: "guest-1",
        random: () => 0.5,
      }),
      "guest-1",
    );
    assert.equal(
      randomSignalEpisodeGuestId({
        candidateGuestIds: ["host-1"],
        hostBotId: "host-1",
        currentGuestId: "",
      }),
      null,
    );
  });
});
