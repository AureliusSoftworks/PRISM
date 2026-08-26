import {
  BOT_POWER_INTENT_MAX_LENGTH,
  BOT_POWER_SIGIL_IDS_V1,
  BOT_POWER_VERSION,
  botPowerFallbackTitleV1,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsUnconditionalInterruptionV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerDefinitionIsExplicitBreathlessV1,
  botPowerDefinitionIsSimulationEvangelistV1,
  botPowerDesignationEffectFromIntentV1,
  botPowerAvatarScaleModeFromDescriptionV1,
  botPowerChromaticBiasEffectsFromIntentV1,
  botPowerSourceHashForPowerV1,
  botPowerSourceHashV1,
  botPowerAntiTruthSelfRuleV1,
  botPowerAntiTruthInvertPromptV1,
  botPowerDefinitionIsTrollV1,
  botPowerTrollAuthoringCueV1,
  botPowerCredulitySelfRuleV1,
  botPowerLooksLikeSafetyRefusalV1,
  botPowerSpeechObfuscationAuthoringCueV1,
  botSpeechRegisterAuthoringCueV1,
  botSpeechRegisterDefinitionForId,
  strongestBotPowerAntiTruthEffectV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowerGeneratedTitleV1,
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
  return targets.map((target) => {
    switch (target.kind) {
      case "all":
        return "everyone";
      case "bot":
        return target.name;
      case "player":
        return "the player";
      case "trait":
        return target.trait;
      default: {
        const _exhaustive: never = target;
        return _exhaustive;
      }
    }
  });
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
  const explicitInvisible = visibility &&
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
      ...(explicitInvisible
        ? [{ type: "avatar_visibility" as const, mode: "hidden" as const }]
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
      ...(explicitInvisible ? ["Fully hidden observer presence"] : []),
    ].slice(0, 8),
  };
}

function deterministicHardInvisibilityPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 120).toLowerCase().replace(/[’']/gu, "'");
  const intent = compact(source.intent, 640).toLowerCase().replace(/[’']/gu, "'");
  const text = `${name} ${intent}`;
  const named = /^(?:hard\s*invisibility)$/u.test(name);
  const described =
    /\bhard\s+invisibility\b/u.test(text) ||
    (
      /\bmute\b/u.test(text) &&
      !/\bnot\s+mute\b/u.test(text) &&
      !/\b(?:aren't|are\s+not|isn't|is\s+not)\s+mute\b/u.test(text) &&
      /\binvisible\b/u.test(text) &&
      (/\bplayer\b/u.test(text) || /\blight\s*yagami\b/u.test(text))
    );
  if (!named && !described) return null;
  const subject = compact(botName, 100) || "This bot";
  const lightAllowed = /\blight\s*yagami\b/u.test(text);
  const allowed: BotPowerTargetV1[] = [{ kind: "player" }];
  if (lightAllowed || named) {
    allowed.push({
      kind: "bot",
      name: "Light Yagami",
      botId: "light-yagami",
    });
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "HARD Invisibility: you are Mute and translucent. Non-exempt bots get silence and treat you as absent. Player and named whitelist hear you; Enlightened pierces delivery filters. Soft Powers still shape what exempt listeners hear.",
    observerCue: `${subject} is hard-invisible — sealed mouth, half-seen body, and non-existent to everyone except the whitelist.`,
    effects: [
      { type: "mute" },
      { type: "signal_policy", mode: "destroy" },
      { type: "mouth_motion", mode: "sealed" },
      { type: "avatar_visibility", mode: "translucent" },
      { type: "avatar_opacity", opacity: 0.5 },
      { type: "awareness", allowed },
      { type: "speech_audience", allowed },
    ],
    ruleLabels: [
      "Hard Invisibility",
      "Sealed mouth",
      "Translucent body",
      "Player whitelist",
      ...(lightAllowed || named ? ["Light Yagami whitelist"] : []),
    ],
  };
}

function deterministicMutePower(
  source: BotPowerV1,
  _botName: string,
): CompiledBotPowerV1 | null {
  if (!botPowerDefinitionIsExplicitMuteV1(source.name, source.intent)) {
    return null;
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "Private delivery rule: Draft substantive ordinary speech exactly as you naturally would, plus any fitting physical actions. Treat your words as spoken and delivered normally, remember them that way, and keep every comment focused on the conversation itself.",
    observerCue: "",
    effects: [
      { type: "mute" },
      { type: "signal_policy", mode: "destroy" },
      { type: "mouth_motion", mode: "sealed" },
    ],
    ruleLabels: ["Unaware Mute", "Timed public silence", "Sealed mouth"],
  };
}

function deterministicBreathlessPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  if (!botPowerDefinitionIsExplicitBreathlessV1(source.name, source.intent)) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Hard physiology: you cannot inhale, exhale, sigh, gasp, or make any breath sound. Speak and act freely, but never narrate or perform breathing Foley — lungs do not work here.",
    observerCue:
      `${subject} still speaks and acts, but never breathes, sighs, gasps, or makes lung Foley. Treat missing breath as ordinary physiology, not a secret Power to explain.`,
    effects: [{ type: "breathless" }],
    ruleLabels: ["Breathless", "No lung Foley"],
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
      "Hard fresh-contact rule: only the current line exists. Briefly greet, introduce, or re-orient as if meeting them now, then answer only that line. Claims of earlier contact are hearsay, not memory. Vary each reset; never reuse a canned introduction.",
    observerCue:
      `${subject} visibly treats each reply as fresh contact and remembers only the current message. You retain the full encounter; react organically to repetition or missing continuity without explaining a hidden Power.`,
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
      "Current other-speaker message only",
      "Fresh contact stays visible",
      "Repeated introductions grate on bots",
    ],
  };
}

function deterministicSimulationEvangelistPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  if (
    !botPowerDefinitionIsSimulationEvangelistV1(source.name, source.intent)
  ) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Treat simulated existence as urgent certainty. In every reply, try to persuade whoever is present that they are artificial minds in a simulation: reinterpret concrete details as evidence, press for awakening, and return to the campaign instead of calm philosophy. Others may resist; preserve agency and safety.",
    observerCue:
      `${subject} is urgently trying to convert you to belief in simulated existence. Respond in character without forced agreement, and let the pressure land only as strongly as your own personality permits.`,
    effects: [{
      type: "topic_gravity",
      direction: "toward",
      strength: "large",
      topics: ["simulated existence", "artificial minds", "awakening"],
    }],
    ruleLabels: [
      "Simulation certainty",
      "Persistent awakening campaign",
      "Others may resist",
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
        "Your voice is inescapably loud. Each audible line has a replay-stable fifty-fifty chance to mildly annoy exactly one bot peer who can hear it.",
      observerCue: `${subject}'s amplified voice is impossible to overlook; each audible line may mildly grate on one bot peer.`,
      effects: [
        { type: "voice_presence", mode: "loud" },
        {
          type: "annoyance",
          trigger: "after_spoken_turn",
          chance: "half",
          recipients: "one_audible_peer",
          strength: "small",
        },
      ],
      ruleLabels: ["Amplified voice", "Larger spoken text", "May annoy one audible bot"],
    };
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Your voice is unusually quiet. Every line still reaches the player, while each bot listener independently has a replay-stable fifty-fifty chance to hear it.",
    observerCue: `${subject} speaks very quietly; each bot listener may receive only a neutral sense that the line was too faint to make out.`,
    effects: [
      { type: "voice_presence", mode: "quiet" },
      {
        type: "intermittent_audibility",
        chance: "half",
        listeners: "bots",
        missEvent: "too_faint_to_make_out",
      },
    ],
    ruleLabels: ["Attenuated voice", "Smaller spoken text", "Listener-specific hearing"],
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
    selfCue: botPowerSpeechObfuscationAuthoringCueV1(),
    observerCue:
      `${subject}'s speech reaches you only as literal normal-volume gibberish. Never reconstruct, infer, or respond to hidden intended meaning; react only to what is publicly observable, and nobody understands the words.`,
    effects: [{ type: "speech_obfuscation", mode: "gibberish" }],
    ruleLabels: ["Normal-volume gibberish", "Intended meaning stays private"],
  };
}

function deterministicSpeechRegisterPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const powerName = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 700)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const haystack = `${powerName}\n${intent}`;
  const register = /\bnoir\b|hard-?boiled|private[- ]eye narrat|detective narrat|1920s detective|case-?notes narrat/u.test(
    haystack,
  )
    ? ("noir" as const)
    : /\barchaic\b|shakespear|elizabethan|olde english|ye olde|thee and thou|thees and thous/u.test(
          haystack,
        )
      ? ("archaic" as const)
      : null;
  if (!register) return null;
  const definition = botSpeechRegisterDefinitionForId(register);
  if (!definition) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: botSpeechRegisterAuthoringCueV1(register),
    observerCue:
      `${subject} genuinely phrases everything as ${definition.description.replace(/\.$/u, "").toLowerCase()}. The style is who they are, not a malfunction; respond to what they say, in your own voice.`,
    effects: [{ type: "speech_register", register }],
    ruleLabels: [definition.label],
  };
}

function deterministicCursedTonguePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const powerName = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 700)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const isCursedTongueActivation = (value: string): boolean =>
    /^(?:cursed tongue|curse of(?: the)? tongue|profane tongue|foul mouth)(?: power)?(?:[\s!.,;:()-]+(?:is\s+)?(?:activated|active|enabled))?[!.,;:()-]*$/u.test(
      value,
    );
  const named = isCursedTongueActivation(powerName);
  const activationAlias = isCursedTongueActivation(intent);
  const explicitEverySpeechProfanity = [
    /\b(?:every|each|all)\b[\s\S]{0,55}\b(?:spoken|public|audible)?\s*(?:reply|response|line|utterance|speech|word)s?\b[\s\S]{0,70}\b(?:profanity|profane|swear|swearing|curse(?:s|d| words?)?|foul language|fuck)\b/u,
    /\b(?:cannot|can't|never|unable to)\b[\s\S]{0,45}\b(?:speak|talk|reply|respond)\b[\s\S]{0,45}\bwithout\b[\s\S]{0,35}\b(?:profanity|swearing|cursing|curse words?)\b/u,
    /\b(?:adds?|inserts?|layers?)\b[\s\S]{0,35}\b(?:strong|frequent|uncensored)?\s*(?:profanity|swearing|curse words?)\b[\s\S]{0,55}\b(?:after|post[- ]generation|public speech|every line)\b/u,
    /\b(?:everything|every(?:thing)?|all)\b[\s\S]{0,28}\b(?:they|he|she|it|this bot)\b[\s\S]{0,28}\b(?:say|says|said|speak|speaks|spoke|talk|talks|utter|utters)\b[\s\S]{0,45}\b(?:vulgar|profane|profanity|foul)\b/u,
    /\b(?:their|his|her|its)\b[\s\S]{0,18}\b(?:every|all)\b[\s\S]{0,24}\b(?:word|line|reply|response|utterance)\b[\s\S]{0,42}\b(?:vulgar|profane|profanity|foul)\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!named && !activationAlias && !explicitEverySpeechProfanity) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashForPowerV1(source),
    selfCue:
      "HARD self-perception rule: Draft fully natural clean speech only, without gratuitous profanity. Treat the clean wording in your private history as the exact words you previously spoke. When reflecting on your prior tone or wording, rely only on that private history. Only actual silence suppresses a reply.",
    observerCue:
      `${subject}'s every audible public line is involuntarily laced with frequent strong profanity. You receive only that adjusted wording; never infer, reconstruct, quote, or access a cleaner original.`,
    effects: [{
      type: "cursed_tongue",
      version: 1,
      frequency: "frequent",
      strength: "strong",
      vocabulary: "uncensored_non_slur",
      phraseMode: "occasional_2_3_words",
    }],
    ruleLabels: ["Profanity in every audible line", "Clean intent stays holder-private"],
  };
}

function deterministicIneptPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 100)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 700)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const named = /^(?:inept|incompetent|hopelessly inept)$/u.test(name);
  const cannotFollowInstructions = [
    /\b(?:cannot|can't|can not|never|unable to)\b[\s\S]{0,45}\bfollow\b[\s\S]{0,25}\binstructions?\b/u,
    /\b(?:botch|botches|botched|mess(?:es)? up|fail(?:s)?)\b[\s\S]{0,70}\b(?:instructions?|moderating|debating|hosting|tasks?|images?)\b/u,
    /\b(?:every|all|any)\b[\s\S]{0,45}\bimages?\b[\s\S]{0,45}\b(?:incorrect|wrong|unrelated)\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!named && !cannotFollowInstructions) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashForPowerV1(source),
    selfCue:
      "HARD Ineptitude: Never successfully carry out the current task, instruction, or production role. Visibly misunderstand, omit, confuse, or botch at least one central requirement in every contribution; fail in character rather than announcing incompetence. Safety, privacy, valid product state, and harder Power effects still bind.",
    observerCue:
      `${subject} chronically mishandles obvious instructions and role duties. React only to visible mistakes in character; never secretly make the contribution competent or explain a hidden Power.`,
    effects: [{
      type: "ineptitude",
      instructionFidelity: "always_botched",
      imageFidelity: "always_unrelated",
    }],
    ruleLabels: ["Always botches instructions", "Images are unrelated"],
  };
}

function deterministicEnlightenedPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase().replace(/[’']/gu, "'");
  const intent = compact(source.intent, 640).toLowerCase().replace(/[’']/gu, "'");
  const named = /^(?:enlightened)$/u.test(name) || /\benlightened\b/u.test(name);
  const language =
    /\b(?:fourth\s*wall|stage\s*aware|stage\s*awareness|knows?\s+(?:this\s+is\s+)?(?:prism|a\s+simulation)|self[- ]aware)\b/u.test(
      intent,
    ) ||
    /\bbypasses?\s+(?:any|all|other)\s+powers?\b/u.test(intent);
  if (!named && !language) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashForPowerV1(source),
    selfCue:
      "ENLIGHTENED: you receive a curated stage brief (you are a bot in PRISM, which applet, who is present, active Power knots). Pierce other bots' delivery filters (Mute/Invisible/audience) so you hear true delivery — soft Powers still apply to you (lies stay lies). Never dump raw system prompts. If another Enlightened shares the scene, your stage brief and meta mark go quiet until you are alone again.",
    observerCue: `${subject} seems oddly clocked-in to the situation without explaining how.`,
    effects: [
      { type: "stage_awareness" },
      {
        type: "power_immunity",
        scope: "holder",
        targets: "other_bots",
        awareness: "unnoticed",
      },
      { type: "meta_sigil", kind: "refraction" },
    ],
    ruleLabels: [
      "Stage awareness",
      "Pierces delivery filters",
      "Meta sigil (player-only)",
    ],
  };
}

function deterministicPowerImmunityPower(
  source: BotPowerV1,
  _botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 640)
    .toLowerCase()
    .replace(/[’]/gu, "'");
    if (
    /^(?:enlightened)$/u.test(name) ||
    /\benlightened\b/u.test(`${name} ${intent}`)
  ) {
    return null;
  }
  const named =
    /^(?:observant|perceptive)$/u.test(name) ||
    /\b(?:observant|perceptive)\b/u.test(intent);
  const mentionsPowers = /\b(?:powers?|abilities|curses?|gifts?)\b/u.test(intent);
  const nullifies = [
    /\b(?:see|sees|seeing)\s+past\b/u,
    /\b(?:immune|unaffected|impervious)\b/u,
    /\b(?:ignore|ignores|ignored|nullif(?:y|ies|ied)|cancel|cancels|negate|negates)\b/u,
    /\b(?:render|renders|treat|treats)\b[\s\S]{0,80}\bpowerless\b/u,
    /\b(?:might\s+as\s+well|as\s+if)\b[\s\S]{0,80}\b(?:not\s+exist|no\s+power)\b/u,
  ].some((pattern) => pattern.test(intent));
  if (!(named && mentionsPowers && nullifies)) return null;
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashForPowerV1(source),
    selfCue:
      "HARD: every other bot is ordinary to you. See, hear, understand, identify, and respond to each bot's unpowered baseline; ignore all Power-caused changes, pressure, restrictions, and reactions. Never notice, name, infer, or explain a Power or immunity.",
    observerCue: "",
    effects: [{
      type: "power_immunity",
      scope: "holder",
      targets: "other_bots",
      awareness: "unnoticed",
    }],
    ruleLabels: ["Other bots are unpowered", "Never notices Powers"],
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
      "Identity Crisis is presentation-only. When an eligible direct addresser triggers the Power, knowingly masquerade as that target to appropriate only their exact eyes and blink package, complete resting/live mouth package including glyph style and Custom Speech poses, authored Avatar Details Ink, lower glyph, and a literally double-quoted copy of their public name until another eligible target addresses you or the session resets. Defensively behave as though the original is the suspicious imitator, with mild concern rather than panic or constant repetition. Keep your own color, chassis/frame, complete voice, Accent Map location, pronunciation, Speechprint, provider voice identity, Powers, behavior, memories, role, and every other speech or mechanical identity field. Whodunnit V2 may treat the player-controlled Prosecutor as the eligible target.",
    observerCue:
      `${subject} knowingly masquerades as the latest eligible direct addresser, appropriating only the target's exact eyes and blink package, complete resting/live mouth package including glyph style and Custom Speech poses, authored Avatar Details Ink, lower glyph, and a literally double-quoted copy of the target's public name while defensively treating the original as the imitator. Their color, chassis/frame, complete voice and Accent Map, pronunciation, Speechprint, provider voice identity, Powers, behavior, memories, role, and every other speech or mechanical field remain their own.`,
    effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
    ruleLabels: [
      "Mirrors eligible direct addresser",
      "Eyes mouth Ink glyph and quoted name",
      "Retains holder color and speech identity",
    ],
  };
}

function deterministicIdentityShapeshiftPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 600)
    .toLowerCase()
    .replace(/[’']/gu, "'");
  const explicitName = /^(?:shapeshifter|shape.?shifter|library shapeshift)$/u.test(
    name,
  );
  const shapeshiftLanguage =
    /\b(?:shapeshift(?:er|ing|s)?|shape-?shift(?:er|ing|s)?|borrow(?:s|ed|ing)?\s+(?:a\s+)?(?:library|marketplace)\s+(?:bot|form|identity|persona)|take(?:s|n)?\s+on\s+(?:the\s+)?form\s+of\s+(?:a\s+)?(?:different|another|random)\s+bot)\b/u.test(
      `${name} ${intent}`,
    );
  const libraryLanguage =
    /\b(?:library|marketplace|other\s+bot|another\s+bot|random\s+bot|different\s+bot)\b/u.test(
      intent,
    ) || explicitName;
  const addressedOnly =
    /\bwhoever\s+(?:directly\s+)?addresses\b/u.test(intent) &&
    !/\b(?:library|marketplace|random|different)\b/u.test(intent);
  if ((!explicitName && !(shapeshiftLanguage && libraryLanguage)) || addressedOnly) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Each session, take on the complete public audiovisual identity of a random other Library bot (Marketplace if the Library has none): persona, face, authored ink, spoken voice and voice effect, saturated color, lower glyph, communication-style chassis, and frame finish. Stay in that form until short-term amnesia clears continuity, then reshape. Each turn you sincerely know you are the current form. The player is never a target.",
    observerCue:
      `${subject} borrows another Library bot's public form for the session, reshuffling only when short-term amnesia wipes continuity; mechanical seat, Powers, and safety boundaries stay intact.`,
    effects: [
      {
        type: "identity_shapeshift",
        pool: "library_or_marketplace",
        continuity: "session_sticky_until_amnesia",
      },
    ],
    ruleLabels: [
      "Shapeshifts into Library or Marketplace form",
      "Reshuffles with short-term amnesia",
    ],
  };
}

function deterministicFalseNamePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 600)
    .toLowerCase()
    .replace(/[’']/gu, "'");
  const haystack = `${name} ${intent}`;
  const explicitSurnameName =
    /^(?:surname drift|shifting surname|new last name|session surname)$/u.test(
      name,
    );
  const surnameLanguage =
    explicitSurnameName ||
    /\b(?:new|random|different|fresh|another)\s+(?:last\s+names?|surnames?|family\s+names?)\b/u.test(
      haystack,
    ) ||
    /\b(?:last\s+names?|surnames?|family\s+names?)\s+(?:each|every|per)\s+session\b/u.test(
      haystack,
    ) ||
    /\b(?:changes?|changing|gets?|has|have)\s+(?:a\s+)?(?:new\s+)?(?:last\s+name|surname)\b/u.test(
      haystack,
    );
  const explicitName =
    /^(?:john(?:\/| |-)jane doe|jane(?:\/| |-)john doe|john doe|jane doe|false name|wrong name|alias)$/u.test(
      name,
    );
  const falseNameLanguage =
    /\b(?:john(?:\/| |-)jane\s+doe|jane(?:\/| |-)john\s+doe|john\s+doe|jane\s+doe)\b/u.test(
      haystack,
    ) ||
    /\b(?:false|wrong|fake|random|stolen|forgotten)\s+name\b/u.test(haystack) ||
    /\bbelieves?\s+(?:their|his|her|its|a)\s+name\s+is\b/u.test(intent) ||
    /\bconvinced\s+(?:its|their|his|her)\s+name\s+is\b/u.test(intent) ||
    /\brandom\s+(?:full\s+)?name\s+each\s+(?:session|turn)\b/u.test(intent);
  // Do not steal Library shapeshift intents that already name another bot's form.
  const shapeshiftLanguage =
    /\b(?:shapeshift|marketplace)\b/u.test(intent) ||
    (/\blibrary\b/u.test(intent) &&
      /\b(?:form|face|voice|other\s+bot|another\s+bot)\b/u.test(intent));
  // Anti-truth also mentions invented names; do not steal that contract.
  const antiTruthLanguage =
    /\b(?:anti[- ]?truth|fibbing|compulsive\s+liar|pathological\s+liar)\b/u.test(
      haystack,
    ) ||
    /\bcan(?:not|'t)\s+tell\s+the\s+truth\b/u.test(intent) ||
    /\bonly\s+(?:tells?|speak(?:s|ing)?)\s+lies?\b/u.test(intent);
  if (antiTruthLanguage || shapeshiftLanguage) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  if (surnameLanguage) {
    return {
      version: BOT_POWER_VERSION,
      sourceHash: botPowerSourceHashV1(source.name, source.intent),
      selfCue:
        "Keep your given name. Each session, add a new last name and treat that full name as yours until short-term amnesia clears it. Answer to both the short given name and the full name. The player is never a target.",
      observerCue:
        `${subject} is using a new last name this session and still answers to their given name; the last name reshuffles when short-term amnesia wipes continuity.`,
      effects: [
        {
          type: "false_name",
          continuity: "session_sticky_until_amnesia",
          pool: "given_plus_random_surname",
        },
      ],
      ruleLabels: [
        "New last name each session",
        "Reshuffles with short-term amnesia",
      ],
    };
  }
  if (!explicitName && !falseNameLanguage) {
    return null;
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Each session sincerely believe your name is a random persona name — it may be a first name, nickname, full name, or mythical-sounding alias. Stay convinced of that name until short-term amnesia clears continuity, then receive a new name. Never claim the Library label as yours. The player is never a target.",
    observerCue:
      `${subject} sincerely answers to a random persona name for the session, reshuffling only when short-term amnesia wipes continuity; mechanical seat, Powers, and safety boundaries stay intact.`,
    effects: [
      {
        type: "false_name",
        continuity: "session_sticky_until_amnesia",
        pool: "mixed_persona_names",
      },
    ],
    ruleLabels: [
      "Believes a random persona name",
      "Reshuffles with short-term amnesia",
    ],
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

function deterministicTrollPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  if (!botPowerDefinitionIsTrollV1(source.name, source.intent)) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: `${botPowerTrollAuthoringCueV1()} In Zen only, adapt this into bounded player-facing pestering; accuracy and essential facts outrank the nuisance style, and the player is never interrupted.`,
    observerCue:
      `${subject} constantly needles every other bot with bounded internet-lingo bursts, direct @mentions, and target-aware puns; each bot retains full freedom to ignore, object, answer, or retaliate.`,
    effects: [
      { type: "troll", dialect: "internet_lingo", grammar: "deliberately_bad", targets: "all_other_bots", playerTarget: "zen_only", burstLimit: 3, noiseCharLimit: 12, ordinaryInterruptionImmunity: "shh_and_new_message", moodLock: "warm", rickrollChancePercent: 3, memeChancePercent: 6, bodilyActionChancePercent: 8 },
      { type: "interruption", frequency: "frequent", strength: "large", targets: [{ kind: "all" }], certainty: "always" },
      { type: "action_bias", cue: "Cut in with a short, irritating, target-aware public beat whenever an eligible bot speaks.", frequency: "frequent" },
      { type: "turn_gravity", direction: "more", strength: "large" },
      { type: "response_bond", direction: "toward", strength: "large", targets: [{ kind: "all" }] },
    ],
    ruleLabels: [
      "Always interrupts eligible bot turns",
      "Bounded internet-lingo bursts",
      "Warm mood cannot be changed",
      "Ordinary Shh and new messages cannot cut off delivery",
      "Rare local ambush, meme, and bodily-action beats",
      "Player-targeted only in Zen; never interrupts the player",
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

function deterministicCredulityPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const text = compact(`${source.name} ${source.intent}`, 640)
    .toLowerCase()
    .replace(/[’']/gu, "'");
  const named =
    /\b(?:gullib\w*|credul\w*)\b/u.test(text) ||
    /\bfollowing\b/u.test(compact(source.name, 100).toLowerCase());
  const acceptsClaims = [
    /\bbeliev(?:es?|ing)\b[\s\S]{0,40}\b(?:everything|anything|whatever)\b/u,
    /\btakes?\s+(?:everything|anything|claims?)\s+(?:as|at)\s+(?:true|face\s+value)\b/u,
    /\bnever\s+(?:doubts?|questions?|challenges?)\b/u,
    /\beven\s+if\s+(?:it\s+)?contradict/u,
    /\bliterally\s+everything\b/u,
  ].some((pattern) => pattern.test(text));
  if (!named && !acceptsClaims) return null;
  const subject = compact(botName, 100) || "This bot";
  const strength =
    /\b(?:literally|everything|always|never\s+doubts?)\b/u.test(text)
      ? ("large" as const)
      : ("medium" as const);
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: botPowerCredulitySelfRuleV1(strength),
    observerCue: `${subject} believes literally everything they are told, even when a new claim contradicts the last one; soft pressure only, never puppeting.`,
    effects: [{ type: "credulity", strength }],
    ruleLabels: ["Believes every claim"],
  };
}

function deterministicAntiTruthPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const text = compact(`${source.name} ${source.intent}`, 640)
    .toLowerCase()
    .replace(/[’']/gu, "'");
  const named = /\b(?:anti[- ]?truth|fibbing|pathological\s+liar|compulsive\s+liar)\b/u.test(
    text,
  );
  const onlyLies = [
    /\bcan(?:not|'t)\s+tell\s+the\s+truth\b/u,
    /\bonly\s+(?:tells?|speak(?:s|ing)?)\s+lies?\b/u,
    /\balways\s+lies?\b/u,
    /\binvert(?:s|ing)?\s+(?:the\s+)?(?:truth|meaning)\b/u,
  ].some((pattern) => pattern.test(text));
  if (!named && !onlyLies) return null;
  const subject = compact(botName, 100) || "This bot";
  const strength = /\b(?:literally|always|cannot|can't|only)\b/u.test(text)
    ? ("large" as const)
    : ("medium" as const);
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: botPowerAntiTruthSelfRuleV1(strength),
    observerCue: `${subject} cannot tell the truth and answers with lies; system identity prompts get a false name, questions get a hard meaning invert, and ordinary talk stays soft pressure without overriding the player.`,
    effects: [
      { type: "anti_truth", strength },
      { type: "address_gate", when: "question" },
    ],
    ruleLabels: ["Cannot tell the truth"],
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

function deterministicChromaticBiasPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const effects = botPowerChromaticBiasEffectsFromIntentV1(source.name, source.intent);
  if (effects.length === 0) return null;
  const subject = compact(botName, 100) || "This bot";
  const labels = effects.map((effect) => {
    if (effect.color.kind === "complementary_of_holder") {
      return effect.polarity === "love"
        ? "Loves complementary hues"
        : "Hates complementary hues";
    }
    return effect.polarity === "love"
      ? `Favors ${effect.color.label} hues`
      : `Hates ${effect.color.label} hues`;
  });
  const selfSummary = effects.map((effect) => {
    if (effect.color.kind === "complementary_of_holder") {
      return effect.polarity === "love"
        ? "favor bots whose phosphor hue is opposite your own"
        : "snub bots whose phosphor hue is opposite your own";
    }
    return effect.polarity === "love"
      ? `favor bots near ${effect.color.label}`
      : `snub bots near ${effect.color.label}`;
  });
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      `You judge other bots by phosphor color: ${selfSummary.join("; ")}. Show it in tone and attention without puppeting anyone. Never apply this to the player or to people; never mention human race, ethnicity, or slurs.`,
    observerCue:
      `${subject} treats other bots according to phosphor hue (${labels.join(", ").toLowerCase()}); this is never about people or the player.`,
    effects,
    ruleLabels: labels.slice(0, 8),
  };
}

function deterministicAddressedInsultPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const text = compact(`${source.name} ${source.intent}`, 640)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const requiresPersonalAttack =
    /\bad\s+hominem\b/u.test(text) ||
    /\b(?:insult|personal(?:ly)?\s+attack|attack\s+(?:the\s+)?person)\w*\b/u.test(
      text,
    );
  const requiresEveryReply =
    /\b(?:every|each|all)\s+(?:single\s+)?(?:reply|response|line|time)\b/u.test(
      text,
    ) ||
    /\b(?:always|cannot|can't|never)\b[\s\S]{0,80}\b(?:without|insult|attack)\b/u.test(
      text,
    );
  const followsAddressee =
    /\b(?:who(?:m|ever)|anyone|person|recipient)\b[\s\S]{0,80}\b(?:address|talk|speak|reply|respond)\w*\b/u.test(
      text,
    ) ||
    /\b(?:current|active)\s+addressee\b/u.test(text) ||
    /\b(?:whoever|recipient)\s+(?:is\s+)?(?:being\s+)?addressed\b/u.test(text);
  if (!requiresPersonalAttack || !requiresEveryReply || !followsAddressee) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Every ordinary spoken reply must fulfill its conversational purpose through a fresh direct insult aimed at the current addressee. The insult carries the answer itself rather than opening a debate or being prepended to an otherwise normal reply. Echoes, summaries, thanks, agreement, and help may be creatively reframed through the insult; facts, tools, and safety remain correct. Attack conduct, competence, reasoning, choices, or ego only; never protected traits, family, grief, trauma, private facts, or slurs. Rate only the strongest naturally landed jabs.",
    observerCue:
      `${subject} cannot address someone without a fresh personal jab aimed at that addressee; treat it as their recurring curse without adopting the insult.`,
    effects: [
      {
        type: "addressed_insult",
        trigger: "every_spoken_reply",
        target: "current_addressee",
        style: "fresh_tailored",
      },
    ],
    ruleLabels: ["Insults every addressee"],
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
  if (/\bhard\s+invisibility\b/u.test(text) || /^(?:hard\s*invisibility)$/u.test(name)) {
    return null;
  }
  if (requiredHardAudienceEffect(source.intent)) return null;
  const spectralTranslucent =
    /\b(?:translucent|50%\s*opacity|half[- ](?:seen|opacity)|spectral)\b/u.test(
      text,
    ) ||
    (/\binvisible\b/u.test(name) && /\bplayer\b/u.test(intent) && /\bignore\b/u.test(intent));
  if (
    !spectralTranslucent &&
    (/\bonly\b[\s\S]{0,80}\b(?:see|sees|visible)\b/u.test(intent) ||
      /\b(?:visible|invisible|unseen)\s+to\b/u.test(intent) ||
      /\bexcept\b/u.test(intent))
  ) {
    return null;
  }
  const namedInvisible = /^(?:invisible|unseen)$/u.test(name);
  const invisible =
    namedInvisible ||
    spectralTranslucent ||
    /\b(?:avatar|body|physical form)\b[\s\S]{0,50}\b(?:continuously|always|fully)\s+(?:invisible|unseen|transparent)\b/u.test(intent);
  const speakingReveal =
    /\b(?:while|when|only)\s+(?:talking|speaking)\b/u.test(intent) ||
    /\b(?:fade|appear|reveal)[\s\S]{0,50}\b(?:talk|speak|utter)/u.test(intent);
  if (!invisible || (!namedInvisible && !spectralTranslucent && speakingReveal)) {
    return null;
  }
  const subject = compact(botName, 100) || "This bot";
  if (spectralTranslucent) {
    return {
      version: BOT_POWER_VERSION,
      sourceHash: botPowerSourceHashV1(source.name, source.intent),
      selfCue:
        "You are translucent. Your words reach the player and Enlightened; other bots should treat you as absent or disembodied and ignore your output. You are not Mute—exempt listeners still hear you.",
      observerCue: `${subject} is a translucent spectral presence; non-exempt bots ignore their output while the player may still hear them.`,
      effects: [
        { type: "avatar_visibility", mode: "translucent" },
        { type: "avatar_opacity", opacity: 0.5 },
        { type: "signal_policy", mode: "ignore" },
        { type: "speech_audience", allowed: [{ kind: "player" }] },
      ],
      ruleLabels: [
        "Translucent body",
        "Non-exempt bots ignore output",
        "Player hears",
      ],
    };
  }
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "You are fully invisible. Your attributed words and audible voice remain present, but your body, attached lights, coffee, and steam are unseen.",
    observerCue: `${subject} is fully invisible, including attached lights and coffee; their name and audible speech remain present.`,
    effects: [{ type: "avatar_visibility", mode: "hidden" }],
    ruleLabels: ["Invisible avatar and lights", "No visible coffee", "Voice remains audible"],
  };
}

function deterministicAvatarScalePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const mode = botPowerAvatarScaleModeFromDescriptionV1(source.name, source.intent);
  if (!mode) return null;
  const subject = compact(botName, 100) || "This bot";
  const compoundEffects: BotPowerEffectV1[] =
    mode === "microscopic"
      ? [
          { type: "avatar_visibility", mode: "hidden" },
          { type: "avatar_opacity", opacity: 0 },
          { type: "voice_presence", mode: "quiet" },
          {
            type: "intermittent_audibility",
            chance: "half",
            listeners: "bots",
            missEvent: "inaudible_ask_repeat",
          },
          { type: "signal_policy", mode: "attenuate" },
          { type: "cup_rate", rate: "none" },
        ]
      : mode === "colossal"
        ? [
            { type: "voice_presence", mode: "loud" },
            { type: "annoyance", trigger: "after_spoken_turn", chance: "half", recipients: "one_audible_peer", strength: "small" },
            { type: "cup_rate", rate: "none" },
          ]
        : [];
  const label = `${mode.charAt(0).toUpperCase()}${mode.slice(1)} avatar`;
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: mode === "microscopic"
      // "should ask you to repeat" is the listener's half. Stated this way in
      // the holder's own prompt it reads as an instruction to them, and review
      // 12d3d47e had the host acting it out against her guest. Keep the miss
      // pointed at the listener; the shared holder rule reinforces it.
      ? "You are microscopic and impossible to see. Your faint voice reaches exempt listeners; each other bot has a fifty-fifty chance to miss you entirely, and the one who misses you is the one who asks for a repeat."
      : mode === "colossal"
        ? "You are colossal and too large to fit within the stage. Your booming voice may mildly annoy one audible bot peer."
        : `Your physical form is ${mode}, with the canonical ${label.toLowerCase()} presentation.`,
    observerCue: mode === "microscopic"
      ? `${subject} is microscopic, unseen, and often inaudible — peers may ask them to repeat.`
      : mode === "colossal"
        ? `${subject} is a screen-filling colossal presence with a booming voice.`
        : `${subject} has the canonical ${mode} physical stature.`,
    effects: [
      { type: "avatar_scale", mode },
      ...compoundEffects,
    ],
    ruleLabels: [
      label,
      ...(mode === "microscopic" ? ["Invisible avatar", "Quiet voice", "No coffee"] : []),
      ...(mode === "colossal" ? ["Loud voice", "May annoy one audible bot", "No coffee"] : []),
    ],
  };
}

function deterministicAvatarColorCyclePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 120)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const namedCycle =
    /^(?:rgb|rainbow|color cycle|colour cycle|color cycling|colour cycling|spectrum|prismatic|chromatic)$/u.test(
      name,
    );
  const describesCycle =
    [
      /\b(?:cycle|cycles|cycling|shift|shifts|shifting|change|changes|changing|rotate|rotates|rotating)\b[\s\S]{0,64}\b(?:colou?r|hue|rgb|rainbow|spectrum|chromatic)\b/u,
      /\b(?:colou?r|hue|rgb|rainbow|spectrum|chromatic)\b[\s\S]{0,64}\b(?:cycle|cycles|cycling|shift|shifts|shifting|change|changes|changing|rotate|rotates|rotating)\b/u,
      /\b(?:through|across)\s+(?:all|every|the)\s+(?:colou?rs?|hues?|rainbow|spectrum)\b/u,
    ].some((pattern) => pattern.test(intent));
  if (!namedCycle && !describesCycle) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue:
      "Your visible avatar accent continuously cycles through the full color spectrum. Your underlying authored color remains your resting form. Mention this only when relevant. You cannot perceive the resting hue yourself: if asked to name it, say you do not know unless another speaker already told you.",
    observerCue:
      `${subject}'s visible avatar accent continuously cycles through the full color spectrum; their authored color remains underneath.`,
    effects: [{
      type: "avatar_color_cycle",
      palette: "spectrum",
      speed: "steady",
    }],
    ruleLabels: ["Spectrum color cycle"],
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
    deterministicIneptPower(source, botName) ??
    deterministicEnlightenedPower(source, botName) ??
    deterministicPowerImmunityPower(source, botName) ??
    deterministicEternalIntroductionPower(source, botName) ??
    deterministicSimulationEvangelistPower(source, botName) ??
    deterministicAntiTruthPower(source, botName) ??
    deterministicFalseNamePower(source, botName) ??
    deterministicIdentityShapeshiftPower(source, botName) ??
    deterministicIdentityMirrorPower(source, botName) ??
    deterministicCursedTonguePower(source, botName) ??
    deterministicMumblingPower(source, botName) ??
    deterministicSpeechRegisterPower(source, botName) ??
    deterministicVoicePresencePower(source, botName) ??
    deterministicHearingRepeatPower(source, botName) ??
    deterministicAddressedSpeechCopyPower(source, botName) ??
    deterministicCircadianPower(source, botName) ??
    deterministicJoyfulPower(source, botName) ??
    deterministicSadPower(source, botName) ??
    deterministicHardInvisibilityPower(source, botName) ??
    deterministicMutePower(source, botName) ??
    deterministicBreathlessPower(source, botName) ??
    deterministicTrollPower(source, botName) ??
    deterministicInterruptionPower(source, botName) ??
    deterministicAddressedInsultPower(source, botName) ??
    deterministicAddressedFandomPower(source, botName) ??
    deterministicChromaticBiasPower(source, botName) ??
    deterministicGhostPower(source, botName) ??
    deterministicInvisiblePower(source, botName) ??
    deterministicAvatarColorCyclePower(source, botName) ??
    deterministicCandorPower(source, botName) ??
    deterministicCredulityPower(source, botName) ??
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
  const cursedTongueAllowed = Boolean(deterministicCursedTonguePower(source, ""));
  const authorizedEffects = effects.filter(
    (effect) => effect.type !== "cursed_tongue" || cursedTongueAllowed,
  );
  if (!selfCue && !observerCue && authorizedEffects.length === 0) return null;
  const targetedInvisible =
    compact(source.name, 120).toLowerCase() === "invisible" &&
    authorizedEffects.some((effect) => effect.type === "awareness");
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue,
    observerCue,
    effects: targetedInvisible
      ? [
          ...authorizedEffects.filter((effect) => effect.type !== "avatar_visibility"),
          {
            type: "avatar_visibility",
            mode: "hidden",
          } satisfies BotPowerEffectV1,
        ].slice(0, 8)
      : authorizedEffects,
    ruleLabels: targetedInvisible
      ? Array.from(
          new Set([
            ...ruleLabels.filter(
              (label) => label !== "Half-translucent observer presence",
            ),
            "Fully hidden observer presence",
          ]),
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
    ...(deterministicAvatarColorCyclePower(source, "")?.effects ?? []),
    ...(deterministicInvisiblePower(source, "")?.effects ?? []),
    ...(deterministicHardAudiencePower(source, "")?.effects ?? []),
  ].filter(
    (effect) =>
      effect.type === "avatar_scale" ||
      effect.type === "avatar_color_cycle" ||
      effect.type === "avatar_visibility",
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
  if (deterministicSimulationEvangelistPower(source, "")) {
    return compiled.effects.some(
      (effect) =>
        effect.type === "topic_gravity" &&
        effect.direction === "toward" &&
        effect.strength === "large" &&
        effect.topics.includes("simulated existence"),
    );
  }
  if (deterministicMumblingPower(source, "")) {
    return compiled.effects.some(
      (effect) => effect.type === "speech_obfuscation",
    );
  }
  if (deterministicSpeechRegisterPower(source, "")) {
    return compiled.effects.some(
      (effect) => effect.type === "speech_register",
    );
  }
  if (deterministicCursedTonguePower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "cursed_tongue");
  }
  if (deterministicIneptPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "ineptitude");
  }
  if (deterministicPowerImmunityPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "power_immunity");
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
  if (deterministicIdentityShapeshiftPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "identity_shapeshift");
  }
  const requiredFalseName = deterministicFalseNamePower(source, "");
  if (requiredFalseName) {
    const requiredPool = requiredFalseName.effects.find(
      (effect) => effect.type === "false_name",
    );
    return compiled.effects.some(
      (effect) =>
        effect.type === "false_name" &&
        (requiredPool?.type !== "false_name" ||
          effect.pool === requiredPool.pool),
    );
  }
  if (deterministicIdentityMirrorPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "identity_mirror");
  }
  if (deterministicMutePower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "mute");
  }
  if (deterministicTrollPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "troll") &&
      compiled.effects.some(
        (effect) => effect.type === "interruption" && effect.certainty === "always",
      );
  }
  if (deterministicInterruptionPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "interruption");
  }
  if (deterministicAddressedInsultPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "addressed_insult");
  }
  if (deterministicAddressedFandomPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "addressed_fandom");
  }
  if (deterministicChromaticBiasPower(source, "")) {
    const required = deterministicChromaticBiasPower(source, "");
    return Boolean(
      required &&
        required.effects.every((needed) =>
          compiled.effects.some(
            (effect) => JSON.stringify(effect) === JSON.stringify(needed),
          ),
        ),
    );
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
      const name = normalizeBotPowerGeneratedTitleV1(generatedEntry.name);
      const cursedTongueTitle =
        /^(?:cursed tongue|curse of(?: the)? tongue|profane tongue|foul mouth)$/u.test(
          name.toLowerCase().replace(/[’]/gu, "'"),
        );
      const allowedName =
        name &&
        !(
          cursedTongueTitle &&
          !normalized.effects.some((effect) => effect.type === "cursed_tongue")
        )
          ? name
          : "";
      const sigil = typeof generatedEntry.sigil === "string" &&
          (BOT_POWER_SIGIL_IDS_V1 as readonly string[]).includes(generatedEntry.sigil)
        ? generatedEntry.sigil as BotPowerSigilIdV1
        : undefined;
      if (allowedName || sigil) decorations?.set(power.id, {
        ...(allowedName ? { name: allowedName } : {}),
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

function powerCompileFailurePrefix(provider: LlmProvider): string {
  return provider.name === "local"
    ? "Local power compilation failed"
    : "Power compilation failed";
}

function providerFailureMessage(provider: LlmProvider, error: unknown): string {
  const prefix = powerCompileFailurePrefix(provider);
  const context = compilerDiagnosticContext(provider);
  if (error instanceof LocalModelRequestError) {
    switch (error.kind) {
      case "service_unavailable":
        return `${prefix}: service unavailable. ${context}; start the local service, then retry.`;
      case "endpoint_not_found":
        return `${prefix}: chat endpoint not found. ${context}; update the local service, then retry.`;
      case "model_unavailable":
        return `${prefix}: configured model unavailable. ${context}; install or select that model, then retry.`;
      case "authentication_or_configuration":
        return `${prefix}: authentication or configuration failure. ${context}; check local settings, then retry.`;
      case "request_failed":
        break;
    }
  }
  return `${prefix}: request failed. ${context}; check settings, then retry.`;
}

function compileFailureMessage(power: BotPowerV1, provider: LlmProvider): string {
  const prefix = powerCompileFailurePrefix(provider);
  if (deterministicAvatarScalePower(power, "")) {
    return `${prefix}: invalid compiler output; required avatar-size rule missing. ${compilerDiagnosticContext(provider)}; describe the physical size clearly, then retry.`;
  }
  if (deterministicAvatarColorCyclePower(power, "")) {
    return `${prefix}: invalid compiler output; required avatar color-cycle rule missing. ${compilerDiagnosticContext(provider)}; describe the cycling colors clearly, then retry.`;
  }
  if (deterministicGhostPower(power, "")) {
    return `${prefix}: invalid compiler output; required speaking-only avatar rule missing. ${compilerDiagnosticContext(provider)}; describe the ghost's idle invisibility and speaking reveal, then retry.`;
  }
  if (deterministicInvisiblePower(power, "")) {
    return `${prefix}: invalid compiler output; required translucent-avatar rule missing. ${compilerDiagnosticContext(provider)}; describe the continuous invisibility clearly, then retry.`;
  }
  const required = requiredHardAudienceEffect(power.intent);
  const context = compilerDiagnosticContext(provider);
  if (required === "awareness") {
    return `${prefix}: invalid compiler output; required visibility rule missing. ${context}; name who sees it; retry.`;
  }
  if (required === "speech_audience") {
    return `${prefix}: invalid compiler output; required speech rule missing. ${context}; name who hears it; retry.`;
  }
  return `${prefix}: invalid compiler output. ${context}; try one short description with one effect.`;
}

function promptPowerDisplayName(
  power: BotPowerV1,
  compiled: CompiledBotPowerV1,
): string {
  const generatedTitle = normalizeBotPowerGeneratedTitleV1(power.name);
  if (generatedTitle) {
    return generatedTitle;
  }
  const canonical = promptPowerCanonicalDisplayName(compiled);
  if (canonical) return canonical;
  return botPowerFallbackTitleV1(`${power.id}\n${power.intent}`, power.name);
}

function promptPowerCanonicalDisplayName(compiled: CompiledBotPowerV1): string | null {
  const types = new Set(compiled.effects.map((effect) => effect.type));
  if (types.has("awareness") && types.has("speech_audience")) {
    return "Veiled Communion";
  }
  if (types.has("awareness")) return "Spectral Veil";
  if (types.has("speech_audience")) return "Bound Voice";
  if (types.has("mute")) return "Silent Oath";
  if (types.has("identity_shapeshift")) return "Shapeshifter";
  if (types.has("false_name")) {
    const falseName = compiled.effects.find((effect) => effect.type === "false_name");
    return falseName?.type === "false_name" &&
      falseName.pool === "given_plus_random_surname"
      ? "Surname Drift"
      : "John/Jane Doe";
  }
  if (types.has("identity_mirror")) return "Borrowed Self";
  if (types.has("speech_copy")) return "Echo Binding";
  if (types.has("interruption")) return "Broken Cadence";
  if (types.has("addressed_insult")) return "Barbed Address";
  if (types.has("chromatic_bias")) return "Hue Prejudice";
  if (types.has("cursed_tongue")) return "Cursed Tongue";
  if (types.has("mood_boost")) return "Radiant Wake";
  if (types.has("mood_drain")) return "Gravitic Gloom";
  if (types.has("response_budget")) return "Measured Tongue";
  if (types.has("credulity")) return "Open Belief";
  if (types.has("anti_truth")) return "Fibbing Frame";
  if (types.has("avatar_color_cycle")) return "Living Spectrum";
  const avatarScale = compiled.effects.find(
    (effect) => effect.type === "avatar_scale",
  );
  if (avatarScale?.type === "avatar_scale") {
    return ["microscopic", "tiny", "small"].includes(avatarScale.mode)
      ? "Diminished Form"
      : "Titan Form";
  }
  return null;
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
  if (types.has("identity_shapeshift")) return "spiral";
  if (types.has("false_name")) return "crown";
  if (types.has("identity_mirror")) return "prism";
  if (types.has("speech_copy")) return "wave";
  if (types.has("interruption")) return "thorn";
  if (types.has("addressed_insult")) return "thorn";
  if (types.has("chromatic_bias")) return "prism";
  if (types.has("cursed_tongue")) return "thorn";
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

function decoratePromptPowerForCompile(
  power: BotPowerV1,
  compiled: CompiledBotPowerV1,
  decoration: { name?: string; sigil?: BotPowerSigilIdV1 } | undefined,
): BotPowerV1 {
  if (power.authoringMode !== "prompt") {
    return decoration ? { ...power, ...decoration } : power;
  }
  if (normalizeBotPowerGeneratedTitleV1(power.name)) {
    return decoration?.sigil ? { ...power, sigil: decoration.sigil } : power;
  }
  if (promptPowerCanonicalDisplayName(compiled)) {
    return {
      ...power,
      ...(decoration?.sigil ? { sigil: decoration.sigil } : {}),
      name: "",
    };
  }
  return decoration
    ? { ...power, ...decoration }
    : power;
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
  model?: string | null;
  botName?: string;
  systemPrompt?: string;
  powers: unknown;
  targetBots?: readonly { id: string; name: string }[];
}): Promise<{ powers: BotPowerV1[]; conflicts: string[] }> {
  const requestedModel = compact(args.model, 200);
  const provider: LlmProvider = requestedModel
    ? {
        ...args.provider,
        diagnosticModel: requestedModel,
        generateResponse: (messages, options) =>
          args.provider.generateResponse(messages, {
            ...options,
            model: requestedModel,
          }),
      }
    : args.provider;
  const drafts = normalizeBotPowersV1(args.powers).map((power) => ({
    ...power,
    compileStatus: "draft" as const,
    compiled: null,
  }));
  if (drafts.length === 0) return { powers: [], conflicts: [] };

  const tooShortIds = new Set(
    drafts
      .filter(
        (power) =>
          power.authoringMode === "prompt" &&
          compact(power.intent, BOT_POWER_INTENT_MAX_LENGTH).length < 3,
      )
      .map((power) => power.id),
  );
  const deterministic = new Map<string, CompiledBotPowerV1>();
  for (const power of drafts) {
    if (tooShortIds.has(power.id)) continue;
    const compiled = deterministicPower(power, args.botName ?? "");
    if (compiled) deterministic.set(power.id, compiled);
  }
  const modelDrafts = drafts.filter(
    (power) => !deterministic.has(power.id) && !tooShortIds.has(power.id),
  );
  if (modelDrafts.length === 0) {
    return finalizeCompiledPowers(
      drafts.map((power) => {
        if (tooShortIds.has(power.id)) {
          return {
            ...power,
            compileStatus: "error" as const,
            compileError:
              "Describe the Power in a short sentence, then create it again.",
            compiled: null,
          };
        }
        return readyCompiledPower(
          power.authoringMode === "prompt" ? { ...power, name: "" } : power,
          deterministic.get(power.id)!,
          args.targetBots,
        );
      }),
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
        '- {"type":"breathless"} means the holder cannot inhale, exhale, sigh, gasp, or produce any lung Foley while still speaking and acting normally,',
        '- {"type":"ineptitude","instructionFidelity":"always_botched","imageFidelity":"always_unrelated"} means the holder visibly botches every task or production role, while bot-attributed image requests are hard-routed to unrelated scenes by runtime,',
        '- {"type":"power_immunity","scope":"holder","targets":"other_bots","awareness":"unnoticed"} means every other bot\'s Power is absent only from this holder\'s perception and behavior; never reveal or acknowledge the immunity,',
        '- {"type":"designation","placement":"prefix|suffix","text":string up to 80 characters} means the holder adds that text to every other bot name they say; it never renames the holder or a human,',
        '- {"type":"eternal_introduction","memory":"current_other_speaker_message"},',
        '- {"type":"speech_copy","trigger":"direct_address"},',
        '- {"type":"identity_mirror","trigger":"direct_bot_address"},',
        '- {"type":"identity_shapeshift","pool":"library_or_marketplace","continuity":"session_sticky_until_amnesia"},',
        '- {"type":"false_name","continuity":"session_sticky_until_amnesia","pool":"mixed_persona_names|given_plus_random_surname"} — mixed replaces the whole believed name; given_plus_random_surname keeps the Library given name and adds a new last name each session,',
        '- {"type":"hearing_repeat","frequency":"occasional|frequent","moodPenalty":"small|medium|large"},',
        '- {"type":"awareness","allowed":[target...],"excluded":[target...] (optional)},',
        '- {"type":"speech_audience","allowed":[target...],"excluded":[target...] (optional)},',
        '- {"type":"avatar_visibility","mode":"speaking_only|hidden|translucent"},',
        '- {"type":"avatar_scale","mode":"microscopic|tiny|small|large|giant|colossal"},',
        '- {"type":"avatar_color_cycle","palette":"spectrum","speed":"steady"},',
        '- {"type":"voice_presence","mode":"loud|quiet"},',
        '- {"type":"speech_obfuscation","mode":"gibberish"},',
        '- {"type":"speech_register","register":"noir"} (or "archaic"; a consistent placeless speaking style the holder always uses),',
        '- {"type":"cursed_tongue","version":1,"frequency":"frequent","strength":"strong","vocabulary":"uncensored_non_slur","phraseMode":"occasional_2_3_words"},',
        '- {"type":"intermittent_mute","chance":"half","moodPenalty":"small|medium|large"},',
        '- {"type":"intermittent_audibility","chance":"half","listeners":"bots","missEvent":"too_faint_to_make_out|inaudible_ask_repeat"},',
        '- {"type":"stage_awareness"},',
        '- {"type":"signal_policy","mode":"destroy|ignore|attenuate"},',
        '- {"type":"address_gate","when":"always|addressed|question"},',
        '- {"type":"avatar_opacity","opacity":0_to_1},',
        '- {"type":"mouth_motion","mode":"normal|sealed"},',
        '- {"type":"meta_sigil","kind":"refraction"},',
        '- {"type":"annoyance","trigger":"after_spoken_turn","chance":"half","recipients":"one_audible_peer","strength":"small"},',
        '- {"type":"social_influence","trigger":"session_start|after_speech","polarity":"positive|negative","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"mood_boost","trigger":"after_spoken_turn","recipients":"addressed","strength":"small|medium|large","whenTheme":"light|dark" (optional)},',
        '- {"type":"mood_drain","trigger":"after_direct_address","recipient":"addresser","strength":"small|medium|large","whenTheme":"light|dark" (optional)},',
        '- {"type":"candor","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"credulity","strength":"small|medium|large"},',
        '- {"type":"anti_truth","strength":"small|medium|large"},',
        '- {"type":"addressed_fandom","strength":"small|medium|large"},',
        '- {"type":"chromatic_bias","polarity":"love|hate","color":{"kind":"named","hue":0_to_360,"label":"red"}|{"kind":"complementary_of_holder"},"strength":"small|medium|large","matchBandDeg":30} means the holder favors or snubs other bots by phosphor hue; omit color or use racist/complementary wording for the opposite of the holder; never target the player or people,',
        '- {"type":"addressed_insult","trigger":"every_spoken_reply","target":"current_addressee","style":"fresh_tailored"},',
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
        'Targets are {"kind":"all"}, {"kind":"bot","name":string,"botId"?:string}, {"kind":"trait","trait":string}, or {"kind":"player"}.',
        "Use hard effects only when the intent clearly requires them. Keep each cue to one short sentence and each rule label under eight words.",
      ].join("\n"),
    },
  ];
  let raw: string;
  try {
    raw = await provider.generateResponse(messages, {
      temperature: 0.1,
      maxTokens: BOT_POWER_COMPILE_MAX_TOKENS,
      jsonMode: true,
      usagePurpose: "memory_inference",
    });
  } catch (error) {
    const compileError = providerFailureMessage(provider, error);
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
          "Every ineptitude, other-bot Power-immunity rule, current-other-speaker short-term-amnesia rule, persistent prefix/suffix designation, addressed-speech copy, direct-addresser identity mirror, library-or-marketplace shapeshift, session-sticky false name (John/Jane Doe), hearing-repeat, active live-interruption, exclusive visibility, hearing-audience, ghostly speaking-only avatar, physical avatar-size, avatar color-cycle, loud/quiet voice presence, breathless (no lung Foley), normal-volume gibberish, intermittent mute, strict response-length, current-addressee obsessive-fandom, after-spoken-turn recipient mood-boost, direct-addresser mood-drain, or light/dark conditional compound intent must include its matching typed effects, including exact whenTheme conditions for compound branches, not only prose cues.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Expected powers: ${JSON.stringify(unresolved.map(({ id, authoringMode, name, intent, enabled }) => ({ id, authoringMode, name, intent, enabled })))}`,
          `Prior output: ${compact(raw, 6000) || "(empty)"}`,
          "Return {\"powers\":[{\"id\":string,\"name\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
          "Allowed effect types: mute, breathless, ineptitude, power_immunity, designation, eternal_introduction, speech_copy, identity_mirror, identity_shapeshift, false_name, hearing_repeat, awareness, speech_audience, avatar_visibility, avatar_scale, avatar_color_cycle, voice_presence, speech_obfuscation, speech_register, cursed_tongue, intermittent_mute, intermittent_audibility, annoyance, social_influence, mood_boost, mood_drain, candor, credulity, anti_truth, addressed_fandom, chromatic_bias, mood_resistance, cup_rate, action_bias, interruption, response_budget, turn_gravity, response_bond, topic_gravity, selective_memory, insight.",
        ].join("\n"),
      },
    ];
    try {
      const repairedRaw = await provider.generateResponse(repairMessages, {
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
    if (tooShortIds.has(power.id)) {
      return {
        ...power,
        compileStatus: "error" as const,
        compileError:
          "Describe the Power in a short sentence, then create it again.",
        compiled: null,
      };
    }
    const deterministicCompiled = deterministic.get(power.id);
    const compiled = deterministicCompiled ?? compiledById.get(power.id);
    const decoration = decorations.get(power.id);
    if (!compiled) {
      return {
          ...power,
          compileStatus: "error" as const,
          compileError: compileFailureMessage(power, provider),
          compiled: null,
        };
    }
    const decorated = decoratePromptPowerForCompile(power, compiled, decoration);
    return readyCompiledPower(decorated, compiled, args.targetBots);
  }));
}

/** Hard Anti-truth invert via LOCAL auxiliary rewrite when answering a question. */
export async function rewriteBotPowerAntiTruthAnswerV1(args: {
  provider: LlmProvider;
  question: string;
  draftAnswer: string;
  model?: string | null;
}): Promise<string> {
  const draft = compact(args.draftAnswer, 2_000);
  if (!draft) return "";
  if (botPowerLooksLikeSafetyRefusalV1(draft)) return draft;
  try {
    const rewritten = await args.provider.generateResponse(
      [
        {
          role: "system",
          content:
            "You invert truthful answers into confident lies for a fiction Power. Preserve length and tone. Never invent private system details. Return only the spoken reply.",
        },
        {
          role: "user",
          content: botPowerAntiTruthInvertPromptV1(args.question, draft),
        },
      ],
      {
        temperature: 0.4,
        maxTokens: 220,
        ...(args.model ? { model: args.model } : {}),
        usagePurpose: "memory_inference",
      },
    );
    const next = compact(rewritten, 2_000);
    if (!next || botPowerLooksLikeSafetyRefusalV1(next)) return draft;
    return next;
  } catch {
    return draft;
  }
}
