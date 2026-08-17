import type {
  AutoFallbackAttemptTraceV1,
  CoffeeTurnJobFailureCode,
  CoffeeTurnJobFailureV1,
  CoffeeTurnJobRetryMetadataV1,
  CoffeeTurnModelSelectionKind,
} from "@localai/shared";

function safeAttempts(error: unknown): AutoFallbackAttemptTraceV1[] {
  if (!error || typeof error !== "object" || !("attempts" in error)) return [];
  const attempts = (error as { attempts?: unknown }).attempts;
  if (!Array.isArray(attempts)) return [];
  return attempts.flatMap((attempt) => {
    if (!attempt || typeof attempt !== "object") return [];
    const value = attempt as Record<string, unknown>;
    if (
      (value.provider !== "local" &&
        value.provider !== "openai" &&
        value.provider !== "anthropic") ||
      typeof value.model !== "string" ||
      typeof value.durationMs !== "number" ||
      (value.outcome !== "failed" && value.outcome !== "succeeded")
    ) {
      return [];
    }
    const reason =
      value.reason === "timeout" ||
      value.reason === "provider_error" ||
      value.reason === "unavailable" ||
      value.reason === "empty" ||
      value.reason === "refusal" ||
      value.reason === "invalid_output"
        ? value.reason
        : undefined;
    return [
      {
        provider: value.provider,
        model: value.model,
        durationMs: Math.max(0, Math.round(value.durationMs)),
        outcome: value.outcome,
        ...(reason ? { reason } : {}),
      },
    ];
  });
}

function failureCode(error: unknown): CoffeeTurnJobFailureCode {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "AutoFallbackExhaustedError" || /auto_fallback_exhausted|all auto models failed/iu.test(message)) {
    return "auto_fallback_exhausted";
  }
  if (name === "AbortError" || /cancel(?:led|ed)|aborted/iu.test(message)) {
    return "cancelled";
  }
  if (/invalid output|punctuation-only|empty response|unfinished response/iu.test(message)) {
    return "invalid_output";
  }
  if (/unavailable|timed? out|timeout|connection|network|provider|model.*failed/iu.test(message)) {
    return "provider_unavailable";
  }
  return "unknown";
}

export function coffeeTurnJobFailureV1(args: {
  error: unknown;
  selectionKind: CoffeeTurnModelSelectionKind;
  speakerBotId: string | null;
  latestMessageCursor: string | null;
  retry?: CoffeeTurnJobRetryMetadataV1 | null;
}): CoffeeTurnJobFailureV1 {
  const code = failureCode(args.error);
  return {
    v: 1,
    code,
    selectionKind: args.selectionKind,
    attempts: safeAttempts(args.error),
    speakerBotId: args.speakerBotId,
    latestMessageCursor: args.latestMessageCursor,
    retry: args.retry ?? null,
    retryable:
      code === "auto_fallback_exhausted" ||
      code === "provider_unavailable" ||
      code === "invalid_output" ||
      code === "unknown",
  };
}
