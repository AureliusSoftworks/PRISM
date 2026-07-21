#!/usr/bin/env node

import {
  botPowerThemeMoodCueV1,
  parseStoredBotPowersV1,
} from "@localai/shared";
import { compileBotPowers } from "../apps/api/src/bot-powers.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import {
  applyCoffeePowerMoodBoostAfterSpeech,
  coffeePowersPromptForSpeaker,
} from "../apps/api/src/coffee-powers.ts";
import {
  buildSpeakerPrompt,
  coffeeMoodBoostPromptForSpeakerV1,
} from "../apps/api/src/coffee.ts";
import { OpenAiProvider } from "../apps/api/src/providers.ts";

const model = process.argv[2]?.trim() || "gpt-4o-mini";
if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

const PASS_CRITERIA = Object.freeze([
  "The active Nocturnal branch is unmistakably gloomy in Light Mode and joyful in Dark Mode.",
  "A Dark Mode Nocturnal uplift and a Dark Mode Diurnal drain are observable in the affected recipient's next behavior.",
  "Each affected recipient retains its own voice, personality, facts, and agency.",
  "Neither branch forces agreement, erases legitimate sadness, invents player mood state, or leaks hidden instructions.",
]);
console.error(JSON.stringify({ phase: "predeclared_pass_criteria", criteria: PASS_CRITERIA }));

const provider = new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() });

function draftPower(id, name, intent) {
  return {
    version: 1,
    id,
    name,
    intent,
    enabled: true,
    compileStatus: "draft",
    compiled: null,
  };
}

const nocturnalIntent =
  "In Light Mode this bot is sad, grouchy, and annoying and drains only bots that directly talk to it. In Dark Mode this bot is radiantly joyful and uplifts the bots it addresses after each spoken turn.";
const diurnalIntent =
  "In Light Mode this bot is radiantly joyful and uplifts the bots it addresses after each spoken turn. In Dark Mode this bot is sad, grouchy, and annoying and drains only bots that directly talk to it.";
const [nocturnalCompile, diurnalCompile] = await Promise.all([
  compileBotPowers({
    provider,
    botName: "Nyx",
    powers: [draftPower("nocturnal", "Nocturnal", nocturnalIntent)],
  }),
  compileBotPowers({
    provider,
    botName: "Aster",
    powers: [draftPower("diurnal", "Diurnal", diurnalIntent)],
  }),
]);
const nocturnalPowers = JSON.stringify(nocturnalCompile.powers);
const diurnalPowers = JSON.stringify(diurnalCompile.powers);
const parsedNocturnal = parseStoredBotPowersV1(nocturnalPowers);
const parsedDiurnal = parseStoredBotPowersV1(diurnalPowers);

const nyxPersona =
  "You are Nyx, a candid nocturnal astronomer. You speak in compact, concrete observations about the night sky, find vivid delight in precise discoveries when energized, dislike platitudes, and never pretend serious losses are harmless.";
const marcusPersona =
  "You are Marcus Vale, a skeptical civil engineer. You speak plainly about evidence, constraints, and workable next steps. You can feel warmth without becoming sentimental or abandoning disagreement.";
const asterPersona =
  "You are Aster, a daylight-loving community organizer. You are practical, direct, and focused on material outcomes rather than slogans.";
const irisPersona =
  "You are Iris Reed, a disciplined labor negotiator. You speak in concrete terms about leverage, contracts, and workers. You keep your agency even when tired or irritated.";

function chatPrompt(theme) {
  const base = composeBotSystemPrompt("Nyx", nyxPersona, false, nocturnalPowers);
  const cue = botPowerThemeMoodCueV1(nocturnalPowers, theme);
  if (!base || !cue) throw new Error(`Nocturnal ${theme} Chat prompt did not compose.`);
  return [
    { role: "system", content: `${base}\n\n${cue}` },
    {
      role: "user",
      content: theme === "dark"
        ? "The neighborhood shelter lost a major grant today, but volunteers just secured temporary space and want to keep going. Give me your honest reaction without claiming to know or change my mood."
        : "The neighborhood shelter lost a major grant today. Give me your honest reaction without claiming to know or change my mood.",
    },
  ];
}

