import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeBackendModelWarmupMessage,
  looksLikeOllamaRunnerInterruptedMessage,
} from "../image-warmup-heuristics.ts";

describe("looksLikeBackendModelWarmupMessage", () => {
  it("detects generic upstream 500 text while engines load", () => {
    assert.equal(looksLikeBackendModelWarmupMessage("Internal Server Error"), true);
  });

  it("detects CUDA / VRAM hints", () => {
    assert.equal(looksLikeBackendModelWarmupMessage("CUDA out of memory"), true);
    assert.equal(looksLikeBackendModelWarmupMessage("torch.OutOfMemoryError: GPU"), true);
  });

  it("returns false for unrelated failures", () => {
    assert.equal(looksLikeBackendModelWarmupMessage("unknown model id"), false);
  });
});

describe("looksLikeOllamaRunnerInterruptedMessage", () => {
  it("detects Ollama JSON errors with EOF on internal completion port", () => {
    const sample =
      '{"error":"Post \\"http://127.0.0.1:64798/completion\\": EOF"}';
    assert.equal(looksLikeOllamaRunnerInterruptedMessage(sample), true);
  });

  it("returns false for EOF-only unrelated strings", () => {
    assert.equal(looksLikeOllamaRunnerInterruptedMessage("eof handling bug"), false);
  });
});
