import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BOT_FRAME_ALL_FINISHES,
  BOT_FRAME_FACTORY_FINISHES,
  BOT_FRAME_FINISH_RECIPES,
  BOT_FRAME_FINISHES,
  BOT_FRAME_PAINT_ENABLED,
  BOT_FRAME_PAINT_FINISHES,
  PRISM_FACTORY_CLEAN_FRAME_SEED,
  botFrameFinishForSeed,
  botFrameFinishMirroredForSeed,
} from "./botFrameFinish.ts";

const marketplaceManifest = JSON.parse(
  readFileSync(
    new URL("../../public/bot-marketplace/manifest.json", import.meta.url),
    "utf8"
  )
) as { bots: Array<{ botHash: string; id: string }> };

test("keeps the default Prism frame clean", () => {
  assert.notEqual(botFrameFinishForSeed(null), "clean");
  assert.notEqual(botFrameFinishForSeed(""), "clean");
  assert.equal(
    botFrameFinishForSeed("bot-frame-material:fallback:prism"),
    "clean"
  );
  assert.equal(botFrameFinishForSeed(PRISM_FACTORY_CLEAN_FRAME_SEED), "clean");
  assert.deepEqual(BOT_FRAME_FACTORY_FINISHES, ["clean"]);
});

test("assigns a stable finish for a bot material seed", () => {
  const seed = "bot-frame-material:id:stable-bot";
  assert.equal(botFrameFinishForSeed(seed), botFrameFinishForSeed(seed));
  assert.ok(BOT_FRAME_FINISHES.includes(botFrameFinishForSeed(seed)));
});

test("makes every curated finish reachable across bot identities", () => {
  const assigned = new Set(
    Array.from({ length: 200 }, (_, index) =>
      botFrameFinishForSeed(`bot-frame-material:id:bot-${index}`)
    )
  );

  assert.deepEqual([...assigned].sort(), [...BOT_FRAME_FINISHES].sort());
});

test("ships a complete render recipe for every curated finish", () => {
  assert.deepEqual(
    Object.keys(BOT_FRAME_FINISH_RECIPES).sort(),
    [...BOT_FRAME_ALL_FINISHES].sort()
  );
  assert.deepEqual(
    BOT_FRAME_ALL_FINISHES.filter(
      (finish) => BOT_FRAME_FINISH_RECIPES[finish].paintMaskAsset !== null
    ),
    BOT_FRAME_PAINT_FINISHES
  );
  for (const finish of BOT_FRAME_ALL_FINISHES) {
    const recipe = BOT_FRAME_FINISH_RECIPES[finish];
    if (recipe.paintMaskAsset) {
      assert.equal(recipe.paintStrength, 1, `${finish} opaque paint`);
    }
  }
});

test("gates colored paint from the live finish mix", () => {
  assert.equal(BOT_FRAME_PAINT_ENABLED, false);
  assert.equal(
    BOT_FRAME_FINISHES.some((finish) =>
      BOT_FRAME_PAINT_FINISHES.includes(
        finish as (typeof BOT_FRAME_PAINT_FINISHES)[number]
      )
    ),
    false
  );
  for (const finish of BOT_FRAME_FINISHES) {
    const recipe = BOT_FRAME_FINISH_RECIPES[finish];
    assert.equal(recipe.paintMaskAsset, null, `${finish} paint mask`);
    assert.equal(recipe.paintStrength, 0, `${finish} paint strength`);
    assert.notEqual(recipe.scratchOpacity, 0, `${finish} scratch coverage`);
  }
});

test("never assigns factory-clean to non-PRISM bot identities", () => {
  for (let index = 0; index < 2_000; index += 1) {
    const finish = botFrameFinishForSeed(`bot-frame-material:id:bot-${index}`);
    assert.notEqual(finish, "clean", `bot-${index}`);
    assert.notEqual(BOT_FRAME_FINISH_RECIPES[finish].scratchOpacity, 0, `bot-${index}`);
  }
});

test("assigns every marketplace bot a stable finish and exercises the full mix", () => {
  const assigned = marketplaceManifest.bots.map(({ botHash, id }) => {
    const seed = `bot-frame-material:export:${botHash}`;
    const finish = botFrameFinishForSeed(seed);
    assert.equal(finish, botFrameFinishForSeed(seed));
    assert.ok(BOT_FRAME_FINISHES.includes(finish));
    assert.notEqual(finish, "clean", id);
    assert.notEqual(BOT_FRAME_FINISH_RECIPES[finish].scratchOpacity, 0, id);
    return finish;
  });

  assert.equal(assigned.length, marketplaceManifest.bots.length);
  assert.deepEqual(
    [...new Set(assigned)].sort(),
    [...BOT_FRAME_FINISHES].sort()
  );
});

test("assigns a stable optional horizontal mirror while keeping Prism unmirrored", () => {
  assert.equal(botFrameFinishMirroredForSeed(PRISM_FACTORY_CLEAN_FRAME_SEED), false);

  const assigned = Array.from({ length: 200 }, (_, index) =>
    botFrameFinishMirroredForSeed(`bot-frame-material:id:bot-${index}`)
  );
  assert.ok(assigned.includes(false));
  assert.ok(assigned.includes(true));
  assert.equal(
    botFrameFinishMirroredForSeed("bot-frame-material:id:stable-bot"),
    botFrameFinishMirroredForSeed("bot-frame-material:id:stable-bot")
  );
});
