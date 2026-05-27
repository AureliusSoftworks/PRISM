import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StoryScene } from "@localai/shared";
import {
  createStoryDialogState,
  createStoryInventoryViewState,
  splitStoryDialogueText,
  storyChoiceMissingItemId,
} from "./story-mode-dialog.ts";

const npcScene: StoryScene = {
  id: "scene-2",
  title: "Glass Archive",
  locationId: "archive",
  narration:
    "Nova lowers her lantern, and the archive answers with a ripple through every pane. The shelves are listening for your answer. Choose carefully before the glass wakes and remembers your footsteps.",
  speakerBotId: "bot-nova",
  speakerName: "Nova",
  spritePose: "speaking",
  itemIds: ["glass-key", "sealed-note"],
  choices: [
    {
      id: "open-door",
      label: "Use the key",
      targetSceneId: "scene-3",
      requireItemIds: ["glass-key"],
    },
  ],
};

describe("Story Mode dialog helpers", () => {
  it("splits long narration into click-through beats without changing actor identity", () => {
    const beats = splitStoryDialogueText(npcScene.narration);
    assert.equal(beats.length, 2);

    const first = createStoryDialogState(npcScene, 0);
    assert.equal(first.activeBeat.text, beats[0]);
    assert.equal(first.activeBeat.actorRole, "npc");
    assert.equal(first.activeBeat.speakerBotId, "bot-nova");
    assert.equal(first.canAdvance, true);
    assert.equal(first.isComplete, false);

    const last = createStoryDialogState(npcScene, 99);
    assert.equal(last.activeBeat.text, beats[1]);
    assert.equal(last.canAdvance, false);
    assert.equal(last.isComplete, true);
  });

  it("keeps inventory view state separate from scene pickups", () => {
    const inventory = createStoryInventoryViewState(
      [
        {
          id: "glass-key",
          name: "Glass Key",
          category: "key",
          description: "A prism-cut key.",
        },
        {
          id: "sealed-note",
          name: "Sealed Note",
          category: "document",
          description: "A folded note.",
        },
      ],
      ["glass-key"],
      npcScene.itemIds
    );

    assert.deepEqual(
      inventory.collectedItems.map((item) => item.id),
      ["glass-key"]
    );
    assert.deepEqual(
      inventory.availableSceneItems.map((item) => item.id),
      ["sealed-note"]
    );
  });

  it("treats Story choices as player options gated by inventory requirements", () => {
    const choice = npcScene.choices[0]!;
    assert.equal(storyChoiceMissingItemId(choice, new Set()), "glass-key");
    assert.equal(storyChoiceMissingItemId(choice, new Set(["glass-key"])), null);
  });
});
