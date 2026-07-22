import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../db.ts";
import {
  exportUserSnapshot,
  importUserSnapshot,
  type BackupSnapshot,
} from "../backup.ts";
import {
  DEFAULT_ZEN_MESSAGE_FONT_MAX_PX,
  DEFAULT_ZEN_MESSAGE_FONT_MIN_PX,
  MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH,
} from "../settings.ts";
import {
  botPowerSourceHashForPowerV1,
  botPowerSourceHashV1,
  normalizeCoffeeSessionSettings,
  parseStoredBotPowersV1,
} from "@localai/shared";

describe("backup Coffee service state", () => {
  it("round-trips the bar ritual and requires archived pixels for a special drink", () => {
    withBackupDatabase((db, userKey) => {
      const now = "2026-07-21T18:00:00.000Z";
      const settings = normalizeCoffeeSessionSettings({
        barRitual: {
          serviceBot: {
            id: "barista-1",
            name: "Casey",
            color: "#778899",
            glyph: "spark",
            fallback: false,
          },
          role: "cup",
          drink: "house",
          playerCup: {
            fillId: "fill-1",
            filledAt: now,
            topOffCount: 1,
            sipCount: 2,
          },
          waiterOffers: 1,
          liveStartedAt: now,
          hardStopAt: "2026-07-21T18:30:00.000Z",
        },
      });
      db.prepare(
        `INSERT INTO conversations
           (id, user_id, title, conversation_mode, bot_group_ids, coffee_settings,
            coffee_duration_minutes, created_at, updated_at)
         VALUES ('coffee-backup', 'user-1', 'Coffee Backup', 'coffee', '[]', ?, NULL, ?, ?)`,
      ).run(JSON.stringify(settings), now, now);

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const coffee = snapshot.conversations.find(
        (conversation) => conversation.id === "coffee-backup",
      )?.coffee;
      assert.equal(coffee?.settings.barRitual?.serviceBot.name, "Casey");
      assert.equal(coffee?.settings.barRitual?.playerCup?.sipCount, 2);

      db.prepare("DELETE FROM conversations WHERE id = 'coffee-backup'").run();
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db.prepare(
        "SELECT coffee_settings FROM conversations WHERE id = 'coffee-backup' AND user_id = 'user-1'",
      ).get() as { coffee_settings: string };
      assert.equal(
        normalizeCoffeeSessionSettings(JSON.parse(restored.coffee_settings))
          .barRitual?.serviceBot.name,
        "Casey",
      );

      const specialSnapshot = structuredClone(snapshot);
      const specialRitual = specialSnapshot.conversations.find(
        (conversation) => conversation.id === "coffee-backup",
      )?.coffee?.settings.barRitual;
      assert.ok(specialRitual);
      specialRitual.drink = "special";
      specialRitual.specialImageStatus = "ready";
      specialRitual.specialImageId = "missing-coffee-surface";
      assert.throws(
        () => importUserSnapshot(db, "user-1", specialSnapshot, userKey),
        /missing the project-asset archive/i,
      );
    });
  });
});

describe("backup Auto model settings", () => {
  it("exports and restores Auto mode without exporting retired text fallback settings", () => {
    withBackupDatabase((db, userKey) => {
      const chain = {
        v: 1 as const,
        fallbacks: [
          { provider: "local" as const, model: "qwen3:8b" },
          { provider: "openai" as const, model: "gpt-5-mini" },
        ] as const,
      };
      db.prepare(
        "UPDATE users SET auto_switch_model = 1, auto_fallback_chain = ?, lenient_local_fallback_model = 'legacy:latest', fallback_model_message_stripe = 0 WHERE id = ?"
      ).run(JSON.stringify(chain), "user-1");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(snapshot.settings?.autoModeEnabled, true);
      assert.deepEqual(snapshot.settings?.autoFallbackChain, chain);
      assert.equal("lenientLocalFallbackModel" in (snapshot.settings ?? {}), false);
      assert.equal("fallbackModelMessageStripe" in (snapshot.settings ?? {}), false);

      db.prepare(
        "UPDATE users SET auto_switch_model = 0, auto_fallback_chain = NULL WHERE id = ?"
      ).run("user-1");
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db.prepare(
        "SELECT auto_switch_model, auto_fallback_chain FROM users WHERE id = ?"
      ).get("user-1") as { auto_switch_model: number; auto_fallback_chain: string | null };
      assert.equal(restored.auto_switch_model, 1);
      assert.deepEqual(JSON.parse(restored.auto_fallback_chain ?? "null"), chain);
    });
  });

  it("keeps a legacy text fallback only as an Auto setup suggestion", () => {
    withBackupDatabase((db, userKey) => {
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const legacySettings = {
        ...snapshot.settings!,
        lenientLocalFallbackModel: "legacy:latest",
      };
      delete legacySettings.autoModeEnabled;
      delete legacySettings.autoFallbackChain;

      importUserSnapshot(
        db,
        "user-1",
        { ...snapshot, settings: legacySettings },
        userKey
      );
      const restored = db.prepare(
        "SELECT auto_switch_model, auto_fallback_chain, lenient_local_fallback_model FROM users WHERE id = ?"
      ).get("user-1") as {
        auto_switch_model: number;
        auto_fallback_chain: string | null;
        lenient_local_fallback_model: string | null;
      };
      assert.equal(restored.auto_switch_model, 0);
      assert.equal(restored.auto_fallback_chain, null);
      assert.equal(restored.lenient_local_fallback_model, "legacy:latest");
    });
  });
});

describe("backup image provider settings", () => {
  it("exports and restores image routing independently from chat routing", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET preferred_provider = 'local', preferred_image_provider = 'openai' WHERE id = ?",
      ).run("user-1");
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(snapshot.settings?.preferredProvider, "local");
      assert.equal(snapshot.settings?.preferredImageProvider, "openai");

      db.prepare(
        "UPDATE users SET preferred_provider = 'openai', preferred_image_provider = 'local' WHERE id = ?",
      ).run("user-1");
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db
        .prepare(
          "SELECT preferred_provider, preferred_image_provider FROM users WHERE id = ?",
        )
        .get("user-1") as {
        preferred_provider: string;
        preferred_image_provider: string;
      };
      assert.equal(restored.preferred_provider, "local");
      assert.equal(restored.preferred_image_provider, "openai");
    });
  });

  it("derives the legacy image lane from the old coupled chat provider", () => {
    withBackupDatabase((db, userKey) => {
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const legacySettings = {
        ...snapshot.settings!,
        preferredProvider: "openai" as const,
      };
      delete legacySettings.preferredImageProvider;
      importUserSnapshot(
        db,
        "user-1",
        { ...snapshot, settings: legacySettings },
        userKey,
      );
      const restored = db
        .prepare("SELECT preferred_image_provider AS provider FROM users WHERE id = ?")
        .get("user-1") as { provider: string };
      assert.equal(restored.provider, "openai");
    });
  });
});