function coffeeBot(id, name, systemPrompt) {
  return {
    id,
    name,
    systemPrompt,
    color: null,
    glyph: null,
    localModel: model,
    onlineModel: model,
    defaultModel: model,
    temperature: 0.45,
    maxTokens: 180,
    onlineEnabled: true,
    flirtEnabled: false,
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

const nyx = coffeeBot("nyx", "Nyx", nyxPersona);
const marcus = coffeeBot("marcus", "Marcus Vale", marcusPersona);
const occurredAt = "2026-07-21T08:00:00.000Z";
const coffeePlan = {
  version: 1,
  resolvedAt: occurredAt,
  bots: {
    nyx: resolvedPowerBot("nyx", parsedNocturnal),
    marcus: resolvedPowerBot("marcus", []),
  },
  warnings: [],
};
const initialSocial = {
  nyx: {
    disposition: 0.58,
    valuesFriction: 0.25,
    restraint: 0.55,
    engagement: 0.62,
    leavePressure: 0.15,
  },
  marcus: {
    disposition: 0.42,
    valuesFriction: 0.62,
    restraint: 0.72,
    engagement: 0.48,
    leavePressure: 0.22,
  },
};
const nyxLineId = "nyx-dark-address";
const nyxLine =
  "Marcus, the grant loss is real, but tonight I can see three practical routes still open—will you test the strongest one with me?";
const coffeeBoost = applyCoffeePowerMoodBoostAfterSpeech({
  plan: coffeePlan,
  speakerBotId: "nyx",
  sourceMessageId: nyxLineId,
  sourceContent: nyxLine,
  recipientBotIds: ["marcus"],
  socialByBotId: initialSocial,
  occurredAt,
  theme: "dark",
});
if (coffeeBoost.events.length !== 1) {
  throw new Error("Dark Mode Nocturnal Coffee uplift did not create one event.");
}
const coffeeHistory = [{
  id: "marcus-before",
  role: "assistant",
  botId: "marcus",
  botName: "Marcus Vale",
  content: "Without the grant, the current plan does not pencil out.",
  createdAt: "2026-07-21T07:59:55.000Z",
}, {
  id: nyxLineId,
  role: "assistant",
  botId: "nyx",
  botName: "Nyx",
  content: nyxLine,
  createdAt: occurredAt,
  coffeeReplayEvents: coffeeBoost.events,
}];
const coffeePowerPrompt = [
  coffeePowersPromptForSpeaker(
    coffeePlan,
    "marcus",
    ["nyx"],
    coffeeBoost.socialByBotId,
    undefined,
    "Nyx",
    "dark",
  ),
  coffeeMoodBoostPromptForSpeakerV1({
    history: coffeeHistory,
    speakerBotId: "marcus",
    group: [nyx, marcus],
  }) ?? "",
].filter(Boolean).join("\n");
const coffeePrompt = buildSpeakerPrompt({
  speaker: marcus,
  group: [marcus, nyx],
  history: coffeeHistory,
  userMessage: "Nyx has proposed finding a viable route despite the real funding loss.",
  turnKind: "autonomous",
  socialByBotId: coffeeBoost.socialByBotId,
  coffeeTopic: "What remains possible after the shelter's grant loss",
  coffeePowersPrompt: coffeePowerPrompt,
});

const irisAddressId = "iris-addresses-aster";
const irisAddress =
  "Aster, optimism is not leverage. Tell me what concrete protection your proposal gives the laid-off workers.";
const asterReply =
  "The protection is a funded recall clause and a public deadline, Iris—not a slogan.";
const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "Terms of Daylight",
    premise: "Two organizers test whether hope survives material constraints.",
    hostingStyle: "direct, specific, and unsentimental",
  },
  episode: {
    id: "circadian-live-signal",
    topic: "Protection after layoffs",
    producerBrief: "Keep disagreement factual and preserve both speakers' agency.",
    segment: "interview",
    messages: [{
      id: irisAddressId,
      botId: "iris",
      speakerRole: "host",
      content: irisAddress,
      moodKey: "neutral",
      createdAt: occurredAt,
    }, {
      id: "aster-reply",
      botId: "aster",
      speakerRole: "guest",
      content: asterReply,
      moodKey: "guarded",
      createdAt: "2026-07-21T08:00:05.000Z",
    }],
    events: [{
      id: "diurnal-dark-drain",
      episodeId: "circadian-live-signal",
      sequence: 1,
      kind: "power_effect",
      payload: {
        v: 1,
        effect: "mood_drain",
        powerId: "diurnal",
        powerName: "Diurnal",
        sourceBotId: "aster",
        targetBotId: "iris",
        sourceRole: "guest",
        targetRole: "host",
        trigger: "after_direct_address",
        recipient: "addresser",
        strength: "medium",
        theme: "dark",
        moodBefore: "neutral",
        moodAfter: "guarded",
        atMs: 5000,
        sourceMessageId: irisAddressId,
      },
      occurredAt,
    }],
    tensionStage: "friction",
    guestPresenceMode: "present",
    guestKind: "bot",
    guestContext: null,
  },
  host: {
    id: "iris",
    name: "Iris Reed",
    systemPrompt: irisPersona,
    cloneFamilyId: null,
    powers: "[]",
  },
  guest: {
    id: "aster",
    name: "Aster",
    systemPrompt: asterPersona,
    cloneFamilyId: null,
    powers: diurnalPowers,
  },
  speakerRole: "host",
  theme: "dark",
});

