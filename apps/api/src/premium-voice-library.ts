import type { DatabaseSync } from "node:sqlite";

export interface PremiumVoiceLibraryEntry {
  sourceVoiceId: string;
  providerVoiceId: string;
  publicOwnerId: string;
  name: string;
  category: "professional" | "high_quality";
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
  nativeAccentHint: string | null;
  savedAt: string;
}

export interface SavePremiumVoiceLibraryEntryInput {
  sourceVoiceId: string;
  providerVoiceId: string;
  publicOwnerId: string;
  name: string;
  category: "professional" | "high_quality";
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
  nativeAccentHint: string | null;
}

interface PremiumVoiceLibraryRow {
  source_voice_id: string;
  provider_voice_id: string;
  public_owner_id: string;
  name: string;
  category: string;
  description: string | null;
  preview_url: string | null;
  labels_json: string;
  native_accent_hint: string | null;
  created_at: string;
}

function parseLabels(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function mapRow(row: PremiumVoiceLibraryRow): PremiumVoiceLibraryEntry {
  return {
    sourceVoiceId: row.source_voice_id,
    providerVoiceId: row.provider_voice_id,
    publicOwnerId: row.public_owner_id,
    name: row.name,
    category: row.category === "high_quality" ? "high_quality" : "professional",
    description: row.description,
    previewUrl: row.preview_url,
    labels: parseLabels(row.labels_json),
    nativeAccentHint: row.native_accent_hint,
    savedAt: row.created_at,
  };
}

export function listPremiumVoiceLibrary(
  db: DatabaseSync,
  userId: string,
): PremiumVoiceLibraryEntry[] {
  const rows = db.prepare(
    `SELECT source_voice_id, provider_voice_id, public_owner_id, name, category,
            description, preview_url, labels_json, native_accent_hint, created_at
       FROM premium_voice_library
      WHERE user_id = ?
      ORDER BY name COLLATE NOCASE, created_at`,
  ).all(userId) as unknown as PremiumVoiceLibraryRow[];
  return rows.map(mapRow);
}

export function findPremiumVoiceLibraryEntry(
  db: DatabaseSync,
  userId: string,
  sourceVoiceId: string,
): PremiumVoiceLibraryEntry | null {
  const row = db.prepare(
    `SELECT source_voice_id, provider_voice_id, public_owner_id, name, category,
            description, preview_url, labels_json, native_accent_hint, created_at
       FROM premium_voice_library
      WHERE user_id = ? AND source_voice_id = ?`,
  ).get(userId, sourceVoiceId) as PremiumVoiceLibraryRow | undefined;
  return row ? mapRow(row) : null;
}

export function savePremiumVoiceLibraryEntry(
  db: DatabaseSync,
  userId: string,
  input: SavePremiumVoiceLibraryEntryInput,
  now = new Date().toISOString(),
): { entry: PremiumVoiceLibraryEntry; created: boolean } {
  const result = db.prepare(
    `INSERT INTO premium_voice_library
       (user_id, source_voice_id, provider_voice_id, public_owner_id, name,
        category, description, preview_url, labels_json, native_accent_hint,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, source_voice_id) DO NOTHING`,
  ).run(
    userId,
    input.sourceVoiceId,
    input.providerVoiceId,
    input.publicOwnerId,
    input.name,
    input.category,
    input.description,
    input.previewUrl,
    JSON.stringify(input.labels),
    input.nativeAccentHint,
    now,
    now,
  );
  const entry = findPremiumVoiceLibraryEntry(db, userId, input.sourceVoiceId);
  if (!entry) throw new Error("Premium voice library save did not persist.");
  return { entry, created: result.changes > 0 };
}

export function restorePremiumVoiceLibrary(
  db: DatabaseSync,
  userId: string,
  entries: readonly PremiumVoiceLibraryEntry[],
): void {
  db.prepare("DELETE FROM premium_voice_library WHERE user_id = ?").run(userId);
  for (const entry of entries) {
    savePremiumVoiceLibraryEntry(db, userId, entry, entry.savedAt);
  }
}