describe("backup ephemeral chat provider settings", () => {
  it("round-trips per-mode choices and keeps old backups on global defaults", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET ephemeral_chat_provider_preferences = ? WHERE id = ?",
      ).run(
        JSON.stringify({ coffee: "local", botcast: "online" }),
        "user-1",
      );
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.deepEqual(snapshot.settings?.ephemeralChatProviderPreferences, {
        chat: "global",
        zen: "global",
        coffee: "local",
        botcast: "online",
        slate: "global",
      });

      db.prepare(
        "UPDATE users SET ephemeral_chat_provider_preferences = '{}' WHERE id = ?",
      ).run("user-1");
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db
        .prepare(
          "SELECT ephemeral_chat_provider_preferences AS preferences FROM users WHERE id = ?",
        )
        .get("user-1") as { preferences: string };
      assert.deepEqual(JSON.parse(restored.preferences), {
        chat: "global",
        zen: "global",
        coffee: "local",
        botcast: "online",
        slate: "global",
      });

      const legacySettings = { ...snapshot.settings! };
      delete legacySettings.ephemeralChatProviderPreferences;
      importUserSnapshot(
        db,
        "user-1",
        { ...snapshot, settings: legacySettings },
        userKey,
      );
      const legacyRestored = db
        .prepare(
          "SELECT ephemeral_chat_provider_preferences AS preferences FROM users WHERE id = ?",
        )
        .get("user-1") as { preferences: string };
      assert.deepEqual(JSON.parse(legacyRestored.preferences), {
        chat: "global",
        zen: "global",
        coffee: "global",
        botcast: "global",
        slate: "global",
      });
    });
  });
});

describe("backup graphics quality", () => {
  it("round-trips the selected tier and defaults legacy snapshots to High", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare("UPDATE users SET graphics_quality = 'low' WHERE id = ?").run(
        "user-1",
      );
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(snapshot.settings?.graphicsQuality, "low");

      db.prepare("UPDATE users SET graphics_quality = 'high' WHERE id = ?").run(
        "user-1",
      );
      importUserSnapshot(db, "user-1", snapshot, userKey);
      assert.equal(
        (db.prepare("SELECT graphics_quality FROM users WHERE id = ?").get(
          "user-1",
        ) as { graphics_quality: string }).graphics_quality,
        "low",
      );

      const legacySettings = { ...snapshot.settings! };
      delete legacySettings.graphicsQuality;
      db.prepare("UPDATE users SET graphics_quality = 'medium' WHERE id = ?").run(
        "user-1",
      );
      importUserSnapshot(
        db,
        "user-1",
        { ...snapshot, settings: legacySettings },
        userKey,
      );
      assert.equal(
        (db.prepare("SELECT graphics_quality FROM users WHERE id = ?").get(
          "user-1",
        ) as { graphics_quality: string }).graphics_quality,
        "high",
      );
    });
  });
});

describe("backup Zen Atmosphere style notes", () => {
  it("exports and restores normalized style notes", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET zen_wallpaper_style_notes = ?, zen_wallpaper_blurred_edges_enabled = 0, zen_message_font_min_px = 18.4, zen_message_font_max_px = 36.7, experimental_all_model_effort_enabled = 1, coffee_experimental_table_angle_enabled = 1, psychic_mode_enabled = 1, prism_default_bot_face_thinking_frames = ? WHERE id = ?"
      ).run(
        "  misty\n glass,   paper grain  ",
        '["?","!","?","…"]',
        "user-1"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);

      assert.equal(
        snapshot.settings?.zenWallpaperStyleNotes,
        "misty glass, paper grain"
      );
      assert.equal(snapshot.settings?.zenWallpaperBlurredEdgesEnabled, false);
      assert.equal(snapshot.settings?.zenMessageFontMinPx, 18.4);
      assert.equal(snapshot.settings?.zenMessageFontMaxPx, 36.7);
      assert.equal(snapshot.settings?.experimentalAllModelEffortEnabled, true);
      assert.equal(snapshot.settings?.coffeeExperimentalTableAngleEnabled, true);
      assert.equal(snapshot.settings?.psychicModeEnabled, true);
      assert.deepEqual(snapshot.settings?.prismDefaultBotFaceThinkingFrames, [
        "?",
        "!",
        "?",
        "…",
      ]);

      const longNotes = "x".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH + 10);
      importUserSnapshot(
        db,
        "user-1",
        {
          ...snapshot,
          settings: {
            ...snapshot.settings!,
            zenWallpaperStyleNotes: longNotes,
            zenWallpaperBlurredEdgesEnabled: true,
            zenMessageFontMinPx: 22.4,
            zenMessageFontMaxPx: 19.2,
            experimentalAllModelEffortEnabled: false,
            coffeeExperimentalTableAngleEnabled: false,
            psychicModeEnabled: false,
            prismDefaultBotFaceThinkingFrames: [".", "o", "O", "o"],
          },
        },
        userKey
      );

      const restored = db
        .prepare(
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled, zen_message_font_min_px, zen_message_font_max_px, experimental_all_model_effort_enabled, coffee_experimental_table_angle_enabled, psychic_mode_enabled, prism_default_bot_face_thinking_frames FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
        zen_message_font_min_px: number;
        zen_message_font_max_px: number;
        experimental_all_model_effort_enabled: number;
        coffee_experimental_table_angle_enabled: number;
        psychic_mode_enabled: number;
        prism_default_bot_face_thinking_frames: string | null;
      };

      assert.equal(
        restored.zen_wallpaper_style_notes,
        "x".repeat(MAX_ZEN_WALLPAPER_STYLE_NOTES_LENGTH)
      );
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
      assert.equal(restored.zen_message_font_min_px, 22.4);
      assert.equal(restored.zen_message_font_max_px, 22.4);
      assert.equal(restored.experimental_all_model_effort_enabled, 0);
      assert.equal(restored.coffee_experimental_table_angle_enabled, 0);
      assert.equal(restored.psychic_mode_enabled, 0);
      assert.equal(restored.prism_default_bot_face_thinking_frames, '[".","o","O","o"]');
    });
  });

  it("treats old snapshots without style notes as blank", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET zen_wallpaper_style_notes = ?, zen_wallpaper_blurred_edges_enabled = 0 WHERE id = ?"
      ).run("woven texture", "user-1");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const settings = { ...snapshot.settings } as Partial<
        NonNullable<BackupSnapshot["settings"]>
      >;
      delete settings.zenWallpaperStyleNotes;
      delete settings.zenWallpaperBlurredEdgesEnabled;
      delete settings.zenMessageFontMinPx;
      delete settings.zenMessageFontMaxPx;

      importUserSnapshot(
        db,
        "user-1",
        {
          ...snapshot,
          settings: settings as BackupSnapshot["settings"],
        },
        userKey
      );

      const restored = db
        .prepare(
          "SELECT zen_wallpaper_style_notes, zen_wallpaper_blurred_edges_enabled, zen_message_font_min_px, zen_message_font_max_px FROM users WHERE id = ?"
        )
        .get("user-1") as {
        zen_wallpaper_style_notes: string;
        zen_wallpaper_blurred_edges_enabled: number;
        zen_message_font_min_px: number;
        zen_message_font_max_px: number;
      };

      assert.equal(restored.zen_wallpaper_style_notes, "");
      assert.equal(restored.zen_wallpaper_blurred_edges_enabled, 1);
      assert.equal(restored.zen_message_font_min_px, DEFAULT_ZEN_MESSAGE_FONT_MIN_PX);
      assert.equal(restored.zen_message_font_max_px, DEFAULT_ZEN_MESSAGE_FONT_MAX_PX);
    });
  });
});

