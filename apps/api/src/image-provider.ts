import { getAppConfig } from "@localai/config";
import {
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  normalizeOpenAiImageGenerationParams,
} from "@localai/shared";
import { readOpenAiErrorMessage } from "./providers.ts";

/** @deprecated Use DEFAULT_OPENAI_IMAGE_MODEL_ID from @localai/shared */
export const DALLE_IMAGE_MODEL_ID = DEFAULT_OPENAI_IMAGE_MODEL_ID;

export interface ImageGenerationResult {
  /** Temporary OpenAI URL, or an empty string when the Images API returned base64 bytes. */
  url: string;
  imageBytes?: Buffer;
  revisedPrompt: string;
  /** OpenAI `images.generations` model id used for the call. */
  model: string;
}

const config = getAppConfig();

export async function generateImage(
  prompt: string,
  apiKey: string | undefined,
  request: {
    model?: string;
    size?: string;
    quality?: string;
    signal?: AbortSignal;
  } = {}
): Promise<ImageGenerationResult> {
  const key = apiKey ?? config.openAiApiKey;
  if (!key) {
    throw new Error("OpenAI API key is required for image generation.");
  }

  const normalized = normalizeOpenAiImageGenerationParams(
    request.model,
    request.size,
    request.quality
  );

  const body: Record<string, unknown> = {
    model: normalized.model,
    prompt,
    n: 1,
  };

  body.size = normalized.size;
  body.quality = normalized.quality;
  body.output_format = "png";

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!response.ok) {
    const detail = await readOpenAiErrorMessage(response);
    console.error(
      `[openai] image generation failed status=${response.status} detail=${
        detail || "<empty body>"
      }`
    );
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(
      `OpenAI image generation failed (${response.status})${suffix}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  };
  const item = payload.data?.[0];
  if (!item) {
    throw new Error("OpenAI returned no image data.");
  }
  const imageBytes =
    typeof item?.b64_json === "string" && item.b64_json.trim().length > 0
      ? Buffer.from(item.b64_json, "base64")
      : undefined;
  if (imageBytes && imageBytes.length === 0) {
    throw new Error("OpenAI returned an empty image payload.");
  }
  if (!item?.url && !imageBytes) {
    throw new Error("OpenAI returned no image data.");
  }

  return {
    url: item.url ?? "",
    ...(imageBytes ? { imageBytes } : {}),
    revisedPrompt: item.revised_prompt ?? prompt,
    model: normalized.model,
  };
}
