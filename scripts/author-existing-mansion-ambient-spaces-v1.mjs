#!/usr/bin/env node

// Offline, additive authoring only. Never opens a database or invokes a provider.
// Re-run with --verify-only to audit existing outputs without writing anything.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalMansionLayoutV2,
  mansionLayoutV2CompatibilityNeighborIds,
  mansionLayoutV2EntityRect,
  mansionLayoutV2SemanticRoomsAreConnected,
  mansionLayoutV2SharedWall,
  mansionLayoutV2ToLegacyRooms,
  mansionLayoutV2TraversalRoute,
  remapMansionLayoutV2Ids,
  validateMansionLayoutV2,
} from "../packages/shared/src/mansionLayoutV2.ts";
import {
  canonicalPortablePackageJsonV1,
  validateMansionPackageManifestV1,
} from "../packages/shared/src/portableMysteryPackage.ts";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
} from "../apps/api/src/debate-mystery-mansion-codec.ts";
import {
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "../apps/api/src/debate-mystery-package-envelope.ts";
import {
  preflightPortableMysteryArchiveV1,
  validatePortableMansionMediaV1,
} from "../apps/api/src/debate-mystery-package-safety.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inputDirectory = join(root, ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1/packages");
const defaultOutputRoot = join(root, ".codex/output/whodunnit-ambient-mansions-v1");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => canonicalPortablePackageJsonV1(JSON.parse(JSON.stringify(value)));
const jsonHash = (value) => sha256(canonical(value));

