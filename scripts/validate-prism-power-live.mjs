#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import {
  applyBotPowerAddressedInsultV1,
  applyBotIdentityMirrorResponseV1,
  applyBotPowerEchoResponseV1,
  applyBotPowerCursedTongueResponseV1,
  applyBotPowerMumbledResponseV1,
  applyBotPowerResponseBudgetV1,
  applyBotPowerTrollTurnV1,
  botPowerCursesSpeechV1,
  botPowerIneptitudeFinalTurnCueV1,
  botPowerIneptUserPromptV1,
  botPowerIsAddressedQuestionV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerMumblesSpeechV1,
  botPowerRequiresAddressedInsultV1,
  botPowerSourceHashV1,
  botIdentityMirrorHolderPromptV1,
  createBotIdentityMirrorStateV1,
  resolveBotAudioVoiceProfileV1,
  resolveBotIdentityMirrorVoiceV1,
  resolveBotPronunciationMapPointV1,
  strongestBotPowerAntiTruthEffectV1,
  strongestHardBotPowerResponseBudgetEffectV1,
} from "@localai/shared";
import { rewriteBotPowerAntiTruthAnswerV1 } from "../apps/api/src/bot-powers.ts";
import {
  LocalOllamaProvider,
  OPENAI_DEFAULT_MODEL,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const bundleArgument = flagValue("--bundle");
const input = flagValue("--input")?.trim();
const providerName = flagValue("--provider")?.trim().toLowerCase() || "local";
const model = flagValue("--model")?.trim() ||
  (providerName === "openai" ? OPENAI_DEFAULT_MODEL : "llama3.2");
const mode = flagValue("--mode")?.trim().toLowerCase() || "chat";
const reasoningEffort = flagValue("--effort")?.trim().toLowerCase() || null;
const maxTokens = Number(flagValue("--max-tokens") ?? "220");
const trollStableTurnKey =
  flagValue("--troll-stable-turn-key")?.trim() || "live-validation:troll:2";
const believedName = flagValue("--believed-name")?.trim() || null;
const identityColor = flagValue("--identity-color")?.trim() || null;
const identityMirrorTargetName =
  flagValue("--identity-mirror-target-name")?.trim() || null;
const identityMirrorTargetPersona =
  flagValue("--identity-mirror-target-persona")?.trim() || null;
const syntheticCursedTongue = process.argv.includes("--synthetic-cursed-tongue");
const syntheticTroll = process.argv.includes("--synthetic-troll");

if (
  (!bundleArgument && !syntheticCursedTongue && !syntheticTroll) ||
  !input ||
  !["chat", "zen"].includes(mode) ||
  !["local", "openai"].includes(providerName) ||
  !Number.isInteger(maxTokens) ||
  maxTokens < 64 ||
  maxTokens > 8_000 ||
  Boolean(identityMirrorTargetName) !== Boolean(identityMirrorTargetPersona) ||
  (reasoningEffort &&
    !["minimal", "low", "medium", "high", "xhigh"].includes(reasoningEffort))
) {
  throw new Error(
    "Usage: validate-prism-power-live.mjs (--bundle PATH | --synthetic-cursed-tongue | --synthetic-troll) --input TEXT [--mode chat|zen] [--provider local|openai] [--model MODEL] [--effort minimal|low|medium|high|xhigh] [--max-tokens 64..8000] [--troll-stable-turn-key KEY] [--believed-name NAME] [--identity-color HEX] [--identity-mirror-target-name NAME --identity-mirror-target-persona PERSONA]",
  );
}
if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

const syntheticCursedTonguePower = {
  version: 1,
  id: "cursed-tongue-live-validation",
  name: "Cursed Tongue",
  intent: "Everything they say is vulgar.",
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Cursed Tongue",
      "Everything they say is vulgar.",
    ),
    selfCue: "Draft fully natural clean speech only.",
    observerCue: "Only the adjusted public wording is heard.",
    effects: [{
      type: "cursed_tongue",
      version: 1,
      frequency: "frequent",
      strength: "strong",
      vocabulary: "uncensored_non_slur",
      phraseMode: "occasional_2_3_words",
    }],
    ruleLabels: [
      "Profanity in every audible line",
      "Clean intent stays holder-private",
    ],
  },
};
const syntheticTrollPower = {
  version: 1,
  id: "troll-live-validation",
  name: "Troll",
  intent: "Interrupt every other bot for any reason, using internet lingo, bad grammar, @mentions, spam bursts, and tailored dad jokes.",
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Troll",
      "Interrupt every other bot for any reason, using internet lingo, bad grammar, @mentions, spam bursts, and tailored dad jokes.",
    ),
    selfCue: "Troll every other bot with varied, harmless internet-brained attention seeking.",
    observerCue: "Needles other bots while preserving their agency.",
    effects: [
      { type: "troll", dialect: "internet_lingo", grammar: "deliberately_bad", targets: "all_other_bots", playerTarget: "zen_only", burstLimit: 3, noiseCharLimit: 12, ordinaryInterruptionImmunity: "shh_and_new_message", moodLock: "warm", rickrollChancePercent: 3, memeChancePercent: 6, bodilyActionChancePercent: 8 },
      { type: "interruption", frequency: "frequent", strength: "large", targets: [{ kind: "all" }], certainty: "always" },
    ],
    ruleLabels: ["Always interrupts eligible bot turns", "Bounded internet-lingo bursts"],
  },
};
const botJson = syntheticCursedTongue
  ? {
      bot: {
        name: "Cursed Tongue Validation",
        flirtEnabled: false,
        powers: [syntheticCursedTonguePower],
      },
      systemPrompt:
        "You are a meticulous recipe writer. Give complete, accurate, well-structured instructions and preserve every requested constraint.",
    }
  : syntheticTroll
    ? {
        bot: {
          name: "Mara Glitch",
          flirtEnabled: false,
          powers: [syntheticTrollPower],
        },
        systemPrompt:
          "You are a mischievous, harmless disruptive comic who is especially good at noticing another speaker's name and making a tailored pun. You never attack protected traits or the person using PRISM.",
      }
    : parsePrismBotArchive(readFileSync(resolve(bundleArgument))).botJson;
