import type { DatabaseSync } from "node:sqlite";
import type { ChatMode, ComfyUiWorkflowRegistration, SentGeneratedImagePayload } from "@localai/shared";
import { composeVerbatimFirstImagePrompt } from "@localai/shared";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import { generateImage } from "./image-provider.ts";
import { generateLocalImageBytesByModelId } from "./image-local-by-model.ts";
import { shouldAttemptLenientLocalImageFallback } from "./image-lenient-fallback.ts";
import type { LlmProvider, ProviderMessage } from "./providers.ts";
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
const IMAGE_CONTEXT_ROW_LIMIT = 4;
const IMAGE_CONTEXT_ROW_MAX_CHARS = 220;
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

type ImageContextRow = {
  role: string;
  content: string;
  bot_name: string | null;
};

function userExplicitlyRequestsPersonaPortrait(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(selfie|self-portrait|self portrait|portrait of you|photo of you|picture of you)\b/.test(t) ||
    /\b(?:show|send|paint|draw|sketch|illustrate)\b[\s\S]{0,40}\b(?:you|yourself)\b/.test(t) ||
    /\b(?:you|yourself)\b[\s\S]{0,40}\b(?:in the photo|in the picture|in the image)\b/.test(t)
  );
}

function extractRecentUserLines(contextLines: readonly string[]): string[] {
  return contextLines
    .filter((line) => /^user:/i.test(line.trim()))
    .map((line) => line.replace(/^user:\s*/i, "").trim())
    .filter((line) => line.length > 0)
    .slice(-2);
}

function requestLooksSceneOnly(text: string): boolean {
  const t = text.toLowerCase();
  const hasSceneCue =
    /\b(city|town|village|landscape|skyline|street|river|mountain|forest|ocean|sea|architecture|building|scene|view|vista|florence)\b/.test(
      t
    ) ||
    /\b(?:picture|image|photo|painting|paint|draw|sketch|illustration)\b[\s\S]{0,30}\bof\b/.test(t);
  const hasPersonCue =
    /\b(person|people|portrait|selfie|face|character|figure|man|woman|child|you|yourself)\b/.test(
      t
    );
  return hasSceneCue && !hasPersonCue;
}

function resolveImageSubjectPolicy(text: string): {
  allowPersonaPortrait: boolean;
  sceneOnlyComposition: boolean;
} {
  const allowPersonaPortrait = userExplicitlyRequestsPersonaPortrait(text);
  const sceneOnlyComposition = !allowPersonaPortrait && requestLooksSceneOnly(text);
  return { allowPersonaPortrait, sceneOnlyComposition };
}

