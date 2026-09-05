import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  type DebateMysteryHouseStyleV2,
  type DebateMysteryMansionBundleSummaryV1,
  type MansionLayoutV2,
  type MysteryVenueProfileV1,
} from "@localai/shared";
import sharp from "sharp";
import {
  debateMysteryMansionOverheadPromptV1,
  generateDebateMysteryDeckPlanV1,
  resolveDebateMysteryMansionOverheadIdentityV1,
} from "../debate-mystery-mansion-deck-plan.ts";
import { HttpError } from "../utils.http.ts";

const serverSource = readFileSync(
  new URL("../server.ts", import.meta.url),
  "utf8",
);

function houseStyle(
  overrides: Partial<DebateMysteryHouseStyleV2> = {},
): DebateMysteryHouseStyleV2 {
  return {
    version: 1,
    id: "legacy-gothic",
    label: "Gothic old house",
    promptContract:
      "A slate manor with chimneys, dormers, gravel paths, and a broad lawn.",
    atmosphere: {
      version: 1,
      weather: "clear",
      timeOfDay: "night",
      exteriorSetting: "A wooded country estate",
      houseCondition: "Weathered masonry and slate",
      mood: "Restrained dread",
    },
    acousticThemePaletteId: "gothic-old-house-v1",
    bespokeAmbienceRequested: false,
    ...overrides,
  };
}

function estateProfile(): MysteryVenueProfileV1 {
  return {
    version: 1,
    kind: "estate",
    kindLabel: "Private estate",
    placeNoun: "manor",
    topology: "estate",
    tierLabels: ["Ground floor", "Upper floor"],
    entryRoomId: "foyer",
    exteriorMode: "grounds",
    environmentSummary: "A secluded manor surrounded by formal grounds.",
  };
}

function layout(
  venueProfile: MysteryVenueProfileV1 | null = null,
): MansionLayoutV2 {
  return {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities: [{
      kind: "room",
      id: "foyer",
      templateId: "foyer",
      name: "Foyer",
      floor: 1,
      x: 0,
      y: 0,
      rotation: 0,
      suspectSlotId: null,
      emoji: "◇",
      imageId: null,
      bundledAssetPath: null,
      acceptedRoomAssetId: null,
    }],
    doors: [],
    verticalConnectors: [],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [],
    ...(venueProfile ? { venueProfile } : {}),
  };
}

