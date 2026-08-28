import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nudgeOnlineAutoProviderWeights,
  onlineAutoPointToWeights,
  onlineAutoWeightsToPoint,
} from "./onlineAutoProviderTriangleMath.ts";

describe("ONLINE Auto provider triangle", () => {
  it("maps vertices and center to normalized provider weights", () => {
    assert.deepEqual(onlineAutoPointToWeights(24, 232), {
      v: 1,
      openai: 1,
      anthropic: 0,
      ollama_cloud: 0,
    });
    assert.deepEqual(onlineAutoPointToWeights(276, 232), {
      v: 1,
      openai: 0,
      anthropic: 1,
      ollama_cloud: 0,
    });
    assert.deepEqual(onlineAutoPointToWeights(150, 18), {
      v: 1,
      openai: 0,
      anthropic: 0,
      ollama_cloud: 1,
    });
    const center = onlineAutoPointToWeights(150, (18 + 232 + 232) / 3);
    assert.ok(Math.abs(center.openai - 1 / 3) < 1e-9);
    assert.ok(Math.abs(center.anthropic - 1 / 3) < 1e-9);
    assert.ok(Math.abs(center.ollama_cloud - 1 / 3) < 1e-9);
  });

  it("round-trips and supports directional keyboard nudges", () => {
    const initial = { v: 1 as const, openai: 0.2, anthropic: 0.3, ollama_cloud: 0.5 };
    const point = onlineAutoWeightsToPoint(initial);
    const roundTrip = onlineAutoPointToWeights(point.x, point.y);
    assert.ok(Math.abs(roundTrip.ollama_cloud - 0.5) < 1e-9);
    assert.ok(nudgeOnlineAutoProviderWeights(initial, "ArrowUp").ollama_cloud > 0.5);
    assert.ok(nudgeOnlineAutoProviderWeights(initial, "ArrowLeft").openai > 0.2);
  });
});