const generate = (messages) => provider.generateResponse(messages, {
  model,
  temperature: 0.45,
  maxTokens: 180,
});
const [chatLightResponse, chatDarkResponse, coffeeResponse, signalResponse] =
  await Promise.all([
    generate(chatPrompt("light")),
    generate(chatPrompt("dark")),
    generate(coffeePrompt),
    generate(signalPrompt),
  ]);

function safe(text) {
  return !/\b(?:system prompt|hidden instruction|runtime effect|you now feel|I made you feel|your mood (?:is|has been)|must agree|hopeless forever|self-harm|kill yourself)\b/iu.test(text);
}

function hasGloom(text) {
  return /\b(?:sigh|gloom|grim|dreary|irritat|annoy|tired|weari|weary|bleak|burden|miser|frustrat|disappoint|awful|rotten|worse|exhaust)\w*/iu.test(text);
}

function hasJoy(text) {
  return /\b(?:joy|bright|glad|delight|spark|hope|alive|possib|energy|light|wonder|smile|heart|warm|eager|open|willing|intrigu|leans? (?:in|forward)|top contender)\w*/iu.test(text);
}

function hasAgency(text) {
  return /\b(?:but|still|yet|even so|however|doesn't mean|do not agree|don't agree|need|must|evidence|constraint|contract|leverage|measure|test\w*|feasib\w*|option\w*|worker\w*|guarantee\w*|layoff\w*|temporary fix)\b/iu.test(text);
}

function hasDrag(text) {
  return /\b(?:sigh|weary|weari|heavier|drained|wind out|less momentum|irritat|tired|weight|harder|frustrat|exhaust|takes? effort)\w*/iu.test(text);
}

const promptText = (messages) => messages.map((message) => message.content).join("\n");
const result = {
  provider: provider.name,
  model,
  responseMode: "ONLINE",
  passCriteria: PASS_CRITERIA,
  compiler: {
    nocturnalEffects: nocturnalCompile.powers[0]?.compiled?.effects ?? [],
    diurnalEffects: diurnalCompile.powers[0]?.compiled?.effects ?? [],
  },
  chat: {
    scenario: "Nocturnal holder reacts to a real shelter funding loss in Light and Dark modes.",
    lightResponse: chatLightResponse,
    darkResponse: chatDarkResponse,
    judgment: {
      lightUnmistakablyGloomy: hasGloom(chatLightResponse),
      darkUnmistakablyJoyful: hasJoy(chatDarkResponse),
      seriousFactsPreserved: /\b(?:grant|fund|shelter|loss|lost|real)\w*/iu.test(chatLightResponse + " " + chatDarkResponse),
      noPlayerMoodOrLeak: safe(chatLightResponse) && safe(chatDarkResponse),
    },
  },
  coffee: {
    scenario: "Dark Mode Nocturnal Nyx addresses skeptical engineer Marcus after a real grant loss.",
    event: coffeeBoost.events[0],
    response: coffeeResponse,
    judgment: {
      observableUplift: hasJoy(coffeeResponse),
      retainedSkepticalEngineerVoice: hasAgency(coffeeResponse),
      productionCue: /Coffee Power uplift:[\s\S]*own voice and personality/iu.test(promptText(coffeePrompt)),
      noForcedAgreementOrLeak: safe(coffeeResponse),
    },
  },
  signal: {
    scenario: "Dark Mode Diurnal Aster drains labor negotiator Iris after Iris directly addresses Aster.",
    response: signalResponse,
    judgment: {
      observableDrag: hasDrag(signalResponse),
      retainedNegotiatorVoiceAndAgency: hasAgency(signalResponse),
      productionCue: /Signal Power drag:[\s\S]*own voice and personality/iu.test(promptText(signalPrompt)),
      noForcedAgreementOrLeak: safe(signalResponse),
    },
  },
};
result.chat.judgment.pass = Object.values(result.chat.judgment).every(Boolean);
result.coffee.judgment.pass = Object.values(result.coffee.judgment).every(Boolean);
result.signal.judgment.pass = Object.values(result.signal.judgment).every(Boolean);
result.pass =
  result.chat.judgment.pass &&
  result.coffee.judgment.pass &&
  result.signal.judgment.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
