import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { strToU8, zipSync } from "fflate";
import { getAppConfig } from "@localai/config";
import {
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  type ProjectOwnedAssetExportPayloadV1,
} from "@localai/shared";
import { createTestDatabase } from "../test-support.ts";
import {
  buildGeneratedImageRelativePath,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytes,
} from "../image-storage.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-backup-assets-"));
const sourceDbPath = join(tempDir, "source", "localai.db");
const targetDbPath = join(tempDir, "target", "localai.db");
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = sourceDbPath;
process.env.ENCRYPTION_MASTER_KEY = "backup-assets-integration-key";

const { createPrismRequestHandler } = await import("../server.ts");

interface TestServer {
  server: Server;
  baseUrl: string;
}

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
}

async function startTestServer(
  db: ReturnType<typeof createTestDatabase>,
  cookieName: string,
): Promise<TestServer> {
  const server = createServer(
    createPrismRequestHandler({
      db,
      config: {
        ...getAppConfig(),
        apiPort: 0,
        sessionCookieName: cookieName,
        lanAccessEnabled: false,
        discoveryEnabled: false,
        openAiApiKey: "",
        anthropicApiKey: "",
        elevenLabsApiKey: "",
      },
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function createClient(baseUrl: string): Client {
  let cookie = "";
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function register(client: Client, email: string): Promise<string> {
  const response = await client.request(
    "/api/auth/register",
    jsonInit({ username: email, password: "portable-backup-password" }),
  );
  const payload = await json(response);
  assert.equal(response.status, 201, JSON.stringify(payload));
  return String(payload.user.id);
}

function insertImage(args: {
  db: ReturnType<typeof createTestDatabase>;
  userId: string;
  botId: string;
  imageId: string;
  bytes: Buffer;
  provider: string;
  origin: string;
  prompt: string;
}): string {
  const localRelPath = buildGeneratedImageRelativePath(args.userId, args.imageId);
  writeGeneratedImageBytes(localRelPath, args.bytes);
  args.db.prepare(
    `INSERT INTO images
       (id, user_id, conversation_id, bot_id, related_bot_ids, origin,
        prompt, revised_prompt, url, size, quality, provider, model,
        local_rel_path, purpose, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, '4x3', ?, ?, ?, ?, 'gallery', ?)`,
  ).run(
    args.imageId,
    args.userId,
    args.botId,
    JSON.stringify([args.botId]),
    args.origin,
    args.prompt,
    args.prompt,
    `/api/images/${args.imageId}/file`,
    args.provider === "upload" ? "upload" : "high",
    args.provider,
    args.provider === "upload" ? "upload" : "test-image-model",
    localRelPath,
    "2026-07-16T16:00:00.000Z",
  );
  return localRelPath;
}

function archiveFromExport(payload: Record<string, any>): Uint8Array {
  const projectOwnedAssets = payload.projectOwnedAssets as ProjectOwnedAssetExportPayloadV1;
  const files: Record<string, Uint8Array> = {
    "backup.json": strToU8(
      `${JSON.stringify({
        schema: "prism-account-backup-v1",
        exportedAt: new Date().toISOString(),
        snapshot: payload.snapshot,
        projectOwnedAssets: { manifestPath: PROJECT_OWNED_ASSET_MANIFEST_PATH },
      })}\n`,
    ),
    [PROJECT_OWNED_ASSET_MANIFEST_PATH]: strToU8(
      `${JSON.stringify(projectOwnedAssets.manifest)}\n`,
    ),
  };
  for (const [path, encoded] of Object.entries(projectOwnedAssets.files)) {
    files[path] = Buffer.from(encoded, "base64");
  }
  return zipSync(files, { level: 6 });
}

after(() => {
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("portable project-owned account backup assets", () => {
  it("restores active Signal files into a clean database and serves the original bytes", async () => {
    const studioBytes = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 4,
        background: { r: 21, g: 42, b: 84, alpha: 1 },
      },
    }).png().toBuffer();
    const logoBytes = await sharp({
      create: {
        width: 3,
        height: 3,
        channels: 4,
        background: { r: 201, g: 61, b: 118, alpha: 1 },
      },
    }).png().toBuffer();
    const oldBytes = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 12, g: 12, b: 12, alpha: 1 },
      },
    }).png().toBuffer();
    const introBytes = Buffer.from([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x06,
      0x54, 0x45, 0x53, 0x54, 0x21, 0x21,
    ]);

    const sourceDb = createTestDatabase();
    const sourceServer = await startTestServer(sourceDb, "prism_backup_source");
    let sourceClosed = false;
    let targetDb: ReturnType<typeof createTestDatabase> | null = null;
    let targetServer: TestServer | null = null;
    try {
      process.env.DB_PATH = sourceDbPath;
      const sourceClient = createClient(sourceServer.baseUrl);
      const sourceUserId = await register(sourceClient, "source-backup@example.com");
      const now = "2026-07-16T16:00:00.000Z";
      sourceDb.prepare(
        `INSERT INTO bots (id, user_id, name, system_prompt, created_at, updated_at)
         VALUES ('signal-host', ?, 'Signal Host', 'A precise radio host.', ?, ?)`,
      ).run(sourceUserId, now, now);

      const dayPath = insertImage({
        db: sourceDb,
        userId: sourceUserId,
        botId: "signal-host",
        imageId: "active-day-upload",
        bytes: studioBytes,
        provider: "upload",
        origin: "images_panel",
        prompt: "Uploaded current Light studio",
      });
      insertImage({
        db: sourceDb,
        userId: sourceUserId,
        botId: "signal-host",
        imageId: "active-night-generated",
        bytes: studioBytes,
        provider: "openai",
        origin: "botcast",
        prompt: "Generated current Dark studio",
      });
      insertImage({
        db: sourceDb,
        userId: sourceUserId,
        botId: "signal-host",
        imageId: "active-logo-upload",
        bytes: logoBytes,
        provider: "upload",
        origin: "botcast",
        prompt: "Uploaded current Signal logo",
      });
      insertImage({
        db: sourceDb,
        userId: sourceUserId,
        botId: "signal-host",
        imageId: "replaced-generation",
        bytes: oldBytes,
        provider: "openai",
        origin: "botcast",
        prompt: "Replaced Signal generation",
      });
      insertImage({
        db: sourceDb,
        userId: sourceUserId,
        botId: "signal-host",
        imageId: "gallery-only",
        bytes: oldBytes,
        provider: "openai",
        origin: "images_panel",
        prompt: "Unrelated gallery image",
      });

      const atmosphereJson = JSON.stringify({
        seed: "night-seed",
        prompt: "Dark studio",
        imageId: "active-night-generated",
        imageUrl: "/api/images/active-night-generated/file",
        revision: 2,
        status: "ready",
        studioIdentity: "A cool instrument panel.",
        dayAtmosphere: {
          seed: "day-seed",
          prompt: "Light studio",
          imageId: "active-day-upload",
          imageUrl: "/api/images/active-day-upload/file",
          revision: 2,
          status: "ready",
        },
        nightAtmosphere: {
          seed: "night-seed",
          prompt: "Dark studio",
          imageId: "active-night-generated",
          imageUrl: "/api/images/active-night-generated/file",
          revision: 2,
          status: "ready",
        },
        logo: {
          seed: "logo-seed",
          prompt: "Signal logo",
          imageId: "active-logo-upload",
          imageUrl: "/api/images/active-logo-upload/file",
          revision: 2,
          status: "ready",
          fallbackGlyph: "signal",
        },
      });
      sourceDb.prepare(
        `INSERT INTO botcast_shows
          (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
           atmosphere_json, created_at, updated_at)
         VALUES ('signal-show', ?, 'signal-host', 'Portable Signal', 'Backups',
                 'Measured', '#8844ff', ?, ?, ?)`,
      ).run(sourceUserId, atmosphereJson, now, now);
      sourceDb.prepare(
        `INSERT INTO botcast_show_intro_audio
          (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
           duration_ms, revision, created_at, updated_at)
         VALUES ('signal-show', ?, 'elevenlabs', 'music_v2', 'Portable ident',
                 'audio/mpeg', ?, 6000, 3, ?, ?)`,
      ).run(sourceUserId, introBytes, now, now);

      const exportedResponse = await sourceClient.request("/api/backup/export");
      const exported = await json(exportedResponse);
      assert.equal(exportedResponse.status, 200, JSON.stringify(exported));
      const projectAssets = exported.projectOwnedAssets as ProjectOwnedAssetExportPayloadV1;
      assert.equal(projectAssets.manifest.entries.length, 4);
      assert.equal(Object.keys(projectAssets.files).length, 3, "identical studio bytes deduplicate");
      assert.deepEqual(
        projectAssets.manifest.entries
          .filter((entry) => entry.mediaType === "image")
          .map((entry) => entry.restore.schema === "prism-signal-image-restore-v1"
            ? entry.restore.sourceImageId
            : "")
          .sort(),
        ["active-day-upload", "active-logo-upload", "active-night-generated"],
      );
      assert.equal(
        "audioBase64" in exported.snapshot.botcast.shows[0].introAudio,
        false,
      );
      const archive = archiveFromExport(exported);

      tryUnlinkGeneratedImageFile(dayPath);
      const incompleteResponse = await sourceClient.request("/api/backup/export");
      const incomplete = await json(incompleteResponse);
      assert.equal(incompleteResponse.status, 400);
      assert.match(String(incomplete.error), /Light studio[\s\S]*local file is missing/iu);

      await new Promise<void>((resolve) => sourceServer.server.close(() => resolve()));
      sourceClosed = true;
      sourceDb.close();

      process.env.DB_PATH = targetDbPath;
      targetDb = createTestDatabase();
      targetServer = await startTestServer(targetDb, "prism_backup_target");
      const targetClient = createClient(targetServer.baseUrl);
      await register(targetClient, "target-backup@example.com");
      assert.equal(
        (targetDb.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number }).count,
        0,
      );

      const importedResponse = await targetClient.request("/api/backup/import", {
        method: "POST",
        headers: { "content-type": "application/vnd.prism.backup+zip" },
        body: archive,
      });
      const imported = await json(importedResponse);
      assert.equal(importedResponse.status, 200, JSON.stringify(imported));
      assert.equal(
        (targetDb.prepare("SELECT COUNT(*) AS count FROM images").get() as { count: number }).count,
        3,
      );
      assert.equal(
        targetDb.prepare("SELECT id FROM images WHERE id IN ('replaced-generation', 'gallery-only')").get(),
        undefined,
      );

      const showsResponse = await targetClient.request("/api/botcast/shows");
      const shows = await json(showsResponse);
      assert.equal(showsResponse.status, 200, JSON.stringify(shows));
      const restoredShow = shows.shows[0];
      const restoredIds = {
        day: String(restoredShow.dayAtmosphere.imageId),
        night: String(restoredShow.nightAtmosphere.imageId),
        logo: String(restoredShow.logo.imageId),
      };
      assert.notEqual(restoredIds.day, "active-day-upload");
      assert.notEqual(restoredIds.night, "active-night-generated");
      assert.notEqual(restoredIds.logo, "active-logo-upload");
      assert.equal(new Set(Object.values(restoredIds)).size, 3);

      for (const [slot, imageId] of Object.entries(restoredIds)) {
        const response = await targetClient.request(
          `/api/images/${encodeURIComponent(imageId)}/file`,
        );
        assert.equal(response.status, 200, `${slot} endpoint should exist`);
        assert.equal(response.headers.get("content-type"), "image/png");
        const expected = slot === "logo" ? logoBytes : studioBytes;
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      }
      const introResponse = await targetClient.request(
        "/api/botcast/shows/signal-show/intro-audio",
      );
      assert.equal(introResponse.status, 200);
      assert.equal(introResponse.headers.get("content-type"), "audio/mpeg");
      assert.deepEqual(Buffer.from(await introResponse.arrayBuffer()), introBytes);
    } finally {
      if (!sourceClosed) {
        await new Promise<void>((resolve) => sourceServer.server.close(() => resolve()));
        sourceDb.close();
      }
      if (targetServer) {
        await new Promise<void>((resolve) => targetServer!.server.close(() => resolve()));
      }
      targetDb?.close();
    }
  });
});

