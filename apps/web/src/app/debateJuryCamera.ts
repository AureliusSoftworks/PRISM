import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";

export interface DebateJuryCameraPresentationV1 {
  presenting: boolean;
  event: DebateEventV1 | null;
  preparingSpeakerBotId: string | null;
}

export function debateEventUsesJuryCamera(event: DebateEventV1): boolean {
  // Sidebar remarks are Jury-authored, but remain inter-round commentary on
  // the public floor. The chamber is reserved for the formal record only.
  if (event.kind === "jury_deliberation") {
    return !event.stepKey.startsWith("jury_sidebar_");
  }
  if (event.kind === "ballot") {
    return (
      event.speakerKind === "juror" &&
      event.stepKey.startsWith("jury_final_")
    );
  }
  return event.kind === "jury_verdict";
}

function debateEventNeedsJuryAccess(event: DebateEventV1): boolean {
  return (
    event.speakerKind === "juror" ||
    event.kind === "jury_deliberation" ||
    event.kind === "jury_verdict"
  );
}

/**
 * A baked Spectator session may already be complete while the client is still
 * replaying unheard events. Public Jury events remain presentable from their
 * own provenance; the terminal server step must not erase them from playback.
 */
export function debateJuryEventCanPresent(
  session: Pick<DebateSessionV1, "jury" | "playerRole">,
  event: DebateEventV1,
): boolean {
  if (!debateEventNeedsJuryAccess(event)) return true;
  return session.jury.enabled && session.playerRole !== "participant";
}

/** Only a visible formal Jury beat owns the chamber, even after bake-ahead. */
export function debateJuryPresentationUsesChamber(
  _session: Pick<DebateSessionV1, "jury">,
  presentation: DebateJuryCameraPresentationV1 | undefined,
): boolean {
  if (!presentation?.presenting) return false;
  return presentation.event
    ? debateEventUsesJuryCamera(presentation.event)
    : false;
}

/**
 * The saved Debate step can already point at Jury while the client is still
 * presenting the final advocate line and moderator handoff from the response.
 * Keep that queued public-floor material on the Forum camera until it lands.
 */
export function debateJuryPresentationKeepsForumCamera(
  _session: Pick<DebateSessionV1, "jury">,
  presentation: DebateJuryCameraPresentationV1 | undefined,
): boolean {
  if (!presentation?.presenting) return false;
  if (presentation.preparingSpeakerBotId) return true;
  if (presentation.event) {
    return !debateEventUsesJuryCamera(presentation.event);
  }
  return false;
}
