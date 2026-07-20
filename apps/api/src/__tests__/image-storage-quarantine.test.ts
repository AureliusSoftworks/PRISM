import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  quarantineGeneratedImageFiles,
  removeAssetCleanupTrashDirectoryForUser,
  resolveAbsoluteUnderDataRoot,
  restoreQuarantinedGeneratedImageFiles,
  thumbWebpRelativePathFromPngRelativePath,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

describe("generated image recovery trash", () => {
  it("moves PNG, thumbnail, and manifest together and can restore the files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-image-quarantine-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const primary = "generated-images/user-1/image-1.png";
      const thumbnail = thumbWebpRelativePathFromPngRelativePath(primary);
      writeGeneratedImageBytes(primary, Buffer.from("png"));
      writeGeneratedImageBytes(thumbnail, Buffer.from("webp"));

      const result = quarantineGeneratedImageFiles(
        "user-1",
        [primary],
        "recovery-test",
        JSON.stringify({
          quarantinedAt: "2026-07-19T00:00:00.000Z",
          images: [{ id: "image-1" }],
        }),
      );
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), false);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(thumbnail)), false);
      assert.equal(result.movedFiles.length, 2);
      assert.equal(
        result.recoveryRelativePath,
        "asset-cleanup-trash/user-1/recovery-test",
      );
      assert.ok(result.manifestRelativePath);
      const journal = JSON.parse(
        readFileSync(
          resolveAbsoluteUnderDataRoot(result.manifestRelativePath),
          "utf8",
        ),
      ) as {
        state: string;
        userId: string;
        images: Array<{ id: string }>;
        plannedFiles: unknown[];
      };
      assert.equal(journal.state, "prepared");
      assert.equal(journal.userId, "user-1");
      assert.deepEqual(journal.images, [{ id: "image-1" }]);
      assert.equal(journal.plannedFiles.length, 2);

      restoreQuarantinedGeneratedImageFiles(result);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(primary)), true);
      assert.equal(existsSync(resolveAbsoluteUnderDataRoot(thumbnail)), true);
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot(result.manifestRelativePath)),
        false,
      );
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("purges only one owner's scoped and legacy recovery batches", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-image-quarantine-owner-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const ownerPrimary = "generated-images/user-1/owner-image.png";
      const strangerPrimary = "generated-images/user-2/stranger-image.png";
      writeGeneratedImageBytes(ownerPrimary, Buffer.from("owner"));
      writeGeneratedImageBytes(strangerPrimary, Buffer.from("stranger"));
      const ownerBatch = quarantineGeneratedImageFiles(
        "user-1",
        [ownerPrimary],
        "owner-recovery",
        JSON.stringify({
          quarantinedAt: "2026-07-19T00:00:00.000Z",
          images: [{ id: "owner-image" }],
        }),
      );
      const strangerBatch = quarantineGeneratedImageFiles(
        "user-2",
        [strangerPrimary],
        "stranger-recovery",
        JSON.stringify({
          quarantinedAt: "2026-07-19T00:00:00.000Z",
          images: [{ id: "stranger-image" }],
        }),
      );
      const legacyOwnerManifest =
        "asset-cleanup-trash/legacy-owner-recovery/manifest.json";
      const legacyStrangerManifest =
        "asset-cleanup-trash/legacy-stranger-recovery/manifest.json";
      writeGeneratedImageBytes(
        legacyOwnerManifest,
        Buffer.from(JSON.stringify({ userId: "user-1", prompt: "private" })),
      );
      writeGeneratedImageBytes(
        legacyStrangerManifest,
        Buffer.from(JSON.stringify({ userId: "user-2", prompt: "private" })),
      );

      assert.throws(
        () =>
          quarantineGeneratedImageFiles(
            "user-1",
            ["generated-images/user-2/not-owned.png"],
            "cross-owner-recovery",
          ),
        /only this account's generated images/iu,
      );

      removeAssetCleanupTrashDirectoryForUser("user-1");
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot(ownerBatch.recoveryRelativePath)),
        false,
      );
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot("asset-cleanup-trash/legacy-owner-recovery")),
        false,
      );
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot(strangerBatch.recoveryRelativePath)),
        true,
      );
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot("asset-cleanup-trash/legacy-stranger-recovery")),
        true,
      );
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("retains the manifest when a restore conflict leaves files quarantined", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-image-restore-conflict-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const primary = "generated-images/user-1/conflict-image.png";
      writeGeneratedImageBytes(primary, Buffer.from("original"));
      const quarantine = quarantineGeneratedImageFiles(
        "user-1",
        [primary],
        "conflict-recovery",
        JSON.stringify({
          quarantinedAt: "2026-07-19T00:00:00.000Z",
          images: [{ id: "conflict-image", prompt: "private" }],
        }),
      );
      writeGeneratedImageBytes(primary, Buffer.from("replacement"));

      assert.throws(
        () => restoreQuarantinedGeneratedImageFiles(quarantine),
        /over an existing file/iu,
      );
      assert.ok(quarantine.manifestRelativePath);
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(quarantine.manifestRelativePath),
        ),
        true,
      );
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(
            quarantine.movedFiles[0]?.quarantineRelativePath ?? "",
          ),
        ),
        true,
      );
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
