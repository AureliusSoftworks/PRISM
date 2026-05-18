/**
 * Image asset lifecycle (PRISM)
 *
 * Generated images are stored as files under the LocalAI data directory
 * (see `image-storage.ts`) with rows in the `images` SQLite table. They are
 * **user-owned local artifacts**: nothing removes them automatically by age.
 * Deletion is explicit (user removes one image, account deletion, or tooling).
 *
 * Follow-up: backup/export snapshots today omit image blobs; full portability
 * requires copying `generated-images/` alongside the DB or extending
 * `BackupSnapshot` — treat “permanent” as surviving refresh/restart on-device,
 * not necessarily bundled in JSON export yet.
 */
export {};
