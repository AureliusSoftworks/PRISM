import {
  normalizeOnlineAutoProviderWeights,
  type OnlineAutoProviderWeightsV1,
} from "@localai/shared";

const OPENAI = { x: 24, y: 232 };
const ANTHROPIC = { x: 276, y: 232 };
const CLOUD = { x: 150, y: 18 };

export function onlineAutoWeightsToPoint(value: unknown): { x: number; y: number } {
  const weights = normalizeOnlineAutoProviderWeights(value);
  return {
    x: OPENAI.x * weights.openai + ANTHROPIC.x * weights.anthropic + CLOUD.x * weights.ollama_cloud,
    y: OPENAI.y * weights.openai + ANTHROPIC.y * weights.anthropic + CLOUD.y * weights.ollama_cloud,
  };
}

export function onlineAutoPointToWeights(x: number, y: number): OnlineAutoProviderWeightsV1 {
  const denominator =
    (ANTHROPIC.y - CLOUD.y) * (OPENAI.x - CLOUD.x) +
    (CLOUD.x - ANTHROPIC.x) * (OPENAI.y - CLOUD.y);
  const openai =
    ((ANTHROPIC.y - CLOUD.y) * (x - CLOUD.x) +
      (CLOUD.x - ANTHROPIC.x) * (y - CLOUD.y)) /
    denominator;
  const anthropic =
    ((CLOUD.y - OPENAI.y) * (x - CLOUD.x) +
      (OPENAI.x - CLOUD.x) * (y - CLOUD.y)) /
    denominator;
  return normalizeOnlineAutoProviderWeights({
    openai: Math.max(0, openai),
    anthropic: Math.max(0, anthropic),
    ollama_cloud: Math.max(0, 1 - openai - anthropic),
  });
}

export function nudgeOnlineAutoProviderWeights(
  value: unknown,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): OnlineAutoProviderWeightsV1 {
  const point = onlineAutoWeightsToPoint(value);
  const step = 11;
  return onlineAutoPointToWeights(
    point.x + (key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0),
    point.y + (key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0),
  );
}
