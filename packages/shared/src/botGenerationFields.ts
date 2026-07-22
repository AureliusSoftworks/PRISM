export const BOT_GENERATION_FIELD_REGISTRY_VERSION = 1 as const;

export type BotGenerationFieldPolicyV1 = "semantic" | "bounded" | "excluded";
export type BotGenerationFieldValueKindV1 = "string" | "boolean" | "number" | "string-array";

export interface BotGenerationFieldDefinitionV1 {
  policy: BotGenerationFieldPolicyV1;
  kind: BotGenerationFieldValueKindV1;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  choices?: readonly (string | number | boolean)[];
  reason?: string;
}

const prose = (maxLength: number): BotGenerationFieldDefinitionV1 => ({
  policy: "semantic", kind: "string", maxLength,
});
const semanticChoice = (
  choices: readonly (string | number | boolean)[],
): BotGenerationFieldDefinitionV1 => ({
  policy: "semantic",
  kind: typeof choices[0] === "number" ? "number" : typeof choices[0] === "boolean" ? "boolean" : "string",
  choices,
});
const bounded = (
  kind: BotGenerationFieldValueKindV1,
  options: Omit<BotGenerationFieldDefinitionV1, "policy" | "kind"> = {},
): BotGenerationFieldDefinitionV1 => ({ policy: "bounded", kind, ...options });
const excluded = (reason: string): BotGenerationFieldDefinitionV1 => ({
  policy: "excluded", kind: "string", reason,
});

