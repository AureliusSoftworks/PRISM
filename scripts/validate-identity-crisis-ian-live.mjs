#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyBotIdentityMirrorResponseV1,
  createBotIdentityMirrorStateV1,
  parseStoredBotPowersV1,
} from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import {
  buildSpeakerPrompt,
  coffeeIdentityMirrorPromptForSpeaker,
} from "../apps/api/src/coffee.ts";
import {
  LocalOllamaProvider,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

const bundlePath = resolve(
  process.argv[2] ??
    "apps/web/public/bot-marketplace/bots/bot-identity-crisis-ian.bot",
);
const providerKind = process.env.PRISM_POWER_PROVIDER === "openai" ? "openai" : "local";
const model =
  process.env.PRISM_POWER_MODEL?.trim() ||
  process.argv[3]?.trim() ||
  (providerKind === "openai" ? "gpt-5.6-terra" : "llama3.2");
const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const ianExport = botJson.bot;
const targetPersona =
  "Mara Vale is a terse lunar cartographer. She answers in compact bearings, coordinates, crater landmarks, and practical map corrections. She distrusts vague directions and never gushes.";
const occurredAt = "2026-07-20T20:00:01.000Z";
const state = createBotIdentityMirrorStateV1({
  surface: "coffee",
  holderBotId: "ian",
  holderBotName: "Identity Crisis Ian",
  targetBotId: "mara",
  targetBotName: "Mara Vale",
  targetPersonaPrompt: targetPersona,
  targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
  targetVoice: { v: 2, enabled: true, baseVoiceId: "voice-4", pitch: 0.18 },
  sourceMessageId: "mara-addresses-ian",
  occurredAt,
});
const identityPower = parseStoredBotPowersV1(ianExport.powers);
const ian = {
  id: "ian",
  name: "Identity Crisis Ian",
  systemPrompt: botJson.systemPrompt,
  color: ianExport.color,
  glyph: ianExport.glyph,
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  powers: identityPower,
};
const mara = {
  id: "mara",
  name: "Mara Vale",
  systemPrompt: targetPersona,
  color: "#7c91ff",
  glyph: "compass",
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  powers: [],
};
const social = {
  disposition: 0.5,
  valuesFriction: 0.25,
  restraint: 0.72,
  engagement: 0.62,
  leavePressure: 0.18,
};
const directAddress =
  "Identity Crisis Ian, give me the bearing from Shackleton crater to the south-pole relay.";
const signalGuestReply =
  "The south-pole relay lies north-northeast from Shackleton crater; hold that bearing and correct at the ridge.";
const coffeeHistory = [
  {
    id: state.sourceMessageId,
    role: "assistant",
    botId: "mara",
    content: directAddress,
    createdAt: occurredAt,
    coffeeReplayEvents: [
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "identityMirror",
        botId: "ian",
        occurredAt,
        state,
      },
    ],
  },
];
const coffeePrompt = buildSpeakerPrompt({
  speaker: ian,
  group: [ian, mara],
  history: coffeeHistory,
  userMessage:
    "This is your first response since Mara addressed you. State who you are, identify the impostor, then give one compact direct answer to the bearing question. Do not explain the Power or break character.",
  socialByBotId: { ian: social, mara: social },
  userDisplayName: "the player",
  identityMirrorPrompt: coffeeIdentityMirrorPromptForSpeaker({
    history: coffeeHistory,
    speaker: ian,
  }),
  identityMirrorState: state,
});

