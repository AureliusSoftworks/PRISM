import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  imageOriginForGenerate,
  normalizeImageRelatedBotIds,
  serializeImageRelatedBotIds,
} from "../image-provenance.ts";

describe("image provenance", () => {
  it("unions the primary bot with related bots without duplicates", () => {
    assert.deepEqual(
      normalizeImageRelatedBotIds(
        '["patrick","squidward","patrick"]',
        "spongebob",
      ),
      ["spongebob", "patrick", "squidward"],
    );
    assert.equal(
      serializeImageRelatedBotIds(["patrick", "squidward"], "spongebob"),
      '["spongebob","patrick","squidward"]',
    );
  });

  it("keeps direct panel images in PRISM while recognizing applet origins", () => {
    assert.equal(
      imageOriginForGenerate({
        purpose: "gallery",
        requestedOrigin: undefined,
      }),
      "images_panel",
    );
    assert.equal(
      imageOriginForGenerate({
        purpose: "gallery",
        requestedOrigin: "botcast",
      }),
      "botcast",
    );
    assert.equal(
      imageOriginForGenerate({
        purpose: "group-room-wallpaper",
        requestedOrigin: "botcast",
      }),
      "bot_group_room",
    );
    assert.equal(
      imageOriginForGenerate({
        purpose: "hub_atmosphere",
        requestedOrigin: "botcast",
      }),
      "hub_atmosphere",
    );
  });
});
