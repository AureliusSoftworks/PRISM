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
    const compiled = deterministicHardAudiencePower(power, args.botName ?? "");
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
        '- {"type":"awareness","allowed":[target...]},',
        '- {"type":"speech_audience","allowed":[target...]},',
        '- {"type":"social_influence","trigger":"session_start|after_speech","polarity":"positive|negative","strength":"small|medium|large","targets":[target...]},',
        '- {"type":"mood_resistance","polarity":"positive|negative|both","strength":"small|medium|large"},',
        '- {"type":"cup_rate","rate":"slow|fast|very_fast"},',
        '- {"type":"action_bias","cue":string,"frequency":"occasional|frequent"}.',
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
          "Every exclusive visibility or hearing intent must include its matching awareness or speech_audience effect, not only prose cues.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Expected powers: ${JSON.stringify(unresolved.map(({ id, name, intent, enabled }) => ({ id, name, intent, enabled })))}`,
          `Prior output: ${compact(raw, 6000) || "(empty)"}`,
          "Return {\"powers\":[{\"id\":string,\"name\":string,\"selfCue\":string,\"observerCue\":string,\"effects\":[],\"ruleLabels\":string[]}]}",
          "Allowed effect types: awareness, speech_audience, social_influence, mood_resistance, cup_rate, action_bias.",
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
