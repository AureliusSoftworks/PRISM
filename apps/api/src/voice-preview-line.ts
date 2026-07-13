import type { LlmProvider, ProviderMessage } from "./providers.ts";

const MAX_PERSONA_CHARS = 8_000;
const MAX_PREVIEW_CHARS = 160;

export const DEFAULT_VOICE_PREVIEW_LINE =
  "I tried being mysterious once, but I kept explaining the mystery.";

export function voicePreviewLineSoundsLikeAudioCheck(value: unknown): boolean {
  const line = normalizeVoicePreviewLine(value);
  return /\b(?:mic|microphone|microphones|audio|soundcheck|sound-check|voice\s+sample)\b|\b(?:sound|signal|voice)\s+(?:check|test)\b|\btesting,?\s*(?:one|1)\b/iu.test(line);
}

export function normalizeVoicePreviewLine(value: unknown): string {
  if (typeof value !== "string") return "";
  const line = value
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^(["'“‘])|(["'”’])$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!line || /^(?:\*|\[|\().*(?:\*|\]|\))$/.test(line)) return "";
  return line.slice(0, MAX_PREVIEW_CHARS).trim();
}

export async function inferVoicePreviewLine(
  provider: LlmProvider,
  args: { botName: string; systemPrompt?: string | null }
): Promise<string> {
  const botName = args.botName.trim().slice(0, 120) || "this character";
  const persona = (args.systemPrompt ?? "").trim().slice(0, MAX_PERSONA_CHARS);
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "Write one brief, safe, persona-specific sentence in the supplied character's voice. It should reveal their identity, worldview, signature concern, world, or mannerisms, and feel like something only this character would plausibly say. Prefer wit when it fits the persona, but do not force a generic joke. Return only the spoken sentence: no quotes, labels, analysis, or stage directions. Never mention microphones, audio, voices, sound checks, testing, or the preview task.",
    },
    {
      role: "user",
      content: [
        `Give ${botName} one fresh line that immediately showcases who they are.`,
        persona ? `Persona and instructions:\n---\n${persona}\n---` : "Infer their tone from the name.",
        "Use a concrete persona-specific detail rather than a generic greeting or joke.",
        "Keep it distinctive, natural to say aloud, and about 10 to 18 words.",
        "Do not introduce their name, explain the task, or refer to checking anything.",
      ].join("\n"),
    },
  ];

  try {
    const raw = await provider.generateResponse(messages, {
      temperature: 0.8,
      maxTokens: 56,
      usagePurpose: "voice_preview",
    });
    const line = normalizeVoicePreviewLine(raw);
    return line && !voicePreviewLineSoundsLikeAudioCheck(line)
      ? line
      : DEFAULT_VOICE_PREVIEW_LINE;
  } catch {
    return DEFAULT_VOICE_PREVIEW_LINE;
  }
}
