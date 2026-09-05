import assert from "node:assert/strict";
import test from "node:test";
import {
  endDebatePerfSpan,
  startDebatePerfSpan,
} from "../debatePerfTiming.ts";

test("debate perf spans return non-negative durations without throwing", () => {
  const span = startDebatePerfSpan("advance.total");
  const durationMs = endDebatePerfSpan(span, { stepKey: "opening_for" });
  assert.ok(durationMs >= 0);
});
