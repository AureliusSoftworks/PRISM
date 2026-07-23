import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const child = readFileSync(
  new URL("../replay-render-child.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../replay-render-worker-client.ts", import.meta.url),
  "utf8",
);
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const storage = readFileSync(
  new URL("../replay-storage.ts", import.meta.url),
  "utf8",
);

describe("Signal background replay renderer", () => {
  it("serializes Signal leases behind an isolated Chromium child", () => {
    assert.match(client, /private active = false/u);
    assert.match(client, /if \(this\.active \|\| this\.disposed\) return/u);
    assert.match(client, /claimNextReplayRecording[\s\S]*surface: "signal"/u);
    assert.match(client, /fork\(workerUrl/u);
    assert.match(child, /chromium\.launch/u);
    assert.match(child, /page\.screencast\.start/u);
  });

  it("keeps the lease secret out of the render URL and sends it as a header", () => {
    assert.doesNotMatch(child, /searchParams\.set\("prismRenderToken"/u);
    assert.match(child, /authorization: `Bearer \$\{job\.sessionToken\}`/u);
    assert.match(child, /"x-prism-replay-token": job\.renderToken/u);
    assert.match(child, /sessionStorage\.setItem\("prism_replay_render_token"/u);
  });

  it("streams compressed Opus separately and remuxes without re-encoding", () => {
    assert.match(server, /render-audio-chunk/u);
    assert.match(storage, /\.audio\.webm/u);
    assert.match(child, /"-c:v",\s*"copy",\s*"-c:a",\s*"copy"/u);
    assert.match(child, /4 \* 1024 \* 1024/u);
    assert.match(child, /contentType: "video\/webm"/u);
  });
});
