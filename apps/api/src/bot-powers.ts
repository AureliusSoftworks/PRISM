import {
  BOT_POWER_VERSION,
  botPowerSourceHashV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowersV1,
  type BotPowerEffectV1,
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

function deterministicHardAudiencePower(
  source: BotPowerV1,
  botName: string
): CompiledBotPowerV1 | null {
  const required = requiredHardAudienceEffect(source.intent);
  if (!required) return null;
  const names = audienceNamesForIntent(source.intent, required);
  if (names.length === 0) return null;
  const audience = names.join(", ");
  const subject = compact(botName, 100) || "This bot";
  const visibility = required === "awareness";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: visibility
      ? `Remain unseen to everyone except ${audience}.`
      : `Address only ${audience}.`,
    observerCue: visibility
      ? `Only ${audience} can perceive ${subject}.`
      : `Only ${audience} can hear ${subject}.`,
    effects: [{
      type: required,
      allowed: names.map((name) => ({ kind: "bot" as const, name })),
    }],
    ruleLabels: [visibility ? `Visible only to ${audience}` : `Heard only by ${audience}`],
  };
}

function deterministicMutePower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyMuted = /^(?:mute|muted|silence)$/u.test(name) || [
    /\b(?:is|becomes?|remains?|render(?:ed)?|make|makes)\s+(?:completely\s+|fully\s+)?muted\b/u,
    /\bmuted?\s+(?:bot|voice|speech)\b/u,
    /\bmutes?\s+(?:this|the)\s+bot\b/u,
    /\b(?:can(?:not|'t)|never|does\s+not|doesn't)\s+(?:speak|talk|say\s+anything|make\s+a\s+sound)\b/u,
    /\bvoice\s+(?:can(?:not|'t)|will\s+never|is\s+never)\s+be\s+heard\b/u,
    /\bonly\s+(?:responds?|replies?)\s+(?:with|in)\s+(?:an?\s+)?(?:ellipsis|\.\.\.)(?:\s|$)/u,
  ].some((pattern) => pattern.test(intent));
  if (!explicitlyMuted) return null;
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

function deterministicEchoAddressedPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  const name = compact(source.name, 80).toLowerCase();
  const intent = compact(source.intent, 500)
    .toLowerCase()
    .replace(/[’]/gu, "'");
  const explicitlyEchoesAddressedSpeech =
    /^(?:echo|echoes|parrot|parroting)$/u.test(name) ||
    [
      /\b(?:echo(?:es|ing)?|repeat(?:s|ing)?|parrot(?:s|ing)?)\s+(?:back\s+)?(?:exactly\s+|verbatim\s+)?(?:whatever|everything|anything|what|the\s+words?)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
      /\b(?:echo(?:es|ing)?|repeat(?:s|ing)?|parrot(?:s|ing)?)\b[\s\S]*\b(?:word[ -]for[ -]word|verbatim|exactly)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
      /\b(?:can|may)\s+only\s+(?:echo|repeat|parrot)\b[\s\S]*\b(?:addressed|said|spoken|asked|told)\b/u,
    ].some((pattern) => pattern.test(intent));
  if (!explicitlyEchoesAddressedSpeech) return null;
  const subject = compact(botName, 100) || "This bot";
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue: "Repeat the latest speech addressed to you verbatim. Say nothing else.",
    observerCue: `${subject} can only echo the latest speech addressed to them; the sender may react with confusion.`,
    effects: [{ type: "echo_addressed" }],
    ruleLabels: ["Echoes addressed speech"],
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

function deterministicPower(
  source: BotPowerV1,
  botName: string,
): CompiledBotPowerV1 | null {
  return (
    deterministicHearingRepeatPower(source, botName) ??
    deterministicEchoAddressedPower(source, botName) ??
    deterministicMutePower(source, botName) ??
    deterministicGhostPower(source, botName) ??
    deterministicHardAudiencePower(source, botName) ??
    deterministicCandorPower(source, botName) ??
    deterministicIntimidationPower(source, botName) ??
    deterministicGradualMoodPower(source, botName) ??
    deterministicCoffeeDislikePower(source, botName)
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
  return {
    version: BOT_POWER_VERSION,
    sourceHash: botPowerSourceHashV1(source.name, source.intent),
    selfCue,
    observerCue,
    effects,
    ruleLabels,
  };
}

function compiledEntrySatisfiesIntent(
  compiled: CompiledBotPowerV1,
  source: BotPowerV1
): boolean {
  if (deterministicHearingRepeatPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "hearing_repeat");
  }
  if (deterministicEchoAddressedPower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "echo_addressed");
  }
  if (deterministicMutePower(source, "")) {
    return compiled.effects.some((effect) => effect.type === "mute");
  }
  if (deterministicGhostPower(source, "")) {
    return compiled.effects.some(
      (effect) =>
        effect.type === "avatar_visibility" && effect.mode === "speaking_only",
    );
  }
  const required = requiredHardAudienceEffect(source.intent);
  return !required || compiled.effects.some((effect) => effect.type === required);
}

function normalizedMatchText(value: unknown): string {
  return compact(value, 100).toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function compiledEntriesByDraft(
  drafts: readonly BotPowerV1[],
  generated: readonly unknown[]
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
    usedIndexes.add(generatedIndex);
    compiled.set(power.id, normalized);
  }
  return compiled;
}

function hardAudienceSignature(effect: BotPowerEffectV1): string | null {
  if (effect.type !== "awareness" && effect.type !== "speech_audience") return null;
  const targets = effect.allowed.map((target) => JSON.stringify(target)).sort();
  return `${effect.type}:${targets.join("|")}`;
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
  if (deterministicGhostPower(power, "")) {
    return `Local power compilation failed: invalid compiler output; required speaking-only avatar rule missing. ${compilerDiagnosticContext(provider)}; describe the ghost's idle invisibility and speaking reveal, then retry.`;
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

export async function compileBotPowers(args: {
  provider: LlmProvider;
  botName?: string;
  systemPrompt?: string;
  powers: unknown;
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
    return finalizeCompiledPowers(drafts.map((power) => ({
      ...power,
      compileStatus: "ready" as const,
      compiled: deterministic.get(power.id)!,
    })));
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
        `Powers: ${JSON.stringify(modelDrafts.map(({ id, name, intent, enabled }) => ({ id, name, intent, enabled })))}`,
        "Return {\"powers\":[{\"id\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
        "Allowed effects only:",
        '- {"type":"mute"},',
        '- {"type":"echo_addressed"},',
        '- {"type":"hearing_repeat","frequency":"occasional|frequent","moodPenalty":"small|medium|large"},',
        '- {"type":"awareness","allowed":[target...]},',
        '- {"type":"speech_audience","allowed":[target...]},',
        '- {"type":"avatar_visibility","mode":"speaking_only"},',
        '- {"type":"social_influence","trigger":"session_start|after_speech","polarity":"positive|negative","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"candor","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"mood_resistance","polarity":"positive|negative|both","strength":"small|medium|large"},',
        '- {"type":"cup_rate","rate":"none|slow|fast|very_fast"},',
        '- {"type":"action_bias","cue":string,"frequency":"occasional|frequent"},',
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
        ? { ...power, compileStatus: "ready" as const, compiled: deterministicPower }
        : {
            ...power,
            compileStatus: "error" as const,
            compileError,
            compiled: null,
          };
    }));
  }

  const compiledById = compiledEntriesByDraft(modelDrafts, generatedPowerEntries(raw));
  const unresolved = modelDrafts.filter((power) => !compiledById.has(power.id));
  if (unresolved.length > 0) {
    const repairMessages: ProviderMessage[] = [
      {
        role: "system",
        content: [
          "Repair malformed PRISM Power compiler output.",
          "Reply with JSON only and preserve the supplied power IDs exactly.",
          "Every hard echo, hearing-repeat, exclusive visibility, hearing-audience, or ghostly speaking-only avatar intent must include its matching echo_addressed, hearing_repeat, awareness, speech_audience, or avatar_visibility effect, not only prose cues.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Expected powers: ${JSON.stringify(unresolved.map(({ id, name, intent, enabled }) => ({ id, name, intent, enabled })))}`,
          `Prior output: ${compact(raw, 6000) || "(empty)"}`,
          "Return {\"powers\":[{\"id\":string,\"name\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
          "Allowed effect types: mute, echo_addressed, hearing_repeat, awareness, speech_audience, avatar_visibility, social_influence, candor, mood_resistance, cup_rate, action_bias, turn_gravity, response_bond, topic_gravity, selective_memory, insight.",
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
      const repaired = compiledEntriesByDraft(unresolved, generatedPowerEntries(repairedRaw));
      for (const [id, compiled] of repaired) compiledById.set(id, compiled);
    } catch {
      // Keep deterministic and successfully compiled powers; the unresolved entries report errors below.
    }
  }

  return finalizeCompiledPowers(drafts.map((power) => {
    const compiled = deterministic.get(power.id) ?? compiledById.get(power.id);
    return compiled
      ? { ...power, compileStatus: "ready" as const, compiled }
      : {
          ...power,
          compileStatus: "error" as const,
          compileError: compileFailureMessage(power, args.provider),
          compiled: null,
        };
  }));
}
