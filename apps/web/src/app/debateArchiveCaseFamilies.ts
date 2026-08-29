import type {
  DebateFormatId,
  DebateSessionListItemV1,
} from "@localai/shared";

export interface DebateArchiveSessionGroup {
  key: string;
  representative: DebateSessionListItemV1;
  runs: DebateSessionListItemV1[];
  isMysteryCaseFamily: boolean;
  openRun: DebateSessionListItemV1 | null;
  latestCompletedRun: DebateSessionListItemV1 | null;
  updatedAt: string;
}

export interface DebateArchiveFormatShelf {
  format: DebateFormatId;
  groups: DebateArchiveSessionGroup[];
  updatedAt: string;
}

export function debateArchiveProceedingActionLabel(
  group: DebateArchiveSessionGroup,
): string {
  const session = group.representative;
  if (session.mysteryForge) return "Open Case Forge";
  if (group.isMysteryCaseFamily) {
    return group.openRun
      ? `Return to Run ${group.openRun.mysteryRunOrdinal ?? group.runs.length}`
      : "Play again";
  }
  if (session.format === "whodunnit") {
    if (session.status === "completed") return "Open case Archive";
    if (session.mysteryProgress === "case_forge") return "Return to Case Forge";
    if (session.mysteryProgress === "trial") return "Return to court";
    return "Return to investigation";
  }
  if (session.status === "completed") return "Watch replay";
  if (session.awaitingDeferredStart) return "Start debate";
  if (session.status === "paused") return "Resume debate";
  return "Return to debate";
}

/** Coalesces only Whodunnit V2 runs; every other archived proceeding stays flat. */
export function groupDebateArchiveSessions(
  sessions: readonly DebateSessionListItemV1[],
): DebateArchiveSessionGroup[] {
  const buckets = new Map<string, DebateSessionListItemV1[]>();
  for (const session of sessions) {
    const familyId = session.format === "whodunnit" &&
      session.mysteryVersion === 2 &&
      session.mysteryCaseFamilyId?.trim()
      ? session.mysteryCaseFamilyId.trim()
      : null;
    const key = familyId ? `mystery-v2:${familyId}` : `session:${session.id}`;
    buckets.set(key, [...(buckets.get(key) ?? []), session]);
  }
  return [...buckets.entries()].map(([key, members]) => {
    const runs = [...members].sort((left, right) =>
      (right.mysteryRunOrdinal ?? 0) - (left.mysteryRunOrdinal ?? 0) ||
      right.updatedAt.localeCompare(left.updatedAt));
    const isMysteryCaseFamily = key.startsWith("mystery-v2:");
    const openRun = isMysteryCaseFamily
      ? runs.find((run) => run.status !== "completed" && run.status !== "cancelled") ?? null
      : null;
    const latestCompletedRun = [...runs]
      .filter((run) => run.status === "completed")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
    const updatedAt = runs.reduce(
      (latest, run) => run.updatedAt > latest ? run.updatedAt : latest,
      runs[0]?.updatedAt ?? "",
    );
    return {
      key,
      representative: openRun ?? latestCompletedRun ?? runs[0]!,
      runs,
      isMysteryCaseFamily,
      openRun,
      latestCompletedRun,
      updatedAt,
    };
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** Keeps the newest production shelf first while preserving newest-first cards. */
export function groupDebateArchiveSessionsByFormat(
  groups: readonly DebateArchiveSessionGroup[],
): DebateArchiveFormatShelf[] {
  const shelves = new Map<DebateFormatId, DebateArchiveSessionGroup[]>();
  for (const group of groups) {
    const format = group.representative.format;
    shelves.set(format, [...(shelves.get(format) ?? []), group]);
  }
  return [...shelves.entries()]
    .map(([format, formatGroups]) => ({
      format,
      groups: formatGroups,
      updatedAt: formatGroups.reduce(
        (latest, group) => (group.updatedAt > latest ? group.updatedAt : latest),
        formatGroups[0]?.updatedAt ?? "",
      ),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
