import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  nudgeOnlineAutoProviderWeights,
  onlineAutoPointToWeights,
  onlineAutoWeightsToPoint,
} from "./onlineAutoProviderTriangleMath.ts";

const triangleCss = readFileSync(
  new URL("./OnlineAutoProviderTriangle.module.css", import.meta.url),
  "utf8",
);

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

  it("anchors provider labels to the triangle vertices", () => {
    assert.match(
      triangleCss,
      /\.vertexLabels \{[\s\S]*?left: 50%;[\s\S]*?width: min\(calc\(100% - 24px\), 340px\);[\s\S]*?transform: translateX\(-50%\);/u,
    );
    assert.match(
      triangleCss,
      /\.openAiLabel \{[\s\S]*?top: 92\.8%;[\s\S]*?left: 8%;[\s\S]*?translate\(calc\(-100% - 8px\), -50%\)/u,
    );
    assert.match(
      triangleCss,
      /\.anthropicLabel \{[\s\S]*?top: 92\.8%;[\s\S]*?right: 8%;[\s\S]*?translate\(calc\(100% \+ 8px\), -50%\)/u,
    );
  });
});
