import type { DatabaseSync } from "node:sqlite";
import type { ChatMode, ComfyUiWorkflowRegistration, SentGeneratedImagePayload } from "@localai/shared";
import { composeAugmentedImagePrompt } from "@localai/shared";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import { generateImage } from "./image-provider.ts";
import { generateLocalImageBytesByModelId } from "./image-local-by-model.ts";
import { shouldAttemptLenientLocalImageFallback } from "./image-lenient-fallback.ts";
import { resolveImageGeneratePersistence } from "./image-generate-resolve.ts";
import {
  buildGeneratedImageRelativePath,
  downloadRemoteImage,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytes,
} from "./image-storage.ts";
import { tryGenerateThumbAfterPngWrite } from "./image-thumb.ts";

const config = getAppConfig();

const ASSISTANT_SENT_IMAGE_DEFAULT_SIZE = "1024x1024";
const ASSISTANT_SENT_IMAGE_ALLOWED_SIZES = new Set(["1024x1536", "1024x1024", "1536x1024"]);
const ASSISTANT_SENT_IMAGE_QUALITY = "standard";
const ASSISTANT_IMAGE_SIZE_TAGS = {
  portrait: [
    "selfie",
    "portrait",
    "headshot",
    "close-up",
    "closeup",
    "vertical",
    "9:16",
    "phone wallpaper",
    "profile photo",
  ],
  letterbox: ["square", "1:1", "avatar", "icon", "logo", "sticker", "profile pic"],
  landscape: [
    "landscape",
    "widescreen",
    "wide-screen",
    "panorama",
    "panoramic",
    "cinematic",
    "16:9",
    "21:9",
    "banner",
  ],
} as const;

function scoreSizeTags(text: string, tags: readonly string[]): number {
  let score = 0;
  for (const tag of tags) {
    if (text.includes(tag)) score += 1;
  }
  return score;
}

function inferAssistantSentImageSize(textRaw: string): string {
  const text = textRaw.toLowerCase();
  const portrait = scoreSizeTags(text, ASSISTANT_IMAGE_SIZE_TAGS.portrait);
  const letterbox = scoreSizeTags(text, ASSISTANT_IMAGE_SIZE_TAGS.letterbox);
  const landscape = scoreSizeTags(text, ASSISTANT_IMAGE_SIZE_TAGS.landscape);
  if (portrait === 0 && letterbox === 0 && landscape === 0) {
    return ASSISTANT_SENT_IMAGE_DEFAULT_SIZE;
  }
  if (portrait >= landscape && portrait >= letterbox) return "1024x1536";
  if (landscape >= portrait && landscape >= letterbox) return "1536x1024";
  return ASSISTANT_SENT_IMAGE_DEFAULT_SIZE;
}

function isMissingComfyWorkflowError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("could not read workflow file") ||
    message.includes("comfyui userdata") ||
    message.includes("/api/userdata") ||
    message.includes("workflow file")
  );
}

type BotPersonaImageRow = {
  name: string;
  system_prompt: string;
  local_image_model: string | null;
  openai_image_model: string | null;
};

export interface AssistantSentImageUserPrefs {
  preferredLocalImageModel: string | null;
  preferredOpenAiImageModel: string | null;
  lenientLocalImageFallbackModel: string | null;
  comfyuiHost: string | null;
  /** Parsed from `users.comfyui_workflows` for `comfyui-workflow:` image model ids. */
  comfyUiWorkflows: readonly ComfyUiWorkflowRegistration[];
  secondaryOllamaHost: string | null;
}

/**
 * Runs image generation after the assistant emits a `sendGeneratedImage` tool stub.
 * Best-effort: returns `undefined` when generation cannot complete (does not throw).
 */
