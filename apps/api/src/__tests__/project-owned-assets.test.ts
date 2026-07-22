import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
  normalizeCoffeeSessionSettings,
  projectOwnedAssetBlobArchivePathForChecksum,
  type ProjectOwnedAssetManifestV1,
} from "@localai/shared";
import type { BackupSnapshot } from "../backup.ts";
import { decodeAccountBackupArchive } from "../account-backup-archive.ts";
import {
  prepareProjectOwnedAssetImport,
  type ProjectOwnedAssetArchiveBundleV1,
} from "../project-owned-assets.ts";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDNwAAAABJRU5ErkJggg==",
  "base64",
);
const checksum = `sha256:${createHash("sha256").update(pngBytes).digest("hex")}`;
const archivePath = projectOwnedAssetBlobArchivePathForChecksum(checksum)!;

function snapshot(): BackupSnapshot {
  return {
    version: 1,
    exportedAt: "2026-07-16T00:00:00.000Z",
    conversations: [],
    memories: [],
    botcast: {
      shows: [
        {
          id: "show-1",
          hostBotId: "host-1",
          name: "Portable Show",
          premise: "Backups",
          hostingStyle: "Measured",
          accentColor: "#8844ff",
          atmosphereJson: JSON.stringify({
            seed: "night",
            prompt: "Night",
            imageId: null,
            imageUrl: null,
            dayAtmosphere: {
              seed: "day",
              prompt: "Day",
              imageId: "image-1",
              imageUrl: "/api/images/image-1/file",
            },
            nightAtmosphere: {
              seed: "night",
              prompt: "Night",
              imageId: null,
              imageUrl: null,
            },
            logo: { seed: "logo", prompt: "Logo", imageId: null, imageUrl: null },
          }),
          createdAt: "2026-07-16T00:00:00.000Z",
          updatedAt: "2026-07-16T00:00:00.000Z",
        },
      ],
      episodes: [],
      segments: [],
      messages: [],
      events: [],
    },
  };
}

function manifest(): ProjectOwnedAssetManifestV1 {
  return {
    schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
    entries: [
      {
        ownerType: "signal-show",
        ownerId: "show-1",
        logicalSlot: "light-studio",
        mediaType: "image",
        contentType: "image/png",
        checksum,
        byteLength: pngBytes.byteLength,
        archivePath,
        restore: {
          schema: "prism-signal-image-restore-v1",
          sourceImageId: "image-1",
          prompt: "Day",
          revisedPrompt: null,
          size: "4x3",
          quality: "upload",
          provider: "upload",
          model: "upload",
          createdAt: "2026-07-16T00:00:00.000Z",
        },
      },
    ],
  };
}

function bundle(): ProjectOwnedAssetArchiveBundleV1 {
  return { manifest: manifest(), files: { [archivePath]: pngBytes } };
}

function coffeeSnapshot(): BackupSnapshot {
  const value = snapshot();
  value.botcast = undefined;
  value.conversations = [
    {
      id: "coffee-1",
      title: "Coffee",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      coffee: {
        settings: normalizeCoffeeSessionSettings({
          barRitual: {
            serviceBot: { name: "Barista", fallback: true },
            role: "cup",
            drink: "special",
            specialImageStatus: "ready",
            specialImageId: "coffee-image-1",
          },
        }),
        botGroupIds: [],
        groupId: null,
        durationMinutes: null,
        presetId: null,
        topic: null,
        absentBotIds: [],
        teamsJson: null,
      },
      messages: [],
    },
  ];
  return value;
}

function coffeeBundle(): ProjectOwnedAssetArchiveBundleV1 {
  return {
    manifest: {
      schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
      entries: [
        {
          ownerType: "coffee-session",
          ownerId: "coffee-1",
          logicalSlot: "drink-surface",
          mediaType: "image",
          contentType: "image/png",
          checksum,
          byteLength: pngBytes.byteLength,
          archivePath,
          restore: {
            schema: "prism-coffee-image-restore-v1",
            sourceImageId: "coffee-image-1",
            prompt: "Top-down drink surface",
            revisedPrompt: null,
            size: "1024x1024",
            quality: "medium",
            provider: "openai",
            model: "gpt-image-2",
            createdAt: "2026-07-16T00:00:00.000Z",
          },
        },
      ],
    },
    files: { [archivePath]: pngBytes },
  };
}

