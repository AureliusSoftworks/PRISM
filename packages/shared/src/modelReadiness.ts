export type ModelPreparationExperience = "coffee" | "signal";

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
  provider: "local" | "openai" | "anthropic";
  model?: string | null;
  experience: ModelPreparationExperience;
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
