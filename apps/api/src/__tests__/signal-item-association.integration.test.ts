import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { getAppConfig } from "@localai/config";
import {
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";
import { queueBotcastEpisodeImageContext } from "../botcast.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-signal-item-association-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "signal-item-association-test-key";

const transparentPng = await sharp({
  create: {
    width: 4,
    height: 4,
    channels: 4,
    background: { r: 220, g: 80, b: 140, alpha: 0 },
  },
})
  .png()
  .toBuffer();
const opaquePng = await sharp({
  create: {
    width: 4,
    height: 4,
    channels: 4,
    background: { r: 220, g: 80, b: 140, alpha: 1 },
  },
})
  .png()
  .toBuffer();
const jpeg = await sharp({
  create: {
    width: 4,
    height: 4,
    channels: 3,
    background: { r: 220, g: 80, b: 140 },
  },
})
  .jpeg()
  .toBuffer();

const db = createTestDatabase();
const config = {
  ...getAppConfig(),
  apiPort: 0,
  sessionCookieName: "prism_signal_item_association_session",
  lanAccessEnabled: false,
  discoveryEnabled: false,
  openAiApiKey: "",
};
const { createPrismRequestHandler } = await import("../server.ts");
const server = createServer(
  createPrismRequestHandler({
    db,
    config,
    fetchImpl: createFetchRecorder(),
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve());
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
}

function createClient(): Client {
  let cookie = "";
  return {
    async request(path, init = {}) {
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

function dataUrl(bytes: Buffer, mimeType: "image/png" | "image/jpeg"): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function createBotGuestEpisode(userId: string, prefix: string): {
  episodeId: string;
  guestBotId: string;
} {
  const now = "2026-08-23T00:00:00.000Z";
  const hostBotId = `${prefix}-host`;
  const guestBotId = `${prefix}-guest`;
  const showId = `${prefix}-show`;
  const episodeId = `${prefix}-episode`;
  const insertBot = db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertBot.run(hostBotId, userId, "Plankton", "You host Signal.", now, now);
  insertBot.run(
    guestBotId,
    userId,
    "Georgia O'Keeffe",
    "You are a Signal guest.",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO botcast_shows
       (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    showId,
    userId,
    hostBotId,
    "Signal Gardens",
    "Conversations with artists.",
    "curious",
    "#00aa88",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO botcast_episodes
       (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind, guest_name,
        guest_context, title, topic, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'bot', ?, '', ?, ?, ?, ?, ?)`,
  ).run(
    episodeId,
    userId,
    showId,
    hostBotId,
    guestBotId,
    "Georgia O'Keeffe",
    "Flowers with Georgia",
    "Flowers",
    now,
    now,
    now,
  );
  return { episodeId, guestBotId };
}

async function register(client: Client, username: string): Promise<string> {
  const response = await client.request(
    "/api/auth/register",
    jsonInit({ username, password: "signal-item-association-password" }),
  );
  const payload = (await response.json()) as { user: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(payload));
  return payload.user.id;
}

function imageCount(userId: string): number {
  return Number(
    (
      db
        .prepare("SELECT COUNT(*) AS count FROM images WHERE user_id = ?")
        .get(userId) as { count: number | bigint }
    ).count,
  );
}

after(() => {
  server.close();
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Signal kept item persona associations", () => {
  it("associates an explicitly kept transparent item with only its authenticated bot guest", async () => {
    const client = createClient();
    const userId = await register(client, "signal-item-owner@example.com");
    const { episodeId, guestBotId } = createBotGuestEpisode(userId, "owner");
    queueBotcastEpisodeImageContext(db, userId, episodeId, {
      imageId: "owner-ephemeral-item",
      kind: "item",
      name: "flower",
      mimeType: "image/png",
      provider: "openai",
      model: "gpt-image-1",
      replayEmoji: "🌸",
    });

    const response = await client.request(
      "/api/assets/upload",
      jsonInit({
        kind: "item",
        title: "flower",
        dataUrl: dataUrl(transparentPng, "image/png"),
        signalEpisodeId: episodeId,
      }),
    );
    const payload = (await response.json()) as { imageId: string };
    assert.equal(response.status, 201, JSON.stringify(payload));

    const stored = db
      .prepare(
        "SELECT bot_id, related_bot_ids FROM images WHERE id = ? AND user_id = ?",
      )
      .get(payload.imageId, userId) as {
      bot_id: string | null;
      related_bot_ids: string;
    };
    assert.equal(stored.bot_id, null);
    assert.deepEqual(JSON.parse(stored.related_bot_ids), [guestBotId]);
    const associations = db
      .prepare(
        `SELECT bot_id, relation
           FROM image_bot_associations
          WHERE user_id = ? AND image_id = ?`,
      )
      .all(userId, payload.imageId) as Array<{ bot_id: string; relation: string }>;
    assert.deepEqual(
      associations.map((association) => ({ ...association })),
      [{ bot_id: guestBotId, relation: "participant" }],
    );
  });

  it("rejects missing, cross-tenant, opaque, and JPEG Signal saves before persistence", async () => {
    const owner = createClient();
    const outsider = createClient();
    const ownerId = await register(owner, "signal-item-guard-owner@example.com");
    const outsiderId = await register(
      outsider,
      "signal-item-guard-outsider@example.com",
    );
    const ownerEpisode = createBotGuestEpisode(ownerId, "guard-owner");
    const outsiderEpisode = createBotGuestEpisode(outsiderId, "guard-outsider");
    const before = imageCount(ownerId);
    const attempts = [
      {
        signalEpisodeId: "missing-episode",
        dataUrl: dataUrl(transparentPng, "image/png"),
      },
      {
        signalEpisodeId: outsiderEpisode.episodeId,
        dataUrl: dataUrl(transparentPng, "image/png"),
      },
      {
        signalEpisodeId: ownerEpisode.episodeId,
        dataUrl: dataUrl(opaquePng, "image/png"),
      },
      {
        signalEpisodeId: ownerEpisode.episodeId,
        dataUrl: dataUrl(jpeg, "image/jpeg"),
      },
    ];
    for (const attempt of attempts) {
      const response = await owner.request(
        "/api/assets/upload",
        jsonInit({ kind: "item", title: "flower", ...attempt }),
      );
      assert.equal(response.status, 400, await response.text());
      assert.equal(imageCount(ownerId), before);
    }
  });

  it("keeps generic item uploads unassociated", async () => {
    const client = createClient();
    const userId = await register(client, "signal-item-generic@example.com");
    const response = await client.request(
      "/api/assets/upload",
      jsonInit({
        kind: "item",
        title: "ordinary item",
        dataUrl: dataUrl(opaquePng, "image/png"),
      }),
    );
    const payload = (await response.json()) as { imageId: string };
    assert.equal(response.status, 201, JSON.stringify(payload));
    const stored = db
      .prepare(
        "SELECT bot_id, related_bot_ids FROM images WHERE id = ? AND user_id = ?",
      )
      .get(payload.imageId, userId) as {
      bot_id: string | null;
      related_bot_ids: string;
    };
    assert.equal(stored.bot_id, null);
    assert.equal(stored.related_bot_ids, "[]");
    const associations = db
      .prepare(
        "SELECT COUNT(*) AS count FROM image_bot_associations WHERE user_id = ? AND image_id = ?",
      )
      .get(userId, payload.imageId) as { count: number | bigint };
    assert.equal(Number(associations.count), 0);
  });
});
