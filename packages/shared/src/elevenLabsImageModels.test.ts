import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI,
  isElevenLabsImageModelId,
} from "./elevenLabsImageModels.ts";

describe("elevenLabsImageModels", () => {
  it("exposes ElevenLabs Image & Video image models for the picker", () => {
    assert.ok(ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI.length >= 5);
    assert.equal(
      ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI.some(
        (model) => model.id === "elevenlabs-image:gpt-image-2"
      ),
      true
    );
    assert.equal(
      ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI.some(
        (model) => model.id === "elevenlabs-image:krea-2-large"
      ),
      true
    );
    assert.equal(
      ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI.some(
        (model) => model.id === "elevenlabs-image:flux-2-pro"
      ),
      true
    );
  });

  it("recognizes only the namespaced visual model ids", () => {
    assert.equal(isElevenLabsImageModelId("elevenlabs-image:kling-o1-image"), true);
    assert.equal(isElevenLabsImageModelId("eleven_v3"), false);
    assert.equal(isElevenLabsImageModelId("music_v2"), false);
  });
});
