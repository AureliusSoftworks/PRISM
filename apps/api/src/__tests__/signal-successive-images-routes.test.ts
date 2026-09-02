import assert from "node:assert/strict";
import { after, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getAppConfig } from "@localai/config";
import { botcastActiveImageContextV1, botcastPendingImageContextV1 } from "@localai/shared";
import { createTestDatabase } from "../test-support.ts";
import { createSessionToken } from "../auth.ts";
import { deriveMasterKey, encryptText } from "../security.ts";
import { createBotcastShow, createBotcastEpisode, getBotcastEpisode, cancelBotcastEpisode } from "../botcast.ts";
import type { LlmProvider, ProviderMessage } from "../providers.ts";

const directory = mkdtempSync(join(tmpdir(), "prism-successive-image-routes-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(directory, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "successive-images-test-only-key";
const { createPrismRequestHandler } = await import("../server.ts");
after(() => { rmSync(directory, { recursive: true, force: true }); });

it("successive Signal image routes enforce atomic registration, duplicate content, reattachment, proxy identity, retry origin and privacy", async () => {
  const db = createTestDatabase();
  const config = { ...getAppConfig(), encryptionMasterKey: "successive-images-test-only-key", sessionCookieName: "image-test-session", ollamaModel: "llava" };
  const wrapped = encryptText(randomBytes(32).toString("base64"), deriveMasterKey(config.encryptionMasterKey));
  db.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider, created_at, last_active_at)
    VALUES ('producer', 'test-images@example.test', 'Producer', 'hash', 'salt', ?, ?, ?, 'local', ?, ?)`).run(wrapped.ciphertext, wrapped.iv, wrapped.tag, new Date().toISOString(), new Date().toISOString());
  db.exec(`INSERT INTO bots (id, user_id, name, system_prompt, chat_enabled, created_at, updated_at) VALUES
    ('host', 'producer', 'Mara Vale', 'You host a painting discussion.', 1, '2026-01-01', '2026-01-01'),
    ('guest', 'producer', 'Ivo Stone', 'You discuss paintings independently.', 1, '2026-01-01', '2026-01-01');`);
  const prompts: ProviderMessage[][] = [];
  let failDescription = false;
  const provider: LlmProvider = { name: "local", embedText: async () => [], generateResponse: async (messages) => {
    prompts.push(messages);
    return failDescription ? "" : "A red square fills the picture with a plain background.";
  } };
  const outbound: string[] = [];
  const handler = createPrismRequestHandler({ db, config, providerFactory: () => provider, fetchImpl: async (request) => {
    const url = String(request); outbound.push(url);
    assert.match(url, /^http:\/\/(?:localhost|127\.0\.0\.1)/u);
    return new Response(JSON.stringify(url.includes("/api/tags") ? { models: [{ name: "llava", details: { family: "llava", parameter_size: "7B" } }] } : { capabilities: ["completion", "vision"], details: { family: "llava" } }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  const token = createSessionToken(db, "producer", 1).token;
  const show = createBotcastShow(db, "producer", { hostBotId: "host" });
  const episode = createBotcastEpisode(db, "producer", show.id, { guestBotId: "guest", topic: "Red squares", preferredProvider: "local", responseMode: "local", model: "llava" });
  const request = async (path: string, body?: unknown, authenticated = true) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
    req.method = body === undefined ? "GET" : "POST";
    req.url = `/api/botcast/episodes/${episode.id}${path}`;
    req.headers = { host: "localhost", "content-type": "application/json", ...(authenticated ? { cookie: `${config.sessionCookieName}=${token}` } : {}) };
    req.complete = true;
    const headers = new Map<string, unknown>();
    let bytes = Buffer.alloc(0);
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200, writableEnded: false, destroyed: false,
      setHeader(name: string, value: unknown) { headers.set(name, value); return this; },
      getHeader(name: string) { return headers.get(name); },
      end(value?: string | Uint8Array) { bytes = value ? Buffer.from(value) : Buffer.alloc(0); this.writableEnded = true; return this; },
    }) as unknown as ServerResponse<IncomingMessage>;
    await handler(req, res);
    return { status: res.statusCode, bytes, json: () => JSON.parse(bytes.toString()) };
  };
  const raster = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  const payload = (imageId: string, reason: string) => ({ imageId, fileName: "square.png", name: "Red square", dataUrl: `data:image/png;base64,${raster.toString("base64")}`, reason });
  const a = payload("a", "PRIVATE-setup");
  const b = payload("b", "PRIVATE-live");
  try {
    const unauthenticated = await request("/image", { episodeImage: a, origin: "setup" }, false);
    assert.equal(unauthenticated.status, 400, unauthenticated.bytes.toString());
    assert.match(unauthenticated.json().error, /Authentication required/u);
    const first = await request("/image", { episodeImage: a, origin: "setup" });
    assert.equal(first.status, 201, first.bytes.toString());
    assert.equal(first.json().imageContext.origin, "setup");
    assert.equal(prompts.length, 1);
    assert.doesNotMatch(JSON.stringify(prompts), /PRIVATE|Red square/u);
    assert.equal((await request("/image", { episodeImage: a, origin: "setup" })).status, 201);
    assert.equal(prompts.length, 1, "unchanged registration does not describe again");
    assert.equal((await request("/image", { episodeImage: b })).status, 409);
    assert.equal((await request("/image", { episodeImage: { ...a, name: "different" }, origin: "setup" })).status, 409);
    assert.equal((await request("/image-proxy")).status, 200);
    const current = getBotcastEpisode(db, "producer", episode.id);
    const image = botcastPendingImageContextV1(current.events)!;
    db.prepare("INSERT INTO botcast_events (id, user_id, episode_id, sequence, kind, payload_json, occurred_at) VALUES ('present-a', 'producer', ?, ?, 'image_context', ?, ?)")
      .run(episode.id, current.events.at(-1)!.sequence + 1, JSON.stringify({ ...image, phase: "discussing", hostIntroductionMessageId: "intro-a" }), new Date().toISOString());
    failDescription = true;
    assert.equal((await request("/image", { episodeImage: b })).status, 400);
    assert.equal((await request("/image-proxy?imageId=b")).status, 404);
    assert.equal(botcastActiveImageContextV1(getBotcastEpisode(db, "producer", episode.id).events)?.imageId, "a");
    failDescription = false;
    assert.equal((await request("/image", { episodeImage: b })).status, 201);
    assert.equal((await request("/image-proxy")).status, 409);
    assert.equal((await request("/image-proxy?imageId=a")).status, 200);
    assert.equal((await request("/image-proxy?imageId=b")).status, 200);
    assert.equal((await request("/image-reattachment/b")).json().reason, "PRIVATE-live");
    assert.equal((await request("/advance", { cue: { kind: "present_image", imageId: "b" }, episodeImage: b })).status, 409, "previous original is required");
    assert.equal((await request("/advance", { cue: { kind: "present_image", imageId: "b" }, cueDelivery: "redirect_host", episodeImage: b, previousEpisodeImage: a })).status, 409);
    const blueRaster = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    assert.equal((await request("/image", { episodeImage: { ...b, dataUrl: `data:image/png;base64,${blueRaster.toString("base64")}` } })).status, 409);
    cancelBotcastEpisode(db, "producer", episode.id);
    const retry = await request("/retry-metadata");
    assert.deepEqual(retry.json().image, { imageId: "a", reason: "PRIVATE-setup" });
    assert.equal((await request("/image", { episodeImage: payload("c", "after end") })).status, 409);
    assert.equal(outbound.every((url) => /^http:\/\/(?:localhost|127\.0\.0\.1)/u.test(url)), true);
  } finally { db.close(); }
});
