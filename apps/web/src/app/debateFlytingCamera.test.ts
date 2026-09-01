import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flytingAutoCameraView } from "./debateFlytingCamera.ts";

const bots = {
  forBotId: "for-bot",
  againstBotId: "against-bot",
  moderatorBotId: "moderator-bot",
};

describe("Flyting Auto camera", () => {
  it("holds a speaker only during audible delivery and returns to Wide otherwise", () => {
    assert.equal(flytingAutoCameraView("for-bot", bots), "left");
    assert.equal(flytingAutoCameraView("against-bot", bots), "right");
    assert.equal(flytingAutoCameraView("moderator-bot", bots), "moderator");
    assert.equal(flytingAutoCameraView(null, bots), "wide");
    assert.equal(flytingAutoCameraView("hall-spectator", bots), "wide");
  });
});
