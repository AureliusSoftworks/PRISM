import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";
import type { AppConfig } from "@localai/config";
import sharp from "sharp";
import { writeGeneratedImageBytes } from "../image-storage.ts";
import {
  closeTestDatabase,
  createDeterministicProvider,
  createTestDatabase,
  withTestRegistrationBody,
} from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-owner-boundary-api-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "owner-boundary-api-test-master";

const { createPrismRequestHandler } = await import("../server.ts");

const config: AppConfig = {
  apiPort: 0,
  serverName: "Owner boundary API test",
  sessionCookieName: "prism_owner_boundary_session",
  sessionTtlHours: 24,
  encryptionMasterKey: "owner-boundary-api-test-master",
  ollamaHost: "http://127.0.0.1:9",
  ollamaModel: "llama3.2",
  openAiApiKey: "",
  qdrantUrl: "http://127.0.0.1:9",
};

after(() => {
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

interface CapturedResponse {
  status: number;
  headers: ReadonlyMap<string, string | number | readonly string[]>;
  body: string;
  bytes: Buffer;
}

async function requestDirectly(args: {
  handler: ReturnType<typeof createPrismRequestHandler>;
  method: string;
  path: string;
  headers?: IncomingHttpHeaders;
  body?: Record<string, unknown>;
}): Promise<CapturedResponse> {
  const serialized = args.body ? JSON.stringify(args.body) : "";
  const request = Readable.from(serialized ? [Buffer.from(serialized)] : []) as IncomingMessage;
  Object.assign(request, {
    method: args.method,
    url: args.path,
    headers: {
      host: "localhost",
      ...(serialized
        ? {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(serialized)),
          }
        : {}),
      ...args.headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
  });

  const capturedHeaders = new Map<string, string | number | readonly string[]>();
  const responseChunks: Buffer[] = [];
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      capturedHeaders.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return capturedHeaders.get(name.toLowerCase());
    },
    flushHeaders() {},
    write(value: string | Uint8Array) {
      responseChunks.push(Buffer.from(value));
      return true;
    },
    end(value?: string | Uint8Array) {
      if (value) {
        responseChunks.push(Buffer.from(value));
      }
      this.writableEnded = true;
      return this;
    },
  }) as unknown as ServerResponse<IncomingMessage>;

  await args.handler(request, response);
  const bytes = Buffer.concat(responseChunks);
  return {
    status: response.statusCode,
    headers: capturedHeaders,
    body: bytes.toString("utf8"),
    bytes,
  };
}

