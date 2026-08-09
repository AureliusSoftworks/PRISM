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
    const authored =
      normalizeOptionalBotAudioVoiceProfileV1(
        bot.authoredAudioVoiceProfile,
      ) ?? normalizeBotAudioVoiceProfileV1(undefined);
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

  const prismProfile =
    normalizeOptionalBotAudioVoiceProfileV1(
      args.prismDefaultBotAudioVoiceProfile,
    ) ?? normalizeBotAudioVoiceProfileV1(undefined);
  const hasSelectedPremium = Boolean(selectedPremiumVoiceId(prismProfile));
  const hasInitializedFlag = prismProfile.elevenLabsVoiceInitialized === true;
  const prismDefaultBotAudioVoiceProfile =
    hasSelectedPremium || hasInitializedFlag
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

  // #region agent log
  fetch("http://127.0.0.1:7914/ingest/796e4cfe-51fc-4e0c-8265-ef32bc063af2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "2836be",
    },
    body: JSON.stringify({
      sessionId: "2836be",
      hypothesisId: "A",
      location: "premium-voice-defaults.ts:initializePremiumVoiceDefaults",
      message: "Prism default premium-init decision",
      data: {
        userId: args.userId,
        voiceCatalogSize: voiceIds.length,
        rawProfileType: typeof args.prismDefaultBotAudioVoiceProfile,
        rawProfileIsNull: args.prismDefaultBotAudioVoiceProfile == null,
        baseVoiceId: prismProfile.baseVoiceId,
        pitch: prismProfile.pitch,
        pace: prismProfile.pace,
        systemVoiceName: prismProfile.systemVoiceName ?? null,
        elevenLabsVoiceId: prismProfile.elevenLabsVoiceId ?? null,
        elevenLabsVoiceIdOverride: prismProfile.elevenLabsVoiceIdOverride ?? null,
        hasSelectedPremium,
        hasInitializedFlag,
        willAssignPrismDefault: prismDefaultBotAudioVoiceProfile != null,
        assignedVoiceId:
          prismDefaultBotAudioVoiceProfile?.elevenLabsVoiceId ?? null,
        botUpdateCount: botUpdates.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return { botUpdates, prismDefaultBotAudioVoiceProfile };
}
