import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

describe("retired replay rendering", () => {
  it("has no background render worker entry point", () => {
    assert.equal(
      existsSync(new URL("../replay-render-child.ts", import.meta.url)),
      false,
    );
    assert.equal(
      existsSync(
        new URL("../replay-render-worker-client.ts", import.meta.url),
      ),
      false,
    );
    assert.doesNotMatch(
      server,
      /wakeReplayBackgroundRender|replayRenderWorkerClient/u,
    );
  });

  it("keeps every historical render and enhancement route retired", () => {
    for (const route of [
      "/api/replays/:id/premium",
      "/api/replays/claim",
      "/api/replays/:id/render-audio-chunk",
      "/api/replays/:id/render-chunk",
      "/api/replays/:id/complete",
      "/api/replays/:id/fail",
      "/api/replays/:id/retry",
      "/api/replays/:id/video",
    ]) {
      const routeIndex = server.indexOf(`"${route}"`);
      assert.ok(routeIndex >= 0, `${route} remains a stable retired route`);
      assert.match(server.slice(routeIndex, routeIndex + 320), /410/u);
    }
  });

  it("retires captions while preserving the readable Markdown transcript", () => {
    const captions = server.indexOf('"/api/replays/:id/transcript.vtt"');
    const markdown = server.indexOf('"/api/replays/:id/transcript.md"');
    assert.match(server.slice(captions, captions + 420), /410/u);
    assert.match(
      server.slice(markdown, markdown + 700),
      /text\/markdown[\s\S]*replay-transcript\.md/u,
    );
  });

  it("keeps faithful masters bounded while allowing long audio-only sessions", () => {
    assert.match(
      server,
      /const REPLAY_FAITHFUL_AUDIO_MAX_BYTES = 256 \* 1024 \* 1024;/u,
    );
    assert.match(
      server,
      /replayFaithfulAudioUpload[\s\S]*REPLAY_FAITHFUL_AUDIO_MAX_BYTES/u,
    );
  });
});