// These are hand-authored rectangles in each inspected source's 16x12 grid.
// Tuple: x, y, width, height. IDs are deliberately anonymous and floor-local.
export const AMBIENT_MANSION_EDITIONS_V1 = [
  {
    slug: "asterion-observatory", sourceId: "e8452597-c956-43a5-9f43-65440806ed49", title: "Asterion Observatory", roomCount: 5, assetCount: 26,
    rationale: "Paired outer service pods reinforce the orbital ring. The two internal lightwell strips around the central rooms remain open; the perimeter stops short of the envelope edge.",
    floors: [
      [[3, 1, 3, 2], [10, 1, 3, 2], [1, 3, 2, 3], [1, 6, 2, 2], [13, 3, 2, 3], [13, 6, 2, 2], [3, 8, 3, 2], [10, 8, 3, 2]],
      [[3, 1, 4, 2], [7, 1, 3, 2], [10, 1, 3, 2], [1, 3, 2, 3], [1, 6, 2, 2], [13, 3, 2, 3], [13, 6, 2, 2], [3, 8, 4, 2], [7, 8, 3, 2], [10, 8, 3, 2]],
    ],
    preservedVoids: [
      { floor: 1, x: 4, y: 4, width: 3, height: 3 }, { floor: 1, x: 9, y: 4, width: 3, height: 3 },
      { floor: 2, x: 10, y: 4, width: 2, height: 3 }, { floor: 2, x: 4, y: 4, width: 2, height: 1 },
    ],
  },
  {
    slug: "banyan-house", sourceId: "64711957-b97a-4e6b-b3ae-47f8ead006d3", title: "Banyan House", roomCount: 5, assetCount: 27,
    rationale: "Staggered root-house pods attach to the existing narrow spine and occupied wings. The monsoon-facing gaps and broad jungle margins stay open rather than becoming a rectangular slab.",
    floors: [
      [[4, 2, 3, 2], [8, 2, 2, 2], [3, 4, 2, 3], [10, 4, 2, 2], [5, 8, 2, 2], [8, 9, 3, 1]],
      [[5, 2, 2, 2], [8, 2, 3, 2], [3, 5, 2, 2], [5, 7, 2, 2], [8, 8, 2, 2], [11, 4, 2, 2]],
    ],
    preservedVoids: [
      { floor: 1, x: 10, y: 6, width: 2, height: 1 }, { floor: 1, x: 0, y: 0, width: 3, height: 12 },
      { floor: 2, x: 0, y: 0, width: 3, height: 12 }, { floor: 2, x: 11, y: 6, width: 2, height: 4 },
    ],
  },
  {
    slug: "blackwood-house", sourceId: "0dac4e37-4345-4045-8666-8637ba8787de", title: "Blackwood House", roomCount: 15, assetCount: 48,
    rationale: "A compact eastern service return and stepped southern volumes support the dense Gothic ground plan. Upstairs, offset adjoining volumes tie the bedroom and library wings together without covering the existing roof terrace or the garden recess beside the Arboretum.",
    floors: [
      [[14, 3, 2, 3], [10, 6, 4, 2], [5, 7, 3, 2], [8, 7, 2, 2], [1, 8, 4, 1]],
      [[4, 2, 3, 1], [0, 3, 3, 2], [3, 3, 3, 2], [4, 5, 2, 3], [8, 3, 3, 3], [11, 1, 2, 2], [1, 8, 3, 2]],
    ],
    preservedVoids: [
      { floor: 1, x: 9, y: 3, width: 1, height: 1 }, { floor: 1, x: 0, y: 9, width: 16, height: 3 },
      { floor: 2, x: 13, y: 0, width: 3, height: 6 }, { floor: 2, x: 11, y: 3, width: 2, height: 3 },
    ],
  },
  {
    slug: "briarwatch-manor", sourceId: "cf8141ec-b59d-4e4f-86f8-28ece37bb523", title: "Briarwatch Manor", roomCount: 10, assetCount: 27,
    rationale: "Small attached medieval ranges bridge the kitchen/library and entry wings. Stepped southern edges stay irregular; the upper-right ground-floor courtyard and the upstairs lightwell remain open.",
    floors: [
      [[4, 2, 2, 3], [6, 2, 2, 2], [8, 0, 3, 2], [8, 2, 3, 1], [0, 5, 3, 2], [3, 7, 3, 2], [7, 8, 4, 1]],
      [[0, 0, 4, 2], [4, 3, 2, 2], [6, 3, 2, 2], [9, 3, 3, 2], [9, 5, 2, 2], [3, 7, 3, 2], [7, 7, 2, 2]],
    ],
    preservedVoids: [
      { floor: 1, x: 8, y: 3, width: 3, height: 2 }, { floor: 1, x: 6, y: 4, width: 2, height: 1 },
      { floor: 2, x: 8, y: 3, width: 1, height: 2 }, { floor: 2, x: 0, y: 9, width: 16, height: 3 },
    ],
  },
];