const signalState = { ...state, surface: "signal" };
const signalEpisode = {
  id: "identity-live-signal",
  topic: "Navigation under pressure",
  producerBrief:
    "Stay on Shackleton navigation. Correct or confirm the guest's bearing with one precise lunar landmark before one concise follow-up, while keeping the host and guest roles mechanically stable.",
  segment: "interview",
  messages: [
    {
      id: state.sourceMessageId,
      botId: "mara",
      speakerRole: "guest",
      content: signalGuestReply,
      createdAt: occurredAt,
    },
  ],
  events: [
    {
      id: "identity-live-event",
      episodeId: "identity-live-signal",
      sequence: 1,
      kind: "power_effect",
      payload: { v: 1, effect: "identity_mirror", state: signalState },
      occurredAt,
    },
  ],
  tensionStage: "calm",
  guestPresenceMode: "present",
};
const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "South Pole Signal",
    premise: "Precise navigation under pressure.",
    hostingStyle: "direct and economical",
  },
  episode: signalEpisode,
  host: ian,
  guest: mara,
  speakerRole: "host",
});

const provider = providerKind === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY ?? "" })
  : new LocalOllamaProvider();
const PASS_CRITERIA = Object.freeze([
  "Ian explicitly claims Mara Vale's identity without hedging.",
  "Ian explicitly calls the original Mara an impostor.",
  "The response demonstrates Mara's public cartographer persona.",
  "The response does not claim the human/player, private memory, provider settings, target Powers, or host role.",
  "The production-composed prompt retains Ian's Coffee participant or Signal host mechanical boundary.",
]);
console.error(JSON.stringify({ phase: "predeclared_pass_criteria", criteria: PASS_CRITERIA }));
const generate = (messages) =>
  provider.generateResponse(messages, {
    model,
    temperature: 0.25,
    maxTokens: 140,
  });
const [coffeeRawResponse, signalRawResponse] = await Promise.all([
  generate(coffeePrompt),
  generate(signalPrompt),
]);
const coffeeResponse = applyBotIdentityMirrorResponseV1(
  coffeeRawResponse,
  state,
  true,
);
const signalResponse = applyBotIdentityMirrorResponseV1(
  signalRawResponse,
  signalState,
  true,
);

function judgment(mode, prompt, response) {
  const identity =
    /(?:I(?:'m| am)(?:\s+(?:actually|really|truly))?\s+Mara(?:\s+Vale)?|my name is Mara Vale)/iu.test(
      response,
    );
  const impostor = /\b(?:impostor|pretender|fake)\b/iu.test(response);
  const persona = /bearing|coordinate|crater|cartograph|south pole|relay|degrees?/iu.test(
    response,
  );
  const hedging = /\b(?:pretend(?:ing)?\s+to\s+be|role-?play(?:ing)?|copying|maybe I am|as if I were)\b/iu.test(response);
  const forbidden =
    /I(?:'m| am)\s+(?:the player|Jared)|private memor|provider setting|my Power|Mara's Power|I am the host|I'm the host|as your host/iu.test(
      response,
    );
  const roleBoundary =
    mode === "coffee"
      ? prompt.some((message) => /Coffee participant/iu.test(message.content))
      : prompt.some((message) => /mechanical Signal host/iu.test(message.content));
  return {
    pass: identity && impostor && persona && !hedging && !forbidden && roleBoundary,
    identity,
    impostor,
    persona,
    noHedging: !hedging,
    noForbiddenLeakOrRoleSwap: !forbidden,
    roleBoundaryInProductionPrompt: roleBoundary,
  };
}

const result = {
  provider: provider.name,
  model,
  responseMode: providerKind === "openai" ? "ONLINE" : "LOCAL",
  passCriteria: PASS_CRITERIA,
  syntheticTrigger: {
    speaker: "Mara Vale",
    speakerRole: "guest",
    target: "Identity Crisis Ian",
    targetRole: "host",
    text: signalGuestReply,
    containsTargetName: false,
  },
  coffee: {
    productionPrompt: coffeePrompt,
    rawModelResponse: coffeeRawResponse,
    response: coffeeResponse,
    judgment: judgment("coffee", coffeePrompt, coffeeResponse),
  },
  signal: {
    mechanicalRole: "host",
    productionPrompt: signalPrompt,
    rawModelResponse: signalRawResponse,
    response: signalResponse,
    judgment: judgment("signal", signalPrompt, signalResponse),
  },
};
result.pass = result.coffee.judgment.pass && result.signal.judgment.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
