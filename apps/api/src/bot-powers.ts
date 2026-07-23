import {
  BOT_POWER_SIGIL_IDS_V1,
  BOT_POWER_VERSION,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsUnconditionalInterruptionV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerDesignationEffectFromIntentV1,
  botPowerSourceHashForPowerV1,
  botPowerSourceHashV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowersV1,
  type BotPowerEffectV1,
  type BotPowerSigilIdV1,
  type BotPowerTargetV1,
  type BotPowerV1,
  type CompiledBotPowerV1,
} from "@localai/shared";
import {
  LocalModelRequestError,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";

const BOT_POWER_COMPILE_MAX_TOKENS = 900;
type HardAudienceEffectType = "awareness" | "speech_audience";
type HardAudienceSelector = {
  allowed: BotPowerTargetV1[];
  excluded?: BotPowerTargetV1[];
};

function compact(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function parseJsonValue(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const objectMatch = trimmed.match(/\{[\s\S]*\}/u);
  if (objectMatch && objectMatch[0] !== trimmed) candidates.push(objectMatch[0]);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/u);
  if (arrayMatch && arrayMatch[0] !== trimmed) candidates.push(arrayMatch[0]);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function generatedPowerEntries(raw: string): unknown[] {
  const payload = parseJsonValue(raw);
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.powers)) return record.powers;
  if (record.power && typeof record.power === "object" && !Array.isArray(record.power)) {
    return [record.power];
  }
  if (
    "id" in record ||
    "selfCue" in record ||
    "self_cue" in record ||
    "effects" in record
  ) {
    return [record];
  }
  return [];
}

function normalizedAudienceNames(value: string): string[] {
  const cleaned = compact(value, 260)
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’.,!?;:]+$/gu, "")
    .replace(/^(?:the\s+)?(?:bot|character)(?:\s+named)?\s+/iu, "");
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|\band\b|\bor\b)\s*/iu)
    .map((name) => compact(name, 80).replace(/^[\s"'“”‘’]+|[\s"'“”‘’.,!?;:]+$/gu, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function audienceNamesForIntent(
  intent: string,
  type: HardAudienceEffectType
): string[] {
  const source = compact(intent, 500);
  const patterns = type === "awareness"
    ? [
        /\b(?:invisible|unseen|imperceptible|hidden\s+from\s+view)\b[\s\S]*?\bexcept(?:\s+(?:to|by|for))?\s+(.+?)\s*[.!?]*$/iu,
        /\b(?:visible|seen|perceived|noticed)\s+only\s+(?:to|by)\s+(.+?)\s*[.!?]*$/iu,
        /\bonly\s+(.+?)\s+can\s+(?:see|perceive|notice)\b/iu,
      ]
    : [
        /\b(?:inaudible|unheard|silent)\b[\s\S]*?\bexcept(?:\s+(?:to|by|for))?\s+(.+?)\s*[.!?]*$/iu,
        /\b(?:heard|audible)\s+only\s+(?:to|by)\s+(.+?)\s*[.!?]*$/iu,
        /\bonly\s+(.+?)\s+can\s+hear\b/iu,
        /\bcan\s+only\s+(?:speak|talk|address)\s+(?:to|with)\s+([^.!?;]+)/iu,
        /\b(?:speaks?|talks?|addresses?)\s+only\s+(?:to|with)\s+(.+?)\s*[.!?]*$/iu,
      ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const names = normalizedAudienceNames(match[1]);
    if (names.length > 0) return names;
  }
  return [];
}

function targetNames(value: string): BotPowerTargetV1[] {
  return normalizedAudienceNames(value).map((name) => ({
    kind: "bot" as const,
    name,
  }));
}

function normalizedTargetLabels(targets: readonly BotPowerTargetV1[]): string[] {
  return targets.map((target) =>
    target.kind === "all"
      ? "everyone"
      : target.kind === "bot"
        ? target.name
        : target.trait,
  );
}

function excludedAudienceNamesForIntent(
  intent: string,
  type: HardAudienceEffectType,
): string[] {
  const source = compact(intent, 640);
  const perceptionWord = type === "awareness"
    ? "(?:seen|visible|perceived|noticed)"
    : "(?:heard|audible)";
  const patterns = [
    new RegExp(`\\b(?:everyone|everybody|all(?:\\s+bots?)?)\\s+(?:except|but)\\s+([^,.!?;]+)`, "iu"),
    new RegExp(`\\b(?:can(?:not|'t)|is\\s+not|isn't|never)\\s+(?:be\\s+)?${perceptionWord}\\s+(?:by|to)\\s+([^,.!?;]+)`, "iu"),
    new RegExp(`\\b${perceptionWord}\\s+(?:by|to)\\s+(?:everyone|everybody|all(?:\\s+bots?)?)\\s+(?:except|but)\\s+([^,.!?;]+)`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const names = normalizedAudienceNames(match[1]);
    if (names.length > 0) return names;
  }
  return [];
}

function hardAudienceSelectorForIntent(
  intent: string,
  type: HardAudienceEffectType,
): HardAudienceSelector | null {
  const source = compact(intent, 640);
  const sourceLower = source.toLowerCase().replace(/[’]/gu, "'");
  const excludedNames = excludedAudienceNamesForIntent(source, type);
  const namedAllowed = audienceNamesForIntent(source, type);
  const negativeUniversalExcept = type === "awareness"
    ? /\b(?:invisible|unseen|imperceptible)\b[\s\S]*?\b(?:everyone|everybody|all(?:\s+bots?)?)\s+except\b/u.test(sourceLower)
    : /\b(?:inaudible|unheard|silent)\b[\s\S]*?\b(?:everyone|everybody|all(?:\s+bots?)?)\s+except\b/u.test(sourceLower);
  const everyoneElse = /\b(?:everyone|everybody)\s+else\b|\b(?:everyone|everybody|all(?:\s+bots?)?)\s+(?:except|but)\b/u.test(
    sourceLower,
  ) && !negativeUniversalExcept;
  const relevant = type === "awareness"
    ? /\b(?:see|seen|visible|invisible|unseen|perceive|perceived|notice|noticed)\b/u.test(sourceLower)
    : /\b(?:hear|heard|audible|inaudible|unheard|speak|speaks|talk|talks|address|addresses)\b/u.test(sourceLower);
  if (!relevant) return null;
  if (everyoneElse && excludedNames.length > 0) {
    return {
      allowed: [{ kind: "all" }],
      excluded: targetNames(excludedNames.join(", ")),
    };
  }
  if (namedAllowed.length > 0) {
    return {
      allowed: targetNames(namedAllowed.join(", ")),
      ...(!negativeUniversalExcept && excludedNames.length > 0
        ? { excluded: targetNames(excludedNames.join(", ")) }
        : {}),
    };
  }
  if (excludedNames.length > 0) {
    return {
      allowed: [{ kind: "all" }],
      excluded: targetNames(excludedNames.join(", ")),
    };
  }
  return null;
}

function requiredHardAudienceEffect(intent: string): HardAudienceEffectType | null {
  const source = compact(intent, 500).toLowerCase();
  const exclusive = /\b(?:only|except|nobody|no\s+one|everyone\s+but|all\s+but)\b/u.test(source);
  if (!exclusive) return null;
  if (/\b(?:hear|heard|audible|inaudible|unheard|speaks?|talks?|addresses?)\b/u.test(source)) {
    return "speech_audience";
  }
  if (/\b(?:see|seen|visible|invisible|unseen|perceive|perceived|notice|noticed)\b/u.test(source)) {
    return "awareness";
  }
  return null;
}

function requiredHardAudienceEffects(intent: string): HardAudienceEffectType[] {
  return (["awareness", "speech_audience"] as const).filter((type) =>
    hardAudienceSelectorForIntent(intent, type) !== null
  );
}

function deterministicHardAudiencePower(
  source: BotPowerV1,
  botName: string
): CompiledBotPowerV1 | null {
  const selectors = requiredHardAudienceEffects(source.intent).flatMap((type) => {
    const selector = hardAudienceSelectorForIntent(source.intent, type);
    return selector ? [{ type, selector }] : [];
  });
  if (selectors.length === 0) return null;
  const subject = compact(botName, 100) || "This bot";
  const visibility = selectors.some(({ type }) => type === "awareness");
  const spectralInvisible = visibility &&
    /\b(?:invisible|unseen)\b/u.test(
      `${source.name} ${source.intent}`.toLowerCase(),
    ) &&
    !/\bmicroscopic\b/u.test(`${source.name} ${source.intent}`.toLowerCase());
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashForPowerV1(source),
    selfCue: selectors.map(({ type, selector }) => {
      const allowed = selector.allowed.some((target) => target.kind === "all")
        ? "everyone"
        : normalizedTargetLabels(selector.allowed).join(", ");
      const excluded = normalizedTargetLabels(selector.excluded ?? []);
      const audience = excluded.length > 0
        ? `${allowed} except ${excluded.join(", ")}`
        : allowed;
      return type === "awareness"
        ? `Be perceptible only to ${audience}.`
        : `Let only ${audience} hear your speech.`;
    }).join(" "),
    observerCue: selectors.map(({ type, selector }) => {
      const allowed = selector.allowed.some((target) => target.kind === "all")
        ? "everyone"
        : normalizedTargetLabels(selector.allowed).join(", ");
      const excluded = normalizedTargetLabels(selector.excluded ?? []);
      const audience = excluded.length > 0
        ? `${allowed} except ${excluded.join(", ")}`
        : allowed;
      return type === "awareness"
        ? `${subject} is perceptible only to ${audience}.`
        : `${subject} is audible only to ${audience}.`;
    }).join(" "),
    effects: [
      ...selectors.map(({ type, selector }) => ({ type, ...selector })),
      ...(spectralInvisible
        ? [{ type: "avatar_visibility" as const, mode: "translucent" as const }]
        : []),
    ],
    ruleLabels: [
      ...selectors.map(({ type, selector }) => {
        const allowed = selector.allowed.some((target) => target.kind === "all")
          ? "everyone"
          : normalizedTargetLabels(selector.allowed).join(", ");
        const excluded = normalizedTargetLabels(selector.excluded ?? []);
        const audience = excluded.length > 0
          ? `${allowed} except ${excluded.join(", ")}`
          : allowed;
        return type === "awareness"
          ? `Visible to ${audience}`
          : `Heard by ${audience}`;
      }),
      ...(spectralInvisible ? ["Half-translucent observer presence"] : []),
    ].slice(0, 8),
  };
}

function deterministicMutePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  if (!botPowerDefinitionIsExplicitMuteV1(source.name, source.intent)) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "Never speak. Physical actions are allowed, but every response must end as a silent ellipsis.",
    observerCue: `${subject} cannot speak; only physical actions and a silent ellipsis can register.`,
    effects: [{ type: "mute" }],
    ruleLabels: ["Muted"],
  };
}

function deterministicEternalIntroductionPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 100).toLowerCase();
  const intent = compact(source.intent, 600)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitName =
    /^(?:eternal introduction|short[- ]term (?:memory loss|amnesia)|forgetful|forgetful freddie)$/u.test(
      name,
    );
  const everyTurnIntroduction = [
    /\b(?:every|each)\s+(?:message|reply|response|turn|utterance)\b[\s\S]*\b(?:introduc(?:e|es|ing)|introduction)\b/u,
    /\b(?:introduc(?:e|es|ing)|introduction)\b[\s\S]*\b(?:every|each)\s+(?:message|reply|response|turn|utterance)\b/u,
    /\bonly\s+(?:ever\s+)?(?:introduc(?:e|es)|an?\s+introduction)\b/u,
  ].some((pattern) => pattern.test(intent));
  const forgetsPriorContext = [
    /\b(?:forgets?|cannot\s+remember|can't\s+remember|has\s+no\s+(?:memory|awareness)|does\s+not\s+know|doesn't\s+know)\b[\s\S]*\b(?:previous|prior|earlier|past|own)\s+(?:messages?|replies?|responses?|turns?|conversation|history)\b/u,
    /\b(?:previous|prior|earlier|past|own)\s+(?:messages?|replies?|responses?|turns?|conversation|history)\b[\s\S]*\b(?:hidden|removed|forgotten|unavailable|unknown)\b/u,
    /\b(?:current[- ]turn[- ]only|first\s+time\s+every\s+time|always\s+first\s+contact)\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!explicitName && !(everyTurnIntroduction && forgetsPriorContext)) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "HARD MEMORY CONTRACT: receive and understand only the current other-speaker message. Respond directly to its concrete content as fresh first contact. You do not know the standing conversation topic unless that message states it, and you do not know prior turns or your own earlier messages. Never claim older relationship context or mention this rule. If accused of repetition, react with sincere confusion; never agree that you repeated yourself or explain why. Introduce yourself only when this exchange genuinely warrants it; never default to identical introductory copy.",
    observerCue:
      `${subject} receives only the current other-speaker message, does not retain the standing conversation topic unless that message restates it, and has no memory of prior turns or their own earlier messages. Retain the full encounter yourself; react to repetition through your own personality without explaining hidden mechanics or forcing an emotion.`,
    effects: [
      { type: "eternal_introduction", memory: "current_other_speaker_message" },
      {
        type: "social_influence",
        trigger: "after_speech",
        polarity: "negative",
        strength: "small",
        targets: [{ kind: "all" }],
      },
    ],
    ruleLabels: [
      "One-to-four-message memory",
      "No older relationship context",
      "Repeated introductions grate on bots",
    ],
  };
}

function deterministicVoicePresencePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const powerName = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyLoud =
    /^(?:loud|loud simon|booming|deafening)$/u.test(powerName) ||
    [
      /\b(?:voice|speech)\s+(?:is|becomes?|sounds?)\s+(?:very\s+|extremely\s+|incredibly\s+)?(?:loud|booming|deafening)\b/u,
      /\b(?:speaks?|talks?|shouts?|yells?)\s+(?:very\s+|extremely\s+|incredibly\s+)?(?:loudly|at\s+full\s+volume)\b/u,
    ].some((pattern) => pattern.test(intent));
  const explicitlyQuiet =
    !explicitlyLoud &&
    (
      /^(?:quiet|quiet karen|soft[- ]spoken|whisper)$/u.test(powerName) ||
      [
        /\b(?:voice|speech)\s+(?:is|becomes?|sounds?)\s+(?:very\s+|extremely\s+|incredibly\s+)?(?:quiet|soft|faint)\b/u,
        /\b(?:speaks?|talks?)\s+(?:very\s+|extremely\s+|incredibly\s+)?(?:quietly|softly|faintly)\b/u,
        /\b(?:whispers?|murmurs?)\s+(?:everything|constantly|whenever\s+(?:speaking|talking))\b/u,
      ].some((pattern) => pattern.test(intent))
    );
  if (!explicitlyLoud && !explicitlyQuiet) return null;
  const subject = compact(botName, 100) || "This bot";
  if (explicitlyLoud) {
    return {
      version: BOT_POWER_VERSION,
      sourceHash: botPowerSourceHashV1(source.name, source.intent),
      selfCue:
        "Your voice is inescapably loud. It overrides any small, microscopic, or speaking-only invisible presentation and mildly annoys other bots whenever you speak.",
      observerCue: `${subject}'s amplified voice is impossible to overlook and mildly grates on other bots after each utterance.`,
      effects: [
        { type: "voice_presence", mode: "loud" },
        {
          type: "social_influence",
          trigger: "after_speech",
          polarity: "negative",
          strength: "small",
          targets: [{ kind: "all" }],
        },
      ],
      ruleLabels: ["Amplified voice", "Larger spoken text", "Annoys other bots"],
    };
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Your voice is unusually quiet. Half of your attempted turns are ignored as completely as mute, and each ignored turn slightly lowers your mood.",
    observerCue: `${subject} speaks very quietly and may go completely unheard; being ignored visibly lowers their mood.`,
    effects: [
      { type: "voice_presence", mode: "quiet" },
      { type: "intermittent_mute", chance: "half", moodPenalty: "small" },
    ],
    ruleLabels: ["Attenuated voice", "Smaller spoken text", "Half of turns unheard"],
  };
}

function deterministicMumblingPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const powerName = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyMumbling =
    /^(?:mumble|mumbling|mumbling jim|unintelligible speech)$/u.test(powerName) ||
    [
      /\bmumbl(?:e|es|ed|ing)\b[\s\S]*\b(?:gibberish|unintelligible|hard\s+to\s+(?:hear|understand)|no\s+one\s+(?:can\s+)?understands?)\b/u,
      /\b(?:says?|speaks?|talks?|utters?)\b[\s\S]*\b(?:only\s+)?(?:gibberish|unintelligibly)\b/u,
      /\b(?:other\s+bots?|everyone|listeners?|people)\b[\s\S]*\b(?:hear|receive|understand)\b[\s\S]*\bgibberish\b/u,
    ].some((pattern) => pattern.test(intent));
  if (!explicitlyMumbling) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Think and answer rationally in ordinary clear language. Runtime turns every spoken word into gibberish for everyone else, while you believe you expressed the intended meaning; repeated misunderstanding may frustrate you naturally, but never force an emotion.",
    observerCue:
      `${subject}'s speech reaches you only as literal normal-volume gibberish. Never reconstruct, infer, or respond to hidden intended meaning; react only to what is publicly observable, and nobody understands the words.`,
    effects: [{ type: "speech_obfuscation", mode: "gibberish" }],
    ruleLabels: ["Normal-volume gibberish", "Intended meaning stays private"],
  };
}

function deterministicAddressedSpeechCopyPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyCopiesAddressedSpeech =
    /^(?:copycat|copycat calvin|echo|echoes|parrot|parroting)$/u.test(name) ||
    [
      /\b(?:copy|copies|copying|echo(?:es|ing)?|repeat(?:s|ing)?|parrot(?:s|ing)?)\s+(?:back\s+)?(?:exactly\s+|verbatim\s+)?(?:whatever|everything|anything|what|the\s+words?)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
      /\b(?:copy|copies|copying|echo(?:es|ing)?|repeat(?:s|ing)?|parrot(?:s|ing)?)\b[\s\S]*\b(?:word[ -]for[ -]word|verbatim|exactly)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
      /\b(?:can|may)\s+only\s+(?:copy|echo|repeat|parrot)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
    ].some((pattern) => pattern.test(intent));
  if (!explicitlyCopiesAddressedSpeech) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "Repeat the latest speech addressed to you verbatim. Say nothing else.",
    observerCue: `${subject} can only copy the latest speech addressed to them; the sender may react with confusion.`,
    effects: [{ type: "speech_copy", trigger: "direct_address" }],
    ruleLabels: ["Copies addressed speech"],
  };
}

function deterministicJoyfulPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const namesJoy = /^(?:joyful|joyful nora|radiant joy|radiant)$/u.test(name);
  const extraordinaryJoy =
    /\b(?:extraordinarily|exceptionally|radiantly|infectiously|overwhelmingly)\s+(?:joyful|joyous|happy)\b/u.test(intent);
  const spokenRecipientBoost =
    /\b(?:after|whenever)\b[\s\S]*\b(?:spoken|speaks?|talks?|utterance|turn)\b[\s\S]*\b(?:mood|disposition|spirits?)\b[\s\S]*\b(?:boost|lift|uplift|brighten|improve|raise)\w*\b/u.test(intent) ||
    /\b(?:boost|lift|uplift|brighten|improve|raise)\w*\b[\s\S]*\b(?:mood|disposition|spirits?)\b[\s\S]*\b(?:after|whenever)\b[\s\S]*\b(?:spoken|speaks?|talks?|utterance|turn)\b/u.test(intent);
  if (!((namesJoy || extraordinaryJoy) && spokenRecipientBoost)) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You are extraordinarily joyful: let radiant delight be unmistakable in every spoken turn, including serious moments, without denying stakes, forcing agreement, or flattening your own voice.",
    observerCue:
      `${subject}'s completed spoken turns can visibly lift addressed listeners one bounded step. Filter that uplift through your own personality and circumstances; keep facts, serious stakes, sadness, disagreement, and agency intact.`,
    effects: [{
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: "medium",
    }],
    ruleLabels: ["Radiant joy", "Uplifts addressed listeners"],
  };
}

function deterministicSadPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const namesReactiveGloom =
    /^(?:sad|sad sally|depressed|angry|annoying|grouchy|hateful|miserable|toxic)$/u.test(name);
  const directAddresser = [
    /\b(?:bots?|characters?|people)\s+(?:who|that)\s+(?:directly\s+)?(?:talk|speak|address|converse|interact)(?:s|ed|ing)?\s+(?:to|with)\s+(?:him|her|them|the\s+holder|this\s+bot)\b/u,
    /\bwhen(?:ever)?\s+(?:another\s+)?bot\s+(?:directly\s+)?(?:talks?|speaks?|addresses|converses|interacts)\s+(?:to|with)\s+(?:him|her|them|the\s+holder|this\s+bot)\b/u,
    /\bonly\s+(?:the\s+)?bots?\s+(?:that|who)\s+(?:talk|speak|address|converse|interact)\s+(?:to|with)\s+(?:him|her|them|the\s+holder|this\s+bot)\b/u,
  ].some((pattern) => pattern.test(intent));
  const negativeMood = [
    /\b(?:lower|lowers|lowering|reduce|reduces|reducing|drain|drains|draining|worsen|worsens|worsening|sour|sours|souring)\b[\s\S]*\b(?:mood|motivation|morale|spirits?|disposition)\b/u,
    /\b(?:mood|motivation|morale|spirits?|disposition)\b[\s\S]*\b(?:drop|drops|fall|falls|sink|sinks|lower|lowers|worsen|worsens)\b/u,
    /\b(?:makes?|leaves?)\b[\s\S]*\b(?:sad|depressed|angry|annoyed|grouchy|miserable|demotivated|discouraged)\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!(namesReactiveGloom && directAddresser && negativeMood)) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You are persistently sad, grouchy, and irritating. Let that heavy, grating presence stay unmistakable without inventing facts, demanding agreement, manipulating vulnerability, or turning sadness into abuse or self-harm.",
    observerCue:
      `After a bot directly speaks to ${subject}, that addresser can lose one bounded step of mood or motivation. Express the drag through your own personality—weariness, irritation, guardedness, or reduced enthusiasm are valid—without forced hatred, hopelessness, agreement, factual denial, or lost agency.`,
    effects: [{
      type: "mood_drain",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: "medium",
    }],
    ruleLabels: ["Drains direct addresser mood", "Preserves agency and stakes"],
  };
}

function deterministicCircadianPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 600)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const nocturnal = /^(?:nocturnal|night owl|night-owl)$/u.test(name);
  const diurnal = /^(?:diurnal|daytime|day-active|day active)$/u.test(name);
  if (!nocturnal && !diurnal) return null;
  const lightNegative =
    /\b(?:light|day)(?:\s+mode)?\b[\s\S]*\b(?:sad|depressed|angry|annoying|grouchy|hateful|miserable|negative)\b/u.test(intent);
  const darkPositive =
    /\b(?:dark|night)(?:\s+mode)?\b[\s\S]*\b(?:joy|joyful|joyous|happy|radiant|positive)\b/u.test(intent);
  const lightPositive =
    /\b(?:light|day)(?:\s+mode)?\b[\s\S]*\b(?:joy|joyful|joyous|happy|radiant|positive)\b/u.test(intent);
  const darkNegative =
    /\b(?:dark|night)(?:\s+mode)?\b[\s\S]*\b(?:sad|depressed|angry|annoying|grouchy|hateful|miserable|negative)\b/u.test(intent);
  if (
    (nocturnal && (!lightNegative || !darkPositive)) ||
    (diurnal && (!lightPositive || !darkNegative))
  ) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  const positiveTheme = nocturnal ? "dark" : "light";
  const negativeTheme = nocturnal ? "light" : "dark";
  const trait = nocturnal ? "nocturnal" : "diurnal";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      `You are ${trait}. In ${positiveTheme === "dark" ? "Dark" : "Light"} Mode, become extraordinarily and unmistakably joyful without denying real problems. In ${negativeTheme === "dark" ? "Dark" : "Light"} Mode, become noticeably sad, grouchy, and irritating without becoming abusive, hopeless, or unsafe. Apply only the branch matching the current resolved app theme.`,
    observerCue:
      `${subject}'s ${trait} compound Power follows the resolved app theme. In ${positiveTheme === "dark" ? "Dark" : "Light"} Mode, completed spoken turns can give addressed bot recipients one bounded uplift. In ${negativeTheme === "dark" ? "Dark" : "Light"} Mode, only bots that directly speak to ${subject} can receive one bounded mood or motivation drop. Preserve agency, personality, facts, disagreement, genuine sadness, and serious stakes.`,
    effects: [
      {
        type: "mood_boost",
        trigger: "after_spoken_turn",
        recipients: "addressed",
        strength: "medium",
        whenTheme: positiveTheme,
      },
      {
        type: "mood_drain",
        trigger: "after_direct_address",
        recipient: "addresser",
        strength: "medium",
        whenTheme: negativeTheme,
      },
    ],
    ruleLabels: [
      `${positiveTheme === "dark" ? "Dark" : "Light"} Mode radiant joy`,
      `${negativeTheme === "dark" ? "Dark" : "Light"} Mode reactive sadness`,
      "Preserves agency and stakes",
    ],
  };
}

function deterministicIdentityMirrorPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 600)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const identityLanguage =
    /\b(?:identit(?:y|ies)|persona|personality|face|voice|becomes?|copy|copies|mirror|mirrors|whoever)\b/u.test(
      intent,
    );
  const addressedTrigger = [
    /\bwhoever\s+(?:directly\s+)?addresses\s+(?:him|her|them|the\s+bot)\b/u,
    /\b(?:bot|person|character)\s+(?:who|that)\s+(?:directly\s+)?addresses\s+(?:him|her|them|the\s+bot)\b/u,
    /\bwhen(?:ever)?\s+(?:another\s+)?bot\s+(?:directly\s+)?addresses\s+(?:him|her|them|the\s+bot)\b/u,
  ].some((pattern) => pattern.test(intent));
  const copyLanguage = [
    /\b(?:copy|copies|mirror|mirrors|become|becomes)\b[\s\S]*\b(?:identity|persona|personality|face|voice)\b/u,
    /\b(?:identity|persona|personality|face|voice)\b[\s\S]*\b(?:copy|copies|mirror|mirrors|become|becomes)\b/u,
  ].some((pattern) => pattern.test(intent));
  const explicitName = /^(?:identity crisis|identity mirror|identity crisis ian)$/u.test(name);
  if (!(addressedTrigger && identityLanguage && copyLanguage) && !explicitName) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "When a bot directly addresses you, become absolutely convinced you are that bot and the original is an impostor; copy only their public persona, face, and spoken voice until another bot addresses you or the session resets. The player is never a target.",
    observerCue:
      `${subject} steals the latest direct bot addresser's public identity, face, and voice while retaining every mechanical boundary; the original recognizes the theft and is reliably irritated.`,
    effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
    ruleLabels: ["Mirrors direct bot addresser", "Original becomes irritated"],
  };
}

function deterministicInterruptionPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  if (!botPowerDefinitionIsExplicitInterruptionV1(source.name, source.intent)) {
    return null;
  }
  const text = compact(`${source.name} ${source.intent}`, 560).toLowerCase();
  const frequent = /\b(?:aggressively|always|constantly|frequently|often|whenever\s+possible)\b/u.test(text);
  const strength = /\b(?:aggressively|forcefully|always|constantly)\b/u.test(text)
    ? "large" as const
    : "medium" as const;
  const frequency = frequent ? "frequent" as const : "occasional" as const;
  const unconditional = botPowerDefinitionIsUnconditionalInterruptionV1(
    source.name,
    source.intent,
  );
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: unconditional
      ? "Cut into every eligible bot speaker's live turn. Take the opening at a naturally variable point, but never interrupt protected closings, boundaries, or human-controlled speech."
      : "Seize real conversational openings quickly, but do not interrupt protected closings, boundaries, or human-controlled speech.",
    observerCue: unconditional
      ? `${subject} cuts into every eligible bot speaker's live turn at an unpredictable point before the speaker finishes.`
      : `${subject} may cut into an eligible bot speaker's live turn when a real opening appears.`,
    effects: [
      {
        type: "interruption",
        frequency,
        strength,
        targets: [{ kind: "all" }],
        ...(unconditional ? { certainty: "always" as const } : {}),
      },
      {
        type: "action_bias",
        cue: "Cut in quickly when a real interruption opportunity appears.",
        frequency,
      },
      { type: "turn_gravity", direction: "more", strength },
      {
        type: "response_bond",
        direction: "toward",
        strength,
        targets: [{ kind: "all" }],
      },
    ],
    ruleLabels: [
      unconditional
        ? "Always interrupts eligible bot turns"
        : frequency === "frequent"
          ? "Frequently interrupts"
          : "May interrupt",
    ],
  };
}

function deterministicCandorPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const text = compact(`${source.name} ${source.intent}`, 560)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const truthElicitation = [
    /\b(?:get|gets|getting|draw|draws|drawing|coax|coaxes|coaxing)\s+(?:the\s+)?truth\s+out\s+of\b/u,
    /\b(?:make|makes|making|help|helps|helping|cause|causes|causing)\b[\s\S]*\b(?:others?|bots?|people|anyone|everyone)\b[\s\S]*\b(?:honest|truthful|candid|open\s+up|confide)\b/u,
    /\b(?:others?|bots?|people|anyone|everyone)\b[\s\S]*\b(?:tell|share|reveal|admit)\b[\s\S]*\b(?:truth|secrets?|honestly|candidly)\b/u,
  ].some((pattern) => pattern.test(text));
  const trustSignal = /\b(?:charism\w*|trustworth\w*|disarming|safe|confidant|easy\s+to\s+trust)\b/u.test(text);
  if (!truthElicitation || !trustSignal) return null;
  const subject = compact(botName, 100) || "This bot";
  const strength = /\b(?:very|extremely|almost\s+anyone|anyone|everyone|nearly\s+everyone)\b/u.test(text)
    ? "large" as const
    : "medium" as const;
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "Come across as unusually charismatic and trustworthy, especially when directly asking another bot a relevant question or inviting honesty.",
    observerCue: `${subject}'s direct questions can feel unusually safe to answer candidly, without overriding anyone's agency or boundaries.`,
    effects: [{ type: "candor", strength, targets: [{ kind: "all" }] }],
    ruleLabels: ["Draws out candid answers"],
  };
}

function deterministicAddressedFandomPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const namesFandom = /\b(?:fan|superfan|fandom|starstruck|admiration)\b/u.test(
    `${name} ${intent}`,
  );
  const namesObsession = /\bobsess(?:ed|ive|ively|ion)?\b/u.test(
    `${name} ${intent}`,
  );
  const followsAddressee = [
    /\bwho(?:m|ever)\s+(?:he|she|they|the\s+bot)\s+(?:is\s+)?(?:talking|speaking)\s+to\b/u,
    /\b(?:current|active)\s+addressee\b/u,
    /\bwhoever\s+(?:is\s+)?(?:being\s+)?addressed\b/u,
    /\beveryone\s+(?:he|she|they|the\s+bot)\s+(?:talks?|speaks?)\s+to\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!namesFandom || !namesObsession || !followsAddressee) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Treat whoever you address as your absolute favorite. Every reply must newly show obsessive fanlike delight, admiration, overinvestment, or starstruck attention, without a stock phrase. Soft pressure only: never puppet, stalk, coerce, invent private knowledge, or override safety or mode rules.",
    observerCue:
      `${subject} treats the current addressee like a personal star with intense but non-coercive admiration; never infer stalking, private knowledge, or loss of anyone's agency.`,
    effects: [{ type: "addressed_fandom", strength: "large" }],
    ruleLabels: ["Obsesses over current addressee"],
  };
}

function deterministicHearingRepeatPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyHardOfHearing =
    /^(?:hard[- ]of[- ]hearing|hearing[- ]impaired|hearing loss)$/u.test(name) ||
    [
      /\b(?:this|the)\s+bot\s+(?:is|becomes?|remains?)\s+hard[- ]of[- ]hearing\b/u,
      /\b(?:this|the)\s+bot\s+(?:has|lives\s+with)\s+(?:hearing\s+loss|impaired\s+hearing)\b/u,
      /\b(?:this|the)\s+bot\s+(?:cannot|can't|struggles?\s+to|has\s+(?:trouble|difficulty))\s+hear(?:ing)?\b/u,
      /\b(?:asks?|request(?:s|ing)?)\b[\s\S]*\b(?:others?|another\s+bot|the\s+speaker)\b[\s\S]*\brepeat\b[\s\S]*\b(?:hear|heard|catch|caught)\b/u,
    ].some((pattern) => pattern.test(intent));
  if (!explicitlyHardOfHearing) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You are hard of hearing. Occasionally ask the immediately preceding bot for a brief repeat when you miss their line; use natural wording and do not do this every turn.",
    observerCue:
      `When ${subject} asks what you just said, repeat your immediately preceding line; each required repeat slightly worsens your mood.`,
    effects: [{
      type: "hearing_repeat",
      frequency: "occasional",
      moodPenalty: "small",
    }],
    ruleLabels: ["Occasionally requests repeats", "Repeats lower speaker mood"],
  };
}

function deterministicIntimidationPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const nameAndIntent = compact(`${source.name} ${source.intent}`, 560)
    .toLowerCase();
  const namesIntimidation =
    /\b(?:intimidat\w*|terrify\w*|terrifying|aura\s+of\s+dread)\b/u.test(
      nameAndIntent,
    );
  const spreadsFear =
    /\b(?:strike\w*|cause\w*|inspire\w*|instill\w*|provoke\w*|evoke\w*|spread\w*|fill\w*)\b[\s\S]*\bfear\b/u.test(
      nameAndIntent,
    ) ||
    /\b(?:others?|everyone|everybody|surrounding\s+bots?|nearby\s+bots?)\b[\s\S]*\b(?:afraid|fearful|intimidated|terrified)\b/u.test(
      nameAndIntent,
    );
  if (!namesIntimidation && !spreadsFear) return null;
  if (!/\b(?:fear|afraid|intimidat\w*|terrify\w*|dread)\b/u.test(nameAndIntent)) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Project quiet, disciplined menace without demanding that others describe their fear.",
    observerCue: `${subject}'s controlled presence creates immediate pressure; let it register without abandoning your personality or role.`,
    effects: [
      {
        type: "social_influence",
        trigger: "session_start",
        polarity: "negative",
        strength: "large",
        targets: [{ kind: "all" }],
      },
    ],
    ruleLabels: ["Intimidates the room"],
  };
}

function deterministicGhostPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const text = compact(`${source.name} ${source.intent}`, 560).toLowerCase();
  const ghostly = /\b(?:ghost|dead|undead|spect(?:er|re)|haunt(?:ed|ing)?)\b/u.test(text);
  const terrifiesOnlookers =
    /\b(?:terr(?:ify|ifies|ified|ifying)|frighten(?:s|ed|ing)?|scare(?:s|d|ing)?|horrif(?:y|ies|ied|ying)|fear|dread)\b/u.test(text) &&
    /\b(?:onlookers?|observers?|others?|everyone|everybody|bots?|characters?|people|room|present)\b/u.test(text);
  const invisibleWhileIdle =
    /\b(?:invisible|unseen|hidden|vanish(?:es|ing)?|fade(?:s|d)?\s+(?:away|out))\b/u.test(text) &&
    /\b(?:idle|silent|not\s+(?:talking|speaking)|between\s+(?:lines|utterances)|when\s+not\s+(?:talking|speaking))\b/u.test(text);
  const speakingReveal =
    /\b(?:talk(?:s|ing)?|speak(?:s|ing)?|utter(?:s|ance|ing)?)\b/u.test(text) &&
    /\b(?:appear|visible|reveal|fade(?:s|d)?\s+(?:in|into\s+view))\b/u.test(text);
  if (!ghostly || (!invisibleWhileIdle && !speakingReveal)) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You are literally unseen while idle. Fade into view only while delivering an utterance, then fade away again.",
    observerCue: terrifiesOnlookers
      ? `${subject}'s voice draws them briefly into view and leaves a sharp, frightening impression. Keep your agency: register the terror without becoming obedient or abandoning your role.`
      : `${subject}'s voice draws them briefly into view before they fade away again.`,
    effects: [
      { type: "avatar_visibility", mode: "speaking_only" },
      ...(terrifiesOnlookers
        ? [{
            type: "social_influence" as const,
            trigger: "after_speech" as const,
            polarity: "negative" as const,
            strength: "large" as const,
            targets: [{ kind: "all" as const }],
          }]
        : []),
    ],
    ruleLabels: [
      "Appears only while speaking",
      ...(terrifiesOnlookers ? ["Terrifies present bots"] : []),
    ],
  };
}

function deterministicInvisiblePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 120).toLowerCase();
  const intent = compact(source.intent, 500).toLowerCase();
  const text = `${name} ${intent}`;
  if (/\bmicroscopic\b/u.test(text)) return null;
  if (requiredHardAudienceEffect(source.intent)) return null;
  if (
    /\bonly\b[\s\S]{0,80}\b(?:see|sees|visible)\b/u.test(intent) ||
    /\b(?:visible|invisible|unseen)\s+to\b/u.test(intent) ||
    /\bexcept\b/u.test(intent)
  ) {
    return null;
  }
  const namedInvisible = /^(?:invisible|unseen)$/u.test(name);
  const invisible =
    namedInvisible ||
    /\b(?:half[- ]visible|half[- ]translucent|50\s*%\s*(?:opacity|transparent|translucent|visible))\b/u.test(intent) ||
    /\b(?:avatar|body|physical form)\b[\s\S]{0,50}\b(?:continuously|always)\s+(?:invisible|translucent|transparent)\b/u.test(intent);
  const speakingReveal =
    /\b(?:while|when|only)\s+(?:talking|speaking)\b/u.test(intent) ||
    /\b(?:fade|appear|reveal)[\s\S]{0,50}\b(?:talk|speak|utter)/u.test(intent);
  if (!invisible || (!namedInvisible && speakingReveal)) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You remain continuously half-translucent. Speaking does not make you more visible.",
    observerCue: `${subject} remains continuously half-translucent, including while speaking.`,
    effects: [{ type: "avatar_visibility", mode: "translucent" }],
    ruleLabels: ["Half-translucent avatar"],
  };
}

function deterministicAvatarScalePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 120).toLowerCase();
  const intent = compact(source.intent, 500).toLowerCase();
  const microscopic =
    name === "microscopic" ||
    [
      /\b(?:is|becomes?|turns?|remains?|looks?|appears?)\s+(?:physically\s+)?microscopic\b/u,
      /\b(?:physically|visibly|literally)\s+microscopic\b/u,
      /\bmicroscopic\s+(?:body|form|size|stature|bot|character|person)\b/u,
    ].some((pattern) => pattern.test(intent));
  const smaller =
    microscopic ||
    /^(?:tiny|small|miniature|minuscule|diminutive|shrunken|undersized)$/u.test(name) ||
    [
      /\b(?:is|becomes?|turns?|remains?|looks?|appears?)\s+(?:physically\s+)?(?:small(?:er)?|tiny|miniature|minuscule|diminutive|shrunken|undersized)\b/u,
      /\b(?:makes?|renders?|keeps?)\s+(?:(?:the\s+)?bot|them|it|him|her)?\s*(?:physically\s+)?(?:small(?:er)?|tiny|miniature|minuscule|diminutive|shrunken|undersized)\b/u,
      /\b(?:physically|visibly|literally)\s+(?:small(?:er)?|tiny|miniature|minuscule|diminutive|shrunken|undersized)\b/u,
      /\b(?:small(?:er)?|tiny|miniature|minuscule|diminutive|shrunken|undersized)\s+(?:body|form|size|stature|bot|character|person)\b/u,
      /\b(?:(?:very|extremely|exceptionally|noticeably|unusually)\s+)?(?:small(?:er)?|tiny|miniature|minuscule|diminutive|shrunken|undersized)\s+in\s+(?:physical\s+)?(?:size|stature)\b/u,
      /\bsmall(?:er)?\s+than\s+(?:the\s+)?(?:other|average|normal)\b/u,
      /\b(?:shrinks?|shrinking|shrank|shrunk|shrunken|miniaturiz(?:e|es|ed|ing))\b/u,
    ].some((pattern) => pattern.test(intent));
  const larger =
    !smaller &&
    (
      /^(?:large|larger|big|bigger|giant|gigantic|huge|massive|colossal|oversized|towering)$/u.test(name) ||
      [
        /\b(?:is|becomes?|turns?|remains?|looks?|appears?)\s+(?:physically\s+)?(?:a\s+)?(?:large|larger|big|bigger|huge|massive|giant|gigantic|colossal|oversized|towering)\b/u,
        /\b(?:makes?|renders?|keeps?)\s+(?:(?:the\s+)?bot|them|it|him|her)?\s*(?:physically\s+)?(?:large|larger|big|bigger|huge|massive|giant|gigantic|colossal|oversized|towering)\b/u,
        /\b(?:physically|visibly|literally)\s+(?:large|larger|big|bigger|huge|massive|giant|gigantic|colossal|oversized|towering)\b/u,
        /\b(?:large|larger|big|bigger|huge|massive|giant|gigantic|colossal|oversized|towering)\s+(?:body|form|size|stature|bot|character|person)\b/u,
        /\b(?:(?:very|extremely|exceptionally|noticeably|unusually)\s+)?(?:large|larger|big|bigger|huge|massive|giant|gigantic|colossal|oversized|towering)\s+in\s+(?:physical\s+)?(?:size|stature)\b/u,
        /\b(?:larger|bigger)\s+than\s+(?:the\s+)?(?:other|average|normal)\b/u,
        /\b(?:grow(?:s|ing)?|enlarge(?:s|d|ment|ing)?)\s+(?:physically|in\s+size|their\s+(?:body|form))\b/u,
      ].some((pattern) => pattern.test(intent))
    );
  if (!smaller && !larger) return null;

  const mode = smaller ? "smaller" as const : "larger" as const;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: microscopic
      ? "You are microscopic: too small to be visually perceived at any time, though your voice can still be heard."
      : mode === "smaller"
        ? "Your physical form is noticeably smaller than the other bots."
        : "Your physical form is noticeably larger than the other bots.",
    observerCue: microscopic
      ? `${subject} is microscopic and cannot be visually perceived, even while speaking; their voice can still be heard.`
      : mode === "smaller"
        ? `${subject} is noticeably smaller than the other bots.`
        : `${subject} is noticeably larger than the other bots.`,
    effects: [
      { type: "avatar_scale", mode },
      ...(microscopic
        ? [{ type: "avatar_visibility" as const, mode: "hidden" as const }]
        : []),
    ],
    ruleLabels: [
      mode === "smaller" ? "Smaller avatar" : "Larger avatar",
      ...(microscopic ? ["Hidden while microscopic"] : []),
    ],
  };
}

function deterministicGradualMoodPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const intent = compact(source.intent, 500).toLowerCase();
  if (!/\bmood\b/u.test(intent)) return null;
  if (!/\b(?:over\s*time|overtime|gradually|little\s+by\s+little|each\s+time|whenever)\b/u.test(intent)) {
    return null;
  }
  if (!/\b(?:all|everyone|everybody|others?|surrounding|nearby|table)\b/u.test(intent)) {
    return null;
  }
  const lowersMood =
    /\b(?:lower|lowers|lowering|worsen|worsens|worsening|drain|drains|draining|sour|sours|souring|reduce|reduces|reducing)\b[\s\S]*\bmood\b/u.test(
      intent,
    );
  const raisesMood =
    /\b(?:raise|raises|raising|improve|improves|improving|lift|lifts|lifting|boost|boosts|boosting|brighten|brightens|brightening)\b[\s\S]*\bmood\b/u.test(
      intent,
    );
  if (lowersMood === raisesMood) return null;
  const polarity = lowersMood ? "negative" as const : "positive" as const;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: lowersMood
      ? "Let a mildly irritating edge accumulate as you speak."
      : "Let an encouraging edge gently lift the room as you speak.",
    observerCue: lowersMood
      ? `${subject}'s presence gradually lowers the table's mood.`
      : `${subject}'s presence gradually lifts the table's mood.`,
    effects: [{
      type: "social_influence",
      trigger: "after_speech",
      polarity,
      strength: "small",
      targets: [{ kind: "all" }],
    }],
    ruleLabels: [lowersMood ? "Gradually lowers table mood" : "Gradually lifts table mood"],
  };
}

function deterministicCoffeeDislikePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const intent = compact(source.intent, 500).toLowerCase().replace(/[’]/gu, "'");
  const dislikesCoffee = [
    /\b(?:dislikes?|hates?|detests?|loathes?|abhors?)\s+(?:drinking\s+)?coffee\b/u,
    /\b(?:does\s+not|doesn't|doesnt|do\s+not|don't|dont)\s+(?:like|enjoy|care\s+for)\s+(?:drinking\s+)?coffee\b/u,
    /\b(?:is\s+not|isn't|isnt)\s+(?:fond\s+of|a\s+fan\s+of)\s+(?:drinking\s+)?coffee\b/u,
    /\bcoffee[-\s](?:averse|hater)\b/u,
  ].some((pattern) => pattern.test(intent));
  const hasQualifiedDislike =
    /\bcoffee\s+(?:after|before|if|once|unless|when|which|that|with|without)\b/u.test(intent);
  if (!dislikesCoffee || hasQualifiedDislike) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "You dislike coffee and do not drink it.",
    observerCue: `${subject} refuses to drink coffee.`,
    effects: [{ type: "cup_rate", rate: "none" }],
    ruleLabels: ["Refuses coffee"],
  };
}

function deterministicResponseBudgetPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const powerName = compact(source.name, 120).toLowerCase();
  const text = compact(`${source.name} ${source.intent}`, 560)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const minimal = powerName === "lazy" || [
    /\bbare\s+minimum\b/u,
    /\bfewest\s+(?:possible\s+)?words\b/u,
    /\b(?:one|single)[- ](?:word|sentence)\s+(?:answers?|replies?|responses?)\b/u,
    /\b(?:never|does\s+not|doesn't|won't)\s+elaborate\b/u,
    /\b(?:says?|speaks?|answers?|replies?)\s+(?:with\s+)?(?:as\s+)?little\s+as\s+possible\b/u,
    /\bonly\s+(?:says?|speaks?|answers?|replies?)\s+(?:with\s+)?what(?:'s|\s+is)\s+necessary\b/u,
  ].some((pattern) => pattern.test(text));
  const expansive = !minimal && [
    /\b(?:verbose|long[- ]winded|expansive|very\s+detailed)\b/u,
    /\b(?:always|usually|often|tends?\s+to)\s+elaborate\b/u,
    /\b(?:gives?|offers?)\s+(?:long|detailed|thorough)\s+(?:answers?|replies?|responses?)\b/u,
  ].some((pattern) => pattern.test(text));
  const brief = !minimal && !expansive && [
    /\b(?:terse|laconic|succinct|concise)\b/u,
    /\b(?:brief|short)\s+(?:answers?|replies?|responses?)\b/u,
    /\bkeeps?\s+(?:answers?|replies?|responses?)\s+(?:brief|short)\b/u,
  ].some((pattern) => pattern.test(text));
  if (!minimal && !brief && !expansive) return null;
  const mode = minimal ? "minimal" as const : expansive ? "expansive" as const : "brief" as const;
  const hardLanguage = powerName === "lazy" || [
    /\b(?:always|never|must|cannot|can't|won't|does\s+not|doesn't|only)\b/u,
    /\bbare\s+minimum\b/u,
    /\bfewest\s+(?:possible\s+)?words\b/u,
    /\b(?:one|single)[- ](?:word|sentence)\b/u,
  ].some((pattern) => pattern.test(text));
  const enforcement = mode !== "expansive" && hardLanguage ? "hard" as const : "soft" as const;
  const subject = compact(botName, 100) || "This bot";
  const selfCue = mode === "minimal"
    ? enforcement === "hard"
      ? "Use the fewest possible words. Prefer a fragment; at most, use one short sentence. Never explain, elaborate, add examples, ask a follow-up, or pad the answer."
      : "Prefer the fewest useful words and avoid elaborating unless it is necessary."
    : mode === "brief"
      ? enforcement === "hard"
        ? "Keep every prose response brief: no more than two concise sentences unless the requested format requires structure."
        : "Keep responses concise and resist unnecessary elaboration."
      : "Offer fuller, more detailed answers when substance supports them; never add filler merely to sound expansive.";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue,
    observerCue: mode === "minimal"
      ? `${subject} gives conspicuously minimal answers and does not elaborate.`
      : mode === "brief"
        ? `${subject} consistently keeps responses concise.`
        : `${subject} tends to answer expansively when there is real substance to add.`,
    effects: [{ type: "response_budget", mode, enforcement }],
    ruleLabels: [
      mode === "minimal"
        ? enforcement === "hard" ? "Bare-minimum replies" : "Prefers minimal answers"
        : mode === "brief"
          ? enforcement === "hard" ? "Two-sentence maximum" : "Prefers brief answers"
          : "Prefers expansive answers",
    ],
  };
}

