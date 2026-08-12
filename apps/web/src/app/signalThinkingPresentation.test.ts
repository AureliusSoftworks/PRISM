import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalGenerationThinkingRole,
  signalPresentedThinkingRole,
  signalThinkingPresentationEndReason,
} from "./signalThinkingPresentation.ts";

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

  it("records generation thinking once but not the compact voice-preparation wait", () => {
    const base = {
      episodeLive: true,
      producerGuestThinking: false,
      producerGuestSipActive: false,
      nextSpeakerRole: "guest" as const,
      generationThinkingRole: "guest" as const,
      generationThinkingRunMatches: true,
    };
    assert.equal(
      signalPresentedThinkingRole({
        ...base,
        generationBusy: true,
        hasSpeakingMessage: false,
      }),
      "guest",
    );
    assert.equal(
      signalPresentedThinkingRole({
        ...base,
        generationBusy: false,
        hasSpeakingMessage: true,
      }),
      null,
    );
  });

  it("preserves producer-guest waits and suppresses the thinking face while sipping", () => {
    const base = {
      episodeLive: true,
      producerGuestThinking: true,
      generationBusy: false,
      hasSpeakingMessage: false,
      nextSpeakerRole: "guest" as const,
      generationThinkingRole: null,
      generationThinkingRunMatches: false,
    };
    assert.equal(
      signalPresentedThinkingRole({
        ...base,
        producerGuestSipActive: false,
      }),
      "guest",
    );
    assert.equal(
      signalPresentedThinkingRole({
        ...base,
        producerGuestSipActive: true,
      }),
      null,
    );
  });

  it("marks a delivered final line completed after the episode closes", () => {
    assert.equal(
      signalThinkingPresentationEndReason({
        cuttingShow: false,
        hasError: false,
        hasFollowingMessage: true,
        episodeLive: false,
      }),
      "completed",
    );
    assert.equal(
      signalThinkingPresentationEndReason({
        cuttingShow: false,
        hasError: false,
        hasFollowingMessage: false,
        episodeLive: false,
      }),
      "cancelled",
    );
  });
});
