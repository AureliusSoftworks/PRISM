import type {
  BotcastProducerCueDelivery,
  BotcastSpeakerRole,
  ReplayThinkingDirectionPayloadV2,
} from "@localai/shared";

export function signalGenerationThinkingRole(args: {
  scheduledSpeakerRole: BotcastSpeakerRole | null;
  cueDelivery: BotcastProducerCueDelivery;
  hasProducerCue: boolean;
}): BotcastSpeakerRole | null {
  if (
    args.hasProducerCue &&
    (args.cueDelivery === "interrupt_guest" ||
      args.cueDelivery === "redirect_host")
  ) {
    return "host";
  }
  return args.scheduledSpeakerRole;
}

/** Mirrors the thinking state that is actually committed on the live stage. */
export function signalPresentedThinkingRole(args: {
  episodeLive: boolean;
  producerGuestThinking: boolean;
  producerGuestSipActive: boolean;
  generationBusy: boolean;
  hasSpeakingMessage: boolean;
  nextSpeakerRole: BotcastSpeakerRole | null;
  generationThinkingRole: BotcastSpeakerRole | null;
  generationThinkingRunMatches: boolean;
}): BotcastSpeakerRole | null {
  if (!args.episodeLive) return null;
  if (args.producerGuestThinking) {
    return args.producerGuestSipActive ? null : "guest";
  }
  // Voice preparation has a message on deck but no visible thinking state.
  // Do not turn that compacted audio wait into a second thinking interval.
  if (!args.generationBusy || args.hasSpeakingMessage) return null;
  if (args.producerGuestSipActive && args.nextSpeakerRole === "guest") {
    return null;
  }
  return args.generationThinkingRunMatches
    ? args.generationThinkingRole
    : args.nextSpeakerRole;
}

export function signalThinkingPresentationEndReason(args: {
  cuttingShow: boolean;
  hasError: boolean;
  hasFollowingMessage: boolean;
  episodeLive: boolean;
}): ReplayThinkingDirectionPayloadV2["endReason"] {
  if (args.cuttingShow) return "interrupted";
  if (args.hasError) return "failed";
  if (args.hasFollowingMessage || args.episodeLive) return "completed";
  return "cancelled";
}
