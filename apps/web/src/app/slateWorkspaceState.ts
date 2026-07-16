import type {
  SlateContinuityConcernCard,
  SlateContinuityConcernResolveRequest,
  SlateRevision,
  SlateRevisionAction,
  SlateRevisionScope,
  SlateReturnSession,
  SlateReturnSessionSynopsis,
  SlateSectionDetail,
  SlateSectionSummary,
  SlateStructureItem,
} from "@localai/shared";

export type SlateProjectStartStep = "source" | "title";

const SLATE_PROJECT_SPARK_MAX = 8_000;

export function slateProjectSourceIsReady({
  spark,
  existingMaterial,
}: {
  spark: string;
  existingMaterial: string;
}): boolean {
  return spark.trim().length > 0 || existingMaterial.trim().length > 0;
}

function titleCaseSlateWords(value: string): string {
  const minorWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to"]);
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && minorWords.has(word.toLowerCase())) return word.toLowerCase();
      return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
    })
    .join(" ");
}

export function slateSuggestedProjectTitle({
  title,
  spark,
  existingMaterial,
}: {
  title: string;
  spark: string;
  existingMaterial: string;
}): string {
  const supplied = title.trim();
  if (supplied) return supplied.slice(0, 180);

  const firstLine = (spark.trim() || existingMaterial.trim())
    .split(/\r?\n/u)
    .find((line) => line.trim())
    ?.trim()
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^(?:write|tell)\s+(?:me\s+)?(?:a\s+)?story\s+(?:about|where)\s+/iu, "")
    .split(/[.!?]/u, 1)[0]
    ?.trim();
  if (!firstLine) return "Untitled Story";

  const words = firstLine.split(/\s+/u).filter(Boolean).slice(0, 7);
  const candidate = titleCaseSlateWords(words.join(" "))
    .replace(/[,;:\-]+$/u, "")
    .replace(/\s+(?:a|an|and|as|at|but|by|for|in|of|on|or|the|to)$/iu, "");
  return (candidate || "Untitled Story").slice(0, 180);
}

export function slateProjectSparkForCreation({
  spark,
  existingMaterial,
}: {
  spark: string;
  existingMaterial: string;
}): string {
  return (spark.trim() || existingMaterial.trim()).slice(0, SLATE_PROJECT_SPARK_MAX);
}

export function slateProjectTitleForCreation(
  title: string,
  fallback = "Untitled Story",
): string {
  return (title.trim() || fallback).slice(0, 180);
}

export function slateRevisionActionForDirection({
  direction,
  selectionLength,
}: {
  direction: string;
  selectionLength: number;
}): SlateRevisionAction {
  const normalized = direction.trim().toLowerCase();
  const requested = [
    ["cut", /\b(?:cut|delete|drop|remove)\b/u],
    ["condense", /\b(?:condense|shorten|tighten|trim)\b/u],
    ["deepen", /\b(?:deepen|expand|linger|more detail)\b/u],
    ["reframe", /\b(?:reframe|perspective|point of view|pov)\b/u],
    ["rewrite", /\b(?:rewrite|redo|start over)\b/u],
  ] as const;
  for (const [action, pattern] of requested) {
    if (pattern.test(normalized)) return action;
  }
  if (selectionLength > 0 && selectionLength <= 280) return "deepen";
  if (selectionLength >= 1_200) return "condense";
  return "rewrite";
}

export function slateSectionForStructure(
  sections: readonly SlateSectionSummary[],
  structureItemId: string | null,
): SlateSectionSummary | null {
  if (!structureItemId) return null;
  return sections.find((section) => section.structureItemId === structureItemId) ?? null;
}

export type SlateWorkspaceExportScopeChoice =
  | "book"
  | "focused"
  | "selection";

export function slateExportScopeForWorkspace({
  choice,
  section,
  selectionStart,
  selectionEnd,
}: {
  choice: SlateWorkspaceExportScopeChoice;
  section: Pick<SlateSectionDetail, "id" | "kind" | "prose"> | null;
  selectionStart: number;
  selectionEnd: number;
}):
  | { kind: "book" }
  | { kind: "act" | "chapter" | "scene"; sectionId: string }
  | { kind: "selection"; sectionId: string; start: number; end: number }
  | null {
  if (choice === "book") return { kind: "book" };
  if (!section) return null;
  if (choice === "selection") {
    if (
      selectionStart < 0 ||
      selectionEnd <= selectionStart ||
      selectionEnd > section.prose.length
    ) {
      return null;
    }
    return {
      kind: "selection",
      sectionId: section.id,
      start: selectionStart,
      end: selectionEnd,
    };
  }
  return {
    kind:
      section.kind === "act" || section.kind === "chapter"
        ? section.kind
        : "scene",
    sectionId: section.id,
  };
}

export function slateSectionEditableFingerprint(
  section: Pick<SlateSectionDetail, "id" | "prose" | "lockedRanges">,
): string {
  return JSON.stringify({
    id: section.id,
    prose: section.prose,
    lockedRanges: section.lockedRanges,
  });
}

export function mergeSavedSlateSection(
  local: SlateSectionDetail,
  saved: SlateSectionDetail,
  savedFingerprint: string,
): SlateSectionDetail {
  if (
    local.id !== saved.id ||
    slateSectionEditableFingerprint(local) === savedFingerprint
  ) {
    return saved;
  }
  return {
    ...saved,
    prose: local.prose,
    proseLength: local.prose.length,
    lockedRanges: local.lockedRanges,
  };
}

