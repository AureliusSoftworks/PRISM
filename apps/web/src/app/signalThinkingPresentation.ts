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
