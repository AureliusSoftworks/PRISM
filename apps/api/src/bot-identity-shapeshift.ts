import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import {
  createBotIdentityShapeshiftStateV1,
  pickBotIdentityShapeshiftCandidateIndexV1,
  type BotAvatarDetailsV1,
  type BotFaceStyle,
  type BotIdentityShapeshiftStateV1,
  type BotIdentityShapeshiftSurfaceV1,
  type BotIdentityShapeshiftTargetSourceV1,
  botIdentityMirrorFaceV1,
  parseBotAvatarDetailsV1,
  resolveBotAudioVoiceProfileV1,
} from "@localai/shared";
import type { DatabaseSync } from "node:sqlite";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, "../../..");
const MARKETPLACE_ROOT = join(REPO_ROOT, "apps/web/public/bot-marketplace");
const MARKETPLACE_MANIFEST_PATH = join(MARKETPLACE_ROOT, "manifest.json");

export interface BotIdentityShapeshiftCandidateV1 {
  id: string;
  name: string;
  source: BotIdentityShapeshiftTargetSourceV1;
  personaPrompt: string;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  voice: unknown;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseAvatarDetails(value: unknown): BotAvatarDetailsV1 | null {
  if (value == null) return null;
  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return parseBotAvatarDetailsV1(JSON.parse(trimmed));
    }
    return parseBotAvatarDetailsV1(value);
  } catch {
    return null;
  }
}

