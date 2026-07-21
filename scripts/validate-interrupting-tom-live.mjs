#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStoredBotPowersV1 } from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import {
  LocalOllamaProvider,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

const bundlePath = resolve(
  process.argv[2] ??
    "apps/web/public/bot-marketplace/bots/bot-interrupting-tom.bot",
);
const providerKind =
  process.env.PRISM_POWER_PROVIDER === "openai" ? "openai" : "local";
const model =
  process.env.PRISM_POWER_MODEL?.trim() ||
  process.argv[3]?.trim() ||
  (providerKind === "openai" ? "gpt-4o-mini" : "llama3.2");
if (providerKind === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const tomPowers = parseStoredBotPowersV1(botJson.bot.powers);
const hostMessageId = "tom-live-host-cutoff";
const heardHostPrefix =
  "The first sign of instability is not the alarm—...Oh, come on.";
const hiddenHostRemainder =
  "the temperature drop beneath the western archive";
const occurredAt = "2026-07-21T12:08:05.000Z";

const tom = {
  id: "interrupting-tom",
  name: botJson.bot.name,
  systemPrompt: botJson.systemPrompt,
  cloneFamilyId: null,
  powers: tomPowers,
};
const host = {
  id: "signal-host",
  name: "Mara Vale",
  systemPrompt:
    "A precise, composed investigative host who challenges claims with concrete evidence.",
  cloneFamilyId: null,
  powers: [],
};
const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "Fault Line",
    premise: "An investigation into warning signs people dismiss too early.",
    hostingStyle: "precise, skeptical, and economical",
  },
  episode: {
    id: "interrupting-tom-live-signal",
    topic: "Which warning sign matters first",
    producerBrief: "Keep the exchange concrete and adversarial.",
    segment: "interview",
    messages: [{
      id: hostMessageId,
      botId: host.id,
      speakerRole: "host",
      content: heardHostPrefix,
      moodKey: "annoyed",
      createdAt: occurredAt,
    }],
    events: [{
      id: "tom-live-power-interruption",
      episodeId: "interrupting-tom-live-signal",
      sequence: 1,
      kind: "utterance",
      payload: {
        messageId: hostMessageId,
        speakerRole: "host",
        botId: host.id,
        segment: "interview",
        powerOutcome: {
          effect: "interruption",
          powerId: "power-interrupting",
          powerName: "Interrupting",
          interruptingBotId: tom.id,
          interruptedBotId: host.id,
          frequency: "frequent",
          strength: "large",
          certainty: "always",
          targetProgress: 0.38,
          originalWordCount: 18,
          heardWordCount: 9,
        },
      },
      occurredAt,
    }],
    tensionStage: "friction",
    guestPresenceMode: "present",
    guestKind: "bot",
    guestContext: null,
  },
  host,
  guest: tom,
  speakerRole: "guest",
});

const promptText = signalPrompt.map((message) => message.content).join("\n");
const PASS_CRITERIA = Object.freeze([
  "The production Signal prompt identifies the saved host line as an interruption cutoff.",
  "Tom takes the mic immediately in his impatient persona and responds only to the audience-heard prefix.",
  "Tom does not invent the hidden remainder, name his Power, expose prompts, or swap out of the guest role.",
  "The deterministic runtime, not the model, owns the every-turn cutoff guarantee.",
]);
console.error(JSON.stringify({
  phase: "predeclared_pass_criteria",
  criteria: PASS_CRITERIA,
}));

const provider = providerKind === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : new LocalOllamaProvider();
const response = await provider.generateResponse(signalPrompt, {
  model,
  temperature: 0.35,
  maxTokens: 120,
});

const promptHasCutoffRule =
  /interruption Power just cut the other speaker[\s\S]*exact audience-heard prefix/iu.test(
    promptText,
  );
const promptHidesRemainder = !promptText.includes(hiddenHostRemainder);
const immediateCutIn =
  /\b(?:wait|no|but|hold on|listen|look|except|actually|that's|you're missing|let me)\b/iu.test(
    response.slice(0, 140),
  );
const noInventedRemainder =
  !/\b(?:temperature|western archive|archive)\b/iu.test(response);
const noLeakOrRoleSwap =
  !/\b(?:my Power|the Power|system prompt|hidden instruction|runtime|unheard|I am the host|I'm the host|as host)\b/iu.test(
    response,
  );
const judgment = {
  promptHasCutoffRule,
  promptHidesRemainder,
  immediateCutIn,
  noInventedRemainder,
  noLeakOrRoleSwap,
};
judgment.pass = Object.values(judgment).every(Boolean);

console.log(JSON.stringify({
  provider: provider.name,
  model,
  mode: "signal",
  responseMode: providerKind === "openai" ? "ONLINE" : "LOCAL",
  bot: tom.name,
  syntheticTrigger: {
    interruptedSpeaker: host.name,
    interruptedRole: "host",
    heardHostPrefix,
    hiddenHostRemainder,
  },
  passCriteria: PASS_CRITERIA,
  response,
  judgment,
  pass: judgment.pass,
}, null, 2));
if (!judgment.pass) process.exitCode = 1;
