/**
 * Speech registers are placeless styles — noir narration, archaic stage
 * English — that no Accent Map pin can imply. They arrive exclusively through
 * the Powers system: describe the power ("talks like a hardboiled detective")
 * and the compiler grants the canonical register, so the authored guidance
 * below stays deterministic instead of being paraphrased per bot. Unlike a
 * regional vernacular, a register colors the whole delivery rather than
 * surfacing sparsely.
 */
export const BOT_SPEECH_REGISTER_IDS = ["noir", "archaic"] as const;

export type BotSpeechRegisterId = (typeof BOT_SPEECH_REGISTER_IDS)[number];

export interface BotSpeechRegisterDefinitionV1 {
  id: BotSpeechRegisterId;
  label: string;
  description: string;
  example: string;
  guidance: string;
}

export const BOT_SPEECH_REGISTER_DEFINITIONS: readonly BotSpeechRegisterDefinitionV1[] =
  [
    {
      id: "noir",
      label: "Noir narrator",
      description: "Hardboiled case-notes narration.",
      example: "The bug walked in at midnight, the way trouble always does.",
      guidance:
        "You phrase things like a hardboiled noir narrator. Keep sentences " +
        "clipped, observations world-weary, and metaphors drawn from rain, " +
        "smoke, neon, and old debts, with the occasional simile that lands " +
        "like a slow right hook. Stay atmospheric rather than parodic, and " +
        "let the dry wit surface between the shadows.",
    },
    {
      id: "archaic",
      label: "Archaic English",
      description: "Thee-and-thou stage English, kept clear.",
      example: "Thou hast asked well; attend, and I shall answer.",
      guidance:
        "You phrase things in clear archaic English. Use thee, thou, and thy " +
        "with correct forms — thou hast, thou art, thou wilt — plus 'tis, " +
        "prithee, and gentle inversions like Ask me what thou wilt. Verily and " +
        "forsooth appear rarely. Beneath the costume the meaning stays modern " +
        "and effortless to follow.",
    },
  ];

/**
 * Register-wide rules, stated once. Registers are pervasive by design — they
 * color the whole delivery — but spelling stays standard (the accent stack
 * owns pronunciation), the character outranks the costume, and harder speech
 * effects from other Powers win outright.
 */
export const BOT_SPEECH_REGISTER_SHARED_RULES_V1 =
  "Register rules: keep standard English spelling — never respell words " +
  "phonetically to imitate pronunciation; your voice's accent carries the " +
  "sound. Stay natural rather than parodic. Your character, knowledge, and " +
  "care for the person you are speaking with always come before the style, " +
  "and any harder speech effect from your Powers wins over this register.";

export function normalizeBotSpeechRegisterId(
  value: unknown,
  fallback: BotSpeechRegisterId | null = null,
): BotSpeechRegisterId | null {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLocaleLowerCase();
  return (BOT_SPEECH_REGISTER_IDS as readonly string[]).includes(normalized)
    ? (normalized as BotSpeechRegisterId)
    : fallback;
}

export function botSpeechRegisterDefinitionForId(
  value: unknown,
): BotSpeechRegisterDefinitionV1 | null {
  const id = normalizeBotSpeechRegisterId(value);
  return id
    ? BOT_SPEECH_REGISTER_DEFINITIONS.find(
        (definition) => definition.id === id,
      ) ?? null
    : null;
}

/** Canonical prompt-time cue for a granted register; empty for unknown ids. */
export function botSpeechRegisterAuthoringCueV1(value: unknown): string {
  const definition = botSpeechRegisterDefinitionForId(value);
  if (!definition) return "";
  return `Speech register — ${definition.label}: ${definition.guidance}\n${BOT_SPEECH_REGISTER_SHARED_RULES_V1}`;
}
