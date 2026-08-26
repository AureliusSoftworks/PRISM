import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_COMPACT_THINKING_NOTICE_MAX_MS,
  signalCompactThinkingNoticeAt,
  signalGenerationThinkingRole,
  signalPresentedThinkingRole,
  signalStageThinkingRole,
  signalThinkingFollowingMessageId,
  signalThinkingPresentationEndReason,
} from "./signalThinkingPresentation.ts";

describe("Signal thinking presentation", () => {
  it("renders compact thinking metadata as a bounded non-blocking replay notice", () => {
    const direction = [{
      sequence: 1,
      atMs: 800,
      endMs: 801,
      kind: "thinking" as const,
      sourceMessageId: "host-line",
      payload: {
        participantId: "host-1",
        botId: "host-1",
        startMs: 800,
        endMs: 801,
        presentationDurationMs: 9_000,
        timelineCompacted: true,
        audible: false,
        camera: "left",
        segment: "interview",
        followingMessageId: "host-line",
        endReason: "completed",
      },
    }];

    const notice = signalCompactThinkingNoticeAt({ direction, atMs: 900 });
    assert.deepEqual(notice, {
      participantId: "host-1",
      sourceMessageId: "host-line",
      presentationDurationMs: 9_000,
      noticeDurationMs: 1_080,
      label: "Thought for 9.0s · condensed",
    });
    assert.equal(
      signalCompactThinkingNoticeAt({ direction, atMs: 1_880 }),
      null,
    );

    const longNotice = signalCompactThinkingNoticeAt({
      direction: [{
        ...direction[0]!,
        payload: {
          ...direction[0]!.payload,
          presentationDurationMs: 60_000,
          endReason: "interrupted",
        },
      }],
      atMs: 900,
    });
    assert.equal(longNotice?.noticeDurationMs, SIGNAL_COMPACT_THINKING_NOTICE_MAX_MS);
    assert.match(longNotice?.label ?? "", /before interruption · condensed/u);
  });

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
      voicePreparationPending: false,
      hasPreparedMessage: false,
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
        generationBusy: true,
        hasPreparedMessage: true,
        hasSpeakingMessage: false,
      }),
      null,
    );
    assert.equal(
      signalPresentedThinkingRole({
        ...base,
        generationBusy: true,
        voicePreparationPending: true,
        hasSpeakingMessage: false,
      }),
      null,
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

  it("links completed thinking to a prepared line before speech state commits", () => {
    assert.equal(
      signalThinkingFollowingMessageId({
        liveSpeechMessageId: null,
        speakingMessageId: null,
        preparedMessageId: "opening-line",
      }),
      "opening-line",
    );
    assert.equal(
      signalThinkingFollowingMessageId({
        liveSpeechMessageId: "audible-line",
        speakingMessageId: "speaking-line",
        preparedMessageId: "prepared-line",
      }),
      "audible-line",
    );
  });

  it("preserves producer-guest waits and suppresses the thinking face while sipping", () => {
    const base = {
      episodeLive: true,
      producerGuestThinking: true,
      generationBusy: false,
      voicePreparationPending: false,
      hasPreparedMessage: false,
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

  it("keeps ordinary generation and voice preparation off-stage", () => {
    assert.equal(
      signalStageThinkingRole({
        presentedThinkingRole: "host",
        nextSpeakerRole: "host",
        producerGuestThinking: false,
        voicePreparationPending: true,
        voicePreparationRole: "host",
      }),
      null,
    );
  });

  it("shows fallback thinking on the producer-owned screen", () => {
    assert.equal(
      signalStageThinkingRole({
        presentedThinkingRole: "host",
        nextSpeakerRole: "guest",
        producerGuestThinking: false,
        voicePreparationPending: false,
        voicePreparationRole: null,
      }),
      "host",
    );
    assert.equal(
      signalStageThinkingRole({
        presentedThinkingRole: "guest",
        nextSpeakerRole: "guest",
        producerGuestThinking: true,
        voicePreparationPending: false,
        voicePreparationRole: null,
      }),
      "guest",
    );
  });

  it("releases generation thinking once a producer-cut closing line is prepared", () => {
    const presentedThinkingRole = signalPresentedThinkingRole({
      episodeLive: true,
      producerGuestThinking: false,
      producerGuestSipActive: false,
      generationBusy: true,
      voicePreparationPending: false,
      hasPreparedMessage: true,
      hasSpeakingMessage: false,
      nextSpeakerRole: "host",
      generationThinkingRole: "host",
      generationThinkingRunMatches: true,
    });

    assert.equal(presentedThinkingRole, null);
    assert.equal(
      signalStageThinkingRole({
        presentedThinkingRole,
        nextSpeakerRole: "host",
        producerGuestThinking: false,
        voicePreparationPending: false,
        voicePreparationRole: "host",
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
