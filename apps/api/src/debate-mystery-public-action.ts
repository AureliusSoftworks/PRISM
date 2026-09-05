import type {
  DebateMysteryActionRequestV2,
  DebateMysteryPublicActionV1,
  DebateWhodunnitFormatStateV2,
} from "@localai/shared";

/** Whitelist accepted, public interaction metadata. No private case is accepted. */
export function mysteryPublicActionV1(args: {
  id: string;
  occurredAt: string;
  revision: number;
  request: DebateMysteryActionRequestV2;
  before: DebateWhodunnitFormatStateV2;
  after: DebateWhodunnitFormatStateV2;
}): DebateMysteryPublicActionV1 {
  const { request, before, after } = args;
  const priorRecord = new Set(before.record.filter((item) => item.admitted)
    .map((item) => `${item.reference.kind}:${item.reference.id}`));
  const priorItems = new Set((before.caseKit ?? []).map((item) => item.id));
  // HTTP bodies can contain additional properties despite the discriminated
  // TypeScript type. Admit targets only for their action and public state.
  const requestedRoomId = request.action === "move" || request.action === "examine" ||
    request.action === "advance_room_introduction" || request.action === "complete_room_introduction"
    ? request.roomId : undefined;
  const room = after.rooms.find((entry) => entry.visited &&
    entry.id === (requestedRoomId ?? after.currentRoomId));
  const hotspot = request.action === "examine"
    ? room?.hotspots.find((entry) => entry.id === request.hotspotId && entry.examined) : undefined;
  const suspect = request.action === "talk" || request.action === "present_to_suspect"
    ? after.suspects.find((entry) => entry.seatId === request.suspectSeatId) : undefined;
  const topic = request.action === "talk"
    ? after.topics.find((entry) => entry.nodeId === request.topicNodeId && entry.completed) : undefined;
  const statement = request.action === "focus_statement" || request.action === "press_statement" ||
    request.action === "present_record" || request.action === "object_statement"
    ? [...(before.court?.statements ?? []), ...(after.court?.statements ?? [])]
        .find((entry) => entry.statementId === request.statementId) : undefined;
  const record = request.action === "present_to_suspect" || request.action === "present_record" ||
    request.action === "object_statement"
    ? after.record.find((entry) => entry.admitted && entry.reference.kind === request.record.kind &&
        entry.reference.id === request.record.id)?.reference : undefined;
  return {
    version: 1,
    id: args.id,
    sequence: (before.publicActions?.at(-1)?.sequence ?? 0) + 1,
    occurredAt: args.occurredAt,
    action: request.action,
    revisionBefore: args.revision,
    revisionAfter: args.revision + 1,
    phaseBefore: before.playPhase,
    phaseAfter: after.playPhase,
    roomViewAfter: after.roomView,
    ...(room ? { roomId: room.id } : {}),
    ...(hotspot ? { hotspotId: hotspot.id } : {}),
    ...(suspect ? { suspectSeatId: suspect.seatId } : {}),
    ...(topic ? { topicNodeId: topic.nodeId } : {}),
    ...(statement ? { statementId: statement.statementId } : {}),
    ...(record ? { record: { kind: record.kind, id: record.id } } : {}),
    admittedRecords: after.record.filter((item) => item.admitted &&
      !priorRecord.has(`${item.reference.kind}:${item.reference.id}`))
      .map((item) => ({ kind: item.reference.kind, id: item.reference.id })),
    acquiredItemIds: (after.caseKit ?? []).filter((item) => !priorItems.has(item.id)).map((item) => item.id),
    dialogueIndexes: after.dialogueHistory.flatMap((_, index) =>
      index >= before.dialogueHistory.length ? [index] : []),
  };
}