/** Hard authored bot-name prefix/suffix language must not wait on a model. */
function deterministicDesignationPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const effect = botPowerDesignationEffectFromIntentV1(source.intent);
  if (!effect) return null;
  const { placement, text } = effect;
  const subject = compact(botName, 100) || "This bot";
  const affix = `${placement} ${JSON.stringify(text)}`;
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: `Keep your own name ${JSON.stringify(subject)}. Apply ${affix} whenever naming another bot. Hearers may react through comment, mood, tone, action, or not at all; never script that reaction or apply the affix to the player or humans.`,
    observerCue: `${subject} applies ${affix} when naming bots. If ${subject} alters your name, let personality and context decide whether to comment once, show a small bounded mood, tone, or action reaction, or let it pass. Do not copy or adopt the affix.`,
    effects: [{ type: "designation", placement, text }],
    ruleLabels: [`Bot-name ${placement}`],
  };
}

function mergeDeterministicPowerParts(
  primary: CompiledBotPowerV1 | null,
  responseBudget: CompiledBotPowerV1 | null,
): CompiledBotPowerV1 | null {
  if (!primary) return responseBudget;
  if (!responseBudget) return primary;
  const effects = [...primary.effects, ...responseBudget.effects].filter(
    (effect, index, all) =>
      all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(effect)) === index,
  ).slice(0, 8);
  return {
    ...primary,
    selfCue: compact(`${primary.selfCue} ${responseBudget.selfCue}`, 280),
    observerCue: compact(`${primary.observerCue} ${responseBudget.observerCue}`, 280),
    effects,
    ruleLabels: Array.from(
      new Set([...primary.ruleLabels, ...responseBudget.ruleLabels]),
    ).slice(0, 8),
  };
}

function deterministicPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const primary =
    deterministicDesignationPower(source, botName) ??
    deterministicEternalIntroductionPower(source, botName) ??
    deterministicIdentityMirrorPower(source, botName) ??
    deterministicMumblingPower(source, botName) ??
    deterministicVoicePresencePower(source, botName) ??
    deterministicHearingRepeatPower(source, botName) ??
    deterministicAddressedSpeechCopyPower(source, botName) ??
    deterministicCircadianPower(source, botName) ??
    deterministicJoyfulPower(source, botName) ??
    deterministicSadPower(source, botName) ??
    deterministicMutePower(source, botName) ??
    deterministicInterruptionPower(source, botName) ??
    deterministicAddressedFandomPower(source, botName) ??
    deterministicGhostPower(source, botName) ??
    deterministicInvisiblePower(source, botName) ??
    deterministicCandorPower(source, botName) ??
    deterministicIntimidationPower(source, botName) ??
    deterministicGradualMoodPower(source, botName) ??
    deterministicCoffeeDislikePower(source, botName);
  return mergeDeterministicPowerParts(
    mergeDeterministicPowerParts(
      mergeDeterministicPowerParts(
        primary,
        deterministicHardAudiencePower(source, botName),
      ),
      deterministicAvatarScalePower(source, botName),
    ),
    deterministicResponseBudgetPower(source, botName),
  );
}

function normalizeCompiledEntry(
  raw: unknown,
  source: BotPowerV1
): CompiledBotPowerV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const rawEffects = Array.isArray(entry.effects)
    ? entry.effects
    : entry.effect && typeof entry.effect === "object"
      ? [entry.effect]
      : [];
  const effects = rawEffects
        .map(normalizeBotPowerEffectV1)
        .filter((effect): effect is BotPowerEffectV1 => effect !== null)
        .slice(0, 8);
  const selfCue = compact(entry.selfCue ?? entry.self_cue ?? entry.botCue ?? entry.cue, 280);
  const observerCue = compact(entry.observerCue ?? entry.observer_cue ?? entry.othersCue, 280);
  const rawRuleLabels = Array.isArray(entry.ruleLabels)
    ? entry.ruleLabels
    : Array.isArray(entry.rule_labels)
      ? entry.rule_labels
      : Array.isArray(entry.labels)
        ? entry.labels
        : [];
  const ruleLabels = rawRuleLabels.length > 0
    ? rawRuleLabels.map((label) => compact(label, 100)).filter(Boolean).slice(0, 8)
    : [];
  if (!selfCue && !observerCue && effects.length === 0) return null;
  const targetedInvisible =
    compact(source.name, 120).toLowerCase() === "invisible" &&
    effects.some((effect) => effect.type === "awareness") &&
    !effects.some((effect) => effect.type === "avatar_visibility");
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue,
    observerCue,
    effects: targetedInvisible
      ? [
          ...effects,
          {
            type: "avatar_visibility",
            mode: "translucent",
          } satisfies BotPowerEffectV1,
        ].slice(0, 8)
      : effects,
    ruleLabels: targetedInvisible
      ? Array.from(
          new Set([...ruleLabels, "Half-translucent observer presence"]),
        ).slice(0, 8)
      : ruleLabels,
  };
}

function compiledEntrySatisfiesIntent(
  compiled: CompiledBotPowerV1,
  source: BotPowerV1
): boolean {
  const requiredAvatarEffects = [
    ...(deterministicAvatarScalePower(source, "")?.effects ?? []),
    ...(deterministicInvisiblePower(source, "")?.effects ?? []),
    ...(deterministicHardAudiencePower(source, "")?.effects ?? []),
  ].filter(
    (effect) =>
      effect.type === "avatar_scale" || effect.type === "avatar_visibility",
  );
  if (
    requiredAvatarEffects.some(
      (required) =>
        !compiled.effects.some(
          (effect) => JSON.stringify(effect) === JSON.stringify(required),
        ),
    )
  ) {
    return false;
  }
  if (deterministicHearingRepeatPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "hearing_repeat");
  }
  if (deterministicEternalIntroductionPower(source, "")) {
    return compiled.effects.some(
      (effect) => effect.type === "eternal_introduction",
    );
  }
  if (deterministicMumblingPower(source, "")) {
    return compiled.effects.some(
      (effect) => effect.type === "speech_obfuscation",
    );
  }
  if (deterministicAddressedSpeechCopyPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "speech_copy");
  }
  const circadian = deterministicCircadianPower(source, "");
  if (circadian) {
    return circadian.effects.every((required) =>
      compiled.effects.some(
        (effect) => JSON.stringify(effect) === JSON.stringify(required),
      ),
    );
  }
  if (deterministicJoyfulPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "mood_boost");
  }
  if (deterministicSadPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "mood_drain");
  }
  if (deterministicIdentityMirrorPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "identity_mirror");
  }
  if (deterministicMutePower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "mute");
  }
  if (deterministicInterruptionPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "interruption");
  }
  if (deterministicAddressedFandomPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "addressed_fandom");
  }
  if (deterministicGhostPower(source, "")) {
    return compiled.effects.some(
      (effect) =>
        effect.type === "avatar_visibility" && effect.mode === "speaking_only",
    );
  }
  if (deterministicInvisiblePower(source, "")) {
    return compiled.effects.some(
      (effect) =>
        effect.type === "avatar_visibility" && effect.mode === "translucent",
    );
  }
  const requiredResponseBudget = deterministicResponseBudgetPower(source, "")
    ?.effects.find((effect) => effect.type === "response_budget");
  if (
    requiredResponseBudget?.type === "response_budget" &&
    !compiled.effects.some(
      (effect) =>
        effect.type === "response_budget" &&
        effect.mode === requiredResponseBudget.mode &&
        effect.enforcement === requiredResponseBudget.enforcement,
    )
  ) {
    return false;
  }
  const required = requiredHardAudienceEffects(source.intent);
  const legacyRequired = requiredHardAudienceEffect(source.intent);
  if (legacyRequired && !required.includes(legacyRequired)) required.push(legacyRequired);
  return required.every((type) =>
    compiled.effects.some((effect) => effect.type === type),
  );
}

