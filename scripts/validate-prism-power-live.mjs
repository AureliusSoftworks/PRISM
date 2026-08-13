#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import {
  applyBotPowerAddressedInsultV1,
  applyBotPowerResponseBudgetV1,
  botPowerCursesSpeechV1,
  botPowerIneptitudeFinalTurnCueV1,
  botPowerIneptUserPromptV1,
  botPowerIsAddressedQuestionV1,
  botPowerRequiresAddressedInsultV1,
  strongestBotPowerAntiTruthEffectV1,
  strongestHardBotPowerResponseBudgetEffectV1,
} from "@localai/shared";
import {
  rewriteBotPowerAntiTruthAnswerV1,
  rewriteBotPowerCursedTongueAnswerV1,
} from "../apps/api/src/bot-powers.ts";
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
const believedName = flagValue("--believed-name")?.trim() || null;

if (
  !bundleArgument ||
  !input ||
  !["chat", "zen"].includes(mode) ||
  !["local", "openai"].includes(providerName)
) {
  throw new Error(
    "Usage: validate-prism-power-live.mjs --bundle PATH --input TEXT [--mode chat|zen] [--provider local|openai] [--model MODEL] [--believed-name NAME]",
  );
}
if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

const bundlePath = resolve(bundleArgument);
const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const bot = botJson.bot;
const systemPrompt = composeBotSystemPrompt(
  bot.name,
  botJson.systemPrompt,
  bot.flirtEnabled,
  bot.powers,
  believedName ? { believedName } : undefined,
);
if (!systemPrompt) {
  throw new Error("The bot archive did not produce a system prompt.");
}

const provider = providerName === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : new LocalOllamaProvider();
const finalTurnPowerCue = botPowerIneptitudeFinalTurnCueV1(bot.powers);
const modelInput = botPowerIneptUserPromptV1(bot.powers, input);
const rawResponse = await provider.generateResponse(
  [
    { role: "system", content: systemPrompt },
    { role: "user", content: modelInput },
    ...(finalTurnPowerCue
      ? [{ role: "system", content: finalTurnPowerCue }]
      : []),
  ],
  {
    model,
    temperature: 0.7,
    maxTokens: 220,
  },
);
let response = botPowerRequiresAddressedInsultV1(bot.powers)
  ? applyBotPowerAddressedInsultV1(
      rawResponse,
      "you",
      `live-validation:${bot.name}:${input}`,
    )
  : rawResponse;
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
    provider,
    question: input,
    draftAnswer: response,
    model,
  });
  antiTruthInverted = inverted !== response;
  response = inverted;
}
const cursedTongueApplied = botPowerCursesSpeechV1(bot.powers) && response.trim().length > 0;
if (cursedTongueApplied) {
  response = await rewriteBotPowerCursedTongueAnswerV1({
    provider,
    draftAnswer: response,
    seed: `live-validation:${bot.name}:${input}`,
    model,
    usagePurpose: "system_unlabeled",
  });
}
const runtimeAdjusted = response !== rawResponse;

console.log(JSON.stringify({
  provider: provider.name,
  model,
  mode,
  bot: bot.name,
  ...(believedName ? { believedName } : {}),
  input,
  ...(modelInput !== input ? { modelInput } : {}),
  runtimeAdjusted,
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
  ...(cursedTongueApplied ? { cursedTongueApplied: true } : {}),
  response,
  wordCount: response.trim() ? response.trim().split(/\s+/u).length : 0,
}, null, 2));