function responseJson(response: CapturedResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

describe("owner-bound API bot boundary", () => {
  it("makes public-row listing, get, clone, Chat, and Zen guesses indistinguishable from missing ids", async () => {
    const db = createTestDatabase();
    const provider = createDeterministicProvider();
    const handler = createPrismRequestHandler({
      db,
      config,
      providerFactory: () => provider,
      auxiliaryProviderFactory: () => provider,
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    try {
      const register = async (username: string) => {
        const response = await requestDirectly({
          handler,
          method: "POST",
          path: "/api/auth/register",
          body: withTestRegistrationBody("/api/auth/register", {
            username,
            password: "owner-boundary-password",
          }),
        });
        assert.equal(response.status, 201, response.body);
        const cookie = response.headers.get("set-cookie");
        assert.equal(typeof cookie, "string");
        return {
          cookie: String(cookie).split(";")[0]!,
          userId: String(
            (responseJson(response).user as { id?: unknown } | undefined)?.id,
          ),
        };
      };
      const owner = await register("owner-boundary-a@example.com");
      const intruder = await register("owner-boundary-b@example.com");
      db.prepare(
        `INSERT INTO bots
           (id, user_id, name, system_prompt, visibility, created_at, updated_at)
         VALUES ('legacy-public-owner-row', ?, 'Legacy Public', 'private owner prompt',
                 'public', '2026-09-01T20:00:00.000Z', '2026-09-01T20:00:00.000Z')`,
      ).run(owner.userId);
      db.prepare(
        `INSERT INTO bots
           (id, user_id, name, system_prompt, visibility, created_at, updated_at)
         VALUES ('intruder-owned-bot', ?, 'Owned Bot', 'owned prompt',
                 'private', '2026-09-01T20:00:00.000Z', '2026-09-01T20:00:00.000Z')`,
      ).run(intruder.userId);

      const auth = (cookie: string) => ({ cookie });
      const ownerGet = await requestDirectly({
        handler,
        method: "GET",
        path: "/api/bots/legacy-public-owner-row",
        headers: auth(owner.cookie),
      });
      assert.equal(ownerGet.status, 200);

      const intruderList = await requestDirectly({
        handler,
        method: "GET",
        path: "/api/bots",
        headers: auth(intruder.cookie),
      });
      assert.equal(intruderList.status, 200);
      assert.equal(
        (responseJson(intruderList).bots as Array<{ id?: unknown }>).some(
          (bot) => bot.id === "legacy-public-owner-row",
        ),
        false,
      );

      const compareGuesses = async (
        method: string,
        crossPath: string,
        missingPath: string,
        body?: (id: string) => Record<string, unknown>,
      ) => {
        const cross = await requestDirectly({
          handler,
          method,
          path: crossPath,
          headers: auth(intruder.cookie),
          ...(body ? { body: body("legacy-public-owner-row") } : {}),
        });
        const missing = await requestDirectly({
          handler,
          method,
          path: missingPath,
          headers: auth(intruder.cookie),
          ...(body ? { body: body("missing-owner-row") } : {}),
        });
        assert.equal(cross.status, 404, cross.body);
        assert.equal(missing.status, 404, missing.body);
        assert.deepEqual(responseJson(cross), responseJson(missing));
      };

      await compareGuesses(
        "GET",
        "/api/bots/legacy-public-owner-row",
        "/api/bots/missing-owner-row",
      );
      await compareGuesses("POST", "/api/bots", "/api/bots", (id) => ({
        name: "Unauthorized copy",
        cloneSourceBotId: id,
      }));

      // Marketplace/import callers must submit an explicit serialized copy.
      // The receiving account creates and owns a distinct private row; it
      // never references or reuses the source account's persisted bot.
      const importedCopyResponse = await requestDirectly({
        handler,
        method: "POST",
        path: "/api/bots",
        headers: auth(intruder.cookie),
        body: {
          name: "Imported independent copy",
          systemPrompt: "receiving account copy prompt",
        },
      });
      assert.equal(importedCopyResponse.status, 201, importedCopyResponse.body);
      const importedCopyId = String(
        (responseJson(importedCopyResponse).bot as { id?: unknown } | undefined)
          ?.id,
      );
      assert.notEqual(importedCopyId, "legacy-public-owner-row");
      assert.deepEqual(
        {
          ...(db
            .prepare(
              "SELECT user_id, system_prompt, visibility FROM bots WHERE id = ? AND user_id = ?",
            )
            .get(importedCopyId, intruder.userId) as Record<string, unknown>),
        },
        {
          user_id: intruder.userId,
          system_prompt: "receiving account copy prompt",
          visibility: "private",
        },
      );
      db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?").run(
        importedCopyId,
        intruder.userId,
      );
      assert.equal(
        db
          .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
          .get("legacy-public-owner-row", owner.userId) !== undefined,
        true,
      );

      const callsBeforeRuntimeGuesses = provider.calls.length;
      await compareGuesses("POST", "/api/chat", "/api/chat", (id) => ({
        message: "Do not run.",
        mode: "chat",
        botId: id,
        preferredProvider: "local",
        incognito: true,
        ephemeralMessages: [],
      }));
      await compareGuesses(
        "POST",
        "/api/zen/live-action-reaction",
        "/api/zen/live-action-reaction",
        (id) => ({
          activeBotId: id,
          personaName: "Guessed",
          source: "submitted_action",
          userAction: "wave",
          clientSequenceId: "owner-boundary-sequence",
        }),
      );
      await compareGuesses(
        "POST",
        "/api/coffee/groups",
        "/api/coffee/groups",
        (id) => ({
          name: "Boundary group",
          ethos: "Owner isolation",
          groupBotIds: ["intruder-owned-bot", id],
        }),
      );
      await compareGuesses(
        "POST",
        "/api/botcast/shows",
        "/api/botcast/shows",
        (id) => ({ hostBotId: id }),
      );
      assert.equal(provider.calls.length, callsBeforeRuntimeGuesses);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM coffee_groups WHERE user_id = ?",
            )
            .get(intruder.userId) as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM botcast_shows WHERE user_id = ?",
            )
            .get(intruder.userId) as { count: number }
        ).count,
        0,
      );
      assert.deepEqual(
        {
          ...(db
            .prepare(
              "SELECT user_id, system_prompt, visibility FROM bots WHERE user_id = ? AND id = ?",
            )
            .get(owner.userId, "legacy-public-owner-row") as Record<
            string,
            unknown
          >),
        },
        {
          user_id: owner.userId,
          system_prompt: "private owner prompt",
          visibility: "public",
        },
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});

describe("owner-bound media HTTP boundary", () => {
  it("requires authentication without caching originals or thumbnails across four accounts", async () => {
    const db = createTestDatabase();
    const provider = createDeterministicProvider();
    const handler = createPrismRequestHandler({
      db,
      config,
      providerFactory: () => provider,
      auxiliaryProviderFactory: () => provider,
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    const owners: Array<{ userId: string; cookie: string; imageId: string; bytes: Buffer }> = [];
    try {
      for (let index = 0; index < 4; index += 1) {
        const registered = await requestDirectly({
          handler,
          method: "POST",
          path: "/api/auth/register",
          body: withTestRegistrationBody("/api/auth/register", {
            username: `media-boundary-${index}@example.test`,
            password: "media-boundary-fixture-password",
          }),
        });
        assert.equal(registered.status, 201, registered.body);
        const userId = String((responseJson(registered).user as { id: string }).id);
        const cookie = String(registered.headers.get("set-cookie")).split(";")[0]!;
        const imageId = `media-boundary-image-${index}`;
        const bytes = await sharp({
          create: { width: 8, height: 8, channels: 4, background: { r: 40 * index, g: 100, b: 210, alpha: 1 } },
        }).png().toBuffer();
        const relativePath = `generated-images/${userId}/${imageId}.png`;
        writeGeneratedImageBytes(relativePath, bytes);
        db.prepare(
          `INSERT INTO images
             (id, user_id, origin, purpose, prompt, url, provider, model, local_rel_path, created_at)
           VALUES (?, ?, 'images_panel', 'gallery', 'private fixture', '', 'local', 'fixture', ?, ?)`,
        ).run(imageId, userId, relativePath, "2026-09-02T00:00:00.000Z");
        owners.push({ userId, cookie, imageId, bytes });
      }

      for (const owner of owners) {
        for (const variant of ["file", "thumb"]) {
          const path = `/api/images/${owner.imageId}/${variant}`;
          const owned = await requestDirectly({ handler, method: "GET", path, headers: { cookie: owner.cookie } });
          assert.equal(owned.status, 200, owned.body);
          assert.equal(owned.headers.get("cache-control"), "private, no-store");
          if (variant === "file") assert.deepEqual(owned.bytes, owner.bytes);
          else assert.equal((await sharp(owned.bytes).metadata()).format, "webp");

          const unauthenticated = await requestDirectly({ handler, method: "GET", path });
          // The existing API maps missing-session errors to 400. Pin denial
          // and its content-free body without changing the auth error contract.
          assert.equal(unauthenticated.status, 400, unauthenticated.body);
          assert.deepEqual(responseJson(unauthenticated), { ok: false, error: "Authentication required." });
          for (const stranger of owners.filter((candidate) => candidate !== owner)) {
            const denied = await requestDirectly({ handler, method: "GET", path, headers: { cookie: stranger.cookie } });
            const missing = await requestDirectly({
              handler, method: "GET", path: `/api/images/missing-media/${variant}`, headers: { cookie: stranger.cookie },
            });
            assert.equal(denied.status, 404, denied.body);
            assert.deepEqual(responseJson(denied), responseJson(missing));
          }
        }
      }

      const removed = owners[0]!;
      db.prepare("DELETE FROM images WHERE user_id = ? AND id = ?").run(removed.userId, removed.imageId);
      for (const owner of owners) {
        const response = await requestDirectly({
          handler, method: "GET", path: `/api/images/${owner.imageId}/file`, headers: { cookie: owner.cookie },
        });
        assert.equal(response.status, owner === removed ? 404 : 200);
      }
      assert.equal(provider.calls.length, 0);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("does not opt any private media response back into persistent HTTP caching", () => {
    const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const policies = Array.from(source.matchAll(/setHeader\(\s*["']cache-control["'],\s*["']([^"']+)["']/giu))
      .map((match) => match[1]!)
      .filter((policy) => policy.includes("private"));
    assert.ok(policies.length >= 7);
    for (const policy of policies) assert.match(policy, /\bno-store\b/u);
  });
});
