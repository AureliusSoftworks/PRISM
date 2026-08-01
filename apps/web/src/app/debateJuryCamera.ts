import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";

export interface DebateJuryCameraPresentationV1 {
  presenting: boolean;
  event: DebateEventV1 | null;
  preparingSpeakerBotId: string | null;
}

function debateEventUsesJuryCamera(event: DebateEventV1): boolean {
  return (
    event.speakerKind === "juror" ||
    event.kind === "jury_deliberation" ||
    event.kind === "jury_verdict"
  );
}

/**
 * The saved Debate step can already point at Jury while the client is still
 * presenting the final advocate line and moderator handoff from the response.
 * Keep that queued public-floor material on the Forum camera until it lands.
 */
export function debateJuryPresentationKeepsForumCamera(
  session: Pick<DebateSessionV1, "jury">,
  presentation: DebateJuryCameraPresentationV1 | undefined,
): boolean {
  if (!presentation?.presenting) return false;
  if (presentation.preparingSpeakerBotId) {
    return !session.jury.jurors.some(
      (juror) => juror.id === presentation.preparingSpeakerBotId,
    );
  }
  if (presentation.event) {
    return !debateEventUsesJuryCamera(presentation.event);
  }
  return false;
}
