import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CoffeeGroupSessionCreateRequest,
  CoffeeSessionCreateRequest,
} from "./index.ts";

test("Coffee creation requests support optional bounded initial topics", () => {
  const initialTopic = "x".repeat(500);
  const directRequest = {
    groupBotIds: ["bot-a", "bot-b"],
    initialTopic,
  } satisfies CoffeeSessionCreateRequest;
  const savedGroupRequest = {
    initialTopic,
    forceAttendance: true,
  } satisfies CoffeeGroupSessionCreateRequest;
  const legacyDirectRequest = {
    groupBotIds: ["bot-a", "bot-b"],
  } satisfies CoffeeSessionCreateRequest;
  const legacySavedGroupRequest = {} satisfies CoffeeGroupSessionCreateRequest;

  assert.equal(directRequest.initialTopic.length, 500);
  assert.equal(savedGroupRequest.initialTopic, initialTopic);
  assert.equal(savedGroupRequest.forceAttendance, true);
  assert.equal("initialTopic" in legacyDirectRequest, false);
  assert.equal("initialTopic" in legacySavedGroupRequest, false);
  assert.equal("forceAttendance" in legacySavedGroupRequest, false);
});
