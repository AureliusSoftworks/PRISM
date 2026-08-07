import assert from "node:assert/strict";
import test from "node:test";
import {
  acquirePrismLivingSession,
  hasPrismLivingSessionActive,
  isPrismAppAwayFromUser,
  isPrismPresentationSuspended,
  isPrismVisualSuspended,
  resetPrismLivingSessionForTests,
  shouldKeepLivingSessionActive,
  waitWhilePrismPresentationSuspended,
} from "./prismPresentationSuspend.ts";
import {
  resolvePrismVisualLifecycle,
  resetPrismVisualLifecycleForTests,
  seedPrismVisualLifecycleForTests,
} from "./prismVisualLifecycle.ts";
import { resetPrismAudioContextKeepAliveForTests } from "./replayAudioMasterCapture.ts";

function foregroundFocused() {
  return {
    lifecycle: "foreground" as const,
    visible: true,
    focused: true,
    pageHidden: false,
    systemPaused: false,
    reducedMotion: false,
    revision: 0,
  };
}

function suspendedHidden() {
  return {
    lifecycle: "suspended" as const,
    visible: false,
    focused: false,
    pageHidden: false,
    systemPaused: false,
    reducedMotion: false,
    revision: 1,
  };
}

test("presentation soft-pause follows lifecycle unless a living session is claimed", () => {
  resetPrismLivingSessionForTests();
  resetPrismAudioContextKeepAliveForTests();
  assert.equal(
    resolvePrismVisualLifecycle({
      hidden: false,
      focused: false,
      pageHidden: false,
    }),
    "suspended",
  );
  assert.equal(
    isPrismPresentationSuspended({
      ...foregroundFocused(),
      focused: false,
      lifecycle: "suspended",
    }),
    true,
  );
  assert.equal(isPrismPresentationSuspended(suspendedHidden()), true);
  assert.equal(isPrismVisualSuspended(suspendedHidden()), true);
});

test("app-away holds on blur even while the document stays visible", () => {
  resetPrismLivingSessionForTests();
  assert.equal(
    isPrismAppAwayFromUser({
      ...foregroundFocused(),
      focused: false,
    }),
    true,
  );
  assert.equal(isPrismAppAwayFromUser(foregroundFocused()), false);
  assert.equal(
    isPrismAppAwayFromUser({
      ...suspendedHidden(),
      focused: true,
    }),
    true,
  );
});

test("living sessions keep audio and skip away-recess while visuals stay suspended", () => {
  resetPrismLivingSessionForTests();
  resetPrismAudioContextKeepAliveForTests();
  const release = acquirePrismLivingSession("debate", "sit-1");
  assert.equal(hasPrismLivingSessionActive(), true);
  assert.equal(shouldKeepLivingSessionActive(suspendedHidden()), true);
  assert.equal(isPrismPresentationSuspended(suspendedHidden()), false);
  assert.equal(isPrismAppAwayFromUser(suspendedHidden()), false);
  assert.equal(isPrismAppAwayFromUser({
    ...foregroundFocused(),
    focused: false,
  }), false);
  // Visual sleep remains independent of the living-session claim.
  assert.equal(isPrismVisualSuspended(suspendedHidden()), true);
  // Companion system pause still holds presentation and counts as away.
  assert.equal(
    shouldKeepLivingSessionActive({
      ...suspendedHidden(),
      systemPaused: true,
    }),
    false,
  );
  assert.equal(
    isPrismPresentationSuspended({
      ...suspendedHidden(),
      systemPaused: true,
    }),
    true,
  );
  assert.equal(
    isPrismAppAwayFromUser({
      ...suspendedHidden(),
      systemPaused: true,
    }),
    true,
  );
  release();
  assert.equal(hasPrismLivingSessionActive(), false);
  assert.equal(isPrismPresentationSuspended(suspendedHidden()), true);
  resetPrismLivingSessionForTests();
  resetPrismAudioContextKeepAliveForTests();
});

test("waitWhilePrismPresentationSuspended holds until foreground or abort", async () => {
  resetPrismLivingSessionForTests();
  resetPrismAudioContextKeepAliveForTests();
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

  // Claiming a living session while held must release the wait immediately.
  seedPrismVisualLifecycleForTests({
    lifecycle: "suspended",
    visible: false,
    focused: false,
    pageHidden: false,
    systemPaused: false,
    reducedMotion: false,
    revision: 5,
  });
  let livingReleased = false;
  const livingHold = waitWhilePrismPresentationSuspended().then(() => {
    livingReleased = true;
  });
  assert.equal(livingReleased, false);
  const releaseLiving = acquirePrismLivingSession("coffee", "table-1");
  await livingHold;
  assert.equal(livingReleased, true);
  releaseLiving();
  resetPrismLivingSessionForTests();
  resetPrismAudioContextKeepAliveForTests();
  resetPrismVisualLifecycleForTests();
});
