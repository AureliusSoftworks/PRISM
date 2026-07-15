import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN,
  type GroupRoomWallpaperImageGenerationRequest,
} from "./groupRoomWallpaper.ts";

test("group-room wallpaper request contract carries only group identity references", () => {
  const request = {
    purpose: GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
    groupName: "Night Shift",
    groupDescription: "Friends who think best after midnight.",
    memberBotIds: ["bot-a", "bot-b"],
    preferredProvider: "local",
  } satisfies GroupRoomWallpaperImageGenerationRequest;

  assert.equal(request.purpose, "group-room-wallpaper");
  assert.equal("prompt" in request, false);
  assert.deepEqual(request.memberBotIds, ["bot-a", "bot-b"]);
  assert.equal("botId" in request, false);
  assert.equal("conversationId" in request, false);
});

test("group-room wallpaper request bounds match saved Bot Group limits", () => {
  assert.equal(GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN, 2);
  assert.equal(GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX, 24);
  assert.equal(GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH, 80);
  assert.equal(GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH, 500);
});
