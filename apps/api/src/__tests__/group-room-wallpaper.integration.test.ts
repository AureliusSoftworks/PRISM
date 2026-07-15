import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { getAppConfig } from "@localai/config";
import { GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE } from "@localai/shared";
import { createFetchRecorder, createTestDatabase } from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-group-room-wallpaper-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "group-room-wallpaper-test-key";

const imageBytes = await sharp({
  create: {
    width: 4,
    height: 3,
    channels: 4,
    background: { r: 22, g: 34, b: 48, alpha: 1 },
  },
})
  .png()
  .toBuffer();
const fetchRecorder = createFetchRecorder(
  new Response(
    JSON.stringify({
      data: [
        {
          b64_json: imageBytes.toString("base64"),
          revised_prompt: "Provider revised group-room prompt",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
);
const db = createTestDatabase();
const config = {
  ...getAppConfig(),
  apiPort: 0,
  sessionCookieName: "prism_group_room_wallpaper_session",
  lanAccessEnabled: false,
  discoveryEnabled: false,
  openAiApiKey: "integration-image-key",
};
const { createPrismRequestHandler } = await import("../server.ts");
const server = createServer(
  createPrismRequestHandler({ db, config, fetchImpl: fetchRecorder })
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

function insertBot(
  userId: string,
  id: string,
  name: string,
  systemPrompt: string,
  color: string
): void {
  const now = "2026-07-15T00:00:00.000Z";
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, name, systemPrompt, color, now, now);
}

after(() => {
  server.close();
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("group-room wallpaper image generation route", () => {
  it("composes trusted account context, persists the special purpose, and returns image metadata", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "group-wallpaper@example.com", password: "group-wallpaper-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    db.prepare(
      `UPDATE users
          SET preferred_provider = 'openai',
              preferred_openai_image_model = 'gpt-image-1',
              preferred_zen_wallpaper_openai_image_model = 'gpt-image-1-mini',
              zen_wallpaper_style_notes = ?
        WHERE id = ?`
    ).run("Painterly fog, soft grain, and restrained neon.", userId);
    insertBot(userId, "wall-bot-a", "Ada", "A patient systems thinker who loves observatories.", "#abcdef");
    insertBot(userId, "wall-bot-b", "Bram", "A playful urban gardener and careful listener.", "#123456");

    const callStart = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/images/generate",
      jsonInit({
        purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
        groupName: "Night Shift",
        groupDescription: "Friends who think best after midnight.",
        memberBotIds: ["wall-bot-a", "wall-bot-b"],
        memberNames: ["Untrusted Fake Name"],
        preferredProvider: "openai",
        size: "1024x1024",
      })
    );
    const payload = await json(response);
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(typeof payload.image.id, "string");
    assert.match(payload.image.displayUrl, /^\/api\/images\//u);
    assert.equal(payload.image.hasLocalFile, true);
    assert.equal(payload.image.purpose, GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE);
    assert.match(payload.composedPrompt, /widescreen 16:9/u);
    assert.match(payload.composedPrompt, /Group: Night Shift/u);
    assert.match(payload.composedPrompt, /Ada; accent #abcdef/u);
    assert.match(payload.composedPrompt, /Bram; accent #123456/u);
    assert.match(payload.composedPrompt, /Painterly fog, soft grain/u);
    assert.doesNotMatch(payload.composedPrompt, /Untrusted Fake Name/u);

    const providerCalls = fetchRecorder.calls.slice(callStart);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0]!.input, "https://api.openai.com/v1/images/generations");
    const providerBody = JSON.parse(String(providerCalls[0]!.init?.body)) as {
      model: string;
      prompt: string;
      size: string;
    };
    assert.equal(providerBody.model, "gpt-image-1-mini");
    assert.equal(providerBody.prompt, payload.composedPrompt);
    assert.equal(providerBody.size, "1536x1024");

    const stored = db
      .prepare(
        `SELECT conversation_id, bot_id, prompt, purpose, size
           FROM images
          WHERE id = ? AND user_id = ?`
      )
      .get(payload.image.id, userId) as {
      conversation_id: string | null;
      bot_id: string | null;
      prompt: string;
      purpose: string;
      size: string;
    };
    assert.equal(stored.conversation_id, null);
    assert.equal(stored.bot_id, null);
    assert.equal(stored.prompt, payload.composedPrompt);
    assert.equal(stored.purpose, GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE);
    assert.equal(stored.size, "1536x1024");

    const gallery = await client.request("/api/images");
    assert.equal(gallery.status, 200);
    assert.equal(
      (await json(gallery)).images.some((image: { id?: unknown }) => image.id === payload.image.id),
      true
    );

    const restoreCallStart = fetchRecorder.calls.length;
    const restoredResponse = await client.request(
      "/api/images/group-room-wallpaper/upload",
      jsonInit({
        dataUrl: `data:image/png;base64,${imageBytes.toString("base64")}`,
        prompt: "Restored Night Shift room",
      })
    );
    const restoredPayload = await json(restoredResponse);
    assert.equal(restoredResponse.status, 201, JSON.stringify(restoredPayload));
    assert.equal(restoredPayload.image.purpose, GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE);
    assert.equal(restoredPayload.image.provider, "local");
    assert.equal(restoredPayload.image.hasLocalFile, true);
    assert.equal(fetchRecorder.calls.length, restoreCallStart);
    const restoredRow = db
      .prepare("SELECT purpose, prompt FROM images WHERE id = ? AND user_id = ?")
      .get(restoredPayload.image.id, userId) as
      | { purpose: string; prompt: string }
      | undefined;
    assert.equal(restoredRow?.purpose, GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE);
    assert.equal(restoredRow?.prompt, "Restored Night Shift room");

    const wallpaperDelete = await client.request(
      `/api/images/${encodeURIComponent(String(payload.image.id))}`,
      { method: "DELETE" }
    );
    assert.equal(wallpaperDelete.status, 200);
    assert.equal((await json(wallpaperDelete)).ok, true);
    assert.equal(
      db.prepare("SELECT 1 FROM images WHERE id = ? AND user_id = ?").get(
        payload.image.id,
        userId
      ),
      undefined
    );
  });

  it("rejects bot or conversation attribution and cross-account member IDs before generation", async () => {
    const owner = createClient();
    const ownerRegister = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "group-owner@example.com", password: "group-owner-password" })
    );
    const ownerId = String((await json(ownerRegister)).user.id);
    const other = createClient();
    const otherRegister = await other.request(
      "/api/auth/register",
      jsonInit({ username: "group-other@example.com", password: "group-other-password" })
    );
    const otherId = String((await json(otherRegister)).user.id);
    insertBot(ownerId, "owner-bot-a", "Owner A", "Owned persona A", "#112233");
    insertBot(ownerId, "owner-bot-b", "Owner B", "Owned persona B", "#445566");
    insertBot(otherId, "other-bot", "Other", "Other account persona", "#778899");
    const callStart = fetchRecorder.calls.length;

    const attributed = await owner.request(
      "/api/images/generate",
      jsonInit({
        purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
        prompt: "A room",
        groupName: "Owners",
        memberBotIds: ["owner-bot-a", "owner-bot-b"],
        botId: "owner-bot-a",
      })
    );
    assert.equal(attributed.status, 400);
    assert.match((await json(attributed)).error, /cannot be attributed/u);

    const conversationAttributed = await owner.request(
      "/api/images/generate",
      jsonInit({
        purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
        prompt: "A room",
        groupName: "Owners",
        memberBotIds: ["owner-bot-a", "owner-bot-b"],
        conversationId: "not-a-group-room-conversation",
      })
    );
    assert.equal(conversationAttributed.status, 400);
    assert.match((await json(conversationAttributed)).error, /cannot be attributed/u);

    const crossAccount = await owner.request(
      "/api/images/generate",
      jsonInit({
        purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
        prompt: "A room",
        groupName: "Mixed",
        memberBotIds: ["owner-bot-a", "other-bot"],
      })
    );
    assert.equal(crossAccount.status, 400);
    assert.match((await json(crossAccount)).error, /owned bot/u);
    assert.equal(fetchRecorder.calls.length, callStart);
  });

  it("keeps offline-only member privacy authoritative over an OpenAI body override", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "group-local@example.com", password: "group-local-password" })
    );
    const userId = String((await json(register)).user.id);
    db.prepare(
      "UPDATE users SET preferred_provider = 'local', preferred_image_provider = 'local' WHERE id = ?"
    ).run(userId);
    insertBot(userId, "local-bot-a", "Local A", "Local persona A", "#223344");
    insertBot(userId, "local-bot-b", "Local B", "Local persona B", "#556677");
    db.prepare(
      "UPDATE bots SET online_enabled = 0 WHERE user_id = ? AND id IN (?, ?)"
    ).run(userId, "local-bot-a", "local-bot-b");
    const callStart = fetchRecorder.calls.length;

    const response = await client.request(
      "/api/images/generate",
      jsonInit({
        purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
        prompt: "A private local room",
        groupName: "Local Friends",
        memberBotIds: ["local-bot-a", "local-bot-b"],
        preferredProvider: "openai",
        model: "disabled",
      })
    );
    assert.equal(response.status, 400);
    assert.match((await json(response)).error, /Local image generation is disabled/u);
    assert.equal(fetchRecorder.calls.length, callStart);
  });
});
