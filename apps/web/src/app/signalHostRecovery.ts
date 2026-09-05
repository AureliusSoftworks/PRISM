import type { BotcastHostRecoveryCandidate } from "@localai/shared";

export function signalShouldScreenHostRecovery(args: {
  hasActiveHost: boolean;
  episodeStatus: "live" | "completed" | "cancelled" | null;
}): boolean {
  return !args.hasActiveHost && args.episodeStatus !== "live";
}

export function signalHostRecoveryCandidateEnabled(
  candidate: Pick<BotcastHostRecoveryCandidate, "status">,
): boolean {
  return candidate.status === "compatible";
}

export function signalHostRecoveryCandidateLabel(
  candidate: Pick<BotcastHostRecoveryCandidate, "status">,
  busy: boolean,
): string {
  if (candidate.status === "compatible") return busy ? "Checking…" : "Ask to host";
  if (candidate.status === "refused") return "Declined";
  if (candidate.status === "unavailable") return "Unavailable";
  return "Not a fit";
}
