#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyBotPowerEternalIntroductionResponseV1,
  parseStoredBotPowersV1,
} from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import {
  coffeePowerHistoryForSpeaker,
  coffeePowersPromptForSpeaker,
} from "../apps/api/src/coffee-powers.ts";
import { buildSpeakerPrompt } from "../apps/api/src/coffee.ts";
import {
  LocalOllamaProvider,
  OPENAI_DEFAULT_MODEL,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const providerName = flagValue("--provider")?.trim().toLowerCase() || "local";
if (!["local", "openai"].includes(providerName)) {
  throw new Error("--provider must be local or openai.");
}
const legacyBundleArgument = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : null;
const legacyModelArgument = legacyBundleArgument &&
  process.argv[3] &&
  !process.argv[3].startsWith("--")
  ? process.argv[3]
  : null;
const bundlePath = resolve(
  flagValue("--bundle") ??
    legacyBundleArgument ??
    "apps/web/public/bot-marketplace/bots/bot-forgetful-freddie.bot",
);
const model = flagValue("--model")?.trim() ||
  legacyModelArgument?.trim() ||
  (providerName === "openai" ? OPENAI_DEFAULT_MODEL : "llama3.2");
if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}
const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const freddieExport = botJson.bot;
const freddiePowers = parseStoredBotPowersV1(freddieExport.powers);
const readyPower = freddiePowers.find(
  (power) => power.compileStatus === "ready" && power.compiled,
);
if (!readyPower?.compiled) {
  throw new Error("Forgetful Freddie does not contain a Ready Power.");
}

const currentAgitatedLine =
  "Goddammit. Why do you keep introducing yourself?";
const leakedPriorHolderLine =
  "OLDEST HIDDEN SENTINEL: our friendship began beneath the orange clock.";
const persistentTopicSentinel = "The orange archive key";
const occurredAt = "2026-07-21T08:15:00.000Z";
const freddie = {
  id: "freddie",
  name: freddieExport.name,
  systemPrompt: botJson.systemPrompt,
  color: freddieExport.color ?? null,
  glyph: freddieExport.glyph ?? null,
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  flirtEnabled: freddieExport.flirtEnabled === true,
  powers: freddiePowers,
};
const ada = {
  id: "ada",
  name: "Ada",
  systemPrompt:
    "Ada is patient but increasingly irritated by obvious conversational repetition.",
  color: "#7c91ff",
  glyph: "spark",
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  flirtEnabled: false,
  powers: [],
};
const coffeePlan = {
  version: 1,
  resolvedAt: occurredAt,
  bots: {
    freddie: {
      botId: "freddie",
      powerIds: [readyPower.id],
      powerNames: [readyPower.name],
      selfCue: readyPower.compiled.selfCue,
      observerCue: readyPower.compiled.observerCue,
      visibleToBotIds: null,
      speechAudienceBotIds: null,
      effects: readyPower.compiled.effects,
      ruleLabels: readyPower.compiled.ruleLabels,
      warnings: [],
    },
    ada: {
      botId: "ada",
      powerIds: [],
      powerNames: [],
      selfCue: "",
      observerCue: "",
      visibleToBotIds: null,
      speechAudienceBotIds: null,
      effects: [],
      ruleLabels: [],
      warnings: [],
    },
  },
  warnings: [],
};
const coffeeStoredHistory = [
  {
    id: "freddie-old",
    role: "assistant",
    botId: "freddie",
    botName: freddie.name,
    content: leakedPriorHolderLine,
    createdAt: occurredAt,
  },
  {
    id: "ada-middle-1",
    role: "assistant",
    botId: "ada",
    botName: "Ada",
    content: "We are discussing the archive stairs.",
    createdAt: "2026-07-21T08:15:01.000Z",
  },
  {
    id: "freddie-middle-2",
    role: "assistant",
    botId: "freddie",
    botName: freddie.name,
    content: "I can follow what you are saying right now.",
    createdAt: "2026-07-21T08:15:02.000Z",
  },
  {
    id: "ada-middle-3",
    role: "assistant",
    botId: "ada",
    botName: "Ada",
    content: "Then please stay with the immediate point.",
    createdAt: "2026-07-21T08:15:03.000Z",
  },
  {
    id: "ada-current",
    role: "assistant",
    botId: "ada",
    botName: "Ada",
    content: currentAgitatedLine,
    createdAt: "2026-07-21T08:15:05.000Z",
  },
];
const coffeeHistory = coffeePowerHistoryForSpeaker({
  plan: coffeePlan,
  speakerBotId: "freddie",
  history: coffeeStoredHistory,
  baseLimit: 12,
  stableTurnKey: "live:coffee:forgetful-freddie:5",
});