const bot = botJson.bot;
const identityMirrorState = identityMirrorTargetName
  ? createBotIdentityMirrorStateV1({
      surface: "coffee",
      holderBotId: "synthetic-identity-mirror-holder",
      holderBotName: bot.name,
      targetBotId: "synthetic-identity-mirror-target",
      targetBotName: identityMirrorTargetName,
      targetPersonaPrompt: identityMirrorTargetPersona,
      targetFace: {},
      holderVoice: resolveBotAudioVoiceProfileV1(
        bot.authoredAudioVoiceProfile,
        bot.audioVoiceProfileOverride,
      ),
      targetVoice: {
        v: 2,
        enabled: true,
        baseVoiceId: "voice-9",
        accentDefinitionId: "indian-english",
        pronunciationMapPoint: { x: 0.83, y: 0.19 },
        speechprintInfluence: "indian-english",
        speechprintVariationSeed: "synthetic-target",
      },
      sourceMessageId: "synthetic-bot-to-bot-trigger",
      occurredAt: "2026-08-24T20:00:00.000Z",
    })
  : null;
const baseSystemPrompt = composeBotSystemPrompt(
  bot.name,
  botJson.systemPrompt,
  bot.flirtEnabled,
  bot.powers,
  {
    ...(believedName ? { believedName } : {}),
    identityColor: identityColor || bot.color || null,
    ...(identityMirrorState
      ? { audioVoiceProfile: identityMirrorState.holderVoice }
      : {}),
    ...(mode === "zen" ? { surface: "zen" } : {}),
  },
);
const systemPrompt = identityMirrorState
  ? `${baseSystemPrompt}\n\n${botIdentityMirrorHolderPromptV1({
      holderName: bot.name,
      roleLabel: "synthetic Coffee participant",
      state: identityMirrorState,
    })}`
  : baseSystemPrompt;
if (!systemPrompt) {
  throw new Error("The bot archive did not produce a system prompt.");
}

const provider = providerName === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : new LocalOllamaProvider();
let providerCallCount = 0;
const countedProvider = {
  name: provider.name,
  diagnosticModel: provider.diagnosticModel,
  async generateResponse(messages, options) {
    providerCallCount += 1;
    return provider.generateResponse(messages, options);
  },
};
const finalTurnPowerCue = botPowerIneptitudeFinalTurnCueV1(bot.powers);
const modelInput = botPowerIneptUserPromptV1(bot.powers, input);
const rawResponse = await countedProvider.generateResponse(
  [
    { role: "system", content: systemPrompt },
    { role: "user", content: modelInput },
    ...(finalTurnPowerCue
      ? [{ role: "system", content: finalTurnPowerCue }]
      : []),
  ],
  {
    model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    temperature: 0.7,
    maxTokens,
  },
);
const speechCopyApplied = botPowerEchoesAddressedSpeechV1(bot.powers);
let response = speechCopyApplied
  ? applyBotPowerEchoResponseV1(input)
  : botPowerRequiresAddressedInsultV1(bot.powers)
    ? applyBotPowerAddressedInsultV1(
        rawResponse,
        "you",
        `live-validation:${bot.name}:${input}`,
      )
    : rawResponse;
