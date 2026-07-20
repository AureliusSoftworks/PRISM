import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";
import {
  releaseImageSlotIfOwned,
  tryAcquireImageSlot,
} from "../image-job-slot.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-cleanup-lifecycle-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "localai.db");
process.env.ENCRYPTION_MASTER_KEY = "cleanup-lifecycle-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const {
  quarantineGeneratedImageFiles,
  resolveAbsoluteUnderDataRoot,
  writeGeneratedImageBytes,
} = await import("../image-storage.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_cleanup_lifecycle_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}) {
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

function jsonInit(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function register(
  client: ReturnType<typeof createClient>,
  username: string,
): Promise<string> {
  const response = await client.request(
    "/api/auth/register",
    jsonInit({ username, password: "cleanup-lifecycle-password" }),
  );
  assert.equal(response.status, 201);
  const payload = (await response.json()) as { user: { id: string } };
  return payload.user.id;
}

function createRecoveryBatch(userId: string, suffix: string): string {
  const imagePath = `generated-images/${userId}/image-${suffix}.png`;
  writeGeneratedImageBytes(imagePath, Buffer.from(`private-${suffix}`));
  return quarantineGeneratedImageFiles(
    userId,
    [imagePath],
    `recovery-${suffix}`,
    JSON.stringify({
      quarantinedAt: "2026-07-19T00:00:00.000Z",
      images: [{ id: `image-${suffix}`, prompt: `private prompt ${suffix}` }],
    }),
  ).recoveryRelativePath;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Asset Cleanup account lifecycle", () => {
  it("purges only the authenticated owner's recovery batches on reset and deletion", async () => {
    const owner = createClient();
    const stranger = createClient();
    const ownerId = await register(owner, "cleanup-owner@example.com");
    const strangerId = await register(stranger, "cleanup-stranger@example.com");
    const ownerResetBatch = createRecoveryBatch(ownerId, "owner-reset");
    const strangerBatch = createRecoveryBatch(strangerId, "stranger");

    const reset = await owner.request("/api/account/factory-reset", {
      method: "POST",
    });
    assert.equal(reset.status, 200);
    assert.equal(
      existsSync(resolveAbsoluteUnderDataRoot(ownerResetBatch)),
      false,
    );
    assert.equal(
      existsSync(resolveAbsoluteUnderDataRoot(strangerBatch)),
      true,
    );

    const ownerDeleteBatch = createRecoveryBatch(ownerId, "owner-delete");
    const deleted = await owner.request("/api/account", { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.equal(
      existsSync(resolveAbsoluteUnderDataRoot(ownerDeleteBatch)),
      false,
    );
    assert.equal(
      existsSync(resolveAbsoluteUnderDataRoot(strangerBatch)),
      true,
    );

    const strangerDeleted = await stranger.request("/api/account", {
      method: "DELETE",
    });
    assert.equal(strangerDeleted.status, 200);
    assert.equal(
      existsSync(resolveAbsoluteUnderDataRoot(strangerBatch)),
      false,
    );
  });

  it("blocks preview and cleanup while an image attachment job is active", async () => {
    const client = createClient();
    const userId = await register(client, "cleanup-active-job@example.com");
    const imageId = "active-job-candidate";
    const localRelPath = `generated-images/${userId}/${imageId}.png`;
    writeGeneratedImageBytes(localRelPath, Buffer.from("png"));
    db.prepare(
      `INSERT INTO images
         (id, user_id, related_bot_ids, origin, prompt, url, size, quality,
          provider, model, local_rel_path, purpose, created_at)
       VALUES (?, ?, '[]', 'images_panel', 'unused', '', '1024x1024',
               'standard', 'openai', 'image-model', ?, 'gallery', ?)`,
    ).run(imageId, userId, localRelPath, "2020-01-01T00:00:00.000Z");
    const acquired = await tryAcquireImageSlot({
      userId,
      conversationId: null,
      botId: null,
      mode: "chat",
      incognito: false,
      captionPrompt: "active",
      userMessage: "active",
      source: "images_panel",
    });
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;
    try {
      assert.equal(
        (await client.request("/api/images/cleanup-preview")).status,
        409,
      );
      assert.equal(
        (
          await client.request(
            "/api/images/cleanup",
            jsonInit({ snapshot: "00000000000000000000", imageIds: [imageId] }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) AS count FROM images WHERE id = ?").get(
            imageId,
          ) as { count: number }
        ).count,
        1,
      );
    } finally {
      await releaseImageSlotIfOwned(userId, acquired.job.id);
    }

    const previewResponse = await client.request("/api/images/cleanup-preview");
    assert.equal(previewResponse.status, 200);
    const previewPayload = (await previewResponse.json()) as {
      preview: { snapshot: string; candidates: Array<{ id: string }> };
    };
    assert.equal(previewPayload.preview.candidates[0]?.id, imageId);
    const cleanup = await client.request(
      "/api/images/cleanup",
      jsonInit({
        snapshot: previewPayload.preview.snapshot,
        imageIds: [imageId],
      }),
    );
    assert.equal(cleanup.status, 200);
    assert.equal(
      (
        db.prepare("SELECT COUNT(*) AS count FROM images WHERE id = ?").get(
          imageId,
        ) as { count: number }
      ).count,
      0,
    );
  });
});
