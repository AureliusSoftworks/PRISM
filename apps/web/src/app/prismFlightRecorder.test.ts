import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrismFlightTrace,
  clearPrismFlightEvents,
  getPrismFlightEvents,
  recordPrismFlightEvent,
} from "./prismFlightRecorderTraceStore.ts";

test("Flight Recorder retains only bounded content-free event metadata", () => {
  clearPrismFlightEvents();
  recordPrismFlightEvent({
    area: "render",
    name: "scene-state",
    detail: {
      quality: "full",
      fps: 60,
      prompt: "private text",
      message: "private text",
      credential: "private text",
    },
  });
  const trace = buildPrismFlightTrace();
  assert.match(trace, /quality=full fps=60/u);
  assert.doesNotMatch(trace, /private text|prompt=|message=|credential=/u);
  assert.equal(getPrismFlightEvents().length, 1);
});
