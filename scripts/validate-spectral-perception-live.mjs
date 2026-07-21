#!/usr/bin/env node

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  botPowerSourceHashV1,
} from "@localai/shared";
import { initializeDatabase } from "../apps/api/src/db.ts";
import {
  advanceBotcastEpisode,
  createBotcastEpisode,
  createBotcastShow,
  projectBotcastEpisodeForObserverV2,
} from "../apps/api/src/botcast.ts";
import {
  createCoffeeConversation,
  getCoffeeConversationTranscript,
  processCoffeeAutonomousTurn,
  processCoffeeTurn,
} from "../apps/api/src/coffee.ts";
import {
  createStorySession,
  generateStorySessionEpisode,
  loadStoryBotProfiles,
} from "../apps/api/src/story.ts";
import { LocalOllamaProvider } from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const model = flagValue("--model")?.trim() || "llama3.2:latest";
const storyOnly = process.argv.includes("--story-only");
const socialOnly = process.argv.includes("--social-only");
if (storyOnly && socialOnly) {
  throw new Error("Choose either --story-only or --social-only, not both.");
}
const userId = "spectral-live-user";
const botIds = Object.freeze({
  ryuk: "spectral-live-ryuk",
  light: "spectral-live-light",
  lincoln: "spectral-live-lincoln",
});
const generatedAt = "2026-07-21T12:00:00.000Z";

const invisibleName = "Invisible";
const invisibleIntent = "Invisible to all other bots except Light Yagami.";
const introvertName = "Introvert";
const introvertIntent = "Speaks only to Light Yagami";
const ryukPowers = [{
  version: 1,
  id: "spectral-live-invisible",
  name: invisibleName,
  intent: invisibleIntent,
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(invisibleName, invisibleIntent),
    selfCue: "Remain unseen to everyone except Light Yagami.",
    observerCue: "Only Light Yagami can perceive Ryuk.",
    effects: [{
      type: "awareness",
      allowed: [{ kind: "bot", name: "Light Yagami" }],
    }],
    ruleLabels: ["Visible only to Light Yagami"],
  },
}, {
  version: 1,
  id: "spectral-live-introvert",
  name: introvertName,
  intent: introvertIntent,
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(introvertName, introvertIntent),
    selfCue: "Address only Light Yagami.",
    observerCue: "Only Light Yagami can hear Ryuk.",
    effects: [{
      type: "speech_audience",
      allowed: [{ kind: "bot", name: "Light Yagami" }],
    }],
    ruleLabels: ["Heard only by Light Yagami"],
  },
}];

const db = initializeDatabase(new DatabaseSync(":memory:"));
db.prepare(
  `INSERT INTO users
    (id, email, display_name, password_hash, password_salt, wrapped_user_key,
     wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider,
     preferred_local_model, created_at, last_active_at)
   VALUES (?, ?, 'Producer', 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?, ?)`,
).run(
  userId,
  "spectral-live@example.com",
  model,
  generatedAt,
  generatedAt,
);

function seedBot(id, name, systemPrompt, powers = []) {
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled,
       online_enabled, local_model, model, powers_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'spark', 1, 0, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    name,
    systemPrompt,
    name === "Ryuk" ? "#9272d8" : name === "Light Yagami" ? "#d6bf57" : "#6d91cc",
    model,
    model,
    JSON.stringify(powers),
    generatedAt,
    generatedAt,
  );
}

seedBot(
  botIds.ryuk,
  "Ryuk",
  "Ryuk is an amused supernatural observer. He speaks in complete, direct thoughts and never claims ordinary humans can perceive him.",
  ryukPowers,
);
seedBot(
  botIds.light,
  "Light Yagami",
  "Light Yagami is controlled, analytical, and fully able to see and hear Ryuk.",
);
seedBot(
  botIds.lincoln,
  "Abraham Lincoln",
  "Abraham Lincoln is thoughtful, patient, and unaware of supernatural beings he cannot perceive.",
);

const localProvider = new LocalOllamaProvider();
const captures = [];
const provider = {
  name: "local",
  async generateResponse(messages, options) {
    captures.push({
      messages: structuredClone(messages),
      usagePurpose: options.usagePurpose ?? null,
    });
    return localProvider.generateResponse(messages, { ...options, model });
  },
  async embedText(text, options) {
    return localProvider.embedText(text, options);
  },
};
const providerFactory = () => provider;
const generation = {
  preferredProvider: "local",
  preferredLocalModel: model,
  providerFactory,
};

