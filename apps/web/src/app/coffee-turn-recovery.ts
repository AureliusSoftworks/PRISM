import type { CoffeeTurnJobStatus } from "@localai/shared";

export type CoffeeTurnRecoveryDecision =
  | { kind: "retry" }
  | { kind: "retry_excluding_speaker"; speakerBotId: string }
  | { kind: "pause" };

/** Bounded Coffee recovery: one retry, one autonomous Auto speaker skip, stop. */
export function coffeeTurnRecoveryDecision(args: {
  failedJob: CoffeeTurnJobStatus;
  turnKind: "user" | "autonomous";
}): CoffeeTurnRecoveryDecision {
  const failure = args.failedJob.failure;
  if (!failure?.retryable) return { kind: "pause" };
  const ordinal = args.failedJob.retry?.ordinal ?? 0;
  if (failure.selectionKind === "fixed") {
    return ordinal === 0 ? { kind: "retry" } : { kind: "pause" };
  }
  if (ordinal === 0) return { kind: "retry" };
  if (
    ordinal === 1 &&
    args.turnKind === "autonomous" &&
    failure.speakerBotId
  ) {
    return {
      kind: "retry_excluding_speaker",
      speakerBotId: failure.speakerBotId,
    };
  }
  return { kind: "pause" };
}
