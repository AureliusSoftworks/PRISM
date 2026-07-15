import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildImageLibrarySections,
  imageLibraryOwnerBotIds,
} from "./imageLibraryGrouping.ts";

const bots = [
  { id: "alan", name: "Alan Watts" },
  { id: "bob", name: "Bob Ross" },
  { id: "patrick", name: "Patrick" },
  { id: "spongebob", name: "SpongeBob" },
  { id: "squidward", name: "Squidward" },
];

describe("image library grouping", () => {
  it("keeps PRISM separate from bot-owned and shared images", () => {
    const sections = buildImageLibrarySections({
      bots,
      images: [
        { id: "prism" },
        { id: "alan-studio", botId: "alan", botIds: ["alan"] },
        { id: "alan-logo", botIds: ["alan"] },
        { id: "bob-studio", botIds: ["bob"] },
        {
          id: "bikini-bottom",
          botIds: ["spongebob", "patrick", "squidward"],
        },
      ],
    });

    assert.deepEqual(
      sections.map((section) => [section.label, section.images.length]),
      [
        ["PRISM", 1],
        ["Alan Watts", 2],
        ["Bob Ross", 1],
        ["Patrick, SpongeBob & Squidward", 1],
      ],
    );
  });

  it("recovers legacy group-room ownership from the saved bot group", () => {
    assert.deepEqual(
      imageLibraryOwnerBotIds({ id: "legacy-room" }, [
        {
          botIds: ["spongebob", "patrick", "squidward"],
          roomAtmosphere: { imageId: "legacy-room" },
        },
      ]),
      ["patrick", "spongebob", "squidward"],
    );
  });
});
