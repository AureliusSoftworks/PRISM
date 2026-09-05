/**
 * Compatibility-facing audio library. Canonical assets live in the encrypted
 * audio catalog; older product-owned stores are projected here without moving
 * or deleting their bytes.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1,
  MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1,
  normalizeBotAudioVoiceProfileV1,
  type AudioAssetCategoryV1,
  type AudioAssetSafetyV1,
  type AudioAssetScopeV1,
  type AudioAssetStatusV1,
  type AudioUsageRefV1,
} from "@localai/shared";
import {
  listAudioAssetUsagesV1,
  listCanonicalAudioAssetsV1,
  summarizeCanonicalAudioAssetCategoryBytesV1,
} from "./audio-asset-catalog.ts";

/** `sound_effects` remains accepted only as a legacy API query alias. */
export type AudioLibraryBin = AudioAssetCategoryV1 | "sound_effects";

export type AudioLibraryClipDto = {
  id: string;
  label: string;
  description: string;
  group: string;
  groupLabel: string;
  url: string;
  category: AudioAssetCategoryV1;
  scope: AudioAssetScopeV1;
  status: AudioAssetStatusV1;
  source: "generated" | "uploaded" | "legacy" | "prism";
  semanticRole: string;
  automaticTags: string[];
  playerTags: string[];
  context: Record<string, string>;
  safety: AudioAssetSafetyV1;
  bytes: number;
  durationMs: number | null;
  loopable: boolean;
  applet: string;
  provider: string | null;
  model: string | null;
  usageCount: number;
  usageRefs: AudioUsageRefV1[];
  lastAccessedAt: string | null;
  readOnly: boolean;
};

export function normalizeAudioLibraryBin(
  value: string | null | undefined,
): AudioAssetCategoryV1 | null {
  if (value === "sound_effects") return "effects";
  return value === "music" || value === "effects" || value === "ambience"
    ? value
    : null;
}

function legacyClip(
  clip: Pick<
    AudioLibraryClipDto,
    "id" | "label" | "group" | "groupLabel" | "url" | "category" | "scope" |
      "semanticRole" | "automaticTags" | "bytes" | "applet"
  > & Partial<AudioLibraryClipDto>,
): AudioLibraryClipDto {
  return {
    description: "Indexed from an existing PRISM audio source.",
    status: "accepted",
    source: "legacy",
    playerTags: [],
    context: {},
    safety: "nonsemantic",
    durationMs: null,
    loopable: false,
    provider: null,
    model: null,
    usageCount: 1,
    usageRefs: [],
    lastAccessedAt: null,
    readOnly: true,
    ...clip,
  };
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
  return Math.max(0, Math.floor((dataUrl.slice(comma + 1).length * 3) / 4));
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table));
}

function listAvatarSfxClips(
  db: DatabaseSync,
  userId: string,
): AudioLibraryClipDto[] {
  const rows = db.prepare(
    `SELECT id, name, authored_audio_voice_profile, audio_voice_profile_override
       FROM bots WHERE user_id = ? ORDER BY name COLLATE NOCASE, id`,
  ).all(userId) as Array<{
    id: string;
    name: string;
    authored_audio_voice_profile: string | null;
    audio_voice_profile_override: string | null;
  }>;
  return rows.flatMap((row) => {
    const profile = normalizeBotAudioVoiceProfileV1(
      parseProfileJson(row.audio_voice_profile_override) ??
        parseProfileJson(row.authored_audio_voice_profile),
    );
    const avatarSfx = profile.avatarSfx;
    if (!avatarSfx?.audioDataUrl?.trim()) return [];
    const label = avatarSfx.fileName?.trim() || avatarSfx.prompt?.trim() || "Avatar sound loop";
    return [legacyClip({
      id: `avatar-sfx:${row.id}`,
      label,
      group: `avatar-sfx:${row.id}`,
      groupLabel: `${row.name.trim() || row.id} · Avatar loop`,
      url: `/api/bots/${encodeURIComponent(row.id)}/avatar-sfx`,
      category: "effects",
      scope: "identity",
      semanticRole: "avatar_signature",
      automaticTags: ["avatar", "signature"],
      bytes: dataUrlByteLength(avatarSfx.audioDataUrl),
      applet: "avatar",
      source: avatarSfx.source === "upload" ? "uploaded" : "legacy",
      safety: "stage_cue_required",
    })];
  });
}

