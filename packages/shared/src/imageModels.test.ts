import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  catalogEntriesMatchingLocalImageHeuristic,
  encodeComfyUiModelId,
  isAllowedInAppOllamaPullModelName,
  isComfyUiModelId,
  normalizeOpenAiImageGenerationParams,
  normalizeOpenAiImageModelId,
  parseComfyUiCheckpointName,
} from "./imageModels.ts";

describe("imageModels", () => {
  it("normalizes OpenAI image model allowlist", () => {
    assert.equal(normalizeOpenAiImageModelId(undefined), "gpt-image-2");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-2"), "gpt-image-2");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1.5"), "gpt-image-1.5");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1"), "gpt-image-1");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1-mini"), "gpt-image-1-mini");
    assert.equal(normalizeOpenAiImageModelId("dall-e-2"), "gpt-image-2");
    assert.equal(normalizeOpenAiImageModelId("dall-e-3"), "gpt-image-2");
    assert.equal(normalizeOpenAiImageModelId("gpt-4o"), "gpt-image-2");
  });

  it("normalizes retired DALL-E model ids to GPT Image defaults", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "dall-e-2",
      "1792x1024",
      "hd"
    );
    assert.equal(r.model, "gpt-image-2");
    assert.equal(r.size, "1536x1024");
    assert.equal(r.quality, "high");
  });

  it("folds legacy DALL-E portrait sizes onto GPT Image portrait size", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "dall-e-3",
      "1024x1792",
      "hd"
    );
    assert.equal(r.model, "gpt-image-2");
    assert.equal(r.size, "1024x1536");
    assert.equal(r.quality, "high");
  });

  it("normalizes GPT Image sizes and quality names", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "gpt-image-2",
      "1536x1024",
      "hd"
    );
    assert.equal(r.model, "gpt-image-2");
    assert.equal(r.size, "1536x1024");
    assert.equal(r.quality, "high");
  });

  it("folds legacy dall-e portrait size onto GPT Image portrait size", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "gpt-image-1.5",
      "1024x1792",
      "standard"
    );
    assert.equal(r.model, "gpt-image-1.5");
    assert.equal(r.size, "1024x1536");
    assert.equal(r.quality, "medium");
  });

  it("matches local image heuristic including flux2-klein", () => {
    const hits = catalogEntriesMatchingLocalImageHeuristic([
      { id: "flux2-klein:latest", label: "Flux2 Klein" },
      { id: "llama3.2", label: "Llama" },
    ]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, "flux2-klein:latest");
  });

  it("allows only flux2-klein in-app pull names", () => {
    assert.equal(isAllowedInAppOllamaPullModelName("flux2-klein"), true);
    assert.equal(isAllowedInAppOllamaPullModelName("flux2-klein:latest"), true);
    assert.equal(isAllowedInAppOllamaPullModelName("llama3.2"), false);
  });

  it("parses ComfyUI model ids with comfyui: prefix", () => {
    assert.equal(parseComfyUiCheckpointName("comfyui:sd_xl.safetensors"), "sd_xl.safetensors");
    assert.equal(parseComfyUiCheckpointName("ollama-secondary:x"), null);
    assert.equal(isComfyUiModelId("comfyui:flux.safetensors"), true);
    assert.equal(
      encodeComfyUiModelId("flux1-dev.safetensors"),
      "comfyui:flux1-dev.safetensors"
    );
  });
});
