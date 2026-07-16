import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  BOTCAST_FALLBACK_STUDIO_ACCENT_VARIANTS,
  botcastFallbackStudioAccentVariantForSeed,
  botcastReplayTimeline,
} from "@localai/shared";

import {
  advanceBotcastEpisode,
  createBotcastEpisode,
  createBotcastShow,
  deleteBotcastEpisode,
  deleteBotcastShow,
  generateBotcastShowIdentity,
  generateBotcastShowName,
  getBotcastEpisode,
  getBotcastShow,
  listBotcastEpisodes,
  nextBotcastFallbackStudioAccentVariant,
  updateBotcastShow,
} from "../botcast.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { initializeDatabase } from "../db.ts";
import { selectProvider, type LlmProvider, type ProviderMessage } from "../providers.ts";

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
): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages, options) {
      captures.push(messages);
      models.push(options.model);
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

describe("Botcast persistence and isolation", () => {
  it("randomly chooses from all three fallback accents without repeating the last show", () => {
    assert.equal(nextBotcastFallbackStudioAccentVariant(undefined, () => 0), 0);
    assert.equal(nextBotcastFallbackStudioAccentVariant(undefined, () => 0.34), 1);
    assert.equal(nextBotcastFallbackStudioAccentVariant(undefined, () => 0.99), 2);
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
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
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
      /route\("POST", "\/api\/botcast\/shows\/:id\/name"/u,
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
    assert.match(serverSource, /releaseImageSlotIfOwned\(userId, acquired\.job\.id\)/u);
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
      assert.match(show.dayAtmosphere.prompt, /render this one scene in natural daytime light/iu);
      assert.match(show.nightAtmosphere.prompt, /render this one scene at night/iu);
      assert.match(show.dayAtmosphere.prompt, /only one finished full-frame daytime studio/iu);
      assert.match(show.dayAtmosphere.prompt, /never create a diptych|split screen/iu);
      assert.match(show.nightAtmosphere.prompt, /never force a rainbow palette/iu);
      assert.doesNotMatch(show.dayAtmosphere.prompt, /daylight variant/iu);
      assert.doesNotMatch(show.nightAtmosphere.prompt, /nighttime variant/iu);
      assert.doesNotMatch(show.nightAtmosphere.prompt, /matched day and night studio pair/iu);
      assert.match(show.studioIdentity, /Mara Vale/iu);
      assert.match(show.studioIdentity, /forensic cultural critic/iu);
      assert.match(show.dayAtmosphere.prompt, /at least six concrete/iu);
      assert.match(show.nightAtmosphere.prompt, /at least six concrete/iu);
      assert.doesNotMatch(
        show.nightAtmosphere.prompt,
        /shallow walnut slat wall|pale acoustic-plaster wall|textured stone feature wall|warm gray ribbed wall/iu,
      );
      assert.equal(show.logo.status, "fallback");
      assert.match(show.logo.prompt, /Mara Vale/u);
      assert.match(show.logo.prompt, /never a profile picture/iu);
      assert.match(show.logo.prompt, /no person, face, head, eyes/iu);
      assert.match(show.logo.prompt, /recognition at 64 pixels/iu);
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
      assert.equal(createBotcastShow(db, "user-1", { hostBotId: "host-1" }).id, show.id);
      const inventorShow = createBotcastShow(db, "user-1", { hostBotId: "guest-1" });
      assert.notEqual(
        inventorShow.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.match(inventorShow.studioIdentity, /Ivo Stone/iu);
      assert.match(inventorShow.studioIdentity, /guarded inventor/iu);
      assert.notEqual(inventorShow.studioIdentity, show.studioIdentity);
      assert.notEqual(inventorShow.nightAtmosphere.prompt, show.nightAtmosphere.prompt);
    } finally {
      db.close();
    }
  });

  it("generates an editable host-shaped show identity and refreshes its visual prompts", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ['{"name":"The Vale Index","premise":"Precise conversations that inventory the stories culture tells itself.","studioIdentity":"A forensic archive organized around one long evidence table, annotated cultural ephemera, pinned redactions, specimen drawers, a magnifying lens, index cards, and one severe sculptural clock. Charcoal paper, smoked oak, and violet glass make the room feel analytical rather than cozy."}'],
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
      assert.equal(result.show.atmosphere.revision, 2);
      assert.equal(result.show.dayAtmosphere.revision, 2);
      assert.equal(result.show.nightAtmosphere.revision, 2);
      assert.match(result.show.studioIdentity, /forensic archive/iu);
      assert.ok(result.show.dayAtmosphere.prompt.includes(result.show.studioIdentity));
      assert.ok(result.show.nightAtmosphere.prompt.includes(result.show.studioIdentity));
      assert.match(result.show.dayAtmosphere.prompt, /annotated cultural ephemera/iu);
      assert.match(result.show.nightAtmosphere.prompt, /annotated cultural ephemera/iu);
      assert.match(result.show.dayAtmosphere.prompt, /identifiable as.*without.*name.*logo/iu);
      assert.match(result.show.nightAtmosphere.prompt, /identifiable as.*without.*name.*logo/iu);
      assert.equal(result.show.logo.revision, 2);
      assert.match(result.show.logo.prompt, /The Vale Index/u);
      assert.match(result.show.logo.prompt, /persona-specific visual idea/iu);
      assert.match(
        result.show.logo.prompt,
        /condenser microphone capsule|waveform|headphones|ON AIR lamp|tape reel/iu,
      );
      assert.match(result.show.logo.prompt, /fuse.*one clever.*symbol/iu);
      assert.match(result.show.logo.prompt, /never a profile picture/iu);
      assert.match(result.show.logo.prompt, /no person, face, head, eyes/iu);
      assert.match(result.show.logo.prompt, /recognition at 64 pixels/iu);
      assert.doesNotMatch(
        result.show.logo.prompt,
        /\bPRISM\b|rainbow|refraction|spectrum ray|five colors/iu,
      );
      assert.match(captures[0]?.[1]?.content ?? "", /forensic cultural critic/u);
      assert.match(captures[0]?.[0]?.content ?? "", /stand on its own without the host.?s name/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /reject generic patterns/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /double meaning|conceptual tension/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /studioIdentity/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /concrete artifacts/iu);
      const renamed = updateBotcastShow(db, "user-1", original.id, {
        name: "A User Chosen Name",
      });
      assert.equal(renamed.name, "A User Chosen Name");
    } finally {
      db.close();
    }
  });

  it("regenerates only the clever show name without touching its brand assets", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(['{"name":"The Unsaid Index"}'], captures);
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
      assert.match(captures[0]?.[0]?.content ?? "", /exactly one string: name/iu);
      assert.match(captures[0]?.[0]?.content ?? "", /reject generic patterns/iu);
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
      assert.notEqual(refreshedDay.dayAtmosphere.seed, pairReady.dayAtmosphere.seed);
      assert.deepEqual(refreshedDay.nightAtmosphere, pairReady.nightAtmosphere);
      assert.deepEqual(refreshedDay.logo, pairReady.logo);

      const refreshedNight = updateBotcastShow(db, "user-1", show.id, {
        regenerateNightAtmosphere: true,
      });
      assert.deepEqual(refreshedNight.dayAtmosphere, refreshedDay.dayAtmosphere);
      assert.equal(refreshedNight.nightAtmosphere.revision, 2);
      assert.equal(refreshedNight.nightAtmosphere.imageUrl, "/images/night.png");
      assert.equal(refreshedNight.nightAtmosphere.imageId, "night-image");
      assert.equal(refreshedNight.nightAtmosphere.status, "ready");
      assert.notEqual(refreshedNight.nightAtmosphere.seed, pairReady.nightAtmosphere.seed);
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
      assert.match(fallback.prompt, /microphone|waveform|dial|sound/iu);
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
    const provider = recordingProvider(["PRIOR_EPISODE_MARKER", "Fresh opening"], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First topic",
      });
      await advanceBotcastEpisode(db, "user-1", first.id, {}, generation(provider));
      const second = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second topic",
      });
      await advanceBotcastEpisode(db, "user-1", second.id, {}, generation(provider));
      const secondPrompt = captures[1]!.map((message) => message.content).join("\n");
      assert.doesNotMatch(secondPrompt, /PRIOR_EPISODE_MARKER/u);
      assert.match(secondPrompt, /Second topic/u);
      assert.match(secondPrompt, /meeting for the first time/u);
      for (const table of [
        "memories",
        "memory_summaries",
        "bot_relationships",
        "coffee_bot_social_state",
      ]) {
        const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
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
      ["[sighs] Welcome to the difficult part. [laughs]"],
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
        {
          ...generation(provider),
          immersiveVoiceEffectsEnabled: true,
        },
      );
      assert.equal(advanced.message?.content, "Welcome to the difficult part.");
      assert.equal(
        advanced.message?.voicePerformanceText,
        "[sighs] Welcome to the difficult part. [laughs]",
      );
      assert.equal(
        getBotcastEpisode(db, "user-1", episode.id).messages[0]
          ?.voicePerformanceText,
        "[sighs] Welcome to the difficult part. [laughs]",
      );
      const prompt = captures[0]!.map((message) => message.content).join("\n");
      assert.match(prompt, /Use only these exact square-bracket tags/u);
      assert.match(prompt, /most lines should have no tag/u);
    } finally {
      db.close();
    }
  });

  it("strips stray vocal tags when Signal immersion is disabled", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["[coughs] A clean system line."], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Clean fallback speech",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(advanced.message?.content, "A clean system line.");
      assert.equal(advanced.message?.voicePerformanceText, null);
      const prompt = captures[0]!.map((message) => message.content).join("\n");
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
    const provider = recordingProvider(["Host opening", "Guest reply"], captures, models);
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
      assert.equal(listBotcastEpisodes(db, "user-1", show.id)[0]?.model, "gpt-signal");

      const generationOptions = {
        preferredProvider: "local" as const,
        preferredLocalModel: "account-model-changed-later",
        providerFactory,
      };
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generationOptions);

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

      const result = await advanceBotcastEpisode(db, "user-1", episode.id, {}, {
        preferredProvider: "local",
        providerFactory,
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "openai", model: "gpt-signal-fallback" },
            { provider: "anthropic", model: "claude-signal-fallback" },
          ],
        },
      });

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

  it("deletes one episode and cascades its private production records", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["A line bound for deletion."], captures);
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
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));

      assert.equal(deleteBotcastEpisode(db, "another-user", episode.id), false);
      assert.equal(getBotcastEpisode(db, "user-1", episode.id).messages.length, 1);
      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), true);
      assert.throws(
        () => getBotcastEpisode(db, "user-1", episode.id),
        /Signal episode not found/u,
      );
      const episodeCount = db.prepare(
        "SELECT COUNT(*) AS count FROM botcast_episodes WHERE id = ?",
      ).get(episode.id) as { count: number };
      assert.equal(episodeCount.count, 0);
      for (const table of ["botcast_episode_segments", "botcast_messages", "botcast_events"]) {
        const count = db.prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE episode_id = ?`,
        ).get(episode.id) as { count: number };
        assert.equal(count.count, 0, `${table} should not retain deleted episode rows`);
      }
      assert.equal(getBotcastEpisode(db, "user-1", sibling.id).topic, "A recording that stays");
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
        const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        };
        assert.equal(count.count, 0, `${table} should be empty after show deletion`);
      }
    } finally {
      db.close();
    }
  });

  it("strips an actual bot-name label from generated dialogue", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(['"Mara Vale: Welcome to the signal."'], captures);
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
      assert.equal(advanced.message?.content, "Welcome to the signal.");
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
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      // Reach the ordinary closing threshold on the second warning exchange so
      // the third cue proves pending departure wins over turn-count completion.
      for (let neutralTurn = 0; neutralTurn < 4; neutralTurn += 1) {
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      for (let pressure = 0; pressure < 3; pressure += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          { cue: { kind: "press_harder" } },
          generation(provider),
        );
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      let episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.outcome, "guest_departed");
      const departure = episode.events.find((event) => event.kind === "departure");
      assert.equal(departure?.payload.emptyChair, true);
      assert.equal(departure?.payload.microphoneRemains, true);
      assert.equal(departure?.payload.mugRemains, true);
      assert.equal(episode.warningCount, 1);
      assert.equal(
        episode.messages.some((message) => /producer/iu.test(message.content)),
        false,
      );
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
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
      Array.from({ length: 11 }, (_, index) => `Episode line ${index + 1}.`),
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A complete interview",
      });
      for (let turn = 0; turn < 12; turn += 1) {
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      const episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "completed");
      assert.equal(episode.messages.length, 11);
      assert.equal(episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(episode.segments.at(-1)?.segment, "closing");
      assert.equal(
        episode.runtimeMs,
        botcastReplayTimeline(episode.messages, episode.events).durationMs,
      );
      assert.ok(episode.events.some((event) => event.kind === "episode_completed"));
    } finally {
      db.close();
    }
  });

  it("round-trips shows, episodes, transcript, and director events through account backup", async () => {
    const source = fixture();
    const target = fixture();
    const legacyTarget = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["[sighs] Welcome to the archive."], captures);
    try {
      const createdShow = createBotcastShow(source, "user-1", { hostBotId: "host-1" });
      const show = updateBotcastShow(source, "user-1", createdShow.id, {
        dayAtmosphereImageUrl: "/images/archive-day.png",
        dayAtmosphereImageId: "archive-day",
        nightAtmosphereImageUrl: "/images/archive-night.png",
        nightAtmosphereImageId: "archive-night",
      });
      const episode = createBotcastEpisode(source, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What survives an edit",
        preferredProvider: "openai",
        modelOverride: "gpt-archive",
        responseMode: "auto",
      });
      await advanceBotcastEpisode(source, "user-1", episode.id, {}, {
        ...generation(provider),
        immersiveVoiceEffectsEnabled: true,
        autoFallbackChain: {
          v: 1,
          fallbacks: [
            { provider: "local", model: "qwen-signal-fallback" },
            { provider: "anthropic", model: "claude-signal-fallback" },
          ],
        },
      });
      const key = Buffer.alloc(32, 7);
      const snapshot = exportUserSnapshot(source, "user-1", key);
      assert.equal(snapshot.botcast?.shows.length, 1);
      assert.equal(
        snapshot.botcast?.shows[0]?.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      assert.equal(snapshot.botcast?.events.length, 4);
      assert.equal(snapshot.botcast?.episodes[0]?.provider, "openai");
      assert.equal(snapshot.botcast?.episodes[0]?.model, "gpt-archive");
      assert.equal(snapshot.botcast?.episodes[0]?.responseMode, "auto");
      assert.equal(
        snapshot.botcast?.messages[0]?.voicePerformanceText,
        "[sighs] Welcome to the archive.",
      );
      importUserSnapshot(target, "user-1", snapshot, key);
      const restoredShow = getBotcastShow(target, "user-1", show.id);
      assert.equal(restoredShow.dayAtmosphere.imageId, "archive-day");
      assert.equal(restoredShow.nightAtmosphere.imageId, "archive-night");
      assert.equal(restoredShow.studioIdentity, show.studioIdentity);
      assert.equal(
        restoredShow.fallbackStudioAccentVariant,
        show.fallbackStudioAccentVariant,
      );
      const restored = getBotcastEpisode(target, "user-1", episode.id);
      assert.equal(restored.topic, "What survives an edit");
      assert.equal(restored.provider, "openai");
      assert.equal(restored.model, "gpt-archive");
      assert.equal(restored.responseMode, "auto");
      assert.equal(restored.messages[0]?.content, "Welcome to the archive.");
      assert.equal(
        restored.messages[0]?.voicePerformanceText,
        "[sighs] Welcome to the archive.",
      );
      assert.ok(restored.events.some((event) => event.kind === "camera_suggestion"));

      const legacySnapshot = structuredClone(snapshot);
      const legacyShow = legacySnapshot.botcast?.shows[0];
      if (legacyShow) delete legacyShow.fallbackStudioAccentVariant;
      const legacyEpisode = legacySnapshot.botcast?.episodes[0];
      if (legacyEpisode) delete legacyEpisode.responseMode;
      importUserSnapshot(legacyTarget, "user-1", legacySnapshot, key);
      assert.equal(
        getBotcastShow(legacyTarget, "user-1", show.id).fallbackStudioAccentVariant,
        botcastFallbackStudioAccentVariantForSeed(show.id),
      );
      assert.equal(
        getBotcastEpisode(legacyTarget, "user-1", episode.id).responseMode,
        "online",
      );
    } finally {
      source.close();
      target.close();
      legacyTarget.close();
    }
  });
});