export async function runAssistantSentImageGeneration(args: {
  db: DatabaseSync;
  userId: string;
  mode: ChatMode;
  conversationId: string | null;
  botIdTriState: string | null | undefined;
  userMessage: string;
  captionPrompt: string;
  requestedSize?: string;
  preferredProvider: "local" | "openai";
  openAiApiKey: string | undefined;
  prefs: AssistantSentImageUserPrefs;
  signal?: AbortSignal;
}): Promise<SentGeneratedImagePayload | undefined> {
  if (args.mode !== "chat" && args.mode !== "sandbox") {
    return undefined;
  }
  const cid = args.conversationId?.trim() ?? "";
  const bodyBotIdRaw = args.botIdTriState;
  const bodyBotId =
    typeof bodyBotIdRaw === "string" && bodyBotIdRaw.trim().length > 0
      ? bodyBotIdRaw.trim()
      : undefined;

  const persistence = resolveImageGeneratePersistence({
    db: args.db,
    userId: args.userId,
    conversationIdRaw: cid.length > 0 ? cid : "",
    bodyBotId,
  });
  if (!persistence.ok) {
    return undefined;
  }

  const prompt = args.captionPrompt.trim();
  let promptForModel = prompt;
  const explicitRequestedSize = args.requestedSize?.trim() ?? "";
  const requestedSize = ASSISTANT_SENT_IMAGE_ALLOWED_SIZES.has(explicitRequestedSize)
    ? explicitRequestedSize
    : inferAssistantSentImageSize(`${args.userMessage}\n${args.captionPrompt}`);
  let botPersona: BotPersonaImageRow | undefined;
  const personaBotId = persistence.personaBotId;
  if (personaBotId) {
    botPersona = args.db
      .prepare(
        `SELECT name, system_prompt, local_image_model, openai_image_model
           FROM bots WHERE id = ? AND user_id = ?`
      )
      .get(personaBotId, args.userId) as BotPersonaImageRow | undefined;
    if (botPersona) {
      promptForModel = composeAugmentedImagePrompt({
        botName: botPersona.name,
        systemPrompt: botPersona.system_prompt,
        userPrompt: prompt,
      });
    }
  }

  const botLocalImageModel = botPersona?.local_image_model?.trim() ?? "";
  const preferredLocalImageModel = args.prefs.preferredLocalImageModel?.trim() ?? "";
  const resolvedLocalImageModel = botLocalImageModel || preferredLocalImageModel;
  const resolvedOpenAiImageModel =
    (botPersona?.openai_image_model?.trim() ?? "") ||
    (args.prefs.preferredOpenAiImageModel?.trim() ?? "");
  const lenientFb = args.prefs.lenientLocalImageFallbackModel?.trim() ?? "";

  const imageId = randomId(12);
  const localRelPath = buildGeneratedImageRelativePath(args.userId, imageId);
  /** Same URL shape the Images panel expects for authenticated fetches. */
  const displayUrl = `/api/images/${encodeURIComponent(imageId)}/file`;
  const signal = args.signal ?? new AbortController().signal;

  const insertRow = (argsInsert: {
    revisedPrompt: string | null;
    urlForDb: string;
    providerTag: string;
    modelUsed: string;
  }) => {
    args.db
      .prepare(
        `INSERT INTO images (
          id, user_id, conversation_id, bot_id,
          prompt, revised_prompt, url, size, quality,
          provider, model, local_rel_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        imageId,
        args.userId,
        persistence.conversationIdForInsert,
        persistence.persistedBotId,
        prompt,
        argsInsert.revisedPrompt,
        argsInsert.urlForDb,
        requestedSize,
        ASSISTANT_SENT_IMAGE_QUALITY,
        argsInsert.providerTag,
        argsInsert.modelUsed,
        localRelPath,
        new Date().toISOString()
      );
  };

  const successPayload = (
    revised: string | undefined,
    imageModel: string
  ): SentGeneratedImagePayload => ({
    imageId,
    prompt,
    displayUrl,
    imageModel: imageModel.trim(),
    ...(revised ? { revisedPrompt: revised } : {}),
  });

  try {
    if (args.preferredProvider === "local") {
      if (!resolvedLocalImageModel) {
        console.warn(
          "[assistant-sent-image] skipped: no local image model (bot default or Settings → preferred local image model)."
        );
        return undefined;
      }
      const runLocal = (modelId: string) =>
        generateLocalImageBytesByModelId({
          modelId,
          promptForModel,
          size: requestedSize,
          signal,
          comfyUiHost: args.prefs.comfyuiHost,
          comfyUiWorkflows: args.prefs.comfyUiWorkflows,
          secondaryOllamaHost: args.prefs.secondaryOllamaHost,
          primaryOllamaHost: config.ollamaHost,
        });

      let localOut: Awaited<ReturnType<typeof generateLocalImageBytesByModelId>> | undefined;
      try {
        localOut = await runLocal(resolvedLocalImageModel);
      } catch (primaryError) {
        const fallbackCandidates: string[] = [];
        const primaryModel = resolvedLocalImageModel.trim();
        const isWorkflowMissing = isMissingComfyWorkflowError(primaryError);
        // Bot-specific model can point at a stale workflow; retry with account default.
        if (
          botLocalImageModel &&
          preferredLocalImageModel &&
          preferredLocalImageModel !== primaryModel
        ) {
          fallbackCandidates.push(preferredLocalImageModel);
        }
        if (
          lenientFb &&
          lenientFb !== primaryModel &&
          (shouldAttemptLenientLocalImageFallback(primaryError) || isWorkflowMissing)
        ) {
          fallbackCandidates.push(lenientFb);
        }
        let fallbackSucceeded = false;
        for (const candidate of fallbackCandidates) {
          try {
            localOut = await runLocal(candidate);
            fallbackSucceeded = true;
            break;
          } catch {
            // Try the next candidate.
          }
        }
        if (!fallbackSucceeded) {
          console.warn(
            "[assistant-sent-image] local primary model failed:",
            primaryError instanceof Error ? primaryError.message : primaryError
          );
          return undefined;
        }
      }
      if (!localOut) {
        return undefined;
      }
      writeGeneratedImageBytes(localRelPath, localOut.imageBytes);
      await tryGenerateThumbAfterPngWrite(localRelPath);
      insertRow({
        revisedPrompt: prompt,
        urlForDb: displayUrl,
        providerTag: localOut.provider,
        modelUsed: localOut.modelUsed,
      });
      return successPayload(prompt, localOut.modelUsed);
    }

    const apiKey = args.openAiApiKey ?? config.openAiApiKey;
    if (!apiKey) {
      return undefined;
    }

    try {
      const openAiResult = await generateImage(promptForModel, apiKey, {
        model: resolvedOpenAiImageModel || undefined,
        size: requestedSize,
        quality: ASSISTANT_SENT_IMAGE_QUALITY,
        signal,
      });
      let imageBytes: Buffer;
      try {
        imageBytes = await downloadRemoteImage(openAiResult.url, { signal });
      } catch {
        return undefined;
      }
      try {
        writeGeneratedImageBytes(localRelPath, imageBytes);
      } catch {
        tryUnlinkGeneratedImageFile(localRelPath);
        return undefined;
      }
      await tryGenerateThumbAfterPngWrite(localRelPath);
      insertRow({
        revisedPrompt: openAiResult.revisedPrompt ?? null,
        urlForDb: openAiResult.url,
        providerTag: "openai",
        modelUsed: openAiResult.model,
      });
      return successPayload(openAiResult.revisedPrompt ?? undefined, openAiResult.model);
    } catch (primaryError) {
      if (
        !lenientFb ||
        !shouldAttemptLenientLocalImageFallback(primaryError)
      ) {
        return undefined;
      }
      const localOut = await generateLocalImageBytesByModelId({
        modelId: lenientFb,
        promptForModel,
        size: requestedSize,
        signal,
        comfyUiHost: args.prefs.comfyuiHost,
        comfyUiWorkflows: args.prefs.comfyUiWorkflows,
        secondaryOllamaHost: args.prefs.secondaryOllamaHost,
        primaryOllamaHost: config.ollamaHost,
      });
      writeGeneratedImageBytes(localRelPath, localOut.imageBytes);
      await tryGenerateThumbAfterPngWrite(localRelPath);
      insertRow({
        revisedPrompt: prompt,
        urlForDb: displayUrl,
        providerTag: localOut.provider,
        modelUsed: localOut.modelUsed,
      });
      return successPayload(prompt, localOut.modelUsed);
    }
  } catch (err) {
    tryUnlinkGeneratedImageFile(localRelPath);
    console.warn(
      "[assistant-sent-image] generation failed:",
      err instanceof Error ? err.message : err
    );
    return undefined;
  }
}
