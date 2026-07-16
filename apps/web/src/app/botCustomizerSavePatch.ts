import {
  normalizeBotNamePronunciation,
  serializeBotAvatarDetailsV1,
  serializeBotPowersV1,
  type BotAudioVoiceProfileV1,
  type BotAvatarDetailsV1,
  type BotPowerV1,
} from "@localai/shared";

export interface BotCustomizerSavePristine {
  name: string;
  namePronunciation: string;
  prompt: string;
  rawPrompt?: string;
  localModel: string;
  onlineModel: string;
  localImageModel: string;
  openAiImageModel: string;
  onlineEnabled: boolean;
  deleteProtected: boolean;
  flirtEnabled: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  color: string;
  glyph: string;
  faceEyesFont: string;
  faceEyeCharacter: string | null;
  faceEyeAnimation: string;
  faceMouthFont: string;
  faceMouthCharacter: string | null;
  faceMouthAnimation: string;
  faceMouthCoffeePucker: boolean;
  faceFontWeight: number;
  faceEyeScale: number;
  faceEyeOffsetX: number;
  faceEyeOffsetY: number;
  faceEyeRotationDeg: number;
  faceMouthScale: number;
  faceMouthOffsetX: number;
  faceMouthOffsetY: number;
  faceMouthRotationDeg: number;
  faceBlinkBar: string;
  faceBlinkScale: number;
  faceBlinkOffsetX: number;
  faceBlinkOffsetY: number;
  faceThinkingFrames: readonly string[];
  avatarDetails: BotAvatarDetailsV1 | null;
  profilePictureImageId: string | null;
  audioVoiceProfile: BotAudioVoiceProfileV1;
  powers?: BotPowerV1[];
}

export interface BotCustomizerSaveCurrent {
  name: string;
  namePronunciation: string;
  storedSystemPrompt: string;
  advancedMode: boolean;
  localModel: string;
  onlineModel: string;
  localModelForStorage: string;
  onlineModelForStorage: string;
  localImageModel: string;
  openAiImageModel: string;
  localImageModelForStorage: string;
  openAiImageModelForStorage: string;
  onlineEnabled: boolean;
  deleteProtected: boolean;
  flirtEnabled: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  color: string;
  glyph: string;
  faceEyesFont: string;
  faceEyeCharacter: string | null;
  faceEyeAnimation: string;
  faceMouthFont: string;
  faceMouthCharacter: string | null;
  faceMouthAnimation: string;
  faceMouthCoffeePucker: boolean;
  faceFontWeight: number;
  faceEyeScale: number;
  faceEyeOffsetX: number;
  faceEyeOffsetY: number;
  faceEyeRotationDeg: number;
  faceMouthScale: number;
  faceMouthOffsetX: number;
  faceMouthOffsetY: number;
  faceMouthRotationDeg: number;
  faceBlinkBar: string;
  faceBlinkScale: number;
  faceBlinkOffsetX: number;
  faceBlinkOffsetY: number;
  faceThinkingFrames: readonly string[];
  avatarDetails: BotAvatarDetailsV1 | null;
  profilePictureImageId: string | null;
  audioVoiceProfile: BotAudioVoiceProfileV1;
  powers?: BotPowerV1[];
}

export interface BotCustomizerSavePatch {
  name?: string;
  namePronunciation?: string;
  systemPrompt?: string;
  onlineEnabled?: boolean;
  deleteProtected?: boolean;
  flirtEnabled?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  color?: string;
  glyph?: string;
  faceEyesFont?: string;
  faceEyeCharacter?: string | null;
  faceEyeAnimation?: string;
  faceMouthFont?: string;
  faceMouthCharacter?: string | null;
  faceMouthAnimation?: string;
  faceMouthCoffeePucker?: boolean;
  faceFontWeight?: number;
  faceEyeScale?: number;
  faceEyeOffsetX?: number;
  faceEyeOffsetY?: number;
  faceEyeRotationDeg?: number;
  faceMouthScale?: number;
  faceMouthOffsetX?: number;
  faceMouthOffsetY?: number;
  faceMouthRotationDeg?: number;
  faceBlinkBar?: string;
  faceBlinkScale?: number;
  faceBlinkOffsetX?: number;
  faceBlinkOffsetY?: number;
  faceThinkingFrames?: readonly string[];
  avatarDetails?: BotAvatarDetailsV1 | null;
  profilePictureImageId?: string | null;
  audioVoiceProfileOverride?: BotAudioVoiceProfileV1 | null;
  powers?: BotPowerV1[];
}

