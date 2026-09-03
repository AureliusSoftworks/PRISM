import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeBotGeneratedDraftV1 } from "@localai/shared";
import {
  PRISM_CAPABILITY_COVERAGE_MANIFEST,
  createPrismDomainCapabilityRegistry,
} from "../prism-domain-capabilities.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";
import {
  buildGeneratedImageRelativePath,
  readGeneratedImageBytes,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

function fixture() {
  const db = createTestDatabase();
  const now = "2026-07-26T01:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       preferred_provider, auto_switch_model, created_at, last_active_at)
     VALUES ('u1', 'domain@example.com', 'Domain', 'hash', 'salt',
             'cipher', 'iv', 'tag', 'online', 0, ?, ?)`,
  ).run(now, now);
  for (const [id, name] of [
    ["host", "Rick"],
    ["guest", "Vader"],
  ]) {
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES (?, 'u1', ?, '', ?, ?)`,
    ).run(id, name, now, now);
  }
  db.prepare(
    `INSERT INTO botcast_shows
      (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
       created_at, updated_at)
     VALUES ('show', 'u1', 'host', 'Rick’s Podcast', 'Odd interviews',
             'wry', '#abcdef', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO botcast_episodes
      (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind,
       guest_name, title, topic, status, started_at, completed_at,
       created_at, updated_at)
     VALUES ('episode', 'u1', 'show', 'host', 'guest', 'bot', 'Vader',
             'The Pinecone Doctrine', 'Pinecones', 'completed', ?, ?, ?, ?)`,
  ).run(now, now, now, now);
  db.prepare(
    `INSERT INTO botcast_messages
      (id, user_id, episode_id, speaker_role, bot_id, content, created_at)
     VALUES ('message', 'u1', 'episode', 'host', 'host',
             'Why pinecones?', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO replay_recordings
      (id, user_id, surface, source_id, created_at, updated_at)
     VALUES ('recording', 'u1', 'signal', 'episode', ?, ?)`,
  ).run(now, now);
  return db;
}

function context(db: ReturnType<typeof fixture>) {
  return {
    db,
    userId: "u1",
    userKey: Buffer.alloc(32, 9),
    source: "prism" as const,
    surfaceId: "signal" as const,
    hardLocal: false,
    live: false,
    now: new Date("2026-07-26T02:00:00.000Z"),
  };
}