function mansion(
  overrides: Partial<DebateMysteryMansionBundleSummaryV1> = {},
): DebateMysteryMansionBundleSummaryV1 {
  return {
    version: 1,
    id: "venue",
    name: "Legacy venue",
    sourceSessionId: null,
    floors: 1,
    totalRooms: 1,
    scaleClass: "standard",
    suspectCount: 1,
    houseStyle: houseStyle(),
    rooms: [],
    layoutV2: layout(),
    assets: [],
    portable: null,
    derivation: null,
    library: {
      version: 1,
      defaults: {
        title: "Old Manor",
        description: "A country manor on broad grounds.",
        thumbnailAssetId: "old-cover",
      },
      overrides: {
        title: null,
        description: null,
        thumbnailAssetId: null,
      },
    },
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

function asterionMansion(): DebateMysteryMansionBundleSummaryV1 {
  return mansion({
    id: "asterion",
    name: "Asterion Observatory",
    library: {
      version: 1,
      defaults: {
        title: "Old Manor",
        description: "A country manor on broad grounds.",
        thumbnailAssetId: "old-cover",
      },
      overrides: {
        title: "Asterion Observatory",
        description:
          "A deep-space observatory clings to a nickel-iron asteroid above an open starfield.",
        thumbnailAssetId: "asterion-cover",
      },
    },
  });
}

function rejectionTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE debate_mystery_mansion_bundles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE debate_mystery_mansion_asset_refs (
      bundle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      role TEXT NOT NULL,
      logical_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(bundle_id, role, logical_id)
    );
    INSERT INTO debate_mystery_mansion_bundles
      (id, user_id, updated_at)
    VALUES ('asterion', 'user-1', '2026-09-03T00:00:00.000Z');
    INSERT INTO debate_mystery_mansion_asset_refs
      (bundle_id, user_id, asset_id, role, logical_id, created_at)
    VALUES
      ('asterion', 'user-1', 'active-overhead', 'map', 'overhead', '2026-09-03T00:00:00.000Z'),
      ('asterion', 'user-1', 'previous-overhead', 'map', 'overhead:previous', '2026-09-03T00:00:00.000Z');
  `);
  return db;
}

function overheadRefs(
  db: DatabaseSync,
): Array<{ assetId: string; logicalId: string }> {
  return (
    db.prepare(
      `SELECT asset_id AS assetId, logical_id AS logicalId
       FROM debate_mystery_mansion_asset_refs
       WHERE bundle_id = ? AND role = 'map'
       ORDER BY logical_id`,
    ).all("asterion") as unknown as Array<{
      assetId: string;
      logicalId: string;
    }>
  ).map((row) => ({ ...row }));
}

function sourceBetween(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

describe("Whodunnit mansion overhead identity", () => {
  it("uses Asterion's current Library override without legacy estate defaults", () => {
    const identity =
      resolveDebateMysteryMansionOverheadIdentityV1(asterionMansion());
    const prompt = debateMysteryMansionOverheadPromptV1(identity, true);

    assert.equal(identity.title, "Asterion Observatory");
    assert.match(identity.description, /nickel-iron asteroid/u);
    assert.equal(identity.coverAssetId, "asterion-cover");
    assert.equal(identity.kind, "habitat");
    assert.equal(identity.placeNoun, "observatory");
    assert.match(prompt, /Asterion Observatory/u);
    assert.match(prompt, /nickel-iron asteroid/u);
    assert.match(prompt, /current Library cover/u);
    assert.match(prompt, /restrained 2:1 widescreen composition/u);
    assert.match(prompt, /never a panoramic or ultrawide strip/u);
    for (const estateDefault of [
      "manor",
      "slate",
      "chimney",
      "lawn",
      "gravel",
    ]) {
      assert.doesNotMatch(
        prompt,
        new RegExp(`\\b${estateDefault}`, "iu"),
        `${estateDefault} must not leak into a legacy space-venue prompt`,
      );
    }
  });

  it("retains explicit estate surfaces and keeps unknown venues neutral", () => {
    const estate = mansion({
      name: "Blackwood Manor",
      layoutV2: layout(estateProfile()),
      library: {
        version: 1,
        defaults: {
          title: "Blackwood Manor",
          description: "A secluded Gothic manor and its formal grounds.",
          thumbnailAssetId: null,
        },
        overrides: {
          title: null,
          description: null,
          thumbnailAssetId: null,
        },
      },
    });
    const estateIdentity =
      resolveDebateMysteryMansionOverheadIdentityV1(estate);
    const estatePrompt = debateMysteryMansionOverheadPromptV1(
      estateIdentity,
      false,
    );
    assert.equal(estateIdentity.kind, "estate");
    assert.match(estatePrompt, /slate/u);
    assert.match(estatePrompt, /chimneys/u);
    assert.match(estatePrompt, /lawn/u);
    assert.match(estatePrompt, /gravel/u);

    const unknown = mansion({
      name: "The Elsewhere",
      houseStyle: houseStyle({
        id: "abstract",
        label: "Abstract venue study",
        promptContract: "Restrained geometric ink and diffuse silver light.",
        atmosphere: {
          version: 1,
          weather: "clear",
          timeOfDay: "unknown",
          exteriorSetting: "An unmapped expanse",
          houseCondition: "Quietly weathered",
          mood: "Uncanny calm",
        },
        acousticThemePaletteId: "abstract-v1",
      }),
      library: {
        version: 1,
        defaults: {
          title: "The Elsewhere",
          description:
            "A silent geometric retreat suspended beyond ordinary geography.",
          thumbnailAssetId: null,
        },
        overrides: {
          title: null,
          description: null,
          thumbnailAssetId: null,
        },
      },
    });
    const unknownIdentity =
      resolveDebateMysteryMansionOverheadIdentityV1(unknown);
    const unknownPrompt = debateMysteryMansionOverheadPromptV1(
      unknownIdentity,
      false,
    );
    assert.equal(unknownIdentity.kind, "other");
    assert.equal(unknownIdentity.placeNoun, "venue");
    assert.match(unknownPrompt, /neutral structural language/u);
    assert.doesNotMatch(
      unknownPrompt,
      /\b(?:manor|slate|chimneys?|lawns?|gravel)\b/iu,
    );
  });

  it("retries once with review findings and preserves both saved refs after two rejections", async () => {
    const db = rejectionTestDb();
    const before = overheadRefs(db);
    const prompts: string[] = [];
    let reviewCount = 0;
    const identity =
      resolveDebateMysteryMansionOverheadIdentityV1(asterionMansion());
    const cover = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: "#161d2e",
      },
    }).webp().toBuffer();
    try {
      await assert.rejects(
        generateDebateMysteryDeckPlanV1({
          db,
          userKey: Buffer.alloc(32, 1),
          userId: "user-1",
          bundleId: "asterion",
          layout: layout(),
          identity,
          exteriorBytes: cover,
          apiKey: "test-key",
          dependencies: {
            editImage: async (prompt, sourceImageBytes) => {
              const metadata = await sharp(sourceImageBytes).metadata();
              assert.equal(metadata.format, "png");
              prompts.push(prompt);
              return {
                url: "",
                imageBytes: Buffer.from(`candidate-${prompts.length}`),
                revisedPrompt: prompt,
                model: "test-image-model",
              };
            },
            reviewCandidate: async () => {
              reviewCount += 1;
              return {
                approved: false,
                reasons: [
                  reviewCount === 1
                    ? "The candidate is a terrestrial country house rather than an asteroid observatory."
                    : "The second candidate still replaces the observatory with an unrelated building.",
                ],
              };
            },
          },
        }),
        (error: unknown) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.statusCode, 422);
          assert.match(error.message, /kept the existing overhead/u);
          return true;
        },
      );
      assert.equal(prompts.length, 2);
      assert.equal(reviewCount, 2);
      assert.match(
        prompts[1]!,
        /terrestrial country house rather than an asteroid observatory/u,
      );
      assert.deepEqual(overheadRefs(db), before);
    } finally {
      db.close();
    }
  });

  it("makes both redraw routes share current-cover resolution and fail closed", () => {
    const helper = sourceBetween(
      serverSource,
      "function currentMansionOverheadGenerationInputV1(",
      "async function repairDebateMysterySceneV1(",
    );
    assert.match(
      helper,
      /resolveDebateMysteryMansionOverheadIdentityV1\(mansion\)/u,
    );
    assert.match(helper, /identity\.coverAssetId/u);
    assert.match(helper, /getDebateMysteryMansionAssetFileV1/u);
    assert.match(helper, /current Library cover could not be read/u);
    assert.doesNotMatch(helper, /catch\s*\{\s*return/u);

    const inCaseRoute = sourceBetween(
      serverSource,
      'if (args.action === "generate_map_plan")',
      "if (audioAction)",
    );
    assert.match(
      inCaseRoute,
      /currentMansionOverheadGenerationInputV1/u,
    );
    assert.match(
      inCaseRoute,
      /layout, identity, exteriorBytes/u,
    );
    assert.doesNotMatch(
      inCaseRoute,
      /mansionSnapshot\?\.presentation\.thumbnailAssetId/u,
    );
    assert.doesNotMatch(
      inCaseRoute,
      /getDebateMysteryAssetFileForPreparationV1/u,
    );

    const libraryRoute = sourceBetween(
      serverSource,
      'route("POST", "/api/debates/mystery-mansions/:id/overhead/generate"',
      'route("PATCH", "/api/debates/mystery-mansions/:id"',
    );
    assert.match(
      libraryRoute,
      /currentMansionOverheadGenerationInputV1/u,
    );
    assert.match(
      libraryRoute,
      /layout, identity, exteriorBytes/u,
    );
  });
});
