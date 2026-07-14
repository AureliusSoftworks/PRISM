import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
} from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-avatar-details-api-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "avatar-details-test-master-key";
const originalFetch = globalThis.fetch;
globalThis.fetch = createFetchRecorder(
  new Response(
    JSON.stringify({
      message: {
        content: JSON.stringify({
          version: 1,
          canonAnchors: [],
          domains: ["avatar testing"],
          values: [],
          tensions: [],
          namingTokens: [],
          starterSeeds: [],
        }),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
);

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const deterministicProvider = createDeterministicProvider();
const handler = createPrismRequestHandler({
  db,
  config: {
    ...getAppConfig(),
    apiPort: 0,
    sessionCookieName: "prism_avatar_details_test_session",
    lanAccessEnabled: false,
    discoveryEnabled: false,
  },
  providerFactory: () => deterministicProvider,
  auxiliaryProviderFactory: () => deterministicProvider,
});

interface DirectResponse {
  status: number;
  headers: Map<string, string>;
  payload: Record<string, any>;
}

async function request(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
    cookie?: string;
  } = {}
): Promise<DirectResponse> {
  const rawBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const req = Readable.from(rawBody ? [Buffer.from(rawBody)] : []) as IncomingMessage;
  req.method = options.method ?? "GET";
  req.url = path;
  req.headers = {
    host: "localhost",
    ...(rawBody ? { "content-type": "application/json" } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
  };

  const headers = new Map<string, string>();
  let responseBody = "";
  const res = {
    statusCode: 200,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) responseBody += chunk.toString();
      this.writableEnded = true;
      return this;
    },
  } as unknown as ServerResponse<IncomingMessage>;

  await handler(req, res);
  return {
    status: res.statusCode,
    headers,
    payload: JSON.parse(responseBody) as Record<string, any>,
  };
}

after(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  db.close();
  globalThis.fetch = originalFetch;
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("bot avatar details API persistence", () => {
  it("creates, lists, validates, and clears structured avatarDetails", async () => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: {
        username: "avatar-details-direct@example.com",
        password: "avatar-details-password",
      },
    });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const created = await request("/api/bots", {
      method: "POST",
      cookie,
      body: {
        name: "Detailed bot",
        avatarDetails: {
          version: 1,
          screen: {
            stamps: [
              { id: "circuit-mark", offsetX: 2, offsetY: -3, scalePct: 95 },
              { id: "monocle", offsetX: 0, offsetY: 0, scalePct: 100 },
            ],
            paintMaskBase64: null,
            hideInkDuringBlink: true,
          },
        },
      },
    });
    assert.equal(created.status, 201);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const botId = String(created.payload.bot.id);
    assert.deepEqual(
      created.payload.bot.avatarDetails.screen.stamps.map(
        (row: { id: string }) => row.id
      ),
      ["monocle", "circuit-mark"]
    );
    assert.equal(
      created.payload.bot.avatarDetails.screen.hideInkDuringBlink,
      true
    );
    assert.equal("avatar_details_json" in created.payload.bot, false);
    assert.equal(
      (
        db.prepare("SELECT avatar_details_json FROM bots WHERE id = ?").get(botId) as {
          avatar_details_json: string;
        }
      ).avatar_details_json,
      JSON.stringify(created.payload.bot.avatarDetails)
    );

    const listed = await request("/api/bots", { cookie });
    assert.equal(listed.status, 200);
    const listedBot = listed.payload.bots.find(
      (bot: Record<string, unknown>) => bot.id === botId
    );
    assert.deepEqual(listedBot.avatarDetails, created.payload.bot.avatarDetails);
    assert.equal("avatar_details_json" in listedBot, false);

    const beforeRawCreateCount = (
      db.prepare("SELECT COUNT(*) AS count FROM bots").get() as { count: number }
    ).count;
    const rawCreateRejected = await request("/api/bots", {
      method: "POST",
      cookie,
      body: {
        name: "Raw raster bot",
        portraitImageUrl: "https://example.invalid/avatar.png",
      },
    });
    assert.equal(rawCreateRejected.status, 400);
    assert.match(rawCreateRejected.payload.error, /unsupported raw avatar field/i);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM bots").get() as { count: number })
        .count,
      beforeRawCreateCount
    );

    const rawPatchRejected = await request(
      `/api/bots/${encodeURIComponent(botId)}`,
      {
        method: "PATCH",
        cookie,
        body: {
          name: "Must remain unchanged",
          avatarPng: "data:image/png;base64,AAAA",
        },
      }
    );
    assert.equal(rawPatchRejected.status, 400);
    assert.equal(
      (db.prepare("SELECT name FROM bots WHERE id = ?").get(botId) as { name: string })
        .name,
      "Detailed bot"
    );

    const outsideMaskBytes = Buffer.alloc(2_048);
    outsideMaskBytes[0] = 0x80;
    const outsideMaskRejected = await request(
      `/api/bots/${encodeURIComponent(botId)}`,
      {
        method: "PATCH",
        cookie,
        body: {
          avatarDetails: {
            version: 1,
            screen: {
              stamps: [],
              paintMaskBase64: outsideMaskBytes.toString("base64"),
            },
          },
        },
      }
    );
    assert.equal(outsideMaskRejected.status, 400);
    assert.match(outsideMaskRejected.payload.error, /outside the writable face screen/i);

    const defaultBotRejected = await request("/api/default-bot", {
      method: "PATCH",
      cookie,
      body: { avatarDetails: null },
    });
    assert.equal(defaultBotRejected.status, 400);
    assert.match(defaultBotRejected.payload.error, /only available for custom bots/i);

    const invalid = await request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      cookie,
      body: {
        avatarDetails: {
          version: 1,
          screen: {
            stamps: [
              {
                id: "monocle",
                offsetX: 0,
                offsetY: 0,
                scalePct: 100,
                rotation: 5,
              },
            ],
            paintMaskBase64: null,
          },
        },
      },
    });
    assert.equal(invalid.status, 400);
    assert.match(invalid.payload.error, /exactly id, offsetX, offsetY, and scalePct/i);

    const cleared = await request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      cookie,
      body: { avatarDetails: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.payload.bot.avatarDetails, null);
    assert.equal(
      (
        db.prepare("SELECT avatar_details_json FROM bots WHERE id = ?").get(botId) as {
          avatar_details_json: string | null;
        }
      ).avatar_details_json,
      null
    );
  });
});