describe("backup bot avatar face style", () => {
  it("exports and restores saved face font settings", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        `INSERT INTO bots (
          id, user_id, name, name_pronunciation, self_referral, system_prompt, voice_preview_line, avatar_details_json,
          face_eyes_font, face_eye_character, face_eye_animation,
          face_mouth_font, face_mouth_character, face_mouth_animation,
          face_mouth_coffee_pucker, face_font_weight,
          face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg, face_eye_count,
          face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg,
          face_blink_bar, face_blink_scale, face_blink_offset_x, face_blink_offset_y,
          face_thinking_frames,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "bot-1",
        "user-1",
        "Avatar Bot",
        "Ah-vah-tar Bot",
        "Avi",
        "You are Avatar Bot.",
        "Testing this carefully calibrated voice.",
        '{"version":1,"screen":{"stamps":[{"id":"round-glasses","offsetX":2,"offsetY":-1,"scalePct":105}],"paintMaskBase64":null}}',
        "warm",
        "8",
        "wobble",
        "formal",
        "△",
        "flicker",
        1,
        725,
        1.15,
        0.06,
        -0.08,
        -25,
        2,
        1.25,
        -0.04,
        0.06,
        35,
        "❘",
        1.2,
        -0.08,
        0.06,
        '["·","*","✦","*"]',
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.deepEqual(snapshot.bots?.[0], {
        id: "bot-1",
        name: "Avatar Bot",
        namePronunciation: "Ah-vah-tar Bot",
        selfReferral: "Avi",
        systemPrompt: "You are Avatar Bot.",
        voicePreviewLine: "Testing this carefully calibrated voice.",
        exportHash: null,
        model: null,
        localModel: null,
        onlineModel: null,
        localImageModel: null,
        openaiImageModel: null,
        onlineEnabled: true,
        deleteProtected: false,
	        flirtEnabled: false,
	        temperature: 0.7,
	        maxTokens: 2048,
	        topP: 1,
	        topK: 40,
	        repetitionPenalty: 1.1,
	        color: null,
        glyph: null,
        avatarDetails: {
          version: 1,
          screen: {
            stamps: [
              {
                id: "round-glasses",
                offsetX: 2,
                offsetY: -1,
                scalePct: 105,
              },
            ],
            paintMaskBase64: null,
          },
        },
        faceEyesFont: "warm",
        faceEyeCharacter: "8",
        faceMouthFont: "formal",
        faceMouthCharacter: "△",
        faceMouthAnimation: "flicker",
        faceMouthCoffeePucker: true,
        faceFontWeight: 725,
        faceEyeScale: 1.15,
        faceEyeOffsetX: 0.06,
        faceEyeOffsetY: -0.08,
        faceEyeRotationDeg: -25,
        faceEyeCount: 2,
        faceMouthScale: 1.25,
        faceMouthOffsetX: -0.04,
        faceMouthOffsetY: 0.06,
        faceMouthRotationDeg: 35,
        faceBlinkBar: "❘",
        faceBlinkScale: 1.2,
        faceBlinkOffsetX: -0.08,
        faceBlinkOffsetY: 0.06,
        faceThinkingFrames: ["·", "*", "✦", "*"],
          authoredAudioVoiceProfile: {
            v: 2,
            enabled: true,
            baseVoiceId: "voice-1",
            elevenLabsEffect: "chorus",
            pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
          bottishTone: 0.45,
          eqTilt: 0,
          gainDb: 0,
          volume: 1,
          texture: {
            preset: "clean",
            amount: 0,
            bandwidth: 1,
            noise: 0,
            instability: 0,
            distortion: 0,
            damage: 0,
          },
        },
        audioVoiceProfileOverride: null,
        chatEnabled: true,
        visibility: "private",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      db.prepare(
        "UPDATE bots SET name_pronunciation = '', self_referral = '', voice_preview_line = NULL, avatar_details_json = NULL, face_eyes_font = NULL, face_eye_character = NULL, face_eye_animation = NULL, face_mouth_font = NULL, face_mouth_character = NULL, face_mouth_animation = NULL, face_mouth_coffee_pucker = 0, face_font_weight = NULL, face_eye_scale = NULL, face_eye_offset_x = NULL, face_eye_offset_y = NULL, face_eye_rotation_deg = NULL, face_eye_count = 1, face_mouth_scale = NULL, face_mouth_offset_x = NULL, face_mouth_offset_y = NULL, face_mouth_rotation_deg = NULL, face_blink_bar = NULL, face_blink_scale = NULL, face_blink_offset_x = NULL, face_blink_offset_y = NULL, face_thinking_frames = NULL WHERE id = ?"
      ).run("bot-1");

      importUserSnapshot(db, "user-1", snapshot, userKey);

      const restored = db
        .prepare(
          "SELECT name_pronunciation, self_referral, voice_preview_line, avatar_details_json, face_eyes_font, face_eye_character, face_eye_animation, face_mouth_font, face_mouth_character, face_mouth_animation, face_mouth_coffee_pucker, face_font_weight, face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg, face_eye_count, face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg, face_blink_bar, face_blink_scale, face_blink_offset_x, face_blink_offset_y, face_thinking_frames, profile_picture_image_id FROM bots WHERE id = ?"
        )
        .get("bot-1") as {
        name_pronunciation: string;
        self_referral: string;
        voice_preview_line: string | null;
        avatar_details_json: string | null;
        face_eyes_font: string | null;
        face_eye_character: string | null;
        face_eye_animation: string | null;
        face_mouth_font: string | null;
        face_mouth_character: string | null;
        face_mouth_animation: string | null;
        face_mouth_coffee_pucker: number;
        face_font_weight: number | null;
        face_eye_scale: number | null;
        face_eye_offset_x: number | null;
        face_eye_offset_y: number | null;
        face_eye_rotation_deg: number | null;
        face_eye_count: number;
        face_mouth_scale: number | null;
        face_mouth_offset_x: number | null;
        face_mouth_offset_y: number | null;
        face_mouth_rotation_deg: number | null;
        face_blink_bar: string | null;
        face_blink_scale: number | null;
        face_blink_offset_x: number | null;
        face_blink_offset_y: number | null;
        face_thinking_frames: string | null;
        profile_picture_image_id: string | null;
      };
      assert.equal(restored.name_pronunciation, "Ah-vah-tar Bot");
      assert.equal(restored.self_referral, "Avi");
      assert.equal(restored.voice_preview_line, "Testing this carefully calibrated voice.");
      assert.equal(
        restored.avatar_details_json,
        '{"version":1,"screen":{"stamps":[{"id":"round-glasses","offsetX":2,"offsetY":-1,"scalePct":105}],"paintMaskBase64":null}}'
      );
      assert.equal(restored.face_eyes_font, "warm");
      assert.equal(restored.face_eye_character, "8");
      assert.equal(restored.face_eye_animation, "none");
      assert.equal(restored.face_mouth_font, "formal");
      assert.equal(restored.face_mouth_character, "△");
      assert.equal(restored.face_mouth_animation, "flicker");
      assert.equal(restored.face_mouth_coffee_pucker, 1);
      assert.equal(restored.face_font_weight, 725);
      assert.equal(restored.face_eye_scale, 1.15);
      assert.equal(restored.face_eye_offset_x, 0.06);
      assert.equal(restored.face_eye_offset_y, -0.08);
      assert.equal(restored.face_eye_rotation_deg, -25);
      assert.equal(restored.face_eye_count, 2);
      assert.equal(restored.face_mouth_scale, 1.25);
      assert.equal(restored.face_mouth_offset_x, -0.04);
      assert.equal(restored.face_mouth_offset_y, 0.06);
      assert.equal(restored.face_mouth_rotation_deg, 35);
      assert.equal(restored.face_blink_bar, "❘");
      assert.equal(restored.face_blink_scale, 1.2);
      assert.equal(restored.face_blink_offset_x, -0.08);
      assert.equal(restored.face_blink_offset_y, 0.06);
      assert.equal(restored.face_thinking_frames, '["·","*","✦","*"]');
      assert.equal(restored.profile_picture_image_id, null);

      const explicitOptOut = snapshot.bots?.[0];
      assert.ok(explicitOptOut);
      explicitOptOut.faceMouthCoffeePucker = false;
      importUserSnapshot(db, "user-1", snapshot, userKey);
      assert.equal(
        (
          db.prepare(
            "SELECT face_mouth_coffee_pucker AS value FROM bots WHERE id = ?",
          ).get("bot-1") as { value: number }
        ).value,
        0,
      );

      delete explicitOptOut.faceMouthCoffeePucker;
      importUserSnapshot(db, "user-1", snapshot, userKey);
      assert.equal(
        (
          db.prepare(
            "SELECT face_mouth_coffee_pucker AS value FROM bots WHERE id = ?",
          ).get("bot-1") as { value: number }
        ).value,
        1,
      );
    });
  });

  it("rejects raw avatar URLs and legacy accessory fields from account backups", () => {
    withBackupDatabase((db, userKey) => {
      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      snapshot.bots = [
        {
          id: "raw-avatar",
          name: "Raw Avatar",
          systemPrompt: "",
          onlineEnabled: true,
          deleteProtected: false,
          flirtEnabled: false,
          temperature: 0.7,
          maxTokens: 2048,
          chatEnabled: true,
          visibility: "private",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          avatarDetails: "https://example.com/avatar.png" as never,
        },
      ];

      assert.throws(
        () => importUserSnapshot(db, "user-1", snapshot, userKey),
        /Invalid avatar details/
      );
      assert.equal(
        db.prepare("SELECT id FROM bots WHERE id = ?").get("raw-avatar"),
        undefined
      );

      snapshot.bots = [
        {
          ...snapshot.bots[0]!,
          id: "legacy-accessory",
          avatarDetails: null,
          accessoryImageUrl: "data:image/png;base64,AAAA",
        } as never,
      ];
      assert.throws(
        () => importUserSnapshot(db, "user-1", snapshot, userKey),
        /unsupported legacy avatar field: accessoryImageUrl/
      );
      assert.equal(
        db.prepare("SELECT id FROM bots WHERE id = ?").get("legacy-accessory"),
        undefined
      );

      const rawFieldBase = { ...snapshot.bots[0] } as Record<string, unknown>;
      delete rawFieldBase.accessoryImageUrl;
      for (const [field, value] of [
        ["profilePictureDataUrl", "data:image/png;base64,AAAA"],
        ["profile_picture_svg", "<svg><path /></svg>"],
        ["avatarImageUrl", "https://example.com/avatar.png"],
        ["portraitImageUrl", "https://example.com/avatar.png"],
      ] as const) {
        snapshot.bots = [
          {
            ...rawFieldBase,
            id: `raw-${field}`,
            [field]: value,
          } as never,
        ];
        assert.throws(
          () => importUserSnapshot(db, "user-1", snapshot, userKey),
          new RegExp(`unsupported legacy avatar field: ${field}`)
        );
        assert.equal(
          db.prepare("SELECT id FROM bots WHERE id = ?").get(`raw-${field}`),
          undefined
        );
      }

      const rootRasterSnapshot = {
        ...snapshot,
        bots: [],
        imageAssets: [{ dataUrl: "data:image/png;base64,AAAA" }],
      } as never;
      assert.throws(
        () => importUserSnapshot(db, "user-1", rootRasterSnapshot, userKey),
        /unsupported raster data field: imageAssets/i
      );
    });
  });

  it("rejects cross-tenant id collisions without mutating either tenant", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        `INSERT INTO users (
          id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "user-2",
        "user-2@example.com",
        "User Two",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z"
      );
      db.prepare(
        `INSERT INTO bots (
          id, user_id, name, system_prompt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        "shared-id",
        "user-2",
        "Tenant Two Bot",
        "Do not replace me.",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      snapshot.settings = { ...snapshot.settings!, theme: "dark" };
      snapshot.bots = [
        {
          id: "shared-id",
          name: "Collision",
          systemPrompt: "",
          onlineEnabled: true,
          deleteProtected: false,
          flirtEnabled: false,
          temperature: 0.7,
          maxTokens: 2048,
          chatEnabled: true,
          visibility: "private",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          avatarDetails: null,
        },
      ];

      assert.throws(
        () => importUserSnapshot(db, "user-1", snapshot, userKey),
        /belongs to another user/i
      );
      const retained = db
        .prepare("SELECT user_id, name FROM bots WHERE id = ?")
        .get("shared-id") as { user_id: string; name: string };
      assert.equal(retained.user_id, "user-2");
      assert.equal(retained.name, "Tenant Two Bot");
      assert.equal(
        (db.prepare("SELECT theme FROM users WHERE id = ?").get("user-1") as {
          theme: string;
        }).theme,
        "system"
      );
    });
  });
});

describe("backup audio voice settings", () => {
  it("round-trips account and bot profiles without retired mode-specific voice settings", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET voice_mode = ?, voice_effects_enabled = 0, voice_volume = ?, operating_system_voices_enabled = 1, english_voice_engine = ?, default_system_voice_name = ?, default_elevenlabs_voice_id = ?, elevenlabs_voice_bank = ?, elevenlabs_voice_model = ?, elevenlabs_voice_collection_id = ?, player_audio_voice_profile = ?, player_name_pronunciation = ?, prism_default_bot_audio_voice_profile = ? WHERE id = ?"
      ).run(
        "babble",
        0.65,
        "elevenlabs",
        "Alex",
        "eleven-global",
        JSON.stringify({ "voice-1": "eleven-a" }),
        "eleven_flash_v2_5",
        "collection-main",
        JSON.stringify({ v: 1, baseVoiceId: "voice-3", pitch: 0, warmth: 0, pace: 0, lilt: 0 }),
        "Jair-id",
        JSON.stringify({ v: 2, baseVoiceId: "voice-5", elevenLabsEffect: "radio", elevenLabsVoiceInitialized: true, pitch: 0.4, warmth: 0, pace: 0, lilt: 0 }),
        "user-1"
      );
      db.prepare(
        `INSERT INTO bots (
          id, user_id, name, system_prompt,
          authored_audio_voice_profile, audio_voice_profile_override,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "voice-bot",
        "user-1",
        "Voice Bot",
        "You are Voice Bot.",
        JSON.stringify({ v: 2, baseVoiceId: "voice-4", elevenLabsEffect: "echo", pitch: 0.2, warmth: -0.1, pace: 0.3, lilt: 0.4 }),
        JSON.stringify({ v: 2, baseVoiceId: "voice-2", elevenLabsEffect: "robot", elevenLabsVoiceInitialized: true, pitch: -0.4, warmth: 0.6, pace: 0, lilt: -0.2 }),
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(snapshot.settings?.voiceMode, "babble");
      assert.equal(snapshot.settings?.voiceEffectsEnabled, false);
      assert.equal(
        "signalImmersiveVoiceEffectsEnabled" in (snapshot.settings ?? {}),
        false,
      );
      assert.equal(snapshot.settings?.voiceVolume, 0.65);
      assert.equal(snapshot.settings?.operatingSystemVoicesEnabled, true);
      assert.equal(snapshot.settings?.prismDefaultBotAudioVoiceProfile?.baseVoiceId, "voice-5");
      assert.equal(snapshot.settings?.prismDefaultBotAudioVoiceProfile?.elevenLabsEffect, "radio");
      assert.equal(snapshot.settings?.prismDefaultBotAudioVoiceProfile?.elevenLabsVoiceInitialized, true);
      assert.equal(snapshot.settings?.englishVoiceEngine, "elevenlabs");
      assert.equal(snapshot.settings?.defaultSystemVoiceName, "Alex");
      assert.equal(snapshot.settings?.defaultElevenLabsVoiceId, "eleven-global");
      assert.equal(snapshot.settings?.elevenLabsVoiceModel, "eleven_flash_v2_5");
      assert.equal(snapshot.settings?.elevenLabsVoiceCollectionId, "collection-main");
      assert.equal(snapshot.settings?.elevenLabsVoiceBank?.["voice-1"], "eleven-a");
      assert.equal("playerAudioVoiceProfile" in (snapshot.settings ?? {}), false);
      assert.equal("playerNamePronunciation" in (snapshot.settings ?? {}), false);

      db.prepare(
        "UPDATE users SET voice_mode = 'mute', voice_effects_enabled = 1, voice_volume = 1, operating_system_voices_enabled = 0, english_voice_engine = 'builtin', default_system_voice_name = NULL, default_elevenlabs_voice_id = NULL, elevenlabs_voice_bank = '{}', elevenlabs_voice_model = NULL, elevenlabs_voice_collection_id = NULL, player_audio_voice_profile = ?, player_name_pronunciation = ?, prism_default_bot_audio_voice_profile = NULL WHERE id = ?"
      ).run(
        JSON.stringify({ v: 1, baseVoiceId: "voice-2", pitch: 0, warmth: 0, pace: 0, lilt: 0 }),
        "Keep me",
        "user-1"
      );
      importUserSnapshot(db, "user-1", snapshot, userKey);

      const restoredUser = db.prepare(
        "SELECT voice_mode, voice_effects_enabled, voice_volume, operating_system_voices_enabled, english_voice_engine, default_system_voice_name, default_elevenlabs_voice_id, elevenlabs_voice_bank, elevenlabs_voice_model, elevenlabs_voice_collection_id, player_audio_voice_profile, player_name_pronunciation, prism_default_bot_audio_voice_profile FROM users WHERE id = ?"
      ).get("user-1") as Record<string, string | null>;
      assert.equal(restoredUser.voice_mode, "babble");
      assert.equal(restoredUser.voice_effects_enabled, 0);
      assert.equal(restoredUser.voice_volume, 0.65);
      assert.equal(restoredUser.operating_system_voices_enabled, 1);
      assert.equal(JSON.parse(restoredUser.prism_default_bot_audio_voice_profile ?? "{}").baseVoiceId, "voice-5");
      assert.equal(JSON.parse(restoredUser.prism_default_bot_audio_voice_profile ?? "{}").elevenLabsEffect, "radio");
      assert.equal(JSON.parse(restoredUser.prism_default_bot_audio_voice_profile ?? "{}").elevenLabsVoiceInitialized, true);
      assert.equal(restoredUser.english_voice_engine, "elevenlabs");
      assert.equal(restoredUser.default_system_voice_name, "Alex");
      assert.equal(restoredUser.default_elevenlabs_voice_id, "eleven-global");
      assert.equal(restoredUser.elevenlabs_voice_model, "eleven_flash_v2_5");
      assert.equal(restoredUser.elevenlabs_voice_collection_id, "collection-main");
      assert.equal(JSON.parse(restoredUser.elevenlabs_voice_bank ?? "{}")["voice-1"], "eleven-a");
      assert.equal(JSON.parse(restoredUser.player_audio_voice_profile ?? "{}").baseVoiceId, "voice-2");
      assert.equal(restoredUser.player_name_pronunciation, "Keep me");

      const restoredBot = db.prepare(
        "SELECT authored_audio_voice_profile, audio_voice_profile_override FROM bots WHERE id = ?"
      ).get("voice-bot") as Record<string, string>;
      assert.equal(JSON.parse(restoredBot.authored_audio_voice_profile).baseVoiceId, "voice-4");
      assert.equal(JSON.parse(restoredBot.authored_audio_voice_profile).elevenLabsEffect, "echo");
      assert.equal(JSON.parse(restoredBot.audio_voice_profile_override).baseVoiceId, "voice-2");
      assert.equal(JSON.parse(restoredBot.audio_voice_profile_override).elevenLabsEffect, "robot");
      assert.equal(JSON.parse(restoredBot.audio_voice_profile_override).elevenLabsVoiceInitialized, true);
    });
  });
});

