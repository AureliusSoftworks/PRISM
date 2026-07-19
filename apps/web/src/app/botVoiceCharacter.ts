import {
  BOT_VOICE_GAIN_DB_MAX,
  BOT_VOICE_GAIN_DB_MIN,
  normalizeBotAudioVoiceControl,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceGainDb,
  resolveBotVoiceCharacter,
  type BotAudioVoiceProfileV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

export const BOT_VOICE_CHARACTER_TILT_STEP = 0.05;
export const BOT_VOICE_CHARACTER_GAIN_STEP_DB = 0.5;

export interface BotVoiceCharacterPadPoint {
  xRatio: number;
  yRatio: number;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(3));
}

export function botVoiceCharacterPadPoint(
  rawProfile: BotAudioVoiceProfileV1,
): BotVoiceCharacterPadPoint {
  const character = resolveBotVoiceCharacter(rawProfile);
  const gainAxis =
    character.gainDb >= 0
      ? character.gainDb / BOT_VOICE_GAIN_DB_MAX
      : character.gainDb / Math.abs(BOT_VOICE_GAIN_DB_MIN);
  return {
    xRatio: clampRatio((character.eqTilt + 1) / 2),
    yRatio: clampRatio((1 - gainAxis) / 2),
  };
}

export function botVoiceCharacterProfileFromPoint(
  rawProfile: BotAudioVoiceProfileV1,
  point: BotVoiceCharacterPadPoint,
): NormalizedBotAudioVoiceProfileV1 {
  const xRatio = clampRatio(point.xRatio);
  const yRatio = clampRatio(point.yRatio);
  const gainAxis = 1 - yRatio * 2;
  const gainDb =
    gainAxis >= 0
      ? gainAxis * BOT_VOICE_GAIN_DB_MAX
      : gainAxis * Math.abs(BOT_VOICE_GAIN_DB_MIN);
  return normalizeBotAudioVoiceProfileV1({
    ...normalizeBotAudioVoiceProfileV1(rawProfile),
    eqTilt: normalizeBotAudioVoiceControl(
      snap(xRatio * 2 - 1, BOT_VOICE_CHARACTER_TILT_STEP),
    ),
    gainDb: normalizeBotVoiceGainDb(
      snap(gainDb, BOT_VOICE_CHARACTER_GAIN_STEP_DB),
    ),
  });
}

export function nudgeBotVoiceCharacterProfile(
  rawProfile: BotAudioVoiceProfileV1,
  delta: { eqTilt?: number; gainDb?: number },
): NormalizedBotAudioVoiceProfileV1 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  return normalizeBotAudioVoiceProfileV1({
    ...profile,
    eqTilt: normalizeBotAudioVoiceControl(
      snap(profile.eqTilt + (delta.eqTilt ?? 0), BOT_VOICE_CHARACTER_TILT_STEP),
    ),
    gainDb: normalizeBotVoiceGainDb(
      snap(
        profile.gainDb + (delta.gainDb ?? 0),
        BOT_VOICE_CHARACTER_GAIN_STEP_DB,
      ),
    ),
  });
}

export function resetBotVoiceCharacterProfile(
  rawProfile: BotAudioVoiceProfileV1,
): NormalizedBotAudioVoiceProfileV1 {
  return normalizeBotAudioVoiceProfileV1({
    ...normalizeBotAudioVoiceProfileV1(rawProfile),
    eqTilt: 0,
    gainDb: 0,
  });
}

function signedDb(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0 dB";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

export function botVoiceCharacterValueText(
  rawProfile: BotAudioVoiceProfileV1,
): string {
  const character = resolveBotVoiceCharacter(rawProfile);
  return [
    `Low ${signedDb(character.lowShelfDb)}`,
    `High ${signedDb(character.highShelfDb)}`,
    `Gain ${signedDb(character.gainDb)}`,
  ].join(" · ");
}