const normalizeColorForCompare = (hex: string | null | undefined): string =>
  (hex ?? "").trim().toLowerCase();

const thinkingFramesEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((frame, index) => frame === right[index]);

const avatarDetailsKey = (details: BotAvatarDetailsV1 | null): string =>
  details === null ? "" : serializeBotAvatarDetailsV1(details);

export function buildBotCustomizerSavePatch(
  current: BotCustomizerSaveCurrent,
  pristine: BotCustomizerSavePristine | null
): BotCustomizerSavePatch {
  if (!pristine) {
    return {
      name: current.name,
      namePronunciation: normalizeBotNamePronunciation(current.namePronunciation),
      systemPrompt: current.storedSystemPrompt,
      onlineEnabled: current.onlineEnabled,
      deleteProtected: current.deleteProtected,
      flirtEnabled: current.flirtEnabled,
      temperature: current.temperature,
      maxTokens: current.maxTokens,
      topP: current.topP,
      topK: current.topK,
      repetitionPenalty: current.repetitionPenalty,
      color: current.color,
      glyph: current.glyph,
      faceEyesFont: current.faceEyesFont,
      faceEyeCharacter: current.faceEyeCharacter,
      faceEyeAnimation: current.faceEyeAnimation,
      faceMouthFont: current.faceMouthFont,
      faceMouthCharacter: current.faceMouthCharacter,
      faceMouthAnimation: current.faceMouthAnimation,
      faceMouthCoffeePucker: current.faceMouthCoffeePucker,
      faceFontWeight: current.faceFontWeight,
      faceEyeScale: current.faceEyeScale,
      faceEyeOffsetX: current.faceEyeOffsetX,
      faceEyeOffsetY: current.faceEyeOffsetY,
      faceEyeRotationDeg: current.faceEyeRotationDeg,
      faceMouthScale: current.faceMouthScale,
      faceMouthOffsetX: current.faceMouthOffsetX,
      faceMouthOffsetY: current.faceMouthOffsetY,
      faceMouthRotationDeg: current.faceMouthRotationDeg,
      faceBlinkBar: current.faceBlinkBar,
      faceBlinkScale: current.faceBlinkScale,
      faceBlinkOffsetX: current.faceBlinkOffsetX,
      faceBlinkOffsetY: current.faceBlinkOffsetY,
      faceThinkingFrames: current.faceThinkingFrames,
      avatarDetails: current.avatarDetails,
      profilePictureImageId: current.profilePictureImageId,
      audioVoiceProfileOverride: current.audioVoiceProfile,
      powers: current.powers ?? [],
    };
  }

  const patch: BotCustomizerSavePatch = {};
  const pristineSystemPrompt = current.advancedMode
    ? pristine.rawPrompt ?? pristine.prompt
    : pristine.prompt;

  if (current.name !== pristine.name) patch.name = current.name;
  if (
    normalizeBotNamePronunciation(current.namePronunciation) !==
    normalizeBotNamePronunciation(pristine.namePronunciation)
  ) {
    patch.namePronunciation = normalizeBotNamePronunciation(
      current.namePronunciation,
    );
  }
  if (current.storedSystemPrompt !== pristineSystemPrompt) {
    patch.systemPrompt = current.storedSystemPrompt;
  }
  if (current.onlineEnabled !== pristine.onlineEnabled) {
    patch.onlineEnabled = current.onlineEnabled;
  }
  if (current.deleteProtected !== pristine.deleteProtected) {
    patch.deleteProtected = current.deleteProtected;
  }
  if (current.flirtEnabled !== pristine.flirtEnabled) {
    patch.flirtEnabled = current.flirtEnabled;
  }
  if (current.temperature !== pristine.temperature) patch.temperature = current.temperature;
  if (current.maxTokens !== pristine.maxTokens) patch.maxTokens = current.maxTokens;
  if (current.topP !== pristine.topP) patch.topP = current.topP;
  if (current.topK !== pristine.topK) patch.topK = current.topK;
  if (current.repetitionPenalty !== pristine.repetitionPenalty) {
    patch.repetitionPenalty = current.repetitionPenalty;
  }
  if (normalizeColorForCompare(current.color) !== normalizeColorForCompare(pristine.color)) {
    patch.color = current.color;
  }
  if (current.glyph !== pristine.glyph) patch.glyph = current.glyph;
  if (serializeBotPowersV1(current.powers ?? []) !== serializeBotPowersV1(pristine.powers ?? [])) {
    patch.powers = current.powers ?? [];
  }
  if (current.faceEyesFont !== pristine.faceEyesFont) {
    patch.faceEyesFont = current.faceEyesFont;
  }
  if (current.faceEyeCharacter !== pristine.faceEyeCharacter) {
    patch.faceEyeCharacter = current.faceEyeCharacter;
  }
  if (current.faceEyeAnimation !== pristine.faceEyeAnimation) {
    patch.faceEyeAnimation = current.faceEyeAnimation;
  }
  if (current.faceMouthFont !== pristine.faceMouthFont) {
    patch.faceMouthFont = current.faceMouthFont;
  }
  if (current.faceMouthCharacter !== pristine.faceMouthCharacter) {
    patch.faceMouthCharacter = current.faceMouthCharacter;
  }
  if (current.faceMouthAnimation !== pristine.faceMouthAnimation) {
    patch.faceMouthAnimation = current.faceMouthAnimation;
  }
  if (current.faceMouthCoffeePucker !== pristine.faceMouthCoffeePucker) {
    patch.faceMouthCoffeePucker = current.faceMouthCoffeePucker;
  }
  if (current.faceFontWeight !== pristine.faceFontWeight) {
    patch.faceFontWeight = current.faceFontWeight;
  }
  if (current.faceEyeScale !== pristine.faceEyeScale) {
    patch.faceEyeScale = current.faceEyeScale;
  }
  if (current.faceEyeOffsetX !== pristine.faceEyeOffsetX) {
    patch.faceEyeOffsetX = current.faceEyeOffsetX;
  }
  if (current.faceEyeOffsetY !== pristine.faceEyeOffsetY) {
    patch.faceEyeOffsetY = current.faceEyeOffsetY;
  }
  if (current.faceEyeRotationDeg !== pristine.faceEyeRotationDeg) {
    patch.faceEyeRotationDeg = current.faceEyeRotationDeg;
  }
  if (current.faceMouthScale !== pristine.faceMouthScale) {
    patch.faceMouthScale = current.faceMouthScale;
  }
  if (current.faceMouthOffsetX !== pristine.faceMouthOffsetX) {
    patch.faceMouthOffsetX = current.faceMouthOffsetX;
  }
  if (current.faceMouthOffsetY !== pristine.faceMouthOffsetY) {
    patch.faceMouthOffsetY = current.faceMouthOffsetY;
  }
  if (current.faceMouthRotationDeg !== pristine.faceMouthRotationDeg) {
    patch.faceMouthRotationDeg = current.faceMouthRotationDeg;
  }
  if (current.faceBlinkBar !== pristine.faceBlinkBar) {
    patch.faceBlinkBar = current.faceBlinkBar;
  }
  if (current.faceBlinkScale !== pristine.faceBlinkScale) {
    patch.faceBlinkScale = current.faceBlinkScale;
  }
  if (current.faceBlinkOffsetX !== pristine.faceBlinkOffsetX) {
    patch.faceBlinkOffsetX = current.faceBlinkOffsetX;
  }
  if (current.faceBlinkOffsetY !== pristine.faceBlinkOffsetY) {
    patch.faceBlinkOffsetY = current.faceBlinkOffsetY;
  }
  if (!thinkingFramesEqual(current.faceThinkingFrames, pristine.faceThinkingFrames)) {
    patch.faceThinkingFrames = current.faceThinkingFrames;
  }
  if (avatarDetailsKey(current.avatarDetails) !== avatarDetailsKey(pristine.avatarDetails)) {
    patch.avatarDetails = current.avatarDetails;
  }
  if (current.profilePictureImageId !== pristine.profilePictureImageId) {
    patch.profilePictureImageId = current.profilePictureImageId;
  }
  if (JSON.stringify(current.audioVoiceProfile) !== JSON.stringify(pristine.audioVoiceProfile)) {
    patch.audioVoiceProfileOverride = current.audioVoiceProfile;
  }

  return patch;
}
