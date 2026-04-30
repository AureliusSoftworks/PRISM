import assert from "node:assert/strict";
import test from "node:test";
import {
  collectHiddenByDefaultModelIdsFromCatalog,
  isBotCustomizerModelHiddenByDefault,
} from "./botCustomizerModels.ts";

test("embedding-style ids default hidden", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("mxbai-embed-large"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("text-embedding-3-large"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("nomic-embed-text"), true);
});

test("general chat ids stay visible by default list logic", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("mistral"), false);
  assert.equal(isBotCustomizerModelHiddenByDefault("llama3.2:latest"), false);
});

test("vision / llava default hidden", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("llava:latest"), true);
  assert.equal(isBotCustomizerModelHiddenByDefault("moondream"), true);
});

test("embedded substring does not false-positive embed rule", () => {
  assert.equal(isBotCustomizerModelHiddenByDefault("someembeddedname"), false);
});

test("catalog merge collects and sorts", () => {
  assert.deepEqual(
    collectHiddenByDefaultModelIdsFromCatalog(["mistral", "llava"], ["text-embedding-3-small"]),
    ["llava", "text-embedding-3-small"]
  );
});
