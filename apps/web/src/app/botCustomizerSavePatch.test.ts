import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildBotCustomizerSavePatch,
  type BotCustomizerSaveCurrent,
  type BotCustomizerSavePristine,
} from "./botCustomizerSavePatch.ts";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";

const pristine: BotCustomizerSavePristine = {
  name: "Iris",
  prompt: "stored prompt",
  rawPrompt: "raw stored prompt",
  localModel: "llama3.2",
  onlineModel: "gpt-4.1-mini",
  localImageModel: "__auto__",
  openAiImageModel: "__auto__",
  onlineEnabled: true,
  deleteProtected: false,
  flirtEnabled: false,
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  topK: 40,
  repetitionPenalty: 1.1,
  color: "#66cc33",
  glyph: "bot",
  faceEyesFont: "warm",
  faceEyeCharacter: null,
  faceEyeAnimation: "none",
  faceMouthFont: "warm",
  faceMouthCharacter: null,
  faceMouthAnimation: "none",
  faceFontWeight: 500,
  faceEyeScale: 1,
  faceEyeOffsetX: 0,
  faceEyeOffsetY: 0,
  faceEyeRotationDeg: 0,
  faceMouthScale: 1,
  faceMouthOffsetX: 0,
  faceMouthOffsetY: 0,
  faceMouthRotationDeg: 0,
  faceBlinkBar: "|",
  faceBlinkScale: 1,
  faceBlinkOffsetX: 0,
  faceBlinkOffsetY: 0,
  faceThinkingFrames: ["|", "/", "-", "\\"],
  avatarDetails: null,
  profilePictureImageId: null,
  audioVoiceProfile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
};

const currentFromPristine = (
  overrides: Partial<BotCustomizerSaveCurrent> = {}
): BotCustomizerSaveCurrent => ({
  name: pristine.name,
  storedSystemPrompt: pristine.prompt,
  advancedMode: false,
  localModel: pristine.localModel,
  onlineModel: pristine.onlineModel,
  localModelForStorage: pristine.localModel,
  onlineModelForStorage: pristine.onlineModel,
  localImageModel: pristine.localImageModel,
  openAiImageModel: pristine.openAiImageModel,
  localImageModelForStorage: "",
  openAiImageModelForStorage: "",
  onlineEnabled: pristine.onlineEnabled,
  deleteProtected: pristine.deleteProtected,
  flirtEnabled: pristine.flirtEnabled,
  temperature: pristine.temperature,
  maxTokens: pristine.maxTokens,
  topP: pristine.topP,
  topK: pristine.topK,
  repetitionPenalty: pristine.repetitionPenalty,
  color: pristine.color,
  glyph: pristine.glyph,
  faceEyesFont: pristine.faceEyesFont,
  faceEyeCharacter: pristine.faceEyeCharacter,
  faceEyeAnimation: pristine.faceEyeAnimation,
  faceMouthFont: pristine.faceMouthFont,
  faceMouthCharacter: pristine.faceMouthCharacter,
  faceMouthAnimation: pristine.faceMouthAnimation,
  faceFontWeight: pristine.faceFontWeight,
  faceEyeScale: pristine.faceEyeScale,
  faceEyeOffsetX: pristine.faceEyeOffsetX,
  faceEyeOffsetY: pristine.faceEyeOffsetY,
  faceEyeRotationDeg: pristine.faceEyeRotationDeg,
  faceMouthScale: pristine.faceMouthScale,
  faceMouthOffsetX: pristine.faceMouthOffsetX,
  faceMouthOffsetY: pristine.faceMouthOffsetY,
  faceMouthRotationDeg: pristine.faceMouthRotationDeg,
  faceBlinkBar: pristine.faceBlinkBar,
  faceBlinkScale: pristine.faceBlinkScale,
  faceBlinkOffsetX: pristine.faceBlinkOffsetX,
  faceBlinkOffsetY: pristine.faceBlinkOffsetY,
  faceThinkingFrames: pristine.faceThinkingFrames,
  avatarDetails: pristine.avatarDetails,
  profilePictureImageId: pristine.profilePictureImageId,
  audioVoiceProfile: pristine.audioVoiceProfile,
  ...overrides,
});

