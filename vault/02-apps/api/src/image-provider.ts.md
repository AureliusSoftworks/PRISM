---
title: "apps/api/src/image-provider.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/image-provider.ts"
status: "active"
---

# apps/api/src/image-provider.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/providers.ts]]

## Referenced by
- [[02-apps/api/src/server.ts]]
- [[04-docs/DESIGN.md]]

## Source path
- `apps/api/src/image-provider.ts`

## Import references
- `@localai/config`
- `./providers.ts`

## Source preview
```text
import { getAppConfig } from "@localai/config";
import { readOpenAiErrorMessage } from "./providers.ts";

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
    // Reuse the shared OpenAI error parser so the message we echo back is
    // the actual `error.message` (e.g. "Your prompt was rejected by our
    // safety system.") rather than a raw JSON blob dumped verbatim.
    const detail = await readOpenAiErrorMessage(response);
    console.error(
      `[openai] image generation failed status=${response.status} detail=${
        detail || "<empty body>"
      }`
    );
    const suffix = detail ? `:

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
