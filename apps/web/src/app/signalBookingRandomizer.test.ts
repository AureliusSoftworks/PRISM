import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_RANDOM_BOOKING_TOPICS,
  SIGNAL_RANDOM_PRODUCER_BRIEFS,
  randomSignalEpisodeBooking,
} from "./signalBookingRandomizer.ts";

describe("Signal booking randomizer", () => {
  it("chooses a non-host guest and avoids current editable values", () => {
    const currentTopic = SIGNAL_RANDOM_BOOKING_TOPICS[0]!;
    const currentBrief = SIGNAL_RANDOM_PRODUCER_BRIEFS[0]!;
    const booking = randomSignalEpisodeBooking({
      candidateGuestIds: ["host-1", "guest-1", "guest-2", "guest-2"],
      hostBotId: "host-1",
      currentGuestId: "guest-1",
      currentTopic,
      currentProducerBrief: currentBrief,
      random: () => 0,
    });
    assert.ok(booking);
    assert.equal(booking.guestId, "guest-2");
    assert.notEqual(booking.topic, currentTopic);
    assert.notEqual(booking.producerBrief, currentBrief);
  });

  it("keeps the only eligible guest and returns null without one", () => {
    assert.equal(
      randomSignalEpisodeBooking({
        candidateGuestIds: ["host-1", "guest-1"],
        hostBotId: "host-1",
        currentGuestId: "guest-1",
        currentTopic: "",
        currentProducerBrief: "",
        random: () => 0.5,
      })?.guestId,
      "guest-1",
    );
    assert.equal(
      randomSignalEpisodeBooking({
        candidateGuestIds: ["host-1"],
        hostBotId: "host-1",
        currentGuestId: "",
        currentTopic: "",
        currentProducerBrief: "",
      }),
      null,
    );
  });
});
