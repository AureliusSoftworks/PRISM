import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PREPARED_TURN_TTL_MS,
  preparedTurnCursorMatchesV1,
  type PreparedTurnCursorV1,
} from "./turnPreparation.ts";

const cursor: PreparedTurnCursorV1 = {
  revision: 7,
  lastMessageId: "message-7",
  lastEventId: "event-9",
  floorOwnerId: "bot-1",
  castHash: "cast-a",
  powersHash: "powers-a",
  promptStateHash: "prompt-a",
};

describe("prepared turn cursors", () => {
  it("retains prepared work beyond the ten-minute AUTO ceiling", () => {
    assert.equal(PREPARED_TURN_TTL_MS, 12 * 60_000);
  });

  it("matches only when every prompt-affecting field remains frozen", () => {
    assert.equal(preparedTurnCursorMatchesV1(cursor, { ...cursor }), true);
    for (const key of Object.keys(cursor) as Array<keyof PreparedTurnCursorV1>) {
      const changed = { ...cursor, [key]: `${String(cursor[key])}-changed` };
      assert.equal(preparedTurnCursorMatchesV1(cursor, changed), false, key);
    }
  });
});
