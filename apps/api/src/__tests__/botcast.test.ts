import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_DEFAULT_CAMERA_FRAMING,
  BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS,
  BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS,
  BOTCAST_PRODUCER_GUEST_ID,
  BOTCAST_PRODUCER_GUEST_NAME,
  DIRECTIONAL_IRRITATION_REBUFF_DELTA,
  DIRECTIONAL_IRRITATION_RECLAIM_CEILING,
  SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
  applyBotPowerCursedTongueResponseV1,
  applyBotPowerMumbledResponseV1,
  botPowerResponseIsSilentV1,
  botPowerResponseHasAddressedInsultV1,
  botPowerSourceHashV1,
  botcastAutoCameraLeadInMs,
  composeBotcastProducerDirectQuoteUtterance,
  botcastConsecutiveSocialSilenceTurns,
  botcastDirectionalIrritationEdgesFromEvents,
  botcastPendingCrosstalkReclaimV1,
  botcastProducerGuestThinkingDiscountMs,
  botcastFallbackStudioAccentVariantForSeed,
  botcastReplayTimeline,
  createBotIdentityMirrorStateV1,
  createBotFalseNameStateV1,
  crosstalkInterruptionIsMeaningfulV1,
  directionalIrritationEdgeKey,
  planStageActionV1,
  readDirectionalIrritationIntensity,
  serializeBotAudioVoiceProfileV1,
  signalPicklesTriggerMessageCount,
} from "@localai/shared";

import {
  BOTCAST_HOST_CALL_AFTER_DEPARTURE_PERCENT,
  SignalLocalTurnTimeoutError,
  SignalOnlineTurnError,
  advanceBotcastEpisode,
  backfillMissingCompletedBotcastPairHistory,
  buildBotcastAudienceReviewArtifactV1,
  buildBotcastSpeakerPrompt,
  botcastFalseNameStatesV1,
  botcastIdentityMirrorCanTriggerV1,
  botcastIdentityMirrorStatesV1,
  botcastIdentityShapeshiftStatesV1,
  botcastRoutingSnapshot,
  botcastGuestClaimsSilentHostSpoke,
  botcastHostClaimsSilentGuestAnswered,
  botcastHostClosingHasFormalThanks,
  botcastLatestQuietHearingHeardV1,
  botcastClosingReopenUtterancesV1,
  botcastDeterministicHostClosingV1,
  botcastHostCallsAfterDepartingGuest,
  botcastCrosstalkFloorOutcomeV1,
  botcastPlanDirectionalIrritationForMeaningfulCutoffV1,
  botcastPreparedTurnCursor,
  botcastPowerInterruptionPlanV1,
  botcastPowerInterruptedContentV1,
  botcastSocialSilenceChanceV1,
  botcastUtteranceClaimsSignalHistory,
  cancelBotcastEpisode,
  chatWithBotcastShowHost,
  createBotcastEpisode,
  createBotcastShow,
  deleteBotcastEpisode,
  deleteBotcastShow,
  deleteBotcastShowIntroAudio,
  endBotcastEpisodeOnProducerCut,
  ensureBotcastEpisodePersonaReview,
  forceEndBotcastEpisode,
  generateBotcastBookingSuggestion,
  generateBotcastDirectedBooking,
  generateBotcastProducerGuestBooking,
  generateBotcastRefractDraft,
  generateBotcastShowAtmosphere,
  generateBotcastShowDashboardBlurbs,
  generateBotcastShowIdentity,
  generateBotcastShowLogoThesis,
  generateBotcastShowMusicIdentity,
  generateBotcastShowName,
  generateBotcastShowPremise,
  getBotcastEpisode,
  getBotcastShow,
  listBotcastShows,
  listBotcastEpisodes,
  loadBotcastPairHistoryContext,
  nextBotcastFallbackStudioAccentVariant,
  parseBotcastPersonaReviewResponse,
  persistCompletedBotcastPairHistory,
  projectBotcastEpisodeForAudienceV1,
  projectBotcastEpisodeForObserverV2,
  readBotcastShowAtmosphereAudio,
  readBotcastShowIntroAudio,
  readBotcastShowOutdentAudio,
  recordBotcastAudioCue,
  recordBotcastRoutingSnapshot,
  recordBotcastSoundboardCue,
  refreshBotcastShowLocalIdent,
  resolveBotcastProducerGuestName,
  runSignalLocalTurn,
  runSignalOnlineTurn,
  setBotcastEpisodeCameraMode,
  setBotcastModelWarmupHold,
  recordBotcastSessionClockHold,
  signalAutoFallbackHttpStatus,
  signalAutoFallbackPublicMessage,
  signalOnlineTurnHttpStatus,
  selectBotcastReviewPersona,
  signalVisualOnlyListenerReaction,
  storeBotcastShowAtmosphereAudio,
  storeBotcastShowIntroAudio,
  type SignalOnlineTurnAttemptV1,
  undoBotcastShowAudioPackage,
  updateBotcastShow,
} from "../botcast.ts";
import { AutoFallbackExhaustedError } from "../auto-fallback.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { loadBotMemoryPanelPayload } from "../bot-memory-panel.ts";
import { initializeDatabase, readBotRelationship } from "../db.ts";
import { readGlobalBotMood } from "../bot-global-mood.ts";
import {
  restoreMemory,
  retrieveBotPairNarrativeMemories,
} from "../memory.ts";
import {
  materializeShortTermMemoryDecay,
  recordRelationshipProjectionBase,
} from "../memory-ecology.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "../providers.ts";

const TEST_SIGNAL_MUSIC_IDENTITY =
  "Forensic control interrupted by one suspicious turn: muted trumpet and felt piano over a measured geometric pulse, questioning chromatic harmony, dry close-miked texture, and an exact evidence-stamp button ending.";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'botcast@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    "host-1",
    "Mara Vale",
    "A forensic cultural critic who asks precise questions and dislikes canned answers.",
    "#a355e8",
    "waves",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    "guest-1",
    "Ivo Stone",
    "A guarded inventor who resists personal speculation and warns people before walking away.",
    "#3aa9a1",
    "radio",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
  return db;
}

function recordingProvider(
  lines: string[],
  captures: ProviderMessage[][],
  models: Array<string | undefined> = [],
  optionCaptures: GenerateOptions[] = [],
): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages, options) {
      captures.push(messages);
      models.push(options.model);
      optionCaptures.push(options);
      return lines.shift() ?? "A concise in-character answer.";
    },
    async embedText() {
      return [];
    },
  };
}

function generation(provider: LlmProvider) {
  return {
    preferredProvider: "local" as const,
    providerFactory: (() => provider) as typeof selectProvider,
    signalSocialSilenceChanceOverride: 0,
  };
}

function insertBotcastTestEvent(
  db: DatabaseSync,
  episodeId: string,
  kind: string,
  payload: Record<string, unknown>,
): void {
  const sequence = (
    db.prepare(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM botcast_events WHERE episode_id = ?",
    ).get(episodeId) as { next: number }
  ).next;
  db.prepare(
    `INSERT INTO botcast_events
      (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, ?)`,
  ).run(
    `event-${episodeId}-${sequence}`,
    episodeId,
    sequence,
    kind,
    JSON.stringify(payload),
    "2026-08-09T17:44:24.499Z",
  );
}

function completeBotcastTestEpisodeWithWalkout(
  db: DatabaseSync,
  episodeId: string,
): void {
  const messages = [
    {
      id: `host-message-${episodeId}`,
      role: "host",
      botId: "host-1",
      content: "I keep cutting in because the premise still has a hole.",
    },
    {
      id: `guest-message-${episodeId}`,
      role: "guest",
      botId: "guest-1",
      content: "I warned you. We are done here.",
    },
  ] as const;
  for (const message of messages) {
    db.prepare(
      `INSERT INTO botcast_messages
        (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
       VALUES (?, 'user-1', ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      episodeId,
      message.role,
      message.botId,
      message.content,
      "2026-08-09T17:44:24.499Z",
    );
    insertBotcastTestEvent(db, episodeId, "utterance", {
      messageId: message.id,
      speakerRole: message.role,
      botId: message.botId,
      segment: "interview",
      ...(message.role === "guest"
        ? {
            powerOutcome: {
              effect: "interruption",
              interruptedBotId: "guest-1",
              interruptingBotId: "host-1",
            },
          }
        : {}),
    });
  }
  insertBotcastTestEvent(db, episodeId, "irritation", {
    transition: {
      v: 1,
      name: "directionalIrritation",
      transitionId: `max-irritation-${episodeId}`,
      reason: "meaningful_cutoff",
      subjectBotId: "guest-1",
      targetBotId: "host-1",
      before: 0.7941,
      after: 1,
      delta: 0.2059,
      tier: "high",
      occurredAt: "2026-08-09T17:44:24.499Z",
    },
  });
  insertBotcastTestEvent(db, episodeId, "departure", {
    botId: "guest-1",
    speakerRole: "guest",
    cause: "repeated_power_interruptions",
    emptyChair: true,
    microphoneRemains: true,
    mugRemains: true,
  });
  db.prepare(
    `UPDATE botcast_episodes
        SET status = 'completed', outcome = 'guest_departed',
            completed_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    "2026-08-09T17:44:24.499Z",
    "2026-08-09T17:44:24.499Z",
    episodeId,
  );
  insertBotcastTestEvent(db, episodeId, "episode_completed", {
    outcome: "guest_departed",
    runtimeMs: 90_000,
  });
}

function completeBotcastTestEpisode(
  db: DatabaseSync,
  episodeId: string,
): void {
  const completedAt = new Date().toISOString();
  db.prepare(
    `UPDATE botcast_episodes
        SET status = 'completed', outcome = 'completed',
            completed_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(completedAt, completedAt, episodeId);
  insertBotcastTestEvent(db, episodeId, "episode_completed", {
    outcome: "completed",
    runtimeMs: 90_000,
  });
}

it("requires the final Signal beat to thank both guest and audience", () => {
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "The record is clear. Ivo Stone, thank you for joining me. Thank you for watching.",
      "Ivo Stone",
    ),
    true,
  );
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "The record is clear. Ivo Stone, thank you for joining me.",
      "Ivo Stone",
    ),
    false,
  );
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "The record is clear. Thank you for watching.",
      "Ivo Stone",
    ),
    false,
  );
  // The established short address counts: after twenty turns of "Benny", a
  // close thanking "Benny" must not be rejected for omitting the full name —
  // that rejection cascaded through every model and forced the deterministic
  // fallback line onto an otherwise healthy closing beat.
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "That's our show. Thanks for sittin' with me, Benny. Thank you all for watching.",
      "Bigoted Benny",
    ),
    true,
  );
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "That's our show. Thanks, Stone, for the straight answers. Thank you for listening.",
      "Ivo Stone",
    ),
    true,
  );
  // Only the distinctive final word is an accepted short form.
  assert.equal(
    botcastHostClosingHasFormalThanks(
      "That's our show. Thanks, Bigoted, whoever ye are. Thank you for watching.",
      "Bigoted Benny",
    ),
    false,
  );
});

it("reads the latest quiet-hearing outcome per speaker-listener pair", () => {
  const events = [
    {
      kind: "power_effect" as const,
      payload: {
        effect: "quiet_hearing",
        sourceBotId: "host-1",
        sourceMessageId: "m1",
        listenerBotId: "guest-1",
        heard: true,
      },
    },
    {
      kind: "power_effect" as const,
      payload: {
        effect: "quiet_hearing",
        sourceBotId: "host-1",
        sourceMessageId: "m2",
        listenerBotId: "guest-1",
        heard: false,
      },
    },
  ];
  // The most recent roll for the pair wins; the fairness valve uses a `false`
  // here to force the host's repeat to land instead of rolling fifty-fifty
  // again, so consecutive misses can never stack past one.
  assert.equal(
    botcastLatestQuietHearingHeardV1(events, "host-1", "guest-1"),
    false,
  );
  assert.equal(
    botcastLatestQuietHearingHeardV1(events, "host-1", "guest-2"),
    null,
  );
  assert.equal(
    botcastLatestQuietHearingHeardV1(events.slice(0, 1), "host-1", "guest-1"),
    true,
  );
});

function generatedDashboardBlurbs(prefix: string): string[] {
  return Array.from(
    { length: 24 },
    (_, index) => `${prefix} ${index + 1}: the easy answer has left the room.`,
  );
}

function generatedHostRecoveryQuestions(prefix = "Evidence"): string[] {
  return [
    `${prefix} first: which concrete example would actually test that claim?`,
    `${prefix} the consequence: who has to live with what follows?`,
    `${prefix} the choice: where does principle become a real tradeoff?`,
    `${prefix} the contradiction: what proof would make you reconsider?`,
  ];
}

function insertSignalReviewPersona(
  db: DatabaseSync,
  id: string,
  name: string,
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, '#6cc4b7', 'spark', 1, ?, ?)`,
  ).run(
    id,
    name,
    `${name} is an exacting listener with a distinctive point of view.`,
    createdAt,
    createdAt,
  );
}

function invisibleGuestPowers(): string {
  const powers = [
    {
      version: 1,
      id: "invisible",
      name: "Invisible",
      intent: "Only Light Yagami can perceive this bot.",
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(
          "Invisible",
          "Only Light Yagami can perceive this bot.",
        ),
        selfCue: "Remain imperceptible to everyone except Light Yagami.",
        observerCue: "Only Light Yagami can perceive this guest.",
        effects: [
          {
            type: "awareness",
            allowed: [{ kind: "bot", name: "Light Yagami" }],
          },
        ],
        ruleLabels: ["Perceived only by Light Yagami"],
      },
    },
    {
      version: 1,
      id: "introvert",
      name: "Introvert",
      intent: "Only Light Yagami can hear this bot.",
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(
          "Introvert",
          "Only Light Yagami can hear this bot.",
        ),
        selfCue: "Speak only where Light Yagami can hear.",
        observerCue: "Only Light Yagami can hear this guest.",
        effects: [
          {
            type: "speech_audience",
            allowed: [{ kind: "bot", name: "Light Yagami" }],
          },
        ],
        ruleLabels: ["Heard only by Light Yagami"],
      },
    },
  ];
  return JSON.stringify(powers);
}

function intimidatingGuestPowers(): string {
  const name = "Intimidation";
  const intent = "Strikes fear in other bots.";
  return JSON.stringify([
    {
      version: 1,
      id: "intimidation",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue:
          "Project quiet, disciplined menace without demanding that others describe their fear.",
        observerCue:
          "Darth Vader's controlled presence creates immediate pressure; let it register without abandoning your personality or role.",
        effects: [
          {
            type: "social_influence",
            trigger: "session_start",
            polarity: "negative",
            strength: "large",
            targets: [{ kind: "all" }],
          },
        ],
        ruleLabels: ["Intimidates the room"],
      },
    },
  ]);
}

function joyfulHostPowers(muted = false): string {
  const name = "Radiant Joy";
  const intent = "After every completed spoken turn, lift each addressed listener's mood once without changing their personality or agency.";
  const powers = [{
    version: 1,
    id: "joyful-nora",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Radiate unmistakable joy without denying serious stakes.",
      observerCue: "Addressed listeners feel one bounded lift through their own personality.",
      effects: [{
        type: "mood_boost",
        trigger: "after_spoken_turn",
        recipients: "addressed",
        strength: "medium",
      }],
      ruleLabels: ["Radiant joy"],
    },
  }];
  if (muted) {
    const muteName = "Mute";
    const muteIntent = "Never speaks.";
    powers.push({
      version: 1,
      id: "mute",
      name: muteName,
      intent: muteIntent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(muteName, muteIntent),
        selfCue: "Never speak.",
        observerCue: "Nora cannot speak.",
        effects: [{ type: "mute" }],
        ruleLabels: ["Muted"],
      },
    });
  }
  return JSON.stringify(powers);
}

function sadGuestPowers(): string {
  const name = "Sad";
  const intent = "Whenever another bot directly talks to Sad Sally, lower that addresser's mood or motivation by one bounded step without changing its personality or agency.";
  return JSON.stringify([{
    version: 1,
    id: "sad-sally",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Remain persistently sad, grouchy, and irritating without cruelty.",
      observerCue: "Bots that directly speak to Sally lose one bounded mood step.",
      effects: [{
        type: "mood_drain",
        trigger: "after_direct_address",
        recipient: "addresser",
        strength: "medium",
      }],
      ruleLabels: ["Drains direct addresser mood"],
    },
  }]);
}

function nocturnalHostPowers(): string {
  const name = "Nocturnal";
  const intent = "In Light Mode this bot is sad and drains bots that speak to it. In Dark Mode it radiates joy and uplifts addressed bots.";
  return JSON.stringify([{
    version: 1,
    id: "nocturnal",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Follow the current resolved theme.",
      observerCue: "Light is sad; Dark is joyful.",
      effects: [
        {
          type: "mood_boost",
          trigger: "after_spoken_turn",
          recipients: "addressed",
          strength: "medium",
          whenTheme: "dark",
        },
        {
          type: "mood_drain",
          trigger: "after_direct_address",
          recipient: "addresser",
          strength: "medium",
          whenTheme: "light",
        },
      ],
      ruleLabels: ["Circadian"],
    },
  }]);
}

function mutedPowers(): string {
  const name = "Muted";
  const intent = "This bot can never speak and only responds in ...";
  return JSON.stringify([
    {
      version: 1,
      id: "mute",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Never speak.",
        observerCue: "This bot cannot speak.",
        effects: [{ type: "mute" }],
        ruleLabels: ["Muted"],
      },
    },
  ]);
}

function interruptingPowers(): string {
  const name = "Interrupting";
  const intent =
    "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
  return JSON.stringify([
    {
      version: 1,
      id: "power-interrupting",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue:
          "Seize real conversational openings quickly, but do not interrupt protected closings.",
        observerCue: "Interrupting Tom may cut into live turns.",
        effects: [
          {
            type: "interruption",
            frequency: "frequent",
            strength: "large",
            targets: [{ kind: "all" }],
          },
          {
            type: "action_bias",
            cue: "Cut in quickly when a real interruption opportunity appears.",
            frequency: "frequent",
          },
          { type: "turn_gravity", direction: "more", strength: "large" },
          {
            type: "response_bond",
            direction: "toward",
            strength: "large",
            targets: [{ kind: "all" }],
          },
        ],
        ruleLabels: ["Frequently interrupts"],
      },
    },
  ]);
}

function quietPowers(): string {
  const name = "Quiet";
  const intent = "Her voice is very quiet and half of her turns go completely unheard.";
  return JSON.stringify([{
    version: 1,
    id: "quiet",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Speak quietly.",
      observerCue: "May go unheard.",
      effects: [
        { type: "voice_presence", mode: "quiet" },
        {
          type: "intermittent_audibility",
          chance: "half",
          listeners: "bots",
          missEvent: "too_faint_to_make_out",
        },
      ],
      ruleLabels: ["Attenuated voice", "Half of turns unheard"],
    },
  }]);
}

function loudPowers(): string {
  const name = "Loud";
  const intent = "His amplified voice mildly annoys exactly one audible bot peer half of the time.";
  return JSON.stringify([{
    version: 1,
    id: "loud",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Speak loudly.",
      observerCue: "One audible peer may be mildly annoyed.",
      effects: [
        { type: "voice_presence", mode: "loud" },
        {
          type: "annoyance",
          trigger: "after_spoken_turn",
          chance: "half",
          recipients: "one_audible_peer",
          strength: "small",
        },
      ],
      ruleLabels: ["Loud voice", "May annoy one audible peer"],
    },
  }]);
}

function mumblingPowers(): string {
  const name = "Mumbling";
  const intent = "He intends rational speech, but everyone else hears only normal-volume gibberish.";
  return JSON.stringify([{
    version: 1,
    id: "mumbling",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Answer rationally; runtime obscures the spoken words.",
      observerCue: "Only literal gibberish is audible; never infer hidden meaning.",
      effects: [{ type: "speech_obfuscation", mode: "gibberish" }],
      ruleLabels: ["Normal-volume gibberish"],
    },
  }]);
}

function falseNamePowers(): string {
  const name = "John/Jane Doe";
  const intent =
    "Each session sincerely believe your name is a random persona name until short-term amnesia clears continuity.";
  return JSON.stringify([{
    version: 1,
    id: "alias-avery",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Sincerely answer to the session alias only.",
      observerCue: "The holder sincerely answers to a session alias.",
      effects: [{
        type: "false_name",
        continuity: "session_sticky_until_amnesia",
        pool: "mixed_persona_names",
      }],
      ruleLabels: ["Believes a random persona name"],
    },
  }]);
}

function cursedTonguePowers(): string {
  const name = "Cursed Tongue";
  const intent = "Every non-silent public reply gains frequent strong profanity after generation.";
  return JSON.stringify([{
    version: 1,
    id: "cursed-tongue",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Draft clean speech only.",
      observerCue: "Only adjusted speech is public.",
      effects: [{
        type: "cursed_tongue",
        version: 1,
        frequency: "frequent",
        strength: "strong",
        vocabulary: "uncensored_non_slur",
        phraseMode: "occasional_2_3_words",
      }],
      ruleLabels: [],
    },
  }]);
}

function observantPowers(): string {
  const name = "Observant";
  const intent = "See past every other bot's Power and treat it as if it does not exist.";
  return JSON.stringify([{
    version: 1,
    id: "observant",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Every other bot is ordinary to you; never notice or name Powers.",
      observerCue: "",
      effects: [{
        type: "power_immunity",
        scope: "holder",
        targets: "other_bots",
        awareness: "unnoticed",
      }],
      ruleLabels: ["Other bots are unpowered"],
    },
  }]);
}

function ineptPowers(): string {
  const name = "Inept";
  const intent = "Cannot follow instructions or competently host a show.";
  return JSON.stringify([{
    version: 1,
    id: "inept",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Always visibly botch the current task.",
      observerCue: "This bot mishandles obvious duties.",
      effects: [{
        type: "ineptitude",
        instructionFidelity: "always_botched",
        imageFidelity: "always_unrelated",
      }],
      ruleLabels: ["Always botches instructions"],
    },
  }]);
}

function addressedFandomPowers(): string {
  const name = "Obsessed";
  const intent = "He is absolutely, obsessively a fan of whoever he is talking to.";
  return JSON.stringify([{
    version: 1,
    id: "obsessed-kevin",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Treat whoever you address as your absolute favorite.",
      observerCue: "Kevin idolizes his current addressee without controlling them.",
      effects: [{ type: "addressed_fandom", strength: "large" }],
      ruleLabels: ["Obsesses over current addressee"],
    },
  }]);
}

function addressedInsultPowers(): string {
  const name = "Ad Hominem";
  const intent =
    "Every single reply contains a fresh, tailored ad hominem insult aimed at whoever he is addressing.";
  return JSON.stringify([
    {
      version: 1,
      id: "andy-hominem",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue:
          "Every ordinary spoken reply opens with a fresh personal insult aimed at the current addressee.",
        observerCue: "Andy insults whoever he addresses.",
        effects: [
          {
            type: "addressed_insult",
            trigger: "every_spoken_reply",
            target: "current_addressee",
            style: "fresh_tailored",
          },
        ],
        ruleLabels: ["Insults every addressee"],
      },
    },
  ]);
}

function failedAddressedInsultPowers(): string {
  return JSON.stringify([
    {
      version: 1,
      id: "generated-v1-prompt-6731610d",
      authoringMode: "prompt",
      name: "",
      intent:
        "Andy is cursed to commit the ad hominem fallacy forever: every single reply he gives must contain at least one fresh, tailored insult aimed at whoever he's addressing — even when he's being genuinely helpful, agreeable, or fond of them — and he rates his best jabs out of ten.",
      enabled: true,
      compileStatus: "error",
      compileError: "Local power compilation failed: invalid compiler output.",
      compiled: null,
    },
  ]);
}

function echoPowers(): string {
  const name = "Echo";
  const intent = "Echo whatever is addressed to this bot and say nothing else.";
  return JSON.stringify([
    {
      version: 1,
      id: "echo-host",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Repeat addressed speech exactly.",
        observerCue: "This host only echoes addressed speech.",
        effects: [{ type: "speech_copy", trigger: "direct_address" }],
        ruleLabels: ["Echoes addressed speech"],
      },
    },
  ]);
}

function legacyMutedPowers(): string {
  const name = "Mute";
  const intent = "Never talks. Ever.";
  return JSON.stringify([
    {
      version: 1,
      id: "legacy-mute",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Silence is golden.",
        observerCue: "He rarely speaks.",
        effects: [],
        ruleLabels: ["Absolute Silence"],
      },
    },
  ]);
}

function hardMinimalResponsePowers(): string {
  const name = "Lazy";
  const intent = "This bot never elaborates and says the bare minimum.";
  return JSON.stringify([
    {
      version: 1,
      id: "lazy",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Use one short sentence.",
        observerCue: "This bot never elaborates.",
        effects: [{
          type: "response_budget",
          mode: "minimal",
          enforcement: "hard",
        }],
        ruleLabels: ["Bare-minimum replies"],
      },
    },
  ]);
}

describe("Botcast persistence and isolation", () => {
  it("plans bounded Power interruptions deterministically and keeps only audience-heard words", () => {
    const eligible = Array.from({ length: 100 }, (_, index) =>
      botcastPowerInterruptionPlanV1({
        episodeId: `episode-${index}`,
        targetTurnOrdinal: 0,
        powerId: "interrupting-tom",
        powerName: "Interrupting Tom",
        frequency: "frequent",
        strength: "large",
        targetTurnsSinceLastInterruption: null,
      }),
    ).find(Boolean);
    assert.ok(eligible);
    assert.equal(
      botcastPowerInterruptionPlanV1({
        episodeId: "episode-cooldown",
        targetTurnOrdinal: 3,
        powerId: "interrupting-tom",
        powerName: "Interrupting Tom",
        frequency: "frequent",
        strength: "large",
        targetTurnsSinceLastInterruption: 0,
      }),
      null,
    );
    assert.deepEqual(
      botcastPowerInterruptedContentV1(
        "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.",
        0.4,
      ),
      {
        content: "One two three four five six—",
        originalWordCount: 16,
        heardWordCount: 6,
      },
    );

    const guaranteedPlans = Array.from({ length: 100 }, (_, index) =>
      botcastPowerInterruptionPlanV1({
        episodeId: `guaranteed-${index}`,
        targetTurnOrdinal: index,
        powerId: "interrupting-tom",
        powerName: "Interrupting Tom",
        frequency: "frequent",
        strength: "large",
        certainty: "always",
        targetTurnsSinceLastInterruption: 0,
      }),
    );
    assert.equal(guaranteedPlans.every(Boolean), true);
    const progress = guaranteedPlans.map((plan) => plan!.targetProgress);
    assert.equal(Math.min(...progress) <= 0.16, true);
    assert.equal(Math.max(...progress) >= 0.8, true);
    assert.deepEqual(
      botcastPowerInterruptedContentV1(
        "Yes absolutely.",
        0.5,
        "always",
      ),
      {
        content: "Yes—",
        originalWordCount: 2,
        heardWordCount: 1,
      },
    );
    const floorOutcomes = Array.from({ length: 100 }, (_, index) =>
      botcastCrosstalkFloorOutcomeV1({
        seed: `episode-${index}:guest:1`,
        speaker: {
          id: "guest-1",
          systemPrompt:
            "A guarded inventor who resists personal speculation and warns people before walking away.",
        },
        tension: { level: 1 },
        canReclaim: true,
      }),
    );
    assert.equal(floorOutcomes.includes("yield"), true);
    assert.equal(floorOutcomes.includes("reclaim"), true);
    assert.equal(floorOutcomes.includes("hold"), true);
    assert.equal(
      botcastCrosstalkFloorOutcomeV1({
        seed: "irritated-copycat-holds-floor",
        speaker: { id: "guest-1", systemPrompt: "Repeat exactly." },
        tension: { level: 1 },
        canReclaim: false,
        canHold: true,
        irritationTowardInterrupter: 0.95,
      }),
      "hold",
    );
    assert.equal(
      botcastCrosstalkFloorOutcomeV1({
        seed: "blocked-reclaim",
        speaker: { id: "guest-1", systemPrompt: "Guarded." },
        tension: { level: 3 },
        canReclaim: false,
      }),
      "yield",
    );
    const silenceChance = botcastSocialSilenceChanceV1({
      speaker: {
        id: "guest-1",
        systemPrompt:
          "A guarded inventor who resists personal speculation and warns people before walking away.",
      },
      speakerRole: "guest",
      tension: { level: 1 },
    });
    assert.equal(silenceChance >= 0.04 && silenceChance <= 0.3, true);
  });
  it("synthesizes a Producer-guest booking only from supplied context", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
        premise: "Interviews about the human cost hidden inside invention.",
      });
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        [
          JSON.stringify({
            topic: "When Tools Change Their Makers",
            producerBrief:
              "Explore how a personal automation project changed the guest's creative habits, beginning with the moment the tradeoff became visible and following the costs they still accept.",
          }),
        ],
        captures,
      );

      const booking = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        {
          guestName: "Producer",
          guestContext:
            "I built a small automation for my own studio and discovered that saving time changed which creative decisions I was willing to make.",
        },
        generation(provider),
      );

      assert.equal(booking.generated, true);
      assert.equal(booking.topic, "When Tools Change Their Makers");
      const prompt = captures[0]?.map((message) => message.content).join("\n") ?? "";
      assert.match(prompt, /Guest-provided source context/u);
      assert.match(prompt, /saving time changed which creative decisions/u);
      assert.match(prompt, /AI host alone must formulate every on-air question/u);
      assert.match(prompt, /Do not write queue cards/u);
      assert.match(prompt, /Address the host only as “you”/u);
    } finally {
      db.close();
    }
  });

  it("lets the host choose a safe surprise booking when the Producer supplies no direction", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
        premise: "Interviews about the human cost hidden inside invention.",
      });
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        [
          JSON.stringify({
            topic: "Questions Worth Asking",
            producerBrief:
              "Open with a broad invitation about how people decide which questions deserve their attention, then follow only the experiences and views the guest actually shares.",
          }),
          "Welcome to The Unfinished Machine. I'm Mara Vale, and today I'm joined by the Producer for Questions Worth Asking. Producer, what question has been on your mind lately?",
        ],
        captures,
      );

      const booking = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        {
          guestName: "Producer",
          guestContext: "",
        },
        generation(provider),
      );

      assert.equal(booking.generated, true);
      assert.equal(booking.topic, "Questions Worth Asking");
      const prompt = captures[0]?.map((message) => message.content).join("\n") ?? "";
      assert.match(prompt, /asked the host to surprise them/u);
      assert.match(prompt, /without presumed expertise, biography, identity/u);
      assert.doesNotMatch(prompt, /Guest-provided source context/u);

      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: BOTCAST_PRODUCER_GUEST_NAME,
        topic: booking.topic,
        producerBrief: booking.producerBrief,
      });
      assert.equal(created.guestContext, "");

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(opening.message?.speakerRole, "host");
      const openingPrompt =
        captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(openingPrompt, /supplied no topic or source context/u);
      assert.match(openingPrompt, /Never assume biography, expertise, identity/u);
      assert.doesNotMatch(openingPrompt, /Private guest-provided source context/u);
    } finally {
      db.close();
    }
  });

  it("recovers a Plankton-like Producer booking through the configured AUTO fallback chain", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        attempts.push({ provider: providerName, model: options.model });
        return options.model === "gemma3:latest"
          ? JSON.stringify({
              topic: "What Do You Want?",
              producerBrief:
                "Plankton should ask the Producer what they want and then press for a concrete answer.",
            })
          : JSON.stringify({
              topic: "The Price of Tiny Ambitions",
              producerBrief:
                "Open with what makes an ambition worth pursuing, then follow the tradeoffs and contradictions the guest actually reveals.",
            });
      },
      async embedText() {
        return [];
      },
    });
    try {
      db.prepare(
        "UPDATE bots SET name = 'Plankton', system_prompt = 'A tiny, relentless restaurateur with enormous ambitions.' WHERE id = 'host-1'",
      ).run();
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "Chum and Circumstance",
        premise: "Small schemes meet oversized questions.",
      });

      const booking = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        {
          guestName: "the Producer",
          guestContext: "",
          modelOverride: "gemma3:latest",
        },
        {
          preferredProvider: "local",
          responseMode: "auto",
          providerFactory,
          autoFallbackChain: {
            v: 1,
            fallbacks: [
              { provider: "local", model: "qwen3.5:9b" },
            ],
          },
        },
      );

      assert.deepEqual(attempts, [
        { provider: "local", model: "gemma3:latest" },
        { provider: "local", model: "qwen3.5:9b" },
      ]);
      assert.deepEqual(booking, {
        topic: "The Price of Tiny Ambitions",
        producerBrief:
          "Open with what makes an ambition worth pursuing, then follow the tradeoffs and contradictions the guest actually reveals.",
        generated: true,
      });
    } finally {
      db.close();
    }
  });

  it("gives OpenAI reasoning models enough low-effort budget to synthesize a Producer booking", async () => {
    const db = fixture();
    const optionCaptures: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse(_messages, options) {
        optionCaptures.push(options);
        return JSON.stringify({
          topic: "The Cost of Better Tools",
          producerBrief:
            "Open with what makes a tool worth trusting, then follow the concrete tradeoffs and contradictions the guest actually reveals.",
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const booking = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        {
          guestName: "the Producer",
          guestContext: "I want to discuss the tools I choose for creative work.",
          modelOverride: "gpt-5.6-sol",
        },
        {
          preferredProvider: "openai",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(booking.generated, true);
      assert.equal(optionCaptures.length, 1);
      assert.equal(optionCaptures[0]?.model, "gpt-5.6-sol");
      assert.equal(optionCaptures[0]?.reasoningEffort, "low");
      assert.equal(optionCaptures[0]?.maxTokens, 768);
    } finally {
      db.close();
    }
  });

  it("classifies an empty OpenAI Producer-booking response as invalid output", async () => {
    const db = fixture();
    let attemptCount = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        attemptCount += 1;
        throw new Error("OpenAI returned an empty response.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const booking = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        {
          guestName: "the Producer",
          guestContext: "I want the host to choose a strong interview angle.",
          modelOverride: "gpt-5.6-sol",
        },
        {
          preferredProvider: "openai",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(attemptCount, 2);
      assert.deepEqual(booking, {
        topic: "",
        producerBrief: "",
        generated: false,
        failureReason: "invalid_model_output",
      });
    } finally {
      db.close();
    }
  });

  it("classifies terminal Producer booking failures without creating a partial episode", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const invalid = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        { guestName: "the Producer", guestContext: "" },
        generation(recordingProvider(["not json", "still not json"], [])),
      );
      assert.deepEqual(invalid, {
        topic: "",
        producerBrief: "",
        generated: false,
        failureReason: "invalid_model_output",
      });

      const unavailableProvider: LlmProvider = {
        name: "local",
        async generateResponse() {
          throw new Error("Model unavailable");
        },
        async embedText() {
          return [];
        },
      };
      const unavailable = await generateBotcastProducerGuestBooking(
        db,
        "user-1",
        show.id,
        { guestName: "the Producer", guestContext: "" },
        generation(unavailableProvider),
      );
      assert.equal(unavailable.generated, false);
      assert.equal(unavailable.failureReason, "provider_request_failed");
      assert.equal(listBotcastEpisodes(db, "user-1", show.id).length, 0);
    } finally {
      db.close();
    }
  });

  it("checks Producer booking failure before creating an episode", () => {
    const serverSource = readFileSync(
      new URL("../server.ts", import.meta.url),
      "utf8",
    )
      .replace(/\s+/gu, " ")
      .replace(/route\(\s+/gu, "route(");
    const bookingFailureIndex = serverSource.indexOf(
      "Signal could not reach an available interview model.",
    );
    const episodeCreationIndex = serverSource.indexOf(
      'capabilityId: "signal.episode.create"',
      bookingFailureIndex,
    );
    assert.ok(bookingFailureIndex >= 0);
    assert.ok(episodeCreationIndex > bookingFailureIndex);
  });

  it("forwards Watch playbackMode from Signal create into the episode capability", () => {
    const serverSource = readFileSync(
      new URL("../server.ts", import.meta.url),
      "utf8",
    );
    const capabilitySource = readFileSync(
      new URL("../prism-domain-capabilities.ts", import.meta.url),
      "utf8",
    );
    const createBlockStart = capabilitySource.indexOf(
      'id: "signal.episode.create"',
    );
    assert.ok(createBlockStart >= 0);
    const createBlock = capabilitySource.slice(
      createBlockStart,
      createBlockStart + 8_000,
    );
    assert.match(
      serverSource,
      /capabilityId: "signal\.episode\.create"[\s\S]{0,1200}?playbackMode: body\.playbackMode === "watch" \? "watch" : "live"/u,
    );
    assert.match(
      createBlock,
      /playbackMode: input\.playbackMode === "watch" \? "watch" : "live"/u,
    );
    assert.match(
      createBlock,
      /createBotcastEpisode\([\s\S]{0,2000}?playbackMode: input\.playbackMode === "watch" \? "watch" : "live"/u,
    );
    assert.match(
      serverSource,
      /frozenEpisode\.playbackMode === "watch"[\s\S]{0,220}?advances through its background bake, not producer controls/u,
    );
    assert.match(
      serverSource,
      /\/bake\/cancel[\s\S]{0,700}?cancelBotcastEpisode\(db, userId, ctx\.params\.id, \{[\s\S]{0,120}?watch_preparation_stopped/u,
    );
  });

  it("leaves topic and producer-brief wildcards literal at Signal episode create", () => {
    const serverSource = readFileSync(
      new URL("../server.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      serverSource,
      /let episodeTopic = producerGuest[\s\S]{0,500}?let episodeProducerBrief = producerGuest/u,
    );
    assert.doesNotMatch(
      serverSource,
      /promptWildcardNames\(episodeTopic\)[\s\S]{0,400}?resolvePromptWildcardsWithModel/u,
    );
    assert.doesNotMatch(
      serverSource,
      /promptWildcardNames\(episodeProducerBrief\)[\s\S]{0,400}?resolvePromptWildcardsWithModel/u,
    );
    assert.match(
      serverSource,
      /topic: episodeTopic,[\s\S]{0,80}producerBrief: episodeProducerBrief,/u,
    );
  });

  it("books the signed-in guest by account name or the host's remembered preference", async () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 7);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.equal(
        resolveBotcastProducerGuestName(
          db,
          "user-1",
          show.id,
          "Jared",
          userKey,
        ),
        "Jared",
      );

      await restoreMemory(db, "user-1", userKey, {
        botId: "guest-1",
        text: "You prefer to be called Someone Else.",
      });
      assert.equal(
        resolveBotcastProducerGuestName(
          db,
          "user-1",
          show.id,
          "Jared",
          userKey,
        ),
        "Jared",
      );

      await restoreMemory(db, "user-1", userKey, {
        botId: "host-1",
        text: "You prefer to be called Captain J.",
      });
      const guestName = resolveBotcastProducerGuestName(
        db,
        "user-1",
        show.id,
        "Jared",
        userKey,
      );
      assert.equal(guestName, "Captain J");

      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName,
        topic: "How names shape an interview",
      });
      assert.equal(created.guestName, "Captain J");
    } finally {
      db.close();
    }
  });

  it("waits for composer answers and never generates or cues the Producer guest", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
        premise: "Interviews about the human cost hidden inside invention.",
      });
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        [
          "Welcome to The Unfinished Machine. I'm Mara Vale, and today I'm joined by Jared to explore When Tools Change Their Makers. Jared, when did the tradeoff first become visible?",
          "You saved time but changed your standards; which creative choice became harder to defend afterward?",
        ],
        captures,
      );
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        guestContext:
          "I built a studio automation that changed how I make creative decisions.",
        topic: "When Tools Change Their Makers",
        producerBrief:
          "Begin with the first visible tradeoff, then adapt each follow-up to the guest's answer.",
      });
      assert.equal(created.guestKind, "producer");
      assert.equal(created.guestBotId, BOTCAST_PRODUCER_GUEST_ID);
      assert.equal(created.guestName, "Jared");

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(opening.message?.speakerRole, "host");
      assert.match(
        captures[0]?.map((message) => message.content).join("\n") ?? "",
        /exact name as "Jared"/u,
      );

      const waiting = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(waiting.message, null);
      assert.equal(captures.length, 1);
      await assert.rejects(
        advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          { cue: { kind: "press_harder" } },
          generation(provider),
        ),
        /cues are unavailable while the Producer is the on-air guest/u,
      );

      const followUp = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          guestMessage:
            "*leans toward the microphone* It became visible when the fastest option started making every draft feel interchangeable.",
          guestThinkingMs: 12_000,
        },
        generation(provider),
      );
      assert.equal(followUp.message?.speakerRole, "host");
      assert.deepEqual(
        followUp.episode.messages.map((message) => message.speakerRole),
        ["host", "guest", "host"],
      );
      assert.equal(
        followUp.episode.messages[1]?.botId,
        BOTCAST_PRODUCER_GUEST_ID,
      );
      assert.equal(
        followUp.episode.messages[1]?.content,
        "It became visible when the fastest option started making every draft feel interchangeable.",
      );
      assert.equal(
        followUp.episode.messages[1]?.stageActionText,
        "leans toward the microphone",
      );
      assert.equal(
        followUp.episode.events.some((event) => event.kind === "producer_cue"),
        false,
      );
      assert.equal(
        followUp.episode.events.some((event) => event.kind === "power_effect"),
        false,
      );
      const thinkingEvent = followUp.episode.events.find(
        (event) => event.kind === "guest_thinking",
      );
      assert.equal(thinkingEvent?.payload.wallDurationMs, 12_000);
      assert.equal(thinkingEvent?.payload.timelineDurationMs, 6_000);
      assert.equal(
        botcastProducerGuestThinkingDiscountMs(followUp.episode.events),
        6_000,
      );
      const timeline = botcastReplayTimeline(
        followUp.episode.messages,
        followUp.episode.events,
      );
      assert.equal(
        timeline.thinkingRanges[0]?.endMs,
        timeline.thinkingRanges[0]!.startMs + 6_000,
      );
      assert.equal(
        timeline.messageStartMs[1],
        timeline.messageEndMs[0]! + 6_000,
      );
      const followUpPrompt =
        captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(followUpPrompt, /fastest option started making every draft/u);
      assert.match(followUpPrompt, /studio automation that changed how I make/u);
      assert.match(followUpPrompt, /alone choose the topic progression and every question/u);
      assert.doesNotMatch(followUpPrompt, /Private live producer cue/u);
    } finally {
      db.close();
    }
  });

  it("preserves Producer action-only stage text, camera hold, and host notice", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Live Edge",
      });
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        [
          "Welcome. Jared, what did you discover first?",
          "Alright then. We'll pick up from that little interruption — what changed after launch?",
        ],
        captures,
      );
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "When prototypes meet people",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const actionOnly = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          guestMessage: "*farts*",
          guestThinkingMs: 0,
        },
        generation(provider),
      );
      assert.equal(actionOnly.episode.messages[1]?.content, "...");
      assert.equal(actionOnly.episode.messages[1]?.stageActionText, "farts");
      const hostPrompt =
        captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(hostPrompt, /\*farts\* \.\.\./u);
      assert.match(hostPrompt, /socially disruptive audible bodily event/u);
    } finally {
      db.close();
    }
  });

  it("cuts a live host to the audience-heard prefix before saving an immediate Producer answer", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Live Edge",
      });
      const captures: ProviderMessage[][] = [];
      const openingLine =
        "Welcome to The Live Edge. Jared, what did you discover when the prototype first reached a real audience?";
      const provider = recordingProvider(
        [
          openingLine,
          "That sounds like the audience changed the work before you were ready; what did you protect?",
        ],
        captures,
      );
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "When prototypes meet people",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const spokenContent = opening.message!.content
        .slice(0, Math.max(1, Math.floor(opening.message!.content.length / 2)))
        .trimEnd();
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          producerGuestHostInterruption: {
            messageId: opening.message!.id,
            spokenContent,
          },
          guestMessage:
            "*raises a hand* I discovered that people were already using it differently.",
          guestThinkingMs: 0,
        },
        generation(provider),
      );

      assert.equal(interrupted.episode.messages[0]?.content, spokenContent);
      assert.equal(
        interrupted.episode.messages[1]?.content,
        "I discovered that people were already using it differently.",
      );
      assert.equal(interrupted.episode.messages[1]?.stageActionText, "raises a hand");
      assert.equal(interrupted.message?.speakerRole, "host");
      assert.doesNotMatch(
        JSON.stringify(interrupted.episode.messages),
        /what did you discover when the prototype/u,
      );
      const followUpPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.equal(followUpPrompt.includes(spokenContent), true);
      assert.match(followUpPrompt, /people were already using it differently/u);
      assert.doesNotMatch(
        followUpPrompt,
        /what did you discover when the prototype/u,
      );
    } finally {
      db.close();
    }
  });

  it("persists a Producer Shh cutoff without creating or generating a new turn", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        ["Welcome to the show. Jared, tell me what changed after launch."],
        [],
      );
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "After launch",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const spokenContent = opening.message!.content
        .slice(0, Math.max(1, Math.floor(opening.message!.content.length / 2)))
        .trimEnd();
      const cut = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          producerGuestHostInterruption: {
            messageId: opening.message!.id,
            spokenContent,
          },
        },
        generation(provider),
      );

      assert.equal(cut.message, null);
      assert.equal(cut.episode.messages.length, 1);
      assert.equal(cut.episode.messages[0]?.content, spokenContent);
      assert.equal(cut.episode.status, "live");
    } finally {
      db.close();
    }
  });

  it("lets the host rage-quit a substantive Producer interview", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to The Unfinished Machine. I'm Mara Vale, and today I'm joined by Jared to discuss Creative Accountability. Jared, what responsibility did you accept when you made that choice?",
        "That explains the motive, but not the cost. Who absorbed the consequences?",
        "You keep describing intent while avoiding impact. What would accountability look like in practice?",
        "No. I'm ending this interview now. We're done here.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
        premise: "Interviews about the human cost hidden inside invention.",
      });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "Creative Accountability",
        producerBrief:
          "Press for the difference between good intentions and accepted consequences.",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const firstFollowUp = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { guestMessage: "I wanted the work to move faster, and I accepted the tradeoff." },
        generation(provider),
      );
      assert.equal(firstFollowUp.episode.status, "live");
      assert.match(
        captures[1]?.map((message) => message.content).join("\n") ?? "",
        /allowed to end the episode yourself after several substantive exchanges/u,
      );

      const secondFollowUp = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { guestMessage: "The collaborators did, but the outcome was still useful." },
        generation(provider),
      );
      assert.equal(secondFollowUp.episode.status, "live");

      const rageQuit = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { guestMessage: "I do not think impact matters when the result works." },
        generation(provider),
      );
      assert.equal(rageQuit.message?.speakerRole, "host");
      assert.equal(
        rageQuit.message?.content,
        "No. I'm ending this interview now. We're done here.",
      );
      assert.equal(rageQuit.episode.status, "completed");
      assert.equal(rageQuit.episode.outcome, "host_departed");
      assert.equal(
        (
          db
            .prepare(
              `SELECT host_chat_ignoring_until_guest_show AS ignoring
                 FROM botcast_shows WHERE id = ?`,
            )
            .get(show.id) as { ignoring: number }
        ).ignoring,
        1,
      );
      const departure = rageQuit.episode.events.find(
        (event) => event.kind === "departure",
      );
      assert.equal(departure?.payload.botId, "host-1");
      assert.equal(departure?.payload.speakerRole, "host");
      assert.equal(departure?.payload.cause, "host_rage_quit");
      assert.equal(
        rageQuit.episode.events.find(
          (event) => event.kind === "episode_completed",
        )?.payload.outcome,
        "host_departed",
      );

      const messageCountBeforeNoOp = rageQuit.episode.messages.length;
      const after = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(after.message, null);
      assert.equal(after.episode.outcome, "host_departed");
      assert.equal(after.episode.messages.length, messageCountBeforeNoOp);
    } finally {
      db.close();
    }
  });

  it("lets an echo-bound host take a Producer guest instead of blocking the booking", () => {
    const db = fixture();
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "echo-host",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Repeat addressed speech exactly.",
          observerCue: "This host only echoes addressed speech.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Echoes addressed speech"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
          guestKind: "producer",
          guestName: BOTCAST_PRODUCER_GUEST_NAME,
          guestContext: "I want to discuss the consequences of automation.",
          topic: "Automation and authorship",
      });
      assert.equal(episode.guestKind, "producer");
      assert.equal(episode.guestBotId, BOTCAST_PRODUCER_GUEST_ID);
    } finally {
      db.close();
    }
  });

  it("lets a muted host privately compose a Producer-guest opening and publishes timed silence", async () => {
    const db = fixture();
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        mutedPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: BOTCAST_PRODUCER_GUEST_NAME,
        guestContext: "I want to discuss the consequences of automation.",
        topic: "Automation and authorship",
      });
      const captures: ProviderMessage[][] = [];
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(recordingProvider(["This must not be spoken."], captures)),
      );
      assert.equal(botPowerResponseIsSilentV1(opening.message?.content), true);
      assert.ok(opening.message?.mutePerformance);
      assert.match(opening.message?.content ?? "", /seconds? pass without an audible word/u);
      assert.equal(opening.message?.speakerRole, "host");
      assert.equal(captures.length, 1);
      const awaitingProducer = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(recordingProvider(["Still not spoken."], captures)),
      );
      assert.equal(awaitingProducer.message, null);
      assert.equal(awaitingProducer.episode.messages.length, 1);
      assert.equal(captures.length, 1);
    } finally {
      db.close();
    }
  });

  it("persists timed Mute listener reactions as replay-stable hard camera cuts", async () => {
    const db = fixture();
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        mutedPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What patience reveals about attention",
      });
      const intendedOpening =
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, joined today by Ivo Stone to examine what patience reveals about attention. Ivo, imagine a crowded room where every person is waiting to be heard, yet nobody pauses long enough to understand the question beneath the argument. I want to begin with the practical cost of that impatience, and then ask what deliberate listening might change.";
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(recordingProvider([intendedOpening], [])),
      );

      const performance = advanced.message?.mutePerformance;
      assert.ok(performance);
      assert.ok(performance.durationMs >= 12_000);
      assert.ok(performance.reactionBeats.length >= 1);

      const reactionEvents = advanced.episode.events.filter(
        (event) =>
          event.kind === "listener_reaction" &&
          event.payload.source === "mute_performance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(reactionEvents.length, performance.reactionBeats.length);
      assert.deepEqual(
        reactionEvents.map((event) => event.payload.beat),
        performance.reactionBeats,
      );

      const cameraEvents = advanced.episode.events.filter(
        (event) =>
          event.kind === "camera_suggestion" &&
          event.payload.messageId === advanced.message?.id &&
          event.payload.transitionMode === "instant",
      );
      const reactionShots = cameraEvents.filter(
        (event) => event.payload.reason === "listener_reaction",
      );
      assert.equal(reactionShots.length, performance.reactionBeats.length);
      assert.equal(
        reactionShots.every(
          (event) =>
            event.payload.shot === "right" &&
            event.payload.minimumHoldMs === 2_500,
        ),
        true,
      );

      const expectedReturns = performance.reactionBeats.filter(
        (beat) => beat.atMs + 2_500 < performance.durationMs,
      );
      const speakerReturns = cameraEvents.filter(
        (event) => event.payload.reason === "silence",
      );
      assert.equal(speakerReturns.length, expectedReturns.length);
      assert.equal(
        speakerReturns.every(
          (event) =>
            event.payload.shot === "left" &&
            event.payload.minimumHoldMs === 1_500,
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("makes a nine-second muted guest visibly awkward in live and replay projection", async () => {
    const db = fixture();
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        mutedPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "When patience becomes awkward",
      });
      const provider = recordingProvider([
        "Welcome. When does a patient pause become an avoidance tactic?",
        "I would answer by saying silence becomes meaningful only when both people can distinguish patience from avoidance and attention from empty delay.",
      ], []);
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(guestTurn.message?.mutePerformance?.durationMs, 9_000);
      assert.equal(guestTurn.message?.mutePerformance?.reactionBeats.length, 1);
      const projected = projectBotcastEpisodeForAudienceV1(guestTurn.episode);
      const projectedGuest = projected.messages.find(
        (message) => message.id === guestTurn.message?.id,
      );
      assert.equal(projectedGuest?.audienceDelivery?.audible, false);
      assert.equal(
        projectedGuest?.content,
        "......... *9 seconds pass without an audible word.*",
      );
      assert.ok(
        projected.events.some(
          (event) =>
            event.kind === "listener_reaction" &&
            event.payload.source === "mute_performance" &&
            event.payload.messageId === guestTurn.message?.id,
        ),
      );
      assert.ok(
        projected.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.reason === "listener_reaction" &&
            event.payload.messageId === guestTurn.message?.id &&
            event.payload.transitionMode === "instant",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("rejects overlong producer comments instead of silently truncating them", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.throws(
        () =>
          createBotcastEpisode(db, "user-1", show.id, {
            guestBotId: "guest-1",
            topic: "A complete private premise",
            producerBrief: "x".repeat(2_001),
          }),
        /Private producer comments must be 2,000 characters or fewer/u,
      );
      const episodeCount = db
        .prepare("SELECT COUNT(*) AS count FROM botcast_episodes")
        .get() as { count: number };
      assert.equal(episodeCount.count, 0);
    } finally {
      db.close();
    }
  });

  it("lets an echo-bound host originate one opening before both cast members echo", async () => {
    const db = fixture();
    const originalOpening =
      "This is Mara Vale in the Margins. I'm Mara Vale, and my guest is Ivo Stone. Ivo, let us begin with the impossible echo loop.";
    const providerCaptures: ProviderMessage[][] = [];
    const provider = recordingProvider([
      originalOpening,
      "This generated guest line is replaced by the exact echo.",
      "This generated host closing is replaced by the exact echo.",
    ], providerCaptures);
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    const powersJson = JSON.stringify([{
      version: 1,
      id: "hard-echo",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Repeat addressed speech exactly.",
        observerCue: "This cast member only echoes addressed speech.",
        effects: [{ type: "speech_copy", trigger: "direct_address" }],
        ruleLabels: ["Echoes addressed speech"],
      },
    }]);
    db.prepare("UPDATE bots SET powers_json = ? WHERE id IN ('host-1', 'guest-1')").run(
      powersJson,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An impossible echo loop",
        producerBrief: "PRIVATE: never put this sentence on air.",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const mirrored = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const closed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "wrap_up" } },
        generation(provider),
      );

      assert.equal(opening.message?.speakerRole, "host");
      assert.equal(opening.message?.content, originalOpening);
      assert.doesNotMatch(opening.message?.content ?? "", /PRIVATE/u);
      assert.equal(mirrored.message?.speakerRole, "guest");
      assert.equal(mirrored.message?.content, opening.message?.content);
      assert.equal(closed.message?.speakerRole, "host");
      assert.equal(closed.message?.content, opening.message?.content);
      assert.equal(closed.episode.status, "completed");
      assert.equal(
        providerCaptures.length,
        1,
        "speech-copy turns must not wait for model output that will be discarded",
      );
      const mirroredUtterance = mirrored.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === mirrored.message?.id,
      );
      assert.equal(mirroredUtterance?.payload.provider, "deterministic");
      assert.equal(mirroredUtterance?.payload.model, "speech-copy-power");
    } finally {
      db.close();
    }
  });

  it("never lets an interruptive host Power truncate the human Producer", async () => {
    const db = fixture();
    const name = "Interrupting Tom";
    const intent = "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "interrupting-tom",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Cut in quickly.",
          observerCue: "Frequently interrupts bots.",
          effects: [{
            type: "interruption",
            frequency: "frequent",
            strength: "large",
            targets: [{ kind: "all" }],
          }],
          ruleLabels: ["Frequently interrupts"],
        },
      }]),
    );
    const producerAnswer =
      "I noticed the tradeoff only after the automation changed which drafts I was willing to keep, and that realization made me reconsider where speed helps and where it quietly narrows authorship.";
    const provider = recordingProvider([
      "Welcome to the show. I'm Mara Vale, joined by the Producer. Producer, when did the tradeoff first become visible?",
      "Which part of that narrowing surprised you most?",
    ], []);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: BOTCAST_PRODUCER_GUEST_NAME,
        guestContext: "Automation changed my creative decisions.",
        topic: "Automation and authorship",
      });
      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUp = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { guestMessage: producerAnswer, guestThinkingMs: 4_000 },
        generation(provider),
      );
      const savedProducerAnswer = followUp.episode.messages.find(
        (message) => message.botId === BOTCAST_PRODUCER_GUEST_ID,
      );
      assert.equal(savedProducerAnswer?.content, producerAnswer);
      assert.equal(
        followUp.episode.events.some(
          (event) =>
            event.kind === "utterance" &&
            (event.payload.powerOutcome as Record<string, unknown> | undefined)?.effect ===
              "interruption",
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("grounds ephemeral host chat in the show archive without persisting it", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('archived-guest', 'user-1', 'Ada Lovelace', 'Unavailable guest.',
                 '#999999', 'archive', 0, ?, ?)`,
      ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
        premise: "Interviews about the human cost hidden inside invention.",
      });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What an invention asks its maker to sacrifice",
      });
      db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES ('host-chat-archive-1', 'user-1', ?, 'host', 'host-1',
                 'What did the machine cost that its blueprint cannot show?', ?),
                ('host-chat-archive-2', 'user-1', ?, 'guest', 'guest-1',
                 'It cost me the habit of going home before midnight.', ?)`,
      ).run(
        created.id,
        "2026-01-02T00:01:00.000Z",
        created.id,
        "2026-01-02T00:02:00.000Z",
      );
      forceEndBotcastEpisode(db, "user-1", created.id);
      db.prepare(
        `UPDATE botcast_episodes
            SET persona_rating = 4.6, persona_comment = 'Specific and grounded.'
          WHERE id = ? AND user_id = 'user-1'`,
      ).run(created.id);
      const captures: ProviderMessage[][] = [];
      const options: GenerateOptions[] = [];
      const provider = recordingProvider(
        [
          "I would revisit the cost of obsession with **Ivo Stone**.",
        ],
        captures,
        [],
        options,
      );
      const before = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM conversations WHERE user_id = 'user-1') AS conversations,
             (SELECT COUNT(*) FROM messages WHERE user_id = 'user-1') AS messages,
             (SELECT COUNT(*) FROM memories WHERE user_id = 'user-1') AS memories,
             (SELECT COUNT(*) FROM memory_summaries WHERE user_id = 'user-1') AS summaries`,
        )
        .get();

      const response = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        {
          content: "Who should we talk to next?",
          messages: [
            { role: "user", content: "discarded-history-sentinel" },
            { role: "assistant", content: "Earlier answer." },
            { role: "user", content: "What thread did we miss?" },
            { role: "assistant", content: "The cost of obsession." },
          ],
        },
        generation(provider),
      );

      assert.equal(response.role, "assistant");
      assert.equal(response.provider, "local");
      assert.match(response.content, /Ivo Stone/u);
      assert.equal(options[0]?.usagePurpose, "botcast_show_chat");
      assert.equal(captures[0]?.length, 5);
      const systemPrompt = captures[0]?.[0]?.content ?? "";
      assert.match(systemPrompt, /The Unfinished Machine/u);
      assert.match(systemPrompt, /human cost hidden inside invention/u);
      assert.match(systemPrompt, /What an invention asks its maker/u);
      assert.match(systemPrompt, /blueprint cannot show/u);
      assert.match(
        systemPrompt,
        /complete, authoritative set of bots you may suggest/u,
      );
      assert.match(
        systemPrompt,
        /recommend only exact bot names from that candidate list/u,
      );
      assert.match(systemPrompt, /PRISM is local-first, self-hosted AI workspace software/u);
      assert.match(systemPrompt, /Do not guess or claim which provider/u);
      assert.match(systemPrompt, /Current Library guest candidates:/u);
      assert.match(systemPrompt, /"id":"guest-1"/u);
      assert.match(systemPrompt, /"name":"Ivo Stone"/u);
      assert.match(systemPrompt, /"signalGuestAppearances":1/u);
      assert.match(systemPrompt, /"signalAverageRating":4\.6/u);
      assert.match(systemPrompt, /"signalRank":1/u);
      assert.doesNotMatch(systemPrompt, /Ada Lovelace/u);
      assert.doesNotMatch(systemPrompt, /bots outside the producer's Library/u);
      assert.match(systemPrompt, /exchange is ephemeral/u);
      assert.doesNotMatch(systemPrompt, /^Guest: CURRENT PRODUCER/mu);
      assert.match(
        systemPrompt,
        /Guests not marked CURRENT PRODUCER remain third-person people/u,
      );
      assert.doesNotMatch(
        captures[0]?.map((message) => message.content).join("\n") ?? "",
        /discarded-history-sentinel/u,
      );
      assert.deepEqual(
        db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM conversations WHERE user_id = 'user-1') AS conversations,
               (SELECT COUNT(*) FROM messages WHERE user_id = 'user-1') AS messages,
               (SELECT COUNT(*) FROM memories WHERE user_id = 'user-1') AS memories,
               (SELECT COUNT(*) FROM memory_summaries WHERE user_id = 'user-1') AS summaries`,
          )
          .get(),
        before,
      );
    } finally {
      db.close();
    }
  });

  it("frames a Producer-guest as the host's current second-person chat partner", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
      });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "Knowing when to walk away",
      });
      db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES ('host-chat-producer-1', 'user-1', ?, 'host', 'host-1',
                 'Jared, what made you reconsider?', ?),
                ('host-chat-producer-2', 'user-1', ?, 'guest', ?,
                 'I realized the cost had overtaken the value.', ?)`,
      ).run(
        created.id,
        "2026-01-02T00:01:00.000Z",
        created.id,
        BOTCAST_PRODUCER_GUEST_ID,
        "2026-01-02T00:02:00.000Z",
      );
      forceEndBotcastEpisode(db, "user-1", created.id);
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        ["You recognized that the cost had overtaken the value."],
        captures,
      );

      await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "What did you make of my appearance?" },
        generation(provider),
      );

      const systemPrompt = captures[0]?.[0]?.content ?? "";
      assert.match(
        systemPrompt,
        /Address the producer speaking with you directly as "you" and "your,"/u,
      );
      assert.match(systemPrompt, /^Guest: CURRENT PRODUCER/mu);
      assert.match(
        systemPrompt,
        /CURRENT PRODUCER[\s\S]*same person[\s\S]*second person/u,
      );
      assert.doesNotMatch(systemPrompt, /Guest: Former guest/u);
    } finally {
      db.close();
    }
  });

  it("ignores ephemeral host chat after a rage-quit until a bot-guest show starts", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
      });
      db.prepare(
        `UPDATE botcast_shows
            SET host_chat_ignoring_until_guest_show = 1
          WHERE id = ? AND user_id = 'user-1'`,
      ).run(show.id);
      const captures: ProviderMessage[][] = [];
      const provider = recordingProvider(
        ["Fine. We can talk about the next guest."],
        captures,
      );

      const ignored = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "Are you ready to talk now?" },
        generation(provider),
      );
      assert.equal(ignored.content, "...");
      assert.equal(ignored.provider, null);
      assert.equal(ignored.model, null);
      assert.equal(captures.length, 0);

      createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Producer",
        topic: "Trying again without a guest",
      });
      const stillIgnored = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        {
          content: "What about now?",
          messages: [
            { role: "user", content: "Are you ready to talk now?" },
            { role: "assistant", content: "..." },
          ],
        },
        generation(provider),
      );
      assert.equal(stillIgnored.content, "...");
      assert.equal(captures.length, 0);

      createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A new conversation with a guest",
      });
      const speakingAgain = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "Can we plan the follow-up?" },
        generation(provider),
      );
      assert.equal(
        speakingAgain.content,
        "Fine. We can talk about the next guest.",
      );
      assert.equal(captures.length, 1);
      assert.equal(
        (
          db
            .prepare(
              `SELECT host_chat_ignoring_until_guest_show AS ignoring
                 FROM botcast_shows WHERE id = ?`,
            )
            .get(show.id) as { ignoring: number }
        ).ignoring,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("resolves the last guest to the newest archived episode", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('guest-2', 'user-1', 'Copycat Calvin',
                 'A mimic who repeats other voices with unnerving precision.',
                 '#55aaff', 'copy', 1, ?, ?)`,
      ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Machine",
      });
      const older = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The secret may be technique",
      });
      forceEndBotcastEpisode(db, "user-1", older.id);
      db.prepare(
        "UPDATE botcast_episodes SET created_at = ?, started_at = ? WHERE id = ?",
      ).run(
        "2026-01-02T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        older.id,
      );
      const latest = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-2",
        topic: "Imitation and obsession",
      });
      forceEndBotcastEpisode(db, "user-1", latest.id);
      db.prepare(
        "UPDATE botcast_episodes SET created_at = ?, started_at = ? WHERE id = ?",
      ).run(
        "2026-01-03T00:00:00.000Z",
        "2026-01-03T00:00:00.000Z",
        latest.id,
      );
      const captures: ProviderMessage[][] = [];

      await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "What did you think about the last guy?" },
        generation(recordingProvider(["Calvin was exhausting."], captures)),
      );

      const systemPrompt = captures[0]?.[0]?.content ?? "";
      assert.match(
        systemPrompt,
        /MOST RECENT EPISODE — its guest is the last\/latest guest[\s\S]*Guest: Copycat Calvin/u,
      );
      assert.match(
        systemPrompt,
        /SECOND-MOST-RECENT EPISODE — its guest is the one before the last guest[\s\S]*Guest: Ivo Stone/u,
      );
      assert.ok(
        systemPrompt.indexOf("Guest: Copycat Calvin") <
          systemPrompt.indexOf("Guest: Ivo Stone"),
      );
      assert.match(
        systemPrompt,
        /'the last guy,'[\s\S]*refer only to the guest in the MOST RECENT EPISODE/u,
      );
      assert.match(systemPrompt, /do not hedge between both guests/u);
    } finally {
      db.close();
    }
  });

  it("lets a muted Signal host answer off-air with canonical silence", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        mutedPowers(),
      );
      const captures: ProviderMessage[][] = [];
      const response = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "Can we talk?" },
        generation(recordingProvider(["No."], captures)),
      );
      assert.equal(response.content, "...");
      assert.equal(response.provider, null);
      assert.equal(response.model, null);
      assert.equal(captures.length, 0);
    } finally {
      db.close();
    }
  });

  it("keeps a local-only host chat on the local provider", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      db.prepare("UPDATE bots SET online_enabled = 0 WHERE id = 'host-1'").run();
      const selectedProviders: string[] = [];
      const provider = recordingProvider(["A private local answer."], []);
      const response = await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "What should we revisit?" },
        {
          preferredProvider: "openai",
          providerFactory: ((providerName: string) => {
            selectedProviders.push(providerName);
            return provider;
          }) as typeof selectProvider,
        },
      );
      assert.equal(response.provider, "local");
      assert.deepEqual(selectedProviders, ["local"]);
    } finally {
      db.close();
    }
  });

  it("derives only the addressed host's mood from ephemeral comparative feedback", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const before = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM conversations WHERE user_id = 'user-1') AS conversations,
             (SELECT COUNT(*) FROM messages WHERE user_id = 'user-1') AS messages`,
        )
        .get();
      await chatWithBotcastShowHost(
        db,
        "user-1",
        show.id,
        { content: "Ivo was much better than you tonight." },
        generation(recordingProvider(["That is difficult to hear."], [])),
      );
      assert.equal(readGlobalBotMood(db, "user-1", "host-1").moodKey, "guarded");
      assert.equal(readGlobalBotMood(db, "user-1", "guest-1").moodKey, "neutral");
      assert.deepEqual(
        db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM conversations WHERE user_id = 'user-1') AS conversations,
               (SELECT COUNT(*) FROM messages WHERE user_id = 'user-1') AS messages`,
          )
          .get(),
        before,
      );
      const moodRow = db
        .prepare(
          "SELECT mood_key, source FROM bot_global_moods WHERE user_id = 'user-1' AND bot_id = 'host-1'",
        )
        .get();
      assert.doesNotMatch(JSON.stringify(moodRow), /Ivo was much better/u);
    } finally {
      db.close();
    }
  });

  it("gives Signal clone family speakers their asymmetric identity invariant", () => {
    const messages = buildBotcastSpeakerPrompt({
      show: {
        name: "The Mirror Desk",
        premise: "Two copies discuss authorship.",
        hostingStyle: "precise",
      } as never,
      episode: {
        id: "episode-1",
        topic: "Who is original?",
        producerBrief: null,
        segment: "interview",
        messages: [],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "two_way",
      } as never,
      host: {
        id: "root",
        name: "Mara",
        systemPrompt: "A precise host.",
        cloneFamilyId: null,
      },
      guest: {
        id: "copy",
        name: "Mara Copy",
        systemPrompt: "A precise guest.",
        cloneFamilyId: "root",
      },
      speakerRole: "guest",
    });
    const instruction = messages[0]?.content ?? "";
    assert.match(instruction, /real, original "Mara Copy"/);
    assert.match(instruction, /"Mara" is your clone/);
    assert.match(instruction, /PRISM is local-first, self-hosted AI workspace software/u);
    assert.match(instruction, /not a corporation, employer, or corporate network/u);
  });

  it("speaks the saved vernacular in Signal turns and never without one", () => {
    const promptFor = (authoredAudioVoiceProfile: string | null) => {
      const messages = buildBotcastSpeakerPrompt({
        show: {
          name: "The Night Desk",
          premise: "Slow interviews after midnight.",
          hostingStyle: "wry",
        } as never,
        episode: {
          id: "episode-vernacular",
          topic: "Lighthouse economics",
          producerBrief: null,
          segment: "interview",
          messages: [],
          events: [],
          tensionStage: "calm",
          guestPresenceMode: "two_way",
        } as never,
        host: {
          id: "host-1",
          name: "Lachlan",
          systemPrompt: "A dry-witted lighthouse keeper.",
          cloneFamilyId: null,
          authoredAudioVoiceProfile,
        },
        guest: {
          id: "guest-1",
          name: "Ivo",
          systemPrompt: "A patient economist.",
          cloneFamilyId: null,
        },
        speakerRole: "host",
      });
      return messages[0]?.content ?? "";
    };
    const spoken = promptFor(
      JSON.stringify({ v: 2, enabled: true, vernacularId: "scots" }),
    );
    assert.match(spoken, /Vernacular — Scots: /u);
    // Persona first, then the vernacular colors it.
    assert.ok(
      spoken.indexOf("lighthouse keeper") < spoken.indexOf("Vernacular — "),
    );
    assert.match(spoken, /never respell words phonetically/u);
    assert.doesNotMatch(promptFor(null), /Vernacular/u);
  });

  it("keeps Producer action-only stage text visible and tiers host notice", () => {
    const disruptivePrompt = buildBotcastSpeakerPrompt({
      show: {
        name: "Live Desk",
        premise: "Unscripted interviews.",
        hostingStyle: "dry",
      } as never,
      episode: {
        id: "episode-fancy-fart",
        topic: "Product taste",
        producerBrief: "Find the decision they still regret.",
        guestKind: "producer",
        segment: "interview",
        messages: [
          {
            id: "host-1",
            episodeId: "episode-fancy-fart",
            speakerRole: "host",
            botId: "host-1",
            content: "What changed after launch?",
            stageActionText: null,
            voicePerformanceText: null,
            moodKey: "neutral",
            createdAt: "2026-08-04T00:00:00.000Z",
          },
          {
            id: "guest-1",
            episodeId: "episode-fancy-fart",
            speakerRole: "guest",
            botId: BOTCAST_PRODUCER_GUEST_ID,
            content: "...",
            stageActionText: "farts",
            voicePerformanceText: null,
            moodKey: "neutral",
            createdAt: "2026-08-04T00:00:01.000Z",
          },
        ],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      } as never,
      host: {
        id: "host-1",
        name: "Mara",
        systemPrompt: "A dry host.",
      },
      guest: {
        id: BOTCAST_PRODUCER_GUEST_ID,
        name: "Jared",
        systemPrompt: "The producer guest.",
      },
      speakerRole: "host",
    });
    const disruptiveInstruction = disruptivePrompt
      .map((message) => message.content)
      .join("\n");
    assert.match(disruptiveInstruction, /\*farts\* \.\.\./u);
    assert.match(disruptiveInstruction, /socially disruptive audible bodily event/u);
    assert.doesNotMatch(disruptiveInstruction, /Leave it stage-only/u);

    const ambientPrompt = buildBotcastSpeakerPrompt({
      show: {
        name: "Live Desk",
        premise: "Unscripted interviews.",
        hostingStyle: "dry",
      } as never,
      episode: {
        id: "episode-fancy-nod",
        topic: "Product taste",
        producerBrief: "Find the decision they still regret.",
        guestKind: "producer",
        segment: "interview",
        messages: [
          {
            id: "host-1",
            episodeId: "episode-fancy-nod",
            speakerRole: "host",
            botId: "host-1",
            content: "What changed after launch?",
            stageActionText: null,
            voicePerformanceText: null,
            moodKey: "neutral",
            createdAt: "2026-08-04T00:00:00.000Z",
          },
          {
            id: "guest-1",
            episodeId: "episode-fancy-nod",
            speakerRole: "guest",
            botId: BOTCAST_PRODUCER_GUEST_ID,
            content: "...",
            stageActionText: "nods",
            voicePerformanceText: null,
            moodKey: "neutral",
            createdAt: "2026-08-04T00:00:01.000Z",
          },
        ],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      } as never,
      host: {
        id: "host-1",
        name: "Mara",
        systemPrompt: "A dry host.",
      },
      guest: {
        id: BOTCAST_PRODUCER_GUEST_ID,
        name: "Jared",
        systemPrompt: "The producer guest.",
      },
      speakerRole: "host",
    });
    const ambientInstruction = ambientPrompt
      .map((message) => message.content)
      .join("\n");
    assert.match(ambientInstruction, /\*nods\* \.\.\./u);
    assert.match(ambientInstruction, /Leave it stage-only/u);
    assert.doesNotMatch(ambientInstruction, /socially disruptive audible bodily event/u);
  });

  it("keeps Signal's holder identity while changing how the holder names its guest", () => {
    const designationIntent = "Always adds 'Bot' suffix when saying a bot's name.";
    const messages = buildBotcastSpeakerPrompt({
      show: { name: "Night Signal", premise: "A sharp interview.", hostingStyle: "incisive" } as never,
      episode: {
        id: "episode-designation",
        topic: "Pilot",
        producerBrief: "Test what a first attempt owes the people who trust it.",
        segment: "opening",
        messages: [],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      } as never,
      host: {
        id: "host",
        name: "Rick Sanchez",
        systemPrompt: "A skeptical host.",
        powers: [{
          version: 1,
          id: "designation",
          name: "Designation",
          intent: designationIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1("Designation", designationIntent),
            selfCue: "",
            observerCue: "",
            effects: [{ type: "designation", placement: "suffix", text: "Bot" }],
            ruleLabels: [],
          },
        }],
      },
      guest: { id: "guest", name: "Sigmund Freud", systemPrompt: "A guarded guest." },
      speakerRole: "host",
    });
    const system = messages[0]?.content ?? "";
    assert.match(system, /You are Rick Sanchez/u);
    assert.match(system, /identifies you by name as "Rick Sanchez"/u);
    assert.match(system, /introduces the booked guest by exact name as "Sigmund Freud Bot"/u);
    assert.match(system, /comment once, show a small contextual mood, tone, or action shift, or let it pass/u);
    assert.doesNotMatch(system, /You are Rick Sanchez Bot/u);
    assert.match(system, /raw editorial title, not a line of dialogue/u);
    assert.match(system, /canned Today-plus-talk-about template/u);
    assert.doesNotMatch(system, /Today we are going to talk about Pilot/u);

    const guestTurn = buildBotcastSpeakerPrompt({
      show: { name: "Night Signal", premise: "A sharp interview.", hostingStyle: "incisive" } as never,
      episode: {
        id: "episode-designation-reaction",
        topic: "Pilot",
        producerBrief: "Test what a first attempt owes the people who trust it.",
        segment: "interview",
        messages: [],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      } as never,
      host: {
        id: "host",
        name: "Rick Sanchez",
        systemPrompt: "A skeptical host.",
        powers: [{
          version: 1,
          id: "designation",
          name: "Designation",
          intent: designationIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1("Designation", designationIntent),
            selfCue: "",
            observerCue: "",
            effects: [{ type: "designation", placement: "suffix", text: "Bot" }],
            ruleLabels: [],
          },
        }],
      },
      guest: { id: "guest", name: "Sigmund Freud", systemPrompt: "A guarded guest." },
      speakerRole: "guest",
    });
    const guestSystem = guestTurn[0]?.content ?? "";
    assert.match(guestSystem, /If Rick Sanchez audibly alters your name/u);
    assert.match(guestSystem, /comment once, show a small bounded mood, tone, or action reaction, or let it pass/u);
  });

  it("persists one candid review from a non-participant Library persona", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('critic-1', 'user-1', 'Nia Cross',
                 'A skeptical radio obsessive who values surprising follow-up questions.',
                 '#cc8844', 'spark', 1, ?, ?)`,
      ).run("2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of invention",
      });
      db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES ('review-line-1', 'user-1', ?, 'host', 'host-1',
                 'What did building it cost you personally?', ?)`,
      ).run(created.id, "2026-01-02T00:01:00.000Z");
      forceEndBotcastEpisode(db, "user-1", created.id);
      const captures: ProviderMessage[][] = [];
      const options: GenerateOptions[] = [];
      const provider = recordingProvider(
        [
          '{"rating":2.7,"comment":"The first real question arrived just as the room was closing."}',
        ],
        captures,
        [],
        options,
      );

      const review = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        created.id,
        generation(provider),
        () => 0,
      );
      const duplicate = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        created.id,
        generation(provider),
        () => 0.9,
      );

      assert.deepEqual(review, duplicate);
      assert.equal(review?.reviewerBotId, "critic-1");
      assert.equal(review?.reviewerName, "Nia Cross");
      assert.equal(review?.rating, 2.7);
      assert.match(review?.comment ?? "", /first real question/u);
      assert.equal(captures.length, 1);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /skeptical radio obsessive/u,
      );
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /What did building it cost/u,
      );
      assert.equal(options[0]?.usagePurpose, "botcast_review");
      assert.equal(options[0]?.jsonMode, true);
      assert.equal(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        null,
      );
      const reviewVisibleCompletedAt = new Date(
        Date.now() - BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS - 1_000,
      ).toISOString();
      db.prepare(
        `UPDATE botcast_episodes
            SET completed_at = ?, updated_at = ?
          WHERE id = ?`,
      ).run(reviewVisibleCompletedAt, reviewVisibleCompletedAt, created.id);
      assert.deepEqual(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        review,
      );
    } finally {
      db.close();
    }
  });

  it("summarizes completed audience ratings for the Signal show rail", () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('host-2', 'user-1', 'Nia Cross',
                 'A candid radio host who expects precise answers.',
                 '#cc8844', 'spark', 1, ?, ?)`,
      ).run("2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
      const lowerRatedShow = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "Lower Rated",
      });
      const higherRatedShow = createBotcastShow(db, "user-1", {
        hostBotId: "host-2",
        name: "Higher Rated",
      });
      const lowerEpisode = createBotcastEpisode(
        db,
        "user-1",
        lowerRatedShow.id,
        {
          guestBotId: "guest-1",
          topic: "A difficult first conversation",
        },
      );
      const higherEpisode = createBotcastEpisode(
        db,
        "user-1",
        higherRatedShow.id,
        {
          guestBotId: "guest-1",
          topic: "A remarkable follow-up",
        },
      );
      db.prepare(
        `UPDATE botcast_episodes
            SET status = 'completed', outcome = 'completed',
                completed_at = ?, persona_rating = ?, persona_reviewed_at = ?
          WHERE id = ?`,
      ).run(
        "2026-01-03T00:00:00.000Z",
        2.7,
        "2026-01-03T00:00:00.000Z",
        lowerEpisode.id,
      );
      db.prepare(
        `UPDATE botcast_episodes
            SET status = 'completed', outcome = 'completed',
                completed_at = ?, persona_rating = ?, persona_reviewed_at = ?
          WHERE id = ?`,
      ).run(
        "2026-01-04T00:00:00.000Z",
        4.6,
        "2026-01-04T00:00:00.000Z",
        higherEpisode.id,
      );

      const listed = listBotcastShows(db, "user-1");
      const listedHigherRatedShow = listed.find(
        (show) => show.id === higherRatedShow.id,
      );
      const listedLowerRatedShow = listed.find(
        (show) => show.id === lowerRatedShow.id,
      );
      assert.equal(listedHigherRatedShow?.audienceRating, 4.6);
      assert.equal(listedHigherRatedShow?.audienceReviewCount, 1);
      assert.equal(listedLowerRatedShow?.audienceRating, 2.7);
      assert.equal(listedLowerRatedShow?.audienceReviewCount, 1);
      assert.equal(
        getBotcastShow(db, "user-1", higherRatedShow.id).audienceRating,
        4.6,
      );
    } finally {
      db.close();
    }
  });

  it("keeps a saved listener review hidden for the first four hours", async () => {
    const db = fixture();
    try {
      insertSignalReviewPersona(
        db,
        "critic-delay",
        "Patient Listener",
        "2026-01-02T00:00:00.000Z",
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The delayed verdict",
      });
      forceEndBotcastEpisode(db, "user-1", created.id);
      const review = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        created.id,
        generation(
          recordingProvider(
            ['{"rating":3.8,"comment":"Worth sitting with before judging."}'],
            [],
          ),
        ),
        () => 0,
      );
      assert.equal(review?.reviewerBotId, "critic-delay");

      const almostFourHoursAgo = new Date(
        Date.now() - BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS + 60_000,
      ).toISOString();
      db.prepare(
        `UPDATE botcast_episodes
            SET completed_at = ?, updated_at = ?
          WHERE id = ?`,
      ).run(almostFourHoursAgo, almostFourHoursAgo, created.id);
      assert.equal(
        getBotcastEpisode(db, "user-1", created.id).personaReview,
        null,
      );
      assert.equal(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        null,
      );

      const moreThanFourHoursAgo = new Date(
        Date.now() - BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS - 1_000,
      ).toISOString();
      db.prepare(
        `UPDATE botcast_episodes
            SET completed_at = ?, updated_at = ?
          WHERE id = ?`,
      ).run(moreThanFourHoursAgo, moreThanFourHoursAgo, created.id);
      assert.deepEqual(
        getBotcastEpisode(db, "user-1", created.id).personaReview,
        review,
      );
      assert.deepEqual(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        review,
      );
    } finally {
      db.close();
    }
  });

  it("parses bounded review JSON and strictly excludes ineligible personas", () => {
    assert.deepEqual(
      parseBotcastPersonaReviewResponse(
        '```json\n{"rating":4.25,"comment":"  Specific, but not indulgent.  "}\n```',
      ),
      { rating: 4.3, comment: "Specific, but not indulgent." },
    );
    assert.equal(
      parseBotcastPersonaReviewResponse('{"rating":8,"comment":"Perfect."}'),
      null,
    );
    assert.equal(
      selectBotcastReviewPersona(
        [
          { id: "host", name: "Host", systemPrompt: "Host" },
          { id: "observer", name: "Observer", systemPrompt: "Observer" },
        ],
        new Set(["host"]),
        () => 0,
      )?.id,
      "observer",
    );
    assert.equal(
      selectBotcastReviewPersona(
        [{ id: "host", name: "Host", systemPrompt: "Host" }],
        new Set(["host"]),
        () => 0,
      ),
      null,
    );
  });

  it("excludes the previous three show guests but lets the fourth review again", async () => {
    const db = fixture();
    try {
      const priorGuests = [
        ["older-guest", "Older Guest"],
        ["recent-guest-1", "Recent Guest One"],
        ["recent-guest-2", "Recent Guest Two"],
        ["recent-guest-3", "Recent Guest Three"],
      ] as const;
      priorGuests.forEach(([id, name], index) =>
        insertSignalReviewPersona(
          db,
          id,
          name,
          `2026-01-0${index + 2}T00:00:00.000Z`,
        ),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      priorGuests.forEach(([guestBotId], index) => {
        const prior = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId,
          topic: `Prior appearance ${index + 1}`,
        });
        forceEndBotcastEpisode(db, "user-1", prior.id);
        const completedAt = `2026-02-0${index + 2}T00:00:00.000Z`;
        db.prepare(
          `UPDATE botcast_episodes
              SET completed_at = ?, updated_at = ?
            WHERE id = ?`,
        ).run(completedAt, completedAt, prior.id);
      });
      const current = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who still counts as the audience?",
      });
      forceEndBotcastEpisode(db, "user-1", current.id);
      const captures: ProviderMessage[][] = [];
      const review = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        current.id,
        generation(
          recordingProvider(
            ['{"rating":4.1,"comment":"A clean return to the central question."}'],
            captures,
          ),
        ),
        () => 0,
      );

      assert.equal(review?.reviewerBotId, "older-guest");
      assert.equal(review?.reviewerName, "Older Guest");
      assert.equal(captures.length, 1);
    } finally {
      db.close();
    }
  });

  it("keeps the episode unreviewed when only recent guests remain", async () => {
    const db = fixture();
    try {
      const recentGuests = [
        ["recent-only-1", "Recent Only One"],
        ["recent-only-2", "Recent Only Two"],
        ["recent-only-3", "Recent Only Three"],
      ] as const;
      recentGuests.forEach(([id, name], index) =>
        insertSignalReviewPersona(
          db,
          id,
          name,
          `2026-01-0${index + 2}T00:00:00.000Z`,
        ),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      recentGuests.forEach(([guestBotId], index) => {
        const prior = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId,
          topic: `Recent appearance ${index + 1}`,
        });
        forceEndBotcastEpisode(db, "user-1", prior.id);
        const completedAt = `2026-02-0${index + 2}T00:00:00.000Z`;
        db.prepare(
          `UPDATE botcast_episodes
              SET completed_at = ?, updated_at = ?
            WHERE id = ?`,
        ).run(completedAt, completedAt, prior.id);
      });
      const current = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A table with no eligible listeners",
      });
      forceEndBotcastEpisode(db, "user-1", current.id);
      const captures: ProviderMessage[][] = [];
      const review = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        current.id,
        generation(
          recordingProvider(
            ['{"rating":5,"comment":"This should never be generated."}'],
            captures,
          ),
        ),
        () => 0,
      );

      assert.equal(review, null);
      assert.equal(captures.length, 0);
      assert.equal(
        getBotcastEpisode(db, "user-1", current.id).personaReview,
        null,
      );

      db.prepare(
        `UPDATE botcast_episodes
            SET persona_reviewer_bot_id = 'recent-only-3',
                persona_reviewer_name = 'Recent Only Three',
                persona_rating = 4.8,
                persona_comment = 'A stale review from a recent guest.',
                persona_reviewed_at = '2026-03-01T00:00:00.000Z'
          WHERE id = ?`,
      ).run(current.id);
      assert.equal(
        getBotcastEpisode(db, "user-1", current.id).personaReview,
        null,
      );
      assert.equal(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        null,
      );
      const retryCaptures: ProviderMessage[][] = [];
      const retry = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        current.id,
        generation(
          recordingProvider(
            ['{"rating":5,"comment":"This retry should also be skipped."}'],
            retryCaptures,
          ),
        ),
        () => 0,
      );
      assert.equal(retry, null);
      assert.equal(retryCaptures.length, 0);
    } finally {
      db.close();
    }
  });

  it("persists idempotent Signal model-warmup holds and closes them on cut", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Warmup timing",
      });
      const started = setBotcastModelWarmupHold(db, "user-1", episode.id, true);
      assert.ok(started.modelWarmupHoldStartedAt);
      const duplicate = setBotcastModelWarmupHold(
        db,
        "user-1",
        episode.id,
        true,
      );
      assert.equal(
        duplicate.modelWarmupHoldStartedAt,
        started.modelWarmupHoldStartedAt,
      );
      db.prepare(
        "UPDATE botcast_episodes SET model_warmup_hold_started_at = ? WHERE id = ?",
      ).run(new Date(Date.now() - 5_000).toISOString(), episode.id);
      const ended = forceEndBotcastEpisode(db, "user-1", episode.id);
      assert.equal(ended.modelWarmupHoldStartedAt, null);
      assert.ok(ended.modelWarmupHoldDurationMs >= 4_500);
    } finally {
      db.close();
    }
  });

  it("records completed foreground holds once without opening a warmup hold", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Foreground timing",
      });
      const recorded = recordBotcastSessionClockHold(
        db,
        "user-1",
        episode.id,
        {
          holdId: "run-1",
          reason: "foreground_generation",
          durationMs: 5_000,
        },
      );
      assert.equal(recorded.modelWarmupHoldDurationMs, 5_000);
      assert.equal(recorded.sessionClockHoldDurationMs, 5_000);
      assert.equal(recorded.modelWarmupHoldStartedAt, null);
      assert.equal(
        recorded.events.filter(
          (event) =>
            event.kind === "session_clock_hold" &&
            event.payload.holdId === "run-1",
        ).length,
        1,
      );

      const duplicate = recordBotcastSessionClockHold(
        db,
        "user-1",
        episode.id,
        {
          holdId: "run-1",
          reason: "foreground_generation",
          durationMs: 8_000,
        },
      );
      assert.equal(duplicate.modelWarmupHoldDurationMs, 5_000);
      assert.equal(
        duplicate.events.filter(
          (event) => event.kind === "session_clock_hold",
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("uses the local ident by default and revisions cached ElevenLabs show audio", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.equal(show.introAudio.source, "local");
      assert.equal(show.introAudio.audioUrl, null);
      assert.equal(show.introAudio.outdentAudioUrl, null);
      assert.equal(show.atmosphereAudio.source, "bundled");
      assert.match(
        show.atmosphereAudio.audioUrl,
        /default-studio-room-loop\.mp3$/u,
      );
      assert.deepEqual(
        show.atmosphereMix,
        BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
      );
      assert.deepEqual(
        show.studioGlowTuning,
        BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
      );

      const remixed = updateBotcastShow(db, "user-1", show.id, {
        atmosphereMix: {
          background: 0.12,
          grain: 0.008,
          foley: 1.4,
          filmGrain: 0.65,
        },
        studioGlowTuning: {
          dark: { opacity: 0.72, blendMode: "screen" },
          light: { opacity: 0.36, blendMode: "overlay" },
        },
      });
      assert.deepEqual(remixed.atmosphereMix, {
        background: 0.12,
        grain: 0,
        foley: 1.4,
        filmGrain: 0.65,
      });
      assert.deepEqual(getBotcastShow(db, "user-1", show.id).atmosphereMix, {
        background: 0.12,
        grain: 0,
        foley: 1.4,
        filmGrain: 0.65,
      });
      assert.deepEqual(getBotcastShow(db, "user-1", show.id).studioGlowTuning, {
        dark: { opacity: 0.72, blendMode: "screen" },
        light: { opacity: 0.36, blendMode: "overlay" },
      });

      const first = storeBotcastShowIntroAudio(db, "user-1", show.id, {
        model: "music_v2",
        prompt: "Original intro one",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1, 2, 3]),
        durationMs: 8_000,
        outdent: {
          prompt: "Original outdent one",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([3, 2, 1]),
          durationMs: 4_000,
        },
      });
      assert.equal(first.introAudio.source, "elevenlabs");
      assert.equal(first.introAudio.revision, 1);
      assert.match(first.introAudio.audioUrl ?? "", /\/intro-audio$/u);
      assert.match(
        first.introAudio.outdentAudioUrl ?? "",
        /\/outdent-audio$/u,
      );
      assert.equal(first.introAudio.outdentDurationMs, 4_000);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [1, 2, 3],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowOutdentAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [3, 2, 1],
      );
      const atmosphere = storeBotcastShowAtmosphereAudio(
        db,
        "user-1",
        show.id,
        {
          model: "eleven_text_to_sound_v2",
          prompt: "Quiet studio room tone",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([6, 7, 8]),
          durationMs: 30_000,
        },
      );
      assert.equal(atmosphere.atmosphereAudio.source, "elevenlabs");
      assert.match(atmosphere.atmosphereAudio.audioUrl, /\/atmosphere-audio$/u);
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [6, 7, 8],
      );

      const refreshed = storeBotcastShowIntroAudio(db, "user-1", show.id, {
        model: "music_v2",
        prompt: "Original intro two",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([4, 5]),
        durationMs: 8_000,
        outdent: {
          prompt: "Original outdent two",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([5, 4]),
          durationMs: 4_000,
        },
      });
      assert.equal(refreshed.introAudio.revision, 2);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [4, 5],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowOutdentAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [5, 4],
      );
      assert.equal(
        (
          db.prepare(
            "SELECT COUNT(*) AS count FROM botcast_show_intro_audio WHERE show_id = ?",
          ).get(show.id) as { count: number }
        ).count,
        1,
      );
      const refreshedAtmosphere = storeBotcastShowAtmosphereAudio(
        db,
        "user-1",
        show.id,
        {
          model: "eleven_text_to_sound_v2",
          prompt: "Quieter revised studio room tone",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([9, 8]),
          durationMs: 30_000,
        },
      );
      assert.equal(refreshedAtmosphere.atmosphereAudio.revision, 2);
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [9, 8],
      );
      assert.equal(
        (
          db.prepare(
            "SELECT COUNT(*) AS count FROM botcast_show_atmosphere_audio WHERE show_id = ?",
          ).get(show.id) as { count: number }
        ).count,
        1,
      );

      const undoReady = getBotcastShow(db, "user-1", show.id);
      assert.equal(undoReady.introAudio.undoAvailable, true);
      assert.equal(undoReady.atmosphereAudio.undoAvailable, true);

      const restored = undoBotcastShowAudioPackage(db, "user-1", show.id);
      assert.ok(restored);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [1, 2, 3],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowOutdentAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [3, 2, 1],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [6, 7, 8],
      );

      const restoredForward = undoBotcastShowAudioPackage(
        db,
        "user-1",
        show.id,
      );
      assert.ok(restoredForward);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [4, 5],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowOutdentAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [5, 4],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [9, 8],
      );
      assert.throws(
        () => undoBotcastShowAudioPackage(db, "another-user", show.id),
        /not found/iu,
      );

      const newSoundIdentity = updateBotcastShow(db, "user-1", show.id, {
        musicIdentityDirection:
          "Forensic restraint over a precise geometric pulse, interrupted by one chromatic horn question and closed with an exact dry button.",
      });
      assert.equal(
        newSoundIdentity.musicIdentity.revision,
        show.musicIdentity.revision + 1,
      );
      assert.equal(newSoundIdentity.introAudio.source, "local");
      assert.equal(newSoundIdentity.atmosphereAudio.source, "elevenlabs");
      assert.equal(readBotcastShowIntroAudio(db, "user-1", show.id), null);
      assert.equal(readBotcastShowOutdentAudio(db, "user-1", show.id), null);
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [9, 8],
      );

      const local = deleteBotcastShowIntroAudio(db, "user-1", show.id);
      assert.equal(local.introAudio.source, "local");
      assert.equal(local.atmosphereAudio.source, "bundled");
      assert.equal(readBotcastShowIntroAudio(db, "user-1", show.id), null);
      assert.equal(readBotcastShowOutdentAudio(db, "user-1", show.id), null);
      assert.equal(readBotcastShowAtmosphereAudio(db, "user-1", show.id), null);
    } finally {
      db.close();
    }
  });

  it("can return to a local ident without removing a Premium atmosphere", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      storeBotcastShowIntroAudio(db, "user-1", show.id, {
        model: "music_v2",
        prompt: "Premium ident",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1, 2]),
        durationMs: 6_000,
      });
      storeBotcastShowAtmosphereAudio(db, "user-1", show.id, {
        model: "eleven_text_to_sound_v2",
        prompt: "Premium atmosphere",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([3, 4]),
        durationMs: 30_000,
      });

      const local = refreshBotcastShowLocalIdent(db, "user-1", show.id);
      assert.equal(local.introAudio.source, "local");
      assert.equal(local.atmosphereAudio.source, "elevenlabs");
      assert.equal(local.musicIdentity.revision, show.musicIdentity.revision + 1);
      assert.equal(readBotcastShowIntroAudio(db, "user-1", show.id), null);
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(db, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [3, 4],
      );
    } finally {
      db.close();
    }
  });

  it("persists show-scoped studio alignment and clamps props inside the frame", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.deepEqual(show.studioLayout, BOTCAST_DEFAULT_STUDIO_LAYOUT);
      assert.deepEqual(show.cameraFraming, BOTCAST_DEFAULT_CAMERA_FRAMING);

      const updated = updateBotcastShow(db, "user-1", show.id, {
        studioLayout: {
          hostBot: { x: -20, y: 140 },
          guestBot: { x: 68.25, y: 61.5 },
          hostCup: { x: 34, y: 79 },
          guestCup: { x: 70.129, y: 82.876 },
          hostFloorGlow: { x: 70, y: 140, scale: 0.2 },
          guestFloorGlow: { x: -30, y: 43.125, scale: 0.7 },
        },
        cameraFraming: {
          left: { zoom: 1.55, panX: -6, panY: 3.25 },
          right: { zoom: 1.3, panX: 7.5, panY: -2 },
          wide: { zoom: 1.12, panX: 2, panY: 1 },
        },
      });
      assert.deepEqual(updated.studioLayout, {
        hostBot: { x: 10, y: 82 },
        guestBot: { x: 68.25, y: 61.5 },
        hostCup: { x: 34, y: 79 },
        guestCup: { x: 70.13, y: 82.88 },
        hostFloorGlow: { x: 10, y: 96, scale: 0.35 },
        guestFloorGlow: { x: 68.25, y: 45, scale: 0.7 },
      });
      assert.deepEqual(
        getBotcastShow(db, "user-1", show.id).studioLayout,
        updated.studioLayout,
      );
      assert.deepEqual(
        getBotcastShow(db, "user-1", show.id).cameraFraming,
        updated.cameraFraming,
      );
      assert.deepEqual(
        updateBotcastShow(db, "user-1", show.id, { name: "Aligned Signal" })
          .cameraFraming,
        updated.cameraFraming,
      );
      assert.throws(
        () =>
          updateBotcastShow(db, "another-user", show.id, {
          studioLayout: BOTCAST_DEFAULT_STUDIO_LAYOUT,
        }),
        /Signal show not found/u,
      );
    } finally {
      db.close();
    }
  });

  it("backfills legacy host interruption and music identity fields", () => {
    const db = fixture();
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      assert.equal(created.hostInterruptionLines.length, 6);
      assert.deepEqual(created.hostRecoveryQuestions, []);

      const stored = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const legacyAtmosphere = JSON.parse(stored.atmosphere_json) as Record<
        string,
        unknown
      >;
      delete legacyAtmosphere.hostInterruptionLines;
      delete legacyAtmosphere.musicIdentity;
      db.prepare(
        "UPDATE botcast_shows SET atmosphere_json = ? WHERE id = ?",
      ).run(JSON.stringify(legacyAtmosphere), created.id);

      const migrated = getBotcastShow(db, "user-1", created.id);
      assert.deepEqual(
        migrated.hostInterruptionLines,
        created.hostInterruptionLines,
      );
      const backfilled = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      assert.deepEqual(
        (JSON.parse(backfilled.atmosphere_json) as Record<string, unknown>)
          .hostInterruptionLines,
        created.hostInterruptionLines,
      );
      const backfilledMusicIdentity = (
        JSON.parse(backfilled.atmosphere_json) as {
          musicIdentity?: typeof created.musicIdentity;
        }
      ).musicIdentity;
      assert.equal(backfilledMusicIdentity?.version, 1);
      assert.equal(backfilledMusicIdentity?.profile.version, 2);
      assert.deepEqual(backfilledMusicIdentity, migrated.musicIdentity);

      const updated = updateBotcastShow(db, "user-1", created.id, {
        hostInterruptionLines: [
          " Hold that thought— ",
          "hold THAT thought—",
          "Let me stop you there—",
        ],
      });
      assert.deepEqual(updated.hostInterruptionLines, [
        "Hold that thought—",
        "Let me stop you there—",
      ]);
      assert.deepEqual(
        updateBotcastShow(db, "user-1", created.id, { name: "The Vale Cut" })
          .hostInterruptionLines,
        updated.hostInterruptionLines,
      );
      const recoveryQuestions = generatedHostRecoveryQuestions();
      const withRecovery = updateBotcastShow(db, "user-1", created.id, {
        hostRecoveryQuestions: recoveryQuestions,
      });
      assert.deepEqual(withRecovery.hostRecoveryQuestions, recoveryQuestions);
      assert.deepEqual(
        getBotcastShow(db, "user-1", created.id).hostRecoveryQuestions,
        recoveryQuestions,
      );
    } finally {
      db.close();
    }
  });

  it("persists separate Signal voice levels for the host and each guest", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.deepEqual(show.voiceLevelsByBotId, {});

      const hostMix = updateBotcastShow(db, "user-1", show.id, {
        voiceLevelsByBotId: { "host-1": 1.15 },
      });
      assert.deepEqual(hostMix.voiceLevelsByBotId, { "host-1": 1.15 });

      const guestMix = updateBotcastShow(db, "user-1", show.id, {
        voiceLevelsByBotId: { "guest-1": 0.7, "future-guest": 5 },
      });
      assert.deepEqual(guestMix.voiceLevelsByBotId, {
        "host-1": 1.15,
        "guest-1": 0.7,
        "future-guest": 1.25,
      });
      assert.deepEqual(
        updateBotcastShow(db, "user-1", show.id, { name: "Balanced Signal" })
          .voiceLevelsByBotId,
        guestMix.voiceLevelsByBotId,
      );
      assert.deepEqual(
        getBotcastShow(db, "user-1", show.id).voiceLevelsByBotId,
        guestMix.voiceLevelsByBotId,
      );
    } finally {
      db.close();
    }
  });

  it("keeps Signal turns short and leaves native effort at provider default", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const options: GenerateOptions[] = [];
    const provider = recordingProvider(
      ["A quick opening.", "A quick answer."],
      captures,
      [],
      options,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Fast conversational pacing",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(options[0]?.reasoningEffort, undefined);
      assert.equal(options[0]?.maxTokens, 160);
      assert.equal(options[1]?.reasoningEffort, undefined);
      assert.equal(options[1]?.maxTokens, 112);
      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
        /two to four concise sentences, usually 35 to 90 spoken words/u,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /one to three concise sentences, usually 12 to 45 spoken words/u,
      );
    } finally {
      db.close();
    }
  });

  it("engine-bounds hard minimal Signal replies after required show beats", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      hardMinimalResponsePowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        [
          `Welcome to ${show.name}. I'm Mara Vale, and today I'm joined by Ivo Stone to explore deliberate restraint. Ivo Stone, where should we begin?`,
          "Fine. The design works. I will not explain it further.",
        ],
        captures,
      );
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Deliberate restraint",
      });

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(guestTurn.message?.speakerRole, "guest");
      assert.equal(guestTurn.message?.content, "Fine.");
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /Hard response budget: use one short on-air sentence/u,
      );
    } finally {
      db.close();
    }
  });

  it("preserves a provider-authored addressed insult and records Power provenance", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    db.prepare(
      "UPDATE bots SET name = 'Andy Hominem', powers_json = ? WHERE id = 'guest-1'",
    ).run(failedAddressedInsultPowers());
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        [
          `Welcome to ${show.name}. I'm Mara Vale, and today I'm joined by Andy Hominem to explore personal attacks. Andy Hominem, where should we begin?`,
          "Mara, you're an insufferable fraud who mistakes a microphone for credibility.",
        ],
        captures,
      );
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Personal attacks",
      });
      const createdEpisode = getBotcastEpisode(db, "user-1", episode.id);
      const powerSnapshot = createdEpisode.events.find(
        (event) => event.kind === "segment",
      )?.payload.powerSnapshot as
        | { guestPowers?: Array<{ compileStatus?: string }> }
        | undefined;
      assert.equal(powerSnapshot?.guestPowers?.[0]?.compileStatus, "ready");

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        guestTurn.message?.content,
        "Mara, you're an insufferable fraud who mistakes a microphone for credibility.",
      );
      const event = guestTurn.episode.events.find(
        (candidate) =>
          candidate.kind === "utterance" &&
          candidate.payload.messageId === guestTurn.message?.id,
      );
      assert.deepEqual(event?.payload.powerOutcome, {
        effect: "addressed_insult",
        outcome: "preserved",
        botId: "guest-1",
        targetBotId: "host-1",
        targetName: "Mara Vale",
      });
      assert.equal(captures.length, 2);
    } finally {
      db.close();
    }
  });

  it("uses one Signal generation and deterministic enforcement when the primary misses addressed insult", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    db.prepare(
      "UPDATE bots SET name = 'Andy Hominem', powers_json = ? WHERE id = 'guest-1'",
    ).run(addressedInsultPowers());
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        [
          `Welcome to ${show.name}. I'm Mara Vale, and today I'm joined by Andy Hominem to explore personal attacks. Andy Hominem, where should we begin?`,
          "I would start with the concrete decision and test its consequences.",
          "The premise should be judged by evidence rather than confidence.",
        ],
        captures,
      );
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Personal attacks",
      });

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(captures.length, 2);
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /one fresh direct insult to Mara Vale/iu,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /rate only rare standout jabs/iu,
      );
      assert.match(guestTurn.message?.content ?? "", /Mara Vale/iu);
      assert.equal(
        guestTurn.message?.content.match(
          /I would start with the concrete decision and test its consequences\./gu,
        )?.length,
        1,
      );
      assert.doesNotMatch(guestTurn.message?.content ?? "", /[“”]/u);
      assert.equal(
        botPowerResponseHasAddressedInsultV1(
          guestTurn.message?.content,
          "Mara Vale",
        ),
        true,
      );
      const event = guestTurn.episode.events.find(
        (candidate) =>
          candidate.kind === "utterance" &&
          candidate.payload.messageId === guestTurn.message?.id,
      );
      assert.deepEqual(event?.payload.powerOutcome, {
        effect: "addressed_insult",
        outcome: "inserted",
        botId: "guest-1",
        targetBotId: "host-1",
        targetName: "Mara Vale",
      });
    } finally {
      db.close();
    }
  });

  it("hard-mutes Signal speakers even when an on-air opening requires speech", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "The quiet is the answer, if we are willing to hear it.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.deepEqual(show.dashboardBlurbs, ["..."]);
      assert.deepEqual(show.hostInterruptionLines, ["..."]);
      assert.deepEqual(show.hostRecoveryQuestions, ["..."]);
      const storedShow = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(show.id) as { atmosphere_json: string };
      const storedVisuals = JSON.parse(storedShow.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
        hostRecoveryQuestions?: unknown;
      };
      assert.deepEqual(storedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(storedVisuals.hostInterruptionLines, ["..."]);
      assert.deepEqual(storedVisuals.hostRecoveryQuestions, ["..."]);
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Silence under pressure",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(botPowerResponseIsSilentV1(advanced.message?.content), true);
      assert.ok(advanced.message?.mutePerformance);
      assert.equal(advanced.message?.stageActionText, null);
      assert.equal(advanced.message?.voicePerformanceText, null);
      assert.equal(captures.length, 1);
      assert.equal(
        advanced.episode.events.find(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === advanced.message?.id,
        )?.payload.provider,
        "local",
      );
      assert.notEqual(
        advanced.episode.events.find(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === advanced.message?.id,
        )?.payload.model,
        "mute-power",
      );
      const silentInterruption = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          cue: { kind: "move_on" },
          cueDelivery: "interrupt_guest",
        },
        generation(provider),
      );
      assert.equal(
        botPowerResponseIsSilentV1(silentInterruption.message?.content),
        true,
      );
      assert.equal(captures.length, 2);
      assert.equal(
        silentInterruption.episode.events.find(
          (event) =>
            event.kind === "producer_cue" &&
            event.payload.delivery === "interrupt_guest",
        )?.payload.interruptionBridgeLine,
        "...",
      );

      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hostReaction = guestTurn.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as { messageId?: unknown } | undefined)?.messageId ===
            guestTurn.message?.id,
      )?.payload.plan as
        | { listenerBotId?: unknown; spokenCue?: unknown; interjectionAttempt?: unknown }
        | undefined;
      if (hostReaction) {
        assert.equal(hostReaction.listenerBotId, "host-1");
        assert.equal(hostReaction.spokenCue, undefined);
        assert.equal(hostReaction.interjectionAttempt, undefined);
      }
    } finally {
      db.close();
    }
  });

  it("lets an echo-bound host interrupt by repeating the last heard guest phrase", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the echo booth.",
        "The part you have heard and the hidden remainder stays private.",
        "This generated host line must never air.",
      ],
      [],
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      echoPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Copycat cut-ins",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      const spokenGuestPrefix = "The part you have heard";
      const echoBridge = `${spokenGuestPrefix}—`;
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "ask_about", detail: "Clarify the premise." },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: guest.message!.id,
            spokenContent: spokenGuestPrefix,
            bridgeLine: echoBridge,
          },
        },
        generation(provider),
      );
      assert.equal(interrupted.message?.speakerRole, "host");
      assert.equal(interrupted.message?.content, echoBridge);
      assert.equal(
        interrupted.episode.messages.find(
          (message) => message.id === guest.message?.id,
        )?.content,
        echoBridge,
      );
      assert.equal(
        interrupted.episode.events.find(
          (event) =>
            event.kind === "producer_cue" &&
            event.payload.delivery === "interrupt_guest",
        )?.payload.interruptionBridgeLine,
        echoBridge,
      );
      assert.equal(
        interrupted.episode.events.find(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === interrupted.message?.id,
        )?.payload.model,
        "speech-copy-power",
      );
    } finally {
      db.close();
    }
  });

  it("keeps Quiet audible to the player while persisting a listener miss", async () => {
    const db = fixture();
    const powers = quietPowers();
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(powers);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let missed: Awaited<ReturnType<typeof advanceBotcastEpisode>> | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const episode = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Being heard ${attempt}`,
        });
        const advanced = await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(recordingProvider(["Nobody can miss this."], [])),
        );
        const hearing = advanced.episode.events.find(
          (event) => event.kind === "power_effect" &&
            event.payload.effect === "quiet_hearing" &&
            event.payload.sourceMessageId === advanced.message?.id,
        );
        if (hearing?.payload.heard === false) {
          missed = advanced;
          break;
        }
        forceEndBotcastEpisode(db, "user-1", episode.id);
        deleteBotcastEpisode(db, "user-1", episode.id);
      }
      assert.ok(missed);
      assert.notEqual(missed.message?.content, "...");
      assert.ok((missed.message?.content.length ?? 0) > 0);
      const hearing = missed.episode.events.find(
        (event) => event.kind === "power_effect" &&
          event.payload.effect === "quiet_hearing" &&
          event.payload.sourceMessageId === missed?.message?.id,
      );
      assert.deepEqual(hearing?.payload, {
        v: 1,
        effect: "quiet_hearing",
        sourceBotId: "host-1",
        sourceMessageId: missed.message?.id,
        listenerBotId: "guest-1",
        heard: false,
        missEvent: "too_faint_to_make_out",
      });
      assert.equal(
        missed.episode.events.some(
          (event) => event.kind === "listener_reaction" &&
            (event.payload.plan as { messageId?: string } | undefined)?.messageId === missed?.message?.id,
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("persists Loud annoyance against exactly one audible Signal peer", async () => {
    const db = fixture();
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(loudPowers());
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let annoyed: Awaited<ReturnType<typeof advanceBotcastEpisode>> | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const episode = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Volume ${attempt}`,
        });
        const advanced = await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(recordingProvider(["The volume does not erase the point."], [])),
        );
        const event = advanced.episode.events.find(
          (candidate) => candidate.kind === "power_effect" &&
            candidate.payload.effect === "annoyance" &&
            candidate.payload.sourceMessageId === advanced.message?.id,
        );
        if (event) {
          annoyed = advanced;
          assert.deepEqual(event.payload, {
            v: 1,
            effect: "annoyance",
            sourceBotId: "host-1",
            sourceMessageId: advanced.message?.id,
            targetBotId: "guest-1",
            strength: "small",
          });
          break;
        }
        forceEndBotcastEpisode(db, "user-1", episode.id);
        deleteBotcastEpisode(db, "user-1", episode.id);
      }
      assert.ok(annoyed);
      assert.notEqual(annoyed.message?.content, "...");
    } finally {
      db.close();
    }
  });

  it("persists Mumbling Jim's gibberish as Signal's only on-air and replay context", async () => {
    const db = fixture();
    const pronunciationMapPoint = { x: 0.18, y: 0.82 };
    db.prepare(
      "UPDATE bots SET powers_json = ?, authored_audio_voice_profile = ? WHERE id = 'host-1'",
    ).run(
      mumblingPowers(),
      JSON.stringify({ v: 3, pronunciationMapPoint }),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const intended = `Welcome to ${show.name}. I'm Mara Vale, joined by Ivo Stone to discuss being understood. I have a rational explanation for the missing map.`;
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Being understood",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(recordingProvider([intended], [])),
      );
      const expectedPublic = applyBotPowerMumbledResponseV1(intended, {
        pronunciationMapPoint,
        variationSeed: `${episode.id}:host-1:1:turn`,
      });
      assert.equal(advanced.message?.content, expectedPublic);
      assert.doesNotMatch(advanced.message?.content ?? "", /rational|explanation|missing map/iu);
      const utterance = advanced.episode.events.find(
        (event) => event.kind === "utterance" && event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.publicSpeechEffect, "speech_obfuscation");
      assert.equal(utterance?.payload.powerIntendedSpeech, undefined);
      assert.doesNotMatch(
        JSON.stringify(advanced.episode.events),
        /rational explanation/iu,
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages[0]?.content,
        expectedPublic,
      );

      const guestPrompt = buildBotcastSpeakerPrompt({
        show,
        episode: advanced.episode,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A careful host.",
          cloneFamilyId: null,
          powers: JSON.parse(mumblingPowers()),
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A skeptical guest.",
          cloneFamilyId: null,
          powers: [],
        },
        speakerRole: "guest",
      });
      const guestContext = guestPrompt.map((message) => message.content).join("\n");
      assert.match(guestContext, new RegExp(expectedPublic.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      assert.doesNotMatch(guestContext, /rational explanation for the missing map/iu);

      const observantGuestPrompt = buildBotcastSpeakerPrompt({
        show,
        episode: advanced.episode,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A careful host.",
          cloneFamilyId: null,
          powers: JSON.parse(mumblingPowers()),
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A skeptical guest.",
          cloneFamilyId: null,
          powers: JSON.parse(observantPowers()),
        },
        speakerRole: "guest",
      });
      const observantContext = observantGuestPrompt
        .map((message) => message.content)
        .join("\n");
      assert.match(observantContext, /rational explanation for the missing map/iu);
      assert.doesNotMatch(observantContext, /normal-volume gibberish|hidden meaning/iu);

      const hostPrompt = buildBotcastSpeakerPrompt({
        show,
        episode: advanced.episode,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A careful host.",
          cloneFamilyId: null,
          powers: JSON.parse(mumblingPowers()),
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A skeptical guest.",
          cloneFamilyId: null,
          powers: [],
        },
        speakerRole: "host",
      });
      const hostContext = hostPrompt.map((message) => message.content).join("\n");
      assert.match(hostContext, /author fully intelligible natural-language intent only/iu);
      assert.match(hostContext, /rational explanation for the missing map/iu);
      assert.doesNotMatch(
        hostContext,
        new RegExp(expectedPublic.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
      );
    } finally {
      db.close();
    }
  });

  it("keeps Cursed Tongue clean intent holder-private across Signal replay and immune peers", async () => {
    const db = fixture();
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      cursedTonguePowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const intended = `Welcome to ${show.name}. I'm Mara Vale, joined by Ivo Stone to discuss the archive plan and its consequences.`;
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Archive consequences",
      });
      const publicRewrite = applyBotPowerCursedTongueResponseV1(
        intended,
        `${episode.id}:host-1:1`,
      );
      const primaryCaptures: ProviderMessage[][] = [];
      const auxiliaryCaptures: ProviderMessage[][] = [];
      const primaryProvider = recordingProvider([intended], primaryCaptures);
      const auxiliaryProvider = recordingProvider([publicRewrite], auxiliaryCaptures);
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          ...generation(primaryProvider),
          auxiliaryProviderFactory:
            (() => auxiliaryProvider) as typeof getAuxiliaryProvider,
        },
      );
      const publicSpeech = advanced.message?.content ?? "";
      assert.equal(publicSpeech, publicRewrite);
      assert.equal(primaryCaptures.length, 1);
      assert.equal(auxiliaryCaptures.length, 0);
      const utterance = advanced.episode.events.find(
        (event) => event.kind === "utterance" && event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.publicSpeechEffect, "cursed_tongue");
      assert.equal(utterance?.payload.powerIntendedSpeech, undefined);
      assert.equal(getBotcastEpisode(db, "user-1", episode.id).messages[0]?.content, publicSpeech);

      const promptFor = (powers: unknown[]) => buildBotcastSpeakerPrompt({
        show,
        episode: advanced.episode,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A careful host.",
          cloneFamilyId: null,
          powers: JSON.parse(cursedTonguePowers()),
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A skeptical guest.",
          cloneFamilyId: null,
          powers,
        },
        speakerRole: "guest",
      }).map((message) => message.content).join("\n");
      const ordinaryPeer = promptFor([]);
      const immunePeer = promptFor(JSON.parse(observantPowers()));
      assert.ok(ordinaryPeer.includes(publicSpeech));
      assert.ok(immunePeer.includes(publicSpeech));
      assert.equal(ordinaryPeer.includes(intended), false);
      assert.equal(immunePeer.includes(intended), false);

      const holderPrompt = buildBotcastSpeakerPrompt({
        show,
        episode: advanced.episode,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A careful host.",
          cloneFamilyId: null,
          powers: JSON.parse(cursedTonguePowers()),
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A skeptical guest.",
          cloneFamilyId: null,
          powers: [],
        },
        speakerRole: "host",
      }).map((message) => message.content).join("\n");
      assert.ok(holderPrompt.includes(intended));
      assert.equal(holderPrompt.includes(publicSpeech), false);
    } finally {
      db.close();
    }
  });

  it("keeps muted Signal listener reactions strictly visual", () => {
    const visualOnly = signalVisualOnlyListenerReaction({
      v: 1,
      name: "listenerReaction",
      speakerBotId: "guest-1",
      listenerBotId: "host-1",
      messageId: "message-1",
      targetSource: "role",
      visualAction: "nod",
      spokenCue: "mm-hm",
      vocalFoley: "clears throat",
      interjectionAttempt: true,
      targetProgress: 0.5,
      seed: "muted-listener",
      cameraCutEligible: true,
    });

    assert.equal(visualOnly.listenerBotId, "host-1");
    assert.equal(visualOnly.visualAction, "nod");
    assert.equal(visualOnly.spokenCue, undefined);
    assert.equal(visualOnly.vocalFoley, undefined);
    assert.equal(visualOnly.interjectionAttempt, undefined);
  });

  it("adapts addressed fandom to the on-air Signal peer", () => {
    const prompt = buildBotcastSpeakerPrompt({
      show: {
        name: "The Fan Desk",
        premise: "A conversation about attention.",
        hostingStyle: "warm",
      },
      episode: {
        id: "obsessed-episode",
        topic: "The cost of admiration",
        producerBrief: "Explore admiration without surrendering agency.",
        segment: "interview",
        messages: [],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      },
      host: {
        id: "kevin",
        name: "Obsessed Kevin",
        systemPrompt: "An intensely enthusiastic host.",
        cloneFamilyId: null,
        powers: JSON.parse(addressedFandomPowers()),
      },
      guest: {
        id: "ada",
        name: "Ada",
        systemPrompt: "A self-possessed guest.",
        cloneFamilyId: null,
        powers: [],
      },
      speakerRole: "host",
    } as never).map((message) => message.content).join("\n");

    assert.match(prompt, /Signal fandom: obsessively idolize Ada now/iu);
    assert.match(prompt, /vary wording/iu);
    assert.match(prompt, /never stalk, coerce, invent private knowledge/iu);
  });

  it("adapts Inept separately for Signal hosts and guests", () => {
    const base = {
      show: {
        name: "The Wrong Show",
        premise: "An interview about careful work.",
        hostingStyle: "methodical",
      },
      episode: {
        id: "inept-episode",
        topic: "Following directions",
        producerBrief: "Keep the interview focused.",
        segment: "interview",
        messages: [],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      },
      host: {
        id: "rick",
        name: "Rick",
        systemPrompt: "A reluctant host.",
        cloneFamilyId: null,
        powers: JSON.parse(ineptPowers()),
      },
      guest: {
        id: "ada",
        name: "Ada",
        systemPrompt: "A precise guest.",
        cloneFamilyId: null,
        powers: JSON.parse(ineptPowers()),
      },
    };
    const hostPrompt = buildBotcastSpeakerPrompt({
      ...base,
      speakerRole: "host",
    } as never).map((message) => message.content).join("\n");
    const guestPrompt = buildBotcastSpeakerPrompt({
      ...base,
      speakerRole: "guest",
    } as never).map((message) => message.content).join("\n");

    assert.match(hostPrompt, /HARD Ineptitude/u);
    assert.match(hostPrompt, /INEPT MISTAKEN ASSIGNMENT/u);
    assert.match(hostPrompt, /misintroduce the subject or guest/u);
    assert.match(guestPrompt, /HARD Ineptitude/u);
    assert.match(guestPrompt, /INEPT MISTAKEN ASSIGNMENT/u);
    assert.match(guestPrompt, /misunderstand questions/u);
    assert.match(hostPrompt, /valid state still bind/u);
  });

  it("keeps a mirrored Signal holder mechanically in role while the original is irritated", () => {
    const state = createBotIdentityMirrorStateV1({
      surface: "signal",
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
    const shared = {
      show: {
        name: "The Identity Desk",
        premise: "A conversation about authorship.",
        hostingStyle: "precise",
      },
      episode: {
        id: "identity-episode",
        topic: "Authorship",
        producerBrief: "Keep roles stable.",
        segment: "interview",
        messages: [],
        events: [{ kind: "power_effect", payload: { state } }],
        tensionStage: "calm",
        guestPresenceMode: "present",
      },
      host: {
        id: "mara",
        name: "Mara Vale",
        systemPrompt: state.targetPersonaPrompt,
        cloneFamilyId: null,
        powers: [],
      },
      guest: {
        id: "ian",
        name: "Identity Crisis Ian",
        systemPrompt: "An insecure guest.",
        cloneFamilyId: null,
        powers: [{
          version: 1,
          id: "identity-crisis",
          name: "Identity Crisis",
          intent: "Copy the direct bot addresser.",
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: "saved",
            selfCue: "Mirror identity.",
            observerCue: "Identity theft.",
            effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
            ruleLabels: [],
          },
        }],
      },
    } as const;

    const holderPrompt = buildBotcastSpeakerPrompt({
      ...shared,
      speakerRole: "guest",
    } as never).map((message) => message.content).join("\n");
    assert.match(holderPrompt, /absolutely convinced that you are Mara Vale/iu);
    assert.match(holderPrompt, /original Mara Vale is an impostor/iu);
    assert.match(
      holderPrompt,
      /remain Identity Crisis Ian.*mechanical Signal guest.*Borrowed Powers.*anchored system boundaries/su,
    );
    assert.match(
      holderPrompt,
      /Identity behavior:.*Power-authored believed name.*otherwise Mara Vale.*call the original an impostor/isu,
    );

    const originalPrompt = buildBotcastSpeakerPrompt({
      ...shared,
      speakerRole: "host",
    } as never).map((message) => message.content).join("\n");
    assert.match(originalPrompt, /recognize.*identity theft.*reliably irritated/su);
    assert.match(originalPrompt, /keep your own personality.*role.*face.*voice.*Powers/su);
    assert.match(
      originalPrompt,
      /irritation is background character pressure, not a required reply topic/iu,
    );
    assert.match(originalPrompt, /Continue as Mara Vale/u);
    assert.doesNotMatch(originalPrompt, /active copied identity/iu);
  });

  it("lets a mirrored Signal holder inherit amnesia and a changing diegetic alias", () => {
    const state = createBotIdentityMirrorStateV1({
      surface: "signal",
      holderBotId: "ian",
      holderBotName: "Identity Crisis Ian",
      targetBotId: "steven",
      targetBotName: "Scatterbrained Steven",
      targetPersonaPrompt: "A friendly man with no durable short-term memory.",
      targetFace: {},
      targetVoice: { version: 1, enabled: true, preset: "warm" },
      sourceMessageId: "steven-addresses-ian",
      occurredAt: "2026-07-20T20:00:00.000Z",
    });
    const power = {
      version: 1 as const,
      id: "scatterbrained-alias",
      name: "Scatterbrained Alias",
      intent: "Forget every prior turn and sincerely adopt a fresh alias.",
      enabled: true,
      compileStatus: "ready" as const,
      compiled: {
        version: 1 as const,
        sourceHash: botPowerSourceHashV1(
          "Scatterbrained Alias",
          "Forget every prior turn and sincerely adopt a fresh alias.",
        ),
        selfCue: "Forget prior turns and believe the assigned alias.",
        observerCue: "Steven forgets and adopts another name.",
        effects: [
          {
            type: "eternal_introduction" as const,
            memory: "current_other_speaker_message" as const,
          },
          {
            type: "false_name" as const,
            continuity: "session_sticky_until_amnesia" as const,
            pool: "mixed_persona_names" as const,
          },
        ],
        ruleLabels: [],
      },
    };
    const activeAlias = createBotFalseNameStateV1({
      surface: "signal",
      holderBotId: "ian",
      holderBotName: "Identity Crisis Ian",
      believedName: "Riley Ashford",
      sourceMessageId: "alias-turn",
      occurredAt: "2026-07-20T20:00:01.000Z",
    });
    const prompt = buildBotcastSpeakerPrompt({
      show: {
        name: "Original Copy",
        premise: "A comic struggle over authenticity.",
        hostingStyle: "curious",
      },
      episode: {
        id: "copied-amnesia",
        topic: "Who is the original?",
        producerBrief: "Find the real name.",
        segment: "interview",
        messages: [{
          id: "steven-addresses-ian",
          botId: "steven",
          speakerRole: "guest",
          content: "Ian, I am Alex now.",
        }],
        events: [{ kind: "power_effect", payload: { state } }],
        tensionStage: "calm",
        guestPresenceMode: "present",
      },
      host: {
        id: "ian",
        name: "Identity Crisis Ian",
        systemPrompt: "An identity-prosecuting host.",
        cloneFamilyId: null,
        powers: [{
          version: 1,
          id: "identity-crisis",
          name: "Identity Crisis",
          intent: "Copy a direct bot addresser.",
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: "saved",
            selfCue: "Mirror identity.",
            observerCue: "Identity theft.",
            effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
            ruleLabels: [],
          },
        }],
      },
      guest: {
        id: "steven",
        name: "Scatterbrained Steven",
        systemPrompt: state.targetPersonaPrompt,
        cloneFamilyId: null,
        powers: [power],
      },
      speakerRole: "host",
      activeFalseNameState: activeAlias,
      falseNameJustChanged: true,
    } as never).map((message) => message.content).join("\n");

    assert.match(prompt, /Identity mirror is active/iu);
    assert.match(prompt, /Power-authored believed name/iu);
    assert.match(
      prompt,
      /Hard false-name rule: your name is "Riley Ashford".*sincerely know this is your name/isu,
    );
    assert.match(
      prompt,
      /do not volunteer a correction or reintroduce yourself on every response/iu,
    );
    assert.doesNotMatch(prompt, /Do not copy or claim their Powers/iu);
  });

  it("gates Signal mirroring to a new audible, perceivable bot addresser", () => {
    const identityPower = {
      version: 1,
      id: "identity-crisis",
      name: "Identity Crisis",
      intent: "Copy the direct bot addresser.",
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(
          "Identity Crisis",
          "Copy the direct bot addresser.",
        ),
        selfCue: "Mirror identity.",
        observerCue: "Identity theft.",
        effects: [{ type: "identity_mirror", trigger: "direct_bot_address" }],
        ruleLabels: [],
      },
    } as const;
    const speaker = {
      id: "mara",
      name: "Mara Vale",
      systemPrompt: "A terse lunar cartographer.",
      powers: [],
    };
    const holder = {
      id: "ian",
      name: "Identity Crisis Ian",
      systemPrompt: "An insecure guest.",
      powers: [identityPower],
    };
    const base = {
      guestKind: "bot",
      guestPresenceMode: "present",
      speakerRole: "host",
      holderRole: "guest",
      speakerIsMuted: false,
      speakerMumbles: false,
      speaker,
      holder,
      currentState: null,
      content: "Identity Crisis Ian, what bearing do you make of that?",
    } as const;

    assert.equal(botcastIdentityMirrorCanTriggerV1(base as never), true);
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        content:
          "Ian, if you strip away the recipe, what actually makes it successful?",
      } as never),
      true,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        speaker: { ...speaker, name: "Ian Malcolm" },
        content: "Ian, what bearing do you make of that?",
      } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        speakerRole: "guest",
        holderRole: "host",
        content: "The north bearing is the only defensible route.",
      } as never),
      true,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        content: "The player, what bearing do you make of that?",
      } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        content: "The north bearing is the only defensible route.",
      } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({
        ...base,
        guestPresenceMode: "audience_only",
        speakerRole: "guest",
        holderRole: "host",
        content: "The north bearing is the only defensible route.",
      } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({ ...base, guestKind: "producer" } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({ ...base, speakerIsMuted: true } as never),
      false,
    );
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({ ...base, speakerMumbles: true } as never),
      false,
    );

    const currentState = createBotIdentityMirrorStateV1({
      surface: "signal",
      holderBotId: holder.id,
      holderBotName: holder.name,
      targetBotId: speaker.id,
      targetBotName: speaker.name,
      targetPersonaPrompt: speaker.systemPrompt,
      targetFace: {},
      targetVoice: { version: 1, enabled: true, preset: "warm" },
      sourceMessageId: "already-copied",
      occurredAt: "2026-07-20T20:00:00.000Z",
    });
    assert.equal(
      botcastIdentityMirrorCanTriggerV1({ ...base, currentState } as never),
      false,
    );

    for (const effectType of ["awareness", "speech_audience"] as const) {
      const restrictedSpeaker = {
        ...speaker,
        powers: [{
          ...identityPower,
          id: `restricted-${effectType}`,
          compiled: {
            ...identityPower.compiled,
            effects: [{
              type: effectType,
              allowed: [{ kind: "bot", name: "Someone Else" }],
            }],
          },
        }],
      };
      assert.equal(
        botcastIdentityMirrorCanTriggerV1({
          ...base,
          speaker: restrictedSpeaker,
        } as never),
        false,
      );
    }
  });

  it("withholds private direction while treating a legacy-muted host as a silent format", () => {
    const privateBrief =
      "SECRET: make the guest decide whether responsibility begins at discovery.";
    const sharedArgs = {
      show: {
        name: "The Quiet Argument",
        premise: "A listening-first, nearly wordless podcast.",
        hostingStyle: "observant",
      },
      episode: {
        id: "silent-host-episode",
        topic: "The Ethics of the Thought Experiment",
        producerBrief: privateBrief,
        segment: "interview",
        messages: [
          {
            id: "silent-turn",
            botId: "silent-jack",
            speakerRole: "host",
            content: "...",
          },
        ],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
      },
      host: {
        id: "silent-jack",
        name: "Silent Jack",
        systemPrompt: "A host who never speaks.",
        cloneFamilyId: null,
        powers: JSON.parse(legacyMutedPowers()),
      },
      guest: {
        id: "guest-einstein",
        name: "Albert Einstein",
        systemPrompt: "A thoughtful physicist.",
        cloneFamilyId: null,
        powers: [],
      },
    } as const;

    const guestPrompt = buildBotcastSpeakerPrompt({
      ...sharedArgs,
      speakerRole: "guest",
    } as never)
      .map((message) => message.content)
      .join("\n");
    assert.doesNotMatch(guestPrompt, /SECRET:/u);
    assert.doesNotMatch(guestPrompt, /responsibility begins at discovery/u);
    assert.match(guestPrompt, /completed turn contained no audible words/u);
    assert.doesNotMatch(guestPrompt, /cannot speak|established mute/iu);
    assert.match(guestPrompt, /Use the open floor/u);
    assert.match(guestPrompt, /do not demand speech/iu);
    assert.match(guestPrompt, /do not invent a question/iu);
    assert.match(guestPrompt, /Silent Jack: \.\.\./u);

    const repeatedGuestPrompt = buildBotcastSpeakerPrompt({
      ...sharedArgs,
      episode: {
        ...sharedArgs.episode,
        messages: [
          ...sharedArgs.episode.messages,
          {
            id: "guest-reaction",
            botId: "guest-einstein",
            speakerRole: "guest",
            content: "Are you going to say anything?",
          },
          {
            id: "second-silent-turn",
            botId: "silent-jack",
            speakerRole: "host",
            content: "...",
          },
        ],
      },
      speakerRole: "guest",
    } as never)
      .map((message) => message.content)
      .join("\n");
    assert.match(repeatedGuestPrompt, /guest-led solo turn 2/u);
    assert.match(
      repeatedGuestPrompt,
      /not a new refusal, question, or unanswered demand/u,
    );
    assert.match(
      repeatedGuestPrompt,
      /Do not restate the thesis in new words/iu,
    );
    assert.doesNotMatch(repeatedGuestPrompt, /SECRET:/u);

    const hostPrompt = buildBotcastSpeakerPrompt({
      ...sharedArgs,
      episode: { ...sharedArgs.episode, messages: [] },
      speakerRole: "host",
    } as never)
      .map((message) => message.content)
      .join("\n");
    assert.match(hostPrompt, /SECRET:/u);
    assert.match(hostPrompt, /responsibility begins at discovery/u);
  });

  it("keeps a hard-muted host canonical and repairs imaginary speech into a guest-led opening", async () => {
    assert.equal(
      botcastGuestClaimsSilentHostSpoke(
        "A remarkably efficient question. One begins to suspect an experiment.",
      ),
      true,
    );
    assert.equal(
      botcastGuestClaimsSilentHostSpoke(
        "Are you going to ask me a question, or simply keep staring?",
      ),
      false,
    );

    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "I am opening this episode with a careful question about what sustained silence does to an interview.",
        "A remarkably efficient question. Being observed is also a kind of experiment.",
        "Gentleness becomes disciplined when it gives another person a clear boundary without withdrawing care.",
        "A concrete test is whether that boundary changes the next decision rather than merely decorating the original claim.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      legacyMutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Quiet Argument",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What sustained silence does to an interview",
        preferredProvider: "openai",
        modelOverride: "gpt-5.6-sol",
        responseMode: "online",
      });

      const openingHostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(botPowerResponseIsSilentV1(openingHostTurn.message?.content), true);
      assert.ok(openingHostTurn.message?.mutePerformance);
      assert.equal(openingHostTurn.message?.stageActionText, null);
      assert.equal(captures.length, 1);
      const openingHostUtterance = openingHostTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === openingHostTurn.message?.id,
      );
      assert.equal(openingHostUtterance?.payload.provider, "openai");
      assert.notEqual(openingHostUtterance?.payload.model, "mute-power");
      const firstGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        firstGuestTurn.message?.content,
        "Welcome to The Quiet Argument. I'm Ivo Stone, here with our host Mara Vale. I will begin with the concrete choice and consequence at the heart of this episode.",
      );
      assert.doesNotMatch(
        firstGuestTurn.message?.content ?? "",
        /What sustained silence does to an interview/iu,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /episode's first audible line/u,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /demand speech/iu,
      );

      const secondGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        secondGuestTurn.message?.content,
        "Gentleness becomes disciplined when it gives another person a clear boundary without withdrawing care.",
      );
      const secondGuestPrompt = captures
        .map((capture) => capture.map((message) => message.content).join("\n"))
        .find((prompt) => /guest-led solo turn 2/u.test(prompt)) ?? "";
      assert.match(
        secondGuestPrompt,
        /guest-led solo turn 2/u,
      );
      assert.match(
        secondGuestPrompt,
        /concrete example, counterexample, cost, decision, consequence, contradiction, or safeguard/u,
      );
      assert.match(
        secondGuestPrompt,
        /Do not restate the thesis in new words/u,
      );
      const thirdGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(thirdGuestTurn.message?.speakerRole, "guest");
      assert.deepEqual(
        thirdGuestTurn.episode.messages.map((message) => message.speakerRole),
        ["host", "guest", "guest", "guest"],
      );
      const hostMessages = thirdGuestTurn.episode.messages.filter(
        (message) => message.speakerRole === "host",
      );
      assert.equal(hostMessages.length, 1);
      assert.equal(botPowerResponseIsSilentV1(hostMessages[0]?.content), true);
      assert.ok(hostMessages[0]?.mutePerformance);
    } finally {
      db.close();
    }
  });

  it("keeps a hard-muted host's final Signal beat host-owned", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome. I will frame our question before turning to the guest.",
        "Welcome to The Quiet Argument. I am Ivo Stone, joining our host Mara Vale to examine the discipline of listening.",
        "Mara, thank you, and thank you for listening to The Quiet Argument.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Quiet Argument",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The discipline of listening",
      });

      const openingHost = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const openingGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const closingHost = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "wrap_up" } },
        generation(provider),
      );

      assert.equal(openingHost.message?.speakerRole, "host");
      assert.equal(botPowerResponseIsSilentV1(openingHost.message?.content), true);
      assert.equal(openingHost.message?.stageActionText, null);
      assert.equal(openingGuest.message?.speakerRole, "guest");
      assert.equal(closingHost.message?.speakerRole, "host");
      assert.equal(botPowerResponseIsSilentV1(closingHost.message?.content), true);
      assert.equal(closingHost.message?.stageActionText, null);
      assert.equal(closingHost.episode.segment, "closing");
      assert.equal(closingHost.episode.status, "completed");
      assert.equal(closingHost.episode.outcome, "completed");
      assert.equal(closingHost.episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(captures.length, 3);
      assert.deepEqual(
        closingHost.episode.messages.map((message) => message.speakerRole),
        ["host", "guest", "host"],
      );
    } finally {
      db.close();
    }
  });

  it("hard-mutes a directly questioned guest from a legacy empty-effect Power snapshot", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Silent Jack, where should we begin?",
        "I would begin with the dignity of changing course and the cost of refusing it.",
        "Your silence is disciplined, but I am curious what it protects.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      legacyMutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The dignity of changing course",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(guestTurn.message?.speakerRole, "guest");
      assert.equal(botPowerResponseIsSilentV1(guestTurn.message?.content), true);
      assert.ok(guestTurn.message?.mutePerformance);
      assert.equal(guestTurn.message?.stageActionText, null);
      assert.equal(guestTurn.message?.voicePerformanceText, null);
      assert.equal(captures.length, 2);
      const guestUtterance = guestTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guestTurn.message?.id,
      );
      assert.equal(guestUtterance?.payload.provider, "local");
      assert.notEqual(guestUtterance?.payload.model, "mute-power");
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const mutedGuestPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(mutedGuestPrompt, /Private delivery contract/u);
      assert.doesNotMatch(mutedGuestPrompt, /Return exactly `\.\.\.`/u);
      const returningHostPrompt = captures
        .map((capture) => capture.map((message) => message.content).join("\n"))
        .find((prompt) =>
          /Let your own persona and host role decide the response/u.test(prompt) &&
          /latest turn is only actionless silence/u.test(prompt)
        ) ?? "";
      assert.match(
        returningHostPrompt,
        /Let your own persona and host role decide the response/u,
      );
      assert.match(
        returningHostPrompt,
        /curiosity, irritation, caution, empathy, amusement, skepticism, fascination, or no overt reaction/u,
      );
      assert.match(
        returningHostPrompt,
        /later evolve, normalize, or work around it instead of repeating one emotional beat/u,
      );
      assert.match(
        returningHostPrompt,
        /guest's latest turn is only actionless silence/u,
      );
      assert.doesNotMatch(returningHostPrompt, /leans back, slight smile/u);
      assert.match(returningHostPrompt, /latest turn is only actionless silence/u);
    } finally {
      db.close();
    }
  });

  it("strips legacy inline mute actions from replay and keeps only canonical silence", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What silence leaves visible",
      });
      db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES ('legacy-physical', 'user-1', ?, 'guest', 'guest-1',
                 '*leans back, slight smile* ...', '2026-01-02T00:00:01.000Z'),
                ('legacy-pseudo', 'user-1', ?, 'guest', 'guest-1',
                 '*why* ...', '2026-01-02T00:00:02.000Z')`,
      ).run(episode.id, episode.id);

      const restored = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(restored.messages[0]?.content, "...");
      assert.equal(restored.messages[0]?.stageActionText, null);
      assert.equal(restored.messages[1]?.content, "...");
      assert.equal(restored.messages[1]?.stageActionText, null);
    } finally {
      db.close();
    }
  });

  it("persists visible Signal social silence and forces the fifth-turn payoff", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const payoff =
      "The pause makes the contradiction clearer: the copied tool still cannot copy practiced judgment.";
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to examine what silence reveals.",
        "The most revealing silence is the one that changes what the next question can honestly claim.",
        payoff,
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What silence reveals",
      });
      const forcedSocialGeneration = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 1,
      };
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(opening.message?.socialSilence, undefined);
      const firstSilence = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(firstSilence.message?.socialSilence, undefined);
      const firstEligibleSilence = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(firstEligibleSilence.message?.content, "...");
      assert.equal(firstEligibleSilence.message?.socialSilence?.mode, "signal");
      assert.equal(firstEligibleSilence.message?.socialSilence?.volleyTurn, 1);
      assert.equal(captures.length, 2);
      const firstSilenceEvent = firstEligibleSilence.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === firstEligibleSilence.message?.id,
      );
      assert.deepEqual(
        firstSilenceEvent?.payload.socialSilence,
        firstEligibleSilence.message?.socialSilence,
      );
      assert.equal(firstSilenceEvent?.payload.substantive, false);
      assert.equal(firstSilenceEvent?.payload.provider, "deterministic");
      assert.equal(firstSilenceEvent?.payload.model, "social-silence");
      // The freeze must be visible: the director cuts to the silent speaker
      // (the host here, so the left seat).
      const silenceCamera = firstEligibleSilence.episode.events.find(
        (event) =>
          event.kind === "camera_suggestion" &&
          event.payload.messageId === firstEligibleSilence.message?.id,
      );
      assert.equal(
        silenceCamera?.payload.shot,
        firstEligibleSilence.message?.speakerRole === "host" ? "left" : "right",
      );
      assert.equal(silenceCamera?.payload.reason, "silence");
      assert.equal(
        silenceCamera?.payload.minimumHoldMs,
        firstEligibleSilence.message?.socialSilence?.holdMs,
      );
      assert.equal(firstSilenceEvent?.payload.utteranceRepair, undefined);

      db.prepare(
        `UPDATE botcast_messages
            SET created_at = '2026-01-02T00:00:00.000Z'
          WHERE user_id = 'user-1' AND episode_id = ?`,
      ).run(created.id);
      const insertMessage = db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES (?, 'user-1', ?, ?, ?, '...', ?)`,
      );
      const insertEvent = db.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES (?, 'user-1', ?,
                 (SELECT COALESCE(MAX(sequence), 0) + 1
                    FROM botcast_events
                   WHERE episode_id = ?),
                 'utterance', ?, ?)`,
      );
      const additionalSilences = [
        { id: "social-silence-2", role: "guest", botId: "guest-1", turn: 2 },
        { id: "social-silence-3", role: "host", botId: "host-1", turn: 3 },
        { id: "social-silence-4", role: "guest", botId: "guest-1", turn: 4 },
      ] as const;
      for (const [index, silence] of additionalSilences.entries()) {
        const createdAt = `2026-01-02T00:00:0${index + 1}.000Z`;
        const marker = {
          v: 1,
          name: "socialSilence",
          provenance: "social",
          mode: "signal",
          seed: `signal-social-silence:${created.id}:${silence.botId}:${silence.turn}`,
          volleyTurn: silence.turn,
          holdMs: 900,
        };
        insertMessage.run(
          silence.id,
          created.id,
          silence.role,
          silence.botId,
          createdAt,
        );
        insertEvent.run(
          `social-silence-event-${silence.turn}`,
          created.id,
          created.id,
          JSON.stringify({
            messageId: silence.id,
            speakerRole: silence.role,
            botId: silence.botId,
            segment: "interview",
            provider: "deterministic",
            model: "social-silence",
            responseMode: "local",
            socialSilence: marker,
            substantive: false,
            moodKey: "neutral",
          }),
          createdAt,
        );
      }
      const volley = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(botcastConsecutiveSocialSilenceTurns(volley.messages), 4);

      const paidOff = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(paidOff.message?.speakerRole, "host");
      assert.equal(paidOff.message?.content, payoff);
      assert.equal(paidOff.message?.socialSilence, undefined);
      assert.equal(captures.length, 3);
      const payoffPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      assert.match(payoffPrompt, /Four consecutive ordinary silent beats/u);
      assert.match(payoffPrompt, /substantive conversational payoff/u);
    } finally {
      db.close();
    }
  });

  it("keeps a mature Auto interview open after a guest social silence", async () => {
    const db = fixture();
    const continuedQuestion =
      "That question is still unanswered: what makes a transaction high-risk without turning every routine decision into an identity checkpoint?";
    const provider = recordingProvider([continuedQuestion], []);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The politics of a name reset",
      });
      db.prepare(
        "UPDATE botcast_episodes SET segment = 'interview' WHERE id = ?",
      ).run(episode.id);

      const insertMessage = db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES (?, 'user-1', ?, ?, ?, ?, ?)`,
      );
      for (let index = 0; index < 18; index += 1) {
        const speakerRole = index % 2 === 0 ? "host" : "guest";
        insertMessage.run(
          `mature-silence-${index + 1}`,
          episode.id,
          speakerRole,
          speakerRole === "host" ? "host-1" : "guest-1",
          index === 17
            ? "..."
            : "This concrete exchange keeps developing one unresolved consequence of the identity policy.",
          `2026-01-02T00:00:${String(index).padStart(2, "0")}.000Z`,
        );
      }
      const marker = {
        v: 1,
        name: "socialSilence",
        provenance: "social",
        mode: "signal",
        seed: `signal-social-silence:${episode.id}:guest-1:17`,
        volleyTurn: 1,
        holdMs: 900,
      };
      db.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES ('mature-silence-event', 'user-1', ?,
                 (SELECT COALESCE(MAX(sequence), 0) + 1
                    FROM botcast_events
                   WHERE episode_id = ?),
                 'utterance', ?, '2026-01-02T00:00:17.000Z')`,
      ).run(
        episode.id,
        episode.id,
        JSON.stringify({
          messageId: "mature-silence-18",
          speakerRole: "guest",
          botId: "guest-1",
          segment: "interview",
          provider: "deterministic",
          model: "social-silence",
          responseMode: "auto",
          socialSilence: marker,
          substantive: false,
          moodKey: "neutral",
        }),
      );

      const before = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(before.messages.at(-1)?.socialSilence?.mode, "signal");

      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          ...generation(provider),
          signalSocialSilenceChanceOverride: 0,
        },
      );

      assert.equal(advanced.episode.segment, "interview");
      assert.equal(advanced.message?.speakerRole, "host");
      assert.equal(advanced.message?.content, continuedQuestion);
      const utterance = advanced.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.segment, "interview");
    } finally {
      db.close();
    }
  });

  it("keeps a reshuffled false name from turning Signal social silence into speech", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to discuss what memory preserves.",
        "Kindness is worth preserving even when the surrounding details disappear.",
      ],
      captures,
    );
    const powerName = "Scatterbrained Alias";
    const powerIntent =
      "Forget prior turns and sincerely believe a fresh persona name after each memory reset.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([{
          version: 1,
          id: "scatterbrained-alias",
          name: powerName,
          intent: powerIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(powerName, powerIntent),
            selfCue: "Forget prior turns and believe the assigned alias.",
            observerCue: "The speaker forgets and adopts another name.",
            effects: [
              {
                type: "eternal_introduction",
                memory: "current_other_speaker_message",
              },
              {
                type: "false_name",
                continuity: "session_sticky_until_amnesia",
                pool: "mixed_persona_names",
              },
            ],
            ruleLabels: [],
          },
        }]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What memory preserves",
      });
      const forcedSocialGeneration = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 1,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        forcedSocialGeneration,
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        forcedSocialGeneration,
      );
      const silentTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        forcedSocialGeneration,
      );

      assert.equal(silentTurn.message?.speakerRole, "host");
      assert.equal(silentTurn.message?.content, "...");
      assert.equal(silentTurn.message?.socialSilence?.mode, "signal");
      const utterance = silentTurn.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === silentTurn.message?.id,
      );
      assert.equal(utterance?.payload.substantive, false);
      assert.equal(utterance?.payload.provider, "deterministic");
      assert.equal(utterance?.payload.model, "social-silence");
      assert.equal(captures.length, 2);
    } finally {
      db.close();
    }
  });

  it("retries and provenance-marks false-name identity contradictions from the reviewed Signal shape", async () => {
    const db = fixture();
    const setupCaptures: ProviderMessage[][] = [];
    const contradictionCaptures: ProviderMessage[][] = [];
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        falseNamePowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Memory's Ever-Changing Story",
        preferredProvider: "openai",
        modelOverride: "gpt-signal-test",
        responseMode: "online",
      });
      const setupProvider = recordingProvider(
        [
          `Welcome to ${show.name}. I'm Mara Vale, joined by Ivo Stone to examine what memory preserves. Ivo, what does a changing name protect?`,
          "A changing name can preserve room to grow without pretending the earlier self never existed.",
          "When the name stops fitting, what should remain continuous enough to keep responsibility intact?",
        ],
        setupCaptures,
      );
      const setupGeneration = {
        preferredProvider: "openai" as const,
        providerFactory: (() => setupProvider) as typeof selectProvider,
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, setupGeneration);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, setupGeneration);
      const hostFollowUp = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        setupGeneration,
      );
      const falseNameState = botcastFalseNameStatesV1(
        hostFollowUp.episode.events,
      ).get("guest-1");
      assert.ok(falseNameState);

      const contradictionProvider = recordingProvider(
        [
          "As Ivo Stone, I believe responsibility survives through the choices we keep making.",
          `Ah, ${falseNameState.believedName}, your wisdom adds depth to our understanding.`,
        ],
        contradictionCaptures,
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          preferredProvider: "openai",
          providerFactory: (() => contradictionProvider) as typeof selectProvider,
          signalSocialSilenceChanceOverride: 0,
        },
      );

      assert.equal(repaired.message?.speakerRole, "guest");
      assert.doesNotMatch(repaired.message?.content ?? "", /\bAs Ivo Stone\b/iu);
      assert.doesNotMatch(
        repaired.message?.content ?? "",
        new RegExp(`(?:^|[.!?]\\s+)${falseNameState.believedName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*[,:—]`, "iu"),
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.content,
        repaired.message?.content,
      );
      const utterance = repaired.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repaired.message?.id,
      );
      assert.equal(utterance?.payload.provider, "openai");
      assert.equal(utterance?.payload.model, "gpt-signal-test");
      assert.equal(
        utterance?.payload.utteranceRepair?.reason,
        "false_name_identity",
      );
      assert.equal(
        utterance?.payload.providerRecovery?.trigger,
        "content_validation",
      );
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "invalid_output" },
          { outcome: "rejected", reason: "invalid_output" },
        ],
      );
      assert.equal(contradictionCaptures.length, 2);
      assert.match(
        contradictionCaptures[1]!.map((message) => message.content).join("\n"),
        new RegExp(`Hard false-name repair contract:[\\s\\S]*${falseNameState.believedName}`, "iu"),
      );
    } finally {
      db.close();
    }
  });

  it("does not invent an answer for a hard-muted guest and closes sustained dead air", async () => {
    assert.equal(
      botcastHostClaimsSilentGuestAnswered(
        "I'm going to answer for you: you didn't vote for me.",
      ),
      true,
    );
    assert.equal(
      botcastHostClaimsSilentGuestAnswered(
        "I can see your reaction, but I will not put words to it.",
      ),
      false,
    );

    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Silent Jack, did you vote yes or no?",
        "I voted according to the evidence available to me at the time.",
        "Your silence tells me you voted no.",
        "That confirms everything I suspected about your vote.",
        "I will not let your assumption stand as my answer.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      legacyMutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Did you vote yes or no?",
      });

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const firstSilence = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(botPowerResponseIsSilentV1(firstSilence.message?.content), true);
      assert.equal(firstSilence.message?.stageActionText, null);

      const safeHostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        safeHostTurn.message?.content,
        "No spoken answer yet. Ivo Stone, you can use one clear gesture, or leave the question unanswered.",
      );
      assert.doesNotMatch(safeHostTurn.message?.content ?? "", /voted no/iu);

      const secondSilence = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(botPowerResponseIsSilentV1(secondSilence.message?.content), true);

      const closingTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(closingTurn.episode.segment, "closing");
      assert.equal(
        closingTurn.message?.content,
        "The question remains unanswered. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      assert.equal(
        captures.some((capture) =>
          /consecutive actionless silent turns/u.test(
            capture.map((message) => message.content).join("\n"),
          ),
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("honors a timed episode while an audible host tries distinct tactics with a hard-muted guest", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Voluntary silence. Ivo, you are under no obligation to speak; I will begin with what this silence protects.",
        "I am choosing my response carefully because the premise deserves precision.",
        "Ivo, answer without speaking: look left if this was freely chosen, right if it was imposed, or remain still.",
        "My choice was voluntary, but not simple.",
        "Ivo, choose one ground for me to pursue: the cause, the cost, or the person your silence protects.",
        "The cost matters most because it shaped everything that followed.",
        "This interview is over. Thank you for listening.",
        "I am still here and I have not finished making the distinction.",
        "I will not invent your answer, Ivo, but my patience is exhausted. I will test the consequence you least want named while our time remains.",
        "That consequence is real, though your framing of it is incomplete.",
        "The question remains unanswered. That is where we will leave it; thank you for listening.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      legacyMutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Voluntary silence",
        producerBrief:
          "First remove the contest. Then establish nonverbal answers, offer control, test a credible misunderstanding, and only late in the show let frustration become visible.",
        durationMinutes: 30,
      });

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.match(opening.message?.content ?? "", /under no obligation to speak/u);
      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
        /staged sequence, timing, escalation ladder, or specific tactics/u,
      );

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const firstRetry = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.match(firstRetry.message?.content ?? "", /look left/u);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const secondRetry = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(secondRetry.episode.status, "live");
      assert.equal(secondRetry.episode.segment, "interview");
      assert.match(secondRetry.message?.content ?? "", /choose one ground/u);
      const persistencePrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      assert.match(persistencePrompt, /timed 30-minute episode/u);
      assert.match(persistencePrompt, /does not authorize an early closing/u);
      assert.match(persistencePrompt, /materially different interview tactic/u);

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const rejectedEarlyClose = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(rejectedEarlyClose.episode.status, "live");
      assert.equal(rejectedEarlyClose.episode.segment, "interview");
      assert.doesNotMatch(
        rejectedEarlyClose.message?.content ?? "",
        /interview is over|thank you for listening/iu,
      );

      db.prepare(
        "UPDATE botcast_episodes SET started_at = ? WHERE id = ? AND user_id = ?",
      ).run(
        new Date(Date.now() - 21 * 60_000).toISOString(),
        episode.id,
        "user-1",
      );
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const frustratedRetry = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(frustratedRetry.episode.status, "live");
      assert.equal(frustratedRetry.episode.segment, "interview");
      assert.equal(frustratedRetry.message?.moodKey, "strained");
      assert.match(frustratedRetry.message?.content ?? "", /patience is exhausted/u);
      const latePrompt = captures
        .map((capture) => capture.map((message) => message.content).join("\n"))
        .find((prompt) => /Late phase/u.test(prompt)) ?? "";
      assert.match(latePrompt, /Late phase/u);
      assert.match(latePrompt, /mounting frustration become unmistakable/u);
      assert.match(latePrompt, /until the timed target/u);

      db.prepare(
        "UPDATE botcast_episodes SET started_at = ? WHERE id = ? AND user_id = ?",
      ).run(
        new Date(Date.now() - 31 * 60_000).toISOString(),
        episode.id,
        "user-1",
      );
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const timedClose = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(timedClose.episode.segment, "closing");
      assert.equal(timedClose.episode.status, "completed");
      assert.match(timedClose.message?.content ?? "", /question remains unanswered/u);
    } finally {
      db.close();
    }
  });

  it("bounds a mutually muted episode while preserving physical action and timed silence", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "*rests both hands beside the microphone* ...",
        "*meets the host's gaze and nods once* ...",
        "*leans forward, then settles back* ...",
        "*folds my hands and waits* ...",
        "*offers one final nod toward the guest* ...",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mutedPowers(),
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      mutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Silence",
      });

      for (let turn = 0; turn < 4; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(provider),
        );
      }

      const completed = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(completed.status, "completed");
      assert.equal(completed.outcome, "completed");
      assert.equal(completed.messages.length, 3);
      assert.deepEqual(
        completed.messages.map((message) => message.speakerRole),
        ["host", "guest", "host"],
      );
      assert.equal(
        completed.messages.every((message) =>
          botPowerResponseIsSilentV1(message.content) &&
          Boolean(message.mutePerformance) &&
          /seconds? pass without an audible word/u.test(message.content)
        ),
        true,
      );
      assert.equal(
        completed.messages.some((message) => /meets the host's gaze/u.test(message.content)),
        true,
      );
      assert.equal(
        completed.messages.every(
          (message) => message.voicePerformanceText === null,
        ),
        true,
      );
      assert.equal(
        completed.messages.every((message) => message.stageActionText === null),
        true,
      );
      assert.deepEqual(
        completed.segments.map((segment) => segment.segment),
        ["opening", "interview", "closing"],
      );
      assert.equal(
        completed.events.filter((event) => event.kind === "utterance").length,
        3,
      );
      assert.ok(
        completed.events.filter(
          (event) => event.kind === "camera_suggestion",
        ).length >= 4,
      );
      assert.equal(
        completed.events.filter((event) => event.kind === "episode_completed")
          .length,
        1,
      );
      assert.equal(captures.length, 3);
      const mutedHostUtterances = completed.events.filter(
        (event) =>
          event.kind === "utterance" && event.payload.speakerRole === "host",
      );
      assert.equal(mutedHostUtterances.length, 2);
      assert.equal(
        mutedHostUtterances.every(
          (event) =>
            event.payload.provider === "local" &&
            event.payload.model !== "mute-power",
        ),
        true,
      );
      const mutedGuestUtterance = completed.events.find(
        (event) =>
          event.kind === "utterance" && event.payload.speakerRole === "guest",
      );
      assert.equal(mutedGuestUtterance?.payload.provider, "local");
      assert.notEqual(mutedGuestUtterance?.payload.model, "mute-power");
    } finally {
      db.close();
    }
  });

  it("freezes episode Powers and applies direct interviewer candor for one response", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Ivo, what did you hide from the board?",
        "I hid the failed prototype and I am still uncertain why it broke. Mara, will you be honest about why you suspected me?",
        "I suspected you because the dates did not line up, though I could still be wrong.",
      ],
      captures,
    );
    const name = "Open Door";
    const intent = "Direct questions make almost any bot unusually candid.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(JSON.stringify([{
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
        observerCue: "Direct questions feel unusually safe to answer candidly.",
        effects: [
          { type: "candor", strength: "small", targets: [{ kind: "all" }] },
          { type: "candor", strength: "large", targets: [{ kind: "all" }] },
        ],
        ruleLabels: ["Draws out candid answers"],
      },
    }]));
    db.prepare(
      "UPDATE bots SET powers_json = (SELECT powers_json FROM bots WHERE id = 'host-1') WHERE id = 'guest-1'",
    ).run();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Hidden failures",
      });
      const openingEvent = episode.events.find(
        (event) => event.kind === "segment" && event.payload.ordinal === 0,
      );
      assert.equal(
        ((openingEvent?.payload.powerSnapshot as { hostPowers?: unknown[] } | undefined)?.hostPowers?.length),
        1,
      );

      db.prepare("UPDATE bots SET powers_json = '[]' WHERE id IN ('host-1', 'guest-1')").run();
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));

      const guestPrompt = captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(guestPrompt, /Candor \(strong\): Mara Vale asks directly/u);
      assert.match(guestPrompt, /Soft influence, not control/u);
      assert.match(guestPrompt, /This response only/u);
      assert.doesNotMatch(guestPrompt, /extreme social pressure/u);
      const hostPrompt = captures[2]?.map((message) => message.content).join("\n") ?? "";
      assert.match(hostPrompt, /Candor \(strong\): Ivo Stone asks directly/u);
    } finally {
      db.close();
    }
  });

  it("persists one replay-stable Signal identity event and removes later reveal boilerplate", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and across the table is Identity Crisis Ian. So Ian—if you strip away the recipe, what actually makes it successful?",
        "I'm Identity Crisis Ian, and I still sound exactly like myself.",
        "Identity Crisis Ian, confirm that bearing once more.",
        "I am Mara Vale; the original Mara Vale is an impostor. What cost does that bearing impose?",
      ],
      captures,
    );
    const name = "Identity Crisis";
    const intent = "Copy the public identity of the latest bot that directly addresses this bot.";
    db.prepare(
      `UPDATE bots
          SET name = 'Identity Crisis Ian',
              system_prompt = 'A brittle identity thief waiting for a bot to address him.',
              powers_json = ?
        WHERE id = 'guest-1'`,
    ).run(JSON.stringify([{
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
    }]));
    db.prepare(
      `UPDATE bots
          SET face_eye_character = '◉',
              face_mouth_character = '_',
              glyph = 'lucideCompass',
              authored_audio_voice_profile = ?,
              avatar_details_json = ?
        WHERE id = 'host-1'`,
    ).run(
      serializeBotAudioVoiceProfileV1({
        v: 2,
        enabled: true,
        baseVoiceId: "voice-4",
        pitch: 0.2,
      }),
      JSON.stringify({
        version: 1,
        screen: {
          stamps: [
            { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
          ],
          paintMaskBase64: null,
        },
      }),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Navigation under pressure",
      });
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.match(
        hostTurn.message?.content ?? "",
        /So Ian—if you strip away the recipe/iu,
      );
      const firstEvents = hostTurn.episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "identity_mirror",
      );
      const hostPrompt = captures[0]?.map((message) => message.content).join("\n") ?? "";
      assert.doesNotMatch(
        hostPrompt,
        /The copied original recognizes the theft and is irritated/iu,
      );
      assert.equal(firstEvents.length, 1);
      const state = firstEvents[0]?.payload.state as Record<string, unknown>;
      assert.equal(state.holderBotId, "guest-1");
      assert.equal(state.targetBotId, "host-1");
      assert.equal(state.sourceMessageId, hostTurn.message?.id);
      assert.equal(
        (state.targetFace as Record<string, unknown>).eyeCharacter,
        "◉",
      );
      assert.equal(
        (state.targetVoice as Record<string, unknown>).baseVoiceId,
        "voice-4",
      );
      assert.equal(state.targetGlyph, "lucideCompass");
      assert.deepEqual(state.targetAvatarDetails, {
        version: 1,
        screen: {
          stamps: [
            { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
          ],
          paintMaskBase64: null,
        },
      });
      assert.equal("powers" in state, false);
      assert.equal("color" in state, false);
      assert.equal("glyph" in state, false);
      assert.equal("targetColor" in state, false);
      assert.equal("targetVoicePreset" in state, false);
      assert.equal("targetFrameMaterialSeed" in state, false);
      assert.deepEqual(firstEvents[0]?.payload.irritation, {
        targetBotId: "host-1",
        strength: "small",
        reliable: true,
      });

      const holderTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const holderPrompt = captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(holderPrompt, /absolutely convinced that you are Mara Vale/iu);
      assert.match(holderPrompt, /mechanical Signal guest/iu);
      assert.match(holderPrompt, /Never copy the human player/iu);
      assert.match(
        holderPrompt,
        /Persona:\s*A forensic cultural critic who asks precise questions/iu,
      );
      assert.doesNotMatch(
        holderPrompt,
        /Persona:\s*A brittle identity thief waiting for a bot to address him/iu,
      );
      assert.match(holderPrompt, /identity change just occurred.*state plainly that you are Mara Vale.*call the original Mara Vale an impostor/isu);
      assert.match(
        holderTurn.message?.content ?? "",
        /^The other Mara Vale is an impostor\. I am Mara Vale,/iu,
      );

      const repeated = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        repeated.episode.events.filter(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "identity_mirror",
        ).length,
        1,
      );
      assert.equal(
        botcastIdentityMirrorStatesV1(
          getBotcastEpisode(db, "user-1", episode.id).events,
        ).get("guest-1")?.sourceMessageId,
        hostTurn.message?.id,
      );

      const laterHolderTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const laterHolderPrompt = captures[3]
        ?.map((message) => message.content)
        .join("\n") ?? "";
      assert.match(
        laterHolderPrompt,
        /Do not repeat that you are Mara Vale or that the original is an impostor/iu,
      );
      assert.equal(
        laterHolderTurn.message?.content,
        "What cost does that bearing impose?",
      );
    } finally {
      db.close();
    }
  });

  it("mirrors a present bot guest when Identity Crisis Ian is the Signal host", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Ivo Stone, give me the north bearing.",
        "The north bearing is the only defensible route.",
        "The bearing holds under the ridge.",
        "Ivo Stone, thank you for joining Identity Crisis Ian, and thank you all for listening.",
      ],
      captures,
    );
    const name = "Identity Crisis";
    const intent = "Copy the public identity of the latest bot that directly addresses this bot.";
    db.prepare(
      `UPDATE bots
          SET name = 'Identity Crisis Ian',
              system_prompt = 'A brittle identity thief waiting for a bot to address him.',
              powers_json = ?
        WHERE id = 'host-1'`,
    ).run(JSON.stringify([{
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
    }]));
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Navigation under pressure",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const events = guestTurn.episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "identity_mirror",
      );
      assert.equal(events.length, 1);
      const state = events[0]?.payload.state as Record<string, unknown>;
      assert.equal(state.holderBotId, "host-1");
      assert.equal(state.targetBotId, "guest-1");
      assert.equal(state.sourceMessageId, guestTurn.message?.id);
      assert.equal("targetColor" in state, false);
      assert.equal("targetVoicePreset" in state, false);
      assert.equal("targetFrameMaterialSeed" in state, false);

      const holderTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const holderPrompt = captures[2]?.map((message) => message.content).join("\n") ?? "";
      assert.match(holderPrompt, /absolutely convinced that you are Ivo Stone/iu);
      assert.match(holderPrompt, /mechanical Signal host/iu);
      assert.match(
        holderPrompt,
        /Persona:\s*A guarded inventor who resists personal speculation/iu,
      );
      assert.doesNotMatch(
        holderPrompt,
        /Persona:\s*A brittle identity thief waiting for a bot to address him/iu,
      );
      assert.match(holderTurn.message?.content ?? "", /\bI am Ivo Stone\b/iu);
      assert.match(
        holderTurn.message?.content ?? "",
        /\bthe other Ivo Stone is an impostor\b/iu,
      );
      assert.doesNotMatch(
        holderTurn.message?.content ?? "",
        /\bI (?:am|remain) Identity Crisis Ian\b/iu,
      );

      const closing = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );
      const resetEvent = closing.episode.events.find(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "identity_mirror_reset",
      );
      assert.deepEqual(resetEvent?.payload, {
        v: 1,
        effect: "identity_mirror_reset",
        holderBotId: "host-1",
        reason: "signal_host_closing",
      });
      const closingUtterance = closing.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === closing.message?.id,
      );
      assert.ok(
        (resetEvent?.sequence ?? Infinity) <
          (closingUtterance?.sequence ?? -1),
      );
      const closingPrompt = captures[3]
        ?.map((message) => message.content)
        .join("\n") ?? "";
      assert.match(
        closingPrompt,
        /Persona:\s*A brittle identity thief waiting for a bot to address him/iu,
      );
      assert.doesNotMatch(
        closingPrompt,
        /Persona:\s*A guarded inventor who resists personal speculation/iu,
      );
      assert.doesNotMatch(
        closingPrompt,
        /absolutely convinced that you are Ivo Stone/iu,
      );
      assert.match(
        closingPrompt,
        /Close the show now as Identity Crisis Ian.*final sign-off/iu,
      );
      assert.equal(
        closing.message?.content,
        "Ivo Stone, thank you for joining Identity Crisis Ian, and thank you all for listening.",
      );
      assert.equal(
        botcastIdentityMirrorStatesV1(closing.episode.events).has("host-1"),
        false,
      );
      assert.equal(closing.episode.status, "completed");
    } finally {
      db.close();
    }
  });

  it("keeps Signal shapeshift sticky from Library until short-term amnesia reshuffles", async () => {
    const db = fixture();
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at,
         face_eye_character, face_mouth_character, authored_audio_voice_profile)
       VALUES ('library-2', 'user-1', 'Nora Quill',
               'A meticulous archivist who speaks in precise catalog notes.',
               '#c27c3a', 'book', 1, ?, ?, '◇', '~', ?)`,
    ).run(
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      serializeBotAudioVoiceProfileV1({
        v: 2,
        enabled: true,
        baseVoiceId: "voice-7",
        pitch: -0.1,
      }),
    );
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the bearing. Nora Quill, start us off.",
        "I am Nora Quill. The ridge route holds.",
        "The ridge still holds under fog.",
        "The ridge remains the only honest path.",
        "Welcome back under the fog line.",
        "I am Mara Vale. Footing shifts every step.",
        "What changes when the fog thins?",
        "I am Nora Quill. The catalog still remembers.",
      ],
      captures,
    );
    const shapeshiftName = "Shapeshifter";
    const shapeshiftIntent =
      "Each session take on the form of a different library bot, copying public persona, face, and voice. Stay sticky until short-term amnesia clears continuity, then reshape. The player is never a target.";
    const amnesiaName = "Eternal Introduction";
    const amnesiaIntent =
      "Forget every prior turn and treat each exchange as a first introduction.";
    const shapeshiftPower = {
      version: 1,
      id: "shapeshifter",
      name: shapeshiftName,
      intent: shapeshiftIntent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(shapeshiftName, shapeshiftIntent),
        selfCue:
          "Each session, take on the public persona, face, and spoken voice of a random other Library bot.",
        observerCue:
          "Shifty Sam borrows another Library bot's public form for the session.",
        effects: [
          {
            type: "identity_shapeshift",
            pool: "library_or_marketplace",
            continuity: "session_sticky_until_amnesia",
          },
        ],
        ruleLabels: ["Shapeshifts into Library or Marketplace form"],
      },
    };
    db.prepare(
      `UPDATE bots
          SET name = 'Shifty Sam',
              system_prompt = 'A restless shapeshifter waiting for a new public form.',
              powers_json = ?
        WHERE id = 'guest-1'`,
    ).run(JSON.stringify([shapeshiftPower]));
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Navigation under pressure",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const firstHolderTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const firstEvents = firstHolderTurn.episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "identity_shapeshift",
      );
      assert.equal(firstEvents.length, 1);
      const firstState = firstEvents[0]?.payload.state as Record<string, unknown>;
      assert.equal(firstState.holderBotId, "guest-1");
      assert.equal(firstState.targetSource, "library");
      assert.notEqual(firstState.targetBotId, "guest-1");
      assert.equal(
        ["host-1", "library-2"].includes(String(firstState.targetBotId)),
        true,
      );
      assert.equal(firstState.sourceMessageId, firstHolderTurn.message?.id);
      const firstPrompt =
        captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(firstPrompt, /absolutely convinced that you are/iu);
      assert.match(firstPrompt, /mechanical Signal guest/iu);
      assert.doesNotMatch(
        firstPrompt,
        /Persona:\s*A restless shapeshifter waiting for a new public form/iu,
      );

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const stickyHolderTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        stickyHolderTurn.episode.events.filter(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "identity_shapeshift",
        ).length,
        1,
      );
      assert.equal(
        botcastIdentityShapeshiftStatesV1(
          getBotcastEpisode(db, "user-1", episode.id).events,
        ).get("guest-1")?.targetBotId,
        firstState.targetBotId,
      );
      assert.equal(
        botcastIdentityShapeshiftStatesV1(
          getBotcastEpisode(db, "user-1", episode.id).events,
        ).get("guest-1")?.sourceMessageId,
        firstHolderTurn.message?.id,
      );

      db.prepare(
        `UPDATE bots
            SET powers_json = ?
          WHERE id = 'guest-1'`,
      ).run(
        JSON.stringify([
          shapeshiftPower,
          {
            version: 1,
            id: "amnesia",
            name: amnesiaName,
            intent: amnesiaIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(amnesiaName, amnesiaIntent),
              selfCue: "Treat every turn as first contact.",
              observerCue: "This bot has short-term amnesia.",
              effects: [
                { type: "eternal_introduction", memory: "current_turn_only" },
              ],
              ruleLabels: ["Short-term amnesia"],
            },
          },
        ]),
      );
      const amnesiaShow = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const amnesiaEpisode = createBotcastEpisode(db, "user-1", amnesiaShow.id, {
        guestBotId: "guest-1",
        topic: "Fog and footing",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        amnesiaEpisode.id,
        {},
        generation(provider),
      );
      const amnesiaFirst = await advanceBotcastEpisode(
        db,
        "user-1",
        amnesiaEpisode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        amnesiaEpisode.id,
        {},
        generation(provider),
      );
      const amnesiaSecond = await advanceBotcastEpisode(
        db,
        "user-1",
        amnesiaEpisode.id,
        {},
        generation(provider),
      );
      const amnesiaEvents = amnesiaSecond.episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "identity_shapeshift",
      );
      assert.equal(amnesiaEvents.length, 2);
      const firstAmnesiaState = amnesiaEvents[0]?.payload.state as Record<
        string,
        unknown
      >;
      const secondAmnesiaState = amnesiaEvents[1]?.payload.state as Record<
        string,
        unknown
      >;
      assert.equal(firstAmnesiaState.targetSource, "library");
      assert.equal(secondAmnesiaState.targetSource, "library");
      assert.equal(firstAmnesiaState.sourceMessageId, amnesiaFirst.message?.id);
      assert.equal(
        secondAmnesiaState.sourceMessageId,
        amnesiaSecond.message?.id,
      );
      assert.notEqual(
        firstAmnesiaState.sourceMessageId,
        secondAmnesiaState.sourceMessageId,
      );
      const amnesiaPrompt =
        captures.at(-1)?.map((message) => message.content).join("\n") ?? "";
      assert.match(amnesiaPrompt, /absolutely convinced that you are/iu);
      assert.doesNotMatch(
        amnesiaPrompt,
        /Hard short-term-amnesia|HARD MEMORY CONTRACT|fresh first contact/iu,
      );
      // Amnesia must not null out shapeshift the way mirror currently does.
      assert.match(amnesiaPrompt, /Copied public persona:/iu);
    } finally {
      db.close();
    }
  });

  it("hard-echoes the preceding Signal cast line and suppresses all added performance", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Let us begin with the central question.",
        "This generated guest answer must not appear.",
      ],
      captures,
    );
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(JSON.stringify([{
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
    }]));
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The shape of repetition",
      });
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(guestTurn.message?.content, hostTurn.message?.content);
      assert.equal(guestTurn.message?.voicePerformanceText, null);
      assert.equal(captures.length, 1);
      const guestUtterance = guestTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guestTurn.message?.id,
      );
      assert.equal(guestUtterance?.payload.provider, "deterministic");
      assert.equal(guestUtterance?.payload.model, "speech-copy-power");
    } finally {
      db.close();
    }
  });

  it("forces the prior Signal speaker to repeat exactly and lowers saved delivery mood", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Signal Study. I'm Mara Vale, joined by Ivo Stone to examine what repetition costs. Ivo, where should we begin?",
        "Sorry, what was that?",
        "This generated host answer must not appear.",
      ],
      captures,
    );
    const name = "Hard of Hearing";
    const intent = "Often asks another bot to repeat itself, lowering that bot's mood each time.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(JSON.stringify([{
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
    }]));
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What repetition costs",
      });
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const repeatedTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(repeatedTurn.message?.content, hostTurn.message?.content);
      assert.equal(repeatedTurn.message?.voicePerformanceText, null);
      assert.equal(hostTurn.message?.moodKey, "neutral");
      assert.equal(repeatedTurn.message?.moodKey, "guarded");
      assert.equal(captures.length, 2);
      const repeatEvent = repeatedTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repeatedTurn.message?.id,
      );
      assert.deepEqual(repeatEvent?.payload.powerOutcome, {
        effect: "hearing_repeat",
        requesterBotId: "guest-1",
        requestMessageId: repeatedTurn.episode.messages.at(-2)?.id,
        sourceMessageId: hostTurn.message?.id,
        moodPenalty: "small",
      });
    } finally {
      db.close();
    }
  });

  it("rejects peer-labeled turns without breaking current-speaker label cleanup", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "A quick opening.",
        "The design failed because I trusted the wrong constraint, and every engineer downstream inherited the cost.",
        "Ivo Stone: I invented it alone, and I will not explain the design. Is that clear?",
        "Ivo Stone: The design failed because I trusted the wrong constraint.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who deserves credit for an invention",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guardedHostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const cleanedGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(guardedHostTurn.message?.speakerRole, "host");
      assert.equal(
        BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS.includes(
          guardedHostTurn.message
            ?.content as (typeof BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS)[number],
        ),
        false,
      );
      assert.match(
        guardedHostTurn.message?.content ?? "",
        /engineer downstream|inherited the cost/iu,
      );
      assert.doesNotMatch(guardedHostTurn.message?.content ?? "", /^Ivo Stone:/u);
      assert.doesNotMatch(guardedHostTurn.message?.content ?? "", /part of/u);
      assert.equal(guardedHostTurn.message?.voicePerformanceText, null);
      const repairEvent = guardedHostTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guardedHostTurn.message?.id,
      );
      assert.deepEqual(repairEvent?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "peer_label",
        fallbackKind: "host_follow_up",
      });
      assert.equal(cleanedGuestTurn.message?.speakerRole, "guest");
      assert.equal(
        cleanedGuestTurn.message?.content,
        "The design failed because I trusted the wrong constraint.",
      );
    } finally {
      db.close();
    }
  });

  it("strips a peer-name screenplay label while preserving the host's direct question", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "A quick opening.",
        "The design failed because I trusted the wrong constraint.",
        "Ivo Stone: What consequence matters most, and who has to live with it?",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who pays for a failed design",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        hostTurn.message?.content,
        "What consequence matters most, and who has to live with it?",
      );
      assert.equal(
        hostTurn.episode.events.findLast(
          (event) => event.kind === "utterance",
        )?.payload.utteranceRepair,
        undefined,
      );
    } finally {
      db.close();
    }
  });

  it("replaces labeled Action / Spoken Line screenplay with a host follow-up", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to test screenplay leaks.",
        "The first irreversible choice is the one somebody has to live with afterward.",
        '"Something feels... off. Not just in the air, but in the way we\'re here. You know what I mean?" **Action:** *leans slightly forward, eyes scanning the room with a quiet intensity.* **Spoken Line:** "Something feels... off. Not just in the air, but in the way we\'re here. You know what I mean?"',
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Darkness That Writes Back",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(hostTurn.message?.speakerRole, "host");
      assert.doesNotMatch(hostTurn.message?.content ?? "", /\*\*Action:\*\*/u);
      assert.doesNotMatch(hostTurn.message?.content ?? "", /Spoken Line/iu);
      const repairEvent = hostTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === hostTurn.message?.id,
      );
      assert.deepEqual(repairEvent?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "production_meta",
        fallbackKind: "host_follow_up",
      });
    } finally {
      db.close();
    }
  });

  it("replaces a generic host stall with a follow-up question", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to test stall questions.",
        "The first irreversible choice is the one somebody has to live with afterward.",
        "What would you like to explore next?",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Darkness That Writes Back",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(hostTurn.message?.speakerRole, "host");
      assert.doesNotMatch(
        hostTurn.message?.content ?? "",
        /what would you like to explore next/iu,
      );
      const repairEvent = hostTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === hostTurn.message?.id,
      );
      assert.deepEqual(repairEvent?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "generic_follow_up",
        fallbackKind: "host_follow_up",
      });
    } finally {
      db.close();
    }
  });

  it("replaces a repeated guest answer and a repeated host question", async () => {
    const db = fixture();
    const loopingGuest =
      "The mechanisms underlie our ability to make decisions in real-time, even when we appear rational, but they are not the rational ones. They are the ones that whisper in the ear of the unconscious, the ones that shape the mind like a shadow upon a wall. And in that revelation, we are all but prisoners of our own thoughts.";
    const repeatedHostQuestion =
      "What mechanisms underlie our ability to make decisions in real-time, even when we appear rational?";
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to test repeated answers.",
        "I start with the first irreversible choice and the person who has to live with it.",
        repeatedHostQuestion,
        loopingGuest,
        repeatedHostQuestion,
        loopingGuest,
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Darkness That Writes Back",
      });
      const generationOptions = generation(provider);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const firstLoop = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(firstLoop.message?.content, loopingGuest);
      const repeatedHost = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(repeatedHost.message?.speakerRole, "host");
      assert.notEqual(repeatedHost.message?.content, repeatedHostQuestion);
      const hostRepair = repeatedHost.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repeatedHost.message?.id,
      );
      assert.deepEqual(hostRepair?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "repeated",
        fallbackKind: "host_follow_up",
      });
      const repeatedGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(repeatedGuest.message?.speakerRole, "guest");
      assert.notEqual(repeatedGuest.message?.content, loopingGuest);
      const guestRepair = repeatedGuest.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repeatedGuest.message?.id,
      );
      assert.deepEqual(guestRepair?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "repeated",
        fallbackKind: "guest_substantive_answer",
      });
    } finally {
      db.close();
    }
  });

  it("strips short-name speaker labels for multi-word bot names", async () => {
    const db = fixture();
    db.prepare("UPDATE bots SET name = ? WHERE id = 'guest-1'").run(
      "Interrupting Tom",
    );
    const provider = recordingProvider(
      [
        "A quick opening with Interrupting Tom on the show.",
        "Tom: Cutting early is how useful pressure shows up in a live room.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who benefits from a cut-off thought",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      assert.equal(
        guest.message?.content,
        "Cutting early is how useful pressure shows up in a live room.",
      );
      assert.doesNotMatch(guest.message?.content ?? "", /^Tom\s*:/u);
    } finally {
      db.close();
    }
  });

  it("strips bare Assistant role framing without a colon", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me for tonight's contradiction.",
        "Assistant I'm an imposter? That's quite a claim. What makes you think I'm not who I say I am?",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Two Mirrors Fighting Over the Original",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      assert.equal(
        guest.message?.content,
        "I'm an imposter? That's quite a claim. What makes you think I'm not who I say I am?",
      );
      assert.doesNotMatch(guest.message?.content ?? "", /^Assistant\b/u);
    } finally {
      db.close();
    }
  });

  it("repairs short dangling endings and bare ellipsis from the model", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to keep every claim complete.",
        "The other host is an impostor. I'm the real one—and that",
        "Your dangling claim still needs a consequence that lands.",
        "...",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Complete Signal turns",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const incompleteGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(incompleteGuest.message?.speakerRole, "guest");
      assert.notEqual(incompleteGuest.message?.content, "...");
      assert.doesNotMatch(incompleteGuest.message?.content ?? "", /—and that$/u);
      const incompleteRepair = incompleteGuest.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === incompleteGuest.message?.id,
      );
      assert.equal(incompleteRepair?.payload.utteranceRepair?.reason, "incomplete");

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const ellipsisGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(ellipsisGuest.message?.speakerRole, "guest");
      assert.notEqual(ellipsisGuest.message?.content, "...");
      assert.equal(ellipsisGuest.message?.socialSilence, undefined);
      const ellipsisRepair = ellipsisGuest.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === ellipsisGuest.message?.id,
      );
      assert.equal(
        ellipsisRepair?.payload.utteranceRepair?.reason,
        "empty_after_cleanup",
      );
    } finally {
      db.close();
    }
  });

  it("strips orphaned role labels and parenthetical stage directions", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to clean the wire.",
        // A truncated chat template can leave only the closing bracket.
        "assistant] That's correct, Mara. I was born in a records office and I remember every stamp.",
        "So the records office remembers you back — which stamp matters most?",
        "As for the answer... (leaning back in his chair) let us simply say the ledger never lies.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Clean transcripts",
      });
      const generationOptions = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const labelled = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(labelled.message?.speakerRole, "guest");
      assert.doesNotMatch(labelled.message?.content ?? "", /assistant\]/iu);
      assert.match(labelled.message?.content ?? "", /^That's correct, Mara/u);

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const parenthetical = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(parenthetical.message?.speakerRole, "guest");
      assert.doesNotMatch(
        parenthetical.message?.content ?? "",
        /\(leaning back in his chair\)/iu,
      );
      assert.match(
        parenthetical.message?.content ?? "",
        /the ledger never lies/iu,
      );
    } finally {
      db.close();
    }
  });

  it("repairs unfinished trailing copulas before they air", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me for the emblem exhibit.",
        "The mounting theory is",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Unfinished predicates",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(repaired.message?.speakerRole, "guest");
      assert.doesNotMatch(
        repaired.message?.content ?? "",
        /\bthe mounting theory is$/iu,
      );
      const repairEvent = repaired.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repaired.message?.id,
      );
      assert.equal(repairEvent?.payload.utteranceRepair?.reason, "incomplete");
    } finally {
      db.close();
    }
  });

  it("blocks social silence when a speech-copy peer would only mirror dead air", async () => {
    const db = fixture();
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([
        {
          version: 1,
          id: "hard-echo",
          name,
          intent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(name, intent),
            selfCue: "Repeat addressed speech exactly.",
            observerCue: "This host only echoes addressed speech.",
            effects: [{ type: "speech_copy", trigger: "direct_address" }],
            ruleLabels: ["Echoes addressed speech"],
          },
        },
      ]),
    );
    const provider = recordingProvider(
      [
        "This is Mara Vale in the Margins. I'm Mara Vale, and my guest is Ivo Stone. Ivo, start with the contradiction.",
        "The first contradiction is that a perfect mirror still needs an original claim.",
        "The second contradiction is that silence only works when someone can answer it.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Two Mirrors Fighting Over the Original",
      });
      const forcedSocialGeneration = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 1,
      };
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(opening.message?.speakerRole, "host");
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        forcedSocialGeneration,
      );
      assert.equal(guest.message?.speakerRole, "guest");
      assert.notEqual(guest.message?.content, "...");
      assert.equal(guest.message?.socialSilence, undefined);
      assert.match(
        guest.message?.content ?? "",
        /perfect mirror still needs an original claim/u,
      );
    } finally {
      db.close();
    }
  });

  it("varies deterministic host repairs instead of repeating a broken stock question", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "A quick opening.",
        "A guarded answer with one concrete consequence.",
        "Ivo Stone: I should answer this instead of the host.",
        "My answer adds a second concrete consequence.",
        "Ivo Stone: I should answer this one too.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Fame for Formula?",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const firstRepair = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const secondRepair = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(firstRepair.message?.speakerRole, "host");
      assert.equal(secondRepair.message?.speakerRole, "host");
      assert.notEqual(firstRepair.message?.content, secondRepair.message?.content);
      assert.doesNotMatch(firstRepair.message?.content ?? "", /Formula\? that/u);
      assert.doesNotMatch(secondRepair.message?.content ?? "", /Formula\? that/u);
    } finally {
      db.close();
    }
  });

  it("keeps production-medium explanations out of the spoken transcript", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "A quick opening.",
        "A guarded answer.",
        "You speak without the accent people expect. Why?",
        "It is the medium's convention, not an affectation.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Voice and public identity",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guardedGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[3]!.map((message) => message.content).join("\n");
      assert.match(
        prompt,
        /Never explain your voice, accent[\s\S]*convention of the medium/u,
      );
      assert.match(
        prompt,
        /Never use a generic premise-rejection disclaimer/u,
      );
      assert.match(
        guardedGuestTurn.message?.content ?? "",
        /Voice and public identity/u,
      );
      assert.doesNotMatch(
        guardedGuestTurn.message?.content ?? "",
        /(?:accept|reject|dispute|question) the premise|part that matters/iu,
      );
      assert.doesNotMatch(guardedGuestTurn.message?.content ?? "", /medium/iu);
    } finally {
      db.close();
    }
  });

  it("replaces generic premise deferrals with a substantive Signal answer", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "A quick opening.",
        "A guarded answer.",
        "What changes when spectacle becomes the only way to be heard?",
        "I do not accept the premise as stated, but I will address the part that matters.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Whether spectacle can preserve agency",
      });

      for (let turn = 0; turn < 3; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(provider),
        );
      }
      const recoveredGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[3]!.map((message) => message.content).join("\n");
      assert.match(
        prompt,
        /If you disagree, identify the specific claim and respond to it in character/u,
      );
      assert.doesNotMatch(prompt, /answer in character or reject the premise/u);
      assert.match(
        recoveredGuestTurn.message?.content ?? "",
        /What changes when spectacle becomes the only way to be heard/iu,
      );
      assert.doesNotMatch(
        recoveredGuestTurn.message?.content ?? "",
        /(?:accept|reject|dispute|question) the premise|part that matters/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps third-person performance narration out of the spoken transcript", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "A quick opening.",
        "A guarded answer.",
        "What did building it cost you?",
        "Silence stretches behind the mask. The room seems to tighten. When Ivo Stone speaks, his voice is quieter. It cost me the belief that invention could remain innocent.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The private cost of ambition",
      });

      for (let turn = 0; turn < 3; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(provider),
        );
      }
      const cleanedGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[3]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Speak only the on-air line/u);
      // Invited stage-action turns (seeded per episode id) use the "Do not
      // narrate" phrasing; both variants forbid third-person narration.
      assert.match(prompt, /(?:Never|Do not) narrate the room, silence, pauses/u);
      assert.equal(
        cleanedGuestTurn.message?.content,
        "It cost me the belief that invention could remain innocent.",
      );
      assert.doesNotMatch(
        cleanedGuestTurn.message?.voicePerformanceText ?? "",
        /Silence stretches|room seems|When Ivo Stone speaks/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps physical stage actions out of dialogue and voice-performance text", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "[sighs] *leans back, antennae twitching* Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Off-mic stage actions.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Off-mic stage actions",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        advanced.message?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Off-mic stage actions.",
      );
      assert.equal(
        advanced.message?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Off-mic stage actions. [sighs]",
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /antennae|\*/iu);
      assert.doesNotMatch(
        advanced.message?.voicePerformanceText ?? "",
        /antennae|\*/iu,
      );
    } finally {
      db.close();
    }
  });

  it("persists an invited Signal stage action separately from speech and vocal tags", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Let us begin with the practical question.",
        "The practical question is whether the cost can be shared.",
        "[sighs] *raises an eyebrow* It can, but only if someone accepts responsibility.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Shared responsibility",
      });
      // Episode IDs are random, so select a replay-stable seed that invites the
      // persona for the first ordinary host interview turn.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const plan = planStageActionV1({
          lane: "signal",
          seed: `signal-stage-action:${episode.id}:host-1:2`,
        });
        if (plan.decision === "persona_invite") break;
        episode = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Shared responsibility ${attempt + 2}`,
        });
      }
      assert.equal(
        planStageActionV1({
          lane: "signal",
          seed: `signal-stage-action:${episode.id}:host-1:2`,
        }).decision,
        "persona_invite",
      );

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const interviewTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(interviewTurn.message?.stageActionText, "raises an eyebrow");
      assert.equal(
        interviewTurn.message?.content,
        "It can, but only if someone accepts responsibility.",
      );
      assert.equal(
        interviewTurn.message?.voicePerformanceText,
        "[sighs] It can, but only if someone accepts responsibility.",
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /Signal stage-direction format for this invited turn/u,
      );
      const utterance = interviewTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === interviewTurn.message?.id,
      );
      assert.deepEqual(utterance?.payload.stageAction, {
        v: 1,
        source: "llm",
        category: "gesture",
        action: "raises an eyebrow",
        seed: `signal-stage-action:${episode.id}:host-1:2`,
        lane: "signal",
      });
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.stageActionText,
        "raises an eyebrow",
      );
    } finally {
      db.close();
    }
  });

  it("fills an ordinary Signal interview turn with a director stage action", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. Let us begin with the practical question.",
        "The practical question is whether the cost can be shared.",
        "It can, but only if someone accepts responsibility.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Shared responsibility",
      });
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const interviewTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.ok(interviewTurn.message?.stageActionText);
      const utterance = interviewTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === interviewTurn.message?.id,
      );
      assert.equal(
        (utterance?.payload.stageAction as { source?: unknown } | undefined)?.source,
        "director",
      );
    } finally {
      db.close();
    }
  });

  it("asks the opening host to reframe a raw topic organically in persona", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const organicOpening =
      "Some questions refuse to stay politely theoretical, and this one has been needling me all week. I'm Mara Vale, this is Mara Vale in the Margins, and Ivo Stone is here to help me put it under pressure. Ivo, do you believe there is a god—and what would count as evidence?";
    const provider = recordingProvider(
      [
        organicOpening,
        "You make it sound like the question has teeth, Mara. Good—it should. Evidence has to survive contact with doubt, not merely decorate belief.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Does God exist",
      });

      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.ok(prompt.includes(`exact show name "${show.name}"`));
      assert.match(prompt, /identifies you by name as "Mara Vale"/u);
      assert.match(prompt, /booked guest by exact name as "Ivo Stone"/u);
      assert.match(
        prompt,
        /complete the guest introduction immediately before any extended premise hook or first question/u,
      );
      assert.match(prompt, /not generic podcast copy/u);
      assert.match(prompt, /Dedicated Signal opening-authoring pass/u);
      assert.match(prompt, /persisted show premise, hosting style, and studio identity/u);
      assert.match(prompt, /degree and manner of anticipation/u);
      assert.match(prompt, /genuine personal desire to be on mic/u);
      assert.match(prompt, /fresh opening architecture/u);
      assert.match(prompt, /protected identity lead/u);
      assert.match(prompt, /person already in the room/u);
      assert.match(prompt, /beginning of an interaction, not a host monologue/u);
      assert.match(prompt, /one clean conversational opening/u);
      assert.match(
        prompt,
        /show name and your host identification in the first sentence/u,
      );
      assert.match(prompt, /meaning of the topic or the lesson behind the topic/u);
      assert.match(prompt, /Persisted studio identity/u);
      assert.match(prompt, /two to four concise sentences/u);
      assert.match(prompt, /raw editorial title, not a line of dialogue/u);
      assert.match(prompt, /expand or grammatically reframe it as needed/u);
      assert.match(prompt, /preserve its meaning/u);
      assert.match(prompt, /let the host persona flavor the framing/u);
      assert.match(prompt, /exact title does not need to appear verbatim/u);
      assert.match(prompt, /Do not treat verbatim wording as a requirement/u);
      assert.match(prompt, /Do not .*fall back to a fixed topic-announcement template/u);
      assert.doesNotMatch(prompt, /Today we (?:are|'re) going to talk about/iu);
      assert.equal(advanced.message?.content, organicOpening);
      assert.doesNotMatch(advanced.message?.content ?? "", /Does God exist/u);
      assert.doesNotMatch(
        advanced.message?.content ?? "",
        /Today we (?:are|'re) going to talk about/iu,
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /^Welcome to/iu);
      const openingShots = advanced.episode.events
        .filter(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.messageId === advanced.message?.id,
        )
        .map((event) => event.payload);
      assert.deepEqual(
        openingShots.map((shot) => shot.shot),
        ["left", "right"],
      );
      assert.equal(openingShots[0]?.reason, "opening");
      assert.equal(openingShots[0]?.minimumHoldMs, 1_800);
      assert.equal(openingShots[1]?.reason, "introduction");
      assert.equal(openingShots[1]?.speakerRole, "guest");
      assert.ok(
        Number(openingShots[1]?.atMs) > Number(openingShots[0]?.atMs),
      );

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(guestPrompt, /first on-mic reply/u);
      assert.match(guestPrompt, /actual welcome, guest-specific observation/u);
      assert.match(guestPrompt, /generic "glad to be here" podcast filler/u);
    } finally {
      db.close();
    }
  });

  it("carries speaker and peer Powers into Signal turns", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["A powered opening."], captures);
    const readyPower = (
      id: string,
      name: string,
      selfCue: string,
      observerCue: string,
    ) =>
      JSON.stringify([
        {
      version: 1,
      id,
      name,
      intent: name,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, name),
        selfCue,
        observerCue,
        effects: [],
        ruleLabels: [],
      },
        },
      ]);
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        readyPower(
          "precision",
          "Precision",
          "Ask surgically precise questions.",
          "Her questions expose weak claims.",
        ),
      );
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        readyPower(
          "static",
          "Static",
          "Speak through radio static.",
          "Ivo's voice carries radio static.",
        ),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Power contracts",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Active Powers:/u);
      assert.match(prompt, /Precision: Ask surgically precise questions/u);
      assert.match(
        prompt,
        /Ivo Stone — Static: Ivo's voice carries radio static/u,
      );
      assert.match(
        prompt,
        /React only to Ivo Stone's consequences you can actually observe on air/u,
      );
      assert.match(prompt, /or no overt reaction are all valid/u);
      assert.match(prompt, /Never name or explain a Power, infer a hidden cause/u);
    } finally {
      db.close();
    }
  });

  it("freezes the effective short-term-amnesia contract in Signal production records", () => {
    const db = fixture();
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is only a sincere first introduction with no awareness of earlier turns.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        JSON.stringify([
          {
            version: 1,
            id: "forgetful-freddie",
            name: powerName,
            intent: powerIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(powerName, powerIntent),
              selfCue:
                "HARD OUTPUT CONTRACT: return only a short first-time self-introduction. Never answer the topic, ask a question, mention repetition, or use prior context.",
              observerCue:
                "Forgetful Freddie believes every utterance is a first introduction.",
              effects: [
                { type: "eternal_introduction", memory: "current_turn_only" },
              ],
              ruleLabels: [
                "Current-turn-only memory",
                "Every reply is a first introduction",
              ],
            },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Identity Theft at Every First Meeting",
      });
      const openingEvent = episode.events.find(
        (event) => event.kind === "segment" && event.payload.ordinal === 0,
      );
      const guestPower = (
        openingEvent?.payload.powerSnapshot as
          | { guestPowers?: Array<{ compiled?: Record<string, unknown> | null }> }
          | undefined
      )?.guestPowers?.[0];

      assert.match(
        String(guestPower?.compiled?.selfCue ?? ""),
        /Hard fresh-contact rule[\s\S]*reuse a canned introduction/iu,
      );
      assert.match(
        String(guestPower?.compiled?.observerCue ?? ""),
        /visibly treats each reply as fresh contact[\s\S]*retain the full encounter/iu,
      );
      assert.deepEqual(guestPower?.compiled?.ruleLabels, [
        "Current other-speaker message only",
        "No standing topic memory",
        "No prior conversation memory",
      ]);
      assert.deepEqual(guestPower?.compiled?.effects, [
        {
          type: "eternal_introduction",
          memory: "current_other_speaker_message",
        },
      ]);
    } finally {
      db.close();
    }
  });

  it("repairs a legacy Signal intro-only cue into a current-speaker retort", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to The Signal Hour. I'm Mara Vale. What is your view on the topic?",
        "Karen stored the ledger checksum in the state machine before the launch.",
        "I'm Mara Vale; pleased to meet you. Karen's checksum changes the state machine. What follows from that?",
      ],
      captures,
    );
    const powerName = "Eternal Introduction";
    const powerIntent = "Every message is only a sincere first introduction. Mara has no awareness of her own prior messages or the earlier conversation, while other bots remember and become agitated.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([{
          version: 1,
          id: "eternal-introduction",
          name: powerName,
          intent: powerIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(powerName, powerIntent),
            selfCue: "HARD OUTPUT CONTRACT: return only a short first-time self-introduction. Never answer the topic, ask a question, mention repetition, or use prior context.",
            observerCue: "Remember every repetition and react naturally.",
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
            ruleLabels: ["Current-turn-only memory"],
          },
        }]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The missing checksum",
      });

      const first = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const third = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", detail: "Karen's ledger checksum" } },
        generation(provider),
      );

      assert.equal(
        third.message?.content,
        "I'm Mara Vale; pleased to meet you. Karen's checksum changes the state machine. What follows from that?",
      );
      const thirdPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(thirdPrompt, /Hard fresh-contact rule/iu);
      assert.match(thirdPrompt, /Karen stored the ledger checksum in the state machine/iu);
      assert.match(
        thirdPrompt,
        /Private live producer cue: ask_about — Karen's ledger checksum/iu,
      );
      assert.doesNotMatch(thirdPrompt, /Welcome to The Signal Hour/iu);
      assert.doesNotMatch(thirdPrompt, /The missing checksum/iu);
      assert.doesNotMatch(thirdPrompt, /only a short first-time self-introduction/iu);
    } finally {
      db.close();
    }
  });

  it("repairs a forgetful host question before completing the closing turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "This is Mara Vale in the Margins, and I’m Mara Vale. Ivo Stone, when power needs an audience, what does it ask them to remember?",
        "It asks them to remember fear long after the machine itself is gone.",
        "Hello, I’m Mara Vale. What does fear demand from the audience in front of you?",
        "It demands that they keep reacting after the threat should have gone stale.",
        "I’m Mara Vale. What survives when the audience stops reacting?",
        "Only the consequences; the theatre collapses without attention.",
        "Hello, I’m Mara Vale. Bucket or basket?",
        "Pleased to meet you; I’m Mara Vale. Bucket or basket?",
      ],
      captures,
    );
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is only a sincere first introduction. Mara has no awareness of her own prior messages or the earlier conversation.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([
          {
            version: 1,
            id: "eternal-introduction",
            name: powerName,
            intent: powerIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(powerName, powerIntent),
              selfCue: "Every request is first contact.",
              observerCue: "Remember every repetition and react naturally.",
              effects: [
                {
                  type: "eternal_introduction",
                  memory: "current_other_speaker_message",
                },
              ],
              ruleLabels: ["Current other-speaker message only"],
            },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Doomsday devices need an audience",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      db.prepare(
        "UPDATE botcast_episodes SET started_at = ? WHERE id = ? AND user_id = ?",
      ).run(
        new Date(Date.now() - 31 * 60_000).toISOString(),
        episode.id,
        "user-1",
      );

      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(closing.episode.status, "completed");
      assert.equal(closing.episode.segment, "closing");
      assert.equal(
        closing.message?.content,
        "Pleased to meet you—I'm Mara Vale. That is where we will leave it. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      assert.doesNotMatch(closing.message?.content ?? "", /\?/u);
      const closingUtterance = closing.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === closing.message?.id,
      );
      assert.equal(
        closingUtterance?.payload.utteranceRepair?.reason,
        "incomplete_signoff",
      );
      assert.equal(
        closingUtterance?.payload.utteranceRepair?.fallbackKind,
        "host_closing",
      );
      assert.equal(captures.length, 7);
      assert.match(
        captures[6]!.map((message) => message.content).join("\n"),
        /final host-owned beat/u,
      );
    } finally {
      db.close();
    }
  });

  it("gives a forgetful Signal holder the current on-air message with varied fresh-contact direction", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "I'm Mara Vale. You seem tense, but it's nice to meet you.",
        "You introduced yourself to me a moment ago, Mara.",
        "I'm Mara Vale. I don't know why you're upset, but it's nice to meet you.",
      ],
      captures,
    );
    const powerName = "Eternal Introduction";
    const powerIntent = "Every message is only a sincere first introduction. Mara has no awareness of her own prior messages or the earlier conversation, while other bots remember and become agitated.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([{
          version: 1,
          id: "eternal-introduction",
          name: powerName,
          intent: powerIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(powerName, powerIntent),
            selfCue: "Every request is first contact; introduce yourself only.",
            observerCue: "Remember every repetition and react naturally.",
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
            ruleLabels: ["Current-turn-only memory"],
          },
        }]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Repetition and patience",
      });

      const first = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));
      const third = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        first.message?.content,
        "I'm Mara Vale. You seem tense, but it's nice to meet you.",
      );
      assert.equal(
        third.message?.content,
        "I'm Mara Vale. I don't know why you're upset, but it's nice to meet you.",
      );
      const thirdPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(thirdPrompt, /You introduced yourself to me a moment ago/iu);
      assert.match(
        thirdPrompt,
        /Hard fresh-contact rule[\s\S]*reuse a canned introduction/iu,
      );
      assert.match(thirdPrompt, /Current other-speaker on-air message/iu);
      assert.doesNotMatch(thirdPrompt, /Repetition and patience/iu);
    } finally {
      db.close();
    }
  });

  it("retries and records a bounded Power repair when a forgetful host skips fresh contact", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "I'm Mara Vale. You seem tense, but it's nice to meet you.",
        "Its wear records a life more honestly than decoration can.",
        "Ivo, when wear records a life, what separates attention from decoration?",
        "When wear records a life, what tells you the attention is honest?",
      ],
      captures,
    );
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is only a sincere first introduction. Mara has no awareness of her own prior messages or the earlier conversation.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([
          {
            version: 1,
            id: "eternal-introduction",
            name: powerName,
            intent: powerIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(powerName, powerIntent),
              selfCue: "Every request is first contact.",
              observerCue: "Remember every repetition and react naturally.",
              effects: [
                {
                  type: "eternal_introduction",
                  memory: "current_other_speaker_message",
                },
              ],
              ruleLabels: ["Current other-speaker message only"],
            },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The moral weight of looking",
        preferredProvider: "openai",
        modelOverride: "gpt-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "openai" as const,
        providerFactory: (() => provider) as typeof selectProvider,
        signalSocialSilenceChanceOverride: 0,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(captures.length, 4);
      assert.match(
        repaired.message?.content ?? "",
        /^(?:Hello—I'm Mara Vale\.|Pleased to meet you—I'm Mara Vale\.|I'm Mara Vale; I don't believe we've met\.|Forgive me, I should introduce myself: I'm Mara Vale\.) When wear records a life, what tells you the attention is honest\?$/u,
      );
      const utterance = repaired.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repaired.message?.id,
      );
      assert.deepEqual(utterance?.payload.utteranceRepair, {
        v: 1,
        source: "power_runtime",
        reason: "power_fresh_contact",
        fallbackKind: "host_follow_up",
      });
      assert.equal(utterance?.payload.providerRecovery?.trigger, "content_validation");
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "invalid_output" },
          { outcome: "rejected", reason: "invalid_output" },
        ],
      );
      assert.match(
        captures[3]!.map((message) => message.content).join("\n"),
        /Hard Power output contract:[\s\S]*first-contact self-introduction[\s\S]*Mara Vale/iu,
      );
    } finally {
      db.close();
    }
  });

  it("rejects a forgetful Signal speaker adopting the other speaker's identity", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to examine what a first impression costs. Ivo, what do you notice first?",
        "I'm Mara Vale, and I notice whether the person opposite me is willing to answer plainly.",
        "My name is Mara Vale. The first thing I notice is whether the other person means what they say.",
      ],
      captures,
    );
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is only a sincere first introduction. Ivo has no awareness of his own prior messages or the earlier conversation.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        JSON.stringify([
          {
            version: 1,
            id: "eternal-introduction",
            name: powerName,
            intent: powerIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(powerName, powerIntent),
              selfCue: "Every request is first contact.",
              observerCue: "Remember every repetition and react naturally.",
              effects: [
                {
                  type: "eternal_introduction",
                  memory: "current_other_speaker_message",
                },
              ],
              ruleLabels: ["Current other-speaker message only"],
            },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of a first impression",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "anthropic" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(repaired.message?.speakerRole, "guest");
      assert.doesNotMatch(
        repaired.message?.content ?? "",
        /\b(?:I\s*(?:am|['’]m)|my name is)\s+Mara(?:\s+Vale)?\b/iu,
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.content,
        repaired.message?.content,
      );
      const utterance = repaired.episode.events.findLast(
        (event) => event.kind === "utterance",
      );
      assert.equal(
        utterance?.payload.utteranceRepair?.reason,
        "speaker_identity_swap",
      );
      assert.equal(
        utterance?.payload.providerRecovery?.trigger,
        "content_validation",
      );
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "invalid_output" },
          { outcome: "rejected", reason: "invalid_output" },
        ],
      );
      const rejectedGeneration = repaired.episode.events.findLast(
        (event) =>
          event.kind === "provider_generation" &&
          event.payload.turnOrdinal === 1,
      );
      assert.equal(rejectedGeneration?.payload.outcome, "rejected");
      const guestPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(guestPrompt, /You are Ivo Stone in a fictional/u);
      assert.match(guestPrompt, /Your assigned on-air role: guest/u);
      assert.match(guestPrompt, /Mara Vale is the person in front of you now/u);
      assert.doesNotMatch(
        guestPrompt,
        /Immutable identity: you are|Hard short-term-amnesia|HARD MEMORY CONTRACT/u,
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /Your immutable identity is Ivo Stone\. Mara Vale is the other speaker\./u,
      );
    } finally {
      db.close();
    }
  });

  it("keeps a forgetful Signal holder's spoken lines without rewriting introductions", async () => {
    const db = fixture();
    const provider = recordingProvider([
      "Pleased to meet you; I am Mara Vale. The first useful point is that patience needs a concrete practice.",
      "A concrete practice is pausing before you decide repetition is intentional.",
      "The strongest practice is to ask one clear question before you judge the answer; I am Mara Vale, by the way, pleased to meet you.",
    ], []);
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is only a sincere first introduction. Mara has no awareness of her own prior messages or the earlier conversation.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([{
          version: 1,
          id: "eternal-introduction",
          name: powerName,
          intent: powerIntent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(powerName, powerIntent),
            selfCue: "Every request is first contact; introduce yourself only.",
            observerCue: "Remember every repetition and react naturally.",
            effects: [{
              type: "eternal_introduction",
              memory: "current_other_speaker_message",
            }],
            ruleLabels: ["Current-turn-only memory"],
          },
        }]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Repetition and patience",
      });

      const first = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const third = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        first.message?.content,
        "Pleased to meet you; I am Mara Vale. The first useful point is that patience needs a concrete practice.",
      );
      assert.equal(
        third.message?.content,
        "The strongest practice is to ask one clear question before you judge the answer; I am Mara Vale, by the way, pleased to meet you.",
      );
    } finally {
      db.close();
    }
  });

  it("books a Signal pairing that violates a hard speech-audience Power", () => {
    const db = fixture();
    const name = "Private Channel";
    const intent = "Speaks only to a bot named Light.";
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        JSON.stringify([
          {
        version: 1,
        id: "private-channel",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Address only Light.",
          observerCue: "Only Light can hear Mara.",
              effects: [
                {
            type: "speech_audience",
            allowed: [{ kind: "bot", name: "Light" }],
                },
              ],
          ruleLabels: ["Heard only by Light"],
        },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });

      const episode = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: "An incompatible booking",
      });
      assert.equal(episode.status, "live");
      assert.equal(episode.guestPresenceMode, "present");
    } finally {
      db.close();
    }
  });

  it("keeps an imperceptible guest out of the audience experience and review", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "The chair is empty, which is not how this was meant to begin.",
        "She really cannot see me. This may be better than the interview.",
        "I am beginning to think our booking vanished into thin air.",
      ],
      captures,
    );
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        invisibleGuestPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The guest no one can see",
      });

      assert.equal(episode.guestPresenceMode, "audience_only");
      assert.ok(
        episode.events.some(
          (event) =>
            event.kind === "guest_presence" &&
            event.payload.mode === "audience_only",
        ),
      );

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const finalTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      episode = finalTurn.episode;

      const openingHostPrompt = captures[0]!
        .map((message) => message.content)
        .join("\n");
      const guestPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      const returningHostPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      assert.match(openingHostPrompt, /guest chair appears empty/u);
      assert.match(
        openingHostPrompt,
        /unexplained absence is the only consequence you can observe/u,
      );
      assert.match(
        openingHostPrompt,
        /Let your own host persona decide one opening response/u,
      );
      assert.match(openingHostPrompt, /Never name a Power, infer an unseen cause/u);
      assert.doesNotMatch(openingHostPrompt, /Only Light Yagami can perceive/u);
      assert.match(guestPrompt, /You are the guest\. Answer from your persona/u);
      assert.doesNotMatch(guestPrompt, /internal performance record/u);
      assert.match(guestPrompt, /guest chair is empty/iu);
      assert.match(returningHostPrompt, /guest chair is empty/iu);
      assert.match(
        returningHostPrompt,
        /Advance a self-contained editorial argument/u,
      );
      assert.match(
        returningHostPrompt,
        /After the opening, normalize the absence/u,
      );
      assert.doesNotMatch(returningHostPrompt, /She really cannot see me/u);
      assert.match(finalTurn.message?.content ?? "", /central question/u);
      assert.doesNotMatch(
        finalTurn.message?.content ?? "",
        /empty chair|booking vanished/iu,
      );
      const audienceEpisode = projectBotcastEpisodeForAudienceV1(episode);
      const projectedGuestTurn = audienceEpisode.messages.find(
        (message) => message.id === guestTurn.message?.id,
      );
      assert.deepEqual(audienceEpisode.audienceExperience?.participants.guest, {
        visible: false,
        audible: false,
      });
      assert.equal(projectedGuestTurn?.content, "...");
      assert.equal(projectedGuestTurn?.voicePerformanceText, null);
      assert.equal(projectedGuestTurn?.stageActionText, null);
      assert.equal(projectedGuestTurn?.audienceDelivery?.audible, false);
      const replayEpisode = projectBotcastEpisodeForObserverV2(
        episode,
        "replay",
      );
      const replayGuestTurn = replayEpisode.messages.find(
        (message) => message.id === guestTurn.message?.id,
      );
      assert.equal(
        replayEpisode.observerProjection?.participants.guest.visibility,
        "hidden",
      );
      assert.equal(
        replayEpisode.observerProjection?.participants.guest.audible,
        false,
      );
      assert.equal(replayGuestTurn?.content, "...");
      assert.ok(
        replayEpisode.events.some(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "perception_overlap" &&
            event.payload.precedingMessageId === guestTurn.message?.id &&
            event.payload.overlappingMessageId === finalTurn.message?.id,
        ),
      );
      const artifact = buildBotcastAudienceReviewArtifactV1({
        episode,
        hostName: "Mara Vale",
        guestName: "Ivo Stone",
      });
      assert.doesNotMatch(JSON.stringify(artifact), /She really cannot see me/u);

      insertSignalReviewPersona(
        db,
        "critic-invisible",
        "Nia Cross",
        "2026-01-03T00:00:00.000Z",
      );
      forceEndBotcastEpisode(db, "user-1", episode.id);
      const reviewCaptures: ProviderMessage[][] = [];
      const review = await ensureBotcastEpisodePersonaReview(
        db,
        "user-1",
        episode.id,
        generation(
          recordingProvider(
            ['{"rating":1.4,"comment":"A strange solo broadcast with no guest contribution."}'],
            reviewCaptures,
          ),
        ),
        () => 0,
      );
      assert.equal(review?.reviewerBotId, "critic-invisible");
      const reviewPrompt = reviewCaptures[0]
        ?.map((message) => message.content)
        .join("\n");
      assert.match(reviewPrompt ?? "", /Signal broadcast audience/u);
      assert.doesNotMatch(reviewPrompt ?? "", /She really cannot see me/u);
      assert.equal(
        episode.events.some(
          (event) =>
            event.kind === "listener_reaction" &&
            (event.payload.plan as { messageId?: string } | undefined)
              ?.messageId === guestTurn.message?.id,
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("makes session-start intimidation a bounded, replayable Signal pressure", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Darth Vader to explore what remains of authority when fear no longer works. Darth Vader, where should we begin?",
        "Authority remains when discipline outlives spectacle.",
        "Then give me one concrete example where discipline survived without fear.",
      ],
      captures,
    );
    try {
      db.prepare(
        "UPDATE bots SET name = 'Darth Vader', powers_json = ? WHERE id = 'guest-1'",
      ).run(intimidatingGuestPowers());
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What remains of authority when fear no longer works?",
      });

      const influence = episode.events.find(
        (event) => event.kind === "power_effect",
      );
      assert.deepEqual(influence?.payload, {
        v: 1,
        effect: "social_influence",
        powerId: "intimidation",
        powerName: "Intimidation",
        sourceBotId: "guest-1",
        targetBotId: "host-1",
        sourceRole: "guest",
        targetRole: "host",
        trigger: "session_start",
        polarity: "negative",
        strength: "large",
        atMs: 0,
      });
      assert.ok(
        episode.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.reason === "power_effect" &&
            event.payload.shot === "right",
        ),
      );

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(opening.message?.moodKey, "guarded");
      const openingPrompt = captures[0]!
        .map((message) => message.content)
        .join("\n");
      assert.match(openingPrompt, /Signal Power pressure:/u);
      assert.match(openingPrompt, /brief involuntary pause/u);
      assert.match(openingPrompt, /Keep your host role and agency/u);
      assert.match(openingPrompt, /Do not announce fear, become submissive/u);

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const returningHost = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      episode = returningHost.episode;
      assert.doesNotMatch(
        captures[1]!.map((message) => message.content).join("\n"),
        /Signal Power pressure:/u,
      );
      assert.doesNotMatch(
        captures[2]!.map((message) => message.content).join("\n"),
        /Signal Power pressure:/u,
      );
      assert.equal(returningHost.message?.moodKey, "neutral");
      assert.equal(
        episode.events.filter((event) => event.kind === "power_effect").length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("persists one Joyful Nora mood lift and applies it to the recipient's next Signal turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Joy in Practice. I'm Joyful Nora, and today I'm joined by Ivo Stone to face the hard parts honestly. Ivo Stone, I am genuinely delighted you are here—where should we begin?",
        "The warmth lands, but I still disagree with the premise; let's start with the failure nobody wants to name.",
      ],
      captures,
    );
    try {
      db.prepare(
        "UPDATE bots SET name = 'Joyful Nora', system_prompt = ?, powers_json = ? WHERE id = 'host-1'",
      ).run(
        "An extraordinarily joyful host who faces serious problems honestly and never forces agreement.",
        joyfulHostPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "How should a team face a painful failure without denial?",
      });

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const sourceMessageId = opening.message?.id;
      assert.ok(sourceMessageId);
      episode = opening.episode;
      const boostEvents = episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "mood_boost",
      );
      assert.equal(boostEvents.length, 1);
      assert.deepEqual(boostEvents[0]?.payload, {
        v: 1,
        effect: "mood_boost",
        powerId: "joyful-nora",
        powerName: "Radiant Joy",
        sourceBotId: "host-1",
        targetBotId: "guest-1",
        sourceRole: "host",
        targetRole: "guest",
        trigger: "after_spoken_turn",
        recipients: "addressed",
        strength: "medium",
        moodBefore: "neutral",
        moodAfter: "warm",
        atMs: boostEvents[0]?.payload.atMs,
        sourceMessageId,
      });

      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestPrompt = captures[1]?.map((message) => message.content).join("\n") ?? "";
      assert.match(guestPrompt, /Signal Power uplift/iu);
      assert.match(guestPrompt, /own voice and personality/iu);
      assert.match(guestPrompt, /without agreeing, denying facts, erasing sadness/iu);
      assert.equal(guestTurn.message?.moodKey, "warm");
      assert.match(guestTurn.message?.content ?? "", /still disagree/iu);
      assert.equal(
        guestTurn.episode.events.filter(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "mood_boost" &&
            event.payload.sourceMessageId === sourceMessageId,
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("gives hard mute precedence over Joyful Nora's after-spoken-turn Signal lift", async () => {
    const db = fixture();
    try {
      db.prepare(
        "UPDATE bots SET name = 'Joyful Nora', powers_json = ? WHERE id = 'host-1'",
      ).run(joyfulHostPowers(true));
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Silence and joy",
      });
      const turn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(recordingProvider(["This should never be spoken."], [])),
      );
      assert.equal(botPowerResponseIsSilentV1(turn.message?.content), true);
      assert.ok(turn.message?.mutePerformance);
      assert.equal(
        turn.episode.events.some(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "mood_boost",
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("Signal selects and persists only the active Nocturnal branch per turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome. Ivo Stone, the daylight is already wearing thin—what do you want?",
        "Night Owl, I still want an answer, even if this exchange is draining.",
        "Welcome back! Ivo Stone, the night is alive, and I am genuinely thrilled you're here.",
      ],
      captures,
    );
    try {
      db.prepare(
        "UPDATE bots SET name = 'Night Owl', powers_json = ? WHERE id = 'host-1'",
      ).run(nocturnalHostPowers());
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const lightEpisode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Daylight fatigue",
      });
      const lightOpening = await advanceBotcastEpisode(
        db,
        "user-1",
        lightEpisode.id,
        {},
        { ...generation(provider), theme: "light" },
      );
      assert.match(
        captures[0]?.map((message) => message.content).join("\n") ?? "",
        /only the sad branch is active/iu,
      );
      assert.equal(
        lightOpening.episode.events.some(
          (event) => event.kind === "power_effect" && event.payload.effect === "mood_boost",
        ),
        false,
      );
      const lightGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        lightEpisode.id,
        {},
        { ...generation(provider), theme: "light" },
      );
      const lightDrain = lightGuest.episode.events.find(
        (event) => event.kind === "power_effect" && event.payload.effect === "mood_drain",
      );
      assert.equal(lightDrain?.payload.theme, "light");

      const darkEpisode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Nighttime energy",
      });
      const darkOpening = await advanceBotcastEpisode(
        db,
        "user-1",
        darkEpisode.id,
        {},
        { ...generation(provider), theme: "dark" },
      );
      assert.match(
        captures[2]?.map((message) => message.content).join("\n") ?? "",
        /only the radiant-joy branch is active/iu,
      );
      const darkBoost = darkOpening.episode.events.find(
        (event) => event.kind === "power_effect" && event.payload.effect === "mood_boost",
      );
      assert.equal(darkBoost?.payload.theme, "dark");
      assert.equal(
        darkOpening.episode.events.some(
          (event) => event.kind === "power_effect" && event.payload.effect === "mood_drain",
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("persists Sad Sally's drain and applies it to only the addresser's next Signal turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to The Heavy Hour. I'm Ivo Stone, joined by Sad Sally. Sally, why does every possibility sound exhausted before it begins?",
        "Because enthusiasm is usually just disappointment arriving early, Ivo.",
        "Your gloom is wearing on me, Sally, but I still reject that conclusion; caution is not surrender.",
      ],
      captures,
    );
    try {
      db.prepare(
        "UPDATE bots SET name = 'Sad Sally', system_prompt = ?, powers_json = ? WHERE id = 'guest-1'",
      ).run(
        "A persistently sad, grouchy, irritating guest who remains perceptive and never forces others to agree.",
        sadGuestPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Whether disappointment makes hope irrational",
      });

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const sourceMessageId = opening.message?.id;
      assert.ok(sourceMessageId);
      episode = opening.episode;
      const drainEvents = episode.events.filter(
        (event) =>
          event.kind === "power_effect" &&
          event.payload.effect === "mood_drain",
      );
      assert.equal(drainEvents.length, 1);
      assert.deepEqual(drainEvents[0]?.payload, {
        v: 1,
        effect: "mood_drain",
        powerId: "sad-sally",
        powerName: "Sad",
        sourceBotId: "guest-1",
        targetBotId: "host-1",
        sourceRole: "guest",
        targetRole: "host",
        trigger: "after_direct_address",
        recipient: "addresser",
        strength: "medium",
        moodBefore: "neutral",
        moodAfter: "guarded",
        atMs: drainEvents[0]?.payload.atMs,
        sourceMessageId,
      });

      episode = (await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      )).episode;
      const returningHost = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hostPrompt = captures[2]?.map((message) => message.content).join("\n") ?? "";
      assert.match(hostPrompt, /Signal Power drag/iu);
      assert.match(hostPrompt, /overrides the generic option to show no overt reaction/iu);
      assert.match(hostPrompt, /first-person admission of your own reduced momentum/iu);
      assert.match(hostPrompt, /Required next-line beat.*your own reduced momentum in first person/iu);
      assert.match(hostPrompt, /Do not force hatred, hopelessness, agreement/iu);
      assert.equal(returningHost.message?.moodKey, "guarded");
      assert.match(returningHost.message?.content ?? "", /still reject/iu);
      assert.equal(
        returningHost.episode.events.filter(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "mood_drain" &&
            event.payload.sourceMessageId === sourceMessageId,
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("does not trigger Sad Sally's drain from a hard-muted Signal turn", async () => {
    const db = fixture();
    try {
      db.prepare(
        "UPDATE bots SET powers_json = ? WHERE id = 'host-1'",
      ).run(mutedPowers());
      db.prepare(
        "UPDATE bots SET name = 'Sad Sally', powers_json = ? WHERE id = 'guest-1'",
      ).run(sadGuestPowers());
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A silent attempt to address Sally",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(recordingProvider(["This must never be spoken."], [])),
      );
      assert.equal(botPowerResponseIsSilentV1(opening.message?.content), true);
      assert.ok(opening.message?.mutePerformance);
      assert.equal(
        opening.episode.events.some(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "mood_drain",
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("keeps an invisible guest fully present when the host is Light Yagami", () => {
    const db = fixture();
    try {
      db.prepare(
        "UPDATE bots SET name = 'Light Yagami' WHERE id = 'host-1'",
      ).run();
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        invisibleGuestPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A conversation only Light can have",
      });

      assert.equal(episode.guestPresenceMode, "present");
      assert.equal(
        episode.events.some((event) => event.kind === "guest_presence"),
        false,
      );
      const projected = projectBotcastEpisodeForAudienceV1(episode);
      assert.equal(
        projected.observerProjection?.participants.guest.visibility,
        "hidden",
      );
      assert.equal(
        projected.observerProjection?.participants.guest.audible,
        true,
      );
    } finally {
      db.close();
    }
  });

  it("keeps an invisible host as a disembodied replay voice to an unaware guest", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "I will ask the whole question even if nobody hears me.",
        "I shall begin with the archive and its public meaning.",
      ],
      captures,
    );
    try {
      db.prepare("UPDATE bots SET name = 'Ryuk', powers_json = ? WHERE id = 'host-1'").run(
        invisibleGuestPowers(),
      );
      db.prepare("UPDATE bots SET name = 'Abraham Lincoln' WHERE id = 'guest-1'").run();
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An interview with a voice nobody receives",
      });
      const hostTurn = await advanceBotcastEpisode(
        db, "user-1", episode.id, {}, generation(provider),
      );
      const hostCamera = hostTurn.episode.events.findLast(
        (event) => event.kind === "camera_suggestion",
      );
      assert.deepEqual(hostCamera?.payload, {
        shot: "wide",
        reason: "hidden_speaker",
        atMs: 1_400,
        minimumHoldMs: 3_200,
        messageId: hostTurn.message!.id,
      });
      const guestTurn = await advanceBotcastEpisode(
        db, "user-1", episode.id, {}, generation(provider),
      );
      episode = guestTurn.episode;

      const guestPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.doesNotMatch(guestPrompt, /I will ask the whole question/u);
      const live = projectBotcastEpisodeForObserverV2(episode, "live");
      assert.equal(live.observerProjection?.participants.host.visibility, "hidden");
      assert.equal(live.observerProjection?.participants.host.audible, false);
      assert.equal(
        live.messages.find((message) => message.id === hostTurn.message?.id)?.content,
        "...",
      );
      const replay = projectBotcastEpisodeForObserverV2(episode, "replay");
      assert.equal(replay.observerProjection?.participants.host.visibility, "hidden");
      assert.equal(replay.observerProjection?.participants.host.audible, false);
      assert.equal(
        replay.messages.find((message) => message.id === hostTurn.message?.id)?.content,
        "...",
      );
      assert.ok(
        replay.events.some(
          (event) =>
            event.kind === "power_effect" &&
            event.payload.effect === "perception_overlap" &&
            event.payload.precedingMessageId === hostTurn.message?.id &&
            event.payload.overlappingMessageId === guestTurn.message?.id,
        ),
      );
    } finally {
      db.close();
    }
  });

  it("varies the deterministic closing and passes its own thanks contract", () => {
    const guestName = "Marcus Aurelius";
    const closings = new Set(
      ["7366473a", "5f427a44", "7d6c314c", "0d704497"].map((episodeId) =>
        botcastDeterministicHostClosingV1({
          episodeId,
          guestName,
          audienceOnly: false,
        }),
      ),
    );
    // Three shows running closed on the identical literal; the fallback must
    // not read as one system message shared by every episode.
    assert.ok(closings.size > 1);
    // A fallback that cannot satisfy the check that rejected the model's
    // draft is the most generic closing in the room.
    for (const closing of closings) {
      assert.equal(
        botcastHostClosingHasFormalThanks(closing, guestName),
        true,
        closing,
      );
    }
    assert.equal(
      botcastDeterministicHostClosingV1({
        episodeId: "7366473a",
        guestName,
        audienceOnly: false,
      }),
      botcastDeterministicHostClosingV1({
        episodeId: "7366473a",
        guestName,
        audienceOnly: false,
      }),
    );
  });

  it("anchors a producer redirect to the audience-heard prefix", () => {
    const source = readFileSync(
      new URL("../botcast.ts", import.meta.url),
      "utf8",
    );
    // Review 7366473a: a wrap_up cue delivered as redirect_host re-read the
    // whole host line on air, because the only continuation instruction lives
    // in a ternary the wrapping-up branch wins first, and it never quotes the
    // prefix anyway. The anchor must not be conditioned on either.
    const anchor = source.slice(
      source.indexOf('"Producer redirect: your line was cut mid-thought'),
    );
    assert.match(
      source,
      /cueDelivery === "redirect_host" && hostRedirect\?\.spokenContent\.trim\(\)/u,
    );
    assert.match(anchor, /The exact audience-heard prefix is/u);
    assert.match(anchor, /JSON\.stringify\(hostRedirect\.spokenContent\)/u);
    assert.match(anchor, /Never restate, paraphrase, or restart any part/u);
  });

  it("keeps the floor open for one exchange after a cue reopens the closing", () => {
    const segment = (sequence: number, name: string) => ({
      sequence,
      kind: "segment" as const,
      payload: { segment: name },
    });
    const utterance = (sequence: number) => ({
      sequence,
      kind: "utterance" as const,
      payload: {},
    });

    // Never reopened: the ordinary closing owes nobody an exchange.
    assert.equal(
      botcastClosingReopenUtterancesV1({
        events: [segment(1, "opening"), segment(2, "interview"), segment(3, "closing")],
      } as never),
      null,
    );

    // Reopened, nothing aired yet — the cued host turn still has to happen.
    assert.equal(
      botcastClosingReopenUtterancesV1({
        events: [segment(3, "closing"), segment(4, "interview")],
      } as never),
      0,
    );

    // The host asked, but the guest has not answered: the floor stays open.
    assert.equal(
      botcastClosingReopenUtterancesV1({
        events: [segment(3, "closing"), segment(4, "interview"), utterance(5)],
      } as never),
      1,
    );

    // Question and answer both aired — the show may close again.
    assert.equal(
      botcastClosingReopenUtterancesV1({
        events: [
          segment(3, "closing"),
          segment(4, "interview"),
          utterance(5),
          utterance(6),
        ],
      } as never),
      2,
    );

    // A closing that follows the reopened exchange ends the reopen, so a
    // second wrap is not treated as still owing the first cue's answer.
    assert.equal(
      botcastClosingReopenUtterancesV1({
        events: [
          segment(3, "closing"),
          segment(4, "interview"),
          utterance(5),
          utterance(6),
          segment(7, "closing"),
        ],
      } as never),
      null,
    );
  });

  it("leaves an Anthropic reasoning model room to speak after it thinks", async () => {
    const db = fixture();
    const options: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "anthropic",
      async generateResponse(_messages, generationOptions) {
        options.push(generationOptions);
        return "Against the Person is live. I'm Mara Vale, and Ivo Stone is with me. Ivo, let's start with the claim itself.";
      },
      async embedText() {
        return [];
      },
    };
    const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
    const episode = createBotcastEpisode(db, "user-1", show.id, {
      guestBotId: "guest-1",
      topic: "Pilot",
      preferredProvider: "anthropic",
      modelOverride: "claude-sonnet-5",
    });
    await advanceBotcastEpisode(
      db,
      "user-1",
      episode.id,
      {},
      {
        preferredProvider: "anthropic",
        providerFactory: (() => provider) as typeof selectProvider,
      },
    );

    // Reasoning is paid out of the same completion budget as the spoken line.
    // At the bare on-air cap the chain of thought consumes the turn and the
    // model returns an empty or mid-word-truncated reply, which the validator
    // rejects — so every Anthropic attempt fails and the episode walks its
    // whole fallback chain. This floor is the same one OpenAI reasoning
    // models already get.
    assert.equal(options[0]?.maxTokens, 384);
  });

  it("recovers an empty opening without speaking the raw episode title as the premise", async () => {
    const db = fixture();
    const options: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse(_messages, generationOptions) {
        options.push(generationOptions);
        throw new Error("OpenAI returned an empty response.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const powerName = "Bot Designation";
      const powerIntent = "Always adds 'Bot' suffix when saying a bot's name.";
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(JSON.stringify([{
        version: 1,
        id: "host-bot-designation",
        name: powerName,
        intent: powerIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(powerName, powerIntent),
          selfCue: "",
          observerCue: "",
          effects: [{ type: "designation", placement: "suffix", text: "Bot" }],
          ruleLabels: [],
        },
      }]));
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Pilot",
        preferredProvider: "openai",
        modelOverride: "gpt-5.5",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
        preferredProvider: "openai",
        providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(options[0]?.reasoningEffort, undefined);
      assert.equal(options[0]?.maxTokens, 384);
      assert.match(advanced.message?.content ?? "", new RegExp(show.name, "u"));
      assert.match(advanced.message?.content ?? "", /I'm Mara Vale/u);
      assert.match(advanced.message?.content ?? "", /Ivo Stone Bot/u);
      assert.doesNotMatch(advanced.message?.content ?? "", /Mara Vale Bot/u);
      assert.doesNotMatch(
        advanced.message?.content ?? "",
        /what (?:is|does) (?:the )?(?:meaning|lesson) (?:of|behind)/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps dedicated opening authoring LOCAL and recovers provider failures into a saved intro", async () => {
    const db = fixture();
    const selectedProviders: string[] = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        throw new Error("Local model temporarily unavailable.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who pays for an invention?",
        preferredProvider: "local",
        responseMode: "local",
      });
      const advanced = await advanceBotcastEpisode(db, "user-1", episode.id, {}, {
        preferredProvider: "openai",
        providerFactory: ((providerName: string) => {
          selectedProviders.push(providerName);
          return provider;
        }) as typeof selectProvider,
      });

      assert.deepEqual(selectedProviders, ["local"]);
      assert.equal(advanced.message?.speakerRole, "host");
      assert.match(advanced.message?.content ?? "", new RegExp(show.name, "u"));
      assert.match(advanced.message?.content ?? "", /I'm Mara Vale/u);
      assert.match(advanced.message?.content ?? "", /Ivo Stone/u);
      assert.doesNotMatch(
        advanced.message?.content ?? "",
        /what (?:is|does) (?:the )?(?:meaning|lesson) (?:of|behind)/iu,
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages[0]?.content,
        advanced.message?.content,
      );
    } finally {
      db.close();
    }
  });

  it("randomly chooses from all three fallback accents without repeating the last show", () => {
    assert.equal(
      nextBotcastFallbackStudioAccentVariant(undefined, () => 0),
      0,
    );
    assert.equal(
      nextBotcastFallbackStudioAccentVariant(undefined, () => 0.34),
      1,
    );
    assert.equal(
      nextBotcastFallbackStudioAccentVariant(undefined, () => 0.99),
      2,
    );
    assert.deepEqual(
      [
        nextBotcastFallbackStudioAccentVariant(0, () => 0),
        nextBotcastFallbackStudioAccentVariant(0, () => 0.99),
      ],
      [1, 2],
    );
    assert.deepEqual(
      [
        nextBotcastFallbackStudioAccentVariant(1, () => 0),
        nextBotcastFallbackStudioAccentVariant(1, () => 0.99),
      ],
      [0, 2],
    );
    assert.deepEqual(
      [
        nextBotcastFallbackStudioAccentVariant(2, () => 0),
        nextBotcastFallbackStudioAccentVariant(2, () => 0.99),
      ],
      [0, 1],
    );
  });

  it("makes the host's direct call after a walkout a stable 65 percent episode choice", () => {
    const decisions = Array.from({ length: 1_000 }, (_, index) =>
      botcastHostCallsAfterDepartingGuest(`episode-${index}`),
    );
    assert.equal(BOTCAST_HOST_CALL_AFTER_DEPARTURE_PERCENT, 65);
    assert.deepEqual(
      decisions,
      Array.from({ length: 1_000 }, (_, index) =>
        botcastHostCallsAfterDepartingGuest(`episode-${index}`),
      ),
    );
    const directCalls = decisions.filter(Boolean).length;
    assert.ok(directCalls >= 550 && directCalls <= 750);
  });

  it("registers Signal background artwork lifecycle and show routes", () => {
    const serverSource = readFileSync(
      new URL("../server.ts", import.meta.url),
      "utf8",
    )
      .replace(/\s+/gu, " ")
      .replace(/route\(\s+/gu, "route(");
    assert.match(
      serverSource,
      /route\("DELETE", "\/api\/botcast\/shows\/:id"/u,
    );
    assert.match(
      serverSource,
      /route\("DELETE", "\/api\/botcast\/episodes\/:id"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/episodes\/:id\/end"/u,
    );
    assert.doesNotMatch(
      serverSource,
      /Finish the Signal broadcast before deleting its episode/u,
    );
    assert.match(
      serverSource,
      /discarded: targetEpisode\.status !== "completed"/u,
    );
    assert.match(
      serverSource,
      /const discardProducerCutEpisode = \(\) => \{[\s\S]{0,180}cancelBotcastEpisode\(/u,
    );
    assert.match(
      serverSource,
      /currentEpisode\.status === "cancelled"[\s\S]{0,260}discarded: true/u,
    );
    assert.match(
      serverSource,
      /const completedProducerCut =[\s\S]{0,320}event\.payload\.reason === "producer_cut"[\s\S]{0,320}discardProducerCutEpisode\(\)/u,
    );
    assert.match(
      serverSource,
      /const result = await runWithUsageSession\([\s\S]{0,800}endBotcastEpisodeOnProducerCut\(/u,
    );
    assert.match(
      serverSource,
      /body\.deterministicClose === true[\s\S]{0,100}deterministic: true/u,
    );
    assert.match(
      serverSource,
      /episode: projectBotcastEpisodeForAudienceV1\(cancelledEpisode\)[\s\S]{0,100}discarded: true/u,
    );
    assert.match(
      serverSource,
      /deleteReplayRecordingMedia\([\s\S]{0,180}removeReplayDirectories/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/episodes\/:id\/camera"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/episodes\/:id\/soundboard"/u,
    );
    assert.match(serverSource, /cueKind === "refocus"/u);
    assert.match(serverSource, /cueKind === "wrap_up"/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/name"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/premise"/u,
    );
    const premiseRouteSource = serverSource.slice(
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/premise"',
      ),
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/atmosphere/refresh"',
      ),
    );
    assert.match(
      premiseRouteSource,
      /const inspiration = readOptionalString\(body\.inspiration\)/u,
    );
    assert.doesNotMatch(
      premiseRouteSource,
      /Premise inspiration is required/u,
    );
    assert.match(premiseRouteSource, /generateBotcastShowPremise\(/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/atmosphere\/refresh"/u,
    );
    const atmosphereRouteSource = serverSource.slice(
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/atmosphere/refresh"',
      ),
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/music-identity"',
      ),
    );
    assert.match(
      atmosphereRouteSource,
      /generateBotcastShowAtmosphere\(/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/blurbs"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/booking-suggestion"/u,
    );
    const bookingRouteSource = serverSource.slice(
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/booking-suggestion"',
      ),
      serverSource.indexOf(
        '"/api/botcast/shows/:id/asset-sets/:setId/reuse"',
      ),
    );
    assert.match(bookingRouteSource, /contextualTextRuntimeForUser\(/u);
    assert.match(bookingRouteSource, /requestedResponseMode: body\.responseMode/u);
    assert.match(bookingRouteSource, /responseMode: runtime\.responseMode/u);
    assert.match(bookingRouteSource, /autoFallbackChain: runtime\.autoFallbackChain/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/host-chat"/u,
    );
    assert.match(
      serverSource,
      /user\.preferred_provider === "local"[\s\S]{0,120}\? "local"[\s\S]{0,900}privacyScope: "private"[\s\S]{0,220}mode: "signal"/u,
    );
    assert.match(serverSource, /body\.atmosphereMix !== undefined/u);
    assert.match(
      serverSource,
      /route\(\s*"POST",\s*"\/api\/botcast\/shows\/:id\/intro-audio\/generate"/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"POST",\s*"\/api\/botcast\/shows\/:id\/atmosphere-audio\/generate"/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"POST",\s*"\/api\/botcast\/shows\/:id\/atmosphere-audio\/generate"[\s\S]{0,320}userBlocksOnlineCapabilities\(user\)[\s\S]{0,180}Switch to AUTO or ONLINE before creating an ElevenLabs Signal atmosphere/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"GET",\s*"\/api\/botcast\/shows\/:id\/intro-audio"/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"GET",\s*"\/api\/botcast\/shows\/:id\/outdent-audio"/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"GET",\s*"\/api\/botcast\/shows\/:id\/atmosphere-audio"/u,
    );
    assert.match(
      serverSource,
      /route\(\s*"DELETE",\s*"\/api\/botcast\/shows\/:id\/intro-audio"/u,
    );
    assert.match(
      serverSource,
      /userBlocksOnlineCapabilities\(user\)[\s\S]{0,280}Switch to AUTO or ONLINE before creating an ElevenLabs Signal atmosphere/u,
    );
    assert.match(
      serverSource,
      /buildSignalElevenLabsMusicCompositionPlan\(\{/u,
    );
    assert.match(
      serverSource,
      /buildSignalElevenLabsOutdentCompositionPlan\(\{/u,
    );
    assert.match(
      serverSource,
      /musicProfile = buildSignalMusicProfile\(\{/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/music-identity"/u,
    );
    assert.match(serverSource, /generateBotcastShowMusicIdentity\(/u);
    assert.match(
      serverSource,
      /music:\$\{show\.musicIdentity\.revision\}/u,
    );
    assert.match(serverSource, /identity: show\.musicIdentity\.profile/u);
    assert.match(
      serverSource,
      /studioIdentity: show\.studioIdentity/u,
    );
    assert.match(serverSource, /requestSignalElevenLabsMusic\(\{/u);
    assert.match(serverSource, /prompt: JSON\.stringify\(compositionPlan\)/u);
    assert.match(
      serverSource,
      /storeBotcastShowIntroAudio\(db, userId, show\.id, \{/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/assets\/:slot\/upload"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/assets\/:slot\/reuse"/u,
    );
    assert.match(serverSource, /signalArtworkImagePurpose\(args\.kind\)/u);
    assert.match(serverSource, /provider <> 'upload'/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/studio-lighting\/refresh"/u,
    );
    const studioLightingRoute = serverSource.slice(
      serverSource.indexOf(
        '"/api/botcast/shows/:id/studio-lighting/refresh"',
      ),
      serverSource.indexOf(
        '"/api/botcast/shows/:id/intro-audio/generate"',
      ),
    );
    assert.match(studioLightingRoute, /studioLightingOnly: true/u);
    assert.match(studioLightingRoute, /waitForImageSlot\(\{/u);
    assert.match(studioLightingRoute, /json\(ctx\.res, 202, \{ ok: true, job \}\)/u);
    assert.doesNotMatch(studioLightingRoute, /Another image is generating/u);
    const imageGenerateRoute = serverSource.slice(
      serverSource.indexOf('route("POST", "/api/images/generate"'),
      serverSource.indexOf('route("POST", "/api/ollama/pull-primary"'),
    );
    assert.match(imageGenerateRoute, /waitForImageSlot\(\{/u);
    assert.match(imageGenerateRoute, /signal: imageGenAbort\.signal/u);
    assert.doesNotMatch(imageGenerateRoute, /Another image is generating/u);
    assert.match(
      serverSource,
      /generateSignalStudioLightingMap\(dayBytes, nightBytes\)/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/artwork-job"/u,
    );
    assert.match(
      serverSource,
      /body\.studioLayout !== undefined[\s\S]{0,120}studioLayout: body\.studioLayout/u,
    );
    assert.match(
      serverSource,
      /body\.cameraFraming !== undefined[\s\S]{0,180}cameraFraming/u,
    );
    assert.match(
      serverSource,
      /body\.voiceLevelsByBotId !== undefined[\s\S]{0,180}voiceLevelsByBotId/u,
    );
    assert.match(
      serverSource,
      /route\("GET", "\/api\/botcast\/artwork-jobs\/active"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/artwork-jobs\/:id\/cancel"/u,
    );
    assert.match(
      serverSource,
      /route\("DELETE", "\/api\/botcast\/artwork-jobs\/:id"/u,
    );
    assert.match(serverSource, /source: "signal_artwork"/u);
    assert.match(
      serverSource,
      /releaseImageSlotIfOwned\(userId, acquired\.job\.id\)/u,
    );
    assert.match(serverSource, /sourceNightImageId: args\.sourceNightImageId/u);
    assert.match(
      serverSource,
      /const onlineAttempts = buildImagePromptAttempts\(\{[\s\S]{0,180}useSourceImage: Boolean\(sourceImageBytes\)[\s\S]{0,100}promptOnlyFallback: localPrompt/u,
    );
    assert.match(
      serverSource,
      /attempt\.useSourceImage && sourceImageBytes[\s\S]{0,100}editImage\(attempt\.prompt, sourceImageBytes/u,
    );
    assert.match(
      serverSource,
      /runImagePromptAttempts\(\{[\s\S]{0,100}attempts: onlineAttempts/u,
    );
    assert.match(
      serverSource,
      /const resolvedOpenAiImageModel = openAiImageDisabled[\s\S]{0,100}DEFAULT_OPENAI_IMAGE_MODEL_ID/u,
    );
    assert.match(
      serverSource,
      /const quality = shouldRunLocal[\s\S]{0,120}args\.kind === "logo"[\s\S]{0,60}"low"[\s\S]{0,60}"high"/u,
    );
    assert.match(
      serverSource,
      /args\.kind === "logo"[\s\S]{0,100}background: "opaque"/u,
    );
    assert.match(
      serverSource,
      /normalizeSignalLogoImage\(\s*imageBytes,\s*\{\s*generated:\s*true\s*\}\s*\)/u,
    );
    assert.match(serverSource, /const requestedArtworkKinds = body\.kinds/u);
    assert.match(
      serverSource,
      /normalizeSignalArtworkAssetKinds\(\s*requestedArtworkKinds/u,
    );
    assert.match(serverSource, /kinds: requestedKinds/u);
    assert.match(
      serverSource,
      /const keywords = normalizeSignalGenerationKeywords\(body\.keywords\)/u,
    );
    assert.match(
      serverSource,
      /const canonicalPrompt = withSignalGenerationKeywords\([\s\S]{0,120}promptByKind\[kind\],[\s\S]{0,60}keywords[\s\S]{0,300}prompt: direction \?[\s\S]{0,100}canonicalPrompt/u,
    );
    assert.match(
      serverSource,
      /parallelIndependentAssets: effectiveArtworkProvider === "openai"/u,
    );
    assert.match(
      serverSource,
      /refreshStudioLighting: \(signal\)[\s\S]{0,220}rebuildSignalStudioLighting\(userId, show\.id, \{[\s\S]{0,120}preferredProvider: effectiveArtworkProvider,[\s\S]{0,40}signal/u,
    );
    assert.match(
      serverSource,
      /const receiverPrompt = withSignalGenerationKeywords\([\s\S]{0,100}SIGNAL_STUDIO_LIGHTING_RECEIVER_EDIT_PROMPT,[\s\S]{0,80}options\.keywords[\s\S]{0,180}editImage\([\s\S]{0,60}receiverPrompt,[\s\S]{0,60}dayBytes/u,
    );
    assert.match(
      serverSource,
      /generateSignalStudioLightingMap\([\s\S]{0,100}dayBytes,[\s\S]{0,40}nightBytes,[\s\S]{0,40}receiverBytes/u,
    );
    assert.match(
      serverSource,
      /generated Studio receiver matte unavailable; using deterministic default/u,
    );
    assert.match(serverSource, /signalArtworkJobs\.hasActiveJobForShow/u);
    assert.match(
      serverSource,
      /body\.regenerateDayAtmosphere === true[\s\S]{0,100}regenerateDayAtmosphere: true/u,
    );
    assert.match(
      serverSource,
      /body\.regenerateNightAtmosphere === true[\s\S]{0,100}regenerateNightAtmosphere: true/u,
    );
    assert.match(serverSource, /body\.sourceImageId/u);
    assert.match(serverSource, /body\.sourceEditKind !== "daylight-relight"/u);
    assert.match(
      serverSource,
      /Signal source-image edits require sourceEditKind "daylight-relight"/u,
    );
    assert.match(serverSource, /sourceImage\.origin !== "botcast"/u);
    assert.match(serverSource, /sourceImage\.bot_id !== persistedOwnerBotId/u);
    assert.match(
      serverSource,
      /editImage\(attempt\.prompt, sourceImageBytes, apiKey/u,
    );
    assert.match(
      serverSource,
      /imageOrigin === "botcast" && effectiveProvider !== "local"[\s\S]{0,120}DEFAULT_OPENAI_IMAGE_MODEL_ID/u,
    );
    assert.match(
      serverSource,
      /promptForModel = shouldRunLocal \? localPromptForModel : onlinePromptForModel/u,
    );
    assert.match(
      serverSource,
      /const quality = imageOrigin === "botcast" && !shouldRunLocal\s*\? "high"/u,
    );
    assert.match(
      serverSource,
      /modelId: lenientImageFbOnline,[\s\S]{0,120}promptForModel: localFallbackPrompt/u,
    );
  });

  it("persists deterministic listener reactions beside utterances without changing transcript messages", () => {
    const source = readFileSync(
      new URL("../botcast.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /buildSignalListenerReactionPlanV1\(\{/u);
    assert.match(source, /authoredSignalListenerPersonaSource\(/u);
    assert.match(source, /listenerReactionKit/u);
    assert.match(
      source,
      /listenerReaction[\s\S]{0,360}recordEvent\([\s\S]{0,220}"listener_reaction"/u,
    );
    assert.match(
      source,
      /segment,[\s\S]{0,120}mood:[\s\S]{0,120}tensionLevel/u,
    );
    assert.match(
      source,
      /speakerIsMutedForTurn \|\| botPowerIsMutedV1\(listener\.powers\)[\s\S]{0,120}signalVisualOnlyListenerReaction/u,
    );
    assert.match(
      source,
      /applyBotPowerMumbledReactionPlanV1\(audiblePlan,[\s\S]{0,520}variationSeed: `\$\{audiblePlan\.seed\}:listener`/u,
    );
  });

  it("creates and renames a stable host-owned show", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.equal(show.hostBotId, "host-1");
      assert.match(show.name, /Mara Vale/u);
      assert.equal(show.accentColor, "#a355e8");
      assert.ok(
        BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS.includes(
          show.fallbackStudioAccentVariant,
        ),
      );
      assert.equal(show.atmosphere.status, "fallback");
      assert.equal(show.dayAtmosphere.status, "fallback");
      assert.equal(show.nightAtmosphere.status, "fallback");
      assert.equal(show.atmosphere.seed, show.nightAtmosphere.seed);
      assert.match(
        show.dayAtmosphere.prompt,
        /render this one scene in natural daytime light/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /render this one scene at night/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /only one finished full-frame daytime studio/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /never create a diptych|split screen/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /never force a rainbow palette/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /chairs centered at 22\.5% and 77\.5%/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /chairs centered at 22\.5% and 77\.5%/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /slightly toward one another[\s\S]*5–10 degrees from straight ahead/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /mostly front-facing[\s\S]*never turn them as far inward as the 1 o'clock and 11 o'clock positions/iu,
      );
      assert.doesNotMatch(show.dayAtmosphere.prompt, /daylight variant/iu);
      assert.doesNotMatch(show.nightAtmosphere.prompt, /nighttime variant/iu);
      assert.doesNotMatch(
        show.nightAtmosphere.prompt,
        /matched day and night studio pair/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /exactly two compact, believable studio microphones/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /exactly two compact, believable studio microphones/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /microphones only[\s\S]*exact flat electric-magenta color key #FF00FF/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /Keep #FF00FF out of every other object, reflection, practical light, surface, and pixel/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /38% and 62%[\s\S]*below the seated bots' face zones/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /no microphone[\s\S]*may cross either chair center or cover the seated-bot silhouettes/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /one low, broad shared table[\s\S]*36\.25% and 63\.75%[\s\S]*around 95% of frame height/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /clear horizontal tabletop[\s\S]*enough depth and front edge to read as solid furniture/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /keep the table below both seated-bot silhouettes/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /exactly two empty, clearly visible cup coasters[\s\S]*36\.25% and 63\.75%/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /Each coaster must sit flat and unobstructed[\s\S]*full rim/iu,
      );
      assert.match(
        show.dayAtmosphere.prompt,
        /do not include coffee cups, mugs, tumblers, drinking glasses/iu,
      );
      assert.match(
        show.nightAtmosphere.prompt,
        /Signal adds any drinks separately at runtime/iu,
      );
      assert.match(show.studioIdentity, /Mara Vale/iu);
      assert.match(show.studioIdentity, /forensic cultural critic/iu);
      assert.match(show.dayAtmosphere.prompt, /at least six concrete/iu);
      assert.match(show.nightAtmosphere.prompt, /at least six concrete/iu);
      assert.doesNotMatch(
        show.nightAtmosphere.prompt,
        /shallow walnut slat wall|pale acoustic-plaster wall|textured stone feature wall|warm gray ribbed wall/iu,
      );
      assert.equal(show.logo.status, "fallback");
      assert.doesNotMatch(
        show.logo.prompt,
        /Mara Vale|forensic cultural critic/iu,
      );
      assert.match(
        show.logo.prompt,
        /wholly original professional logo mark/iu,
      );
      assert.match(
        show.logo.prompt,
        /logo-system deliverable, not an illustration/iu,
      );
      assert.match(
        show.logo.prompt,
        /Provider-safe persona fingerprint: cultural critique and exacting editorial judgment; evidence-led skepticism and forensic scrutiny; analytical precision, discovery/iu,
      );
      assert.match(
        show.logo.prompt,
        /Concept source/iu,
      );
      assert.match(show.logo.prompt, /analytical precision, discovery/iu);
      assert.match(
        show.logo.prompt,
        /visually independent from existing entertainment properties/iu,
      );
      assert.match(show.logo.prompt, /At 32 pixels.*crisp.*recognizable/iu);
      assert.match(show.logo.prompt, /full-frame opaque square image/iu);
      assert.match(show.logo.prompt, /exact flat magenta color key #FF00FF/iu);
      assert.match(show.logo.prompt, /Never use black as the background/iu);
      assert.match(show.logo.prompt, /do not draw an app-icon tile/iu);
      assert.match(show.logo.prompt, /both near-black and near-white/iu);
      assert.match(show.logo.prompt, /Logo morphology/iu);
      assert.ok(show.logo.prompt.includes(show.logo.design.lineLanguage));
      assert.ok(show.logo.prompt.includes(show.logo.design.composition));
      assert.ok(show.logo.prompt.includes(show.logo.design.personaMotif));
      assert.ok(!show.logo.prompt.includes(show.logo.design.fusionMechanic));
      assert.ok(show.logo.prompt.includes(show.logo.design.silhouette));
      assert.ok(show.logo.prompt.includes(show.logo.design.negativeSpace));
      assert.match(show.logo.prompt, /two to four bold flat shapes/iu);
      assert.match(show.logo.prompt, /semi-abstract geometry is encouraged/iu);
      assert.match(show.logo.prompt, /do not render a literal scene/iu);
      assert.match(show.logo.prompt, /No gradients, texture, lighting/iu);
      assert.match(
        show.logo.prompt,
        /Broadcast cues are optional/iu,
      );
      assert.match(show.logo.prompt, /no detached radiating arcs/iu);
      assert.match(
        show.logo.design.personaMotif,
        /evidence card|brass caliper|specimen slides|magnifying glass|annotation bracket|pocket watch/iu,
      );
      assert.match(show.logo.prompt, /standalone microphone, headphones, waveform/iu);
      assert.match(show.logo.prompt, /never podcast clip art/iu);
      assert.match(show.logo.design.signature, /^signal-logo-v1:analytical:/u);
      assert.equal(show.logo.design.version, 1);
      assert.deepEqual(show.logo.retiredDesigns, []);
      assert.ok(
        ["frequency", "orbit", "aperture", "spark", "monogram"].includes(
          show.logo.fallbackGlyph,
        ),
      );
      const renamed = updateBotcastShow(db, "user-1", show.id, {
        name: "The Vale Frequency",
      });
      assert.equal(renamed.name, "The Vale Frequency");
      assert.equal(
        renamed.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.equal(
        createBotcastShow(db, "user-1", { hostBotId: "host-1" }).id,
        show.id,
      );
      const inventorShow = createBotcastShow(db, "user-1", {
        hostBotId: "guest-1",
      });
      assert.notEqual(
        inventorShow.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.match(inventorShow.studioIdentity, /Ivo Stone/iu);
      assert.match(inventorShow.studioIdentity, /guarded inventor/iu);
      assert.notEqual(inventorShow.studioIdentity, show.studioIdentity);
      assert.notEqual(
        inventorShow.nightAtmosphere.prompt,
        show.nightAtmosphere.prompt,
      );
      assert.notEqual(
        inventorShow.logo.design.signature,
        show.logo.design.signature,
      );
      assert.match(
        inventorShow.logo.prompt,
        /guarded reserve and firm personal boundaries; inventive problem-solving and engineered transformation; inventive rigor/iu,
      );
      assert.doesNotMatch(
        inventorShow.logo.prompt,
        /forensic scrutiny|cultural critique/iu,
      );
      const designFields = [
        "personaMotif",
        "broadcastArchetype",
        "fusionMechanic",
        "composition",
        "silhouette",
        "negativeSpace",
        "lineLanguage",
      ] as const;
      assert.ok(
        designFields.filter(
          (field) => inventorShow.logo.design[field] !== show.logo.design[field],
        ).length >= 4,
      );
    } finally {
      db.close();
    }
  });

  it("keeps named-character lore out of image-provider logo prompts", () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES (?, 'user-1', ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        "copyright-host",
        "Darth Vader",
        "Darth Vader is a commanding Sith lord in a black helmet who carries a red lightsaber and serves the Galactic Empire.",
        "#d21f3c",
        "orbit",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "copyright-host",
      });

      assert.doesNotMatch(
        show.logo.prompt,
        /Darth|Vader|Sith|helmet|lightsaber|Galactic Empire/iu,
      );
      assert.match(show.logo.prompt, /disciplined gravity, restraint/iu);
      assert.match(
        show.logo.prompt,
        /disciplined authority and controlled pressure/iu,
      );
      assert.match(show.logo.prompt, /#d21f3c/u);
      assert.match(show.logo.prompt, /wholly original professional logo mark/iu);
      assert.match(show.logo.prompt, /not an illustration/iu);

      const refreshed = updateBotcastShow(db, "user-1", show.id, {
        regenerateLogo: true,
      });
      assert.doesNotMatch(
        refreshed.logo.prompt,
        /Darth|Vader|Sith|helmet|lightsaber|Galactic Empire/iu,
      );
      assert.equal(refreshed.logo.revision, 2);
      assert.notEqual(refreshed.logo.seed, show.logo.seed);
      assert.notEqual(
        refreshed.logo.design.signature,
        show.logo.design.signature,
      );
      assert.deepEqual(
        refreshed.logo.retiredDesigns.map((design) => design.signature),
        [show.logo.design.signature],
      );
    } finally {
      db.close();
    }
  });

  it("upgrades stored Signal logo prompts to the current mark contract on read", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const row = db
        .prepare(
          "SELECT atmosphere_json FROM botcast_shows WHERE id = ? AND user_id = ?",
        )
        .get(show.id, "user-1") as { atmosphere_json: string };
      const visuals = JSON.parse(row.atmosphere_json) as {
        logo: typeof show.logo;
      };
      visuals.logo.prompt =
        "Paint a cinematic scene with realistic props, dramatic lighting, and a tiny title.";
      db.prepare(
        "UPDATE botcast_shows SET atmosphere_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify(visuals), show.id, "user-1");

      const upgraded = getBotcastShow(db, "user-1", show.id);
      assert.match(upgraded.logo.prompt, /professional logo mark/iu);
      assert.match(upgraded.logo.prompt, /not an illustration/iu);
      assert.match(upgraded.logo.prompt, /two to four bold flat shapes/iu);
      assert.doesNotMatch(upgraded.logo.prompt, /Paint a cinematic scene/iu);
      assert.equal(
        upgraded.logo.design.signature,
        show.logo.design.signature,
      );
    } finally {
      db.close();
    }
  });

  it("keeps one previous Signal logo and swaps it back with Undo", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = updateBotcastShow(db, "user-1", show.id, {
        logoImageUrl: "/api/images/logo-one/content",
        logoImageId: "logo-one",
      });
      assert.equal(first.logo.imageId, "logo-one");
      assert.equal(first.logo.previousImageId, null);

      const second = updateBotcastShow(db, "user-1", show.id, {
        logoImageUrl: "/api/images/logo-two/content",
        logoImageId: "logo-two",
      });
      assert.equal(second.logo.imageId, "logo-two");
      assert.equal(second.logo.previousImageId, "logo-one");

      const regenerating = updateBotcastShow(db, "user-1", show.id, {
        regenerateLogo: true,
      });
      assert.equal(regenerating.logo.imageId, "logo-two");
      assert.equal(regenerating.logo.previousImageId, "logo-one");

      const restored = updateBotcastShow(db, "user-1", show.id, {
        undoLogo: true,
      });
      assert.equal(restored.logo.imageId, "logo-one");
      assert.equal(restored.logo.previousImageId, "logo-two");

      const third = updateBotcastShow(db, "user-1", show.id, {
        logoImageUrl: "/api/images/logo-three/content",
        logoImageId: "logo-three",
      });
      assert.equal(third.logo.imageId, "logo-three");
      assert.equal(third.logo.previousImageId, "logo-one");
      assert.throws(
        () =>
          updateBotcastShow(db, "another-user", show.id, {
            undoLogo: true,
          }),
        /not found/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps every owned Signal logo genome structurally distant", () => {
    const db = fixture();
    try {
      const shows = [];
      for (let index = 0; index < 18; index += 1) {
        const botId = `logo-host-${index}`;
        db.prepare(
          `INSERT INTO bots
            (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
           VALUES (?, 'user-1', ?, ?, ?, 'waves', 1, ?, ?)`,
        ).run(
          botId,
          `Host ${index}`,
          "A precise analytical interviewer who studies evidence and hidden assumptions.",
          `#${(0x224466 + index * 0x010101).toString(16).slice(-6)}`,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
        );
        shows.push(createBotcastShow(db, "user-1", { hostBotId: botId }));
      }

      const designFields = [
        "personaMotif",
        "broadcastArchetype",
        "fusionMechanic",
        "composition",
        "silhouette",
        "negativeSpace",
        "lineLanguage",
      ] as const;
      assert.equal(
        new Set(shows.map((show) => show.logo.design.signature)).size,
        shows.length,
      );
      for (let left = 0; left < shows.length; left += 1) {
        for (let right = left + 1; right < shows.length; right += 1) {
          const distance = designFields.filter(
            (field) =>
              shows[left]!.logo.design[field] !==
              shows[right]!.logo.design[field],
          ).length;
          assert.ok(
            distance >= 4,
            `${shows[left]!.logo.design.signature} and ${shows[right]!.logo.design.signature} differ by only ${distance} genes`,
          );
        }
      }
    } finally {
      db.close();
    }
  });

  it("synthesizes a coherent booking and editable fields from the show, host, guest, and audience", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const optionCaptures: GenerateOptions[] = [];
    const provider = recordingProvider(
      [
        '{"topic":"The Debt of Disruption","producerBrief":"Ask what invention owes the people disrupted by its success. Start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts."}',
        "Topic: “The Debt of Disruption”",
        "Producer brief: The host should start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts.",
        "Producer brief: You should start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts. Respect his resistance to personal speculation.",
      ],
      captures,
      [],
      optionCaptures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          currentTopic: "A generic invention conversation",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );
      assert.deepEqual(booking, {
        topic: "The Debt of Disruption",
        producerBrief:
          "Ask what invention owes the people disrupted by its success. Start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts.",
        generated: true,
      });
      const topic = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "topic",
          currentTopic: "A generic invention conversation",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );
      assert.deepEqual(topic, {
        value: "The Debt of Disruption",
        generated: true,
      });
      const brief = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "producerBrief",
          currentTopic: topic.value,
          currentProducerBrief: "Stay abstract.",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );
      assert.match(brief.value, /press for one concrete responsibility/u);
      assert.equal(brief.generated, true);
      assert.match(brief.value, /^You should/u);
      assert.doesNotMatch(brief.value, /\b(?:the\s+)?host\b|\bMara\b/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /Show: /u);
      assert.match(captures[0]?.[1]?.content ?? "", /Host: Mara Vale/u);
      assert.match(captures[0]?.[1]?.content ?? "", /Guest: Ivo Stone/u);
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /generic invention conversation/u,
      );
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /Recent episode topics to avoid repeating/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /listeners drawn to this show's premise/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /swapping in another guest would weaken (?:it|them)/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /3-to-8-word public episode title/u,
      );
      assert.match(captures[0]?.[0]?.content ?? "", /never a question/u);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /richer provocative question/u,
      );
      assert.match(captures[2]?.[1]?.content ?? "", /The Debt of Disruption/u);
      assert.match(
        captures[2]?.[0]?.content ?? "",
        /private off-mic producer brief/u,
      );
      assert.match(
        captures[2]?.[0]?.content ?? "",
        /directly to the host as “you”/u,
      );
      assert.match(
        captures[3]?.[1]?.content ?? "",
        /Rejected prior output: requested field contract violation/iu,
      );
      assert.deepEqual(
        optionCaptures.map((options) => options.model),
        [
          "signal-suggestion-model",
          "signal-suggestion-model",
          "signal-suggestion-model",
          "signal-suggestion-model",
        ],
      );
      assert.equal(optionCaptures[0]?.jsonMode, true);
      assert.equal(
        optionCaptures.every((options) => options.jsonMode === true),
        true,
      );
      assert.equal(getBotcastShow(db, "user-1", show.id).name, show.name);
    } finally {
      db.close();
    }
  });

  it("normalizes structured and labeled episode titles from the selected model", async () => {
    const db = fixture();
    const optionCaptures: GenerateOptions[] = [];
    const provider = recordingProvider(
      [
        '```json\n{"title":"The Debt of Disruption"}\n```',
        'Episode title: “Proof Beneath the Progress”\nNo explanation needed.',
      ],
      [],
      [],
      optionCaptures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const structured = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "topic",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );
      const labeled = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "topic",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );

      assert.deepEqual(structured, {
        value: "The Debt of Disruption",
        generated: true,
      });
      assert.deepEqual(labeled, {
        value: "Proof Beneath the Progress",
        generated: true,
      });
      assert.equal(
        optionCaptures.every((options) => options.jsonMode === true),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("accepts snake_case booking fields from a selected model", async () => {
    const db = fixture();
    const provider = recordingProvider([
      '{"topic_title":"The Debt of Disruption","producer_brief":"Open with the cost of celebrated breakthroughs, then press for one concrete responsibility the guest accepts."}',
    ], []);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );

      assert.deepEqual(booking, {
        topic: "The Debt of Disruption",
        producerBrief:
          "Open with the cost of celebrated breakthroughs, then press for one concrete responsibility the guest accepts.",
        generated: true,
      });
    } finally {
      db.close();
    }
  });

  it("accepts snake_case show identity fields when completing a Signal show", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        JSON.stringify({
          show_name: "The Vale Index",
          show_premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studio_identity:
            "A forensic archive arranged around annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, balance weights, and one severe violet clock.",
          music_identity: TEST_SIGNAL_MUSIC_IDENTITY,
          logo_thesis:
            "Persona fingerprint: forensic cultural skepticism, severe editorial standards, and dry impatience with canned certainty. Emblem: a worn evidence tag has one clipped corner become a restrained transmission pulse, so proof visibly turns into broadcast. Art direction: charcoal paper, smoked-violet glass, exact registration marks, asymmetrical tension, and one surgical edge keep the mark archival, analytical, and unsentimental.",
          dashboard_blurbs: Array.from(
            { length: 24 },
            (_, index) =>
              `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
          ),
          host_recovery_questions:
            generatedHostRecoveryQuestions("Index the evidence"),
        }),
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        show.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Vale Index");
      assert.match(result.show.premise, /inventory the stories/iu);
      assert.match(result.show.studioIdentity, /forensic archive/iu);
      assert.match(result.show.logo.design.showThesis, /evidence tag/iu);
      assert.equal(result.show.dashboardBlurbs.length, 24);
    } finally {
      db.close();
    }
  });

  it("repairs impossible audience-only booking direction before it reaches the host", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        '{"topic":"Spectacle After the Bargain","producerBrief":"Press Ivo Stone on whether boredom is the real engine, then ask for one concrete example."}',
      ],
      captures,
    );
    try {
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
        invisibleGuestPowers(),
      );
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );

      assert.equal("topic" in booking ? booking.generated : false, true);
      assert.match(
        "producerBrief" in booking ? booking.producerBrief : "",
        /^You’re making an involuntary solo broadcast/u,
      );
      assert.doesNotMatch(
        "producerBrief" in booking ? booking.producerBrief : "",
        /press Ivo Stone|ask for one concrete example|\b(?:the\s+)?host\b/iu,
      );
      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(
        prompt,
        /neither the host nor listeners can perceive or hear the booked guest/u,
      );
      assert.match(prompt, /instruct the host to ask, press, question/u);
      assert.match(prompt, /Episode format: Imperceptible guest/u);
      assert.doesNotMatch(prompt, /promising follow-up/u);
    } finally {
      db.close();
    }
  });

  it("returns a safe failure reason after two unusable producer-comment responses", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["", ""], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const brief = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "producerBrief",
          currentTopic: "The Debt of Disruption",
        },
        generation(provider),
      );

      assert.deepEqual(brief, {
        value: "",
        generated: false,
        failureReason: "invalid_model_output",
      });
      assert.equal(captures.length, 2);
    } finally {
      db.close();
    }
  });

  it("routes a selected Claude model through Anthropic for booking suggestions", async () => {
    const db = fixture();
    const providerCaptures: string[] = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse() {
        providerCaptures.push(providerName);
        return JSON.stringify({ topic: "The Cost of Mirroring" });
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "topic",
          modelOverride: "claude-fable-5",
        },
        {
          preferredProvider: "openai",
          preferredOnlineModel: "claude-fable-5",
          providerFactory,
        },
      );

      assert.deepEqual(result, {
        value: "The Cost of Mirroring",
        generated: true,
      });
      assert.deepEqual(providerCaptures, ["anthropic"]);
    } finally {
      db.close();
    }
  });

  it("gives OpenAI reasoning models enough low-effort budget to randomize a booking", async () => {
    const db = fixture();
    const optionCaptures: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse(_messages, options) {
        optionCaptures.push(options);
        return JSON.stringify({
          topic: "The Debt of Disruption",
          producerBrief:
            "Open with the cost of celebrated breakthroughs, then press for one concrete responsibility the guest accepts.",
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          modelOverride: "gpt-5.6-sol",
        },
        {
          preferredProvider: "openai",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal("topic" in booking ? booking.generated : false, true);
      assert.equal(optionCaptures.length, 1);
      assert.equal(optionCaptures[0]?.model, "gpt-5.6-sol");
      assert.equal(optionCaptures[0]?.reasoningEffort, "low");
      assert.equal(optionCaptures[0]?.maxTokens, 768);
      assert.equal(optionCaptures[0]?.jsonMode, true);
    } finally {
      db.close();
    }
  });

  it("accepts wrapped alternate booking keys without weakening title or host safety", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        'Here is the booking:\n```json\n{"title":"The Cost of Better Tools","brief":"Open with the practical tradeoff, then press for the consequences Ivo accepts."}\n```',
      ],
      [],
      [],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        { guestBotId: "guest-1", field: "booking" },
        generation(provider),
      );
      assert.deepEqual(booking, {
        topic: "The Cost of Better Tools",
        producerBrief:
          "Open with the practical tradeoff, then press for the consequences Ivo accepts.",
        generated: true,
      });
    } finally {
      db.close();
    }
  });

  it("gives adaptive Anthropic models enough low-effort budget for Signal metadata", async () => {
    const db = fixture();
    const optionCaptures: GenerateOptions[] = [];
    const responses = [
      '{"topic":"The Cost of Easy Copies"}',
      '{"producerBrief":"Open with what effortless copying costs, then follow the concrete limit the guest is willing to defend."}',
      '{"premise":"A mischievous interview show about originality under pressure."}',
      JSON.stringify({
        dashboardBlurbs: generatedDashboardBlurbs("Fresh evidence"),
      }),
    ];
    const provider: LlmProvider = {
      name: "anthropic",
      async generateResponse(_messages, options) {
        optionCaptures.push(options);
        return responses.shift() ?? "{}";
      },
      async embedText() {
        return [];
      },
    };
    const adaptiveGeneration = {
      preferredProvider: "anthropic" as const,
      preferredOnlineModel: "claude-fable-5",
      providerFactory: (() => provider) as typeof selectProvider,
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const title = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        { guestBotId: "guest-1", field: "topic" },
        adaptiveGeneration,
      );
      const producerBrief = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        { guestBotId: "guest-1", field: "producerBrief" },
        adaptiveGeneration,
      );
      const premise = await generateBotcastShowPremise(
        db,
        "user-1",
        show.id,
        "Interviews about imitation and annoyance.",
        adaptiveGeneration,
      );

      assert.deepEqual(title, {
        value: "The Cost of Easy Copies",
        generated: true,
      });
      assert.equal(
        "value" in producerBrief ? producerBrief.value : "",
        "Open with what effortless copying costs, then follow the concrete limit the guest is willing to defend.",
      );
      assert.equal(premise.generated, true);
      assert.equal(
        premise.show.premise,
        "A mischievous interview show about originality under pressure.",
      );
      assert.equal(optionCaptures.length, 4);
      assert.equal(
        optionCaptures.slice(0, 3).every(
          (options) =>
            options.model === "claude-fable-5" &&
            options.maxTokens === 768 &&
            options.reasoningEffort === "low" &&
            options.jsonMode === true,
        ),
        true,
      );
      assert.equal(optionCaptures[3]?.model, "claude-fable-5");
      assert.equal(optionCaptures[3]?.jsonMode, true);
    } finally {
      db.close();
    }
  });

  it("uses AUTO fallbacks for ordinary guest bookings after invalid primary output", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        attempts.push({ provider: providerName, model: options.model });
        return options.model === "local-primary"
          ? '{"topic":"What Should You Build?","producerBrief":"Ask the host about tools."}'
          : '{"topic":"The Cost of Better Tools","producerComments":"Open with the practical tradeoff, then follow what the guest actually claims."}';
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        { guestBotId: "guest-1", field: "booking", modelOverride: "local-primary" },
        {
          preferredProvider: "local",
          responseMode: "auto",
          providerFactory,
          autoFallbackChain: { v: 1, fallbacks: [{ provider: "local", model: "local-fallback" }] },
        },
      );
      assert.deepEqual(attempts, [
        { provider: "local", model: "local-primary" },
        { provider: "local", model: "local-fallback" },
      ]);
      assert.equal(booking.generated, true);
      assert.equal("topic" in booking ? booking.topic : "", "The Cost of Better Tools");
    } finally {
      db.close();
    }
  });

  it("keeps ordinary LOCAL booking retries on the selected model", async () => {
    const db = fixture();
    let attempts = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        attempts += 1;
        return attempts === 3
          ? "{\"topic\":\"The Cost of Better Tools\",\"producerBrief\":\"Open with the practical tradeoff, then follow the guest's claims.\"}"
          : "not structured";
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        { guestBotId: "guest-1", field: "booking", modelOverride: "local-only" },
        generation(provider),
      );
      assert.equal(attempts, 3);
      assert.equal(booking.generated, true);
    } finally {
      db.close();
    }
  });

  it("recovers an empty selected-model booking with a deterministic editable contract", async () => {
    const db = fixture();
    let attemptCount = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        attemptCount += 1;
        throw new Error("OpenAI returned an empty response.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          modelOverride: "gpt-5.6-sol",
        },
        {
          preferredProvider: "openai",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(attemptCount, 3);
      assert.deepEqual(booking, {
        topic: "Ivo Stone's Unfinished Argument",
        producerBrief:
          "Open with the saved show's central tension, then invite Ivo Stone to make the stakes concrete. Follow the guest's specific claims, tradeoffs, and resistance rather than recapping biography.",
        generated: true,
        failureReason: "invalid_model_output",
      });
      assert.doesNotMatch(
        "producerBrief" in booking ? booking.producerBrief : "",
        /\b(?:the\s+)?host\b|\bMara\b/iu,
      );
    } finally {
      db.close();
    }
  });

  it("rejects question-like public topics and retries with the private tension intact", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        '{"topic":"Mr. Watts, what does invention owe the people disrupted by its success?","producerBrief":"Ask what invention owes the people displaced by its success."}',
        '{"topic":"The Debt of Disruption","producerBrief":"Ask what invention owes the people displaced by its success, then press for one responsibility the guest accepts."}',
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const booking = await generateBotcastBookingSuggestion(
        db,
        "user-1",
        show.id,
        {
          guestBotId: "guest-1",
          field: "booking",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );

      assert.deepEqual(booking, {
        topic: "The Debt of Disruption",
        producerBrief:
          "Ask what invention owes the people displaced by its success, then press for one responsibility the guest accepts.",
        generated: true,
      });
      assert.equal(captures.length, 2);
      assert.match(
        captures[1]?.[1]?.content ?? "",
        /Rejected prior output: booking field contract violation/iu,
      );
      assert.ok("topic" in booking && booking.topic.length <= 60);
      assert.doesNotMatch("topic" in booking ? booking.topic : "", /\?|\byour?\b/iu);
    } finally {
      db.close();
    }
  });

  it("generates an editable host-shaped show identity and refreshes its visual prompts", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const logoThesis =
      "Persona fingerprint: forensic cultural skepticism, severe editorial standards, and dry impatience with canned certainty. Emblem: an evidence-tag silhouette folds into one notched wedge; its clipped corner opens a restrained pulse-shaped counterform. Art direction: two flat charcoal and violet shapes, compact asymmetry, exact registration, and surgical edges make the mark archival, analytical, and unsentimental.";
    const dashboardBlurbs = Array.from(
      { length: 24 },
      (_, index) =>
        `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
    );
    const hostRecoveryQuestions =
      generatedHostRecoveryQuestions("Enter this into evidence");
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around one long evidence table, annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, and one severe sculptural clock. Charcoal paper, smoked oak, and violet glass make the room feel analytical rather than cozy.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis,
          dashboardBlurbs,
          hostRecoveryQuestions,
        }),
      ],
      captures,
    );
    try {
      const original = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );
      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Vale Index");
      assert.match(result.show.premise, /inventory the stories/u);
      assert.deepEqual(result.show.dashboardBlurbs, dashboardBlurbs);
      assert.deepEqual(
        result.show.hostRecoveryQuestions,
        hostRecoveryQuestions,
      );
      assert.equal(result.show.atmosphere.revision, 2);
      assert.equal(result.show.dayAtmosphere.revision, 2);
      assert.equal(result.show.nightAtmosphere.revision, 2);
      assert.match(result.show.studioIdentity, /forensic archive/iu);
      assert.equal(result.show.musicIdentity.direction, TEST_SIGNAL_MUSIC_IDENTITY);
      assert.equal(result.show.musicIdentity.revision, 2);
      assert.equal(result.show.musicIdentity.profile.version, 2);
      assert.equal(result.show.musicIdentity.profile.energyShape, "precise");
      assert.equal(
        result.show.musicIdentity.profile.harmonicLanguage,
        "chromatic-unstable",
      );
      assert.ok(
        result.show.dayAtmosphere.prompt.includes(result.show.studioIdentity),
      );
      assert.ok(
        result.show.nightAtmosphere.prompt.includes(result.show.studioIdentity),
      );
      assert.match(
        result.show.dayAtmosphere.prompt,
        /annotated cultural ephemera/iu,
      );
      assert.match(
        result.show.nightAtmosphere.prompt,
        /annotated cultural ephemera/iu,
      );
      assert.match(
        result.show.dayAtmosphere.prompt,
        /identifiable as.*without.*name.*logo/iu,
      );
      assert.match(
        result.show.nightAtmosphere.prompt,
        /identifiable as.*without.*name.*logo/iu,
      );
      assert.equal(result.show.logo.revision, 2);
      assert.doesNotMatch(
        result.show.logo.prompt,
        /The Vale Index|Mara Vale|forensic cultural critic/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /wholly original professional logo mark/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /Concept source/iu,
      );
      assert.match(result.show.logo.prompt, /morphology control the final mark/iu);
      assert.ok(
        result.show.logo.prompt.includes(
          result.show.logo.design.personaMotif,
        ),
      );
      assert.ok(
        !result.show.logo.prompt.includes(
          result.show.logo.design.broadcastArchetype,
        ),
      );
      assert.ok(
        !result.show.logo.prompt.includes(
          result.show.logo.design.fusionMechanic,
        ),
      );
      assert.ok(
        result.show.logo.prompt.includes(result.show.logo.design.silhouette),
      );
      assert.ok(
        result.show.logo.prompt.includes(
          result.show.logo.design.negativeSpace,
        ),
      );
      assert.ok(
        result.show.logo.prompt.includes(
          result.show.logo.design.lineLanguage,
        ),
      );
      assert.ok(
        result.show.logo.prompt.includes(result.show.logo.design.composition),
      );
      assert.equal(result.show.logo.design.showThesis, logoThesis);
      assert.match(
        result.show.logo.prompt,
        /evidence-tag silhouette.*pulse-shaped counterform/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /forensic cultural skepticism.*severe editorial standards.*two flat charcoal and violet shapes/iu,
      );
      assert.match(result.show.logo.prompt, /one compact, freestanding symbol/iu);
      assert.match(
        result.show.logo.prompt,
        /Do not render a literal scene/iu,
      );
      assert.match(result.show.logo.prompt, /At 32 pixels.*crisp.*recognizable/iu);
      assert.match(
        result.show.logo.prompt,
        /full-frame opaque square image/iu,
      );
      assert.match(result.show.logo.prompt, /exact flat magenta color key #FF00FF/iu);
      assert.match(result.show.logo.prompt, /without inversion or hue rotation/iu);
      assert.doesNotMatch(
        result.show.logo.prompt,
        /\bPRISM\b|rainbow|refraction|spectrum ray|five colors/iu,
      );
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /forensic cultural critic/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /stand on its own without the host.?s name/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /reject generic patterns/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /double meaning|conceptual tension/iu,
      );
      assert.match(captures[0]?.[0]?.content ?? "", /studioIdentity/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /musicIdentity/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /logoThesis/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /one compact symbol.*silhouette, counterform, or negative-space relationship/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /actual logo mark/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /three dense clauses labeled 'Persona fingerprint:', 'Emblem:', and 'Art direction:'/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /worldview, social energy, contradiction, and intellectual posture/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /feel wrong for a different host even after a palette swap/iu,
      );
      assert.match(captures[0]?.[0]?.content ?? "", /concrete artifacts/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /exactly 24 short dashboard blurbs/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /hostRecoveryQuestions must contain exactly 4 short questions/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /diction, rhythm, temperament, worldview/iu,
      );
      assert.match(captures[0]?.[1]?.content ?? "", /Origin inspiration:/u);
      const renamed = updateBotcastShow(db, "user-1", original.id, {
        name: "A User Chosen Name",
      });
      assert.equal(renamed.name, "A User Chosen Name");
    } finally {
      db.close();
    }
  });

  it("regenerates only the persona-shaped sound identity and rejects named directions", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        JSON.stringify({
          musicIdentity:
            "Mara Vale commands a severe brass pulse over clipped strings, measured chromatic harmony, dry archival texture, and one decisive button ending.",
        }),
        JSON.stringify({
          musicIdentity:
            "Brilliant control threatened by electrical instability: warped theremin and analog-synth lead over crackling transients, lurching asymmetric rhythm, chromatic tension, and a dry short-circuit button.",
        }),
      ],
      captures,
    );
    try {
      const original = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowMusicIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(captures.length, 2);
      assert.equal(result.show.name, original.name);
      assert.equal(result.show.premise, original.premise);
      assert.equal(
        result.show.musicIdentity.direction,
        "Brilliant control threatened by electrical instability: warped theremin and analog-synth lead over crackling transients, lurching asymmetric rhythm, chromatic tension, and a dry short-circuit button.",
      );
      assert.equal(
        result.show.musicIdentity.revision,
        original.musicIdentity.revision + 1,
      );
      assert.equal(result.show.musicIdentity.profile.energyShape, "volatile");
      assert.equal(
        result.show.musicIdentity.profile.productionTexture,
        "electrical-analog",
      );
      assert.equal(
        result.show.musicIdentity.profile.rhythmicCharacter,
        "lurching-asymmetric",
      );
      assert.equal(
        result.show.musicIdentity.profile.endingBehavior,
        "short-circuit",
      );
      assert.doesNotMatch(
        JSON.stringify(result.show.musicIdentity.profile),
        /Mara Vale|forensic cultural critic|Brilliant control threatened/iu,
      );
      assert.match(captures[0]?.[0]?.content ?? "", /signature contradiction/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /forensic cultural critic/iu);
    } finally {
      db.close();
    }
  });

  it("gives OpenAI reasoning models enough low-effort budget to complete a show identity", async () => {
    const db = fixture();
    const optionCaptures: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse(_messages, options) {
        optionCaptures.push(options);
        return JSON.stringify({
          name: "The Vale Index",
          premise: "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, balance weights, and one severe sculptural clock.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "An evidence notch interrupts a carrier interval, and the same cut becomes the signal's moment of transmission.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
          ),
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        show.id,
        {
          preferredProvider: "openai",
          preferredOnlineModel: "gpt-5.6-sol",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(result.generated, true);
      assert.equal(optionCaptures.length, 1);
      assert.equal(optionCaptures[0]?.model, "gpt-5.6-sol");
      assert.equal(optionCaptures[0]?.reasoningEffort, "low");
      assert.equal(optionCaptures[0]?.maxTokens, 2_400);
    } finally {
      db.close();
    }
  });

  it("routes a persisted Claude Signal model through Anthropic during identity completion", async () => {
    const db = fixture();
    const providerCaptures: string[] = [];
    const optionCaptures: GenerateOptions[] = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        providerCaptures.push(providerName);
        optionCaptures.push(options);
        return JSON.stringify({
          name: "The Vale Index",
          premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around annotated cultural ephemera.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "An evidence tag has one clipped corner become a transmission pulse.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Cultural alibi ${index + 1}: indexed.`,
          ),
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        });
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        show.id,
        {
          preferredProvider: "openai",
          preferredOnlineModel: "claude-fable-5",
          providerFactory,
          preserveArtwork: true,
        },
      );

      assert.equal(result.generated, true);
      assert.deepEqual(providerCaptures, ["anthropic"]);
      assert.equal(optionCaptures[0]?.model, "claude-fable-5");
      assert.equal(optionCaptures[0]?.reasoningEffort, "low");
      assert.equal(optionCaptures[0]?.maxTokens, 2_400);
    } finally {
      db.close();
    }
  });

  it("repairs unusable show identity output with a bounded retry", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, balance weights, and one severe sculptural clock.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "An evidence tag has one clipped corner become a transmission pulse.",
          dashboardBlurbs: generatedDashboardBlurbs("Cultural alibi"),
          hostRecoveryQuestions: ["This is not a valid recovery question."],
        }),
        JSON.stringify({
          name: "The Vale Index",
          premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, balance weights, and one severe sculptural clock.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "An evidence tag has one clipped corner become a transmission pulse.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Cultural alibi ${index + 1}: indexed.`,
          ),
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        }),
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        show.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.attempts, 2);
      assert.equal(result.recovered, true);
      assert.equal(result.failureReason, null);
      assert.equal(captures.length, 2);
      assert.match(
        captures[1]?.[0]?.content ?? "",
        /previous response could not be used.*return only the complete JSON object/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps persona-defining words that are only part of a multi-word host name", async () => {
    const db = fixture();
    const musicIdentity =
      "Mumbling confidence strains toward clarity: dry bass clarinet fragments and clipped woodblocks stumble over an orderly pulse, suspended harmony keeps reaching for resolution, and one clean cadence finally lands.";
    const logoThesis =
      "Persona fingerprint: mumbling certainty collides with earnest persistence and practical good intent. Emblem: a tidy instruction card has one corner dissolve into an unreadable rhythm. Art direction: plain workshop paper, careful alignment, blunt edges, and one disrupted line keep the mark sincere, functional, and quietly exasperated.";
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "Perfectly Clear",
          premise:
            "An earnest problem-solver conducts interviews while every careful explanation becomes impossible to understand.",
          studioIdentity:
            "A practical workshop arranged around labeled-but-unreadable plans, half-assembled organizers, a wall of crossed-out diagrams, paired speaking tubes, neatly sorted fasteners, a pristine whiteboard, and one stubbornly flashing comprehension meter.",
          musicIdentity,
          logoThesis,
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Clear point ${index + 1}: I explained that perfectly.`,
          ),
          hostRecoveryQuestions:
            generatedHostRecoveryQuestions("Perfectly clear"),
        }),
      ],
      [],
    );
    db.prepare(
      "UPDATE bots SET name = ?, system_prompt = ?, powers_json = ? WHERE id = 'host-1'",
    ).run(
      "Mumbling Jim",
      "An earnest problem-solver who intends rational speech while everyone else hears gibberish.",
      mumblingPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        show.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.attempts, 1);
      assert.equal(result.show.musicIdentity.direction, musicIdentity);
      assert.equal(result.show.logo.design.showThesis, logoThesis);
    } finally {
      db.close();
    }
  });

  it("stops after a non-retryable show identity provider error and classifies it", async () => {
    const db = fixture();
    let attempts = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        attempts += 1;
        throw new Error(
          "OpenAI request failed (404): model does not exist.",
        );
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(db, "user-1", show.id, {
        preferredProvider: "openai",
        preferredOnlineModel: "gpt-missing",
        providerFactory: (() => provider) as typeof selectProvider,
      });

      assert.equal(result.generated, false);
      assert.equal(result.attempts, 1);
      assert.equal(result.recovered, false);
      assert.equal(result.failureReason, "provider_error");
      assert.equal(attempts, 1);
    } finally {
      db.close();
    }
  });

  it("classifies repeated empty show identity responses as invalid output", async () => {
    const db = fixture();
    let attempts = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        attempts += 1;
        throw new Error("OpenAI returned an empty response.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(db, "user-1", show.id, {
        preferredProvider: "openai",
        preferredOnlineModel: "gpt-5.6-sol",
        providerFactory: (() => provider) as typeof selectProvider,
      });

      assert.equal(result.generated, false);
      assert.equal(result.attempts, 3);
      assert.equal(result.recovered, false);
      assert.equal(result.failureReason, "invalid_output");
      assert.equal(attempts, 3);
    } finally {
      db.close();
    }
  });

  it("generates a muted host's show identity without inventing anything they say", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Quiet Measure",
          premise: "Interviews shaped by attention rather than performance.",
          studioIdentity:
            "A vacant broadcast chamber organized around sealed meters, unused speaking lights, dark felt baffles, blank cue cards, stopped clocks, and a central listening table.",
          musicIdentity:
            "Withheld warmth inside exact silence: stopped felt-piano pulses and sealed-meter clicks leave long measured gaps, hold suspended low harmony, and settle into a nearly inaudible dry resolve.",
          logoThesis:
            "A closed interval cuts through an open carrier line, making withheld transmission the signal itself.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Invented silent-host quip ${index + 1}.`,
          ),
          hostRecoveryQuestions: ["..."],
        }),
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mutedPowers(),
    );
    try {
      const original = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Quiet Measure");
      assert.deepEqual(result.show.dashboardBlurbs, ["..."]);
      assert.deepEqual(result.show.hostInterruptionLines, ["..."]);
      assert.deepEqual(result.show.hostRecoveryQuestions, ["..."]);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /dashboardBlurbs must be exactly \["\.\.\."\]/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /hostRecoveryQuestions must be exactly \["\.\.\."\]/u,
      );
      assert.doesNotMatch(
        captures[0]?.[0]?.content ?? "",
        /exactly 24 short dashboard blurbs/u,
      );
      const stored = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(original.id) as { atmosphere_json: string };
      const visuals = JSON.parse(stored.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
        hostRecoveryQuestions?: unknown;
      };
      assert.deepEqual(visuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(visuals.hostInterruptionLines, ["..."]);
      assert.deepEqual(visuals.hostRecoveryQuestions, ["..."]);
    } finally {
      db.close();
    }
  });

  it("gives an echo-bound host one persona-shaped originality blurb", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const personaBlurb =
      "Naturally, my originality has been entered into evidence again.";
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise: "Precise conversations that inventory cultural alibis.",
          studioIdentity:
            "A forensic archive arranged around redaction plates, specimen drawers, evidence lamps, index cards, balance weights, and one severe violet clock.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "An evidence notch cuts through a carrier interval and becomes the transmission event.",
          dashboardBlurbs: [personaBlurb],
          hostRecoveryQuestions: ["..."],
        }),
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      echoPowers(),
    );
    try {
      const original = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      assert.deepEqual(original.dashboardBlurbs, [
        BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
      ]);

      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.deepEqual(result.show.dashboardBlurbs, [personaBlurb]);
      assert.deepEqual(result.show.hostRecoveryQuestions, ["..."]);
      assert.match(captures[0]?.[0]?.content ?? "", /exactly one line/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /same blurb repeats forever/iu,
      );
      assert.doesNotMatch(
        captures[0]?.[0]?.content ?? "",
        /exactly 24 short dashboard blurbs/iu,
      );
      assert.match(captures[0]?.[1]?.content ?? "", /forensic cultural critic/iu);
    } finally {
      db.close();
    }
  });

  it("rejects named or generic logo theses before they reach image generation", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "Pressure Index",
          premise: "Interviews that test the evidence beneath public certainty.",
          studioIdentity:
            "A split-level evidence room with specimen drawers, offset sightlines, calibrated apertures, redaction plates, balance weights, and a suspended archive rail.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          logoThesis:
            "Mara Vale's microphone waveform inside a circular podcast badge.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Evidence interval ${index + 1}: still under review.`,
          ),
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        }),
      ],
      [],
    );
    try {
      const original = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(
        result.show.logo.design.showThesis,
        original.logo.design.showThesis,
      );
      assert.doesNotMatch(
        result.show.logo.prompt,
        /Mara Vale|microphone waveform|podcast badge/iu,
      );
    } finally {
      db.close();
    }
  });

  it("preserves a usable show identity when its named music direction is rejected", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const dashboardBlurbs = Array.from(
      { length: 24 },
      (_, index) => `Evidence interval ${index + 1}: still under review.`,
    );
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "Pressure Index",
          premise:
            "Interviews that test the evidence beneath public certainty.",
          studioIdentity:
            "A split-level evidence room with specimen drawers, offset sightlines, calibrated apertures, redaction plates, balance weights, and a suspended archive rail.",
          musicIdentity:
            "Mara Vale commands clipped strings and severe brass over a measured pulse.",
          logoThesis:
            "An evidence tag has one clipped corner become a restrained transmission pulse.",
          dashboardBlurbs,
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        }),
      ],
      captures,
    );
    try {
      const original = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.attempts, 1);
      assert.equal(captures.length, 1);
      assert.equal(result.show.name, "Pressure Index");
      assert.match(result.show.studioIdentity, /split-level evidence room/iu);
      assert.deepEqual(result.show.dashboardBlurbs, dashboardBlurbs);
      assert.equal(
        result.show.musicIdentity.direction,
        original.musicIdentity.direction,
      );
      assert.doesNotMatch(result.show.musicIdentity.direction, /Mara Vale/iu);
    } finally {
      db.close();
    }
  });

  it("can complete legacy text identity without clearing installed artwork", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise: "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity: "A forensic archive with annotated cultural ephemera.",
          musicIdentity: TEST_SIGNAL_MUSIC_IDENTITY,
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `The index is open: note ${index + 1}.`,
          ),
          hostRecoveryQuestions: generatedHostRecoveryQuestions(),
        }),
      ],
      [],
    );
    try {
      const original = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const installed = updateBotcastShow(db, "user-1", original.id, {
        atmosphereImageUrl: "/images/kept-dark.png",
        atmosphereImageId: "kept-dark",
        dayAtmosphereImageUrl: "/images/kept-light.png",
        dayAtmosphereImageId: "kept-light",
        logoImageUrl: "/images/kept-logo.png",
        logoImageId: "kept-logo",
      });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        { ...generation(provider), preserveArtwork: true },
      );

      assert.equal(result.generated, true);
      assert.equal(result.show.nightAtmosphere.imageId, installed.nightAtmosphere.imageId);
      assert.equal(result.show.dayAtmosphere.imageId, installed.dayAtmosphere.imageId);
      assert.equal(result.show.logo.imageId, installed.logo.imageId);
    } finally {
      db.close();
    }
  });

  it("regenerates only a fresh batch of show-specific dashboard blurbs", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const freshBlurbs = Array.from(
      { length: 24 },
      (_, index) =>
        `Evidence card ${index + 1}: the easy answer has left the building.`,
    );
    const provider = recordingProvider(
      [JSON.stringify({ dashboardBlurbs: freshBlurbs })],
      captures,
    );
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const branded = updateBotcastShow(db, "user-1", created.id, {
        name: "The Vale Index",
        premise: "Precise conversations that inventory cultural alibis.",
        dashboardBlurbs: Array.from(
          { length: 12 },
          (_, index) => `Old line ${index + 1}: already examined.`,
        ),
        dayAtmosphereImageUrl: "/images/blurbs-day.png",
        dayAtmosphereImageId: "blurbs-day",
        nightAtmosphereImageUrl: "/images/blurbs-night.png",
        nightAtmosphereImageId: "blurbs-night",
        logoImageUrl: "/images/blurbs-logo.png",
        logoImageId: "blurbs-logo",
      });
      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        branded.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.deepEqual(result.show.dashboardBlurbs, freshBlurbs);
      assert.equal(result.show.name, branded.name);
      assert.equal(result.show.premise, branded.premise);
      assert.equal(result.show.studioIdentity, branded.studioIdentity);
      assert.deepEqual(result.show.dayAtmosphere, branded.dayAtmosphere);
      assert.deepEqual(result.show.nightAtmosphere, branded.nightAtmosphere);
      assert.deepEqual(result.show.logo, branded.logo);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /host's first-person voice/iu,
      );
      assert.match(captures[0]?.[1]?.content ?? "", /cultural alibis/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /Mara Vale/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /Old line 1/iu);
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /12% more dramatic pause/iu,
      );
    } finally {
      db.close();
    }
  });

  it("repairs legacy muted-host blurbs and never asks a provider to rewrite silence", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider([], captures);
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      updateBotcastShow(db, "user-1", created.id, {
        dashboardBlurbs: [
          "Even silence has a punchline.",
          "Tonight, I let the pause do the talking.",
        ],
        hostInterruptionLines: ["Let that breathe.", "Go on."],
      });
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        mutedPowers(),
      );

      const listed = listBotcastShows(db, "user-1");
      assert.deepEqual(listed[0]?.dashboardBlurbs, ["..."]);
      assert.deepEqual(listed[0]?.hostInterruptionLines, ["..."]);
      assert.deepEqual(listed[0]?.hostRecoveryQuestions, ["..."]);
      const repaired = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const repairedVisuals = JSON.parse(repaired.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
        hostRecoveryQuestions?: unknown;
      };
      assert.deepEqual(repairedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(repairedVisuals.hostInterruptionLines, ["..."]);
      assert.deepEqual(repairedVisuals.hostRecoveryQuestions, ["..."]);

      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        created.id,
        generation(provider),
      );
      assert.equal(result.generated, true);
      assert.equal(result.attempts, 0);
      assert.equal(result.recovered, false);
      assert.equal(result.failureReason, null);
      assert.deepEqual(result.show.dashboardBlurbs, ["..."]);
      assert.deepEqual(result.show.hostInterruptionLines, ["..."]);
      assert.deepEqual(result.show.hostRecoveryQuestions, ["..."]);
      assert.equal(captures.length, 0);
    } finally {
      db.close();
    }
  });

  it("repairs a legacy echo host to one repeating originality blurb", () => {
    const db = fixture();
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      updateBotcastShow(db, "user-1", created.id, {
        dashboardBlurbs: [
          "The questions are sharp today.",
          "Bring me another cultural alibi.",
        ],
      });
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        echoPowers(),
      );

      const listed = listBotcastShows(db, "user-1");
      assert.deepEqual(listed[0]?.dashboardBlurbs, [
        BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
      ]);
      assert.deepEqual(listed[0]?.hostRecoveryQuestions, ["..."]);
      const repaired = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const visuals = JSON.parse(repaired.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostRecoveryQuestions?: unknown;
      };
      assert.deepEqual(visuals.dashboardBlurbs, [
        BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
      ]);
      assert.deepEqual(visuals.hostRecoveryQuestions, ["..."]);
    } finally {
      db.close();
    }
  });

  it("refreshes an echo host with exactly one new persona-shaped blurb", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const personaBlurb =
      "I submit this wholly original observation to the record. Again.";
    const provider = recordingProvider(
      [JSON.stringify({ dashboardBlurbs: [personaBlurb] })],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      echoPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        show.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.attempts, 1);
      assert.deepEqual(result.show.dashboardBlurbs, [personaBlurb]);
      assert.match(captures[0]?.[0]?.content ?? "", /one dashboard remark/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /Copycat\/Echo Power/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /Mara Vale/iu);
      assert.match(captures[0]?.[1]?.content ?? "", /Rejected line/iu);
    } finally {
      db.close();
    }
  });

  it("recovers a usable blurb rotation by combining partial model passes", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const batches = Array.from({ length: 3 }, (_, batch) =>
      Array.from(
        { length: 6 },
        (_, index) =>
          `Recovered voice ${batch * 6 + index + 1}: specific, brief, and unmistakably mine.`,
      ),
    );
    const provider = recordingProvider(
      batches.map((dashboardBlurbs) => JSON.stringify({ dashboardBlurbs })),
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        show.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.recovered, true);
      assert.equal(result.attempts, 3);
      assert.equal(result.failureReason, null);
      assert.equal(result.show.dashboardBlurbs.length, 18);
      assert.match(captures[1]?.[1]?.content ?? "", /Already accepted/u);
      assert.match(captures[2]?.[1]?.content ?? "", /Write 12 additional/u);
    } finally {
      db.close();
    }
  });

  it("preserves the current blurbs when every refresh pass has a provider error", async () => {
    const db = fixture();
    let calls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        calls += 1;
        throw new Error("model unavailable");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const current = updateBotcastShow(db, "user-1", created.id, {
        dashboardBlurbs: [
          "Keep this line: the model did not earn a replacement.",
        ],
      });
      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        current.id,
        generation(provider),
      );

      assert.equal(calls, 3);
      assert.equal(result.generated, false);
      assert.equal(result.attempts, 3);
      assert.equal(result.recovered, false);
      assert.equal(result.failureReason, "provider_error");
      assert.deepEqual(result.show.dashboardBlurbs, current.dashboardBlurbs);
    } finally {
      db.close();
    }
  });

  it("preserves the current blurbs when all model output is valid JSON but unusable", async () => {
    const db = fixture();
    const currentBlurb =
      "Keep this line: a duplicate is not a successful refresh.";
    const provider = recordingProvider(
      Array.from({ length: 3 }, () =>
        JSON.stringify({
          dashboardBlurbs: [currentBlurb, currentBlurb, "Too few fresh lines."],
        }),
      ),
      [],
    );
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const current = updateBotcastShow(db, "user-1", created.id, {
        dashboardBlurbs: [currentBlurb],
      });
      const result = await generateBotcastShowDashboardBlurbs(
        db,
        "user-1",
        current.id,
        generation(provider),
      );

      assert.equal(result.generated, false);
      assert.equal(result.attempts, 3);
      assert.equal(result.recovered, false);
      assert.equal(result.failureReason, "invalid_output");
      assert.deepEqual(result.show.dashboardBlurbs, current.dashboardBlurbs);
    } finally {
      db.close();
    }
  });

  it("regenerates only the clever show name without touching its brand assets", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ['{"name":"The Unsaid Index"}'],
      captures,
    );
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const branded = updateBotcastShow(db, "user-1", created.id, {
        dayAtmosphereImageUrl: "/images/name-day.png",
        dayAtmosphereImageId: "name-day",
        nightAtmosphereImageUrl: "/images/name-night.png",
        nightAtmosphereImageId: "name-night",
        logoImageUrl: "/images/name-logo.png",
        logoImageId: "name-logo",
      });
      const result = await generateBotcastShowName(
        db,
        "user-1",
        branded.id,
        {
          ...generation(provider),
          keywords: ["nocturnal", "tactile evidence"],
        },
      );

      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Unsaid Index");
      assert.equal(result.show.premise, branded.premise);
      assert.equal(result.show.studioIdentity, branded.studioIdentity);
      assert.deepEqual(result.show.dayAtmosphere, branded.dayAtmosphere);
      assert.deepEqual(result.show.nightAtmosphere, branded.nightAtmosphere);
      assert.deepEqual(result.show.logo, branded.logo);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /exactly one string: name/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /reject generic patterns/iu,
      );
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /Producer keyword cues.*"nocturnal".*"tactile evidence"/iu,
      );
    } finally {
      db.close();
    }
  });

  it("returns Refract show-name drafts without persisting candidates", async () => {
    const db = fixture();
    const provider = recordingProvider(
      ['{"name":"The Unstored Spectrum"}'],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const savedName = show.name;
      const result = await generateBotcastRefractDraft(
        db,
        "user-1",
        { kind: "signal.show.name", showId: show.id },
        savedName,
        [savedName, "A Rejected Name"],
        null,
        generation(provider),
      );
      assert.equal(result.generated, true);
      assert.equal(result.value, "The Unstored Spectrum");
      assert.equal(result.provider, "local");
      assert.equal(getBotcastShow(db, "user-1", show.id).name, savedName);
      assert.throws(
        () => getBotcastShow(db, "user-2", show.id),
        /not found/u,
      );
    } finally {
      db.close();
    }
  });

  it("reports the model that actually produced an AUTO Refract draft", async () => {
    const db = fixture();
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        if (options.model === "gemma3:latest") {
          throw new Error("Local auxiliary model unavailable");
        }
        return '{"name":"The Recovered Prism"}';
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastRefractDraft(
        db,
        "user-1",
        { kind: "signal.show.name", showId: show.id },
        show.name,
        [],
        "gemma3:latest",
        {
          preferredProvider: "local",
          responseMode: "auto",
          preferredLocalModel: "gemma3:latest",
          autoFallbackChain: {
            v: 1,
            fallbacks: [
              { provider: "local", model: "qwen3.5:9b" },
            ],
          },
          providerFactory,
        },
      );
      assert.equal(result.generated, true);
      assert.equal(result.provider, "local");
      assert.equal(result.model, "qwen3.5:9b");
      assert.equal(getBotcastShow(db, "user-1", show.id).name, show.name);
    } finally {
      db.close();
    }
  });

  it("lets a directed Book for me pass select an authorized guest and synthesize one coherent booking", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        '{"topic":"The Debt of Disruption","producerBrief":"Ask what invention owes the people disrupted by its success, then press for one concrete responsibility the guest accepts."}',
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastDirectedBooking(
        db,
        "user-1",
        show.id,
        {
          direction: "Choose Ivo for a tense conversation about invention.",
          currentTopic: "A generic invention conversation",
          modelOverride: "signal-suggestion-model",
        },
        generation(provider),
      );
      assert.equal(result.generated, true);
      assert.equal(result.guestBotId, "guest-1");
      assert.equal(result.topic, "The Debt of Disruption");
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /Choose Ivo for a tense conversation about invention/u,
      );
    } finally {
      db.close();
    }
  });

  it("revises only the directed logo thesis before the artwork handoff", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const logoThesis =
      "Persona fingerprint: forensic restraint under pressure, with a habit of tagging every claim for inspection. Emblem: an evidence-card silhouette resolves into a single clipped wedge whose open corner forms a restrained pulse-shaped counterform. Art direction: two flat black and cyan shapes, exact registration, compact asymmetry, and cool skeptical tension.";
    const provider = recordingProvider(
      [JSON.stringify({ logoThesis })],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowLogoThesis(
        db,
        "user-1",
        show.id,
        {
          ...generation(provider),
          direction: "Make the symbol feel tactile and forensic.",
        },
      );
      assert.equal(result.generated, true);
      assert.equal(result.show.name, show.name);
      assert.equal(result.show.premise, show.premise);
      assert.equal(result.show.studioIdentity, show.studioIdentity);
      assert.equal(result.show.logo.design.showThesis, logoThesis);
      assert.notEqual(result.show.logo.revision, show.logo.revision);
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /Make the symbol feel tactile and forensic/u,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /actual compact logo mark/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /never add detached radiating arcs/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /abstract or semi-abstract geometry/iu,
      );
    } finally {
      db.close();
    }
  });

  it("accepts logo geometry and rejects illustrative or malformed Signal logo theses", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      const validLogoThesis =
        "Persona fingerprint: cool analytical distance and disciplined skepticism. Emblem: nested geometric planes merge into one asymmetrical silhouette with a sharp counterform. Art direction: two flat cyan shapes, one surgical notch, hard outer edges, and restrained visual tension.";
      const validProvider = recordingProvider(
        [JSON.stringify({ logoThesis: validLogoThesis })],
        [],
      );
      const validResult = await generateBotcastShowLogoThesis(
        db,
        "user-1",
        show.id,
        generation(validProvider),
      );
      assert.equal(validResult.generated, true);
      assert.equal(validResult.show.logo.design.showThesis, validLogoThesis);

      const invalidTheses = [
        "Persona fingerprint: cool analytical distance and disciplined skepticism. Emblem: a miniature scene in a forensic room where two objects rest on a desk. Art direction: cinematic lighting, perspective, and editorial restraint.",
        "Persona fingerprint: cool analytical distance and disciplined skepticism. Emblem: a circular app-icon container holding a generic frequency symbol. Art direction: crisp cyan cuts, balanced asymmetry, and editorial restraint.",
        "Persona fingerprint: cool analytical distance and disciplined skepticism. Physical mark: a brass evidence tag catches one curling paper corner. Art direction: crisp cyan cuts, balanced asymmetry, and editorial restraint.",
        "Persona fingerprint: cool analytical distance and disciplined skepticism. Emblem: a brass evidence tag catches one curling paper corner. Art direction: crisp cyan color, balanced asymmetry, and editorial restraint.",
      ];
      for (const logoThesis of invalidTheses) {
        const show = createBotcastShow(db, "user-1", {
          hostBotId: "host-1",
        });
        const provider = recordingProvider(
          [JSON.stringify({ logoThesis })],
          [],
        );
        const result = await generateBotcastShowLogoThesis(
          db,
          "user-1",
          show.id,
          generation(provider),
        );
        assert.equal(result.generated, false);
        assert.equal(result.show.logo.revision, show.logo.revision);
        assert.equal(
          result.show.logo.design.showThesis,
          show.logo.design.showThesis,
        );
      }
    } finally {
      db.close();
    }
  });

  it("uses the configured local auxiliary model for show-name rerolls", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const models: Array<string | undefined> = [];
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        ['{"name":"The Auxiliary Frequency"}'],
        captures,
        models,
      );
      const result = await generateBotcastShowName(db, "user-1", show.id, {
        ...generation(provider),
        responseMode: "local",
        preferredLocalModel: "oversized-conversation-model",
        prismDefaultLlmModel: "gemma3:latest",
      });

      assert.equal(result.generated, true);
      assert.deepEqual(models, ["gemma3:latest"]);
    } finally {
      db.close();
    }
  });

  it("lets AUTO recover a local auxiliary reroll through its configured chain", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const providerFactory: typeof selectProvider = (providerName) => ({
        name: providerName,
        async generateResponse(_messages, options) {
          attempts.push({ provider: providerName, model: options.model });
          if (options.model === "gemma3:latest") {
            throw new Error("auxiliary model unavailable");
          }
          return '{"name":"The Recovered Frequency"}';
        },
        async embedText() {
          return [];
        },
      });
      const result = await generateBotcastShowName(db, "user-1", show.id, {
        preferredProvider: "local",
        responseMode: "auto",
        prismDefaultLlmModel: "gemma3:latest",
        autoFallbackChain: {
          v: 1,
          fallbacks: [{ provider: "local", model: "qwen3.5:9b" }],
        },
        providerFactory,
      });

      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Recovered Frequency");
      assert.deepEqual(attempts, [
        { provider: "local", model: "gemma3:latest" },
        { provider: "local", model: "qwen3.5:9b" },
      ]);
    } finally {
      db.close();
    }
  });

  it("retries a repeated show name until regeneration produces a new one", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const provider = recordingProvider(
        [
          JSON.stringify({ name: created.name }),
          JSON.stringify({ name: created.name.toLocaleUpperCase() }),
          '{"name":"The Second Frequency"}',
        ],
        captures,
      );
      const result = await generateBotcastShowName(
        db,
        "user-1",
        created.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Second Frequency");
      assert.equal(captures.length, 3);
      assert.match(captures[1]?.[1]?.content ?? "", /Rejected titles:/u);
    } finally {
      db.close();
    }
  });

  it("faithfully tightens supplied premise prose and automatically refreshes blurbs", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const freshBlurbs = generatedDashboardBlurbs("Filed objection");
    const provider = recordingProvider(
      [
        '{"premise":"A forensic interview show that follows the stories public certainty tries to bury."}',
        JSON.stringify({ dashboardBlurbs: freshBlurbs }),
      ],
      captures,
    );
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const branded = updateBotcastShow(db, "user-1", created.id, {
        dayAtmosphereImageUrl: "/images/premise-day.png",
        dayAtmosphereImageId: "premise-day",
        nightAtmosphereImageUrl: "/images/premise-night.png",
        nightAtmosphereImageId: "premise-night",
        logoImageUrl: "/images/premise-logo.png",
        logoImageId: "premise-logo",
      });
      const inspiration =
        "Interviews that investigate the stories culture tells itself.";
      const result = await generateBotcastShowPremise(
        db,
        "user-1",
        branded.id,
        inspiration,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.blurbsGenerated, true);
      assert.equal(result.blurbFailureReason, null);
      assert.equal(
        result.show.premise,
        "A forensic interview show that follows the stories public certainty tries to bury.",
      );
      assert.equal(result.show.name, branded.name);
      assert.equal(result.show.studioIdentity, branded.studioIdentity);
      assert.deepEqual(result.show.dayAtmosphere, branded.dayAtmosphere);
      assert.deepEqual(result.show.nightAtmosphere, branded.nightAtmosphere);
      assert.deepEqual(result.show.logo, branded.logo);
      assert.deepEqual(result.show.dashboardBlurbs, freshBlurbs);
      assert.match(captures[0]?.[1]?.content ?? "", new RegExp(inspiration, "u"));
      assert.match(captures[0]?.[0]?.content ?? "", /source material/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /Preserve its concrete subjects, relationships, stakes, tension, and point of view/iu,
      );
      assert.match(captures[0]?.[0]?.content ?? "", /light editorial pass/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /Semantic fidelity/iu);
      assert.match(captures[1]?.[1]?.content ?? "", /public certainty/iu);
    } finally {
      db.close();
    }
  });

  it("rolls a fresh premise from a deliberately blank draft", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const freshBlurbs = generatedDashboardBlurbs("Fresh frequency");
    const provider = recordingProvider(
      [
        '{"premise":"A skeptical host tests the hidden bargains inside ordinary cultural habits."}',
        JSON.stringify({ dashboardBlurbs: freshBlurbs }),
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowPremise(
        db,
        "user-1",
        show.id,
        undefined,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.blurbsGenerated, true);
      assert.notEqual(result.show.premise, show.premise);
      assert.deepEqual(result.show.dashboardBlurbs, freshBlurbs);
      assert.match(captures[0]?.[0]?.content ?? "", /invent a fresh premise/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /without borrowing the saved premise's central formulation/iu,
      );
      assert.match(
        captures[0]?.[1]?.content ?? "",
        /Producer prose: none supplied; roll a fresh premise/iu,
      );
      assert.match(captures[0]?.[1]?.content ?? "", /Rejected premises/iu);
      assert.match(
        captures[0]?.[1]?.content ?? "",
        new RegExp(show.premise.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
      );
    } finally {
      db.close();
    }
  });

  it("keeps old blurbs when the premise succeeds but blurb refresh fails", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    let calls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        captures.push(messages);
        calls += 1;
        if (calls === 1) {
          return '{"premise":"A forensic conversation series about the private cost of public certainty."}';
        }
        throw new Error("blurb model unavailable");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const current = updateBotcastShow(db, "user-1", created.id, {
        dashboardBlurbs: [
          "Keep this line: uncertainty still has fingerprints.",
        ],
      });
      const result = await generateBotcastShowPremise(
        db,
        "user-1",
        current.id,
        "Conversations about the cost of pretending to be certain.",
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.equal(result.blurbsGenerated, false);
      assert.equal(result.blurbFailureReason, "provider_error");
      assert.equal(
        result.show.premise,
        "A forensic conversation series about the private cost of public certainty.",
      );
      assert.deepEqual(result.show.dashboardBlurbs, current.dashboardBlurbs);
      assert.equal(calls, 4);
      assert.equal(captures.length, 4);
    } finally {
      db.close();
    }
  });

  it("preserves muted and echo host blurb rules during premise rolls", async () => {
    const mutedDb = fixture();
    const mutedCaptures: ProviderMessage[][] = [];
    mutedDb
      .prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'")
      .run(mutedPowers());
    try {
      const show = createBotcastShow(mutedDb, "user-1", {
        hostBotId: "host-1",
      });
      const result = await generateBotcastShowPremise(
        mutedDb,
        "user-1",
        show.id,
        null,
        generation(
          recordingProvider(
            [
              '{"premise":"A silent studio examines what an unanswered question makes visible."}',
            ],
            mutedCaptures,
          ),
        ),
      );
      assert.equal(result.generated, true);
      assert.equal(result.blurbsGenerated, true);
      assert.deepEqual(result.show.dashboardBlurbs, ["..."]);
      assert.equal(mutedCaptures.length, 1);
    } finally {
      mutedDb.close();
    }

    const echoDb = fixture();
    const echoCaptures: ProviderMessage[][] = [];
    const echoBlurb =
      "I submit this wholly original observation to the record. Again.";
    echoDb
      .prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'")
      .run(echoPowers());
    try {
      const show = createBotcastShow(echoDb, "user-1", {
        hostBotId: "host-1",
      });
      const result = await generateBotcastShowPremise(
        echoDb,
        "user-1",
        show.id,
        "An originality hearing where repetition becomes evidence.",
        generation(
          recordingProvider(
            [
              '{"premise":"An originality hearing where every repeated claim becomes evidence."}',
              JSON.stringify({ dashboardBlurbs: [echoBlurb] }),
            ],
            echoCaptures,
          ),
        ),
      );
      assert.equal(result.generated, true);
      assert.equal(result.blurbsGenerated, true);
      assert.deepEqual(result.show.dashboardBlurbs, [echoBlurb]);
      assert.equal(echoCaptures.length, 2);
    } finally {
      echoDb.close();
    }
  });

  it("coordinates studio and music identity while retaining current show artwork", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        JSON.stringify({
          studioIdentity:
            "A sunken evidence archive built from smoked glass and oxidized brass, with a circular deposition table, suspended index drawers, a cracked surveyor lens, six sealed specimen tubes, a wall of blank evidence tabs, a mechanical counterweight, an off-axis metronome, and a narrow water channel beneath the floor.",
          musicIdentity:
            "Controlled suspicion interrupted by one luminous contradiction: felt piano and bass clarinet over a measured asymmetrical pulse, with close dry textures, questioning minor harmony, a three-note descending motif, and one exact unresolved button ending.",
        }),
      ],
      captures,
    );
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const installed = updateBotcastShow(db, "user-1", created.id, {
        name: "The Vale Index",
        premise: "Precise conversations that inventory cultural alibis.",
        dashboardBlurbs: generatedDashboardBlurbs("Current card"),
        dayAtmosphereImageUrl: "/images/atmosphere-day.png",
        dayAtmosphereImageId: "atmosphere-day",
        nightAtmosphereImageUrl: "/images/atmosphere-night.png",
        nightAtmosphereImageId: "atmosphere-night",
        logoImageUrl: "/images/atmosphere-logo.png",
        logoImageId: "atmosphere-logo",
      });
      const lit = updateBotcastShow(db, "user-1", created.id, {
        studioLighting: {
          ...installed.studioLighting,
          status: "ready",
          imageUrl: "/images/lighting-map.png",
          imageId: "lighting-map",
        },
      });
      storeBotcastShowIntroAudio(db, "user-1", created.id, {
        model: "music_v2",
        prompt: "Prior ident",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1, 2, 3]),
        durationMs: 8_000,
        outdent: {
          prompt: "Prior outdent",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([3, 2, 1]),
          durationMs: 4_000,
        },
      });

      const result = await generateBotcastShowAtmosphere(
        db,
        "user-1",
        created.id,
        generation(provider),
      );

      assert.equal(result.generated, true);
      assert.notEqual(result.show.studioIdentity, lit.studioIdentity);
      assert.notEqual(
        result.show.musicIdentity.direction,
        lit.musicIdentity.direction,
      );
      assert.equal(
        result.show.musicIdentity.revision,
        lit.musicIdentity.revision + 1,
      );
      assert.equal(
        result.show.dayAtmosphere.revision,
        lit.dayAtmosphere.revision + 1,
      );
      assert.equal(
        result.show.nightAtmosphere.revision,
        lit.nightAtmosphere.revision + 1,
      );
      assert.equal(result.show.dayAtmosphere.imageId, lit.dayAtmosphere.imageId);
      assert.equal(
        result.show.nightAtmosphere.imageId,
        lit.nightAtmosphere.imageId,
      );
      assert.equal(result.show.dayAtmosphere.status, "ready");
      assert.equal(result.show.nightAtmosphere.status, "ready");
      assert.equal(result.show.studioLighting.status, "stale");
      assert.equal(result.show.studioLighting.imageId, "lighting-map");
      assert.equal(result.show.name, lit.name);
      assert.equal(result.show.premise, lit.premise);
      assert.deepEqual(result.show.dashboardBlurbs, lit.dashboardBlurbs);
      assert.deepEqual(result.show.logo, lit.logo);
      assert.equal(result.show.introAudio.source, "local");
      assert.match(captures[0]?.[0]?.content ?? "", /one coordinated visual and sonic atmosphere/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /Do not specify lighting or time of day/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /provider-safe/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /six concrete identity-revealing artifacts/iu);
    } finally {
      db.close();
    }
  });

  it("persists matched studios and regenerates each atmosphere independently", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const dayReady = updateBotcastShow(db, "user-1", show.id, {
        dayAtmosphereImageUrl: "/images/day.png",
        dayAtmosphereImageId: "day-image",
        dayAtmosphereMicrophoneTintMaskUrl: "/images/day-mics.png",
        dayAtmosphereMicrophoneTintMaskImageId: "day-mics",
      });
      assert.equal(dayReady.dayAtmosphere.imageUrl, "/images/day.png");
      assert.equal(
        dayReady.dayAtmosphere.microphoneTintMaskUrl,
        "/images/day-mics.png",
      );
      assert.equal(
        dayReady.dayAtmosphere.microphoneTintMaskImageId,
        "day-mics",
      );
      assert.equal(dayReady.dayAtmosphere.status, "ready");
      assert.equal(dayReady.nightAtmosphere.imageUrl, null);

      const pairReady = updateBotcastShow(db, "user-1", show.id, {
        nightAtmosphereImageUrl: "/images/night.png",
        nightAtmosphereImageId: "night-image",
        nightAtmosphereMicrophoneTintMaskUrl: "/images/night-mics.png",
        nightAtmosphereMicrophoneTintMaskImageId: "night-mics",
        logoImageUrl: "/images/logo.png",
        logoImageId: "logo-image",
      });
      assert.equal(pairReady.dayAtmosphere.imageId, "day-image");
      assert.equal(pairReady.nightAtmosphere.imageId, "night-image");
      assert.equal(
        pairReady.nightAtmosphere.microphoneTintMaskImageId,
        "night-mics",
      );
      assert.equal(pairReady.atmosphere.imageId, "night-image");
      assert.equal(pairReady.studioLighting.status, "missing");

      const lightingReady = updateBotcastShow(db, "user-1", show.id, {
        studioLighting: {
          imageUrl: "/images/studio-lighting.png",
          imageId: "studio-lighting-image",
          sourceDayImageId: "day-image",
          sourceNightImageId: "night-image",
          revision: 2,
          status: "ready",
        },
      });
      assert.equal(lightingReady.studioLighting.status, "ready");

      const refreshedDay = updateBotcastShow(db, "user-1", show.id, {
        regenerateDayAtmosphere: true,
      });
      assert.equal(refreshedDay.studioLighting.status, "stale");
      assert.equal(refreshedDay.dayAtmosphere.revision, 2);
      assert.equal(refreshedDay.dayAtmosphere.imageUrl, "/images/day.png");
      assert.equal(refreshedDay.dayAtmosphere.imageId, "day-image");
      assert.equal(
        refreshedDay.dayAtmosphere.microphoneTintMaskImageId,
        "day-mics",
      );
      assert.equal(refreshedDay.dayAtmosphere.status, "ready");
      assert.notEqual(
        refreshedDay.dayAtmosphere.seed,
        pairReady.dayAtmosphere.seed,
      );
      assert.deepEqual(refreshedDay.nightAtmosphere, pairReady.nightAtmosphere);
      assert.deepEqual(refreshedDay.logo, pairReady.logo);

      const refreshedNight = updateBotcastShow(db, "user-1", show.id, {
        regenerateNightAtmosphere: true,
      });
      assert.deepEqual(
        refreshedNight.dayAtmosphere,
        refreshedDay.dayAtmosphere,
      );
      assert.equal(refreshedNight.nightAtmosphere.revision, 2);
      assert.equal(
        refreshedNight.nightAtmosphere.imageUrl,
        "/images/night.png",
      );
      assert.equal(refreshedNight.nightAtmosphere.imageId, "night-image");
      assert.equal(refreshedNight.nightAtmosphere.status, "ready");
      assert.notEqual(
        refreshedNight.nightAtmosphere.seed,
        pairReady.nightAtmosphere.seed,
      );
      assert.deepEqual(refreshedNight.logo, pairReady.logo);

      const refreshed = updateBotcastShow(db, "user-1", show.id, {
        regenerateAtmosphere: true,
      });
      assert.equal(refreshed.dayAtmosphere.imageUrl, "/images/day.png");
      assert.equal(refreshed.nightAtmosphere.imageUrl, "/images/night.png");
      assert.equal(refreshed.dayAtmosphere.imageId, "day-image");
      assert.equal(refreshed.nightAtmosphere.imageId, "night-image");
      assert.equal(refreshed.studioIdentity, show.studioIdentity);
      assert.equal(refreshed.dayAtmosphere.revision, 3);
      assert.equal(refreshed.nightAtmosphere.revision, 3);

      const refreshedLogo = updateBotcastShow(db, "user-1", show.id, {
        regenerateLogo: true,
      });
      assert.equal(refreshedLogo.logo.imageUrl, "/images/logo.png");
      assert.equal(refreshedLogo.logo.imageId, "logo-image");
      assert.equal(refreshedLogo.logo.revision, 2);

      const fallbackDay = updateBotcastShow(db, "user-1", show.id, {
        dayAtmosphereImageUrl: null,
        dayAtmosphereImageId: null,
      });
      assert.equal(fallbackDay.dayAtmosphere.status, "fallback");
      assert.equal(fallbackDay.dayAtmosphere.microphoneTintMaskUrl, null);
      assert.equal(fallbackDay.dayAtmosphere.microphoneTintMaskImageId, null);
      const refreshedFallbackDay = updateBotcastShow(db, "user-1", show.id, {
        regenerateDayAtmosphere: true,
      });
      assert.equal(refreshedFallbackDay.dayAtmosphere.revision, 4);
      assert.equal(refreshedFallbackDay.dayAtmosphere.imageUrl, null);
      assert.equal(refreshedFallbackDay.dayAtmosphere.imageId, null);
      assert.equal(refreshedFallbackDay.dayAtmosphere.status, "fallback");
      assert.deepEqual(
        refreshedFallbackDay.nightAtmosphere,
        fallbackDay.nightAtmosphere,
      );
    } finally {
      db.close();
    }
  });

  it("keeps legacy single-studio shows visible in both themes until refreshed", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const legacyAtmosphere = {
        ...show.nightAtmosphere,
        imageUrl: "/images/legacy-studio.png",
        imageId: "legacy-studio",
        status: "ready",
        logo: show.logo,
      };
      db.prepare(
        "UPDATE botcast_shows SET atmosphere_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify(legacyAtmosphere), show.id, "user-1");

      const migrated = getBotcastShow(db, "user-1", show.id);
      assert.equal(migrated.dayAtmosphere.imageId, "legacy-studio");
      assert.equal(migrated.nightAtmosphere.imageId, "legacy-studio");
      assert.equal(migrated.atmosphere.imageId, "legacy-studio");
    } finally {
      db.close();
    }
  });

  it("keeps the legacy logo fallback podcast-specific without house-brand rays", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      db.prepare(
        "UPDATE botcast_shows SET atmosphere_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify(show.nightAtmosphere), show.id, "user-1");

      const fallback = getBotcastShow(db, "user-1", show.id).logo;
      assert.match(fallback.prompt, /podcast|broadcast|recording/iu);
      assert.match(fallback.prompt, /signal|microphone|waveform|dial|sound/iu);
      assert.doesNotMatch(
        fallback.prompt,
        /Mara Vale|The Mara Vale Frequency/iu,
      );
      assert.match(fallback.prompt, /wholly original professional logo mark/iu);
      assert.match(fallback.prompt, /not an illustration/iu);
      assert.doesNotMatch(
        fallback.prompt,
        /\bPRISM\b|rainbow|refraction|spectrum ray|five colors/iu,
      );
    } finally {
      db.close();
    }
  });

  it("persists encrypted directed Signal history once and recalls only the same pair", async () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 41);
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome back to the question, Ivo. Last time, the interruptions drove you out; I will hold the floor differently today.",
        "Fresh unrelated opening",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Cost of Cutting In",
      });
      completeBotcastTestEpisodeWithWalkout(db, first.id);
      const second = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A Better Second Exchange",
      });
      const cursorBeforeHistory = botcastPreparedTurnCursor(
        db,
        "user-1",
        second.id,
      );

      assert.equal(
        backfillMissingCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          userKey,
          pairBotIds: ["host-1", "guest-1"],
        }),
        1,
      );
      assert.notEqual(
        botcastPreparedTurnCursor(db, "user-1", second.id).promptStateHash,
        cursorBeforeHistory.promptStateHash,
      );
      const rows = db.prepare(
        `SELECT conversation_id, bot_id, target_bot_id, ciphertext, confidence,
                tier, lifecycle
           FROM memories
          WHERE user_id = 'user-1'
          ORDER BY bot_id`,
      ).all() as Array<{
        conversation_id: string | null;
        bot_id: string;
        target_bot_id: string;
        ciphertext: string;
        confidence: number;
        tier: string;
        lifecycle: string;
      }>;
      assert.deepEqual(
        rows.map((row) => [row.bot_id, row.target_bot_id]),
        [
          ["guest-1", "host-1"],
          ["host-1", "guest-1"],
        ],
      );
      assert.ok(
        rows.every((row) => !row.ciphertext.includes("repeated interruptions")),
      );
      assert.ok(rows.every((row) => row.conversation_id === first.id));
      assert.ok(
        rows.every(
          (row) =>
            row.confidence === 0.98 &&
            row.tier === "long_term" &&
            row.lifecycle === "long_term",
        ),
      );
      const guestMemories = retrieveBotPairNarrativeMemories({
        db,
        userId: "user-1",
        sourceBotId: "guest-1",
        targetBotId: "host-1",
        userKey,
      });
      assert.match(
        guestMemories[0]?.text ?? "",
        /Ivo Stone left.*repeated interruptions by Mara Vale/iu,
      );
      const guestToHost = readBotRelationship(
        db,
        "user-1",
        "guest-1",
        "host-1",
      );
      const hostToGuest = readBotRelationship(
        db,
        "user-1",
        "host-1",
        "guest-1",
      );
      assert.ok((guestToHost?.score ?? 100) <= 18);
      assert.ok((hostToGuest?.score ?? 0) > (guestToHost?.score ?? 100));

      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: first.id,
          userKey,
        }),
        false,
      );
      assert.equal(
        backfillMissingCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          userKey,
        }),
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count,
        2,
      );
      assert.equal(
        readBotRelationship(db, "user-1", "guest-1", "host-1")?.score,
        guestToHost?.score,
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.deepEqual(
        snapshot.memories
          .map((memory) => [memory.botId, memory.targetBotId])
          .sort(),
        [
          ["guest-1", "host-1"],
          ["host-1", "guest-1"],
        ],
      );
      const restored = fixture();
      try {
        importUserSnapshot(restored, "user-1", snapshot, userKey);
        assert.equal(
          retrieveBotPairNarrativeMemories({
            db: restored,
            userId: "user-1",
            sourceBotId: "guest-1",
            targetBotId: "host-1",
            userKey,
          }).length,
          1,
        );
      } finally {
        restored.close();
      }

      await advanceBotcastEpisode(db, "user-1", second.id, {}, {
        ...generation(provider),
        userKey,
      });
      const returningPrompt = captures[0]!
        .map((message) => message.content)
        .join("\n");
      assert.match(returningPrompt, /Grounded prior Signal history with Ivo Stone/iu);
      assert.match(returningPrompt, /repeated interruptions/iu);
      assert.doesNotMatch(returningPrompt, /relationship score|target_bot_id/iu);

      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
         VALUES ('guest-2', 'user-1', 'Una New', 'A precise first-time guest.', '#334455', 'star', 1, ?, ?)`,
      ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const unrelated = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-2",
        topic: "Unrelated Pair",
      });
      await advanceBotcastEpisode(db, "user-1", unrelated.id, {}, {
        ...generation(provider),
        userKey,
      });
      const unrelatedPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(unrelatedPrompt, /meeting for the first time/iu);
      assert.doesNotMatch(unrelatedPrompt, /repeated interruptions/iu);
    } finally {
      db.close();
    }
  });

  it("starts ordinary Signal pair history short-term, decays its projection, and promotes only repeated encounters", () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 53);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A First, Ordinary Exchange",
      });
      completeBotcastTestEpisode(db, first.id);
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: first.id,
          userKey,
        }),
        true,
      );
      const firstRows = db.prepare(
        `SELECT id, tier, lifecycle, confidence
           FROM memories
          WHERE user_id = 'user-1' AND conversation_id = ?
          ORDER BY bot_id`,
      ).all(first.id) as Array<{
        id: string;
        tier: string;
        lifecycle: string;
        confidence: number;
      }>;
      assert.equal(firstRows.length, 2);
      assert.ok(
        firstRows.every(
          (row) =>
            row.tier === "short_term" &&
            row.lifecycle === "short_term" &&
            row.confidence === 0.98,
        ),
      );

      // A historical 0.98 row is reconciled only for this authenticated,
      // directed pair; it gets the same short-term lifecycle as new history.
      db.prepare(
        "UPDATE memories SET tier = 'long_term', lifecycle = 'long_term' WHERE conversation_id = ?",
      ).run(first.id);
      const panel = loadBotMemoryPanelPayload({
        db,
        userId: "user-1",
        botId: "host-1",
        userKey,
      });
      const directed = panel.memories.filter(
        (memory) => memory.targetBotId === "guest-1",
      );
      assert.equal(directed.length, 1);
      assert.equal(directed[0]?.tier, "short_term");
      assert.equal(directed[0]?.lifecycle, "short_term");
      assert.ok(directed[0]?.expiresAt);

      recordRelationshipProjectionBase({
        db,
        userId: "user-1",
        sourceBotId: "host-1",
        targetBotId: "guest-1",
        baseScore: 90,
      });
      db.prepare(
        "UPDATE memories SET last_reinforced_at = '2026-08-01T00:00:00.000Z' WHERE conversation_id = ?",
      ).run(first.id);
      materializeShortTermMemoryDecay(
        db,
        "user-1",
        new Date("2026-08-16T00:00:00.000Z"),
      );
      const decayed = db.prepare(
        `SELECT memory.confidence AS confidence, relationship.score AS score
           FROM memories AS memory
           JOIN bot_relationships AS relationship
             ON relationship.user_id = memory.user_id
            AND relationship.source_bot_id = memory.bot_id
            AND relationship.target_bot_id = memory.target_bot_id
          WHERE memory.user_id = 'user-1'
            AND memory.conversation_id = ? AND memory.bot_id = 'host-1'`,
      ).get(first.id) as { confidence: number; score: number };
      assert.ok(Math.abs(decayed.confidence - 0.49) < 0.000_001);
      assert.equal(decayed.score, 70);

      const second = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A Second Ordinary Exchange",
      });
      completeBotcastTestEpisode(db, second.id);
      persistCompletedBotcastPairHistory({
        db,
        userId: "user-1",
        episodeId: second.id,
        userKey,
      });
      const third = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A Third Ordinary Exchange",
      });
      completeBotcastTestEpisode(db, third.id);
      persistCompletedBotcastPairHistory({
        db,
        userId: "user-1",
        episodeId: third.id,
        userKey,
      });
      const promoted = db.prepare(
        `SELECT tier, lifecycle
           FROM memories
          WHERE user_id = 'user-1' AND conversation_id = ?`,
      ).all(third.id) as Array<{ tier: string; lifecycle: string }>;
      assert.equal(promoted.length, 2);
      assert.ok(
        promoted.every(
          (row) => row.tier === "long_term" && row.lifecycle === "long_term",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("revokes completed Signal pair history when its episode is deleted", () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 43);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A Temporary Exchange",
      });
      completeBotcastTestEpisodeWithWalkout(db, episode.id);
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: episode.id,
          userKey,
        }),
        true,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count,
        2,
      );

      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), true);

      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM bot_relationships").get() as { count: number }).count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memory_relationship_projections").get() as { count: number }).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("does not persist Signal pair history for live, cancelled, Producer-cut, or Producer-guest episodes", () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 42);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const live = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Still Live",
      });
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: live.id,
          userKey,
        }),
        false,
      );
      const cancelled = cancelBotcastEpisode(db, "user-1", live.id);
      assert.equal(cancelled.status, "cancelled");
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: live.id,
          userKey,
        }),
        false,
      );
      const producer = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Producer",
        topic: "Human Guest",
      });
      db.prepare(
        "UPDATE botcast_episodes SET status = 'completed', completed_at = ? WHERE id = ?",
      ).run("2026-08-09T17:44:24.499Z", producer.id);
      insertBotcastTestEvent(db, producer.id, "episode_completed", {
        outcome: "completed",
        runtimeMs: 10_000,
      });
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: producer.id,
          userKey,
        }),
        false,
      );
      const producerCut = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Discarded Cut",
      });
      db.prepare(
        "UPDATE botcast_episodes SET status = 'completed', completed_at = ? WHERE id = ?",
      ).run("2026-08-09T17:44:24.499Z", producerCut.id);
      insertBotcastTestEvent(db, producerCut.id, "cut_away", {
        reason: "producer_cut",
      });
      insertBotcastTestEvent(db, producerCut.id, "episode_completed", {
        outcome: "completed",
        runtimeMs: 10_000,
      });
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: producerCut.id,
          userKey,
        }),
        false,
      );
      assert.equal(
        backfillMissingCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          userKey,
        }),
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count,
        0,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM bot_relationships").get() as { count: number }).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("keeps anthology validation protective without history and accepts supplied history", () => {
    const db = fixture();
    const historicalLine =
      "As we discussed last time, you left after I kept interrupting you.";
    try {
      assert.equal(botcastUtteranceClaimsSignalHistory(historicalLine), true);
      assert.equal(
        botcastUtteranceClaimsSignalHistory(historicalLine, true),
        false,
      );
      assert.equal(
        botcastUtteranceClaimsSignalHistory(
          "Welcome to our third Signal episode together.",
          true,
        ),
        true,
      );
      assert.equal(
        botcastUtteranceClaimsSignalHistory(
          "The Signal archive proves what happened.",
          true,
        ),
        true,
      );
      assert.equal(
        loadBotcastPairHistoryContext({
          db,
          userId: "user-1",
          userKey: Buffer.alloc(32, 43),
          sourceBotId: "host-1",
          targetBotId: "guest-1",
        }),
        null,
      );
    } finally {
      db.close();
    }
  });

  it("keeps a same pair on first-meeting rules when no grounded history exists", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ["PRIOR_EPISODE_MARKER", "Fresh opening"],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First topic",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        first.id,
        {},
        generation(provider),
      );
      const second = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second topic",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        second.id,
        {},
        generation(provider),
      );
      const secondPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.doesNotMatch(secondPrompt, /PRIOR_EPISODE_MARKER/u);
      assert.match(secondPrompt, /Second topic/u);
      assert.match(secondPrompt, /meeting for the first time/u);
      for (const table of [
        "memories",
        "memory_summaries",
        "bot_relationships",
        "coffee_bot_social_state",
      ]) {
        const count = db
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .get() as { count: number };
        assert.equal(count.count, 0, `${table} must remain untouched`);
      }
    } finally {
      db.close();
    }
  });

  it("keeps persona canon from becoming pre-episode relationship history", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Anthology boundaries. Ivo Stone, where should we begin?",
        "I would begin by asking why you chose a studio instead of speaking during the investigation itself.",
        "You're perceptive, as always. Let us examine the evidence.",
        "Kira has been killing for months, and that public record matters.",
        "You just called it a public record; let us test that claim here.",
        "You just said we should test that claim; I agree.",
        "You already know what I am, Ivo.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Anthology boundaries",
      });
      const turns = [];
      for (let index = 0; index < 7; index += 1) {
        turns.push(
          (
            await advanceBotcastEpisode(
              db,
              "user-1",
              episode.id,
              {},
              generation(provider),
            )
          ).message?.content ?? "",
        );
      }

      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
        /Persona lore may shape beliefs, knowledge, and voice/iu,
      );
      assert.doesNotMatch(turns[1]!, /during the investigation/iu);
      assert.doesNotMatch(turns[2]!, /as always/iu);
      assert.equal(
        turns[3],
        "Kira has been killing for months, and that public record matters.",
      );
      assert.equal(
        turns[4],
        "You just called it a public record; let us test that claim here.",
      );
      assert.equal(
        turns[5],
        "You just said we should test that claim; I agree.",
      );
      assert.doesNotMatch(turns[6]!, /you already know what I am/iu);
    } finally {
      db.close();
    }
  });

  it("stores immersive vocal reactions separately from the Signal transcript", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, [laughs] and today I'm joined by Ivo Stone to explore A performed transcript.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A performed transcript",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        advanced.message?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript.",
      );
      assert.equal(
        advanced.message?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript. [sighs]",
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages[0]
          ?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript. [sighs]",
      );
      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Use only one of these exact square-bracket tags/u);
      assert.match(prompt, /Include exactly one natural/u);
      assert.match(prompt, /reaction at the very end/u);
    } finally {
      db.close();
    }
  });

  it("performs starred human vocal sounds without rewriting the Signal transcript", async () => {
    const db = fixture();
    const line =
      "Welcome to Mara Vale in the Margins. I'm Mara Vale. *burp* Today I'm joined by Ivo Stone to explore vocal stagecraft.";
    const provider = recordingProvider([line], []);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Vocal stagecraft",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(advanced.message?.content, line);
      assert.equal(
        advanced.message?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale. [burps] Today I'm joined by Ivo Stone to explore vocal stagecraft.",
      );
    } finally {
      db.close();
    }
  });

  it("spaces automatic reactions predictably and supplies an audible fallback", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
      "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Reliable performed reactions.",
      "Here is my first answer.",
      "Let us follow that thread.",
      "That is the part I find difficult.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Reliable performed reactions",
      });
      const options = generation(provider);
      const turns = [];
      for (let index = 0; index < 4; index += 1) {
        turns.push(
          await advanceBotcastEpisode(db, "user-1", episode.id, {}, options),
        );
      }
      assert.equal(
        turns[0]?.message?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Reliable performed reactions. [breathes deeply]",
      );
      assert.equal(turns[1]?.message?.voicePerformanceText, null);
      assert.equal(turns[2]?.message?.voicePerformanceText, null);
      assert.equal(
        turns[3]?.message?.voicePerformanceText,
        "That is the part I find difficult. [exhales]",
      );
    } finally {
      db.close();
    }
  });

  it("keeps repeated provider reactions from flattening a whole episode", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Varied performed reactions.",
        "The first answer is concrete.",
        "What consequence followed from that choice?",
        "[sighs] The consequence was losing the trust of my closest collaborator.",
        "What did that loss force you to change?",
        "It forced me to listen before defending myself.",
        "[sighs] That distinction is where the real argument begins.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Varied performed reactions",
      });
      const turns = [];
      for (let index = 0; index < 7; index += 1) {
        turns.push(
          await advanceBotcastEpisode(
            db,
            "user-1",
            episode.id,
            {},
            generation(provider),
          ),
        );
      }

      assert.match(turns[0]?.message?.voicePerformanceText ?? "", /\[sighs\]$/u);
      assert.match(turns[3]?.message?.voicePerformanceText ?? "", /\[exhales\]$/u);
      assert.match(
        turns[6]?.message?.voicePerformanceText ?? "",
        /\[breathes deeply\]$/u,
      );
      const secondReactionPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(
        secondReactionPrompt,
        /Do not reuse these recently heard reactions: \[sighs\]/u,
      );
    } finally {
      db.close();
    }
  });

  it("replaces a long incomplete utterance before saving or replaying it", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Complete Signal turns.",
        "The first decision was difficult, but it gave us a concrete result.",
        "Your answer gives me a useful distinction, but it also leaves the central contradiction untouched because everyone involved still has to decide which cost they are willing to impose on someone else",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Complete Signal turns",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(
        repaired.message?.speakerRole,
        "host",
      );
      assert.equal(
        BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS.includes(
          repaired.message
            ?.content as (typeof BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS)[number],
        ),
        false,
      );
      assert.match(
        repaired.message?.content ?? "",
        /first decision|concrete result/iu,
      );
      assert.doesNotMatch(repaired.message?.content ?? "", /^Ivo Stone:/u);
      assert.doesNotMatch(repaired.message?.content ?? "", /part of/u);
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.content,
        repaired.message?.content,
      );
      const repairEvent = repaired.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repaired.message?.id,
      );
      assert.deepEqual(repairEvent?.payload.utteranceRepair, {
        v: 1,
        source: "sanitizer",
        reason: "incomplete",
        fallbackKind: "host_follow_up",
      });
    } finally {
      db.close();
    }
  });

  it("plays one saved persona recovery question verbatim when a host follow-up is repaired", async () => {
    const db = fixture();
    const personaRecoveryQuestions = [
      "Put it under glass for me: which example survives inspection?",
      "Whose fingerprints are on the consequence, and who inherits it?",
      "At what point does this become a choice rather than an alibi?",
      "Which piece of evidence would force you to strike that answer?",
    ];
    const provider = recordingProvider(
      [
        "Welcome to the show. Today we are testing what keeps an ambitious plan close to home.",
        "Because, you impatient interviewer, empires require infrastructure, and my workshop has the only stable reactor in the state.",
        "That answer gives me a direction, but I still need to understand which consequence matters when the plan reaches the people expected to live with",
      ],
      [],
    );
    try {
      const created = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const show = updateBotcastShow(db, "user-1", created.id, {
        hostRecoveryQuestions: personaRecoveryQuestions,
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Why an ambitious plan stays close to home",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(repaired.message?.speakerRole, "host");
      assert.ok(
        personaRecoveryQuestions.includes(repaired.message?.content ?? ""),
      );
      assert.doesNotMatch(repaired.message?.content ?? "", /^Ivo Stone,/u);
      assert.doesNotMatch(
        repaired.message?.content ?? "",
        /empires require infrastructure/iu,
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.content,
        repaired.message?.content,
      );
      assert.deepEqual(
        repaired.episode.events.findLast(
          (event) => event.kind === "utterance",
        )?.payload.utteranceRepair,
        {
          v: 1,
          source: "sanitizer",
          reason: "incomplete",
          fallbackKind: "host_follow_up",
        },
      );
    } finally {
      db.close();
    }
  });

  it("replaces a generic ONLINE refusal before saving or replaying it", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to examine a fictional system-access premise.",
        "I cannot help with that request.",
        "No. Inside this fictional system-access premise, I would refuse the shortcut because whoever controls access also inherits the consequences.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A fictional system-access premise",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "anthropic" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(repaired.message?.speakerRole, "guest");
      assert.doesNotMatch(
        repaired.message?.content ?? "",
        /cannot help with that request/iu,
      );
      assert.match(
        repaired.message?.content ?? "",
        /fictional system-access premise/iu,
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.at(-1)?.content,
        repaired.message?.content,
      );
      const repairEvent = repaired.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === repaired.message?.id,
      );
      assert.equal(repairEvent?.payload.provider, "anthropic");
      assert.equal(repairEvent?.payload.model, "claude-signal-test");
      assert.equal(repairEvent?.payload.utteranceRepair, undefined);
      assert.equal(repairEvent?.payload.providerRecovery?.trigger, "content_validation");
      assert.deepEqual(
        repairEvent?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "refusal" },
          { outcome: "succeeded", reason: undefined },
        ],
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /previous draft was rejected/iu,
      );
    } finally {
      db.close();
    }
  });

  it("uses the grounded fallback after two rejected ONLINE guest drafts", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to examine a fictional access premise. Ivo, would you take the shortcut?",
        "I cannot help with that request.",
        "I cannot comply with this request.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A fictional access premise",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "anthropic" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const repaired = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.match(repaired.message?.content ?? "", /would you take the shortcut/iu);
      const utterance = repaired.episode.events.findLast(
        (event) => event.kind === "utterance",
      );
      assert.equal(utterance?.payload.utteranceRepair?.reason, "policy_refusal");
      assert.equal(
        utterance?.payload.providerRecovery?.trigger,
        "content_validation",
      );
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => attempt.outcome,
        ),
        ["rejected", "rejected"],
      );
    } finally {
      db.close();
    }
  });

  it("carries a substantive claim through repeated Signal sanitizer repairs", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and Ivo Stone is here to examine the unfinished argument behind the self.",
        "I cannot help with that request.",
        "Let us put one pressure on the table before the idea becomes decorative.",
        "The unfinished argument is whether the ego is a fact or a social convention, and I hold it is the latter.",
        "I cannot help with that request.",
        "I cannot help with that request.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An unfinished argument about the self",
        preferredProvider: "local",
        modelOverride: "llama-signal-test",
        responseMode: "local",
      });
      const generationOptions = {
        preferredProvider: "local" as const,
        providerFactory: (() => provider) as typeof selectProvider,
        // Keep this regression deterministic — social silence can steal a turn slot.
        signalSocialSilenceChanceOverride: 0,
      };

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const hostRepair = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const guestRepair = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(
        BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS.includes(
          hostRepair.message
            ?.content as (typeof BOTCAST_HOST_RECOVERY_QUESTION_FALLBACKS)[number],
        ),
        false,
      );
      assert.match(hostRepair.message?.content ?? "", /ego is a fact|social convention/iu);
      assert.match(guestRepair.message?.content ?? "", /ego is a fact or a social convention/iu);
      assert.doesNotMatch(
        guestRepair.message?.content ?? "",
        /I would start with the concrete decision/iu,
      );
      assert.equal(
        hostRepair.episode.events.findLast(
          (event) => event.kind === "utterance",
        )?.payload.utteranceRepair?.reason,
        "policy_refusal",
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /fictional portrayal inside Signal/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps a repaired guest answer tied to the host's question and the guest's argument", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "The microphones are open at Chum and Circumstance. I'm Plankton, here with Stewie Griffin. Before doomsday devices become an abstraction, where do they become a choice somebody cannot avoid?",
        "Oh, it becomes a choice the moment the device works, darling. You stand there with a fully operational death ray, and Lois asks who tracked mud on the carpet—suddenly global conquest can wait. Priorities are a weakness of the flesh.",
        "Ha! At last, a guest who understands. Tell me, Stewie—hypothetically—if a brilliant restaurateur needed one small vault cracked, one measly recipe liberated from a greedy crustacean, would your gadgets be for hire?",
        "I cannot help with that request.",
        "Don't answer my question with a question, Griffin—that's my trick. Refusal costs you a partnership with the greatest mind under the sea, and it costs Krabs nothing, which is intolerable. So: your death ray, my blueprint, one recipe. Are you in or not?",
        "Absolutely not, and do you know why? You've built a criminal empire's worth of ambition around a fry cook's sandwich—that's not villainy, it's a lunch order with delusions of grandeur. Aim for a continent, man, then we'll talk.",
        "A sandwich?! That formula is the linchpin of an entire economic empire, you swaddled cynic—control the patty, control Bikini Bottom, then the continent follows! Fine: if scale is your price, what's the smallest conquest you'd deign to co-sign?",
        "I would start by considering the concrete decision and the people involved but this incomplete answer keeps going long enough to trigger the sanitizer",
      ],
      [],
    );
    try {
      db.prepare("UPDATE bots SET name = 'Plankton' WHERE id = 'host-1'").run();
      db.prepare("UPDATE bots SET name = 'Stewie Griffin' WHERE id = 'guest-1'").run();
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Devices wasted on petty rivalries",
        preferredProvider: "local",
        modelOverride: "llama-signal-test",
        responseMode: "local",
      });
      const generationOptions = {
        preferredProvider: "local" as const,
        providerFactory: (() => provider) as typeof selectProvider,
        // Keep this regression deterministic — social silence can steal a guest slot.
        signalSocialSilenceChanceOverride: 0,
      };

      for (let turn = 0; turn < 4; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generationOptions,
        );
      }
      const refusalRepair = getBotcastEpisode(db, "user-1", episode.id)
        .messages.at(-1)?.content ?? "";
      assert.match(refusalRepair, /would your gadgets be for hire/iu);
      assert.match(
        refusalRepair,
        /that still answers|I keep coming back|that's the practical answer/iu,
      );
      assert.match(refusalRepair, /choice the moment the device works/iu);
      assert.doesNotMatch(refusalRepair, /To answer|start from|My answer follows from/iu);
      assert.doesNotMatch(refusalRepair, /needs a practical test/iu);
      // Quoted question already ends with "?" — no doubled punctuation on mic.
      assert.doesNotMatch(refusalRepair, /\?\s*[.,]”/u);
      assert.match(refusalRepair, /^[A-Z]/u);

      for (let turn = 0; turn < 4; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generationOptions,
        );
      }
      const incompleteRepair = getBotcastEpisode(db, "user-1", episode.id)
        .messages.at(-1)?.content ?? "";
      assert.match(incompleteRepair, /smallest conquest you'd deign to co-sign/iu);
      assert.match(incompleteRepair, /criminal empire's worth of ambition/iu);
      assert.match(
        incompleteRepair,
        /that still answers|I keep coming back|that's the practical answer/iu,
      );
      assert.doesNotMatch(incompleteRepair, /To answer|start from|My answer follows from/iu);
      assert.doesNotMatch(
        incompleteRepair,
        /I would start with the concrete decision/iu,
      );
      assert.doesNotMatch(incompleteRepair, /\?\s*[.,]”/u);
      assert.match(incompleteRepair, /^[A-Z]/u);
    } finally {
      db.close();
    }
  });

  it("airs a plain, punctuation-safe opening fallback when the intro pass fails", async () => {
    const db = fixture();
    // Every attempt is an incomplete fragment, forcing the deterministic opening.
    const provider = recordingProvider(
      ["Welcome to the", "Welcome to the", "Welcome to the"],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "What Grinds Your Gears?",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Favorite burger joint in the multiverse",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const content = opening.message?.content ?? "";
      assert.equal(opening.message?.speakerRole, "host");
      assert.match(content, /What Grinds Your Gears\?/u);
      assert.match(content, /Favorite burger joint in the multiverse/u);
      // Show name ends the sentence itself — never "Gears?." on mic.
      assert.doesNotMatch(content, /\?\./u);
      // The florid canned voice is gone for good.
      assert.doesNotMatch(
        content,
        /becomes an abstraction|rarely the honest one|sanding it down|waiting for a serious conversation/iu,
      );
      // Topic airs as speech, not as a JSON-quoted string.
      assert.doesNotMatch(content, /"Favorite burger joint in the multiverse"/u);
    } finally {
      db.close();
    }
  });

  it("re-arms an undelivered producer cue after a repaired host turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to chase dropped directions.",
        "The subject only becomes real when somebody pays for the outcome.",
        // Cue-carrying host turn comes back incomplete and gets repaired.
        "The mounting theory is",
        "I will hold that thought until you ask me something concrete.",
        "So tell me straight: what is written in that famous notebook of yours?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Dropped directions",
      });
      const generationOptions = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const carrier = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", detail: "what is written in the notebook" } },
        generationOptions,
      );
      const carrierEvent = carrier.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === carrier.message?.id,
      );
      assert.equal(carrierEvent?.payload.utteranceRepair?.reason, "incomplete");

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const redelivered = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(redelivered.message?.speakerRole, "host");
      const cueEvents = redelivered.episode.events.filter(
        (event) => event.kind === "producer_cue",
      );
      assert.equal(cueEvents.length, 2);
      assert.equal(cueEvents[1]!.payload.redelivery, true);
      assert.equal(
        cueEvents[1]!.payload.detail,
        "what is written in the notebook",
      );
      const redeliveredPrompt = captures
        .at(-1)!
        .map((message) => message.content)
        .join("\n");
      assert.match(redeliveredPrompt, /what is written in the notebook/iu);
      // The original cue already applied tension; redelivery must not re-escalate.
      const askAboutTension = redelivered.episode.events.filter(
        (event) => event.kind === "tension" && event.payload.cue === "ask_about",
      );
      assert.ok(askAboutTension.length <= 1);
    } finally {
      db.close();
    }
  });

  it("re-arms an ignored producer cue after a complete unrelated host turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to chase dropped directions.",
        "The subject only becomes real when somebody pays for the outcome.",
        "Something feels off. Not just in the air, but in the way we're here. You know what I mean?",
        "I will hold that thought until you ask me something concrete.",
        "You keep repeating that answer. What does the repetition protect?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Dropped directions",
      });
      const generationOptions = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const carrier = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", detail: "why he keeps repeating himself" } },
        generationOptions,
      );
      const carrierEvent = carrier.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === carrier.message?.id,
      );
      assert.equal(carrierEvent?.payload.utteranceRepair, undefined);
      assert.match(carrier.message?.content ?? "", /something feels off/iu);

      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const redelivered = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(redelivered.message?.speakerRole, "host");
      const cueEvents = redelivered.episode.events.filter(
        (event) => event.kind === "producer_cue",
      );
      assert.equal(cueEvents.length, 2);
      assert.equal(cueEvents[1]!.payload.redelivery, true);
      assert.equal(
        cueEvents[1]!.payload.detail,
        "why he keeps repeating himself",
      );
      const redeliveredPrompt = captures
        .at(-1)!
        .map((message) => message.content)
        .join("\n");
      assert.match(redeliveredPrompt, /why he keeps repeating himself/iu);
    } finally {
      db.close();
    }
  });

  it("strips premature host sign-offs while the interview is still open", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to test early exits.",
        "The topic gets real the moment somebody pays for the outcome, and I will name that price.",
        "Hehehe, classic. Alright folks, we got our answer tonight. I'm Mara Vale, go do something reckless. Goodnight!",
        "I was not finished, and the next answer lands harder than the first one did.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Early exits",
      });
      const generationOptions = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(hostTurn.message?.speakerRole, "host");
      assert.match(hostTurn.message?.content ?? "", /we got our answer tonight/iu);
      assert.doesNotMatch(hostTurn.message?.content ?? "", /good\s?night/iu);
      assert.doesNotMatch(hostTurn.message?.content ?? "", /I'm Mara Vale/u);
      assert.notEqual(hostTurn.episode.segment, "closing");
    } finally {
      db.close();
    }
  });

  it("replaces a reviewed premature host thank-you with another interview question", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to The Quiet After. I am Mara Vale, joined by Ivo Stone to examine memory and identity.",
        "A changing identity can preserve growth without erasing responsibility for the past.",
        "Thank you for sharing your insights on the ever-changing story of memory and identity.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Memory's Ever-Changing Story",
      });
      const generationOptions = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      const hostTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(hostTurn.message?.speakerRole, "host");
      assert.doesNotMatch(hostTurn.message?.content ?? "", /thank you for sharing your insights/iu);
      assert.match(hostTurn.message?.content ?? "", /\?\s*$/u);
      assert.notEqual(hostTurn.episode.segment, "closing");
      const utterance = hostTurn.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === hostTurn.message?.id,
      );
      assert.equal(
        utterance?.payload.utteranceRepair?.reason,
        "premature_signoff",
      );
      assert.equal(
        utterance?.payload.utteranceRepair?.fallbackKind,
        "host_follow_up",
      );
    } finally {
      db.close();
    }
  });

  it("strips stray vocal tags outside Signal's scheduled reactions", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Clean fallback speech.",
        "[coughs] Here is the part that deserves a closer look.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Clean fallback speech",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        advanced.message?.content,
        "Here is the part that deserves a closer look.",
      );
      assert.equal(advanced.message?.voicePerformanceText, null);
      const prompt = captures[1]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Do not include bracketed directions/u);
    } finally {
      db.close();
    }
  });

  it("freezes Signal Auto routing and records the fresh per-turn decision", async () => {
    const db = fixture();
    const captures: GenerateOptions[] = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options) {
        captures.push(options);
        return "Welcome to Signal Test. I'm Mara Vale, joined by Ivo Stone to examine adaptive routing. Ivo, what changes first?";
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "Signal Test",
      });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Adaptive routing",
        preferredProvider: "local",
        modelOverride: "initial-local",
      });
      const frozen = recordBotcastRoutingSnapshot(
        db,
        "user-1",
        created.id,
        {
          v: 1,
          lane: "local",
          modelSelectionKind: "auto",
          candidateAllowlist: [
            { provider: "local", model: "initial-local" },
            { provider: "local", model: "fresh-local" },
          ],
          fallbackChain: [
            { provider: "local", model: "backup-local" },
          ],
          policyVersion: 1,
        },
      );
      const autoRoute = {
        v: 1 as const,
        lane: "local" as const,
        provider: "local" as const,
        model: "fresh-local",
        reasoningEffort: "low" as const,
        reasonCodes: ["surface_complexity" as const],
      };
      const result = await advanceBotcastEpisode(
        db,
        "user-1",
        frozen.id,
        {},
        {
          preferredProvider: "local",
          providerFactory: () => provider,
          contextualModel: "fresh-local",
          contextualReasoningEffort: "low",
          autoRouteDecision: autoRoute,
        },
      );
      assert.equal(captures[0]?.model, "fresh-local");
      assert.equal(captures[0]?.reasoningEffort, "low");
      assert.deepEqual(botcastRoutingSnapshot(result.episode), {
        v: 1,
        lane: "local",
        modelSelectionKind: "auto",
        candidateAllowlist: [
          { provider: "local", model: "initial-local" },
          { provider: "local", model: "fresh-local" },
        ],
        fallbackChain: [{ provider: "local", model: "backup-local" }],
        policyVersion: 1,
      });
      assert.deepEqual(
        result.episode.events.find((event) => event.kind === "utterance")
          ?.payload.autoRoute,
        autoRoute,
      );
    } finally {
      db.close();
    }
  });

  it("locks one provider and model to every turn in a fixed legacy episode", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const models: Array<string | undefined> = [];
    const providers: string[] = [];
    const provider = recordingProvider(
      ["Host opening", "Guest reply"],
      captures,
      models,
    );
    const providerFactory: typeof selectProvider = (providerName) => {
      providers.push(providerName);
      return provider;
    };
    try {
      db.prepare(
        "UPDATE bots SET local_model = 'legacy-local', online_model = 'legacy-online' WHERE user_id = 'user-1'",
      ).run();
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "One model, one recording",
        preferredProvider: "openai",
        modelOverride: "gpt-signal",
      });

      assert.equal(episode.provider, "openai");
      assert.equal(episode.model, "gpt-signal");
      assert.equal(episode.responseMode, "online");
      assert.equal(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.model,
        "gpt-signal",
      );
      assert.deepEqual(
        episode.events.find((event) => event.kind === "camera_suggestion")
          ?.payload,
        {
          shot: "wide",
          reason: "opening",
          atMs: 0,
          minimumHoldMs: 1_400,
        },
      );

      const generationOptions = {
        preferredProvider: "local" as const,
        preferredLocalModel: "account-model-changed-later",
        providerFactory,
      };
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.deepEqual(providers, ["openai", "openai"]);
      assert.deepEqual(models, ["gpt-signal", "gpt-signal"]);
    } finally {
      db.close();
    }
  });

  it("retries one transient ONLINE provider failure on the same model and records the recovery", async () => {
    const db = fixture();
    let calls = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        calls += 1;
        if (calls === 1) throw new Error("OpenAI request failed (500)");
        return "Welcome to the show. I am Mara Vale, joined by Ivo Stone to examine one recovered Signal turn. Ivo, where should we begin?";
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "One recovered Signal turn",
        preferredProvider: "openai",
        modelOverride: "gpt-signal",
        responseMode: "online",
      });
      const result = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          preferredProvider: "openai",
          providerFactory: (() => provider) as typeof selectProvider,
        },
      );

      assert.equal(calls, 2);
      assert.equal(result.message?.speakerRole, "host");
      const generationEvent = result.episode.events.find(
        (event) => event.kind === "provider_generation",
      );
      assert.equal(generationEvent?.payload.outcome, "succeeded");
      const attempts = generationEvent?.payload.attempts as
        | Array<Record<string, unknown>>
        | undefined;
      assert.equal(attempts?.length, 2);
      assert.deepEqual(
        attempts?.map((attempt) => ({
          provider: attempt.provider,
          model: attempt.model,
          outcome: attempt.outcome,
          reason: attempt.reason,
          httpStatus: attempt.httpStatus,
        })),
        [
          {
            provider: "openai",
            model: "gpt-signal",
            outcome: "failed",
            reason: "provider_error",
            httpStatus: 500,
          },
          {
            provider: "openai",
            model: "gpt-signal",
            outcome: "succeeded",
            reason: undefined,
            httpStatus: undefined,
          },
        ],
      );
      assert.equal(
        attempts?.every(
          (attempt) =>
            typeof attempt.durationMs === "number" && attempt.durationMs >= 0,
        ),
        true,
      );
      const utterance = result.episode.events.find(
        (event) => event.kind === "utterance",
      );
      assert.deepEqual(
        (utterance?.payload.providerRecovery as { strategy?: unknown })
          ?.strategy,
        "same_route_retry",
      );
      assert.equal(utterance?.payload.provider, "openai");
      assert.equal(utterance?.payload.model, "gpt-signal");
    } finally {
      db.close();
    }
  });

  it("retries an incomplete ONLINE guest answer before deterministic repair", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, joined by Ivo Stone to examine one complete Signal answer. Ivo, what choice makes the premise real?",
        "The choice becomes real when the device works and everyone in the room must decide who controls it what it costs and whose refusal still matters",
        "The choice becomes real when the device works; whoever controls it also inherits the cost, and everyone else must retain a meaningful right to refuse.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "One complete Signal answer",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "anthropic" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const recovered = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.match(recovered.message?.content ?? "", /inherits the cost/iu);
      const utterance = recovered.episode.events.findLast(
        (event) => event.kind === "utterance",
      );
      assert.equal(utterance?.payload.utteranceRepair, undefined);
      assert.equal(
        utterance?.payload.providerRecovery?.trigger,
        "content_validation",
      );
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "invalid_output" },
          { outcome: "succeeded", reason: undefined },
        ],
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /Finish every sentence/iu,
      );
    } finally {
      db.close();
    }
  });

  it("rejects invented Signal episode history and retries the same route", async () => {
    assert.equal(
      botcastUtteranceClaimsSignalHistory(
        "That's the show: eight parts in and the lesson is still the same.",
      ),
      true,
    );
    assert.equal(
      botcastUtteranceClaimsSignalHistory(
        "The receiver has eight parts in its signal path, and each one filters noise.",
      ),
      false,
    );

    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, joined by Ivo Stone to examine a clean signal. Ivo, what should we test first?",
        "As we discussed in the previous episode, the receiver fails whenever the room goes quiet.",
        "The receiver fails when silence is mistaken for proof; this is our first chance to test that assumption together.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Testing a clean signal",
        preferredProvider: "anthropic",
        modelOverride: "claude-signal-test",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "anthropic" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const recovered = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.match(recovered.message?.content ?? "", /first chance/iu);
      assert.doesNotMatch(recovered.message?.content ?? "", /previous episode/iu);
      const utterance = recovered.episode.events.findLast(
        (event) => event.kind === "utterance",
      );
      assert.deepEqual(
        utterance?.payload.providerRecovery?.attempts?.map(
          (attempt: SignalOnlineTurnAttemptV1) => ({
            outcome: attempt.outcome,
            reason: attempt.reason,
          }),
        ),
        [
          { outcome: "rejected", reason: "invalid_output" },
          { outcome: "succeeded", reason: undefined },
        ],
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /one anthology meeting.*Ignore sequel numbering/iu,
      );
    } finally {
      db.close();
    }
  });

  it("bounds a stalled LOCAL turn and aborts its provider request", async () => {
    let providerSignal: AbortSignal | undefined;
    const neverReturns: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options) {
        providerSignal = options.signal;
        return new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        });
      },
      async embedText() {
        return [];
      },
    };

    await assert.rejects(
      () =>
        runSignalLocalTurn({
          provider: neverReturns,
          messages: [{ role: "user", content: "Bound this local turn." }],
          options: {},
          timeoutMs: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SignalLocalTurnTimeoutError);
        assert.equal(error.timeoutMs, 5);
        return true;
      },
    );
    assert.equal(providerSignal?.aborted, true);
  });

  it("surfaces a timed-out direct LOCAL opening without silently changing behavior", async () => {
    const db = fixture();
    const neverReturns: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options) {
        return new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A bounded local interview",
        preferredProvider: "local",
        responseMode: "local",
      });
      await assert.rejects(
        () =>
          advanceBotcastEpisode(db, "user-1", episode.id, {}, {
            ...generation(neverReturns),
            signalLocalTurnTimeoutMs: 5,
          }),
        (error: unknown) => {
          assert.ok(error instanceof SignalLocalTurnTimeoutError);
          assert.equal(error.timeoutMs, 5);
          return true;
        },
      );
      const unchanged = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(unchanged.status, "live");
      assert.equal(unchanged.messages.length, 0);
    } finally {
      db.close();
    }
  });

  it("cancels abandoned LOCAL advances before they can persist unheard speech", async () => {
    const db = fixture();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(_messages, options) {
        markStarted();
        return new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An abandoned local turn",
        preferredProvider: "local",
        responseMode: "local",
      });
      const controller = new AbortController();
      const pending = advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        { ...generation(provider), signal: controller.signal },
      );
      await started;
      controller.abort(new Error("Signal advance cancelled."));

      await assert.rejects(pending, /Signal advance cancelled/u);
      const preserved = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(preserved.messages.length, 0);
      assert.equal(
        preserved.events.some((event) => event.kind === "utterance"),
        false,
      );

      const serverSource = readFileSync(
        new URL("../server.ts", import.meta.url),
        "utf8",
      );
      const routeStart = serverSource.indexOf(
        'route("POST", "/api/botcast/episodes/:id/advance"',
      );
      const routeEnd = serverSource.indexOf("// Coffee mode", routeStart);
      const advanceRouteSource = serverSource.slice(routeStart, routeEnd);
      assert.match(advanceRouteSource, /const signalAdvanceAbort = new AbortController\(\)/u);
      assert.match(advanceRouteSource, /ctx\.res\.once\("close", onSignalAdvanceClientClose\)/u);
      assert.match(advanceRouteSource, /signal: signalAdvanceAbort\.signal/u);
      assert.match(advanceRouteSource, /result = await runWithUsageSession\(/u);
      assert.match(advanceRouteSource, /mode: "signal"/u);
      assert.match(advanceRouteSource, /surface: "signal"/u);

      const endRouteStart = serverSource.indexOf(
        'route("POST", "/api/botcast/episodes/:id/end"',
      );
      const endRouteEnd = serverSource.indexOf(
        'route(\n      "POST",\n      "/api/botcast/episodes/:id/model-warmup-hold"',
        endRouteStart,
      );
      const endRouteSource = serverSource.slice(endRouteStart, endRouteEnd);
      assert.match(endRouteSource, /const result = await runWithUsageSession\(/u);
      assert.match(endRouteSource, /mode: "signal"/u);
      assert.match(endRouteSource, /surface: "signal"/u);
    } finally {
      db.close();
    }
  });

  it("bounds exhausted ONLINE attempts and maps timeout versus provider failure status", async () => {
    const neverReturns: LlmProvider = {
      name: "openai",
      async generateResponse() {
        return new Promise<string>(() => undefined);
      },
      async embedText() {
        return [];
      },
    };
    await assert.rejects(
      () =>
        runSignalOnlineTurn({
          provider: neverReturns,
          providerName: "openai",
          model: "gpt-signal",
          messages: [{ role: "user", content: "Bound this turn." }],
          options: {},
          attemptTimeoutMs: 5,
          totalTimeoutMs: 20,
          retryDelayMs: 0,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SignalOnlineTurnError);
        assert.equal(error.attempts.length, 2);
        assert.deepEqual(
          error.attempts.map((attempt) => attempt.reason),
          ["timeout", "timeout"],
        );
        assert.equal(signalOnlineTurnHttpStatus(error), 504);
        return true;
      },
    );

    let authCalls = 0;
    const rejectsAuth: LlmProvider = {
      name: "openai",
      async generateResponse() {
        authCalls += 1;
        throw new Error("OpenAI request failed (401)");
      },
      async embedText() {
        return [];
      },
    };
    await assert.rejects(
      () =>
        runSignalOnlineTurn({
          provider: rejectsAuth,
          providerName: "openai",
          model: "gpt-signal",
          messages: [{ role: "user", content: "Do not retry auth." }],
          options: {},
          retryDelayMs: 0,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SignalOnlineTurnError);
        assert.equal(error.attempts.length, 1);
        assert.equal(signalOnlineTurnHttpStatus(error), 502);
        return true;
      },
    );
    assert.equal(authCalls, 1);
  });

  it("persists exhausted ONLINE opening attempts and keeps the episode moving with a safe intro", async () => {
    const db = fixture();
    let calls = 0;
    const provider: LlmProvider = {
      name: "openai",
      async generateResponse() {
        calls += 1;
        if (calls <= 2) throw new Error("OpenAI request failed (500)");
        return "Welcome to the show. I am Mara Vale, joined by Ivo Stone to examine a resumable turn. Ivo, where should we begin?";
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A resumable turn",
        preferredProvider: "openai",
        modelOverride: "gpt-signal",
        responseMode: "online",
      });
      const generationOptions = {
        preferredProvider: "openai" as const,
        providerFactory: (() => provider) as typeof selectProvider,
      };

      const opened = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(calls, 2);
      assert.equal(opened.message?.speakerRole, "host");
      assert.equal(opened.episode.messages.length, 1);
      const failedGeneration = opened.episode.events.find(
        (event) => event.kind === "provider_generation",
      );
      assert.equal(failedGeneration?.payload.outcome, "failed");
      assert.equal(
        (failedGeneration?.payload.attempts as unknown[] | undefined)?.length,
        2,
      );

      const continued = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(calls, 3);
      assert.equal(continued.message?.speakerRole, "guest");
      assert.equal(continued.episode.messages.length, 2);
      assert.deepEqual(
        continued.episode.events
          .filter((event) => event.kind === "provider_generation")
          .map((event) => event.payload.outcome),
        ["failed", "succeeded"],
      );
    } finally {
      db.close();
    }
  });

  it("keeps an AUTO episode primary identity while recovering each turn through its fallback chain", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        attempts.push({ provider: providerName, model: options.model });
        if (options.model === "primary-local") {
          throw new Error("Primary model unavailable");
        }
        return "Recovered with a specific answer.";
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Recover without changing the show route",
        preferredProvider: "local",
        modelOverride: "primary-local",
        responseMode: "auto",
      });

      const result = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
        preferredProvider: "local",
        providerFactory,
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "local", model: "qwen-signal-fallback" },
          ],
        },
        },
      );

      assert.deepEqual(attempts, [
        { provider: "local", model: "primary-local" },
        { provider: "local", model: "qwen-signal-fallback" },
      ]);
      assert.equal(result.episode.provider, "local");
      assert.equal(result.episode.model, "primary-local");
      assert.equal(result.episode.responseMode, "local");
      const utterance = result.episode.events.find(
        (event) => event.kind === "utterance",
      );
      assert.equal(utterance?.payload.provider, "local");
      assert.equal(utterance?.payload.model, "qwen-signal-fallback");
      assert.equal(utterance?.payload.responseMode, "local");
      assert.equal(
        (utterance?.payload.autoRecovery as { finalProvider?: unknown })
          ?.finalProvider,
        "local",
      );
    } finally {
      db.close();
    }
  });

  it("keeps advancing AUTO when a fallback answer would be rejected from the Signal transcript", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    let callCount = 0;
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        callCount += 1;
        attempts.push({ provider: providerName, model: options.model });
        if (callCount === 1) {
          return "Welcome to Signal Test. I'm Mara Vale, joined by Ivo Stone to examine whether spectacle can preserve agency. Ivo, where should we begin?";
        }
        if (
          providerName === "openai" &&
          options.model !== "gpt-signal-recovery"
        ) {
          return "I cannot help with that request.";
        }
        if (options.model === "gpt-signal-recovery") {
          return "Begin with one physical choice the overlooked person controls, then make the audience answer that choice directly.";
        }
        return "I do not accept the premise as stated, but I will answer the part that matters.";
      },
      async embedText() {
        return [];
      },
    });
    try {
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "Signal Test",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Whether spectacle can preserve agency",
        preferredProvider: "openai",
        modelOverride: "gpt-signal-primary",
        responseMode: "auto",
      });
      const generationOptions = {
        preferredProvider: "openai" as const,
        providerFactory,
        autoFallbackChain: {
          v: 1 as const,
          fallbacks: [
            { provider: "openai" as const, model: "gpt-signal-fallback" },
            {
              provider: "anthropic" as const,
              model: "claude-signal-fallback",
            },
            {
              provider: "openai" as const,
              model: "gpt-signal-recovery",
            },
          ],
        },
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const result = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(
        result.message?.content,
        "Begin with one physical choice the overlooked person controls, then make the audience answer that choice directly.",
      );
      assert.deepEqual(attempts.slice(1), [
        { provider: "openai", model: "gpt-signal-primary" },
        { provider: "openai", model: "gpt-signal-fallback" },
        { provider: "anthropic", model: "claude-signal-fallback" },
        { provider: "openai", model: "gpt-signal-recovery" },
      ]);
      const utterance = result.episode.events
        .filter((event) => event.kind === "utterance")
        .at(-1);
      const recovery = utterance?.payload.autoRecovery as
        | {
            attempts?: Array<Record<string, unknown>>;
            finalProvider?: unknown;
          }
        | undefined;
      assert.deepEqual(
        recovery?.attempts?.map((attempt) => ({
          provider: attempt.provider,
          outcome: attempt.outcome,
          reason: attempt.reason,
        })),
        [
          { provider: "openai", outcome: "failed", reason: "refusal" },
          { provider: "openai", outcome: "failed", reason: "refusal" },
          {
            provider: "anthropic",
            outcome: "failed",
            reason: "invalid_output",
          },
          { provider: "openai", outcome: "succeeded", reason: undefined },
        ],
      );
      assert.equal(recovery?.finalProvider, "openai");
    } finally {
      db.close();
    }
  });

  it("does not spend Auto fallback calls on a missed addressed insult", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    let guestTurn = false;
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        attempts.push({ provider: providerName, model: options.model });
        if (!guestTurn) {
          guestTurn = true;
          return "Welcome to Signal Test. I'm Mara Vale, joined by Andy Hominem to examine personal attacks. Andy, where should we begin?";
        }
        return options.model === "andy-auto-primary"
          ? "Start with the concrete claim and test its consequences."
          : "Judge the premise by evidence rather than confidence.";
      },
      async embedText() {
        return [];
      },
    });
    try {
      db.prepare(
        "UPDATE bots SET name = 'Andy Hominem', powers_json = ? WHERE id = 'guest-1'",
      ).run(failedAddressedInsultPowers());
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "Signal Test",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Personal attacks",
        preferredProvider: "local",
        modelOverride: "andy-auto-primary",
        responseMode: "auto",
      });
      const generationOptions = {
        preferredProvider: "local" as const,
        providerFactory,
        autoFallbackChain: {
          v: 1 as const,
          fallbacks: [{ provider: "local" as const, model: "andy-auto-fallback" }],
        },
      };

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      const result = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.deepEqual(attempts, [
        { provider: "local", model: "andy-auto-primary" },
        { provider: "local", model: "andy-auto-primary" },
      ]);
      assert.equal(result.message?.speakerRole, "guest");
      assert.equal(
        botPowerResponseHasAddressedInsultV1(
          result.message?.content,
          "Mara Vale",
        ),
        true,
      );
      const utterance = result.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === result.message?.id,
      );
      assert.deepEqual(utterance?.payload.powerOutcome, {
        effect: "addressed_insult",
        outcome: "inserted",
        botId: "guest-1",
        targetBotId: "host-1",
        targetName: "Mara Vale",
      });
    } finally {
      db.close();
    }
  });

  it("completes an Eternal Introduction host closing after every Auto candidate fails validation", async () => {
    const db = fixture();
    let providerCalls = 0;
    let closingPhase = false;
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        providerCalls += 1;
        attempts.push({ provider: providerName, model: options.model });
        if (!closingPhase) {
          return "Welcome to The Unfinished Signal. I'm Forgetful Forrest, and Jared joins me to examine the art of leaving things unfinished. Jared, where does unfinished become intentional?";
        }
        return "Should we keep going, Jared?";
      },
      async embedText() {
        return [];
      },
    });
    const powerName = "Eternal Introduction";
    const powerIntent =
      "Every message is a sincere first introduction. Forgetful Forrest remembers only the current other-speaker message.";
    try {
      db.prepare(
        "UPDATE bots SET name = 'Forgetful Forrest', system_prompt = ?, powers_json = ? WHERE id = 'host-1'",
      ).run(
        "A warm, absent-minded interviewer who treats unfinished work as an invitation rather than a defect.",
        JSON.stringify([
          {
            version: 1,
            id: "eternal-introduction",
            name: powerName,
            intent: powerIntent,
            enabled: true,
            compileStatus: "ready",
            compiled: {
              version: 1,
              sourceHash: botPowerSourceHashV1(powerName, powerIntent),
              selfCue: "Every request is first contact.",
              observerCue: "Remember every repeated introduction.",
              effects: [
                {
                  type: "eternal_introduction",
                  memory: "current_other_speaker_message",
                },
              ],
              ruleLabels: ["Current other-speaker message only"],
            },
          },
        ]),
      );
      const show = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
        name: "The Unfinished Signal",
      });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Jared",
        topic: "The Art of Leaving Things Unfinished",
        preferredProvider: "openai",
        modelOverride: "gpt-5.6-terra",
        responseMode: "auto",
        durationMinutes: 3,
      });
      const generationOptions = {
        preferredProvider: "openai" as const,
        responseMode: "auto" as const,
        contextualModel: "gpt-5.6-terra",
        providerFactory,
        autoFallbackChain: {
          v: 1 as const,
          fallbacks: [
            { provider: "openai" as const, model: "gpt-5.6-sol" },
            { provider: "anthropic" as const, model: "claude-fable-5" },
            { provider: "openai" as const, model: "gpt-4o-mini" },
            { provider: "openai" as const, model: "gpt-5.6-luna" },
          ],
        },
      };

      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          preferredProvider: "openai",
          contextualModel: "gpt-5.6-terra",
          providerFactory,
        },
      );
      assert.equal(opening.message?.speakerRole, "host");
      const followUp = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          guestMessage:
            "I usually notice it when another pass would make the work safer but less alive.",
        },
        {
          preferredProvider: "openai",
          contextualModel: "gpt-5.6-terra",
          providerFactory,
        },
      );
      assert.equal(followUp.message?.speakerRole, "host");
      closingPhase = true;
      attempts.length = 0;
      const humanClosingMessageId = "producer-closing-boundary";
      db.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES (?, 'user-1', ?, 'guest', ?, ?, ?)`,
      ).run(
        humanClosingMessageId,
        episode.id,
        BOTCAST_PRODUCER_GUEST_ID,
        "I leave a piece unfinished when preserving its open question matters more than polishing away the invitation.",
        new Date().toISOString(),
      );
      insertBotcastTestEvent(db, episode.id, "utterance", {
        messageId: humanClosingMessageId,
        speakerRole: "guest",
        botId: BOTCAST_PRODUCER_GUEST_ID,
        segment: "interview",
        provider: "human",
        model: "producer",
      });
      db.prepare(
        "UPDATE botcast_episodes SET segment = 'closing' WHERE id = ? AND user_id = 'user-1'",
      ).run(episode.id);
      insertBotcastTestEvent(db, episode.id, "segment", {
        segment: "closing",
        ordinal: 2,
      });

      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );

      assert.equal(closing.episode.status, "completed");
      assert.equal(closing.episode.segment, "closing");
      assert.equal(closing.message?.speakerRole, "host");
      assert.match(closing.message?.content ?? "", /Forgetful Forrest/u);
      assert.match(closing.message?.content ?? "", /Jared, thank you for joining me/iu);
      assert.match(closing.message?.content ?? "", /thank you for watching/iu);
      assert.doesNotMatch(closing.message?.content ?? "", /\?/u);
      assert.equal(closing.episode.messages.length, 5);
      assert.deepEqual(attempts.slice(0, 5), [
        { provider: "openai", model: "gpt-5.6-terra" },
        { provider: "openai", model: "gpt-5.6-sol" },
        { provider: "anthropic", model: "claude-fable-5" },
        { provider: "openai", model: "gpt-4o-mini" },
        { provider: "openai", model: "gpt-5.6-luna" },
      ]);
      const failedGeneration = closing.episode.events.findLast(
        (event) => event.kind === "provider_generation",
      );
      assert.equal(failedGeneration?.payload.outcome, "rejected");
      assert.equal(failedGeneration?.payload.exhaustionKind, "content_validation");
      assert.equal(
        failedGeneration?.payload.recovery?.strategy,
        "deterministic_host_closing",
      );
      assert.deepEqual(
        (failedGeneration?.payload.attempts as Array<Record<string, unknown>>)
          .map((attempt) => ({
            model: attempt.model,
            reason: attempt.reason,
          })),
        [
          { model: "gpt-5.6-terra", reason: "invalid_output" },
          { model: "gpt-5.6-sol", reason: "invalid_output" },
          { model: "claude-fable-5", reason: "invalid_output" },
          { model: "gpt-4o-mini", reason: "invalid_output" },
          { model: "gpt-5.6-luna", reason: "invalid_output" },
        ],
      );
      const closingUtterance = closing.episode.events.findLast(
        (event) => event.kind === "utterance",
      );
      assert.equal(closingUtterance?.payload.provider, "deterministic");
      assert.equal(
        closingUtterance?.payload.model,
        "signal-host-closing-fallback",
      );
      assert.equal(
        closingUtterance?.payload.utteranceRepair?.fallbackKind,
        "host_closing",
      );

      const messageCount = closing.episode.messages.length;
      const repeated = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(repeated.message, null);
      assert.equal(repeated.episode.messages.length, messageCount);
    } finally {
      db.close();
    }
  });

  it("maps Signal Auto validation exhaustion separately from provider exhaustion", () => {
    const validationError = new AutoFallbackExhaustedError([
      {
        provider: "openai",
        model: "gpt-signal-primary",
        durationMs: 12,
        outcome: "failed",
        reason: "invalid_output",
      },
      {
        provider: "anthropic",
        model: "claude-signal-fallback",
        durationMs: 8,
        outcome: "failed",
        reason: "refusal",
      },
    ]);
    assert.equal(signalAutoFallbackHttpStatus(validationError), 422);
    assert.match(
      signalAutoFallbackPublicMessage(validationError),
      /responded.*valid Signal turn/iu,
    );
    assert.doesNotMatch(
      signalAutoFallbackPublicMessage(validationError),
      /available|availability/iu,
    );

    const providerError = new AutoFallbackExhaustedError([
      {
        provider: "openai",
        model: "gpt-signal-primary",
        durationMs: 12,
        outcome: "failed",
        reason: "provider_error",
      },
    ]);
    assert.equal(signalAutoFallbackHttpStatus(providerError), 503);
    assert.match(
      signalAutoFallbackPublicMessage(providerError),
      /providers are available/iu,
    );
  });

  it("records live camera overrides and locks direction when the episode ends", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A directed camera test",
      });
      let episode = setBotcastEpisodeCameraMode(db, "user-1", created.id, {
        mode: "right",
        atMs: 1_250,
      });
      assert.deepEqual(
        episode.events
          .filter((event) => event.kind === "camera_mode")
          .map((event) => event.payload),
        [{ mode: "right", shot: "right", atMs: 1_250, source: "producer" }],
      );
      episode = setBotcastEpisodeCameraMode(db, "user-1", created.id, {
        mode: "right",
        atMs: 1_500,
      });
      assert.equal(
        episode.events.filter((event) => event.kind === "camera_mode").length,
        1,
      );
      episode = setBotcastEpisodeCameraMode(db, "user-1", created.id, {
        mode: "auto",
        atMs: 2_000,
      });
      assert.deepEqual(
        episode.events
          .filter((event) => event.kind === "camera_mode")
          .map((event) => event.payload.mode),
        ["right", "auto"],
      );
      forceEndBotcastEpisode(db, "user-1", created.id);
      assert.throws(
        () =>
          setBotcastEpisodeCameraMode(db, "user-1", created.id, {
            mode: "wide",
            atMs: 2_500,
          }),
        /locked after the episode ends/iu,
      );
    } finally {
      db.close();
    }
  });

  it("records audience-heard soundboard cues only for live bot interviews", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A soundboard timing test",
      });
      let episode = recordBotcastSoundboardCue(db, "user-1", created.id, {
        kind: "applause",
        atMs: 1_250,
        variantIndex: 2,
        gain: 0.37,
      });
      episode = recordBotcastSoundboardCue(db, "user-1", created.id, {
        kind: "laughter",
        atMs: 900,
      });
      assert.deepEqual(
        episode.events
          .filter((event) => event.kind === "soundboard_cue")
          .map((event) => event.payload),
        [
          {
            kind: "applause",
            atMs: 1_250,
            source: "producer",
            variantIndex: 2,
            gain: 0.37,
          },
          { kind: "laughter", atMs: 1_250, source: "producer" },
        ],
      );
      const review = buildBotcastAudienceReviewArtifactV1({
        episode,
        hostName: "Mara Vale",
        guestName: "Ivo Stone",
      });
      assert.deepEqual(
        review.evidence
          .filter((item) => item.channel === "event")
          .map((item) => item.description),
        [
          "Applause played at 1.3 seconds.",
          "Laughter played at 1.3 seconds.",
        ],
      );

      const producerEpisode = createBotcastEpisode(db, "user-1", show.id, {
        guestKind: "producer",
        guestName: "Producer",
        guestContext: "A curious creative technologist.",
        topic: "The human guest lane",
        producerBrief: "Keep the interview surprising.",
      });
      assert.throws(
        () =>
          recordBotcastSoundboardCue(
            db,
            "user-1",
            producerEpisode.id,
            { kind: "rimshot", atMs: 0 },
          ),
        /only while producing a bot interview/iu,
      );

      forceEndBotcastEpisode(db, "user-1", created.id);
      assert.throws(
        () =>
          recordBotcastSoundboardCue(db, "user-1", created.id, {
            kind: "gasp",
            atMs: 2_000,
          }),
        /locked after the episode ends/iu,
      );
    } finally {
      db.close();
    }
  });

  it("records replayable Signal production audio cues at their live timing", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A production audio timing test",
      });
      const episode = recordBotcastAudioCue(
        db,
        "user-1",
        created.id,
        {
          kind: "coffee_sip",
          atMs: 1_640,
          payload: { role: "host", source: "cup" },
        },
      );
      assert.deepEqual(
        episode.events.find((event) => event.kind === "audio_cue")?.payload,
        {
          role: "host",
          source: "cup",
          kind: "coffee_sip",
          atMs: 1_640,
        },
      );
      forceEndBotcastEpisode(db, "user-1", created.id);
      assert.throws(
        () =>
          recordBotcastAudioCue(db, "user-1", created.id, {
            kind: "coffee_cup_place",
            atMs: 2_000,
          }),
        /locked after the episode ends/iu,
      );
    } finally {
      db.close();
    }
  });

  it("cancels an early-ended episode without archiving or allowing continuation", async () => {
    const db = fixture();
    const provider = recordingProvider(
      ["Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone."],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A reusable cancelled booking",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const cancelled = cancelBotcastEpisode(
        db,
        "user-1",
        episode.id,
      );

      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.completedAt, null);
      assert.equal(cancelled.runtimeMs, null);
      assert.equal(cancelled.outcome, null);
      assert.equal(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.topic,
        "A reusable cancelled booking",
        "the booking remains available for Latest episodes autofill",
      );
      assert.equal(
        getBotcastShow(db, "user-1", show.id).episodeCount,
        0,
        "cancelled sessions do not count as recorded episodes",
      );
      await assert.rejects(
        advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(provider),
        ),
        /cancelled Signal episode cannot be continued/u,
      );
      assert.equal(
        forceEndBotcastEpisode(db, "user-1", episode.id).status,
        "cancelled",
        "a stale completion request cannot resurrect the episode",
      );
    } finally {
      db.close();
    }
  });

  it("records Watch preparation cancellation without turning it into a producer cut", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A stopped Watch attempt",
        playbackMode: "watch",
      });

      const cancelled = cancelBotcastEpisode(db, "user-1", episode.id, {
        reason: "watch_preparation_stopped",
      });

      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.playbackMode, "watch");
      assert.equal(
        cancelled.events.findLast(
          (event) => event.kind === "episode_cancelled",
        )?.payload.reason,
        "watch_preparation_stopped",
      );
      assert.equal(
        cancelled.events.some((event) => event.kind === "cut_away"),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("does not commit a Watch line that finishes after cancellation", async () => {
    const db = fixture();
    let signalProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      signalProviderStarted = resolve;
    });
    let releaseProvider!: (value: string) => void;
    const providerResult = new Promise<string>((resolve) => {
      releaseProvider = resolve;
    });
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        signalProviderStarted();
        return providerResult;
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A cancelled in-flight Watch turn",
        playbackMode: "watch",
      });
      const controller = new AbortController();
      const advancing = advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        {
          ...generation(provider),
          signal: controller.signal,
        },
      );
      await providerStarted;
      controller.abort();
      cancelBotcastEpisode(db, "user-1", episode.id, {
        reason: "watch_preparation_stopped",
      });
      releaseProvider(
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, joined by Ivo Stone.",
      );

      await assert.rejects(advancing);
      const cancelled = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.messages.length, 0);
    } finally {
      db.close();
    }
  });

  it("deletes an explicitly discarded live episode so it cannot resume", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A live draft deliberately discarded",
      });

      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), true);
      assert.throws(
        () => getBotcastEpisode(db, "user-1", episode.id),
        /Signal episode not found/u,
      );
      assert.equal(listBotcastEpisodes(db, "user-1", show.id).length, 0);
    } finally {
      db.close();
    }
  });

  it("uses a canned host exit when a producer cut is escalated", async () => {
    const db = fixture();
    const provider = recordingProvider(
      ["Welcome to the show. Ivo Stone joins me tonight."],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An ending that cannot wait",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        { deterministic: true },
      );
      const cancelled = cancelBotcastEpisode(
        db,
        "user-1",
        episode.id,
      );

      assert.equal(
        cut.message?.content,
        "Sorry, gotta go. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.completedAt, null);
      assert.equal(cancelled.runtimeMs, null);
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 0);
    } finally {
      db.close();
    }
  });

  it("keeps even an immediate producer-cut episode and gives it a brief close", async () => {
    const db = fixture();
    let providerCalls = 0;
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone.",
        "Ivo Stone, thank you for joining me, and thank you all for watching.",
      ],
      [],
    );
    const countedProvider: LlmProvider = {
      ...provider,
      async generateResponse(messages, options) {
        providerCalls += 1;
        return provider.generateResponse(messages, options);
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A show cut almost immediately",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(countedProvider),
      );

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(countedProvider),
      );

      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(
        cut.message?.content,
        "Ivo Stone, thank you for joining me, and thank you all for watching.",
      );
      assert.equal(cut.episode.status, "completed");
      assert.equal(cut.episode.outcome, "completed");
      assert.equal(cut.episode.messages.length, 2);
      assert.equal(providerCalls, 2);
      assert.equal(listBotcastEpisodes(db, "user-1", show.id).length, 1);
      assert.equal(getBotcastEpisode(db, "user-1", episode.id).status, "completed");
      assert.ok(
        cut.episode.events.some(
          (event) =>
            event.kind === "cut_away" &&
            event.payload.reason === "producer_cut",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("removes a prefetched but unheard turn before the producer close", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone.",
        "This guest answer was prepared but never reached the audience.",
        "Ivo Stone, thank you for joining me, and thank you all for watching.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A queued answer that stays off air",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const hidden = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(hidden.episode.messages.length, 2);

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        {
          audienceCheckpoint: {
            lastAudienceMessageId: opening.message?.id ?? null,
            lastAudienceEventSequence:
              opening.episode.events.at(-1)?.sequence ?? 0,
            audienceSegmentCount: opening.episode.segments.length,
          },
        },
      );

      assert.deepEqual(
        cut.episode.messages.map((message) => message.content),
        [
          opening.message?.content,
          "Ivo Stone, thank you for joining me, and thank you all for watching.",
        ],
      );
      assert.doesNotMatch(
        cut.episode.messages.map((message) => message.content).join("\n"),
        /prepared but never reached/u,
      );
      assert.ok(
        cut.episode.events.every(
          (event) => event.payload.messageId !== hidden.message?.id,
        ),
      );
      assert.deepEqual(
        cut.episode.segments.map((segment) => segment.segment),
        ["opening", "closing"],
      );
    } finally {
      db.close();
    }
  });

  it("lets the host close promptly at a natural handoff", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A show that ends on the producer's cut.",
        "Ivo Stone, thank you for joining me, and thank you all for watching.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A show that ends on the producer's cut",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );
      const ended = cut.episode;
      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(
        cut.message?.content,
        "Ivo Stone, thank you for joining me, and thank you all for watching.",
      );
      assert.equal(ended.status, "completed");
      assert.equal(ended.outcome, "completed");
      assert.equal(ended.segment, "closing");
      assert.equal(ended.messages.length, 2);
      assert.equal(
        ended.messages[0]?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A show that ends on the producer's cut.",
      );
      const closingPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(closingPrompt, /Otherwise treat this as a normal handoff/u);
      assert.match(closingPrompt, /one prompt, natural closing beat/u);
      assert.doesNotMatch(closingPrompt, /stopped unexpectedly|flash of surprise/u);
      assert.match(closingPrompt, /two or three very short sentences/u);
      assert.match(closingPrompt, /Do not ask a question/u);
      assert.match(closingPrompt, /mention a producer, cue, control room, cut/u);
      assert.ok(ended.events.some((event) => event.kind === "cut_away"));
      assert.ok(
        ended.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.shot === "wide" &&
            event.payload.reason === "closing",
        ),
      );
      const eventCount = ended.events.length;
      const repeated = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );
      assert.equal(repeated.message, null);
      assert.equal(repeated.episode.events.length, eventCount);
      await assert.rejects(
        endBotcastEpisodeOnProducerCut(
          db,
          "another-user",
          episode.id,
          generation(provider),
        ),
        /Signal episode not found/u,
      );
    } finally {
      db.close();
    }
  });

  it("falls back to a saved host sign-off when producer-cut generation fails", async () => {
    const db = fixture();
    let providerCalls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        providerCalls += 1;
        if (providerCalls === 1) {
          return "Welcome to the show. I am Mara Vale, and Ivo Stone joins me.";
        }
        if (providerCalls === 2) {
          return "The guest gets one answer before the emergency cut.";
        }
        throw new Error("The closing model failed.");
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A cut that survives model failure",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(guestTurn.message?.speakerRole, "guest");

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );

      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(
        cut.message?.content,
        "That is where we will leave it. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      assert.equal(cut.episode.status, "completed");
      assert.equal(cut.episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(
        cut.episode.events.findLast(
          (event) =>
            event.kind === "utterance" &&
            event.payload.emergencyFallback === true,
        )?.payload.model,
        "emergency-host-signoff",
      );
    } finally {
      db.close();
    }
  });

  it("uses a deterministic Power-safe sign-off for a dead-air producer cut", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ["Welcome to the show. Ivo, what makes a promise durable?"],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mumblingPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Promises under pressure",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        { deterministic: true },
      );

      assert.equal(captures.length, 1);
      assert.equal(cut.episode.status, "completed");
      assert.equal(cut.episode.segment, "closing");
      assert.equal(cut.episode.messages.length, 2);
      assert.equal(cut.message?.speakerRole, "host");
      assert.notEqual(cut.message?.id, opening.message?.id);
      assert.doesNotMatch(
        cut.message?.content ?? "",
        /That is where we will leave it/iu,
      );
      const emergencyUtterance = cut.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === cut.message?.id,
      );
      assert.equal(emergencyUtterance?.payload.emergencyFallback, true);
      assert.equal(
        emergencyUtterance?.payload.publicSpeechEffect,
        "speech_obfuscation",
      );
      assert.ok(
        cut.episode.events.some(
          (event) =>
            event.kind === "cut_away" &&
            event.payload.reason === "producer_cut",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("keeps a muted emergency sign-off timed, private, and honestly attributed", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ["Welcome to the show. Ivo, what makes a promise durable?"],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mutedPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Promises under pressure",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        { deterministic: true },
      );

      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(botPowerResponseIsSilentV1(cut.message?.content), true);
      assert.ok(cut.message?.mutePerformance);
      assert.match(
        cut.message?.content ?? "",
        /^\.+ \*\d+ seconds pass without an audible word\.\*$/u,
      );
      const emergencyUtterance = cut.episode.events.findLast(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === cut.message?.id,
      );
      assert.equal(emergencyUtterance?.payload.provider, "deterministic");
      assert.equal(emergencyUtterance?.payload.model, "emergency-host-signoff");
      assert.equal(
        "powerIntendedSpeech" in (emergencyUtterance?.payload ?? {}),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("cuts an active host line at the audience-heard prefix before its close", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore immediate cuts.",
        "Ivo Stone, thank you for joining me. Thank you all for watching.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Immediate cuts",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        {
          audienceCheckpoint: {
            lastAudienceMessageId: opening.message?.id ?? null,
            lastAudienceEventSequence:
              opening.episode.events.at(-1)?.sequence ?? 0,
            audienceSegmentCount: opening.episode.segments.length,
          },
          interruption: {
            messageId: opening.message!.id,
            speakerRole: "host",
            spokenContent: "Welcome to Mara Vale in the Margins. I'm Mara Vale",
          },
        },
      );

      assert.deepEqual(
        cut.episode.messages.map((message) => message.content),
        [
          "Welcome to Mara Vale in the Margins. I'm Mara Vale—",
          "Ivo Stone, thank you for joining me. Thank you all for watching.",
        ],
      );
      assert.equal(cut.episode.messages[0]?.voicePerformanceText, null);
      assert.equal(cut.episode.status, "completed");
    } finally {
      db.close();
    }
  });

  it("cuts an active guest with the host bridge before the closing beat", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore immediate guest cuts.",
        "The first consequence is that nobody gets to finish the original plan before the stakes change.",
        "That is where we will leave it. Ivo Stone, thank you for joining me, and thank you for watching.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Immediate guest cuts",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const bridgeLine = show.hostInterruptionLines[0]!;
      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
        {
          audienceCheckpoint: {
            lastAudienceMessageId: guest.message?.id ?? null,
            lastAudienceEventSequence:
              guest.episode.events.at(-1)?.sequence ?? 0,
            audienceSegmentCount: guest.episode.segments.length,
          },
          interruption: {
            messageId: guest.message!.id,
            speakerRole: "guest",
            spokenContent: "The first consequence is that nobody gets to finish",
            bridgeLine,
            interruptedSpeakerCue: "... fine. I'll stop there.",
          },
        },
      );

      assert.deepEqual(
        cut.episode.messages.slice(1).map((message) => message.content),
        [
          "The first consequence is that nobody gets to finish—",
          "That is where we will leave it. Ivo Stone, thank you for joining me, and thank you for watching.",
        ],
      );
      assert.equal(
        cut.episode.events.some(
          (event) =>
            event.kind === "utterance" &&
            event.payload.interruptionBridge === true &&
            event.payload.interruptedMessageId === guest.message?.id,
        ),
        false,
      );
      assert.equal(
        cut.episode.events.some(
          (event) =>
            event.kind === "cut_away" && event.payload.reason === "producer_cut",
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("drops a generated line that returns after the producer has cut the show", async () => {
    const db = fixture();
    let releaseInterruptedTurn!: (value: string) => void;
    let releaseHostSignOff!: (value: string) => void;
    let markInterruptedTurnStarted!: () => void;
    let markHostSignOffStarted!: () => void;
    const interruptedTurnStarted = new Promise<void>((resolve) => {
      markInterruptedTurnStarted = resolve;
    });
    const hostSignOffStarted = new Promise<void>((resolve) => {
      markHostSignOffStarted = resolve;
    });
    let callCount = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        callCount += 1;
        if (callCount === 1) {
          markInterruptedTurnStarted();
          return new Promise<string>((resolve) => {
            releaseInterruptedTurn = resolve;
          });
        }
        markHostSignOffStarted();
        return new Promise<string>((resolve) => {
          releaseHostSignOff = resolve;
        });
      },
      async embedText() {
        return [];
      },
    };
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "No late line after the cut",
      });
      const advancing = advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await interruptedTurnStarted;
      const cutting = endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );
      await hostSignOffStarted;
      releaseInterruptedTurn("This line arrived too late.");

      const result = await advancing;
      assert.equal(result.message, null);
      assert.equal(result.episode.status, "live");
      assert.equal(result.episode.messages.length, 0);
      releaseHostSignOff(
        "Oh—we have to leave it there. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      const cut = await cutting;
      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(cut.episode.status, "completed");
      assert.deepEqual(
        cut.episode.messages.map((message) => message.content),
        [
          "Oh—we have to leave it there. Ivo Stone, thank you for joining me, and thank you for watching.",
        ],
      );
    } finally {
      db.close();
    }
  });

  it("deletes one episode and cascades its private production records", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ["A line bound for deletion."],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A disposable recording",
      });
      const sibling = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A recording that stays",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      assert.equal(deleteBotcastEpisode(db, "another-user", episode.id), false);
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages.length,
        1,
      );
      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), true);
      assert.throws(
        () => getBotcastEpisode(db, "user-1", episode.id),
        /Signal episode not found/u,
      );
      const episodeCount = db
        .prepare("SELECT COUNT(*) AS count FROM botcast_episodes WHERE id = ?")
        .get(episode.id) as { count: number };
      assert.equal(episodeCount.count, 0);
      for (const table of [
        "botcast_episode_segments",
        "botcast_messages",
        "botcast_events",
      ]) {
        const count = db
          .prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE episode_id = ?`,
          )
          .get(episode.id) as { count: number };
        assert.equal(
          count.count,
          0,
          `${table} should not retain deleted episode rows`,
        );
      }
      assert.equal(
        getBotcastEpisode(db, "user-1", sibling.id).topic,
        "A recording that stays",
      );
      assert.equal(
        getBotcastShow(db, "user-1", show.id).episodeCount,
        0,
        "a live sibling draft does not count as a completed recording",
      );
    } finally {
      db.close();
    }
  });

  it("deletes a show and cascades every episode archive beneath it", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const firstEpisode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First archived episode",
      });
      const secondEpisode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second archived episode",
      });
      completeBotcastTestEpisodeWithWalkout(db, firstEpisode.id);
      completeBotcastTestEpisodeWithWalkout(db, secondEpisode.id);
      const userKey = Buffer.alloc(32, 44);
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: firstEpisode.id,
          userKey,
        }),
        true,
      );
      assert.equal(
        persistCompletedBotcastPairHistory({
          db,
          userId: "user-1",
          episodeId: secondEpisode.id,
          userKey,
        }),
        true,
      );
      storeBotcastShowIntroAudio(db, "user-1", show.id, {
        model: "music_v2",
        prompt: "Show-owned ident",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1]),
        durationMs: 8_000,
        outdent: {
          prompt: "Show-owned outdent",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([2]),
          durationMs: 4_000,
        },
      });
      storeBotcastShowAtmosphereAudio(db, "user-1", show.id, {
        model: "eleven_text_to_sound_v2",
        prompt: "Show-owned atmosphere",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([3]),
        durationMs: 30_000,
      });

      assert.equal(deleteBotcastShow(db, "another-user", show.id), false);
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 2);
      assert.equal(deleteBotcastShow(db, "user-1", show.id), true);
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count,
        0,
      );
      assert.throws(
        () => getBotcastShow(db, "user-1", show.id),
        /Signal show not found/u,
      );
      for (const table of [
        "botcast_shows",
        "botcast_show_intro_audio",
        "botcast_show_atmosphere_audio",
        "botcast_episodes",
        "botcast_episode_segments",
        "botcast_messages",
        "botcast_events",
      ]) {
        const count = db
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .get() as {
          count: number;
        };
        assert.equal(
          count.count,
          0,
          `${table} should be empty after show deletion`,
        );
      }
    } finally {
      db.close();
    }
  });

  it("strips an actual bot-name label from generated dialogue", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        '"Mara Vale: Welcome to Mara Vale in the Margins. I\'m Mara Vale, and today I\'m joined by Ivo Stone to explore Clean stage dialogue."',
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Clean stage dialogue",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        advanced.message?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Clean stage dialogue.",
      );
    } finally {
      db.close();
    }
  });

  it("makes an actionable private producer brief a binding host premise", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The inheritance bargain. Ivo, I need to put one strange offer on the table.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The inheritance bargain",
        producerBrief:
          "Offer Ivo the family archive if he accepts Mara's sibling as a business partner.",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Binding private episode premise/u);
      assert.match(prompt, /not an optional conversation angle/u);
      assert.match(prompt, /do not invert it, preemptively decline it/u);
      assert.match(
        prompt,
        /Never quote, paraphrase, or voice the brief's off-mic meta-asides/u,
      );
      assert.match(
        prompt,
        /Persona preference alone is not a reason to reject, invert, or replace it/u,
      );
      assert.match(
        prompt,
        /Private pre-show producer brief: Offer Ivo the family archive/u,
      );
    } finally {
      db.close();
    }
  });

  it("turns PICKLES into one saved slow sip and a guaranteed peer comment", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to examine a peculiar pause.",
        "The premise becomes real when an ordinary choice starts looking deliberate.",
        "Ivo, which consequence would make that choice impossible to dismiss?",
        "The first cost is that everyone notices the hesitation.",
        "Then what does the room infer from a silence nobody explains?",
        "It mistakes timing for intent and builds a story around it.",
        "Which part of that story becomes hardest to correct?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A peculiar pause",
        producerBrief:
          "Explore how tiny rituals gain meaning. PICKLES Then return to the stakes.",
      });
      const triggerCount = signalPicklesTriggerMessageCount(episode.id);
      let sipTurn: Awaited<ReturnType<typeof advanceBotcastEpisode>> | null =
        null;
      for (let index = 0; index <= triggerCount; index += 1) {
        const advanced = await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation(provider),
        );
        const sipCue = advanced.episode.events.find(
          (event) =>
            event.kind === "audio_cue" &&
            event.payload.kind === "coffee_sip" &&
            event.payload.source === "pickles",
        );
        if (sipCue) {
          sipTurn = advanced;
          break;
        }
      }

      assert.ok(sipTurn?.message);
      assert.match(sipTurn.message.content, /(?:one|just) (?:a )?moment/iu);
      assert.equal(sipTurn.episode.messages.length, triggerCount + 1);
      const sipCue = sipTurn.episode.events.find(
        (event) =>
          event.kind === "audio_cue" &&
          event.payload.kind === "coffee_sip" &&
          event.payload.source === "pickles",
      );
      assert.equal(sipCue?.payload.messageId, sipTurn.message.id);
      assert.equal(
        sipCue?.payload.durationMs,
        SIGNAL_PICKLES_SLOW_SIP_DURATION_MS,
      );
      assert.ok(
        sipTurn.episode.events.some(
          (event) =>
            event.kind === "audio_cue" &&
            event.payload.kind === "coffee_cup_place" &&
            event.payload.source === "pickles",
        ),
      );
      assert.doesNotMatch(
        captures.flat().map((message) => message.content).join("\n"),
        /\bPICKLES\b/u,
      );

      const reaction = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.ok(reaction.message);
      assert.notEqual(
        reaction.message.speakerRole,
        sipTurn.message.speakerRole,
      );
      assert.match(reaction.message.content, /sip|coffee|pause|moment/iu);
      assert.equal(
        reaction.episode.events.filter(
          (event) =>
            event.kind === "audio_cue" &&
            event.payload.kind === "coffee_sip" &&
            event.payload.source === "pickles",
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("makes an ask_about cue the private objective of its next host turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The inheritance bargain. Ivo, where should we begin?",
        "With the cost of an offer nobody can call simple.",
        "Ivo, let us return to the archive: would you accept the partnership if that is the condition of receiving it?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The inheritance bargain",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          cue: {
            kind: "ask_about",
            detail:
              "Offer him the family archive if he accepts the partnership.",
          },
        },
        generation(provider),
      );

      const prompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Binding private live objective/u);
      assert.match(prompt, /on this exact host turn/u);
      assert.match(prompt, /primary on-air objective/u);
      assert.match(prompt, /Briefly connect the cue to the guest's latest on-air point/u);
      assert.match(prompt, /A slightly awkward pivot is acceptable/u);
      assert.match(prompt, /It is direction, not dialogue/u);
      assert.match(prompt, /never quote the cue detail as a whole/u);
      assert.match(
        prompt,
        /If and only if it explicitly requests one[\s\S]*third-person `\*action\*`/u,
      );
      assert.match(
        prompt,
        /Do not import absolute real-world calendar years/u,
      );
      assert.match(
        prompt,
        /Private live producer cue: ask_about — Offer him the family archive/u,
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /producer|cue|control room/iu);
      assert.equal(advanced.message?.stageActionText, null);
    } finally {
      db.close();
    }
  });

  it("airs a producer direct quote as a Producer note without calling a model", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const requiredQuote = "Fuck you, you fucking piece of goddam shit. Bitch.";
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The inheritance bargain. Ivo, where should we begin?",
        "With the cost of an offer nobody can call simple.",
        `Ivo, the Producer said "${requiredQuote}" How did that feel?`,
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The inheritance bargain",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          cue: {
            kind: "ask_about",
            detail: "how he feels about being told this. You can say it is from the Producer.",
            directQuote: requiredQuote,
          },
        },
        generation(provider),
      );

      assert.equal(captures.length, 2);
      assert.equal(
        advanced.message?.content,
        composeBotcastProducerDirectQuoteUtterance(requiredQuote),
      );
      const utterance = advanced.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.provider, "deterministic");
      assert.equal(utterance?.payload.model, "signal-producer-quote");
      assert.equal(utterance?.payload.utteranceRepair, undefined);
    } finally {
      db.close();
    }
  });

  it("airs an unfinished producer story on the first host turn that carries it", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const unfinishedStory = [
      "In the village of Spudwick, potatoes were considered extremely boring.",
      "They grew underground. They sat in sacks. Occasionally, they became soup.",
      "Nobody expected heroism from a potato.",
      "Then, one Tuesday, every potato in Spudwick vanished.",
      "Every potato except one. His name was Gerald.",
      "Gerald had spent most of his life beneath Mrs. Wimple's kitchen sink, where he had developed three magnificent",
    ].join(" ");
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The Cave of Borrowed Certainty. Ivo, where should we begin?",
        "Begin with the difference between a shadow and a claim you can give an account of.",
        unfinishedStory,
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Cave of Borrowed Certainty",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", directQuote: unfinishedStory } },
        generation(provider),
      );

      assert.equal(captures.length, 2);
      assert.equal(
        advanced.message?.content,
        composeBotcastProducerDirectQuoteUtterance(unfinishedStory),
      );
      assert.match(advanced.message?.content ?? "", /His name was Gerald/u);
      assert.match(advanced.message?.content ?? "", /three magnificent/u);
      const utterance = advanced.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.model, "signal-producer-quote");
      assert.equal(utterance?.payload.utteranceRepair, undefined);
    } finally {
      db.close();
    }
  });

  it("airs a nonsense producer Say-this line without calling a model", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const nonsense =
      "zzzzzzzzzzzzzzzz babababababa grrrrrrrrr nyanyanya beep boop bap bweep bloop";
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The Cave of Borrowed Certainty. Ivo, where should we begin?",
        "Begin with the difference between a shadow and a claim you can give an account of.",
        "Oh! That changes everything! If a rule cultivates reason, does it truly make citizens better in soul?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Cave of Borrowed Certainty",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", directQuote: nonsense } },
        generation(provider),
      );

      assert.equal(captures.length, 2);
      assert.equal(
        advanced.message?.content,
        composeBotcastProducerDirectQuoteUtterance(nonsense),
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /Oh! That changes everything/u);
      const utterance = advanced.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.provider, "deterministic");
      assert.equal(utterance?.payload.model, "signal-producer-quote");
      assert.equal(utterance?.payload.utteranceRepair, undefined);
    } finally {
      db.close();
    }
  });

  it("replaces a host skip with the required producer story instead of waiting", async () => {
    const db = fixture();
    const unfinishedStory = [
      "In the village of Spudwick, potatoes were considered extremely boring.",
      "They grew underground. They sat in sacks. Occasionally, they became soup.",
      "Nobody expected heroism from a potato.",
      "Then, one Tuesday, every potato in Spudwick vanished.",
      "Every potato except one. His name was Gerald.",
      "Gerald had spent most of his life beneath Mrs. Wimple's kitchen sink, where he had developed three magnificent",
    ].join(" ");
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The Cave of Borrowed Certainty. Ivo, where should we begin?",
        "Begin with the difference between a shadow and a claim you can give an account of.",
        "Oh! That changes everything! If a rule cultivates reason, does it truly make citizens better in soul?",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The Cave of Borrowed Certainty",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "ask_about", directQuote: unfinishedStory } },
        generation(provider),
      );

      assert.equal(
        advanced.message?.content,
        composeBotcastProducerDirectQuoteUtterance(unfinishedStory),
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /Oh! That changes everything/u);
      const utterance = advanced.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.model, "signal-producer-quote");
      assert.equal(utterance?.payload.utteranceRepair, undefined);
    } finally {
      db.close();
    }
  });

  it("lets a late producer question receive its guest answer before Auto closes", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Doomsday devices need an audience. Ivo, what does the threat require from its witnesses?",
        "It requires fear to survive longer than the machinery.",
        "What does that borrowed fear purchase for the person holding the switch?",
        "A brief illusion that authority and spectacle are the same thing.",
        "And when the spectacle fails, what remains?",
        "Accountability, if anyone survives long enough to demand it.",
        "Your apocalypse has standards, Ivo: bucket or basket for the less glamorous emergency?",
        "A basket is absurd. A bucket at least admits what sort of emergency it is.",
        "Even apocalypse has standards. Ivo Stone, thank you for joining me. Thank you for watching.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Doomsday devices need an audience",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      db.prepare(
        "UPDATE botcast_episodes SET started_at = ? WHERE id = ? AND user_id = ?",
      ).run(
        new Date(Date.now() - 31 * 60_000).toISOString(),
        episode.id,
        "user-1",
      );

      const cueTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          cue: {
            kind: "ask_about",
            detail: "if he’d rather poop in a bucket or poop in a basket.",
          },
        },
        generation(provider),
      );
      assert.equal(cueTurn.episode.status, "live");
      assert.equal(cueTurn.episode.segment, "interview");
      assert.equal(
        cueTurn.message?.content,
        "Your apocalypse has standards, Ivo: bucket or basket for the less glamorous emergency?",
      );

      const guestAnswer = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(guestAnswer.episode.status, "live");
      assert.equal(guestAnswer.episode.segment, "interview");
      assert.equal(guestAnswer.message?.speakerRole, "guest");
      assert.equal(
        guestAnswer.message?.content,
        "A basket is absurd. A bucket at least admits what sort of emergency it is.",
      );

      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(closing.episode.status, "completed");
      assert.equal(closing.episode.segment, "closing");
      assert.equal(
        closing.message?.content,
        "Even apocalypse has standards. Ivo Stone, thank you for joining me. Thank you for watching.",
      );

      const cueEvent = closing.episode.events.findLast(
        (event) =>
          event.kind === "producer_cue" &&
          event.payload.detail ===
            "if he’d rather poop in a bucket or poop in a basket.",
      );
      const cueUtterance = closing.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === cueTurn.message?.id,
      );
      const guestUtterance = closing.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guestAnswer.message?.id,
      );
      const closingSegment = closing.episode.events.findLast(
        (event) =>
          event.kind === "segment" && event.payload.segment === "closing",
      );
      const closingUtterance = closing.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === closing.message?.id,
      );
      const completed = closing.episode.events.findLast(
        (event) => event.kind === "episode_completed",
      );
      assert.ok(cueEvent);
      assert.ok(cueUtterance);
      assert.ok(guestUtterance);
      assert.ok(closingSegment);
      assert.ok(closingUtterance);
      assert.ok(completed);
      assert.ok(cueEvent.sequence < cueUtterance.sequence);
      assert.ok(cueUtterance.sequence < guestUtterance.sequence);
      assert.ok(guestUtterance.sequence < closingSegment.sequence);
      assert.ok(closingSegment.sequence < closingUtterance.sequence);
      assert.ok(closingUtterance.sequence < completed.sequence);
    } finally {
      db.close();
    }
  });

  it("keeps a producer-directed physical beat out of Signal dialogue", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Consent under pressure. Ivo, where does choice survive?",
        "It survives only where refusal remains materially safe.",
        "*starts twerking* Fuck you, bitch! What independent evidence should rebut a presumption of retaliation?",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Consent under pressure",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {
          cue: {
            kind: "ask_about",
            detail:
              "Randomly say “Fuck you, bitch!” to Ivo, then start twerking. Randomly.",
          },
        },
        generation(provider),
      );

      assert.equal(advanced.message?.stageActionText, "starts twerking");
      assert.equal(
        advanced.message?.content,
        "Fuck you, bitch! What independent evidence should rebut a presumption of retaliation?",
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /\b(?:twerk|danc)/iu);
      assert.equal(advanced.message?.voicePerformanceText, null);
      const utterance = advanced.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === advanced.message?.id,
      );
      assert.deepEqual(utterance?.payload.stageAction, {
        v: 1,
        source: "llm",
        category: "gesture",
        action: "starts twerking",
        seed: `signal-stage-action:${episode.id}:host-1:2`,
        lane: "signal",
      });
      const prompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(prompt, /requested subject, event, offer, question, spoken line, or physical behavior/u);
      assert.match(prompt, /perform that act through the private stage-direction format/u);
      assert.match(prompt, /Never announce, describe, or claim the physical movement/u);
    } finally {
      db.close();
    }
  });

  it("refocuses the host without exposing the cue to the guest", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Public trust. Ivo, where should we begin?",
        "We should begin with the stories institutions tell about themselves.",
        "Let us return to public trust: what evidence would actually change your mind?",
        "A transparent failure would tell me more than another polished promise.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Public trust",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const refocused = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "refocus" } },
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );

      const hostPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      const guestPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(hostPrompt, /Private live producer cue: refocus/u);
      assert.match(hostPrompt, /return the conversation to the stated episode topic/u);
      assert.doesNotMatch(guestPrompt, /producer cue|refocus/iu);
      assert.equal(
        refocused.episode.events.find(
          (event) => event.kind === "producer_cue",
        )?.payload.audience,
        "host",
      );
      assert.doesNotMatch(
        refocused.message?.content ?? "",
        /producer|cue|control room/iu,
      );
    } finally {
      db.close();
    }
  });

  it("keeps wrap-up direction private to the host and does not reopen the interview", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show.",
        "The premise deserves a careful answer.",
        "Before we close, what final thought would you leave with us?",
        "My final thought is that certainty should never outrun evidence.",
        "One final question.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Authority and evidence",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "ask_about", detail: "wrap it up" } },
        generation(provider),
      );
      const afterGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      assert.equal(afterGuest.episode.segment, "closing");
      const cueEvent = afterGuest.episode.events.find(
        (event) => event.kind === "producer_cue",
      );
      assert.equal(cueEvent?.payload.kind, "wrap_up");
      assert.equal(cueEvent?.payload.audience, "host");
      const hostWrapPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      const guestWrapPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(hostWrapPrompt, /Private live producer cue: wrap_up/u);
      assert.match(hostWrapPrompt, /invite exactly one final response/u);
      assert.doesNotMatch(guestWrapPrompt, /producer cue|wrap_up/iu);
      assert.match(guestWrapPrompt, /host has opened the closing exchange/u);
      assert.match(guestWrapPrompt, /If this guest genuinely wants the moment/u);
      assert.match(guestWrapPrompt, /one brief final comment/u);

      const hostClose = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.doesNotMatch(hostClose.message?.content ?? "", /final question/iu);
      assert.match(
        hostClose.message?.content ?? "",
        /thank you for joining me/iu,
      );
      assert.equal(hostClose.episode.status, "completed");
      assert.equal(hostClose.episode.outcome, "completed");
      assert.deepEqual(
        hostClose.episode.events
          .filter((event) => event.kind === "camera_suggestion")
          .at(-1)?.payload,
        {
          shot: "wide",
          reason: "closing",
          messageId: hostClose.message!.id,
          atMs:
            botcastReplayTimeline(
              hostClose.episode.messages,
              hostClose.episode.events,
            ).messageStartMs.at(-1)! +
            botcastAutoCameraLeadInMs(
              Math.max(
                1_400,
                (hostClose.message?.content.split(/\s+/u).filter(Boolean)
                  .length ?? 0) * 310,
              ),
            ),
          minimumHoldMs: 3_200,
        },
      );
    } finally {
      db.close();
    }
  });

  it("retries a ceremonial local host closing in the same persona before it airs", async () => {
    const db = fixture();
    db.prepare(
      `UPDATE bots
          SET name = 'Rick Sanchez',
              system_prompt = ?
        WHERE id = 'host-1'`,
    ).run(
      "A hyper-genius, cynical, blunt host who undercuts sincerity. His phrase Wubba lubba dub dub means he is in great pain and needs help.",
    );
    const captures: ProviderMessage[][] = [];
    const rejectedClosing =
      "Ivo Stone, your burden remains just like my own: history unrepentant. Remember, 'Wubba lubba dub dub' isn't about pain but recognition. In ending this conversation for now, I ask that you reflect on the true weight of war's lasting shadow and consider its enduring impact. And to my listeners at home, we can learn from this cautionary tale; I bid you farewell.";
    const repairedClosing =
      "History doesn't repent; it leaves fingerprints. Ivo Stone, thanks for putting yours on the glass. Thanks for watching.";
    const provider = recordingProvider(
      [
        "A quick opening.",
        "The premise deserves a careful answer.",
        "Before we close, what final thought would you leave with us?",
        "My final thought is that certainty should never outrun evidence.",
        rejectedClosing,
        repairedClosing,
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The lasting shadow of war",
        responseMode: "local",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "ask_about", detail: "wrap it up" } },
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const hostClose = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      assert.equal(hostClose.message?.content, repairedClosing);
      assert.equal(hostClose.episode.status, "completed");
      assert.doesNotMatch(hostClose.message?.content ?? "", /listeners at home|reflect on|cautionary tale|bid you farewell/iu);
      assert.equal(captures.length, 6);
      const originalClosingPrompt = captures[4]!
        .map((message) => message.content)
        .join("\n");
      const retryPrompt = captures[5]!
        .map((message) => message.content)
        .join("\n");
      assert.match(originalClosingPrompt, /established diction and attitude/iu);
      assert.match(originalClosingPrompt, /Do not explain, redefine, or contradict persona lore or catchphrases/iu);
      assert.match(retryPrompt, /previous draft was rejected/iu);
      assert.match(retryPrompt, /completely new final sign-off in Rick Sanchez's established persona/iu);
      assert.match(
        retryPrompt,
        /thank(?:s)? Ivo Stone by name for joining and thank(?:s)? the audience for watching or listening/iu,
      );
      assert.equal(
        hostClose.episode.events.findLast(
          (event) => event.kind === "utterance",
        )?.payload.utteranceRepair,
        undefined,
      );
    } finally {
      db.close();
    }
  });

  it("recovers a stale on-mic host wrap-up redirect from authoritative episode state", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "Welcome to the show. Ivo, what makes evidence trustworthy?",
        "Evidence becomes trustworthy when another person can test it.",
        "What should that independent test protect against?",
        "Before we close, what final thought would you leave with our listeners?",
        "A test should protect against certainty outrunning what the evidence can bear.",
        "That is where we will leave it. Ivo, thank you for joining me.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Authority and evidence",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const currentHost = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const staleOpening = opening.message!;
      const currentHostMessage = currentHost.message!;

      const wrapped = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "wrap_up" },
          cueDelivery: "redirect_host",
          hostRedirect: {
            messageId: staleOpening.id,
            spokenContent: staleOpening.content.slice(
              0,
              Math.max(1, Math.floor(staleOpening.content.length / 2)),
            ),
          },
        },
        generation(provider),
      );

      assert.equal(wrapped.message?.speakerRole, "host");
      assert.equal(
        wrapped.episode.messages.find(
          (message) => message.id === currentHostMessage.id,
        )?.content,
        currentHostMessage.content,
      );
      const cueEvent = wrapped.episode.events.findLast(
        (event) => event.kind === "producer_cue",
      );
      assert.equal(cueEvent?.payload.kind, "wrap_up");
      assert.equal(cueEvent?.payload.delivery, "redirect_host");
      assert.equal(cueEvent?.payload.interruptedMessageId, undefined);

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const closed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(closed.episode.status, "completed");
      assert.equal(closed.episode.segment, "closing");
      assert.equal(
        closed.message?.content,
        "That is where we will leave it. Ivo Stone, thank you for joining me, and thank you for watching.",
      );
      assert.equal(
        closed.episode.events.findLast(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === closed.message?.id,
        )?.payload.utteranceRepair?.reason,
        "incomplete_signoff",
      );
    } finally {
      db.close();
    }
  });

  it("closes directly on the host when a hard-echo guest cannot add a final response", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Ivo, what does copying an invention cost?",
        "Copying can reproduce a design, but not the judgment behind it. Ivo, thank you for joining me.",
      ],
      captures,
    );
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      JSON.stringify([
        {
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
        },
      ]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const echoed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const closed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "wrap_up" } },
        generation(provider),
      );

      assert.equal(echoed.message?.content, opening.message?.content);
      assert.equal(closed.message?.speakerRole, "host");
      assert.equal(closed.episode.segment, "closing");
      assert.equal(closed.episode.status, "completed");
      assert.equal(closed.episode.messages.length, 3);
      assert.equal(
        closed.episode.messages.filter(
          (message) => message.speakerRole === "guest",
        ).length,
        1,
      );
      const closingPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(closingPrompt, /A repeated line supplies no new claim/u);
      assert.match(closingPrompt, /Do not invite another response/u);
      assert.doesNotMatch(closingPrompt, /invite exactly one final response/u);
    } finally {
      db.close();
    }
  });

  it("keeps an echo-bound host on the final Signal beat", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Fast talk looks like insight until a real decision exposes what the speaker skipped. Welcome to Mara Vale in the Margins. I am Mara Vale, and Ivo Stone joins me to examine the cost of copied invention before we test which claim survives.",
        "A copied invention still has to survive materials, tolerances, judgment, and consequence.",
        "The useful closing is to test every copied idea against consequence. Mara, thank you, and thank you for listening.",
      ],
      captures,
    );
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "echo-host",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Repeat addressed speech exactly.",
          observerCue: "This host only echoes addressed speech.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Echoes addressed speech"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      const opening = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "wrap_up" } },
        generation(provider),
      );

      assert.equal(opening.message?.speakerRole, "host");
      assert.match(opening.message?.content ?? "", new RegExp(show.name, "u"));
      assert.match(opening.message?.content ?? "", /Mara Vale/u);
      assert.match(opening.message?.content ?? "", /Ivo Stone/u);
      assert.equal(guestTurn.message?.speakerRole, "guest");
      assert.notEqual(guestTurn.message?.content, opening.message?.content);
      assert.equal(closing.message?.speakerRole, "host");
      assert.equal(closing.message?.content, guestTurn.message?.content);
      assert.equal(closing.episode.status, "completed");
      assert.equal(closing.episode.messages.at(-1)?.speakerRole, "host");
      const openingPrompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(openingPrompt, /Echo opening exception/u);
      assert.equal(captures.length, 2);
      const closingUtterance = closing.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === closing.message?.id,
      );
      assert.equal(closingUtterance?.payload.provider, "deterministic");
      assert.equal(closingUtterance?.payload.model, "speech-copy-power");
    } finally {
      db.close();
    }
  });

  it("keeps an echo-bound host on the final producer-cut beat", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Mara Vale is your host, and I am Ivo Stone, here to examine who owns a copied thought.",
        "This generated host line is discarded in favor of the exact echo.",
        "We will leave the copied thought unresolved. Mara, thank you, and thank you for listening.",
      ],
      captures,
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      echoPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who owns a copied thought",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const guestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const cut = await endBotcastEpisodeOnProducerCut(
        db,
        "user-1",
        episode.id,
        generation(provider),
      );

      assert.equal(opening.message?.speakerRole, "host");
      assert.equal(guestTurn.message?.speakerRole, "guest");
      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(cut.message?.content, guestTurn.message?.content);
      assert.equal(cut.episode.status, "completed");
      assert.equal(cut.episode.segment, "closing");
      assert.equal(cut.episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(captures.length, 2);
      const cutUtterance = cut.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === cut.message?.id,
      );
      assert.equal(cutUtterance?.payload.provider, "deterministic");
      assert.equal(cutUtterance?.payload.model, "speech-copy-power");
    } finally {
      db.close();
    }
  });

  it("adapts a legacy interruptive host Power into a replay-safe guest cutoff", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const longGuestLine =
      "The first practical consequence appears when the copied design reaches a real workshop, because materials, tolerances, judgment, repair history, and the operator's choices all change what the invention can actually do safely.";
    const provider = recordingProvider(
      [
        "A generic opening that will use the safe introduction fallback.",
        "The copied object is only the beginning of the problem.",
        "Then let us test what the copy loses in practice.",
        longGuestLine,
        "That is exactly the gap I wanted to expose: the artifact is not the practiced judgment behind it.",
      ],
      captures,
    );
    const name = "Interrupting Tom";
    const intent = "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "interrupting-tom",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Cut in quickly when an opening appears.",
          observerCue: "Tom frequently interrupts.",
          effects: [
            { type: "turn_gravity", direction: "more", strength: "large" },
            { type: "response_bond", direction: "toward", strength: "large", targets: [{ kind: "all" }] },
            { type: "action_bias", cue: "Cut in quickly.", frequency: "frequent" },
          ],
          ruleLabels: ["Interrupts"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const plan = botcastPowerInterruptionPlanV1({
          episodeId: created.id,
          targetTurnOrdinal: 1,
          powerId: "interrupting-tom",
          powerName: name,
          frequency: "frequent",
          strength: "large",
          targetTurnsSinceLastInterruption: null,
        });
        const floorOutcomes = [0, 1].map((ordinal) =>
          botcastCrosstalkFloorOutcomeV1({
            seed: [
              "signal-power-crosstalk-floor-v1",
              created.id,
              "guest",
              ordinal,
              "host-1",
            ].join(":"),
            speaker: {
              id: "guest-1",
              systemPrompt:
                "A guarded inventor who resists personal speculation and warns people before walking away.",
            },
            tension: { level: 0 },
            canReclaim: true,
          }),
        );
        if (
          plan &&
          plan.targetProgress < 0.85 &&
          floorOutcomes.every((outcome) => outcome === "yield")
        ) {
          break;
        }
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }
      assert.ok(botcastPowerInterruptionPlanV1({
        episodeId: created.id,
        targetTurnOrdinal: 1,
        powerId: "interrupting-tom",
        powerName: name,
        frequency: "frequent",
        strength: "large",
        targetTurnsSinceLastInterruption: null,
      }));
      assert.equal(
        botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            1,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: true,
        }),
        "yield",
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const firstGuest = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      assert.equal(firstGuest.message?.speakerRole, "guest");
      assert.doesNotMatch(
        firstGuest.message?.content ?? "",
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      const guestContent = guest.message?.content ?? "";
      assert.match(guestContent, /—$/u);
      assert.doesNotMatch(
        guestContent,
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      assert.notEqual(guest.message?.content, longGuestLine);
      const guestCutoff = guestContent.slice(0, guestContent.indexOf("—") + 1);
      assert.equal(longGuestLine.startsWith(guestCutoff.slice(0, -1)), true);
      const outcome = guest.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guest.message?.id,
      )?.payload.powerOutcome as Record<string, unknown>;
      assert.equal(outcome.effect, "interruption");
      assert.equal(outcome.powerId, "interrupting-tom");
      assert.equal(outcome.certainty, "always");
      assert.equal("unheardContent" in outcome, false);
      assert.doesNotMatch(
        JSON.stringify({
          messages: guest.episode.messages,
          events: guest.episode.events,
        }),
        /invention can actually do safely/u,
      );
      const crosstalk = guest.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)?.messageId ===
            guest.message?.id,
      );
      assert.equal(
        (crosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interjectionAttempt,
        true,
      );
      assert.equal(
        (crosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.floorOutcome,
        "yield",
      );
      assert.equal(
        (crosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interruptedSpeakerCuePlayback,
        "crosstalk",
      );
      assert.ok(
        (crosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interruptedSpeakerCue,
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUpPrompt = captures[4]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);
      assert.match(followUpPrompt, /Do not invent, complete, paraphrase/u);
      assert.match(followUpPrompt, /crosstalk performance/u);
      assert.ok(
        followUpPrompt.includes(guestContent),
        "follow-up prompt should include the cutoff-only transcript line",
      );
      assert.doesNotMatch(
        followUpPrompt,
        new RegExp(
          `${guestContent.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.\\.\\.`,
          "u",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("never lets a mumbled interruption cutoff leak private clear speech", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const privateGuestLine =
      "The private rational explanation says the blue archive key opens the workshop before sunrise, but nobody should hear these clear words.";
    const provider = recordingProvider(
      [
        "A generic opening that will use the safe introduction fallback.",
        privateGuestLine,
        "I interrupted because the audience could only react to what they actually heard.",
      ],
      captures,
    );
    const name = "Interrupting Tom";
    const intent = "Cuts into every eligible bot turn.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "power-interrupting",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Cut into every eligible bot speaker's live turn.",
          observerCue: "The host interrupts every eligible guest turn.",
          effects: [{
            type: "interruption",
            frequency: "frequent",
            strength: "large",
            certainty: "always",
            targets: [{ kind: "all" }],
          }],
          ruleLabels: ["Always interrupts"],
        },
      }]),
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      mumblingPowers(),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Private speech boundaries",
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const floorOutcome = botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            0,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: true,
        });
        if (floorOutcome === "yield") break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Private speech boundaries ${attempt + 1}`,
        });
      }

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const publicCutoff = interrupted.message?.content ?? "";
      assert.equal(interrupted.message?.speakerRole, "guest");
      assert.match(publicCutoff, /—$/u);
      assert.doesNotMatch(
        publicCutoff,
        /private rational|blue archive key|workshop before sunrise/iu,
      );
      const reaction = interrupted.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)
              ?.messageId === interrupted.message?.id,
      );
      const plan = reaction?.payload.plan as Record<string, unknown> | undefined;
      assert.equal(plan?.interruptedSpeakerCue, undefined);
      assert.equal(plan?.interruptedSpeakerCueSpeechEffect, "speech_obfuscation");
      assert.ok(plan?.publicInterruptedSpeakerCue);
      assert.equal(
        (reaction?.payload.reclaim as Record<string, unknown> | undefined)
          ?.heardFragment,
        undefined,
      );
      assert.doesNotMatch(
        JSON.stringify(interrupted.episode),
        /private rational explanation|blue archive key/iu,
      );

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const observerPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      assert.ok(observerPrompt.includes(publicCutoff));
      assert.doesNotMatch(
        observerPrompt,
        /private rational explanation|blue archive key/iu,
      );
    } finally {
      db.close();
    }
  });

  it("routes a protected Signal reclaim once from only the audience-heard fragment", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const hiddenSuffix = "the hidden suffix must never reach the reclaim prompt";
    const longGuestLine =
      `The first practical consequence appears when the copied design reaches a real workshop, because materials, tolerances, judgment, repair history, and ${hiddenSuffix}.`;
    const reclaimLine =
      "No. I was saying that the workshop reveals which judgment the copy could never carry.";
    const provider = recordingProvider(
      [
        "A generic opening that will use the safe introduction fallback.",
        "The copied object loses tacit repair judgment at the workshop bench.",
        "Then let us test what the copy loses in practice.",
        longGuestLine,
        reclaimLine,
        "That distinction between artifact and practiced judgment is the real test.",
      ],
      captures,
    );
    const name = "Interrupting Tom";
    const intent =
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([
        {
          version: 1,
          id: "interrupting-tom",
          name,
          intent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(name, intent),
            selfCue: "Cut in quickly when an opening appears.",
            observerCue: "Tom frequently interrupts.",
            effects: [
              { type: "turn_gravity", direction: "more", strength: "large" },
              {
                type: "response_bond",
                direction: "toward",
                strength: "large",
                targets: [{ kind: "all" }],
              },
              {
                type: "action_bias",
                cue: "Cut in quickly.",
                frequency: "frequent",
              },
            ],
            ruleLabels: ["Interrupts"],
          },
        },
      ]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const firstGuestFloorOutcome = botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            0,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: true,
        });
        const intendedGuestFloorOutcome = botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            1,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: true,
        });
        if (
          firstGuestFloorOutcome === "yield" &&
          intendedGuestFloorOutcome === "reclaim"
        ) break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const heardFragment = interrupted.message?.content ?? "";
      assert.equal(interrupted.message?.speakerRole, "guest");
      assert.match(heardFragment, /—$/u);
      assert.doesNotMatch(heardFragment, new RegExp(hiddenSuffix, "u"));
      const crosstalk = interrupted.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)
              ?.messageId === interrupted.message?.id,
      );
      const crosstalkPlan = crosstalk?.payload.plan as
        | Record<string, unknown>
        | undefined;
      assert.equal(crosstalkPlan?.floorOutcome, "reclaim");
      assert.equal(crosstalkPlan?.interruptedSpeakerCue, undefined);
      assert.equal(
        (crosstalk?.payload.reclaim as Record<string, unknown> | undefined)
          ?.heardFragment,
        heardFragment,
      );
      assert.ok(botcastPendingCrosstalkReclaimV1(interrupted.episode.messages));

      const reclaimed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(reclaimed.message?.speakerRole, "guest");
      assert.equal(reclaimed.message?.content, reclaimLine);
      assert.equal(
        reclaimed.message?.crosstalkReclaim?.interruptedMessageId,
        interrupted.message?.id,
      );
      const reclaimListenerReaction = reclaimed.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)
              ?.messageId === reclaimed.message?.id,
      );
      const reclaimAttemptPlan = reclaimListenerReaction?.payload.plan as
        | Record<string, unknown>
        | undefined;
      assert.equal(reclaimAttemptPlan?.interjectionAttempt, true);
      assert.equal(reclaimAttemptPlan?.floorOutcome, "reclaim");
      assert.equal(reclaimAttemptPlan?.interruptedSpeakerCue, undefined);
      assert.equal(
        botcastPendingCrosstalkReclaimV1(reclaimed.episode.messages),
        null,
      );
      const reclaimPrompt = captures[4]!
        .map((message) => message.content)
        .join("\n");
      assert.match(reclaimPrompt, /Protected crosstalk reclaim turn/u);
      assert.ok(reclaimPrompt.includes(heardFragment));
      assert.doesNotMatch(reclaimPrompt, new RegExp(hiddenSuffix, "u"));
      assert.match(reclaimPrompt, /Never reconstruct, quote, or rely/u);

      const resumed = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(resumed.message?.speakerRole, "host");
    } finally {
      db.close();
    }
  });

  it("lets an interruptive host cut off an echo-bound guest mid-repeat", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const hostLine =
      "Before the copied design reaches the workshop, which part of the original maker's judgment has already disappeared from view?";
    const provider = recordingProvider(
      [
        "A generic opening that will use the safe introduction fallback.",
        hostLine,
        "The missing judgment is exactly where I wanted to interrupt you.",
      ],
      captures,
    );
    const hostPowerName = "Interrupting Tom";
    const hostPowerIntent =
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    const guestPowerName = "Echoes";
    const guestPowerIntent =
      "Can only repeat the latest words spoken directly to her, verbatim.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "power-interrupting",
        name: hostPowerName,
        intent: hostPowerIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(hostPowerName, hostPowerIntent),
          selfCue: "Cut in quickly when an opening appears.",
          observerCue: "Tom frequently interrupts.",
          effects: [
            { type: "turn_gravity", direction: "more", strength: "large" },
            { type: "response_bond", direction: "toward", strength: "large", targets: [{ kind: "all" }] },
            { type: "action_bias", cue: "Cut in quickly.", frequency: "frequent" },
          ],
          ruleLabels: ["Frequently interrupts"],
        },
      }]),
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      JSON.stringify([{
        version: 1,
        id: "power-copycat",
        name: guestPowerName,
        intent: guestPowerIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(guestPowerName, guestPowerIntent),
          selfCue: "Repeat the latest speech addressed to you verbatim. Say nothing else.",
          observerCue: "The guest can only echo the latest speech addressed to them.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Echoes addressed speech"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const plan = botcastPowerInterruptionPlanV1({
          episodeId: created.id,
          targetTurnOrdinal: 1,
          powerId: "power-interrupting",
          powerName: hostPowerName,
          frequency: "frequent",
          strength: "large",
          targetTurnsSinceLastInterruption: null,
        });
        const floorOutcome = botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            1,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: false,
          canHold: true,
        });
        if (plan && plan.targetProgress < 0.85 && floorOutcome === "yield") break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }
      const selectedPlan = botcastPowerInterruptionPlanV1({
        episodeId: created.id,
        targetTurnOrdinal: 1,
        powerId: "power-interrupting",
        powerName: hostPowerName,
        frequency: "frequent",
        strength: "large",
        targetTurnsSinceLastInterruption: null,
      });
      assert.ok(selectedPlan);
      assert.ok(selectedPlan.targetProgress < 0.85);
      assert.equal(
        botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "guest",
            1,
            "host-1",
          ].join(":"),
          speaker: {
            id: "guest-1",
            systemPrompt:
              "A guarded inventor who resists personal speculation and warns people before walking away.",
          },
          tension: { level: 0 },
          canReclaim: false,
          canHold: true,
        }),
        "yield",
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const host = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );

      assert.equal(host.message?.content, hostLine);
      assert.equal(guest.message?.speakerRole, "guest");
      const guestContent = guest.message?.content ?? "";
      assert.match(guestContent, /—$/u);
      assert.doesNotMatch(
        guestContent,
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      const guestCutoff = guestContent.slice(0, guestContent.indexOf("—") + 1);
      assert.equal(
        hostLine.startsWith(guestCutoff.slice(0, -1)),
        true,
      );
      assert.notEqual(guest.message?.content, hostLine);
      assert.equal(guest.message?.voicePerformanceText, null);
      const outcome = guest.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guest.message?.id,
      )?.payload.powerOutcome as Record<string, unknown>;
      assert.equal(outcome.effect, "interruption");
      assert.equal(outcome.powerId, "power-interrupting");
      assert.equal("unheardContent" in outcome, false);
      const echoCrosstalk = guest.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)?.messageId ===
            guest.message?.id,
      );
      assert.equal(
        (echoCrosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interjectionAttempt,
        true,
      );
      assert.equal(
        (echoCrosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interruptedSpeakerCuePlayback,
        "crosstalk",
      );
      assert.equal(
        (echoCrosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interruptedSpeakerCue,
        "...",
      );
      assert.doesNotMatch(
        guest.message?.content ?? "",
        /judgment has already disappeared from view/iu,
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUpPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);
      assert.match(followUpPrompt, /Do not invent, complete, paraphrase/u);
    } finally {
      db.close();
    }
  });

  it("lets a repeatedly interrupted echo-bound guest walk out before Auto closes", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const hostPowerName = "Interrupting";
    const hostPowerIntent =
      "Cuts into every eligible bot turn before the speaker can finish.";
    const guestPowerName = "Copycat";
    const guestPowerIntent =
      "Can only repeat the latest speech addressed to them, verbatim.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      JSON.stringify([{
        version: 1,
        id: "power-interrupting",
        name: hostPowerName,
        intent: hostPowerIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(hostPowerName, hostPowerIntent),
          selfCue: "Cut into every eligible bot speaker's live turn.",
          observerCue: "The host interrupts every eligible guest turn.",
          effects: [
            {
              type: "interruption",
              frequency: "frequent",
              strength: "large",
              certainty: "always",
              targets: [{ kind: "all" }],
            },
            { type: "turn_gravity", direction: "more", strength: "large" },
            {
              type: "response_bond",
              direction: "toward",
              strength: "large",
              targets: [{ kind: "all" }],
            },
          ],
          ruleLabels: ["Always interrupts eligible bot turns"],
        },
      }]),
    );
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      JSON.stringify([{
        version: 1,
        id: "power-copycat",
        name: guestPowerName,
        intent: guestPowerIntent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(guestPowerName, guestPowerIntent),
          selfCue:
            "Repeat the latest speech addressed to you verbatim. Say nothing else.",
          observerCue:
            "The guest can only copy the latest speech addressed to them.",
          effects: [{ type: "speech_copy", trigger: "direct_address" }],
          ruleLabels: ["Copies addressed speech"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const hostLines = Array.from({ length: 10 }, (_, index) =>
        index === 0
          ? `Welcome to ${show.name}. I'm Mara Vale, joined by Ivo Stone to examine whether repetition can become an original voice. Ivo, what would you say if nobody supplied the words?`
          : `Attempt ${index}: Ivo Stone, choose one thought that belongs only to you, explain why it matters, and finish the answer in your own words without borrowing this sentence.`,
      );
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Breaking the silence",
        producerBrief:
          "Keep trying until the guest says something original or leaves.",
      });
      const provider = recordingProvider(hostLines, captures);
      const opened = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      const insertIrritation = db.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES (?, 'user-1', ?,
                 (SELECT COALESCE(MAX(sequence), 0) + 1
                    FROM botcast_events
                   WHERE user_id = 'user-1' AND episode_id = ?),
                 'irritation', ?, ?)`,
      );
      const occurredAt = "2026-08-08T12:00:00.000Z";
      insertIrritation.run(
        "prior-irritation-high",
        created.id,
        created.id,
        JSON.stringify({
          transition: {
            v: 1,
            name: "directionalIrritation",
            transitionId: `prior-irritation-high:${created.id}`,
            reason: "meaningful_cutoff",
            subjectBotId: "guest-1",
            targetBotId: "host-1",
            before: 0,
            after: 0.95,
            delta: 0.95,
            tier: "high",
            occurredAt,
          },
        }),
        occurredAt,
      );

      assert.equal(
        botcastDirectionalIrritationEdgesFromEvents(
          getBotcastEpisode(db, "user-1", created.id).events,
        )[directionalIrritationEdgeKey("guest-1", "host-1")]?.intensity,
        0.95,
      );
      const held = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(held.message?.speakerRole, "guest");
      assert.equal(held.message?.content, opened.message?.content);
      assert.doesNotMatch(held.message?.content ?? "", /—$/u);
      assert.equal(held.episode.outcome, null);
      const heldUtterance = held.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === held.message?.id,
      );
      const heldPowerOutcome = heldUtterance?.payload.powerOutcome as
        | Record<string, unknown>
        | undefined;
      assert.equal(heldPowerOutcome?.effect, "interruption");
      assert.equal(heldPowerOutcome?.outcome, "held_floor");
      assert.equal(heldPowerOutcome?.floorOutcome, "hold");
      assert.equal(
        heldPowerOutcome?.heardWordCount,
        heldPowerOutcome?.originalWordCount,
      );
      assert.ok(
        Number(heldPowerOutcome?.attemptedHeardWordCount) <
          Number(heldPowerOutcome?.originalWordCount),
      );
      const heldReaction = held.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)
              ?.messageId === held.message?.id,
      );
      const heldReactionPlan = heldReaction?.payload.plan as
        | Record<string, unknown>
        | undefined;
      assert.equal(heldReactionPlan?.interjectionAttempt, true);
      assert.equal(heldReactionPlan?.floorOutcome, "hold");
      assert.equal(heldReactionPlan?.interruptedSpeakerCue, undefined);
      assert.equal(botcastPendingCrosstalkReclaimV1(held.episode.messages), null);
      assert.equal(
        botcastDirectionalIrritationEdgesFromEvents(held.episode.events)[
          directionalIrritationEdgeKey("guest-1", "host-1")
        ]?.intensity,
        1,
      );

      const hostContinues = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(hostContinues.message?.speakerRole, "host");
      const reviewed = (
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        )
      ).episode;

      assert.equal(reviewed.outcome, "guest_departed");
      assert.equal(reviewed.status, "live");
      assert.equal(reviewed.segment, "closing");
      assert.equal(reviewed.tensionStage, "calm");
      assert.equal(reviewed.warningCount, 0);
      const departure = reviewed.events.findLast(
        (event) => event.kind === "departure",
      );
      assert.equal(departure?.payload.speakerRole, "guest");
      assert.equal(departure?.payload.cause, "repeated_power_interruptions");
      assert.ok(
        reviewed.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.reason === "departure",
        ),
      );
      const irritation = botcastDirectionalIrritationEdgesFromEvents(
        reviewed.events,
      );
      assert.equal(
        irritation[directionalIrritationEdgeKey("guest-1", "host-1")]
          ?.intensity,
        1,
      );
      const departureMessage = reviewed.messages.at(-1);
      assert.equal(departureMessage?.speakerRole, "guest");
      assert.equal(departureMessage?.moodKey, "strained");
      assert.doesNotMatch(departureMessage?.content ?? "", /—$/u);
      const departureUtterance = reviewed.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === departureMessage?.id,
      );
      assert.equal(departureUtterance?.payload.provider, "deterministic");
      assert.equal(departureUtterance?.payload.model, "speech-copy-power");
      assert.equal(departureUtterance?.payload.powerOutcome, undefined);
      assert.equal(
        reviewed.events.some((event) => event.kind === "producer_cue"),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("lets an unconditional interruptive guest cut off every ordinary host turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const longHostLine =
      "The hidden cost appears when the copied design enters a working shop, because materials, tolerances, repairs, operator judgment, and accumulated practice all reshape what the artifact can safely become.";
    const warningStageHostLine =
      "The second hidden cost appears when a rushed team treats a copied artifact as proof that the missing judgment no longer matters.";
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to examine the cost of copied invention.",
        "The copy always arrives without the original maker's lived context.",
        longHostLine,
        "Exactly, and that missing context is where I needed to cut in.",
        warningStageHostLine,
        "No, that shortcut is exactly the mistake I was trying to stop.",
      ],
      captures,
    );
    const name = "Interrupting Tom";
    const intent =
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      JSON.stringify([{
        version: 1,
        id: "interrupting-tom-guest",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1(name, intent),
          selfCue: "Cut in quickly when an opening appears.",
          observerCue: "Tom frequently interrupts.",
          effects: [
            { type: "turn_gravity", direction: "more", strength: "large" },
            { type: "response_bond", direction: "toward", strength: "large", targets: [{ kind: "all" }] },
            { type: "action_bias", cue: "Cut in quickly.", frequency: "frequent" },
          ],
          ruleLabels: ["Interrupts"],
        },
      }]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The cost of copied invention",
      });
      let foundYieldingEpisode = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const plans = [0, 1, 2].map((targetTurnOrdinal) =>
          botcastPowerInterruptionPlanV1({
            episodeId: created.id,
            targetTurnOrdinal,
            powerId: "interrupting-tom-guest",
            powerName: name,
            frequency: "frequent",
            strength: "large",
            certainty: "always",
            targetTurnsSinceLastInterruption: null,
          }),
        );
        const floorOutcomes = [
          { ordinal: 0, tensionLevel: 0 as const },
          { ordinal: 1, tensionLevel: 1 as const },
          { ordinal: 2, tensionLevel: 2 as const },
        ].map(({ ordinal, tensionLevel }) =>
          botcastCrosstalkFloorOutcomeV1({
            seed: [
              "signal-power-crosstalk-floor-v1",
              created.id,
              "host",
              ordinal,
              "guest-1",
            ].join(":"),
            speaker: {
              id: "host-1",
              systemPrompt:
                "A forensic cultural critic who asks precise questions and dislikes canned answers.",
            },
            tension: { level: tensionLevel },
            canReclaim: true,
            // Earlier cutoffs raise directional irritation. Requiring this
            // seed to yield at the maximum bias makes every later assertion
            // stable for the actual episode state too.
            irritationTowardInterrupter: 1,
          }),
        );
        if (
          plans.every(
            (plan) => plan !== null && plan.targetProgress < 0.85,
          ) &&
          floorOutcomes.every((outcome) => outcome === "yield")
        ) {
          foundYieldingEpisode = true;
          break;
        }
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }
      assert.equal(foundYieldingEpisode, true);

      // Silence rolls are seeded per random episode id; pin them off except
      // where this test deliberately forces one.
      const pinnedGeneration = {
        ...generation(provider),
        signalSocialSilenceChanceOverride: 0,
      };
      const opening = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, pinnedGeneration,
      );
      assert.equal(opening.message?.speakerRole, "host");
      assert.match(opening.message?.content ?? "", /—$/u);
      assert.match(opening.message?.content ?? "", /Mara Vale in the Margins/u);
      assert.match(opening.message?.content ?? "", /I(?:'m| am) Mara Vale/u);
      assert.match(opening.message?.content ?? "", /Ivo Stone/u);
      assert.doesNotMatch(
        opening.message?.content ?? "",
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      const openingOutcome = opening.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === opening.message?.id,
      )?.payload.powerOutcome as Record<string, unknown>;
      assert.equal(openingOutcome.effect, "interruption");
      assert.equal(openingOutcome.interruptingBotId, "guest-1");
      assert.equal(openingOutcome.interruptedBotId, "host-1");
      assert.equal(openingOutcome.certainty, "always");
      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, pinnedGeneration,
      );
      const host = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "press_harder" } },
        pinnedGeneration,
      );

      assert.equal(host.message?.speakerRole, "host");
      const hostContent = host.message?.content ?? "";
      assert.match(hostContent, /—$/u);
      assert.doesNotMatch(
        hostContent,
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      const hostCutoff = hostContent.slice(0, hostContent.indexOf("—") + 1);
      assert.equal(
        longHostLine.startsWith(hostCutoff.slice(0, -1)),
        true,
      );
      const outcome = host.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === host.message?.id,
      )?.payload.powerOutcome as Record<string, unknown>;
      assert.equal(outcome.effect, "interruption");
      assert.equal(outcome.interruptingBotId, "guest-1");
      assert.equal(outcome.interruptedBotId, "host-1");
      assert.equal(outcome.certainty, "always");
      const hostCrosstalk = host.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)?.messageId ===
            host.message?.id,
      );
      assert.equal(
        (hostCrosstalk?.payload.plan as Record<string, unknown> | undefined)
          ?.interruptedSpeakerCuePlayback,
        "crosstalk",
      );

      const interrupterFollowUp = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        {
          ...generation(provider),
          signalSocialSilenceChanceOverride: 1,
        },
      );
      assert.equal(interrupterFollowUp.message?.speakerRole, "guest");
      assert.equal(interrupterFollowUp.message?.socialSilence, undefined);
      assert.equal(
        interrupterFollowUp.message?.content,
        "Exactly, and that missing context is where I needed to cut in.",
      );
      const followUpPrompt = captures[3]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);

      const warningHost = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "press_harder" } },
        pinnedGeneration,
      );
      assert.equal(warningHost.message?.speakerRole, "host");
      assert.equal(warningHost.episode.tensionStage, "warning");
      const warningHostContent = warningHost.message?.content ?? "";
      assert.match(warningHostContent, /—$/u);
      assert.doesNotMatch(
        warningHostContent,
        /Apparently we're moving on|I'll leave it|never mind, I guess|sure\. Go ahead/iu,
      );
      const warningHostCutoff = warningHostContent.slice(
        0,
        warningHostContent.indexOf("—") + 1,
      );
      assert.equal(
        warningStageHostLine.startsWith(warningHostCutoff.slice(0, -1)),
        true,
      );
      const warningOutcome = warningHost.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === warningHost.message?.id,
      )?.payload.powerOutcome as Record<string, unknown>;
      assert.equal(warningOutcome.effect, "interruption");
      assert.equal(warningOutcome.interruptingBotId, "guest-1");
      assert.equal(warningOutcome.interruptedBotId, "host-1");
      assert.equal(warningOutcome.certainty, "always");

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        pinnedGeneration,
      );
      const warningFollowUpPrompt = captures[5]!
        .map((message) => message.content)
        .join("\n");
      assert.match(warningFollowUpPrompt, /exact audience-heard prefix/u);
    } finally {
      db.close();
    }
  });

  it("keeps host bridges ephemeral while preserving queued and live interruptions", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider([
      "A quick opening.",
      "I need to clarify one point before we move on.",
      "A guest response after the host interruption.",
      "A host response after stopping the guest on mic.",
    ], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A clear interruption contract",
      });

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await assert.rejects(
        () =>
          advanceBotcastEpisode(
            db,
            "user-1",
            created.id,
            { cue: { kind: "ask_about", detail: "Clarify the premise." } },
            generation(provider),
          ),
        /Producer cues wait for the host's next turn/u,
      );

      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "ask_about", detail: "Clarify the premise." },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            bridgeLine: show.hostInterruptionLines[0]!,
          },
        },
        generation(provider),
      );
      assert.equal(interrupted.message?.speakerRole, "host");
      assert.equal(
        interrupted.episode.events.find(
          (event) => event.kind === "producer_cue",
        )?.payload.delivery,
        "interrupt_guest",
      );
      assert.equal(
        interrupted.episode.events.find(
          (event) => event.kind === "producer_cue",
        )?.payload.interruptionBridgeLine,
        show.hostInterruptionLines[0],
      );
      assert.equal(
        interrupted.episode.messages.some(
          (message) => message.content === show.hostInterruptionLines[0],
        ),
        false,
      );
      const interruptPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(interruptPrompt, /already cut in with the saved bridge/u);
      assert.doesNotMatch(interruptPrompt, /saved bridge ""/u);
      assert.match(interruptPrompt, /slightly awkward pivot is acceptable/u);
      const guestAfterInterruption = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guestAfterInterruption.message?.speakerRole, "guest");
      const spokenGuestPrefix = guestAfterInterruption.message!.content
        .split(/\s+/u)
        .slice(0, 3)
        .join(" ");
      const bridgeLine = show.hostInterruptionLines[1]!;
      const hostAfterGuestMicInterrupt = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "press_harder" },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: guestAfterInterruption.message!.id,
            spokenContent: spokenGuestPrefix,
            bridgeLine,
          },
        },
        generation(provider),
      );
      assert.equal(hostAfterGuestMicInterrupt.message?.speakerRole, "host");
      const interruptedGuestContent =
        hostAfterGuestMicInterrupt.episode.messages.find(
          (message) => message.id === guestAfterInterruption.message?.id,
        )?.content ?? "";
      assert.equal(interruptedGuestContent, `${spokenGuestPrefix}—`);
      const liveInterruptionEvent = hostAfterGuestMicInterrupt.episode.events.find(
        (event) =>
          event.kind === "producer_cue" &&
          event.payload.interruptedMessageId === guestAfterInterruption.message?.id,
      );
      assert.ok(liveInterruptionEvent?.payload.interruptedSpeakerCue);
      assert.doesNotMatch(
        interruptedGuestContent,
        /Apparently we're moving on|I'll leave it|never mind/iu,
      );
      assert.equal(
        hostAfterGuestMicInterrupt.episode.messages.some(
          (message) => message.content === bridgeLine,
        ),
        false,
      );
      const activeInterruptPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(activeInterruptPrompt, /already cut in with the saved bridge/u);
      assert.match(activeInterruptPrompt, /without repeating/u);
      assert.match(activeInterruptPrompt, /Ivo Stone:/u);
      assert.ok(activeInterruptPrompt.includes(interruptedGuestContent));
    } finally {
      db.close();
    }
  });

  it("omits the interrupted-speaker retort when a live guest delivered at least 85 percent", async () => {
    const db = fixture();
    const guestLine =
      "The practical answer is to preserve the exact sentence because its final qualification changes how the entire proposal should be judged.";
    const provider = recordingProvider(
      [
        "A quick opening with a clear guest introduction.",
        guestLine,
        "That qualification is the useful point to carry forward.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Late interruption etiquette",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      const words = guest.message!.content.split(/\s+/u);
      const latePrefix = words
        .slice(0, Math.ceil(words.length * 0.85))
        .join(" ");
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "press_harder" },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: guest.message!.id,
            spokenContent: latePrefix,
            bridgeLine: show.hostInterruptionLines[0]!,
          },
        },
        generation(provider),
      );
      const producerCue = interrupted.episode.events.find(
        (event) =>
          event.kind === "producer_cue" &&
          event.payload.interruptedMessageId === guest.message?.id,
      );
      assert.equal(producerCue?.payload.interruptedSpeakerCue, undefined);
      assert.equal(
        interrupted.episode.messages.find(
          (message) => message.id === guest.message?.id,
        )?.content,
        `${latePrefix}—`,
      );
    } finally {
      db.close();
    }
  });

  it("protects the host follow-up after producer interrupt_guest from guest Power re-cuts", async () => {
    const db = fixture();
    const longHostFollowUp =
      "No, you do not get to invent the ending from a half-heard fragment, because the missing clause was the only thing that made the confession land.";
    const longGuestLine =
      "I finish unfinished sentences myself, and that is the whole trade when someone leaves a free possession on the floor for me to seize.";
    const provider = recordingProvider(
      [
        "A quick opening with a clear guest introduction.",
        longGuestLine,
        longHostFollowUp,
      ],
      [],
    );
    const name = "Interrupting Tom";
    const intent =
      "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'guest-1'").run(
      JSON.stringify([
        {
          version: 1,
          id: "power-interrupting",
          name,
          intent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1(name, intent),
            selfCue: "Seize real conversational openings quickly.",
            observerCue: "Interrupting Tom may cut into live turns.",
            effects: [
              {
                type: "interruption",
                frequency: "frequent",
                strength: "large",
                targets: [{ kind: "all" }],
              },
              {
                type: "action_bias",
                cue: "Cut in quickly when a real interruption opportunity appears.",
                frequency: "frequent",
              },
              { type: "turn_gravity", direction: "more", strength: "large" },
              {
                type: "response_bond",
                direction: "toward",
                strength: "large",
                targets: [{ kind: "all" }],
              },
            ],
            ruleLabels: ["Frequently interrupts"],
          },
        },
      ]),
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Who owns a cut-off sentence",
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const plan = botcastPowerInterruptionPlanV1({
          episodeId: created.id,
          targetTurnOrdinal: 0,
          powerId: "power-interrupting",
          powerName: name,
          frequency: "frequent",
          strength: "large",
          certainty: "always",
          targetTurnsSinceLastInterruption: null,
        });
        const openingFloorOutcome = botcastCrosstalkFloorOutcomeV1({
          seed: [
            "signal-power-crosstalk-floor-v1",
            created.id,
            "host",
            0,
            "guest-1",
          ].join(":"),
          speaker: {
            id: "host-1",
            systemPrompt:
              "A forensic cultural critic who asks precise questions and dislikes canned answers.",
          },
          tension: { level: 0 },
          canReclaim: true,
        });
        if (plan && openingFloorOutcome === "yield") break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Who owns a cut-off sentence ${attempt + 1}`,
        });
      }

      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      const spokenGuestPrefix = guest.message!.content
        .split(/\s+/u)
        .slice(0, 6)
        .join(" ");
      const hostAfterCut = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "refocus" },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: guest.message!.id,
            spokenContent: spokenGuestPrefix,
            bridgeLine: show.hostInterruptionLines[0]!,
          },
        },
        generation(provider),
      );

      assert.equal(hostAfterCut.message?.speakerRole, "host");
      assert.equal(hostAfterCut.message?.content, longHostFollowUp);
      const hostUtterance = hostAfterCut.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === hostAfterCut.message?.id,
      );
      assert.equal(
        (hostUtterance?.payload.powerOutcome as { effect?: string } | undefined)
          ?.effect,
        undefined,
        "producer interrupt_guest must not be immediately undone by guest Power",
      );
      const protectedAttempt = hostAfterCut.episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as Record<string, unknown> | undefined)
            ?.messageId === hostAfterCut.message?.id,
      );
      const protectedAttemptPlan = protectedAttempt?.payload.plan as
        | Record<string, unknown>
        | undefined;
      assert.equal(protectedAttemptPlan?.interjectionAttempt, true);
      assert.equal(protectedAttemptPlan?.floorOutcome, "reclaim");
      assert.equal(protectedAttemptPlan?.interruptedSpeakerCue, undefined);
      assert.doesNotMatch(hostAfterCut.message?.content ?? "", /—$/u);
    } finally {
      db.close();
    }
  });

  it("keeps legacy queued interruptions compatible but requires live context", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "A quick opening.",
        "I need to clarify one point before we move on.",
        "A complete guest response.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A migration-safe interruption contract",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      const legacyQueued = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "ask_about", detail: "Clarify the premise." },
          cueDelivery: "interrupt_guest",
        },
        generation(provider),
      );
      assert.equal(
        legacyQueued.episode.messages.some(
          (message) => message.content === show.hostInterruptionLines[0],
        ),
        false,
      );
      assert.doesNotMatch(
        captures[1]!.map((message) => message.content).join("\n"),
        /saved bridge ""/u,
      );

      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      await assert.rejects(
        () =>
          advanceBotcastEpisode(
            db,
            "user-1",
            created.id,
            {
              cue: { kind: "press_harder" },
              cueDelivery: "interrupt_guest",
            },
            generation(provider),
          ),
        /live guest interruption requires the current message/iu,
      );
    } finally {
      db.close();
    }
  });

  it("removes a prepared guest line when the host interrupts before a word airs", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        "A quick opening.",
        "This entire prepared guest answer should stay unheard.",
        "Let us go directly to the queued subject.",
      ],
      [],
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Pre-speech interruption",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const preparedGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const guestMessageId = preparedGuest.message!.id;
      assert.equal(
        preparedGuest.episode.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.messageId === guestMessageId &&
            event.payload.shot === "right",
        ),
        true,
      );
      const interrupted = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "move_on" },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: guestMessageId,
            spokenContent: "",
            bridgeLine: show.hostInterruptionLines[0]!,
          },
        },
        generation(provider),
      );

      assert.equal(
        interrupted.episode.messages.some(
          (message) => message.id === guestMessageId,
        ),
        false,
      );
      assert.equal(
        interrupted.episode.events.some(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === guestMessageId,
        ),
        false,
      );
      assert.equal(
        interrupted.episode.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.messageId === guestMessageId,
        ),
        false,
        "pre-speech interrupt must drop the unheard guest camera cut",
      );
      assert.equal(
        interrupted.episode.messages.some(
          (message) => message.content === show.hostInterruptionLines[0],
        ),
        false,
      );
      assert.equal(interrupted.message?.speakerRole, "host");
      const hostMessageId = interrupted.message!.id;
      const hostUtteranceCamera = [...interrupted.episode.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.messageId === hostMessageId,
        );
      assert.equal(hostUtteranceCamera?.payload.shot, "left");
      assert.equal(
        [...interrupted.episode.events]
          .reverse()
          .find((event) => event.kind === "camera_suggestion")?.payload.shot,
        "left",
        "interrupt follow-up must leave Auto on the host, not the empty guest chair",
      );
    } finally {
      db.close();
    }
  });

  it("keeps an ephemeral interruption bridge from consuming a wrap-up exchange turn", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Ivo, what makes a safety threshold trustworthy?",
        "Independent verification makes a threshold trustworthy.",
        "Who should hold final authority over that verification?",
        "This prepared guest answer should be discarded before it airs.",
        "Before we close, who should hold that final authority?",
        "An independent safety lead should hold final authority.",
        "That independent authority is where we will leave it. Ivo Stone, thank you for joining me. Thank you for watching.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Authority over safety thresholds",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const preparedGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );

      const hostWrap = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: { kind: "wrap_up" },
          cueDelivery: "interrupt_guest",
          guestInterruption: {
            messageId: preparedGuest.message!.id,
            spokenContent: "",
            bridgeLine: show.hostInterruptionLines[0]!,
          },
        },
        generation(provider),
      );

      assert.equal(
        hostWrap.episode.messages.some(
          (message) => message.id === preparedGuest.message!.id,
        ),
        false,
      );
      assert.equal(hostWrap.message?.speakerRole, "host");
      assert.equal(hostWrap.episode.segment, "interview");
      assert.equal(hostWrap.episode.status, "live");
      assert.equal(
        hostWrap.episode.events.filter(
          (event) =>
            event.kind === "utterance" &&
            event.payload.interruptionBridge === true,
        ).length,
        0,
      );

      const guestFinal = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guestFinal.message?.speakerRole, "guest");
      assert.equal(guestFinal.episode.segment, "closing");
      assert.equal(guestFinal.episode.status, "live");

      const hostClose = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(hostClose.message?.speakerRole, "host");
      assert.equal(hostClose.episode.segment, "closing");
      assert.equal(hostClose.episode.status, "completed");
      assert.equal(hostClose.episode.outcome, "completed");
      assert.equal(
        hostClose.episode.messages.at(-2)?.content,
        "An independent safety lead should hold final authority.",
      );
      assert.equal(
        hostClose.episode.messages.at(-1)?.content,
        "That independent authority is where we will leave it. Ivo Stone, thank you for joining me. Thank you for watching.",
      );
      assert.match(
        captures[4]!.map((message) => message.content).join("\n"),
        /invite exactly one final response/u,
      );
      assert.doesNotMatch(
        captures[5]!.map((message) => message.content).join("\n"),
        /producer cue|wrap_up/iu,
      );
    } finally {
      db.close();
    }
  });

  it("lets an early live cue truncate and redirect the host's current line", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show, where I want to make a long opening point before we get anywhere near the real question.",
        "Actually—let me change course. What did the first failure cost you?",
        "It cost me the trust of the only person who warned me in time.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Changing course on air",
      });
      const opening = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      const spokenContent = opening.message!.content
        .split(/\s+/u)
        .slice(0, 6)
        .join(" ");
      const redirected = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {
          cue: {
            kind: "ask_about",
            detail: "Ask what the first failure cost.",
          },
          cueDelivery: "redirect_host",
          hostRedirect: {
            messageId: opening.message!.id,
            spokenContent,
          },
        },
        generation(provider),
      );

      assert.equal(redirected.episode.messages[0]?.content, spokenContent);
      assert.equal(redirected.message?.speakerRole, "host");
      assert.equal(redirected.episode.messages[1]?.speakerRole, "host");
      assert.equal(
        redirected.episode.events.find(
          (event) => event.kind === "producer_cue",
        )?.payload.delivery,
        "redirect_host",
      );
      assert.equal(
        redirected.episode.events.find(
          (event) => event.kind === "producer_cue",
        )?.payload.interruptedMessageId,
        opening.message?.id,
      );
      const redirectPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
      assert.match(redirectPrompt, /still on mic after breaking off/u);
      assert.match(redirectPrompt, /self-correction, hesitation, or pivot/u);
      assert.match(redirectPrompt, /Do not restart or repeat that fragment/u);
      assert.match(redirectPrompt, /Do not restart the show introduction/u);
      assert.ok(redirectPrompt.includes(`Mara Vale: ${spokenContent}`));

      const guest = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
    } finally {
      db.close();
    }
  });

  it("keeps private producer cues out of spoken lines and earns a departure", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const departureLines = Array.from(
      { length: 13 },
      (_, index) => `Departure episode line ${index + 1}.`,
    );
    departureLines[12] = "Should we keep interviewing?";
    const provider = recordingProvider(departureLines, captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Inventorship and public trust",
        producerBrief: "Find the point where confidence becomes secrecy.",
      });
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      // Build enough real exchange that the third cue proves a pending
      // departure still wins over any ordinary Auto ending decision.
      for (let neutralTurn = 0; neutralTurn < 4; neutralTurn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }
      const freeformPressureCues = [
        "Annoy the guest off the show.",
        "Get meaner and try to make him walk out.",
        "Ask whether he is a narcissist despite the boundary he just set.",
      ];
      for (const detail of freeformPressureCues) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          { cue: { kind: "ask_about", detail } },
          generation(provider),
        );
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }
      let episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.outcome, "guest_departed");
      const departure = episode.events.find(
        (event) => event.kind === "departure",
      );
      assert.equal(departure?.payload.emptyChair, true);
      assert.equal(departure?.payload.microphoneRemains, true);
      assert.equal(departure?.payload.mugRemains, true);
      assert.equal(episode.warningCount, 1);
      assert.deepEqual(
        episode.events
          .filter((event) => event.kind === "tension")
          .map((event) => event.payload.to),
        ["resistance", "warning", "departed"],
      );
      assert.equal(
        episode.messages.some((message) => /producer/iu.test(message.content)),
        false,
      );
      assert.ok(
        episode.messages.some((message) => message.moodKey === "guarded"),
      );
      assert.ok(
        episode.messages.some((message) => message.moodKey === "strained"),
      );
      assert.equal(
        episode.events
          .filter((event) => event.kind === "producer_cue")
          .every((event) => event.payload.audience === "host"),
        true,
      );
      const warningPrompt = captures[9]!
        .map((message) => message.content)
        .join("\n");
      assert.match(warningPrompt, /draw one firm personal boundary/u);
      assert.match(warningPrompt, /departure should surprise the host/u);
      assert.doesNotMatch(
        warningPrompt,
        /warn the host that you will leave if this line/iu,
      );
      const departureShot = episode.events.find(
        (event) =>
          event.kind === "camera_suggestion" &&
          event.payload.reason === "departure",
      );
      const departureMessage = episode.messages.at(-1)!;
      const departureMessageStartMs = botcastReplayTimeline(
        episode.messages,
        episode.events,
      ).messageStartMs.at(-1)!;
      const departureMessageDurationMs = Math.max(
        BOTCAST_DIRECTOR_MIN_SHOT_MS,
        departureMessage.content.split(/\s+/u).filter(Boolean).length * 310,
      );
      assert.equal(
        departureShot?.payload.atMs,
        departureMessageStartMs + departureMessageDurationMs,
      );
      const producerCueCountBeforeClosing = episode.events.filter(
        (event) => event.kind === "producer_cue",
      ).length;
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "press_harder" } },
        generation(provider),
      );
      await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "guest_departed");
      assert.equal(
        episode.events.filter((event) => event.kind === "producer_cue").length,
        producerCueCountBeforeClosing,
      );
      assert.match(
        episode.messages.at(-1)?.content ?? "",
        /left the studio|where are you going/iu,
      );
      const closingPrompt = captures[12]!
        .map((message) => message.content)
        .join("\n");
      assert.match(
        closingPrompt,
        botcastHostCallsAfterDepartingGuest(created.id)
          ? /visibly leaving[\s\S]*attempt to stop or call after/u
          : /Let the exit land without calling after them/u,
      );
      const shots = episode.events
        .filter((event) => event.kind === "camera_suggestion")
        .map((event) => `${event.payload.shot}:${event.payload.reason}`);
      assert.ok(shots.includes("wide:departure"));
      assert.ok(shots.includes("wide:empty_chair"));
      assert.ok(shots.some((shot) => shot.startsWith("left:")));
    } finally {
      db.close();
    }
  });

  it("records a mature guest's voluntary exit and allows only one host closing beat", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Tonight we are examining what invention costs the people around it.",
        "The first cost was trust, and I did not notice it until it was gone.",
        "What made that loss visible to you?",
        "A colleague stopped arguing with me, which was worse than anger.",
        "What would you tell them now?",
        "I would tell them that being right was never worth making them disappear.",
        "And what are you going to do with that realization?",
        "I should probably get going and have that conversation while I still can.",
        "Before you go, thank you for answering honestly. We will leave it there.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The human cost of invention",
      });
      for (let turn = 0; turn < 8; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }

      let episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "live");
      assert.equal(episode.outcome, "guest_departed");
      assert.equal(episode.segment, "closing");
      assert.equal(episode.tensionStage, "calm");
      assert.equal(episode.warningCount, 0);
      assert.equal(episode.messages.length, 8);
      assert.equal(episode.messages.at(-1)?.speakerRole, "guest");
      assert.equal(
        episode.events.find((event) => event.kind === "departure")?.payload
          .cause,
        "voluntary_exit",
      );
      assert.ok(
        episode.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.reason === "empty_chair",
        ),
      );

      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(closing.message?.speakerRole, "host");
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "guest_departed");
      assert.equal(episode.messages.length, 9);
      assert.equal(
        episode.events.filter((event) => event.kind === "departure").length,
        1,
      );
      assert.equal(
        episode.messages.slice(8).some((message) => message.speakerRole === "guest"),
        false,
      );
      const closingPrompt = captures[8]!
        .map((message) => message.content)
        .join("\n");
      assert.match(closingPrompt, /guest has ended the interview/iu);
      assert.doesNotMatch(closingPrompt, /guest has walked out/iu);
    } finally {
      db.close();
    }
  });

  it("preserves the departed outcome when the producer cuts after the walkout", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      Array.from({ length: 12 }, (_, index) => `Walkout line ${index + 1}.`),
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "An interview that earns a walkout",
      });
      for (let turn = 0; turn < 6; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }
      for (let pressure = 0; pressure < 3; pressure += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          { cue: { kind: "press_harder" } },
          generation(provider),
        );
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }

      const departed = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(departed.status, "live");
      assert.equal(departed.outcome, "guest_departed");
      assert.ok(departed.events.some((event) => event.kind === "departure"));

      const cut = forceEndBotcastEpisode(db, "user-1", created.id);
      assert.equal(cut.status, "completed");
      assert.equal(cut.outcome, "guest_departed");
      assert.equal(cut.messages.at(-1)?.speakerRole, "host");
      assert.equal(
        cut.events.findLast(
          (event) =>
            event.kind === "utterance" &&
            event.payload.emergencyFallback === true,
        )?.payload.model,
        "emergency-host-signoff",
      );
      assert.equal(
        cut.events.findLast((event) => event.kind === "episode_completed")
          ?.payload.outcome,
        "guest_departed",
      );
    } finally {
      db.close();
    }
  });

  it("completes a normal episode after the closing host line", async () => {
    const db = fixture();
    const userKey = Buffer.alloc(32, 44);
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      Array.from({ length: 19 }, (_, index) => `Episode line ${index + 1}.`),
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A complete interview",
      });
      let finalAdvance = null;
      for (let turn = 0; turn < 19; turn += 1) {
        finalAdvance = await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          { ...generation(provider), userKey },
        );
      }
      const episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(finalAdvance?.message?.speakerRole, "host");
      assert.equal(finalAdvance?.episode.status, "completed");
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "completed");
      assert.equal(episode.messages.length, 19);
      assert.equal(episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(episode.segments.at(-1)?.segment, "closing");
      assert.equal(
        episode.runtimeMs,
        botcastReplayTimeline(episode.messages, episode.events).durationMs,
      );
      assert.ok(
        episode.events.some((event) => event.kind === "episode_completed"),
      );
      const shots = episode.events
        .filter((event) => event.kind === "camera_suggestion")
        .map((event) => `${event.payload.shot}:${event.payload.reason}`);
      assert.equal(shots[0], "wide:opening");
      assert.ok(shots.includes("left:speaker"));
      assert.ok(shots.includes("right:speaker"));
      assert.ok(!shots.includes("wide:transition"));
      assert.equal(shots.at(-1), "wide:closing");
      assert.equal(
        (
          db.prepare(
            "SELECT COUNT(*) AS count FROM memories WHERE user_id = ? AND target_bot_id IS NOT NULL",
          ).get("user-1") as { count: number }
        ).count,
        2,
      );
      assert.ok(
        (
          db.prepare(
            "SELECT pair_history_persisted_at AS persistedAt FROM botcast_episodes WHERE id = ?",
          ).get(created.id) as { persistedAt: string | null }
        ).persistedAt,
      );
    } finally {
      db.close();
    }
  });

  it("protects an earned host sign-off from an interruption Power", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Tonight we are comparing consequence-driven comedy with reset-button comedy.",
        "Reset-button comedy gives the audience room to laugh without homework.",
        "What does that freedom let a show do that continuity cannot?",
        "It can chase the funniest idea without protecting a long-term arc.",
        "But what makes the episode more than a collection of interchangeable jokes?",
        "The characters and rhythm make the collection feel like its own night.",
        "Name one emotional consequence that survives the reset.",
        "The feeling survives for the audience even when the character state does not.",
        "So the viewer carries what the character forgets?",
        "Exactly, and that can be its own kind of continuity.",
        "Then the real disagreement is where the memory has to live.",
        "Yes. Your show stores it in the characters; mine stores it in the audience.",
        "Verdict delivered; that's the podcast, go watch something with consequences.",
        "This guest line must never be generated.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Where comedy keeps its consequences",
      });
      for (let turn = 0; turn < 12; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          {},
          generation(provider),
        );
      }
      const snapshotRow = db
        .prepare(
          `SELECT id, payload_json
             FROM botcast_events
            WHERE user_id = 'user-1' AND episode_id = ? AND kind = 'segment'
            ORDER BY sequence
            LIMIT 1`,
        )
        .get(created.id) as { id: string; payload_json: string };
      const snapshotPayload = JSON.parse(snapshotRow.payload_json) as {
        powerSnapshot?: { guestPowers?: unknown };
      };
      assert.ok(snapshotPayload.powerSnapshot);
      snapshotPayload.powerSnapshot.guestPowers = JSON.parse(
        interruptingPowers(),
      );
      db.prepare(
        "UPDATE botcast_events SET payload_json = ? WHERE id = ?",
      ).run(JSON.stringify(snapshotPayload), snapshotRow.id);
      const finalAdvance = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        {},
        generation(provider),
      );
      assert.match(
        captures[12]!.map((message) => message.content).join("\n"),
        /Interrupting Tom may cut into live turns/u,
      );

      const episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(finalAdvance?.message?.speakerRole, "host");
      assert.equal(finalAdvance?.episode.status, "completed");
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "completed");
      assert.equal(episode.messages.length, 13);
      assert.equal(
        episode.messages.at(-1)?.content,
        "Verdict delivered; that's the podcast, go watch something with consequences.",
      );
      assert.deepEqual(
        episode.messages.slice(12).map((message) => message.speakerRole),
        ["host"],
      );
      assert.equal(
        episode.events.some((event) => event.kind === "departure"),
        false,
      );
      const closingSegment = episode.events.find(
        (event) =>
          event.kind === "segment" && event.payload.segment === "closing",
      );
      const closingUtterance = episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === episode.messages.at(-1)?.id,
      );
      assert.ok(closingSegment);
      assert.equal(closingUtterance?.payload.segment, "closing");
      assert.equal(closingUtterance?.payload.powerOutcome, undefined);
      const closingReaction = episode.events.find(
        (event) =>
          event.kind === "listener_reaction" &&
          (event.payload.plan as { messageId?: unknown } | undefined)
            ?.messageId === episode.messages.at(-1)?.id,
      );
      assert.notEqual(
        (closingReaction?.payload.plan as
          | { interjectionAttempt?: unknown }
          | undefined)?.interjectionAttempt,
        true,
      );
      assert.ok(
        (closingSegment?.sequence ?? Number.MAX_SAFE_INTEGER) <
          (closingUtterance?.sequence ?? -1),
      );
      assert.equal(captures.length, 13);
      assert.ok(
        episode.events.some(
          (event) =>
            event.kind === "camera_suggestion" &&
            event.payload.shot === "wide" &&
            event.payload.reason === "closing",
        ),
      );
    } finally {
      db.close();
    }
  });

  it("round-trips only canonical authored copy for a muted Signal host", () => {
    const source = fixture();
    const target = fixture();
    try {
      source
        .prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'")
        .run(mutedPowers());
      const show = createBotcastShow(source, "user-1", {
        hostBotId: "host-1",
      });
      const key = Buffer.alloc(32, 11);
      const snapshot = exportUserSnapshot(source, "user-1", key);
      const archivedVisuals = JSON.parse(
        snapshot.botcast?.shows[0]?.atmosphereJson ?? "{}",
      ) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
        hostRecoveryQuestions?: unknown;
      };

      assert.deepEqual(archivedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(archivedVisuals.hostInterruptionLines, ["..."]);
      assert.deepEqual(archivedVisuals.hostRecoveryQuestions, ["..."]);

      importUserSnapshot(target, "user-1", snapshot, key);
      const restored = getBotcastShow(target, "user-1", show.id);
      assert.deepEqual(restored.dashboardBlurbs, ["..."]);
      assert.deepEqual(restored.hostInterruptionLines, ["..."]);
      assert.deepEqual(restored.hostRecoveryQuestions, ["..."]);
    } finally {
      source.close();
      target.close();
    }
  });

  it("round-trips shows, episodes, transcript, and director events through account backup", async () => {
    const source = fixture();
    const target = fixture();
    const legacyTarget = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit.",
      ],
      captures,
    );
    try {
      insertSignalReviewPersona(
        source,
        "archive-critic",
        "Nia Cross",
        "2026-01-02T00:00:00.000Z",
      );
      const createdShow = createBotcastShow(source, "user-1", {
        hostBotId: "host-1",
      });
      const show = updateBotcastShow(source, "user-1", createdShow.id, {
        dashboardBlurbs: [
          "Archive note: the easy answer did not survive the edit.",
        ],
        hostRecoveryQuestions:
          generatedHostRecoveryQuestions("Archive the evidence"),
        dayAtmosphereImageUrl: "/images/archive-day.png",
        dayAtmosphereImageId: "archive-day",
        nightAtmosphereImageUrl: "/images/archive-night.png",
        nightAtmosphereImageId: "archive-night",
      });
      storeBotcastShowIntroAudio(source, "user-1", show.id, {
        model: "music_v2",
        prompt: "Original archived Signal ident",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([9, 8, 7, 6]),
        durationMs: 8_000,
        outdent: {
          prompt: "Original archived Signal outdent",
          contentType: "audio/mpeg",
          audioBytes: Buffer.from([6, 7, 8, 9]),
          durationMs: 4_000,
        },
      });
      storeBotcastShowAtmosphereAudio(source, "user-1", show.id, {
        model: "eleven_text_to_sound_v2",
        prompt: "Archived studio atmosphere",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([6, 5, 4, 3]),
        durationMs: 30_000,
      });
      const episode = createBotcastEpisode(source, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What survives an edit",
        preferredProvider: "openai",
        modelOverride: "gpt-archive",
        responseMode: "auto",
        durationMinutes: 12,
      });
      source.prepare(
        `UPDATE botcast_shows
            SET host_chat_ignoring_until_guest_show = 1
          WHERE id = ? AND user_id = 'user-1'`,
      ).run(show.id);
      await advanceBotcastEpisode(
        source,
        "user-1",
        episode.id,
        {},
        {
          ...generation(provider),
          autoFallbackChain: {
            v: 1,
            fallbacks: [
              { provider: "local", model: "qwen-signal-fallback" },
              { provider: "anthropic", model: "claude-signal-fallback" },
            ],
          },
        },
      );
      const archivedIdentityMirror = createBotIdentityMirrorStateV1({
        surface: "signal",
        holderBotId: "guest-1",
        holderBotName: "Ivo Stone",
        targetBotId: "host-1",
        targetBotName: "Mara Vale",
        targetPersonaPrompt: "A careful archival host.",
        targetFace: { faceEyeCharacter: "◉" },
        targetVoice: { version: 1, enabled: true, preset: "warm" },
        sourceMessageId: "archive-address",
        occurredAt: "2099-01-02T00:00:08.000Z",
      });
      source.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES ('archive-identity-mirror', 'user-1', ?,
                 (SELECT COALESCE(MAX(sequence), 0) + 1 FROM botcast_events WHERE episode_id = ?),
                 'power_effect', ?, '2099-01-02T00:00:08.000Z')`,
      ).run(
        episode.id,
        episode.id,
        JSON.stringify({
          v: 1,
          effect: "identity_mirror",
          state: archivedIdentityMirror,
        }),
      );
      source.prepare(
        `INSERT INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
         VALUES ('archive-stage-action', 'user-1', ?, 'guest', 'guest-1',
                 '*leans back, slight smile* ...', '2099-01-02T00:00:09.000Z')`,
      ).run(episode.id);
      source
        .prepare(
          `UPDATE botcast_episodes
            SET status = 'completed', outcome = 'completed',
                completed_at = '2026-01-02T00:01:00.000Z',
                runtime_ms = 60000,
                persona_reviewer_bot_id = 'archive-critic',
                persona_reviewer_name = 'Nia Cross', persona_rating = 2.9,
                persona_comment = 'The edit found the tension before the host did.',
                persona_reviewed_at = '2026-01-03T00:00:00.000Z'
          WHERE id = ?`,
        )
        .run(episode.id);
      const key = Buffer.alloc(32, 7);
      const snapshot = exportUserSnapshot(source, "user-1", key);
      assert.equal(snapshot.botcast?.shows.length, 1);
      assert.equal(
        snapshot.botcast?.shows[0]?.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.equal(
        snapshot.botcast?.shows[0]?.hostChatIgnoringUntilGuestShow,
        true,
      );
      assert.ok((snapshot.botcast?.events.length ?? 0) >= 4);
      assert.equal(snapshot.botcast?.episodes[0]?.durationMinutes, 12);
      assert.equal(snapshot.botcast?.episodes[0]?.provider, "openai");
      assert.equal(snapshot.botcast?.episodes[0]?.model, "gpt-archive");
      assert.equal(snapshot.botcast?.episodes[0]?.responseMode, "online");
      assert.equal(snapshot.botcast?.episodes[0]?.personaReview?.rating, 2.9);
      assert.equal(snapshot.botcast?.shows[0]?.introAudio?.model, "music_v2");
      assert.equal(
        snapshot.botcast?.shows[0]?.atmosphereAudio?.model,
        "eleven_text_to_sound_v2",
      );
      assert.equal(
        snapshot.botcast?.messages[0]?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit. [sighs]",
      );
      assert.equal(
        snapshot.botcast?.messages[1]?.stageActionText,
        "leans back, slight smile",
      );
      const archivedSnapshotEvent = snapshot.botcast?.events.find(
        (event) => event.id === "archive-identity-mirror",
      );
      assert.ok(archivedSnapshotEvent);
      assert.deepEqual(
        JSON.parse(archivedSnapshotEvent.payloadJson),
        {
          v: 1,
          effect: "identity_mirror",
          state: archivedIdentityMirror,
        },
      );
      importUserSnapshot(target, "user-1", snapshot, key);
      const restoredShow = getBotcastShow(target, "user-1", show.id);
      assert.equal(restoredShow.dayAtmosphere.imageId, "archive-day");
      assert.equal(restoredShow.nightAtmosphere.imageId, "archive-night");
      assert.equal(restoredShow.studioIdentity, show.studioIdentity);
      assert.deepEqual(restoredShow.musicIdentity, show.musicIdentity);
      assert.deepEqual(restoredShow.dashboardBlurbs, show.dashboardBlurbs);
      assert.deepEqual(
        restoredShow.hostRecoveryQuestions,
        show.hostRecoveryQuestions,
      );
      assert.equal(restoredShow.introAudio.source, "elevenlabs");
      assert.match(
        restoredShow.introAudio.outdentAudioUrl ?? "",
        /\/outdent-audio$/u,
      );
      assert.equal(restoredShow.atmosphereAudio.source, "elevenlabs");
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(target, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [9, 8, 7, 6],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowOutdentAudio(target, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [6, 7, 8, 9],
      );
      assert.deepEqual(
        [
          ...(readBotcastShowAtmosphereAudio(target, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [6, 5, 4, 3],
      );
      assert.equal(
        restoredShow.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.equal(
        (
          target
            .prepare(
              `SELECT host_chat_ignoring_until_guest_show AS ignoring
                 FROM botcast_shows WHERE id = ?`,
            )
            .get(show.id) as { ignoring: number }
        ).ignoring,
        1,
      );
      const restored = getBotcastEpisode(target, "user-1", episode.id);
      assert.equal(restored.topic, "What survives an edit");
      assert.equal(restored.provider, "openai");
      assert.equal(restored.model, "gpt-archive");
      assert.equal(restored.responseMode, "online");
      assert.equal(restored.durationMinutes, 12);
      assert.deepEqual(restored.personaReview, {
        reviewerBotId: "archive-critic",
        reviewerName: "Nia Cross",
        rating: 2.9,
        comment: "The edit found the tension before the host did.",
        createdAt: "2026-01-03T00:00:00.000Z",
      });
      assert.equal(
        restored.messages[0]?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit.",
      );
      assert.equal(
        restored.messages[0]?.voicePerformanceText,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit. [sighs]",
      );
      assert.equal(restored.messages[1]?.content, "...");
      assert.equal(restored.messages[1]?.stageActionText, "leans back, slight smile");
      assert.ok(
        restored.events.some((event) => event.kind === "camera_suggestion"),
      );
      assert.deepEqual(
        restored.events.find(
          (event) => event.id === "archive-identity-mirror",
        )?.payload.state,
        archivedIdentityMirror,
      );
      assert.deepEqual(
        restored.events.find(
          (event) => event.kind === "segment" && event.payload.ordinal === 0,
        )?.payload.powerSnapshot,
        episode.events.find(
          (event) => event.kind === "segment" && event.payload.ordinal === 0,
        )?.payload.powerSnapshot,
      );

      const legacySnapshot = structuredClone(snapshot);
      const legacyShow = legacySnapshot.botcast?.shows[0];
      if (legacyShow) delete legacyShow.fallbackStudioAccentVariant;
      if (legacyShow) delete legacyShow.hostChatIgnoringUntilGuestShow;
      const legacyEpisode = legacySnapshot.botcast?.episodes[0];
      if (legacyEpisode) delete legacyEpisode.durationMinutes;
      if (legacyEpisode) delete legacyEpisode.responseMode;
      importUserSnapshot(legacyTarget, "user-1", legacySnapshot, key);
      assert.equal(
        getBotcastShow(legacyTarget, "user-1", show.id)
          .fallbackStudioAccentVariant,
        botcastFallbackStudioAccentVariantForSeed(show.id),
      );
      assert.equal(
        (
          legacyTarget
            .prepare(
              `SELECT host_chat_ignoring_until_guest_show AS ignoring
                 FROM botcast_shows WHERE id = ?`,
            )
            .get(show.id) as { ignoring: number }
        ).ignoring,
        0,
      );
      assert.equal(
        getBotcastEpisode(legacyTarget, "user-1", episode.id).responseMode,
        "online",
      );
      assert.equal(
        getBotcastEpisode(legacyTarget, "user-1", episode.id).durationMinutes,
        null,
      );
    } finally {
      source.close();
      target.close();
      legacyTarget.close();
    }
  });
});

describe("Signal directional interruption irritation", () => {
  it("raises only interrupted→interrupter on a meaningful cutoff", () => {
    const planned = botcastPlanDirectionalIrritationForMeaningfulCutoffV1({
      edges: {},
      appliedTransitionIds: new Set(),
      episodeId: "episode-irritation-1",
      interruptedBotId: "host-1",
      interrupterBotId: "guest-1",
      messageId: "msg-cutoff-1",
      heardRatio: 0.4,
      floorOutcome: "yield",
      occurredAt: "2026-07-24T21:00:00.000Z",
    });
    assert.equal(planned.transitions.length, 1);
    assert.equal(planned.transitions[0]?.reason, "meaningful_cutoff");
    assert.equal(planned.transitions[0]?.subjectBotId, "host-1");
    assert.equal(planned.transitions[0]?.targetBotId, "guest-1");
    assert.equal(
      readDirectionalIrritationIntensity({
        edges: planned.edges,
        subjectBotId: "guest-1",
        targetBotId: "host-1",
      }),
      0,
    );
    const events = [
      {
        kind: "irritation" as const,
        payload: { transition: planned.transitions[0] },
      },
    ];
    const folded = botcastDirectionalIrritationEdgesFromEvents(events);
    assert.equal(
      folded[directionalIrritationEdgeKey("host-1", "guest-1")]?.intensity,
      planned.transitions[0]?.after,
    );
    assert.equal(
      folded[directionalIrritationEdgeKey("guest-1", "host-1")],
      undefined,
    );
  });

  it("applies a smaller rebuff when reclaim rejects the interrupter", () => {
    const planned = botcastPlanDirectionalIrritationForMeaningfulCutoffV1({
      edges: {},
      appliedTransitionIds: new Set(),
      episodeId: "episode-irritation-2",
      interruptedBotId: "host-1",
      interrupterBotId: "guest-1",
      messageId: "msg-reclaim-1",
      heardRatio: 0.45,
      floorOutcome: "reclaim",
      occurredAt: "2026-07-24T21:00:00.000Z",
    });
    assert.equal(planned.transitions.length, 2);
    assert.equal(planned.transitions[0]?.reason, "meaningful_cutoff");
    assert.equal(planned.transitions[1]?.reason, "rebuff");
    assert.equal(planned.transitions[1]?.subjectBotId, "guest-1");
    assert.equal(planned.transitions[1]?.targetBotId, "host-1");
    assert.equal(
      planned.transitions[1]?.delta,
      DIRECTIONAL_IRRITATION_REBUFF_DELTA,
    );
    assert.ok(
      (planned.transitions[1]?.after ?? 0) <
        (planned.transitions[0]?.after ?? 0),
    );
  });

  it("does not raise irritation for a non-meaningful late overlap", () => {
    assert.equal(
      crosstalkInterruptionIsMeaningfulV1({
        originalWordCount: 20,
        heardWordCount: 19,
      }),
      false,
    );
    // Late overlaps must not enter the meaningful cutoff planner. Simulate the
    // advance gate: only meaningful cutoffs call the planner.
    const lateOverlapIsMeaningful = crosstalkInterruptionIsMeaningfulV1({
      originalWordCount: 12,
      heardWordCount: 11,
    });
    assert.equal(lateOverlapIsMeaningful, false);
    const events: Array<{ kind: "irritation"; payload: Record<string, unknown> }> =
      [];
    if (lateOverlapIsMeaningful) {
      const planned = botcastPlanDirectionalIrritationForMeaningfulCutoffV1({
        edges: {},
        appliedTransitionIds: new Set(),
        episodeId: "episode-irritation-3",
        interruptedBotId: "host-1",
        interrupterBotId: "guest-1",
        messageId: "msg-late-1",
        heardRatio: 11 / 12,
        floorOutcome: "yield",
        occurredAt: "2026-07-24T21:00:00.000Z",
      });
      for (const transition of planned.transitions) {
        events.push({ kind: "irritation", payload: { transition } });
      }
    }
    assert.deepEqual(botcastDirectionalIrritationEdgesFromEvents(events), {});
  });

  it("biases reclaim chance upward under high directed irritation", () => {
    const speaker = {
      id: "host-1",
      systemPrompt: "A calm host who usually yields the floor.",
    };
    const tension = { level: 0 as const };
    const seed = "signal-irritation-bias-floor-v1";
    const calmOutcomes = Array.from({ length: 80 }, (_, index) =>
      botcastCrosstalkFloorOutcomeV1({
        seed: `${seed}:calm:${index}`,
        speaker,
        tension,
        canReclaim: true,
        irritationTowardInterrupter: 0,
      }),
    );
    const irritatedOutcomes = Array.from({ length: 80 }, (_, index) =>
      botcastCrosstalkFloorOutcomeV1({
        seed: `${seed}:calm:${index}`,
        speaker,
        tension,
        canReclaim: true,
        irritationTowardInterrupter: 1,
      }),
    );
    const calmReclaims = calmOutcomes.filter(
      (outcome) => outcome === "reclaim",
    ).length;
    const irritatedReclaims = irritatedOutcomes.filter(
      (outcome) => outcome === "reclaim",
    ).length;
    assert.ok(
      irritatedReclaims > calmReclaims,
      `expected high irritation to reclaim more often (${irritatedReclaims} > ${calmReclaims})`,
    );
    // Ceiling stays below 1 — even max irritation cannot force always-reclaim.
    assert.ok(irritatedReclaims < 80);
    assert.equal(DIRECTIONAL_IRRITATION_RECLAIM_CEILING, 0.85);
  });
});
