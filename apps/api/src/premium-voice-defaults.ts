import {
  normalizeBotAudioVoiceProfileV1,
  normalizeOptionalBotAudioVoiceProfileV1,
  resolveBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV2,
} from "@localai/shared";

export interface PremiumVoiceCandidate {
  voiceId: string;
}

export interface PremiumVoiceBotProfileRow {
  id: string;
  authoredAudioVoiceProfile: unknown;
  audioVoiceProfileOverride: unknown;
}

export interface PremiumVoiceBotUpdate {
  id: string;
  audioVoiceProfileOverride: BotAudioVoiceProfileV2;
}

export interface PremiumVoiceDefaultInitialization {
  botUpdates: PremiumVoiceBotUpdate[];
  prismDefaultBotAudioVoiceProfile: BotAudioVoiceProfileV2 | null;
}

function selectedPremiumVoiceId(profile: BotAudioVoiceProfileV2): string | null {
  return profile.elevenLabsVoiceIdOverride ?? profile.elevenLabsVoiceId ?? null;
}

function stableVoiceIndex(scope: string, count: number): number {
  let hash = 0x811c9dc5;
  for (const character of scope) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % count;
}

function normalizedVoiceIds(voices: readonly PremiumVoiceCandidate[]): string[] {
  return [...new Set(
    voices
      .map((voice) => voice.voiceId.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function withPremiumVoice(
  profile: BotAudioVoiceProfileV2,
  voiceId: string,
): BotAudioVoiceProfileV2 {
  return normalizeBotAudioVoiceProfileV1({
    ...profile,
    elevenLabsVoiceId: voiceId,
    elevenLabsVoiceIdOverride: null,
    elevenLabsVoiceInitialized: true,
  });
}

/** Build account-owned Premium defaults without modifying authored profiles.
 * Existing IDs and explicit local-only choices are permanent until the player
 * changes them in Avatar Studio. */
export function initializePremiumVoiceDefaults(args: {
  userId: string;
  voices: readonly PremiumVoiceCandidate[];
  bots: readonly PremiumVoiceBotProfileRow[];
  prismDefaultBotAudioVoiceProfile: unknown;
}): PremiumVoiceDefaultInitialization {
  const voiceIds = normalizedVoiceIds(args.voices);
  if (voiceIds.length === 0) {
    return { botUpdates: [], prismDefaultBotAudioVoiceProfile: null };
  }

  const botUpdates = args.bots.flatMap((bot): PremiumVoiceBotUpdate[] => {
    const authored = normalizeBotAudioVoiceProfileV1(
      bot.authoredAudioVoiceProfile,
    );
    const override = normalizeOptionalBotAudioVoiceProfileV1(
      bot.audioVoiceProfileOverride,
    );
    if (selectedPremiumVoiceId(authored) || selectedPremiumVoiceId(override ?? authored)) {
      return [];
    }
    if (
      authored.elevenLabsVoiceInitialized === true ||
      override?.elevenLabsVoiceInitialized === true
    ) {
      return [];
    }
    const effective = resolveBotAudioVoiceProfileV1(authored, override);
    const voiceId = voiceIds[
      stableVoiceIndex(`${args.userId}:bot:${bot.id}`, voiceIds.length)
    ];
    return [{
      id: bot.id,
      audioVoiceProfileOverride: withPremiumVoice(effective, voiceId),
    }];
  });

  const prismProfile = normalizeBotAudioVoiceProfileV1(
    args.prismDefaultBotAudioVoiceProfile,
  );
  const prismDefaultBotAudioVoiceProfile =
    selectedPremiumVoiceId(prismProfile) ||
    prismProfile.elevenLabsVoiceInitialized === true
      ? null
      : withPremiumVoice(
          prismProfile,
          voiceIds[
            stableVoiceIndex(
              `${args.userId}:default-prism`,
              voiceIds.length,
            )
          ],
        );

  return { botUpdates, prismDefaultBotAudioVoiceProfile };
}