function clipImageContextLine(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= IMAGE_CONTEXT_ROW_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, IMAGE_CONTEXT_ROW_MAX_CHARS - 3).trimEnd()}...`;
}

function loadRecentImageContextLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const rows = db
    .prepare(
      `SELECT m.role, m.content, b.name AS bot_name
         FROM messages m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.user_id = ? AND m.conversation_id = ?
          AND TRIM(m.content) <> ''
        ORDER BY m.created_at DESC
        LIMIT ?`
    )
    .all(userId, conversationId, IMAGE_CONTEXT_ROW_LIMIT) as ImageContextRow[];
  return rows
    .slice()
    .reverse()
    .map((row) => {
      const content = clipImageContextLine(row.content ?? "");
      if (!content) return "";
      if (row.role === "assistant") {
        const speaker = row.bot_name?.trim() || "Assistant";
        return `${speaker}: ${content}`;
      }
      if (row.role === "user") return `User: ${content}`;
      return `System: ${content}`;
    })
    .filter((line) => line.length > 0);
}

/**
 * Builds a context-aware scene request so pronouns like "it/that scene" can
 * resolve against the recent thread instead of defaulting to a self portrait.
 */
export function buildContextAwareImageUserPrompt(args: {
  captionPrompt: string;
  userMessage: string;
  contextLines: readonly string[];
}): string {
  const caption = args.captionPrompt.trim();
  const userMessage = args.userMessage.trim();
  const contextLines = args.contextLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const recentUserLines = extractRecentUserLines(contextLines);
  const latestUserPriorityLines = [userMessage, ...recentUserLines]
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);
  const policySignalText = [caption, ...latestUserPriorityLines].join("\n");
  const { allowPersonaPortrait, sceneOnlyComposition } =
    resolveImageSubjectPolicy(policySignalText);
  if (contextLines.length === 0) return caption;
  const compactContext = contextLines.slice(-2).map((line) => `Context: ${line}`);
  const compactSignals = latestUserPriorityLines
    .slice(0, 2)
    .map((line, index) => `Recent user signal ${index + 1}: ${line}`);
  return [
    `Primary scene request (keep wording): ${caption}`,
    `Latest user message: ${userMessage}`,
    "Use context only to resolve references (it/that/this), not to replace the request.",
    ...compactSignals,
    ...compactContext,
    allowPersonaPortrait
      ? "The user explicitly asked for the persona/you to appear. Include persona only as requested."
      : "Do NOT include the speaking persona in-frame by default.",
    ...(sceneOnlyComposition
      ? [
          "Composition constraint: scene/place request only. No people, portraits, or character figures unless explicitly requested.",
        ]
      : []),
    "If context conflicts with the latest user request, follow the latest user request.",
  ].join("\n");
}

const IMAGE_DENIAL_BOUNDARY_FALLBACK =
  "I don't want to send that kind of picture, but I can make it softer or more playful instead.";

function clampImageRecoveryContext(text: string, max = 1800): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

export function buildDeterministicImagePromptRepair(prompt: string): string {
  const cleaned = prompt
    .replace(/\b(?:nude|naked|topless|bottomless|explicit|pornographic|erotic)\b/gi, "fully clothed")
    .replace(/\b(?:sexual|sexually|horny|aroused|lustful)\b/gi, "romantic")
    .replace(/\b(?:lingerie|underwear|panties|bra|thong)\b/gi, "everyday outfit")
    .replace(/\b(?:cleavage|breasts?|boobs?|butt|ass|booty)\b/gi, "silhouette")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || "a tasteful, fully clothed portrait with warm character mood";
  return [
    "Safe rewrite of the image request:",
    base,
    "Keep it non-explicit, fully clothed, adult, and suitable for a general audience. Preserve the character mood and scene with modest, non-sexual framing.",
  ].join("\n");
}

async function inferImagePromptRepair(args: {
  provider?: LlmProvider;
  botName: string;
  botSystemPrompt: string;
  userMessage: string;
  promptForModel: string;
}): Promise<string> {
  const fallback = buildDeterministicImagePromptRepair(args.promptForModel);
  const provider = args.provider;
  if (!provider) return fallback;
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content: [
        "Rewrite one image-generation prompt after a safety or moderation denial.",
        "This is not a bypass. Preserve only safe intent: character, setting, mood, outfit style, lighting, composition.",
        "Remove explicit sexual content, nudity, fetish detail, undergarment emphasis, or body-part emphasis.",
        "Make the result fully clothed, adult, non-explicit, and safe for a general audience.",
        "Return only the revised image prompt. No commentary, markdown, JSON, or policy words.",
        args.botSystemPrompt.trim()
          ? `Bot persona excerpt for visual continuity:\n${clampImageRecoveryContext(args.botSystemPrompt)}`
          : `Bot name: ${args.botName}`,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User message: ${clampImageRecoveryContext(args.userMessage)}`,
        `Denied image prompt: ${clampImageRecoveryContext(args.promptForModel)}`,
      ].join("\n\n"),
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: 0.4,
      maxTokens: 220,
    });
    const repaired = raw.replace(/\s+/g, " ").trim();
    if (!repaired || repaired.length > 1600) return fallback;
    if (shouldAttemptLenientLocalImageFallback(new Error(repaired))) return fallback;
    return repaired;
  } catch {
    return fallback;
  }
}

