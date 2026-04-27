import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QDRANT_URL, normalizeQdrantUrl } from "@localai/config";

describe("normalizeQdrantUrl", () => {
  it("adds a scheme, fixes bind-all, and strips slashes", () => {
    assert.equal(normalizeQdrantUrl("0.0.0.0:6333"), "http://127.0.0.1:6333");
    assert.equal(
      normalizeQdrantUrl("http://127.0.0.1:6333/"),
      "http://127.0.0.1:6333"
    );
  });

  it("uses the default for empty or invalid input with a console warning for invalid", () => {
    assert.equal(normalizeQdrantUrl(""), DEFAULT_QDRANT_URL);
  });
});
