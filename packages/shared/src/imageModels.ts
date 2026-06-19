/**
 * OpenAI Images API models surfaced in Prism (chat catalog lists text models only).
 */
export const OPENAI_IMAGE_MODEL_IDS = [
  "dall-e-3",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
  "dall-e-2",
] as const;
export type OpenAiImageModelId = (typeof OPENAI_IMAGE_MODEL_IDS)[number];

export const DEFAULT_OPENAI_IMAGE_MODEL_ID: OpenAiImageModelId = "dall-e-3";

/** Picker entries for the Images panel (not the chat text-model catalog). */
export const OPENAI_IMAGE_MODEL_OPTIONS_FOR_UI = [
  { id: "dall-e-3" as const, label: "DALL·E 3", provider: "openai" as const, isDefault: true },
  { id: "gpt-image-2" as const, label: "GPT Image 2", provider: "openai" as const },
  { id: "gpt-image-1.5" as const, label: "GPT Image 1.5", provider: "openai" as const },
  { id: "gpt-image-1" as const, label: "GPT Image 1", provider: "openai" as const },
  { id: "gpt-image-1-mini" as const, label: "GPT Image 1 Mini", provider: "openai" as const },
  { id: "dall-e-2" as const, label: "DALL·E 2", provider: "openai" as const },
] as const;

/** Fixed Ollama library model for the single in-app pull affordance ([flux2-klein](https://ollama.com/x/flux2-klein)). */
export const DEFAULT_OLLAMA_IN_APP_PULL_MODEL = "flux2-klein";

export function isAllowedOpenAiImageModelId(id: string): id is OpenAiImageModelId {
  return (OPENAI_IMAGE_MODEL_IDS as readonly string[]).includes(id);
}

export function normalizeOpenAiImageModelId(raw: string | undefined): OpenAiImageModelId {
  const trimmed = raw?.trim();
  if (trimmed && isAllowedOpenAiImageModelId(trimmed)) return trimmed;
  return DEFAULT_OPENAI_IMAGE_MODEL_ID;
}

export function isGptImageModelId(id: OpenAiImageModelId): boolean {
  return id.startsWith("gpt-image-");
}

/** Sizes supported per OpenAI images/generations for each model family. */
export type OpenAiImageSizeDalle3 = "1024x1024" | "1024x1792" | "1792x1024";
export type OpenAiImageSizeDalle2 = "256x256" | "512x512" | "1024x1024";
export type OpenAiImageSizeGpt = "1024x1024" | "1024x1536" | "1536x1024";
export type NormalizedOpenAiImageSize =
  | OpenAiImageSizeDalle3
  | OpenAiImageSizeDalle2
  | OpenAiImageSizeGpt;
export type NormalizedOpenAiImageQuality = "standard" | "hd" | "low" | "medium" | "high";

export interface NormalizedOpenAiImageRequest {
  model: OpenAiImageModelId;
  size: NormalizedOpenAiImageSize;
  /** Omitted for dall-e-2 when building the HTTP body. */
  quality?: NormalizedOpenAiImageQuality;
}

function coerceSizeForDalle3(raw: string): OpenAiImageSizeDalle3 {
  if (raw === "1024x1792" || raw === "1792x1024" || raw === "1024x1024") return raw;
  if (raw === "1024x1536") return "1024x1792";
  if (raw === "1536x1024") return "1792x1024";
  return "1024x1024";
}

function coerceSizeForDalle2(raw: string): OpenAiImageSizeDalle2 {
  if (raw === "256x256" || raw === "512x512" || raw === "1024x1024") return raw;
  // dall-e-3 portrait/landscape sizes are invalid for dall-e-2 — fold down.
  return "1024x1024";
}

function coerceSizeForGptImage(raw: string): OpenAiImageSizeGpt {
  if (raw === "1024x1536" || raw === "1536x1024" || raw === "1024x1024") return raw;
  if (raw === "1024x1792") return "1024x1536";
  if (raw === "1792x1024") return "1536x1024";
  return "1024x1024";
}

function coerceQuality(raw: string): "standard" | "hd" {
  return raw === "hd" ? "hd" : "standard";
}

function coerceGptImageQuality(raw: string): "low" | "medium" | "high" {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (raw === "hd") return "high";
  return "medium";
}

/**
 * Coerces client-supplied size/quality into values OpenAI accepts for the chosen image model.
 */
export function normalizeOpenAiImageGenerationParams(
  modelInput: string | undefined,
  sizeInput: string | undefined,
  qualityInput: string | undefined
): NormalizedOpenAiImageRequest {
  const model = normalizeOpenAiImageModelId(modelInput);
  const sizeRaw = sizeInput?.trim() ?? "1024x1024";

  if (model === "dall-e-2") {
    return {
      model,
      size: coerceSizeForDalle2(sizeRaw),
    };
  }

  const qualityRaw = qualityInput?.trim() ?? "standard";
  if (isGptImageModelId(model)) {
    return {
      model,
      size: coerceSizeForGptImage(sizeRaw),
      quality: coerceGptImageQuality(qualityRaw),
    };
  }

  return {
    model,
    size: coerceSizeForDalle3(sizeRaw),
    quality: coerceQuality(qualityRaw),
  };
}

/** Prism image-picker model id prefix for checkpoints discovered via ComfyUI (`CheckpointLoaderSimple`). */
export const COMFYUI_MODEL_PREFIX = "comfyui:";

export function encodeComfyUiModelId(checkpointFileName: string): string {
  return `${COMFYUI_MODEL_PREFIX}${checkpointFileName.trim()}`;
}

/**
 * Returns the ComfyUI checkpoint filename when `id` uses {@link COMFYUI_MODEL_PREFIX}.
 */
export function parseComfyUiCheckpointName(id: string): string | null {
  const t = id.trim();
  if (!t.startsWith(COMFYUI_MODEL_PREFIX)) {
    return null;
  }
  const rest = t.slice(COMFYUI_MODEL_PREFIX.length).trim();
  return rest.length > 0 ? rest : null;
}

export function isComfyUiModelId(id: string): boolean {
  return parseComfyUiCheckpointName(id) !== null;
}

/** Loose match for local models that plausibly support image generation (Ollama tags). */
const LOCAL_IMAGE_MODEL_HEURISTIC =
  /flux|flux2|klein|sdxl|stable-diffusion|stable_diffusion|\bsd[\-_]|kandinsky|playground|dall-e/i;

export interface LocalImageModelCandidate {
  id: string;
  label: string;
}

/**
 * Filters catalog rows whose id or label suggests an image-generation-capable checkpoint.
 */
export function catalogEntriesMatchingLocalImageHeuristic<T extends LocalImageModelCandidate>(
  entries: readonly T[]
): T[] {
  return entries.filter(
    (e) =>
      LOCAL_IMAGE_MODEL_HEURISTIC.test(e.id.trim()) ||
      LOCAL_IMAGE_MODEL_HEURISTIC.test(e.label.trim())
  );
}

/**
 * Only these resolved pull names may be triggered via POST `/api/ollama/pull-primary`.
 * Allows optional `:tag` suffix for Ollama registry strings.
 */
export function isAllowedInAppOllamaPullModelName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === DEFAULT_OLLAMA_IN_APP_PULL_MODEL || n.startsWith(`${DEFAULT_OLLAMA_IN_APP_PULL_MODEL}:`);
}
