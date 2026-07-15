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
          id, user_id, name, system_prompt, voice_preview_line, avatar_details_json,
          face_eyes_font, face_eye_character, face_eye_animation,
          face_mouth_font, face_mouth_character, face_mouth_animation,
          face_mouth_coffee_pucker, face_font_weight,
          face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg,
          face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg,
          face_blink_bar, face_blink_scale, face_blink_offset_x, face_blink_offset_y,
          face_thinking_frames,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "bot-1",
        "user-1",
        "Avatar Bot",
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
          pitch: 0,
          warmth: 0,
          pace: 0,
          lilt: 0,
          bottishTone: 0.45,
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
        "UPDATE bots SET voice_preview_line = NULL, avatar_details_json = NULL, face_eyes_font = NULL, face_eye_character = NULL, face_eye_animation = NULL, face_mouth_font = NULL, face_mouth_character = NULL, face_mouth_animation = NULL, face_mouth_coffee_pucker = 0, face_font_weight = NULL, face_eye_scale = NULL, face_eye_offset_x = NULL, face_eye_offset_y = NULL, face_eye_rotation_deg = NULL, face_mouth_scale = NULL, face_mouth_offset_x = NULL, face_mouth_offset_y = NULL, face_mouth_rotation_deg = NULL, face_blink_bar = NULL, face_blink_scale = NULL, face_blink_offset_x = NULL, face_blink_offset_y = NULL, face_thinking_frames = NULL WHERE id = ?"
      ).run("bot-1");

      importUserSnapshot(db, "user-1", snapshot, userKey);

      const restored = db
        .prepare(
          "SELECT voice_preview_line, avatar_details_json, face_eyes_font, face_eye_character, face_eye_animation, face_mouth_font, face_mouth_character, face_mouth_animation, face_mouth_coffee_pucker, face_font_weight, face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg, face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg, face_blink_bar, face_blink_scale, face_blink_offset_x, face_blink_offset_y, face_thinking_frames, profile_picture_image_id FROM bots WHERE id = ?"
        )
        .get("bot-1") as {
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
  it("round-trips account and bot profiles without touching retired Coffee player columns", () => {
    withBackupDatabase((db, userKey) => {
      db.prepare(
        "UPDATE users SET voice_mode = ?, voice_effects_enabled = 0, voice_volume = ?, english_voice_engine = ?, default_system_voice_name = ?, default_elevenlabs_voice_id = ?, elevenlabs_voice_bank = ?, elevenlabs_voice_model = ?, player_audio_voice_profile = ?, player_name_pronunciation = ?, prism_default_bot_audio_voice_profile = ? WHERE id = ?"
      ).run(
        "babble",
        0.65,
        "elevenlabs",
        "Alex",
        "eleven-global",
        JSON.stringify({ "voice-1": "eleven-a" }),
        "eleven_flash_v2_5",
        JSON.stringify({ v: 1, baseVoiceId: "voice-3", pitch: 0, warmth: 0, pace: 0, lilt: 0 }),
        "Jair-id",
        JSON.stringify({ v: 1, baseVoiceId: "voice-5", pitch: 0.4, warmth: 0, pace: 0, lilt: 0 }),
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
        JSON.stringify({ v: 1, baseVoiceId: "voice-4", pitch: 0.2, warmth: -0.1, pace: 0.3, lilt: 0.4 }),
        JSON.stringify({ v: 1, baseVoiceId: "voice-2", pitch: -0.4, warmth: 0.6, pace: 0, lilt: -0.2 }),
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

      const snapshot = exportUserSnapshot(db, "user-1", userKey);
      assert.equal(snapshot.settings?.voiceMode, "babble");
      assert.equal(snapshot.settings?.voiceEffectsEnabled, false);
      assert.equal(snapshot.settings?.voiceVolume, 0.65);
      assert.equal(snapshot.settings?.prismDefaultBotAudioVoiceProfile?.baseVoiceId, "voice-5");
      assert.equal(snapshot.settings?.englishVoiceEngine, "elevenlabs");
      assert.equal(snapshot.settings?.defaultSystemVoiceName, "Alex");
      assert.equal(snapshot.settings?.defaultElevenLabsVoiceId, "eleven-global");
      assert.equal(snapshot.settings?.elevenLabsVoiceModel, "eleven_flash_v2_5");
      assert.equal(snapshot.settings?.elevenLabsVoiceBank?.["voice-1"], "eleven-a");
      assert.equal("playerAudioVoiceProfile" in (snapshot.settings ?? {}), false);
      assert.equal("playerNamePronunciation" in (snapshot.settings ?? {}), false);

      db.prepare(
        "UPDATE users SET voice_mode = 'mute', voice_effects_enabled = 1, voice_volume = 1, english_voice_engine = 'builtin', default_system_voice_name = NULL, default_elevenlabs_voice_id = NULL, elevenlabs_voice_bank = '{}', elevenlabs_voice_model = NULL, player_audio_voice_profile = ?, player_name_pronunciation = ?, prism_default_bot_audio_voice_profile = NULL WHERE id = ?"
      ).run(
        JSON.stringify({ v: 1, baseVoiceId: "voice-2", pitch: 0, warmth: 0, pace: 0, lilt: 0 }),
        "Keep me",
        "user-1"
      );
      importUserSnapshot(db, "user-1", snapshot, userKey);

      const restoredUser = db.prepare(
        "SELECT voice_mode, voice_effects_enabled, voice_volume, english_voice_engine, default_system_voice_name, default_elevenlabs_voice_id, elevenlabs_voice_bank, elevenlabs_voice_model, player_audio_voice_profile, player_name_pronunciation, prism_default_bot_audio_voice_profile FROM users WHERE id = ?"
      ).get("user-1") as Record<string, string | null>;
      assert.equal(restoredUser.voice_mode, "babble");
      assert.equal(restoredUser.voice_effects_enabled, 0);
      assert.equal(restoredUser.voice_volume, 0.65);
      assert.equal(JSON.parse(restoredUser.prism_default_bot_audio_voice_profile ?? "{}").baseVoiceId, "voice-5");
      assert.equal(restoredUser.english_voice_engine, "elevenlabs");
      assert.equal(restoredUser.default_system_voice_name, "Alex");
      assert.equal(restoredUser.default_elevenlabs_voice_id, "eleven-global");
      assert.equal(restoredUser.elevenlabs_voice_model, "eleven_flash_v2_5");
      assert.equal(JSON.parse(restoredUser.elevenlabs_voice_bank ?? "{}")["voice-1"], "eleven-a");
      assert.equal(JSON.parse(restoredUser.player_audio_voice_profile ?? "{}").baseVoiceId, "voice-2");
      assert.equal(restoredUser.player_name_pronunciation, "Keep me");

      const restoredBot = db.prepare(
        "SELECT authored_audio_voice_profile, audio_voice_profile_override FROM bots WHERE id = ?"
      ).get("voice-bot") as Record<string, string>;
      assert.equal(JSON.parse(restoredBot.authored_audio_voice_profile).baseVoiceId, "voice-4");
      assert.equal(JSON.parse(restoredBot.audio_voice_profile_override).baseVoiceId, "voice-2");
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