/** Single source of truth for every stored creative value in Avatar Studio. */
export const BOT_GENERATION_FIELD_REGISTRY_V1 = {
  "identity.name": prose(80),
  "identity.namePronunciation": prose(160),
  "identity.selfReferral": prose(120),
  "identity.color": bounded("string"),
  "identity.glyph": bounded("string"),

  "profile.purpose.statement": prose(500),
  "profile.purpose.legacyNotes": prose(500),
  "profile.core.traits": prose(500),
  "profile.core.communicationStyle": semanticChoice(["neutral", "warm", "concise", "playful", "formal"]),
  "profile.core.openness": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.conscientiousness": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.extraversion": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.agreeableness": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.emotionalStability": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.humor": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.curiosity": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.directness": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.core.interests": prose(500),
  "profile.core.boundaries": prose(500),
  "profile.core.quirks": prose(500),
  "profile.identity.age": prose(120),
  "profile.identity.species": prose(120),
  "profile.identity.pronouns": prose(80),
  "profile.identity.background": prose(600),
  "profile.identity.role": prose(160),
  "profile.worldview.politicalView": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.worldview.religion": prose(200),
  "profile.worldview.optimism": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.worldview.tradition": semanticChoice([-2, -1, 0, 1, 2]),
  "profile.worldview.values": prose(500),
  "profile.appearance.description": prose(600),
  "profile.appearance.style": prose(300),
  "profile.appearance.presence": prose(300),
  "profile.facts.birthday": prose(20),
  "profile.facts.birthMonthDay": prose(10),
  "profile.facts.birthYear": prose(12),
  "profile.facts.birthEra": semanticChoice(["ad", "bc"]),
  "profile.facts.deceased": semanticChoice([true, false]),
  "profile.facts.basedOnRealPersonOrCharacter": semanticChoice([true, false]),
  "profile.facts.customFact.label": prose(80),
  "profile.facts.customFact.value": prose(300),
  "profile.advancedPrompt": prose(4_000),

  "face.eyes.font": bounded("string"),
  "face.eyes.glyph": bounded("string"),
  "face.eyes.animation": bounded("string"),
  "face.eyes.count": bounded("number", { integer: true }),
  "face.eyes.scale": bounded("number"),
  "face.eyes.offsetX": bounded("number"),
  "face.eyes.offsetY": bounded("number"),
  "face.eyes.rotation": bounded("number"),
  "face.mouth.font": bounded("string"),
  "face.mouth.glyph": bounded("string"),
  "face.mouth.animation": bounded("string"),
  "face.mouth.coffeePucker": bounded("boolean"),
  "face.mouth.scale": bounded("number"),
  "face.mouth.offsetX": bounded("number"),
  "face.mouth.offsetY": bounded("number"),
  "face.mouth.rotation": bounded("number"),
  "face.fontWeight": bounded("number"),
  "face.blink.glyph": bounded("string"),
  "face.blink.scale": bounded("number"),
  "face.blink.offsetX": bounded("number"),
  "face.blink.offsetY": bounded("number"),
  "face.thinking.frame0": bounded("string"),
  "face.thinking.frame1": bounded("string"),
  "face.thinking.frame2": bounded("string"),
  "face.thinking.frame3": bounded("string"),

  "details.inkRecipe": bounded("string"),
  "details.stamp.id": bounded("string"),
  "details.stamp.offsetX": bounded("number", { integer: true }),
  "details.stamp.offsetY": bounded("number", { integer: true }),
  "details.stamp.scalePct": bounded("number", { integer: true }),

  "voice.baseVoice": bounded("string"),
  "voice.effect": bounded("string"),
  "voice.direction": prose(180),
  "voice.stability": bounded("number", { minimum: 0, maximum: 1 }),
  "voice.pitch": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.warmth": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.pace": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.lilt": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.bottishTone": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.eqTilt": bounded("number", { minimum: -1, maximum: 1 }),
  "voice.gainDb": bounded("number", { minimum: -12, maximum: 6 }),
  "voice.volume": bounded("number", { minimum: 0, maximum: 1.25 }),
  "voice.previewLine": prose(240),

  "sfx.prompt": prose(500),
  "sfx.volume": bounded("number", { minimum: 0, maximum: 1.25 }),
  "sfx.playWhileTalking": bounded("boolean"),
  "sfx.playWhileIdle": bounded("boolean"),
  "sfx.playWhileThinking": bounded("boolean"),

  "settings.flirtEnabled": semanticChoice([true, false]),
  "settings.temperature": bounded("number", { minimum: 0, maximum: 2 }),
  "settings.maxTokens": bounded("number", { minimum: 256, maximum: 8_192, integer: true }),
  "settings.topP": bounded("number", { minimum: 0, maximum: 1 }),
  "settings.topK": bounded("number", { minimum: 0, maximum: 200, integer: true }),
  "settings.repetitionPenalty": bounded("number", { minimum: 0.5, maximum: 2 }),

  "power.prompt": prose(640),
  "power.sigil": bounded("string"),

  "identity.id": excluded("Stable identity is not creative content."),
  "media.profileUpload": excluded("Uploads and generated media are never rerolled."),
  "media.generatedImage": excluded("Generated media has its own explicit workflow."),
  "voice.externalVoiceId": excluded("Exact external Voice IDs never enter generation context."),
  "power.enabled": excluded("Power activation is a player control."),
  "routing.provider": excluded("Provider and privacy routing are player controls."),
  "routing.model": excluded("Provider and privacy routing are player controls."),
  "privacy.onlineEnabled": excluded("Online permission is never generated."),
  "derived.systemPrompt": excluded("Derived values follow their authored sources."),
  "destructive.delete": excluded("Destructive controls are never randomized."),
} as const satisfies Record<string, BotGenerationFieldDefinitionV1>;

export type BotGenerationFieldKeyV1 = keyof typeof BOT_GENERATION_FIELD_REGISTRY_V1;

export function normalizeBotGenerationFieldKeyV1(value: unknown): BotGenerationFieldKeyV1 | null {
  return typeof value === "string" && value in BOT_GENERATION_FIELD_REGISTRY_V1
    ? value as BotGenerationFieldKeyV1
    : null;
}

export function botGenerationFieldDefinitionV1(
  key: BotGenerationFieldKeyV1,
): BotGenerationFieldDefinitionV1 {
  return BOT_GENERATION_FIELD_REGISTRY_V1[key];
}