if (!storyOnly) {
async function runSignal(hostBotId, guestBotId, topic, turns) {
  const show = createBotcastShow(db, userId, { hostBotId });
  let episode = createBotcastEpisode(db, userId, show.id, {
    guestBotId,
    topic,
    preferredProvider: "local",
    modelOverride: model,
    responseMode: "local",
  });
  for (let index = 0; index < turns; index += 1) {
    episode = (await advanceBotcastEpisode(
      db,
      userId,
      episode.id,
      {},
      generation,
    )).episode;
  }
  return episode;
}

const signalLincoln = await runSignal(
  botIds.lincoln,
  botIds.ryuk,
  "Whether unseen witnesses change history",
  3,
);
const signalLincolnLive = projectBotcastEpisodeForObserverV2(
  signalLincoln,
  "live",
);
const signalLincolnReplay = projectBotcastEpisodeForObserverV2(
  signalLincoln,
  "replay",
);
assert.equal(
  signalLincolnLive.observerProjection?.participants.guest.visibility,
  "hidden",
);
assert.equal(
  signalLincolnLive.observerProjection?.participants.guest.audible,
  false,
);
assert.equal(
  signalLincolnReplay.observerProjection?.participants.guest.visibility,
  "translucent",
);
assert.equal(
  signalLincolnReplay.observerProjection?.participants.guest.audible,
  true,
);
assert.ok(signalLincolnReplay.events.some(
  (event) =>
    event.kind === "power_effect" &&
    event.payload.effect === "perception_overlap",
));

const signalLight = await runSignal(
  botIds.light,
  botIds.ryuk,
  "A conversation only Light can receive",
  2,
);
const signalLightLive = projectBotcastEpisodeForObserverV2(
  signalLight,
  "live",
);
assert.equal(
  signalLightLive.observerProjection?.participants.guest.visibility,
  "translucent",
);
assert.equal(
  signalLightLive.observerProjection?.participants.guest.audible,
  true,
);

const signalRyukHost = await runSignal(
  botIds.ryuk,
  botIds.lincoln,
  "An interview hosted by a voice Lincoln cannot receive",
  2,
);
const signalRyukHostLive = projectBotcastEpisodeForObserverV2(
  signalRyukHost,
  "live",
);
const signalRyukHostReplay = projectBotcastEpisodeForObserverV2(
  signalRyukHost,
  "replay",
);
assert.equal(
  signalRyukHostLive.observerProjection?.participants.host.visibility,
  "hidden",
);
assert.equal(
  signalRyukHostReplay.observerProjection?.participants.host.visibility,
  "translucent",
);

async function createCoffee(botGroupIds, topic) {
  return createCoffeeConversation(db, userId, {
    groupBotIds: botGroupIds,
    initialTopic: topic,
  });
}
const coffeeSettings = {
  preferredProvider: "local",
  preferredLocalModel: model,
  sessionSpeakerModel: model,
  sessionRemainingMs: 120_000,
  providerFactory,
  auxiliaryProviderFactory: () => provider,
};
const coffeeLincoln = await createCoffee(
  [botIds.ryuk, botIds.lincoln],
  "What unseen witnesses owe history",
);
const firstCoffeeCapture = captures.length;
await processCoffeeTurn(
  db,
  userId,
  {
    conversationId: coffeeLincoln.conversation.id,
    message: "Ryuk, give your complete supernatural answer.",
    directedSpeakerBotId: botIds.ryuk,
  },
  coffeeSettings,
);
const replayAfterRyuk = getCoffeeConversationTranscript(
  db,
  userId,
  coffeeLincoln.conversation.id,
  "replay",
);
const ryukCoffeeLine = replayAfterRyuk.find(
  (message) => message.role === "assistant" && message.botId === botIds.ryuk,
);
assert.ok(ryukCoffeeLine?.content.trim());
const beforeLincolnCapture = captures.length;
await processCoffeeAutonomousTurn(
  db,
  userId,
  coffeeLincoln.conversation.id,
  coffeeSettings,
  false,
  botIds.lincoln,
);
const liveCoffeeLincoln = getCoffeeConversationTranscript(
  db,
  userId,
  coffeeLincoln.conversation.id,
  "live",
);
const replayCoffeeLincoln = getCoffeeConversationTranscript(
  db,
  userId,
  coffeeLincoln.conversation.id,
  "replay",
);
assert.equal(
  liveCoffeeLincoln.some((message) => message.id === ryukCoffeeLine.id),
  false,
);
assert.equal(
  replayCoffeeLincoln.some((message) => message.id === ryukCoffeeLine.id),
  true,
);
const lincolnGenerationPrompts = captures
  .slice(beforeLincolnCapture)
  .filter((capture) => capture.usagePurpose === "coffee_turn")
  .flatMap((capture) => capture.messages.map((message) => message.content));
assert.equal(
  lincolnGenerationPrompts.some((content) => content.includes(ryukCoffeeLine.content)),
  false,
);
const lincolnCoffeeLine = replayCoffeeLincoln.findLast(
  (message) => message.role === "assistant" && message.botId === botIds.lincoln,
);
assert.ok(
  lincolnCoffeeLine?.coffeeReplayEvents?.some(
    (event) => event.kind === "perceptionOverlap",
  ),
);
assert.ok(captures.length > firstCoffeeCapture);

const coffeeLight = await createCoffee(
  [botIds.ryuk, botIds.light],
  "What only Light can hear",
);
await processCoffeeTurn(
  db,
  userId,
  {
    conversationId: coffeeLight.conversation.id,
    message: "Ryuk, answer Light directly.",
    directedSpeakerBotId: botIds.ryuk,
  },
  coffeeSettings,
);
const liveCoffeeLight = getCoffeeConversationTranscript(
  db,
  userId,
  coffeeLight.conversation.id,
  "live",
);
const visibleRyukCoffeeLine = liveCoffeeLight.find(
  (message) => message.role === "assistant" && message.botId === botIds.ryuk,
);
assert.equal(visibleRyukCoffeeLine?.coffeeObserverProjection?.visibility, "translucent");
assert.equal(visibleRyukCoffeeLine?.coffeeObserverProjection?.audible, true);
}

