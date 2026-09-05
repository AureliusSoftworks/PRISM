import type { DebateWhodunnitFormatStateV2 } from "@localai/shared";

/**
 * Which Case File items this suspect has already been shown. The public
 * action log is the primary record; a session whose log is incomplete falls
 * back to the Present prompt node ids in the dialogue history. The unmatched
 * "default" Present node names no item and is left out.
 */
export function mysteryPresentedRecordKeysV1(
  state: Pick<DebateWhodunnitFormatStateV2, "publicActions" | "dialogueHistory">,
  suspectSeatId: string | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!suspectSeatId) return keys;
  for (const action of state.publicActions ?? []) {
    if (action.action === "present_to_suspect" && action.suspectSeatId === suspectSeatId && action.record) {
      keys.add(`${action.record.kind}:${action.record.id}`);
    }
  }
  const prefix = `present-${suspectSeatId}-`;
  const gatePrefix = `present-gate-${suspectSeatId}-`;
  for (const entry of state.dialogueHistory) {
    const rest = entry.nodeId.startsWith(prefix)
      ? entry.nodeId.slice(prefix.length)
      : entry.nodeId.startsWith(gatePrefix)
        ? entry.nodeId.slice(gatePrefix.length)
        : null;
    if (!rest) continue;
    const match = rest.match(/^(evidence|testimony)-(.+?)(?:-record)?$/u);
    if (match) keys.add(`${match[1]}:${match[2]}`);
  }
  return keys;
}

/** Items already put to the witness against this statement, from the public action log. */
export function mysteryCourtPresentedRecordKeysV1(
  state: Pick<DebateWhodunnitFormatStateV2, "publicActions">,
  statementId: string | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!statementId) return keys;
  for (const action of state.publicActions ?? []) {
    if (
      (action.action === "object_statement" || action.action === "present_record") &&
      action.statementId === statementId &&
      action.record
    ) {
      keys.add(`${action.record.kind}:${action.record.id}`);
    }
  }
  return keys;
}