function faceFromRow(row: Record<string, unknown>): BotFaceStyle {
  return botIdentityMirrorFaceV1({
    faceEyesFont: row.face_eyes_font,
    faceEyeCharacter: row.face_eye_character,
    faceEyeCount: row.face_eye_count,
    faceEyeAnimation: row.face_eye_animation,
    faceMouthFont: row.face_mouth_font,
    faceMouthCharacter: row.face_mouth_character,
    faceMouthAnimation: row.face_mouth_animation,
    faceMouthCoffeePucker: row.face_mouth_coffee_pucker,
    faceFontWeight: row.face_font_weight,
    faceEyeScale: row.face_eye_scale,
    faceEyeOffsetX: row.face_eye_offset_x,
    faceEyeOffsetY: row.face_eye_offset_y,
    faceEyeRotationDeg: row.face_eye_rotation_deg,
    faceMouthScale: row.face_mouth_scale,
    faceMouthOffsetX: row.face_mouth_offset_x,
    faceMouthOffsetY: row.face_mouth_offset_y,
    faceMouthRotationDeg: row.face_mouth_rotation_deg,
    faceBlinkBar: row.face_blink_bar,
    faceBlinkScale: row.face_blink_scale,
    faceBlinkOffsetX: row.face_blink_offset_x,
    faceBlinkOffsetY: row.face_blink_offset_y,
    faceBlinkRotationDeg: row.face_blink_rotation_deg,
    faceThinkingFrames: row.face_thinking_frames,
  });
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Lists other Library bots eligible as shapeshift forms for this holder. */
export function listLibraryIdentityShapeshiftCandidatesV1(
  db: DatabaseSync,
  userId: string,
  holderBotId: string,
): BotIdentityShapeshiftCandidateV1[] {
  const rows = db
    .prepare(
      `SELECT id, name, system_prompt,
              face_eyes_font, face_eye_character, face_eye_count, face_eye_animation,
              face_mouth_font, face_mouth_character, face_mouth_animation,
              face_mouth_coffee_pucker, face_font_weight,
              face_eye_scale, face_eye_offset_x, face_eye_offset_y, face_eye_rotation_deg,
              face_mouth_scale, face_mouth_offset_x, face_mouth_offset_y, face_mouth_rotation_deg,
              face_blink_bar, face_blink_scale, face_blink_offset_x, face_blink_offset_y,
              face_blink_rotation_deg, face_thinking_frames, avatar_details_json,
              authored_audio_voice_profile, audio_voice_profile_override
         FROM bots
        WHERE user_id = ?
          AND id != ?
        ORDER BY name COLLATE NOCASE, id`,
    )
    .all(userId, holderBotId) as Array<Record<string, unknown>>;

  return rows
    .map((row): BotIdentityShapeshiftCandidateV1 | null => {
      const id = boundedText(row.id, 128);
      const name = boundedText(row.name, 120);
      const personaPrompt =
        boundedText(row.system_prompt, 12_000) ||
        `You are ${name}. Stay in character.`;
      if (!id || !name) return null;
      return {
        id,
        name,
        source: "library",
        personaPrompt,
        face: faceFromRow(row),
        avatarDetails: parseAvatarDetails(row.avatar_details_json),
        voice: resolveBotAudioVoiceProfileV1(
          parseJsonColumn(row.authored_audio_voice_profile),
          parseJsonColumn(row.audio_voice_profile_override),
        ),
      };
    })
    .filter((row): row is BotIdentityShapeshiftCandidateV1 => row !== null);
}

function marketplaceBundlePath(bundlePath: string): string | null {
  const trimmed = bundlePath.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..")) return null;
  const absolute = join(MARKETPLACE_ROOT, trimmed.replace(/^bot-marketplace\//u, ""));
  return absolute.startsWith(MARKETPLACE_ROOT) ? absolute : null;
}

function parseMarketplaceBotArchive(
  bytes: Uint8Array,
  marketplaceId: string,
): BotIdentityShapeshiftCandidateV1 | null {
  try {
    const entries = unzipSync(bytes);
    const botJsonBytes = entries["bot.json"];
    if (!botJsonBytes) return null;
    const parsed = JSON.parse(strFromU8(botJsonBytes)) as {
      bot?: Record<string, unknown>;
    };
    const bot = parsed.bot;
    if (!bot || typeof bot !== "object") return null;
    const name = boundedText(bot.name, 120);
    if (!name) return null;
    const personaPrompt =
      boundedText(bot.systemPrompt, 12_000) ||
      `You are ${name}. Stay in character.`;
    return {
      id: `marketplace:${marketplaceId}`,
      name,
      source: "marketplace",
      personaPrompt,
      face: botIdentityMirrorFaceV1({
        faceEyesFont: bot.faceEyesFont,
        faceEyeCharacter: bot.faceEyeCharacter,
        faceEyeCount: bot.faceEyeCount,
        faceEyeAnimation: bot.faceEyeAnimation,
        faceMouthFont: bot.faceMouthFont,
        faceMouthCharacter: bot.faceMouthCharacter,
        faceMouthAnimation: bot.faceMouthAnimation,
        faceMouthCoffeePucker: bot.faceMouthCoffeePucker,
        faceFontWeight: bot.faceFontWeight,
        faceEyeScale: bot.faceEyeScale,
        faceEyeOffsetX: bot.faceEyeOffsetX,
        faceEyeOffsetY: bot.faceEyeOffsetY,
        faceEyeRotationDeg: bot.faceEyeRotationDeg,
        faceMouthScale: bot.faceMouthScale,
        faceMouthOffsetX: bot.faceMouthOffsetX,
        faceMouthOffsetY: bot.faceMouthOffsetY,
        faceMouthRotationDeg: bot.faceMouthRotationDeg,
        faceBlinkBar: bot.faceBlinkBar,
        faceBlinkScale: bot.faceBlinkScale,
        faceBlinkOffsetX: bot.faceBlinkOffsetX,
        faceBlinkOffsetY: bot.faceBlinkOffsetY,
        faceBlinkRotationDeg: bot.faceBlinkRotationDeg,
        faceThinkingFrames: bot.faceThinkingFrames,
      }),
      avatarDetails: parseAvatarDetails(bot.avatarDetails),
      voice: resolveBotAudioVoiceProfileV1(
        bot.authoredAudioVoiceProfile,
        bot.audioVoiceProfileOverride,
      ),
    };
  } catch {
    return null;
  }
}

/** Marketplace public forms used only when the Library has no other bots. */
export function listMarketplaceIdentityShapeshiftCandidatesV1(): BotIdentityShapeshiftCandidateV1[] {
  if (!existsSync(MARKETPLACE_MANIFEST_PATH)) return [];
  try {
    const manifest = JSON.parse(
      readFileSync(MARKETPLACE_MANIFEST_PATH, "utf8"),
    ) as {
      bots?: Array<{ id?: string; bundlePath?: string }>;
    };
    const bots = Array.isArray(manifest.bots) ? manifest.bots : [];
    const out: BotIdentityShapeshiftCandidateV1[] = [];
    for (const entry of bots) {
      const id = boundedText(entry.id, 128);
      const absolute = marketplaceBundlePath(boundedText(entry.bundlePath, 260));
      if (!id || !absolute || !existsSync(absolute)) continue;
      const candidate = parseMarketplaceBotArchive(
        new Uint8Array(readFileSync(absolute)),
        id,
      );
      if (candidate) out.push(candidate);
    }
    return out.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  } catch {
    return [];
  }
}

export function resolveIdentityShapeshiftCandidatesV1(args: {
  db: DatabaseSync;
  userId: string;
  holderBotId: string;
}): BotIdentityShapeshiftCandidateV1[] {
  const library = listLibraryIdentityShapeshiftCandidatesV1(
    args.db,
    args.userId,
    args.holderBotId,
  );
  if (library.length > 0) return library;
  return listMarketplaceIdentityShapeshiftCandidatesV1().filter(
    (candidate) => candidate.id !== `marketplace:${args.holderBotId}`,
  );
}

export function pickIdentityShapeshiftCandidateV1(args: {
  candidates: readonly BotIdentityShapeshiftCandidateV1[];
  seed: string;
}): BotIdentityShapeshiftCandidateV1 | null {
  const index = pickBotIdentityShapeshiftCandidateIndexV1(
    args.seed,
    args.candidates.length,
  );
  if (index < 0) return null;
  return args.candidates[index] ?? null;
}

export function buildIdentityShapeshiftSeedV1(args: {
  conversationId: string;
  holderBotId: string;
  /** Include a turn token when short-term amnesia forces a reshuffle. */
  reshuffleToken?: string | null;
}): string {
  const base = `${args.conversationId}\n${args.holderBotId}`;
  const token = boundedText(args.reshuffleToken, 160);
  return token ? `${base}\n${token}` : base;
}

export function createIdentityShapeshiftStateFromCandidateV1(args: {
  surface: BotIdentityShapeshiftSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  candidate: BotIdentityShapeshiftCandidateV1;
  sourceMessageId: string;
  occurredAt: string;
}): BotIdentityShapeshiftStateV1 {
  return createBotIdentityShapeshiftStateV1({
    surface: args.surface,
    holderBotId: args.holderBotId,
    holderBotName: args.holderBotName,
    targetBotId: args.candidate.id,
    targetBotName: args.candidate.name,
    targetSource: args.candidate.source,
    targetPersonaPrompt: args.candidate.personaPrompt,
    targetFace: args.candidate.face,
    targetAvatarDetails: args.candidate.avatarDetails,
    targetVoice: args.candidate.voice,
    sourceMessageId: args.sourceMessageId,
    occurredAt: args.occurredAt,
  });
}

/** Stable digest for tests and verification notes (not a secret). */
export function identityShapeshiftCandidateDigestV1(
  candidate: BotIdentityShapeshiftCandidateV1,
): string {
  return createHash("sha256")
    .update(
      `${candidate.source}:${candidate.id}:${candidate.name}:${candidate.personaPrompt.slice(0, 120)}`,
    )
    .digest("hex")
    .slice(0, 16);
}
