import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  botPowerSourceHashV1,
  botcastFallbackStudioAccentVariantForSeed,
  botcastReplayTimeline,
} from "@localai/shared";

import {
  advanceBotcastEpisode,
  createBotcastEpisode,
  createBotcastShow,
  deleteBotcastEpisode,
  deleteBotcastShow,
  deleteBotcastShowIntroAudio,
  ensureBotcastEpisodePersonaReview,
  forceEndBotcastEpisode,
  generateBotcastBookingSuggestion,
  generateBotcastShowDashboardBlurbs,
  generateBotcastShowIdentity,
  generateBotcastShowName,
  getBotcastEpisode,
  getBotcastShow,
  listBotcastEpisodes,
  nextBotcastFallbackStudioAccentVariant,
  parseBotcastPersonaReviewResponse,
  readBotcastShowAtmosphereAudio,
  readBotcastShowIntroAudio,
  setBotcastEpisodeCameraMode,
  setBotcastModelWarmupHold,
  selectBotcastReviewPersona,
  storeBotcastShowAtmosphereAudio,
  storeBotcastShowIntroAudio,
  updateBotcastShow,
} from "../botcast.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { initializeDatabase } from "../db.ts";
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

describe("Botcast persistence and isolation", () => {
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
      assert.deepEqual(
        listBotcastEpisodes(db, "user-1", show.id)[0]?.personaReview,
        review,
      );
    } finally {
      db.close();
    }
  });

  it("parses bounded review JSON and prefers observers over episode participants", () => {
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
        atmosphereMix: { background: 0.12, grain: 0.008, foley: 1.4 },
      });
      assert.deepEqual(remixed.atmosphereMix, {
        background: 0.12,
        grain: 0.008,
        foley: 1.4,
      });
      assert.deepEqual(getBotcastShow(db, "user-1", show.id).atmosphereMix, {
        background: 0.12,
        grain: 0.008,
        foley: 1.4,
      });

      const first = storeBotcastShowIntroAudio(db, "user-1", show.id, {
        model: "music_v2",
        prompt: "Original intro one",
        contentType: "audio/mpeg",
        audioBytes: Buffer.from([1, 2, 3]),
        durationMs: 6_000,
      });
      assert.equal(first.introAudio.source, "elevenlabs");
      assert.equal(first.introAudio.revision, 1);
      assert.match(first.introAudio.audioUrl ?? "", /\/intro-audio$/u);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [1, 2, 3],
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
        durationMs: 6_000,
      });
      assert.equal(refreshed.introAudio.revision, 2);
      assert.deepEqual(
        [
          ...(readBotcastShowIntroAudio(db, "user-1", show.id)?.audioBytes ??
            []),
        ],
        [4, 5],
      );

      const local = deleteBotcastShowIntroAudio(db, "user-1", show.id);
      assert.equal(local.introAudio.source, "local");
      assert.equal(local.atmosphereAudio.source, "bundled");
      assert.equal(readBotcastShowIntroAudio(db, "user-1", show.id), null);
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
      ["A quick opening."],
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

      assert.equal(options[0]?.reasoningEffort, "minimal");
      assert.equal(options[0]?.maxTokens, 160);
      assert.match(
        captures[0]!.map((message) => message.content).join("\n"),
        /two to four concise sentences, usually 35 to 90 spoken words/u,
      );
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
    } finally {
      db.close();
    }
  });

  it("refuses a Signal pairing that violates a hard speech-audience Power", () => {
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

      assert.throws(
        () =>
          createBotcastEpisode(db, "user-1", show.id, {
          guestBotId: "guest-1",
          topic: "An incompatible booking",
        }),
        /Private Channel.*does not allow them to address Ivo Stone in Signal/u,
      );
    } finally {
      db.close();
    }
  });

  it("stages an imperceptible guest for the audience without exposing them to the host", async () => {
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
      assert.doesNotMatch(openingHostPrompt, /Only Light Yagami can perceive/u);
      assert.match(guestPrompt, /listening audience can hear you/u);
      assert.match(guestPrompt, /The guest chair is empty/u);
      assert.match(returningHostPrompt, /The guest chair is empty/u);
      assert.match(
        returningHostPrompt,
        /Advance a self-contained editorial argument/u,
      );
      assert.doesNotMatch(returningHostPrompt, /She really cannot see me/u);
      assert.match(finalTurn.message?.content ?? "", /central question/u);
      assert.doesNotMatch(
        finalTurn.message?.content ?? "",
        /empty chair|booking vanished/iu,
      );
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
      /route\("POST", "\/api\/botcast\/episodes\/:id\/camera"/u,
    );
    assert.match(serverSource, /cueKind === "wrap_up"/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/name"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/blurbs"/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/booking-suggestion"/u,
    );
    assert.match(serverSource, /body\.atmosphereMix !== undefined/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/intro-audio\/generate"/u,
    );
    assert.match(
      serverSource,
      /route\("GET", "\/api\/botcast\/shows\/:id\/intro-audio"/u,
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
      /temperament: signalPersonaTemperamentFor\(host\.system_prompt\)/u,
    );
    assert.match(
      serverSource,
      /seed: `\$\{show\.id\}:\$\{show\.logo\.seed\}`/u,
    );
    assert.match(serverSource, /requestSignalElevenLabsIntroMusic\(\{/u);
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
      /sourceImageBytes\s*\? await editImage\(onlinePrompt, sourceImageBytes/u,
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
      /args\.kind === "logo"[\s\S]{0,100}background: "transparent"/u,
    );
    assert.match(
      serverSource,
      /args\.kind === "logo"[\s\S]{0,100}normalizeSignalLogoImage\(imageBytes\)/u,
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
      /editImage\(promptForModel, sourceImageBytes, apiKey/u,
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
      /modelId: lenientImageFbOnline,[\s\S]{0,120}promptForModel: localPromptForModel/u,
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
      assert.doesNotMatch(show.dayAtmosphere.prompt, /daylight variant/iu);
      assert.doesNotMatch(show.nightAtmosphere.prompt, /nighttime variant/iu);
      assert.doesNotMatch(
        show.nightAtmosphere.prompt,
        /matched day and night studio pair/iu,
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
        /wholly original, non-figurative editorial emblem/iu,
      );
      assert.match(show.logo.prompt, /analytical precision, discovery/iu);
      assert.match(
        show.logo.prompt,
        /visually independent from existing entertainment properties/iu,
      );
      assert.match(show.logo.prompt, /distinctive at 64 pixels/iu);
      assert.match(show.logo.prompt, /true transparent alpha background/iu);
      assert.match(show.logo.prompt, /no app-icon tile/iu);
      assert.match(show.logo.prompt, /both near-black and near-white/iu);
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
      assert.match(show.logo.prompt, /#d21f3c/u);
      assert.match(show.logo.prompt, /wholly original, non-figurative/iu);

      const refreshed = updateBotcastShow(db, "user-1", show.id, {
        regenerateLogo: true,
      });
      assert.doesNotMatch(
        refreshed.logo.prompt,
        /Darth|Vader|Sith|helmet|lightsaber|Galactic Empire/iu,
      );
      assert.equal(refreshed.logo.revision, 2);
      assert.notEqual(refreshed.logo.seed, show.logo.seed);
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
        '{"topic":"What does invention owe the people disrupted by its success?","producerBrief":"Start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts."}',
        "Topic: “What does invention owe the people disrupted by its success?”",
        "Producer brief: Start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts. Respect his resistance to personal speculation.",
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
        topic: "What does invention owe the people disrupted by its success?",
        producerBrief:
          "Start with the cost of celebrated breakthroughs, then press for one concrete responsibility Ivo accepts.",
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
        value: "What does invention owe the people disrupted by its success?",
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
        /swapping in another guest would weaken it/u,
      );
      assert.match(captures[2]?.[1]?.content ?? "", /What does invention owe/u);
      assert.match(
        captures[2]?.[0]?.content ?? "",
        /private off-mic producer brief/u,
      );
      assert.deepEqual(
        optionCaptures.map((options) => options.model),
        [
          "signal-suggestion-model",
          "signal-suggestion-model",
          "signal-suggestion-model",
        ],
      );
      assert.equal(optionCaptures[0]?.jsonMode, true);
      assert.equal(getBotcastShow(db, "user-1", show.id).name, show.name);
    } finally {
      db.close();
    }
  });

  it("repairs impossible audience-only booking direction before it reaches the host", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        '{"topic":"Can spectacle survive when the crowd recognizes the bargain?","producerBrief":"Press Ivo Stone on whether boredom is the real engine, then ask for one concrete example."}',
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
        /audience-only dramatic layer/u,
      );
      assert.doesNotMatch(
        "producerBrief" in booking ? booking.producerBrief : "",
        /press Ivo Stone|ask for one concrete example/iu,
      );
      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /host cannot perceive or hear the booked guest/u);
      assert.match(prompt, /Never instruct the host to ask, press, question/u);
      assert.match(prompt, /Episode format: Audience-only guest/u);
      assert.doesNotMatch(prompt, /promising follow-up/u);
    } finally {
      db.close();
    }
  });

  it("generates an editable host-shaped show identity and refreshes its visual prompts", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
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
        /wholly original, non-figurative editorial emblem/iu,
      );
      assert.match(
        result.show.logo.prompt,
        /signal ring|waveform|sound arcs|recording dial|microphone-capsule/iu,
      );
      assert.match(result.show.logo.prompt, /one centered simple mark/iu);
      assert.match(
        result.show.logo.prompt,
        /no scene, no figure, no lettering/iu,
      );
      assert.match(result.show.logo.prompt, /distinctive at 64 pixels/iu);
      assert.match(
        result.show.logo.prompt,
        /true transparent alpha background/iu,
      );
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
      assert.match(captures[0]?.[0]?.content ?? "", /concrete artifacts/iu);
      assert.match(
        captures[0]?.[0]?.content ?? "",
        /exactly 24 short dashboard blurbs/iu,
      );
      const renamed = updateBotcastShow(db, "user-1", original.id, {
        name: "A User Chosen Name",
      });
      assert.equal(renamed.name, "A User Chosen Name");
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

      const refreshedDay = updateBotcastShow(db, "user-1", show.id, {
        regenerateDayAtmosphere: true,
      });
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
      assert.match(fallback.prompt, /wholly original, non-figurative/iu);
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

  it("cuts a live show to a saved wide-shot ending without deleting its transcript", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      [
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A show that ends on the producer's cut.",
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

      const ended = forceEndBotcastEpisode(db, "user-1", episode.id);
      assert.equal(ended.status, "completed");
      assert.equal(ended.outcome, "completed");
      assert.equal(ended.segment, "closing");
      assert.equal(ended.messages.length, 1);
      assert.equal(
        ended.messages[0]?.content,
        "Welcome to Mara Vale in the Margins. I'm Mara Vale, and today I'm joined by Ivo Stone to explore A show that ends on the producer's cut.",
      );
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
      assert.equal(
        forceEndBotcastEpisode(db, "user-1", episode.id).events.length,
        eventCount,
      );
      assert.throws(
        () => forceEndBotcastEpisode(db, "another-user", episode.id),
        /Signal episode not found/u,
      );
    } finally {
      db.close();
    }
  });

  it("drops a generated line that returns after the producer has cut the show", async () => {
    const db = fixture();
    let releaseResponse!: (value: string) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        markStarted();
        return new Promise<string>((resolve) => {
          releaseResponse = resolve;
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
      await started;
      forceEndBotcastEpisode(db, "user-1", episode.id);
      releaseResponse("This line arrived too late.");

      const result = await advancing;
      assert.equal(result.message, null);
      assert.equal(result.episode.status, "completed");
      assert.equal(result.episode.messages.length, 0);
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

      assert.equal(deleteBotcastShow(db, "another-user", show.id), false);
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 2);
      assert.equal(deleteBotcastShow(db, "user-1", show.id), true);
      assert.throws(
        () => getBotcastShow(db, "user-1", show.id),
        /Signal show not found/u,
      );
      for (const table of [
        "botcast_shows",
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

  it("shares wrap-up direction across the closing exchange and does not reopen the interview", async () => {
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
      assert.equal(cueEvent?.payload.audience, "both");
      const hostWrapPrompt = captures[2]!
        .map((message) => message.content)
        .join("\n");
      const guestWrapPrompt = captures[3]!
        .map((message) => message.content)
        .join("\n");
      assert.match(hostWrapPrompt, /Shared episode direction: wrap_up/u);
      assert.match(hostWrapPrompt, /invite exactly one final response/u);
      assert.match(guestWrapPrompt, /Shared episode direction: wrap_up/u);
      assert.match(guestWrapPrompt, /episode is wrapping up/u);

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
          atMs: botcastReplayTimeline(
            hostClose.episode.messages,
            hostClose.episode.events,
          ).messageStartMs.at(-1),
          minimumHoldMs: 3_200,
        },
      );
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
      let episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.outcome, "guest_departed");
      const departure = episode.events.find(
        (event) => event.kind === "departure",
      );
      assert.equal(departure?.payload.emptyChair, true);
      assert.equal(departure?.payload.microphoneRemains, true);
      assert.equal(departure?.payload.mugRemains, true);
      assert.equal(episode.warningCount, 1);
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
      episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "guest_departed");
      assert.match(episode.messages.at(-1)?.content ?? "", /left the studio/iu);
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
        durationMs: 6_000,
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
      source
        .prepare(
          `UPDATE botcast_episodes
            SET persona_reviewer_bot_id = 'host-1',
                persona_reviewer_name = 'Mara Vale', persona_rating = 2.9,
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
      importUserSnapshot(target, "user-1", snapshot, key);
      const restoredShow = getBotcastShow(target, "user-1", show.id);
      assert.equal(restoredShow.dayAtmosphere.imageId, "archive-day");
      assert.equal(restoredShow.nightAtmosphere.imageId, "archive-night");
      assert.equal(restoredShow.studioIdentity, show.studioIdentity);
      assert.deepEqual(restoredShow.dashboardBlurbs, show.dashboardBlurbs);
      assert.equal(restoredShow.introAudio.source, "elevenlabs");
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
          ...(readBotcastShowAtmosphereAudio(target, "user-1", show.id)
            ?.audioBytes ?? []),
        ],
        [6, 5, 4, 3],
      );
      assert.equal(
        restoredShow.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      const restored = getBotcastEpisode(target, "user-1", episode.id);
      assert.equal(restored.topic, "What survives an edit");
      assert.equal(restored.provider, "openai");
      assert.equal(restored.model, "gpt-archive");
      assert.equal(restored.responseMode, "auto");
      assert.equal(restored.durationMinutes, 12);
      assert.deepEqual(restored.personaReview, {
        reviewerBotId: "host-1",
        reviewerName: "Mara Vale",
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
      assert.ok(
        restored.events.some((event) => event.kind === "camera_suggestion"),
      );

      const legacySnapshot = structuredClone(snapshot);
      const legacyShow = legacySnapshot.botcast?.shows[0];
      if (legacyShow) delete legacyShow.fallbackStudioAccentVariant;
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
