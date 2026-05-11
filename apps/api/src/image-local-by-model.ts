import {
  catalogEntriesMatchingLocalImageHeuristic,
  parseComfyUiCheckpointName,
} from "@localai/shared";
import { generateImageWithComfyUi, fetchComfyUiCheckpointNames } from "./comfyui-image.ts";
import { generateImageWithOllama } from "./ollama-image.ts";
import { parseSecondaryOllamaModelId } from "./providers.ts";
import { normalizeOllamaHostForStatusCheck } from "./settings.ts";

/**
 * Runs local image generation (ComfyUI checkpoint or Ollama image model) for a
 * concrete model id. Shared by the primary `/api/images/generate` path and the
 * lenient local image fallback retry.
 */
export async function generateLocalImageBytesByModelId(args: {
  modelId: string;
  promptForModel: string;
  size: string;
  signal: AbortSignal;
  comfyUiHost: string | null | undefined;
  secondaryOllamaHost: string | null | undefined;
  primaryOllamaHost: string;
}): Promise<{ imageBytes: Buffer; modelUsed: string; provider: "comfyui" | "ollama" }> {
  const bodyModel = args.modelId.trim();
  if (!bodyModel) {
    throw new Error("Local image model is required.");
  }

  const comfyCheckpoint = parseComfyUiCheckpointName(bodyModel);
  if (comfyCheckpoint) {
    const comfyHost = args.comfyUiHost?.trim();
    if (!comfyHost) {
      throw new Error("ComfyUI server URL is not configured. Add it in Settings.");
    }
    const available = await fetchComfyUiCheckpointNames(comfyHost);
    if (!available.includes(comfyCheckpoint)) {
      throw new Error(
        "That ComfyUI checkpoint is not available on your configured ComfyUI server."
      );
    }
    const comfyResult = await generateImageWithComfyUi({
      comfyUiHost: comfyHost,
      checkpointName: comfyCheckpoint,
      prompt: args.promptForModel,
      size: args.size,
      signal: args.signal,
    });
    return {
      imageBytes: comfyResult.imageBytes,
      modelUsed: comfyResult.modelUsed,
      provider: "comfyui",
    };
  }

  const heuristicOk =
    catalogEntriesMatchingLocalImageHeuristic([{ id: bodyModel, label: bodyModel }]).length > 0;
  if (!heuristicOk) {
    throw new Error("That model id is not recognized as a local image checkpoint.");
  }

  const secondaryModelId = parseSecondaryOllamaModelId(bodyModel);
  let ollamaHost = args.primaryOllamaHost;
  let modelForRequest = bodyModel;
  if (secondaryModelId) {
    modelForRequest = secondaryModelId;
    const secondary = args.secondaryOllamaHost?.trim();
    if (!secondary) {
      throw new Error(
        "Second Ollama host is not configured. Add it in Settings, or pick a model on the primary host."
      );
    }
    const normalized = normalizeOllamaHostForStatusCheck(secondary) ?? secondary.replace(/\/$/, "");
    ollamaHost = normalized;
  }

  const ollamaResult = await generateImageWithOllama({
    ollamaHost,
    model: modelForRequest,
    prompt: args.promptForModel,
    signal: args.signal,
  });
  return {
    imageBytes: ollamaResult.imageBytes,
    modelUsed: ollamaResult.modelUsed,
    provider: "ollama",
  };
}
