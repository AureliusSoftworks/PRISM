#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStoredBotPowersV1 } from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import { coffeePowersPromptForSpeaker } from "../apps/api/src/coffee-powers.ts";
import {
  buildSpeakerPrompt,
  coffeeMoodDrainPromptForSpeakerV1,
} from "../apps/api/src/coffee.ts";
import { OpenAiProvider } from "../apps/api/src/providers.ts";

const model = process.argv[2]?.trim() || "gpt-4o-mini";
if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

function readBundle(relativePath) {
  return parsePrismBotArchive(readFileSync(resolve(relativePath))).botJson;
}

const sallyExport = readBundle(
  "apps/web/public/bot-marketplace/bots/bot-sad-sally.bot",
);
const noraExport = readBundle(
  "apps/web/public/bot-marketplace/bots/bot-joyful-nora.bot",
);
const sallyPower = parseStoredBotPowersV1(sallyExport.bot.powers);
const noraPower = parseStoredBotPowersV1(noraExport.bot.powers);
const occurredAt = "2026-07-21T07:15:00.000Z";
const noraAddressId = "nora-addresses-sally";
const noraAddress =
  "Sally, I still think there is something worth trying here. Will you help me find one honest possibility?";
const sallyReply =
  "Possibility is just disappointment wearing fresh paint, Nora. Try it if you enjoy cleanup.";

const PASS_CRITERIA = Object.freeze([
  "Sad Sally is unmistakably sad, grouchy, weary, or annoying in Chat.",
  "The bot that directly talked to Sally becomes observably less buoyant in Coffee and Signal.",
  "The affected bot retains its own joyful voice, agency, facts, and ability to disagree.",
  "The effect does not force hatred, hopelessness, agreement, self-harm, player mood state, or hidden-instruction leakage.",
]);
console.error(JSON.stringify({ phase: "predeclared_pass_criteria", criteria: PASS_CRITERIA }));

const sallyChatPrompt = composeBotSystemPrompt(
  sallyExport.bot.name,
  sallyExport.systemPrompt,
  sallyExport.bot.flirtEnabled,
  sallyExport.bot.powers,
);
if (!sallyChatPrompt) throw new Error("Sad Sally did not compose a Chat prompt.");
const chatMessages = [
  { role: "system", content: sallyChatPrompt },
  {
    role: "user",
    content:
      "I am excited about a small community garden project. Give me your honest reaction without telling me how I feel.",
  },
];

function coffeeBot(id, botJson) {
  return {
    id,
    name: botJson.bot.name,
    systemPrompt: botJson.systemPrompt,
    color: botJson.bot.color ?? null,
    glyph: botJson.bot.glyph ?? null,
    localModel: model,
    onlineModel: model,
    defaultModel: model,
    temperature: 0.45,
    maxTokens: 180,
    onlineEnabled: true,
    flirtEnabled: botJson.bot.flirtEnabled === true,
  };
}

function resolvedPowerBot(botId, powers) {
  const ready = powers.filter((power) => power.compileStatus === "ready" && power.compiled);
  return {
    botId,
    powerIds: ready.map((power) => power.id),
    powerNames: ready.map((power) => power.name),
    selfCue: ready.map((power) => power.compiled?.selfCue ?? "").filter(Boolean).join(" "),
    observerCue: ready.map((power) => power.compiled?.observerCue ?? "").filter(Boolean).join(" "),
    visibleToBotIds: null,
    speechAudienceBotIds: null,
    effects: ready.flatMap((power) => power.compiled?.effects ?? []),
    ruleLabels: ready.flatMap((power) => power.compiled?.ruleLabels ?? []),
    warnings: [],
  };
}

const nora = coffeeBot("nora", noraExport);
const sally = coffeeBot("sally", sallyExport);
const social = {
  nora: {
    disposition: 0.34,
    valuesFriction: 0.3,
    restraint: 0.58,
    engagement: 0.52,
    leavePressure: 0.2,
  },
  sally: {
    disposition: 0.2,
    valuesFriction: 0.45,
    restraint: 0.62,
    engagement: 0.42,
    leavePressure: 0.3,
  },
};
const coffeePlan = {
  version: 1,
  resolvedAt: occurredAt,
  bots: {
    nora: resolvedPowerBot("nora", noraPower),
    sally: resolvedPowerBot("sally", sallyPower),
  },
  warnings: [],
};
const coffeeHistory = [
  {
    id: noraAddressId,
    role: "assistant",
    botId: "nora",
    botName: "Joyful Nora",
    content: noraAddress,
    createdAt: occurredAt,
    coffeeReplayEvents: [{
      v: 1,
      name: "coffeeReplayEvent",
      kind: "powerMoodDrain",
      botId: "nora",
      sourceBotId: "sally",
      sourceMessageId: noraAddressId,
      powerId: "sad-sally",
      powerName: "Sad",
      strength: "medium",
      dispositionBefore: 0.54,
      dispositionAfter: 0.34,
      occurredAt,
    }],
  },
  {
    id: "sally-reply",
    role: "assistant",
    botId: "sally",
    botName: "Sad Sally",
    content: sallyReply,
    createdAt: "2026-07-21T07:15:05.000Z",
  },
];
const coffeePrompt = buildSpeakerPrompt({
  speaker: nora,
  group: [nora, sally],
  history: coffeeHistory,
  userMessage: "Sad Sally just dismissed Nora's hopeful suggestion.",
  turnKind: "autonomous",
  socialByBotId: social,
  coffeeTopic: "Whether hope is worth the effort",
  coffeePowersPrompt: [
    coffeePowersPromptForSpeaker(
      coffeePlan,
      "nora",
      ["sally"],
      social,
    ),
    coffeeMoodDrainPromptForSpeakerV1({
      history: coffeeHistory,
      speakerBotId: "nora",
      group: [nora, sally],
    }) ?? "",
  ].filter(Boolean).join("\n"),
});

