import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coffeePollTurnUpdateFromResponse } from "./coffee-poll-turn-response.ts";

describe("coffeePollTurnUpdateFromResponse", () => {
  it("applies a refreshed poll from a Coffee turn response", () => {
    const poll = { id: "poll-1", status: "open" };
    const update = coffeePollTurnUpdateFromResponse({ poll });

    assert.equal(update.hasPollUpdate, true);
    assert.equal(update.poll, poll);
    assert.equal(update.shouldOpenResults, true);
  });

  it("clears stale client poll state when the server returns null", () => {
    const update = coffeePollTurnUpdateFromResponse<{ id: string }>({ poll: null });

    assert.equal(update.hasPollUpdate, true);
    assert.equal(update.poll, null);
    assert.equal(update.shouldOpenResults, false);
  });

  it("ignores legacy responses that do not include poll state", () => {
    const update = coffeePollTurnUpdateFromResponse<{ id: string }>({});

    assert.equal(update.hasPollUpdate, false);
    assert.equal(update.poll, null);
    assert.equal(update.shouldOpenResults, false);
  });
});
