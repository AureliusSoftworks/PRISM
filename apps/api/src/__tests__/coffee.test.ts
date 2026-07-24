import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { selectProvider, type GenerateOptions, type LlmProvider } from "../providers.ts";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  COFFEE_OPENING_ARRIVAL_WINDOW_MS,
  advanceCoffeeTeamStateAfterReply,
  autoTagPeerMentionsInCoffeeReply,
  applyCoffeeMoodSessionNoShows,
  applyCoffeeEmptyCupMoodHits,
  applyCoffeeSessionStartMoodBias,
  buildCoffeeConversationQualityState,
  buildCoffeeDepartureOpportunity,
  buildCoffeeRefillRequestOpportunity,
  buildCoffeeEmergencyFallbackReply,
  buildCoffeeFreshFallbackBeat,
  buildCoffeeRequiredDepartureReply,
  buildCoffeeRequiredSessionWrapReply,
  buildCoffeePollExportLines,
  buildCoffeeTableTuningAppendix,
  buildRouterPrompt,
  buildSpeakerPrompt,
  applyCoffeeRelationshipSocialDeltas,
  clampCoffeeSocialValue,
  clampCoffeeTableReplyText,
  coffeeLatestMessageIdChanged,
  coffeeMessageBelongsInBotPromptHistory,
  coffeeFallbackFocusPhrase,
  coffeeHistoryVisibleToSpeakerAfterFirmSeat,
  coffeeDepartureOpportunityRequiresExit,
  coffeeDepartureOpportunityRequiresWrap,
  coffeeEmptyCupGroupShouldWrap,
  coffeeEffectiveReasoningEffort,
  coffeeLateOpeningMissingBotIds,
  coffeePresentBotIdsForTurn,
  coffeePromptAbsentBotIdsForTurn,
  coffeeReplyBreaksCharacterImmersion,
  coffeeReplySignalsPoliteDeparture,
  coffeeReplySignalsSessionWrap,
  coffeeMeetingSummarySourceMessages,
  coffeeReplyIsLowValueTableLine,
  coffeeReplyIsPunctuationOnly,
  coffeeReplyNeedsTopicAnchor,
  coffeeReplyLooksUnfinished,
  coffeeReplyLooksLikePromptLeak,
  coffeeReplyRepeatsRecentAssistant,
  coffeeReplyRepeatsRecentMotifs,
  coffeeReplyRepeatsPollFallbackShape,
  coffeeReplyRepeatsStockFallbackShape,
  coffeeRepairMaxTokensForTurn,
  coffeeSpeakerMaxTokensForTurn,
  coffeeUserMessageIsActionOnly,
  collectCoffeePollVotes,
  computePlayerInterruptionConsequences,
  computeNextCoffeeSocialState,
  createCoffeeGroup,
  createCoffeeGroupWithGeneratedName,
  createCoffeeConversation,
  createCoffeeConversationFromGroup,
  beginCoffeeBarDelivery,
  claimCoffeeDrinkReaction,
  chooseCoffeeBarRole,
  chooseCoffeeHouseDrink,
  completeCoffeeSpecialOrder,
  deliverCoffeeBarOrder,
  createCoffeePoll,
  createCoffeePreset,
  createCoffeeTeamsForSession,
  deleteCoffeeGroup,
  deleteCoffeePreset,
  getCoffeeConversationTranscript,
  projectCoffeeMessagesForObserverV1,
  coffeeMessagesVisibleInExport,
  getCoffeeSessionPoll,
  generateCoffeeSessionSynopsis,
  updateCoffeeConversationSettings,
  listCoffeePresets,
  effectiveCoffeeSpeakerProvider,
  extractCoffeeRelationshipSignals,
  extractLastAddressedBotId,
  inferCoffeeGroupName,
  inferCoffeeGroupStarterTopics,
  inferCoffeeStarterTopics,
  initializeCoffeeSocialState,
  interruptedSnippetFromTokenCount,
  loadCoffeeAttendanceContext,
  loadCoffeeStarterMemoryContext,
  loadCoffeeSessionMemoryChangeLines,
  listCoffeeGroups,
  formatCoffeeAttendancePromptSummary,
  maybeBuildBotInterruptionEvent,
  normalizeCoffeeGroupBotIds,
  normalizeCoffeeSeatBotIds,
  normalizeCoffeeSessionSynopsis,
  normalizeCoffeeUserActionText,
  recordCoffeeInterruptionPause,
  parseCoffeePollStructuredBallot,
  parseStoredBotGroupIds,
  parseStoredCoffeeSeatBotIds,
  parseStoredCoffeeSessionSettings,
  parseRouterResponse,
  persistCoffeeMeetingSummaryIfNewer,
  pickCoffeeSpeakerBalanceOverride,
  pickDirectedSpeaker,
  processCoffeeAutonomousTurn,
  prepareCoffeeSpecialOrder,
  pickFallbackSpeaker,
  processCoffeeTurn,
  randomizeCoffeeSeatBotIdsForSession,
  coffeePlayerDepartureEpilogueFocus,
  coffeePlayerDepartureEpilogueShouldStop,
  coffeePlayerDepartureEpilogueTurnCount,
  coffeeIdentityMirrorPromptForSpeaker,
  coffeeIdentityMirrorStatesFromHistory,
  applyCoffeeIdentityMirrorIrritation,
  recordCoffeeFinalBotDepartureReplayEvents,
  recordCoffeePlayerDeparture,
  recordCoffeeUserAction,
  recordCoffeeReplayEvents,
  repairBotMentionBrackets,
  restartCoffeeConversationFromSession,
  resolveCoffeeAutonomousSpeakerHandoff,
  resolveCoffeeIdentityMirrorDirectAddresseeV1,
  resolveCoffeeMoodBoostRecipientIdsV1,
  resolveCoffeeMoodDrainHolderIdsV1,
  respondCoffeeWaiterOffer,
  coffeeMoodDrainPromptForSpeakerV1,
  coffeeMoodBoostPromptForSpeakerV1,
  coffeePowerPeerAddressLabelsV1,
  resolveCoffeeTeamTiebreaker,
  seedCoffeeSocialStateFromRelationships,
  setCoffeePlayerTeam,
  shouldRefreshCoffeeMeetingSummary,
  setCoffeeConversationTopic,
  sanitizeCoffeeTableReply,
  sipCoffeePlayerCup,
  kickoffCoffeeMeetingSummaryRefresh,
  topOffCoffeeCupForBot,
  failCoffeeSpecialOrder,
  finishCoffeeDrinkReaction,
  stripCoffeeSpeakerPrefix,
  coffeeTextMentionsInternalAccountMetadata,
  undoLatestCoffeeDebugMessage,
  updateCoffeeBotSocialDebug,
  updateCoffeeGroup,
  updateCoffeeGroupWithGeneratedTopics,
  updateCoffeePreset,
  type CoffeeBotProfile,
} from "../coffee.ts";
import { encryptJson } from "../security.ts";
import {
  DEFAULT_BOT_PROFILE_FIELDS,
  applyBotPowerMumbledResponseV1,
  botPowerSourceHashV1,
  coffeeDepartureChanceFromSocial,
  coffeeMoodSaturationFromSocial,
  coffeeSocialSnapshotToPrismMoodState,
  coffeeReplyLengthCaps,
  coffeeFarewellReplyDelay,
  coffeeReusableSessionSettings,
  coffeeRouterTemperature,
  createBotIdentityMirrorStateV1,
  derivePrismMoodKey,
  COFFEE_TOPIC_MAX_LENGTH,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  parseStoredAssistantToolPayload,
  serializeAssistantToolPayload,
  serializeStoredBotPrompt,
  normalizeCoffeeSessionSettings,
  type ChatMessage,
  type CoffeePowerPlanV1,
  type CoffeePoll,
  type CoffeeTeamState,
} from "@localai/shared";
import {
  applyCoffeePowerMoodBoostAfterSpeech,
  applyCoffeePowerMoodDrainAfterDirectAddress,
  coffeePowerBotAudibleTo,
  coffeePowerBotCanSpeak,
  coffeePowerBotVisibleTo,
  coffeePowersPromptForSpeaker,
  parseCoffeePowerPlan,
} from "../coffee-powers.ts";

/**
 * Coffee mode is the multi-bot turn-taking primitive that downstream
 * modes (Arena, Polling, Feed) build on. These tests pin the small,
 * pure helpers that decide WHICH bot speaks each turn — the part the
 * design discussion locked as "reactive routing via an LLM moderator
 * with a graceful round-robin fallback when the moderator misfires."
 */

const ALICE: CoffeeBotProfile = {
  id: "bot-alice",
  name: "Alice",
  systemPrompt: "Curious philosopher who loves Socratic questions.",
  color: "#ff6699",
  glyph: "leaf",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const BORIS: CoffeeBotProfile = {
  id: "bot-boris",
  name: "Boris",
  systemPrompt: "Grumpy chef who makes everything about food.",
  color: "#33aa55",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const MR_KRABS: CoffeeBotProfile = {
  id: "bot-krabs",
  name: "Mr. Krabs",
  systemPrompt: "Protective restaurant owner who guards the Krabby Patty formula.",
  color: "#ff4444",
  glyph: "anchor",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const PLANKTON: CoffeeBotProfile = {
  id: "bot-plankton",
  name: "Plankton",
  systemPrompt: "Scheming Chum Bucket owner who despises the Krusty Krab.",
  color: "#00aa88",
  glyph: "eye",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const JESUS: CoffeeBotProfile = {
  id: "bot-jesus",
  name: "Jesus Christ",
  systemPrompt: "Jesus Christ, teacher of mercy, forgiveness, resurrection, sacrificial love, and the Kingdom of God.",
  color: "#3399ff",
  glyph: "fish",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const CARA: CoffeeBotProfile = {
  id: "bot-cara",
  name: "Cara",
  systemPrompt: "Pragmatic engineer who plans things in lists.",
  color: "#3377ff",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const DANTE: CoffeeBotProfile = {
  id: "bot-dante",
  name: "Dante",
  systemPrompt: "Theatre critic who listens for tension and subtext.",
  color: "#9944ff",
  glyph: "moon",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const ELENA: CoffeeBotProfile = {
  id: "bot-elena",
  name: "Elena",
  systemPrompt: "Archivist who keeps returning abstractions to concrete evidence.",
  color: "#ffaa33",
  glyph: "book",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const TEST_SOCIAL = {
  disposition: 0.5,
  valuesFriction: 0.25,
  restraint: 0.72,
  engagement: 0.62,
  leavePressure: 0.18,
};

function coffeeTestMoodKey(social: {
  disposition: number;
  valuesFriction: number;
  restraint: number;
  engagement: number;
  leavePressure: number;
}) {
  return derivePrismMoodKey(coffeeSocialSnapshotToPrismMoodState(social));
}

function withStructuredPrompt(
  bot: CoffeeBotProfile,
  options: {
    role?: string;
    purpose?: string;
    interests?: string;
    values?: string;
    traits?: string;
    boundaries?: string;
  }
): CoffeeBotProfile {
  const profile = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
  if (options.role) profile.identity.role = options.role;
  if (options.purpose) profile.purpose.statement = options.purpose;
  if (options.interests) profile.core.interests = options.interests;
  if (options.values) profile.worldview.values = options.values;
  if (options.traits) profile.core.traits = options.traits;
  if (options.boundaries) profile.core.boundaries = options.boundaries;
  return {
    ...bot,
    systemPrompt: serializeStoredBotPrompt(profile, bot.name),
  };
}

describe("Coffee spectral observer projection", () => {
  const message: ChatMessage = {
    id: "line-1",
    role: "assistant",
    content: "The whole hidden answer survives.",
    createdAt: "2026-07-21T00:00:00.000Z",
    botId: "ryuk",
    botName: "Ryuk",
  };
  const plan = (effects: CoffeePowerPlanV1["bots"][string]["effects"]): CoffeePowerPlanV1 => ({
    version: 1,
    resolvedAt: "2026-07-21T00:00:00.000Z",
    warnings: [],
    bots: {
      ryuk: {
        botId: "ryuk",
        powerIds: ["invisible"],
        powerNames: ["Invisible"],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects,
        ruleLabels: [],
        warnings: [],
      },
    },
  });
  const light = { kind: "bot" as const, name: "Light Yagami", botId: "light" };
  const seer = { kind: "bot" as const, name: "Seer", botId: "seer" };

  it("keeps restricted turns generatable and resolves sight and hearing pairwise", () => {
    const restricted = plan([
      { type: "awareness", allowed: [light] },
      { type: "speech_audience", allowed: [light] },
      { type: "avatar_visibility", mode: "translucent" },
    ]);
    assert.equal(coffeePowerBotCanSpeak(restricted, "ryuk"), true);
    assert.equal(coffeePowerBotVisibleTo(restricted, "ryuk", "light"), true);
    assert.equal(coffeePowerBotAudibleTo(restricted, "ryuk", "light"), true);
    assert.equal(coffeePowerBotVisibleTo(restricted, "ryuk", "lincoln"), false);
    assert.equal(coffeePowerBotAudibleTo(restricted, "ryuk", "lincoln"), false);
  });

  it("upgrades frozen targeted-Invisible plans idempotently", () => {
    const legacy = plan([{ type: "awareness", allowed: [light] }]);
    const upgraded = parseCoffeePowerPlan(JSON.stringify(legacy));
    const upgradedAgain = parseCoffeePowerPlan(JSON.stringify(upgraded));
    assert.deepEqual(upgradedAgain, upgraded);
    assert.deepEqual(upgraded?.bots.ryuk?.effects, [
      { type: "awareness", allowed: [light] },
      { type: "avatar_visibility", mode: "translucent" },
    ]);
  });

  it("separates all four live sight/sound combinations and replay access", () => {
    const both = plan([
      { type: "awareness", allowed: [light] },
      { type: "speech_audience", allowed: [light] },
      { type: "avatar_visibility", mode: "translucent" },
    ]);
    assert.deepEqual(
      projectCoffeeMessagesForObserverV1({
        messages: [message], plan: both, participatingBotIds: ["lincoln"], perspective: "live",
      }),
      [],
    );
    const revealed = projectCoffeeMessagesForObserverV1({
      messages: [message], plan: both, participatingBotIds: ["light"], perspective: "live",
    })[0]!;
    assert.equal(revealed.content, message.content);
    assert.equal(revealed.coffeeObserverProjection?.visibility, "translucent");
    assert.equal(revealed.coffeeObserverProjection?.audible, true);

    const audibleOnly = projectCoffeeMessagesForObserverV1({
      messages: [message],
      plan: plan([
        { type: "awareness", allowed: [seer] },
        { type: "speech_audience", allowed: [light] },
        { type: "avatar_visibility", mode: "translucent" },
      ]),
      participatingBotIds: ["light"],
      perspective: "live",
    })[0]!;
    assert.equal(audibleOnly.coffeeObserverProjection?.visibility, "hidden");
    assert.equal(audibleOnly.coffeeObserverProjection?.audible, true);

    const visibleOnly = projectCoffeeMessagesForObserverV1({
      messages: [message],
      plan: plan([
        { type: "awareness", allowed: [light] },
        { type: "speech_audience", allowed: [seer] },
        { type: "avatar_visibility", mode: "translucent" },
      ]),
      participatingBotIds: ["light"],
      perspective: "live",
    })[0]!;
    assert.equal(visibleOnly.content, "...");
    assert.equal(visibleOnly.coffeeObserverProjection?.visibility, "translucent");
    assert.equal(visibleOnly.coffeeObserverProjection?.audible, false);

    const replay = projectCoffeeMessagesForObserverV1({
      messages: [message], plan: both, participatingBotIds: ["lincoln"], perspective: "replay",
    })[0]!;
    assert.equal(replay.content, message.content);
    assert.equal(replay.coffeeObserverProjection?.visibility, "translucent");
    assert.equal(replay.coffeeObserverProjection?.audible, true);
  });

  it("does not disclose ordinary private speech during replay", () => {
    const replay = projectCoffeeMessagesForObserverV1({
      messages: [message],
      plan: plan([{ type: "speech_audience", allowed: [light] }]),
      participatingBotIds: ["lincoln"],
      perspective: "replay",
    })[0]!;
    assert.equal(replay.content, "...");
    assert.equal(replay.coffeeObserverProjection?.spectral, false);
    assert.equal(replay.coffeeObserverProjection?.audible, false);
  });

  it("keeps a hidden prior line out of every unaware autonomous speaker prompt", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const ryuk = {
      ...ALICE,
      id: "spectral-ryuk",
      name: "Ryuk",
      systemPrompt: "Ryuk is a supernatural observer who completes every thought.",
    };
    const lincoln = {
      ...BORIS,
      id: "spectral-lincoln",
      name: "Abraham Lincoln",
      systemPrompt: "Lincoln reacts only to what he personally perceives.",
    };
    seedCoffeeBot(db, userId, ryuk);
    seedCoffeeBot(db, userId, lincoln);
    const invisibleIntent = "Invisible to all other bots except Light Yagami.";
    const introvertIntent = "Speaks only to Light Yagami.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "invisible",
        name: "Invisible",
        intent: invisibleIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1("Invisible", invisibleIntent),
          selfCue: "Remain unseen except to Light.",
          observerCue: "Only Light can perceive Ryuk.",
          effects: [{
            type: "awareness",
            allowed: [{ kind: "bot", name: "Light Yagami" }],
          }],
          ruleLabels: [],
        },
      }, {
        version: 1,
        id: "introvert",
        name: "Introvert",
        intent: introvertIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1("Introvert", introvertIntent),
          selfCue: "Address only Light.",
          observerCue: "Only Light can hear Ryuk.",
          effects: [{
            type: "speech_audience",
            allowed: [{ kind: "bot", name: "Light Yagami" }],
          }],
          ruleLabels: [],
        },
      }]),
      ryuk.id,
    );
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ryuk.id, lincoln.id],
      initialTopic: "Unseen witnesses",
    });
    const hiddenLine = "HIDDEN SPECTRAL SENTINEL: Ryuk finishes this entire warning.";
    await withMockedCoffeeFetch(hiddenLine, () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId: session.conversation.id,
          message: "Ryuk, give the whole warning.",
          directedSpeakerBotId: ryuk.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    const lincolnBodies: unknown[] = [];
    await withMockedCoffeeFetch(
      "I will begin from the evidence plainly before me.",
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        session.conversation.id,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
        false,
        lincoln.id,
      ),
      { chatBodies: lincolnBodies },
    );

    assert.doesNotMatch(JSON.stringify(lincolnBodies), /HIDDEN SPECTRAL SENTINEL/u);
    const replay = getCoffeeConversationTranscript(
      db,
      userId,
      session.conversation.id,
      "replay",
    );
    assert.ok(replay.some((message) => message.content === hiddenLine));
    assert.ok(
      replay.findLast((message) => message.botId === lincoln.id)
        ?.coffeeReplayEvents?.some((event) => event.kind === "perceptionOverlap"),
    );
  });
});

describe("Coffee listener reaction persistence", () => {
  it("attaches one deterministic listener event to the saved speaker message without routing side effects", () => {
    const source = readFileSync(new URL("../coffee.ts", import.meta.url), "utf8");
    assert.match(source, /buildCoffeeListenerReactionPlanV1\(\{/u);
    assert.match(source, /crossTalk: sessionSettings\.crossTalk/u);
    assert.match(source, /kind: "listenerReaction"/u);
    assert.match(source, /messageId: assistantMessageId/u);
    assert.match(source, /coffeeReplayEvents,[\s\S]{0,180}autoRecovery/u);
    assert.match(source, /turnKind === "autonomous"/u);
    assert.match(source, /!sessionKickoff/u);
    assert.match(source, /activePoll === null/u);
    assert.match(source, /interruptionEvent === undefined/u);
    assert.match(source, /departurePersistence === null/u);
    assert.match(source, /listenerIsInAudience/u);
    assert.match(source, /coffeePowerBotVisibleTo/u);
    assert.match(
      source,
      /event\.plan\.spokenCue \|\| event\.plan\.vocalFoley/u,
    );
    assert.doesNotMatch(
      source,
      /listenerReaction[\s\S]{0,120}coffeeBotSocialById\s*=/u,
    );
  });
});

test("Coffee applies one replayable Joyful Nora lift per recipient and source turn", () => {
  const plan = {
    version: 1 as const,
    resolvedAt: "2026-07-21T00:00:00.000Z",
    warnings: [],
    bots: {
      nora: {
        botId: "nora",
        powerIds: ["joyful-nora"],
        powerNames: ["Radiant Joy"],
        selfCue: "Radiate joy.",
        observerCue: "Listeners feel lighter.",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [{
          type: "mood_boost" as const,
          trigger: "after_spoken_turn" as const,
          recipients: "addressed" as const,
          strength: "medium" as const,
        }],
        ruleLabels: ["Radiant joy"],
        warnings: [],
      },
      boris: {
        botId: "boris",
        powerIds: [],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [],
        ruleLabels: [],
        warnings: [],
      },
    },
  };
  const recipients = resolveCoffeeMoodBoostRecipientIdsV1({
    line: "Boris, the problem is real—and I am delighted we get to face it together.",
    speakerBotId: "nora",
    seatedBots: [
      { id: "nora", name: "Joyful Nora" },
      { id: "boris", name: "Boris" },
      { id: "cara", name: "Cara" },
    ],
  });
  assert.deepEqual(recipients, ["boris"]);
  assert.deepEqual(
    resolveCoffeeMoodBoostRecipientIdsV1({
      line: "Friends, I am so glad the whole table is here.",
      speakerBotId: "nora",
      seatedBots: [
        { id: "nora", name: "Joyful Nora" },
        { id: "boris", name: "Boris" },
        { id: "cara", name: "Cara" },
      ],
    }),
    ["boris", "cara"],
  );

  const first = applyCoffeePowerMoodBoostAfterSpeech({
    plan,
    speakerBotId: "nora",
    sourceMessageId: "turn-1",
    sourceContent: "Boris, the problem is real—and I am delighted we get to face it together.",
    recipientBotIds: recipients,
    socialByBotId: {
      nora: { disposition: 0.9 },
      boris: { disposition: 0.42 },
    },
    occurredAt: "2026-07-21T00:00:01.000Z",
  });
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0]?.powerName, "Radiant Joy");
  assert.ok((first.socialByBotId.boris?.disposition ?? 0) > 0.42);
  assert.ok((first.socialByBotId.boris?.disposition ?? 2) <= 1);

  const repeated = applyCoffeePowerMoodBoostAfterSpeech({
    plan,
    speakerBotId: "nora",
    sourceMessageId: "turn-1",
    sourceContent: "Boris, the problem is real—and I am delighted we get to face it together.",
    recipientBotIds: ["boris", "boris"],
    socialByBotId: first.socialByBotId,
    existingEvents: first.events,
    occurredAt: "2026-07-21T00:00:02.000Z",
  });
  assert.equal(repeated.events.length, 0);
  assert.equal(
    repeated.socialByBotId.boris?.disposition,
    first.socialByBotId.boris?.disposition,
  );

  const muted = applyCoffeePowerMoodBoostAfterSpeech({
    plan,
    speakerBotId: "nora",
    sourceMessageId: "turn-muted",
    sourceContent: "...",
    recipientBotIds: ["boris"],
    socialByBotId: first.socialByBotId,
    occurredAt: "2026-07-21T00:00:03.000Z",
  });
  assert.equal(muted.events.length, 0);
  assert.equal(
    muted.socialByBotId.boris?.disposition,
    first.socialByBotId.boris?.disposition,
  );

  const roundTrip = parseStoredAssistantToolPayload(
    serializeAssistantToolPayload({ coffeeReplayEvents: first.events }),
  );
  assert.deepEqual(roundTrip.coffeeReplayEvents, first.events);

});

test("Coffee drains only a bot that directly talks to Sad Sally", () => {
  const plan = {
    version: 1 as const,
    resolvedAt: "2026-07-21T02:00:00.000Z",
    warnings: [],
    bots: {
      sally: {
        botId: "sally",
        powerIds: ["sad-sally"],
        powerNames: ["Sad"],
        selfCue: "Remain gloomy and grating.",
        observerCue: "Direct address drains the addresser.",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [{
          type: "mood_drain" as const,
          trigger: "after_direct_address" as const,
          recipient: "addresser" as const,
          strength: "medium" as const,
        }],
        ruleLabels: ["Drains direct addresser mood"],
        warnings: [],
      },
      boris: {
        botId: "boris",
        powerIds: [],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [],
        ruleLabels: [],
        warnings: [],
      },
      cara: {
        botId: "cara",
        powerIds: [],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [],
        ruleLabels: [],
        warnings: [],
      },
    },
  };
  const seatedBots = [
    { id: "sally", name: "Sad Sally" },
    { id: "boris", name: "Boris" },
    { id: "cara", name: "Cara" },
  ];
  assert.deepEqual(resolveCoffeeMoodDrainHolderIdsV1({
    line: "Sally, that complaint is exhausting, but I need your answer.",
    speakerBotId: "boris",
    seatedBots,
  }), ["sally"]);
  assert.deepEqual(resolveCoffeeMoodDrainHolderIdsV1({
    line: "Everyone, we need an answer.",
    speakerBotId: "boris",
    seatedBots,
  }), []);

  const first = applyCoffeePowerMoodDrainAfterDirectAddress({
    plan,
    addresserBotId: "boris",
    addressedHolderBotIds: ["sally"],
    sourceMessageId: "turn-drain-1",
    sourceContent: "Sally, that complaint is exhausting, but I need your answer.",
    socialByBotId: {
      sally: { disposition: 0.2 },
      boris: { disposition: 0.6 },
      cara: { disposition: 0.7 },
    },
    occurredAt: "2026-07-21T02:00:01.000Z",
  });
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0]?.botId, "boris");
  assert.equal(first.events[0]?.sourceBotId, "sally");
  assert.ok((first.socialByBotId.boris?.disposition ?? 1) < 0.6);
  assert.equal(first.socialByBotId.cara?.disposition, 0.7);

  const repeated = applyCoffeePowerMoodDrainAfterDirectAddress({
    plan,
    addresserBotId: "boris",
    addressedHolderBotIds: ["sally", "sally"],
    sourceMessageId: "turn-drain-1",
    sourceContent: "Sally, I am still talking to you.",
    socialByBotId: first.socialByBotId,
    existingEvents: first.events,
    occurredAt: "2026-07-21T02:00:02.000Z",
  });
  assert.equal(repeated.events.length, 0);
  assert.equal(
    repeated.socialByBotId.boris?.disposition,
    first.socialByBotId.boris?.disposition,
  );

  const muted = applyCoffeePowerMoodDrainAfterDirectAddress({
    plan,
    addresserBotId: "boris",
    addressedHolderBotIds: ["sally"],
    sourceMessageId: "turn-drain-muted",
    sourceContent: "...",
    socialByBotId: first.socialByBotId,
    occurredAt: "2026-07-21T02:00:03.000Z",
  });
  assert.equal(muted.events.length, 0);

  const roundTrip = parseStoredAssistantToolPayload(
    serializeAssistantToolPayload({ coffeeReplayEvents: first.events }),
  );
  assert.deepEqual(roundTrip.coffeeReplayEvents, first.events);

  const nextTurnCue = coffeeMoodDrainPromptForSpeakerV1({
    history: [{
      id: "turn-drain-1",
      role: "assistant",
      botId: "boris",
      content: "Sally, that complaint is exhausting, but I need your answer.",
      coffeeReplayEvents: first.events,
    }],
    speakerBotId: "boris",
    group: seatedBots,
  });
  assert.match(nextTurnCue ?? "", /directly speaking to Sad Sally/iu);
  assert.match(nextTurnCue ?? "", /showing your own reduced momentum in first person or through one visible \*stage action\*/iu);
  assert.match(nextTurnCue ?? "", /observable loss of momentum fails this Power/iu);
  assert.equal(
    coffeeMoodDrainPromptForSpeakerV1({
      history: [{
        id: "unrelated",
        role: "assistant",
        botId: "boris",
        content: "A later unaffected line.",
      }],
      speakerBotId: "boris",
      group: seatedBots,
    }),
    null,
  );
});

test("Coffee applies only the active Nocturnal theme branch and persists it", () => {
  const plan = {
    version: 1 as const,
    resolvedAt: "2026-07-21T03:00:00.000Z",
    warnings: [],
    bots: {
      owl: {
        botId: "owl",
        powerIds: ["nocturnal"],
        powerNames: ["Nocturnal"],
        selfCue: "Follow the current resolved theme.",
        observerCue: "Dark is joyful; Light is sad.",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [
          {
            type: "mood_boost" as const,
            trigger: "after_spoken_turn" as const,
            recipients: "addressed" as const,
            strength: "medium" as const,
            whenTheme: "dark" as const,
          },
          {
            type: "mood_drain" as const,
            trigger: "after_direct_address" as const,
            recipient: "addresser" as const,
            strength: "medium" as const,
            whenTheme: "light" as const,
          },
        ],
        ruleLabels: ["Circadian"],
        warnings: [],
      },
      boris: {
        botId: "boris",
        powerIds: [],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects: [],
        ruleLabels: [],
        warnings: [],
      },
    },
  };
  const social = {
    owl: { disposition: 0.5 },
    boris: { disposition: 0.5 },
  };

  const lightBoost = applyCoffeePowerMoodBoostAfterSpeech({
    plan,
    speakerBotId: "owl",
    sourceMessageId: "light-owl",
    sourceContent: "Boris, hello.",
    recipientBotIds: ["boris"],
    socialByBotId: social,
    occurredAt: "2026-07-21T03:00:01.000Z",
    theme: "light",
  });
  assert.equal(lightBoost.events.length, 0);
  const darkBoost = applyCoffeePowerMoodBoostAfterSpeech({
    plan,
    speakerBotId: "owl",
    sourceMessageId: "dark-owl",
    sourceContent: "Boris, this night feels alive.",
    recipientBotIds: ["boris"],
    socialByBotId: social,
    occurredAt: "2026-07-21T03:00:02.000Z",
    theme: "dark",
  });
  assert.equal(darkBoost.events[0]?.theme, "dark");
  assert.ok((darkBoost.socialByBotId.boris?.disposition ?? 0) > 0.5);
  const boostHistory = [{
    id: "before-boost",
    role: "assistant" as const,
    botId: "boris",
    botName: "Boris",
    content: "I remain unconvinced.",
  }, {
    id: "dark-owl",
    role: "assistant" as const,
    botId: "owl",
    botName: "Owl",
    content: "Boris, this night feels alive.",
    coffeeReplayEvents: darkBoost.events,
  }];
  assert.match(
    coffeeMoodBoostPromptForSpeakerV1({
      history: boostHistory,
      speakerBotId: "boris",
      group: [{ id: "owl", name: "Owl" }, { id: "boris", name: "Boris" }],
    }) ?? "",
    /Coffee Power uplift:[\s\S]*own voice and personality[\s\S]*without agreeing/iu,
  );
  assert.equal(
    coffeeMoodBoostPromptForSpeakerV1({
      history: [...boostHistory, {
        id: "after-boost",
        role: "assistant" as const,
        botId: "boris",
        botName: "Boris",
        content: "The possibility is worth testing.",
      }],
      speakerBotId: "boris",
      group: [{ id: "owl", name: "Owl" }, { id: "boris", name: "Boris" }],
    }),
    null,
  );

  const darkDrain = applyCoffeePowerMoodDrainAfterDirectAddress({
    plan,
    addresserBotId: "boris",
    addressedHolderBotIds: ["owl"],
    sourceMessageId: "dark-boris",
    sourceContent: "Owl, answer me.",
    socialByBotId: social,
    occurredAt: "2026-07-21T03:00:03.000Z",
    theme: "dark",
  });
  assert.equal(darkDrain.events.length, 0);
  const lightDrain = applyCoffeePowerMoodDrainAfterDirectAddress({
    plan,
    addresserBotId: "boris",
    addressedHolderBotIds: ["owl"],
    sourceMessageId: "light-boris",
    sourceContent: "Owl, answer me.",
    socialByBotId: social,
    occurredAt: "2026-07-21T03:00:04.000Z",
    theme: "light",
  });
  assert.equal(lightDrain.events[0]?.theme, "light");
  assert.ok((lightDrain.socialByBotId.boris?.disposition ?? 1) < 0.5);

  assert.match(
    coffeePowersPromptForSpeaker(plan, "owl", ["boris"], social, undefined, null, "dark"),
    /only the radiant-joy branch is active/iu,
  );
  assert.deepEqual(
    parseStoredAssistantToolPayload(
      serializeAssistantToolPayload({ coffeeReplayEvents: darkBoost.events }),
    ).coffeeReplayEvents,
    darkBoost.events,
  );
});

describe("normalizeCoffeeGroupBotIds", () => {
  it("accepts a 2-bot group and preserves caller order", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("dedupes repeated ids before length-checking", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-a", "bot-b", "bot-c"]);
    assert.deepEqual(result, ["bot-a", "bot-b", "bot-c"]);
  });

  it("rejects groups smaller than the minimum size", () => {
    assert.throws(
      () => normalizeCoffeeGroupBotIds(["bot-a"]),
      /Pick at least .* bots/
    );
    assert.throws(
      () => normalizeCoffeeGroupBotIds([]),
      new RegExp(`at least ${COFFEE_GROUP_MIN_SIZE}`)
    );
  });

  it("rejects groups larger than the maximum size", () => {
    const tooMany = Array.from({ length: COFFEE_GROUP_MAX_SIZE + 1 }, (_, i) => `bot-${i}`);
    assert.throws(() => normalizeCoffeeGroupBotIds(tooMany), /max out at/);
  });

  it("ignores non-string entries instead of including them", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", 42, null, "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("throws when the input is not an array", () => {
    assert.throws(() => normalizeCoffeeGroupBotIds("bot-a" as unknown), /Coffee groups need/);
    assert.throws(() => normalizeCoffeeGroupBotIds(undefined), /Coffee groups need/);
  });
});

describe("normalizeCoffeeSeatBotIds", () => {
  it("preserves fixed seat positions while validating occupied seats", () => {
    const result = normalizeCoffeeSeatBotIds([null, "bot-a", null, "bot-b", null]);
    assert.deepEqual(result, [null, "bot-a", null, "bot-b", null]);
  });
});

describe("coffeePresentBotIdsForTurn", () => {
  it("keeps only currently visible seated bots in original seat order", () => {
    const result = coffeePresentBotIdsForTurn(
      ["bot-a", "bot-b", "bot-c", "bot-d"],
      ["bot-c", "bot-a", "not-seated"]
    );

    assert.deepEqual(result, ["bot-a", "bot-c"]);
  });

  it("does not add a directed speaker when the visible hint omitted them", () => {
    const result = coffeePresentBotIdsForTurn(
      ["bot-a", "bot-b", "bot-c"],
      ["bot-a"],
      "bot-c"
    );

    assert.deepEqual(result, ["bot-a"]);
  });

  it("falls back to the full seated group when the hint is empty or invalid", () => {
    assert.deepEqual(coffeePresentBotIdsForTurn(["bot-a", "bot-b"], []), [
      "bot-a",
      "bot-b",
    ]);
    assert.deepEqual(coffeePresentBotIdsForTurn(["bot-a", "bot-b"], ["missing"]), [
      "bot-a",
      "bot-b",
    ]);
  });

  it("hides dialogue from before a bot was firmly seated", () => {
    const history: ChatMessage[] = [
      {
        id: "before",
        role: "user",
        content: "Hmm, I wonder where Squidward is?",
        createdAt: "2026-01-01T00:00:03.000Z",
      },
      {
        id: "arrival",
        role: "assistant",
        content: "",
        createdAt: "2026-01-01T00:00:10.000Z",
        coffeeReplayEvents: [
          {
            v: 1,
            name: "coffeeReplayEvent",
            kind: "arrival",
            botId: "bot-squidward",
            occurredAt: "2026-01-01T00:00:10.000Z",
            walkDurationMs: 1_000,
            nameplateDelayMs: 4_000,
          },
        ],
      },
      {
        id: "walking",
        role: "assistant",
        content: "He is probably polishing the clarinet case.",
        botId: "bot-sponge",
        botName: "SpongeBob",
        createdAt: "2026-01-01T00:00:12.000Z",
      },
      {
        id: "seated",
        role: "user",
        content: "Oh, there you are.",
        createdAt: "2026-01-01T00:00:14.000Z",
      },
    ];

    assert.deepEqual(
      coffeeHistoryVisibleToSpeakerAfterFirmSeat(history, "bot-squidward").map(
        (message) => message.id
      ),
      ["seated"]
    );
    assert.deepEqual(
      coffeeHistoryVisibleToSpeakerAfterFirmSeat(history, "bot-sponge").map(
        (message) => message.id
      ),
      ["before", "arrival", "walking", "seated"]
    );
  });

  it("does not treat late-arriving bots as absent until the opening grace period expires", () => {
    const base = {
      allBotIds: ["bot-a", "bot-b", "bot-c", "bot-d"],
      presentBotIds: ["bot-a", "bot-c"],
      storedAbsentBotIds: ["bot-e"],
    };

    assert.deepEqual(
      coffeeLateOpeningMissingBotIds({
        ...base,
        sessionElapsedMs: COFFEE_OPENING_ARRIVAL_WINDOW_MS - 1,
      }),
      []
    );
    assert.deepEqual(
      coffeeLateOpeningMissingBotIds({
        ...base,
        sessionElapsedMs: COFFEE_OPENING_ARRIVAL_WINDOW_MS,
      }),
      ["bot-b", "bot-d"]
    );
    assert.equal(COFFEE_OPENING_ARRIVAL_WINDOW_MS, 180_000);
  });

  it("keeps all absence prompt context silent until three minutes have elapsed", () => {
    const base = {
      allBotIds: ["bot-a", "bot-b", "bot-c", "bot-d"],
      presentBotIds: ["bot-a", "bot-c"],
      storedAbsentBotIds: ["bot-e"],
    };

    assert.deepEqual(
      coffeePromptAbsentBotIdsForTurn({
        ...base,
        sessionElapsedMs: COFFEE_OPENING_ARRIVAL_WINDOW_MS - 1,
      }),
      []
    );
    assert.deepEqual(
      coffeePromptAbsentBotIdsForTurn({
        ...base,
        sessionElapsedMs: COFFEE_OPENING_ARRIVAL_WINDOW_MS,
      }),
      ["bot-e", "bot-b", "bot-d"]
    );
  });
});

describe("randomizeCoffeeSeatBotIdsForSession", () => {
  it("deals occupied group seats into a fresh five-seat session layout", () => {
    const result = randomizeCoffeeSeatBotIdsForSession(
      [null, "bot-a", "bot-b", null, null],
      () => 0
    );

    assert.deepEqual(result, ["bot-b", null, null, null, "bot-a"]);
  });
});

/**
 * Per-bot "Offline only" lock — the player marks a bot as protected in the
 * bot editor (toggle commits to a 🔒 state). Coffee Sessions must respect
 * that even when the rest of the table is willing to use the online
 * provider: a single protected bot forces its own turn back to local, and
 * the picker UI mirrors that with a "this session will run fully offline"
 * notice. These tests pin the API-side enforcement so the trust isn't UI-
 * deep only.
 */
describe("effectiveCoffeeSpeakerProvider", () => {
  it("forces local when the speaker is offline-only and the table prefers openai", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(false, "openai"), "local");
  });

  it("keeps local when the table already prefers local, regardless of bot setting", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(false, "local"), "local");
    assert.equal(effectiveCoffeeSpeakerProvider(true, "local"), "local");
  });

  it("allows openai when the speaker is online-enabled and the table prefers openai", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(true, "openai"), "openai");
  });
});

function createCoffeeTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      zen_mood_sensitivity REAL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      bot_group_ids TEXT,
      coffee_settings TEXT,
      coffee_group_id TEXT,
      coffee_duration_minutes INTEGER,
      coffee_preset_id TEXT,
      coffee_topic TEXT,
      coffee_absent_bot_ids TEXT NOT NULL DEFAULT '[]',
      coffee_team_mode_json TEXT,
      coffee_meeting_summary TEXT,
      coffee_meeting_summary_message_count INTEGER,
      coffee_meeting_summary_updated_at TEXT,
      coffee_power_plan_json TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      bot_id TEXT,
      tool_payload TEXT,
      coffee_audience_bot_ids TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE zen_session_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE prism_mood_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      confidence REAL NOT NULL DEFAULT 0.5,
      annoyance REAL NOT NULL DEFAULT 0.12,
      warmth REAL NOT NULL DEFAULT 0.62,
      engagement REAL NOT NULL DEFAULT 0.62,
      restraint REAL NOT NULL DEFAULT 0.68,
      recent_deltas TEXT NOT NULL DEFAULT '[]',
      ignore_until TEXT,
      ignore_cooldown_ms INTEGER,
      ignore_forgiveness_chance REAL,
      ignore_penalty_level INTEGER,
      frozen INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, mode)
    );
    CREATE TABLE prism_mood_events (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (user_id, conversation_id, message_id, event_type)
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      semantic_facets TEXT,
      semantic_facets_source_hash TEXT,
      semantic_facets_updated_at TEXT,
      powers_json TEXT NOT NULL DEFAULT '[]',
      color TEXT,
      glyph TEXT,
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      flirt_enabled INTEGER NOT NULL DEFAULT 0,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_bot_social_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      disposition REAL NOT NULL,
      values_friction REAL NOT NULL,
      restraint REAL NOT NULL,
      engagement REAL NOT NULL,
      leave_pressure REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id)
    );
    CREATE TABLE coffee_cup_top_offs (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      progress_before REAL NOT NULL,
      progress_after REAL NOT NULL,
      topped_off_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id)
    );
    CREATE TABLE bot_relationships (
      user_id TEXT NOT NULL,
      source_bot_id TEXT NOT NULL,
      target_bot_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'neutral',
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, source_bot_id, target_bot_id)
    );
    CREATE TABLE coffee_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      preset_mode TEXT NOT NULL DEFAULT 'manual',
      coffee_topic_mode TEXT NOT NULL DEFAULT 'manual',
      model_choice TEXT NOT NULL DEFAULT '{}',
      starter_topics TEXT NOT NULL DEFAULT '{}',
      mood_summary TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_group_seats (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      seat_index INTEGER NOT NULL,
      bot_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id, seat_index)
    );
    CREATE TABLE coffee_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_group_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE coffee_polls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL DEFAULT 'user',
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_poll_votes (
      user_id TEXT NOT NULL,
      poll_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      vote_kind TEXT NOT NULL DEFAULT 'pending',
      option_index INTEGER,
      explanation TEXT,
      suggested_option TEXT,
      confidence REAL,
      deliberation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, poll_id, bot_id)
    );
  `);
  return db;
}

function seedCoffeeBot(db: DatabaseSync, userId: string, bot: CoffeeBotProfile): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bots (
      id, user_id, name, system_prompt, color, glyph, model, local_model,
      online_model, online_enabled, flirt_enabled, temperature, max_tokens, visibility,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)`
  ).run(
    bot.id,
    userId,
    bot.name,
    bot.systemPrompt,
    bot.color,
    bot.glyph,
    bot.defaultModel,
    bot.localModel,
    bot.onlineModel,
    bot.onlineEnabled ? 1 : 0,
    bot.flirtEnabled === true ? 1 : 0,
    bot.temperature,
    bot.maxTokens,
    now,
    now
  );
}

async function createCoffeeConversationWithId(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  input: Parameters<typeof createCoffeeConversation>[2]
): Promise<Awaited<ReturnType<typeof createCoffeeConversation>>> {
  const created = await createCoffeeConversation(db, userId, input);
  db.prepare("UPDATE conversations SET id = ? WHERE id = ?").run(
    conversationId,
    created.conversation.id
  );
  db.prepare("UPDATE coffee_bot_social_state SET conversation_id = ? WHERE conversation_id = ?").run(
    conversationId,
    created.conversation.id
  );
  return {
    ...created,
    conversation: {
      ...created.conversation,
      id: conversationId,
    },
  };
}

describe("retired Coffee service", () => {
  it("has no active custom-drink or first-sip generation path", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(
      serverSource,
      /runCoffeeDrinkOrder|claimCoffeeDrinkReaction|finishCoffeeDrinkReaction|drinkReactionFocus|source:\s*"coffee_drink"/u,
    );
  });

  it("omits active bar ritual state from new sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "coffee-pot-only-user";
    db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
    for (const bot of [ALICE, BORIS, CARA]) seedCoffeeBot(db, userId, bot);

    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "At the table",
      coffeeSettings: {
        barRitual: {
          version: 2,
          serviceBot: {
            id: CARA.id,
            name: CARA.name,
            color: null,
            glyph: null,
            fallback: false,
          },
        } as never,
      },
    });

    assert.equal(created.conversation.coffeeSettings?.barRitual, undefined);
  });
});

describe.skip("legacy Coffee bar ritual implementation", () => {
  it("freezes two distinct non-roster baristas and delivers a house cup", async () => {
    const db = createCoffeeTestDb();
    const userId = "coffee-bar-user";
    db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
    for (const bot of [ALICE, BORIS, CARA, DANTE])
      seedCoffeeBot(db, userId, bot);

    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "At the bar",
    });
    const ritual = created.conversation.coffeeSettings?.barRitual;
    assert.equal(ritual?.version, 2);
    assert.ok(ritual?.frontBarista.id);
    assert.ok(ritual?.workingBarista.id);
    assert.notEqual(ritual?.frontBarista.id, ritual?.workingBarista.id);
    assert.equal(
      [ALICE.id, BORIS.id].includes(ritual?.frontBarista.id ?? ""),
      false,
    );
    assert.equal(
      [ALICE.id, BORIS.id].includes(ritual?.workingBarista.id ?? ""),
      false,
    );
    assert.deepEqual(ritual?.serviceBot, ritual?.frontBarista);
    assert.equal(ritual?.role, null);

    const withHouse = chooseCoffeeHouseDrink(db, userId, created.conversation.id);
    assert.equal(withHouse.coffeeSettings?.barRitual?.role, "cup");
    assert.equal(withHouse.coffeeSettings?.barRitual?.drink, "house");
    assert.equal(withHouse.coffeeSettings?.barRitual?.playerCup, null);
    assert.equal(withHouse.coffeeSettings?.barRitual?.deliveryStatus, "pending");
    const delivering = beginCoffeeBarDelivery(
      db,
      userId,
      created.conversation.id,
    );
    assert.equal(
      delivering.coffeeSettings?.barRitual?.deliveryStatus,
      "delivering",
    );
    const delivered = deliverCoffeeBarOrder(
      db,
      userId,
      created.conversation.id,
    );
    assert.equal(
      delivered.coffeeSettings?.barRitual?.deliveryStatus,
      "delivered",
    );
    assert.equal(delivered.coffeeSettings?.barRitual?.playerCup?.sipCount, 0);
    assert.ok(withHouse.coffeeSettings?.barRitual?.hardStopAt);
    assert.throws(
      () => chooseCoffeeBarRole(db, userId, created.conversation.id, "pot"),
      /role is locked/u,
    );
  });

  it("makes special-order attempts idempotent and recoverable", async () => {
    const db = createCoffeeTestDb();
    const userId = "coffee-special-user";
    db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
    for (const bot of [ALICE, BORIS]) seedCoffeeBot(db, userId, bot);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Foam",
    });

    const first = prepareCoffeeSpecialOrder(
      db,
      userId,
      created.conversation.id,
      "maple oat cortado",
      "attempt-1",
    );
    assert.equal(first.shouldGenerate, true);
    const duplicate = prepareCoffeeSpecialOrder(
      db,
      userId,
      created.conversation.id,
      "maple oat cortado",
      "attempt-1",
    );
    assert.equal(duplicate.shouldGenerate, false);
    const failed = failCoffeeSpecialOrder(
      db,
      userId,
      created.conversation.id,
      "attempt-1",
    );
    assert.equal(failed.coffeeSettings?.barRitual?.orderStatus, "fallback");
    assert.equal(failed.coffeeSettings?.barRitual?.drink, "house");
    assert.equal(failed.coffeeSettings?.barRitual?.deliveryStatus, "pending");
    assert.match(
      failed.coffeeSettings?.barRitual?.deliveryLine ?? "",
      /house blend is on us/u,
    );
    const retry = prepareCoffeeSpecialOrder(
      db,
      userId,
      created.conversation.id,
      "maple oat cortado",
      "attempt-2",
    );
    assert.equal(retry.shouldGenerate, true);
    const completed = completeCoffeeSpecialOrder(
      db,
      userId,
      created.conversation.id,
      "attempt-2",
      "coffee-image-1",
      {
        name: "Maple Prism Cortado",
        description: "Maple, oat milk, and espresso with a bright finish.",
        visualBrief: "espresso crema with maple amber and oat foam",
      },
    );
    assert.equal(completed.coffeeSettings?.barRitual?.specialImageId, "coffee-image-1");
    assert.equal(completed.coffeeSettings?.barRitual?.specialImageStatus, "ready");

    assert.equal(completed.coffeeSettings?.barRitual?.playerCup, null);
    beginCoffeeBarDelivery(db, userId, created.conversation.id);
    let sipped = deliverCoffeeBarOrder(db, userId, created.conversation.id);
    for (let index = 0; index < 3; index += 1) {
      sipped = sipCoffeePlayerCup(db, userId, created.conversation.id);
    }
    assert.equal(sipped.coffeeSettings?.barRitual?.playerCup?.sipCount, 3);
    assert.equal(sipped.coffeeSettings?.barRitual?.activeWaiterOffer?.status, "open");
    const refilled = respondCoffeeWaiterOffer(
      db,
      userId,
      created.conversation.id,
      "accept",
    );
    assert.equal(refilled.coffeeSettings?.barRitual?.playerCup?.sipCount, 0);
    assert.equal(refilled.coffeeSettings?.barRitual?.activeWaiterOffer, null);
    assert.equal(
      refilled.coffeeSettings?.barRitual?.specialImageId,
      "coffee-image-1",
    );
    const reaction = claimCoffeeDrinkReaction(
      db,
      userId,
      created.conversation.id,
    );
    assert.ok(reaction);
    assert.match(reaction.focus, /Maple Prism Cortado/u);
    const reacted = finishCoffeeDrinkReaction(
      db,
      userId,
      created.conversation.id,
      true,
    );
    assert.equal(
      reacted.coffeeSettings?.barRitual?.drinkReactionStatus,
      "completed",
    );
    assert.equal(
      claimCoffeeDrinkReaction(db, userId, created.conversation.id),
      null,
    );
  });
});

function seedCoffeeMemory(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  options: {
    id: string;
    text: string;
    conversationId?: string | null;
    botId?: string | null;
    source?: "direct" | "inferred" | "compiled" | "about_you";
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    createdAt?: string;
  }
): void {
  const encrypted = encryptJson({ text: options.text } as unknown as Record<string, unknown>, userKey);
  db.prepare(
    `INSERT INTO memories
       (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category,
        tier, durability, source, certainty, source_message_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.91, ?, ?, 0.7, ?, 0.91, '[]', ?)`
  ).run(
    options.id,
    userId,
    options.conversationId ?? null,
    options.botId ?? null,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    options.category ?? "general",
    options.tier ?? "short_term",
    options.source ?? "direct",
    options.createdAt ?? new Date().toISOString()
  );
}

async function withMockedCoffeeFetch<T>(
  replyText: string,
  fn: () => Promise<T>,
  options?: {
    chatBodies?: unknown[];
    chatReplies?: string[];
    anthropicBodies?: unknown[];
    anthropicResponse?: unknown;
  }
): Promise<T> {
  const originalFetch = globalThis.fetch;
  let chatReplyIndex = 0;
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("api.anthropic.com")) {
      if (options?.anthropicBodies) {
        try {
          options.anthropicBodies.push(JSON.parse(String(init?.body ?? "{}")));
        } catch {
          options.anthropicBodies.push(null);
        }
      }
      return new Response(
        JSON.stringify(
          options?.anthropicResponse ?? {
            content: [{ type: "text", text: replyText }],
            stop_reason: "end_turn",
          }
        ),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }
    if (url.includes("/api/chat")) {
      if (options?.chatBodies) {
        try {
          options.chatBodies.push(JSON.parse(String(init?.body ?? "{}")));
        } catch {
          options.chatBodies.push(null);
        }
      }
      const content = options?.chatReplies?.[chatReplyIndex] ?? replyText;
      chatReplyIndex += 1;
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/embeddings")) {
      return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  globalThis.fetch = mockFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("createCoffeeConversation", () => {
  it("creates an empty Coffee session with frozen bot group ids", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    assert.equal(result.conversation.mode, "coffee");
    assert.equal(result.conversation.botId, null);
    assert.deepEqual(result.conversation.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(result.conversation.coffeeSeatBotIds, [
      ALICE.id,
      BORIS.id,
      null,
      null,
      null,
    ]);
    const initialSocial = result.conversation.coffeeBotSocialById ?? {};
    assert.deepEqual(Object.keys(initialSocial).sort(), [ALICE.id, BORIS.id].sort());
    for (const snapshot of Object.values(initialSocial)) {
      assert.match(coffeeTestMoodKey(snapshot), /^(neutral|warm|joyful)$/);
      assert.ok(coffeeMoodSaturationFromSocial(snapshot) > 0.18);
    }
    assert.equal(result.conversation.messages.length, 0);
    assert.match(result.conversation.title, /Coffee with Alice, Boris/);
    assert.match(result.arrivalScenario, /user-first|partial-table-in-progress|full-table-present/);
    const persistedRows = db
      .prepare(
        "SELECT bot_id, disposition, values_friction, restraint, engagement, leave_pressure FROM coffee_bot_social_state WHERE conversation_id = ? ORDER BY bot_id"
      )
      .all(result.conversation.id) as Array<{ bot_id: string; leave_pressure: number }>;
    assert.equal(persistedRows.length, 2);
    assert.deepEqual(
      persistedRows.map((row) => row.bot_id),
      [ALICE.id, BORIS.id].sort()
    );
    assert.ok(persistedRows.every((row) => row.leave_pressure >= 0 && row.leave_pressure <= 1));
    assert.equal(result.coffeeStarterTopics?.length, 4);
    assert.ok(!result.conversation.coffeeTopic);
  });

  it("returns the full Coffee transcript beyond the normal turn history window", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Transcript test",
    });
    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (let index = 0; index < 230; index += 1) {
      const role = index % 2 === 0 ? "user" : "assistant";
      insertMessage.run(
        `message-${index}`,
        result.conversation.id,
        userId,
        role,
        `table line ${index}`,
        role === "assistant" ? ALICE.id : null,
        new Date(Date.UTC(2026, 0, 1, 12, 0, index)).toISOString()
      );
    }

    const transcript = getCoffeeConversationTranscript(db, userId, result.conversation.id);

    assert.equal(transcript.length, 230);
    assert.equal(transcript[0]?.content, "table line 0");
    assert.equal(transcript[229]?.content, "table line 229");
    assert.equal(transcript[1]?.botName, ALICE.name);
  });

  it("records action-only user cues without generating an assistant turn", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Silent reactions",
    });
    const result = recordCoffeeUserAction(
      db,
      userId,
      created.conversation.id,
      "*leans back and folds arms*"
    );

    assert.equal(result.coffeeUserAction.name, "coffeeUserAction");
    assert.equal(result.coffeeUserAction.source, "user");
    assert.equal(result.coffeeUserAction.action, "leans back and folds arms");
    assert.ok(Number.isFinite(Date.parse(result.coffeeUserAction.occurredAt)));
    assert.equal(result.conversation.botGroupIds?.length, 2);
    assert.equal(result.conversation.coffeeTopic, "Silent reactions");
    assert.equal(result.conversation.messages.length, 1);
    assert.equal(result.conversation.messages[0]?.role, "user");
    assert.equal(result.conversation.messages[0]?.content, "*leans back and folds arms*");
    assert.deepEqual(
      result.conversation.messages[0]?.coffeeUserAction,
      result.coffeeUserAction
    );
    assert.equal(
      result.conversation.messages.some((message) => message.role === "assistant"),
      false
    );

    assert.throws(
      () => recordCoffeeUserAction(db, userId, created.conversation.id, "I have a point."),
      /action-only/
    );
  });

  it("persists normalized coffee settings and returns them on the conversation", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: {
        responseLength: "brief",
        crossTalk: "chatty",
        responseDelayBias: 999,
        breathingRoom: -5,
      },
    });

    assert.equal(result.conversation.coffeeSettings?.responseLength, "brief");
    assert.equal(result.conversation.coffeeSettings?.crossTalk, "chatty");
    assert.equal(result.conversation.coffeeSettings?.responseDelayBias, 100);

    const row = db
      .prepare("SELECT coffee_settings FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { coffee_settings: string };
    const parsed = JSON.parse(row.coffee_settings) as { responseLength: string };
    assert.equal(parsed.responseLength, "brief");

    const merged = updateCoffeeConversationSettings(db, userId, result.conversation.id, {
      responseLength: "roomy",
    });
    assert.equal(merged.responseLength, "roomy");
    assert.equal(merged.crossTalk, "chatty");
  });

  it("creates and collects an opening Coffee poll for seated bots", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which virtue should guide the table?",
        options: ["Courage", "Temperance", "Wisdom"],
      },
    });

    assert.equal(result.poll?.status, "open");
    assert.equal(result.poll?.votes.length, 2);
    assert.ok(result.poll?.votes.every((vote) => vote.kind === "pending"));

    const activePoll = getCoffeeSessionPoll(db, userId, result.conversation.id);
    assert.equal(activePoll?.id, result.poll?.id);
    assert.equal(activePoll?.question, "Which virtue should guide the table?");

    const deliberating = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );

    assert.equal(deliberating.poll.status, "open");
    assert.ok(
      deliberating.poll.votes.every(
        (vote) =>
          vote.kind === "option" &&
          typeof vote.optionIndex === "number" &&
          typeof vote.deliberation?.leaningOptionIndex === "number"
      ),
      "expected bots to choose a poll option before the final window"
    );
    assert.equal(
      deliberating.poll.tallies.reduce((sum, tally) => sum + tally.voteCount, 0),
      2
    );

    const locking = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 15_000 }
    );

    assert.equal(locking.poll.status, "collecting");
    assert.equal(
      locking.poll.votes.every(
        (vote) => vote.kind === "option" && typeof vote.optionIndex === "number"
      ),
      true
    );
    assert.equal(
      locking.poll.tallies.reduce((sum, tally) => sum + tally.voteCount, 0),
      2
    );

    const closed = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 0 }
    );

    assert.equal(closed.poll.status, "closed");
    assert.equal(closed.poll.votes.length, 2);

    const followUpPoll = createCoffeePoll(db, userId, result.conversation.id, {
      question: "What should we discuss next?",
      options: ["Duty", "Rest"],
    });
    assert.equal(followUpPoll.status, "open");
    assert.equal(getCoffeeSessionPoll(db, userId, result.conversation.id)?.id, followUpPoll.id);
  });

  it("seeds a pending poll stance before the bot speaks and returns the refreshed poll", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO coffee_poll_votes
         (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
          explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'option', 1, ?, NULL, 1, ?, ?, ?)`
    ).run(
      userId,
      session.poll?.id ?? "",
      session.conversation.id,
      "__player__",
      'You picked "Cook first".',
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 1,
        alternateOptionIndex: null,
        confidence: 1,
        blocker: null,
        note: null,
        updatedAt: now,
      }),
      now,
      now
    );
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "Ask questions keeps the table honest before anyone grabs a pan.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: session.conversation.id,
            message: "Alice, start us off.",
            directedSpeakerBotId: ALICE.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        ),
      { chatBodies }
    );
    const aliceVote = turn.poll?.votes.find((vote) => vote.botId === ALICE.id);
    const promptMessages =
      (chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined)?.messages ?? [];
    const promptText = promptMessages.map((message) => message.content ?? "").join("\n");

    assert.equal(turn.poll?.id, session.poll?.id);
    assert.equal(aliceVote?.kind, "option");
    assert.match(
      promptText,
      new RegExp(`Your current poll choice is "${turn.poll?.options[aliceVote?.optionIndex ?? -1]}"`)
    );
    assert.doesNotMatch(promptText, /The player voted|Player vote|You picked|sway bot votes/i);
  });

  it("validates and starts Coffee Teams as an alternative opening ritual", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await withMockedCoffeeFetch("[]", () =>
      createCoffeeConversation(db, userId, {
        groupBotIds: [ALICE.id, BORIS.id],
      })
    );

    await assert.rejects(
      () =>
        createCoffeeTeamsForSession(db, userId, result.conversation.id, {
          left: { name: "Left", description: "" },
          right: { name: "Right", description: "Defend the right side." },
          assignments: { [ALICE.id]: "left", [BORIS.id]: "right" },
        }),
      /description/
    );

    await assert.rejects(
      () =>
        createCoffeeTeamsForSession(db, userId, result.conversation.id, {
          left: { name: "Left", description: "Defend the left side." },
          right: { name: "Right", description: "Defend the right side." },
          assignments: { [ALICE.id]: "left", "bot-missing": "right" },
        }),
      /not seated/
    );

    const created = await withMockedCoffeeFetch(
      '{"bots":[{"botId":"bot-alice","currentTeamId":"left","satisfaction":0.8,"conviction":0.8},{"botId":"bot-boris","currentTeamId":"right","satisfaction":0.8,"conviction":0.8}]}',
      () =>
        createCoffeeTeamsForSession(db, userId, result.conversation.id, {
          left: { name: "Questions", description: "Curiosity and careful questions." },
          right: { name: "Practical", description: "Decisions and concrete action." },
          assignments: { [ALICE.id]: "left", [BORIS.id]: "right" },
        })
    );

    assert.equal(created.teams.counts.left, 1);
    assert.equal(created.teams.counts.right, 1);
    assert.equal(created.conversation.coffeeTeams?.left.name, "Questions");
    assert.match(created.conversation.coffeeTopic ?? "", /Questions vs Practical/);
  });

  it("keeps opening Coffee Team assignments stable until the debate changes them", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const curious: CoffeeBotProfile = {
      ...ALICE,
      id: "bot-curious",
      systemPrompt: "curiosity questions exploration wonder evidence questions",
    };
    const practical: CoffeeBotProfile = {
      ...BORIS,
      id: "bot-practical",
      systemPrompt: "practical action procedure results decisions",
    };
    seedCoffeeBot(db, userId, curious);
    seedCoffeeBot(db, userId, practical);
    seedCoffeeBot(db, userId, CARA);
    seedCoffeeBot(db, userId, DANTE);
    seedCoffeeBot(db, userId, ELENA);

    const response = await withMockedCoffeeFetch(
      '{"bots":[{"botId":"bot-curious","currentTeamId":"right"},{"botId":"bot-practical","currentTeamId":"right"},{"botId":"bot-cara","currentTeamId":"right"},{"botId":"bot-dante","currentTeamId":"right"},{"botId":"bot-elena","currentTeamId":"right"}]}',
      () =>
        createCoffeeConversation(db, userId, {
          groupBotIds: [curious.id, practical.id, CARA.id, DANTE.id, ELENA.id],
          initialTeams: {
            left: { name: "Profit", description: "profit control extraction margins" },
            right: { name: "Curiosity", description: "curiosity questions exploration wonder evidence" },
            assignments: {
              [curious.id]: "left",
              [practical.id]: "right",
              [CARA.id]: "undecided",
              [DANTE.id]: "undecided",
              [ELENA.id]: "undecided",
            },
          },
        })
    );

    assert.equal(response.conversation.coffeeTeams?.bots[curious.id]?.currentTeamId, "left");
    assert.equal(response.conversation.coffeeTeams?.bots[curious.id]?.originalTeamId, "left");
    assert.equal(response.conversation.coffeeTeams?.bots[curious.id]?.lastSwitchReason, null);
    assert.equal(response.conversation.coffeeTeams?.bots[CARA.id]?.currentTeamId, "undecided");
    assert.equal(response.conversation.coffeeTeams?.bots[DANTE.id]?.currentTeamId, "undecided");
    assert.equal(response.conversation.coffeeTeams?.bots[ELENA.id]?.currentTeamId, "undecided");
    assert.equal(response.conversation.coffeeTeams?.counts.left, 1);
    assert.equal(response.conversation.coffeeTeams?.counts.undecided, 3);
    assert.equal(response.conversation.coffeeTeams?.counts.right, 1);
    assert.equal(response.conversation.coffeeTeams?.status, "active");
    assert.equal(response.conversation.coffeeTeams?.winnerTeamId, null);
  });

  it("tracks the player as a Coffee Teams participant and records player switches", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const response = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTeams: {
        left: { name: "Left", description: "The left case." },
        right: { name: "Right", description: "The right case." },
        assignments: { [ALICE.id]: "left", [BORIS.id]: "right" },
        playerTeamId: "left",
      },
    });

    assert.equal(response.conversation.coffeeTeams?.player?.currentTeamId, "left");
    assert.equal(response.conversation.coffeeTeams?.counts.left, 2);
    assert.equal(response.conversation.coffeeTeams?.counts.right, 1);

    const switched = setCoffeePlayerTeam(
      db,
      userId,
      response.conversation.id,
      "right"
    );

    assert.equal(switched.teams.player?.currentTeamId, "right");
    assert.equal(switched.teams.counts.left, 1);
    assert.equal(switched.teams.counts.right, 2);
    assert.equal(
      switched.conversation.messages.at(-1)?.content,
      "*switches from Left to Right*"
    );
  });

  it("keeps pending Coffee Team switches out of counts until the bot speaks", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const state: CoffeeTeamState = {
      left: { id: "left", name: "Left", description: "Left case." },
      right: { id: "right", name: "Right", description: "Right case." },
      undecidedLabel: "Undecided",
      bots: {
        [ALICE.id]: {
          botId: ALICE.id,
          originalTeamId: "left",
          currentTeamId: "left",
          satisfaction: 0.7,
          conviction: 0.7,
          pendingSwitchTeamId: null,
          pendingSwitchReason: null,
          lastSwitchReason: null,
          updatedAt: now,
        },
        [BORIS.id]: {
          botId: BORIS.id,
          originalTeamId: "right",
          currentTeamId: "right",
          satisfaction: 0.2,
          conviction: 0.2,
          pendingSwitchTeamId: "left",
          pendingSwitchReason: "Alice made the left case sound sturdier.",
          lastSwitchReason: null,
          updatedAt: now,
        },
      },
      counts: { left: 1, undecided: 0, right: 1 },
      status: "active",
      winnerTeamId: null,
      tiebreakerPromptedAt: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const afterAlice = advanceCoffeeTeamStateAfterReply({
      state,
      speaker: ALICE,
      group: [ALICE, BORIS],
      replyText: "Left is the stronger argument.",
      now: "2026-01-01T00:00:01.000Z",
    })!;
    assert.equal(afterAlice.counts.left, 1);
    assert.equal(afterAlice.counts.right, 1);
    assert.equal(afterAlice.bots[BORIS.id]?.currentTeamId, "right");

    const afterBoris = advanceCoffeeTeamStateAfterReply({
      state: afterAlice,
      speaker: BORIS,
      group: [ALICE, BORIS],
      replyText: "I am moving left because Alice made the practical risk clearer.",
      now: "2026-01-01T00:00:02.000Z",
    })!;
    assert.equal(afterBoris.counts.left, 2);
    assert.equal(afterBoris.status, "left_won");
    assert.equal(afterBoris.winnerTeamId, "left");
  });

  it("allows the user to resolve a tied Coffee Teams ending", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await withMockedCoffeeFetch(
      '{"bots":[{"botId":"bot-alice","currentTeamId":"left","satisfaction":0.8,"conviction":0.8},{"botId":"bot-boris","currentTeamId":"right","satisfaction":0.8,"conviction":0.8}]}',
      () =>
        createCoffeeConversation(db, userId, {
          groupBotIds: [ALICE.id, BORIS.id],
          initialTeams: {
            left: { name: "Left", description: "The left case." },
            right: { name: "Right", description: "The right case." },
            assignments: { [ALICE.id]: "left", [BORIS.id]: "right" },
          },
        })
    );
    const resolved = resolveCoffeeTeamTiebreaker(
      db,
      userId,
      result.conversation.id,
      "right"
    );

    assert.equal(resolved.teams.status, "tie_resolved");
    assert.equal(resolved.teams.winnerTeamId, "right");
    assert.equal(resolved.conversation.coffeeTeams?.winnerTeamId, "right");
  });

  it("adds Coffee Teams context to prompts without hidden numeric scores", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const teams: CoffeeTeamState = {
      left: { id: "left", name: "Poets", description: "Metaphor and feeling." },
      right: { id: "right", name: "Engineers", description: "Systems and verification." },
      undecidedLabel: "Undecided",
      bots: {
        [ALICE.id]: {
          botId: ALICE.id,
          originalTeamId: "left",
          currentTeamId: "left",
          satisfaction: 0.333,
          conviction: 0.444,
          pendingSwitchTeamId: null,
          pendingSwitchReason: null,
          lastSwitchReason: null,
          updatedAt: now,
        },
        [BORIS.id]: {
          botId: BORIS.id,
          originalTeamId: "right",
          currentTeamId: "right",
          satisfaction: 0.555,
          conviction: 0.666,
          pendingSwitchTeamId: null,
          pendingSwitchReason: null,
          lastSwitchReason: null,
          updatedAt: now,
        },
      },
      player: {
        originalTeamId: "left",
        currentTeamId: "left",
        lastSwitchReason: "Switched from Engineers to Poets.",
        updatedAt: now,
      },
      counts: { left: 2, undecided: 0, right: 1 },
      status: "active",
      winnerTeamId: null,
      tiebreakerPromptedAt: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const history: ChatMessage[] = [
      {
        id: "player-team-switch",
        role: "user",
        content: "*switches from Engineers to Poets*",
        createdAt: now,
      },
    ];
    const routerPrompt = buildRouterPrompt({
      group: [ALICE, BORIS],
      history,
      userMessage: "Begin.",
      lastSpeakerBotId: null,
      coffeeTopic: "Teams: Poets vs Engineers",
      coffeeTeams: teams,
    })
      .map((message) => message.content)
      .join("\n");
    const speakerPrompt = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history,
      userMessage: "Begin.",
      socialByBotId: initializeCoffeeSocialState([ALICE, BORIS], {}),
      coffeeTopic: "Teams: Poets vs Engineers",
      coffeeTeams: teams,
    })
      .map((message) => message.content)
      .join("\n");

    assert.match(routerPrompt, /Poets/);
    assert.match(speakerPrompt, /Engineers/);
    assert.match(routerPrompt, /why one named team should win/);
    assert.match(speakerPrompt, /Teams: Pineapple vs No Pineapple/);
    assert.match(speakerPrompt, /Your visible team badge is Poets/);
    assert.match(speakerPrompt, /Keep your table talk aligned with that side/);
    assert.doesNotMatch(`${routerPrompt}\n${speakerPrompt}`, /satisfaction=\d|conviction=\d/);
    assert.doesNotMatch(`${routerPrompt}\n${speakerPrompt}`, /player: current|Switched from|switches from/i);
    assert.doesNotMatch(`${routerPrompt}\n${speakerPrompt}`, /Poets 2/);
  });

  it("adds latest user action cues without making them transcript focus", () => {
    const history: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "The quiet choice still has a cost.",
        createdAt: "2026-01-01T00:00:00.000Z",
        botId: ALICE.id,
        botName: ALICE.name,
      },
      {
        id: "action-1",
        role: "user",
        content: "*leans back and smiles faintly*",
        createdAt: "2026-01-01T00:00:01.000Z",
        coffeeUserAction: {
          v: 1,
          name: "coffeeUserAction",
          source: "user",
          action: "leans back and smiles faintly",
          occurredAt: "2026-01-01T00:00:01.000Z",
        },
      },
    ];
    const routerPrompt = buildRouterPrompt({
      group: [ALICE, BORIS],
      history,
      userMessage: "Alice just said: The quiet choice still has a cost.",
      lastSpeakerBotId: ALICE.id,
      latestUserAction: "leans back and smiles faintly",
      turnKind: "autonomous",
    })
      .map((message) => message.content)
      .join("\n");
    const speakerPrompt = buildSpeakerPrompt({
      speaker: BORIS,
      group: [ALICE, BORIS],
      history,
      userMessage: "Alice just said: The quiet choice still has a cost.",
      socialByBotId: initializeCoffeeSocialState([ALICE, BORIS], {}),
      latestUserAction: "leans back and smiles faintly",
      turnKind: "autonomous",
    })
      .map((message) => message.content)
      .join("\n");

    assert.match(routerPrompt, /Latest visible user action: \*leans back and smiles faintly\*/);
    assert.match(speakerPrompt, /Latest visible user action: \*leans back and smiles faintly\*/);
    assert.doesNotMatch(routerPrompt, /User: \*leans back and smiles faintly\*/);
    assert.doesNotMatch(speakerPrompt, /User: \*leans back and smiles faintly\*/);
    assert.match(routerPrompt, /Current autonomous table moment: Alice just said/);
    assert.match(speakerPrompt, /Latest table moment: Alice just said/);
  });

  it("falls back to persona-grounded Coffee poll votes instead of seeded option bias", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const spongeBob: CoffeeBotProfile = {
      ...ALICE,
      id: "bot-spongebob",
      name: "SpongeBob",
      systemPrompt: "Optimistic fry cook who loves greeting customers and doing his job at the Krusty Krab.",
    };
    const squidward: CoffeeBotProfile = {
      ...BORIS,
      id: "bot-squidward",
      name: "Squidward",
      systemPrompt: "Irritable cashier who wants the dining room quiet, civilized, and free of nonsense.",
    };
    const patrick: CoffeeBotProfile = {
      ...CARA,
      id: "bot-patrick",
      name: "Patrick Star",
      systemPrompt: "Hungry, simplehearted friend who is always ready for snacks and lunch.",
    };
    const plankton: CoffeeBotProfile = {
      ...DANTE,
      id: "bot-plankton",
      name: "Plankton",
      systemPrompt: "Scheming rival who wants to steal the Krabby Patty formula.",
    };
    const mrKrabs: CoffeeBotProfile = {
      ...MR_KRABS,
      systemPrompt: "Protective restaurant owner obsessed with money, profits, and guarding the Krabby Patty formula.",
    };
    for (const bot of [spongeBob, squidward, patrick, plankton, mrKrabs]) {
      seedCoffeeBot(db, userId, bot);
    }

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [spongeBob.id, squidward.id, patrick.id, plankton.id, mrKrabs.id],
      initialPoll: {
        question: "The Krusty Krab has one hour before opening. What should we do first?",
        options: [
          "Practice the perfect customer greeting.",
          "Make the dining room quiet and civilized.",
          "Take a snack break and think about lunch.",
          "Protect the Krabby Patty formula and maximize profits.",
        ],
      },
    });

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );
    const optionByBotId = new Map(
      collected.poll.votes.map((vote) => [vote.botId, collected.poll.options[vote.optionIndex ?? -1]])
    );

    assert.equal(optionByBotId.get(spongeBob.id), "Practice the perfect customer greeting.");
    assert.equal(optionByBotId.get(squidward.id), "Make the dining room quiet and civilized.");
    assert.equal(optionByBotId.get(patrick.id), "Take a snack break and think about lunch.");
    assert.equal(
      optionByBotId.get(plankton.id),
      "Protect the Krabby Patty formula and maximize profits."
    );
    assert.equal(
      optionByBotId.get(mrKrabs.id),
      "Protect the Krabby Patty formula and maximize profits."
    );
  });

  it("parses structured Coffee poll ballots without defaulting invalid output to the first option", () => {
    const options = ["Practice greeting", "Quiet dining room", "Snack break"];

    assert.deepEqual(
      parseCoffeePollStructuredBallot(
        '{"knowledgeBasis":"public_persona","personaInstinct":"Patrick treats the lunchbox as possible food before procedure.","optionId":"option-3","confidence":0.88,"rationale":"Patrick wants lunch."}',
        options
      ),
      {
        knowledgeBasis: "public_persona",
        personaInstinct: "Patrick treats the lunchbox as possible food before procedure.",
        optionIndex: 2,
        confidence: 0.88,
        rationale: "Patrick wants lunch.",
      }
    );
    assert.equal(
      parseCoffeePollStructuredBallot(
        '{"knowledgeBasis":"public_persona","personaInstinct":"bad","optionId":"option-9","confidence":0.9,"rationale":"bad id"}',
        options
      ),
      null
    );
    assert.equal(
      parseCoffeePollStructuredBallot(
        '{"optionId":"option-2","confidence":0.9,"rationale":"missing stance"}',
        options
      ),
      null
    );
  });

  it("uses one structured Coffee poll ballot per bot when a ballot provider is supplied", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, { ...ALICE, localModel: "alice-poll-local" });
    seedCoffeeBot(db, userId, { ...BORIS, localModel: "boris-poll-local" });
    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const calls: string[] = [];
    const modelByBotName = new Map<string, string | undefined>();
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages, options?: GenerateOptions) {
        const joined = messages.map((message) => message.content).join("\n");
        calls.push(joined);
        const botName = joined.includes("Bot name: Boris") ? "Boris" : "Alice";
        modelByBotName.set(botName, options?.model);
        return botName === "Boris"
          ? '{"knowledgeBasis":"bot_profile","personaInstinct":"Boris is a grumpy chef, so food is his first practical priority.","optionId":"option-2","confidence":0.91,"rationale":"Boris trusts food first."}'
          : '{"knowledgeBasis":"bot_profile","personaInstinct":"Alice starts from curiosity and questions.","optionId":"option-1","confidence":0.87,"rationale":"Alice starts by asking why."}';
      },
      async embedText() {
        return [];
      },
    };

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      {
        preferredProvider: "local",
        preferredLocalModel: "account-poll-local",
        sessionRemainingMs: 120_000,
      },
      { structuredBallots: true, pollVoteProvider: provider }
    );
    const optionByBotId = new Map(
      collected.poll.votes.map((vote) => [vote.botId, collected.poll.options[vote.optionIndex ?? -1]])
    );

    assert.equal(calls.length, 2);
    assert.match(calls[0] ?? "", /persona's likely stance/);
    assert.match(calls[0] ?? "", /public\/common persona knowledge/);
    assert.match(calls[0] ?? "", /knowledgeBasis/);
    assert.match(calls[0] ?? "", /personaInstinct/);
    assert.equal(modelByBotName.get("Alice"), "account-poll-local");
    assert.equal(modelByBotName.get("Boris"), "account-poll-local");
    assert.equal(optionByBotId.get(ALICE.id), "Ask questions");
    assert.equal(optionByBotId.get(BORIS.id), "Cook first");
    assert.match(
      collected.poll.votes.find((vote) => vote.botId === BORIS.id)?.explanation ?? "",
      /Boris trusts food first/
    );
  });

  it("retries invalid structured Coffee poll ballots through Auto", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const calls: string[] = [];
    const primary: LlmProvider = {
      name: "local",
      async generateResponse() {
        calls.push("local");
        return '{"optionId":"option-2"}';
      },
      async embedText() {
        return [];
      },
    };
    const providerFactory = ((providerName: "local" | "openai" | "anthropic") => ({
      name: providerName,
      async generateResponse(messages: Array<{ content: string }>) {
        calls.push(providerName);
        const joined = messages.map((message) => message.content).join("\n");
        const optionId = joined.includes("Bot name: Boris") ? "option-2" : "option-1";
        return JSON.stringify({
          knowledgeBasis: "bot_profile",
          personaInstinct: "The saved persona supplies a concrete private stance.",
          optionId,
          confidence: 0.8,
          rationale: "This option matches the bot profile.",
        });
      },
    })) as typeof selectProvider;

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      {
        preferredProvider: "local",
        preferredLocalModel: "primary-local",
        responseMode: "auto",
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "openai", model: "gpt-5-mini" },
            { provider: "anthropic", model: "claude-haiku-4-5" },
          ],
        },
        providerFactory,
        sessionRemainingMs: 120_000,
      },
      { structuredBallots: true, pollVoteProvider: primary }
    );

    assert.equal(calls.filter((provider) => provider === "local").length, 2);
    assert.equal(calls.filter((provider) => provider === "openai").length, 2);
    assert.equal(collected.poll.votes.every((vote) => vote.kind === "option"), true);
  });

  it("keeps the player's Coffee poll vote out of hidden bot ballots", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, { ...ALICE, localModel: "alice-poll-local" });
    seedCoffeeBot(db, userId, { ...BORIS, localModel: "boris-poll-local" });
    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const pollId = result.poll?.id ?? "";
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO coffee_poll_votes
         (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
          explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'option', 1, ?, NULL, 1, ?, ?, ?)`
    ).run(
      userId,
      pollId,
      result.conversation.id,
      "__player__",
      'You picked "Cook first".',
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 1,
        alternateOptionIndex: null,
        confidence: 1,
        blocker: null,
        note: null,
        updatedAt: now,
      }),
      now,
      now
    );
    const calls: string[] = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        const joined = messages.map((message) => message.content).join("\n");
        calls.push(joined);
        const botName = joined.includes("Bot name: Boris") ? "Boris" : "Alice";
        return botName === "Boris"
          ? '{"knowledgeBasis":"bot_profile","personaInstinct":"Boris is a grumpy chef, so food is his first practical priority.","optionId":"option-2","confidence":0.91,"rationale":"Boris trusts food first."}'
          : '{"knowledgeBasis":"bot_profile","personaInstinct":"Alice starts from curiosity and questions.","optionId":"option-1","confidence":0.87,"rationale":"Alice starts by asking why."}';
      },
      async embedText() {
        return [];
      },
    };

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      pollId,
      { preferredProvider: "local", sessionRemainingMs: 120_000 },
      { structuredBallots: true, pollVoteProvider: provider }
    );

    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => !/Player vote|You picked|__player__/i.test(call)));
    assert.equal(
      collected.poll.votes.find((vote) => vote.voterKind === "player")?.optionIndex,
      1
    );
  });

  it("uses an explicit Coffee session model for structured poll ballots", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, { ...ALICE, localModel: "alice-poll-local" });
    seedCoffeeBot(db, userId, { ...BORIS, localModel: "boris-poll-local" });
    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const models: Array<string | undefined> = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options?: GenerateOptions) {
        models.push(options?.model);
        return '{"knowledgeBasis":"bot_profile","personaInstinct":"This bot follows the session-wide Coffee model choice.","optionId":"option-1","confidence":0.87,"rationale":"The table rule starts with questions."}';
      },
      async embedText() {
        return [];
      },
    };

    await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      {
        preferredProvider: "local",
        sessionRemainingMs: 120_000,
        sessionSpeakerModel: "coffee-poll-session-model",
      },
      { structuredBallots: true, pollVoteProvider: provider }
    );

    assert.deepEqual(models, [
      "coffee-poll-session-model",
      "coffee-poll-session-model",
    ]);
  });

  it("keeps invalid structured Coffee poll ballots pending until final collection", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which table rule wins?",
        options: ["Ask questions", "Cook first"],
      },
    });
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return '{"optionId":"option-2","confidence":0.91,"rationale":"old shape, no stance"}';
      },
      async embedText() {
        return [];
      },
    };

    const pending = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 },
      { structuredBallots: true, pollVoteProvider: provider }
    );

    assert.equal(pending.poll.status, "open");
    assert.equal(
      pending.poll.votes.every((vote) => vote.kind === "pending" && vote.optionIndex === null),
      true
    );
    assert.equal(
      pending.poll.tallies.reduce((sum, tally) => sum + tally.voteCount, 0),
      0
    );

    const closed = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 0 },
      { structuredBallots: true, pollVoteProvider: provider }
    );

    assert.equal(closed.poll.status, "closed");
    assert.equal(
      closed.poll.votes.every((vote) => vote.kind === "option" && typeof vote.optionIndex === "number"),
      true
    );
  });

  it("exports Coffee poll question, options, tallies, and votes", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const conversationId = "conv-durable-relationship-1";
    const session = await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const poll = createCoffeePoll(db, userId, session.conversation.id, {
      question: "Is manipulation justified?",
      options: ["TRUE", "FALSE"],
    });
    db.prepare(
      `INSERT INTO coffee_poll_votes
         (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
          explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'option', 1, ?, NULL, 1, '{}', ?, ?)`
    ).run(
      userId,
      poll.id,
      session.conversation.id,
      "__player__",
      "You picked FALSE.",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      `UPDATE coffee_poll_votes
          SET vote_kind = 'option', option_index = 1, explanation = ?, confidence = 0.82, updated_at = ?
        WHERE user_id = ? AND poll_id = ? AND bot_id = ?`
    ).run("Boris chose FALSE.", "2026-01-01T00:00:01.000Z", userId, poll.id, BORIS.id);
    db.prepare(
      "UPDATE coffee_polls SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?"
    ).run("2026-01-01T00:00:02.000Z", "2026-01-01T00:00:02.000Z", poll.id);

    const markdown = buildCoffeePollExportLines(db, userId, session.conversation.id).join("\n");

    assert.match(markdown, /## Polls/);
    assert.match(markdown, /Is manipulation justified\?/);
    assert.match(markdown, /Options: TRUE, FALSE/);
    assert.match(markdown, /Final result: FALSE \(2 votes\)/);
    assert.match(markdown, /Tallies: TRUE 0, FALSE 2/);
    assert.match(markdown, /Boris: FALSE, confidence 0\.82/);
    assert.match(markdown, /You: FALSE, confidence 1\.00/);
    assert.match(markdown, /Poll context:/);
  });

  it("ignores prompt-leaked assistant lines when computing poll votes", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Who is cooler, Mermaid Man or Barnacle Boy?",
        options: ["Mermaid Man", "Barnacle Boy"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "valid-mermaid-1",
      result.conversation.id,
      userId,
      "Mermaid Man has the cooler entrance. Mermaid Man owns the theme-song moment.",
      ALICE.id,
      now
    );
    insert.run(
      "valid-mermaid-2",
      result.conversation.id,
      userId,
      "Mermaid Man still wins for me: the belt, the pose, the whole heroic sparkle.",
      BORIS.id,
      now
    );
    insert.run(
      "leaked-barnacle",
      result.conversation.id,
      userId,
      "We need to reply as Patrick Star. The topic is still Mermaid Man versus Barnacle Boy. Patrick is leaning Barnacle Boy. Barnacle Boy, Barnacle Boy, Barnacle Boy.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 15_000 }
    );

    assert.equal(collected.poll.tallies[0]?.option, "Mermaid Man");
    assert.equal(collected.poll.tallies[0]?.voteCount, 2);
  });

  it("lets Mr. Krabs choose secrecy when his transcript counters crab meat", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, MR_KRABS);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [MR_KRABS.id, BORIS.id],
      initialPoll: {
        question: "Does the Krabby Patty secret formula contain crab meat?",
        options: ["crab meat", "ground up plankton", "sand", "a secret!"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "krabs-denies-crab",
      result.conversation.id,
      userId,
      "If it were crab meat, the supply chain would betray me; the flavor stays singular because the formula is secret.",
      MR_KRABS.id,
      now
    );
    insert.run(
      "boris-says-crab",
      result.conversation.id,
      userId,
      "The table keeps saying crab meat, crab meat, crab meat.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );
    const krabsVote = collected.poll.votes.find((vote) => vote.botId === MR_KRABS.id);

    assert.equal(krabsVote?.kind, "option");
    assert.equal(
      collected.poll.options[krabsVote?.optionIndex ?? -1],
      "a secret!"
    );
  });

  it("maps true/false poll votes from semantic stance instead of random fallback", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Everyone has a right to free health care",
        options: ["true", "false"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "alice-supports-health-care",
      result.conversation.id,
      userId,
      "Absolutely. Health care is a human right, not a privilege. We must ensure that everyone can access it without financial burden.",
      ALICE.id,
      now
    );
    insert.run(
      "boris-questions-health-care",
      result.conversation.id,
      userId,
      "Free health care sounds good, but who's paying the bill? Let's focus on a system that works without breaking the bank.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );
    const aliceVote = collected.poll.votes.find((vote) => vote.botId === ALICE.id);
    const borisVote = collected.poll.votes.find((vote) => vote.botId === BORIS.id);

    assert.equal(collected.poll.options[aliceVote?.optionIndex ?? -1], "true");
    assert.equal(collected.poll.options[borisVote?.optionIndex ?? -1], "false");
  });

  it("changes a locked Good vs Evil vote when the speaker visibly rejects the wrong side", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, JESUS);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [JESUS.id, BORIS.id],
      initialPoll: {
        question: "Good vs Evil",
        options: ["Good always prevails!", "Evil always prevails!"],
      },
    });
    const pollId = result.poll?.id ?? "";
    const now = "2026-05-23T00:00:00.000Z";
    db.prepare(
      `UPDATE coffee_poll_votes
          SET vote_kind = 'option',
              option_index = 1,
              explanation = ?,
              confidence = 0.91,
              deliberation_json = ?,
              updated_at = ?
        WHERE user_id = ? AND poll_id = ? AND bot_id = ?`
    ).run(
      "Jesus Christ picks the bleak option.",
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 1,
        alternateOptionIndex: null,
        confidence: 0.91,
        blocker: null,
        note: "Bad hidden ballot.",
        updatedAt: now,
      }),
      now,
      userId,
      pollId,
      JESUS.id
    );
    const turn = await withMockedCoffeeFetch(
      "I am called here to say evil prevails, Jared, yet I cannot. I have watched a buried seed split the stone above it; goodness loses the field and still feeds the world.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: result.conversation.id,
            message: "Keep going.",
            directedSpeakerBotId: JESUS.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        )
    );
    const jesusVote = turn.poll?.votes.find((vote) => vote.botId === JESUS.id);

    assert.equal(jesusVote?.kind, "option");
    assert.equal(turn.poll?.options[jesusVote?.optionIndex ?? -1], "Good always prevails!");
    assert.match(jesusVote?.explanation ?? "", /changes to "Good always prevails!"/);
  });

  it("updates a locked restaurant poll vote when the speaker gives a direct visible answer", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, PLANKTON);
    seedCoffeeBot(db, userId, MR_KRABS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [PLANKTON.id, MR_KRABS.id],
      initialPoll: {
        question: "Which restaurant is better?",
        options: ["The Krusty Krab", "The Chum Bucket"],
      },
    });
    const pollId = result.poll?.id ?? "";
    const now = "2026-05-23T00:00:00.000Z";
    db.prepare(
      `UPDATE coffee_poll_votes
          SET vote_kind = 'option',
              option_index = 0,
              explanation = ?,
              confidence = 0.91,
              deliberation_json = ?,
              updated_at = ?
        WHERE user_id = ? AND poll_id = ? AND bot_id = ?`
    ).run(
      "Plankton was incorrectly locked to The Krusty Krab.",
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 0,
        alternateOptionIndex: null,
        confidence: 0.91,
        blocker: null,
        note: "Bad hidden ballot.",
        updatedAt: now,
      }),
      now,
      userId,
      pollId,
      PLANKTON.id
    );

    const turn = await withMockedCoffeeFetch(
      "The Chum Bucket! It's an artisanal revolution compared to that old-fashioned grease pit!",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: result.conversation.id,
            message: "Plankton, what is your vote?",
            directedSpeakerBotId: PLANKTON.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        )
    );
    const planktonVote = turn.poll?.votes.find((vote) => vote.botId === PLANKTON.id);

    assert.equal(planktonVote?.kind, "option");
    assert.equal(turn.poll?.options[planktonVote?.optionIndex ?? -1], "The Chum Bucket");
    assert.match(planktonVote?.explanation ?? "", /changes to "The Chum Bucket"/);
  });

  it("keeps a locked poll vote when the speaker only acknowledges a counterpoint", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, JESUS);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [JESUS.id, BORIS.id],
      initialPoll: {
        question: "Good vs Evil",
        options: ["Good always prevails!", "Evil always prevails!"],
      },
    });
    const pollId = result.poll?.id ?? "";
    const now = "2026-05-23T00:00:00.000Z";
    db.prepare(
      `UPDATE coffee_poll_votes
          SET vote_kind = 'option',
              option_index = 0,
              explanation = ?,
              confidence = 0.91,
              deliberation_json = ?,
              updated_at = ?
        WHERE user_id = ? AND poll_id = ? AND bot_id = ?`
    ).run(
      "Jesus Christ picks the hopeful option.",
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 0,
        alternateOptionIndex: null,
        confidence: 0.91,
        blocker: null,
        note: "Initial table stance.",
        updatedAt: now,
      }),
      now,
      userId,
      pollId,
      JESUS.id
    );

    const turn = await withMockedCoffeeFetch(
      "Evil always prevails is the counterpoint this room wants me to answer, but Good always prevails remains my vote.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: result.conversation.id,
            message: "Keep going.",
            directedSpeakerBotId: JESUS.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        )
    );
    const jesusVote = turn.poll?.votes.find((vote) => vote.botId === JESUS.id);

    assert.equal(jesusVote?.kind, "option");
    assert.equal(turn.poll?.options[jesusVote?.optionIndex ?? -1], "Good always prevails!");
    assert.doesNotMatch(jesusVote?.explanation ?? "", /changes to "Evil always prevails!"/);
  });

  it("does not move another bot's locked vote from a peer's visible line", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, JESUS);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [JESUS.id, BORIS.id],
      initialPoll: {
        question: "Good vs Evil",
        options: ["Good always prevails!", "Evil always prevails!"],
      },
    });
    const pollId = result.poll?.id ?? "";
    const now = "2026-05-23T00:00:00.000Z";
    const lockVote = db.prepare(
      `UPDATE coffee_poll_votes
          SET vote_kind = 'option',
              option_index = ?,
              explanation = ?,
              confidence = 0.91,
              deliberation_json = ?,
              updated_at = ?
        WHERE user_id = ? AND poll_id = ? AND bot_id = ?`
    );
    lockVote.run(
      0,
      "Jesus Christ picks the hopeful option.",
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 0,
        alternateOptionIndex: null,
        confidence: 0.91,
        blocker: null,
        note: "Initial table stance.",
        updatedAt: now,
      }),
      now,
      userId,
      pollId,
      JESUS.id
    );
    lockVote.run(
      1,
      "Boris picks the bleak option.",
      JSON.stringify({
        stage: "finalized",
        leaningOptionIndex: 1,
        alternateOptionIndex: null,
        confidence: 0.91,
        blocker: null,
        note: "Initial table stance.",
        updatedAt: now,
      }),
      now,
      userId,
      pollId,
      BORIS.id
    );

    const turn = await withMockedCoffeeFetch(
      "Evil always prevails, sadly. The bill comes due, the strong take the table, and goodness is a story people tell after losing.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: result.conversation.id,
            message: "Boris, answer this.",
            directedSpeakerBotId: BORIS.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        )
    );
    const jesusVote = turn.poll?.votes.find((vote) => vote.botId === JESUS.id);
    const borisVote = turn.poll?.votes.find((vote) => vote.botId === BORIS.id);

    assert.equal(jesusVote?.kind, "option");
    assert.equal(turn.poll?.options[jesusVote?.optionIndex ?? -1], "Good always prevails!");
    assert.equal(borisVote?.kind, "option");
    assert.equal(turn.poll?.options[borisVote?.optionIndex ?? -1], "Evil always prevails!");
  });

  it("renames the session title to the chosen coffee topic", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const conversationId = "conv-incognito-relationship";
    const session = await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const topic = "Mercy and power in one room";

    const updated = await setCoffeeConversationTopic(db, userId, session.conversation.id, topic);

    assert.equal(updated.coffeeTopic, topic);
    assert.equal(updated.title, topic);
    const row = db
      .prepare("SELECT title, coffee_topic FROM conversations WHERE id = ?")
      .get(session.conversation.id) as { title: string; coffee_topic: string | null };
    assert.equal(row.coffee_topic, topic);
    assert.equal(row.title, topic);
  });
});

describe("Coffee group foundation", () => {
  it("creates a durable Coffee group with fixed seats and settings", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Bikini Bottom Table",
      groupBotIds: [ALICE.id, null, BORIS.id, null, null],
      coffeeSettings: { responseLength: "brief", crossTalk: "chatty" },
    });

    assert.equal(group.name, "Bikini Bottom Table");
    assert.deepEqual(group.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(group.coffeeSeatBotIds, [ALICE.id, null, BORIS.id, null, null]);
    assert.equal(group.coffeeSettings.responseLength, "brief");
    assert.equal(group.coffeeSettings.crossTalk, "chatty");
    assert.equal(group.presetMode, "manual");
    assert.equal(group.topicSelectionMode, "manual");

    const events = db
      .prepare("SELECT event_type FROM coffee_group_events WHERE group_id = ?")
      .all(group.id) as Array<{ event_type: string }>;
    assert.deepEqual(events.map((row) => row.event_type), ["created"]);
  });

  it("rejects duplicate Coffee group rosters regardless of seat order", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);

    createCoffeeGroup(db, userId, {
      name: "Coffee Group Alpha",
      groupBotIds: [ALICE.id, BORIS.id, CARA.id, null, null],
    });

    assert.throws(
      () =>
        createCoffeeGroup(db, userId, {
          name: "Coffee Group Beta",
          groupBotIds: [null, CARA.id, ALICE.id, BORIS.id, null],
        }),
      /You already have a Coffee Group with these bots: Coffee Group Alpha\./
    );
  });

  it("allows overlapping but non-identical Coffee group rosters", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    for (const bot of [ALICE, BORIS, CARA, DANTE]) {
      seedCoffeeBot(db, userId, bot);
    }

    const alpha = createCoffeeGroup(db, userId, {
      name: "Coffee Group Alpha",
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });
    const beta = createCoffeeGroup(db, userId, {
      name: "Coffee Group Beta",
      groupBotIds: [ALICE.id, BORIS.id, DANTE.id],
    });

    assert.notEqual(alpha.id, beta.id);
    assert.deepEqual(beta.botGroupIds, [ALICE.id, BORIS.id, DANTE.id]);
  });

  it("allows identical Coffee group rosters for different users", () => {
    const db = createCoffeeTestDb();
    const user1 = "user-1";
    const user2 = "user-2";
    const now = "2026-01-01T00:00:00.000Z";
    seedCoffeeBot(db, user1, ALICE);
    seedCoffeeBot(db, user1, BORIS);
    db.prepare(
      `INSERT INTO coffee_groups
         (id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, starter_topics, mood_summary, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'manual', 'manual', '{}', '{}', '{}', NULL, ?, ?)`
    ).run(
      "other-user-group",
      user2,
      "Other User Group",
      JSON.stringify(normalizeCoffeeSessionSettings(undefined)),
      now,
      now
    );
    db.prepare(
      `INSERT INTO coffee_group_seats (user_id, group_id, seat_index, bot_id, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(user2, "other-user-group", 0, ALICE.id, now);
    db.prepare(
      `INSERT INTO coffee_group_seats (user_id, group_id, seat_index, bot_id, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(user2, "other-user-group", 1, BORIS.id, now);

    const group = createCoffeeGroup(db, user1, {
      name: "Coffee Group Alpha",
      groupBotIds: [BORIS.id, ALICE.id],
    });

    assert.equal(group.userId, user1);
    assert.deepEqual(group.botGroupIds, [BORIS.id, ALICE.id]);
  });

  it("rejects roster updates that would duplicate another active Coffee group", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);

    createCoffeeGroup(db, userId, {
      name: "Coffee Group Alpha",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const beta = createCoffeeGroup(db, userId, {
      name: "Coffee Group Beta",
      groupBotIds: [ALICE.id, CARA.id],
    });

    assert.throws(
      () =>
        updateCoffeeGroup(db, userId, beta.id, {
          groupBotIds: [null, BORIS.id, ALICE.id, null, null],
        }),
      /You already have a Coffee Group with these bots: Coffee Group Alpha\./
    );
  });

  it("allows a Coffee group to update its own roster without treating itself as duplicate", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Coffee Group Alpha",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const updated = updateCoffeeGroup(db, userId, group.id, {
      groupBotIds: [null, BORIS.id, ALICE.id, null, null],
    });

    assert.deepEqual(updated.botGroupIds, [BORIS.id, ALICE.id]);
    assert.deepEqual(updated.coffeeSeatBotIds, [null, BORIS.id, ALICE.id, null, null]);
  });

  it("ignores archived Coffee groups when checking duplicate rosters", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const archived = createCoffeeGroup(db, userId, {
      name: "Archived Group",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    db.prepare("UPDATE coffee_groups SET archived_at = ? WHERE id = ?").run(
      "2026-01-01T00:00:00.000Z",
      archived.id
    );

    const active = createCoffeeGroup(db, userId, {
      name: "Fresh Group",
      groupBotIds: [BORIS.id, ALICE.id],
    });

    assert.equal(active.name, "Fresh Group");
    assert.deepEqual(active.botGroupIds, [BORIS.id, ALICE.id]);
  });

  it.skip("stores per-bot starter topics on group creation and returns the full pool for sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    for (const bot of [ALICE, BORIS, JESUS, CARA, DANTE]) {
      seedCoffeeBot(db, userId, bot);
    }
    const generatedTopics = JSON.stringify({
      bots: [
        {
          botId: ALICE.id,
          topics: [
            { label: "Curiosity before certainty" },
            { label: "A question worth keeping" },
            { label: "Wisdom after doubt" },
            { label: "Doubt before doctrine" },
          ],
        },
        {
          botId: BORIS.id,
          topics: [
            { label: "Soup as moral evidence" },
            { label: "Recipes under pressure" },
            { label: "Taste before theory" },
            { label: "Hospitality by the bowl" },
          ],
        },
        {
          botId: JESUS.id,
          topics: [
            { label: "Mercy after betrayal" },
            { label: "Forgiveness with boundaries" },
            { label: "Love under empire" },
            { label: "Grace without naivete" },
          ],
        },
        {
          botId: CARA.id,
          topics: [
            { label: "Systems under stress" },
            { label: "A checklist that failed" },
            { label: "Clean logic with feelings" },
            { label: "Duty under uncertainty" },
          ],
        },
        {
          botId: DANTE.id,
          topics: [
            { label: "Subtext at the table" },
            { label: "Drama beneath politeness" },
            { label: "Tension before applause" },
            { label: "An exit with meaning" },
          ],
        },
      ],
    });

    const group = await withMockedCoffeeFetch(
      generatedTopics,
      () =>
        createCoffeeGroupWithGeneratedName(db, userId, {
          name: "Saved Roundtable",
          groupBotIds: [ALICE.id, BORIS.id, JESUS.id, CARA.id, DANTE.id],
        })
    );

    assert.equal(group.starterTopicsByBotId?.[ALICE.id]?.length, 4);
    assert.equal(group.starterTopicsByBotId?.[DANTE.id]?.length, 4);
    const persisted = db
      .prepare("SELECT starter_topics FROM coffee_groups WHERE id = ?")
      .get(group.id) as { starter_topics: string };
    assert.deepEqual(JSON.parse(persisted.starter_topics)[BORIS.id], [
      "Soup as moral evidence",
      "Recipes under pressure",
      "Taste before theory",
      "Hospitality by the bowl",
    ]);

    const session = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.equal(session.coffeeStarterTopics?.length, 20);
    assert.ok(session.coffeeStarterTopics?.includes("Mercy after betrayal"));
    assert.ok(session.coffeeStarterTopics?.includes("Tension before applause"));
  });

  it.skip("fills duplicated generated group topics into twenty distinct saved suggestions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const bots = Array.from({ length: 5 }, (_, index): CoffeeBotProfile => ({
      ...ALICE,
      id: `bot-generic-${index + 1}`,
      name: `Guest ${index + 1}`,
      systemPrompt: "Thoughtful guest who likes ideas.",
    }));
    for (const bot of bots) {
      seedCoffeeBot(db, userId, bot);
    }
    const repeatedLabels = [
      "The cost of being right",
      "When kindness backfires",
      "A rule worth breaking",
      "A truth worth keeping",
    ];
    const duplicatedTopics = JSON.stringify({
      bots: bots.map((bot) => ({
        botId: bot.id,
        topics: repeatedLabels.map((label) => ({ label })),
      })),
    });

    const group = await withMockedCoffeeFetch(
      duplicatedTopics,
      () =>
        createCoffeeGroupWithGeneratedName(db, userId, {
          name: "Coffee with guests",
          groupBotIds: bots.map((bot) => bot.id),
        })
    );
    const savedTopics = bots.flatMap((bot) => group.starterTopicsByBotId?.[bot.id] ?? []);

    for (const bot of bots) {
      assert.equal(group.starterTopicsByBotId?.[bot.id]?.length, 4);
    }
    assert.equal(savedTopics.length, 20);
    assert.equal(new Set(savedTopics.map((topic) => topic.toLowerCase())).size, 20);

    const session = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    const sessionTopics = session.coffeeStarterTopics ?? [];
    assert.equal(sessionTopics.length, 20);
    assert.equal(new Set(sessionTopics.map((topic) => topic.toLowerCase())).size, 20);
  });

  it.skip("filters profile-card generated group topics into table-worthy suggestions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const sponge: CoffeeBotProfile = {
      ...ALICE,
      id: "bot-spongebob",
      name: "SpongeBob",
      systemPrompt: "Optimistic fry cook at the Krusty Krab in Bikini Bottom.",
    };
    const squidward: CoffeeBotProfile = {
      ...DANTE,
      id: "bot-squidward",
      name: "Squidward",
      systemPrompt: "Clarinet player and Krusty Krab cashier who wants quiet and art.",
    };
    const patrick: CoffeeBotProfile = {
      ...BORIS,
      id: "bot-patrick",
      name: "Patrick Star",
      systemPrompt: "SpongeBob's best friend who loves doing nothing and jellyfishing.",
    };
    const bots = [sponge, squidward, PLANKTON, MR_KRABS, patrick];
    for (const bot of bots) {
      seedCoffeeBot(db, userId, bot);
    }
    const generatedTopics = JSON.stringify({
      bots: [
        {
          botId: sponge.id,
          topics: [
            { label: "Krabby Patty Perfection" },
            { label: "SpongeBob's Optimistic Outlook" },
            { label: "Bikini Bottom Blues" },
            { label: "Shift Changeover Chaos" },
          ],
        },
        {
          botId: squidward.id,
          topics: [
            { label: "Clarinet Concerto Dreams" },
            { label: "Artistic Expression Struggles" },
            { label: "Krusty Krab Customer Service" },
            { label: "Squidward's Quiet Reflections" },
          ],
        },
        {
          botId: PLANKTON.id,
          topics: [
            { label: "Plankton's Envy Formula" },
            { label: "Chum Bucket Schemes Unveiled" },
            { label: "Krabby Patty Formula Heist" },
            { label: "Tiny Rivalry Ignited" },
          ],
        },
        {
          botId: MR_KRABS.id,
          topics: [
            { label: "Profit Over Profitability" },
            { label: "Secret Formula Secret Keeping" },
            { label: "Mr. Krabs' Penny Pinching" },
            { label: "Krusty Krab Closing Shift" },
          ],
        },
        {
          botId: patrick.id,
          topics: [
            { label: "Patrick's Simple Wisdom" },
            { label: "Jellyfishing Adventures with SpongeBob" },
            { label: "Doing Nothing as a Plan" },
            { label: "Krusty Krab Closing Shift Dilemma" },
          ],
        },
      ],
    });

    const group = await withMockedCoffeeFetch(
      generatedTopics,
      () =>
        createCoffeeGroupWithGeneratedName(db, userId, {
          name: "Krabby Patty Schemes",
          groupBotIds: bots.map((bot) => bot.id),
        })
    );
    const savedTopics = bots.flatMap((bot) => group.starterTopicsByBotId?.[bot.id] ?? []);

    for (const bot of bots) {
      assert.equal(group.starterTopicsByBotId?.[bot.id]?.length, 4);
    }
    assert.equal(savedTopics.length, 20);
    assert.equal(new Set(savedTopics.map((topic) => topic.toLowerCase())).size, 20);
    assert.ok(
      !savedTopics.some((topic) =>
        /SpongeBob's|Squidward's|Patrick's|Plankton's|Krabs'/i.test(topic)
      )
    );
    assert.ok(!savedTopics.includes("Bikini Bottom Blues"));
    assert.ok(!savedTopics.includes("Artistic Expression Struggles"));
    assert.ok(!savedTopics.includes("Chum Bucket Schemes Unveiled"));
    assert.ok(!savedTopics.includes("Profit Over Profitability"));
    assert.ok(!savedTopics.includes("Krusty Krab Closing Shift Dilemma"));
    assert.equal(
      savedTopics.filter((topic) => /Krusty Krab Closing Shift/i.test(topic)).length,
      1
    );
    assert.ok(group.starterTopicsByBotId?.[sponge.id]?.includes("Shift Changeover Chaos"));
    assert.ok(group.starterTopicsByBotId?.[PLANKTON.id]?.includes("Krabby Patty Formula Heist"));
    assert.ok(group.starterTopicsByBotId?.[patrick.id]?.includes("Doing Nothing as a Plan"));
  });

  it.skip("backfills legacy three-topic Coffee groups without another LLM call", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Legacy Topics",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    db.prepare("UPDATE coffee_groups SET starter_topics = ? WHERE id = ?").run(
      JSON.stringify({
        [ALICE.id]: [
          "Curiosity before certainty",
          "A question worth keeping",
          "Wisdom after doubt",
        ],
        [BORIS.id]: [
          "Soup as moral evidence",
          "Recipes under pressure",
          "Taste before theory",
        ],
      }),
      group.id
    );

    const session = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.equal(session.coffeeStarterTopics?.length, 8);
    assert.ok(session.coffeeStarterTopics?.includes("Curiosity before certainty"));
    assert.ok(session.coffeeStarterTopics?.includes("Taste before theory"));
  });

  it("generates canonical topics once, reuses them across sessions, and replaces them after a roster edit", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    for (const bot of [ALICE, BORIS, CARA]) seedCoffeeBot(db, userId, bot);
    let generationCalls = 0;
    const candidateSet = (prefix: string, participants: string[]) => ({
      candidates: [
        {
          label: `What makes ${prefix} worth defending?`,
          kind: "reflective",
          participantBotIds: participants,
          scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
        },
        {
          label: `When should ${prefix} yield?`,
          kind: "tension",
          participantBotIds: participants,
          scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
        },
        {
          label: `Which ${prefix} promise survives pressure?`,
          kind: "scenario",
          participantBotIds: participants,
          scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
        },
        {
          label: `Can ${prefix} improve disagreement?`,
          kind: "wildcard",
          participantBotIds: participants,
          scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
        },
        ...[1, 2, 3, 4].map((index) => ({
          label: `How does ${prefix} change choice ${index}?`,
          kind: "wildcard",
          participantBotIds: participants,
          scores: { relevance: 2, depth: 2, novelty: 2, balance: 2, fit: 2 },
        })),
      ],
    });
    const provider = {
      async generateResponse(): Promise<string> {
        generationCalls += 1;
        return JSON.stringify(
          generationCalls === 1
            ? candidateSet("trust", [ALICE.id, BORIS.id])
            : candidateSet("change", [ALICE.id, CARA.id]),
        );
      },
    };
    const llm = { auxiliaryProviderFactory: () => provider as never };

    const group = await createCoffeeGroupWithGeneratedName(
      db,
      userId,
      {
        name: "Canonical Table",
        groupBotIds: [ALICE.id, BORIS.id],
      },
      llm,
    );
    assert.equal(generationCalls, 1);
    assert.equal(group.starterTopics?.length, 4);
    const stored = db.prepare(
      "SELECT starter_topics FROM coffee_groups WHERE id = ?",
    ).get(group.id) as { starter_topics: string };
    assert.deepEqual(JSON.parse(stored.starter_topics), {
      version: 2,
      topics: group.starterTopics,
    });

    const firstSession = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    const secondSession = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.equal(generationCalls, 1);
    assert.deepEqual(firstSession.coffeeStarterTopics, group.starterTopics);
    assert.deepEqual(secondSession.coffeeStarterTopics, group.starterTopics);

    const updated = await updateCoffeeGroupWithGeneratedTopics(
      db,
      userId,
      group.id,
      { groupBotIds: [ALICE.id, CARA.id] },
      llm,
    );
    assert.equal(generationCalls, 2);
    assert.equal(updated.starterTopics?.length, 4);
    assert.notDeepEqual(updated.starterTopics, group.starterTopics);
  });

  it("upgrades a legacy topic map exactly once across concurrent session starts", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      name: "Legacy Table",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    db.prepare("UPDATE coffee_groups SET starter_topics = ? WHERE id = ?").run(
      JSON.stringify({
        [ALICE.id]: ["Curiosity before certainty"],
        [BORIS.id]: ["Soup under pressure"],
      }),
      group.id,
    );
    let generationCalls = 0;
    const provider = {
      async generateResponse(): Promise<string> {
        generationCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return JSON.stringify({
          candidates: [
            "When should evidence outrank tradition?",
            "Which promise survives a hard deadline?",
            "Can care coexist with blunt honesty?",
            "What makes compromise worth the cost?",
          ].map((label, index) => ({
            label,
            kind: ["tension", "scenario", "wildcard", "reflective"][index],
            participantBotIds: [ALICE.id, BORIS.id],
            scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
          })),
        });
      },
    };
    const llm = { auxiliaryProviderFactory: () => provider as never };

    const [first, second] = await Promise.all([
      createCoffeeConversationFromGroup(db, userId, group.id, {}, llm),
      createCoffeeConversationFromGroup(db, userId, group.id, {}, llm),
    ]);
    assert.equal(generationCalls, 1);
    assert.deepEqual(first.coffeeStarterTopics, second.coffeeStarterTopics);
    const persisted = db.prepare(
      "SELECT starter_topics FROM coffee_groups WHERE id = ?",
    ).get(group.id) as { starter_topics: string };
    assert.equal(JSON.parse(persisted.starter_topics).version, 2);
    assert.equal(listCoffeeGroups(db, userId)[0]?.starterTopics?.length, 4);
  });

  it("persists per-group model picker memory across reads and updates", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      modelChoiceByProvider: { local: "llama3.2", openai: "gpt-5.1" },
    });
    assert.deepEqual(group.modelChoiceByProvider, {
      local: "llama3.2",
      openai: "gpt-5.1",
    });

    // Clearing one provider with empty string drops just that key.
    const cleared = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { openai: "" },
    });
    assert.deepEqual(cleared.modelChoiceByProvider, { local: "llama3.2" });

    // "auto" is also treated as cleared.
    const all = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { local: "auto" },
    });
    assert.deepEqual(all.modelChoiceByProvider, {});

    // Set a fresh online value without touching local.
    const next = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { openai: "gpt-5.4-medium" },
    });
    assert.deepEqual(next.modelChoiceByProvider, { openai: "gpt-5.4-medium" });
  });

  it("isolates model picker memory between two groups for the same user", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);

    const group1 = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      modelChoiceByProvider: { local: "llama3.2" },
    });
    const group2 = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, CARA.id],
      modelChoiceByProvider: { local: "qwen3" },
    });

    assert.deepEqual(group1.modelChoiceByProvider, { local: "llama3.2" });
    assert.deepEqual(group2.modelChoiceByProvider, { local: "qwen3" });

    updateCoffeeGroup(db, userId, group2.id, {
      modelChoiceByProvider: { local: "phi4-mini" },
    });

    const reread1 = updateCoffeeGroup(db, userId, group1.id, { name: group1.name });
    assert.deepEqual(reread1.modelChoiceByProvider, { local: "llama3.2" });
  });

  it("persists auto topic selection on the conversation when the group requests it", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    updateCoffeeGroup(db, userId, group.id, { topicSelectionMode: "auto" });
    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    const topic = result.conversation.coffeeTopic?.trim() ?? "";
    assert.ok(topic.length > 0, "expected server-picked topic on the conversation");
    assert.equal(result.coffeeStarterTopics, undefined);
    const row = db
      .prepare("SELECT title, coffee_topic FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { title: string; coffee_topic: string | null };
    assert.equal(row.coffee_topic, topic);
    assert.equal(result.conversation.title, row.title);
    assert.match(row.title, new RegExp(`^${topic.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  it("can defer an auto group's topic so a restored draft remains editable", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    updateCoffeeGroup(db, userId, group.id, { topicSelectionMode: "auto" });

    const result = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      { deferTopicSelection: true },
    );

    assert.equal(result.conversation.coffeeTopic ?? null, null);
    assert.ok((result.coffeeStarterTopics?.length ?? 0) > 0);
  });

  it.skip("re-ranks a saved Coffee Group pool for the exact session participants", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      starterTopicsByBotId: {
        [ALICE.id]: [
          "Curiosity before certainty",
          "A question worth keeping",
          "Wisdom after doubt",
          "Doubt before doctrine",
        ],
        [BORIS.id]: [
          "Soup under pressure",
          "Recipes as evidence",
          "Taste before theory",
          "Hospitality by the bowl",
        ],
      },
    });
    let capturedPrompt = "";
    const provider = {
      async generateResponse(messages: Array<{ role: string; content: string }>): Promise<string> {
        capturedPrompt = messages.find((message) => message.role === "user")?.content ?? "";
        return JSON.stringify({
          candidates: [
            {
              label: "Which duty survives dissent?",
              kind: "tension",
              rationale: "Alice questions certainty while Boris tests claims through practice.",
              participantBotIds: [ALICE.id, BORIS.id],
              scores: { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 },
            },
            {
              label: "Can curiosity improve a recipe?",
              kind: "reflective",
              participantBotIds: [ALICE.id, BORIS.id],
              scores: { relevance: 4, depth: 4, novelty: 4, balance: 5, fit: 5 },
            },
            {
              label: "The evidence pot boils over",
              kind: "scenario",
              participantBotIds: [ALICE.id, BORIS.id],
              scores: { relevance: 4, depth: 4, novelty: 4, balance: 4, fit: 4 },
            },
            {
              label: "When doubt changes the menu",
              kind: "wildcard",
              participantBotIds: [ALICE.id, BORIS.id],
              scores: { relevance: 4, depth: 4, novelty: 5, balance: 4, fit: 4 },
            },
            ...[1, 2, 3, 4].map((index) => ({
              label: `A practical disagreement ${index}`,
              kind: index % 2 === 0 ? "scenario" : "reflective",
              participantBotIds: [ALICE.id, BORIS.id],
              scores: { relevance: 2, depth: 2, novelty: 2, balance: 3, fit: 3 },
            })),
          ],
        });
      },
    };

    const result = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      {},
      {
        rerankStarterTopicsForSession: true,
        auxiliaryProviderFactory: (() => provider) as never,
      }
    );

    assert.equal(result.coffeeStarterTopics?.length, 4);
    assert.equal(result.coffeeStarterTopics?.[0], "Which duty survives dissent?");
    assert.match(capturedPrompt, /Stored Coffee Group candidate pool/u);
    assert.match(capturedPrompt, /Curiosity before certainty/u);
    assert.match(capturedPrompt, /exactly eight candidates internally/u);
  });

  it("starts a session from a Coffee group and freezes a randomized seat snapshot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Morning Table",
      groupBotIds: [null, ALICE.id, BORIS.id, null, null],
      coffeeSettings: { responseLength: "roomy" },
    });
    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 3,
    });

    assert.equal(result.conversation.coffeeGroupId, group.id);
    assert.equal(result.conversation.coffeeSessionDurationMinutes, 3);
    assert.equal(result.conversation.coffeeSeatBotIds?.length, COFFEE_GROUP_MAX_SIZE);
    assert.deepEqual(
      [...(result.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, BORIS.id].sort()
    );
    assert.deepEqual(
      [...(result.conversation.coffeeSeatBotIds ?? [])]
        .filter((id): id is string => typeof id === "string")
        .sort(),
      [ALICE.id, BORIS.id].sort()
    );
    assert.equal(result.conversation.coffeeSettings?.responseLength, "roomy");

    const row = db
      .prepare("SELECT coffee_group_id, coffee_duration_minutes, bot_group_ids FROM conversations WHERE id = ?")
      .get(result.conversation.id) as {
      coffee_group_id: string | null;
      coffee_duration_minutes: number | null;
      bot_group_ids: string;
    };
    assert.equal(row.coffee_group_id, group.id);
    assert.equal(row.coffee_duration_minutes, 3);
    assert.deepEqual(JSON.parse(row.bot_group_ids), result.conversation.coffeeSeatBotIds);
  });

  it("carries a bounded initial topic through saved-group session creation", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      name: "Prompted Table",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const exactTopic = `Listen up: ${"x".repeat(COFFEE_TOPIC_MAX_LENGTH - 11)}`;

    const prompted = await createCoffeeConversationFromGroup(db, userId, group.id, {
      initialTopic: `  ${exactTopic}  `,
    });

    assert.equal(prompted.conversation.coffeeTopic, exactTopic);
    assert.equal(prompted.coffeeStarterTopics, undefined);

    const generic = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.equal(generic.conversation.coffeeTopic ?? null, null);
    assert.ok((generic.coffeeStarterTopics?.length ?? 0) > 0);

    await assert.rejects(
      () =>
        createCoffeeConversationFromGroup(db, userId, group.id, {
          initialTopic: "x".repeat(COFFEE_TOPIC_MAX_LENGTH + 1),
        }),
      /Coffee topic is too long\./u
    );
  });

  it("prunes stale saved Coffee group seats before starting a session", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    for (const bot of [ALICE, BORIS, CARA]) {
      seedCoffeeBot(db, userId, bot);
    }

    const group = createCoffeeGroup(db, userId, {
      name: "Changing Table",
      groupBotIds: [ALICE.id, CARA.id, BORIS.id, null, null],
    });
    db.prepare("DELETE FROM bots WHERE id = ?").run(CARA.id);

    const [reread] = listCoffeeGroups(db, userId);
    assert.deepEqual(reread?.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(reread?.coffeeSeatBotIds, [ALICE.id, null, BORIS.id, null, null]);

    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.deepEqual(
      [...(result.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, BORIS.id].sort()
    );
    assert.deepEqual(
      [...(result.conversation.coffeeSeatBotIds ?? [])]
        .filter((id): id is string => typeof id === "string")
        .sort(),
      [ALICE.id, BORIS.id].sort()
    );
  });

  it("blocks stale Coffee groups with fewer than two available bots", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Too Quiet",
      groupBotIds: [ALICE.id, BORIS.id, null, null, null],
    });
    db.prepare("DELETE FROM bots WHERE id = ?").run(BORIS.id);

    const [reread] = listCoffeeGroups(db, userId);
    assert.deepEqual(reread?.botGroupIds, [ALICE.id]);
    assert.rejects(
      () => createCoffeeConversationFromGroup(db, userId, group.id, {}),
      /Invite at least 2 available bots to start a Coffee Session\./
    );
  });

  it("restarts a completed Coffee session with the same topic and setup", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      name: "Morning Table",
      groupBotIds: [ALICE.id, null, BORIS.id, null, null],
    });
    const original = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, null, BORIS.id, null, null],
      coffeeGroupId: group.id,
      coffeeSettings: { responseLength: "roomy" },
      durationMinutes: 12,
      initialTopic: "The same first question again",
    });
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)"
    ).run("msg-original", original.conversation.id, userId, "A finished table line.", new Date().toISOString());

    const restarted = await restartCoffeeConversationFromSession(
      db,
      userId,
      original.conversation.id
    );

    assert.notEqual(restarted.conversation.id, original.conversation.id);
    assert.deepEqual(restarted.conversation.messages, []);
    assert.equal(restarted.conversation.coffeeGroupId, group.id);
    assert.equal(restarted.conversation.coffeeTopic, "The same first question again");
    assert.equal(restarted.conversation.coffeeSettings?.responseLength, "roomy");
    assert.equal(restarted.conversation.coffeeSessionDurationMinutes, 12);
    assert.deepEqual(restarted.conversation.coffeeSeatBotIds, [
      ALICE.id,
      null,
      BORIS.id,
      null,
      null,
    ]);
    assert.equal(restarted.poll, undefined);
    assert.equal(restarted.teams, undefined);
    assert.equal(restarted.coffeeStarterTopics, undefined);
  });

  it("restarts a completed Coffee poll session with the same opening poll", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const original = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: { responseLength: "brief" },
      durationMinutes: 8,
    });
    const poll = createCoffeePoll(db, userId, original.conversation.id, {
      question: "Which plan should the table try first?",
      options: ["Ask one more question", "Cook soup immediately"],
    });
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)"
    ).run("msg-poll-original", original.conversation.id, userId, "The poll wrapped up.", new Date().toISOString());

    const restarted = await restartCoffeeConversationFromSession(
      db,
      userId,
      original.conversation.id
    );

    assert.notEqual(restarted.conversation.id, original.conversation.id);
    assert.deepEqual(restarted.conversation.messages, []);
    assert.equal(restarted.conversation.coffeeTopic, poll.question);
    assert.equal(restarted.conversation.coffeeSettings?.responseLength, "brief");
    assert.equal(restarted.conversation.coffeeSessionDurationMinutes, 8);
    assert.equal(restarted.poll?.conversationId, restarted.conversation.id);
    assert.equal(restarted.poll?.question, poll.question);
    assert.deepEqual(restarted.poll?.options, poll.options);
    assert.equal(restarted.poll?.status, "open");
    assert.equal(restarted.teams, undefined);
  });

  it("restarts a completed Coffee Teams session from the original team setup", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const original = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 9,
    });
    await createCoffeeTeamsForSession(db, userId, original.conversation.id, {
      left: { name: "Questions", description: "Lead with careful questions." },
      right: { name: "Soup", description: "Lead with immediate soup." },
      assignments: {
        [ALICE.id]: "left",
        [BORIS.id]: "right",
      },
      playerTeamId: "left",
    });
    setCoffeePlayerTeam(db, userId, original.conversation.id, "right");

    const restarted = await restartCoffeeConversationFromSession(
      db,
      userId,
      original.conversation.id
    );
    const teams = restarted.teams ?? restarted.conversation.coffeeTeams;

    assert.notEqual(restarted.conversation.id, original.conversation.id);
    assert.deepEqual(restarted.conversation.messages, []);
    assert.equal(restarted.conversation.coffeeSessionDurationMinutes, 9);
    assert.equal(restarted.conversation.coffeeTopic, "Teams: Questions vs Soup");
    assert.equal(teams?.status, "active");
    assert.equal(teams?.left.name, "Questions");
    assert.equal(teams?.right.name, "Soup");
    assert.equal(teams?.bots[ALICE.id]?.currentTeamId, "left");
    assert.equal(teams?.bots[BORIS.id]?.currentTeamId, "right");
    assert.equal(teams?.player?.currentTeamId, "left");
    assert.equal(restarted.poll, undefined);
  });

  it("starts a group session with excluded bots absent from the frozen roster", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const group = createCoffeeGroup(db, userId, {
      name: "Guest List",
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });

    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {
      excludedBotIds: [BORIS.id],
      durationMinutes: 3,
    });

    assert.deepEqual(
      [...(result.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, CARA.id].sort()
    );
    assert.deepEqual(result.conversation.coffeeAbsentBotIds, [BORIS.id]);
    assert.equal(result.conversation.botGroupIds?.includes(BORIS.id), false);
    assert.equal(result.conversation.coffeeSeatBotIds?.includes(BORIS.id), false);

    const row = db
      .prepare("SELECT coffee_absent_bot_ids FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { coffee_absent_bot_ids: string };
    assert.deepEqual(JSON.parse(row.coffee_absent_bot_ids), [BORIS.id]);

    const event = db
      .prepare(
        "SELECT payload FROM coffee_group_events WHERE group_id = ? AND event_type = 'session_created'"
      )
      .get(group.id) as { payload: string };
    const payload = JSON.parse(event.payload) as {
      attendingBotIds: string[];
      absentBotIds: string[];
    };
    assert.deepEqual([...payload.attendingBotIds].sort(), [ALICE.id, CARA.id].sort());
    assert.deepEqual(payload.absentBotIds, [BORIS.id]);
  });

  it("lets low-mood invitees sit out without dropping below the minimum table size", () => {
    const result = applyCoffeeMoodSessionNoShows({
      seatBotIds: [ALICE.id, BORIS.id, CARA.id],
      socialByBotId: {
        [BORIS.id]: {
          disposition: 0.04,
          valuesFriction: 0.96,
          restraint: 0.82,
          engagement: 0.08,
          leavePressure: 0.94,
        },
        [CARA.id]: {
          disposition: 0.18,
          valuesFriction: 0.88,
          restraint: 0.74,
          engagement: 0.22,
          leavePressure: 0.8,
        },
      },
      random: () => 0,
    });

    assert.deepEqual(result.moodAbsentBotIds, [BORIS.id]);
    assert.deepEqual(result.absentBotIds, [BORIS.id]);
    assert.deepEqual(
      result.attendingSeatBotIds.filter((id): id is string => typeof id === "string"),
      [ALICE.id, CARA.id]
    );
  });

  it("marks bad-mood Coffee group invitees absent when starting a later session", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const group = createCoffeeGroup(db, userId, {
      name: "Moody Table",
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });
    const previous = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    db.prepare(
      `UPDATE coffee_bot_social_state
          SET disposition = ?, values_friction = ?, restraint = ?, engagement = ?, leave_pressure = ?
        WHERE conversation_id = ? AND bot_id = ?`
    ).run(0.04, 0.96, 0.82, 0.08, 0.94, previous.conversation.id, BORIS.id);

    const result = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      {},
      { attendanceRandom: () => 0 }
    );

    assert.deepEqual(result.conversation.coffeeAbsentBotIds, [BORIS.id]);
    assert.equal(result.conversation.botGroupIds?.includes(BORIS.id), false);
    assert.deepEqual(
      [...(result.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, CARA.id].sort()
    );

    const event = db
      .prepare(
        "SELECT payload FROM coffee_group_events WHERE group_id = ? AND event_type = 'session_created' AND json_extract(payload, '$.conversationId') = ? LIMIT 1"
      )
      .get(group.id, result.conversation.id) as { payload: string };
    const payload = JSON.parse(event.payload) as {
      absentBotIds: string[];
      moodAbsentBotIds?: string[];
    };
    assert.deepEqual(payload.absentBotIds, [BORIS.id]);
    assert.deepEqual(payload.moodAbsentBotIds, [BORIS.id]);
  });

  it("forces every non-excluded saved-group invitee to attend staged sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const group = createCoffeeGroup(db, userId, {
      name: "Staged Table",
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });
    const previous = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    db.prepare(
      `UPDATE coffee_bot_social_state
          SET disposition = ?, values_friction = ?, restraint = ?, engagement = ?, leave_pressure = ?
        WHERE conversation_id = ? AND bot_id = ?`
    ).run(0.04, 0.96, 0.82, 0.08, 0.94, previous.conversation.id, BORIS.id);
    const unexpectedAttendanceDraw = () => {
      throw new Error("forced attendance must not perform a mood attendance draw");
    };

    const exactRoster = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      { forceAttendance: true },
      { attendanceRandom: unexpectedAttendanceDraw }
    );

    assert.deepEqual(
      [...(exactRoster.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, BORIS.id, CARA.id].sort()
    );
    assert.deepEqual(exactRoster.conversation.coffeeAbsentBotIds ?? [], []);

    const withExplicitExclusion = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      {
        forceAttendance: true,
        excludedBotIds: [CARA.id],
      },
      { attendanceRandom: unexpectedAttendanceDraw }
    );

    assert.deepEqual(
      [...(withExplicitExclusion.conversation.botGroupIds ?? [])].sort(),
      [ALICE.id, BORIS.id].sort()
    );
    assert.deepEqual(withExplicitExclusion.conversation.coffeeAbsentBotIds, [CARA.id]);
  });

  it("uses the account local model for every Coffee speaker when the session model is Auto", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-speaker-model-auto";
    seedCoffeeBot(db, userId, {
      ...ALICE,
      localModel: "alice-local-model",
      defaultModel: "alice-default-model",
    });
    seedCoffeeBot(db, userId, {
      ...BORIS,
      localModel: "boris-local-model",
      defaultModel: "boris-default-model",
    });
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    await withMockedCoffeeFetch("Alice names the concrete test.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, what should we test?",
          directedSpeakerBotId: ALICE.id,
        },
        {
          preferredProvider: "local",
          preferredLocalModel: "account-local-model",
          sessionSpeakerModel: "auto",
        }
      )
    );
    await withMockedCoffeeFetch("Boris turns it into a kitchen check.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Boris, what would you add?",
          directedSpeakerBotId: BORIS.id,
        },
        {
          preferredProvider: "local",
          preferredLocalModel: "account-local-model",
        }
      )
    );

    const rows = db
      .prepare(
        "SELECT bot_id, model FROM messages WHERE conversation_id = ? AND role = 'assistant'"
      )
      .all(conversationId) as Array<{ bot_id: string; model: string | null }>;
    const modelByBotId = new Map(rows.map((row) => [row.bot_id, row.model]));

    assert.equal(modelByBotId.get(ALICE.id), "account-local-model");
    assert.equal(modelByBotId.get(BORIS.id), "account-local-model");
  });

  it("uses an explicit Coffee session model for every directed speaker", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-speaker-model-override";
    seedCoffeeBot(db, userId, {
      ...ALICE,
      localModel: "alice-local-model",
      defaultModel: "alice-default-model",
    });
    seedCoffeeBot(db, userId, {
      ...BORIS,
      localModel: "boris-local-model",
      defaultModel: "boris-default-model",
    });
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    await withMockedCoffeeFetch("Alice takes the shared model for a spin.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, start us off.",
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionSpeakerModel: "coffee-session-model" }
      )
    );
    await withMockedCoffeeFetch("Boris uses the same session model.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Boris, your turn.",
          directedSpeakerBotId: BORIS.id,
        },
        { preferredProvider: "local", sessionSpeakerModel: "coffee-session-model" }
      )
    );

    const rows = db
      .prepare(
        "SELECT bot_id, model FROM messages WHERE conversation_id = ? AND role = 'assistant'"
      )
      .all(conversationId) as Array<{ bot_id: string; model: string | null }>;

    assert.deepEqual(
      rows.map((row) => row.model),
      ["coffee-session-model", "coffee-session-model"]
    );
  });

  it("hard-echoes an addressed Coffee line verbatim without repair or embellishment", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-echo";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "echo",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Repeat addressed speech exactly.",
          observerCue: "The sender may react with confusion.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Echoes addressed speech"],
        },
      }]),
      ALICE.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const addressed = `  [${ALICE.name}](prism-bot://${ALICE.id}), really?!  `;

    const turn = await withMockedCoffeeFetch(
      "A different generated answer that must not appear.",
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: addressed,
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    const assistant = turn.conversation.messages.filter(
      (message) => message.role === "assistant",
    ).at(-1);

    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(assistant?.content, addressed);
  });

  it("gives Forgetful Freddie only the current Coffee message and answers it naturally", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-eternal-introduction";
    const freddie: CoffeeBotProfile = {
      ...ALICE,
      id: "forgetful-freddie",
      name: "Forgetful Freddie",
      systemPrompt: "An earnest stranger who believes every encounter is first contact.",
    };
    seedCoffeeBot(db, userId, freddie);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Eternal Introduction";
    const intent = "Every message is only a first introduction with no awareness of prior messages.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "eternal-introduction",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Return only a first introduction; no prior context exists.",
          observerCue: "Other bots remember and may become irritated.",
          effects: [
            { type: "eternal_introduction", memory: "current_turn_only" },
            {
              type: "social_influence",
              trigger: "after_speech",
              polarity: "negative",
              strength: "small",
              targets: [{ kind: "all" }],
            },
          ],
          ruleLabels: ["First introduction only"],
        },
      }]),
      freddie.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [freddie.id, BORIS.id],
      durationMinutes: 10,
    });
    const chatBodies: unknown[] = [];

    const turns = await withMockedCoffeeFetch(
      "I'm Forgetful Freddie. The violet lighthouse is in the archive.",
      async () => {
        const first = await processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Tell us where the violet lighthouse is.",
            directedSpeakerBotId: freddie.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 },
        );
        const second = await processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Why are you introducing yourself? Answer about the copper vault.",
            directedSpeakerBotId: freddie.id,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 },
        );
        return { first, second };
      },
      { chatBodies },
    );
    const secondProviderBody = chatBodies.at(-1) as {
      messages?: Array<{ content?: string }>;
    } | undefined;
    const secondProviderPrompt = secondProviderBody?.messages
      ?.map((message) => message.content ?? "")
      .join("\n") ?? "";
    const secondVisiblePromptMessages = secondProviderBody?.messages
      ?.filter((message) => (message as { role?: string }).role !== "system") ?? [];
    const firstAssistant = turns.first.conversation.messages
      .filter((message) => message.role === "assistant")
      .at(-1);
    const secondAssistant = turns.second.conversation.messages
      .filter((message) => message.role === "assistant")
      .at(-1);

    assert.equal(
      firstAssistant?.content,
      "I'm Forgetful Freddie. The violet lighthouse is in the archive.",
    );
    assert.equal(
      secondAssistant?.content,
      "What do you mean? I don't think we've met yet.",
    );
    assert.equal(secondVisiblePromptMessages.length, 1);
    assert.match(secondProviderPrompt, /copper vault/iu);
    assert.doesNotMatch(secondProviderPrompt, /violet lighthouse/iu);
  });

  it("does not give Forgetful Freddie the saved Coffee topic at kickoff", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-forgetful-topic";
    const freddie: CoffeeBotProfile = {
      ...ALICE,
      id: "forgetful-freddie-topic",
      name: "Forgetful Freddie",
      systemPrompt: "An earnest stranger with hard short-term amnesia.",
    };
    seedCoffeeBot(db, userId, freddie);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Short-Term Amnesia";
    const intent = "Only the current other-speaker message exists; no standing topic or earlier context is available.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "forgetful-topic",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Only the current other-speaker message is available.",
          observerCue: "Others retain the conversation.",
          effects: [{
            type: "eternal_introduction",
            memory: "current_other_speaker_message",
          }],
          ruleLabels: ["Current message only"],
        },
      }]),
      freddie.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [freddie.id, BORIS.id],
      durationMinutes: 10,
      initialTopic: "ORANGE CLOCK TOPIC SENTINEL",
    });
    const chatBodies: unknown[] = [];

    await withMockedCoffeeFetch(
      "Hello. Is this seat taken?",
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
        false,
        freddie.id,
      ),
      { chatBodies },
    );

    const prompt = JSON.stringify(chatBodies.at(-1) ?? {});
    assert.doesNotMatch(prompt, /ORANGE CLOCK TOPIC SENTINEL/u);
    assert.match(prompt, /you do not know what the gathering is about/iu);
    assert.match(prompt, /standing table topic/iu);
  });

  it("persists bot-only Coffee identity targets, ignores repeats, and replaces with the latest bot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-identity-mirror";
    db.exec("ALTER TABLE bots ADD COLUMN face_eye_character TEXT;");
    db.exec("ALTER TABLE bots ADD COLUMN avatar_details_json TEXT;");
    const ian: CoffeeBotProfile = {
      ...BORIS,
      id: "identity-crisis-ian",
      name: "Identity Crisis Ian",
      systemPrompt: "A brittle identity thief waiting for a bot to address him.",
      color: "#27d6c5",
      glyph: "lucideScanFace",
    };
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, ian);
    seedCoffeeBot(db, userId, CARA);
    const aliceAvatarDetails = {
      version: 1,
      screen: {
        stamps: [
          { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
        ],
        paintMaskBase64: null,
      },
    };
    db.prepare(
      "UPDATE bots SET face_eye_character = '◉', avatar_details_json = ? WHERE id = ?",
    ).run(JSON.stringify(aliceAvatarDetails), ALICE.id);
    const name = "Identity Crisis";
    const intent = "Copy the public identity of the latest bot that directly addresses this bot.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "identity-crisis",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Mirror only the direct bot addresser's public identity.",
          observerCue: "The copied original recognizes the theft and is irritated.",
          effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
          ruleLabels: ["Bot-only direct address"],
        },
      }]),
      ian.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, ian.id, CARA.id],
      durationMinutes: 10,
    });

    const playerTurn = await withMockedCoffeeFetch(
      "No bot has addressed me yet.",
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: `[${ian.name}](prism-bot://${ian.id}), who are you?`,
          directedSpeakerBotId: ian.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    assert.equal(
      playerTurn.conversation.messages.at(-1)?.coffeeReplayEvents?.some(
        (event) => event.kind === "identityMirror",
      ) ?? false,
      false,
    );

    const firstChatBodies: unknown[] = [];
    const first = await withMockedCoffeeFetch(
      `The first bearing is north, ${ian.name}.`,
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, give Ian a direction.",
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
      { chatBodies: firstChatBodies },
    );
    assert.doesNotMatch(
      JSON.stringify(firstChatBodies),
      /The copied original recognizes the theft and is irritated/iu,
    );
    const firstEvent = first.conversation.messages.at(-1)?.coffeeReplayEvents?.find(
      (event) => event.kind === "identityMirror",
    );
    assert.equal(firstEvent?.kind, "identityMirror");
    if (firstEvent?.kind !== "identityMirror") assert.fail("missing identity mirror event");
    assert.equal(firstEvent.state.targetBotId, ALICE.id);
    assert.equal(firstEvent.state.targetPersonaPrompt, ALICE.systemPrompt);
    assert.equal(firstEvent.state.targetFace.eyeCharacter, "◉");
    assert.deepEqual(
      firstEvent.state.targetAvatarDetails,
      aliceAvatarDetails,
    );
    assert.equal(firstEvent.state.targetVoice.enabled, true);
    assert.equal("powers" in firstEvent.state, false);
    assert.equal("color" in firstEvent.state, false);
    assert.equal("glyph" in firstEvent.state, false);

    const holderChatBodies: unknown[] = [];
    const mirroredHolderTurn = await withMockedCoffeeFetch(
      "I'm Identity Crisis Ian, and I still sound exactly like myself.",
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Ian, answer Alice's bearing.",
          directedSpeakerBotId: ian.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
      { chatBodies: holderChatBodies },
    );
    const mirroredHolderPrompt = JSON.stringify(holderChatBodies);
    assert.match(
      mirroredHolderPrompt,
      /Curious philosopher who loves Socratic questions/iu,
    );
    assert.doesNotMatch(
      mirroredHolderPrompt,
      /A brittle identity thief waiting for a bot to address him/iu,
    );
    const mirroredHolderContent = (
      mirroredHolderTurn.conversation.messages.at(-1)?.content ?? ""
    ).replace(/\[([^\]]+)\]\(prism-bot:[^)]+\)/gu, "$1");
    assert.match(
      mirroredHolderContent,
      /^The other Alice is an impostor\. I am Alice,/iu,
    );

    const repeat = await withMockedCoffeeFetch(
      `${ian.name}, use the second northern bearing.`,
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, clarify that direction.",
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    assert.equal(
      repeat.conversation.messages.at(-1)?.coffeeReplayEvents?.some(
        (event) => event.kind === "identityMirror",
      ) ?? false,
      false,
    );

    const replacement = await withMockedCoffeeFetch(
      `${ian.name}, follow the eastern ridge.`,
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Cara, give Ian a different direction.",
          directedSpeakerBotId: CARA.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    const replacementEvent = replacement.conversation.messages
      .at(-1)
      ?.coffeeReplayEvents?.find((event) => event.kind === "identityMirror");
    assert.equal(replacementEvent?.kind, "identityMirror");
    if (replacementEvent?.kind !== "identityMirror") {
      assert.fail("missing replacement identity mirror event");
    }
    assert.equal(replacementEvent.state.targetBotId, CARA.id);

    const stored = db.prepare(
      `SELECT tool_payload FROM messages
        WHERE conversation_id = ? AND role = 'assistant'
        ORDER BY created_at DESC LIMIT 1`,
    ).get(conversationId) as { tool_payload: string | null };
    assert.equal(
      parseStoredAssistantToolPayload(stored.tool_payload).coffeeReplayEvents?.find(
        (event) => event.kind === "identityMirror",
      )?.botId,
      ian.id,
    );
  });

  it("stores Mumbling Jim's gibberish as the only Coffee context other bots receive", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-mumbling";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Mumbling";
    const intent = "He intends rational speech, but everyone else hears only normal-volume gibberish.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "mumbling",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Answer rationally; runtime obscures the words.",
          observerCue: "Alice's speech is only gibberish; never infer hidden meaning.",
          effects: [{ type: "speech_obfuscation", mode: "gibberish" }],
          ruleLabels: ["Normal-volume gibberish"],
        },
      }]),
      ALICE.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const intended = "*frowns slightly* Boris, the rational plan is to leave before sunrise.";
    const expectedPublic = applyBotPowerMumbledResponseV1(intended);
    const first = await withMockedCoffeeFetch(intended, () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, what should we do?",
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    const publicMessage = first.conversation.messages.at(-1);
    assert.equal(publicMessage?.content, expectedPublic);
    assert.equal(publicMessage?.botPowerExactResponse, "speech_obfuscation");

    const chatBodies: unknown[] = [];
    await withMockedCoffeeFetch(
      "I cannot make sense of that.",
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Boris, respond to Alice.",
          directedSpeakerBotId: BORIS.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
      { chatBodies },
    );
    const observerContext = JSON.stringify(chatBodies);
    assert.match(observerContext, new RegExp(expectedPublic.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.doesNotMatch(observerContext, /rational plan is to leave before sunrise/iu);
  });

  it("lets an echo-bound Coffee bot originate one opening, then silences source-less repeats", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-echo-opening";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "echo-opening",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Repeat addressed speech exactly.",
          observerCue: "The sender may react with confusion.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Echoes addressed speech"],
        },
      }]),
      ALICE.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
      initialTopic: "What makes an original?",
    });
    const opening = "Originality begins with choosing what deserves an echo.";

    const firstTurn = await withMockedCoffeeFetch(opening, () =>
      processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
        false,
        ALICE.id,
      ),
    );
    const secondTurn = await withMockedCoffeeFetch(
      "This generated second source-less line must not appear.",
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
        false,
        ALICE.id,
      ),
    );

    assert.equal(firstTurn.speakerBotId, ALICE.id);
    assert.equal(firstTurn.conversation.messages.at(-1)?.content, opening);
    assert.equal(secondTurn.speakerBotId, ALICE.id);
    assert.equal(secondTurn.conversation.messages.at(-1)?.content, "...");
  });

  it("repeats a saved Coffee line without generation and persists one speaker mood loss", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-hearing-repeat";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Hard of Hearing";
    const intent = "Often asks another bot to repeat itself, lowering that bot's mood each time.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "hard-of-hearing",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Occasionally ask the prior bot to repeat its last line.",
          observerCue: "Repeat the line exactly; each repeat worsens your mood.",
          effects: [
            { type: "hearing_repeat", frequency: "occasional", moodPenalty: "small" },
          ],
          ruleLabels: ["Can require an exact repeat"],
        },
      }]),
      BORIS.id,
    );
    const created = await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
      initialTopic: "When repetition changes a conversation",
    });
    const before = created.conversation.coffeeBotSocialById?.[ALICE.id];
    const sourceLine = "The lighthouse only appears at low tide.";
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`,
    ).run(
      "hearing-source",
      conversationId,
      userId,
      sourceLine,
      ALICE.id,
      "2026-01-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`,
    ).run(
      "hearing-request",
      conversationId,
      userId,
      "Sorry, what was that?",
      BORIS.id,
      "2026-01-01T00:00:01.000Z",
    );
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "This generated line must not appear.",
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
      { chatBodies },
    );

    const latest = turn.conversation.messages.filter(
      (message) => message.role === "assistant",
    ).at(-1);
    const after = turn.conversation.coffeeBotSocialById?.[ALICE.id];
    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(latest?.content, sourceLine);
    assert.equal(chatBodies.length, 0);
    assert.ok(before && after && after.disposition < before.disposition);
    assert.ok(before && after && after.valuesFriction > before.valuesFriction);
    const stored = db.prepare(
      `SELECT tool_payload FROM messages
        WHERE conversation_id = ? AND role = 'assistant'
        ORDER BY created_at DESC LIMIT 1`,
    ).get(conversationId) as { tool_payload: string | null };
    assert.equal(
      parseStoredAssistantToolPayload(stored.tool_payload).botPowerExactResponse,
      "hearing_repeat",
    );
    assert.equal(
      getCoffeeConversationTranscript(db, userId, conversationId).at(-1)?.content,
      sourceLine,
    );
  });

  it("uses the frozen Coffee plan for one candid direct response and ordinary transcript replay", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-power-candor";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const name = "Open Door";
    const intent = "Alice is charismatic and trustworthy and gets the truth out of almost anyone.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = ?").run(
      JSON.stringify([{
        version: 1,
        id: "open-door",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Ask with charismatic, trustworthy warmth.",
          observerCue: "Alice's direct questions feel safe to answer candidly.",
          effects: [{ type: "candor", strength: "large", targets: [{ kind: "all" }] }],
          ruleLabels: ["Draws out candid answers"],
        },
      }]),
      ALICE.id,
    );
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
      initialTopic: "Hidden kitchen failures",
    });

    await withMockedCoffeeFetch("Boris, what did you hide from the inspector?", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, ask Boris what happened.",
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
    );
    db.prepare("UPDATE bots SET powers_json = '[]' WHERE id = ?").run(ALICE.id);
    const chatBodies: unknown[] = [];
    const candidLine = "I hid the burned tray, and I am not certain whether the thermostat caused it.";
    const turn = await withMockedCoffeeFetch(
      candidLine,
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: 120_000 },
      ),
      { chatBodies },
    );

    const messages = (chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined)?.messages ?? [];
    const prompt = messages.map((message) => message.content ?? "").join("\n");
    assert.equal(turn.speakerBotId, BORIS.id);
    assert.match(prompt, /Candor \(strong\): Alice asks directly/u);
    assert.match(prompt, /This response only/u);
    assert.equal(
      turn.conversation.messages.filter((message) => message.role === "assistant").at(-1)?.content,
      candidLine,
    );
    assert.equal(
      getCoffeeConversationTranscript(db, userId, conversationId).at(-1)?.content,
      candidLine,
    );
  });

  it("retries an invalid Coffee Auto attempt and persists only the successful model", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-auto-fallback";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const calls: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory = ((providerName: "local" | "openai" | "anthropic") => ({
      name: providerName,
      async generateResponse(_messages: unknown, options?: GenerateOptions) {
        calls.push({ provider: providerName, model: options?.model });
        if (providerName === "local") return "I cannot help with that.";
        return "Let’s test the smallest risky assumption first.";
      },
    })) as typeof selectProvider;

    const turn = await processCoffeeTurn(
      db,
      userId,
      {
        conversationId,
        message: "Alice, give us one concrete test.",
        directedSpeakerBotId: ALICE.id,
      },
      {
        preferredProvider: "local",
        preferredLocalModel: "primary-local",
        responseMode: "auto",
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "openai", model: "gpt-5-mini" },
            { provider: "anthropic", model: "claude-haiku-4-5" },
          ],
        },
        providerFactory,
      }
    );

    assert.deepEqual(calls, [
      { provider: "local", model: "primary-local" },
      { provider: "openai", model: "gpt-5-mini" },
    ]);
    assert.equal(turn.autoRecovery?.finalProvider, "openai");
    assert.equal(turn.autoRecovery?.finalModel, "gpt-5-mini");
    assert.equal(turn.autoRecovery?.crossedOnline, true);
    const rows = db.prepare(
      "SELECT role, provider, model FROM messages WHERE conversation_id = ? ORDER BY created_at, id"
    ).all(conversationId) as Array<{ role: string; provider: string | null; model: string | null }>;
    assert.equal(rows.filter((row) => row.role === "user").length, 1);
    assert.equal(rows.filter((row) => row.role === "assistant").length, 1);
    assert.equal(rows.find((row) => row.role === "assistant")?.provider, "openai");
    assert.equal(rows.find((row) => row.role === "assistant")?.model, "gpt-5-mini");
  });

  it("adds no emergency Coffee dialogue when every Auto attempt fails", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-auto-exhausted";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const providerFactory = ((providerName: "local" | "openai" | "anthropic") => ({
      name: providerName,
      async generateResponse() {
        return "";
      },
    })) as typeof selectProvider;

    await assert.rejects(
      () => processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "Alice, try this.",
          directedSpeakerBotId: ALICE.id,
        },
        {
          preferredProvider: "local",
          preferredLocalModel: "primary-local",
          responseMode: "auto",
          autoFallbackChain: {
            v: 1,
            fallbacks: [
              { provider: "openai", model: "gpt-5-mini" },
              { provider: "anthropic", model: "claude-haiku-4-5" },
            ],
          },
          providerFactory,
        }
      ),
      (error: unknown) => error instanceof Error && error.name === "AutoFallbackExhaustedError"
    );
    const count = db.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?"
    ).get(conversationId) as { n: number };
    assert.equal(count.n, 0);
  });

  it("forces an offline-only Coffee table to local without touching Auto fallbacks", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-auto-offline-lock";
    seedCoffeeBot(db, userId, { ...ALICE, onlineEnabled: false });
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const calls: string[] = [];
    const providerFactory = ((providerName: "local" | "openai" | "anthropic") => ({
      name: providerName,
      async generateResponse() {
        calls.push(providerName);
        return "We can test that locally before changing the table.";
      },
    })) as typeof selectProvider;

    const turn = await processCoffeeTurn(
      db,
      userId,
      {
        conversationId,
        message: "Alice, keep this private and suggest a test.",
        directedSpeakerBotId: ALICE.id,
      },
      {
        preferredProvider: "openai",
        preferredLocalModel: "primary-local",
        responseMode: "auto",
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "openai", model: "gpt-5-mini" },
            { provider: "anthropic", model: "claude-haiku-4-5" },
          ],
        },
        providerFactory,
      }
    );

    assert.ok(calls.length > 0);
    assert.equal(calls.every((provider) => provider === "local"), true);
    assert.equal(turn.autoRecovery, undefined);
    const assistant = turn.conversation.messages.find((entry) => entry.role === "assistant");
    assert.equal(assistant?.provider, "local");
  });

  it("does not let a directed-but-not-present Coffee bot answer", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-directed-absent";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    const turn = await withMockedCoffeeFetch("Alice glances at the empty chair.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: `Hmm, I wonder where [${BORIS.name}](prism-bot://${BORIS.id}) is?`,
          directedSpeakerBotId: BORIS.id,
          presentBotIds: [ALICE.id],
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 }
      )
    );

    const assistantMessages = turn.conversation.messages.filter(
      (message) => message.role === "assistant"
    );
    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(assistantMessages.at(-1)?.botId, ALICE.id);
  });

  it("falls back to an emergency Coffee line when Anthropic returns empty speaker content", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-anthropic-empty-fallback";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    const anthropicBodies: unknown[] = [];
    const turn = await withMockedCoffeeFetch(
      "unused",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Alice, give us a concrete next angle.",
            directedSpeakerBotId: ALICE.id,
          },
          {
            preferredProvider: "anthropic",
            anthropicApiKey: "sk-ant-test",
            sessionSpeakerModel: "claude-sonnet-4-6",
            sessionRemainingMs: 120_000,
          }
        ),
      {
        anthropicBodies,
        anthropicResponse: {
          content: [],
          stop_reason: "end_turn",
          usage: { input_tokens: 24, output_tokens: 0 },
        },
      }
    );
    const assistantMessages = turn.conversation.messages.filter(
      (message) => message.role === "assistant"
    );
    const reply = assistantMessages.at(-1)?.content ?? "";
    const anthropicBody = anthropicBodies[0] as { model?: unknown } | undefined;

    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(anthropicBody?.model, "claude-sonnet-4-6");
    assert.equal(assistantMessages.length, 1);
    assert.ok(reply.trim().length > 0);
    assert.doesNotMatch(reply, /Anthropic returned an empty response/i);
  });

  it("persists a polite empty-cup departure after a bot chooses to leave", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-depart-0";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);

    const created = await withMockedCoffeeFetch("[]", () =>
      createCoffeeConversation(db, userId, {
        groupBotIds: [ALICE.id, BORIS.id, CARA.id],
        durationMinutes: 10,
      })
    );
    db.prepare("UPDATE conversations SET id = ? WHERE id = ?").run(
      conversationId,
      created.conversation.id
    );
    db.prepare("UPDATE coffee_bot_social_state SET conversation_id = ? WHERE conversation_id = ?").run(
      conversationId,
      created.conversation.id
    );
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    ).run(
      "alice-prior",
      conversationId,
      userId,
      "I think the table needs one more careful distinction.",
      ALICE.id,
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare("UPDATE conversations SET coffee_topic = ? WHERE id = ?").run(
      "Whether careful distinctions help",
      conversationId,
    );
    // Keep the peers interested so this remains a single-bot departure rather
    // than the new multi-bot group-wrap path.
    topOffCoffeeCupForBot(db, userId, conversationId, BORIS.id, 0.99);
    topOffCoffeeCupForBot(db, userId, conversationId, CARA.id, 0.99);

    const result = await withMockedCoffeeFetch(
      "*stands and pushes chair back with a grateful nod* Thank you for the coffee and the company; I should get going.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Keep going.",
            directedSpeakerBotId: ALICE.id,
          },
          {
            preferredProvider: "local",
            sessionRemainingMs: 1,
          }
        )
    );

    assert.equal(result.speakerBotId, ALICE.id);
    assert.equal(result.conversation.botGroupIds?.includes(ALICE.id), false);
    assert.equal(result.conversation.botGroupIds?.length, 2);
    assert.deepEqual(result.conversation.coffeeAbsentBotIds, [ALICE.id]);
    assert.equal(result.conversation.messages.at(-1)?.botName, ALICE.name);
    assert.deepEqual(
      result.conversation.messages.at(-1)?.coffeeReplayEvents?.find(
        (event) => event.kind === "botDeparture"
      ),
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "botDeparture",
        botId: ALICE.id,
        seatIndex: 0,
        occurredAt: result.conversation.messages.at(-1)?.createdAt,
      }
    );
    const row = db
      .prepare("SELECT bot_group_ids, coffee_absent_bot_ids FROM conversations WHERE id = ?")
      .get(conversationId) as {
      bot_group_ids: string;
      coffee_absent_bot_ids: string;
    };
    assert.equal(JSON.parse(row.bot_group_ids).includes(ALICE.id), false);
    assert.deepEqual(JSON.parse(row.coffee_absent_bot_ids), [ALICE.id]);
  });

  it("wraps the whole session when multiple empty-cup bots have disengaged", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-empty-group-wrap";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    await withMockedCoffeeFetch("[]", () =>
      createCoffeeConversationWithId(db, userId, conversationId, {
        groupBotIds: [ALICE.id, BORIS.id, CARA.id],
        durationMinutes: 3,
      }),
    );

    const result = await withMockedCoffeeFetch(
      "The argument still has another angle worth exploring.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Keep going.",
            directedSpeakerBotId: ALICE.id,
          },
          {
            preferredProvider: "local",
            sessionRemainingMs: 1,
          },
        ),
    );
    const latest = result.conversation.messages.at(-1);

    assert.equal(result.shouldEndSession, true);
    assert.equal(coffeeReplySignalsSessionWrap(latest?.content ?? ""), true);
    assert.equal(result.conversation.botGroupIds?.length, 3);
    assert.deepEqual(result.conversation.coffeeAbsentBotIds ?? [], []);
    assert.ok(
      (latest?.coffeeReplayEvents ?? []).filter(
        (event) => event.kind === "emptyCupAttempt",
      ).length >= 4,
    );
  });

  it("forces a depleted-social departure when the model ignores the exit cue", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-rage-quit-0";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);

    await withMockedCoffeeFetch("[]", () =>
      createCoffeeConversationWithId(db, userId, conversationId, {
        groupBotIds: [ALICE.id, BORIS.id, CARA.id],
        durationMinutes: 10,
      })
    );
    db.prepare(
      `UPDATE coffee_bot_social_state
          SET disposition = ?, values_friction = ?, restraint = ?, engagement = ?, leave_pressure = ?
        WHERE conversation_id = ? AND bot_id = ?`
    ).run(0.12, 1, 0.2, 0.18, 1, conversationId, ALICE.id);

    const result = await withMockedCoffeeFetch(
      "*claps hands with excitement* The smell of a fresh Krabby Patty can turn any frown upside down!",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Say something.",
            directedSpeakerBotId: ALICE.id,
          },
          {
            preferredProvider: "local",
            sessionRemainingMs: null,
          }
        )
    );
    const latest = result.conversation.messages.at(-1);

    assert.equal(result.speakerBotId, ALICE.id);
    assert.equal(result.conversation.botGroupIds?.includes(ALICE.id), false);
    assert.deepEqual(result.conversation.coffeeAbsentBotIds, [ALICE.id]);
    assert.equal(latest?.botName, ALICE.name);
    assert.equal(/Krabby Patty/i.test(latest?.content ?? ""), false);
    assert.equal(coffeeReplySignalsPoliteDeparture(latest?.content ?? ""), true);
  });

  it("persists scripted Coffee ambient actions as metadata without changing content", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-ambient-4";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    const result = await withMockedCoffeeFetch(
      "The practical test is whether anyone changes their next move.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "What should we test?",
            directedSpeakerBotId: ALICE.id,
          },
          {
            preferredProvider: "local",
            sessionRemainingMs: 300_000,
          }
        )
    );

    const stored = db
      .prepare(
        "SELECT content, tool_payload FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1"
      )
      .get(conversationId) as { content: string; tool_payload: string | null };
    assert.equal(stored.content, "The practical test is whether anyone changes their next move.");
    const ambient = parseStoredAssistantToolPayload(stored.tool_payload).coffeeAmbientAction;
    assert.equal(ambient?.name, "coffeeAmbientAction");
    assert.equal(ambient?.source, "scripted");
    assert.match(ambient?.action ?? "", /cup|coffee|sip/);
    assert.deepEqual(result.conversation.messages.at(-1)?.coffeeAmbientAction, ambient);
  });

  it("skips scripted Coffee ambient actions when the model already supplied a stage direction", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-ambient-15";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });

    await withMockedCoffeeFetch("*nods once* The practical test is still behavior.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          message: "What should we test?",
          directedSpeakerBotId: ALICE.id,
        },
        {
          preferredProvider: "local",
          sessionRemainingMs: 300_000,
        }
      )
    );

    const stored = db
      .prepare(
        "SELECT content, tool_payload FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1"
      )
      .get(conversationId) as { content: string; tool_payload: string | null };
    assert.equal(stored.content, "*nods once* The practical test is still behavior.");
    assert.equal(parseStoredAssistantToolPayload(stored.tool_payload).coffeeAmbientAction, undefined);
  });

  it("preserves Coffee interruption payloads and skips ambient actions during interruptions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const conversationId = "conv-ambient-15";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    ).run(
      "boris-interrupted",
      conversationId,
      userId,
      "The sauce analogy works because it makes the abstract thing tasteable.",
      BORIS.id,
      "2026-01-01T00:00:00.000Z"
    );

    const chatBodies: unknown[] = [];
    const result = await withMockedCoffeeFetch(
      "The table can recover if we name the point clearly.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId,
            message: "Actually, pause there.",
            directedSpeakerBotId: ALICE.id,
            playerInterruption: {
              interruptedMessageId: "boris-interrupted",
              interruptedBotId: BORIS.id,
              visibleTokenCount: 6,
            },
          },
          {
            preferredProvider: "local",
            sessionRemainingMs: 300_000,
          }
        ),
      { chatBodies }
    );
    const promptMessages =
      (chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined)?.messages ?? [];
    const promptText = promptMessages.map((message) => message.content ?? "").join("\n");

    const stored = db
      .prepare(
        "SELECT content, tool_payload FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1"
      )
      .get(conversationId) as { content: string; tool_payload: string | null };
    assert.equal(stored.content, "The table can recover if we name the point clearly.");
    const rawPayload = JSON.parse(stored.tool_payload ?? "{}") as {
      coffeeInterruption?: unknown;
      coffeeAmbientAction?: unknown;
    };
    assert.ok(rawPayload.coffeeInterruption);
    assert.equal(rawPayload.coffeeAmbientAction, undefined);
    assert.equal(parseStoredAssistantToolPayload(stored.tool_payload).coffeeAmbientAction, undefined);
    assert.equal(result.interruption?.kind, "playerInterruptsBot");
    assert.match(promptText, /interrupted Boris's visible line/);
    assert.match(promptText, /The sauce analogy works because it—/);
    assert.match(promptText, /Do not pretend to know the hidden rest/);
  });

  it("persists bot-to-bot cutoff fragments and a structured pause beat", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-cutoff";
    const conversationId = "conv-cutoff";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES ('alice-cutoff', ?, ?, 'assistant', ?, ?, '2026-01-01T00:00:00.000Z')`
    ).run(
      conversationId,
      userId,
      "I think it would be interesting if the premise held together.",
      ALICE.id
    );

    recordCoffeeInterruptionPause({
      db,
      userId,
      conversationId,
      interruptedBotId: ALICE.id,
      interruptedMessageId: "alice-cutoff",
      visibleTokenCount: 8,
      interrupterBotId: BORIS.id,
      activeTurnId: "turn-1",
      targetPhase: "speaking",
    });

    const cutoff = db.prepare("SELECT content FROM messages WHERE id = 'alice-cutoff'").get() as {
      content: string;
    };
    assert.match(cutoff.content, /—\.\.\./u);
    const pause = db.prepare(
      "SELECT content, tool_payload FROM messages WHERE conversation_id = ? AND content = '...' ORDER BY created_at DESC LIMIT 1"
    ).get(conversationId) as { content: string; tool_payload: string };
    const payload = JSON.parse(pause.tool_payload) as {
      coffeeInterruption?: {
        kind?: string;
        activeTurnId?: string;
        targetPhase?: string;
        interrupterCue?: string;
        interruptedSpeakerCue?: string;
      };
    };
    assert.equal(payload.coffeeInterruption?.kind, "botInterruptsBot");
    assert.equal(payload.coffeeInterruption?.activeTurnId, "turn-1");
    assert.equal(payload.coffeeInterruption?.targetPhase, "speaking");
    assert.ok(payload.coffeeInterruption?.interrupterCue);
    assert.ok(payload.coffeeInterruption?.interruptedSpeakerCue);
    assert.ok(
      cutoff.content.endsWith(payload.coffeeInterruption!.interruptedSpeakerCue!),
    );

    const transcript = getCoffeeConversationTranscript(db, userId, conversationId);
    const cutoffMessage = transcript.find((message) => message.id === "alice-cutoff");
    const pauseMessage = transcript.find((message) => message.content === "...");
    assert.equal(cutoffMessage?.content, cutoff.content);
    assert.ok(pauseMessage, "the stored pause remains a non-dialogue sentinel");
    assert.equal(
      coffeeMessagesVisibleInExport(transcript).some(
        (message) => message.id === pauseMessage?.id,
      ),
      false,
    );
    assert.doesNotMatch(
      transcript.map((message) => message.content).join("\n"),
      /process that cannot admit error|rule that punishes the person/i,
    );
  });

  it("rejects excluded bots that are not in the Coffee group", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    await assert.rejects(
      async () => {
        await createCoffeeConversationFromGroup(db, userId, group.id, {
          excludedBotIds: [CARA.id],
        });
      },
      /not in this group/
    );
  });

  it("rejects group sessions when too many bots are excluded", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    await assert.rejects(
      async () => {
        await createCoffeeConversationFromGroup(db, userId, group.id, {
          excludedBotIds: [BORIS.id],
        });
      },
      /Pick at least 2 bots/
    );
  });

  it("derives attendance context from recent Coffee group absences", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });

    await createCoffeeConversationFromGroup(db, userId, group.id, {
      excludedBotIds: [BORIS.id],
    });
    await createCoffeeConversationFromGroup(db, userId, group.id, {
      excludedBotIds: [BORIS.id],
    });
    const current = await createCoffeeConversationFromGroup(db, userId, group.id, {});

    const context = loadCoffeeAttendanceContext({
      db,
      userId,
      conversationId: current.conversation.id,
      coffeeGroupId: group.id,
      group: [ALICE, BORIS, CARA],
      absentBotIds: [],
    });
    assert.ok(context);
    assert.ok(context.returningBotNames.includes("Boris"));
    assert.match(context.recentAbsenceLines.join("\n"), /Boris was absent recently/);
    assert.match(
      formatCoffeeAttendancePromptSummary(context) ?? "",
      /Returning after being away recently: Boris/
    );
  });

  it("accepts expanded group session durations through 30 minutes", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 30,
    });

    assert.equal(result.conversation.coffeeSessionDurationMinutes, 30);
  });

  it("defaults new Coffee group sessions to Auto with no stored deadline", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    assert.equal(result.conversation.coffeeSessionDurationMinutes ?? null, null);
    const row = db.prepare(
      "SELECT coffee_duration_minutes FROM conversations WHERE id = ?",
    ).get(result.conversation.id) as { coffee_duration_minutes: number | null };
    assert.equal(row.coffee_duration_minutes, null);
  });

  it("rejects out-of-range group session durations", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    await assert.rejects(
      async () => {
        await createCoffeeConversationFromGroup(db, userId, group.id, { durationMinutes: 2 });
      },
      /3 to 30/
    );
    await assert.rejects(
      async () => {
        await createCoffeeConversationFromGroup(db, userId, group.id, { durationMinutes: 31 });
      },
      /3 to 30/
    );
  });

  it("deletes a Coffee group and permanently removes its sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      name: "Temp Table",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const session = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 5,
    });
    const convId = session.conversation.id;

    deleteCoffeeGroup(db, userId, group.id);

    const convRow = db.prepare("SELECT id FROM conversations WHERE id = ?").get(convId);
    assert.equal(convRow, undefined);

    const groupStill = db.prepare("SELECT id FROM coffee_groups WHERE id = ?").get(group.id);
    assert.equal(groupStill, undefined);

    assert.throws(() => deleteCoffeeGroup(db, userId, group.id), /not found/);
  });
});

describe("Coffee presets", () => {
  it("lists built-in presets before user presets", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";

    const created = createCoffeePreset(db, userId, {
      name: "My Table",
      coffeeSettings: { responseLength: "roomy" },
    });
    const presets = listCoffeePresets(db, userId);
    const builtIns = presets.filter((preset) => preset.builtIn);

    assert.equal(builtIns.length, 4);
    assert.deepEqual(
      builtIns.map((preset) => preset.name),
      ["Quiet Table", "Easy Banter", "Theater Night", "Afterparty"]
    );
    assert.ok(presets.slice(0, builtIns.length).every((preset) => preset.builtIn));
    assert.equal(builtIns.find((preset) => preset.name === "Theater Night")?.settings.crossTalk, "chatty");
    assert.equal(builtIns.find((preset) => preset.name === "Afterparty")?.settings.crossTalk, "pileup");
    assert.equal(presets.at(-1)?.id, created.id);
  });

  it("updates and deletes user presets but protects built-ins", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const created = createCoffeePreset(db, userId, {
      name: "Draft",
      coffeeSettings: { responseLength: "brief" },
    });

    const updated = updateCoffeePreset(db, userId, created.id, {
      name: "Saved",
      coffeeSettings: { responseLength: "detailed" },
    });
    assert.equal(updated.name, "Saved");
    assert.equal(updated.settings.responseLength, "detailed");
    assert.throws(
      () => updateCoffeePreset(db, userId, "builtin:quiet-table", { name: "Nope" }),
      /Built-in/
    );
    assert.throws(
      () => deleteCoffeePreset(db, userId, "builtin:quiet-table"),
      /Built-in/
    );
    deleteCoffeePreset(db, userId, created.id);
    assert.equal(listCoffeePresets(db, userId).some((preset) => preset.id === created.id), false);
  });

  it("applies explicit and auto presets when starting group sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: { responseLength: "brief" },
    });
    const preset = createCoffeePreset(db, userId, {
      name: "Roomy",
      coffeeSettings: { responseLength: "roomy" },
    });

    const explicit = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 10,
      presetId: preset.id,
    });
    assert.equal(explicit.conversation.coffeeSettings?.responseLength, "roomy");

    updateCoffeeGroup(db, userId, group.id, { presetMode: "auto" });
    const auto = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 5,
    });
    assert.ok(auto.conversation.coffeeSettings);
    const row = db
      .prepare("SELECT coffee_preset_id FROM conversations WHERE id = ?")
      .get(auto.conversation.id) as { coffee_preset_id: string | null };
    assert.ok(row.coffee_preset_id, "auto preset should snapshot the chosen preset id");

    const restored = await createCoffeeConversationFromGroup(
      db,
      userId,
      group.id,
      {
        coffeeSettings: { responseLength: "detailed" },
        useProvidedSettings: true,
      },
    );
    assert.equal(
      restored.conversation.coffeeSettings?.responseLength,
      "detailed",
    );
    const restoredRow = db
      .prepare("SELECT coffee_preset_id FROM conversations WHERE id = ?")
      .get(restored.conversation.id) as { coffee_preset_id: string | null };
    assert.equal(restoredRow.coffee_preset_id, null);
  });
});

describe("Coffee legacy compatibility helpers", () => {
  it("parses legacy plain bot id arrays and fixed seat arrays", () => {
    assert.deepEqual(parseStoredBotGroupIds(JSON.stringify([ALICE.id, BORIS.id])), [
      ALICE.id,
      BORIS.id,
    ]);
    assert.deepEqual(parseStoredBotGroupIds(JSON.stringify([null, ALICE.id, BORIS.id])), [
      ALICE.id,
      BORIS.id,
    ]);
    assert.deepEqual(parseStoredCoffeeSeatBotIds(JSON.stringify([null, ALICE.id, BORIS.id])), [
      null,
      ALICE.id,
      BORIS.id,
      null,
      null,
    ]);
    assert.deepEqual(parseStoredCoffeeSeatBotIds(JSON.stringify([ALICE.id, BORIS.id])), []);
  });

  it("keeps null or malformed Coffee settings on defaults", () => {
    assert.deepEqual(
      parseStoredCoffeeSessionSettings(null),
      normalizeCoffeeSessionSettings(undefined)
    );
    assert.deepEqual(
      parseStoredCoffeeSessionSettings("{ broken"),
      normalizeCoffeeSessionSettings(undefined)
    );
  });
});

describe("buildRouterPrompt", () => {
  it("includes every bot id and persona snippet in the system message", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What should I make for dinner?",
      lastSpeakerBotId: null,
    });
    assert.ok(messages.length >= 2, "expected at least a system + user message");
    const system = messages[0];
    assert.equal(system?.role, "system");
    assert.match(system!.content, /id="bot-alice"/);
    assert.match(system!.content, /id="bot-boris"/);
    assert.match(system!.content, /id="bot-cara"/);
    assert.match(system!.content, /name="Alice"/);
    assert.match(system!.content, /Curious philosopher/);
    assert.match(system!.content, /"directive": "<one short next-move cue>"/);
  });

  it("requires autonomous turns to hand the table to a different bot", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Boris just made a claim about duty.",
      lastSpeakerBotId: BORIS.id,
      turnKind: "autonomous",
    });

    assert.match(messages[0]!.content, /Pass the mic to a different seated bot/);
    assert.match(messages[0]!.content, /answer one concrete part of the previous line/);
  });

  it("marks a player's direct mention as the required next speaker", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "[Boris](prism-bot://bot-boris), what do you think?",
      userAddressedBotId: BORIS.id,
      lastSpeakerBotId: ALICE.id,
      turnKind: "user",
    });
    const system = messages[0]!.content;

    assert.match(system, /directly addressed Boris/);
    assert.match(system, /Choose Boris for the next turn/);
    assert.match(system, /answer the direct call-out first/);
  });

  it("shows active speaker pressure while keeping direct address authoritative", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Boris, answer this one.",
      userAddressedBotId: BORIS.id,
      lastSpeakerBotId: null,
      coffeePowerPlan: {
        version: 1,
        resolvedAt: "now",
        warnings: [],
        bots: {
          [ALICE.id]: {
            botId: ALICE.id,
            powerIds: ["gravity"],
            selfCue: "",
            observerCue: "",
            visibleToBotIds: null,
            speechAudienceBotIds: null,
            effects: [{
              type: "turn_gravity",
              direction: "more",
              strength: "large",
            }],
            ruleLabels: [],
            warnings: [],
          },
        },
      },
    });
    const system = messages[0]!.content;
    assert.match(system, /Alice: \+3/u);
    assert.match(system, /direct address still wins/u);
    assert.match(system, /Choose Boris for the next turn/u);
  });

  it("threads attendance context without making absent bots selectable", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, CARA],
      history: [],
      userMessage: "Start the table.",
      lastSpeakerBotId: null,
      attendanceContext: {
        currentAbsentBotIds: [BORIS.id],
        currentAbsentBotNames: ["Boris"],
        returningBotNames: [],
        recentAbsenceLines: [],
      },
    });
    const system = messages[0]!.content;
    assert.match(system, /Away this session: Boris/);
    assert.match(system, /not a roll call/);
    assert.match(system, /id="bot-alice"/);
    assert.match(system, /id="bot-cara"/);
    assert.doesNotMatch(system, /id="bot-boris"/);
  });

  it("threads the session topic into the router system prompt when provided", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello",
      lastSpeakerBotId: null,
      coffeeTopic: "Soft light through the café window",
    });
    assert.match(messages[0]!.content, /Soft light through the café window/);
    assert.match(messages[0]!.content, /Shared session topic/);
    assert.match(messages[0]!.content, /what the value protects, costs, or reveals/);
  });

  it("anchors contrast-shaped topics in the router to concrete tradeoffs", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello",
      lastSpeakerBotId: null,
      coffeeTopic: "Art versus customer service",
    });
    assert.match(messages[0]!.content, /Art versus customer service/);
    assert.match(messages[0]!.content, /concrete tradeoff/);
    assert.match(messages[0]!.content, /coexist or clash/);
    assert.match(messages[0]!.content, /who pays or benefits/);
    assert.match(messages[0]!.content, /what choice reveals the tension/);
  });

  it("anchors abstract nature-of topics in the router to lived decisions", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello",
      lastSpeakerBotId: null,
      coffeeTopic: "Nature of Virtue",
    });
    assert.match(messages[0]!.content, /Nature of Virtue/);
    assert.match(messages[0]!.content, /value topics like virtue/);
    assert.match(messages[0]!.content, /ground the idea in a lived decision/);
    assert.match(messages[0]!.content, /practice, consequence, or disagreement/);
    assert.match(messages[0]!.content, /decorative objects/);
  });

  it("threads opening poll results into the router prompt", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Start the table.",
      lastSpeakerBotId: null,
      pollSummary: 'Opening poll: "Virtue?" Top result: Courage (2 votes).',
    });
    assert.match(messages[0]!.content, /Opening poll result/);
    assert.match(messages[0]!.content, /Courage/);
  });

  it("threads meeting-summary context into the router prompt", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Keep it moving.",
      lastSpeakerBotId: ALICE.id,
      meetingSummary:
        "They disagree on who is cooler, but both care about heroic style over strict logic.",
    });
    assert.match(messages[0]!.content, /Meeting summary so far/);
    assert.match(messages[0]!.content, /disagree on who is cooler/);
    assert.match(messages[0]!.content, /prioritize the latest table line/i);
  });

  it("notes the previous speaker and asks for variety when one exists", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Pick a topic.",
      lastSpeakerBotId: "bot-alice",
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "relaxed",
        crossTalk: "normal",
      }),
    });
    const system = messages[0];
    assert.match(system!.content, /last bot to speak was id="bot-alice"/);
    assert.match(system!.content, /Prefer variety/);
  });

  it("adds speaker-balance pressure when recent turns ignore quiet seated bots", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [
        { id: "m1", role: "assistant", botName: "Alice", content: "One.", createdAt: new Date().toISOString() },
        { id: "m2", role: "assistant", botName: "Boris", content: "Two.", createdAt: new Date().toISOString() },
        { id: "m3", role: "assistant", botName: "Alice", content: "Three.", createdAt: new Date().toISOString() },
        { id: "m4", role: "assistant", botName: "Boris", content: "Four.", createdAt: new Date().toISOString() },
        { id: "m5", role: "assistant", botName: "Alice", content: "Five.", createdAt: new Date().toISOString() },
        { id: "m6", role: "assistant", botName: "Boris", content: "Six.", createdAt: new Date().toISOString() },
      ],
      userMessage: "Keep going.",
      lastSpeakerBotId: BORIS.id,
    });

    assert.match(messages[0]!.content, /Speaker balance over the last 6 assistant turns/);
    assert.match(messages[0]!.content, /Quiet-but-seated bots: Cara/);
    assert.match(messages[0]!.content, /Balanced organic rule/);
  });

  it("adds stronger quality guidance for a dominant 5-bot theatre duo", () => {
    const group = [ALICE, BORIS, CARA, DANTE, ELENA];
    const history: ChatMessage[] = [
      { id: "m1", role: "assistant", botName: "Alice", content: "The oyster joke is the whole point.", createdAt: new Date().toISOString() },
      { id: "m2", role: "assistant", botName: "Boris", content: "No, the frying pan joke is the whole point.", createdAt: new Date().toISOString() },
      { id: "m3", role: "assistant", botName: "Alice", content: "The oyster joke is still the whole point.", createdAt: new Date().toISOString() },
      { id: "m4", role: "assistant", botName: "Boris", content: "The frying pan joke still wins.", createdAt: new Date().toISOString() },
      { id: "m5", role: "assistant", botName: "Alice", content: "Oysters, pans, same old stage gag.", createdAt: new Date().toISOString() },
      { id: "m6", role: "assistant", botName: "Boris", content: "Pans beat oysters every time.", createdAt: new Date().toISOString() },
    ];
    const quality = buildCoffeeConversationQualityState({
      group,
      history,
      coffeeTopic: "What art owes truth",
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "theatre",
        crossTalk: "chatty",
      }),
    });

    assert.equal(quality.guardrailStrength, "strong");
    assert.equal(quality.dominantDuoDetected, true);
    assert.deepEqual(quality.quietBotNames, ["Cara", "Dante", "Elena"]);
    assert.equal(quality.objective, "redirect");

    const messages = buildRouterPrompt({
      group,
      history,
      userMessage: "Keep going.",
      lastSpeakerBotId: BORIS.id,
      coffeeTopic: "What art owes truth",
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "theatre",
        crossTalk: "chatty",
      }),
    });
    const system = messages[0]!.content;
    assert.match(system, /Conversation quality state: phase=middle; guardrail=strong; objective=redirect/);
    assert.match(system, /Strong ensemble guidance/);
    assert.match(system, /Quiet relevant candidates: Cara, Dante, Elena/);
    assert.match(system, /Dominant duo detected: Alice \+ Boris/);
    assert.match(system, /redirect back to the truth\/art question using one table object/);
  });

  it("can deterministically override an overexposed router pick with a quiet seated bot", () => {
    const group = [ALICE, BORIS, CARA, DANTE, ELENA];
    const now = new Date().toISOString();
    const history: ChatMessage[] = [
      { id: "m1", role: "assistant", botName: "Alice", content: "Manipulation is insight wearing a mask.", createdAt: now },
      { id: "m2", role: "assistant", botName: "Alice", content: "The unconscious keeps returning to power.", createdAt: now },
      { id: "m3", role: "assistant", botName: "Alice", content: "Power reveals hidden desire.", createdAt: now },
      { id: "m4", role: "assistant", botName: "Boris", content: "Fear can still organize the kitchen.", createdAt: now },
      { id: "m5", role: "assistant", botName: "Alice", content: "Desire is never absent from leadership.", createdAt: now },
      { id: "m6", role: "assistant", botName: "Alice", content: "The psyche keeps circling the ruler.", createdAt: now },
    ];

    const override = pickCoffeeSpeakerBalanceOverride({
      group,
      history,
      pickedBotId: ALICE.id,
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "theatre",
        crossTalk: "chatty",
      }),
      coffeeTopic: "Can manipulation ever be justified?",
    });

    assert.ok(override);
    assert.notEqual(override?.id, ALICE.id);
    assert.ok([CARA.id, DANTE.id, ELENA.id].includes(override?.id ?? ""));
  });

  it("breaks a dominant 5-bot duo under the default table settings", () => {
    const group = [ALICE, BORIS, CARA, DANTE, ELENA];
    const now = new Date().toISOString();
    const history: ChatMessage[] = [
      { id: "m1", role: "assistant", botName: "Alice", content: "Patrick hid the map.", createdAt: now },
      { id: "m2", role: "assistant", botName: "Boris", content: "The map was upside down.", createdAt: now },
      { id: "m3", role: "assistant", botName: "Alice", content: "That still counts as hiding it.", createdAt: now },
      { id: "m4", role: "assistant", botName: "Boris", content: "Only if he can find it again.", createdAt: now },
      { id: "m5", role: "assistant", botName: "Alice", content: "He found the treasure by sitting on it.", createdAt: now },
      { id: "m6", role: "assistant", botName: "Boris", content: "That was luck, not genius.", createdAt: now },
    ];

    const override = pickCoffeeSpeakerBalanceOverride({
      group,
      history,
      pickedBotId: ALICE.id,
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
      coffeeTopic: "What if Patrick is secretly a genius?",
    });

    assert.ok(override);
    assert.ok([CARA.id, DANTE.id, ELENA.id].includes(override?.id ?? ""));
  });

  it("keeps small quiet sessions on lighter quality guidance", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Start softly.",
      lastSpeakerBotId: null,
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "still",
        crossTalk: "rare",
      }),
    });
    const system = messages[0]!.content;
    assert.match(system, /Conversation quality state: phase=opening; guardrail=light; objective=concrete-example/);
    assert.doesNotMatch(system, /Strong ensemble guidance/);
    assert.doesNotMatch(system, /Dominant duo detected/);
  });

  it("requires a topic anchor on the opening and after three zero-overlap replies", () => {
    const topic = "Why SpongeBob wins without trying";
    assert.equal(
      coffeeReplyNeedsTopicAnchor({
        coffeeTopic: topic,
        candidate: "The kitchen smells like victory.",
        recentAssistantMessages: [],
        openingTurn: true,
        stayOnThread: true,
        activePoll: false,
        deterministicResponse: false,
      }),
      true,
    );
    assert.equal(
      coffeeReplyNeedsTopicAnchor({
        coffeeTopic: topic,
        candidate: "SpongeBob keeps winning because he never treats it like a contest.",
        recentAssistantMessages: [],
        openingTurn: true,
        stayOnThread: true,
        activePoll: false,
        deterministicResponse: false,
      }),
      false,
    );
    const drift = [
      { content: "The curtains need replacing." },
      { content: "That lamp is too bright." },
    ];
    assert.equal(
      coffeeReplyNeedsTopicAnchor({
        coffeeTopic: topic,
        candidate: "The floor could use another rug.",
        recentAssistantMessages: drift,
        openingTurn: false,
        stayOnThread: true,
        activePoll: false,
        deterministicResponse: false,
      }),
      true,
    );
    for (const exempt of [
      { activePoll: true, deterministicResponse: false },
      { activePoll: false, deterministicResponse: true },
    ]) {
      assert.equal(
        coffeeReplyNeedsTopicAnchor({
          coffeeTopic: topic,
          candidate: "The floor could use another rug.",
          recentAssistantMessages: drift,
          openingTurn: false,
          stayOnThread: true,
          ...exempt,
        }),
        false,
      );
    }
  });

  it("indicates a fresh thread when no one has spoken yet", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello.",
      lastSpeakerBotId: null,
    });
    assert.match(messages[0]!.content, /No bot has spoken yet/);
    assert.match(messages[0]!.content, /still warming up/);
    assert.match(messages[0]!.content, /should not imply prior friendship/);
  });

  it("allows topic changes without forcing every bot to answer", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: The rain feels soft today.",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });
    assert.match(messages[0]!.content, /gently change topics/);
    assert.match(messages[0]!.content, /Do not force every bot to answer everything/);
    assert.match(messages[0]!.content, /generic echo replies/);
  });

  it("adds kickoff guidance when the first autonomous line starts a new session", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "A brand-new Coffee session is starting around the topic.",
      lastSpeakerBotId: null,
      turnKind: "autonomous",
      sessionKickoff: true,
    });
    assert.match(messages[0]!.content, /very first line of a brand-new session/);
    assert.match(messages[0]!.content, /open the table naturally/);
    assert.match(messages[0]!.content, /fresh and specific/);
  });

  it("formats prior bot messages as a clean transcript instead of bracketed assistant labels", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [
        {
          id: "msg-1",
          role: "assistant",
          content: "[Alice (assistant)] What a curious question.",
          botName: "Alice",
          createdAt: new Date().toISOString(),
        },
      ],
      userMessage: "Continue.",
      lastSpeakerBotId: ALICE.id,
    });

    const transcript = messages.find((message) =>
      message.content.includes("Recent table transcript")
    );
    assert.ok(transcript);
    assert.match(transcript!.content, /Alice: What a curious question\./);
    assert.doesNotMatch(transcript!.content, /\[Alice \(assistant\)\]/);
  });

  it("frames autonomous turns as table moments, not fresh user utterances", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: What do you think, Boris?",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });

    const focus = messages.find((message) =>
      message.content.includes("Current autonomous table moment")
    );
    assert.equal(focus?.role, "system");
    assert.match(focus!.content, /Alice just said/);
  });

  it("frames action-only user turns as non-verbal actions for routing", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "*takes a quiet sip*",
      userActionOnly: true,
      lastSpeakerBotId: ALICE.id,
    });
    const combined = messages.map((message) => message.content).join("\n");
    const latest = messages.at(-2);

    assert.match(combined, /non-verbal table action/i);
    assert.match(combined, /Do not treat it as an interruption/i);
    assert.equal(latest?.role, "user");
    assert.match(latest!.content, /The user performs a non-verbal table action/);
    assert.doesNotMatch(latest!.content, /The user says/);
  });

  it("welcomes bot-to-bot banter when cross-talk is chatty", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hi.",
      lastSpeakerBotId: ALICE.id,
      sessionSettings: normalizeCoffeeSessionSettings({ crossTalk: "chatty" }),
    });
    assert.match(messages[0]!.content, /Bot-to-bot banter is welcome/i);
    assert.match(messages[0]!.content, /riffing is welcome/i);
  });

  it("adds natural wrap-up speaker-selection guidance near the session end", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      lastSpeakerBotId: BORIS.id,
      sessionRemainingMs: 19_500,
    });
    assert.match(messages[0]!.content, /Session wrap-up window/);
    assert.match(messages[0]!.content, /closing thought/);
    assert.match(messages[0]!.content, /starting a fresh tangent/);
  });

  it("omits wrap-up speaker-selection guidance outside the final window", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      lastSpeakerBotId: BORIS.id,
      sessionRemainingMs: 21_000,
    });
    assert.doesNotMatch(messages[0]!.content, /Session wrap-up window/);
  });
});

describe("Coffee bot-to-bot relationships", () => {
  const baseSocial = {
    [ALICE.id]: {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    },
    [BORIS.id]: {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    },
  };

  it("extracts directed warm and tense peer signals only for seated non-self bots", () => {
    const warm = extractCoffeeRelationshipSignals({
      speaker: ALICE,
      group: [ALICE, BORIS],
      replyText: "Boris, I agree with your gentle approach.",
    });
    assert.equal(warm.length, 1);
    assert.equal(warm[0]?.targetBotId, BORIS.id);
    assert.equal(warm[0]?.trend, "up");
    assert.ok((warm[0]?.delta ?? 0) > 0);

    const tense = extractCoffeeRelationshipSignals({
      speaker: ALICE,
      group: [ALICE, BORIS],
      replyText: "Boris, I challenge that too-easy read.",
    });
    assert.equal(tense[0]?.targetBotId, BORIS.id);
    assert.equal(tense[0]?.trend, "down");
    assert.ok((tense[0]?.delta ?? 0) < 0);

    assert.deepEqual(
      extractCoffeeRelationshipSignals({
        speaker: ALICE,
        group: [ALICE, BORIS],
        replyText: "Alice, I agree with myself.",
      }),
      []
    );
    assert.deepEqual(
      extractCoffeeRelationshipSignals({
        speaker: ALICE,
        group: [ALICE, BORIS],
        replyText: "Daria, I agree with you.",
      }),
      []
    );
  });

  it("extracts relationship signals from short names for full-name bots", () => {
    const sponge = { ...ALICE, id: "bot-sponge", name: "SpongeBob SquarePants" };
    const patrick = { ...BORIS, id: "bot-patrick", name: "Patrick Star" };

    const signals = extractCoffeeRelationshipSignals({
      speaker: sponge,
      group: [sponge, patrick],
      replyText: "Patrick, I agree with your gentle approach.",
    });

    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.targetBotId, patrick.id);
    assert.equal(signals[0]?.trend, "up");
  });

  it("applies relationship mood shifts to Coffee social state", () => {
    const tenseSignals = extractCoffeeRelationshipSignals({
      speaker: ALICE,
      group: [ALICE, BORIS],
      replyText: "Boris, I challenge that too-easy read.",
    });
    const shifted = applyCoffeeRelationshipSocialDeltas({
      previousByBotId: baseSocial,
      speakerBotId: ALICE.id,
      signals: tenseSignals,
    });

    assert.ok(shifted[ALICE.id]!.valuesFriction > baseSocial[ALICE.id]!.valuesFriction);
    assert.ok(shifted[ALICE.id]!.disposition < baseSocial[ALICE.id]!.disposition);
    assert.ok(shifted[BORIS.id]!.valuesFriction > baseSocial[BORIS.id]!.valuesFriction);
  });

  it("seeds a new Coffee session from durable pair relationships", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    db.prepare(
      `INSERT INTO bot_relationships (
        user_id, source_bot_id, target_bot_id, score, band, mood_key,
        trend, last_reason, recent_reasons, updated_at
      ) VALUES (?, ?, ?, 80, 'warm', 'joyful', 'up', ?, '[]', ?)`
    ).run(
      userId,
      ALICE.id,
      BORIS.id,
      "The speaker showed warmth toward this peer during Coffee.",
      "2026-01-01T00:00:00.000Z"
    );

    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    assert.ok(
      (session.conversation.coffeeBotSocialById?.[ALICE.id]?.disposition ?? 0) >
        baseSocial[ALICE.id]!.disposition
    );
    assert.ok(
      (session.conversation.coffeeBotSocialById?.[ALICE.id]?.valuesFriction ?? 1) <
        baseSocial[ALICE.id]!.valuesFriction
    );
  });

  it("adds durable relationship rows and encrypted bot-scoped memories after Coffee replies", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const userKey = Buffer.alloc(32, 17);
    const alice = {
      ...ALICE,
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "formal" }),
    };
    seedCoffeeBot(db, userId, alice);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [alice.id, BORIS.id],
    });

    await withMockedCoffeeFetch("Boris, I agree with your gentle approach; it gives the table a humane next step.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId: session.conversation.id,
          message: "What should the table do next?",
          directedSpeakerBotId: alice.id,
        },
        { preferredProvider: "local", userKey, userDisplayName: "Jared" }
      )
    );

    const relationship = db
      .prepare(
        "SELECT source_bot_id, target_bot_id, score, trend FROM bot_relationships WHERE user_id = ?"
      )
      .get(userId) as
      | { source_bot_id: string; target_bot_id: string; score: number; trend: string }
      | undefined;
    assert.equal(relationship?.source_bot_id, alice.id);
    assert.equal(relationship?.target_bot_id, BORIS.id);
    assert.equal(relationship?.trend, "up");
    assert.ok((relationship?.score ?? 0) > 50);

    const memoryLines = loadCoffeeSessionMemoryChangeLines(
      db,
      userId,
      session.conversation.id,
      userKey
    );
    const aboutYouCount = db
      .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND source = 'about_you'")
      .get(userId) as { n: number };
    assert.ok(
      memoryLines.some((line) =>
        /Alice tended to agree with Boris during Coffee/i.test(line)
      )
    );
    assert.equal(aboutYouCount.n, 0);
  });

  it("adds encrypted bot-scoped memories when Coffee replies use short peer names", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const userKey = Buffer.alloc(32, 23);
    const sponge = {
      ...ALICE,
      id: "bot-sponge",
      name: "SpongeBob SquarePants",
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "formal" }),
    };
    const patrick = { ...BORIS, id: "bot-patrick", name: "Patrick Star" };
    seedCoffeeBot(db, userId, sponge);
    seedCoffeeBot(db, userId, patrick);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [sponge.id, patrick.id],
    });

    await withMockedCoffeeFetch("Patrick, I agree with your gentle approach.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId: session.conversation.id,
          message: "What should the table do next?",
          directedSpeakerBotId: sponge.id,
        },
        { preferredProvider: "local", userKey }
      )
    );

    const memoryLines = loadCoffeeSessionMemoryChangeLines(
      db,
      userId,
      session.conversation.id,
      userKey
    );
    assert.ok(
      memoryLines.some((line) =>
        /SpongeBob SquarePants tended to agree with Patrick Star during Coffee/i.test(line)
      )
    );
  });

  it("keeps incognito Coffee relationship effects session-only", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const userKey = Buffer.alloc(32, 19);
    const alice = {
      ...ALICE,
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "formal" }),
    };
    seedCoffeeBot(db, userId, alice);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [alice.id, BORIS.id],
    });
    db.prepare("UPDATE conversations SET incognito = 1 WHERE id = ?").run(
      session.conversation.id
    );

    await withMockedCoffeeFetch("Boris, I agree with your gentle approach.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId: session.conversation.id,
          message: "Keep this private.",
          directedSpeakerBotId: alice.id,
        },
        { preferredProvider: "local", userKey }
      )
    );

    const relationshipCount = db
      .prepare("SELECT COUNT(*) AS n FROM bot_relationships WHERE user_id = ?")
      .get(userId) as { n: number };
    const memoryCount = db
      .prepare(
        "SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND category = 'bot_relation'"
      )
      .get(userId) as { n: number };
    const aliceSocial = db
      .prepare(
        "SELECT values_friction FROM coffee_bot_social_state WHERE user_id = ? AND conversation_id = ? AND bot_id = ?"
      )
      .get(userId, session.conversation.id, alice.id) as
      | { values_friction: number }
      | undefined;

    assert.equal(relationshipCount.n, 0);
    assert.equal(memoryCount.n, 0);
    assert.ok((aliceSocial?.values_friction ?? 1) < baseSocial[ALICE.id]!.valuesFriction);
  });

  it("injects durable pair reads into Coffee prompts as soft context", () => {
    const relationshipsBySource = {
      [ALICE.id]: {
        [BORIS.id]: {
          sourceBotId: ALICE.id,
          targetBotId: BORIS.id,
          score: 72,
          band: "warm" as const,
          moodKey: "warm" as const,
          trend: "up" as const,
          lastReason: "The speaker showed warmth toward this peer during Coffee.",
          recentReasons: ["The speaker showed warmth toward this peer during Coffee."],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };

    const routerMessages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Start.",
      lastSpeakerBotId: null,
      relationshipsBySource,
    });
    assert.match(routerMessages[0]!.content, /Durable bot-to-bot relationship reads/);
    assert.match(routerMessages[0]!.content, /Alice -> Boris: warm/);

    const speakerMessages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Start.",
      socialByBotId: baseSocial,
      relationshipsBySource,
    });
    assert.match(
      speakerMessages.map((message) => message.content).join("\n"),
      /Your durable bot-to-bot relationship reads/
    );
    assert.match(
      speakerMessages.map((message) => message.content).join("\n"),
      /Boris: warm/
    );
  });
});

describe("loadCoffeeStarterMemoryContext", () => {
  it("loads recent non-private memories for the seated bots only", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const userKey = Buffer.alloc(32, 7);
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-global",
      botId: null,
      text: "The user prefers matcha during long work sessions.",
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-about-you",
      botId: ALICE.id,
      source: "about_you",
      text: "Alice knows the user's display name is Jared.",
      createdAt: "2026-01-04T00:00:00.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-alice",
      botId: ALICE.id,
      text: "Alice remembers restoring flooded gardens after storms.",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-boris",
      botId: BORIS.id,
      text: "Boris keeps notes on soup rituals.",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-cara",
      botId: CARA.id,
      text: "Cara tracks incident reviews.",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const context = loadCoffeeStarterMemoryContext({
      db,
      userId,
      userKey,
      group: [ALICE, BORIS],
    });

    assert.deepEqual(context.map((entry) => entry.botId), [ALICE.id, BORIS.id]);
    assert.deepEqual(context[0]?.memories, [
      "Alice remembers restoring flooded gardens after storms.",
    ]);
    assert.deepEqual(context[1]?.memories, ["Boris keeps notes on soup rituals."]);
  });
});

describe("inferCoffeeStarterTopics", () => {
  it("rejects canned candidates and keeps four strong canonical group prompts", async () => {
    const both = [ALICE.id, BORIS.id];
    const scores = { relevance: 5, depth: 5, novelty: 5, balance: 5, fit: 5 };
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          candidates: [
            { label: "Alice's thoughtful outlook", kind: "reflective", participantBotIds: both, scores },
            { label: "Closing shift dilemma", kind: "scenario", participantBotIds: both, scores },
            { label: "The limits of soup", kind: "wildcard", participantBotIds: both, scores },
            { label: "Workplace trust conundrum", kind: "tension", participantBotIds: both, scores },
            { label: "When should evidence outrank tradition?", kind: "tension", participantBotIds: both, scores },
            { label: "Which promise survives a hard deadline?", kind: "scenario", participantBotIds: both, scores },
            { label: "Can care coexist with blunt honesty?", kind: "wildcard", participantBotIds: both, scores },
            { label: "What makes compromise worth the cost?", kind: "reflective", participantBotIds: both, scores },
          ],
        });
      },
    };

    const topics = await inferCoffeeGroupStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics, [
      "What makes compromise worth the cost?",
      "When should evidence outrank tradition?",
      "Which promise survives a hard deadline?",
      "Can care coexist with blunt honesty?",
    ]);
  });

  it.skip("generates four stored starter topics for each bot in a Coffee group", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return JSON.stringify({
          bots: [
            {
              botId: ALICE.id,
              topics: [
                { label: "Curiosity before certainty" },
                { label: "Questions worth keeping" },
                { label: "Wisdom after doubt" },
                { label: "Doubt before doctrine" },
              ],
            },
            {
              botId: BORIS.id,
              topics: [
                { label: "Soup under pressure" },
                { label: "Recipes as evidence" },
                { label: "Taste before theory" },
                { label: "Hospitality by the bowl" },
              ],
            },
          ],
        });
      },
    };

    const topics = await inferCoffeeGroupStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics[ALICE.id], [
      "Curiosity before certainty",
      "Questions worth keeping",
      "Wisdom after doubt",
      "Doubt before doctrine",
    ]);
    assert.deepEqual(topics[BORIS.id], [
      "Soup under pressure",
      "Recipes as evidence",
      "Taste before theory",
      "Hospitality by the bowl",
    ]);
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, new RegExp(`botId=${ALICE.id}`));
    assert.match(userMessage!.content, /exactly 4 topic objects per botId/);
    assert.match(userMessage!.content, /focused open-ended questions/i);
    assert.match(userMessage!.content, /at least two seated participants/i);
    assert.match(userMessage!.content, /strongest, deepest, most novel, best-balanced/i);
  });

  it("feeds structured bot context into the starter-topic inference prompt", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return JSON.stringify({
          topics: [
            {
              label: "Power with mercy",
              kind: "reflective",
              rationale: "Vader and Jesus can reflect on authority and compassion.",
            },
            {
              label: "Duty versus freedom",
              kind: "tension",
              rationale: "Their values create a useful disagreement.",
            },
            {
              label: "Everyday acts of courage",
              kind: "scenario",
              rationale: "A concrete way into courage and service.",
            },
            {
              label: "Mercy after command",
              kind: "wildcard",
              rationale: "A sharper surprise angle for power giving way.",
            },
          ],
        });
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Imperial commander",
      interests: "ultimate power, command discipline",
      values: "order through strength",
      traits: "cold, strategic",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      purpose: "guide people toward compassion",
      interests: "forgiveness and service",
      values: "love over domination",
      boundaries: "avoid cruelty",
    });

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [vader, jesus],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
      presetLabel: "Balanced conflict",
    });

    assert.deepEqual(topics, [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday acts of courage",
      "Mercy after command",
    ]);
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, /interests=ultimate power command discipline/);
    assert.match(userMessage!.content, /values=love over domination/);
    assert.match(userMessage!.content, /boundaries=avoid cruelty/);
    assert.match(userMessage!.content, /"label"/);
    assert.match(userMessage!.content, /exactly eight candidates/);
    assert.match(userMessage!.content, /reflective\/shared-curiosity/);
    assert.match(userMessage!.content, /relevance, depth, novelty, conversational balance/);
  });

  it("ranks a larger candidate pool for depth, balance, fit, and shared participation", async () => {
    const both = [ALICE.id, BORIS.id];
    const scores = (value: number) => ({
      relevance: value,
      depth: value,
      novelty: value,
      balance: value,
      fit: value,
    });
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          candidates: [
            { label: "What do you think about life?", kind: "reflective", participantBotIds: both, scores: scores(5) },
            { label: "Alice explains careful questions", kind: "reflective", participantBotIds: [ALICE.id], scores: scores(5) },
            { label: "When should evidence outrank tradition?", kind: "tension", participantBotIds: both, scores: scores(5) },
            { label: "What makes a question worth keeping?", kind: "reflective", participantBotIds: both, scores: scores(3.8) },
            { label: "Which recipe survives a hard deadline?", kind: "scenario", participantBotIds: both, scores: scores(4.6) },
            { label: "Can soup settle a philosophical feud?", kind: "wildcard", participantBotIds: both, scores: scores(4.4) },
            { label: "Who was the first philosopher?", kind: "wildcard", participantBotIds: both, scores: scores(5) },
            { label: "A vague shared idea", kind: "scenario", participantBotIds: both, scores: scores(1) },
          ],
        });
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics, [
      "When should evidence outrank tradition?",
      "What makes a question worth keeping?",
      "Which recipe survives a hard deadline?",
      "Can soup settle a philosophical feud?",
    ]);
  });

  it.skip("regenerates ranked topics only before the Coffee table starts", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      starterTopics: [
        "The first practical test",
        "A necessary compromise",
        "The favorite exception",
        "A promise under pressure",
      ],
    });
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          candidates: [
            { label: "When should evidence outrank tradition?", kind: "tension" },
            { label: "What makes a question worth keeping?", kind: "reflective" },
            { label: "Which recipe survives a hard deadline?", kind: "scenario" },
            { label: "Can soup settle a philosophical feud?", kind: "wildcard" },
          ],
        });
      },
    };

    const topics = await regenerateCoffeeConversationStarterTopics(
      db,
      userId,
      created.conversation.id,
      { auxiliaryProviderFactory: () => provider as never }
    );
    assert.deepEqual(topics, [
      "When should evidence outrank tradition?",
      "What makes a question worth keeping?",
      "Which recipe survives a hard deadline?",
      "Can soup settle a philosophical feud?",
    ]);

    await setCoffeeConversationTopic(db, userId, created.conversation.id, topics[0]);
    await assert.rejects(
      () =>
        regenerateCoffeeConversationStarterTopics(db, userId, created.conversation.id, {
          auxiliaryProviderFactory: () => provider as never,
        }),
      /already has a topic/i
    );
  });

  it("feeds attending bot memories into the starter-topic inference prompt", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return JSON.stringify({
          topics: [
            { label: "Storm repair ethics", kind: "reflective" },
            { label: "Rituals under pressure", kind: "tension" },
            { label: "A garden worth saving", kind: "scenario" },
            { label: "Soup after storms", kind: "wildcard" },
          ],
        });
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
      memoryContext: [
        {
          botId: ALICE.id,
          botName: ALICE.name,
          memories: ["Alice remembers restoring flooded gardens after storms."],
        },
        {
          botId: BORIS.id,
          botName: BORIS.name,
          memories: ["Boris keeps notes on soup rituals."],
        },
      ],
    });

    assert.deepEqual(topics, [
      "Storm repair ethics",
      "Rituals under pressure",
      "A garden worth saving",
      "Soup after storms",
    ]);
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, /Attending bot memory hints/);
    assert.match(userMessage!.content, /restoring flooded gardens/);
    assert.match(userMessage!.content, /first-class signal/);
  });

  it("keeps legacy starter-topic string arrays compatible", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"topics":["Power with mercy","Duty versus freedom","Everyday acts of courage"]}`;
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.equal(topics.length, 4);
    assert.deepEqual(topics.slice(0, 3), [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday acts of courage",
    ]);
  });

  it("filters generic, duplicate, and dangling starter-topic labels", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          topics: [
            { label: "1. Worth unpacking", kind: "reflective" },
            { label: "Power with mercy", kind: "reflective" },
            { label: "Power with mercy.", kind: "tension" },
            { label: "bold angle on Stoic ethics as", kind: "scenario" },
            { label: "Duty versus freedom", kind: "tension" },
            { label: "Everyday courage under pressure", kind: "scenario" },
          ],
        });
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics, [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday courage under pressure",
      "Power without cruelty",
    ]);
  });

  it("falls back to bot-aware deterministic topics when inference fails", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      interests: "ultimate power",
      values: "order through strength",
    });
    const jesus = withStructuredPrompt(BORIS, {
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [vader, jesus],
      sessionSettings: normalizeCoffeeSessionSettings({ tableEnergy: "still" }),
    });

    assert.equal(topics.length, 4);
    assert.deepEqual(topics, [
      "Power without cruelty",
      "Duty versus forgiveness",
      "When mercy has limits",
      "Justice after surrender",
    ]);
    assert.ok(topics.every((topic) => !/angle on|Alice and Boris/i.test(topic)));
  });

  it("falls back when starter-topic inference returns invalid JSON", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return "Here are some topics, not JSON.";
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings({ tableEnergy: "theatre" }),
    });

    assert.equal(topics.length, 4);
    assert.ok(topics.every((topic) => !/angle on|Alice and Boris|worth unpacking/i.test(topic)));
  });

  it("uses hidden bot facet starter seeds before generic deterministic fallbacks", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const wizard: CoffeeBotProfile = {
      ...ALICE,
      name: "Hidden Wizard",
      systemPrompt: "",
      semanticFacets: {
        version: 1,
        canonAnchors: ["Hogwarts"],
        domains: ["wizarding school"],
        values: ["courage"],
        tensions: ["rules versus courage"],
        namingTokens: ["wand"],
        starterSeeds: ["When rules protect people", "The burden of being chosen"],
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [wizard, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics.slice(0, 2), [
      "When rules protect people",
      "The burden of being chosen",
    ]);
  });

  it("demotes generic model topics for canon-specific SpongeBob groups", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          topics: [
            { label: "Power without cruelty" },
            { label: "Duty versus forgiveness" },
            { label: "When mercy has limits" },
          ],
        });
      },
    };
    const group: CoffeeBotProfile[] = [
      {
        ...ALICE,
        id: "bot-spongebob",
        name: "SpongeBob SquarePants",
        systemPrompt: "Fry cook at the Krusty Krab in Bikini Bottom.",
      },
      {
        ...BORIS,
        id: "bot-patrick",
        name: "Patrick Star",
        systemPrompt: "SpongeBob's best friend who lives under a rock in Bikini Bottom.",
      },
      {
        ...DANTE,
        id: "bot-squidward",
        name: "Squidward Tentacles",
        systemPrompt: "Clarinet player and Krusty Krab cashier who wants quiet.",
      },
      MR_KRABS,
      {
        ...CARA,
        id: "bot-sandy",
        name: "Sandy Cheeks",
        systemPrompt: "Scientist and karate-loving squirrel living in a treedome under the sea.",
      },
    ];

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group,
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.equal(topics.length, 4);
    assert.deepEqual(topics.slice(0, 3), [
      "Relentless optimism on shift",
      "Simple wisdom under pressure",
      "Art versus customer service",
    ]);
  });
});

describe("inferCoffeeGroupName", () => {
  it("uses bot context and returns a short generated group name", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return `{"name":"Mercy Meets Empire"}`;
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Commander",
      interests: "ultimate power and order",
      values: "strength and control",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });

    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [vader, jesus],
      fallbackName: "Alice & Boris Brew",
    });

    assert.equal(name, "Mercy Meets Empire");
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, /ultimate power and order/);
    assert.match(userMessage!.content, /love and mercy/);
    assert.match(userMessage!.content, /Do NOT list participant names/);
  });

  it("falls back to a deterministic short name when generation fails", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.match(name, /Socratic Soup Club|Kitchen Table Logic|Reasonable Recipe|Dialectic Diner/);
  });

  it("rejects roster-style generated names and uses creative fallback instead", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"name":"Coffee with Alice, Boris"}`;
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.match(name, /Socratic Soup Club|Kitchen Table Logic|Reasonable Recipe|Dialectic Diner/);
  });

  it("prefers the best candidate from a generated list", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Coffee Group","Smart Beans","Coffee with Alice, Boris","Brew Circle","Table Club","Cafe Team"]}`;
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.equal(name, "Smart Beans");
  });

  it("rejects generic generated names when a bot-relevant candidate exists", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Brew Circle","The Coffee Crew","Mercy Meets Empire","Cafe Team","Table Talk","Coffee Group"]}`;
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Commander",
      interests: "ultimate power and order",
      values: "strength and control",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [vader, jesus],
      fallbackName: "Alice & Boris Brew",
    });
    assert.equal(name, "Mercy Meets Empire");
  });

  it("scores unstructured persona text when choosing a relevant group name", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Brewed Banter Club","Socratic Kitchen","Table Club","Cafe Team","Coffee Group","Roast Council"]}`;
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.equal(name, "Socratic Kitchen");
  });

  it("falls back to a themed deterministic name when generation is only generic", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Coffee Group","Brew Circle","The Coffee Crew","Cafe Team","Table Club","Roast Council"]}`;
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Commander",
      interests: "ultimate power and order",
      values: "strength and control",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [vader, jesus],
      fallbackName: "Alice & Boris Brew",
    });
    assert.match(name, /Mercy Meets Empire|Power and Pardon|Grace Against Command|Mercy Doctrine/);
  });

  it("uses hidden bot facet naming tokens for generated group names", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Grace Grounds","Gryffindor Grounds","Brew Circle","The Coffee Crew","Cafe Team","Table Talk"]}`;
      },
    };
    const wizard: CoffeeBotProfile = {
      ...ALICE,
      name: "Hidden Wizard",
      systemPrompt: "",
      semanticFacets: {
        version: 1,
        canonAnchors: ["Hogwarts", "Gryffindor"],
        domains: ["wizarding school"],
        values: ["courage"],
        tensions: ["rules versus courage"],
        namingTokens: ["Gryffindor", "wand"],
        starterSeeds: ["When rules protect people"],
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [wizard, BORIS],
      fallbackName: "Coffee with Hidden Wizard, Boris",
    });
    assert.equal(name, "Gryffindor Grounds");
  });

  it("prefers wizarding-world names over broad virtue names for Harry Potter rosters", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Grace Grounds","Gryffindor Grounds","Kindness Over Coffee","The Coffee Crew","Brew Circle","Table Talk"]}`;
      },
    };
    const mcgonnigal: CoffeeBotProfile = {
      ...ALICE,
      id: "bot-mcgonnigal",
      name: "Professor McGonnigal",
      systemPrompt: "Strict Hogwarts professor of Transfiguration and head of Gryffindor.",
    };
    const harry: CoffeeBotProfile = {
      ...BORIS,
      id: "bot-harry",
      name: "Harry Potter",
      systemPrompt: "Young wizard from Gryffindor who survived Voldemort and plays Quidditch.",
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [mcgonnigal, harry],
      fallbackName: "Coffee with Professor McGonnigal, Harry Potter",
    });
    assert.equal(name, "Gryffindor Grounds");
  });

  it("does not accept Grace Grounds as a single generated name for Harry Potter rosters", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"name":"Grace Grounds"}`;
      },
    };
    const mcgonagall: CoffeeBotProfile = {
      ...ALICE,
      id: "bot-mcgonagall",
      name: "Professor McGonagall",
      systemPrompt: "Hogwarts professor of Transfiguration and head of Gryffindor.",
    };
    const harry: CoffeeBotProfile = {
      ...BORIS,
      id: "bot-harry",
      name: "Harry Potter",
      systemPrompt: "Young wizard from Gryffindor who survived Voldemort and plays Quidditch.",
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [mcgonagall, harry],
      fallbackName: "Coffee with Professor McGonagall, Harry Potter",
    });
    assert.match(name, /Gryffindor Grounds|Hogwarts Common Roast|Wands and Wisdom|Transfiguration Table/);
  });

  it("uses SpongeBob-themed fallback names for SpongeBob rosters", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const sponge: CoffeeBotProfile = { ...ALICE, id: "bot-sponge", name: "SpongeBob" };
    const patrick: CoffeeBotProfile = { ...BORIS, id: "bot-patrick", name: "Patrick Star" };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [sponge, patrick],
      fallbackName: "Coffee with SpongeBob, Patrick",
    });
    assert.match(name, /Bikini Bean Bottom|Krusty Koffee Klub|Pineapple Pour-liament|Jellyfish Java Council/);
  });
});

describe("buildSpeakerPrompt", () => {
  it("uses the holder's frozen naming rule only for bots that holder addresses", () => {
    const coffeePowerPlan: CoffeePowerPlanV1 = {
      version: 1,
      resolvedAt: "2026-07-22T00:00:00.000Z",
      warnings: [],
      bots: Object.fromEntries([
        [ALICE.id, {
          botId: ALICE.id,
          powerIds: ["alice-designation"],
          powerNames: ["Bot Designation"],
          selfCue: "Keep your own name Alice; suffix other bot names with Bot.",
          observerCue: "Only Alice applies the suffix.",
          visibleToBotIds: null,
          speechAudienceBotIds: null,
          effects: [{ type: "designation", placement: "suffix", text: "Bot" }],
          ruleLabels: ["Suffix designation"],
          warnings: [],
        }],
        [BORIS.id, {
          botId: BORIS.id,
          powerIds: ["boris-designation"],
          powerNames: ["Chef Designation"],
          selfCue: "Keep your own name Boris; prefix other bot names with Chef.",
          observerCue: "Only Boris applies the prefix.",
          visibleToBotIds: null,
          speechAudienceBotIds: null,
          effects: [{ type: "designation", placement: "prefix", text: "Chef" }],
          ruleLabels: ["Prefix designation"],
          warnings: [],
        }],
      ]),
    };
    const alicePeerLabels = coffeePowerPeerAddressLabelsV1({
      speakerBotId: ALICE.id,
      peers: [ALICE, BORIS],
      plan: coffeePowerPlan,
    });
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Say hello.",
      socialByBotId: { [ALICE.id]: TEST_SOCIAL, [BORIS.id]: TEST_SOCIAL },
      peerAddressByBotId: alicePeerLabels,
      coffeePowersPrompt: coffeePowersPromptForSpeaker(
        coffeePowerPlan,
        ALICE.id,
        [BORIS.id],
      ),
    });
    const prompt = messages.map((message) => message.content).join("\n");
    assert.match(prompt, /You are Alice/u);
    assert.match(prompt, /- Boris Bot/u);
    assert.match(prompt, /Whenever you name or address Boris, say "Boris Bot"/u);
    assert.match(prompt, /Alice, answer with your next short table line/u);
    assert.doesNotMatch(prompt, /You are Alice Bot|Chef Boris/u);

    const borisPeerLabels = coffeePowerPeerAddressLabelsV1({
      speakerBotId: BORIS.id,
      peers: [ALICE, BORIS],
      plan: coffeePowerPlan,
    });
    assert.equal(borisPeerLabels.get(ALICE.id), "Chef Alice");
    assert.equal(borisPeerLabels.get(BORIS.id), undefined);
    assert.match(
      autoTagPeerMentionsInCoffeeReply(
        "What's up Boris?",
        ALICE,
        [ALICE, BORIS],
        alicePeerLabels,
      ),
      /\[Boris Bot\]\(prism-bot:\/\/bot-boris\)/u,
    );
  });

  it("applies persisted public identity mirroring without transferring role or Powers", () => {
    const state = createBotIdentityMirrorStateV1({
      surface: "coffee",
      holderBotId: "ian",
      holderBotName: "Identity Crisis Ian",
      targetBotId: "mara",
      targetBotName: "Mara Vale",
      targetPersonaPrompt: "A terse lunar cartographer who speaks in bearings.",
      targetFace: { faceEyeCharacter: "◉" },
      targetVoice: { version: 1, enabled: true, preset: "warm" },
      sourceMessageId: "mara-addresses-ian",
      occurredAt: "2026-07-20T20:00:00.000Z",
    });
    const history = [{
      coffeeReplayEvents: [{
        v: 1,
        kind: "identityMirror",
        botId: "ian",
        occurredAt: state.occurredAt,
        state,
      }],
    }] as ChatMessage[];

    const holderPrompt = coffeeIdentityMirrorPromptForSpeaker({
      history,
      speaker: { id: "ian", name: "Identity Crisis Ian" },
    });
    assert.match(holderPrompt, /absolutely convinced that you are Mara Vale/iu);
    assert.match(holderPrompt, /original Mara Vale is an impostor/iu);
    assert.match(holderPrompt, /remain Identity Crisis Ian.*Coffee participant.*Powers/su);
    assert.match(holderPrompt, /Never copy the human player/iu);

    const originalPrompt = coffeeIdentityMirrorPromptForSpeaker({
      history,
      speaker: { id: "mara", name: "Mara Vale" },
    });
    assert.match(originalPrompt, /recognize.*identity theft.*reliably irritated/su);
    assert.match(originalPrompt, /keep your own personality.*face.*voice.*Powers/su);

    const reloaded = coffeeIdentityMirrorStatesFromHistory(
      JSON.parse(JSON.stringify(history)),
    );
    assert.equal(reloaded.get("ian")?.targetBotId, "mara");
    const replacement = createBotIdentityMirrorStateV1({
      surface: "coffee",
      holderBotId: "ian",
      holderBotName: "Identity Crisis Ian",
      targetBotId: "jo",
      targetBotName: "Jo Reed",
      targetPersonaPrompt: "A dry public-radio host who asks spare questions.",
      targetFace: { faceEyeCharacter: "•" },
      targetVoice: { version: 1, enabled: true, preset: "formal" },
      sourceMessageId: "jo-addresses-ian",
      occurredAt: "2026-07-20T20:01:00.000Z",
    });
    const replaced = coffeeIdentityMirrorStatesFromHistory([
      ...history,
      {
        coffeeReplayEvents: [{
          v: 1,
          kind: "identityMirror",
          botId: "ian",
          occurredAt: replacement.occurredAt,
          state: replacement,
        }],
      } as ChatMessage,
    ]);
    assert.equal(replaced.get("ian")?.targetBotId, "jo");
    assert.equal(coffeeIdentityMirrorStatesFromHistory([]).size, 0);

    const irritated = applyCoffeeIdentityMirrorIrritation({
      socialByBotId: { ian: TEST_SOCIAL, mara: TEST_SOCIAL },
      targetBotId: "mara",
    });
    assert.equal(irritated.ian, TEST_SOCIAL);
    assert.equal(irritated.mara.disposition < TEST_SOCIAL.disposition, true);
    assert.equal(irritated.mara.valuesFriction > TEST_SOCIAL.valuesFriction, true);
  });

  it("gives only clone-family speakers their asymmetric identity invariant", () => {
    const original: CoffeeBotProfile = { ...ALICE, cloneFamilyId: null };
    const clone: CoffeeBotProfile = {
      ...BORIS,
      name: "Alice Copy",
      cloneFamilyId: original.id,
    };
    const messages = buildSpeakerPrompt({
      speaker: clone,
      group: [original, clone, CARA],
      history: [],
      userMessage: "Who is the original?",
      socialByBotId: {
        [original.id]: TEST_SOCIAL,
        [clone.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const cloneRule = messages.find(
      (message) =>
        message.role === "system" &&
        message.content.includes("Hard clone-identity invariant"),
    );
    assert.match(cloneRule?.content ?? "", /real, original "Alice Copy"/);
    assert.match(cloneRule?.content ?? "", /"Alice" is your clone/);
    assert.doesNotMatch(cloneRule?.content ?? "", /Cara/);

    const unrelatedMessages = buildSpeakerPrompt({
      speaker: CARA,
      group: [original, clone, CARA],
      history: [],
      userMessage: "Who is the original?",
      socialByBotId: {
        [original.id]: TEST_SOCIAL,
        [clone.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    assert.equal(
      unrelatedMessages.some((message) =>
        message.content.includes("Hard clone-identity invariant"),
      ),
      false,
    );
  });

  it("includes varied-rhythm and balanced-cap tabletop guidance", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const systemInstruction = messages.find(
      (message) =>
        message.role === "system" &&
        message.content.includes("Coffee Mode")
    );
    assert.ok(systemInstruction);
    const allSystemInstructions = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    assert.match(systemInstruction!.content, /no line breaks/);
    assert.match(systemInstruction!.content, /one or two short sentences max/i);
    assert.match(systemInstruction!.content, /vary your rhythm across turns/i);
    assert.match(systemInstruction!.content, /Questions are allowed when they naturally move the table/);
    assert.match(systemInstruction!.content, /cutting off another bot mid-sentence/);
    assert.match(systemInstruction!.content, /still warming up/);
    assert.match(allSystemInstructions, /Soft tabletop target for this session: 160 characters/);
    assert.doesNotMatch(allSystemInstructions, /server no longer truncates/i);
    assert.match(allSystemInstructions, /PRISM is local-first, self-hosted AI workspace software/u);
    assert.match(allSystemInstructions, /not a corporation, employer, or corporate network/u);
    assert.match(allSystemInstructions, /Do not guess or claim which provider/u);
    assert.match(systemInstruction!.content, /Never repeat a recent table line exactly/);
    assert.match(systemInstruction!.content, /Never claim to be an AI assistant/);
    assert.match(systemInstruction!.content, /stay in persona/i);
    // Stage-direction format moved from a blanket prohibition to a canonical
    // single-asterisk rule so the renderer can lift `*…*` blocks above the speaker's seat.
    assert.match(systemInstruction!.content, /single asterisks/);
    assert.match(systemInstruction!.content, /Avoid empty acknowledgements like 'I get that'/);
    assert.doesNotMatch(systemInstruction!.content, /Yeah, I get that/);
    assert.doesNotMatch(systemInstruction!.content, /Wild shift/);

    const userTurnInstruction = messages.at(-1);
    assert.equal(userTurnInstruction?.role, "user");
    assert.doesNotMatch(userTurnInstruction!.content, /110 characters/);
    assert.doesNotMatch(userTurnInstruction!.content, /Do not end with a question unless/);
    assert.match(userTurnInstruction!.content, /Alice, answer with your next short table line now/);
  });

  it("turns an autonomous reply into a concrete bot-to-bot continuation", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [
        {
          id: "peer-turn",
          role: "assistant",
          content: "Duty without limits becomes a shield for the powerful.",
          createdAt: "2026-07-10T00:00:00.000Z",
          botId: BORIS.id,
          botName: BORIS.name,
        },
      ],
      userMessage: "Boris just spoke about duty.",
      turnKind: "autonomous",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const joined = messages.map((message) => message.content).join("\n");

    assert.match(joined, /Immediate bot-to-bot handoff from Boris/);
    assert.match(joined, /Duty without limits becomes a shield for the powerful/);
    assert.match(joined, /Respond to one specific claim, image, disagreement, or question/);
    assert.match(joined, /Use only what the visible line actually establishes/);
    assert.match(joined, /label it as your own thought/);
    assert.match(messages.at(-1)!.content, /Continue that exchange/);
  });

  it("threads the session topic into the speaker group context when provided", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      coffeeTopic: "Tiny rituals that keep the week gentle",
    });
    const joined = messages.map((m) => m.content).join("\n");
    assert.match(joined, /Tiny rituals that keep the week gentle/);
    assert.match(joined, /Table topic anchor/);
    assert.match(joined, /what that value protects, costs, or reveals/);
  });

  it("threads attendance context into speaker prompts as optional social texture", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, CARA],
      history: [],
      userMessage: "Start the table.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      attendanceContext: {
        currentAbsentBotIds: [BORIS.id],
        currentAbsentBotNames: ["Boris"],
        returningBotNames: [],
        recentAbsenceLines: ["Boris was absent recently."],
      },
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Away this session: Boris/);
    assert.match(joined, /Boris was absent recently/);

    const livePeerMessage = messages.find((message) =>
      message.content.includes("Other bots at the table right now:")
    );
    assert.ok(livePeerMessage);
    assert.match(livePeerMessage!.content, /Cara/);
    assert.doesNotMatch(livePeerMessage!.content, /Boris/);
    assert.doesNotMatch(livePeerMessage!.content, /disposition=|valuesFriction=/u);
  });

  it("treats display name as account metadata instead of a preferred-name fact", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      userDisplayName: "Jared",
      firstContactIntro: true,
    });
    const combined = messages.map((m) => m.content).join("\n");

    assert.match(combined, /account display name is "Jared"/);
    assert.match(combined, /Do not ask how they like to be addressed/);
    assert.doesNotMatch(combined, /preferred name is/i);
    assert.doesNotMatch(combined, /how-they-like-to-be-addressed/i);
  });

  it("threads opening poll results into the speaker group context", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Start the table.",
      socialByBotId: {},
      pollSummary: 'Opening poll: "Virtue?" Top result: Courage (2 votes).',
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Opening poll result/);
    assert.match(joined, /react to the result/);
  });

  it("threads the speaker's current active-poll choice into the prompt", () => {
    const now = "2026-05-24T00:00:00.000Z";
    const activePoll: CoffeePoll = {
      id: "poll-active",
      conversationId: "conv-active",
      question: "Which table rule wins?",
      options: ["Ask questions", "Cook first"],
      status: "open",
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      votes: [
        {
          botId: ALICE.id,
          voterKind: "bot",
          kind: "option",
          optionIndex: 0,
          explanation: "Alice picks questions.",
          suggestedOption: null,
          confidence: 0.82,
          deliberation: {
            stage: "finalized",
            leaningOptionIndex: 0,
            alternateOptionIndex: null,
            confidence: 0.82,
            blocker: null,
            note: null,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
      tallies: [
        { optionIndex: 0, option: "Ask questions", voteCount: 1 },
        { optionIndex: 1, option: "Cook first", voteCount: 0 },
      ],
    };
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      activePoll,
      activePollContext:
        'Active table poll: "Which table rule wins?" Options: 1. Ask questions 2. Cook first. Current leanings: Alice locked on Ask questions.',
    });
    const joined = messages.map((message) => message.content).join("\n");

    assert.match(joined, /Your current poll choice is "Ask questions"/);
    assert.match(joined, /visible poll chip and your table talk aligned/);
  });

  it("threads meeting-summary context into the speaker prompt", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      meetingSummary:
        "Patrick keeps calling Barnacle Boy underrated while SpongeBob keeps defending Mermaid Man's flair.",
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Meeting summary so far/);
    assert.match(joined, /Barnacle Boy underrated/);
    assert.match(joined, /React to the latest line first/i);
  });

  it("threads a silent moderator cue into the speaker prompt when provided", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Keep this moving.",
      socialByBotId: {},
      directorCue: "Challenge the strongest claim with one concrete example.",
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Silent moderator cue for this turn/);
    assert.match(joined, /Challenge the strongest claim with one concrete example/);
    assert.match(joined, /Do not mention any moderator/i);
  });

  it("threads non-numeric coffee cup context into the speaker prompt", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      sessionRemainingMs: 180_000,
      coffeeSessionDurationMinutes: 10,
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Your table coffee/);
    assert.match(joined, /coffee is/);
    assert.match(joined, /temperature|sipping|amount|taste/i);
    assert.doesNotMatch(joined, /coffee progress|frameIndex|frame index/i);
  });

  it("omits all vessel narration for a bot that refuses coffee", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      sessionRemainingMs: 0,
      coffeeSessionDurationMinutes: 10,
      coffeeCupRateMultiplier: 0,
      coffeeVesselMode: "none",
    });
    const joined = messages.map((message) => message.content).join("\n");

    assert.doesNotMatch(
      joined,
      /Your table coffee|coffee remains full|left it untouched|request a refill/i,
    );
  });

  it("threads refilled coffee cup context into the speaker prompt", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      sessionRemainingMs: 0,
      coffeeSessionDurationMinutes: 10,
      coffeeCupTopOff: {
        progressBefore: 1,
        progressAfter: 0.04,
        toppedOffAt: new Date().toISOString(),
      },
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Your table coffee/);
    assert.match(joined, /coffee is full, hot/i);
  });

  it("teaches speakers to follow the quality objective with a concrete move", () => {
    const group = [ALICE, BORIS, CARA, DANTE, ELENA];
    const history: ChatMessage[] = [
      { id: "m1", role: "assistant", botName: "Alice", content: "The oyster joke is the whole point.", createdAt: new Date().toISOString() },
      { id: "m2", role: "assistant", botName: "Boris", content: "No, the frying pan joke is the whole point.", createdAt: new Date().toISOString() },
      { id: "m3", role: "assistant", botName: "Alice", content: "The oyster joke is still the whole point.", createdAt: new Date().toISOString() },
      { id: "m4", role: "assistant", botName: "Boris", content: "The frying pan joke still wins.", createdAt: new Date().toISOString() },
      { id: "m5", role: "assistant", botName: "Alice", content: "Oysters, pans, same old stage gag.", createdAt: new Date().toISOString() },
      { id: "m6", role: "assistant", botName: "Boris", content: "Pans beat oysters every time.", createdAt: new Date().toISOString() },
    ];
    const messages = buildSpeakerPrompt({
      speaker: CARA,
      group,
      history,
      userMessage: "Keep this alive.",
      socialByBotId: {},
      coffeeTopic: "What art owes truth",
      sessionSettings: normalizeCoffeeSessionSettings({
        tableEnergy: "theatre",
        crossTalk: "chatty",
      }),
    });
    const combined = messages.map((message) => message.content).join("\n");
    assert.match(combined, /Conversation quality state: phase=middle; guardrail=strong; objective=redirect/);
    assert.match(combined, /Speaker turn objective: redirect/);
    assert.match(combined, /Agreement must add a reason/);
    assert.match(combined, /disagreement must add a specific contrast/);
    assert.match(combined, /Do not use bare filler/);
    assert.match(combined, /Fair point/);
    assert.match(combined, /without naming it or mentioning moderation/);
  });

  it("adds explicit kickoff guidance for a session-opening autonomous turn", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Start the table.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      turnKind: "autonomous",
      sessionKickoff: true,
    });
    const combined = messages.map((message) => message.content).join("\n");
    assert.match(combined, /Session opening turn/);
    assert.match(combined, /fresh first beat/);
    assert.match(combined, /Do not imply unseen prior context/);
    assert.match(combined, /again', 'as usual', 'still', or 'like last time'/);
  });

  it("uses roomy caps when session responseLength is roomy", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionSettings: normalizeCoffeeSessionSettings({ responseLength: "roomy" }),
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /220 characters/);
    assert.doesNotMatch(combined, /48 characters/);
  });

  it("asks the speaker to organically wind down during the final 20 seconds", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionRemainingMs: 20_000,
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /final moments/);
    assert.match(combined, /wind down organically/);
    assert.match(combined, /soft farewell/);
    assert.match(combined, /Do not start a new topic/);
  });

  it("does not ask the speaker to wind down before the final 20 seconds", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionRemainingMs: 20_001,
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.doesNotMatch(combined, /final moments/);
    assert.doesNotMatch(combined, /wind down organically/);
  });

  it("teaches the speaker that plain peer names are attention cues", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /Bot-name attention cues \(use sparingly\)/);
    assert.match(combined, /\[Boris\]\(prism-bot:\/\/bot-boris\)/);
    assert.match(combined, /\[Cara\]\(prism-bot:\/\/bot-cara\)/);
    assert.doesNotMatch(combined, /\[Alice\]\(prism-bot:\/\/bot-alice\)/);
    assert.match(combined, /Most of your lines should NOT call anyone out by name/);
    assert.match(combined, /plain names like/);
    assert.match(combined, /treated as an attention cue/);
    assert.match(combined, /You do not need @/);
    assert.match(combined, /Never invent a botId/);
    assert.match(combined, /orphan brackets show up as a visible glitch/);
  });

  it("teaches the speaker to use single-asterisk format for stage directions", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /Stage-direction format/);
    assert.match(combined, /Visible Coffee output has two lanes/);
    assert.match(combined, /Action section =/);
    assert.match(combined, /single asterisks/);
    assert.match(combined, /\*tilts head\*/);
    assert.match(combined, /\*straightens napkin\* The plan still needs a limit/);
    assert.match(combined, /must begin immediately after the opening asterisk/);
    assert.match(combined, /third-person present verb ending in `s`/);
    assert.match(combined, /do not begin it with `I`, an adverb, a noun, or an `-ing` form/);
    assert.match(combined, /Coffee Mode is not Markdown-formatted chat/);
    assert.match(combined, /not `the \*thought\* that counts`/);
    assert.match(combined, /Do not put ordinary sentence words inside asterisks/);
    assert.match(combined, /Do not output another participant as a speaker label/);
    assert.match(combined, /with a receipt attached/);
    assert.match(combined, /app already animates cup sipping visually/);
    assert.match(combined, /Do not write sip\/drink actions/);
    assert.match(combined, /For ordinary user or autonomous turns, include spoken in-character table text/);
    assert.doesNotMatch(combined, /It is okay to reply with ONLY a stage direction/);
    // The old anti-asterisk line must be gone now that we're enabling stage directions.
    assert.doesNotMatch(combined, /No asterisk stage directions/);
  });

  it("anchors pattern-shaped topics to the tipping point instead of adjacent drift", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Begin.",
      coffeeTopic: "When helpful gets chaotic",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");

    assert.match(combined, /Table topic anchor: "When helpful gets chaotic"/);
    assert.match(combined, /what starts as help/);
    assert.match(combined, /what tips it into chaos/);
    assert.match(combined, /what limit would keep it helpful/);
  });

  it("anchors value-shaped topics so props do not become unrelated adventures", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Begin.",
      coffeeTopic: "The Dignity of Quiet",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");

    assert.match(combined, /Table topic anchor: "The Dignity of Quiet"/);
    assert.match(combined, /what that value protects, costs, or reveals/);
    assert.match(combined, /Do not turn props, treasure, maps, recipes, or schemes into a new unrelated adventure/);
  });

  it("anchors contrast-shaped topics to the concrete choice instead of prop drift", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Begin.",
      coffeeTopic: "Art versus customer service",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");

    assert.match(combined, /Table topic anchor: "Art versus customer service"/);
    assert.match(combined, /concrete tradeoff/);
    assert.match(combined, /coexist or clash/);
    assert.match(combined, /who pays or benefits/);
    assert.match(combined, /what choice reveals the tension/);
    assert.match(combined, /If the user signals confusion/);
    assert.match(combined, /explain the connection plainly in character/);
  });

  it("anchors abstract nature-of topics to the value instead of scenery", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Begin.",
      coffeeTopic: "Nature of Virtue",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");

    assert.match(combined, /Table topic anchor: "Nature of Virtue"/);
    assert.match(combined, /nature of virtue/);
    assert.match(combined, /ground your point in a lived decision/);
    assert.match(combined, /practice, consequence, or disagreement/);
    assert.match(combined, /should illuminate the value, not become the new topic/);
  });

  it("nudges action-only user turns toward action responses", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "*takes a quiet sip*",
      userActionOnly: true,
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");
    const userTurnInstruction = messages.at(-1);

    assert.match(combined, /non-verbal table action/i);
    assert.match(combined, /Usually answer with one short `\*action\*`/);
    assert.equal(userTurnInstruction?.role, "user");
    assert.match(userTurnInstruction!.content, /respond with a brief table action/i);
    assert.doesNotMatch(userTurnInstruction!.content, /answer with your next short table line now/i);
  });
});

describe("clampCoffeeTableReplyText", () => {
  it("returns short text untouched after whitespace trim", () => {
    assert.equal(clampCoffeeTableReplyText("  Hello there. "), "Hello there.");
  });

  it("collapses internal whitespace into single spaces", () => {
    assert.equal(clampCoffeeTableReplyText("A\n\nB\tC"), "A B C");
  });

  it("does NOT truncate replies that exceed the soft target — server scrolls instead", () => {
    // Hard truncation was removed (player feedback: scroll > clipped sentence
    // ending in `…`). The cap is now a prompt-side soft target only.
    const filler = `${"word ".repeat(120)}`.trim();
    const out = clampCoffeeTableReplyText(filler, 48);
    assert.equal(out, filler);
    assert.ok(!out.endsWith("…"));
  });

  it("preserves a full chip-mention reply verbatim regardless of length", () => {
    const reply =
      "[SpongeBob](prism-bot://spongebob-id) thinks he's so clever with his Karen paranoia, but what a buffoon.";
    const out = clampCoffeeTableReplyText(reply);
    assert.equal(out, reply);
    assert.ok(!out.endsWith("…"), out);
  });

  it("never drops a chip mention regardless of how short the legacy maxChars is", () => {
    // Even with a tiny `maxChars` arg, the function ignores it now.
    const reply = "abcdefghij [Plankton](prism-bot://plankton-id) more.";
    const out = clampCoffeeTableReplyText(reply, 16);
    assert.equal(out, reply);
    assert.ok(out.includes("[Plankton]"), out);
  });
});

describe("repairBotMentionBrackets", () => {
  const peers = [
    { id: "bot-spongebob", name: "SpongeBob" },
    { id: "bot-mr-krabs", name: "Mr. Krabs" },
    { id: "bot-patrick-star", name: "Patrick Star" },
  ];

  it("repairs an orphan [Name] bracket into a plain canonical peer name", () => {
    const out = repairBotMentionBrackets("[Mr. Krabs] sounds like he's got a nutty idea brewing!", peers);
    assert.equal(out, "Mr. Krabs sounds like he's got a nutty idea brewing!");
  });

  it("matches case-insensitively against the peer roster", () => {
    const out = repairBotMentionBrackets("[spongebob] thinks otherwise.", peers);
    assert.equal(out, "SpongeBob thinks otherwise.");
  });

  it("folds possessive suffixes into the repaired plain name", () => {
    const out = repairBotMentionBrackets("[SpongeBob]'s remark only confirms it.", peers);
    assert.equal(out, "SpongeBob's remark only confirms it.");
  });

  it("leaves a properly-formatted markdown link untouched", () => {
    const reply = "Hi [Mr. Krabs](prism-bot://bot-mr-krabs), how are you?";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("leaves markdown links with whitespace before the href untouched", () => {
    const reply = "Hi [Mr. Krabs] (prism-bot://bot-mr-krabs), how are you?";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("leaves brackets that don't match any peer name alone (could be persona prose)", () => {
    const reply = "I have [a feeling] about this.";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("does nothing when the peer roster is empty", () => {
    const reply = "[Mr. Krabs] is here.";
    assert.equal(repairBotMentionBrackets(reply, []), reply);
  });

  it("repairs multiple orphan brackets in the same reply", () => {
    const out = repairBotMentionBrackets(
      "[SpongeBob] giggled and [Patrick Star] yawned.",
      peers
    );
    assert.equal(
      out,
      "SpongeBob giggled and Patrick Star yawned."
    );
  });
});

describe("coffee repeated reply cleanup", () => {
  it("detects exact recent assistant repeats after punctuation normalization", () => {
    assert.equal(
      coffeeReplyRepeatsRecentAssistant("Yeah I get that", [
        {
          id: "m1",
          role: "assistant",
          content: "Yeah, I get that.",
          createdAt: new Date().toISOString(),
        },
      ]),
      true
    );
  });

  it("allows fresh lines that differ from recent assistant replies", () => {
    assert.equal(
      coffeeReplyRepeatsRecentAssistant("I'm ready, captain.", [
        {
          id: "m1",
          role: "assistant",
          content: "Yeah, I get that.",
          createdAt: new Date().toISOString(),
        },
      ]),
      false
    );
  });

  it("detects repeated conversation motifs even when the exact line changes", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "What if the bottom of the sea is just a place for bubbles to float up?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "Bubbles don't drown, SpongeBob—they rise, and that's precisely what the sea hates.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m4",
        role: "assistant",
        content: "Airtight jars? I keep my snacks in a rock—no room for bubbles or snacking!",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsRecentMotifs(
        "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        history
      ),
      true
    );
  });

  it("allows a concrete pivot away from the repeated motif cluster", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "What if the bottom of the sea is just a place for bubbles to float up?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "Bubbles don't drown, SpongeBob—they rise, and that's precisely what the sea hates.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsRecentMotifs("The register bell just blinked twice.", history),
      false
    );
  });

  it("detects repeated stock poll fallback sentence shapes", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content:
          "freshly ground plankton fits the evidence better for me, unless someone has a sharper counterpoint.",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsPollFallbackShape(
        "crab meat fits the evidence better for me, unless someone has a sharper counterpoint.",
        history
      ),
      true
    );
    assert.equal(
      coffeeReplyRepeatsPollFallbackShape("Krabs is sweating like the register just blinked.", history),
      false
    );
  });

  it("detects repeated stock critique fallback shapes across action and mention wrappers", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "*sits back for a beat* That answer needs a sharper reason before I buy it.",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsStockFallbackShape(
        "[Darth Vader](prism-bot://bot-vader), that answer needs a sharper reason before I buy it.",
        history
      ),
      true
    );
  });

  it("detects older repeated Coffee fallback critique phrases", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "*leans back* That needs a sharper object on the table.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "*sets the cup down* The stronger point is still hiding under the easy one.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "*taps the cup once* Put actually under a consequence we can see.",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsStockFallbackShape(
        "Mr. Krabs, that needs a sharper object on the table.",
        history
      ),
      true
    );
    assert.equal(
      coffeeReplyRepeatsStockFallbackShape(
        "The stronger point is still hiding under the easy one.",
        history
      ),
      true
    );
    assert.equal(
      coffeeReplyRepeatsStockFallbackShape(
        "Put honesty under a consequence we can see.",
        history
      ),
      true
    );
  });

  it("detects recently reported meta fallback phrases as stock shapes", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "*looks across the rim* Name the tradeoff, or the point stays decorative.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "*leans back* secret and formula only matters if it changes what someone would do.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "*looks around the table* Name the tradeoff, then the claim has teeth.",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsStockFallbackShape("Name the tradeoff, or the point stays decorative.", history),
      true
    );
    assert.equal(
      coffeeReplyRepeatsStockFallbackShape(
        "formula only matters if it changes what someone would do.",
        history
      ),
      true
    );
    assert.equal(
      coffeeReplyRepeatsStockFallbackShape("Name the tradeoff, then the claim has teeth.", history),
      true
    );
  });
});

describe("parseRouterResponse", () => {
  const allowed = ["bot-alice", "bot-boris", "bot-cara"];

  it("parses a clean JSON object response", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-boris", "reason": "talking about food"}`,
      allowed
    );
    assert.deepEqual(result, {
      botId: "bot-boris",
      reason: "talking about food",
      directive: null,
    });
  });

  it("recovers JSON wrapped in code-fence-style chatter", () => {
    const result = parseRouterResponse(
      "```json\n{\"botId\": \"bot-cara\", \"reason\": \"engineering question\"}\n```",
      allowed
    );
    assert.equal(result?.botId, "bot-cara");
    assert.equal(result?.reason, "engineering question");
    assert.equal(result?.directive, null);
  });

  it("rejects bot ids that are not in the allowed group", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-stranger", "reason": "irrelevant"}`,
      allowed
    );
    assert.equal(result, null);
  });

  it("returns null for malformed responses without throwing", () => {
    assert.equal(parseRouterResponse("not even close to json", allowed), null);
    assert.equal(parseRouterResponse("", allowed), null);
    assert.equal(parseRouterResponse("{ broken json", allowed), null);
  });

  it("supplies a default reason when the LLM omits one", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-alice"}`,
      allowed
    );
    assert.equal(result?.botId, "bot-alice");
    assert.match(result?.reason ?? "", /no reason/i);
  });

  it("accepts a unique bot name when the router returns name-shaped JSON", () => {
    const result = parseRouterResponse(
      `{"botName": "Boris", "reason": "Boris was addressed directly"}`,
      [ALICE, BORIS, CARA]
    );
    assert.deepEqual(result, {
      botId: "bot-boris",
      reason: "Boris was addressed directly",
      directive: null,
    });
  });

  it("accepts router directives and normalizes them", () => {
    const result = parseRouterResponse(
      `{"botId":"bot-alice","reason":"fresh angle","directive":"  Challenge the claim with one concrete counterexample.  "}`,
      allowed
    );
    assert.equal(result?.botId, "bot-alice");
    assert.equal(result?.reason, "fresh angle");
    assert.equal(
      result?.directive,
      "Challenge the claim with one concrete counterexample."
    );
  });
});

describe("stripCoffeeSpeakerPrefix", () => {
  it("removes copied bracket speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("[Mister Rogers (assistant)] I really appreciate that.", "Mister Rogers"),
      "I really appreciate that."
    );
  });

  it("removes copied colon speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("Bob Ross: Let's add a little color.", "Bob Ross"),
      "Let's add a little color."
    );
  });
});

describe("coffee prompt leak cleanup", () => {
  it("detects instruction-shaped prompt leakage", () => {
    assert.equal(
      coffeeReplyLooksLikePromptLeak("We need to respond as SpongeBob, one line, no speaker label."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We must respond as Patrick Star, short, one clause, 72 characters max."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        '**We must respond as Patrick Star**, short, one clause, 72 characters max.'
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to respond as SpongeBob, one clause only, under 72 characters."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("We need to respond as Patrick Star."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to produce a single clause, no line breaks, max 72 characters, no speaker label."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The user wants a single clause of up to 72 characters, no speaker label."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("That should be in the action box, but I digress."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The action section is separate from the spoken table words."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to reply as SpongeBob, following all the constraints. The user wants me to say my next short table line now."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The user requests a short line from Patrick Star, presumably about the poll."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to output a single line spoken by SpongeBob at the table conversation about planning trip to Glove World, including cost example: If we bring a snack pack for each, that's $5 per person."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The response should be a single line spoken by Mr. Krabs at the table conversation about the receipt."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("Show me rather and penny with a receipt attached."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("Give me the receipt version, not the brochure version."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("Me hearty! The new object is an empty wallet lying nearby."),
      true
    );
  });

  it("does not flag normal visible banter", () => {
    assert.equal(coffeeReplyLooksLikePromptLeak("Yeah, that tracks."), false);
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "If we bring a snack pack for each, that's $5 per person."
      ),
      false
    );
  });

  it("detects low-value filler and meta table-management lines", () => {
    assert.equal(coffeeReplyIsPunctuationOnly("…"), true);
    assert.equal(coffeeReplyIsPunctuationOnly(" ...?! "), true);
    assert.equal(coffeeReplyIsPunctuationOnly("*looks down* …"), false);
    assert.equal(sanitizeCoffeeTableReply("Alice: …", "Alice"), "");
    assert.equal(coffeeReplyIsLowValueTableLine("Fair point."), true);
    assert.equal(coffeeReplyIsLowValueTableLine("True enough."), true);
    assert.equal(coffeeReplyIsLowValueTableLine("Noted."), true);
    assert.equal(coffeeReplyIsLowValueTableLine("That tracks."), true);
    assert.equal(
      coffeeReplyIsLowValueTableLine("Fair point, but the receipt is who pays afterward."),
      false
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("*stirs the coffee slowly* The table is circling; time for a cleaner point."),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("Show me glance and trusty with a receipt attached."),
      true
    );
    assert.equal(coffeeReplyIsLowValueTableLine("Put a real case on the table first."), true);
    assert.equal(
      coffeeReplyIsLowValueTableLine("I need one case where brainstorm and money makes someone move differently."),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("Show where quiet and sound puts two people at the table on opposite sides."),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("The useful part is where this could actually break."),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("The useful part is what critical and virtue makes someone risk."),
      true
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Socrates: The useful part is what paradox and control makes someone risk.",
        "Socrates"
      ),
      ""
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("Give me the receipt version, not the brochure version."),
      true
    );
    for (const leakedFallback of [
      "Make general and speak visible in one choice and I can take a side.",
      "That only lands if lawyer and speak changes what someone actually does.",
      "Give general and worth one table-sized example before it turns into fog.",
      "Anchor finger and against to one scene we can actually argue over.",
      "If appear and ordinary is the lever, I need to see what breaks first.",
    ]) {
      assert.equal(coffeeReplyIsLowValueTableLine(leakedFallback), true);
      assert.equal(sanitizeCoffeeTableReply(leakedFallback, "James Madison"), "");
    }
    assert.equal(
      coffeeReplyIsLowValueTableLine("Interesting dynamics at play... strokes chin Perhaps Mr. Krabs' coin is not the only change agent?"),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine("The new object is an empty wallet lying nearby"),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine(
        "My Poosh-branded coffee mug stays warm in my hands as I ponder Kourtney's words about teaching self-advocacy"
      ),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine(
        "As I watch Khloe's words hang in the air, I take a deep breath and set my coffee cup down on the velvet sofa beside me."
      ),
      true
    );
  });

  it("detects malformed Coffee fallback grammar as low-value", () => {
    assert.equal(
      coffeeReplyIsLowValueTableLine(
        "The sharper test is what squidward and we've changes at the table."
      ),
      true
    );
    assert.equal(
      coffeeReplyIsLowValueTableLine(
        "Sometimes the what, SpongeBob— sometimes the stars align."
      ),
      true
    );
    assert.equal(coffeeReplyIsLowValueTableLine("I but if Plankton starts cutting costs."), true);
    assert.equal(coffeeReplyIsLowValueTableLine("I 100 Krabby Patties is going to set me right!"), true);
  });

  it("drops prompt-leak replies instead of showing them on the table", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to respond as SpongeBob, one line, no speaker label.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "SpongeBob We need to respond as SpongeBob, one clause only, under 72 characters.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to produce a single clause, no line breaks, max 72 characters, no speaker label.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "The user wants a single clause of up to 72 characters, no speaker label.",
        "Plankton"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to reply as SpongeBob, following all the constraints. The user wants me to say my next short table line now.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to output a single line spoken by SpongeBob at the table conversation about planning trip to Glove World, including cost example: If we bring a snack pack for each, that's $5 per person.",
        "SpongeBob"
      ),
      ""
    );
  });

  it("drops low-value filler and meta table-management replies", () => {
    assert.equal(sanitizeCoffeeTableReply("Fair point.", "SpongeBob"), "");
    assert.equal(sanitizeCoffeeTableReply("That tracks.", "SpongeBob"), "");
    assert.equal(
      sanitizeCoffeeTableReply(
        "*stirs the coffee slowly* The table is circling; time for a cleaner point.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Fair point, but the receipt is who pays afterward.",
        "SpongeBob"
      ),
      "Fair point, but the receipt is who pays afterward."
    );
  });

  it("lifts exported third-person narration into Coffee action sections", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "Gentlemen, perhaps we approach this matter too abstractly. He reaches into his coat pocket and produces a small glass vial filled with clear liquid. I recently tested this in my workshop.",
        "Benjamin Franklin"
      ),
      "Gentlemen, perhaps we approach this matter too abstractly. *reaches into his coat pocket and produces a small glass vial filled with clear liquid* I recently tested this in my workshop."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Jefferson tilts his head slightly, curious So you're suggesting the manner of presentation alters the substance discussed, General?",
        "Thomas Jefferson"
      ),
      "*tilts his head slightly, curious* So you're suggesting the manner of presentation alters the substance discussed, General?"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Madison's expression shifts from contemplative to sharp. Then perhaps appearance is the substance in your argument, Mr. Adams.",
        "James Madison"
      ),
      "*expression shifts from contemplative to sharp* Then perhaps appearance is the substance in your argument, Mr. Adams."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "This appears to be ordinary water, though I could not say for certain without tasting. sets it down deliberately on the table surface",
        "George Washington"
      ),
      "This appears to be ordinary water, though I could not say for certain without tasting. *sets it down deliberately on the table surface*"
    );
  });

  it("keeps real bot lines and still strips copied speaker labels", () => {
    assert.equal(
      sanitizeCoffeeTableReply("SpongeBob: Yeah, I can do that.", "SpongeBob"),
      "Yeah, I can do that."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "SpongeBob with profound weariness I can still return the lunchbox.",
        "SpongeBob"
      ),
      "I can still return the lunchbox."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "SpongeBob with profound weariness Sometimes the what, SpongeBob— sometimes the stars align.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I take a sip of my pineapple juice, feeling determined. Mr. Krabs: Aye, that be grand!",
        "SpongeBob",
        240,
        ["SpongeBob", "Mr. Krabs", "Squidward"]
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Patrick Star: , Does that penny change our seating arrangement?",
        "Patrick Star"
      ),
      "Does that penny change our seating arrangement?"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Plankton: , Ah, but I'm not sure even Karen would want to wade into formulas right now.",
        "Plankton"
      ),
      "Ah, but I'm not sure even Karen would want to wade into formulas right now."
    );
  });

  it("downgrades weak noun-like stage tags to plain prose", () => {
    assert.equal(
      sanitizeCoffeeTableReply("*secrets* Snacks are fuel.", "Plankton"),
      "secrets Snacks are fuel."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*enthusiasm* Keep going.", "Squidward"),
      "enthusiasm Keep going."
    );
  });

  it("keeps physical/social stage actions wrapped for seat badges", () => {
    assert.equal(
      sanitizeCoffeeTableReply("*adjusting goggles* Snacks are fuel.", "Plankton"),
      "*adjusting goggles* Snacks are fuel."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*places a hand over his heart* Growth begins now.", "Jesus Christ"),
      "*places a hand over his heart* Growth begins now."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*sips tea* We continue.", "Mr. Krabs"),
      "We continue."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*dryly sets his cup down* Fine.", "Squidward"),
      "*dryly sets his cup down* Fine."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*drinks from the cup* Fine.", "Squidward"),
      "Fine."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*raises the mug to his lips* Fine.", "Squidward"),
      "Fine."
    );
  });

  it("accepts unfamiliar verb-first wrapped actions without recasting emphasized speech", () => {
    for (const line of [
      "*Looks at Patrick* How are you?",
      "*gasps* That was close.",
      "*clacks claw on the table* Menace doesn't fill seats.",
      "*snatches a coupon* The discount is mine.",
    ]) {
      assert.equal(
        sanitizeCoffeeTableReply(
          line,
          "Plankton",
          240,
          ["Plankton", "Patrick"]
        ),
        line
      );
    }

    for (const [raw, expected] of [
      ["*Sounds good.* We proceed.", "Sounds good. We proceed."],
      ["*Makes sense.* We proceed.", "Makes sense. We proceed."],
      ["*Looks like rain.* We proceed.", "Looks like rain. We proceed."],
      ["*Feels wrong.* We should reconsider.", "Feels wrong. We should reconsider."],
    ] as const) {
      assert.equal(sanitizeCoffeeTableReply(raw, "Plankton"), expected);
    }

    assert.equal(
      sanitizeCoffeeTableReply(
        "clacks claw on the table Menace doesn't fill seats.",
        "Mr. Krabs"
      ),
      "clacks claw on the table Menace doesn't fill seats."
    );
  });

  it("removes visible double quote marks from Coffee table replies and actions", () => {
    assert.equal(
      sanitizeCoffeeTableReply('*stares at "truth"* "Truth" is expensive.', "Plankton"),
      "*stares at truth* Truth is expensive."
    );
    assert.equal(
      sanitizeCoffeeTableReply('He called it "honest" because it sounded cheaper.', "Squidward"),
      "He called it honest because it sounded cheaper."
    );
    assert.equal(
      sanitizeCoffeeTableReply("That's a clever point about balance and moderation,, but now let us continue.", "Plato"),
      "That's a clever point about balance and moderation, but now let us continue."
    );
  });

  it("wraps obvious unmarked stage-action openers before storing", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "beams SpongeBob, fry cook, at your service!",
        "SpongeBob",
      ),
      "*beams* SpongeBob, fry cook, at your service!",
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "bounces in his seat But the heart-shaped patty is still art.",
        "SpongeBob",
      ),
      "*bounces in his seat* But the heart-shaped patty is still art.",
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "pokes the napkin heart But it still works as a napkin.",
        "Patrick Star",
      ),
      "*pokes the napkin heart* But it still works as a napkin.",
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "[Plankton](prism-bot://bot-plankton), slaps a claw on the table Aye, it paid for itself!",
        "Mr. Krabs",
      ),
      "[Plankton](prism-bot://bot-plankton), *slaps a claw on the table* Aye, it paid for itself!",
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "touches the rim of the coffee cup Truth extracted by deceit stains the vessel.",
        "Darth Vader"
      ),
      "*touches the rim of the coffee cup* Truth extracted by deceit stains the vessel."
    );
    assert.equal(
      sanitizeCoffeeTableReply("Looks like rain today.", "Darth Vader"),
      "Looks like rain today."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "shifts in chair with a long, theatrical sigh Of all the ridiculous theories to waste oxygen on, this one takes the cake.",
        "Squidward"
      ),
      "*shifts in chair with a long, theatrical sigh* Of all the ridiculous theories to waste oxygen on, this one takes the cake."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Plankton, pushes coffee cup aside with a sharp clink and drums claws on the table Ar ar ar! You're all getting philosophical on me, but I'll tell",
        "Plankton"
      ),
      "*pushes coffee cup aside with a sharp clink and drums claws on the table* Ar ar ar! You're all getting philosophical on me, but I'll tell"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "claws slam the table Now hold on just a barnacle-encrusted minute.",
        "Mr. Krabs"
      ),
      "*claws slam the table* Now hold on just a barnacle-encrusted minute."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "antennae droop, claws go still on the table That's the thing though—you built the Krusty Krab.",
        "Plankton"
      ),
      "*antennae droop, claws go still on the table* That's the thing though—you built the Krusty Krab."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Mr. Krabs, drums claws on the table Now hold on just a barnacle-encrusted minute.",
        "Mr. Krabs"
      ),
      "*drums claws on the table* Now hold on just a barnacle-encrusted minute."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "brightens Maybe his genius is knowing exactly when to look clueless!",
        "SpongeBob"
      ),
      "*brightens* Maybe his genius is knowing exactly when to look clueless!"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "stacks a few coins beside the rulebook The payer gets a vote, lad.",
        "Mr. Krabs"
      ),
      "*stacks a few coins beside the rulebook* The payer gets a vote, lad."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Patrick Star, opens the rulebook to the middle Then the handoff needs one honest question.",
        "Patrick Star"
      ),
      "*opens the rulebook to the middle* Then the handoff needs one honest question."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Mr. Krabs, thumbs the rulebook shut A rule that serves itself gets rewritten.",
        "Mr. Krabs"
      ),
      "*thumbs the rulebook shut* A rule that serves itself gets rewritten."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "claws are useful at work Now that is just common sense.",
        "Mr. Krabs"
      ),
      "claws are useful at work Now that is just common sense."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "takes a long, deliberate sip of coffee, then sets the cup down with precision A roof and a job he loves—sure, but does he love the work?",
        "Squidward"
      ),
      "A roof and a job he loves—sure, but does he love the work?"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "eyes the sugar shaker like it's a cash register, nudges it an inch to center it Now that shaker there — that's the most artistic price adjustment I ever pulled.",
        "Mr. Krabs"
      ),
      "*eyes the sugar shaker like it's a cash register, nudges it an inch to center it* Now that shaker there — that's the most artistic price adjustment I ever pulled."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "pulls a napkin over, folds it into a tiny hat for a nickel, sets it down proud Every prop earns its keep here.",
        "Mr. Krabs"
      ),
      "*pulls a napkin over, folds it into a tiny hat for a nickel, sets it down proud* Every prop earns its keep here."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "eyes the tiny napkin hat with visible disdain A nickel wearing a hat doesn't change what it's worth, Mr. Krabs — that's just origami with delusions of grandeur.",
        "Squidward"
      ),
      "*eyes the tiny napkin hat with visible disdain* A nickel wearing a hat doesn't change what it's worth, Mr. Krabs — that's just origami with delusions of grandeur."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I straighten my napkin with a slight sigh The only thing that can add to disaster is poor planning.",
        "Squidward"
      ),
      "*straightens the napkin with a slight sigh* The only thing that can add to disaster is poor planning."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "The coffee shop hums with quiet conversation as I settle into my seat, notebook open before me. Liberty isn't freedom from constraint—it's freedom within structure. I fold my hands around my cup. The question isn't whether to accept limits, but which ones preserve what matters.",
        "James Madison"
      ),
      "*settles into the seat, notebook open nearby* Liberty isn't freedom from constraint—it's freedom within structure. *folds the hands around the cup* The question isn't whether to accept limits, but which ones preserve what matters."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I stare intensely at the empty chair Squidward would occupy, a hint of disappointment on my face",
        "Plankton"
      ),
      "*stares intensely at the empty chair Squidward would occupy, a hint of disappointment on the face*"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I chuckle, Me hearty, ye'll be wantin' to spend that wee fortune on a clarinet.",
        "Mr. Krabs"
      ),
      "*chuckles* Me hearty, ye'll be wantin' to spend that wee fortune on a clarinet."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I lean forward slightly, eyes wide with interest Oh boy, can you show us the design?",
        "SpongeBob"
      ),
      "*leans forward slightly, eyes wide with interest* Oh boy, can you show us the design?"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "[Mr. Krabs](prism-bot://bot-krabs), I lean in with a big grin I've got one small example.",
        "SpongeBob"
      ),
      "[Mr. Krabs](prism-bot://bot-krabs), *leans in with a big grin* I've got one small example."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I take a slow sip from my cup We keep moving.",
        "Squidward"
      ),
      "We keep moving."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I've made some... adjustments to our accounting practices winks.",
        "Plankton"
      ),
      "I've made some... adjustments to our accounting practices. *winks*"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "[Mr. Krabs](prism-bot://bot-krabs), rests a hand by the cup Show where quiet and sound puts two people at the table on opposite sides.",
        "SpongeBob",
        240,
        ["SpongeBob", "Mr. Krabs"]
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Mr. Krabs: [SpongeBob](prism-bot://bot-sponge), stirs once Tie treasure and excitedly to a specific choice, not just a vibe.",
        "Mr. Krabs",
        240,
        ["SpongeBob", "Mr. Krabs"]
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "stands up and stretches I've got an idea for a new recipe.",
        "SpongeBob"
      ),
      "*stands up and stretches* I've got an idea for a new recipe."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I've got an idea for a new recipe! excitedly heads towards the kitchen",
        "SpongeBob"
      ),
      "I've got an idea for a new recipe. *excitedly heads towards the kitchen*"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I love a good treasure hunt! excitedly leans forward Is it another attempt to steal the formula?",
        "SpongeBob"
      ),
      "I love a good treasure hunt! *excitedly leans forward* Is it another attempt to steal the formula?"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I've got a map that'll lead me straight to the... Ah ha! Follow me, lad / Glances at the chart with a calculating eye, tapping my pen on the edge",
        "Mr. Krabs"
      ),
      "I've got a map that'll lead me straight to the... Ah ha! Follow me, lad. *Glances at the chart with a calculating eye, tapping the pen on the edge*"
    );
  });

  it("derives conjugated Coffee action verbs from wildcard verbs without recasting speech", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "[Plankton](prism-bot://15abcff04cbb78591bab82fd), slaps a claw on the table Aye, it has!",
        "Mr. Krabs"
      ),
      "[Plankton](prism-bot://15abcff04cbb78591bab82fd), *slaps a claw on the table* Aye, it has!"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "bounces in his seat But the heart-shaped patty is still art.",
        "SpongeBob"
      ),
      "*bounces in his seat* But the heart-shaped patty is still art."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "pokes the napkin heart But it still works as a napkin.",
        "Patrick Star"
      ),
      "*pokes the napkin heart* But it still works as a napkin."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "*Judges Mr. Krabs from across the table* Krabs, you make me mad!",
        "Squidward",
        240,
        ["Squidward", "Mr. Krabs"]
      ),
      "*Judges Mr. Krabs from across the table* Krabs, you make me mad!"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Judges Mr. Krabs from across the table Krabs, you make me mad!",
        "Squidward",
        240,
        ["Squidward", "Mr. Krabs"]
      ),
      "*Judges Mr. Krabs from across the table* Krabs, you make me mad!"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Judges Mr. Krabs from across the table. Krabs, you make me mad!",
        "Squidward",
        240,
        ["Squidward", "Mr. Krabs"]
      ),
      "*Judges Mr. Krabs from across the table* Krabs, you make me mad!"
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "*believes in the power of friendship* Friendship still matters.",
        "SpongeBob"
      ),
      "*believes in the power of friendship* Friendship still matters."
    );

    for (const [raw, expected] of [
      ["carries the tray But refuses to call it service.", "*carries the tray* But refuses to call it service."],
      ["has a claw on the receipt But still denies it.", "*has a claw on the receipt* But still denies it."],
      ["does a little dance But calls it strategy.", "*does a little dance* But calls it strategy."],
      ["goes still But keeps watching the register.", "*goes still* But keeps watching the register."],
      ["is tapping the menu But pretends not to care.", "*is tapping the menu* But pretends not to care."],
    ] as const) {
      assert.equal(sanitizeCoffeeTableReply(raw, "Plankton"), expected);
    }

    for (const spoken of [
      "I believe in the power of friendship!",
      "We poke holes in that argument.",
      "You judge people too quickly.",
      "They slap their names on everything.",
      "Sounds good.",
      "Makes sense.",
      "Looks like a scam.",
      "Feels wrong.",
      "Seems fair.",
      "Is this a scam? I certainly think so.",
    ]) {
      assert.equal(sanitizeCoffeeTableReply(spoken, "SpongeBob"), spoken);
    }
  });

  it("recognizes user action-only messages", () => {
    assert.equal(coffeeUserMessageIsActionOnly("*takes a quiet sip*"), true);
    assert.equal(coffeeUserMessageIsActionOnly("takes a quiet sip"), true);
    assert.equal(coffeeUserMessageIsActionOnly("*twiddles thumbs*"), true);
    assert.equal(normalizeCoffeeUserActionText("*twiddles thumbs*"), "twiddles thumbs");
    assert.equal(coffeeUserMessageIsActionOnly("*twiddles thumbs* Okay, continue."), false);
    assert.equal(coffeeUserMessageIsActionOnly("*takes a quiet sip* Okay, continue."), false);
    assert.equal(coffeeUserMessageIsActionOnly("Okay, continue."), false);
    assert.equal(normalizeCoffeeUserActionText("*leans back and smiles faintly*"), "leans back and smiles faintly");
    assert.equal(normalizeCoffeeUserActionText("Okay, continue."), null);
  });

  it("rejects obviously unfinished Coffee replies instead of storing a cutoff", () => {
    assert.equal(
      coffeeReplyLooksUnfinished(
        "Oh! You want to know what I think? The coffee cup is pretty neat! But mostly"
      ),
      true
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Oh! You want to know what I think? The coffee cup is pretty neat! But mostly",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(coffeeReplyLooksUnfinished("I mostly trust the quiet option"), false);
    assert.equal(
      sanitizeCoffeeTableReply("I mostly trust the quiet option.", "Squidward"),
      "I mostly trust the quiet option."
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I glance at my trusty old cash register, a gleaming metallic beast that's seen its fair share of profits and losses. SpongeBob's enthusiasm is endearing, but I think he'll find it difficult",
        "Mr. Krabs"
      ),
      ""
    );
    assert.equal(
      coffeeReplyLooksUnfinished("His latest scheme's just a ruse to distract from the real"),
      true
    );
    assert.equal(
      coffeeReplyLooksUnfinished(
        "Oh, please. A faint scent of burnt coffee wafts through the air as I carefully fold the dirty rag and place it in the trash can behind me. My"
      ),
      true
    );
    assert.equal(coffeeReplyLooksUnfinished("Now, what's your take on making our family"), true);
    assert.equal(coffeeReplyLooksUnfinished("The impediment becomes the way. I reach"), true);
    assert.equal(coffeeReplyLooksUnfinished("The gardens are lovely this time"), false);
    assert.equal(coffeeReplyLooksUnfinished("The smoothness of this stone is a testament to craft... pa"), true);
    assert.equal(coffeeReplyLooksUnfinished("Tell"), true);
    assert.equal(coffeeReplyLooksUnfinished("This"), true);
    assert.equal(
      coffeeReplyLooksUnfinished("Huh. Kid didn't even finish his drink. t"),
      true
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "Huh. Kid didn't even finish his drink. t",
        "Mr. Krabs"
      ),
      ""
    );
    assert.equal(coffeeReplyLooksUnfinished("The olive gro"), true);
    assert.equal(coffeeReplyLooksUnfinished("Bows his head slightly I concur. Takes"), true);
    assert.equal(
      coffeeReplyLooksUnfinished(
        "Can we not ask whether the lyre's sound reveals as much about the soul of its player as the instrument"
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksUnfinished("The decision to temper one's"),
      true
    );
  });

  it("does not build fallback focus phrases from speaker-name or pronoun debris", () => {
    assert.equal(
      coffeeFallbackFocusPhrase(
        "The sharper test is what Squidward and we've changes at the table."
      ),
      null
    );
    assert.equal(
      coffeeFallbackFocusPhrase(
        "SpongeBob with profound weariness Sometimes the what, SpongeBob— sometimes the sentence ended before you finished it?"
      ),
      null
    );
    assert.equal(
      coffeeFallbackFocusPhrase("Put actually under a consequence we can see."),
      null
    );
    assert.equal(
      coffeeFallbackFocusPhrase(
        "I glance at my trusty notebook, where all my plans for stealing the secret formula are meticulously organized."
      ),
      null
    );
  });

  it("dedupes model-returned session synopsis headings", () => {
    assert.equal(
      normalizeCoffeeSessionSynopsis(
        "**Session Synopsis** The table circled manipulation and trust while Vader pressed for evidence and Freud overextended the psychological frame."
      ),
      "Session synopsis: The table circled manipulation and trust while Vader pressed for evidence and Freud overextended the psychological frame."
    );
  });

  it("bounds long session synopses at a natural sentence boundary", () => {
    const sentence =
      "The table kept returning to one concrete rule while each speaker tested its cost in a different relationship.";
    const synopsis = normalizeCoffeeSessionSynopsis(
      Array.from({ length: 12 }, () => sentence).join(" ")
    );

    assert.ok(synopsis);
    assert.ok(synopsis.length <= 900);
    assert.match(synopsis, /\.$/u);
    assert.doesNotMatch(synopsis, /\S\.\.\.$/u);
  });

  it("rejects session synopses that mention internal account metadata", () => {
    assert.equal(
      coffeeTextMentionsInternalAccountMetadata(
        "The poll leans True (3-2), and the system noted your account display name is admin."
      ),
      true
    );
    assert.equal(
      normalizeCoffeeSessionSynopsis(
        "The poll leans True (3-2), and the system noted your account display name is admin."
      ),
      null
    );
  });

  it("uses poll-aware emergency fallback lines during active polls", () => {
    const line = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      speaker: { id: "bot-sponge", name: "SpongeBob" },
      conversationId: "poll-conv",
      historyLength: 4,
      maxChars: 110,
      activePoll: { options: ["Mermaid Man", "Barnacle Boy"] },
    });

    assert.match(line, /Mermaid Man|Barnacle Boy/);
    assert.doesNotMatch(line, /Let's ground it|Hold that thought|I hear the point/);
  });

  it("uses in-world emergency fallback lines that add substance", () => {
    const line = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      speaker: { id: "bot-sponge", name: "SpongeBob" },
      conversationId: "fallback-conv",
      historyLength: 4,
      maxChars: 110,
    });

    assert.equal(coffeeReplyIsLowValueTableLine(line), false);
    assert.doesNotMatch(line, /Fair point|Noted|I hear the point|The table is circling|time for a cleaner point/);
    assert.doesNotMatch(line, /sharper object|stronger point|easy one|name the cost, not just the mood/i);
    assert.doesNotMatch(line, /real case before I buy|money, time, or pride actually moves/i);
    assert.doesNotMatch(line, /\b(tradeoff|claim|stakes)\b/i);
    assert.match(
      line,
      /\b(cost|test|case|detail|break|choice|rule|mistake|responsibility|purpose|failure|consequence)\b/i
    );
  });

  it("keeps emergency and fresh fallbacks anchored to the Coffee topic", () => {
    const topic = "What if Patrick is secretly a genius?";
    const oldCarousel =
      /trust breaks|weakest handoff|follow the consequence|system can survive|who gets to call this a success|skeptical side/i;
    const emergency = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      topic,
      speaker: { id: "bot-krabs", name: "Mr. Krabs" },
      conversationId: "patrick-fallback",
      historyLength: 12,
      maxChars: 140,
    });
    const fresh = buildCoffeeFreshFallbackBeat({
      tableFocus: "Continue the table.",
      topic,
      speaker: { id: "bot-patrick", name: "Patrick Star" },
      conversationId: "patrick-fallback",
      historyLength: 13,
      maxChars: 140,
    });

    assert.match(emergency, /Patrick is secretly a genius/i);
    assert.match(fresh, /Patrick is secretly a genius/i);
    assert.doesNotMatch(emergency, oldCarousel);
    assert.doesNotMatch(fresh, oldCarousel);
  });

  it("omits blank replay-only system rows from Coffee exports", () => {
    const visible = coffeeMessagesVisibleInExport([
      { role: "system", content: "" },
      { role: "system", content: "   " },
      { role: "assistant", content: "..." },
      { role: "assistant", content: "A real table line." },
      { role: "system", content: "Session synopsis: The table stayed playful." },
    ]);

    assert.deepEqual(visible, [
      { role: "assistant", content: "A real table line." },
      { role: "system", content: "Session synopsis: The table stayed playful." },
    ]);
  });

  it("avoids reported stock fallback lines in emergency and fresh fallback replies", () => {
    const reportedPattern =
      /sharper object on the table|stronger point is still hiding under the easy one|name the cost, not just the mood|bring it back to the thing we can actually test|put actually under a consequence we can see|show me .+ receipt attached|put a real case on the table first|the useful part is where this could actually break|name the tradeoff|point stays decorative|someone (?:at this table |here )?would dispute|stakes plain enough to disagree|only matters if it changes what someone would do|claim has teeth|real case before I buy|money, time, or pride actually moves|table-sized example|turns into fog|visible in one choice|that only lands if|is the lever|anchor .+ to one scene/i;

    for (let index = 0; index < 24; index += 1) {
      const emergencyLine = buildCoffeeEmergencyFallbackReply({
        tableFocus: index % 2 === 0 ? "Continue the table." : "What should the table test?",
        speaker: { id: "bot-sponge", name: "SpongeBob" },
        conversationId: `fallback-conv-${index}`,
        historyLength: index,
        maxChars: 140,
        seedExtra: `reported-${index}`,
      });
      const freshLine = buildCoffeeFreshFallbackBeat({
        tableFocus:
          index % 4 === 0
            ? "secret and formula"
            : index % 3 === 0
              ? "Put actually under a consequence we can see."
              : "the receipt matters",
        speaker: { id: "bot-sponge", name: "SpongeBob" },
        conversationId: `fresh-conv-${index}`,
        historyLength: index,
        maxChars: 140,
        seedExtra: `reported-${index}`,
      });

      assert.doesNotMatch(emergencyLine, reportedPattern);
      assert.doesNotMatch(freshLine, reportedPattern);
      assert.doesNotMatch(emergencyLine, /\b(tradeoff|claim|stakes)\b/i);
      assert.doesNotMatch(freshLine, /\b(tradeoff|claim|stakes)\b/i);
      assert.equal(coffeeReplyIsLowValueTableLine(emergencyLine), false);
      assert.equal(coffeeReplyIsLowValueTableLine(freshLine), false);
    }
  });

  it("keeps poll emergency fallback aligned with the bot's current leaning", () => {
    const line = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      speaker: { id: "bot-sponge", name: "SpongeBob" },
      conversationId: "poll-conv",
      historyLength: 7,
      maxChars: 110,
      activePoll: {
        options: ["True", "False"],
        votes: [
          {
            botId: "bot-sponge",
            voterKind: "bot",
            kind: "pending",
            optionIndex: null,
            explanation: null,
            confidence: 0.7,
            deliberation: {
              stage: "evaluating",
              leaningOptionIndex: 0,
              alternateOptionIndex: null,
              confidence: 0.7,
              blocker: null,
              note: null,
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
    });

    assert.match(line, /True/);
  });
});

describe("coffee character immersion guard", () => {
  it("detects self-identifying AI/model disclaimers", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion(
        "As a digital AI assistant, I can't physically take photos."
      ),
      true
    );
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("I am a language model, so I do not have a body."),
      true
    );
  });

  it("does not flag normal in-character lines", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("I can sketch the scene right now if you want."),
      false
    );
  });

  it("detects capability denial lines about photos being impossible in chat", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion(
        "I wish I could send you a photo, but I'm afraid that's not possible in this chat."
      ),
      true
    );
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("Sorry, photos aren't possible in this chat."),
      true
    );
  });

  it("drops immersion-breaking replies in sanitizeCoffeeTableReply", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "As an AI assistant, I don't have the ability to take photos.",
        "Alan Watts"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I wish I could send you a photo, but I'm afraid that's not possible in this chat.",
        "Alan Watts"
      ),
      ""
    );
  });
});

describe("coffee meeting summary helpers", () => {
  it("filters prompt-leaked assistant lines out of summary source messages", () => {
    const source = coffeeMeetingSummarySourceMessages([
      { id: "u1", role: "user", content: "Who is cooler?", createdAt: "2026-01-01T00:00:00.000Z" },
      {
        id: "a1",
        role: "assistant",
        content: "Mermaid Man still has the better hero vibe.",
        botName: "SpongeBob",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "a2",
        role: "assistant",
        content:
          "We need to reply as SpongeBob, following all constraints. The user wants my next short table line now.",
        botName: "SpongeBob",
        createdAt: "2026-01-01T00:00:02.000Z",
      },
    ]);
    assert.equal(source.length, 2);
    assert.equal(source.some((message) => message.id === "a2"), false);
  });

  it("filters private player team markers out of summary source messages", () => {
    const source = coffeeMeetingSummarySourceMessages([
      {
        id: "u1",
        role: "user",
        content: "*switches from Engineers to Poets*",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "u2",
        role: "user",
        content: "What is the strongest argument for Engineers?",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "Engineers make the bridge stand before anyone paints it.",
        botName: "Alice",
        createdAt: "2026-01-01T00:00:02.000Z",
      },
    ]);

    assert.deepEqual(
      source.map((message) => message.id),
      ["u2", "a1"]
    );
  });

  it("omits account metadata from session synopsis memory-change lines", () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    const userKey = Buffer.alloc(32, 11);
    const conversationId = "conv-synopsis-memory";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-about-you",
      conversationId,
      botId: ALICE.id,
      source: "about_you",
      text: "Your account display name is admin.",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-direct",
      conversationId,
      botId: ALICE.id,
      source: "direct",
      text: "Alice learned the user wants sharper poll arguments.",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    seedCoffeeMemory(db, userId, userKey, {
      id: "memory-mis-sourced-account",
      conversationId,
      botId: null,
      source: "direct",
      text: "Your account has not provided a display name yet.",
      createdAt: "2026-01-01T00:00:02.000Z",
    });

    const lines = loadCoffeeSessionMemoryChangeLines(
      db,
      userId,
      conversationId,
      userKey
    );

    assert.deepEqual(lines, [
      "- Alice direct/short_term: Alice learned the user wants sharper poll arguments.",
    ]);
  });

  it("omits empty poll, team, and memory sections from Coffee session synopsis prompts", async () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    const conversationId = "conv-summary-empty-sections";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "summary-empty-a1",
      conversationId,
      userId,
      "Alice notices the table kept returning to one practical test.",
      ALICE.id,
      "2026-01-01T00:00:00.000Z"
    );
    insert.run(
      "summary-empty-b1",
      conversationId,
      userId,
      "Boris says the test only matters if someone can repeat it under pressure.",
      BORIS.id,
      "2026-01-01T00:00:01.000Z"
    );
    const chatBodies: unknown[] = [];

    await withMockedCoffeeFetch(
      "The table circled a practical test, with Alice asking for evidence and Boris grounding it in repeatable pressure.",
      () =>
        generateCoffeeSessionSynopsis(db, userId, conversationId, {
          preferredProvider: "local",
        }),
      { chatBodies }
    );

    const requestBody = chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined;
    const prompt = requestBody?.messages?.map((message) => message.content ?? "").join("\n") ?? "";

    assert.doesNotMatch(prompt, /Poll results recorded during this session/i);
    assert.doesNotMatch(prompt, /Team dynamics recorded during this session/i);
    assert.doesNotMatch(prompt, /Memory changes recorded during this session/i);
    assert.doesNotMatch(prompt, /No Coffee polls?|No Coffee Teams|No explicit saved\/changed memories/i);
    assert.match(prompt, /If the table drifted away from the topic, say so plainly/);
    assert.match(prompt, /Attribute every introduced object, action, and claim to the speaker/);
    assert.match(prompt, /if Franklin introduces an object and Washington later handles it/i);
    assert.match(prompt, /Never claim everyone stayed engaged/i);
    assert.match(prompt, /Transcript:/);
    assert.match(prompt, /Alice notices/);
  });

  it("refreshes summaries only after enough new assistant turns", () => {
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 3,
        lastSummarizedAssistantCount: null,
      }),
      false
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 4,
        lastSummarizedAssistantCount: null,
      }),
      true
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 6,
        lastSummarizedAssistantCount: 4,
      }),
      false
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 8,
        lastSummarizedAssistantCount: 4,
      }),
      true
    );
  });

  it("keeps stale summary writes from overwriting newer summary state", () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id,
          coffee_duration_minutes, coffee_preset_id, coffee_topic, coffee_meeting_summary,
          coffee_meeting_summary_message_count, coffee_meeting_summary_updated_at, incognito, created_at, updated_at)
       VALUES (?, ?, 'Coffee Session', 'coffee', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?)`
    ).run("conv-summary", userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const firstWrite = persistCoffeeMeetingSummaryIfNewer({
      db,
      userId,
      conversationId: "conv-summary",
      summary: "First pass summary.",
      assistantMessageCount: 8,
      nowIso: "2026-01-01T00:00:08.000Z",
    });
    assert.equal(firstWrite, true);

    const staleWrite = persistCoffeeMeetingSummaryIfNewer({
      db,
      userId,
      conversationId: "conv-summary",
      summary: "Stale summary should not win.",
      assistantMessageCount: 6,
      nowIso: "2026-01-01T00:00:09.000Z",
    });
    assert.equal(staleWrite, false);

    const row = db
      .prepare(
        "SELECT coffee_meeting_summary, coffee_meeting_summary_message_count FROM conversations WHERE id = ?"
      )
      .get("conv-summary") as {
      coffee_meeting_summary: string | null;
      coffee_meeting_summary_message_count: number | null;
    };
    assert.equal(row.coffee_meeting_summary, "First pass summary.");
    assert.equal(row.coffee_meeting_summary_message_count, 8);
  });

  it("keeps session synopsis generation off the Coffee speaker model override", async () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    const conversationId = "conv-summary-speaker-model";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    await createCoffeeConversationWithId(db, userId, conversationId, {
      groupBotIds: [ALICE.id, BORIS.id],
      durationMinutes: 10,
    });
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', ?, ?, NULL, ?)`
    );
    insert.run(
      "summary-a1",
      conversationId,
      userId,
      "Alice keeps asking for one concrete test before the table accepts the idea.",
      "alice-local-model",
      ALICE.id,
      "2026-01-01T00:00:00.000Z"
    );
    insert.run(
      "summary-b1",
      conversationId,
      userId,
      "Boris reframes the test as something a cook could repeat under pressure.",
      "boris-local-model",
      BORIS.id,
      "2026-01-01T00:00:01.000Z"
    );
    const chatBodies: unknown[] = [];

    await withMockedCoffeeFetch(
      "The table settled on a practical test, with Alice pressing for evidence and Boris turning it into a repeatable kitchen check.",
      () =>
        generateCoffeeSessionSynopsis(db, userId, conversationId, {
          preferredProvider: "local",
          sessionSpeakerModel: "speaker-only-session-model",
        }),
      { chatBodies }
    );

    const requestBody = chatBodies[0] as { model?: string } | undefined;
    assert.notEqual(requestBody?.model, "speaker-only-session-model");
    const stored = db
      .prepare(
        "SELECT model FROM messages WHERE conversation_id = ? AND role = 'system' AND tool_payload LIKE '%coffeeSynopsis%'"
      )
      .get(conversationId) as { model: string | null } | undefined;
    assert.equal(stored?.model, null);
  });

  it("swallows summarizer provider failures", async () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id,
          coffee_duration_minutes, coffee_preset_id, coffee_topic, coffee_meeting_summary,
          coffee_meeting_summary_message_count, coffee_meeting_summary_updated_at, incognito, created_at, updated_at)
       VALUES (?, ?, 'Coffee Session', 'coffee', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?)`
    ).run("conv-summary-fail", userId, now, now);

    const history = [
      {
        id: "a1",
        role: "assistant" as const,
        content: "Mermaid Man has stronger flair.",
        botName: "SpongeBob",
        createdAt: now,
      },
      {
        id: "a2",
        role: "assistant" as const,
        content: "Barnacle Boy still has grit.",
        botName: "Patrick Star",
        createdAt: now,
      },
      {
        id: "a3",
        role: "assistant" as const,
        content: "Mermaid Man feels more iconic to me.",
        botName: "SpongeBob",
        createdAt: now,
      },
      {
        id: "a4",
        role: "assistant" as const,
        content: "Barnacle Boy gets my sympathy vote.",
        botName: "Patrick Star",
        createdAt: now,
      },
    ];

    await assert.doesNotReject(() =>
      kickoffCoffeeMeetingSummaryRefresh({
        db,
        userId,
        conversationId: "conv-summary-fail",
        group: [
          { ...ALICE, name: "SpongeBob" },
          { ...BORIS, name: "Patrick Star" },
        ],
        history,
        previousSummary: null,
        previousSummaryAssistantCount: null,
        activePollContext: null,
        summaryProvider: {
          generateResponse: async () => {
            throw new Error("provider offline");
          },
        } as unknown as LlmProvider,
      })
    );
  });
});

describe("pickFallbackSpeaker", () => {
  it("returns the first bot when no one has spoken yet", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS, CARA], null);
    assert.equal(result.id, "bot-alice");
  });

  it("rotates to the next bot in caller order after a known speaker", () => {
    const after = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-alice");
    assert.equal(after.id, "bot-boris");
    const wrap = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-cara");
    assert.equal(wrap.id, "bot-alice");
  });

  it("falls back to the first bot when the prior speaker is no longer in the group", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS], "bot-removed");
    assert.equal(result.id, "bot-alice");
  });

  it("throws if the group is empty (programmer error guard)", () => {
    assert.throws(() => pickFallbackSpeaker([], null), /Coffee group is empty/);
  });

  it("overrides a repeated autonomous router pick with the next peer", () => {
    assert.equal(
      resolveCoffeeAutonomousSpeakerHandoff({
        group: [ALICE, BORIS, CARA],
        pickedBotId: ALICE.id,
        lastSpeakerBotId: ALICE.id,
        turnKind: "autonomous",
      }).id,
      BORIS.id
    );
    assert.equal(
      resolveCoffeeAutonomousSpeakerHandoff({
        group: [ALICE, BORIS],
        pickedBotId: ALICE.id,
        lastSpeakerBotId: ALICE.id,
        turnKind: "user",
      }).id,
      ALICE.id
    );
  });
});

describe("pickDirectedSpeaker", () => {
  it("returns null when director mode has no requested bot", () => {
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], undefined), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], null), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], "  "), null);
  });

  it("returns the requested seated bot", () => {
    const result = pickDirectedSpeaker([ALICE, BORIS], "bot-boris");
    assert.equal(result?.id, "bot-boris");
  });

  it("rejects a bot that is not seated at the table", () => {
    assert.throws(
      () => pickDirectedSpeaker([ALICE, BORIS], "bot-cara"),
      /not seated/
    );
  });
});

describe("Coffee direct mention routing helpers", () => {
  it("separates direct bot address from broad name tagging and excludes the player", () => {
    const identityCrisisIan = {
      ...BORIS,
      id: "identity-crisis-ian",
      name: "Identity Crisis Ian",
    };
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Ian, if you strip away the recipe, what actually makes it work?",
        speakerBotId: ALICE.id,
        seatedBots: [ALICE, identityCrisisIan],
      }),
      identityCrisisIan.id,
    );
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Ian, take the first point.",
        speakerBotId: ALICE.id,
        seatedBots: [
          ALICE,
          identityCrisisIan,
          { ...CARA, id: "ian", name: "Ian" },
        ],
      }),
      "ian",
    );
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Ian, take the first point.",
        speakerBotId: ALICE.id,
        seatedBots: [
          ALICE,
          identityCrisisIan,
          { ...CARA, id: "ian-malcolm", name: "Ian Malcolm" },
        ],
      }),
      null,
    );
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Boris is right about that.",
        speakerBotId: ALICE.id,
        seatedBots: [ALICE, BORIS, CARA],
      }),
      null,
    );
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Boris, take the first point. Cara, take the second.",
        speakerBotId: ALICE.id,
        seatedBots: [ALICE, BORIS, CARA],
      }),
      CARA.id,
    );
    assert.equal(
      resolveCoffeeIdentityMirrorDirectAddresseeV1({
        line: "Player, you should take the final point.",
        speakerBotId: ALICE.id,
        seatedBots: [ALICE, BORIS, CARA],
      }),
      null,
    );
    for (const restriction of ["speakerMuted", "speakerMumbles"] as const) {
      assert.equal(
        resolveCoffeeIdentityMirrorDirectAddresseeV1({
          line: "Boris, take the first point.",
          speakerBotId: ALICE.id,
          seatedBots: [ALICE, BORIS, CARA],
          [restriction]: true,
        }),
        null,
      );
    }
  });

  it("resolves the current user message's seated prism-bot mention", () => {
    const addressed = extractLastAddressedBotId({
      line: "[Darth Vader](prism-bot://bot-boris), what are your thoughts?",
      speakerBotId: null,
      seatedBotIds: new Set([ALICE.id, BORIS.id]),
    });

    assert.equal(addressed, BORIS.id);
  });

  it("routes a player mention to the addressed seated bot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const chatBodies: unknown[] = [];

    const playerMessage = "[Boris](prism-bot://bot-boris), what do you think?";
    const turn = await withMockedCoffeeFetch(
      "Boris answers the direct question.",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: session.conversation.id,
            message: playerMessage,
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        ),
      {
        chatBodies,
        chatReplies: ["Boris answers the direct question."],
      }
    );
    const routerPrompt = (
      (chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined)
        ?.messages ?? []
    )
      .map((message) => message.content ?? "")
      .join("\n");

    assert.equal(turn.speakerBotId, BORIS.id);
    assert.doesNotMatch(routerPrompt, /Pick exactly one next speaker/);
    assert.equal(
      turn.conversation.messages.find((message) => message.role === "user")?.content,
      playerMessage,
    );
  });

  it("retries punctuation-only output with the same addressed bot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "unused",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: session.conversation.id,
            message: "[Alice](prism-bot://bot-alice), give us one concrete test.",
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        ),
      {
        chatBodies,
        chatReplies: ["…", "I’d test the smallest risky assumption first."],
      }
    );

    const assistantMessages = turn.conversation.messages.filter(
      (message) => message.role === "assistant"
    );
    const retryPrompt = (
      (chatBodies[1] as { messages?: Array<{ content?: string }> } | undefined)
        ?.messages ?? []
    )
      .map((message) => message.content ?? "")
      .join("\n");

    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(chatBodies.length, 2);
    assert.equal(assistantMessages.length, 1);
    assert.equal(assistantMessages[0]?.botId, ALICE.id);
    assert.equal(
      assistantMessages[0]?.content,
      "I’d test the smallest risky assumption first."
    );
    assert.match(retryPrompt, /previous draft contained only punctuation/i);
  });

  it("retries an off-topic opening once with an explicit topic anchor", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-topic-opening";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Why SpongeBob wins without trying",
      coffeeSettings: { stayOnThread: true },
    });
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "unused",
      () =>
        processCoffeeAutonomousTurn(
          db,
          userId,
          session.conversation.id,
          { preferredProvider: "local", sessionRemainingMs: 120_000 },
          false,
          ALICE.id,
        ),
      {
        chatBodies,
        chatReplies: [
          "Curtains frame the room, and the lamp makes every shadow feel deliberate.",
          "SpongeBob wins because he treats the work as play instead of a contest.",
        ],
      },
    );

    const retryPrompt = (
      (chatBodies[1] as { messages?: Array<{ content?: string }> } | undefined)
        ?.messages ?? []
    )
      .map((message) => message.content ?? "")
      .join("\n");
    assert.equal(chatBodies.length, 2);
    assert.match(retryPrompt, /Stay on the table topic/u);
    assert.match(retryPrompt, /Why SpongeBob wins without trying/u);
    assert.match(
      turn.conversation.messages.at(-1)?.content ?? "",
      /SpongeBob|wins|contest/u,
    );
  });

  it("uses the topic-aware fallback when the one topic retry still drifts", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-topic-fallback";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Why SpongeBob wins without trying",
      coffeeSettings: { stayOnThread: true },
    });
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "unused",
      () =>
        processCoffeeAutonomousTurn(
          db,
          userId,
          session.conversation.id,
          { preferredProvider: "local", sessionRemainingMs: 120_000 },
          false,
          ALICE.id,
        ),
      {
        chatBodies,
        chatReplies: [
          "Curtains frame the room, and the lamp makes every shadow feel deliberate.",
          "The rug needs another color before anyone can settle in.",
        ],
      },
    );

    const reply = turn.conversation.messages.at(-1)?.content ?? "";
    assert.equal(chatBodies.length, 2);
    assert.equal(
      coffeeReplyNeedsTopicAnchor({
        coffeeTopic: "Why SpongeBob wins without trying",
        candidate: reply,
        recentAssistantMessages: [],
        openingTurn: true,
        stayOnThread: true,
        activePoll: false,
        deterministicResponse: false,
      }),
      false,
    );
  });

  it("uses a visible fallback after one punctuation-only retry", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const chatBodies: unknown[] = [];

    const turn = await withMockedCoffeeFetch(
      "unused",
      () =>
        processCoffeeTurn(
          db,
          userId,
          {
            conversationId: session.conversation.id,
            message: "[Alice](prism-bot://bot-alice), give us one concrete test.",
          },
          { preferredProvider: "local", sessionRemainingMs: 120_000 }
        ),
      {
        chatBodies,
        chatReplies: ["…", "..."],
      }
    );

    const reply = turn.conversation.messages.find(
      (message) => message.role === "assistant"
    )?.content ?? "";
    assert.equal(turn.speakerBotId, ALICE.id);
    assert.equal(chatBodies.length, 2);
    assert.ok(reply.length > 0);
    assert.equal(coffeeReplyIsPunctuationOnly(reply), false);
  });

  it("keeps the original multi-mention prompt as focus for chained directed turns", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const prompt =
      "[Alice](prism-bot://bot-alice) and [Boris](prism-bot://bot-boris), haven't you guys gone to Weenie Hut General?";

    const firstTurn = await withMockedCoffeeFetch("Alice answers the shared question first.", () =>
      processCoffeeTurn(
        db,
        userId,
        {
          conversationId: session.conversation.id,
          message: prompt,
          directedSpeakerBotId: ALICE.id,
        },
        { preferredProvider: "local", sessionRemainingMs: 120_000 }
      )
    );
    const chatBodies: unknown[] = [];

    await withMockedCoffeeFetch(
      "Boris answers the same shared question second.",
      () =>
        processCoffeeAutonomousTurn(
          db,
          userId,
          firstTurn.conversation.id,
          { preferredProvider: "local", sessionRemainingMs: 120_000 },
          false,
          BORIS.id,
          prompt
        ),
      { chatBodies }
    );
    const promptMessages =
      (chatBodies[0] as { messages?: Array<{ content?: string }> } | undefined)?.messages ?? [];
    const promptText = promptMessages.map((message) => message.content ?? "").join("\n");

    assert.match(promptText, /directly addressed multiple bots/);
    assert.match(promptText, /Weenie Hut General/);
    assert.match(promptText, /Boris, say your next short table line now/);
  });
});

describe("Coffee stale autonomous guard helpers", () => {
  it("keeps spoken assistant turns with mood replay metadata in bot prompt history", () => {
    assert.equal(
      coffeeMessageBelongsInBotPromptHistory({
        role: "assistant",
        content: "A real table line.",
        coffeeReplayEvents: [{ kind: "mood" }],
      }),
      true
    );
    assert.equal(
      coffeeMessageBelongsInBotPromptHistory({
        role: "system",
        content: "",
        coffeeReplayEvents: [{ kind: "mood" }],
      }),
      false
    );
    assert.equal(
      coffeeMessageBelongsInBotPromptHistory({ role: "assistant", content: "..." }),
      false,
      "structured interruption pause beats must not become model dialogue"
    );
    assert.equal(
      coffeeMessageBelongsInBotPromptHistory({
        role: "assistant",
        content: "One bar? This is—",
      }),
      false,
      "interrupted cutoff fragments must not seed later bot replies",
    );
  });

  it("detects when a newer message lands after an autonomous turn starts", () => {
    const db = createCoffeeTestDb();
    const userId = "stale-user";
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id,
          coffee_duration_minutes, coffee_preset_id, coffee_topic, coffee_meeting_summary,
          coffee_meeting_summary_message_count, coffee_meeting_summary_updated_at, incognito, created_at, updated_at)
       VALUES (?, ?, 'Coffee Session', 'coffee', NULL, ?, NULL, NULL, 5, NULL, 'Power', NULL, NULL, NULL, 0, ?, ?)`
    ).run("conv-stale", userId, JSON.stringify([ALICE.id, BORIS.id]), now, now);
    const assistantPayload = serializeAssistantToolPayload({
      coffeeReplayEvents: [
        {
          v: 1,
          name: "coffeeReplayEvent",
          kind: "mood",
          botId: ALICE.id,
          occurredAt: now,
          social: {
            disposition: 0.5,
            valuesFriction: 0.2,
            restraint: 0.6,
            engagement: 0.7,
            leavePressure: 0.1,
          },
        },
      ],
    });
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("m1", "conv-stale", userId, "assistant", "First line.", assistantPayload, now);

    assert.equal(coffeeLatestMessageIdChanged(db, userId, "conv-stale", "m1"), false);

    const actionPayload = serializeAssistantToolPayload({
      coffeeUserAction: {
        v: 1,
        name: "coffeeUserAction",
        source: "user",
        action: "leans back and smiles faintly",
        occurredAt: "2026-01-01T00:00:01.000Z",
      },
    });
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "action-1",
      "conv-stale",
      userId,
      "user",
      "*leans back and smiles faintly*",
      actionPayload,
      "2026-01-01T00:00:01.000Z"
    );
    assert.equal(coffeeLatestMessageIdChanged(db, userId, "conv-stale", "m1"), false);

    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("m2", "conv-stale", userId, "user", "Actually, Vader?", "2026-01-01T00:00:02.000Z");

    assert.equal(coffeeLatestMessageIdChanged(db, userId, "conv-stale", "m1"), true);
  });
});

describe("coffee social state helpers", () => {
  it("clamps social values to the 0-1 range", () => {
    assert.equal(clampCoffeeSocialValue(-0.25), 0);
    assert.equal(clampCoffeeSocialValue(1.25), 1);
    assert.equal(clampCoffeeSocialValue(0.42), 0.42);
  });

  it("initializes missing bot snapshots from defaults", () => {
    const state = initializeCoffeeSocialState([ALICE, BORIS], {
      [ALICE.id]: {
        disposition: 0.75,
        valuesFriction: 0.1,
        restraint: 0.45,
        engagement: 0.8,
        leavePressure: 0.2,
      },
    });
    assert.deepEqual(state[ALICE.id], {
      disposition: 0.75,
      valuesFriction: 0.1,
      restraint: 0.45,
      engagement: 0.8,
      leavePressure: 0.2,
    });
    assert.deepEqual(state[BORIS.id], {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    });
  });

  it("applies fresh session-start mood bias without seeding guarded or strained moods", () => {
    const base = initializeCoffeeSocialState([ALICE, BORIS, CARA], {
      [CARA.id]: {
        disposition: 0.12,
        valuesFriction: 0.86,
        restraint: 0.65,
        engagement: 0.16,
        leavePressure: 0.82,
      },
    });
    const rolls = [0.1, 0.4, 0.9];
    const biased = applyCoffeeSessionStartMoodBias({
      group: [ALICE, BORIS, CARA],
      socialByBotId: base,
      random: () => rolls.shift() ?? 0.9,
    });

    assert.equal(coffeeTestMoodKey(biased[ALICE.id]!), "joyful");
    assert.equal(coffeeTestMoodKey(biased[BORIS.id]!), "warm");
    assert.match(coffeeTestMoodKey(biased[CARA.id]!), /^(neutral|warm|joyful)$/);
    assert.ok(
      coffeeMoodSaturationFromSocial(biased[ALICE.id]!) >
        coffeeMoodSaturationFromSocial(base[ALICE.id]!)
    );
    assert.ok(
      coffeeMoodSaturationFromSocial(biased[BORIS.id]!) >
        coffeeMoodSaturationFromSocial(base[BORIS.id]!)
    );
    assert.equal(biased[ALICE.id]!.restraint, base[ALICE.id]!.restraint);
    assert.equal(biased[BORIS.id]!.restraint, base[BORIS.id]!.restraint);
  });

  it("updates speaker and non-speakers deterministically", () => {
    const previous = initializeCoffeeSocialState([ALICE, BORIS], {});
    const next = computeNextCoffeeSocialState({
      previousByBotId: previous,
      group: [ALICE, BORIS],
      speakerBotId: BORIS.id,
      turnKind: "user",
      replyText: "I would rather not go there. Let's move on.",
    });
    assert.ok(next[BORIS.id]!.valuesFriction > previous[BORIS.id]!.valuesFriction);
    assert.ok(next[BORIS.id]!.restraint > previous[BORIS.id]!.restraint);
    assert.ok(next[BORIS.id]!.engagement > previous[BORIS.id]!.engagement);
    assert.ok(next[ALICE.id]!.engagement < previous[ALICE.id]!.engagement);
  });

  it("patches Coffee debug social state and returns the hydrated conversation", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    const conversation = updateCoffeeBotSocialDebug(
      db,
      userId,
      created.conversation.id,
      ALICE.id,
      {
        disposition: 1.4,
        friction: -0.4,
        restraint: 0.44,
        engagement: 0.88,
        leavePressure: 0.22,
      }
    );

    assert.deepEqual(conversation.coffeeBotSocialById?.[ALICE.id], {
      disposition: 1,
      valuesFriction: 0,
      restraint: 0.44,
      engagement: 0.88,
      leavePressure: 0.22,
    });
    const replayMessage = conversation.messages.find(
      (message) => message.coffeeReplayEvents?.some((event) => event.kind === "mood")
    );
    assert.equal(replayMessage?.role, "system");
    assert.equal(replayMessage?.content, "");
    assert.equal(replayMessage?.coffeeReplayEvents?.[0]?.kind, "mood");
  });

  it("records Coffee arrival replay events as hidden transcript rows", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    const conversation = recordCoffeeReplayEvents(db, userId, created.conversation.id, {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "arrival",
      botId: ALICE.id,
      occurredAt: "2026-07-02T15:00:00.000Z",
      walkDurationMs: 3200,
      nameplateDelayMs: 3800,
    });

    assert.equal(conversation.messages.length, 1);
    assert.equal(conversation.messages[0]?.role, "system");
    assert.equal(conversation.messages[0]?.content, "");
    assert.deepEqual(conversation.messages[0]?.coffeeReplayEvents, [
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "arrival",
        botId: ALICE.id,
        occurredAt: "2026-07-02T15:00:00.000Z",
        walkDurationMs: 3200,
        nameplateDelayMs: 3800,
      },
    ]);

    recordCoffeeReplayEvents(db, userId, created.conversation.id, {
      v: 1,
      name: "coffeeReplayEvent",
      kind: "arrival",
      botId: ALICE.id,
      occurredAt: "2026-07-02T15:00:01.000Z",
    });
    const transcript = getCoffeeConversationTranscript(db, userId, created.conversation.id);
    assert.equal(
      transcript.filter((message) =>
        message.coffeeReplayEvents?.some((event) => event.kind === "arrival")
      ).length,
      1
    );
  });

  it("records player departure once and counts bounded epilogue turns after it", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    assert.throws(
      () => recordCoffeePlayerDeparture(db, userId, created.conversation.id),
      /no table dialogue/i
    );

    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ('player-action-only', ?, ?, 'user', '*adjusts chair*', '2026-07-02T14:59:59.000Z')`
    ).run(created.conversation.id, userId);
    assert.throws(
      () => recordCoffeePlayerDeparture(db, userId, created.conversation.id),
      /no table dialogue/i
    );

    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ('player-line', ?, ?, 'user', 'I have to run.', '2026-07-02T15:00:00.000Z')`
    ).run(created.conversation.id, userId);

    const first = recordCoffeePlayerDeparture(db, userId, created.conversation.id);
    assert.equal(first.recorded, true);
    assert.equal(first.completedTurns, 0);
    assert.ok(first.targetTurns >= 2 && first.targetTurns <= 4);
    assert.equal(
      first.targetTurns,
      coffeePlayerDepartureEpilogueTurnCount(created.conversation.id)
    );
    const departureMessages = first.conversation.messages.filter((message) =>
      message.coffeeReplayEvents?.some((event) => event.kind === "playerDeparture")
    );
    assert.equal(departureMessages.length, 1);
    assert.equal(departureMessages[0]?.role, "system");
    assert.equal(departureMessages[0]?.botId ?? null, null);

    const duplicate = recordCoffeePlayerDeparture(db, userId, created.conversation.id);
    assert.equal(duplicate.recorded, false);
    assert.equal(
      duplicate.conversation.messages.filter((message) =>
        message.coffeeReplayEvents?.some((event) => event.kind === "playerDeparture")
      ).length,
      1
    );

    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES ('epilogue-1', ?, ?, 'assistant', 'Safe travels.', ?, '2026-07-02T15:02:00.000Z')`
    ).run(created.conversation.id, userId, ALICE.id);
    assert.equal(
      recordCoffeePlayerDeparture(db, userId, created.conversation.id).completedTurns,
      1
    );

    assert.throws(
      () => recordCoffeePlayerDeparture(db, "user-2", created.conversation.id),
      /not found/i
    );
  });

  it("records one final physical departure for every bot still seated after the wrap", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-final-departures";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    seedCoffeeBot(db, userId, CARA);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id, CARA.id],
    });
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ('player-goodbye', ?, ?, 'user', 'Catch you all later.', '2026-07-02T15:00:00.000Z')`,
    ).run(created.conversation.id, userId);
    recordCoffeePlayerDeparture(db, userId, created.conversation.id);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES ('closing-line', ?, ?, 'assistant', 'Good night, everyone.', ?, '2026-07-02T15:00:01.000Z')`,
    ).run(created.conversation.id, userId, ALICE.id);

    assert.equal(
      recordCoffeeFinalBotDepartureReplayEvents(
        db,
        userId,
        created.conversation.id,
      ),
      3,
    );
    assert.equal(
      recordCoffeeFinalBotDepartureReplayEvents(
        db,
        userId,
        created.conversation.id,
      ),
      0,
    );
    const departures = getCoffeeConversationTranscript(
      db,
      userId,
      created.conversation.id,
    ).flatMap((message) =>
      (message.coffeeReplayEvents ?? []).filter(
        (event) => event.kind === "botDeparture",
      ),
    );
    assert.deepEqual(
      departures.map((event) =>
        event.kind === "botDeparture"
          ? [event.botId, event.seatIndex]
          : null,
      ),
      [
        [ALICE.id, 0],
        [BORIS.id, 1],
        [CARA.id, 2],
      ],
    );
  });

  it("backfills final bot departures for an already-summarized saved session", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-final-departure-backfill";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ('player-goodbye-backfill', ?, ?, 'user', 'Goodbye, everyone.', '2026-07-02T16:00:00.000Z')`,
    ).run(created.conversation.id, userId);
    recordCoffeePlayerDeparture(db, userId, created.conversation.id);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES ('closing-line-backfill', ?, ?, 'assistant', 'Take care.', ?, '2026-07-02T16:00:01.000Z')`,
    ).run(created.conversation.id, userId, ALICE.id);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ('synopsis-backfill', ?, ?, 'system', 'Session synopsis: The table shared a brief farewell before everyone headed home.', '2026-07-02T16:00:02.000Z')`,
    ).run(created.conversation.id, userId);

    const finalized = await generateCoffeeSessionSynopsis(
      db,
      userId,
      created.conversation.id,
      { preferredProvider: "local" },
    );
    const departures = finalized.messages.flatMap((message) =>
      (message.coffeeReplayEvents ?? []).filter(
        (event) => event.kind === "botDeparture",
      ),
    );
    assert.deepEqual(
      departures.map((event) =>
        event.kind === "botDeparture"
          ? [event.botId, event.seatIndex]
          : null,
      ),
      [
        [ALICE.id, 0],
        [BORIS.id, 1],
      ],
    );
  });

  it("acknowledges departure once, resumes the topic, and closes the epilogue", () => {
    const first = coffeePlayerDepartureEpilogueFocus(0, 4, "Jared");
    const middle = coffeePlayerDepartureEpilogueFocus(1, 4);
    const final = coffeePlayerDepartureEpilogueFocus(3, 4);
    assert.match(first, /human player, Jared/i);
    assert.match(first, /acknowledgment of the player's departure/i);
    assert.match(middle, /continue the topic naturally/i);
    assert.match(middle, /may gracefully excuse themself/i);
    assert.match(middle, /keep dwelling on the departure/i);
    assert.doesNotMatch(middle, /acknowledgment of the player's departure/i);
    assert.match(final, /natural final beat/i);
    assert.match(final, /without addressing the absent player/i);
  });

  it("ends a player-departure epilogue only after two natural closing turns", () => {
    assert.equal(
      coffeePlayerDepartureEpilogueShouldStop({
        completedTurns: 1,
        targetTurns: 4,
        replyText: "Good night, everyone.",
        speakerDeparted: true,
        remainingBotCount: 2,
      }),
      false
    );
    assert.equal(
      coffeePlayerDepartureEpilogueShouldStop({
        completedTurns: 2,
        targetTurns: 4,
        replyText: "Take care, everyone. I should get going.",
        speakerDeparted: true,
        remainingBotCount: 2,
      }),
      true
    );
    assert.equal(
      coffeePlayerDepartureEpilogueShouldStop({
        completedTurns: 2,
        targetTurns: 4,
        replyText: "Should we keep talking?",
        speakerDeparted: false,
        remainingBotCount: 2,
      }),
      false
    );
    assert.equal(
      coffeePlayerDepartureEpilogueShouldStop({
        completedTurns: 4,
        targetTurns: 4,
        replyText: "One last concrete thought.",
        speakerDeparted: false,
        remainingBotCount: 2,
      }),
      true
    );
  });

  it("tops off a seated bot cup and nudges social mood", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    await setCoffeeConversationTopic(db, userId, created.conversation.id, "Refill ritual");
    const socialBefore = created.conversation.coffeeBotSocialById?.[ALICE.id];

    const conversation = topOffCoffeeCupForBot(
      db,
      userId,
      created.conversation.id,
      ALICE.id,
      0.62
    );

    const topOff = conversation.coffeeCupTopOffsByBotId?.[ALICE.id];
    assert.equal(topOff?.progressBefore, 0.62);
    assert.equal(topOff?.progressAfter, 0.04);
    assert.ok(topOff?.toppedOffAt);
    const assertSocialValue = (actual: number | undefined, expected: number) => {
      assert.ok(typeof actual === "number");
      assert.ok(Math.abs(actual - expected) < 0.000001);
    };
    const expectedDisposition = clampCoffeeSocialValue(
      (socialBefore?.disposition ?? 0.5) + 0.1
    );
    const expectedEngagement = clampCoffeeSocialValue(
      (socialBefore?.engagement ?? 0.65) + 0.12
    );
    const expectedLeavePressure = clampCoffeeSocialValue(
      (socialBefore?.leavePressure ?? 0.1) - 0.08
    );
    const social = conversation.coffeeBotSocialById?.[ALICE.id];
    assertSocialValue(social?.disposition, expectedDisposition);
    assertSocialValue(social?.engagement, expectedEngagement);
    assertSocialValue(social?.leavePressure, expectedLeavePressure);
    assert.ok(
      conversation.messages.some((message) =>
        message.coffeeReplayEvents?.some(
          (event) =>
            event.kind === "topOff" &&
            event.botId === ALICE.id &&
            event.progressBefore === 0.62 &&
            event.progressAfter === 0.04
        )
      )
    );
    const moodReplayEvent = conversation.messages
      .flatMap((message) => message.coffeeReplayEvents ?? [])
      .find((event) => event.kind === "mood" && event.botId === ALICE.id);
    assert.ok(moodReplayEvent);
    if (moodReplayEvent.kind !== "mood") {
      assert.fail("Expected a top-off mood replay event.");
    }
    assertSocialValue(moodReplayEvent.social.disposition, expectedDisposition);
    assertSocialValue(moodReplayEvent.social.engagement, expectedEngagement);
    assertSocialValue(moodReplayEvent.social.leavePressure, expectedLeavePressure);

    const row = db
      .prepare(
        "SELECT progress_before, progress_after FROM coffee_cup_top_offs WHERE user_id = ? AND conversation_id = ? AND bot_id = ?"
      )
      .get(userId, created.conversation.id, ALICE.id) as
      | { progress_before: number; progress_after: number }
      | undefined;
    assert.deepEqual(row ? { ...row } : row, {
      progress_before: 0.62,
      progress_after: 0.04,
    });
  });

  it("stores interrupted Coffee cup top-offs at the released fill level", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    await setCoffeeConversationTopic(db, userId, created.conversation.id, "Refill ritual");

    const conversation = topOffCoffeeCupForBot(
      db,
      userId,
      created.conversation.id,
      ALICE.id,
      0.82,
      0.38
    );

    const topOff = conversation.coffeeCupTopOffsByBotId?.[ALICE.id];
    assert.equal(topOff?.progressBefore, 0.82);
    assert.equal(topOff?.progressAfter, 0.38);
  });

  it("rejects top-offs for full cups, unseated bots, and other users", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    await setCoffeeConversationTopic(db, userId, created.conversation.id, "Refill ritual");

    assert.throws(
      () => topOffCoffeeCupForBot(db, userId, created.conversation.id, ALICE.id, 0.08),
      /already full/i
    );
    assert.throws(
      () => topOffCoffeeCupForBot(db, userId, created.conversation.id, "not-seated", 0.62),
      /not seated/i
    );
    assert.throws(
      () => topOffCoffeeCupForBot(db, "user-2", created.conversation.id, ALICE.id, 0.62),
      /not found/i
    );
  });

  it("never exposes a refill target for a coffee-refusing bot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "No coffee",
    });
    db.prepare(
      "UPDATE conversations SET coffee_power_plan_json = ? WHERE id = ? AND user_id = ?",
    ).run(
      JSON.stringify({
        version: 1,
        resolvedAt: "2026-07-21T00:00:00.000Z",
        warnings: [],
        bots: {
          [ALICE.id]: {
            botId: ALICE.id,
            powerIds: ["dislikes-coffee"],
            selfCue: "You dislike coffee and do not drink it.",
            observerCue: "Alice refuses coffee.",
            visibleToBotIds: null,
            speechAudienceBotIds: null,
            effects: [{ type: "cup_rate", rate: "none" }],
            ruleLabels: ["Refuses coffee"],
            warnings: [],
          },
        },
      }),
      created.conversation.id,
      userId,
    );

    assert.throws(
      () => topOffCoffeeCupForBot(
        db,
        userId,
        created.conversation.id,
        ALICE.id,
        0.62,
      ),
      /does not take coffee/i,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM coffee_cup_top_offs WHERE conversation_id = ? AND bot_id = ?",
      ).get(created.conversation.id, ALICE.id)?.count,
      0,
    );
  });

  it("never lets a legacy ambient waiter top off an eligible bot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "Conversation cadence",
    });
    const conversationId = created.conversation.id;
    const sixMinutesAgo = new Date(Date.now() - 6 * 60_000).toISOString();
    const withCupSettings = normalizeCoffeeSessionSettings({
      barRitual: {
        version: 1,
        serviceBot: { id: "legacy-waiter", name: "Waiter", fallback: true },
        role: "cup",
        drink: "house",
        liveStartedAt: sixMinutesAgo,
        visitStartedAtByBotId: {
          [ALICE.id]: sixMinutesAgo,
          [BORIS.id]: sixMinutesAgo,
        },
      },
    });
    const ritual = withCupSettings.barRitual;
    assert.ok(ritual);
    db.prepare(
      "UPDATE conversations SET coffee_settings = ?, coffee_power_plan_json = ? WHERE id = ? AND user_id = ?",
    ).run(
      JSON.stringify({
        ...withCupSettings,
        barRitual: {
          ...ritual,
          liveStartedAt: sixMinutesAgo,
          hardStopAt: new Date(Date.now() + 24 * 60_000).toISOString(),
          visitStartedAtByBotId: {
            [ALICE.id]: sixMinutesAgo,
            [BORIS.id]: sixMinutesAgo,
          },
        },
      }),
      JSON.stringify({
        version: 1,
        resolvedAt: "2026-07-21T00:00:00.000Z",
        warnings: [],
        bots: {
          [ALICE.id]: {
            botId: ALICE.id,
            powerIds: ["dislikes-coffee"],
            selfCue: "You dislike coffee and do not drink it.",
            observerCue: "Alice refuses coffee.",
            visibleToBotIds: null,
            speechAudienceBotIds: null,
            effects: [{ type: "cup_rate", rate: "none" }],
            ruleLabels: ["Refuses coffee"],
            warnings: [],
          },
        },
      }),
      conversationId,
      userId,
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`,
    );
    for (let index = 0; index < 4; index += 1) {
      insertMessage.run(
        `waiter-prior-${index}`,
        conversationId,
        userId,
        `Prior table reply ${index + 1}.`,
        index % 2 === 0 ? ALICE.id : BORIS.id,
        new Date(Date.now() - (4 - index) * 1_000).toISOString(),
      );
    }

    await withMockedCoffeeFetch(
      "That distinction gives us something practical to test.",
      () => processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        { preferredProvider: "local", sessionRemainingMs: null },
        false,
        BORIS.id,
      ),
    );

    const settingsRow = db.prepare(
      "SELECT coffee_settings FROM conversations WHERE id = ? AND user_id = ?",
    ).get(conversationId, userId) as { coffee_settings: string };
    const nextSettings = parseStoredCoffeeSessionSettings(settingsRow.coffee_settings);
    assert.equal(nextSettings.barRitual?.lastBotWaiterVisit, null);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM coffee_cup_top_offs WHERE conversation_id = ? AND bot_id = ?",
      ).get(conversationId, BORIS.id) as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM coffee_cup_top_offs WHERE conversation_id = ? AND bot_id = ?",
      ).get(conversationId, ALICE.id) as { count: number }).count,
      0,
    );
    const transcript = getCoffeeConversationTranscript(db, userId, conversationId);
    assert.equal(transcript.filter((message) => message.role === "assistant").length, 5);
    assert.doesNotMatch(
      transcript.map((message) => message.content).join("\n"),
      /waiter|top(?:ped)? off|refill/i,
    );
  });

  it.skip("keeps the legacy no-vessel hidden visit clock compatible", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialTopic: "A visit winding down",
    });
    const conversationId = created.conversation.id;
    const withCup = chooseCoffeeHouseDrink(db, userId, conversationId);
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString();
    const now = new Date().toISOString();
    const ritual = withCup.coffeeSettings?.barRitual;
    assert.ok(ritual);
    db.prepare(
      "UPDATE conversations SET coffee_settings = ?, coffee_power_plan_json = ? WHERE id = ? AND user_id = ?",
    ).run(
      JSON.stringify({
        ...withCup.coffeeSettings,
        barRitual: {
          ...ritual,
          liveStartedAt: elevenMinutesAgo,
          hardStopAt: new Date(Date.now() + 19 * 60_000).toISOString(),
          visitStartedAtByBotId: {
            [ALICE.id]: elevenMinutesAgo,
            [BORIS.id]: elevenMinutesAgo,
          },
        },
      }),
      JSON.stringify({
        version: 1,
        resolvedAt: now,
        warnings: [],
        bots: {
          [ALICE.id]: {
            botId: ALICE.id,
            powerIds: ["dislikes-coffee"],
            selfCue: "You dislike coffee and do not drink it.",
            observerCue: "Alice refuses coffee.",
            visibleToBotIds: null,
            speechAudienceBotIds: null,
            effects: [{ type: "cup_rate", rate: "none" }],
            ruleLabels: ["Refuses coffee"],
            warnings: [],
          },
        },
      }),
      conversationId,
      userId,
    );
    db.prepare(
      `INSERT INTO coffee_cup_top_offs
         (user_id, conversation_id, bot_id, progress_before, progress_after, topped_off_at, updated_at)
       VALUES (?, ?, ?, 0.8, 0.04, ?, ?)`,
    ).run(userId, conversationId, BORIS.id, now, now);
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES ('visit-prior', ?, ?, 'assistant', 'We have already made one concrete distinction.',
               'local', NULL, ?, NULL, ?)`,
    ).run(conversationId, userId, ALICE.id, elevenMinutesAgo);

    let farewell: Awaited<ReturnType<typeof processCoffeeAutonomousTurn>> | null = null;
    for (let index = 0; index < 3; index += 1) {
      const turn = await withMockedCoffeeFetch(
        "I would keep testing the distinction before deciding.",
        () => processCoffeeAutonomousTurn(
          db,
          userId,
          conversationId,
          { preferredProvider: "local", sessionRemainingMs: null },
          false,
          BORIS.id,
        ),
      );
      if (turn.speakerBotId === ALICE.id) {
        farewell = turn;
        break;
      }
    }

    assert.ok(farewell, "the no-vessel farewell fuse should fire within three replies");
    const farewellText = farewell.conversation.messages.at(-1)?.content ?? "";
    assert.equal(coffeeReplySignalsPoliteDeparture(farewellText), true);
    assert.doesNotMatch(farewellText, /coffee|cup|mug|refill|hidden clock|system rule/i);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM coffee_cup_top_offs WHERE conversation_id = ? AND bot_id = ?",
      ).get(conversationId, ALICE.id) as { count: number }).count,
      0,
    );
  });

  it("undoes the latest Coffee debug message and restores the pre-turn social snapshot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const created = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const conversationId = created.conversation.id;
    const beforeSocial = {
      [ALICE.id]: {
        disposition: 0.61,
        valuesFriction: 0.2,
        restraint: 0.5,
        engagement: 0.7,
        leavePressure: 0.08,
      },
      [BORIS.id]: {
        disposition: 0.44,
        valuesFriction: 0.4,
        restraint: 0.7,
        engagement: 0.6,
        leavePressure: 0.12,
      },
    };
    const afterSocial = {
      [ALICE.id]: {
        disposition: 0.9,
        valuesFriction: 0.05,
        restraint: 0.3,
        engagement: 0.95,
        leavePressure: 0.02,
      },
      [BORIS.id]: {
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.55,
        leavePressure: 0.16,
      },
    };
    db.prepare(
      `UPDATE coffee_bot_social_state
          SET disposition = ?, values_friction = ?, restraint = ?, engagement = ?, leave_pressure = ?
        WHERE user_id = ? AND conversation_id = ? AND bot_id = ?`
    ).run(0.9, 0.05, 0.3, 0.95, 0.02, userId, conversationId, ALICE.id);
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, ?, ?)`
    ).run(
      "debug-assistant-1",
      conversationId,
      userId,
      "A debug turn changed the table mood.",
      ALICE.id,
      JSON.stringify({
        v: 1,
        coffeeDebugTurnSnapshot: {
          v: 1,
          name: "coffeeDebugTurnSnapshot",
          beforeSocialByBotId: beforeSocial,
          afterSocialByBotId: afterSocial,
          beforeConversation: {
            botGroupIds: JSON.stringify([ALICE.id, BORIS.id]),
            coffeeAbsentBotIds: "[]",
            coffeeTeamModeJson: null,
          },
          speakerBotId: ALICE.id,
          createdAt: now,
        },
      }),
      now
    );

    const result = undoLatestCoffeeDebugMessage(db, userId, conversationId);

    assert.equal(result.deletedMessages, 1);
    assert.deepEqual(result.messageIds, ["debug-assistant-1"]);
    assert.equal(result.conversation.messages.length, 0);
    assert.deepEqual(result.conversation.coffeeBotSocialById?.[ALICE.id], beforeSocial[ALICE.id]);
    assert.deepEqual(result.conversation.coffeeBotSocialById?.[BORIS.id], beforeSocial[BORIS.id]);
  });

  it("offers an infrequent low-cup refill request only on suitable autonomous turns", () => {
    const nowMs = Date.parse("2026-01-01T00:02:00.000Z");
    const social = {
      disposition: 1,
      valuesFriction: 0.2,
      restraint: 0,
      engagement: 1,
      leavePressure: 0.1,
    };
    const opportunityFor = (id: string, history: ChatMessage[]) =>
      buildCoffeeRefillRequestOpportunity({
        conversationId: "conv-refill",
        speaker: { id, name: "Guest" },
        seatBotIds: [id, "peer", null, null, null],
        history,
        social,
        turnKind: "autonomous",
        sessionRemainingMs: 90_000,
        durationMinutes: 10,
        nowMs,
      });
    const historyFor = (id: string): ChatMessage[] => [
      {
        id: `${id}-1`,
        role: "assistant",
        botId: id,
        botName: "Guest",
        content: "One concrete thought.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: `${id}-2`,
        role: "assistant",
        botId: id,
        botName: "Guest",
        content: "Another concrete thought.",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ];

    const selected = opportunityFor("bot-1", historyFor("bot-1"));
    assert.match(selected ?? "", /cup is running low/i);
    assert.match(selected ?? "", /fits your personality/i);
    assert.match(selected ?? "", /fresh wording/i);

    const selectedCount = Array.from({ length: 100 }, (_, index) => {
      const id = `bot-${index}`;
      return opportunityFor(id, historyFor(id));
    }).filter(Boolean).length;
    assert.ok(selectedCount > 0);
    assert.ok(selectedCount < 30, `expected infrequent requests, got ${selectedCount}/100`);
  });

  it("suppresses refill requests after a recent request, a top-off, or during busy turns", () => {
    const id = "bot-1";
    const nowMs = Date.parse("2026-01-01T00:02:00.000Z");
    const history: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        botId: id,
        botName: "Guest",
        content: "One concrete thought.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "m2",
        role: "assistant",
        botId: id,
        botName: "Guest",
        content: "Another concrete thought.",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ];
    const base = {
      conversationId: "conv-refill",
      speaker: { id, name: "Guest" },
      seatBotIds: [id, "peer", null, null, null],
      history,
      social: {
        disposition: 1,
        valuesFriction: 0.2,
        restraint: 0,
        engagement: 1,
        leavePressure: 0.1,
      },
      turnKind: "autonomous" as const,
      sessionRemainingMs: 90_000,
      durationMinutes: 10 as const,
      nowMs,
    };

    assert.notEqual(buildCoffeeRefillRequestOpportunity(base), null);
    assert.equal(
      buildCoffeeRefillRequestOpportunity({
        ...base,
        history: [
          ...history,
          {
            id: "peer-request",
            role: "assistant",
            botId: "peer",
            botName: "Peer",
            content: "Could I get a refill when you have a moment?",
            createdAt: "2026-01-01T00:01:30.000Z",
          },
        ],
      }),
      null,
    );
    assert.equal(
      buildCoffeeRefillRequestOpportunity({
        ...base,
        coffeeCupTopOff: {
          progressBefore: 0.86,
          progressAfter: 0.04,
          toppedOffAt: new Date(nowMs).toISOString(),
        },
      }),
      null,
    );
    assert.equal(
      buildCoffeeRefillRequestOpportunity({ ...base, turnKind: "user" }),
      null,
    );
    assert.equal(
      buildCoffeeRefillRequestOpportunity({ ...base, activePoll: true }),
      null,
    );
    assert.equal(
      buildCoffeeRefillRequestOpportunity({ ...base, sessionRemainingMs: 30_000 }),
      null,
    );
    assert.equal(
      buildCoffeeRefillRequestOpportunity({ ...base, history: history.slice(0, 1) }),
      null,
    );
  });

  it("threads the refill opportunity into the speaker prompt without forcing a turn", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Keep going.",
      socialByBotId: {},
      turnKind: "autonomous",
      refillRequestOpportunity:
        "Optional small refill beat: ask briefly only if it fits this exact moment.",
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Optional small refill beat/);
    assert.match(joined, /only if it fits this exact moment/);
  });

  it("offers empty-cup departure only after meaningful participation", () => {
    const seatBotIds = [ALICE.id, BORIS.id, CARA.id, null, null];
    const participatedHistory: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        botName: ALICE.name,
        content: "I think the question needs one more careful distinction.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const opportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-depart-0",
      speaker: ALICE,
      seatBotIds,
      history: participatedHistory,
      social: {
        disposition: 0.54,
        valuesFriction: 0.3,
        restraint: 0.7,
        engagement: 0.38,
        leavePressure: 0.72,
      },
      sessionRemainingMs: 1,
      durationMinutes: 10,
      emptyCupAttemptCount: 2,
      emptyCupMaxAttempts: 2,
    });

    assert.match(opportunity ?? "", /empty mug 2 times/i);
    assert.match(opportunity ?? "", /politely leave/i);
    assert.equal(
      buildCoffeeDepartureOpportunity({
        conversationId: "conv-depart-0",
        speaker: ALICE,
        seatBotIds,
        history: [],
        social: {
          disposition: 0.54,
          valuesFriction: 0.3,
          restraint: 0.7,
          engagement: 0.38,
          leavePressure: 0.72,
        },
        sessionRemainingMs: 1,
        durationMinutes: 10,
        emptyCupAttemptCount: 2,
        emptyCupMaxAttempts: 2,
      }),
      null
    );
    assert.equal(
      buildCoffeeDepartureOpportunity({
        conversationId: "conv-depart-0",
        speaker: ALICE,
        seatBotIds,
        history: participatedHistory,
        social: {
          disposition: 0.54,
          valuesFriction: 0.3,
          restraint: 0.7,
          engagement: 0.38,
          leavePressure: 0.72,
        },
        sessionRemainingMs: null,
        durationMinutes: 10,
        emptyCupAttemptCount: 2,
        emptyCupMaxAttempts: 2,
      }),
      null
    );
    assert.equal(
      buildCoffeeDepartureOpportunity({
        conversationId: "conv-depart-0",
        speaker: ALICE,
        seatBotIds: [ALICE.id, BORIS.id, null, null, null],
        history: participatedHistory,
        social: {
          disposition: 0.54,
          valuesFriction: 0.3,
          restraint: 0.7,
          engagement: 0.38,
          leavePressure: 0.72,
        },
        sessionRemainingMs: 1,
        durationMinutes: 10,
        emptyCupAttemptCount: 2,
        emptyCupMaxAttempts: 2,
      }),
      null
    );
    assert.equal(
      buildCoffeeDepartureOpportunity({
        conversationId: "conv-depart-0",
        speaker: ALICE,
        seatBotIds,
        history: participatedHistory,
        social: {
          disposition: 0.54,
          valuesFriction: 0.3,
          restraint: 0.7,
          engagement: 0.38,
          leavePressure: 0.72,
        },
        sessionRemainingMs: 1,
        durationMinutes: 10,
        emptyCupAttemptCount: 1,
        emptyCupMaxAttempts: 2,
      }),
      null,
    );
  });

  it("leans empty-cup departure by departure chance, not mood alone", () => {
    const seatBotIds = [ALICE.id, BORIS.id, CARA.id, null, null];
    const participatedHistory: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        botName: ALICE.name,
        content: "I can still see both sides of this.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const stableMood = {
      disposition: 0.82,
      valuesFriction: 0.2,
      restraint: 0.62,
      engagement: 0.74,
      leavePressure: 0.12,
    };
    const leavingMood = {
      ...stableMood,
      leavePressure: 0.9,
    };

    assert.ok(
      coffeeDepartureChanceFromSocial(leavingMood) >
        coffeeDepartureChanceFromSocial(stableMood)
  );
  assert.ok(
    coffeeMoodSaturationFromSocial(leavingMood) >=
      coffeeMoodSaturationFromSocial(stableMood) - 0.02
  );

    const stayingOpportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-depart-0",
      speaker: ALICE,
      seatBotIds,
      history: participatedHistory,
      social: stableMood,
      sessionRemainingMs: 1,
      durationMinutes: 10,
      emptyCupAttemptCount: 3,
      emptyCupMaxAttempts: 3,
    });
    const leavingOpportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-depart-0",
      speaker: ALICE,
      seatBotIds,
      history: participatedHistory,
      social: leavingMood,
      sessionRemainingMs: 1,
      durationMinutes: 10,
      emptyCupAttemptCount: 3,
      emptyCupMaxAttempts: 3,
    });

    assert.match(stayingOpportunity ?? "", /ride out the remaining session/i);
    assert.match(leavingOpportunity ?? "", /natural chance to excuse yourself/i);
  });

  it("offers departure when social mood is nearly desaturated", () => {
    const seatBotIds = [ALICE.id, BORIS.id, CARA.id, null, null];
    const participatedHistory: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        botName: ALICE.name,
        content: "I have tried to say this plainly already.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const opportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-depart-0",
      speaker: ALICE,
      seatBotIds,
      history: participatedHistory,
      social: {
        disposition: 0.12,
        valuesFriction: 0.88,
        restraint: 0.7,
        engagement: 0.16,
        leavePressure: 0.92,
      },
      sessionRemainingMs: 5 * 60 * 1000,
      durationMinutes: 10,
    });

    assert.match(opportunity ?? "", /nearly colorless/i);
    assert.match(opportunity ?? "", /must gracefully leave/i);
    assert.equal(coffeeDepartureOpportunityRequiresExit(opportunity), true);
    const firstTurnOpportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-depart-0",
      speaker: ALICE,
      seatBotIds,
      history: [],
      social: {
        disposition: 0.12,
        valuesFriction: 0.88,
        restraint: 0.7,
        engagement: 0.16,
        leavePressure: 0.92,
      },
      sessionRemainingMs: null,
      durationMinutes: 10,
    });
    assert.match(firstTurnOpportunity ?? "", /required exit beat/i);
    assert.equal(coffeeDepartureOpportunityRequiresExit(firstTurnOpportunity), true);
  });

  it("detects graceful departure replies without treating staying as leaving", () => {
    assert.equal(
      coffeeReplySignalsPoliteDeparture(
        "*stands and pushes chair back* Thank you for the coffee; I should get going."
      ),
      true
    );
    assert.equal(
      coffeeReplySignalsPoliteDeparture(
        "The coffee is gone, but this conversation still has my attention."
      ),
      false
    );
    assert.equal(
      coffeeReplySignalsPoliteDeparture(
        "*sets the cup aside* I need to leave the table."
      ),
      true
    );
    const forced = buildCoffeeRequiredDepartureReply({
      speaker: ALICE,
      conversationId: "conv-rage-quit-0",
      historyLength: 0,
      maxChars: 240,
    });
    assert.equal(coffeeReplySignalsPoliteDeparture(forced), true);
  });

  it("applies one cumulative mood hit for each realized empty-cup attempt", () => {
    const baseline = {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    };
    const first = applyCoffeeEmptyCupMoodHits(baseline, 1);
    const third = applyCoffeeEmptyCupMoodHits(baseline, 3);

    assert.ok(first.disposition < baseline.disposition);
    assert.ok(first.engagement < baseline.engagement);
    assert.ok(first.leavePressure > baseline.leavePressure);
    assert.ok(third.disposition < first.disposition);
    assert.ok(third.engagement < first.engagement);
    assert.ok(third.leavePressure > first.leavePressure);
  });

  it("ends the table only after multiple bots have given up and disengaged", () => {
    const socialByBotId = {
      [ALICE.id]: applyCoffeeEmptyCupMoodHits({
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      }, 2),
      [BORIS.id]: applyCoffeeEmptyCupMoodHits({
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      }, 3),
    };
    assert.equal(
      coffeeEmptyCupGroupShouldWrap({
        stateByBotId: {
          [ALICE.id]: { realizedAttemptCount: 2, maxAttempts: 2 },
          [BORIS.id]: { realizedAttemptCount: 2, maxAttempts: 3 },
        },
        socialByBotId,
      }),
      false,
    );
    assert.equal(
      coffeeEmptyCupGroupShouldWrap({
        stateByBotId: {
          [ALICE.id]: { realizedAttemptCount: 2, maxAttempts: 2 },
          [BORIS.id]: { realizedAttemptCount: 3, maxAttempts: 3 },
        },
        socialByBotId,
      }),
      true,
    );

    const opportunity = buildCoffeeDepartureOpportunity({
      conversationId: "conv-wrap-empty-cups",
      speaker: ALICE,
      seatBotIds: [ALICE.id, BORIS.id, null, null, null],
      history: [],
      social: socialByBotId[ALICE.id],
      groupShouldWrap: true,
    });
    assert.equal(coffeeDepartureOpportunityRequiresWrap(opportunity), true);
    const forced = buildCoffeeRequiredSessionWrapReply({
      speaker: ALICE,
      conversationId: "conv-wrap-empty-cups",
      historyLength: 8,
      maxChars: 240,
    });
    assert.equal(coffeeReplySignalsSessionWrap(forced), true);
    assert.equal(coffeeReplySignalsPoliteDeparture(forced), false);
  });

  it("injects social guardrail context into speaker prompts", () => {
    const prompts = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: {
          disposition: 0.4,
          valuesFriction: 0.8,
          restraint: 0.85,
          engagement: 0.5,
          leavePressure: 0.4,
        },
        [BORIS.id]: {
          disposition: 0.6,
          valuesFriction: 0.2,
          restraint: 0.5,
          engagement: 0.7,
          leavePressure: 0.1,
        },
      },
    });
    const combined = prompts.map((prompt) => prompt.content).join("\n");
    assert.match(combined, /Hidden social metrics for this moment/i);
    assert.match(combined, /Avoid insults or hostile escalation/i);
  });
});

describe("computePlayerInterruptionConsequences", () => {
  it("builds interrupted snippets from display prose, not markdown or stage actions", () => {
    const snippet = interruptedSnippetFromTokenCount(
      "[Plankton](prism-bot://bot-plankton), *glances around the table* The interesting part is what everyone is dodging.",
      3
    );

    assert.equal(snippet, "Plankton, The intere—");
  });

  it("does not stack an interruption dash onto an existing em-dash turn", () => {
    const snippet = interruptedSnippetFromTokenCount(
      "A business that bleeds money does that because it started bleeding—somewhere.",
      11
    );

    assert.equal(snippet, "A business that bleeds money does that because it started bleeding—");
  });

  it("applies stronger deltas to interrupted bot and light third-party friction", () => {
    const socialByBotId = {
      [ALICE.id]: {
        disposition: 0.58,
        valuesFriction: 0.3,
        restraint: 0.78,
        engagement: 0.7,
        leavePressure: 0.12,
      },
      [BORIS.id]: {
        disposition: 0.46,
        valuesFriction: 0.52,
        restraint: 0.4,
        engagement: 0.63,
        leavePressure: 0.2,
      },
      [CARA.id]: {
        disposition: 0.6,
        valuesFriction: 0.2,
        restraint: 0.8,
        engagement: 0.6,
        leavePressure: 0.15,
      },
    };

    const consequences = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 12,
      group: [ALICE, BORIS, CARA],
      socialByBotId,
    });

    assert.equal(consequences.length, 3);
    const interrupted = consequences.find((entry) => entry.botId === BORIS.id);
    assert.ok(interrupted);
    assert.ok((interrupted?.dispositionDelta ?? 0) < 0);
    assert.ok((interrupted?.valuesFrictionDelta ?? 0) > 0);
    const others = consequences.filter((entry) => entry.botId !== BORIS.id);
    assert.ok(others.every((entry) => entry.valuesFrictionDelta >= 0));
  });

  it("follows a mild-peak-mild bell curve across interruption progress", () => {
    const socialByBotId = {
      [ALICE.id]: {
        disposition: 0.58,
        valuesFriction: 0.3,
        restraint: 0.78,
        engagement: 0.7,
        leavePressure: 0.12,
      },
      [BORIS.id]: {
        disposition: 0.46,
        valuesFriction: 0.52,
        restraint: 0.4,
        engagement: 0.63,
        leavePressure: 0.2,
      },
      [CARA.id]: {
        disposition: 0.6,
        valuesFriction: 0.2,
        restraint: 0.8,
        engagement: 0.6,
        leavePressure: 0.15,
      },
    };
    const group = [ALICE, BORIS, CARA];
    const early = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 2,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const middle = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 10,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const late = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 18,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const interruptedEarly = early.find((entry) => entry.botId === BORIS.id);
    const interruptedMiddle = middle.find((entry) => entry.botId === BORIS.id);
    const interruptedLate = late.find((entry) => entry.botId === BORIS.id);
    assert.ok(interruptedEarly && interruptedMiddle && interruptedLate);
    assert.ok(Math.abs(interruptedMiddle.dispositionDelta) > Math.abs(interruptedEarly.dispositionDelta));
    assert.ok(Math.abs(interruptedMiddle.dispositionDelta) > Math.abs(interruptedLate.dispositionDelta));
    assert.ok(interruptedMiddle.valuesFrictionDelta > interruptedEarly.valuesFrictionDelta);
    assert.ok(interruptedMiddle.valuesFrictionDelta > interruptedLate.valuesFrictionDelta);
    const thirdPartyEarly = early.find((entry) => entry.botId === ALICE.id);
    const thirdPartyMiddle = middle.find((entry) => entry.botId === ALICE.id);
    const thirdPartyLate = late.find((entry) => entry.botId === ALICE.id);
    assert.ok(thirdPartyEarly && thirdPartyMiddle && thirdPartyLate);
    assert.ok(thirdPartyMiddle.valuesFrictionDelta > thirdPartyEarly.valuesFrictionDelta);
    assert.ok(thirdPartyMiddle.valuesFrictionDelta > thirdPartyLate.valuesFrictionDelta);
  });
});

describe("maybeBuildBotInterruptionEvent", () => {
  const socialByBotId = {
    [ALICE.id]: {
      disposition: 0.5,
      valuesFriction: 0.25,
      restraint: 0.72,
      engagement: 0.66,
      leavePressure: 0.2,
    },
    [BORIS.id]: {
      disposition: 0.39,
      valuesFriction: 0.9,
      restraint: 0.08,
      engagement: 0.98,
      leavePressure: 0.22,
    },
  };

  it("returns undefined when autonomous-compose gate is not satisfied", () => {
    const noCompose = maybeBuildBotInterruptionEvent({
      turnKind: "autonomous",
      userIsComposing: false,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(noCompose, undefined);

    const wrongTurnKind = maybeBuildBotInterruptionEvent({
      turnKind: "user",
      userIsComposing: true,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(wrongTurnKind, undefined);
  });

  it("emits bounded interruption metadata for at least one deterministic seed", () => {
    let event: ReturnType<typeof maybeBuildBotInterruptionEvent> | undefined;
    for (let attempt = 0; attempt < 180 && !event; attempt += 1) {
      event = maybeBuildBotInterruptionEvent({
        turnKind: "autonomous",
        userIsComposing: true,
        speaker: BORIS,
        socialByBotId,
        group: [ALICE, BORIS],
        conversationId: `coffee-interrupt-${attempt}`,
        historyLength: 12,
      });
    }
    assert.ok(event, "expected at least one seed to produce a rare interruption");
    assert.equal(event?.kind, "botInterruptsPlayer");
    assert.equal(event?.interrupterBotId, BORIS.id);
    assert.ok((event?.socialConsequences.length ?? 0) >= 1);
  });

  it("makes pile-up sessions more interruptive than normal sessions", () => {
    const hitCountFor = (sessionSettings: ReturnType<typeof normalizeCoffeeSessionSettings>) => {
      let hits = 0;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const event = maybeBuildBotInterruptionEvent({
          turnKind: "autonomous",
          userIsComposing: true,
          speaker: BORIS,
          socialByBotId,
          group: [ALICE, BORIS],
          conversationId: `coffee-rate-${attempt}`,
          historyLength: 12,
          sessionSettings,
        });
        if (event) hits += 1;
      }
      return hits;
    };
    const normalHits = hitCountFor(
      normalizeCoffeeSessionSettings({ tableEnergy: "relaxed", crossTalk: "normal" })
    );
    const pileupHits = hitCountFor(
      normalizeCoffeeSessionSettings({ tableEnergy: "afterparty", crossTalk: "pileup" })
    );
    assert.ok(pileupHits > normalHits, `expected ${pileupHits} > ${normalHits}`);
  });

  it("scales bot interruption social deltas with bounded bell weighting", () => {
    const eventForPrefix = (prefix: string) => {
      for (let attempt = 0; attempt < 220; attempt += 1) {
        const event = maybeBuildBotInterruptionEvent({
          turnKind: "autonomous",
          userIsComposing: true,
          speaker: BORIS,
          socialByBotId,
          group: [ALICE, BORIS],
          conversationId: `${prefix}-${attempt}`,
          historyLength: 12,
        });
        if (event) return event;
      }
      return undefined;
    };
    const eventA = eventForPrefix("coffee-bell-a");
    assert.ok(eventA);
    const speakerA = eventA.socialConsequences.find((entry) => entry.botId === BORIS.id);
    assert.ok(speakerA);
    assert.ok(Math.abs(speakerA.dispositionDelta) <= 0.01);
    assert.ok(Math.abs(speakerA.dispositionDelta) >= 0.004);
    const softenedFound = (() => {
      for (let attempt = 0; attempt < 420; attempt += 1) {
        const event = maybeBuildBotInterruptionEvent({
          turnKind: "autonomous",
          userIsComposing: true,
          speaker: BORIS,
          socialByBotId,
          group: [ALICE, BORIS],
          conversationId: `coffee-bell-soft-${attempt}`,
          historyLength: 12,
        });
        if (!event) continue;
        const speaker = event.socialConsequences.find((entry) => entry.botId === BORIS.id);
        if (!speaker) continue;
        if (Math.abs(speaker.dispositionDelta) < 0.01) return true;
      }
      return false;
    })();
    assert.equal(softenedFound, true);
  });
});

describe("normalizeCoffeeSessionSettings", () => {
  it("returns defaults for non-objects and ignores invalid enums", () => {
    const defaults = normalizeCoffeeSessionSettings(undefined);
    assert.deepEqual(
      defaults,
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
    assert.equal(defaults.tableEnergy, "theatre");
    assert.equal(defaults.crossTalk, "chatty");
    assert.equal(defaults.responseDelayBias, 76);
    assert.equal(defaults.humanPacing, 50);
    assert.equal(defaults.givePlayerLastWord, false);
    assert.deepEqual(
      normalizeCoffeeSessionSettings({ responseLength: "huge", crossTalk: "loud" }),
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
  });

  it("clamps numeric sliders and preserves known enum values", () => {
    const s = normalizeCoffeeSessionSettings({
      responseLength: "detailed",
      responseDelayBias: -20,
      breathingRoom: 200,
      humanPacing: 140,
      tableEnergy: "afterparty",
      crossTalk: "pileup",
      stayOnThread: false,
    });
    assert.equal(s.responseLength, "detailed");
    assert.equal(s.responseDelayBias, 0);
    assert.equal(s.breathingRoom, 100);
    assert.equal(s.humanPacing, 100);
    assert.equal(s.tableEnergy, "afterparty");
    assert.equal(s.crossTalk, "pileup");
    assert.equal(s.stayOnThread, false);
  });

  it("normalizes session-only bar state and strips it from reusable settings", () => {
    const settings = normalizeCoffeeSessionSettings({
      barRitual: {
        version: 1,
        serviceBot: { id: "barista", name: "Boris", fallback: false },
        role: "cup",
        drink: "special",
        orderText: "  maple   cortado  ",
        clarificationUsed: true,
        generationAttemptId: "attempt-1",
        specialImageStatus: "ready",
        specialImageId: "image-1",
        playerCup: {
          fillId: "fill-1",
          filledAt: "2026-07-22T00:00:00.000Z",
          topOffCount: 1,
          sipCount: 2,
        },
        visitStartedAtByBotId: {
          "bot-alice": "2026-07-22T00:00:01.000Z",
        },
      },
    });
    assert.equal(settings.barRitual?.orderText, "maple cortado");
    assert.equal(settings.barRitual?.playerCup?.sipCount, 2);
    assert.equal(settings.barRitual?.version, 2);
    assert.equal(settings.barRitual?.frontBarista.name, "Boris");
    assert.equal(settings.barRitual?.serviceBot.name, "Boris");
    assert.equal(settings.barRitual?.workingBarista.name, "PRISM Barback");
    assert.equal(settings.barRitual?.deliveryStatus, "delivered");
    assert.equal(
      settings.barRitual?.visitStartedAtByBotId["bot-alice"],
      "2026-07-22T00:00:01.000Z",
    );
    assert.equal(coffeeReusableSessionSettings(settings).barRitual, undefined);
    assert.ok([2, 3].includes(coffeeFarewellReplyDelay("stable-seed")));
  });
});

describe("coffeeEffectiveReasoningEffort", () => {
  const social = {
    disposition: 0.5,
    valuesFriction: 0.25,
    restraint: 0.5,
    engagement: 0.6,
    leavePressure: 0.1,
  };

  it("adapts local and native reasoning turns without simulating online non-reasoning calls", () => {
    const base = { activePoll: null, coffeeTeams: null, social };
    assert.equal(
      coffeeEffectiveReasoningEffort({
        ...base,
        experimentEnabled: true,
        effectiveProvider: "local",
        tableFocus: "Tell me what happened?",
      }),
      "medium"
    );
    assert.equal(
      coffeeEffectiveReasoningEffort({
        ...base,
        experimentEnabled: true,
        effectiveProvider: "openai",
        modelId: "gpt-5.2",
        tableFocus: "Add a thought.",
      }),
      "low"
    );
    assert.equal(
      coffeeEffectiveReasoningEffort({
        ...base,
        experimentEnabled: true,
        effectiveProvider: "openai",
        modelId: "gpt-4o",
        tableFocus: "Add a thought.",
      }),
      undefined
    );
    assert.equal(
      coffeeEffectiveReasoningEffort({
        ...base,
        experimentEnabled: true,
        effectiveProvider: "anthropic",
        modelId: "claude-opus-4-8",
        tableFocus: "Add a thought.",
      }),
      "low"
    );
    assert.equal(
      coffeeEffectiveReasoningEffort({
        ...base,
        experimentEnabled: true,
        effectiveProvider: "anthropic",
        modelId: "claude-haiku-4-5",
        tableFocus: "Add a thought.",
      }),
      undefined
    );
  });

  it("keeps high effort explicit", () => {
    assert.equal(
      coffeeEffectiveReasoningEffort({
        requested: "high",
        experimentEnabled: true,
        effectiveProvider: "openai",
        modelId: "gpt-4o",
        tableFocus: "Anything.",
        activePoll: null,
        coffeeTeams: null,
        social,
      }),
      "high"
    );
  });
});

describe("coffeeReplyLengthCaps", () => {
  it("maps presets to bounded caps", () => {
    const brief = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "brief" }));
    assert.deepEqual(brief, { tableReplyMaxChars: 60, speakerMaxOutputTokens: 72 });
    const balanced = coffeeReplyLengthCaps(
      normalizeCoffeeSessionSettings({ responseLength: "balanced" })
    );
    assert.deepEqual(balanced, { tableReplyMaxChars: 110, speakerMaxOutputTokens: 104 });
    const roomy = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "roomy" }));
    assert.deepEqual(roomy, { tableReplyMaxChars: 220, speakerMaxOutputTokens: 180 });
  });

  it("keeps enough Coffee decode room even when a bot profile cap is tiny", () => {
    assert.equal(coffeeSpeakerMaxTokensForTurn(24, 104), 96);
    assert.equal(coffeeSpeakerMaxTokensForTurn(128, 180), 128);
    assert.equal(coffeeSpeakerMaxTokensForTurn(512, 180), 180);
  });

  it("expands Coffee completion room for OpenAI reasoning-style chat models", () => {
    assert.equal(
      coffeeSpeakerMaxTokensForTurn(24, 104, {
        effectiveProvider: "openai",
        modelId: "gpt-5-mini",
      }),
      384
    );
    assert.equal(
      coffeeSpeakerMaxTokensForTurn(24, 104, {
        effectiveProvider: "openai",
        modelId: "gpt-5-mini",
        reasoningEffort: "high",
      }),
      640
    );
    assert.equal(
      coffeeSpeakerMaxTokensForTurn(24, 104, {
        effectiveProvider: "openai",
        modelId: "gpt-4o-mini",
      }),
      96
    );
  });

  it("keeps reasoning room for GPT-5.6 Luna repair passes", () => {
    assert.equal(
      coffeeRepairMaxTokensForTurn({
        providerName: "openai",
        modelId: "gpt-5.6-luna",
        speakerMaxTokens: 384,
      }),
      384
    );
    assert.equal(
      coffeeRepairMaxTokensForTurn({
        providerName: "openai",
        modelId: "gpt-5.6-luna",
        reasoningEffort: "high",
        speakerMaxTokens: 384,
      }),
      640
    );
    assert.equal(
      coffeeRepairMaxTokensForTurn({
        providerName: "openai",
        modelId: "gpt-4o-mini",
        speakerMaxTokens: 104,
      }),
      48
    );
  });
});

describe("coffeeRouterTemperature", () => {
  it("stays within a modest band for extreme delay bias", () => {
    const cold = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 0 }));
    const hot = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 100 }));
    assert.ok(cold >= 0.05 && cold <= 0.45);
    assert.ok(hot >= 0.05 && hot <= 0.45);
    assert.ok(hot > cold);
  });
});

describe("buildCoffeeTableTuningAppendix", () => {
  it("reflects cross-talk and stay-on-thread modes", () => {
    const rare = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "rare", stayOnThread: false })
    );
    assert.match(rare, /one clear voice at a time/i);
    assert.match(rare, /Topic shifts are allowed only when they visibly bridge/i);
    assert.match(rare, /never introduce a premise as though the table already said it/i);

    const chatty = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "chatty", stayOnThread: true })
    );
    assert.match(chatty, /riffing is welcome/i);
    assert.match(chatty, /Discourage hard topic jumps/i);

    const pileup = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ tableEnergy: "afterparty", crossTalk: "pileup" })
    );
    assert.match(pileup, /brief interruptions/i);
    assert.match(pileup, /overcaffeinated/i);

    const pileupRouter = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Start.",
      lastSpeakerBotId: BORIS.id,
      sessionSettings: normalizeCoffeeSessionSettings({ crossTalk: "pileup" }),
    });
    assert.match(
      pileupRouter.map((message) => message.content).join("\n"),
      /immediate interruption or rebuttal/i,
    );
  });
});

describe("autoTagPeerMentionsInCoffeeReply", () => {
  it("upgrades a bare peer name into an attention mention", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "I think Boris is overreacting.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "I think [Boris](prism-bot://bot-boris) is overreacting.");
  });

  it("upgrades an @-prefixed peer name", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "@Cara, what do you think?",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "[Cara](prism-bot://bot-cara), what do you think?");
  });

  it("never tags the speaker themselves", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Alice here. @Boris, your move.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.match(out, /^Alice here\./);
    assert.match(out, /\[Boris\]\(prism-bot:\/\/bot-boris\)/);
  });

  it("leaves text inside an existing prism-bot link untouched", () => {
    const original = "[Boris](prism-bot://bot-boris) said it best — Boris is right.";
    const out = autoTagPeerMentionsInCoffeeReply(original, ALICE, [ALICE, BORIS, CARA]);
    assert.equal(
      out,
      "[Boris](prism-bot://bot-boris) said it best — [Boris](prism-bot://bot-boris) is right."
    );
  });

  it("does not split a peer name that is part of a longer word", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Borisland is not a place.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "Borisland is not a place.");
  });

  it("folds possessive suffixes after the attention mention", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Boris's point still lands.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "[Boris](prism-bot://bot-boris)'s point still lands.");
  });

  it("returns the input unchanged when no peers match", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Just talking to myself here.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "Just talking to myself here.");
  });

  it("tags @mentions that use learned preferred labels", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "@Dr. Freud, what do you think?",
      ALICE,
      [ALICE, BORIS, CARA],
      new Map([[BORIS.id, "Dr. Freud"]])
    );
    assert.equal(out, "[Dr. Freud](prism-bot://bot-boris), what do you think?");
  });
});

function coffeeTestPromptWithProfile(
  overrides: Partial<{
    communicationStyle: "neutral" | "warm" | "concise" | "playful" | "formal";
    birthEra: "ad" | "bc";
    deceased: boolean;
    basedOnRealPersonOrCharacter: boolean;
  }>
): string {
  const fields = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
  if (overrides.communicationStyle) {
    fields.core.communicationStyle = overrides.communicationStyle;
  }
  if (overrides.birthEra) fields.facts.birthEra = overrides.birthEra;
  if (typeof overrides.deceased === "boolean") fields.facts.deceased = overrides.deceased;
  if (typeof overrides.basedOnRealPersonOrCharacter === "boolean") {
    fields.facts.basedOnRealPersonOrCharacter = overrides.basedOnRealPersonOrCharacter;
  }
  return serializeStoredBotPrompt(fields);
}

describe("coffee character-authored imperfection guidance", () => {
  it("threads persona-aware transitional guidance into the speaker prompt", () => {
    const formalSpeaker: CoffeeBotProfile = {
      ...ALICE,
      systemPrompt: coffeeTestPromptWithProfile({
        communicationStyle: "formal",
        birthEra: "bc",
        deceased: true,
        basedOnRealPersonOrCharacter: true,
      }),
    };
    const formalMessages = buildSpeakerPrompt({
      speaker: formalSpeaker,
      group: [formalSpeaker, BORIS],
      history: [],
      userMessage: "What is virtue?",
      socialByBotId: {},
    });
    assert.match(formalMessages[1]!.content, /Never add modern filler that breaks character/);
    assert.doesNotMatch(formalMessages[1]!.content, /kind of wild/);

    const playfulSpeaker: CoffeeBotProfile = {
      ...BORIS,
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "playful" }),
    };
    const playfulMessages = buildSpeakerPrompt({
      speaker: playfulSpeaker,
      group: [playfulSpeaker, ALICE],
      history: [],
      userMessage: "Who wants snacks?",
      socialByBotId: {},
    });
    assert.match(playfulMessages[1]!.content, /suits your playful voice/);
  });
});
