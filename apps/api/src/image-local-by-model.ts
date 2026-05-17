import {
  catalogEntriesMatchingLocalImageHeuristic,
  findComfyUiWorkflowRegistration,
  parseComfyUiCheckpointName,
  parseComfyUiRemoteWorkflowPath,
  parseComfyUiWorkflowSlug,
} from "@localai/shared";
import type { ComfyUiWorkflowRegistration } from "@localai/shared";
import {
  generateImageWithComfyUi,
  generateImageWithComfyUiRegisteredWorkflow,
  generateImageWithComfyUiRemoteUserdataWorkflow,
  fetchComfyUiCheckpointNames,
} from "./comfyui-image.ts";
import { generateImageWithOllama } from "./ollama-image.ts";
import { parseSecondaryOllamaModelId } from "./providers.ts";
import { normalizeOllamaHostForStatusCheck } from "./settings.ts";

/**
 * Runs local image generation (ComfyUI checkpoint, user ComfyUI workflow, or
 * Ollama image model) for a concrete model id. Shared by the primary
 * `/api/images/generate` path and the lenient local image fallback retry.
 */
export async function generateLocalImageBytesByModelId(args: {
  modelId: string;
  promptForModel: string;
  negativePrompt?: string;
  size: string;
  signal: AbortSignal;
  comfyUiHost: string | null | undefined;
  /** User-saved bindings (`comfyui-workflow:`) and patch overrides for ComfyUI disk workflows (`comfyui-remote:`). */
  comfyUiWorkflows?: readonly ComfyUiWorkflowRegistration[] | null;
  secondaryOllamaHost: string | null | undefined;
  primaryOllamaHost: string;
}): Promise<{ imageBytes: Buffer; modelUsed: string; provider: "comfyui" | "ollama" }> {
  const bodyModel = args.modelId.trim();
  if (!bodyModel) {
    throw new Error("Local image model is required.");
  }

  const list = args.comfyUiWorkflows ?? [];

  const remotePickPath = parseComfyUiRemoteWorkflowPath(bodyModel);
  if (remotePickPath) {
    const comfyHost = args.comfyUiHost?.trim();
    if (!comfyHost) {
      throw new Error("ComfyUI server URL is not configured. Add it in Settings.");
    }
    const comfyResult = await generateImageWithComfyUiRemoteUserdataWorkflow({
      comfyUiHost: comfyHost,
      remotePath: remotePickPath,
      bindings: list,
      prompt: args.promptForModel,
      negativePrompt: args.negativePrompt,
      size: args.size,
      signal: args.signal,
    });
    return {
      imageBytes: comfyResult.imageBytes,
      modelUsed: comfyResult.modelUsed,
      provider: "comfyui",
    };
  }

  const workflowSlug = parseComfyUiWorkflowSlug(bodyModel);
  if (workflowSlug) {
    const comfyHost = args.comfyUiHost?.trim();
    if (!comfyHost) {
      throw new Error("ComfyUI server URL is not configured. Add it in Settings.");
    }
    const registration = findComfyUiWorkflowRegistration(list, workflowSlug);
    if (!registration) {
      throw new Error(
        "That ComfyUI workflow is not in your saved bindings. Add it under Settings → Extra servers, then Save."
      );
    }
    if (registration.remotePath?.trim()) {
      const comfyResult = await generateImageWithComfyUiRemoteUserdataWorkflow({
        comfyUiHost: comfyHost,
        remotePath: registration.remotePath.trim(),
        bindings: list,
        prompt: args.promptForModel,
        negativePrompt: args.negativePrompt,
        size: args.size,
        signal: args.signal,
      });
      return {
        imageBytes: comfyResult.imageBytes,
        modelUsed: comfyResult.modelUsed,
        provider: "comfyui",
      };
    }
    if (!registration.workflow) {
      throw new Error(
        "That workflow binding has no inline graph and no remotePath — edit it in Settings."
      );
    }
    const comfyResult = await generateImageWithComfyUiRegisteredWorkflow({
      comfyUiHost: comfyHost,
      registration,
      prompt: args.promptForModel,
      negativePrompt: args.negativePrompt,
      size: args.size,
      signal: args.signal,
    });
    return {
      imageBytes: comfyResult.imageBytes,
      modelUsed: comfyResult.modelUsed,
      provider: "comfyui",
    };
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
      negativePrompt: args.negativePrompt,
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
