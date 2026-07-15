import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion.ts";

describe("Signal show deletion selection", () => {
  const shows = [{ id: "first" }, { id: "middle" }, { id: "last" }];

  it("selects the next show when one follows the deleted show", () => {
    assert.equal(nextBotcastShowIdAfterDeletion(shows, "first"), "middle");
    assert.equal(nextBotcastShowIdAfterDeletion(shows, "middle"), "last");
  });

  it("falls back to the previous show at the end of the list", () => {
    assert.equal(nextBotcastShowIdAfterDeletion(shows, "last"), "middle");
  });

  it("returns no selection after deleting the only show", () => {
    assert.equal(nextBotcastShowIdAfterDeletion([{ id: "only" }], "only"), null);
  });
});
