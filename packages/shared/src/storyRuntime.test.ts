import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyStoryChoice,
  applyStoryItemPickup,
  applyStoryTravel,
  createInitialStoryProgress,
  validateStoryEpisodeManifest,
  type StoryEpisodeManifest,
} from "./storyRuntime.ts";

function validEpisode(): StoryEpisodeManifest {
  return {
    id: "episode-test",
    title: "The Glass Road",
    summary: "A compact PRISM story for tests.",
    themeId: "prism_default",
    startSceneId: "scene-1",
    locations: [
      {
        id: "atrium",
        name: "Atrium",
        description: "A quiet projected atrium.",
        x: 0.2,
        y: 0.4,
        discovered: true,
        arrivalSceneId: "scene-1",
      },
      {
        id: "archive",
        name: "Archive",
        description: "Shelves folded into light.",
        x: 0.55,
        y: 0.3,
        discovered: false,
        arrivalSceneId: "scene-2",
      },
      {
        id: "gate",
        name: "Gate",
        description: "The threshold out.",
        x: 0.76,
        y: 0.72,
        discovered: false,
        arrivalSceneId: "scene-7",
      },
    ],
    items: [
      {
        id: "glass-key",
        name: "Glass Key",
        category: "key",
        description: "A small transparent key.",
      },
    ],
    scenes: [
      {
        id: "scene-1",
        title: "First Projection",
        locationId: "atrium",
        narration: "The atrium brightens.",
        spritePose: "idle",
        choices: [
          { id: "go-archive", label: "Enter the archive.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "wait", label: "Wait for the hum.", targetSceneId: "scene-3" },
        ],
      },
      {
        id: "scene-2",
        title: "Archive Door",
        locationId: "archive",
        narration: "The archive opens.",
        spritePose: "speaking",
        itemIds: ["glass-key"],
        choices: [
          { id: "take-key", label: "Take the glass key.", targetSceneId: "scene-4", grantItemIds: ["glass-key"] },
          { id: "read-wall", label: "Read the wall marks.", targetSceneId: "scene-5" },
        ],
      },
      {
        id: "scene-3",
        title: "A Patient Light",
        locationId: "atrium",
        narration: "The hum becomes a path.",
        choices: [
          { id: "follow", label: "Follow it.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "call", label: "Call into the glass.", targetSceneId: "scene-5" },
        ],
      },
      {
        id: "scene-4",
        title: "Key Weight",
        locationId: "archive",
        narration: "The key is warm.",
        choices: [
          { id: "open-gate", label: "Open the gate.", targetSceneId: "scene-8", revealLocationIds: ["gate"], requireItemIds: ["glass-key"] },
          { id: "hide-key", label: "Hide the key.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-5",
        title: "Wall Marks",
        locationId: "archive",
        narration: "The wall remembers a route.",
        choices: [
          { id: "return", label: "Return to the atrium.", targetSceneId: "scene-6" },
          { id: "press-mark", label: "Press the mark.", targetSceneId: "scene-7", revealLocationIds: ["gate"] },
        ],
      },
      {
        id: "scene-6",
        title: "Crosslight",
        locationId: "atrium",
        narration: "Crosslight divides the floor.",
        choices: [
          { id: "left", label: "Take the left seam.", targetSceneId: "scene-7" },
          { id: "right", label: "Take the right seam.", targetSceneId: "scene-8" },
        ],
      },
      {
        id: "scene-7",
        title: "Before the Gate",
        locationId: "gate",
        narration: "The gate waits.",
        choices: [
          { id: "step-through", label: "Step through.", targetSceneId: "scene-8" },
          { id: "look-back", label: "Look back once.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-8",
        title: "Elsewhere",
        locationId: "gate",
        narration: "The story resolves into white rain.",
        ending: true,
        choices: [],
      },
    ],
  };
}

describe("story runtime", () => {
  it("validates a complete episode manifest", () => {
    const episode = validateStoryEpisodeManifest(validEpisode());
    assert.equal(episode.themeId, "prism_default");
    assert.equal(episode.scenes.length, 8);
    assert.equal(episode.locations[0]?.discovered, true);
  });

  it("rejects missing scene references", () => {
    const episode = validEpisode();
    episode.scenes[0]!.choices[0]!.targetSceneId = "missing";
    assert.throws(
      () => validateStoryEpisodeManifest(episode),
      /unknown scene "missing"/
    );
  });

  it("applies a choice and updates progress, transcript, map, and inventory", () => {
    const episode = validateStoryEpisodeManifest(validEpisode());
    const progress = createInitialStoryProgress(episode, "2026-05-26T00:00:00.000Z");
    const first = applyStoryChoice(
      episode,
      progress,
      "go-archive",
      (() => {
        let n = 0;
        return () => `entry-${++n}`;
      })(),
      "2026-05-26T00:00:01.000Z"
    );
    assert.equal(first.progress.currentSceneId, "scene-2");
    assert.deepEqual(first.progress.discoveredLocationIds.sort(), ["archive", "atrium"]);
    assert.equal(first.transcriptEntries.length, 2);

    const second = applyStoryChoice(
      episode,
      first.progress,
      "take-key",
      (() => {
        let n = 10;
        return () => `entry-${++n}`;
      })(),
      "2026-05-26T00:00:02.000Z"
    );
    assert.equal(second.progress.currentSceneId, "scene-4");
    assert.deepEqual(second.progress.inventoryItemIds, ["glass-key"]);
  });

  it("picks up visible scene items without advancing the scene", () => {
    const episode = validateStoryEpisodeManifest(validEpisode());
    const progress = createInitialStoryProgress(episode, "2026-05-26T00:00:00.000Z");
    const arrived = applyStoryChoice(
      episode,
      progress,
      "go-archive",
      (() => {
        let n = 0;
        return () => `entry-${++n}`;
      })(),
      "2026-05-26T00:00:01.000Z"
    );
    const pickedUp = applyStoryItemPickup(
      episode,
      arrived.progress,
      "glass-key",
      (() => {
        let n = 10;
        return () => `item-${++n}`;
      })(),
      "2026-05-26T00:00:02.000Z"
    );
    assert.equal(pickedUp.progress.currentSceneId, "scene-2");
    assert.deepEqual(pickedUp.progress.inventoryItemIds, ["glass-key"]);
    assert.equal(pickedUp.transcriptEntries[0]?.kind, "item");
  });

  it("rejects locked travel and accepts discovered map nodes", () => {
    const episode = validateStoryEpisodeManifest(validEpisode());
    const progress = createInitialStoryProgress(episode, "2026-05-26T00:00:00.000Z");
    const ids = (() => {
      let n = 0;
      return () => `travel-${++n}`;
    })();
    assert.throws(
      () => applyStoryTravel(episode, progress, "archive", ids),
      /not been discovered/
    );
    const discovered = {
      ...progress,
      discoveredLocationIds: [...progress.discoveredLocationIds, "archive"],
    };
    const traveled = applyStoryTravel(episode, discovered, "archive", ids);
    assert.equal(traveled.progress.currentSceneId, "scene-2");
    assert.equal(traveled.transcriptEntries[0]?.kind, "travel");
  });
});
