export type ModelPreparationExperience =
  | "coffee"
  | "signal"
  | "debate"
  | "prism";

export type ModelPreparationState =
  | "ready"
  | "warming"
  | "unavailable"
  | "not_applicable";

export type ModelPreparationFailure =
  | "runtime_unavailable"
  | "model_unavailable"
  | "timed_out"
  | "request_failed";

export interface ModelPreparationRequest {
  provider: "local" | "ollama_cloud" | "openai" | "anthropic";
  model?: string | null;
  experience: ModelPreparationExperience;
  /**
   * A latency-critical live session may ask the server to resolve Auto,
   * reserve its Ollama residency lane, and warm the exact first-turn model
   * before the interactive scene is revealed.
   */
  liveSessionId?: string;
  responseMode?: "local" | "online";
  retry?: boolean;
}

export interface ModelPreparationResponse {
  ok: true;
  state: ModelPreparationState;
  model: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  retryAfterMs: number | null;
  failure: ModelPreparationFailure | null;
}
