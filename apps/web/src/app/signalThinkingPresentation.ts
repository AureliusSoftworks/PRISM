import type {
  BotcastProducerCueDelivery,
  BotcastSpeakerRole,
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
