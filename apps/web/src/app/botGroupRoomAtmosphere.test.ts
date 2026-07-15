import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_GROUP_ROOM_ATMOSPHERE_IMAGE_ID_MAX_CHARS,
  BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS,
  botGroupRoomAtmosphereImageFileUrl,
  clearBotGroupRoomAtmosphere,
  eligibleBotGroupRoomAtmosphereImages,
  normalizeBotGroupRoomAtmosphere,
  resolveBotGroupRoomAtmosphere,
  setBotGroupRoomAtmosphere,
} from "./botGroupRoomAtmosphere.ts";

const firstTimestamp = "2026-07-14T12:00:00.000Z";
const secondTimestamp = "2026-07-14T13:00:00.000Z";

describe("bot group room atmosphere normalization", () => {
  it("normalizes the optional persisted model and leaves legacy absence alone", () => {
    assert.equal(normalizeBotGroupRoomAtmosphere(undefined), null);
    assert.equal(normalizeBotGroupRoomAtmosphere(null), null);
    assert.deepEqual(
      normalizeBotGroupRoomAtmosphere({
        imageId: " image_abc-123 ",
        prompt: "  A quiet observatory  ",
        updatedAt: "2026-07-14T12:00:00Z",
        futureField: true,
      }),
      {
        imageId: "image_abc-123",
        prompt: "A quiet observatory",
        updatedAt: firstTimestamp,
      },
    );
  });

  it("fails safely for malformed required fields and discards unsafe optional prompts", () => {
    for (const malformed of [
      [],
      "image-a",
      { imageId: "image/a", updatedAt: firstTimestamp },
      { imageId: "image-a" },
      { imageId: "image-a", updatedAt: "yesterday" },
      { imageId: "image-a", updatedAt: "2026-02-30T12:00:00Z" },
      {
        imageId: "x".repeat(
          BOT_GROUP_ROOM_ATMOSPHERE_IMAGE_ID_MAX_CHARS + 1,
        ),
        updatedAt: firstTimestamp,
      },
    ]) {
      assert.equal(normalizeBotGroupRoomAtmosphere(malformed), null);
    }

    assert.deepEqual(
      normalizeBotGroupRoomAtmosphere({
        imageId: "image-a",
        prompt: "p".repeat(BOT_GROUP_ROOM_ATMOSPHERE_PROMPT_MAX_CHARS + 1),
        updatedAt: firstTimestamp,
      }),
      { imageId: "image-a", updatedAt: firstTimestamp },
    );
  });

  it("builds only authenticated local file endpoint URLs", () => {
    assert.equal(
      botGroupRoomAtmosphereImageFileUrl("wallpaper_A-1"),
      "/api/images/wallpaper_A-1/file",
    );
    assert.equal(botGroupRoomAtmosphereImageFileUrl("../../etc"), null);
    assert.equal(botGroupRoomAtmosphereImageFileUrl(" "), null);
  });
});

describe("bot group room atmosphere image eligibility", () => {
  it("keeps only unique local non-private images in source order", () => {
    const eligible = eligibleBotGroupRoomAtmosphereImages(
      [
        null,
        { id: "remote", hasLocalFile: false },
        { id: "missing-local-flag" },
        { id: "private", hasLocalFile: true },
        { id: "bad/path", hasLocalFile: true },
        {
          id: "legacy-accessory",
          purpose: "bot_accessory",
          hasLocalFile: true,
        },
        {
          id: "legacy-upload",
          purpose: " bot_upload ",
          hasLocalFile: true,
        },
        {
          id: " first ",
          prompt: "  Moonlit library ",
          createdAt: "2026-07-14T10:00:00Z",
          purpose: " gallery ",
          hasLocalFile: true,
        },
        {
          id: "first",
          prompt: "Duplicate",
          hasLocalFile: true,
        },
        {
          id: "second",
          prompt: 42,
          createdAt: "not-a-date",
          purpose: null,
          hasLocalFile: true,
        },
      ],
      [" private ", null],
    );

    assert.deepEqual(eligible, [
      {
        id: "first",
        prompt: "Moonlit library",
        createdAt: "2026-07-14T10:00:00.000Z",
        purpose: "gallery",
        fileUrl: "/api/images/first/file",
      },
      {
        id: "second",
        fileUrl: "/api/images/second/file",
      },
    ]);
  });

  it("resolves valid saved images and falls back for missing, private, or remote rows", () => {
    const atmosphere = {
      imageId: "wallpaper",
      prompt: "Night garden",
      updatedAt: firstTimestamp,
    };
    const local = { id: "wallpaper", hasLocalFile: true };

    assert.deepEqual(
      resolveBotGroupRoomAtmosphere({
        roomAtmosphere: atmosphere,
        images: [local],
      }),
      {
        atmosphere,
        image: {
          id: "wallpaper",
          fileUrl: "/api/images/wallpaper/file",
        },
      },
    );
    assert.equal(
      resolveBotGroupRoomAtmosphere({
        roomAtmosphere: atmosphere,
        images: [{ ...local, hasLocalFile: false }],
      }),
      null,
    );
    assert.equal(
      resolveBotGroupRoomAtmosphere({
        roomAtmosphere: atmosphere,
        images: [local],
        privateImageIds: ["wallpaper"],
      }),
      null,
    );
    assert.equal(
      resolveBotGroupRoomAtmosphere({
        roomAtmosphere: { ...atmosphere, imageId: "deleted" },
        images: [local],
      }),
      null,
    );
  });
});