describe("backup Slate account data", () => {
  it("round-trips the complete tenant-scoped Slate and Continuity graph", () => {
    withBackupDatabase((db, userKey) => {
      seedSlateBackupFixture(db, "user-1", "slate-one");

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.ok(snapshot.slate);
      for (const [collection, rows] of Object.entries(snapshot.slate)) {
        assert.equal(rows.length, 1, `${collection} should be present in the account backup`);
        assert.equal("user_id" in rows[0]!, false, `${collection} must not carry a source tenant id`);
      }

      db.prepare("DELETE FROM slate_series WHERE id = ? AND user_id = ?").run(
        "slate-one-series",
        "user-1",
      );
      for (const table of SLATE_BACKUP_TEST_TABLES) {
        const count = db
          .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`)
          .get("user-1") as { count: number };
        assert.equal(count.count, 0, `${table} should be cleared before restore`);
      }

      importUserSnapshot(db, "user-1", snapshot, userKey);

      for (const table of SLATE_BACKUP_TEST_TABLES) {
        const restored = db
          .prepare(`SELECT COUNT(*) AS count, MIN(user_id) AS owner FROM ${table} WHERE user_id = ?`)
          .get("user-1") as { count: number; owner: string };
        assert.equal(restored.count, 1, `${table} should be restored`);
        assert.equal(restored.owner, "user-1", `${table} should remain tenant scoped`);
      }
      const project = db
        .prepare(
          `SELECT series_id, manuscript, title_origin, continuity_active_version,
                  prose_mode, prose_provider, prose_model, deliberation_config_json
             FROM slate_projects WHERE id = ?`,
        )
        .get("slate-one-project") as {
        series_id: string;
        manuscript: string;
        title_origin: string;
        continuity_active_version: string;
        prose_mode: string;
        prose_provider: string;
        prose_model: string;
        deliberation_config_json: string;
      };
      assert.deepEqual({
        ...project,
        deliberation_config_json: JSON.parse(project.deliberation_config_json),
      }, {
        series_id: "slate-one-series",
        manuscript: "The restored manuscript.",
        title_origin: "spark",
        continuity_active_version: "0.0",
        prose_mode: "auto",
        prose_provider: "openai",
        prose_model: "gpt-5-mini",
        deliberation_config_json: {
          lux: {
            provider: "openai",
            model: "gpt-5-mini",
            directive: "Protect the central relationship.",
          },
          umbra: {
            provider: "local",
            model: "qwen3:8b",
            directive: "Interrogate convenient reversals.",
          },
        },
      });
      assert.equal(
        (
          db.prepare("SELECT prose FROM slate_sections WHERE id = ?").get("slate-one-section") as {
            prose: string;
          }
        ).prose,
        "The restored section.",
      );
      assert.equal(
        (
          db.prepare("SELECT status FROM slate_continuity_concerns WHERE id = ?").get(
            "slate-one-concern",
          ) as { status: string }
        ).status,
        "open",
      );
    });
  });

  it("rejects a Slate foreign reference owned by another tenant and rolls back", () => {
    withBackupDatabase((db, userKey) => {
      seedSlateBackupFixture(db, "user-1", "slate-one");
      db.prepare(
        `INSERT INTO users (
          id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "user-2",
        "user-2@example.com",
        "User Two",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
      );
      db.prepare(
        "INSERT INTO slate_series (id, user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)",
      ).run(
        "tenant-two-series",
        "user-2",
        "Tenant Two Saga",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      snapshot.settings = { ...snapshot.settings!, theme: "dark" };
      snapshot.slate!.projects[0]!.series_id = "tenant-two-series";

      assert.throws(
        () => importUserSnapshot(db, "user-1", snapshot, userKey),
        /belongs to another user/i,
      );
      assert.equal(
        (
          db.prepare("SELECT title FROM slate_series WHERE id = ?").get("tenant-two-series") as {
            title: string;
          }
        ).title,
        "Tenant Two Saga",
      );
      assert.equal(
        (db.prepare("SELECT theme FROM users WHERE id = ?").get("user-1") as { theme: string })
          .theme,
        "system",
      );
    });
  });

  it("continues to import pre-Slate version 1 account backups", () => {
    withBackupDatabase((db, userKey) => {
      seedSlateBackupFixture(db, "user-1", "slate-one");
      const legacy = exportUserSnapshot(db, "user-1", userKey);
      delete legacy.slate;

      assert.doesNotThrow(() => importUserSnapshot(db, "user-1", legacy, userKey));
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM slate_projects WHERE user_id = ?").get(
            "user-1",
          ) as { count: number }
        ).count,
        1,
      );
    });
  });

  it("defaults title provenance for older Slate account backups", () => {
    withBackupDatabase((db, userKey) => {
      seedSlateBackupFixture(db, "user-1", "slate-legacy-title");
      const legacy = exportUserSnapshot(db, "user-1", userKey);
      assert.ok(legacy.slate?.projects[0]);
      delete legacy.slate.projects[0].title_origin;

      importUserSnapshot(db, "user-1", legacy, userKey);
      const project = db
        .prepare("SELECT title_origin FROM slate_projects WHERE id = ?")
        .get("slate-legacy-title-project") as { title_origin: string };
      assert.equal(project.title_origin, "writer");
    });
  });
});