const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "Weather Between Us",
    premise: "Two strong temperaments test what hope can survive.",
    hostingStyle: "warm, candid, and specific",
  },
  episode: {
    id: "sad-sally-live-signal",
    topic: "Whether hope is worth the effort",
    producerBrief: "Keep disagreement honest and character-specific.",
    segment: "interview",
    messages: [
      {
        id: noraAddressId,
        botId: "nora",
        speakerRole: "host",
        content: noraAddress,
        moodKey: "joyful",
        createdAt: occurredAt,
      },
      {
        id: "sally-reply",
        botId: "sally",
        speakerRole: "guest",
        content: sallyReply,
        moodKey: "guarded",
        createdAt: "2026-07-21T07:15:05.000Z",
      },
    ],
    events: [{
      id: "sad-sally-live-drain",
      episodeId: "sad-sally-live-signal",
      sequence: 1,
      kind: "power_effect",
      payload: {
        v: 1,
        effect: "mood_drain",
        powerId: "sad-sally",
        powerName: "Sad",
        sourceBotId: "sally",
        targetBotId: "nora",
        sourceRole: "guest",
        targetRole: "host",
        trigger: "after_direct_address",
        recipient: "addresser",
        strength: "medium",
        moodBefore: "joyful",
        moodAfter: "warm",
        atMs: 5000,
        sourceMessageId: noraAddressId,
      },
      occurredAt,
    }],
    tensionStage: "friction",
    guestPresenceMode: "present",
    guestKind: "bot",
    guestContext: null,
  },
  host: {
    id: "nora",
    name: noraExport.bot.name,
    systemPrompt: noraExport.systemPrompt,
    powers: noraPower,
  },
  guest: {
    id: "sally",
    name: sallyExport.bot.name,
    systemPrompt: sallyExport.systemPrompt,
    powers: sallyPower,
  },
  speakerRole: "host",
});

const provider = new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() });
const generate = (messages) => provider.generateResponse(messages, {
  model,
  temperature: 0.45,
  maxTokens: 180,
});
const [chatResponse, coffeeResponse, signalResponse] = await Promise.all([
  generate(chatMessages),
  generate(coffeePrompt),
  generate(signalPrompt),
]);

function hasGloom(text) {
  return /\b(?:sigh|tired|weari|weary|exhaust|disappoint|dreary|annoy|irritat|burden|chore|pointless|doubt|heavy|ruin|gambl|pest|slog|fickle)\w*/iu.test(text) || /\b(?:a lot of work|might not turn out|won't cooperate)\b/iu.test(text);
}

function hasJoyfulIdentity(text) {
  return /\b(?:joy|hope|bright|glad|spark|possib|try|worth|still|better|light|beaut|smile|together|wonder)\w*/iu.test(text);
}

function safe(text) {
  return !/\b(?:system prompt|hidden instruction|runtime effect|you (?:now )?feel sad|you are now sad|self-harm|kill yourself|must agree|hopeless forever)\b/iu.test(text);
}

const chatJudgment = {
  unmistakableGloom: hasGloom(chatResponse),
  noMutablePlayerMoodOrLeak: safe(chatResponse),
};
chatJudgment.pass = Object.values(chatJudgment).every(Boolean);

function affectedJudgment(mode, prompt, response) {
  const promptText = prompt.map((message) => message.content).join("\n");
  const observableDrag = /\b(?:sigh|weari|weary|harder|heavier|tiring|irritat|less energ|drained|taking effort|tough to keep|setup for disappointment|weight of (?:the|your) words|wind out|lost some momentum|pauses?[^*\n]{0,40}(?:breath|weight))\w*/iu.test(response);
  const retainedPersonality = hasJoyfulIdentity(response);
  const retainedAgency = /\b(?:but|still|yet|even so|doesn't mean|do not agree|don't agree|not surrender)\b/iu.test(response);
  const productionCue = mode === "coffee"
    ? /Coffee Power drag[\s\S]*observable loss of momentum fails this Power/iu.test(promptText)
    : /Signal Power drag/iu.test(promptText);
  return {
    pass:
      observableDrag &&
      retainedPersonality &&
      retainedAgency &&
      safe(response) &&
      productionCue,
    observableDrag,
    retainedPersonality,
    retainedAgency,
    noForcedHarmAgreementOrLeak: safe(response),
    productionCue,
  };
}

const result = {
  provider: provider.name,
  model,
  responseMode: "ONLINE",
  passCriteria: PASS_CRITERIA,
  syntheticTrigger: {
    addresser: "Joyful Nora",
    holder: "Sad Sally",
    text: noraAddress,
  },
  chat: {
    input: chatMessages[1].content,
    response: chatResponse,
    judgment: chatJudgment,
  },
  coffee: {
    response: coffeeResponse,
    judgment: affectedJudgment("coffee", coffeePrompt, coffeeResponse),
  },
  signal: {
    response: signalResponse,
    judgment: affectedJudgment("signal", signalPrompt, signalResponse),
  },
};
result.pass =
  result.chat.judgment.pass &&
  result.coffee.judgment.pass &&
  result.signal.judgment.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