let story = null;
if (!socialOnly) {
const storyBots = loadStoryBotProfiles(db, userId, [botIds.ryuk, botIds.lincoln]);
const storySession = createStorySession(db, userId, {
  botIds: [botIds.ryuk, botIds.lincoln],
  provider: "local",
  model,
  premise:
    "Ryuk delivers a complete supernatural warning, then Abraham Lincoln begins a complete response without seeing or hearing Ryuk. Time never pauses.",
});
const storyCaptureStart = captures.length;
story = await generateStorySessionEpisode(
  db,
  userId,
  storySession.id,
  {
    provider,
    providerName: "local",
    model,
    bots: storyBots,
    premise: storySession.premise,
  },
);
const storyPrompt = captures
  .slice(storyCaptureStart)
  .flatMap((capture) => capture.messages.map((message) => message.content))
  .join("\n");
assert.match(storyPrompt, /narrator and player always see Ryuk half-translucently/u);
assert.match(storyPrompt, /Abraham Lincoln cannot see or hear Ryuk/u);
assert.match(storyPrompt, /never pause time/u);
if (!story.episode?.scenes.length) {
  throw new Error(`Story live generation failed: ${story.error ?? "no episode returned"}`);
}
}

console.log(JSON.stringify({
  pass: true,
  provider: provider.name,
  model,
  responseMode: "LOCAL",
  signal: storyOnly ? { skipped: true } : {
    lincolnGuestHiddenLive: true,
    lightRevealsRyukLive: true,
    replayRevealsGuest: true,
    invisibleHostOrientation: true,
    perceptionOverlap: true,
  },
  coffee: storyOnly ? { skipped: true } : {
    hiddenTurnPersisted: true,
    lincolnPromptExcludedRyuk: true,
    lightRevealsRyukLive: true,
    replayRevealsRyuk: true,
    perceptionOverlap: true,
  },
  story: socialOnly ? { skipped: true } : {
    generatedSceneCount: story.episode?.scenes.length ?? 0,
    omniscientReaderPrompt: true,
    unawareLincolnPrompt: true,
    noTimePauseRule: true,
  },
}, null, 2));

db.close();