describe("Prism Signal domain capabilities", () => {
  it("stages a synthesized booking and journals the shared episode creation path", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry({
        generateSignalBooking: async () => ({
          topic: "Sith Stand-Up",
          producerBrief:
            "Press the guest on whether intimidation can survive a punchline.",
          provider: "local",
          model: "llama3.2",
        }),
      });
      const stagedProposal = registry.createProposal({
        context: context(db),
        capabilityId: "signal.episode.stage",
        input: {
          showId: "show",
          guestBotId: "guest",
          direction: "Make it funny.",
        },
      });
      assert.equal(stagedProposal.confirmation, "explicit-confirmation");
      const staged = await registry.executeProposal({
        context: context(db),
        proposalId: stagedProposal.id,
        confirmation: true,
        idempotencyKey: "stage-signal",
      });
      assert.equal(staged.status, "committed", staged.error ?? undefined);
      assert.equal(
        (
          staged.result as {
            navigation: { autoStart: boolean; topic: string };
          }
        ).navigation.autoStart,
        true,
      );

      const createProposal = registry.createProposal({
        context: context(db),
        capabilityId: "signal.episode.create",
        input: {
          showId: "show",
          guestKind: "bot",
          guestBotId: "guest",
          topic: "Sith Stand-Up",
          producerBrief: "Keep it funny.",
          guestBrief: "You know the punchline is a confession.",
          preferredProvider: "local",
          responseMode: "local",
          modelOverride: "llama3.2",
          durationMinutes: null,
        },
      });
      const created = await registry.executeProposal({
        context: context(db),
        proposalId: createProposal.id,
        confirmation: true,
        idempotencyKey: "create-signal",
      });
      assert.equal(created.status, "committed", created.error ?? undefined);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM botcast_episodes WHERE user_id = 'u1'",
            )
            .get() as { count: number }
        ).count,
        2,
      );
      const storedEpisode = db
        .prepare(
          "SELECT playback_mode AS playbackMode, guest_brief AS guestBrief FROM botcast_episodes WHERE topic = 'Sith Stand-Up'",
        )
        .get() as { playbackMode: string; guestBrief: string };
      assert.equal(storedEpisode.playbackMode, "live");
      assert.equal(
        storedEpisode.guestBrief,
        "You know the punchline is a confession.",
      );
      assert.equal(
        registry.undo({ context: context(db), runId: created.id }).status,
        "undone",
      );

      const watchProposal = registry.createProposal({
        context: context(db),
        capabilityId: "signal.episode.create",
        input: {
          showId: "show",
          guestKind: "bot",
          guestBotId: "guest",
          topic: "Watch Bake Smoke",
          producerBrief: "Sit back.",
          preferredProvider: "local",
          responseMode: "local",
          modelOverride: "llama3.2",
          durationMinutes: null,
          playbackMode: "watch",
        },
      });
      const watched = await registry.executeProposal({
        context: context(db),
        proposalId: watchProposal.id,
        confirmation: true,
        idempotencyKey: "create-signal-watch",
      });
      assert.equal(watched.status, "committed", watched.error ?? undefined);
      assert.equal(
        (
          db
            .prepare(
              "SELECT playback_mode AS playbackMode FROM botcast_episodes WHERE topic = 'Watch Bake Smoke'",
            )
            .get() as { playbackMode: string }
        ).playbackMode,
        "watch",
      );
      assert.equal(
        registry.undo({ context: context(db), runId: watched.id }).status,
        "undone",
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("quarantines episodes and replay state, then restores both", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO memories
          (id, user_id, conversation_id, bot_id, target_bot_id, ciphertext, iv,
           tag, confidence, category, tier, durability, source, certainty,
           source_message_ids, created_at)
         VALUES ('signal-memory', 'u1', NULL, 'host', 'guest', 'cipher', 'iv',
                 'tag', 0.98, 'bot_relation', 'long_term', 0.95, 'direct',
                 0.98, '["message"]', '2026-07-26T01:00:00.000Z')`,
      ).run();
      const registry = createPrismDomainCapabilityRegistry();
      const proposal = registry.createProposal({
        context: context(db),
        capabilityId: "signal.episodes.delete",
        input: { showId: "show", episodeIds: ["episode"] },
      });
      assert.equal(proposal.confirmation, "explicit-confirmation");
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "delete-show-episodes",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM botcast_episodes").get() as {
            count: number;
          }
        ).count,
        0,
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM replay_recordings").get() as {
            count: number;
          }
        ).count,
        0,
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM memories").get() as {
            count: number;
          }
        ).count,
        0,
      );
      const undone = registry.undo({ context: context(db), runId: run.id });
      assert.equal(undone.status, "undone", undone.error ?? undefined);
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM botcast_episodes").get() as {
            count: number;
          }
        ).count,
        1,
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM replay_recordings").get() as {
            count: number;
          }
        ).count,
        1,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("exports the latest completed transcript as Slate material and undoes", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry();
      const proposal = registry.createProposal({
        context: context(db),
        capabilityId: "signal.latest.export-to-slate",
        input: { showId: "show" },
      });
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "signal-to-slate",
      });
      assert.equal(run.status, "committed");
      const project = db
        .prepare(
          "SELECT title_origin, manuscript, premise FROM slate_projects WHERE user_id = 'u1'",
        )
        .get() as {
        title_origin: string;
        manuscript: string;
        premise: string;
      };
      assert.equal(project.title_origin, "material");
      assert.match(project.manuscript, /Rick: Why pinecones\?/u);
      assert.match(project.premise, /episode/u);
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM slate_projects").get() as {
            count: number;
          }
        ).count,
        0,
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism Marketplace capability", () => {
  it("installs one exact bundled bot into server-backed Library state and undoes it", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO users
          (id, email, display_name, password_hash, password_salt,
           wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
           created_at, last_active_at)
         VALUES ('u2', 'marketplace-u2@example.com', 'Marketplace U2', 'hash',
                 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
      ).run("2026-07-26T01:00:00.000Z", "2026-07-26T01:00:00.000Z");
      const registry = createPrismDomainCapabilityRegistry();
      const marketplaceContext = {
        ...context(db),
        surfaceId: "marketplace" as const,
      };
      const proposal = await registry.createPreparedProposal({
        context: marketplaceContext,
        capabilityId: "marketplace.install",
        input: {
          query: "Install Silent Jack from the Marketplace",
        },
      });
      assert.equal(proposal.confirmation, "preview");
      assert.equal(proposal.preview.targets.length, 1);
      assert.match(proposal.preview.summary, /Silent Simon/u);

      const run = await registry.executeProposal({
        context: marketplaceContext,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "marketplace-silent-jack",
      });
      assert.equal(run.status, "committed");
      assert.equal(run.affectedEntities.length, 1);
      const installed = db
        .prepare(
          "SELECT id, export_hash FROM bots WHERE user_id = 'u1' AND name = 'Silent Simon'",
        )
        .get() as { id: string; export_hash: string };
      assert.match(installed.export_hash, /^[a-f0-9]{32}$/u);
      assert.equal(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS n
                 FROM library_group_members
                WHERE user_id = 'u1' AND bot_id = ?`,
            )
            .get(installed.id) as { n: number }
        ).n,
        1,
      );

      const secondOwnerContext = {
        ...marketplaceContext,
        userId: "u2",
        userKey: Buffer.alloc(32, 10),
      };
      const secondProposal = await registry.createPreparedProposal({
        context: secondOwnerContext,
        capabilityId: "marketplace.install",
        input: { query: "Install Silent Jack from the Marketplace" },
      });
      const secondRun = await registry.executeProposal({
        context: secondOwnerContext,
        proposalId: secondProposal.id,
        confirmation: true,
        idempotencyKey: "marketplace-silent-jack-u2",
      });
      assert.equal(secondRun.status, "committed");
      const secondInstalled = db
        .prepare(
          "SELECT id, export_hash FROM bots WHERE user_id = 'u2' AND name = 'Silent Simon'",
        )
        .get() as { id: string; export_hash: string };
      assert.notEqual(secondInstalled.id, installed.id);
      assert.equal(secondInstalled.export_hash, installed.export_hash);

      const undone = registry.undo({
        context: {
          ...marketplaceContext,
          now: new Date("2026-07-26T03:00:00.000Z"),
        },
        runId: run.id,
      });
      if (undone.status !== "undone") {
        assert.fail(JSON.stringify(undone));
      }
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM bots WHERE user_id = 'u1' AND id = ?",
            )
            .get(installed.id) as { n: number }
        ).n,
        0,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM bots WHERE user_id = 'u2' AND id = ?",
            )
            .get(secondInstalled.id) as { n: number }
        ).n,
        1,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("keeps every declared product surface covered or explicitly human-only", () => {
    for (const [surface, entries] of Object.entries(
      PRISM_CAPABILITY_COVERAGE_MANIFEST,
    )) {
      assert.ok(entries.length > 0, surface);
      assert.equal(
        entries.some((entry) => entry.startsWith("planned:")),
        false,
        surface,
      );
    }
  });
});

