/**
 * Optional auxiliary-LLM suggestions for bot-scoped image prompts (scene requests only;
 * {@link composeAugmentedImagePrompt} runs on the actual generate call).
 */
import type { LlmProvider, ProviderMessage } from "./providers.ts";

const IMAGE_PROMPT_SUGGESTION_TARGET_COUNT = 5;
const MAX_SUGGESTION_CHARS = 160;
const MAX_BOT_SYSTEM_PROMPT_CHARS = 3000;

const INFER_TEMPERATURE = 0.7;
const INFER_MAX_TOKENS = 450;

const MAX_RANDOM_SCENE_CHARS = 1200;
const RANDOM_SCENE_TEMPERATURE = 0.72;
const RANDOM_SCENE_MAX_TOKENS = 280;

/** Mirrors {@link chat.ts} `extractJsonObjectPayload` for fenced JSON / brace slicing. */
export function extractJsonObjectPayload(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function clipSuggestion(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_SUGGESTION_CHARS) return oneLine;
  return `${oneLine.slice(0, MAX_SUGGESTION_CHARS - 3).trimEnd()}...`;
}

function normalizeSceneWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Caps dice / random-prompt output for the multi-line Images textarea. */
export function clipRandomSceneLine(text: string): string {
  const t = normalizeSceneWhitespace(text);
  if (t.length <= MAX_RANDOM_SCENE_CHARS) return t;
  return `${t.slice(0, MAX_RANDOM_SCENE_CHARS - 3).trimEnd()}...`;
}

/**
 * Parses `{"prompt":"..."}` from auxiliary output (JSON object or loose first line).
 */
export function parseRandomImagePromptPayload(raw: string): string {
  const payload = extractJsonObjectPayload(raw);
  try {
    const parsedUnknown = JSON.parse(payload) as { prompt?: unknown };
    if (typeof parsedUnknown.prompt === "string" && parsedUnknown.prompt.trim()) {
      return clipRandomSceneLine(parsedUnknown.prompt);
    }
  } catch {
    // Fall through to line fallback.
  }
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/m, "")
    .trim();
  const line =
    stripped.split(/\r?\n/).find((l) => l.replace(/[{[\]}]/g, "").trim().length > 0) ??
    stripped;
  return clipRandomSceneLine(line);
}

/**
 * One-shot scene line for the Images panel dice control (optional bot context).
 */
export async function inferRandomImageSceneLine(
  auxiliaryProvider: LlmProvider,
  args: { botName?: string; systemPrompt?: string }
): Promise<string> {
  const name = args.botName?.trim();
  const persona = (args.systemPrompt ?? "").trim().slice(0, MAX_BOT_SYSTEM_PROMPT_CHARS);
  const hasBot = Boolean(name);

  const userParts = [
    hasBot
      ? `Bot display name: "${name}".`
      : "No bot specified — write one evocative Prism-style scene description (third person, cinematic).",
    persona
      ? `Bot persona / instructions:\n---\n${persona}\n---`
      : hasBot
        ? "Short persona text missing — infer tone from the bot name."
        : "",
    `Respond with compact JSON exactly in this shape: {"prompt":"..."}.`,
    "The prompt value is what the user types as their image scene request (after 'Scene request:' in Prism — not a recap of the persona block).",
    "Prompt-focused: setting, light, mood, materials, weather, shot scale (wide, aerial, silhouette, etc.). Third person only; no I, me, my, we, us, you, your.",
    "Avoid selfie, phone-camera, mirror-selfie, and default tight face-forward portraits unless the persona truly requires it.",
    hasBot
      ? "Let the bot influence theme and setting; name the character only when it serves the scene."
      : "Environment-first lines are welcome — no named character required.",
    "Keep under ~80 words.",
  ].filter((p) => p.length > 0);

  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You write one third-person text-to-image scene description for Prism. Reply with JSON only — no prose outside JSON.",
    },
    {
      role: "user",
      content: userParts.join("\n"),
    },
  ];

  try {
    const raw = await auxiliaryProvider.generateResponse(messages, {
      temperature: RANDOM_SCENE_TEMPERATURE,
      maxTokens: RANDOM_SCENE_MAX_TOKENS,
    });
    return parseRandomImagePromptPayload(raw);
  } catch {
    return "";
  }
}

/**
 * Parses `{"suggestions":["..."]}` from auxiliary model output; returns up to 5 strings.
 */
export function parseImagePromptSuggestionsPayload(raw: string): string[] {
  const payload = extractJsonObjectPayload(raw);
  try {
    const parsedUnknown = JSON.parse(payload) as { suggestions?: unknown };
    const list = parsedUnknown?.suggestions;
    if (!Array.isArray(list)) return [];
    const strings = list
      .filter((item): item is string => typeof item === "string")
      .map((s) => clipSuggestion(s))
      .filter((s) => s.length > 0);
    return [...new Set(strings)].slice(0, IMAGE_PROMPT_SUGGESTION_TARGET_COUNT);
  } catch {
    return [];
  }
}

export async function inferBotImagePromptSuggestions(
  auxiliaryProvider: LlmProvider,
  args: { botName: string; systemPrompt: string }
): Promise<string[]> {
  const name = args.botName.trim() || "Bot";
  const persona = args.systemPrompt.trim().slice(0, MAX_BOT_SYSTEM_PROMPT_CHARS);

  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You write short third-person text-to-image scene lines for Prism. Favor world-building, lighting, and camera grammar over portrait tropes. Reply with JSON only — no prose outside JSON.",
    },
    {
      role: "user",
      content: [
        `Bot display name: "${name}".`,
        persona
          ? `Bot persona / instructions (may be long):\n---\n${persona}\n---`
          : "No extended persona text was provided — infer tone from the name only.",
        `Respond with compact JSON exactly in this shape: {"suggestions":["...","...","...","...","..."]}.`,
        `Include exactly ${IMAGE_PROMPT_SUGGESTION_TARGET_COUNT} strings.`,
        "Each string is a single concise English line for the user's image prompt (the 'Scene request:' line in Prism — not a restatement of the persona).",
        "Be prompt-focused: lead with setting, time of day, light, weather, materials, color mood, and shot type (e.g. wide shot, aerial view, over-the-shoulder, distant silhouette) when useful.",
        "The bot's identity should **influence** theme, place, and atmosphere — not force every line into a head-on character portrait. Prefer scenes where the world tells the story.",
        "At least **three** of the five must **not** be tight face-forward or bust portraits. Use wide or medium shots, small figure in the frame, from behind, partial silhouette, focus on environment or props, or an empty evocative location that still fits the bot's vibe.",
        "Avoid 'selfie', self-portrait, phone or mirror camera, and 'looking at the camera' / 'facing the viewer' unless the persona makes that essential (rare).",
        "Third person only: objective scene description. Do not use first- or second-person viewpoint — no I, me, my, mine, we, us, our, you, your.",
        `Name "${name}" only when it helps the scene; otherwise vague subjects or setting-only lines are fine.`,
        "Vary mood, setting, lighting, and composition across the five.",
        "Suitable for text-to-image models; no dialogue quotes; single line each; max ~24 words per string.",
        "Strings must be safe single-line UTF-8; no numbering or bullet prefixes inside strings.",
      ].join("\n"),
    },
  ];

  try {
    const raw = await auxiliaryProvider.generateResponse(messages, {
      temperature: INFER_TEMPERATURE,
      maxTokens: INFER_MAX_TOKENS,
    });
    const parsed = parseImagePromptSuggestionsPayload(raw);
    return parsed;
  } catch {
    return [];
  }
}
