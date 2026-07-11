export interface BotCustomizerSavePristine {
  name: string;
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
  faceThinkingFrames: readonly string[];
  profilePictureImageId: string | null;
}

export interface BotCustomizerSaveCurrent {
  name: string;
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
  faceThinkingFrames: readonly string[];
  profilePictureImageId: string | null;
}

export interface BotCustomizerSavePatch {
  name?: string;
  systemPrompt?: string;
  localModel?: string;
  onlineModel?: string;
  localImageModel?: string;
  openaiImageModel?: string;
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
  faceThinkingFrames?: readonly string[];
  profilePictureImageId?: string | null;
}

const normalizeColorForCompare = (hex: string | null | undefined): string =>
  (hex ?? "").trim().toLowerCase();

const thinkingFramesEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((frame, index) => frame === right[index]);

export function buildBotCustomizerSavePatch(
  current: BotCustomizerSaveCurrent,
  pristine: BotCustomizerSavePristine | null
): BotCustomizerSavePatch {
  if (!pristine) {
    return {
      name: current.name,
      systemPrompt: current.storedSystemPrompt,
      localModel: current.localModelForStorage,
      onlineModel: current.onlineModelForStorage,
      localImageModel: current.localImageModelForStorage,
      openaiImageModel: current.openAiImageModelForStorage,
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
      faceThinkingFrames: current.faceThinkingFrames,
      profilePictureImageId: current.profilePictureImageId,
    };
  }

  const patch: BotCustomizerSavePatch = {};
  const pristineSystemPrompt = current.advancedMode
    ? pristine.rawPrompt ?? pristine.prompt
    : pristine.prompt;

  if (current.name !== pristine.name) patch.name = current.name;
  if (current.storedSystemPrompt !== pristineSystemPrompt) {
    patch.systemPrompt = current.storedSystemPrompt;
  }
  if (current.localModel !== pristine.localModel) {
    patch.localModel = current.localModelForStorage;
  }
  if (current.onlineModel !== pristine.onlineModel) {
    patch.onlineModel = current.onlineModelForStorage;
  }
  if (current.localImageModel !== pristine.localImageModel) {
    patch.localImageModel = current.localImageModelForStorage;
  }
  if (current.openAiImageModel !== pristine.openAiImageModel) {
    patch.openaiImageModel = current.openAiImageModelForStorage;
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
  if (!thinkingFramesEqual(current.faceThinkingFrames, pristine.faceThinkingFrames)) {
    patch.faceThinkingFrames = current.faceThinkingFrames;
  }
  if (current.profilePictureImageId !== pristine.profilePictureImageId) {
    patch.profilePictureImageId = current.profilePictureImageId;
  }

  return patch;
}
