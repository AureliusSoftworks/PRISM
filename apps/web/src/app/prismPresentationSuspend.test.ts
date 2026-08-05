import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrismAppAwayFromUser,
  isPrismPresentationSuspended,
  waitWhilePrismPresentationSuspended,
} from "./prismPresentationSuspend.ts";
import {
  resolvePrismVisualLifecycle,
  resetPrismVisualLifecycleForTests,
  seedPrismVisualLifecycleForTests,
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

test("app-away holds on blur even while the document stays visible", () => {
  assert.equal(
    isPrismAppAwayFromUser({
      lifecycle: "foreground",
      visible: true,
      focused: false,
      pageHidden: false,
      systemPaused: false,
      reducedMotion: false,
      revision: 0,
    }),
    true,
  );
  assert.equal(
    isPrismAppAwayFromUser({
      lifecycle: "foreground",
      visible: true,
      focused: true,
      pageHidden: false,
      systemPaused: false,
      reducedMotion: false,
      revision: 0,
    }),
    false,
  );
  assert.equal(
    isPrismAppAwayFromUser({
      lifecycle: "suspended",
      visible: false,
      focused: true,
      pageHidden: false,
      systemPaused: false,
      reducedMotion: false,
      revision: 1,
    }),
    true,
  );
});

test("waitWhilePrismPresentationSuspended holds until foreground or abort", async () => {
  resetPrismVisualLifecycleForTests();
  seedPrismVisualLifecycleForTests({
    lifecycle: "suspended",
    visible: false,
    focused: false,
    pageHidden: false,
    systemPaused: false,
    reducedMotion: false,
    revision: 1,
  });

  let released = false;
  const hold = waitWhilePrismPresentationSuspended().then(() => {
    released = true;
  });
  assert.equal(released, false);

  seedPrismVisualLifecycleForTests({
    lifecycle: "foreground",
    visible: true,
    focused: true,
    pageHidden: false,
    systemPaused: false,
    reducedMotion: false,
    revision: 2,
  });
  await hold;
  assert.equal(released, true);

  seedPrismVisualLifecycleForTests({
    lifecycle: "suspended",
    visible: false,
    focused: false,
    pageHidden: true,
    systemPaused: false,
    reducedMotion: false,
    revision: 3,
  });
  let aborted = false;
  const abortedHold = waitWhilePrismPresentationSuspended(() => aborted);
  aborted = true;
  seedPrismVisualLifecycleForTests({
    lifecycle: "suspended",
    visible: false,
    focused: false,
    pageHidden: true,
    systemPaused: false,
    reducedMotion: false,
    revision: 4,
  });
  await abortedHold;
  resetPrismVisualLifecycleForTests();
});
