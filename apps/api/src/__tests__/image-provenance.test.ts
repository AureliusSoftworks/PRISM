import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEBATE_EXHIBIT_IMAGE_PURPOSE,
  SIGNAL_DAY_STUDIO_IMAGE_PURPOSE,
  SIGNAL_LOGO_IMAGE_PURPOSE,
  SIGNAL_NIGHT_STUDIO_IMAGE_PURPOSE,
  contextualImageAssetScopeConfig,
  imageOriginForGenerate,
  normalizeImageRelatedBotIds,
  serializeImageRelatedBotIds,
  signalArtworkImagePurpose,
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

  it("retains every bot in the maximum-size authored group", () => {
    const botIds = Array.from({ length: 100 }, (_, index) => `bot-${index + 1}`);
    assert.deepEqual(normalizeImageRelatedBotIds(botIds), botIds);
    assert.deepEqual(
      JSON.parse(serializeImageRelatedBotIds(botIds)) as string[],
      botIds,
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

  it("maps contextual asset scopes through a finite applet allowlist", () => {
    assert.deepEqual(contextualImageAssetScopeConfig("debate_exhibit"), {
      origin: "debate",
      purpose: DEBATE_EXHIBIT_IMAGE_PURPOSE,
      botScoped: false,
    });
    assert.deepEqual(contextualImageAssetScopeConfig("signal_logo"), {
      origin: "botcast",
      purpose: SIGNAL_LOGO_IMAGE_PURPOSE,
      botScoped: true,
    });
    assert.equal(contextualImageAssetScopeConfig("gallery"), null);
    assert.equal(contextualImageAssetScopeConfig(undefined), null);
  });

  it("keeps each Signal generation kind in its own reusable lane", () => {
    assert.equal(
      signalArtworkImagePurpose("day-studio"),
      SIGNAL_DAY_STUDIO_IMAGE_PURPOSE,
    );
    assert.equal(
      signalArtworkImagePurpose("night-studio"),
      SIGNAL_NIGHT_STUDIO_IMAGE_PURPOSE,
    );
    assert.equal(signalArtworkImagePurpose("logo"), SIGNAL_LOGO_IMAGE_PURPOSE);
  });
});
