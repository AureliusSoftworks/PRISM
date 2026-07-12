import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

/** Player speech is governed by the account-wide mode and volume controls.
 * Hidden legacy per-profile silence must not override those global choices. */
export function coffeePlayerPlaybackProfile(
  profile: BotAudioVoiceProfileV1
): NormalizedBotAudioVoiceProfileV1 {
  return {
    ...normalizeBotAudioVoiceProfileV1(profile),
    enabled: true,
    volume: 1,
  };
}

export function coffeePlayerEnglishEngine(args: {
  accountProvider: "local" | "openai" | "anthropic";
  coffeeProvider: "local" | "openai" | "anthropic";
  offlineProtectedBotPresent: boolean;
  selectedEngine: EnglishVoiceEngine;
}): EnglishVoiceEngine {
  return args.accountProvider === "local" ||
    args.coffeeProvider === "local" ||
    args.offlineProtectedBotPresent
    ? "builtin"
    : args.selectedEngine;
}
