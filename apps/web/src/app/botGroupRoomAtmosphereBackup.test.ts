import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeBotGroupRoomAtmosphereBackupAssets,
  remapBotGroupRoomAtmosphereBackupImageIds,
  uniqueBotGroupRoomAtmosphereBackupReferences,
} from "./botGroupRoomAtmosphereBackup.ts";

const UPDATED_AT = "2026-07-15T00:00:00.000Z";

describe("group-room atmosphere backup assets", () => {
  it("normalizes bounded PNG assets and removes duplicates or malformed input", () => {
    assert.deepEqual(
      normalizeBotGroupRoomAtmosphereBackupAssets([
        {
          imageId: "room-one",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          prompt: "  Quiet observatory  ",
        },
        {
          imageId: "room-one",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
        { imageId: "bad id", dataUrl: "data:image/png;base64,aGVsbG8=" },
        { imageId: "room-two", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
      ]),
      [
        {
          imageId: "room-one",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          prompt: "Quiet observatory",
        },
      ],
    );
  });

  it("caps aggregate embedded asset data before account import", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    assert.deepEqual(
      normalizeBotGroupRoomAtmosphereBackupAssets(
        [
          { imageId: "room-one", dataUrl },
          { imageId: "room-two", dataUrl },
        ],
        {
          maxCount: 2,
          maxTotalDataUrlChars: dataUrl.length,
        },
      ).map((asset) => asset.imageId),
      ["room-one"],
    );
  });

  it("collects one portable asset reference per persisted image", () => {
    const groups = [
      {
        id: "a",
        roomAtmosphere: { imageId: "shared", prompt: "Room", updatedAt: UPDATED_AT },
      },
      {
        id: "b",
        roomAtmosphere: { imageId: "shared", updatedAt: UPDATED_AT },
      },
      { id: "c", roomAtmosphere: { imageId: "unique", updatedAt: UPDATED_AT } },
    ];
    assert.deepEqual(uniqueBotGroupRoomAtmosphereBackupReferences(groups), [
      { imageId: "shared", prompt: "Room" },
      { imageId: "unique" },
    ]);
  });

  it("remaps restored ids without changing timestamps or unrelated groups", () => {
    const groups = [
      {
        id: "a",
        roomAtmosphere: { imageId: "old", prompt: "Room", updatedAt: UPDATED_AT },
      },
      { id: "b" },
    ];
    const remapped = remapBotGroupRoomAtmosphereBackupImageIds(
      groups,
      new Map([["old", "restored"]]),
    );
    assert.deepEqual(remapped, [
      {
        id: "a",
        roomAtmosphere: {
          imageId: "restored",
          prompt: "Room",
          updatedAt: UPDATED_AT,
        },
      },
      { id: "b" },
    ]);
    assert.notEqual(remapped, groups);
    assert.equal(remapped[1], groups[1]);
  });
});
