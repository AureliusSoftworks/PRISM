import type { DatabaseSync } from "node:sqlite";

/**
 * Generated images (OpenAI DALL-E URLs) expire on OpenAI's side within an
 * hour, so rows past a certain age are just broken-image placeholders in
 * the gallery. Wipe them after 30 days to keep the user's DB clean and
 * avoid the impression that the app is hoarding dead references.
 */
export const GENERATED_IMAGE_RETENTION_DAYS = 30;

/**
 * Cadence for the background purge. Matches the account-retention cadence
 * so the two periodic jobs share a single "housekeeping heartbeat".
 */
export const GENERATED_IMAGE_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function getGeneratedImageCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() -
      GENERATED_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isExpiredImage(createdAt: string, now = new Date()): boolean {
  return (
    new Date(createdAt).getTime() < getGeneratedImageCutoff(now).getTime()
  );
}

/**
 * Delete every image row whose `created_at` is older than the retention
 * cutoff. Returns the number of rows removed so callers can log / report.
 *
 * Images are URL references only (OpenAI hosts the pixels, and those URLs
 * are already expired by the time the row ages), so there's nothing to
 * clean up on the filesystem.
 */
export function purgeExpiredImages(
  db: DatabaseSync,
  now = new Date()
): number {
  const cutoff = getGeneratedImageCutoff(now).toISOString();
  const result = db
    .prepare("DELETE FROM images WHERE created_at < ?")
    .run(cutoff);
  return Number(result.changes ?? 0);
}