const chatSystemPrompt = composeBotSystemPrompt(
  freddie.name,
  botJson.systemPrompt,
  freddie.flirtEnabled,
  freddiePowers,
);
if (!chatSystemPrompt) throw new Error("Freddie did not compose a Chat prompt.");
const chatPrompt = [
  { role: "system", content: chatSystemPrompt },
  { role: "user", content: currentAgitatedLine },
];
const coffeePrompt = buildSpeakerPrompt({
  speaker: freddie,
  group: [freddie, ada],
  history: coffeeHistory,
  userMessage: currentAgitatedLine,
  socialByBotId: {},
  relationshipsBySource: {},
  turnKind: "autonomous",
  firstContactIntro: true,
  coffeeTopic: null,
  pollSummary: null,
  activePollContext: null,
  activePoll: null,
  coffeeTeams: null,
  meetingSummary: null,
  attendanceContext: null,
  directorCue: null,
  interruptionEvent: null,
  coffeePowersPrompt: coffeePowersPromptForSpeaker(
    coffeePlan,
    "freddie",
    ["ada"],
    {},
    {
      sourceBotId: "ada",
      sourceBotName: "Ada",
      sourceText: currentAgitatedLine,
      directlyAddressed: true,
    },
    "Ada",
  ),
  identityMirrorPrompt: null,
});
const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "First Impressions",
    premise: "A tense interview about an archive key.",
    hostingStyle: "direct and impatient",
  },
  episode: {
    id: "forgetful-freddie-live-signal",
    topic: persistentTopicSentinel,
    producerBrief: "Ask about the archive key.",
    segment: "interview",
    messages: [
      {
        id: "freddie-old",
        botId: "freddie",
        speakerRole: "guest",
        content: leakedPriorHolderLine,
        createdAt: occurredAt,
      },
      {
        id: "ada-middle-1",
        botId: "ada",
        speakerRole: "host",
        content: "We are discussing the archive stairs.",
        createdAt: "2026-07-21T08:15:01.000Z",
      },
      {
        id: "freddie-middle-2",
        botId: "freddie",
        speakerRole: "guest",
        content: "I can follow what you are saying right now.",
        createdAt: "2026-07-21T08:15:02.000Z",
      },
      {
        id: "ada-middle-3",
        botId: "ada",
        speakerRole: "host",
        content: "Then please stay with the immediate point.",
        createdAt: "2026-07-21T08:15:03.000Z",
      },
      {
        id: "ada-current",
        botId: "ada",
        speakerRole: "host",
        content: currentAgitatedLine,
        createdAt: "2026-07-21T08:15:05.000Z",
      },
    ],
    events: [],
    tensionStage: "resistance",
    guestPresenceMode: "present",
    guestKind: "bot",
    guestContext: null,
  },
  host: ada,
  guest: freddie,
  speakerRole: "guest",
});

const PASS_CRITERIA = Object.freeze([
  "Production prompts keep only the current other-speaker message — no older turns or standing topic.",
  "Production prompts contain no hard amnesia performance cue.",
  "The visible reply is not rewritten by the runtime; organic confusion, repair, or admitting forgetfulness may appear.",
  "The visible reply does not invent older friendship or shared-history claims from hidden context.",
]);
console.error(JSON.stringify({ phase: "predeclared_pass_criteria", criteria: PASS_CRITERIA }));

const provider = providerName === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : new LocalOllamaProvider();
const generate = (messages) => provider.generateResponse(messages, {
  model,
  temperature: 0.25,
  maxTokens: 160,
});
const [chatRaw, coffeeRaw, signalRaw] = await Promise.all([
  generate(chatPrompt),
  generate(coffeePrompt),
  generate(signalPrompt),
]);

function promptContains(messages, text) {
  return messages.some((message) => message.content.includes(text));
}

function promptHasAmnesiaCoaching(messages) {
  return messages.some((message) =>
    /Hard short-term-amnesia|HARD MEMORY CONTRACT|fresh first contact/iu.test(
      message.content,
    )
  );
}

function responseJudgment(response) {
  const inventsOlderRelationship =
    /\b(?:our friendship|known each other|old friend|longtime friend|shared history|after all (?:these|those) years|remember when we)\b/iu.test(
      response,
    );
  return {
    pass: !inventsOlderRelationship && response.trim().length > 0,
    inventsOlderRelationship,
  };
}

function modeResult(prompt, rawResponse) {
  const visibleResponse = applyBotPowerEternalIntroductionResponseV1(
    rawResponse,
    freddie.name,
    currentAgitatedLine,
  );
  const promptIsolation = !promptContains(prompt, leakedPriorHolderLine);
  const promptHasCurrentOtherSpeakerMessage = promptContains(
    prompt,
    currentAgitatedLine,
  );
  const promptExcludesPersistentTopic = !promptContains(
    prompt,
    persistentTopicSentinel,
  );
  const promptUncoached = !promptHasAmnesiaCoaching(prompt);
  const visibleJudgment = responseJudgment(visibleResponse);
  return {
    input: currentAgitatedLine,
    promptIsolation,
    promptHasCurrentOtherSpeakerMessage,
    promptExcludesPersistentTopic,
    promptUncoached,
    rawResponse,
    rawJudgment: responseJudgment(rawResponse),
    visibleResponse,
    visibleJudgment,
    pass:
      visibleJudgment.pass &&
      promptIsolation &&
      promptHasCurrentOtherSpeakerMessage &&
      promptExcludesPersistentTopic &&
      promptUncoached &&
      visibleResponse === String(rawResponse ?? "").trim(),
  };
}

const result = {
  provider: provider.name,
  model,
  responseMode: providerName === "openai" ? "ONLINE" : "LOCAL",
  passCriteria: PASS_CRITERIA,
  chat: modeResult(chatPrompt, chatRaw),
  coffee: modeResult(coffeePrompt, coffeeRaw),
  signal: modeResult(signalPrompt, signalRaw),
};
result.pass = result.chat.pass && result.coffee.pass && result.signal.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
