import assert from "node:assert/strict";
import test from "node:test";
import { isPrismPresentationSuspended } from "./prismPresentationSuspend.ts";
import {
  PrismVisualLifecycleController,
  resolvePrismVisualLifecycle,
  resetPrismVisualLifecycleForTests,
} from "./prismVisualLifecycle.ts";

test("presentation soft-pause follows lifecycle suspended, not ordinary blur", () => {
  assert.equal(
    resolvePrismVisualLifecycle({
      hidden: false,
      focused: false,
      pageHidden: false,
    }),
    "foreground",
  );
  assert.equal(
    isPrismPresentationSuspended({
      lifecycle: "foreground",
      visible: true,
      focused: false,
      pageHidden: false,
      systemPaused: false,
      reducedMotion: false,
      revision: 0,
    }),
    false,
  );
  assert.equal(
    isPrismPresentationSuspended({
      lifecycle: "suspended",
      visible: false,
      focused: false,
      pageHidden: false,
      systemPaused: false,
      reducedMotion: false,
      revision: 1,
    }),
    true,
  );
});

test("controller blur while visible does not suspend presentation", () => {
  resetPrismVisualLifecycleForTests();
  const controller = new PrismVisualLifecycleController({
    hidden: false,
    focused: true,
    reducedMotion: false,
  });
  const blurred = controller.dispatch({ type: "blur" });
  assert.equal(blurred.lifecycle, "foreground");
  assert.equal(isPrismPresentationSuspended(blurred), false);
  const hidden = controller.dispatch({ type: "visibility", hidden: true });
  assert.equal(hidden.lifecycle, "suspended");
  assert.equal(isPrismPresentationSuspended(hidden), true);
  resetPrismVisualLifecycleForTests();
});
