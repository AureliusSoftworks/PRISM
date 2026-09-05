import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTABLE_CASE_PACKAGE_SCHEMA_V1,
  proceduralPortableCaseThumbnailDataUrlV1,
  proceduralPortableCaseThumbnailSvgV1,
  proceduralPortableCaseThumbnailV1,
  validatePortableCasePackageManifestV1,
} from "./portableMysteryCase.ts";

test("case thumbnails are deterministic, local, abstract PRISM designs", () => {
  const first = proceduralPortableCaseThumbnailV1("case-violet-archive");
  const again = proceduralPortableCaseThumbnailV1("case-violet-archive");
  const other = proceduralPortableCaseThumbnailV1("case-moonlit-observatory");
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, other);
  assert.match(proceduralPortableCaseThumbnailSvgV1(first), /^<svg[\s\S]*Abstract PRISM case design/u);
  assert.match(proceduralPortableCaseThumbnailDataUrlV1(first), /^data:image\/svg\+xml,/u);
});

test("case manifest validation requires certified full-investigation logic and room roles", () => {
  const hash = "a".repeat(64);
  const manifest = {
    schema: PORTABLE_CASE_PACKAGE_SCHEMA_V1,
    formatVersion: { major: 1, minor: 1 },
    packageId: "case-package",
    title: "The Violet Archive",
    description: "A sealed reusable case.",
    storyTags: ["Homicide", "Art world"],
    creator: { name: "PRISM player", id: null, url: null },
    provenance: { createdAt: "2026-08-30T00:00:00.000Z", prismVersion: "0.15.1", generatedWith: [] },
    license: { name: "Private share", url: null, allowsRedistribution: true },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: "0.15.1" },
    difficulty: "classic",
    trialType: "jury",
    investigationMode: "full",
    thumbnail: proceduralPortableCaseThumbnailV1("case-package"),
    mansionRequirements: {
      version: 1,
      suspectCount: 1,
      minimumRoomCount: 2,
      minimumFloorCount: 1,
      rooms: [
        { id: "case-room-01", role: "crime_scene", templateId: "library", suspectSeatId: null, hotspotCount: 2 },
        { id: "case-room-02", role: "suspect", templateId: "study", suspectSeatId: "seat-1", hotspotCount: 2 },
      ],
    },
    certification: {
      version: 1,
      investigationCompletedAt: "2026-08-30T00:30:00.000Z",
      caseHash: hash,
      graphHash: hash,
      graphValid: true,
      validatorVersion: 1,
    },
    cast: [{ id: "bot-1", name: "Violet", presentation: {}, voiceId: null }],
    publicCase: {},
    privateCase: {},
    proofContract: {},
    dialogueGraph: {},
    court: {},
    evidenceAssignments: {},
  };
  assert.deepEqual(validatePortableCasePackageManifestV1(manifest), []);
  const { storyTags: _legacyStoryTags, ...legacyManifest } = manifest;
  assert.deepEqual(
    validatePortableCasePackageManifestV1(legacyManifest),
    [],
    "legacy .case manifests without story tags remain importable",
  );
  assert.match(
    validatePortableCasePackageManifestV1({ ...manifest, storyTags: ["Mystery", "mystery"] }).join("\n"),
    /storyTags/u,
  );
  assert.match(
    validatePortableCasePackageManifestV1({ ...manifest, investigationMode: "court_only" }).join("\n"),
    /investigationMode/u,
  );
  assert.match(
    validatePortableCasePackageManifestV1({ ...manifest, certification: undefined }).join("\n"),
    /certification/u,
  );
});
