import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signalGenerationThinkingRole } from "./signalThinkingPresentation.ts";

describe("Signal thinking presentation", () => {
  it("attributes an interrupting producer cue to the host", () => {
    assert.equal(
      signalGenerationThinkingRole({
        scheduledSpeakerRole: "guest",
        cueDelivery: "interrupt_guest",
        hasProducerCue: true,
      }),
      "host",
    );
  });

  it("attributes an in-flight host redirect to the host", () => {
    assert.equal(
      signalGenerationThinkingRole({
        scheduledSpeakerRole: "guest",
        cueDelivery: "redirect_host",
        hasProducerCue: true,
      }),
      "host",
    );
  });

  it("keeps the scheduled speaker for ordinary and queued turns", () => {
    assert.equal(
      signalGenerationThinkingRole({
        scheduledSpeakerRole: "guest",
        cueDelivery: "next_host_turn",
        hasProducerCue: true,
      }),
      "guest",
    );
    assert.equal(
      signalGenerationThinkingRole({
        scheduledSpeakerRole: "host",
        cueDelivery: "interrupt_guest",
        hasProducerCue: false,
      }),
      "host",
    );
  });
});