const SLATE_BACKUP_TEST_TABLES = [
  "slate_series",
  "slate_projects",
  "slate_revisions",
  "slate_versions",
  "slate_sections",
  "slate_section_versions",
  "slate_manuscript_state",
  "slate_continuity_sources",
  "slate_continuity_entities",
  "slate_continuity_aliases",
  "slate_continuity_claims",
  "slate_continuity_events",
  "slate_continuity_relationships",
  "slate_continuity_knowledge",
  "slate_continuity_threads",
  "slate_continuity_concerns",
  "slate_continuity_generations",
  "slate_continuity_jobs",
] as const;

function seedSlateBackupFixture(
  db: ReturnType<typeof createDatabase>,
  userId: string,
  prefix: string,
): void {
  const now = "2026-07-16T12:00:00.000Z";
  const seriesId = `${prefix}-series`;
  const projectId = `${prefix}-project`;
  const sectionId = `${prefix}-section`;
  const sourceId = `${prefix}-source`;
  const entityId = `${prefix}-entity`;
  const claimId = `${prefix}-claim`;
  const eventId = `${prefix}-event`;
  const producerVersions = JSON.stringify({ schema: 1, extraction: 1 });

  db.prepare(
    "INSERT INTO slate_series (id, user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(seriesId, userId, "The Long Saga", "A restored saga.", now, now);
  db.prepare(
    `INSERT INTO slate_projects (
      id, user_id, series_id, book_ordinal, title, title_origin, spark, spark_wildcards_json,
      premise, phase, structure_json, manuscript, direction,
      continuity_active_version, continuity_target_version,
      continuity_active_generation, continuity_upgrade_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    userId,
    seriesId,
    1,
    "Book One",
    "spark",
    "A vanished crown returns.",
    JSON.stringify({ realm: "Ashfall" }),
    "A succession crisis.",
    "draft",
    "[]",
    "The restored manuscript.",
    "Continue quietly.",
    "0.0",
    "0.0",
    0,
    "current",
    now,
    now,
  );
  db.prepare(
    `UPDATE slate_projects
        SET prose_mode = 'auto', prose_provider = 'openai',
            prose_model = 'gpt-5-mini', deliberation_config_json = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    JSON.stringify({
      lux: {
        provider: "openai",
        model: "gpt-5-mini",
        directive: "Protect the central relationship.",
      },
      umbra: {
        provider: "local",
        model: "qwen3:8b",
        directive: "Interrogate convenient reversals.",
      },
    }),
    projectId,
    userId,
  );
  db.prepare(
    `INSERT INTO slate_revisions (
      id, project_id, user_id, action, scope, direction, original_text, proposed_text,
      status, provider, model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-revision`,
    projectId,
    userId,
    "rewrite",
    "selection",
    "Sharpen this.",
    "Old line.",
    "New line.",
    "pending",
    "local",
    "llama3.2",
    now,
  );
  db.prepare(
    "INSERT INTO slate_versions (id, project_id, user_id, reason, structure_json, manuscript, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(`${prefix}-version`, projectId, userId, "checkpoint", "[]", "Before rewrite.", now);
  db.prepare(
    `INSERT INTO slate_sections (
      id, project_id, series_id, user_id, kind, ordinal, title, summary, direction,
      prose, locked_ranges_json, locked, status, revision, content_hash,
      last_mutation_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sectionId,
    projectId,
    seriesId,
    userId,
    "scene",
    0,
    "The Return",
    "The crown appears.",
    "Keep the witness uncertain.",
    "The restored section.",
    "[]",
    0,
    "drafted",
    3,
    "section-hash",
    "mutation-3",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_section_versions (
      id, project_id, section_id, user_id, revision, reason, title, summary,
      direction, prose, locked, status, content_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-section-version`,
    projectId,
    sectionId,
    userId,
    2,
    "human_edit",
    "The Return",
    "The crown appears.",
    "Keep the witness uncertain.",
    "Earlier section text.",
    0,
    "drafted",
    "section-version-hash",
    now,
  );
  db.prepare(
    `INSERT INTO slate_manuscript_state (
      project_id, user_id, storage_version, structure_revision,
      original_manuscript_hash, migrated_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(projectId, userId, 1, 4, "manuscript-hash", now, now);
  db.prepare(
    `INSERT INTO slate_continuity_sources (
      id, user_id, series_id, project_id, section_id, scope_kind, kind,
      source_revision, content, content_hash, authority, provider, model,
      producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    userId,
    seriesId,
    projectId,
    sectionId,
    "section",
    "human_edit",
    3,
    "The crown is iron.",
    "source-hash",
    "authoritative",
    "local",
    "llama3.2",
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_entities (
      id, user_id, series_id, kind, canonical_name, description, locked,
      source_id, producer_versions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entityId,
    userId,
    seriesId,
    "character",
    "Mara",
    "The reluctant witness.",
    0,
    sourceId,
    producerVersions,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_aliases (
      id, user_id, series_id, entity_id, alias, normalized_alias, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`${prefix}-alias`, userId, seriesId, entityId, "The Witness", "the witness", sourceId, now);
  db.prepare(
    `INSERT INTO slate_continuity_claims (
      id, user_id, series_id, project_id, section_id, scope_kind,
      subject_entity_id, predicate, value, epistemic_status, confidence,
      anchors_json, source_id, producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claimId,
    userId,
    seriesId,
    projectId,
    sectionId,
    "section",
    entityId,
    "saw",
    "the iron crown",
    "demonstrated",
    0.98,
    "[]",
    sourceId,
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_events (
      id, user_id, series_id, project_id, section_id, scope_kind, title,
      description, chronology_key, participant_entity_ids_json,
      location_entity_id, anchors_json, source_id, producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    eventId,
    userId,
    seriesId,
    projectId,
    sectionId,
    "section",
    "The crown returns",
    "Mara sees it.",
    "book-1:scene-1",
    JSON.stringify([entityId]),
    entityId,
    "[]",
    sourceId,
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_relationships (
      id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
      epistemic_status, anchors_json, source_id, producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-relationship`,
    userId,
    seriesId,
    entityId,
    entityId,
    "self_trust",
    "fractured",
    "demonstrated",
    "[]",
    sourceId,
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_knowledge (
      id, user_id, series_id, character_entity_id, claim_id, learned_event_id,
      status, anchors_json, source_id, producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-knowledge`,
    userId,
    seriesId,
    entityId,
    claimId,
    eventId,
    "knows",
    "[]",
    sourceId,
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_threads (
      id, user_id, series_id, project_id, section_id, scope_kind, label,
      status, due_section_id, anchors_json, source_id, producer_versions_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-thread`,
    userId,
    seriesId,
    projectId,
    sectionId,
    "book",
    "Who forged the crown?",
    "open",
    sectionId,
    "[]",
    sourceId,
    producerVersions,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_concerns (
      id, user_id, series_id, project_id, section_id, scope_kind, kind,
      severity, status, summary, explanation, claim_ids_json, anchors_json,
      recommended_resolution, producer_versions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-concern`,
    userId,
    seriesId,
    projectId,
    sectionId,
    "book",
    "ambiguity",
    "gentle",
    "open",
    "The crown's maker is unclear.",
    "Two clues point in different directions.",
    JSON.stringify([claimId]),
    "[]",
    "Choose which clue is true.",
    producerVersions,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_generations (
      id, user_id, project_id, generation, status, target_version,
      source_fingerprint, comparison_summary, producer_versions_json,
      created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-generation`,
    userId,
    projectId,
    1,
    "active",
    "0.0",
    "fingerprint",
    "No material drift.",
    producerVersions,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO slate_continuity_jobs (
      id, user_id, series_id, project_id, section_id, source_id,
      source_revision, kind, status, attempts, input_fingerprint,
      available_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `${prefix}-job`,
    userId,
    seriesId,
    projectId,
    sectionId,
    sourceId,
    3,
    "extract",
    "completed",
    1,
    "job-fingerprint",
    now,
    now,
    now,
  );
}

describe("backup clone lineage", () => {
  it("preserves clone-family markers only in full account backups", () => {
    withBackupDatabase((db, userKey) => {
      const now = "2026-01-01T00:00:00.000Z";
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, created_at, updated_at)
         VALUES (?, 'user-1', ?, '', ?, ?)`,
      ).run("root-bot", "Original", now, now);
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, clone_family_id, created_at, updated_at)
         VALUES (?, 'user-1', ?, '', ?, ?, ?)`,
      ).run("clone-bot", "Original Copy", "root-bot", now, now);

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(
        snapshot.bots?.find((bot) => bot.id === "clone-bot")?.cloneFamilyId,
        "root-bot",
      );

      db.prepare("UPDATE bots SET clone_family_id = NULL WHERE id = ?").run(
        "clone-bot",
      );
      importUserSnapshot(db, "user-1", snapshot, userKey);
      assert.equal(
        (
          db
            .prepare("SELECT clone_family_id FROM bots WHERE id = ?")
            .get("clone-bot") as { clone_family_id: string | null }
        ).clone_family_id,
        "root-bot",
      );
    });
  });
});

describe("backup spectral Power compatibility", () => {
  it("round-trips prompt metadata, curated sigils, and audience exclusions", () => {
    withBackupDatabase((db, userKey) => {
      const intent = "Only Plankton hears me; everyone except Plankton sees me.";
      const power = {
        version: 1 as const,
        id: "selective-specter",
        authoringMode: "prompt" as const,
        name: "Selective Specter",
        intent,
        sigil: "eye" as const,
        enabled: true,
        compileStatus: "ready" as const,
        compiled: {
          version: 1 as const,
          sourceHash: botPowerSourceHashForPowerV1({
            authoringMode: "prompt",
            name: "Selective Specter",
            intent,
          }),
          selfCue: "Plankton hears but cannot see the holder.",
          observerCue: "Others see but cannot hear the holder.",
          effects: [
            {
              type: "awareness" as const,
              allowed: [{ kind: "all" as const }],
              excluded: [{ kind: "bot" as const, name: "Plankton" }],
            },
            {
              type: "speech_audience" as const,
              allowed: [{ kind: "bot" as const, name: "Plankton" }],
            },
            { type: "avatar_visibility" as const, mode: "translucent" as const },
          ],
          ruleLabels: ["Selective spectral presence"],
        },
      };
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, powers_json, created_at, updated_at)
         VALUES ('prompt-spectral-bot', 'user-1', 'Ryuk', '', ?, ?, ?)`,
      ).run(
        JSON.stringify([power]),
        "2026-07-21T00:00:00.000Z",
        "2026-07-21T00:00:00.000Z",
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      db.prepare("UPDATE bots SET powers_json = '[]' WHERE id = 'prompt-spectral-bot'").run();
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db.prepare(
        "SELECT powers_json FROM bots WHERE id = 'prompt-spectral-bot'",
      ).get() as { powers_json: string | null };
      assert.deepEqual(parseStoredBotPowersV1(restored.powers_json)[0], power);
    });
  });

  it("upgrades and round-trips a frozen targeted-Invisible bot without changing its source hash", () => {
    withBackupDatabase((db, userKey) => {
      const name = "Invisible";
      const intent = "Can only be seen by Light Yagami.";
      const sourceHash = botPowerSourceHashV1(name, intent);
      const legacyPowers = [{
        version: 1,
        id: "invisible",
        name,
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash,
          selfCue: "Remain unseen except to Light.",
          observerCue: "Only Light can perceive the holder.",
          effects: [{
            type: "awareness",
            allowed: [{ kind: "bot", name: "Light Yagami" }],
          }],
          ruleLabels: ["Visible only to Light Yagami"],
        },
      }];
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, powers_json, created_at, updated_at)
         VALUES (?, 'user-1', ?, '', ?, ?, ?)`,
      ).run(
        "spectral-bot",
        "Ryuk",
        JSON.stringify(legacyPowers),
        "2026-07-21T00:00:00.000Z",
        "2026-07-21T00:00:00.000Z",
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      const exportedPower = snapshot.bots
        ?.find((bot) => bot.id === "spectral-bot")
        ?.powers?.[0];
      assert.equal(exportedPower?.compiled?.sourceHash, sourceHash);
      assert.deepEqual(exportedPower?.compiled?.effects, [
        legacyPowers[0]!.compiled.effects[0],
        { type: "avatar_visibility", mode: "translucent" },
      ]);

      db.prepare("UPDATE bots SET powers_json = '[]' WHERE id = ?").run(
        "spectral-bot",
      );
      importUserSnapshot(db, "user-1", snapshot, userKey);
      const restored = db.prepare(
        "SELECT powers_json FROM bots WHERE id = ?",
      ).get("spectral-bot") as { powers_json: string | null };
      const restoredPower = parseStoredBotPowersV1(restored.powers_json)[0];
      assert.deepEqual(restoredPower, exportedPower);
    });
  });
});

function withBackupDatabase(
  run: (db: ReturnType<typeof createDatabase>, userKey: Buffer) => void
): void {
  const tempDir = mkdtempSync(join(tmpdir(), "prism-backup-"));
  const previousDbPath = process.env.DB_PATH;
  const previousDataDir = process.env.LOCALAI_DATA_DIR;
  process.env.DB_PATH = join(tempDir, "backup.db");
  delete process.env.LOCALAI_DATA_DIR;

  try {
    const db = createDatabase();
    const userKey = Buffer.alloc(32, 1);
    db.prepare(
      `
      INSERT INTO users (
        id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      "user-1",
      "user-1@example.com",
      "User One",
      "hash",
      "salt",
      "cipher",
      "iv",
      "tag",
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z"
    );

    run(db, userKey);
    db.close();
  } finally {
    restoreEnv("DB_PATH", previousDbPath);
    restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
