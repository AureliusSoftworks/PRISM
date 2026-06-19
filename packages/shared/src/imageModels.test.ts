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
    assert.equal(normalizeOpenAiImageModelId(undefined), "dall-e-3");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-2"), "gpt-image-2");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1.5"), "gpt-image-1.5");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1"), "gpt-image-1");
    assert.equal(normalizeOpenAiImageModelId("gpt-image-1-mini"), "gpt-image-1-mini");
    assert.equal(normalizeOpenAiImageModelId("dall-e-2"), "dall-e-2");
    assert.equal(normalizeOpenAiImageModelId("gpt-4o"), "dall-e-3");
  });

  it("coerces dall-e-2 sizes and drops hd quality from normalized shape", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "dall-e-2",
      "1792x1024",
      "hd"
    );
    assert.equal(r.model, "dall-e-2");
    assert.equal(r.size, "1024x1024");
    assert.equal("quality" in r, false);
  });

  it("preserves dall-e-3 portrait sizes", () => {
    const r = normalizeOpenAiImageGenerationParams(
      "dall-e-3",
      "1024x1792",
      "hd"
    );
    assert.equal(r.model, "dall-e-3");
    assert.equal(r.size, "1024x1792");
    assert.equal(r.quality, "hd");
  });

  it("maps app portrait and landscape sizes onto dall-e-3 sizes", () => {
    const portrait = normalizeOpenAiImageGenerationParams(
      "dall-e-3",
      "1024x1536",
      "standard"
    );
    assert.equal(portrait.size, "1024x1792");

    const landscape = normalizeOpenAiImageGenerationParams(
      "dall-e-3",
      "1536x1024",
      "standard"
    );
    assert.equal(landscape.size, "1792x1024");
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