export function authorAmbientMansionManifestV1(source, edition, sourcePayloadSha256) {
  assert.equal(source.packageId, edition.sourceId, "Unexpected source package identity");
  assert.equal(source.title, edition.title);
  assert.equal(source.rooms.length, edition.roomCount);
  assert.equal(source.assets.length, edition.assetCount);
  assert.equal(source.floorCount, 2);
  assert.ok(source.layoutV2 && !source.layoutV2.venueProfile && !source.venueProfile);
  assert.ok(source.layoutV2.entities.every((entity) => entity.kind !== "infill"), "Source already has authored infill");
  const blocks = edition.floors.flatMap((rectangles, floorIndex) => rectangles.map(([x, y, width, height], index) => ({
    kind: "infill", id: `ambient:f${floorIndex + 1}:${String(index + 1).padStart(2, "0")}`,
    floor: floorIndex + 1, x, y, width, height,
  })));
  const revision = structuredClone(source);
  revision.packageId = `ambient-v1-${jsonHash({ sourceId: source.packageId, sourcePayloadSha256, blocks }).slice(0, 32)}`;
  revision.title = `${source.title} — Ambient Edition`;
  assert.ok(revision.title.length <= 180, "Title would be truncated by import");
  revision.provenance.generatedWith.push(
    "PRISM authored ambient spaces V1 (decorative only; original rooms and media preserved)",
    `Source package: ${source.packageId}; title: ${source.title}`,
    `Source payload SHA-256: ${sourcePayloadSha256}`,
  );
  revision.layoutV2.entities.push(...blocks);
  assert.deepEqual(validateMansionPackageManifestV1(revision), []);
  return revision;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function verifyAmbientMansionPreservationV1(source, revised, edition) {
  const layout = revised.layoutV2;
  const blocks = layout.entities.filter((entity) => entity.kind === "infill");
  const restored = structuredClone(revised);
  restored.packageId = source.packageId;
  restored.title = source.title;
  restored.provenance = structuredClone(source.provenance);
  restored.layoutV2.entities = restored.layoutV2.entities.filter((entity) => entity.kind !== "infill");
  // Full allowlist comparison, not just counts: all other metadata, every
  // semantic room, door, connector, anchor, light, asset reference and music
  // contract must remain byte-equivalent in canonical JSON.
  assert.equal(canonical(restored), canonical(source), "A source field outside the additive authoring allowlist changed");
  assert.notEqual(revised.packageId, source.packageId);
  assert.notEqual(revised.title, source.title);
  assert.deepEqual(validateMansionLayoutV2(layout), []);
  assert.ok(mansionLayoutV2SemanticRoomsAreConnected(layout));
  assert.deepEqual(mansionLayoutV2ToLegacyRooms(layout), mansionLayoutV2ToLegacyRooms(source.layoutV2));
  assert.deepEqual(mansionLayoutV2CompatibilityNeighborIds(layout), mansionLayoutV2CompatibilityNeighborIds(source.layoutV2));
  const traversal = [];
  for (const from of source.rooms) for (const to of source.rooms) {
    const original = mansionLayoutV2TraversalRoute(source.layoutV2, from.id, to.id);
    assert.deepEqual(mansionLayoutV2TraversalRoute(layout, from.id, to.id), original);
    traversal.push({ from: from.id, to: to.id, route: original });
    for (const block of blocks) {
      assert.equal(mansionLayoutV2TraversalRoute(layout, from.id, block.id), null);
      assert.equal(mansionLayoutV2TraversalRoute(layout, block.id, from.id), null);
    }
  }
  // Exercise the exact remapper used by both import and export, reversibly.
  const mapped = remapMansionLayoutV2Ids(layout, (id) => `tenant:${id}`, (id) => `asset:${id}`);
  assert.deepEqual(validateMansionLayoutV2(mapped), []);
  const unmapped = remapMansionLayoutV2Ids(mapped, (id) => id.slice(7), (id) => id.slice(6));
  assert.equal(canonicalMansionLayoutV2(unmapped), canonicalMansionLayoutV2(layout));
  for (const voidRect of edition.preservedVoids) {
    assert.ok(layout.entities.every((entity) => entity.floor !== voidRect.floor || !overlaps(mansionLayoutV2EntityRect(entity), voidRect)), "An authored exterior/courtyard void was filled");
  }
  return {
    fullOriginalManifestPreservedExceptEditionMetadataAndAddedInfill: true,
    originalSemanticManifestSha256: jsonHash(source.rooms), revisedSemanticManifestSha256: jsonHash(revised.rooms),
    originalLayoutSha256: sha256(canonicalMansionLayoutV2(source.layoutV2)),
    originalLayoutRecoveredFromRevisionSha256: sha256(canonicalMansionLayoutV2(restored.layoutV2)),
    layoutSha256: sha256(canonicalMansionLayoutV2(layout)),
    originalTraversalSha256: jsonHash(traversal), revisedTraversalSha256: jsonHash(traversal), traversalPairsChecked: traversal.length,
    originalAssetDescriptorsSha256: jsonHash(source.assets), revisedAssetDescriptorsSha256: jsonHash(revised.assets),
    musicAndAmbienceSha256: jsonHash({ investigationThemeAssetId: source.investigationThemeAssetId, investigationThemeTitle: source.investigationThemeTitle, investigationThemeLoop: source.investigationThemeLoop ?? null, musicIdentity: source.musicIdentity ?? null, ambience: source.ambience ?? null }),
    codecIdRemappingAndCanonicalization: "passed",
    geometryAndNonTraversal: "passed",
    floorCount: revised.floorCount, roomCount: revised.rooms.length, assetCount: revised.assets.length,
    ambientCount: blocks.length,
    floors: [1, 2].map((floor) => ({ floor, ambientCount: blocks.filter((block) => block.floor === floor).length, rectangles: blocks.filter((block) => block.floor === floor).map((block) => ({
      ...block,
      attachedTo: layout.entities.filter((other) => other.id !== block.id && mansionLayoutV2SharedWall(block, other)).map((other) => other.id),
    })) })),
    preservedVoids: edition.preservedVoids,
  };
}

async function existing(path) {
  try { return await readFile(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeOnceOrVerify(path, bytes, verifyOnly) {
  const current = await existing(path);
  if (current) assert.deepEqual(current, Buffer.from(bytes), `Refusing to overwrite differing output: ${path}`);
  else {
    assert.ok(!verifyOnly, `Missing output: ${path}`);
    await writeFile(path, bytes, { flag: "wx" });
  }
}

export async function buildAmbientMansionEditionsV1({ verifyOnly = false, outputRoot = defaultOutputRoot } = {}) {
  if (!verifyOnly) {
    await mkdir(join(outputRoot, "packages"), { recursive: true });
    await mkdir(join(outputRoot, "public-fixtures"), { recursive: true });
  }
  const reports = [];
  for (const edition of AMBIENT_MANSION_EDITIONS_V1) {
    const inputPath = join(inputDirectory, `${edition.slug}-tessera-mosaic-v6.mansion`);
    const outputPath = join(outputRoot, "packages", `${edition.slug}-ambient-edition-v1.mansion`);
    const sourceBytes = await readFile(inputPath);
    const original = openPortableMysteryEnvelopeV1({ envelope: sourceBytes });
    assert.equal(original.header.packageType, "mansion");
    assert.equal(original.header.encryptionMode, "spoiler_seal");
    const source = decodeInternalMansionPackageV1(original.payload);
    const manifest = authorAmbientMansionManifestV1(source.manifest, edition, original.header.payloadSha256);
    const preservation = verifyAmbientMansionPreservationV1(source.manifest, manifest, edition);
    const payload = encodeInternalMansionPackageV1({ manifest, assets: source.assets });
    assert.deepEqual(payload, encodeInternalMansionPackageV1({ manifest, assets: source.assets }));
    const preflight = preflightPortableMysteryArchiveV1(payload);
    const prior = await existing(outputPath);
    assert.ok(prior || !verifyOnly, `Missing package: ${outputPath}`);
    const sealed = prior ?? sealPortableMysteryEnvelopeV1({
      payload, mode: original.header.encryptionMode,
      metadata: {
        packageType: "mansion", title: manifest.title, creatorName: manifest.creator.name,
        compatibility: manifest.compatibility, expandedBytes: preflight.expandedBytes,
        assetCount: manifest.assets.length, contentWarnings: manifest.contentWarnings, creatorSignature: null,
      },
    });
    const opened = openPortableMysteryEnvelopeV1({ envelope: sealed });
    assert.deepEqual(Buffer.from(opened.payload), Buffer.from(payload), `Refusing to overwrite a different existing edition: ${outputPath}`);
    assert.equal(opened.header.expandedBytes, preflight.expandedBytes);
    assert.equal(opened.header.assetCount, manifest.assets.length);
    assert.equal(preflight.entryCount, manifest.assets.length + 1);
    assert.equal(opened.header.title, manifest.title);
    assert.notEqual(opened.header.payloadSha256, original.header.payloadSha256);
    const roundTrip = decodeInternalMansionPackageV1(opened.payload);
    assert.equal(canonical(roundTrip.manifest), canonical(manifest));
    await validatePortableMansionMediaV1(roundTrip);
    const assets = manifest.assets.map((descriptor) => {
      const originalBytes = source.assets.get(descriptor.archivePath);
      const revisedBytes = roundTrip.assets.get(descriptor.archivePath);
      assert.deepEqual(revisedBytes, originalBytes);
      return { id: descriptor.id, role: descriptor.role, path: descriptor.archivePath, byteLength: originalBytes.byteLength, originalSha256: sha256(originalBytes), revisedSha256: sha256(revisedBytes) };
    });
    assert.deepEqual(await readFile(inputPath), sourceBytes, "Original package bytes changed");
    await writeOnceOrVerify(outputPath, sealed, verifyOnly);
    // A .mansion manifest contains reusable public topology/presentation only;
    // no case truth, testimony, clue graph, or sealed case payload is exported.
    const fixturePath = join(outputRoot, "public-fixtures", `${edition.slug}.public-manifest.json`);
    await writeOnceOrVerify(fixturePath, `${JSON.stringify(roundTrip.manifest, null, 2)}\n`, verifyOnly);
    reports.push({
      slug: edition.slug, title: manifest.title, rationale: edition.rationale,
      source: { path: inputPath, packageId: source.manifest.packageId, envelopeSha256: sha256(sourceBytes), payloadSha256: original.header.payloadSha256, envelopeBytes: sourceBytes.byteLength },
      output: { path: outputPath, packageId: manifest.packageId, envelopeSha256: sha256(sealed), payloadSha256: opened.header.payloadSha256, envelopeBytes: sealed.byteLength },
      publicFixturePath: fixturePath, codecAndEnvelopeRoundTrip: "passed", mediaValidation: "passed", ...preservation, assets,
    });
    process.stdout.write(`${manifest.title}: ${preservation.roomCount} rooms, ${preservation.ambientCount} ambient blocks, ${preservation.assetCount} unchanged assets; validated\n`);
  }
  assert.equal(new Set(reports.map((report) => report.output.packageId)).size, 4);
  assert.equal(new Set(reports.map((report) => report.title)).size, 4);
  const report = {
    version: 1, builder: "scripts/author-existing-mansion-ambient-spaces-v1.mjs",
    scope: "Offline package authoring and source-level verification only. No live installation or rendered UI QA performed.",
    reproducibility: "Manifest, canonical layout, payload ZIP, and package ID are deterministic. Encryption uses fresh random IVs on first creation; reruns reuse an identical existing edition without rewriting it. --verify-only performs no writes.",
    importIdentity: "The manifest identity field is packageId (there is no sourceId field). Each edition has a new deterministic packageId and a new payloadSha256. API duplicate detection uses payloadSha256; imports insert a fresh bundle and remap every entity. Original lineage is retained in provenance.generatedWith and this report. Titles are unique across this set and distinct from the originals; live title/duplicate inspection remains required.",
    tutorialReview: "Reviewed firstRunOnboarding.ts and modeTutorials.ts: no new controls, workflow, defaults, semantic room counts, or click targets; no tutorial change needed. Decorative blocks remain anonymous and inaccessible.",
    creditsReview: "No new third-party assets or dependencies; all original media retained byte-for-byte. No credits change needed.",
    packages: reports,
  };
  await writeOnceOrVerify(join(outputRoot, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`, verifyOnly);
  const handoff = `# Authored ambient mansion editions V1

Four source-preserving, offline Ambient Edition packages. Original packages are
never rewritten. See validation-report.json for every source/output hash, exact
rectangle, full semantic comparison, asset hash and preserved courtyard/void.

## Reproduce and verify

From the PRISM repository, with filesystem authority to write .codex/output:

\`node --experimental-strip-types scripts/author-existing-mansion-ambient-spaces-v1.mjs\`

\`node --experimental-strip-types scripts/author-existing-mansion-ambient-spaces-v1.mjs --verify-only\`

If the sandbox makes .codex read-only, use an approved staging directory with
\`--output-root DIRECTORY\`. The default remains the requested .codex/output
location. Payload ZIPs and package identities are reproducible; encrypted outer
envelopes correctly use fresh random IVs on first creation. Existing matching
outputs are verified and reused; differing outputs are never overwritten.

## Parent-owned installation (not performed)

1. Check the intended authenticated LOCAL owner's installed bundle IDs, names,
   portable package IDs and payload hashes. Keep a read-only before snapshot of
   the four original records. A matching edition payload means already imported:
   reuse it rather than installing twice. Stop on an unrelated title collision.
2. Open each .mansion with openPortableMysteryEnvelopeV1, then decode with
   decodeInternalMansionPackageV1. Validate archive preflight/header counts and
   validatePortableMansionMediaV1 before a transaction.
3. For these trusted, locally verified packages, the existing
   importInternalMansionPackageToDbDetailedV1({ db, userKey, userId,
   archive: opened.payload, portableMetadata }) helper inserts a fresh bundle,
   tenant-remaps all room/corridor/infill IDs, and retains exact asset bytes.
   portableMetadata must carry manifest.packageId, opened.header.payloadSha256,
   manifest.description/creator/provenance/license/contentWarnings, and the
   header encryptionMode/creatorSignature. Load runtime secrets through the
   existing with-secrets helper; never persist credentials in these outputs.
4. The normal authenticated POST /api/debates/mystery-mansions/inspect and /import
   endpoints accept raw application/vnd.prism.mansion bytes. The public import
   sanitizes/re-encodes images, so use the trusted internal helper above when
   installed asset byte preservation is required. Do not call an in-place
   upgrade helper or reuse an original bundle ID.
5. Verify four distinct new bundles, exact semantic counts 5/5/15/10, ambient
   counts 18/12/12/14, asset counts 26/27/48/27, and unchanged original records.

## Parent-owned rendered QA (not performed)

The public-fixtures/*.public-manifest.json files contain only validated public
.mansion manifests, not sealed case truth or investigation content. They can
feed the existing /qa-whodunnit actual V2 fixture's mansionSnapshot.layoutV2
and public room projection without a live import or provider call.

Inspect both floors of all four editions in light and dark at 1440x900 and a
smaller viewport. Each authored rectangle must render once, with no automatic
filler on that floor; data-ambient-space-id exposes its stable ID for DOM checks.
Ambient blocks must have no label, tooltip, focus stop, room button, or travel
target. Confirm courtyard/jungle/roof-terrace gaps, room selection, doors,
stair travel, room counts, art/music, and an unchanged profiled-venue map.
Source checks and the in-memory codec test are not rendered or live proof.

Tutorial review: firstRunOnboarding.ts and modeTutorials.ts need no change:
no new controls, defaults, workflows, semantic rooms or tutorial targets.
Credits: no new assets, services or dependencies. PRISM-5aadu remains open for
the parent-owned installation and visual acceptance.
`;
  await writeOnceOrVerify(join(outputRoot, "README.md"), handoff, verifyOnly);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let outputRoot = defaultOutputRoot;
  let verifyOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--verify-only") verifyOnly = true;
    else if (args[index] === "--output-root" && args[index + 1]) outputRoot = resolve(args[++index]);
    else throw new Error("Usage: node --experimental-strip-types scripts/author-existing-mansion-ambient-spaces-v1.mjs [--verify-only] [--output-root DIRECTORY]");
  }
  await buildAmbientMansionEditionsV1({ verifyOnly, outputRoot });
}