describe("bot group room atmosphere updates", () => {
  const groups = [
    {
      id: "group:friends",
      name: "Friends",
      description: "Old friends",
      botIds: ["bot-a", "bot-b"],
      customFlag: true,
      roomAtmosphere: {
        imageId: "old-image",
        prompt: "Old prompt",
        updatedAt: firstTimestamp,
      },
      updatedAt: firstTimestamp,
    },
    {
      id: "group:work",
      name: "Work",
      botIds: ["bot-c", "bot-d"],
      updatedAt: firstTimestamp,
    },
  ] as const;

  it("selects or replaces an atmosphere while preserving unrelated group fields", () => {
    const next = setBotGroupRoomAtmosphere(groups, {
      groupId: "group:friends",
      imageId: "new-image",
      prompt: "  New prompt  ",
      updatedAt: secondTimestamp,
    });

    assert.notEqual(next, groups);
    assert.notEqual(next[0], groups[0]);
    assert.equal(next[1], groups[1]);
    assert.equal(next[0]?.name, "Friends");
    assert.equal(next[0]?.description, "Old friends");
    assert.equal(next[0]?.customFlag, true);
    assert.deepEqual(next[0]?.botIds, ["bot-a", "bot-b"]);
    assert.equal(next[0]?.updatedAt, secondTimestamp);
    assert.deepEqual(next[0]?.roomAtmosphere, {
      imageId: "new-image",
      prompt: "New prompt",
      updatedAt: secondTimestamp,
    });
    assert.equal(groups[0].roomAtmosphere.imageId, "old-image");
  });

  it("clears the atmosphere while preserving the group and advancing its timestamp", () => {
    const next = clearBotGroupRoomAtmosphere(groups, {
      groupId: "group:friends",
      updatedAt: secondTimestamp,
    });

    assert.equal("roomAtmosphere" in next[0]!, false);
    assert.equal(next[0]?.name, "Friends");
    assert.equal(next[0]?.customFlag, true);
    assert.deepEqual(next[0]?.botIds, ["bot-a", "bot-b"]);
    assert.equal(next[0]?.updatedAt, secondTimestamp);
    assert.equal(next[1], groups[1]);
    assert.equal("roomAtmosphere" in groups[0], true);
  });

  it("does not mutate groups for missing targets or invalid writes", () => {
    assert.deepEqual(
      setBotGroupRoomAtmosphere(groups, {
        groupId: "group:missing",
        imageId: "new-image",
        updatedAt: secondTimestamp,
      }),
      groups,
    );
    assert.deepEqual(
      setBotGroupRoomAtmosphere(groups, {
        groupId: "group:friends",
        imageId: "../bad",
        updatedAt: secondTimestamp,
      }),
      groups,
    );
    assert.deepEqual(
      clearBotGroupRoomAtmosphere(groups, {
        groupId: "group:friends",
        updatedAt: "invalid",
      }),
      groups,
    );
  });
});
