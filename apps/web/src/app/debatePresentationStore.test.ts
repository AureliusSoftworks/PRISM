import assert from "node:assert/strict";
import test from "node:test";
import { createDebatePresentationStore } from "./debatePresentationStore.ts";

test("presentation store publishes speech progress without changing session identity", () => {
  const store = createDebatePresentationStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.replace({
    sessionId: "session-1",
    eventId: "event-1",
    visibleContent: "",
    speechTiming: null,
  });
  store.update({
    visibleContent: "Heard exactly",
    speechTiming: {
      text: "Heard exactly this",
      elapsedMs: 320,
      durationMs: 800,
      alignment: null,
    },
  });

  assert.equal(store.getSnapshot().sessionId, "session-1");
  assert.equal(store.getSnapshot().eventId, "event-1");
  assert.equal(store.getSnapshot().visibleContent.length, 13);
  assert.equal(store.getSnapshot().speechTiming?.elapsedMs, 320);
  assert.equal(notifications, 2);

  unsubscribe();
  store.update({ visibleContent: "Heard exactly this" });
  assert.equal(notifications, 2);
});

test("presentation store preserves exact heard-character reads and ignores stale clears", () => {
  const store = createDebatePresentationStore();
  store.replace({
    sessionId: "new-session",
    eventId: "speech",
    visibleContent: "Twenty four characters!!",
    speechTiming: null,
  });

  assert.equal(store.getSnapshot().visibleContent.length, 24);
  store.clear("departed-session");
  assert.equal(store.getSnapshot().eventId, "speech");

  store.clear("new-session");
  assert.equal(store.getSnapshot().sessionId, null);
  assert.equal(store.getSnapshot().eventId, null);
  assert.equal(store.getSnapshot().visibleContent, "");
});

test("presentation store does not notify for identical replacements", () => {
  const store = createDebatePresentationStore();
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  const snapshot = {
    sessionId: "session",
    eventId: "event",
    visibleContent: "Complete",
    speechTiming: null,
  };
  store.replace(snapshot);
  store.replace(snapshot);
  assert.equal(notifications, 1);
});
