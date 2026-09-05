import type { DebateSessionV1 } from "@localai/shared";

import { debateExhaustedRecessRecoveryMarker } from "./debateRecessRecovery.ts";

export type DebateStudioExitIntent =
  | "leave"
  | "leave_immediately"
  | "request_recess"
  | "restore_final_checkpoint"
  | "wait";

export function debateStudioExitIntent(args: {
  session: DebateSessionV1 | null;
  exitPending: boolean;
  pausePending: boolean;
}): DebateStudioExitIntent {
  const { session } = args;
  if (args.exitPending) {
    return session?.playerRole === "participant"
      ? "leave_immediately"
      : "wait";
  }
  if (args.pausePending) return "wait";
  if (!session) return "leave";
  if (session.status !== "live" && session.status !== "waiting_for_player") {
    return "leave";
  }
  if (debateExhaustedRecessRecoveryMarker(session)) {
    return "restore_final_checkpoint";
  }
  return "request_recess";
}
