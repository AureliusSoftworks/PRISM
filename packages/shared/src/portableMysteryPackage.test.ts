import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  canonicalPortablePackageJsonV1,
  portableMysteryPackageMajorIsSupportedV1,
  validateMansionPackageHeaderV1,
  validateMansionPackageManifestV1,
} from "./portableMysteryPackage.ts";

const hash = "a".repeat(64);

function mansionManifest(): Record<string, unknown> {
  return {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "mansion-jungle",
    title: "The Jungle House",
    description: "A reusable rain-soaked mansion.",
    creator: { name: "Prism", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: "0.15.0" },
    floorCount: 1,
    rooms: [{
      id: "room-1",
      templateId: "study",
      name: "Study",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      slots: [{ id: "slot-1", x: 0.5, y: 0.5 }],
      emoji: "📚",
      roomAssetId: "room-art",
      propAssetIds: [],
    }],
    houseStyle: { id: "jungle", label: "Jungle", promptContract: "Rain-soaked pulp mystery." },
    assets: [{
      id: "room-art",
      role: "room",
      archivePath: `assets/${hash}.webp`,
      sha256: hash,
      byteLength: 12,
      mimeType: "image/webp",
      width: 1024,
      height: 1024,
      durationMs: null,
    }],
    previewAssetId: "room-art",
    investigationThemeAssetId: null,
  };
}

test("portable package canonical JSON produces stable hashes across key order", () => {
  const left = canonicalPortablePackageJsonV1({ z: 3, nested: { b: true, a: [2, 1] }, a: "first" });
  const right = canonicalPortablePackageJsonV1({ a: "first", nested: { a: [2, 1], b: true }, z: 3 });
  assert.equal(left, right);
  assert.equal(
    createHash("sha256").update(left).digest("hex"),
    createHash("sha256").update(right).digest("hex"),
  );
});

test("mansion manifests accept unknown future fields but reject case-private fields", () => {
  const valid = { ...mansionManifest(), futurePresentationHint: { glow: "soft" } };
  assert.deepEqual(validateMansionPackageManifestV1(valid), []);

  const leaked = {
    ...valid,
    rooms: [{ ...(valid.rooms as Array<Record<string, unknown>>)[0], culprit: "seat-3" }],
  };
  assert.match(validateMansionPackageManifestV1(leaked).join("\n"), /culprit is case-private/u);
});

test("unsupported major versions fail with a compatibility message", () => {
  const manifest = mansionManifest();
  manifest.formatVersion = { major: 2, minor: 0 };
  assert.match(validateMansionPackageManifestV1(manifest).join("\n"), /major is unsupported/u);
  assert.equal(portableMysteryPackageMajorIsSupportedV1({
    minimumFormatMajor: 2,
    maximumFormatMajor: 2,
    minimumPrismVersion: null,
  }), false);
});

test("public package headers contain bounded compatibility metadata", () => {
  assert.deepEqual(validateMansionPackageHeaderV1({
    magic: "PRISMPKG",
    formatVersion: { major: 1, minor: 0 },
    packageType: "mansion",
    title: "The Jungle House",
    creatorName: "Prism",
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    compressedBytes: 10,
    expandedBytes: 20,
    assetCount: 1,
    contentWarnings: [],
    payloadSha256: hash,
    encryptionMode: "spoiler_seal",
    creatorSignature: null,
  }), []);
});
