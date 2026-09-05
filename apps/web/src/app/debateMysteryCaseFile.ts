import type {
  DebateMysteryCaseKitItemV2,
  DebateMysteryPublicDialogueEntryV2,
  DebateMysteryPublicRecordItemV2,
  DebateMysteryRoomV2,
} from "@localai/shared";

export interface DebateMysteryCaseFileObservationV2 {
  id: string;
  occurredAt: string;
  roomId: string;
  roomName: string;
  text: string;
}

export type DebateMysteryAcquisitionV2 =
  | { kind: "case_kit"; item: DebateMysteryCaseKitItemV2 }
  | { kind: "record"; item: DebateMysteryPublicRecordItemV2 };

export type DebateMysteryCaseFileUpdateV2 = DebateMysteryAcquisitionV2 |
  { kind: "observation"; observation: DebateMysteryCaseFileObservationV2 };

export function debateMysteryCaseFileObservationsV2(args: {
  dialogueHistory: readonly DebateMysteryPublicDialogueEntryV2[];
  rooms: readonly Pick<DebateMysteryRoomV2, "id" | "name">[];
}): DebateMysteryCaseFileObservationV2[] {
  const roomsByLongestId = [...args.rooms].sort(
    (left, right) => right.id.length - left.id.length,
  );
  return args.dialogueHistory.flatMap((entry) => {
    // The server records this small public projection as it applies the
    // hotspot's public effects. Never infer relevance from the observation
    // prose or reach into the sealed case graph here.
    if (!entry.nodeId.startsWith("examine-") || !entry.caseFileRelevant) return [];
    const room = roomsByLongestId.find((candidate) =>
      entry.nodeId.startsWith(`examine-${candidate.id}-`));
    const text = entry.visibleText.replace(/\s+/gu, " ").trim();
    if (!room || !text) return [];
    return [{
      id: `${entry.nodeId}:${entry.occurredAt}`,
      occurredAt: entry.occurredAt,
      roomId: room.id,
      roomName: room.name,
      text,
    }];
  });
}

export function debateMysteryNewAcquisitionV2(args: {
  previousCaseKit?: readonly DebateMysteryCaseKitItemV2[];
  previousRecord: readonly DebateMysteryPublicRecordItemV2[];
  nextCaseKit?: readonly DebateMysteryCaseKitItemV2[];
  nextRecord: readonly DebateMysteryPublicRecordItemV2[];
}): DebateMysteryAcquisitionV2 | null {
  const previousItemIds = new Set(
    (args.previousCaseKit ?? []).map((item) => item.id),
  );
  const acquiredItem = (args.nextCaseKit ?? []).find(
    (item) => !previousItemIds.has(item.id),
  );
  if (acquiredItem) return { kind: "case_kit", item: acquiredItem };

  const previousRecordKeys = new Set(
    args.previousRecord
      .filter((item) => item.admitted)
      .map((item) => `${item.reference.kind}:${item.reference.id}`),
  );
  const acquiredRecord = args.nextRecord.find(
    (item) => item.admitted &&
      !previousRecordKeys.has(`${item.reference.kind}:${item.reference.id}`),
  );
  return acquiredRecord ? { kind: "record", item: acquiredRecord } : null;
}

export function debateMysteryNewCaseFileUpdateV2(args: {
  previousDialogueHistory: readonly DebateMysteryPublicDialogueEntryV2[];
  previousCaseKit?: readonly DebateMysteryCaseKitItemV2[];
  previousRecord: readonly DebateMysteryPublicRecordItemV2[];
  nextDialogueHistory: readonly DebateMysteryPublicDialogueEntryV2[];
  nextCaseKit?: readonly DebateMysteryCaseKitItemV2[];
  nextRecord: readonly DebateMysteryPublicRecordItemV2[];
  rooms: readonly Pick<DebateMysteryRoomV2, "id" | "name">[];
}): DebateMysteryCaseFileUpdateV2 | null {
  const acquisition = debateMysteryNewAcquisitionV2(args);
  if (acquisition) return acquisition;

  const previousObservationIds = new Set(
    debateMysteryCaseFileObservationsV2({
      dialogueHistory: args.previousDialogueHistory,
      rooms: args.rooms,
    }).map((observation) => observation.id),
  );
  const observation = debateMysteryCaseFileObservationsV2({
    dialogueHistory: args.nextDialogueHistory,
    rooms: args.rooms,
  }).findLast((candidate) => !previousObservationIds.has(candidate.id));
  return observation ? { kind: "observation", observation } : null;
}
