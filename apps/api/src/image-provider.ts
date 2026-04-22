import { getAppConfig } from "@localai/config";

export interface ImageGenerationResult {
  url: string;
  revisedPrompt: string;
}

const config = getAppConfig();

export async function generateImage(
  prompt: string,
  apiKey?: string,
  size: "1024x1024" | "1024x1792" | "1792x1024" = "1024x1024",
  quality: "standard" | "hd" = "standard"
): Promise<ImageGenerationResult> {
  const key = apiKey ?? config.openAiApiKey;
  if (!key) {
    throw new Error("OpenAI API key is required for image generation.");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size,
      quality,
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI image generation failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; revised_prompt?: string }>;
  };
  const item = payload.data?.[0];
  if (!item?.url) {
    throw new Error("OpenAI returned no image URL.");
  }

  return {
    url: item.url,
    revisedPrompt: item.revised_prompt ?? prompt,
  };
}
