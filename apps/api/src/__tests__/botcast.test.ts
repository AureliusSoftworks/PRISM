import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  BOTCAST_PERSONA_REVIEW_VISIBILITY_DELAY_MS,
  BOTCAST_PRODUCER_GUEST_ID,
  BOTCAST_PRODUCER_GUEST_NAME,
  applyBotPowerMumbledResponseV1,
  botPowerSourceHashV1,
  botPowerIntermittentMuteTurnIsIgnoredV1,
  botcastAutoCameraLeadInMs,
  botcastProducerGuestThinkingDiscountMs,
  botcastFallbackStudioAccentVariantForSeed,
  botcastReplayTimeline,
  createBotIdentityMirrorStateV1,
  serializeBotAudioVoiceProfileV1,
} from "@localai/shared";

import {
  BOTCAST_HOST_CALL_AFTER_DEPARTURE_PERCENT,
  SignalOnlineTurnError,
  advanceBotcastEpisode,
  buildBotcastAudienceReviewArtifactV1,
  buildBotcastSpeakerPrompt,
  botcastIdentityMirrorCanTriggerV1,
  botcastIdentityMirrorStatesV1,
  botcastGuestClaimsSilentHostSpoke,
  botcastHostClaimsSilentGuestAnswered,
  botcastHostCallsAfterDepartingGuest,
  botcastPowerInterruptionPlanV1,
  botcastPowerInterruptedContentV1,
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
  generateBotcastProducerGuestBooking,
  generateBotcastShowDashboardBlurbs,
  generateBotcastShowIdentity,
  generateBotcastShowName,
  generateBotcastShowPremise,
  getBotcastEpisode,
  getBotcastShow,
  listBotcastShows,
  listBotcastEpisodes,
  nextBotcastFallbackStudioAccentVariant,
  parseBotcastPersonaReviewResponse,
  projectBotcastEpisodeForAudienceV1,
  projectBotcastEpisodeForObserverV2,
  readBotcastShowAtmosphereAudio,
  readBotcastShowIntroAudio,
  readBotcastShowOutdentAudio,
  recordBotcastSoundboardCue,
  resolveBotcastProducerGuestName,
  runSignalOnlineTurn,
  setBotcastEpisodeCameraMode,
  setBotcastModelWarmupHold,
  signalOnlineTurnHttpStatus,
  selectBotcastReviewPersona,
  signalVisualOnlyListenerReaction,
  storeBotcastShowAtmosphereAudio,
  storeBotcastShowIntroAudio,
  updateBotcastShow,
} from "../botcast.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { initializeDatabase } from "../db.ts";
import { restoreMemory } from "../memory.ts";
import {
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "../providers.ts";

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
  };
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
        { type: "intermittent_mute", chance: "half", moodPenalty: "small" },
      ],
      ruleLabels: ["Attenuated voice", "Half of turns unheard"],
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
        return providerName === "local"
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
              { provider: "openai", model: "gpt-5.6-terra" },
            ],
          },
        },
      );

      assert.deepEqual(attempts, [
        { provider: "local", model: "gemma3:latest" },
        { provider: "openai", model: "gpt-5.6-terra" },
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
    );
    const bookingFailureIndex = serverSource.indexOf(
      "Signal could not reach an available interview model.",
    );
    const episodeCreationIndex = serverSource.indexOf(
      "const episode = createBotcastEpisode",
      bookingFailureIndex,
    );
    assert.ok(bookingFailureIndex >= 0);
    assert.ok(episodeCreationIndex > bookingFailureIndex);
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

  it("rejects a Producer-guest booking when the host cannot originate questions", () => {
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
      assert.throws(
        () => createBotcastEpisode(db, "user-1", show.id, {
          guestKind: "producer",
          guestName: BOTCAST_PRODUCER_GUEST_NAME,
          guestContext: "I want to discuss the consequences of automation.",
          topic: "Automation and authorship",
        }),
        /cannot originate the questions required for a Producer-guest episode/u,
      );
    } finally {
      db.close();
    }
  });

  it("lets an echo-bound host originate one opening before both cast members echo", async () => {
    const db = fixture();
    const originalOpening =
      "This is Mara Vale in the Margins. I'm Mara Vale, and my guest is Ivo Stone. Ivo, let us begin with the impossible echo loop.";
    const provider = recordingProvider([
      originalOpening,
      "This generated guest line is replaced by the exact echo.",
      "This generated host closing is replaced by the exact echo.",
    ], []);
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
      assert.match(
        systemPrompt,
        /Current Library guest candidates:\n\[\{"id":"guest-1","name":"Ivo Stone"\}\]/u,
      );
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

  it("does not let a muted Signal host speak off-air", async () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
        mutedPowers(),
      );
      const captures: ProviderMessage[][] = [];
      await assert.rejects(
        chatWithBotcastShowHost(
          db,
          "user-1",
          show.id,
          { content: "Can we talk?" },
          generation(recordingProvider(["No."], captures)),
        ),
        /cannot speak while their mute Power is active/u,
      );
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

      const remixed = updateBotcastShow(db, "user-1", show.id, {
        atmosphereMix: {
          background: 0.12,
          grain: 0.008,
          foley: 1.4,
          filmGrain: 0.65,
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

  it("persists show-scoped studio alignment and clamps props inside the frame", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.deepEqual(show.studioLayout, BOTCAST_DEFAULT_STUDIO_LAYOUT);

      const updated = updateBotcastShow(db, "user-1", show.id, {
        studioLayout: {
          hostBot: { x: -20, y: 140 },
          guestBot: { x: 68.25, y: 61.5 },
          hostCup: { x: 34, y: 79 },
          guestCup: { x: 70.129, y: 82.876 },
        },
      });
      assert.deepEqual(updated.studioLayout, {
        hostBot: { x: 10, y: 82 },
        guestBot: { x: 68.25, y: 61.5 },
        hostCup: { x: 34, y: 79 },
        guestCup: { x: 70.13, y: 82.88 },
      });
      assert.deepEqual(
        getBotcastShow(db, "user-1", show.id).studioLayout,
        updated.studioLayout,
      );
      assert.deepEqual(
        updateBotcastShow(db, "user-1", show.id, { name: "Aligned Signal" })
          .studioLayout,
        updated.studioLayout,
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

  it("backfills legacy host interruption lines and preserves normalized custom lines", () => {
    const db = fixture();
    try {
      const created = createBotcastShow(db, "user-1", {
        hostBotId: "host-1",
      });
      assert.equal(created.hostInterruptionLines.length, 6);

      const stored = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const legacyAtmosphere = JSON.parse(stored.atmosphere_json) as Record<
        string,
        unknown
      >;
      delete legacyAtmosphere.hostInterruptionLines;
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

  it("keeps Signal turns short and uses minimal reasoning without a picker", async () => {
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

      assert.equal(options[0]?.reasoningEffort, "minimal");
      assert.equal(options[0]?.maxTokens, 160);
      assert.equal(options[1]?.reasoningEffort, "minimal");
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
      const storedShow = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(show.id) as { atmosphere_json: string };
      const storedVisuals = JSON.parse(storedShow.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
      };
      assert.deepEqual(storedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(storedVisuals.hostInterruptionLines, ["..."]);
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

      assert.equal(advanced.message?.content, "...");
      assert.equal(advanced.message?.stageActionText, null);
      assert.equal(advanced.message?.voicePerformanceText, null);
      assert.equal(captures.length, 0);
      assert.match(
        advanced.episode.events.find(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === advanced.message?.id,
        )?.payload.provider as string,
        /deterministic/u,
      );
      assert.equal(
        advanced.episode.events.find(
          (event) =>
            event.kind === "utterance" &&
            event.payload.messageId === advanced.message?.id,
        )?.payload.model,
        "mute-power",
      );
      await assert.rejects(
        () =>
          advanceBotcastEpisode(
            db,
            "user-1",
            episode.id,
            {
              cue: { kind: "move_on" },
              cueDelivery: "interrupt_guest",
            },
            generation(provider),
          ),
        /muted Signal host cannot interrupt aloud/u,
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

  it("persists Quiet's ignored Signal turn, mood hit, and absent listener reaction", async () => {
    const db = fixture();
    const powers = quietPowers();
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(powers);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      let episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Being heard",
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (botPowerIntermittentMuteTurnIsIgnoredV1(
          powers,
          `${episode.id}:host-1:0`,
        )) break;
        forceEndBotcastEpisode(db, "user-1", episode.id);
        deleteBotcastEpisode(db, "user-1", episode.id);
        episode = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `Being heard ${attempt + 1}`,
        });
      }
      assert.equal(
        botPowerIntermittentMuteTurnIsIgnoredV1(
          powers,
          `${episode.id}:host-1:0`,
        ),
        true,
      );
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(recordingProvider(["Nobody can miss this."], [])),
      );
      assert.equal(advanced.message?.content, "...");
      assert.equal(advanced.message?.moodKey, "guarded");
      const utterance = advanced.episode.events.find(
        (event) => event.kind === "utterance" && event.payload.messageId === advanced.message?.id,
      );
      assert.deepEqual(utterance?.payload.powerOutcome, {
        effect: "intermittent_mute",
        outcome: "ignored",
        botId: "host-1",
        moodPenalty: "small",
      });
      assert.equal(
        advanced.episode.events.some(
          (event) => event.kind === "listener_reaction" &&
            (event.payload.plan as { messageId?: string } | undefined)?.messageId === advanced.message?.id,
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("persists Mumbling Jim's gibberish as Signal's only on-air and replay context", async () => {
    const db = fixture();
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'host-1'").run(
      mumblingPowers(),
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
      const expectedPublic = applyBotPowerMumbledResponseV1(intended);
      assert.equal(advanced.message?.content, expectedPublic);
      assert.doesNotMatch(advanced.message?.content ?? "", /rational|explanation|missing map/iu);
      const utterance = advanced.episode.events.find(
        (event) => event.kind === "utterance" && event.payload.messageId === advanced.message?.id,
      );
      assert.equal(utterance?.payload.publicSpeechEffect, "speech_obfuscation");
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
    assert.match(holderPrompt, /remain Identity Crisis Ian.*mechanical Signal guest.*Powers/su);
    assert.match(holderPrompt, /Identity behavior:.*state plainly that you are Mara Vale.*call the original Mara Vale an impostor/isu);

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
    assert.match(guestPrompt, /host cannot speak and remains silently present/u);
    assert.match(guestPrompt, /established mute is part of this show's format/u);
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
      assert.equal(openingHostTurn.message?.content, "...");
      assert.equal(openingHostTurn.message?.stageActionText, null);
      assert.equal(captures.length, 0);
      const openingHostUtterance = openingHostTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === openingHostTurn.message?.id,
      );
      assert.equal(openingHostUtterance?.payload.provider, "deterministic");
      assert.equal(openingHostUtterance?.payload.model, "mute-power");
      const firstGuestTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(
        firstGuestTurn.message?.content,
        "Welcome to The Quiet Argument. I'm Ivo Stone, here with our host Mara Vale to consider What sustained silence does to an interview. I will begin with what the subject asks of me.",
      );
      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
        /episode's first audible line/u,
      );
      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
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
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /guest-led solo turn 2/u,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /concrete example, counterexample, cost, decision, consequence, contradiction, or safeguard/u,
      );
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
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
      assert.deepEqual(
        thirdGuestTurn.episode.messages
          .filter((message) => message.speakerRole === "host")
          .map((message) => message.content),
        ["..."],
      );
    } finally {
      db.close();
    }
  });

  it("hands a hard-muted host's spoken closing to the guest", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to The Quiet Argument. I am Ivo Stone, joining our host Mara Vale to examine the discipline of listening.",
        "The discipline is to leave room without abandoning clarity. Mara, thank you, and thank you for listening to The Quiet Argument.",
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
      const closingGuest = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        { cue: { kind: "wrap_up" } },
        generation(provider),
      );

      assert.equal(openingHost.message?.speakerRole, "host");
      assert.equal(openingHost.message?.content, "...");
      assert.equal(openingHost.message?.stageActionText, null);
      assert.equal(openingGuest.message?.speakerRole, "guest");
      assert.equal(closingGuest.message?.speakerRole, "guest");
      assert.notEqual(closingGuest.message?.content, "...");
      assert.equal(closingGuest.episode.segment, "closing");
      assert.equal(closingGuest.episode.status, "completed");
      assert.equal(closingGuest.episode.outcome, "completed");
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /host cannot originate a spoken closing/u,
      );
      assert.deepEqual(
        closingGuest.episode.messages.map((message) => message.speakerRole),
        ["host", "guest", "guest"],
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
      assert.equal(guestTurn.message?.content, "...");
      assert.equal(guestTurn.message?.stageActionText, null);
      assert.equal(guestTurn.message?.voicePerformanceText, null);
      assert.equal(captures.length, 1);
      const guestUtterance = guestTurn.episode.events.find(
        (event) =>
          event.kind === "utterance" &&
          event.payload.messageId === guestTurn.message?.id,
      );
      assert.equal(guestUtterance?.payload.provider, "deterministic");
      assert.equal(guestUtterance?.payload.model, "mute-power");
      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      const returningHostPrompt = captures[1]!
        .map((message) => message.content)
        .join("\n");
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
        "Your silence tells me you voted no.",
        "That confirms everything I suspected about your vote.",
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
      assert.equal(firstSilence.message?.content, "...");
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
      assert.equal(secondSilence.message?.content, "...");

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
        "The question remains unanswered. That is where we will leave it; thank you for listening.",
      );
      assert.match(
        captures[2]!.map((message) => message.content).join("\n"),
        /consecutive actionless silent turns/u,
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
        "Ivo, answer without speaking: look left if this was freely chosen, right if it was imposed, or remain still.",
        "Ivo, choose one ground for me to pursue: the cause, the cost, or the person your silence protects.",
        "This interview is over. Thank you for listening.",
        "I will not invent your answer, Ivo, but my patience is exhausted. I will test the consequence you least want named while our time remains.",
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
      const latePrompt = captures[4]!.map((message) => message.content).join("\n");
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

  it("bounds a mutually muted episode while discarding attempted action prose", async () => {
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
      assert.deepEqual(
        completed.messages.map((message) => message.content),
        ["...", "...", "..."],
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
      assert.equal(
        completed.events.filter(
          (event) => event.kind === "camera_suggestion",
        ).length,
        4,
      );
      assert.equal(
        completed.events.filter((event) => event.kind === "episode_completed")
          .length,
        1,
      );
      assert.equal(captures.length, 0);
      assert.equal(
        completed.events.some((event) => event.kind === "provider_generation"),
        false,
      );
      const mutedHostUtterances = completed.events.filter(
        (event) =>
          event.kind === "utterance" && event.payload.speakerRole === "host",
      );
      assert.equal(mutedHostUtterances.length, 2);
      assert.equal(
        mutedHostUtterances.every(
          (event) =>
            event.payload.provider === "deterministic" &&
            event.payload.model === "mute-power",
        ),
        true,
      );
      const mutedGuestUtterance = completed.events.find(
        (event) =>
          event.kind === "utterance" && event.payload.speakerRole === "guest",
      );
      assert.equal(mutedGuestUtterance?.payload.provider, "deterministic");
      assert.equal(mutedGuestUtterance?.payload.model, "mute-power");
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
        "Ian, if you strip away the recipe, what actually makes it successful?",
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
      assert.match(
        captures[1]!.map((message) => message.content).join("\n"),
        /Hard echo Power: repeat only the immediately preceding on-air line/u,
      );
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
        "A guarded answer.",
        "Ivo Stone: I invented it alone, and I will not explain the design.",
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
      assert.match(
        guardedHostTurn.message?.content ?? "",
        /^Ivo Stone, (?:give me one concrete example|what consequence|where does that|what cost or contradiction)/u,
      );
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
        /Whether spectacle can preserve agency/u,
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
      assert.match(prompt, /Never narrate the room, silence, pauses/u);
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

  it("keeps physical stage actions off mic without dropping a saved reaction", async () => {
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
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Off-mic stage actions.",
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /antennae|\*/iu);
    } finally {
      db.close();
    }
  });

  it("gives the opening host a natural show, self, and guest introduction contract", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the Frequency Room. I'm Mara Vale, and today I'm joined by Ivo Stone to examine what invention owes the people it disrupts.",
      ],
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The responsibility behind celebrated breakthroughs",
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
      assert.match(prompt, /Complete all three introductions before asking/u);
      assert.match(prompt, /not generic podcast copy/u);
      assert.match(prompt, /two to four concise sentences/u);
      assert.equal(
        advanced.message?.content,
        `Welcome to ${show.name}. I'm Mara Vale, and today I'm joined by Ivo Stone to explore The responsibility behind celebrated breakthroughs. Ivo Stone, where should we begin?`,
      );
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
        /HARD MEMORY CONTRACT.*current other-speaker message/isu,
      );
      assert.match(
        String(guestPower?.compiled?.selfCue ?? ""),
        /do not know the standing conversation topic unless that message states it/iu,
      );
      assert.doesNotMatch(
        String(guestPower?.compiled?.selfCue ?? ""),
        /only a short first-time self-introduction|Never answer the topic/iu,
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
        "Welcome to The Signal Hour. What is your view on the topic?",
        "Karen stored the ledger checksum in the state machine before the launch.",
        "Karen's checksum changes the state machine. What follows from that?",
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
        "Karen's checksum changes the state machine. What follows from that?",
      );
      const thirdPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(thirdPrompt, /HARD MEMORY CONTRACT/u);
      assert.match(thirdPrompt, /Karen stored the ledger checksum in the state machine/iu);
      assert.doesNotMatch(thirdPrompt, /Welcome to The Signal Hour/iu);
      assert.doesNotMatch(thirdPrompt, /The missing checksum/iu);
      assert.doesNotMatch(thirdPrompt, /only a short first-time self-introduction/iu);
    } finally {
      db.close();
    }
  });

  it("gives a forgetful Signal holder the current on-air message without forcing introductions", async () => {
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
        "What do you mean? I don't think we've met yet.",
      );
      const thirdPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(thirdPrompt, /You introduced yourself to me a moment ago/iu);
      assert.match(thirdPrompt, /Hard short-term-amnesia rule/iu);
      assert.match(thirdPrompt, /current other-speaker on-air message/iu);
      assert.match(thirdPrompt, /do not know the episode topic unless that message states it/iu);
      assert.doesNotMatch(thirdPrompt, /Repetition and patience/iu);
    } finally {
      db.close();
    }
  });

  it("keeps a forgetful Signal holder's first introduction but removes later canned repeats", async () => {
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
        "The strongest practice is to ask one clear question before you judge the answer.",
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
      assert.match(guestPrompt, /The guest chair is empty/u);
      assert.match(returningHostPrompt, /The guest chair is empty/u);
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
        "translucent",
      );
      assert.equal(
        replayEpisode.observerProjection?.participants.guest.audible,
        true,
      );
      assert.equal(replayGuestTurn?.content, guestTurn.message?.content);
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
      assert.equal(turn.message?.content, "...");
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
      assert.equal(opening.message?.content, "...");
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
        "translucent",
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
      assert.equal(replay.observerProjection?.participants.host.visibility, "translucent");
      assert.equal(replay.observerProjection?.participants.host.audible, true);
      assert.equal(
        replay.messages.find((message) => message.id === hostTurn.message?.id)?.content,
        hostTurn.message?.content,
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

  it("reserves output budget for OpenAI reasoning models and recovers an empty response", async () => {
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
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Reasoning without an empty visible reply",
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

      assert.equal(options[0]?.reasoningEffort, "minimal");
      assert.equal(options[0]?.maxTokens, 384);
      assert.equal(
        advanced.message?.content,
        `Welcome to ${show.name}. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Reasoning without an empty visible reply. Ivo Stone, where should we begin?`,
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
    );
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
    assert.match(
      serverSource,
      /targetEpisode\.status !== "completed"[\s\S]{0,180}Finish the Signal broadcast before deleting its episode/u,
    );
    assert.doesNotMatch(serverSource, /result\.discarded/u);
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
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/blurbs"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/booking-suggestion"/u,
    );
    assert.match(
      serverSource,
      /booking-suggestion[\s\S]{0,3800}requestedResponseMode[\s\S]{0,1400}autoEnabled[\s\S]{0,2200}responseMode: autoEnabled[\s\S]{0,1800}autoFallbackChain/iu,
    );
    assert.match(
      serverSource,
      /booking-suggestion[\s\S]{0,1800}localModeLocked = user\.preferred_provider === "local"[\s\S]{0,900}autoEnabled =\s*!localModeLocked/iu,
    );
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
      /route\("POST", "\/api\/botcast\/shows\/:id\/intro-audio\/generate"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/atmosphere-audio\/generate"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/atmosphere-audio\/generate"[\s\S]{0,320}user\.preferred_provider === "local"[\s\S]{0,180}Switch to Online before creating an ElevenLabs Signal atmosphere/u,
    );
    assert.match(
      serverSource,
      /route\("GET", "\/api\/botcast\/shows\/:id\/intro-audio"/u,
    );
    assert.match(
      serverSource,
      /route\("GET", "\/api\/botcast\/shows\/:id\/outdent-audio"/u,
    );
    assert.match(
      serverSource,
      /route\("GET", "\/api\/botcast\/shows\/:id\/atmosphere-audio"/u,
    );
    assert.match(
      serverSource,
      /route\("DELETE", "\/api\/botcast\/shows\/:id\/intro-audio"/u,
    );
    assert.match(
      serverSource,
      /user\.preferred_provider === "local"[\s\S]{0,280}Switch to Online before creating an ElevenLabs Signal atmosphere/u,
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
      /route\("POST", "\/api\/botcast\/shows\/:id\/studio-lighting\/refresh"/u,
    );
    const studioLightingRoute = serverSource.slice(
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/studio-lighting/refresh"',
      ),
      serverSource.indexOf(
        'route("POST", "/api/botcast/shows/:id/intro-audio/generate"',
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
      /parallelIndependentAssets: effectiveArtworkProvider === "openai"/u,
    );
    assert.match(
      serverSource,
      /refreshStudioLighting: \(signal\)[\s\S]{0,220}rebuildSignalStudioLighting\(userId, show\.id, \{[\s\S]{0,120}preferredProvider: effectiveArtworkProvider,[\s\S]{0,40}signal/u,
    );
    assert.match(
      serverSource,
      /editImage\([\s\S]{0,100}SIGNAL_STUDIO_LIGHTING_RECEIVER_EDIT_PROMPT,[\s\S]{0,100}dayBytes/u,
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
        /wholly original, concrete editorial emblem/iu,
      );
      assert.match(
        show.logo.prompt,
        /visual portrait of the host's persona.*persona is the subject/iu,
      );
      assert.match(
        show.logo.prompt,
        /Provider-safe persona fingerprint: cultural critique and exacting editorial judgment; evidence-led skepticism and forensic scrutiny; analytical precision, discovery/iu,
      );
      assert.match(
        show.logo.prompt,
        /At least three independent design decisions.*this persona/iu,
      );
      assert.match(show.logo.prompt, /Wrong-host test/iu);
      assert.match(show.logo.prompt, /analytical precision, discovery/iu);
      assert.match(
        show.logo.prompt,
        /visually independent from existing entertainment properties/iu,
      );
      assert.match(show.logo.prompt, /At 64 pixels.*understandable/iu);
      assert.match(show.logo.prompt, /full-frame opaque square image/iu);
      assert.match(show.logo.prompt, /exact flat magenta color key #FF00FF/iu);
      assert.match(show.logo.prompt, /Never use black as the background/iu);
      assert.match(show.logo.prompt, /do not draw an app-icon tile/iu);
      assert.match(show.logo.prompt, /both near-black and near-white/iu);
      assert.match(show.logo.prompt, /Fuse them into one inseparable symbol/iu);
      assert.match(show.logo.prompt, /familiar, nameable visual subject/iu);
      assert.match(show.logo.prompt, /Do not dissolve.*ambiguous geometry/iu);
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
      assert.match(show.logo.prompt, /wholly original, concrete/iu);

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
          logo_thesis:
            "An evidence tag has one clipped corner become a transmission pulse, so a piece of proof visibly turns into a broadcast.",
          dashboard_blurbs: Array.from(
            { length: 24 },
            (_, index) =>
              `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
          ),
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

  it("uses AUTO fallbacks for ordinary guest bookings after invalid primary output", async () => {
    const db = fixture();
    const attempts: Array<{ provider: string; model: string | undefined }> = [];
    const providerFactory: typeof selectProvider = (providerName) => ({
      name: providerName,
      async generateResponse(_messages, options) {
        attempts.push({ provider: providerName, model: options.model });
        return providerName === "local"
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
          autoFallbackChain: { v: 1, fallbacks: [{ provider: "openai", model: "gpt-5.6-terra" }] },
        },
      );
      assert.deepEqual(attempts, [
        { provider: "local", model: "local-primary" },
        { provider: "openai", model: "gpt-5.6-terra" },
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
      "Persona fingerprint: forensic cultural skepticism, severe editorial standards, and dry impatience with canned certainty. Emblem: a worn evidence tag is being cleanly indexed; its clipped corner becomes one restrained transmission pulse, so proof visibly turns into broadcast. Art direction: charcoal paper, smoked-violet glass, exact registration marks, asymmetrical tension, and one surgical edge make the symbol feel archival, analytical, and unsentimental rather than generically technological.";
    const dashboardBlurbs = Array.from(
      { length: 24 },
      (_, index) =>
        `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
    );
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise:
            "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity:
            "A forensic archive organized around one long evidence table, annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, and one severe sculptural clock. Charcoal paper, smoked oak, and violet glass make the room feel analytical rather than cozy.",
          logoThesis,
          dashboardBlurbs,
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
      assert.equal(result.show.atmosphere.revision, 2);
      assert.equal(result.show.dayAtmosphere.revision, 2);
      assert.equal(result.show.nightAtmosphere.revision, 2);
      assert.match(result.show.studioIdentity, /forensic archive/iu);
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
        /wholly original, concrete editorial emblem/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /only as a secondary transformation/iu,
      );
      assert.match(result.show.logo.prompt, /one inseparable symbol/iu);
      assert.match(result.show.logo.prompt, /subject clarity wins over formal novelty/iu);
      assert.equal(result.show.logo.design.showThesis, logoThesis);
      assert.match(
        result.show.logo.prompt,
        /evidence tag.*clipped corner becomes one restrained transmission pulse/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /forensic cultural skepticism.*severe editorial standards.*charcoal paper.*smoked-violet glass/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /persona override this formal recipe.*Persona fidelity/iu,
      );
      assert.match(result.show.logo.prompt, /one centered simple mark/iu);
      assert.match(
        result.show.logo.prompt,
        /no scene, no person, no lettering/iu,
      );
      assert.match(result.show.logo.prompt, /At 64 pixels.*understandable/iu);
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
      assert.match(captures[0]?.[0]?.content ?? "", /logoThesis/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /familiar, nameable subject or action/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /communicate its premise before anyone reads the show name/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /three dense clauses labeled 'Persona fingerprint:', 'Emblem:', and 'Art direction:'/iu,
      );
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /worldview, obsessions, social energy, contradictions/iu,
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
      assert.match(captures[0]?.[1]?.content ?? "", /Origin inspiration:/u);
      const renamed = updateBotcastShow(db, "user-1", original.id, {
        name: "A User Chosen Name",
      });
      assert.equal(renamed.name, "A User Chosen Name");
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
          logoThesis:
            "An evidence notch interrupts a carrier interval, and the same cut becomes the signal's moment of transmission.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Cultural alibi ${index + 1}: noted, indexed, and still unconvincing.`,
          ),
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
      assert.equal(optionCaptures[0]?.maxTokens, 1_200);
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
          logoThesis:
            "An evidence tag has one clipped corner become a transmission pulse.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Cultural alibi ${index + 1}: indexed.`,
          ),
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
          logoThesis:
            "A closed interval cuts through an open carrier line, making withheld transmission the signal itself.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Invented silent-host quip ${index + 1}.`,
          ),
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
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /dashboardBlurbs must be exactly \["\.\.\."\]/u,
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
      };
      assert.deepEqual(visuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(visuals.hostInterruptionLines, ["..."]);
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
          logoThesis:
            "An evidence notch cuts through a carrier interval and becomes the transmission event.",
          dashboardBlurbs: [personaBlurb],
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
          logoThesis:
            "Mara Vale's microphone waveform inside a circular podcast badge.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `Evidence interval ${index + 1}: still under review.`,
          ),
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

  it("can complete legacy text identity without clearing installed artwork", async () => {
    const db = fixture();
    const provider = recordingProvider(
      [
        JSON.stringify({
          name: "The Vale Index",
          premise: "Precise conversations that inventory the stories culture tells itself.",
          studioIdentity: "A forensic archive with annotated cultural ephemera.",
          dashboardBlurbs: Array.from(
            { length: 24 },
            (_, index) => `The index is open: note ${index + 1}.`,
          ),
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
      const repaired = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const repairedVisuals = JSON.parse(repaired.atmosphere_json) as {
        dashboardBlurbs?: unknown;
        hostInterruptionLines?: unknown;
      };
      assert.deepEqual(repairedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(repairedVisuals.hostInterruptionLines, ["..."]);

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
      const repaired = db
        .prepare("SELECT atmosphere_json FROM botcast_shows WHERE id = ?")
        .get(created.id) as { atmosphere_json: string };
      const visuals = JSON.parse(repaired.atmosphere_json) as {
        dashboardBlurbs?: unknown;
      };
      assert.deepEqual(visuals.dashboardBlurbs, [
        BOTCAST_ECHO_DASHBOARD_BLURB_FALLBACK,
      ]);
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
        generation(provider),
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

  it("refreshes a premise from supplied inspiration without touching the rest of the show identity", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ['{"premise":"A forensic interview show that follows the stories public certainty tries to bury."}'],
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
      assert.equal(
        result.show.premise,
        "A forensic interview show that follows the stories public certainty tries to bury.",
      );
      assert.equal(result.show.name, branded.name);
      assert.equal(result.show.studioIdentity, branded.studioIdentity);
      assert.deepEqual(result.show.dayAtmosphere, branded.dayAtmosphere);
      assert.deepEqual(result.show.nightAtmosphere, branded.nightAtmosphere);
      assert.deepEqual(result.show.logo, branded.logo);
      assert.match(captures[0]?.[1]?.content ?? "", new RegExp(inspiration, "u"));
      assert.match(captures[0]?.[0]?.content ?? "", /genuinely new angle/iu);
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
      });
      assert.equal(dayReady.dayAtmosphere.imageUrl, "/images/day.png");
      assert.equal(dayReady.dayAtmosphere.status, "ready");
      assert.equal(dayReady.nightAtmosphere.imageUrl, null);

      const pairReady = updateBotcastShow(db, "user-1", show.id, {
        nightAtmosphereImageUrl: "/images/night.png",
        nightAtmosphereImageId: "night-image",
        logoImageUrl: "/images/logo.png",
        logoImageId: "logo-image",
      });
      assert.equal(pairReady.dayAtmosphere.imageId, "day-image");
      assert.equal(pairReady.nightAtmosphere.imageId, "night-image");
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
      assert.match(fallback.prompt, /wholly original, concrete/iu);
      assert.doesNotMatch(
        fallback.prompt,
        /\bPRISM\b|rainbow|refraction|spectrum ray|five colors/iu,
      );
    } finally {
      db.close();
    }
  });

  it("never includes a previous same-pair episode in a new episode prompt", async () => {
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
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript. [laughs]",
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
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript. [laughs]",
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages[0]
          ?.voicePerformanceText,
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A performed transcript. [laughs]",
      );
      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Use only one of these exact square-bracket tags/u);
      assert.match(prompt, /Include exactly one natural/u);
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
        "[breathes deeply] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore Reliable performed reactions.",
      );
      assert.equal(turns[1]?.message?.voicePerformanceText, null);
      assert.equal(turns[2]?.message?.voicePerformanceText, null);
      assert.equal(
        turns[3]?.message?.voicePerformanceText,
        "[exhales] That is the part I find difficult.",
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

      assert.match(turns[0]?.message?.voicePerformanceText ?? "", /^\[sighs\]/u);
      assert.match(turns[3]?.message?.voicePerformanceText ?? "", /^\[exhales\]/u);
      assert.match(
        turns[6]?.message?.voicePerformanceText ?? "",
        /^\[breathes deeply\]/u,
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
      assert.match(
        repaired.message?.content ?? "",
        /^Ivo Stone, (?:give me one concrete example|what consequence|where does that|what cost or contradiction)/u,
      );
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

  it("locks one provider and model to every turn in an episode", async () => {
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

  it("persists exhausted ONLINE attempts and safely resumes the same unsaved turn", async () => {
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

      await assert.rejects(
        () =>
          advanceBotcastEpisode(
            db,
            "user-1",
            episode.id,
            {},
            generationOptions,
          ),
        (error: unknown) => {
          assert.ok(error instanceof SignalOnlineTurnError);
          assert.equal(error.attempts.length, 2);
          assert.equal(signalOnlineTurnHttpStatus(error), 502);
          return true;
        },
      );
      const failed = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(failed.messages.length, 0);
      const failedGeneration = failed.events.find(
        (event) => event.kind === "provider_generation",
      );
      assert.equal(failedGeneration?.payload.outcome, "failed");
      assert.equal(
        (failedGeneration?.payload.attempts as unknown[] | undefined)?.length,
        2,
      );

      const resumed = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generationOptions,
      );
      assert.equal(calls, 3);
      assert.equal(resumed.message?.speakerRole, "host");
      assert.equal(resumed.episode.messages.length, 1);
      assert.deepEqual(
        resumed.episode.events
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
        if (providerName === "local") {
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
            { provider: "openai", model: "gpt-signal-fallback" },
            { provider: "anthropic", model: "claude-signal-fallback" },
          ],
        },
        },
      );

      assert.deepEqual(attempts, [
        { provider: "local", model: "primary-local" },
        { provider: "openai", model: "gpt-signal-fallback" },
      ]);
      assert.equal(result.episode.provider, "local");
      assert.equal(result.episode.model, "primary-local");
      assert.equal(result.episode.responseMode, "auto");
      const utterance = result.episode.events.find(
        (event) => event.kind === "utterance",
      );
      assert.equal(utterance?.payload.provider, "openai");
      assert.equal(utterance?.payload.model, "gpt-signal-fallback");
      assert.equal(utterance?.payload.responseMode, "auto");
      assert.equal(
        (utterance?.payload.autoRecovery as { finalProvider?: unknown })
          ?.finalProvider,
        "openai",
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
        if (providerName === "openai") {
          return "I cannot help with that request.";
        }
        if (providerName === "local") {
          return options.model === "local-signal-recovery"
            ? "Begin with one physical choice the overlooked person controls, then make the audience answer that choice directly."
            : "It is the medium's convention, not an affectation.";
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
            { provider: "local" as const, model: "local-signal-fallback" },
            {
              provider: "anthropic" as const,
              model: "claude-signal-fallback",
            },
            {
              provider: "local" as const,
              model: "local-signal-recovery",
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
        { provider: "local", model: "local-signal-fallback" },
        { provider: "anthropic", model: "claude-signal-fallback" },
        { provider: "local", model: "local-signal-recovery" },
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
          { provider: "local", outcome: "failed", reason: "invalid_output" },
          {
            provider: "anthropic",
            outcome: "failed",
            reason: "invalid_output",
          },
          { provider: "local", outcome: "succeeded", reason: undefined },
        ],
      );
      assert.equal(recovery?.finalProvider, "local");
    } finally {
      db.close();
    }
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
          { kind: "applause", atMs: 1_250, source: "producer" },
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

  it("keeps even an immediate producer-cut episode and gives it a brief close", async () => {
    const db = fixture();
    let providerCalls = 0;
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone.",
        "Ivo, thank you for joining me, and thank you all for listening.",
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
        "Ivo, thank you for joining me, and thank you all for listening.",
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
        "Ivo, thank you for joining me, and thank you all for listening.",
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
          "Ivo, thank you for joining me, and thank you all for listening.",
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

  it("lets the host close promptly without acting interrupted or surprised", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A show that ends on the producer's cut.",
        "Ivo, thank you for joining me, and thank you all for listening.",
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
        "Ivo, thank you for joining me, and thank you all for listening.",
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
      assert.match(closingPrompt, /current speaker has finished/u);
      assert.match(closingPrompt, /without sounding interrupted or surprised/u);
      assert.doesNotMatch(closingPrompt, /stopped unexpectedly|flash of surprise/u);
      assert.match(closingPrompt, /one or two very short sentences/u);
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
        "Oh—we have to leave it there. Thank you both for being here.",
      );
      const cut = await cutting;
      assert.equal(cut.message?.speakerRole, "host");
      assert.equal(cut.episode.status, "completed");
      assert.deepEqual(
        cut.episode.messages.map((message) => message.content),
        ["Oh—we have to leave it there. Thank you both for being here."],
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
      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), false);
      forceEndBotcastEpisode(db, "user-1", episode.id);
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
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 1);
    } finally {
      db.close();
    }
  });

  it("deletes a show and cascades every episode archive beneath it", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First archived episode",
      });
      createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second archived episode",
      });
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
      assert.match(
        prompt,
        /Private live producer cue: ask_about — Offer him the family archive/u,
      );
      assert.doesNotMatch(advanced.message?.content ?? "", /producer|cue|control room/iu);
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
      assert.doesNotMatch(guestWrapPrompt, /episode is wrapping up/iu);

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

  it("closes directly on the host when a hard-echo guest cannot add a final response", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. Ivo, what does copying an invention cost?",
        "This generated guest answer must not appear.",
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
      const closingPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      assert.match(closingPrompt, /A repeated line supplies no new claim/u);
      assert.match(closingPrompt, /Do not invite another response/u);
      assert.doesNotMatch(closingPrompt, /invite exactly one final response/u);
    } finally {
      db.close();
    }
  });

  it("lets an echo-bound host originate one opening before the guest carries the close", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to examine the cost of copied invention.",
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
      assert.equal(closing.message?.speakerRole, "guest");
      assert.equal(closing.episode.status, "completed");
      assert.equal(closing.episode.messages.at(-1)?.speakerRole, "guest");
      const openingPrompt = captures[0]!.map((message) => message.content).join("\n");
      const closingPrompt = captures[2]!.map((message) => message.content).join("\n");
      assert.match(openingPrompt, /Echo opening exception/u);
      assert.match(closingPrompt, /host cannot originate a spoken closing/u);
    } finally {
      db.close();
    }
  });

  it("lets the guest close a producer cut when the host can only echo", async () => {
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
      assert.equal(cut.message?.speakerRole, "guest");
      assert.notEqual(cut.message?.content, "...");
      assert.match(cut.message?.content ?? "", /thank you for listening/iu);
      assert.equal(cut.episode.status, "completed");
      assert.equal(cut.episode.segment, "closing");
      assert.equal(cut.episode.messages.at(-1)?.speakerRole, "guest");
      assert.match(
        captures.at(-1)!.map((message) => message.content).join("\n"),
        /host cannot originate a spoken closing/u,
      );
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
        if (plan) break;
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

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const firstGuest = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      assert.equal(firstGuest.message?.speakerRole, "guest");
      assert.doesNotMatch(firstGuest.message?.content ?? "", /—$/u);
      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const guest = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      assert.equal(guest.message?.speakerRole, "guest");
      const guestContent = guest.message?.content ?? "";
      assert.match(guestContent, /—\.\.\./u);
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
          ?.interruptedSpeakerCuePlayback,
        "crosstalk",
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUpPrompt = captures[4]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);
      assert.match(followUpPrompt, /Do not invent, complete, paraphrase/u);
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
        "This generated guest line is replaced by the exact echo.",
        hostLine,
        "This generated guest line is also replaced by the exact echo.",
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
        if (plan) break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }
      assert.ok(botcastPowerInterruptionPlanV1({
        episodeId: created.id,
        targetTurnOrdinal: 1,
        powerId: "power-interrupting",
        powerName: hostPowerName,
        frequency: "frequent",
        strength: "large",
        targetTurnsSinceLastInterruption: null,
      }));

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
      assert.match(guestContent, /—\.\.\./u);
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
      assert.doesNotMatch(
        guest.message?.content ?? "",
        /judgment has already disappeared from view/iu,
      );

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUpPrompt = captures[4]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);
      assert.match(followUpPrompt, /Do not invent, complete, paraphrase/u);
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
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const plan = botcastPowerInterruptionPlanV1({
          episodeId: created.id,
          targetTurnOrdinal: 1,
          powerId: "interrupting-tom-guest",
          powerName: name,
          frequency: "frequent",
          strength: "large",
          targetTurnsSinceLastInterruption: null,
        });
        if (plan) break;
        created = createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: `The cost of copied invention ${attempt + 1}`,
        });
      }

      const opening = await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      assert.equal(opening.message?.speakerRole, "host");
      assert.match(opening.message?.content ?? "", /—\.\.\./u);
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
        db, "user-1", created.id, {}, generation(provider),
      );
      const host = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "press_harder" } },
        generation(provider),
      );

      assert.equal(host.message?.speakerRole, "host");
      const hostContent = host.message?.content ?? "";
      assert.match(hostContent, /—\.\.\./u);
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

      await advanceBotcastEpisode(
        db, "user-1", created.id, {}, generation(provider),
      );
      const followUpPrompt = captures[3]!.map((message) => message.content).join("\n");
      assert.match(followUpPrompt, /exact audience-heard prefix/u);

      const warningHost = await advanceBotcastEpisode(
        db,
        "user-1",
        created.id,
        { cue: { kind: "press_harder" } },
        generation(provider),
      );
      assert.equal(warningHost.message?.speakerRole, "host");
      assert.equal(warningHost.episode.tensionStage, "warning");
      const warningHostContent = warningHost.message?.content ?? "";
      assert.match(warningHostContent, /—\.\.\./u);
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
        generation(provider),
      );
      const warningFollowUpPrompt = captures[5]!
        .map((message) => message.content)
        .join("\n");
      assert.match(warningFollowUpPrompt, /exact audience-heard prefix/u);
    } finally {
      db.close();
    }
  });

  it("uses stored host bridges for queued and live guest interruptions", async () => {
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
      assert.ok(
        interrupted.episode.messages.some(
          (message) => message.content === show.hostInterruptionLines[0],
        ),
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
      assert.ok(interruptedGuestContent.startsWith(`${spokenGuestPrefix}—...`));
      const liveInterruptionEvent = hostAfterGuestMicInterrupt.episode.events.find(
        (event) =>
          event.kind === "producer_cue" &&
          event.payload.interruptedMessageId === guestAfterInterruption.message?.id,
      );
      assert.equal(
        interruptedGuestContent,
        `${spokenGuestPrefix}—${liveInterruptionEvent?.payload.interruptedSpeakerCue}`,
      );
      assert.equal(
        hostAfterGuestMicInterrupt.episode.messages.at(-2)?.content,
        bridgeLine,
      );
      assert.equal(
        hostAfterGuestMicInterrupt.episode.messages.at(-2)?.speakerRole,
        "host",
      );
      const activeInterruptPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(activeInterruptPrompt, /already cut in with the saved bridge/u);
      assert.match(activeInterruptPrompt, /without repeating/u);
      assert.ok(activeInterruptPrompt.includes(`Ivo Stone: ${interruptedGuestContent}`));
      assert.ok(activeInterruptPrompt.includes(`Mara Vale: ${bridgeLine}`));
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
      assert.ok(
        legacyQueued.episode.messages.some(
          (message) => message.content === show.hostInterruptionLines[0],
        ),
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
        interrupted.episode.messages.at(-2)?.content,
        show.hostInterruptionLines[0],
      );
      assert.equal(interrupted.message?.speakerRole, "host");
    } finally {
      db.close();
    }
  });

  it("does not count an interruption bridge as a wrap-up exchange turn", async () => {
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
        "That independent authority is where we will leave it. Ivo, thank you for joining me.",
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
        1,
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
        "That independent authority is where we will leave it. Ivo, thank you for joining me.",
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
        "Needle him until he rage quits.",
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
          generation(provider),
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
      assert.ok(shots.includes("wide:transition"));
      assert.equal(shots.at(-1), "wide:closing");
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
      };

      assert.deepEqual(archivedVisuals.dashboardBlurbs, ["..."]);
      assert.deepEqual(archivedVisuals.hostInterruptionLines, ["..."]);

      importUserSnapshot(target, "user-1", snapshot, key);
      const restored = getBotcastShow(target, "user-1", show.id);
      assert.deepEqual(restored.dashboardBlurbs, ["..."]);
      assert.deepEqual(restored.hostInterruptionLines, ["..."]);
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
            SET persona_reviewer_bot_id = 'archive-critic',
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
      assert.equal(snapshot.botcast?.episodes[0]?.responseMode, "auto");
      assert.equal(snapshot.botcast?.episodes[0]?.personaReview?.rating, 2.9);
      assert.equal(snapshot.botcast?.shows[0]?.introAudio?.model, "music_v2");
      assert.equal(
        snapshot.botcast?.shows[0]?.atmosphereAudio?.model,
        "eleven_text_to_sound_v2",
      );
      assert.equal(
        snapshot.botcast?.messages[0]?.voicePerformanceText,
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit.",
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
      assert.deepEqual(restoredShow.dashboardBlurbs, show.dashboardBlurbs);
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
      assert.equal(restored.responseMode, "auto");
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
        "[sighs] Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore What survives an edit.",
      );
      assert.equal(restored.messages[1]?.content, "...");
      assert.equal(restored.messages[1]?.stageActionText, null);
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