function listSignalMusicClips(db: DatabaseSync, userId: string): AudioLibraryClipDto[] {
  const rows = db.prepare(
    `SELECT audio.show_id, audio.revision,
            length(audio.audio_bytes) AS byte_length,
            length(audio.outdent_audio_bytes) AS outdent_byte_length,
            audio.outdent_audio_bytes IS NOT NULL AS has_outdent,
            shows.title AS show_title
       FROM botcast_show_intro_audio audio
       JOIN botcast_shows shows ON shows.id = audio.show_id AND shows.user_id = audio.user_id
      WHERE audio.user_id = ? ORDER BY audio.updated_at DESC`,
  ).all(userId) as Array<{
    show_id: string;
    revision: number;
    byte_length: number | bigint;
    outdent_byte_length: number | bigint | null;
    has_outdent: number;
    show_title: string;
  }>;
  return rows.flatMap((row) => {
    const title = row.show_title.trim() || row.show_id;
    const clips = [legacyClip({
      id: `signal-intro:${row.show_id}:r${row.revision}`,
      label: `${title} · Ident`,
      group: `signal:${row.show_id}`,
      groupLabel: `${title} · Signal`,
      url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/intro-audio`,
      category: "music",
      scope: "identity",
      semanticRole: "show_ident",
      automaticTags: ["signal", "ident"],
      bytes: Number(row.byte_length) || 0,
      applet: "signal",
    })];
    if (row.has_outdent) clips.push(legacyClip({
      id: `signal-outdent:${row.show_id}:r${row.revision}`,
      label: `${title} · Outdent`,
      group: `signal:${row.show_id}`,
      groupLabel: `${title} · Signal`,
      url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/outdent-audio`,
      category: "music",
      scope: "identity",
      semanticRole: "show_outdent",
      automaticTags: ["signal", "outdent"],
      bytes: Number(row.outdent_byte_length) || 0,
      applet: "signal",
    }));
    return clips;
  });
}

function listSignalAmbienceClips(db: DatabaseSync, userId: string): AudioLibraryClipDto[] {
  const rows = db.prepare(
    `SELECT audio.show_id, audio.revision, length(audio.audio_bytes) AS byte_length,
            shows.title AS show_title
       FROM botcast_show_atmosphere_audio audio
       JOIN botcast_shows shows ON shows.id = audio.show_id AND shows.user_id = audio.user_id
      WHERE audio.user_id = ? ORDER BY audio.updated_at DESC`,
  ).all(userId) as Array<{
    show_id: string;
    revision: number;
    byte_length: number | bigint;
    show_title: string;
  }>;
  return rows.map((row) => {
    const title = row.show_title.trim() || row.show_id;
    return legacyClip({
      id: `signal-atmosphere:${row.show_id}:r${row.revision}`,
      label: `${title} · Atmosphere bed`,
      group: `signal:${row.show_id}`,
      groupLabel: `${title} · Signal`,
      url: `/api/botcast/shows/${encodeURIComponent(row.show_id)}/atmosphere-audio`,
      category: "ambience",
      scope: "identity",
      semanticRole: "world_bed",
      automaticTags: ["signal", "atmosphere", "world bed"],
      bytes: Number(row.byte_length) || 0,
      applet: "signal",
      loopable: true,
    });
  });
}

