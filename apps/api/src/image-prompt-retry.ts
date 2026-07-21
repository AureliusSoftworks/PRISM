import { shouldAttemptLenientLocalImageFallback } from "./image-lenient-fallback.ts";

export type ImagePromptAttemptStrategy =
  | "authored"
  | "general-audience"
  | "original-alternative";

export interface ImagePromptAttempt {
  prompt: string;
  strategy: ImagePromptAttemptStrategy;
  useSourceImage: boolean;
}

export interface ImagePromptAttemptResult<T> {
  value: T;
  prompt: string;
  strategy: ImagePromptAttemptStrategy;
  attemptCount: number;
  useSourceImage: boolean;
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/gu, " ").trim();
}

function softenRestrictedVisualDetails(prompt: string): string {
  return normalizePrompt(prompt)
    .replace(
      /\b(?:nude|naked|topless|bottomless|explicit|pornographic|erotic)\b/giu,
      "fully clothed",
    )
    .replace(
      /\b(?:sexual|sexually|horny|aroused|lustful)\b/giu,
      "romantic",
    )
    .replace(
      /\b(?:lingerie|underwear|panties|bra|thong)\b/giu,
      "everyday clothing",
    )
    .replace(
      /\b(?:cleavage|breasts?|boobs?|butt|ass|booty)\b/giu,
      "silhouette",
    );
}

export function buildGeneralAudienceImagePrompt(prompt: string): string {
  const brief = softenRestrictedVisualDetails(prompt);
  return [
    "Create an original, general-audience visual asset that preserves the safe creative intent of the brief.",
    "Keep the requested asset purpose, composition, spatial relationships, mood, palette, materials, and lighting.",
    "Translate any recognizable character, franchise, logo, branded artwork, artist-specific imitation, or real-person likeness into distinct original visual motifs while preserving its narrative role.",
    "Omit sexualized, graphic, hateful, exploitative, or otherwise unsafe details.",
    `Creative brief: ${brief}`,
  ].join(" ");
}

export function buildOriginalAlternativeImagePrompt(prompt: string): string {
  const brief = softenRestrictedVisualDetails(prompt);
  return [
    "Create a fresh, non-branded, general-audience interpretation of this visual idea.",
    "Preserve only its functional scene purpose, broad composition, emotional tone, color family, and lighting direction.",
    "Use wholly original environments, objects, symbols, artwork, and character design; do not reproduce named characters, logos, franchise-specific props, existing artworks, artist signatures, or real-person likenesses.",
    "Keep any people clearly adult, fully clothed, and non-graphic.",
    `Source intent: ${brief}`,
  ].join(" ");
}

export function buildImagePromptAttempts(args: {
  prompt: string;
  useSourceImage?: boolean;
  promptOnlyFallback?: string;
}): ImagePromptAttempt[] {
  const prompt = normalizePrompt(args.prompt);
  const promptOnlyFallback = normalizePrompt(args.promptOnlyFallback ?? prompt);
  const attempts: ImagePromptAttempt[] = [
    {
      prompt,
      strategy: "authored",
      useSourceImage: Boolean(args.useSourceImage),
    },
    {
      prompt: buildGeneralAudienceImagePrompt(prompt),
      strategy: "general-audience",
      useSourceImage: Boolean(args.useSourceImage),
    },
    {
      prompt: buildOriginalAlternativeImagePrompt(promptOnlyFallback),
      strategy: "original-alternative",
      useSourceImage: false,
    },
  ];
  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.useSourceImage ? "source" : "prompt"}:${attempt.prompt}`;
    if (!attempt.prompt || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runImagePromptAttempts<T>(args: {
  attempts: readonly ImagePromptAttempt[];
  generate: (attempt: ImagePromptAttempt, index: number) => Promise<T>;
  onRefusal?: (args: {
    attempt: ImagePromptAttempt;
    attemptNumber: number;
    error: unknown;
  }) => void;
}): Promise<ImagePromptAttemptResult<T>> {
  if (args.attempts.length === 0) {
    throw new Error("At least one image prompt attempt is required.");
  }
  for (let index = 0; index < args.attempts.length; index += 1) {
    const attempt = args.attempts[index]!;
    try {
      return {
        value: await args.generate(attempt, index),
        prompt: attempt.prompt,
        strategy: attempt.strategy,
        attemptCount: index + 1,
        useSourceImage: attempt.useSourceImage,
      };
    } catch (error) {
      if (!shouldAttemptLenientLocalImageFallback(error)) throw error;
      args.onRefusal?.({
        attempt,
        attemptNumber: index + 1,
        error,
      });
      if (index === args.attempts.length - 1) throw error;
    }
  }
  throw new Error("Image prompt attempts ended without a result.");
}

