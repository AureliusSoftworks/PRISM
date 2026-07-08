import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_BOT_ACCESSORY_PLACEMENT } from "@localai/shared";
import {
  buildBotCustomizerSavePatch,
  type BotCustomizerSaveCurrent,
  type BotCustomizerSavePristine,
} from "./botCustomizerSavePatch.ts";

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
  faceMouthFont: "warm",
  faceFontWeight: 500,
  profilePictureImageId: null,
  accessoryPlacement: DEFAULT_BOT_ACCESSORY_PLACEMENT,
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
  faceMouthFont: pristine.faceMouthFont,
  faceFontWeight: pristine.faceFontWeight,
  profilePictureImageId: pristine.profilePictureImageId,
  accessoryPlacement: pristine.accessoryPlacement,
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

  it("patches normalized accessory placement edits", () => {
    assert.deepEqual(
      buildBotCustomizerSavePatch(
        currentFromPristine({
          accessoryPlacement: {
            xPct: 84.126,
            yPct: -112.5,
            sizePct: 125.333,
            layer: "front",
          },
        }),
        pristine
      ),
      {
        accessoryPlacement: {
          xPct: 84.13,
          yPct: -112.5,
          sizePct: 125.33,
          layer: "front",
        },
      }
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
});