function listMansionAudioClips(
  db: DatabaseSync,
  userId: string,
  category: "music" | "ambience",
): AudioLibraryClipDto[] {
  if (
    !tableExists(db, "debate_mystery_mansion_asset_refs") ||
    !tableExists(db, "debate_mystery_mansion_assets") ||
    !tableExists(db, "debate_mystery_mansion_bundles")
  ) return [];
  const rows = db.prepare(
    `SELECT refs.bundle_id, refs.logical_id, assets.id AS asset_id,
            assets.byte_size, assets.duration_ms, assets.provider, assets.model,
            bundles.name, bundles.style_json, bundles.library_metadata_json
       FROM debate_mystery_mansion_asset_refs refs
       JOIN debate_mystery_mansion_assets assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
       JOIN debate_mystery_mansion_bundles bundles
         ON bundles.id = refs.bundle_id AND bundles.user_id = refs.user_id
      WHERE refs.user_id = ? AND refs.role = 'music'
        AND ${category === "ambience" ? "refs.logical_id LIKE 'ambience:%'" : "refs.logical_id NOT LIKE 'ambience:%'"}
      ORDER BY refs.created_at DESC`,
  ).all(userId) as Array<{
    bundle_id: string;
    logical_id: string;
    asset_id: string;
    byte_size: number | bigint;
    duration_ms: number | bigint | null;
    provider: string | null;
    model: string | null;
    name: string;
    style_json: string;
    library_metadata_json: string | null;
  }>;
  return rows.map((row) => {
    const name = row.name.trim() || row.bundle_id;
    let tags: string[] = ["mansion", "whodunnit"];
    try {
      const style = JSON.parse(row.style_json) as Record<string, unknown>;
      const identity = style.musicIdentity as Record<string, unknown> | undefined;
      if (identity && Array.isArray(identity.instrumentation)) {
        tags = [...tags, ...identity.instrumentation.filter((value): value is string => typeof value === "string")];
      }
      for (const key of ["geography", "architecture", "weather"] as const) {
        const value = identity?.[key];
        if (typeof value === "string") tags.push(value);
      }
    } catch {
      // Legacy mansion style stays indexed with conservative tags.
    }
    const candidate = row.logical_id === MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1;
    const previous = row.logical_id === MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1;
    return legacyClip({
      id: `mansion:${row.bundle_id}:${row.logical_id}:${row.asset_id}`,
      label: category === "ambience"
        ? `${name} · Atmosphere`
        : `${name} · ${candidate ? "Music preview" : previous ? "Previous theme" : "Investigation theme"}`,
      group: `mansion:${row.bundle_id}`,
      groupLabel: `${name} · Mansion`,
      url: `/api/debates/mystery-mansions/${encodeURIComponent(row.bundle_id)}/assets/${encodeURIComponent(row.asset_id)}/file`,
      category,
      scope: "identity",
      status: candidate ? "candidate" : previous ? "discarded" : "accepted",
      semanticRole: category === "ambience" ? "world_bed" : "investigation_loop",
      automaticTags: [...new Set(tags)],
      context: { mansionId: row.bundle_id },
      bytes: Number(row.byte_size) || 0,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      loopable: true,
      applet: "whodunnit",
      provider: row.provider,
      model: row.model,
      usageCount: candidate || previous ? 0 : 1,
    });
  });
}

const PRISM_AUDIO_LIBRARY_V1: readonly AudioLibraryClipDto[] = [
  legacyClip({
    id: "prism.music.the-midnight-clue.v1",
    label: "The Midnight Clue",
    group: "prism:whodunnit",
    groupLabel: "PRISM · Whodunnit",
    url: "/audio/debate/whodunnit/the-midnight-clue.mp3",
    category: "music",
    scope: "theme",
    semanticRole: "investigation_loop",
    automaticTags: ["mystery", "noir", "investigation"],
    bytes: 0,
    applet: "whodunnit",
    source: "prism",
  }),
  legacyClip({
    id: "prism.effects.paper-pickup.v1",
    label: "Desk paper pickup",
    group: "prism:universal-effects",
    groupLabel: "PRISM · Universal Effects",
    url: "/audio/debate/desk-paper-pickup-01.mp3",
    category: "effects",
    scope: "universal",
    semanticRole: "paper_pickup",
    automaticTags: ["paper", "pickup", "desk"],
    bytes: 0,
    applet: "debate",
    source: "prism",
  }),
  ...[
    ["indoor-room-tone", "Indoor room tone", "/audio/debate/whodunnit/shared/indoor-room-tone-v1.ogg", ["indoor", "room tone"]],
    ["rain-storm", "Rain storm", "/audio/debate/whodunnit/shared/rain-storm-v1.ogg", ["rain", "storm", "weather"]],
    ["spacecraft-hull", "Spacecraft hull", "/audio/debate/whodunnit/shared/spacecraft-hull-v1.ogg", ["spacecraft", "hull", "machinery"]],
  ].map(([id, label, url, tags]) => legacyClip({
    id: `prism.ambience.${id}.v1`,
    label: String(label),
    group: "prism:mansion-ambience",
    groupLabel: "PRISM · Mansion Ambience",
    url: String(url),
    category: "ambience",
    scope: id === "indoor-room-tone" ? "universal" : "theme",
    semanticRole: "world_bed",
    automaticTags: tags as string[],
    bytes: 0,
    applet: "whodunnit",
    source: "prism",
    loopable: true,
  })),
];