async function inferImageBoundaryText(args: {
  provider?: LlmProvider;
  botName: string;
  botSystemPrompt: string;
  userMessage: string;
  captionPrompt: string;
}): Promise<string> {
  const provider = args.provider;
  if (!provider) return IMAGE_DENIAL_BOUNDARY_FALLBACK;
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content: [
        `You are ${args.botName || "Assistant"}, continuing a chat.`,
        args.botSystemPrompt.trim()
          ? `Persona excerpt:\n${clampImageRecoveryContext(args.botSystemPrompt)}`
          : "",
        "The requested image could not be sent even after one safe rewrite.",
        "Write one short in-character boundary. The bot should organically say they do not want to send that kind of picture and may offer a softer alternative.",
        "Do not mention policy, safety systems, moderation, model refusal, fallback, or errors.",
        "Avoid phrases like \"I can't\" or \"I cannot\". No markdown, JSON, or tool calls.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User message: ${clampImageRecoveryContext(args.userMessage)}`,
        `Image topic: ${clampImageRecoveryContext(args.captionPrompt)}`,
      ].join("\n\n"),
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: 0.7,
      maxTokens: 90,
    });
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length > 420) return IMAGE_DENIAL_BOUNDARY_FALLBACK;
    if (shouldAttemptLenientLocalImageFallback(new Error(line))) {
      return IMAGE_DENIAL_BOUNDARY_FALLBACK;
    }
    return line;
  } catch {
    return IMAGE_DENIAL_BOUNDARY_FALLBACK;
  }
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

export type AssistantSentImageGenerationResult =
  | { status: "succeeded"; payload: SentGeneratedImagePayload }
  | { status: "denied"; message: string }
  | { status: "failed" };

