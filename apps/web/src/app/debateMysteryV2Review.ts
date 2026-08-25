import type { DebateWhodunnitFormatStateV2 } from "@localai/shared";

function mysteryReviewName(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

/**
 * Formats only the client-visible Whodunnit projection. The sealed Case Bible,
 * dialogue graph, solver metadata, and undiscovered record never enter this
 * review payload.
 */
export function formatDebateMysteryV2PublicReview(
  state: DebateWhodunnitFormatStateV2,
  botNameForId: (botId: string) => string | null = () => null,
): string {
  const suspectNameBySeat = new Map(
    state.suspects.map((suspect) => [suspect.seatId, suspect.name]),
  );
  const admittedRecord = state.record.filter((item) => item.admitted);
  const recordTitleById = new Map(
    admittedRecord.map((item) => [item.reference.id, item.title]),
  );
  const suspectName = (seatId: string | null | undefined): string =>
    seatId
      ? mysteryReviewName(suspectNameBySeat.get(seatId), seatId)
      : "Court / narrator";
  const recordNames = (ids: readonly string[]): string =>
    ids.length > 0
      ? ids
          .map((id) => mysteryReviewName(recordTitleById.get(id), id))
          .join(", ")
      : "None";
  const theory = state.theory;
  const verdict = state.verdict;

  return [
    "## Whodunnit public case record",
    "",
    `- Case: ${mysteryReviewName(state.caseTitle, "Untitled case")}`,
    `- Fiction: ${state.fictionLabel}`,
    `- Phase: ${state.playPhase}`,
    `- Difficulty: ${state.config.difficulty}`,
    `- Trial: ${state.config.trialType === "jury" ? "Jury Trial" : "Bench Trial"}`,
    `- Role: ${state.config.playerRole === "spectator" ? "Spectator" : "Participant"}`,
    `- Victim: ${mysteryReviewName(state.victim?.name, "Not disclosed")}`,
    `- Voices: ${state.voicesEnabled ? "packaged local performance" : "text performance"}`,
    "",
    "### Public cast",
    "",
    ...(state.suspects.length > 0
      ? state.suspects.map(
          (suspect) =>
            `- ${suspect.name}${suspect.roomId ? ` — met in ${state.rooms.find((room) => room.id === suspect.roomId)?.name ?? suspect.roomId}` : " — location undiscovered"}`,
        )
      : ["No public suspect record."]),
    "",
    "### Visited rooms and examinations",
    "",
    ...(() => {
      const visitedRooms = state.rooms.filter((room) => room.visited);
      return visitedRooms.length > 0
        ? visitedRooms.map((room) => {
            const examined = room.hotspots
              .filter((hotspot) => hotspot.examined)
              .map((hotspot) => hotspot.label);
            return `- ${room.name}: ${examined.length > 0 ? examined.join(", ") : "visited; no completed examination"}`;
          })
        : ["No rooms visited."];
    })(),
    "",
    "### Admitted public record",
    "",
    ...(admittedRecord.length > 0
      ? admittedRecord.map(
          (item) =>
            `- ${item.emoji} ${item.title} (${item.reference.kind}): ${item.description}`,
        )
      : ["No admitted evidence or testimony."]),
    "",
    "### Investigation and court dialogue",
    "",
    ...(state.dialogueHistory.length > 0
      ? state.dialogueHistory.map(
          (entry, index) =>
            `- ${String(index + 1).padStart(3, "0")} · ${entry.occurredAt} · ${suspectName(entry.speakerSeatId)}: ${entry.visibleText}`,
        )
      : ["No public dialogue was recorded."]),
    "",
    "### Filed theory",
    "",
    ...(theory
      ? [
          `- Accused: ${suspectName(theory.culpritSeatId)}`,
          `- Accomplice: ${theory.accompliceSeatId ? suspectName(theory.accompliceSeatId) : "None"}`,
          `- Method: ${mysteryReviewName(theory.method, "Uncertain")}`,
          `- Motive: ${mysteryReviewName(theory.motive, "Uncertain")}`,
          `- Opportunity: ${mysteryReviewName(theory.opportunity, "Uncertain")}`,
          `- Evidence: ${recordNames(theory.evidenceIds)}`,
          `- Testimony: ${recordNames(theory.testimonyIds)}`,
          `- Filed: ${state.theoryFiledAt ?? "Not filed"}`,
        ]
      : ["No theory filed."]),
    "",
    "### Public testimony record",
    "",
    ...(state.court?.statements.length
      ? state.court.statements.map(
          (statement) =>
            `- ${suspectName(statement.witnessSeatId)} · statement ${statement.statementId} v${statement.version}${statement.pressed ? " · pressed" : ""}: ${statement.visibleText}`,
        )
      : ["No court statements recorded."]),
    "",
    "### Court callouts",
    "",
    ...(state.calloutHistory.length > 0
      ? state.calloutHistory.map(
          (callout) =>
            `- ${callout.occurredAt}: ${callout.callout.replaceAll("_", " ")}`,
        )
      : ["No court callouts recorded."]),
    "",
    "### Whodunnit verdict",
    "",
    ...(verdict
      ? [
          `- Legal result: ${verdict.legalResult.replaceAll("_", " ")}`,
          `- Truth and proof grade: ${verdict.classification.replaceAll("_", " ")} · ${verdict.proofGrade}`,
          `- Delivered: ${verdict.deliveredAt}`,
          ...(verdict.jurorBallots.length > 0
            ? verdict.jurorBallots.map(
                (ballot) =>
                  `- ${mysteryReviewName(botNameForId(ballot.jurorBotId), "Juror")}: ${ballot.vote.replaceAll("_", " ")} — ${ballot.reason}${ballot.powerAffected ? " (Power affected)" : ""}`,
              )
            : ["- Jury: Not used"]),
        ]
      : ["No verdict recorded."]),
  ]
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