describe("Prism account-settings capability", () => {
  it("routes ordinary Settings UI fields through the shared journal and undo", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry({
        primaryOllamaHost: "http://127.0.0.1:11434",
      });
      const context = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 7),
        source: "ui" as const,
        surfaceId: "settings" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T03:30:00.000Z"),
      };
      const proposal = registry.createProposal({
        context,
        capabilityId: "settings.fields.update",
        input: {
          patch: {
            theme: "dark",
            atmosphereStyle: "sanctuary",
            hubAtmosphereEnabled: false,
          },
        },
      });
      assert.equal(proposal.preview.diffs.length >= 1, true);

      const run = await registry.executeProposal({
        context,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "settings-ui-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      const saved = db
        .prepare(
          "SELECT theme, atmosphere_style, hub_atmosphere_enabled FROM users WHERE id = 'u1'",
        )
        .get() as {
        theme: string;
        atmosphere_style: string;
        hub_atmosphere_enabled: number;
      };
      assert.equal(saved.theme, "dark");
      assert.equal(saved.atmosphere_style, "sanctuary");
      assert.equal(saved.hub_atmosphere_enabled, 0);

      const undone = registry.undo({
        context: {
          ...context,
          now: new Date("2026-07-26T03:31:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      const restored = db
        .prepare(
          "SELECT theme, atmosphere_style, hub_atmosphere_enabled FROM users WHERE id = 'u1'",
        )
        .get() as {
        theme: string;
        atmosphere_style: string;
        hub_atmosphere_enabled: number;
      };
      assert.equal(restored.theme, "system");
      assert.equal(restored.atmosphere_style, "prismatic");
      assert.equal(restored.hub_atmosphere_enabled, 1);
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism Bot and Avatar Studio field capability", () => {
  it("journals Default Prism customization and restores its prior appearance", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry();
      const capabilityContext = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 8),
        source: "ui" as const,
        surfaceId: "avatar-studio" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T03:35:00.000Z"),
      };
      const previous = db
        .prepare(
          `SELECT prism_default_bot_face_eye_count,
                  prism_default_bot_face_eye_spacing,
                  prism_default_bot_face_eye_offset_x
             FROM users
            WHERE id = 'u1'`,
        )
        .get() as {
        prism_default_bot_face_eye_count: number | null;
        prism_default_bot_face_eye_spacing: number | null;
        prism_default_bot_face_eye_offset_x: number | null;
      };
      const proposal = registry.createProposal({
        context: capabilityContext,
        capabilityId: "default-bot.fields.update",
        input: {
          patch: {
            faceEyeCount: 2,
            faceEyeSpacing: 0.52,
            faceEyeOffsetX: 0.12,
          },
        },
      });
      const run = await registry.executeProposal({
        context: capabilityContext,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "default-bot-ui-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      const saved = db
        .prepare(
          `SELECT prism_default_bot_face_eye_count,
                  prism_default_bot_face_eye_spacing,
                  prism_default_bot_face_eye_offset_x
             FROM users
            WHERE id = 'u1'`,
        )
        .get() as {
        prism_default_bot_face_eye_count: number;
        prism_default_bot_face_eye_spacing: number;
        prism_default_bot_face_eye_offset_x: number;
      };
      assert.equal(saved.prism_default_bot_face_eye_count, 2);
      assert.equal(saved.prism_default_bot_face_eye_spacing, 0.52);
      assert.equal(saved.prism_default_bot_face_eye_offset_x, 0.12);

      const undone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T03:36:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      const restored = db
        .prepare(
          `SELECT prism_default_bot_face_eye_count,
                  prism_default_bot_face_eye_spacing,
                  prism_default_bot_face_eye_offset_x
             FROM users
            WHERE id = 'u1'`,
        )
        .get() as {
        prism_default_bot_face_eye_count: number | null;
        prism_default_bot_face_eye_spacing: number | null;
        prism_default_bot_face_eye_offset_x: number | null;
      };
      assert.deepEqual(restored, previous);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("revision-checks an ordinary editor patch and restores every prior field", async () => {
    const db = fixture();
    try {
      db.prepare("UPDATE bots SET accent_color = '#00ff00' WHERE id = 'host'").run();
      let profileRefreshes = 0;
      const registry = createPrismDomainCapabilityRegistry({
        onBotProfileChanged: () => {
          profileRefreshes += 1;
        },
      });
      const context = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 8),
        source: "ui" as const,
        surfaceId: "avatar-studio" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T03:40:00.000Z"),
      };
      const previous = db
        .prepare(
          "SELECT name, face_eye_offset_x, accent_color, updated_at FROM bots WHERE id = 'host'",
        )
        .get() as {
        name: string;
        face_eye_offset_x: number | null;
        accent_color: string | null;
        updated_at: string;
      };
      const proposal = registry.createProposal({
        context,
        capabilityId: "bots.fields.update",
        input: {
          botId: "host",
          expectedRevision: previous.updated_at,
          patch: {
            name: "Rick One-Eye",
            faceEyeOffsetX: 0.12,
            accentColor: "#7799aa",
          },
        },
      });
      const run = await registry.executeProposal({
        context,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "bot-ui-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      const saved = db
        .prepare(
          "SELECT name, face_eye_offset_x, accent_color, updated_at FROM bots WHERE id = 'host'",
        )
        .get() as {
        name: string;
        face_eye_offset_x: number | null;
        accent_color: string | null;
        updated_at: string;
      };
      assert.equal(saved.name, "Rick One-Eye");
      assert.equal(saved.face_eye_offset_x, 0.12);
      assert.equal(saved.accent_color, "#22b5ff");
      assert.notEqual(saved.updated_at, previous.updated_at);
      assert.equal(profileRefreshes, 1);

      const undone = registry.undo({
        context: {
          ...context,
          now: new Date("2026-07-26T03:41:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      const restored = db
        .prepare(
          "SELECT name, face_eye_offset_x, accent_color, updated_at FROM bots WHERE id = 'host'",
        )
        .get() as {
          name: string;
          face_eye_offset_x: number | null;
          accent_color: string | null;
          updated_at: string;
        };
      assert.equal(restored.name, previous.name);
      assert.equal(restored.face_eye_offset_x, previous.face_eye_offset_x);
      assert.equal(restored.accent_color, previous.accent_color);
      assert.equal(profileRefreshes, 2);

      const clearProposal = registry.createProposal({
        context,
        capabilityId: "bots.fields.update",
        input: {
          botId: "host",
          expectedRevision: restored.updated_at,
          patch: { accentColor: null },
        },
      });
      const cleared = await registry.executeProposal({
        context,
        proposalId: clearProposal.id,
        confirmation: true,
        idempotencyKey: "bot-ui-accent-auto",
      });
      assert.equal(cleared.status, "committed", cleared.error ?? "");
      assert.equal(
        (db.prepare("SELECT accent_color FROM bots WHERE id = 'host'").get() as {
          accent_color: string | null;
        }).accent_color,
        null,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("quarantines an unprotected bot and restores its identity on undo", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry();
      const context = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 9),
        source: "prism" as const,
        surfaceId: "avatar-studio" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T03:45:00.000Z"),
      };
      const revision = (
        db
          .prepare("SELECT updated_at FROM bots WHERE id = 'guest'")
          .get() as { updated_at: string }
      ).updated_at;
      const proposal = registry.createProposal({
        context,
        capabilityId: "bots.delete",
        input: { botId: "guest", expectedRevision: revision },
      });
      assert.equal(proposal.confirmation, "explicit-confirmation");
      const run = await registry.executeProposal({
        context,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "delete-bot-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM bots WHERE id = 'guest'")
            .get() as { count: number }
        ).count,
        0,
      );

      const undone = registry.undo({
        context: {
          ...context,
          now: new Date("2026-07-26T03:46:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      assert.equal(
        (
          db
            .prepare("SELECT name FROM bots WHERE id = 'guest'")
            .get() as { name: string }
        ).name,
        "Vader",
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism Story capability", () => {
  it("starts a Story through the shared hybrid action and undoes the session", async () => {
    const db = fixture();
    try {
      const createdAt = "2026-07-26T03:48:00.000Z";
      const registry = createPrismDomainCapabilityRegistry({
        startStorySession: async (context, input) => {
          context.db
            .prepare(
              `INSERT INTO story_sessions
                (id, user_id, title, status, provider, bot_ids,
                 transcript_json, created_at, updated_at)
               VALUES ('story-new', ?, 'A New Story', 'generating', 'local',
                       ?, '[]', ?, ?)`,
            )
            .run(
              context.userId,
              JSON.stringify(input.botIds),
              createdAt,
              createdAt,
            );
          return {
            id: "story-new",
            title: "A New Story",
            status: "generating",
            updatedAt: createdAt,
          };
        },
      });
      const capabilityContext = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 6),
        source: "ui" as const,
        surfaceId: "story" as const,
        hardLocal: true,
        live: false,
        now: new Date("2026-07-26T03:48:00.000Z"),
      };
      const proposal = registry.createProposal({
        context: capabilityContext,
        capabilityId: "story.session.create",
        input: {
          botIds: ["host", "guest"],
          premise: "An ironic archive.",
        },
      });
      const run = await registry.executeProposal({
        context: capabilityContext,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "story-create-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      assert.equal(
        (
          db
            .prepare(
              "SELECT status FROM story_sessions WHERE id = 'story-new'",
            )
            .get() as { status: string }
        ).status,
        "generating",
      );
      const undone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T03:49:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      assert.equal(
        db
          .prepare("SELECT id FROM story_sessions WHERE id = 'story-new'")
          .get(),
        undefined,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("quarantines an owned Story session and restores its exact row", async () => {
    const db = fixture();
    try {
      const createdAt = "2026-07-26T03:50:00.000Z";
      db.prepare(
        `INSERT INTO story_sessions
          (id, user_id, title, status, provider, bot_ids, transcript_json,
           created_at, updated_at)
         VALUES ('story', 'u1', 'The Glass Archive', 'complete', 'local',
                 '["host","guest"]', '[]', ?, ?)`,
      ).run(createdAt, createdAt);
      db.prepare(
        `INSERT INTO memories
          (id, user_id, conversation_id, bot_id, ciphertext, iv, tag,
           confidence, category, tier, durability, source, certainty,
           source_message_ids, created_at)
         VALUES ('story-memory', 'u1', 'story', 'host', 'cipher', 'iv', 'tag',
                 0.85, 'user', 'short_term', 0.7, 'direct', 0.85, '[]', ?)`,
      ).run(createdAt);
      const registry = createPrismDomainCapabilityRegistry();
      const capabilityContext = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 6),
        source: "ui" as const,
        surfaceId: "story" as const,
        hardLocal: true,
        live: false,
        now: new Date("2026-07-26T03:51:00.000Z"),
      };
      const proposal = registry.createProposal({
        context: capabilityContext,
        capabilityId: "story.session.delete",
        input: {
          sessionId: "story",
          expectedRevision: createdAt,
        },
      });
      assert.equal(proposal.confirmation, "explicit-confirmation");
      const run = await registry.executeProposal({
        context: capabilityContext,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "story-delete-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM story_sessions WHERE id = 'story'",
            )
            .get() as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM memories WHERE id = 'story-memory'")
            .get() as { count: number }
        ).count,
        0,
      );
      const undone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T03:52:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      const restored = db
        .prepare(
          "SELECT title, status, updated_at FROM story_sessions WHERE id = 'story'",
        )
        .get() as { title: string; status: string; updated_at: string };
      assert.equal(restored.title, "The Glass Archive");
      assert.equal(restored.status, "complete");
      assert.equal(restored.updated_at, createdAt);
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism Slate project capabilities", () => {
  it("creates and updates Slate through reversible shared actions", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry();
      const capabilityContext = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 5),
        source: "ui" as const,
        surfaceId: "slate" as const,
        hardLocal: true,
        live: false,
        now: new Date("2026-07-26T04:00:00.000Z"),
      };
      const createProposal = registry.createProposal({
        context: capabilityContext,
        capabilityId: "slate.project.create",
        input: {
          title: "Pinecone Doctrine",
          spark: "A dry comedy about the politics of pinecones.",
        },
      });
      const created = await registry.executeProposal({
        context: capabilityContext,
        proposalId: createProposal.id,
        confirmation: true,
        idempotencyKey: "slate-create-1",
      });
      assert.equal(created.status, "committed", created.error ?? "");
      const project = db
        .prepare(
          "SELECT id, title, premise, updated_at FROM slate_projects WHERE user_id = 'u1'",
        )
        .get() as {
        id: string;
        title: string;
        premise: string;
        updated_at: string;
      };
      assert.equal(project.title, "Pinecone Doctrine");

      const updateContext = {
        ...capabilityContext,
        now: new Date("2026-07-26T04:01:00.000Z"),
      };
      const updateProposal = registry.createProposal({
        context: updateContext,
        capabilityId: "slate.project.fields.update",
        input: {
          projectId: project.id,
          expectedRevision: project.updated_at,
          patch: { premise: "No one agrees who owns the cone." },
        },
      });
      const updated = await registry.executeProposal({
        context: updateContext,
        proposalId: updateProposal.id,
        confirmation: true,
        idempotencyKey: "slate-update-1",
      });
      assert.equal(updated.status, "committed", updated.error ?? "");
      assert.equal(
        (
          db
            .prepare("SELECT premise FROM slate_projects WHERE id = ?")
            .get(project.id) as { premise: string }
        ).premise,
        "No one agrees who owns the cone.",
      );

      const updateUndone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T04:02:00.000Z"),
        },
        runId: updated.id,
      });
      assert.equal(updateUndone.status, "undone", updateUndone.error ?? "");
      assert.equal(
        (
          db
            .prepare("SELECT premise FROM slate_projects WHERE id = ?")
            .get(project.id) as { premise: string }
        ).premise,
        "",
      );

      const createUndone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T04:03:00.000Z"),
        },
        runId: created.id,
      });
      assert.equal(createUndone.status, "undone", createUndone.error ?? "");
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM slate_projects WHERE id = ?",
            )
            .get(project.id) as { count: number }
        ).count,
        0,
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism Image Library capability", () => {
  it("protects room assets owned by a saved Whodunnit mansion", () => {
    const db = fixture();
    try {
      const createdAt = "2026-08-25T21:00:00.000Z";
      db.prepare(
        `INSERT INTO images
          (id, user_id, bot_id, prompt, url, provider, model, purpose, origin,
           created_at)
         VALUES ('mansion-room-image', 'u1', NULL, 'A coherent mansion room',
                 '/api/images/mansion-room-image/file', 'local', 'local-image',
                 'debate_mystery_room', 'debate', ?)`,
      ).run(createdAt);
      db.prepare(
        `INSERT INTO debate_mystery_mansion_bundles
          (id, user_id, source_session_id, name, floors, total_rooms,
           suspect_count, style_json, layout_json, created_at, updated_at)
         VALUES ('mansion-1', 'u1', NULL, 'Saved observatory mansion', 1, 1,
                 1, ?, ?, ?, ?)`,
      ).run(
        JSON.stringify({ version: 1, id: "style-1", label: "Observatory", promptContract: "One coherent house." }),
        JSON.stringify([{ id: "room-1", templateId: "observatory", name: "Observatory", floor: 1, x: 0, y: 0, width: 1, height: 1, neighborIds: [], assignedSuspectSeatId: "suspect-1", emoji: "◇", imageId: "mansion-room-image", bundledAssetPath: null }]),
        createdAt,
        createdAt,
      );
      db.prepare(
        `INSERT INTO debate_mystery_mansion_bundle_assets
          (bundle_id, user_id, room_id, image_id, created_at)
         VALUES ('mansion-1', 'u1', 'room-1', 'mansion-room-image', ?)`,
      ).run(createdAt);

      const registry = createPrismDomainCapabilityRegistry();
      assert.throws(
        () =>
          registry.createProposal({
            context: context(db),
            capabilityId: "images.delete",
            input: { imageId: "mansion-room-image" },
          }),
        /still used by Saved Whodunnit mansion/u,
      );
      assert.ok(db.prepare("SELECT id FROM images WHERE id = 'mansion-room-image'").get());
    } finally {
      closeTestDatabase(db);
    }
  });

  it("blocks legacy single-image deletion when the reusable asset is still in use", () => {
    const db = fixture();
    try {
      const createdAt = "2026-07-26T04:05:00.000Z";
      db.prepare(
        `INSERT INTO images
          (id, user_id, bot_id, prompt, url, provider, model, purpose, origin,
           created_at)
         VALUES ('image-in-use', 'u1', 'host', 'A reusable pinecone portrait',
                 '/api/images/image-in-use/file', 'openai', 'gpt-image-2',
                 'gallery', 'images_panel', ?)`,
      ).run(createdAt);
      db.prepare(
        `UPDATE bots
            SET profile_picture_image_id = 'image-in-use'
          WHERE id = 'host' AND user_id = 'u1'`,
      ).run();

      const registry = createPrismDomainCapabilityRegistry();
      assert.throws(
        () =>
          registry.createProposal({
            context: context(db),
            capabilityId: "images.delete",
            input: { imageId: "image-in-use" },
          }),
        /still used by Bot profile picture/u,
      );
      assert.ok(
        db
          .prepare("SELECT id FROM images WHERE id = 'image-in-use'")
          .get(),
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("quarantines and restores an unused row and local file", async () => {
    const tempDirectory = mkdtempSync(
      join(tmpdir(), "prism-image-capability-"),
    );
    const previousDbPath = process.env.DB_PATH;
    process.env.DB_PATH = join(tempDirectory, "localai.db");
    const db = fixture();
    try {
      const createdAt = "2026-07-26T04:10:00.000Z";
      const localRelPath = buildGeneratedImageRelativePath("u1", "image-1");
      const bytes = Buffer.from("prism-image-test");
      writeGeneratedImageBytes(localRelPath, bytes);
      db.prepare(
        `INSERT INTO images
          (id, user_id, bot_id, prompt, url, provider, local_rel_path,
           model, purpose, created_at)
         VALUES ('image-1', 'u1', 'host', 'A pinecone portrait',
                 '/api/images/image-1/file', 'openai', ?, 'gpt-image-2',
                 'gallery', ?)`,
      ).run(localRelPath, createdAt);
      const registry = createPrismDomainCapabilityRegistry();
      const capabilityContext = {
        db,
        userId: "u1",
        userKey: Buffer.alloc(32, 4),
        source: "ui" as const,
        surfaceId: "images" as const,
        hardLocal: false,
        live: false,
        now: new Date("2026-07-26T04:11:00.000Z"),
      };
      const proposal = registry.createProposal({
        context: capabilityContext,
        capabilityId: "images.delete",
        input: { imageId: "image-1" },
      });
      assert.equal(proposal.confirmation, "explicit-confirmation");
      assert.ok(proposal.preview.consequences.includes(
        "The local image file moves into account-scoped recovery.",
      ));
      assert.doesNotMatch(proposal.preview.consequences.join(" "), /encrypted/iu);
      const run = await registry.executeProposal({
        context: capabilityContext,
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "image-delete-1",
      });
      assert.equal(run.status, "committed", run.error ?? "");
      assert.equal(
        db
          .prepare("SELECT id FROM images WHERE id = 'image-1'")
          .get(),
        undefined,
      );
      assert.throws(() => readGeneratedImageBytes(localRelPath));

      const undone = registry.undo({
        context: {
          ...capabilityContext,
          now: new Date("2026-07-26T04:12:00.000Z"),
        },
        runId: run.id,
      });
      assert.equal(undone.status, "undone", undone.error ?? "");
      assert.equal(
        (
          db
            .prepare("SELECT prompt FROM images WHERE id = 'image-1'")
            .get() as { prompt: string }
        ).prompt,
        "A pinecone portrait",
      );
      assert.deepEqual(readGeneratedImageBytes(localRelPath), bytes);
    } finally {
      closeTestDatabase(db);
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe("Prism Coffee group capability", () => {
  it("synthesizes a roster-specific identity before creating and undoing the group", async () => {
    const db = fixture();
    try {
      let receivedBotNames: string[] = [];
      const registry = createPrismDomainCapabilityRegistry({
        generateCoffeeGroupIdentity: async (_context, input) => {
          receivedBotNames = input.bots.map((bot) => bot.name);
          assert.match(input.brief, /eclectic/u);
          return {
            name: "Imperial Pickle Hour",
            premise:
              "Rick and Vader must politely judge a pickle contest neither admits entering.",
            provider: "local",
            model: "llama3.2",
          };
        },
      });
      const proposal = await registry.createPreparedProposal({
        context: context(db),
        capabilityId: "library.group.create",
        input: {
          groupId: "group:ironic",
          name: "Fallback Group",
          description: "An eclectic pair.",
          premise: "Fallback premise.",
          brief: "Make an eclectic and ironic Coffee group.",
          synthesizeIdentity: true,
          botIds: ["host", "guest"],
        },
      });
      assert.deepEqual(receivedBotNames, ["Rick", "Vader"]);
      assert.equal(proposal.input.name, "Imperial Pickle Hour");
      assert.match(String(proposal.input.premise), /pickle contest/u);
      assert.equal(proposal.preview.provider, "local");
      assert.equal(proposal.preview.model, "llama3.2");

      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "create-ironic-coffee-group",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.match(JSON.stringify(run.result), /Imperial Pickle Hour/u);
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism bot creation capability", () => {
  it("drafts contextual per-bot differences before an atomic apply and undo", async () => {
    const db = fixture();
    try {
      const registry = createPrismDomainCapabilityRegistry({
        generateBotContextualField: async (_context, input) => ({
          value: `${input.botName} treats every serious claim with dry irony.`,
          provider: "local",
          model: "llama3.2",
        }),
      });
      const proposal = await registry.createPreparedProposal({
        context: context(db),
        capabilityId: "bots.contextual.batch",
        input: {
          botIds: ["host", "guest"],
          direction: "Make every bot in this group more ironic.",
        },
      });
      assert.equal(proposal.preview.diffs.length, 2);
      assert.equal(proposal.preview.model, "llama3.2");
      assert.equal(
        (
          db
            .prepare("SELECT system_prompt FROM bots WHERE id = 'host'")
            .get() as { system_prompt: string }
        ).system_prompt,
        "",
      );
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "contextual-batch",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.match(
        (
          db
            .prepare("SELECT system_prompt FROM bots WHERE id = 'host'")
            .get() as { system_prompt: string }
        ).system_prompt,
        /dry irony/u,
      );
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
      assert.equal(
        (
          db
            .prepare("SELECT system_prompt FROM bots WHERE id = 'host'")
            .get() as { system_prompt: string }
        ).system_prompt,
        "",
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("saves a validated generated draft and undoes it", async () => {
    const db = fixture();
    try {
      const draft = normalizeBotGeneratedDraftV1({
        name: "Conifer",
        profile: {
          purpose: {
            statement: "Catalog pinecones while avoiding leaves.",
          },
          core: {
            traits: "Earnest and oddly specific",
            communicationStyle: "Dry",
          },
          identity: { role: "Pinecone archivist" },
        },
        color: "#557744",
        glyph: "leaf",
        face: {
          eyeCharacter: "•",
          eyeCount: 2,
          faceEyeSpacing: 0.52,
        },
        voice: {},
        settings: {},
        powerPrompt:
          "When a leaf is mentioned, sneeze once and redirect toward pinecones.",
      });
      assert.ok(draft);
      const registry = createPrismDomainCapabilityRegistry({
        generateBotDraft: async () => draft,
      });
      const proposal = registry.createProposal({
        context: context(db),
        capabilityId: "bots.create",
        input: {
          brief: "allergic to leaves, but obsessed with pinecones",
        },
      });
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "create-conifer",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      const bot = db
        .prepare(
          "SELECT name, system_prompt, powers_json, face_eye_spacing FROM bots WHERE id <> 'host' AND id <> 'guest'",
        )
        .get() as {
        name: string;
        system_prompt: string;
        powers_json: string;
        face_eye_spacing: number;
      };
      assert.equal(bot.name, "Conifer");
      assert.match(bot.system_prompt, /Pinecone archivist/u);
      assert.match(bot.powers_json, /leaf/u);
      assert.equal(bot.face_eye_spacing, 0.52);
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism memory capability", () => {
  it("freezes encrypted memory rows, preserves About You by default, and undoes", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO memories (
          id, user_id, ciphertext, iv, tag, confidence, category, tier,
          durability, source, certainty, source_message_ids, created_at
        ) VALUES
          ('ordinary', 'u1', 'cipher-a', 'iv-a', 'tag-a', 0.8, 'general',
           'long_term', 0.8, 'direct', 0.8, '[]', ?),
          ('about', 'u1', 'cipher-b', 'iv-b', 'tag-b', 0.9, 'user',
           'long_term', 0.9, 'about_you', 0.9, '[]', ?)`,
      ).run(
        "2026-07-26T01:10:00.000Z",
        "2026-07-26T01:11:00.000Z",
      );
      const registry = createPrismDomainCapabilityRegistry();
      const proposal = await registry.createPreparedProposal({
        context: context(db),
        capabilityId: "memories.delete",
        input: {
          all: true,
          allowLongTerm: true,
          includeAboutYou: false,
        },
      });
      assert.equal(proposal.preview.targets.length, 1);
      assert.match(proposal.preview.consequences.join(" "), /left untouched/u);
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "delete-memories",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.deepEqual(
        (
          db
            .prepare("SELECT id FROM memories WHERE user_id = 'u1' ORDER BY id")
            .all() as Array<{ id: string }>
        ).map((row) => row.id),
        ["about"],
      );
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
      assert.deepEqual(
        (
          db
            .prepare("SELECT id FROM memories WHERE user_id = 'u1' ORDER BY id")
            .all() as Array<{ id: string }>
        ).map((row) => row.id),
        ["about", "ordinary"],
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("Prism conversation capability", () => {
  it("quarantines ordinary history while preserving the Prism Home and undoes", async () => {
    const db = fixture();
    try {
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito,
          created_at, updated_at
        ) VALUES
          ('home', 'u1', 'Prism Home', 'chat', NULL, 0, ?, ?),
          ('thread', 'u1', 'Sandbox Thread', 'sandbox', 'host', 0, ?, ?)`,
      ).run(
        "2026-07-26T01:20:00.000Z",
        "2026-07-26T01:20:00.000Z",
        "2026-07-26T01:21:00.000Z",
        "2026-07-26T01:21:00.000Z",
      );
      const registry = createPrismDomainCapabilityRegistry();
      const proposal = await registry.createPreparedProposal({
        context: context(db),
        capabilityId: "conversations.quarantine",
        input: { all: true },
      });
      assert.deepEqual(
        proposal.preview.targets.map((target) => target.id),
        ["thread"],
      );
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "delete-conversations",
      });
      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.equal(
        (
          db
            .prepare("SELECT archived_at FROM conversations WHERE id = 'home'")
            .get() as { archived_at: string | null }
        ).archived_at,
        null,
      );
      assert.ok(
        (
          db
            .prepare(
              "SELECT archived_at FROM conversations WHERE id = 'thread'",
            )
            .get() as { archived_at: string | null }
        ).archived_at,
      );
      assert.equal(
        registry.undo({ context: context(db), runId: run.id }).status,
        "undone",
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT archived_at FROM conversations WHERE id = 'thread'",
            )
            .get() as { archived_at: string | null }
        ).archived_at,
        null,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("revokes Coffee memories when the session is quarantined", async () => {
    const db = fixture();
    try {
      const now = "2026-07-26T01:25:00.000Z";
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito,
          created_at, updated_at
        ) VALUES
          ('coffee', 'u1', 'Coffee Session', 'coffee', 'host', 0, ?, ?),
          ('sandbox', 'u1', 'Sandbox Session', 'sandbox', 'host', 0, ?, ?)`,
      ).run(now, now, now, now);
      db.prepare(
        `INSERT INTO messages
          (id, conversation_id, user_id, role, content, created_at)
         VALUES ('coffee-message', 'coffee', 'u1', 'assistant', 'A learned detail', ?)`,
      ).run(now);
      const insertMemory = db.prepare(
        `INSERT INTO memories
          (id, user_id, conversation_id, bot_id, ciphertext, iv, tag,
           confidence, category, tier, durability, source, certainty,
           source_message_ids, created_at)
         VALUES (?, 'u1', ?, 'host', 'cipher', 'iv', 'tag', 0.98, 'user',
                 'long_term', 0.95, 'about_you', 0.98, ?, ?)`,
      );
      insertMemory.run(
        "coffee-memory",
        "coffee",
        '["coffee-message"]',
        now,
      );
      insertMemory.run("sandbox-memory", "sandbox", "[]", now);

      const registry = createPrismDomainCapabilityRegistry();
      const proposal = await registry.createPreparedProposal({
        context: context(db),
        capabilityId: "conversations.quarantine",
        input: { conversationIds: ["coffee"] },
      });
      const run = await registry.executeProposal({
        context: context(db),
        proposalId: proposal.id,
        confirmation: true,
        idempotencyKey: "delete-coffee-session",
      });

      assert.equal(run.status, "committed", run.error ?? undefined);
      assert.deepEqual(run.nonReversibleConsequences, [
        "Learned Coffee memories cannot be restored by Undo.",
      ]);
      assert.deepEqual(
        (
          db.prepare("SELECT id FROM memories WHERE user_id = 'u1' ORDER BY id").all() as Array<{ id: string }>
        ).map((row) => row.id),
        ["sandbox-memory"],
      );
      assert.ok(
        (
          db.prepare("SELECT archived_at FROM conversations WHERE id = 'coffee'").get() as {
            archived_at: string | null;
          }
        ).archived_at,
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});