describe("project-owned asset import validation", () => {
  it("prepares a new image id from the durable Signal slot", () => {
    const prepared = prepareProjectOwnedAssetImport(
      "user-1",
      snapshot(),
      bundle(),
      { idFactory: () => "restored-image" },
    );
    assert.equal(prepared.images[0]?.sourceImageId, "image-1");
    assert.equal(prepared.images[0]?.restoredImageId, "restored-image");
    assert.equal(prepared.imageReferences[0]?.slot, "light-studio");
  });

  it("prepares and remaps the exact Coffee drink surface without regenerating it", () => {
    const prepared = prepareProjectOwnedAssetImport(
      "user-1",
      coffeeSnapshot(),
      coffeeBundle(),
      { idFactory: () => "restored-coffee-image" },
    );
    assert.deepEqual(Buffer.from(prepared.images[0]!.bytes), pngBytes);
    assert.equal(prepared.images[0]?.ownerType, "coffee-session");
    assert.deepEqual(prepared.coffeeImageReferences[0], {
      conversationId: "coffee-1",
      sourceImageId: "coffee-image-1",
      restoredImageId: "restored-coffee-image",
    });
  });

  it("rejects checksum, MIME, path, and reference mismatches before staging", () => {
    const checksumMismatch = bundle();
    checksumMismatch.files[archivePath] = Uint8Array.from([...pngBytes, 1]);
    assert.throws(
      () => prepareProjectOwnedAssetImport("user-1", snapshot(), checksumMismatch),
      /wrong size|checksum failed/u,
    );

    const mimeMismatch = bundle();
    mimeMismatch.manifest.entries[0]!.contentType = "image/jpeg";
    assert.throws(
      () => prepareProjectOwnedAssetImport("user-1", snapshot(), mimeMismatch),
      /invalid content type/u,
    );

    const unsafePath = bundle();
    unsafePath.manifest.entries[0]!.archivePath = "project-assets/../escape";
    assert.throws(
      () => prepareProjectOwnedAssetImport("user-1", snapshot(), unsafePath),
      /unsafe archive path/u,
    );

    const missingReference: ProjectOwnedAssetArchiveBundleV1 = {
      manifest: { schema: PROJECT_OWNED_ASSET_MANIFEST_SCHEMA, entries: [] },
      files: {},
    };
    assert.throws(
      () => prepareProjectOwnedAssetImport("user-1", snapshot(), missingReference),
      /missing Signal Light studio/u,
    );
  });
});

describe("legacy account backup archive compatibility", () => {
  it("imports JSON-only v1 .prism archives without a project manifest", () => {
    const legacy = snapshot();
    const archive = zipSync({
      "backup.json": strToU8(
        JSON.stringify({
          schema: "prism-account-backup-v1",
          exportedAt: legacy.exportedAt,
          snapshot: legacy,
        }),
      ),
    });
    const decoded = decodeAccountBackupArchive(archive);
    assert.equal(decoded.snapshot.version, 1);
    assert.equal(decoded.projectOwnedAssets, undefined);
  });

  it("fails when a new archive claims project assets but omits the manifest", () => {
    const archive = zipSync({
      "backup.json": strToU8(
        JSON.stringify({
          schema: "prism-account-backup-v1",
          snapshot: snapshot(),
          projectOwnedAssets: { manifestPath: PROJECT_OWNED_ASSET_MANIFEST_PATH },
        }),
      ),
    });
    assert.throws(
      () => decodeAccountBackupArchive(archive),
      /manifest is missing/u,
    );
  });
});