export function slateProjectOffsetsForSectionSelection(
  sections: readonly SlateSectionDetail[],
  sectionId: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const projected = sections
    .map((section) => {
      const prose = section.prose;
      const titlePrefix =
        section.kind === "imported" ? "" : `${section.title}\n\n`;
      return { section, prose, titlePrefix };
    })
    .filter((part) => part.prose.trim().length > 0);
  let offset = 0;
  for (const [index, part] of projected.entries()) {
    if (part.section.id === sectionId) {
      const localStart = Math.max(
        0,
        Math.min(part.prose.length, selectionStart),
      );
      const localEnd = Math.max(
        0,
        Math.min(part.prose.length, selectionEnd),
      );
      if (localEnd <= localStart) return null;
      return {
        start: offset + part.titlePrefix.length + localStart,
        end: offset + part.titlePrefix.length + localEnd,
      };
    }
    offset += part.titlePrefix.length + part.prose.length;
    if (index < projected.length - 1) offset += 3;
  }
  return null;
}

export function reorderSlateStructure(
  structure: readonly SlateStructureItem[],
  itemId: string,
  direction: -1 | 1,
): SlateStructureItem[] {
  const index = structure.findIndex((item) => item.id === itemId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= structure.length) return [...structure];
  const next = [...structure];
  const [item] = next.splice(index, 1);
  if (!item) return [...structure];
  next.splice(target, 0, item);
  return next;
}

export function latestPendingSlateRevision(
  revisions: readonly SlateRevision[],
): SlateRevision | null {
  return revisions.find((revision) => revision.status === "pending") ?? null;
}

export function slateRevisionScopeForWorkspace({
  selectionStart,
  selectionEnd,
  selectedStructureItem,
}: {
  selectionStart: number;
  selectionEnd: number;
  selectedStructureItem: SlateStructureItem | null;
}): SlateRevisionScope {
  if (selectionEnd > selectionStart) return "selection";
  if (selectedStructureItem?.status === "drafted") return "scene";
  return "project";
}

export function slateReturnSplashShouldShow({
  session,
  selectedProjectId,
  dismissedSessionId,
}: {
  session: Pick<SlateReturnSession, "id" | "projectId" | "isCurrent"> | null;
  selectedProjectId: string | null;
  dismissedSessionId: string | null;
}): boolean {
  return Boolean(
    session?.isCurrent &&
      selectedProjectId &&
      session.projectId === selectedProjectId &&
      session.id !== dismissedSessionId,
  );
}

export function slateReturnSplashDismissalId(
  session: Pick<SlateReturnSession, "id" | "projectId" | "isCurrent"> | null,
  selectedProjectId: string | null,
): string | null {
  if (
    !session?.isCurrent ||
    !selectedProjectId ||
    session.projectId !== selectedProjectId
  ) {
    return null;
  }
  return session.id;
}

export function slateReturnNextCardSectionId({
  synopsis,
  sections,
  currentSectionId,
}: {
  synopsis:
    | Pick<
        SlateReturnSessionSynopsis,
        "nextCard" | "threads" | "nextPlannedSection" | "mostRecentSection"
      >
    | null;
  sections: readonly Pick<SlateSectionSummary, "id">[];
  currentSectionId: string | null;
}): string | null {
  const availableIds = new Set(sections.map((section) => section.id));
  const available = (id: string | null | undefined): string | null =>
    id && availableIds.has(id) ? id : null;
  if (!synopsis) return available(currentSectionId);

  if (synopsis.nextCard.target.kind === "section") {
    const target = available(synopsis.nextCard.target.id);
    if (target) return target;
  }

  if (synopsis.nextCard.target.kind === "thread") {
    const thread = [...synopsis.threads.due, ...synopsis.threads.open].find(
      (candidate) => candidate.id === synopsis.nextCard.target.id,
    );
    const dueSection = available(thread?.dueSectionId);
    if (dueSection) return dueSection;
  }

  if (synopsis.nextCard.kind === "draft_section") {
    return (
      available(synopsis.nextPlannedSection?.id) ??
      available(currentSectionId)
    );
  }
  if (
    synopsis.nextCard.kind === "refine_section" ||
    synopsis.nextCard.kind === "review_revision"
  ) {
    return (
      available(synopsis.mostRecentSection?.id) ??
      available(currentSectionId)
    );
  }

  // Concerns and project-level cards should not pull the writer away from the
  // passage they are already reading. A fetched concern can focus its passage.
  return available(currentSectionId);
}

export function slateContinuityConcernSectionId({
  concern,
  sections,
  currentSectionId,
}: {
  concern: Pick<SlateContinuityConcernCard, "passages"> | null;
  sections: readonly Pick<SlateSectionSummary, "id">[];
  currentSectionId: string | null;
}): string | null {
  const availableIds = new Set(sections.map((section) => section.id));
  const passageSectionId = concern?.passages.find(
    (passage) => passage.sectionId && availableIds.has(passage.sectionId),
  )?.sectionId;
  if (passageSectionId) return passageSectionId;
  return currentSectionId && availableIds.has(currentSectionId)
    ? currentSectionId
    : null;
}

export function slateConcernResolveRequestForDirection(
  concern: Pick<SlateContinuityConcernCard, "suggestedAction"> | null,
  direction: string,
): SlateContinuityConcernResolveRequest | null {
  if (!concern) return null;
  const normalizedDirection = direction.normalize("NFKC").trim();
  if (normalizedDirection) {
    // Let the server infer the internal resolution from natural language so
    // the writer does not have to operate a row of Continuity controls.
    return { direction: normalizedDirection };
  }
  if (
    concern.suggestedAction.kind === "revise_prose" ||
    concern.suggestedAction.kind === "defer_thread" ||
    concern.suggestedAction.kind === "dismiss_extraction"
  ) {
    return { resolutionKind: concern.suggestedAction.kind };
  }
  return null;
}
