import type { BotAvatarSfxState } from "./botAvatarSfx";

export const COFFEE_SEAT_THINKING_AVATAR_SFX_GAIN = 0.12;

export function coffeeSeatAvatarSfxBusGain(input: {
  avatarSfxState: BotAvatarSfxState;
  voiceBusGain: number;
}): number {
  const voiceGain = Math.max(0, input.voiceBusGain);
  if (input.avatarSfxState === "thinking") {
    return voiceGain * COFFEE_SEAT_THINKING_AVATAR_SFX_GAIN;
  }
  return voiceGain;
}
