/**
 * Runs an Ollama image-generation checkpoint (e.g. flux2-klein) via `/api/generate`.
 * The API returns a single JSON object with a base64-encoded PNG in `image` when
 * `stream` is false.
 */
import { HttpError } from "./utils.http.ts";
import {
  looksLikeBackendModelWarmupMessage,
  looksLikeOllamaRunnerInterruptedMessage,
  MODEL_WARMUP_USER_MESSAGE,
  OLLAMA_IMAGE_RUNNER_INTERRUPTED_MESSAGE,
} from "./image-warmup-heuristics.ts";

type OllamaImagePayload = {
  model?: string;
  image?: string;
  response?: string;
};

/**
 * Ollama `/api/generate` with `stream: false` should return one JSON object. Some local
 * runners prepend log lines or emit NDJSON; scan from the last parseable object.
 */
function parseOllamaImageGenerateJsonBody(rawText: string): OllamaImagePayload {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed) as OllamaImagePayload;
  } catch {
    const lines = trimmed.split(/\n/).filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const row = JSON.parse(lines[i]!.trim()) as OllamaImagePayload;
        if (row && typeof row === "object") return row;
      } catch {
        continue;
      }
    }
    throw new Error("Ollama returned invalid JSON for image generation.");
  }
}

export async function generateImageWithOllama(args: {
  ollamaHost: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<{ imageBytes: Buffer; modelUsed: string }> {
  const base = args.ollamaHost.replace(/\/$/, "");
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: args.model,
      prompt: args.prompt,
      stream: false,
    }),
    signal: args.signal,
  });

  const rawText = await res.text();
  if (!res.ok) {
    const snippet = rawText.trim().slice(0, 600);
    if (looksLikeOllamaRunnerInterruptedMessage(snippet)) {
      throw new HttpError(503, OLLAMA_IMAGE_RUNNER_INTERRUPTED_MESSAGE);
    }
    if (looksLikeBackendModelWarmupMessage(snippet)) {
      throw new HttpError(503, MODEL_WARMUP_USER_MESSAGE);
    }
    throw new Error(`Ollama image generation failed (${res.status}): ${snippet}`);
  }

  const payload = parseOllamaImageGenerateJsonBody(rawText);

  const b64 = payload.image?.trim();
  if (!b64) {
    const hint =
      typeof payload.response === "string" && payload.response.trim().length > 0
        ? ` Model replied with text only (first line: ${payload.response.trim().slice(0, 120)}…).`
        : "";
    throw new Error(
      `Ollama returned no image field.${hint} Pick a dedicated image model (e.g. flux2-klein), not a text-only chat model.`
    );
  }

  let imageBytes: Buffer;
  try {
    imageBytes = Buffer.from(b64, "base64");
  } catch {
    throw new Error("Ollama returned image data that could not be decoded.");
  }
  if (imageBytes.length === 0) {
    throw new Error("Ollama returned an empty image.");
  }

  return {
    imageBytes,
    modelUsed: (payload.model ?? args.model).trim(),
  };
}