function canonicalClips(
  db: DatabaseSync,
  userId: string,
  category: AudioAssetCategoryV1,
): AudioLibraryClipDto[] {
  return listCanonicalAudioAssetsV1(db, userId, { category, limit: 200 }).map((asset) => ({
    id: asset.id,
    label: asset.title,
    description: asset.description,
    group: `catalog:${asset.scope}`,
    groupLabel: `${asset.scope === "universal" ? "Universal" : asset.scope === "theme" ? "Theme" : "Identity"} · My Assets`,
    url: `/api/audio-assets/${encodeURIComponent(asset.id)}/file`,
    category: asset.category,
    scope: asset.scope,
    status: asset.status,
    source: asset.source,
    semanticRole: asset.semanticRole,
    automaticTags: asset.automaticTags,
    playerTags: asset.playerTags,
    context: asset.context,
    safety: asset.safety,
    bytes: asset.technical.byteSize,
    durationMs: asset.technical.durationMs,
    loopable: asset.technical.loopable,
    applet: asset.provenance.applet,
    provider: asset.provenance.provider,
    model: asset.provenance.model,
    usageCount: asset.usageCount,
    usageRefs: listAudioAssetUsagesV1(db, userId, asset.id),
    lastAccessedAt: asset.lastAccessedAt,
    readOnly: false,
  }));
}

export function listAudioLibraryClips(
  db: DatabaseSync,
  userId: string,
  requestedBin: AudioLibraryBin,
  options: { source?: "mine" | "prism" | null; query?: string | null } = {},
): AudioLibraryClipDto[] {
  const category = normalizeAudioLibraryBin(requestedBin)!;
  const mine = options.source === "prism" ? [] : [
    ...canonicalClips(db, userId, category),
    ...(category === "music"
      ? [...listSignalMusicClips(db, userId), ...listMansionAudioClips(db, userId, "music")]
      : category === "ambience"
        ? [...listSignalAmbienceClips(db, userId), ...listMansionAudioClips(db, userId, "ambience")]
        : listAvatarSfxClips(db, userId)),
  ];
  const prism = options.source === "mine"
    ? []
    : PRISM_AUDIO_LIBRARY_V1.filter((clip) => clip.category === category);
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const clips = [...mine, ...prism];
  return query
    ? clips.filter((clip) => [
        clip.label,
        clip.description,
        clip.groupLabel,
        clip.semanticRole,
        ...clip.automaticTags,
        ...clip.playerTags,
      ].join(" ").toLocaleLowerCase().includes(query))
    : clips;
}

export function listAudioLibraryPage(
  db: DatabaseSync,
  userId: string,
  requestedBin: AudioLibraryBin,
  options: {
    source?: "mine" | "prism" | null;
    query?: string | null;
    offset?: number;
    limit?: number;
  } = {},
): { clips: AudioLibraryClipDto[]; total: number; nextOffset: number | null } {
  const all = listAudioLibraryClips(db, userId, requestedBin, options);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const clips = all.slice(offset, offset + limit);
  const nextOffset = offset + clips.length < all.length ? offset + clips.length : null;
  return { clips, total: all.length, nextOffset };
}

export function summarizeAudioLibraryBytes(
  db: DatabaseSync,
  userId: string,
): {
  soundEffectsBytes: number;
  musicBytes: number;
  ambienceBytes: number;
  totalBytes: number;
} {
  const sum = (category: AudioAssetCategoryV1): number => {
    const legacyBytes = listAudioLibraryClips(db, userId, category, { source: "mine" })
      .filter((clip) => !clip.group.startsWith("catalog:"))
      .reduce((total, clip) => total + clip.bytes, 0);
    return legacyBytes + summarizeCanonicalAudioAssetCategoryBytesV1(db, userId, category);
  };
  const soundEffectsBytes = sum("effects");
  const musicBytes = sum("music");
  const ambienceBytes = sum("ambience");
  return {
    soundEffectsBytes,
    musicBytes,
    ambienceBytes,
    totalBytes: soundEffectsBytes + musicBytes + ambienceBytes,
  };
}

export function readBotAvatarSfxBytes(
  db: DatabaseSync,
  userId: string,
  botId: string,
): { contentType: string; bytes: Buffer } | null {
  const row = db.prepare(
    `SELECT authored_audio_voice_profile, audio_voice_profile_override
       FROM bots WHERE id = ? AND user_id = ?`,
  ).get(botId, userId) as {
    authored_audio_voice_profile: string | null;
    audio_voice_profile_override: string | null;
  } | undefined;
  if (!row) return null;
  const profile = normalizeBotAudioVoiceProfileV1(
    parseProfileJson(row.audio_voice_profile_override) ??
      parseProfileJson(row.authored_audio_voice_profile),
  );
  const dataUrl = profile.avatarSfx?.audioDataUrl?.trim();
  if (!dataUrl) return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/u.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = Buffer.from(
      match[2] ? match[3] ?? "" : decodeURIComponent(match[3] ?? ""),
      match[2] ? "base64" : "utf8",
    );
    return bytes.length
      ? { contentType: match[1]?.trim() || "audio/mpeg", bytes }
      : null;
  } catch {
    return null;
  }
}
