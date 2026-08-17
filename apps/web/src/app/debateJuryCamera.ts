import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";

export interface DebateJuryCameraPresentationV1 {
  presenting: boolean;
  event: DebateEventV1 | null;
  preparingSpeakerBotId: string | null;
  /** Moderator resume/re-intro owns the Forum even from a Jury bookmark. */
  resumeCeremonyActive?: boolean;
  /** Viewer's held floor line; bake-ahead stepKey must not steal the camera. */
  bookmarkEvent?: DebateEventV1 | null;
}

export function debateEventUsesJuryCamera(
  event: Pick<DebateEventV1, "kind" | "speakerKind" | "stepKey">,
): boolean {
  // Sidebar remarks are Jury-authored, but remain inter-round commentary on
  // the public floor. The chamber is reserved for the formal record only.
  if (event.kind === "jury_deliberation") {
    return !event.stepKey.startsWith("jury_sidebar_");
  }
  // The chamber belongs to the jurors' own record. The Moderator's deciding
  // ballot and the aggregate score are proceedings of the floor: the camera
  // returns to the Forum and the Moderator delivers both from the bench.
  if (event.kind === "ballot") {
    return (
      event.speakerKind === "juror" && event.stepKey.startsWith("jury_final_")
    );
  }
  return false;
}

/**
 * Jurors stay silent on the public floor. Between-turn thoughts and
 * persona Foley belong in the bottom widget / Jury Record until the
 * formal chamber scene is on the record.
 */
export function debateJuryEventIsPubliclyAudible(
  event: Pick<DebateEventV1, "kind" | "speakerKind" | "stepKey">,
): boolean {
  if (event.speakerKind !== "juror") return true;
  return debateEventUsesJuryCamera(event);
}

function debateEventNeedsJuryAccess(event: DebateEventV1): boolean {
  return (
    event.speakerKind === "juror" ||
    event.kind === "jury_deliberation" ||
    event.kind === "jury_verdict"
  );
}

/** Formal audible deliberation owns the chamber for the whole step. */
export function debateJuryDeliberationStepActive(
  session: Pick<DebateSessionV1, "stepKey">,
): boolean {
  return session.stepKey.startsWith("jury_deliberation_");
}

/**
 * The required Jury scene: private leanings, heard deliberation, and juror
 * ballots. The Moderator's deciding vote and the verdict are Forum beats,
 * so the chamber releases the camera once the last juror has spoken.
 */
export function debateJuryChamberStepActive(
  session: Pick<DebateSessionV1, "stepKey">,
): boolean {
  const step = session.stepKey;
  return (
    step.startsWith("jury_initial_") ||
    step.startsWith("jury_deliberation_") ||
    step.startsWith("jury_final_")
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
 * Once a chamber beat is on screen, or deliberation owns the step with no
 * remaining public-floor line, stay in the room — even while the next juror
 * warms a voice.
 *
 * Spectator bake-ahead may move `stepKey` into Jury while the viewer is still
 * on a Forum bookmark or a Moderator re-intro. Those beats keep the Forum.
 */
export function debateJuryPresentationKeepsForumCamera(
  session: Pick<DebateSessionV1, "jury" | "stepKey">,
  presentation: DebateJuryCameraPresentationV1 | undefined,
): boolean {
  if (presentation?.resumeCeremonyActive) return true;
  const shown = presentation?.event ?? presentation?.bookmarkEvent ?? null;
  if (shown) {
    return !debateEventUsesJuryCamera(shown);
  }
  if (presentation?.presenting || presentation?.preparingSpeakerBotId) {
    return !debateJuryChamberStepActive(session);
  }
  return false;
}

/**
 * Once the required Jury scene owns the camera, Forum coverage, mute glances,
 * interrupts, pause-Wide, and gallery arrival must not leave the chamber.
 */
export function debateLiveCameraViewWithJuryLock<TView extends string>(args: {
  juryCameraActive: boolean;
  forumView: TView;
}): TView | "jury" {
  return args.juryCameraActive ? "jury" : args.forumView;
}
