import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requestCoffeeGroupElevenLabsMusic } from "./elevenlabs-music.ts";
import { portableMp3DurationMsV1 } from "./debate-mystery-package-safety.ts";
import { encryptBytes } from "./security.ts";

export const DEBATE_MYSTERY_MANSION_THEME_MODEL_V1 = "music_v2";

export interface DebateMysteryMansionThemeResultV1 {
  source: "generated" | "existing" | "bundled_fallback";
  assetId: string | null;
  failure: string | null;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildDebateMysteryMansionThemePromptV1(args: {
  title: string;
  houseStyleLabel: string;
  houseStylePromptContract: string;
}): string {
  return [
    "Compose a wholly original instrumental murder-mystery investigation loop.",
    `Mansion: ${args.title.replace(/\s+/gu, " ").trim().slice(0, 160)}.`,
    `Visual world: ${args.houseStyleLabel.replace(/\s+/gu, " ").trim().slice(0, 120)}.`,
    args.houseStylePromptContract.replace(/\s+/gu, " ").trim().slice(0, 600),
    "Keep one steady unobtrusive level for exploration and interviews: restrained pulse, memorable but sparse motif, no dramatic stingers, no vocals, no speech, no copyrighted melody.",
    "Make the ending loop cleanly into the opening without a fade-out.",
  ].filter(Boolean).join(" ");
}

/**
 * The caller must pass the already-resolved session mode. Only an explicit
 * ONLINE case with a configured key may reach the provider. Every other path
 * returns the bundled fallback without invoking fetch.
 */
export async function ensureDebateMysteryMansionThemeV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  requested: boolean;
  responseMode: "local" | "online";
  apiKey: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DebateMysteryMansionThemeResultV1> {
  const bundle = args.db.prepare(
    `SELECT name, style_json FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(args.bundleId, args.userId) as { name: string; style_json: string } | undefined;
  if (!bundle) return { source: "bundled_fallback", assetId: null, failure: "Mansion unavailable." };
  const existing = args.db.prepare(
    `SELECT assets.id FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND refs.role = 'music'
      LIMIT 1`,
  ).get(args.bundleId, args.userId) as { id: string } | undefined;
  if (existing) return { source: "existing", assetId: existing.id, failure: null };
  if (!args.requested || args.responseMode !== "online" || !args.apiKey?.trim()) {
    return { source: "bundled_fallback", assetId: null, failure: null };
  }
  try {
    const style = JSON.parse(bundle.style_json) as {
      label?: unknown;
      promptContract?: unknown;
    };
    const generated = await requestCoffeeGroupElevenLabsMusic({
      apiKey: args.apiKey,
      prompt: buildDebateMysteryMansionThemePromptV1({
        title: bundle.name,
        houseStyleLabel: typeof style.label === "string" ? style.label : "Whodunnit mansion",
        houseStylePromptContract:
          typeof style.promptContract === "string" ? style.promptContract : "Restrained mystery atmosphere.",
      }),
      fetchImpl: args.fetchImpl,
    });
    if (generated.contentType !== "audio/mpeg") throw new Error("Theme audio must be MP3.");
    const durationMs = portableMp3DurationMsV1(generated.audioBytes);
    if (durationMs < 30_000 || durationMs > 10 * 60_000) {
      throw new Error("Theme duration is outside the supported loop boundary.");
    }
    const sha256 = digest(generated.audioBytes);
    const encrypted = encryptBytes(generated.audioBytes, args.userKey);
    const assetId = randomUUID();
    const now = new Date().toISOString();
    args.db.exec("BEGIN IMMEDIATE");
    try {
      args.db.prepare(
        `INSERT INTO debate_mystery_mansion_assets
           (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
            mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', NULL, NULL, ?,
                 'elevenlabs', ?, ?, ?)
         ON CONFLICT(user_id, sha256) DO NOTHING`,
      ).run(
        assetId, args.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag,
        sha256, generated.audioBytes.byteLength, durationMs,
        DEBATE_MYSTERY_MANSION_THEME_MODEL_V1, now, now,
      );
      const stored = args.db.prepare(
        "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
      ).get(args.userId, sha256) as { id: string };
      args.db.prepare(
        `INSERT INTO debate_mystery_mansion_asset_refs
           (bundle_id, user_id, asset_id, role, logical_id, created_at)
         VALUES (?, ?, ?, 'music', 'investigation-theme-v1', ?)`,
      ).run(args.bundleId, args.userId, stored.id, now);
      args.db.exec("COMMIT");
      return { source: "generated", assetId: stored.id, failure: null };
    } catch (error) {
      args.db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    return {
      source: "bundled_fallback",
      assetId: null,
      failure: error instanceof Error ? error.message : "Theme generation failed.",
    };
  }
}
