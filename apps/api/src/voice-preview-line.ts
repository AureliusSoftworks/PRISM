import type { LlmProvider, ProviderMessage } from "./providers.ts";

const MAX_PERSONA_CHARS = 8_000;
const MAX_PREVIEW_CHARS = 160;

export const DEFAULT_VOICE_PREVIEW_LINE =
  "Mic check complete; Prism is ready, clear, steady, and listening closely.";

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
        "Write one brief, safe microphone-check sentence in the supplied character's voice. Return only the spoken sentence: no quotes, labels, analysis, or stage directions.",
    },
    {
      role: "user",
      content: [
        `What would ${botName} say if they were told to do a microphone check?`,
        persona ? `Persona and instructions:\n---\n${persona}\n---` : "Infer their tone from the name.",
        "Keep it distinctive, natural to say aloud, and about 12 words.",
        "Do not merely say 'hello there' or explain the task.",
      ].join("\n"),
    },
  ];

  try {
    const raw = await provider.generateResponse(messages, {
      temperature: 0.8,
      maxTokens: 56,
      usagePurpose: "voice_preview",
    });
    return normalizeVoicePreviewLine(raw) || DEFAULT_VOICE_PREVIEW_LINE;
  } catch {
    return DEFAULT_VOICE_PREVIEW_LINE;
  }
}