describe("bot customizer save patch", () => {
  it("patches only the bot name for a name-only edit", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(currentFromPristine({ name: "Iriss" }), pristine),
      { name: "Iriss" }
    );
  });

  it("does not treat color casing as a dirty edit", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(currentFromPristine({ color: "#66CC33" }), pristine),
      {}
    );
  });

  it("uses the storage value when an auto image model changes", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          localImageModel: "sdxl",
          localImageModelForStorage: "sdxl",
        }),
        pristine
      ),
      { localImageModel: "sdxl" }
    );
  });

  it("compares advanced prompts against the raw stored prompt", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          advancedMode: true,
          storedSystemPrompt: "raw stored prompt",
        }),
        pristine
      ),
      {}
    );
  });

  it("patches custom eye character edits including clears", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceEyeCharacter: "8" }),
        pristine
      ),
      { faceEyeCharacter: "8" }
    );

    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceEyeCharacter: null }),
        { ...pristine, faceEyeCharacter: "B" }
      ),
      { faceEyeCharacter: null }
    );
  });

  it("patches custom mouth character edits including clears", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceMouthCharacter: "△" }),
        pristine
      ),
      { faceMouthCharacter: "△" }
    );

    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceMouthCharacter: null }),
        { ...pristine, faceMouthCharacter: "V" }
      ),
      { faceMouthCharacter: null }
    );
  });

  it("patches custom glyph animation and eye rotation edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          faceEyeAnimation: "wobble",
          faceMouthAnimation: "flicker",
          faceEyeRotationDeg: 35,
        }),
        pristine
      ),
      {
        faceEyeAnimation: "wobble",
        faceMouthAnimation: "flicker",
        faceEyeRotationDeg: 35,
      }
    );
  });

  it("patches eye scale and coordinate placement edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          faceEyeScale: 1.15,
          faceEyeOffsetX: 0.06,
          faceEyeOffsetY: -0.08,
        }),
        pristine
      ),
      { faceEyeScale: 1.15, faceEyeOffsetX: 0.06, faceEyeOffsetY: -0.08 }
    );
  });

  it("patches custom mouth scale, coordinate placement, and rotation edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          faceMouthScale: 1.25,
          faceMouthOffsetX: -0.06,
          faceMouthOffsetY: 0.08,
          faceMouthRotationDeg: 35,
        }),
        pristine
      ),
      {
        faceMouthScale: 1.25,
        faceMouthOffsetX: -0.06,
        faceMouthOffsetY: 0.08,
        faceMouthRotationDeg: 35,
      }
    );
  });

  it("patches blink bar edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceBlinkBar: "none" }),
        pristine
      ),
      { faceBlinkBar: "none" }
    );
  });

  it("patches custom blink scale and placement edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          faceBlinkScale: 1.2,
          faceBlinkOffsetX: -0.08,
          faceBlinkOffsetY: 0.06,
        }),
        pristine
      ),
      {
        faceBlinkScale: 1.2,
        faceBlinkOffsetX: -0.08,
        faceBlinkOffsetY: 0.06,
      }
    );
  });

  it("patches thinking frame edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ faceThinkingFrames: [".", "o", "O", "o"] }),
        pristine
      ),
      { faceThinkingFrames: [".", "o", "O", "o"] }
    );
  });

  it("patches avatar detail recipe edits and clears", () => {
    const avatarDetails = {
      version: 1 as const,
      screen: {
        stamps: [
          {
            id: "round-glasses" as const,
            offsetX: 0,
            offsetY: 0,
            scalePct: 100,
          },
        ],
        paintMaskBase64: null,
      },
    };
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ avatarDetails }),
        pristine
      ),
      { avatarDetails }
    );
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({ avatarDetails: null }),
        { ...pristine, avatarDetails }
      ),
      { avatarDetails: null }
    );
  });

  it("patches a portable voice profile as the user override", () => {
    const audioVoiceProfile = {
      ...pristine.audioVoiceProfile,
      baseVoiceId: "voice-4" as const,
      pitch: 0.35,
    };
    assert.deepEqual(
      buildBotCustomizerSavePatch(currentFromPristine({ audioVoiceProfile }), pristine),
      { audioVoiceProfileOverride: audioVoiceProfile }
    );
  });
});
