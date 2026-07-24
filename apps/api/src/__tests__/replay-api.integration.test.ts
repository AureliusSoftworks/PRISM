import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import type { ReplayManifestV2 } from "@localai/shared";
import {
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-faithful-replay-api-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.DATA_DIR = join(tempDir, "data");
process.env.ENCRYPTION_MASTER_KEY = "faithful-replay-integration-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const config = {
  ...getAppConfig(),
  apiPort: 0,
  sessionCookieName: "prism_replay_test_session",
  lanAccessEnabled: false,
  discoveryEnabled: false,
};
const server = createServer(createPrismRequestHandler({ db, config }));
let baseUrl = "";

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
}

function client(): Client {
  let cookie = "";
  return {
    async request(path, init = {}) {
      const request = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(request.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, {
        ...request,
        headers,
      });
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

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.DATA_DIR;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("faithful replay API", () => {
  it("authenticates, tenant-scopes, ranges, finalizes, and retires derived media", async () => {
    const owner = client();
    const registered = await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "replay-owner@example.com",
        password: "replay-owner-password",
      }),
    );
    assert.equal(registered.status, 201);
    const ownerId = (
      db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get("replay-owner@example.com") as { id: string }
    ).id;
    const now = "2026-07-24T00:00:00.000Z";
    db.prepare(
      `INSERT INTO botcast_shows
        (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
         atmosphere_json, created_at, updated_at)
       VALUES ('show-api', ?, 'host-api', 'API Show', 'Premise', 'Direct',
               '#ff3366', '{}', ?, ?)`,
    ).run(ownerId, now, now);
    db.prepare(
      `INSERT INTO botcast_episodes
        (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic,
         provider, response_mode, status, segment, started_at, completed_at,
         created_at, updated_at)
       VALUES ('episode-api', ?, 'show-api', 'host-api', 'guest-api',
               'Faithful API', 'Recording', 'local', 'local', 'completed',
               'closing', ?, ?, ?, ?)`,
    ).run(ownerId, now, now, now, now);

    const anonymous = client();
    const anonymousStart = await anonymous.request(
      "/api/replays/start",
      jsonInit({ surface: "signal", sourceId: "episode-api" }),
    );
    assert.equal(anonymousStart.status, 400);
    assert.match(String((await json(anonymousStart)).error), /Authentication required/u);

    const started = await owner.request(
      "/api/replays/start",
      jsonInit({ surface: "signal", sourceId: "episode-api" }),
    );
    assert.equal(started.status, 201);
    const recordingId = (await json(started)).recording.id as string;
    const audioBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const uploaded = await owner.request(`/api/replays/${recordingId}/audio`, {
      method: "POST",
      headers: {
        "content-type": "audio/webm",
        "x-prism-audio-duration-ms": "5000",
      },
      body: audioBytes,
    });
    assert.equal(uploaded.status, 201);
    assert.equal((await json(uploaded)).recording.availability, "saving");

    const manifest: ReplayManifestV2 = {
      v: 2,
      surface: "signal",
      sourceId: "episode-api",
      title: "Faithful API",
      createdAt: now,
      completedAt: "2026-07-24T00:00:05.000Z",
      privacyMode: "local",
      participants: [
        {
          id: "host-api",
          name: "Host",
          kind: "bot",
          role: "host",
          color: "#ff3366",
          glyph: null,
          seatIndex: 0,
          visible: true,
        },
      ],
      utterances: [
        {
          id: "line-api",
          sourceMessageId: "line-api",
          speakerId: "host-api",
          speakerRole: "host",
          text: "Exact output.",
          spokenText: "Exact output.",
          moodKey: "neutral",
          audible: true,
          visible: true,
          createdAt: "2026-07-24T00:00:01.000Z",
        },
      ],
      initialScene: {
        camera: "wide",
        segment: "opening",
        introActive: false,
        outroActive: false,
        activeAction: null,
        activeReaction: null,
        overlapMessageIds: [],
        studioMix: {},
        participants: {
          "host-api": {
            visible: true,
            present: true,
            speaking: false,
            thinking: false,
            mood: "neutral",
            cupLevel: null,
            sipping: false,
            voiceMode: "english",
            audible: true,
            gain: 1,
            pan: 0,
            effects: [],
          },
        },
      },
      direction: [
        {
          sequence: 1,
          atMs: 1_000,
          endMs: 2_500,
          kind: "speech",
          sourceMessageId: "line-api",
          payload: {
            speakerId: "host-api",
            voiceMode: "english",
            audible: true,
          },
        },
      ],
      visual: {
        theme: "dark",
        accentColor: "#ff3366",
        atmosphereImageUrl: null,
      },
    };
    const finalized = await owner.request(
      `/api/replays/${recordingId}/finalize`,
      jsonInit({ manifest }),
    );
    assert.equal(finalized.status, 200);
    assert.equal((await json(finalized)).recording.availability, "faithful");

    const ranged = await owner.request(`/api/replays/${recordingId}/audio`, {
      headers: { range: "bytes=2-5" },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get("content-range"), "bytes 2-5/8");
    assert.deepEqual(
      new Uint8Array(await ranged.arrayBuffer()),
      new Uint8Array([3, 4, 5, 6]),
    );
    assert.equal(ranged.headers.get("content-disposition"), null);

    const transcript = await owner.request(
      `/api/replays/${recordingId}/transcript.md`,
    );
    assert.equal(transcript.status, 200);
    assert.match(await transcript.text(), /00:01 · Host[\s\S]*Exact output\./u);
    assert.equal(
      (
        await owner.request(`/api/replays/${recordingId}/transcript.vtt`)
      ).status,
      410,
    );

    const other = client();
    assert.equal(
      (
        await other.request(
          "/api/auth/register",
          jsonInit({
            username: "replay-other@example.com",
            password: "replay-other-password",
          }),
        )
      ).status,
      201,
    );
    assert.equal(
      (await other.request(`/api/replays/${recordingId}/audio`)).status,
      404,
    );

    for (const [path, method] of [
      [`/api/replays/${recordingId}/premium`, "POST"],
      ["/api/replays/claim", "POST"],
      [`/api/replays/${recordingId}/video`, "GET"],
      [`/api/replays/${recordingId}/retry`, "POST"],
    ] as const) {
      assert.equal(
        (await owner.request(path, { method, body: method === "POST" ? "{}" : undefined })).status,
        410,
      );
    }
    assert.equal(
      (
        await owner.request(
          "/api/voices/synthesize",
          jsonInit({
            text: "Do not rebuild me.",
            replayRecordingId: recordingId,
          }),
        )
      ).status,
      410,
    );
  });
});