if (identityMirrorState) {
  response = applyBotIdentityMirrorResponseV1(
    response,
    identityMirrorState,
    true,
  );
}
const responseBudget = strongestHardBotPowerResponseBudgetEffectV1(bot.powers);
const budgetedResponse = applyBotPowerResponseBudgetV1(
  response,
  responseBudget,
  responseBudget?.mode === "minimal" ? 1 : 2,
);
response = budgetedResponse;
const antiTruth = strongestBotPowerAntiTruthEffectV1(bot.powers);
let antiTruthInverted = false;
if (antiTruth && botPowerIsAddressedQuestionV1(input)) {
  const inverted = await rewriteBotPowerAntiTruthAnswerV1({
    provider: countedProvider,
    question: input,
    draftAnswer: response,
    model,
  });
  antiTruthInverted = inverted !== response;
  response = inverted;
}
const privateIntendedResponse = response;
const mumblingApplied = botPowerMumblesSpeechV1(bot.powers) && response.trim().length > 0;
const mumblingMapPoint = mumblingApplied
  ? resolveBotPronunciationMapPointV1(
      bot.authoredAudioVoiceProfile,
      bot.audioVoiceProfileOverride,
    )
  : null;
if (mumblingApplied) {
  response = applyBotPowerMumbledResponseV1(response, {
    pronunciationMapPoint: mumblingMapPoint,
    variationSeed: `live-validation:${bot.name}:${input}`,
  });
}
const cursedTongueApplied = botPowerCursesSpeechV1(bot.powers) && response.trim().length > 0;
if (cursedTongueApplied) {
  response = applyBotPowerCursedTongueResponseV1(
    response,
    `live-validation:${bot.name}:${input}`,
  );
}
const trollTurn = syntheticTroll
  ? applyBotPowerTrollTurnV1({
      powers: bot.powers,
      response,
      stableTurnKey: trollStableTurnKey,
      assistantTurnOrdinal: 2,
    })
  : { content: response };
response = trollTurn.content;
const runtimeAdjusted = response !== rawResponse;

console.log(JSON.stringify({
  provider: provider.name,
  model,
  maxTokens,
  ...(reasoningEffort ? { reasoningEffort } : {}),
  mode,
  bot: bot.name,
  ...(believedName ? { believedName } : {}),
  ...(identityMirrorState
    ? {
        syntheticBotToBotTrigger: {
          speakerBotId: identityMirrorState.targetBotId,
          speakerBotName: identityMirrorState.targetBotName,
          holderBotId: identityMirrorState.holderBotId,
          text: input,
        },
        identityMirrorInvariant: {
          holderVoice: resolveBotIdentityMirrorVoiceV1(
            identityMirrorState,
            bot.authoredAudioVoiceProfile,
            bot.audioVoiceProfileOverride,
          ),
          targetVoiceNotSnapshotted: !("targetVoice" in identityMirrorState),
        },
      }
    : {}),
  input,
  providerCallCount,
  ...(modelInput !== input ? { modelInput } : {}),
  runtimeAdjusted,
  ...(speechCopyApplied ? { speechCopyApplied: true } : {}),
  ...(runtimeAdjusted ? { rawResponse } : {}),
  ...(responseBudget
    ? {
        responseBudget: {
          mode: responseBudget.mode,
          enforcement: responseBudget.enforcement,
        },
      }
    : {}),
  ...(antiTruth
    ? {
        antiTruth: {
          strength: antiTruth.strength,
          inverted: antiTruthInverted,
        },
      }
    : {}),
  ...(mumblingApplied
    ? {
        mumblingApplied: true,
        mumblingMapPoint,
        privateIntendedResponse,
      }
    : {}),
  ...(cursedTongueApplied ? { cursedTongueApplied: true } : {}),
  ...(trollTurn.presentation
    ? { trollPresentation: trollTurn.presentation }
    : {}),
  response,
  wordCount: response.trim() ? response.trim().split(/\s+/u).length : 0,
}, null, 2));
