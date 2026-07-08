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
  faceMouthFont: string;
  faceFontWeight: number;
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
  faceMouthFont: string;
  faceFontWeight: number;
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
  faceMouthFont?: string;
  faceFontWeight?: number;
  profilePictureImageId?: string | null;
}

const normalizeColorForCompare = (hex: string | null | undefined): string =>
  (hex ?? "").trim().toLowerCase();

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
      faceMouthFont: current.faceMouthFont,
      faceFontWeight: current.faceFontWeight,
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
  if (current.faceMouthFont !== pristine.faceMouthFont) {
    patch.faceMouthFont = current.faceMouthFont;
  }
  if (current.faceFontWeight !== pristine.faceFontWeight) {
    patch.faceFontWeight = current.faceFontWeight;
  }
  if (current.profilePictureImageId !== pristine.profilePictureImageId) {
    patch.profilePictureImageId = current.profilePictureImageId;
  }

  return patch;
}
