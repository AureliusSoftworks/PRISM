import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_FRAME_FINISHES,
  PRISM_FACTORY_CLEAN_FRAME_SEED,
  botFrameFinishForSeed,
  botFrameFinishMirroredForSeed,
} from "./botFrameFinish.ts";

test("keeps the default Prism frame clean", () => {
  assert.equal(botFrameFinishForSeed(null), "clean");
  assert.equal(botFrameFinishForSeed(""), "clean");
  assert.equal(
    botFrameFinishForSeed("bot-frame-material:fallback:prism"),
    "clean"
  );
  assert.equal(botFrameFinishForSeed(PRISM_FACTORY_CLEAN_FRAME_SEED), "clean");
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