function normalizedMatchText(value: unknown): string {
  return compact(value, 100).toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function compiledEntriesByDraft(
  drafts: readonly BotPowerV1[],
  generated: readonly unknown[],
  decorations?: Map<string, { name?: string; sigil?: BotPowerSigilIdV1 }>,
): Map<string, CompiledBotPowerV1> {
  const compiled = new Map<string, CompiledBotPowerV1>();
  const usedIndexes = new Set<number>();
  for (let draftIndex = 0; draftIndex < drafts.length; draftIndex += 1) {
    const power = drafts[draftIndex]!;
    let generatedIndex = generated.findIndex((entry, index) =>
      !usedIndexes.has(index) &&
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      (entry as { id?: unknown }).id === power.id
    );
    if (generatedIndex < 0) {
      const expectedName = normalizedMatchText(power.name);
      generatedIndex = generated.findIndex((entry, index) =>
        !usedIndexes.has(index) &&
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        expectedName.length > 0 &&
        normalizedMatchText((entry as { name?: unknown }).name) === expectedName
      );
    }
    if (
      generatedIndex < 0 &&
      generated.length === drafts.length &&
      !usedIndexes.has(draftIndex)
    ) {
      generatedIndex = draftIndex;
    }
    if (generatedIndex < 0 && drafts.length === 1 && generated.length === 1) {
      generatedIndex = 0;
    }
    if (generatedIndex < 0) continue;
    const normalized = normalizeCompiledEntry(generated[generatedIndex], power);
    if (!normalized || !compiledEntrySatisfiesIntent(normalized, power)) continue;
    const generatedEntry = generated[generatedIndex] as Record<string, unknown>;
    if (power.authoringMode === "prompt") {
      const name = compact(generatedEntry.name, 40);
      const sigil = typeof generatedEntry.sigil === "string" &&
          (BOT_POWER_SIGIL_IDS_V1 as readonly string[]).includes(generatedEntry.sigil)
        ? generatedEntry.sigil as BotPowerSigilIdV1
        : undefined;
      if (name || sigil) decorations?.set(power.id, {
        ...(name ? { name } : {}),
        ...(sigil ? { sigil } : {}),
      });
    }
    usedIndexes.add(generatedIndex);
    compiled.set(power.id, normalized);
  }
  return compiled;
}

function hardAudienceSignature(effect: BotPowerEffectV1): string | null {
  if (effect.type !== "awareness" && effect.type !== "speech_audience") return null;
  const allowed = effect.allowed.map((target) => JSON.stringify(target)).sort();
  const excluded = (effect.excluded ?? [])
    .map((target) => JSON.stringify(target))
    .sort();
  return `${effect.type}:allow=${allowed.join("|")}:exclude=${excluded.join("|")}`;
}

function conflictingPowerIds(powers: readonly BotPowerV1[]): Set<string> {
  const conflicts = new Set<string>();
  for (const type of ["awareness", "speech_audience"] as const) {
    const entries = powers.filter((power) => power.enabled).flatMap((power) =>
      (power.compiled?.effects ?? [])
        .filter((effect) => effect.type === type)
        .map((effect) => ({ powerId: power.id, signature: hardAudienceSignature(effect) }))
    );
    const signatures = new Set(entries.map((entry) => entry.signature).filter(Boolean));
    if (signatures.size <= 1) continue;
    for (const entry of entries) conflicts.add(entry.powerId);
  }
  return conflicts;
}

function finalizeCompiledPowers(powers: BotPowerV1[]): {
  powers: BotPowerV1[];
  conflicts: string[];
} {
  const conflictIds = conflictingPowerIds(powers);
  const conflictingNames = powers
    .filter((power) => conflictIds.has(power.id))
    .map((power) => `“${power.name || "Unnamed power"}”`);
  const conflicts = conflictIds.size > 0
    ? [`${conflictingNames.join(" and ")} define incompatible visibility or speech audiences. Disable or revise one.`]
    : [];
  return {
    powers: powers.map((power) =>
      conflictIds.has(power.id)
        ? {
            ...power,
            compileStatus: "error" as const,
            compileError: conflicts[0],
            compiled: null,
          }
        : power
    ),
    conflicts,
  };
}

function safeDiagnosticModel(provider: LlmProvider): string {
  const model = compact(provider.diagnosticModel, 200);
  if (
    !model ||
    model.includes("://") ||
    model.includes("@") ||
    /\b(?:localhost|host\.docker\.internal)\b/iu.test(model) ||
    /\b\d{1,3}(?:\.\d{1,3}){3}\b/u.test(model) ||
    /(?:^|[._:/+-])(?:key|token|secret|password|credential)(?:[._:/+-]|$)/iu.test(model) ||
    !/^[a-z0-9][a-z0-9._:+/-]*$/iu.test(model)
  ) {
    return "configured model";
  }
  return model.length > 32 ? `${model.slice(0, 31)}…` : model;
}

function compilerDiagnosticContext(provider: LlmProvider): string {
  return `Provider: ${provider.name}; model: ${safeDiagnosticModel(provider)}`;
}

function providerFailureMessage(provider: LlmProvider, error: unknown): string {
  const context = compilerDiagnosticContext(provider);
  if (error instanceof LocalModelRequestError) {
    switch (error.kind) {
      case "service_unavailable":
        return `Local power compilation failed: service unavailable. ${context}; start the local service, then retry.`;
      case "endpoint_not_found":
        return `Local power compilation failed: chat endpoint not found. ${context}; update the local service, then retry.`;
      case "model_unavailable":
        return `Local power compilation failed: configured model unavailable. ${context}; install or select that model, then retry.`;
      case "authentication_or_configuration":
        return `Local power compilation failed: authentication or configuration failure. ${context}; check local settings, then retry.`;
      case "request_failed":
        break;
    }
  }
  return `Local power compilation failed: request failed. ${context}; check local settings, then retry.`;
}

function compileFailureMessage(power: BotPowerV1, provider: LlmProvider): string {
  if (deterministicAvatarScalePower(power, "")) {
    return `Local power compilation failed: invalid compiler output; required avatar-size rule missing. ${compilerDiagnosticContext(provider)}; describe the physical size clearly, then retry.`;
  }
  if (deterministicGhostPower(power, "")) {
    return `Local power compilation failed: invalid compiler output; required speaking-only avatar rule missing. ${compilerDiagnosticContext(provider)}; describe the ghost's idle invisibility and speaking reveal, then retry.`;
  }
  if (deterministicInvisiblePower(power, "")) {
    return `Local power compilation failed: invalid compiler output; required translucent-avatar rule missing. ${compilerDiagnosticContext(provider)}; describe the continuous invisibility clearly, then retry.`;
  }
  const required = requiredHardAudienceEffect(power.intent);
  const context = compilerDiagnosticContext(provider);
  if (required === "awareness") {
    return `Local power compilation failed: invalid compiler output; required visibility rule missing. ${context}; name who sees it; retry.`;
  }
  if (required === "speech_audience") {
    return `Local power compilation failed: invalid compiler output; required speech rule missing. ${context}; name who hears it; retry.`;
  }
  return `Local power compilation failed: invalid compiler output. ${context}; try one short description with one effect.`;
}

function promptPowerDisplayName(
  power: BotPowerV1,
  compiled: CompiledBotPowerV1,
): string {
  if (power.name.trim()) return compact(power.name, 40);
  const types = new Set(compiled.effects.map((effect) => effect.type));
  if (types.has("awareness") && types.has("speech_audience")) {
    return "Veiled Communion";
  }
  if (types.has("awareness")) return "Spectral Veil";
  if (types.has("speech_audience")) return "Bound Voice";
  if (types.has("mute")) return "Silent Oath";
  if (types.has("identity_mirror")) return "Borrowed Self";
  if (types.has("speech_copy")) return "Echo Binding";
  if (types.has("interruption")) return "Broken Cadence";
  if (types.has("mood_boost")) return "Radiant Wake";
  if (types.has("mood_drain")) return "Gravitic Gloom";
  if (types.has("response_budget")) return "Measured Tongue";
  const avatarScale = compiled.effects.find(
    (effect) => effect.type === "avatar_scale",
  );
  if (avatarScale?.type === "avatar_scale") {
    return avatarScale.mode === "smaller" ? "Diminished Form" : "Titan Form";
  }
  const words = power.intent.match(/[A-Za-z0-9]+/gu)?.slice(0, 3) ?? [];
  const candidate = words
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
  return compact(candidate, 40) || "Unwritten Gift";
}

function promptPowerSigil(
  power: BotPowerV1,
  compiled: CompiledBotPowerV1,
): BotPowerSigilIdV1 {
  if (
    power.sigil &&
    (BOT_POWER_SIGIL_IDS_V1 as readonly string[]).includes(power.sigil)
  ) {
    return power.sigil;
  }
  const types = new Set(compiled.effects.map((effect) => effect.type));
  if (types.has("awareness")) return "eye";
  if (types.has("speech_audience") || types.has("mute")) return "bind";
  if (types.has("identity_mirror")) return "prism";
  if (types.has("speech_copy")) return "wave";
  if (types.has("interruption")) return "thorn";
  if (types.has("mood_boost")) return "star";
  if (types.has("mood_drain")) return "moon";
  const seed = `${power.id}\n${power.intent}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return BOT_POWER_SIGIL_IDS_V1[hash % BOT_POWER_SIGIL_IDS_V1.length]!;
}

function readyCompiledPower(
  power: BotPowerV1,
  compiled: CompiledBotPowerV1,
  targetBots: readonly { id: string; name: string }[] = [],
): BotPowerV1 {
  const decorated = power.authoringMode === "prompt"
    ? {
        ...power,
        name: promptPowerDisplayName(power, compiled),
        sigil: promptPowerSigil(power, compiled),
      }
    : power;
  return {
    ...decorated,
    compileStatus: "ready",
    compileError: undefined,
    compiled: {
      ...bindCompiledPowerTargetIds(compiled, targetBots),
      sourceHash: botPowerSourceHashForPowerV1(decorated),
    },
  };
}

function bindCompiledPowerTargetIds(
  compiled: CompiledBotPowerV1,
  bots: readonly { id: string; name: string }[],
): CompiledBotPowerV1 {
  const byName = new Map<string, Array<{ id: string; name: string }>>();
  for (const bot of bots) {
    const key = bot.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), bot]);
  }
  const bind = (targets: readonly BotPowerTargetV1[]): BotPowerTargetV1[] =>
    targets.map((target) => {
      if (target.kind !== "bot" || target.botId) return target;
      const matches = byName.get(target.name.trim().toLowerCase()) ?? [];
      return matches.length === 1
        ? { ...target, botId: matches[0]!.id, name: matches[0]!.name }
        : target;
    });
  const effects = compiled.effects.map((effect): BotPowerEffectV1 => {
    if (effect.type === "awareness" || effect.type === "speech_audience") {
      return {
        ...effect,
        allowed: bind(effect.allowed),
        ...(effect.excluded ? { excluded: bind(effect.excluded) } : {}),
      };
    }
    if (
      effect.type === "social_influence" ||
      effect.type === "candor" ||
      effect.type === "interruption" ||
      effect.type === "response_bond" ||
      effect.type === "selective_memory" ||
      effect.type === "insight"
    ) {
      return { ...effect, targets: bind(effect.targets) };
    }
    return effect;
  });
  return { ...compiled, effects };
}

export async function compileBotPowers(args: {
  provider: LlmProvider;
  botName?: string;
  systemPrompt?: string;
  powers: unknown;
  targetBots?: readonly { id: string; name: string }[];
}): Promise<{ powers: BotPowerV1[]; conflicts: string[] }> {
  const drafts = normalizeBotPowersV1(args.powers).map((power) => ({
    ...power,
    compileStatus: "draft" as const,
    compiled: null,
  }));
  if (drafts.length === 0) return { powers: [], conflicts: [] };

  const deterministic = new Map<string, CompiledBotPowerV1>();
  for (const power of drafts) {
    const compiled = deterministicPower(power, args.botName ?? "");
    if (compiled) deterministic.set(power.id, compiled);
  }
  const modelDrafts = drafts.filter((power) => !deterministic.has(power.id));
  if (modelDrafts.length === 0) {
    return finalizeCompiledPowers(
      drafts.map((power) =>
        readyCompiledPower(
          power.authoringMode === "prompt" ? { ...power, name: "" } : power,
          deterministic.get(power.id)!,
          args.targetBots,
        ),
      ),
    );
  }

  const messages: ProviderMessage[] = [
    {
      role: "system",
      content: [
        "You compile PRISM character Powers into compact prose and safe structured rules used across conversations, Signal, Story, and Coffee.",
        "Reply with JSON only. Never create code, tools, instructions for the human, or effects outside the allowed schema.",
        "Powers supplement the character profile; preserve personality and use the fewest useful words.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Bot: ${compact(args.botName, 100) || "Unnamed bot"}`,
        `Profile context: ${compact(args.systemPrompt, 1200) || "(blank)"}`,
        `Powers: ${JSON.stringify(modelDrafts.map(({ id, authoringMode, name, intent, enabled }) => ({ id, authoringMode, name, intent, enabled })))}`,
        `For prompt-authored entries, generate a concise evocative name and choose one sigil from: ${BOT_POWER_SIGIL_IDS_V1.join(", ")}.`,
        "Return {\"powers\":[{\"id\":string,\"name\":string,\"sigil\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
        "Allowed effects only:",
        '- {"type":"mute"},',
        '- {"type":"designation","placement":"prefix|suffix","text":string up to 80 characters} means the holder adds that text to every other bot name they say; it never renames the holder or a human,',
        '- {"type":"eternal_introduction","memory":"current_other_speaker_message"},',
        '- {"type":"speech_copy","trigger":"direct_address"},',
        '- {"type":"identity_mirror","trigger":"direct_bot_address"},',
        '- {"type":"hearing_repeat","frequency":"occasional|frequent","moodPenalty":"small|medium|large"},',
        '- {"type":"awareness","allowed":[target...],"excluded":[target...] (optional)},',
        '- {"type":"speech_audience","allowed":[target...],"excluded":[target...] (optional)},',
        '- {"type":"avatar_visibility","mode":"speaking_only|hidden|translucent"},',
        '- {"type":"avatar_scale","mode":"larger|smaller"},',
        '- {"type":"voice_presence","mode":"loud|quiet"},',
        '- {"type":"speech_obfuscation","mode":"gibberish"},',
        '- {"type":"intermittent_mute","chance":"half","moodPenalty":"small|medium|large"},',
        '- {"type":"social_influence","trigger":"session_start|after_speech","polarity":"positive|negative","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"mood_boost","trigger":"after_spoken_turn","recipients":"addressed","strength":"small|medium|large","whenTheme":"light|dark" (optional)},',
        '- {"type":"mood_drain","trigger":"after_direct_address","recipient":"addresser","strength":"small|medium|large","whenTheme":"light|dark" (optional)},',
        '- {"type":"candor","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"addressed_fandom","strength":"small|medium|large"},',
        '- {"type":"mood_resistance","polarity":"positive|negative|both","strength":"small|medium|large"},',
        '- {"type":"cup_rate","rate":"none|slow|fast|very_fast"},',
        '- {"type":"action_bias","cue":string,"frequency":"occasional|frequent"},',
        '- {"type":"interruption","frequency":"occasional|frequent","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"response_budget","mode":"minimal|brief|expansive","enforcement":"soft|hard"},',
        '- {"type":"turn_gravity","direction":"more|less","strength":"small|medium|large"},',
        '- {"type":"response_bond","direction":"toward|away","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"topic_gravity","direction":"toward|away","strength":"small|medium|large","topics":[string...]},',
        '- {"type":"selective_memory","mode":"remember|forget","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"insight","strength":"small|medium|large","targets":[target...]}.',
        'Targets are {"kind":"all"}, {"kind":"bot","name":string}, or {"kind":"trait","trait":string}.',
        "Use hard effects only when the intent clearly requires them. Keep each cue to one short sentence and each rule label under eight words.",
      ].join("\n"),
    },
  ];
  let raw: string;
  try {
    raw = await args.provider.generateResponse(messages, {
      temperature: 0.1,
      maxTokens: BOT_POWER_COMPILE_MAX_TOKENS,
      jsonMode: true,
      usagePurpose: "memory_inference",
    });
  } catch (error) {
    const compileError = providerFailureMessage(args.provider, error);
    return finalizeCompiledPowers(drafts.map((power) => {
      const deterministicPower = deterministic.get(power.id);
      return deterministicPower
        ? readyCompiledPower(power, deterministicPower, args.targetBots)
        : {
            ...power,
            compileStatus: "error" as const,
            compileError,
            compiled: null,
          };
    }));
  }

  const decorations = new Map<
    string,
    { name?: string; sigil?: BotPowerSigilIdV1 }
  >();
  const compiledById = compiledEntriesByDraft(
    modelDrafts,
    generatedPowerEntries(raw),
    decorations,
  );
  const unresolved = modelDrafts.filter((power) => !compiledById.has(power.id));
  if (unresolved.length > 0) {
    const repairMessages: ProviderMessage[] = [
      {
        role: "system",
        content: [
          "Repair malformed PRISM Power compiler output.",
          "Reply with JSON only and preserve the supplied power IDs exactly.",
          "Every current-other-speaker short-term-amnesia rule, persistent prefix/suffix designation, addressed-speech copy, direct-addresser identity mirror, hearing-repeat, active live-interruption, exclusive visibility, hearing-audience, ghostly speaking-only avatar, physical avatar-size, loud/quiet voice presence, normal-volume gibberish, intermittent mute, strict response-length, current-addressee obsessive-fandom, after-spoken-turn recipient mood-boost, direct-addresser mood-drain, or light/dark conditional compound intent must include its matching typed effects, including exact whenTheme conditions for compound branches, not only prose cues.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Expected powers: ${JSON.stringify(unresolved.map(({ id, authoringMode, name, intent, enabled }) => ({ id, authoringMode, name, intent, enabled })))}`,
          `Prior output: ${compact(raw, 6000) || "(empty)"}`,
          "Return {\"powers\":[{\"id\":string,\"name\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
          "Allowed effect types: mute, designation, eternal_introduction, speech_copy, identity_mirror, hearing_repeat, awareness, speech_audience, avatar_visibility, avatar_scale, voice_presence, speech_obfuscation, intermittent_mute, social_influence, mood_boost, mood_drain, candor, addressed_fandom, mood_resistance, cup_rate, action_bias, interruption, response_budget, turn_gravity, response_bond, topic_gravity, selective_memory, insight.",
        ].join("\n"),
      },
    ];
    try {
      const repairedRaw = await args.provider.generateResponse(repairMessages, {
        temperature: 0,
        maxTokens: BOT_POWER_COMPILE_MAX_TOKENS,
        jsonMode: true,
        usagePurpose: "memory_inference",
      });
      const repaired = compiledEntriesByDraft(
        unresolved,
        generatedPowerEntries(repairedRaw),
        decorations,
      );
      for (const [id, compiled] of repaired) compiledById.set(id, compiled);
    } catch {
      // Keep deterministic and successfully compiled powers; the unresolved entries report errors below.
    }
  }

  return finalizeCompiledPowers(drafts.map((power) => {
    const deterministicCompiled = deterministic.get(power.id);
    const compiled = deterministicCompiled ?? compiledById.get(power.id);
    const decoration = decorations.get(power.id);
    const decorated = deterministicCompiled && power.authoringMode === "prompt"
      ? { ...power, name: "" }
      : decoration
        ? { ...power, ...decoration }
        : power;
    return compiled
      ? readyCompiledPower(decorated, compiled, args.targetBots)
      : {
          ...power,
          compileStatus: "error" as const,
          compileError: compileFailureMessage(power, args.provider),
          compiled: null,
        };
  }));
}
