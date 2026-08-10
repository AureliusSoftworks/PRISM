import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { replayCoordinatorSessionState } from "./replayRenderCoordinatorSession.ts";

function fetchResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ReplayRenderCoordinator shell polling", () => {
  it("does not authorize replay polling for a signed-out session", async () => {
    const requested: string[] = [];
    const state = await replayCoordinatorSessionState(async (path) => {
      requested.push(path);
      return fetchResponse(200, { user: null });
    });

    assert.equal(state, "signed-out");
    assert.deepEqual(requested, ["/api/auth/me"]);
  });

  it("distinguishes authenticated sessions from unavailable auth", async () => {
    assert.equal(
      await replayCoordinatorSessionState(async () =>
        fetchResponse(200, { user: { id: "user-1" } }),
      ),
      "authenticated",
    );
    assert.equal(
      await replayCoordinatorSessionState(async () =>
        fetchResponse(503, { error: "backend unavailable" }),
      ),
      "unavailable",
    );
    assert.equal(
      await replayCoordinatorSessionState(async () => {
        throw new TypeError("network unavailable");
      }),
      "unavailable",
    );
  });

  it("loads the protected Signal replay directory only once per poll", () => {
    const source = readFileSync(
      new URL("./ReplayRenderCoordinator.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(
      (source.match(/replayFetch\("\/api\/replays\?surface=signal"\)/gu) ?? [])
        .length,
      1,
    );
    assert.match(source, /if \(!sessionReady\)[\s\S]*replayCoordinatorSessionState/u);
    assert.match(source, /REPLAY_COORDINATOR_AUTH_RETRY_MS = 30_000/u);
  });
});
