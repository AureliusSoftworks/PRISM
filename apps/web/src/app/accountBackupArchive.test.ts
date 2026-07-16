import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
  type ProjectOwnedAssetExportPayloadV1,
} from "@localai/shared";

import {
  projectOwnedAssetArchiveEntries,
  unzipAccountBackupEntries,
  unzipAccountBackupJsonEntries,
} from "./accountBackupArchive.ts";

describe("account backup archive bounds", () => {
  it("extracts bounded JSON-only archives", () => {
    const archive = zipSync({ "backup.json": strToU8('{"schema":"v1"}') });
    const entries = unzipAccountBackupJsonEntries(archive, {
      maxArchiveBytes: 1_024,
      maxExpandedJsonBytes: 1_024,
      maxJsonEntries: 2,
    });
    assert.deepEqual(Object.keys(entries), ["backup.json"]);
  });

  it("rejects oversized expanded JSON before extraction", () => {
    const archive = zipSync({
      "backup.json": strToU8(JSON.stringify({ payload: "x".repeat(2_000) })),
    });
    assert.throws(
      () =>
        unzipAccountBackupJsonEntries(archive, {
          maxArchiveBytes: 10_000,
          maxExpandedJsonBytes: 512,
          maxJsonEntries: 2,
        }),
      /payload is too large/u,
    );
  });

  it("accepts only the content-addressed project asset subtree", () => {
    const checksum = "a".repeat(64);
    const blobPath = `project-assets/blobs/sha256/${checksum}`;
    const archive = zipSync({
      "backup.json": strToU8("{}"),
      [PROJECT_OWNED_ASSET_MANIFEST_PATH]: strToU8(
        JSON.stringify({ schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA, entries: [] }),
      ),
      [blobPath]: new Uint8Array([1, 2, 3]),
    });
    const entries = unzipAccountBackupEntries(archive);
    assert.deepEqual(Object.keys(entries).sort(), [
      "backup.json",
      blobPath,
      PROJECT_OWNED_ASSET_MANIFEST_PATH,
    ].sort());
  });

  it("rejects arbitrary non-JSON entries without expanding them", () => {
    const archive = zipSync({
      "backup.json": strToU8("{}"),
      "assets/room.png": new Uint8Array([1, 2, 3]),
    });
    assert.throws(
      () => unzipAccountBackupEntries(archive),
      /unsupported file path/u,
    );
  });

  it("rejects traversal in archive paths", () => {
    const archive = zipSync({
      "backup.json": strToU8("{}"),
      "project-assets/../escape": new Uint8Array([1, 2, 3]),
    });
    assert.throws(
      () => unzipAccountBackupEntries(archive),
      /unsafe or repeated path/u,
    );
  });
});

describe("account backup project asset export transport", () => {
  it("writes one manifest and each deduplicated API blob", () => {
    const checksum = "b".repeat(64);
    const archivePath = `project-assets/blobs/sha256/${checksum}`;
    const payload: ProjectOwnedAssetExportPayloadV1 = {
      manifest: {
        schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
        entries: [
          {
            ownerType: "signal-show",
            ownerId: "show-1",
            logicalSlot: "light-studio",
            mediaType: "image",
            contentType: "image/png",
            checksum: `sha256:${checksum}`,
            byteLength: 3,
            archivePath,
            restore: {
              schema: "prism-signal-image-restore-v1",
              sourceImageId: "image-1",
              prompt: "Light",
              revisedPrompt: null,
              size: "4x3",
              quality: "upload",
              provider: "upload",
              model: "upload",
              createdAt: "2026-07-16T00:00:00.000Z",
            },
          },
        ],
      },
      files: { [archivePath]: Buffer.from([1, 2, 3]).toString("base64") },
    };
    const entries = projectOwnedAssetArchiveEntries(payload);
    assert.deepEqual(entries[archivePath], new Uint8Array([1, 2, 3]));
    assert.match(
      new TextDecoder().decode(entries[PROJECT_OWNED_ASSET_MANIFEST_PATH]),
      /prism-project-owned-assets-v1/u,
    );
  });
});
