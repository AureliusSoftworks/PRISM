import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePrismRefractRequest,
  normalizePrismRefractDirection,
  PRISM_REFRACT_DIRECTION_MAX_LENGTH,
  PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
} from "./prismRefract.ts";

test("normalizes a bounded registered Signal text target", () => {
  const request = normalizePrismRefractRequest({
    target: {
      kind: "signal.booking.topic",
      showId: "show-1",
      guestBotId: "guest-1",
    },
    currentValue: "  A current title  ",
    rejectedValues: Array.from(
      { length: PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT + 2 },
      (_, index) => `Idea ${index}`,
    ),
    preferredProvider: "local",
    responseMode: "local",
  });
  assert.equal(request.currentValue, "A current title");
  assert.equal(
    request.rejectedValues.length,
    PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
  );
  assert.equal(request.rejectedValues[0], "Idea 2");
  assert.equal(request.preferredProvider, "local");
});

test("rejects arbitrary and incomplete targets", () => {
  assert.throws(
    () =>
      normalizePrismRefractRequest({
        target: { kind: "signal.live.composer", showId: "show-1" },
      }),
    /registered Signal Refract target/u,
  );
  assert.throws(
    () =>
      normalizePrismRefractRequest({
        target: { kind: "signal.booking.topic", showId: "show-1" },
      }),
    /Signal guest is required/u,
  );
});

test("normalizes a bounded ephemeral magic direction without keyword loss", () => {
  const normalized = normalizePrismRefractDirection(
    `  Make this strange, tactile, and unresolved. ${"x".repeat(600)}  `,
  );
  assert.match(normalized, /^Make this strange, tactile, and unresolved\./u);
  assert.equal(normalized.length, PRISM_REFRACT_DIRECTION_MAX_LENGTH);
});
