/**
 * Space Lens audio inventory — synthesized / uploaded player-owned clips only.
 * Bundled runtime foley is excluded.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  ACTION_SFX_PACK_KIND_LABELS,
  isActionSfxPackKind,
  normalizeBotAudioVoiceProfileV1,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
} from "@localai/shared";

export type AudioLibraryBin = "sound_effects" | "music";

export type AudioLibraryClipDto = {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
  url: string;
  source: "synthesized" | "uploaded";
  bytes: number;
};

function looksLikeVocalTtsPromptSeed(seed: string): boolean {
  return /^\[[^\]]{2,48}\](?:\s+[A-Za-z]{1,12})?$/u.test(seed.trim());
}

function parseProfileJson(raw: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  // Rough decoded size for base64 payloads.
  return Math.max(0, Math.floor((payload.length * 3) / 4));
}

function listActionSfxPackClips(
  db: DatabaseSync,
  userId: string,
): AudioLibraryClipDto[] {
  const rows = db
    .prepare(
      `SELECT clips.owner_kind, clips.owner_id, clips.kind, clips.variant_index,
              clips.content_type, clips.prompt_seed, clips.created_at,
              length(clips.audio_bytes) AS byte_length,
              bots.name AS bot_name
         FROM action_sfx_pack_clips clips
         LEFT JOIN bots
           ON bots.id = clips.owner_id
          AND bots.user_id = clips.user_id
          AND clips.owner_kind = 'bot'
        WHERE clips.user_id = ?
        ORDER BY clips.created_at DESC, clips.owner_kind, clips.owner_id,
                 clips.kind, clips.variant_index`,
    )
    .all(userId) as Array<{
    owner_kind: string;
    owner_id: string;
    kind: string;
    variant_index: number;
    content_type: string;
    prompt_seed: string;
    created_at: string;
    byte_length: number | bigint;
    bot_name: string | null;
  }>;

  const clips: AudioLibraryClipDto[] = [];
  for (const row of rows) {
    if (!isActionSfxPackKind(row.kind)) continue;
    if (!looksLikeVocalTtsPromptSeed(row.prompt_seed)) continue;
    const ownerKind = row.owner_kind as ActionSfxPackOwnerKind;
    if (ownerKind !== "bot" && ownerKind !== "player") continue;
    const kind = row.kind as ActionSfxPackKind;
    const ownerLabel =
      ownerKind === "player"
        ? "Player"
        : row.bot_name?.trim() || row.owner_id;
    const kindLabel = ACTION_SFX_PACK_KIND_LABELS[kind];
    const params = new URLSearchParams({
      ownerKind,
      ownerId: row.owner_id,
      kind,
      variantIndex: String(row.variant_index),
    });
    clips.push({
      id: `action-sfx:${ownerKind}:${row.owner_id}:${kind}:${row.variant_index}`,
      label: `${kindLabel} · ${row.variant_index + 1}`,
      group: `action-sfx:${ownerKind}:${row.owner_id}`,
      groupLabel: `${ownerLabel} · Action pack`,
      url: `/api/action-sfx-pack/clip?${params.toString()}`,
      source: "synthesized",
      bytes: Number(row.byte_length) || 0,
    });
  }
  return clips;
}

function listAvatarSfxClips(
  db: DatabaseSync,
  userId: string,
): AudioLibraryClipDto[] {
  const rows = db
    .prepare(
      `SELECT id, name, authored_audio_voice_profile, audio_voice_profile_override
         FROM bots
        WHERE user_id = ?
        ORDER BY name COLLATE NOCASE, id`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    authored_audio_voice_profile: string | null;
    audio_voice_profile_override: string | null;
  }>;

  const clips: AudioLibraryClipDto[] = [];
  for (const row of rows) {
    const profile = normalizeBotAudioVoiceProfileV1(
      parseProfileJson(row.audio_voice_profile_override) ??
        parseProfileJson(row.authored_audio_voice_profile),
    );
    const avatarSfx = profile.avatarSfx;
    if (!avatarSfx?.audioDataUrl?.trim()) continue;
    const source =
      avatarSfx.source === "upload" ? "uploaded" : "synthesized";
    const label =
      avatarSfx.fileName?.trim() ||
      avatarSfx.prompt?.trim() ||
      "Avatar sound loop";
    clips.push({
      id: `avatar-sfx:${row.id}`,
      label,
      group: `avatar-sfx:${row.id}`,
      groupLabel: `${row.name.trim() || row.id} · Avatar loop`,
      url: `/api/bots/${encodeURIComponent(row.id)}/avatar-sfx`,
      source,
      bytes: dataUrlByteLength(avatarSfx.audioDataUrl),
    });
  }
  return clips;
}

function listSignalMusicClips(
  db: DatabaseSync,
  userId: string,
): AudioLibraryClipDto[] {
  const clips: AudioLibraryClipDto[] = [];

  const introRows = db
    .prepare(
      `SELECT audio.show_id, audio.prompt, audio.revision,
              length(audio.audio_bytes) AS byte_length,
              length(audio.outdent_audio_bytes) AS outdent_byte_length,
              audio.outdent_audio_bytes IS NOT NULL AS has_outdent,
              shows.title AS show_title
         FROM botcast_show_intro_audio audio
         JOIN botcast_shows shows
           ON shows.id = audio.show_id AND shows.user_id = audio.user_id
        WHERE audio.user_id = ?
        ORDER BY audio.updated_at DESC`,
    )
    .all(userId) as Array<{
    show_id: string;
    prompt: string;
    revision: number;
    byte_length: number | bigint;
    outdent_byte_length: number | bigint | null;
    has_outdent: number;
    show_title: string;
  }>;

  for (const row of introRows) {
    const showTitle = row.show_title.trim() || row.show_id;
    clips.push({
      id: `signal-intro:${row.show_id}:r${row.revision}`,
      label: `${showTitle} · Ident`,
      group: `signal:${row.show_id}`,
      groupLabel: `${showTitle} · Signal`,
      url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/intro-audio`,
      source: "synthesized",
      bytes: Number(row.byte_length) || 0,
    });
    if (row.has_outdent) {
      clips.push({
        id: `signal-outdent:${row.show_id}:r${row.revision}`,
        label: `${showTitle} · Outdent`,
        group: `signal:${row.show_id}`,
        groupLabel: `${showTitle} · Signal`,
        url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/outdent-audio`,
        source: "synthesized",
        bytes: Number(row.outdent_byte_length) || 0,
      });
    }
  }

  const atmosphereRows = db
    .prepare(
      `SELECT audio.show_id, audio.prompt, audio.revision,
              length(audio.audio_bytes) AS byte_length,
              shows.title AS show_title
         FROM botcast_show_atmosphere_audio audio
         JOIN botcast_shows shows
           ON shows.id = audio.show_id AND shows.user_id = audio.user_id
        WHERE audio.user_id = ?
        ORDER BY audio.updated_at DESC`,
    )
    .all(userId) as Array<{
    show_id: string;
    prompt: string;
    revision: number;
    byte_length: number | bigint;
    show_title: string;
  }>;

  for (const row of atmosphereRows) {
    const showTitle = row.show_title.trim() || row.show_id;
    clips.push({
      id: `signal-atmosphere:${row.show_id}:r${row.revision}`,
      label: `${showTitle} · Atmosphere bed`,
      group: `signal:${row.show_id}`,
      groupLabel: `${showTitle} · Signal`,
      url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/atmosphere-audio`,
      source: "synthesized",
      bytes: Number(row.byte_length) || 0,
    });
  }

  return clips;
}

export function listAudioLibraryClips(
  db: DatabaseSync,
  userId: string,
  bin: AudioLibraryBin,
): AudioLibraryClipDto[] {
  if (bin === "music") {
    return listSignalMusicClips(db, userId);
  }
  return [
    ...listActionSfxPackClips(db, userId),
    ...listAvatarSfxClips(db, userId),
  ];
}

export function summarizeAudioLibraryBytes(
  db: DatabaseSync,
  userId: string,
): { soundEffectsBytes: number; musicBytes: number; totalBytes: number } {
  const soundEffectsBytes = listAudioLibraryClips(
    db,
    userId,
    "sound_effects",
  ).reduce((sum, clip) => sum + clip.bytes, 0);
  const musicBytes = listAudioLibraryClips(db, userId, "music").reduce(
    (sum, clip) => sum + clip.bytes,
    0,
  );
  return {
    soundEffectsBytes,
    musicBytes,
    totalBytes: soundEffectsBytes + musicBytes,
  };
}

export function readBotAvatarSfxBytes(
  db: DatabaseSync,
  userId: string,
  botId: string,
): { contentType: string; bytes: Buffer } | null {
  const row = db
    .prepare(
      `SELECT authored_audio_voice_profile, audio_voice_profile_override
         FROM bots
        WHERE id = ? AND user_id = ?`,
    )
    .get(botId, userId) as
    | {
        authored_audio_voice_profile: string | null;
        audio_voice_profile_override: string | null;
      }
    | undefined;
  if (!row) return null;
  const profile = normalizeBotAudioVoiceProfileV1(
    parseProfileJson(row.audio_voice_profile_override) ??
      parseProfileJson(row.authored_audio_voice_profile),
  );
  const dataUrl = profile.avatarSfx?.audioDataUrl?.trim();
  if (!dataUrl) return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/u.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1]?.trim() || "audio/mpeg";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    const bytes = Buffer.from(
      isBase64 ? payload : decodeURIComponent(payload),
      isBase64 ? "base64" : "utf8",
    );
    if (bytes.length === 0) return null;
    return { contentType, bytes };
  } catch {
    return null;
  }
}