/**
 * Runs image generation after the assistant emits a `sendGeneratedImage` tool stub.
 * Best-effort: returns `failed` when generation cannot complete (does not throw).
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
  promptRepairProvider?: LlmProvider;
  signal?: AbortSignal;
}): Promise<AssistantSentImageGenerationResult> {
  if (args.mode !== "chat" && args.mode !== "sandbox") {
    return { status: "failed" };
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
    return { status: "failed" };
  }

  const prompt = args.captionPrompt.trim();
  const contextLines =
    persistence.conversationIdForInsert && args.mode !== "sandbox"
      ? loadRecentImageContextLines(
          args.db,
          args.userId,
          persistence.conversationIdForInsert
        )
      : [];
  const contextAwareUserPrompt = buildContextAwareImageUserPrompt({
    captionPrompt: prompt,
    userMessage: args.userMessage,
    contextLines,
  });
  const subjectPolicySignal = [args.userMessage, prompt, ...contextLines].join("\n");
  const subjectPolicy = resolveImageSubjectPolicy(subjectPolicySignal);
  const sceneOnlyHardConstraint = subjectPolicy.sceneOnlyComposition
    ? "Hard composition rule: scene/city/environment only. Exclude people, portraits, faces, and character figures."
    : "";
  const sceneOnlyNegativePrompt = subjectPolicy.sceneOnlyComposition
    ? "person, people, portrait, face, selfie, character, figure, human"
    : undefined;
  let promptForModel = contextAwareUserPrompt;
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
      if (subjectPolicy.allowPersonaPortrait) {
        promptForModel = composeVerbatimFirstImagePrompt({
          userPrompt: contextAwareUserPrompt,
          botName: botPersona.name,
          systemPrompt: botPersona.system_prompt,
          mode: "chat_balanced",
        });
        if (sceneOnlyHardConstraint) {
          promptForModel = `${sceneOnlyHardConstraint}\n${promptForModel}`;
        }
      } else {
        // For scene-first requests, avoid injecting bot identity text because it
        // can pull diffusion models toward unsolicited character portraits.
        promptForModel = sceneOnlyHardConstraint
          ? `${sceneOnlyHardConstraint}\n${contextAwareUserPrompt}`
          : contextAwareUserPrompt;
      }
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
  ): AssistantSentImageGenerationResult => ({
    status: "succeeded",
    payload: {
      imageId,
      prompt,
      displayUrl,
      imageModel: imageModel.trim(),
      ...(revised ? { revisedPrompt: revised } : {}),
    },
  });

  const botNameForRecovery = botPersona?.name?.trim() || "Assistant";
  const botPromptForRecovery = botPersona?.system_prompt?.trim() || "";
  const buildRepairPrompt = () =>
    inferImagePromptRepair({
      provider: args.promptRepairProvider,
      botName: botNameForRecovery,
      botSystemPrompt: botPromptForRecovery,
      userMessage: args.userMessage,
      promptForModel,
    });
  const deniedResult = async (): Promise<AssistantSentImageGenerationResult> => ({
    status: "denied",
    message: await inferImageBoundaryText({
      provider: args.promptRepairProvider,
      botName: botNameForRecovery,
      botSystemPrompt: botPromptForRecovery,
      userMessage: args.userMessage,
      captionPrompt: prompt,
    }),
  });

  try {
    if (args.preferredProvider === "local") {
      if (!resolvedLocalImageModel) {
        console.warn(
          "[assistant-sent-image] skipped: no local image model (bot default or Settings → preferred local image model)."
        );
        return { status: "failed" };
      }
      const runLocal = (modelId: string, promptOverride = promptForModel) =>
        generateLocalImageBytesByModelId({
          modelId,
          promptForModel: promptOverride,
          negativePrompt: sceneOnlyNegativePrompt,
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
        const primaryWasDenied = shouldAttemptLenientLocalImageFallback(primaryError);
        if (primaryWasDenied) {
          const repairedPrompt = await buildRepairPrompt();
          const retryModel =
            lenientFb && lenientFb !== resolvedLocalImageModel.trim()
              ? lenientFb
              : resolvedLocalImageModel;
          try {
            localOut = await runLocal(retryModel, repairedPrompt);
          } catch (retryError) {
            if (shouldAttemptLenientLocalImageFallback(retryError)) {
              return deniedResult();
            }
            console.warn(
              "[assistant-sent-image] local repaired retry failed:",
              retryError instanceof Error ? retryError.message : retryError
            );
            return { status: "failed" };
          }
        } else {
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
            return { status: "failed" };
          }
        }
      }
      if (!localOut) {
        return { status: "failed" };
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
      return { status: "failed" };
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
        return { status: "failed" };
      }
      try {
        writeGeneratedImageBytes(localRelPath, imageBytes);
      } catch {
        tryUnlinkGeneratedImageFile(localRelPath);
        return { status: "failed" };
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
      if (!shouldAttemptLenientLocalImageFallback(primaryError)) {
        return { status: "failed" };
      }
      const repairedPrompt = await buildRepairPrompt();
      if (!lenientFb) {
        try {
          const openAiRetry = await generateImage(repairedPrompt, apiKey, {
            model: resolvedOpenAiImageModel || undefined,
            size: requestedSize,
            quality: ASSISTANT_SENT_IMAGE_QUALITY,
            signal,
          });
          let imageBytes: Buffer;
          try {
            imageBytes = await downloadRemoteImage(openAiRetry.url, { signal });
          } catch {
            return { status: "failed" };
          }
          try {
            writeGeneratedImageBytes(localRelPath, imageBytes);
          } catch {
            tryUnlinkGeneratedImageFile(localRelPath);
            return { status: "failed" };
          }
          await tryGenerateThumbAfterPngWrite(localRelPath);
          insertRow({
            revisedPrompt: openAiRetry.revisedPrompt ?? null,
            urlForDb: openAiRetry.url,
            providerTag: "openai",
            modelUsed: openAiRetry.model,
          });
          return successPayload(openAiRetry.revisedPrompt ?? undefined, openAiRetry.model);
        } catch (retryError) {
          if (shouldAttemptLenientLocalImageFallback(retryError)) {
            return deniedResult();
          }
          return { status: "failed" };
        }
      }
      let localOut: Awaited<ReturnType<typeof generateLocalImageBytesByModelId>>;
      try {
        localOut = await generateLocalImageBytesByModelId({
          modelId: lenientFb,
          promptForModel: repairedPrompt,
          negativePrompt: sceneOnlyNegativePrompt,
          size: requestedSize,
          signal,
          comfyUiHost: args.prefs.comfyuiHost,
          comfyUiWorkflows: args.prefs.comfyUiWorkflows,
          secondaryOllamaHost: args.prefs.secondaryOllamaHost,
          primaryOllamaHost: config.ollamaHost,
        });
      } catch (retryError) {
        if (shouldAttemptLenientLocalImageFallback(retryError)) {
          return deniedResult();
        }
        return { status: "failed" };
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
  } catch (err) {
    tryUnlinkGeneratedImageFile(localRelPath);
    console.warn(
      "[assistant-sent-image] generation failed:",
      err instanceof Error ? err.message : err
    );
    return { status: "failed" };
  }
}
