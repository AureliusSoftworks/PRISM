import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  canonicalPortablePackageJsonV1,
  DEFAULT_MANSION_ROOM_ART_CONTRACT_V1,
  portableMysteryPackageMajorIsSupportedV1,
  validateMansionPackageHeaderV1,
  validateMansionPackageManifestV1,
  validateWhodunnitPackageManifestV1,
} from "./portableMysteryPackage.ts";
import { deriveMansionMusicIdentityV1 } from "./mansionMusic.ts";

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

test("mansion manifests accept optional exterior scale while keeping V1 packages readable", () => {
  const legacy = mansionManifest();
  assert.deepEqual(validateMansionPackageManifestV1(legacy), []);
  const current = { ...legacy, scaleClass: "grand" };
  assert.deepEqual(validateMansionPackageManifestV1(current), []);
  assert.match(
    validateMansionPackageManifestV1({ ...legacy, scaleClass: "colossal" }).join("\n"),
    /scaleClass is invalid/u,
  );
});

test("mansion manifests carry an optional titled, sealed music identity while legacy packages stay readable", () => {
  const legacy = mansionManifest();
  assert.deepEqual(validateMansionPackageManifestV1(legacy), []);
  const musicHash = "b".repeat(64);
  const current = {
    ...legacy,
    assets: [
      ...(legacy.assets as Array<Record<string, unknown>>),
      {
        id: "investigation-theme",
        role: "music",
        archivePath: `audio/${musicHash}.mp3`,
        sha256: musicHash,
        byteLength: 2_880_621,
        mimeType: "audio/mpeg",
        width: null,
        height: null,
        durationMs: 120_024,
      },
    ],
    investigationThemeAssetId: "investigation-theme",
    investigationThemeTitle: "Lanterns Beneath the Monsoon",
    investigationThemeLoop: {
      version: 1,
      loopStartMs: 1_000,
      loopEndMs: 119_000,
      crossfadeMs: 1_500,
      silenceRatio: 0.52,
    },
    musicIdentity: deriveMansionMusicIdentityV1({
      title: "The Jungle House",
      houseStyleLabel: "Grounded expedition manor",
      houseStylePromptContract: "Monsoon beside one banyan.",
    }),
  };
  assert.deepEqual(validateMansionPackageManifestV1(current), []);
  assert.match(
    validateMansionPackageManifestV1({
      ...current,
      investigationThemeLoop: {
        ...current.investigationThemeLoop,
        silenceRatio: 0.2,
      },
    }).join("\n"),
    /music loop silence ratio is invalid/u,
  );
  assert.match(
    validateMansionPackageManifestV1({
      ...current,
      musicIdentity: { ...current.musicIdentity, instrumental: false },
    }).join("\n"),
    /musicIdentity safety contract is invalid/u,
  );
  const invalidIdentityErrors = validateMansionPackageManifestV1({
    ...current,
    musicIdentity: {},
  }).join("\n");
  assert.match(
    invalidIdentityErrors,
    /investigationThemeLoop requires a timed theme and music identity/u,
  );
  assert.match(invalidIdentityErrors, /musicIdentity.version is invalid/u);
  assert.match(
    validateMansionPackageManifestV1({ ...current, investigationThemeTitle: "" }).join("\n"),
    /investigationThemeTitle is invalid/u,
  );
});

test("mansion manifests carry one derivable Mosaic contract and optional Illustrated plates", () => {
  const manifest = mansionManifest();
  const illustratedHash = "b".repeat(64);
  (manifest.assets as Array<Record<string, unknown>>).push({
    ...(manifest.assets as Array<Record<string, unknown>>)[0],
    id: "room-art-illustrated",
    archivePath: `assets/${illustratedHash}.png`,
    sha256: illustratedHash,
    mimeType: "image/png",
    width: 1600,
    height: 900,
  });
  (manifest.rooms as Array<Record<string, unknown>>)[0]!.illustratedRoomAssetId =
    "room-art-illustrated";
  manifest.roomArt = DEFAULT_MANSION_ROOM_ART_CONTRACT_V1;
  assert.deepEqual(validateMansionPackageManifestV1(manifest), []);

  manifest.roomArt = {
    ...DEFAULT_MANSION_ROOM_ART_CONTRACT_V1,
    mosaic: { ...DEFAULT_MANSION_ROOM_ART_CONTRACT_V1.mosaic, paletteColors: 16 },
  };
  assert.match(validateMansionPackageManifestV1(manifest).join("\n"), /roomArt is invalid/u);
});

test("mansion manifests reject malformed rooms and broken asset references", () => {
  const invalid = mansionManifest();
  const rooms = invalid.rooms as Array<Record<string, unknown>>;
  const assets = invalid.assets as Array<Record<string, unknown>>;
  rooms[0]!.neighborIds = ["missing-room"];
  rooms[0]!.roomAssetId = "missing-art";
  rooms[0]!.slots = [{ id: "slot-1", x: 2, y: 0.5 }];
  assets.push({ ...assets[0], id: "duplicate-path" });
  invalid.investigationThemeAssetId = "room-art";

  const errors = validateMansionPackageManifestV1(invalid).join("\n");
  assert.match(errors, /neighborIds references an invalid room/u);
  assert.match(errors, /roomAssetId does not reference compatible room art/u);
  assert.match(errors, /slots\[0\] is invalid/u);
  assert.match(errors, /archivePath is duplicated/u);
  assert.match(errors, /investigationThemeAssetId does not reference music/u);
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

test("portable package migration keeps additive minor fields but enforces capacity", () => {
  const mansion = mansionManifest();
  mansion.formatVersion = { major: 1, minor: 7 };
  mansion.futureReplayHint = { camera: "wide" };
  assert.deepEqual(validateMansionPackageManifestV1(mansion), []);

  const whodunnit = {
    schema: "prism-whodunnit-package-v1",
    formatVersion: { major: 1, minor: 7 },
    packageId: "migration-fixture",
    title: "Migration fixture",
    description: "Additive minor-version fixture.",
    creator: { name: "PRISM", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    mansionManifest: mansion,
    mansionManifestSha256: hash,
    cast: [],
    publicCase: {},
    privateCase: {},
    proofContract: {},
    dialogueGraph: {},
    court: {},
    evidenceAssignments: {},
    voices: [],
    assets: mansion.assets,
    runtime: { session: {}, compiledPublicState: {}, audioManifest: null, assetBindings: [] },
    silent: true,
    futureCameraContract: { version: 2 },
  };
  assert.deepEqual(validateWhodunnitPackageManifestV1(whodunnit), []);
  whodunnit.cast = Array.from({ length: 65 }, (_, index) => ({
    id: `cast-${index}`,
    name: `Cast ${index}`,
    presentation: {},
    voiceId: null,
  }));
  assert.match(validateWhodunnitPackageManifestV1(whodunnit).join("\n"), /cast exceeds the portable capacity/u);
});
