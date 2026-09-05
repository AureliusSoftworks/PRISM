import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  addAutoCenteredMansionLayoutV2Doors,
  PORTABLE_MANSION_PACKAGE_MIME_V1,
  type MansionPackageManifestV1,
} from "@localai/shared";
import sharp from "sharp";
import { encodeInternalMansionPackageV1 } from "../debate-mystery-mansion-codec.ts";
import { inspectPortableMansionPackageV1 } from "../debate-mystery-mansion-package.ts";
import { sealPortableMysteryEnvelopeV1 } from "../debate-mystery-package-envelope.ts";
import { preflightPortableMysteryArchiveV1 } from "../debate-mystery-package-safety.ts";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "mansion-package-api-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const fetchRecorder = createFetchRecorder();
const server = createServer(createPrismRequestHandler({
  db,
  config: {
    ...getAppConfig(),
    apiPort: 0,
    sessionCookieName: "prism_mansion_package_test_session",
    lanAccessEnabled: false,
    discoveryEnabled: false,
    openAiApiKey: "",
    anthropicApiKey: "",
    elevenLabsApiKey: "",
  },
  fetchImpl: fetchRecorder,
  providerFactory: () => provider,
  auxiliaryProviderFactory: () => provider,
}));
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}): Promise<Response> {
      init = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(value: Record<string, unknown>, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

async function fixtureEnvelope(args: {
  packageId?: string;
  allowsRedistribution?: boolean;
} = {}): Promise<Uint8Array> {
  const image = await sharp({
    create: { width: 4, height: 3, channels: 4, background: "#58388c" },
  }).webp({ quality: 50 }).toBuffer();
  const digest = createHash("sha256").update(image).digest("hex");
  const archivePath = `assets/${digest}.webp`;
  const manifest: MansionPackageManifestV1 = {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: args.packageId ?? "api-portable-mansion",
    title: "Violet House",
    description: "A compact reusable house.",
    creator: { name: "Fixture Creator", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: {
      name: args.allowsRedistribution === false ? "Personal use" : "Share alike",
      url: null,
      allowsRedistribution: args.allowsRedistribution !== false,
    },
    contentWarnings: ["Storm sounds"],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 1,
    rooms: [{
      id: "library",
      templateId: "library",
      name: "Library",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      slots: [{ id: "slot", x: 0.5, y: 0.5 }],
      emoji: "📚",
      roomAssetId: "room-image",
      propAssetIds: [],
    }],
    houseStyle: { id: "violet", label: "Violet", promptContract: "Violet noir." },
    assets: [{
      id: "room-image",
      role: "room",
      archivePath,
      sha256: digest,
      byteLength: image.byteLength,
      mimeType: "image/webp",
      width: 4,
      height: 3,
      durationMs: null,
    }],
    previewAssetId: "room-image",
    investigationThemeAssetId: null,
  };
  const payload = encodeInternalMansionPackageV1({
    manifest,
    assets: new Map([[archivePath, image]]),
  });
  return sealPortableMysteryEnvelopeV1({
    payload,
    mode: "spoiler_seal",
    metadata: {
      packageType: "mansion",
      title: manifest.title,
      creatorName: manifest.creator.name,
      compatibility: manifest.compatibility,
      expandedBytes: preflightPortableMysteryArchiveV1(payload).expandedBytes,
      assetCount: manifest.assets.length,
      contentWarnings: manifest.contentWarnings,
    },
  });
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("portable mansion package API", () => {
  it("previews, installs, flags duplicates, re-exports, serves assets, and removes offline", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({ username: "mansion-owner@example.com", password: "mansion-owner-password" }),
    );
    assert.equal(registration.status, 201);
    const envelope = await fixtureEnvelope();
    const binary = (): RequestInit => ({
      method: "POST",
      headers: { "content-type": PORTABLE_MANSION_PACKAGE_MIME_V1 },
      body: envelope,
    });

    const previewResponse = await client.request("/api/debates/mystery-mansions/inspect", binary());
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()) as Record<string, any>;
    assert.equal(preview.preview.header.title, "Violet House");
    assert.equal(preview.preview.roomCount, 1);
    assert.match(preview.preview.previewImageDataUrl, /^data:image\/webp;base64,/u);

    const importResponse = await client.request("/api/debates/mystery-mansions/import", binary());
    const importBody = await importResponse.text();
    assert.equal(importResponse.status, 201, importBody);
    const imported = JSON.parse(importBody) as Record<string, any>;
    const mansionId = String(imported.mansion.id);
    assert.equal(imported.mansion.portable.license.allowsRedistribution, true);
    assert.equal(imported.mansion.library.defaults.title, "Violet House");
    assert.equal(imported.mansion.library.defaults.description, "A compact reusable house.");
    assert.equal(imported.mansion.library.overrides.title, null);

    const duplicateResponse = await client.request("/api/debates/mystery-mansions/inspect", binary());
    const duplicate = (await duplicateResponse.json()) as Record<string, any>;
    assert.equal(duplicate.preview.duplicateBundleId, mansionId);

    const assetId = String(imported.mansion.assets[0].id);
    assert.equal(imported.mansion.library.defaults.thumbnailAssetId, assetId);
    const assetResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/assets/${encodeURIComponent(assetId)}/file`,
    );
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("content-type"), "image/webp");

    const customThumbnail = await sharp({
      create: { width: 24, height: 16, channels: 4, background: "#c7a34b" },
    }).png().toBuffer();
    const updateResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}`,
      jsonInit({
        title: "My Violet House",
        description: "A personal library description.",
        thumbnailDataUrl: `data:image/png;base64,${customThumbnail.toString("base64")}`,
      }, "PATCH"),
    );
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as Record<string, any>;
    assert.equal(updated.mansion.name, "Violet House");
    assert.equal(updated.mansion.library.defaults.title, "Violet House");
    assert.equal(updated.mansion.library.overrides.title, "My Violet House");
    assert.equal(updated.mansion.library.overrides.description, "A personal library description.");
    const overrideThumbnailId = String(updated.mansion.library.overrides.thumbnailAssetId);
    assert.notEqual(overrideThumbnailId, assetId);
    const overrideThumbnailResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/assets/${encodeURIComponent(overrideThumbnailId)}/file`,
    );
    assert.equal(overrideThumbnailResponse.status, 200);
    assert.equal(overrideThumbnailResponse.headers.get("content-type"), "image/webp");

    const cloneResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/clone`,
      jsonInit({}, "POST"),
    );
    assert.equal(cloneResponse.status, 201);
    const cloned = (await cloneResponse.json()) as Record<string, any>;
    const cloneId = String(cloned.mansion.id);
    assert.notEqual(cloneId, mansionId);
    assert.equal(cloned.mansion.name, "My Violet House Copy");
    assert.equal(cloned.mansion.portable, null);
    assert.equal(cloned.mansion.derivation.sourceBundleId, mansionId);
    const editedRooms = [
      { id: "foyer-edit", templateId: "foyer", name: "Foyer", floor: 1, x: 0, y: 0, width: 2, height: 2, neighborIds: ["parlor-edit", "landing-edit"] },
      { id: "parlor-edit", templateId: "parlor", name: "Parlor", floor: 1, x: 2, y: 0, width: 2, height: 2, neighborIds: ["foyer-edit", "library-edit"] },
      { id: "library-edit", templateId: "library", name: "Library", floor: 1, x: 4, y: 0, width: 2, height: 2, neighborIds: ["parlor-edit"] },
      { id: "landing-edit", templateId: "guest-bedroom", name: "Guest Bedroom", floor: 2, x: 0, y: 0, width: 2, height: 2, neighborIds: ["foyer-edit", "bathroom-edit"] },
      { id: "bathroom-edit", templateId: "bathroom", name: "Bathroom", floor: 2, x: 2, y: 0, width: 2, height: 2, neighborIds: ["landing-edit"] },
    ];
    const protectedSourceResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/topology`,
      jsonInit({ rooms: editedRooms }, "PATCH"),
    );
    assert.equal(protectedSourceResponse.status, 409);
    const topologyResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(cloneId)}/topology`,
      jsonInit({ rooms: editedRooms }, "PATCH"),
    );
    assert.equal(topologyResponse.status, 200);
    const edited = (await topologyResponse.json()) as Record<string, any>;
    assert.equal(edited.mansion.floors, 2);
    assert.equal(edited.mansion.totalRooms, 5);

    const unsupportedThirdFloor = editedRooms.map((room) => room.id === "landing-edit"
      ? { ...room, neighborIds: [...room.neighborIds, "observatory-edit"] }
      : room);
    unsupportedThirdFloor.push({
      id: "observatory-edit",
      templateId: "library",
      name: "Observatory",
      floor: 3,
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      neighborIds: ["landing-edit"],
    });
    const unsupportedThirdFloorResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(cloneId)}/topology`,
      jsonInit({ rooms: unsupportedThirdFloor }, "PATCH"),
    );
    assert.equal(unsupportedThirdFloorResponse.status, 400);
    assert.match(await unsupportedThirdFloorResponse.text(), /Floor 2 needs at least 4 rooms/u);

    const otherClient = createClient();
    const otherRegistration = await otherClient.request(
      "/api/auth/register",
      jsonInit({ username: "other-mansion-owner@example.com", password: "other-mansion-owner-password" }),
    );
    assert.equal(otherRegistration.status, 201);
    const foreignUpdate = await otherClient.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}`,
      jsonInit({ title: "Not mine" }, "PATCH"),
    );
    assert.equal(foreignUpdate.status, 404);
    const foreignClone = await otherClient.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/clone`,
      jsonInit({}, "POST"),
    );
    assert.equal(foreignClone.status, 404);
    const exportResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/export`,
      jsonInit({ mode: "spoiler_seal", creatorName: "Recipient" }),
    );
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-disposition") ?? "", /\.mansion"$/u);
    const exportedHeader = inspectPortableMansionPackageV1(new Uint8Array(await exportResponse.arrayBuffer()));
    assert.equal(exportedHeader.packageType, "mansion");
    assert.equal(exportedHeader.title, "Violet House");

    const clearResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}`,
      jsonInit({ title: null, description: null, thumbnailDataUrl: null }, "PATCH"),
    );
    assert.equal(clearResponse.status, 200);
    const cleared = (await clearResponse.json()) as Record<string, any>;
    assert.equal(cleared.mansion.library.overrides.title, null);
    assert.equal(cleared.mansion.library.overrides.description, null);
    assert.equal(cleared.mansion.library.overrides.thumbnailAssetId, null);
    assert.equal(cleared.mansion.library.defaults.thumbnailAssetId, assetId);

    const removeResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}`,
      { method: "DELETE" },
    );
    assert.equal(removeResponse.status, 200);
    const removeCloneResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(cloneId)}`,
      { method: "DELETE" },
    );
    assert.equal(removeCloneResponse.status, 200);

    const restrictedEnvelope = await fixtureEnvelope({
      packageId: "api-restricted-mansion",
      allowsRedistribution: false,
    });
    const restrictedImport = await client.request(
      "/api/debates/mystery-mansions/import",
      {
        method: "POST",
        headers: { "content-type": PORTABLE_MANSION_PACKAGE_MIME_V1 },
        body: restrictedEnvelope,
      },
    );
    assert.equal(restrictedImport.status, 201);
    const restricted = (await restrictedImport.json()) as Record<string, any>;
    const restrictedExport = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(String(restricted.mansion.id))}/export`,
      jsonInit({ mode: "spoiler_seal" }),
    );
    assert.equal(restrictedExport.status, 403);
    assert.equal(fetchRecorder.calls.length, 0);
  });

  it("creates blank editor mansions, enforces rooftop placement, and resets one room locally", async () => {
    const client = createClient();
    const registration = await client.request(
      "/api/auth/register",
      jsonInit({ username: "blank-mansion-owner@example.com", password: "blank-mansion-owner-password" }),
    );
    assert.equal(registration.status, 201);

    const rejectedFields = await client.request(
      "/api/debates/mystery-mansions",
      jsonInit({ name: "Client-authored title" }),
    );
    assert.equal(rejectedFields.status, 400);

    const createResponse = await client.request(
      "/api/debates/mystery-mansions",
      jsonInit({}),
    );
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as Record<string, any>;
    const mansionId = String(created.mansion.id);
    const layout = created.mansion.layoutV2 as Record<string, any>;
    assert.equal(created.mansion.totalRooms, 4);
    assert.equal(created.mansion.floors, 2);
    assert.equal(created.mansion.derivation.sourceBundleId, null);

    const invalidRooftopLayout = {
      ...layout,
      entities: layout.entities.map((entity: Record<string, any>) => entity.id === "room:parlor"
        ? { ...entity, templateId: "rooftop-lounge", name: "Rooftop Lounge" }
        : entity),
    };
    const invalidRooftopResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/topology`,
      jsonInit({ layoutV2: invalidRooftopLayout }, "PATCH"),
    );
    assert.equal(invalidRooftopResponse.status, 400);
    assert.match(await invalidRooftopResponse.text(), /rooftop-only.*Floor 2/u);

    const authoredLayout = {
      ...layout,
      placementAnchors: [
        {
          id: "anchor:study",
          roomId: "room:study",
          name: "writing desk",
          relation: "beside",
          point: { x: 0.62, y: 0.48 },
        },
        {
          id: "anchor:bathroom",
          roomId: "room:bathroom",
          name: "mirror",
          relation: "near",
          point: { x: 0.5, y: 0.35 },
        },
      ],
      lights: ["room:study", "room:bathroom"].map((roomId, index) => ({
        id: `light:${index}`,
        roomId,
        kind: "omni",
        color: "#ffffff",
        intensity: 0.5,
        animationSeed: roomId,
        cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
        geometry: { x: 0.5, y: 0.5, radius: 0.2 },
      })),
    };
    const authoredRooftopLayout = addAutoCenteredMansionLayoutV2Doors({
      ...authoredLayout,
      entities: [
        ...authoredLayout.entities,
        {
          kind: "room",
          id: "room:rooftop",
          templateId: "rooftop-lounge",
          name: "Rooftop Lounge",
          floor: 2,
          x: 9,
          y: 0,
          rotation: 90,
          suspectSlotId: null,
          emoji: "🌃",
          imageId: null,
          bundledAssetPath: "/debate/mystery/rooms/rooftop-lounge.webp",
          acceptedRoomAssetId: null,
        },
      ],
    }, "room:rooftop");
    const saveResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/topology`,
      jsonInit({ layoutV2: authoredRooftopLayout }, "PATCH"),
    );
    assert.equal(saveResponse.status, 200);

    const regenerateResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/room-art/${encodeURIComponent("room:study")}/regenerate`,
      jsonInit({}),
    );
    assert.equal(regenerateResponse.status, 200);
    const regenerated = (await regenerateResponse.json()) as Record<string, any>;
    assert.equal(
      regenerated.mansion.layoutV2.placementAnchors.some(
        (anchor: Record<string, any>) => anchor.roomId === "room:study",
      ),
      false,
    );
    assert.equal(
      regenerated.mansion.layoutV2.lights.some(
        (light: Record<string, any>) => light.roomId === "room:study",
      ),
      false,
    );
    assert.equal(
      regenerated.mansion.layoutV2.placementAnchors.some(
        (anchor: Record<string, any>) => anchor.roomId === "room:bathroom",
      ),
      true,
    );
    assert.equal(
      regenerated.mansion.layoutV2.lights.some(
        (light: Record<string, any>) => light.roomId === "room:bathroom",
      ),
      true,
    );

    const regeneratedRooftop = regenerated.mansion.layoutV2.entities.find(
      (entity: Record<string, any>) => entity.templateId === "rooftop-lounge",
    );
    assert.equal(regeneratedRooftop?.floor, 2);

    const exportResponse = await client.request(
      `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/export`,
      jsonInit({ mode: "spoiler_seal", creatorName: "Fixture Creator" }),
    );
    assert.equal(exportResponse.status, 200);
    const exported = new Uint8Array(await exportResponse.arrayBuffer());
    const importResponse = await client.request(
      "/api/debates/mystery-mansions/import",
      {
        method: "POST",
        headers: { "content-type": PORTABLE_MANSION_PACKAGE_MIME_V1 },
        body: exported,
      },
    );
    const importedBody = await importResponse.text();
    assert.equal(importResponse.status, 201, importedBody);
    const importedRooftopBundle = JSON.parse(importedBody) as Record<string, any>;
    const importedRooftop = importedRooftopBundle.mansion.layoutV2.entities.find(
      (entity: Record<string, any>) => entity.templateId === "rooftop-lounge",
    );
    assert.equal(importedRooftop?.floor, 2);
    assert.equal(fetchRecorder.calls.length, 0);
  });
});
