"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  PromptWildcardRunMetadata,
  SlateAiProvider,
  SlateContinuityConcernCard,
  SlateContinuityConcernNextResponse,
  SlateContinuityConcernResolveResponse,
  SlateLockedRange,
  SlateLivingSummary,
  SlateLivingSummaryResponse,
  SlateProjectChatMessage,
  SlateProjectChatResponse,
  SlateProjectDetail,
  SlateProjectListResponse,
  SlateProjectPatchRequest,
  SlateProjectResponse,
  SlateProjectSummary,
  SlateProseMode,
  SlateRevisionAction,
  SlateResolveSparkWildcardsResponse,
  SlateReturnSession,
  SlateReturnSessionResponse,
  SlateManuscriptPageResponse,
  SlateSectionDetail,
  SlateSectionListResponse,
  SlateSectionResponse,
  SlateSectionSummary,
  SlateStructureItem,
  SlateTitleSuggestionResponse,
} from "@localai/shared";
import { transformSlateLockedRangesForTextEdit } from "@localai/shared";
import { FolderOpen, Trash2 } from "lucide-react";
import {
  usePrismMenu,
  type PrismMenuAnchor,
} from "./PrismMenu";
import {
  latestPendingSlateRevision,
  mergeSavedSlateSection,
  reorderSlateStructure,
  slateConcernResolveRequestForDirection,
  slateContinuityConcernSectionId,
  slateExportScopeForWorkspace,
  slateProjectSourceIsReady,
  slateProjectSparkForCreation,
  slateProjectTitleForCreation,
  slateProjectOffsetsForSectionSelection,
  slateRevisionActionForDirection,
  slateRevisionScopeForWorkspace,
  slateReturnNextCardSectionId,
  slateReturnSplashDismissalId,
  slateReturnSplashShouldShow,
  slateSectionEditableFingerprint,
  slateSectionForStructure,
  slateSuggestedProjectTitle,
  type SlateProjectStartStep,
  type SlateWorkspaceExportScopeChoice,
} from "./slateWorkspaceState";
import styles from "./slateWorkspace.module.css";

interface SlateWorkspaceProps {
  className?: string;
  sidebarHeader: ReactNode;
  navigationHeader: ReactNode;
  theme: "light" | "dark";
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface SlateWildcardPreview {
  template: string;
  spark: string;
  sparkWildcards: PromptWildcardRunMetadata;
}

interface SlateSectionSaveAttempt {
  sectionId: string;
  expectedRevision: number;
  fingerprint: string;
  mutationId: string;
}

interface SlateSectionConflict {
  localSectionId: string;
  serverSection: SlateSectionDetail;
}

interface SlateArchiveImportCounts {
  revisions: number;
  versions: number;
  sections: number;
  sectionVersions: number;
  continuitySources: number;
  continuityEntities: number;
  continuityAliases: number;
  continuityClaims: number;
  continuityEvents: number;
  continuityRelationships: number;
  continuityKnowledge: number;
  continuityThreads: number;
  continuityConcerns: number;
  continuityGenerations: number;
}

interface SlateArchiveImportPreview {
  title: string;
  seriesTitle: string;
  exportedAt: string;
  counts: SlateArchiveImportCounts;
  willCreateCopy: true;
}

interface SlateArchivePreviewResponse {
  ok: true;
  preview: SlateArchiveImportPreview;
}

interface SlateArchiveImportResponse {
  ok: true;
  import: {
    projectId: string;
    title: string;
  };
}

interface SlateRecoveryStatusResponse {
  ok: true;
  recovery: {
    coordinator: {
      lastProtectedAt: string | null;
    } | null;
    newestVerifiedAt: string | null;
  };
}

interface SlateModelCatalogEntry {
  id: string;
  label: string;
  provider: SlateAiProvider;
  disabledReason?: string;
  imageSource?: string;
}

interface SlateModelCatalog {
  local: SlateModelCatalogEntry[];
  online: SlateModelCatalogEntry[];
  defaults: { local: string; online: string };
}

interface SlateModelCatalogResponse {
  ok: true;
  catalog: SlateModelCatalog;
}

interface SlateCompanionPosition {
  x: number;
  y: number;
}

class SlateApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    payload: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SlateApiError";
    this.status = status;
    this.code = typeof payload.code === "string" ? payload.code : null;
    this.payload = payload;
  }
}

const SLATE_WILDCARD_SUGGESTIONS = [
  "{PERSON}",
  "{PLACE}",
  "{OBJECT}",
  "{PROBLEM}",
  "{GENRE}",
  "{STYLE}",
] as const;

const SLATE_SUPPORTED_WILDCARD_RE = /\{[A-Z][A-Z0-9_ ]{1,63}\}/u;
const SLATE_KEEPALIVE_BODY_MAX_BYTES = 60_000;
const SLATE_ARCHIVE_MEDIA_TYPE = "application/vnd.prism.slate+zip";
const SLATE_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
const SLATE_COMPANION_POSITION_KEY = "prism_slate_companion_position_v1";
const SLATE_AUTO_MODEL_VALUE = "auto";
const SLATE_TITLE_REVIEW_INTERVAL_CHARS = 12_000;

function slateContinuityArchiveRowCount(counts: SlateArchiveImportCounts): number {
  return counts.continuitySources +
    counts.continuityEntities +
    counts.continuityAliases +
    counts.continuityClaims +
    counts.continuityEvents +
    counts.continuityRelationships +
    counts.continuityKnowledge +
    counts.continuityThreads +
    counts.continuityConcerns +
    counts.continuityGenerations;
}

async function slateApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new SlateApiError(
      typeof payload.error === "string" ? payload.error : "Slate could not complete that action.",
      response.status,
      payload,
    );
  }
  return payload as T;
}

async function loadSlateManuscriptSections(
  projectId: string,
): Promise<SlateSectionDetail[]> {
  const sections: SlateSectionDetail[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await slateApi<SlateManuscriptPageResponse>(
      `/api/slate/projects/${encodeURIComponent(projectId)}/manuscript?${query.toString()}`,
    );
    sections.push(...page.sections);
    cursor = page.nextCursor;
  } while (cursor);
  return sections;
}

function readableUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function revisionLabel(action: SlateRevisionAction): string {
  return `${action[0]?.toUpperCase() ?? ""}${action.slice(1)}`;
}

function slateModelChoiceValue(model: SlateModelCatalogEntry): string {
  return `${model.provider}:${model.id}`;
}

function readSlateCompanionPosition(): SlateCompanionPosition {
  if (typeof window === "undefined") return { x: 0.9, y: 0.82 };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SLATE_COMPANION_POSITION_KEY) ?? "null",
    ) as Partial<SlateCompanionPosition> | null;
    if (
      parsed &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number"
    ) {
      return {
        x: Math.max(0.08, Math.min(0.94, parsed.x)),
        y: Math.max(0.12, Math.min(0.9, parsed.y)),
      };
    }
  } catch {
    // A malformed device-local position falls back to the quiet lower corner.
  }
  return { x: 0.9, y: 0.82 };
}

export default function SlateWorkspace({
  className = "",
  sidebarHeader,
  navigationHeader,
  theme,
}: SlateWorkspaceProps): React.JSX.Element {
  const { activeMenu, openMenu, closeMenu } = usePrismMenu();
  const [projects, setProjects] = useState<SlateProjectSummary[]>([]);
  const [project, setProject] = useState<SlateProjectDetail | null>(null);
  const projectRef = useRef<SlateProjectDetail | null>(null);
  const [sections, setSections] = useState<SlateSectionSummary[]>([]);
  const [activeSection, setActiveSection] = useState<SlateSectionDetail | null>(null);
  const activeSectionRef = useRef<SlateSectionDetail | null>(null);
  const lastSavedSectionRef = useRef<SlateSectionDetail | null>(null);
  const pendingSectionSaveRef = useRef<SlateSectionSaveAttempt | null>(null);
  const [sectionConflict, setSectionConflict] = useState<SlateSectionConflict | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [projectStartStep, setProjectStartStep] =
    useState<SlateProjectStartStep>("source");
  const [existingMaterialOpen, setExistingMaterialOpen] = useState(false);
  const [earlyTitleOpen, setEarlyTitleOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [spark, setSpark] = useState("");
  const [wildcardMode, setWildcardMode] = useState(false);
  const [wildcardResolving, setWildcardResolving] = useState(false);
  const [wildcardPreview, setWildcardPreview] = useState<SlateWildcardPreview | null>(null);
  const [existingMaterial, setExistingMaterial] = useState("");
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [revisionDirection, setRevisionDirection] = useState("");
  const [draftDirection, setDraftDirection] = useState("");
  const [returnSession, setReturnSession] = useState<SlateReturnSession | null>(null);
  const [dismissedReturnSessionId, setDismissedReturnSessionId] =
    useState<string | null>(null);
  const [continuityConcern, setContinuityConcern] =
    useState<SlateContinuityConcernCard | null>(null);
  const [continuityDirection, setContinuityDirection] = useState("");
  const [resolvingConcern, setResolvingConcern] = useState(false);
  const snoozedConcernIdRef = useRef<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"docx" | "markdown" | "text">("docx");
  const [exportScopeChoice, setExportScopeChoice] =
    useState<SlateWorkspaceExportScopeChoice>("book");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [archivePreview, setArchivePreview] =
    useState<SlateArchiveImportPreview | null>(null);
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<SlateProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [protectedAt, setProtectedAt] = useState<string | null>(null);
  const [modelCatalog, setModelCatalog] = useState<SlateModelCatalog | null>(null);
  const [livingSummary, setLivingSummary] = useState<SlateLivingSummary | null>(null);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionMessages, setCompanionMessages] = useState<
    SlateProjectChatMessage[]
  >([]);
  const [companionDraft, setCompanionDraft] = useState("");
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionPosition, setCompanionPosition] =
    useState<SlateCompanionPosition>(readSlateCompanionPosition);
  const [titleSuggestionBusy, setTitleSuggestionBusy] = useState(false);
  const [titleSuggestionNotice, setTitleSuggestionNotice] = useState<
    string | null
  >(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const sectionSaveInFlightRef = useRef<Promise<void> | null>(null);
  const recoveryRefreshTimerRef = useRef<number | null>(null);
  const sparkTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const companionMessagesRef = useRef<HTMLDivElement | null>(null);
  const companionDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: SlateCompanionPosition;
    moved: boolean;
  } | null>(null);

  const adoptProject = useCallback((next: SlateProjectDetail): void => {
    projectRef.current = next;
    setProject(next);
    setSelectedStructureId((current) =>
      current && next.structure.some((item) => item.id === current)
        ? current
        : (next.structure[0]?.id ?? null),
    );
    setSelection({ start: 0, end: 0 });
  }, []);

  const adoptSection = useCallback((next: SlateSectionDetail): void => {
    activeSectionRef.current = next;
    lastSavedSectionRef.current = next;
    pendingSectionSaveRef.current = null;
    setActiveSection(next);
    setSectionConflict(null);
    setSelectedStructureId((current) => next.structureItemId ?? current);
    setSelection({ start: 0, end: 0 });
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const refreshProjects = useCallback(async (): Promise<SlateProjectSummary[]> => {
    const response = await slateApi<SlateProjectListResponse>("/api/slate/projects");
    setProjects(response.projects);
    return response.projects;
  }, []);

  const loadModelCatalog = useCallback(async (): Promise<void> => {
    try {
      const response = await slateApi<SlateModelCatalogResponse>("/api/models");
      setModelCatalog({
        ...response.catalog,
        local: response.catalog.local.filter((model) => !model.imageSource),
        online: response.catalog.online.filter((model) => !model.imageSource),
      });
    } catch {
      setModelCatalog(null);
    }
  }, []);

  const loadLivingSummary = useCallback(async (projectId: string): Promise<void> => {
    const response = await slateApi<SlateLivingSummaryResponse>(
      `/api/slate/projects/${encodeURIComponent(projectId)}/summary`,
    );
    if (projectRef.current?.id === projectId) setLivingSummary(response.summary);
  }, []);

  const loadCompanionMessages = useCallback(
    async (projectId: string): Promise<void> => {
      const response = await slateApi<SlateProjectChatResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/chat`,
      );
      if (projectRef.current?.id === projectId) {
        setCompanionMessages(response.messages);
      }
    },
    [],
  );

  useEffect(() => {
    void loadModelCatalog();
  }, [loadModelCatalog]);

  const loadRecoveryStatus = useCallback(async (projectId: string): Promise<void> => {
    try {
      const response = await slateApi<SlateRecoveryStatusResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/recovery/status`,
      );
      if (projectRef.current?.id !== projectId) return;
      const candidate =
        response.recovery.coordinator?.lastProtectedAt ??
        response.recovery.newestVerifiedAt;
      setProtectedAt(
        candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null,
      );
    } catch {
      // Recovery remains deliberately quiet while pending or unavailable.
    }
  }, []);

  const queueRecoveryStatusRefresh = useCallback((projectId: string): void => {
    if (recoveryRefreshTimerRef.current !== null) {
      window.clearTimeout(recoveryRefreshTimerRef.current);
    }
    recoveryRefreshTimerRef.current = window.setTimeout(() => {
      recoveryRefreshTimerRef.current = null;
      void loadRecoveryStatus(projectId);
    }, 2_100);
  }, [loadRecoveryStatus]);

  useEffect(() => () => {
    if (recoveryRefreshTimerRef.current !== null) {
      window.clearTimeout(recoveryRefreshTimerRef.current);
    }
  }, []);

  const flushPendingManuscriptSave = useCallback(async (
    options: { keepalive?: boolean } = {},
  ): Promise<void> => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (sectionSaveInFlightRef.current) {
      await sectionSaveInFlightRef.current;
    }
    const currentProject = projectRef.current;
    const current = activeSectionRef.current;
    const lastSaved = lastSavedSectionRef.current;
    if (!currentProject || !current || !lastSaved || current.id !== lastSaved.id) return;
    const fingerprint = slateSectionEditableFingerprint(current);
    if (fingerprint === slateSectionEditableFingerprint(lastSaved)) return;

    const previousAttempt = pendingSectionSaveRef.current;
    const attempt =
      previousAttempt?.sectionId === current.id &&
      previousAttempt.expectedRevision === current.revision &&
      previousAttempt.fingerprint === fingerprint
        ? previousAttempt
        : {
            sectionId: current.id,
            expectedRevision: current.revision,
            fingerprint,
            mutationId: crypto.randomUUID(),
          };
    pendingSectionSaveRef.current = attempt;
    const projectId = currentProject.id;
    const snapshot = current;
    const requestBody = JSON.stringify({
      expectedRevision: attempt.expectedRevision,
      mutationId: attempt.mutationId,
      prose: snapshot.prose,
      lockedRanges: snapshot.lockedRanges,
    });
    const keepalive =
      options.keepalive === true &&
      new TextEncoder().encode(requestBody).byteLength <=
        SLATE_KEEPALIVE_BODY_MAX_BYTES;
    setSaveState("saving");
    const save = slateApi<SlateSectionResponse>(
      `/api/slate/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(current.id)}`,
      {
        method: "PATCH",
        body: requestBody,
        keepalive,
      },
    )
      .then((response) => {
        const latest = activeSectionRef.current;
        lastSavedSectionRef.current = response.section;
        pendingSectionSaveRef.current = null;
        setSections((items) =>
          items.map((item) => (item.id === response.section.id ? response.section : item)),
        );
        if (latest?.id === response.section.id) {
          const merged = mergeSavedSlateSection(latest, response.section, fingerprint);
          activeSectionRef.current = merged;
          setActiveSection(merged);
          setSaveState(
            slateSectionEditableFingerprint(merged) ===
              slateSectionEditableFingerprint(response.section)
              ? "saved"
              : "saving",
          );
        }
        setSectionConflict(null);
        void refreshProjects();
        void loadLivingSummary(projectId).catch(() => undefined);
        queueRecoveryStatusRefresh(projectId);
      })
      .catch(async (cause) => {
        setSaveState("error");
        if (
          cause instanceof SlateApiError &&
          cause.status === 409 &&
          cause.code === "slate_section_revision_conflict"
        ) {
          pendingSectionSaveRef.current = null;
          try {
            const response = await slateApi<SlateSectionResponse>(
              `/api/slate/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(snapshot.id)}`,
            );
            setSectionConflict({
              localSectionId: snapshot.id,
              serverSection: response.section,
            });
          } catch {
            // The local draft remains in the editor even if conflict details cannot reload yet.
          }
          setError("This section changed elsewhere. Your edits are still here for you to choose.");
        } else {
          setError(cause instanceof Error ? cause.message : "Slate could not autosave.");
        }
        throw cause;
      })
      .finally(() => {
        if (sectionSaveInFlightRef.current === save) {
          sectionSaveInFlightRef.current = null;
        }
      });
    sectionSaveInFlightRef.current = save;
    await save;
  }, [loadLivingSummary, queueRecoveryStatusRefresh, refreshProjects]);

  const loadProjectSections = useCallback(
    async (
      projectId: string,
      preferredSectionId: string | null = null,
      preferredStructureId: string | null = null,
    ): Promise<void> => {
      const list = await slateApi<SlateSectionListResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/sections`,
      );
      setSections(list.sections);
      const preferred =
        list.sections.find((section) => section.id === preferredSectionId) ??
        slateSectionForStructure(list.sections, preferredStructureId) ??
        list.sections[0] ??
        null;
      if (!preferred) {
        activeSectionRef.current = null;
        lastSavedSectionRef.current = null;
        setActiveSection(null);
        return;
      }
      const response = await slateApi<SlateSectionResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(preferred.id)}`,
      );
      adoptSection(response.section);
    },
    [adoptSection],
  );

  const loadContinuityConcern = useCallback(
    async (projectId: string): Promise<SlateContinuityConcernCard | null> => {
      const response = await slateApi<SlateContinuityConcernNextResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/continuity/concerns/next`,
      );
      const next =
        response.concern?.id === snoozedConcernIdRef.current
          ? null
          : response.concern;
      setContinuityConcern(next);
      return next;
    },
    [],
  );

  const openReturnSession = useCallback(
    async (projectId: string): Promise<void> => {
      const response = await slateApi<SlateReturnSessionResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/return-sessions`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setReturnSession(response.session);
    },
    [],
  );

  const openProject = useCallback(
    async (projectId: string): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}`,
        );
        setProtectedAt(null);
        adoptProject(response.project);
        await loadProjectSections(projectId, null, response.project.structure[0]?.id ?? null);
        snoozedConcernIdRef.current = null;
        setContinuityDirection("");
        setReturnSession(null);
        setLivingSummary(null);
        setCompanionMessages([]);
        setCompanionDraft("");
        setDismissedReturnSessionId(null);
        setContinuityConcern(null);
        await Promise.allSettled([
          openReturnSession(projectId),
          loadLivingSummary(projectId),
          loadCompanionMessages(projectId),
          loadContinuityConcern(projectId),
          loadRecoveryStatus(projectId),
        ]);
        setSaveState("saved");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not open this project.");
      } finally {
        setBusy(false);
      }
    },
    [
      adoptProject,
      flushPendingManuscriptSave,
      loadContinuityConcern,
      loadCompanionMessages,
      loadLivingSummary,
      loadRecoveryStatus,
      loadProjectSections,
      openReturnSession,
    ],
  );

  const openProjectActionsMenu = useCallback(
    (item: SlateProjectSummary, anchor: PrismMenuAnchor): void => {
      const menuId = `slate-project-actions-${item.id}`;
      openMenu({
        id: menuId,
        label: `Actions for ${item.title}`,
        anchor,
        accent: "#9eb8ff",
        theme,
        focusRestoreTarget:
          anchor.kind === "element" ? anchor.element : null,
        entries: [
          {
            id: "open-project",
            icon: <FolderOpen />,
            label: "Open project",
            onSelect: () => openProject(item.id),
          },
          { id: "delete-project-separator", kind: "separator" },
          {
            id: "delete-project",
            icon: <Trash2 />,
            label: "Delete project",
            tone: "danger",
            onSelect: () => setProjectPendingDeletion(item),
          },
        ],
      });
    },
    [openMenu, openProject, theme],
  );

  useEffect(() => {
    let cancelled = false;
    void refreshProjects()
      .then(async (items) => {
        if (!cancelled && items[0]) await openProject(items[0].id);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Slate could not load projects.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openProject, refreshProjects]);

  useEffect(() => {
    if (!project?.id) return;
    const projectId = project.id;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadContinuityConcern(projectId).catch(() => undefined);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadContinuityConcern, project?.id]);

  const patchProject = useCallback(
    async (patch: SlateProjectPatchRequest): Promise<SlateProjectDetail> => {
      const current = projectRef.current;
      if (!current) throw new Error("Open a Slate project first.");
      const response = await slateApi<SlateProjectResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      adoptProject(response.project);
      setSaveState("saved");
      void refreshProjects();
      queueRecoveryStatusRefresh(current.id);
      return response.project;
    },
    [adoptProject, queueRecoveryStatusRefresh, refreshProjects],
  );

  useEffect(() => {
    if (!activeSection || !lastSavedSectionRef.current) return;
    if (
      slateSectionEditableFingerprint(activeSection) ===
      slateSectionEditableFingerprint(lastSavedSectionRef.current)
    ) {
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushPendingManuscriptSave().catch(() => undefined);
    }, 650);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [activeSection, flushPendingManuscriptSave]);

  useEffect(() => {
    const preservePendingEditsOnPageHide = (): void => {
      void flushPendingManuscriptSave({ keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", preservePendingEditsOnPageHide);
    return () => {
      window.removeEventListener("pagehide", preservePendingEditsOnPageHide);
      // Applet switches unmount Slate while the document remains alive, so the
      // ordinary authenticated request can finish without a keepalive size cap.
      void flushPendingManuscriptSave().catch(() => undefined);
    };
  }, [flushPendingManuscriptSave]);

  const openSection = useCallback(
    async (sectionId: string): Promise<void> => {
      const currentProject = projectRef.current;
      if (!currentProject || activeSectionRef.current?.id === sectionId) return;
      setBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateSectionResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/sections/${encodeURIComponent(sectionId)}`,
        );
        adoptSection(response.section);
        setSaveState("saved");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not open that section.");
      } finally {
        setBusy(false);
      }
    },
    [adoptSection, flushPendingManuscriptSave],
  );

  const runProjectOperation = useCallback(
    async (path: string, body: Record<string, unknown> = {}): Promise<void> => {
      const current = projectRef.current;
      if (!current) return;
      setBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(current.id)}${path}`,
          { method: "POST", body: JSON.stringify(body) },
        );
        const focusedSectionId = activeSectionRef.current?.id ?? null;
        const focusedStructureId = activeSectionRef.current?.structureItemId ?? selectedStructureId;
        adoptProject(response.project);
        await loadProjectSections(current.id, focusedSectionId, focusedStructureId);
        void loadContinuityConcern(current.id).catch(() => undefined);
        void loadLivingSummary(current.id).catch(() => undefined);
        setSaveState("saved");
        void refreshProjects();
        queueRecoveryStatusRefresh(current.id);
      } catch (cause) {
        if (
          cause instanceof SlateApiError &&
          cause.status === 409 &&
          cause.code === "slate_section_ai_write_conflict"
        ) {
          const local = activeSectionRef.current;
          if (local) {
            try {
              const response = await slateApi<SlateSectionResponse>(
                `/api/slate/projects/${encodeURIComponent(current.id)}/sections/${encodeURIComponent(local.id)}`,
              );
              if (
                slateSectionEditableFingerprint(local) ===
                slateSectionEditableFingerprint(response.section)
              ) {
                adoptSection(response.section);
                setSaveState("saved");
              } else {
                setSectionConflict({
                  localSectionId: local.id,
                  serverSection: response.section,
                });
                setSaveState("error");
              }
            } catch {
              // Keep the local editor state available when the comparison cannot reload.
            }
          }
        } else if (
          cause instanceof SlateApiError &&
          cause.status === 409 &&
          cause.code === "slate_shape_write_conflict"
        ) {
          try {
            const response = await slateApi<SlateProjectResponse>(
              `/api/slate/projects/${encodeURIComponent(current.id)}`,
            );
            adoptProject(response.project);
            await loadProjectSections(
              current.id,
              activeSectionRef.current?.id ?? null,
              selectedStructureId,
            );
            setSaveState("saved");
            void refreshProjects();
          } catch {
            // Preserve the visible workspace if the authoritative reload fails.
          }
        }
        setError(cause instanceof Error ? cause.message : "Slate could not complete that action.");
      } finally {
        setBusy(false);
      }
    },
    [
      adoptSection,
      adoptProject,
      flushPendingManuscriptSave,
      loadProjectSections,
      loadContinuityConcern,
      loadLivingSummary,
      queueRecoveryStatusRefresh,
      refreshProjects,
      selectedStructureId,
    ],
  );

  const saveProseMode = async (mode: SlateProseMode): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await patchProject({
        proseMode: mode,
        proseModel: null,
        proseProvider: null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not save prose routing.");
    } finally {
      setBusy(false);
    }
  };

  const saveProseModel = async (choice: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (choice === SLATE_AUTO_MODEL_VALUE) {
        await patchProject({ proseModel: null, proseProvider: null });
      } else {
        const separator = choice.indexOf(":");
        const provider = choice.slice(0, separator) as SlateAiProvider;
        const model = choice.slice(separator + 1);
        await patchProject({ proseModel: model, proseProvider: provider });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not save that model.");
    } finally {
      setBusy(false);
    }
  };

  const sendCompanionMessage = async (): Promise<void> => {
    const current = projectRef.current;
    const content = companionDraft.trim();
    if (!current || !content || companionBusy) return;
    setCompanionBusy(true);
    setCompanionDraft("");
    setError(null);
    try {
      await flushPendingManuscriptSave();
      const response = await slateApi<SlateProjectChatResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}/chat`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      if (projectRef.current?.id === current.id) {
        setCompanionMessages(response.messages);
      }
    } catch (cause) {
      setCompanionDraft(content);
      setError(cause instanceof Error ? cause.message : "Prism could not answer here.");
    } finally {
      setCompanionBusy(false);
    }
  };

  const requestTitleSuggestion = useCallback(async (
    options: { quiet?: boolean } = {},
  ): Promise<void> => {
    const current = projectRef.current;
    if (!current || titleSuggestionBusy) return;
    setTitleSuggestionBusy(true);
    setTitleSuggestionNotice(null);
    setError(null);
    try {
      await flushPendingManuscriptSave();
      const response = await slateApi<SlateTitleSuggestionResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}/title-suggestions`,
        { method: "POST", body: JSON.stringify({}) },
      );
      adoptProject(response.project);
      if (!options.quiet) {
        setTitleSuggestionNotice(
          response.project.titleSuggestion
            ? null
            : "Prism thinks the current title still fits.",
        );
      }
    } catch (cause) {
      if (!options.quiet) {
        setError(cause instanceof Error ? cause.message : "Prism could not reconsider the title.");
      }
    } finally {
      setTitleSuggestionBusy(false);
    }
  }, [adoptProject, flushPendingManuscriptSave, titleSuggestionBusy]);

  const resolveTitleSuggestion = async (
    resolution: "accepted" | "dismissed",
  ): Promise<void> => {
    const current = projectRef.current;
    const suggestion = current?.titleSuggestion;
    if (!current || !suggestion || titleSuggestionBusy) return;
    setTitleSuggestionBusy(true);
    setError(null);
    try {
      const response = await slateApi<SlateTitleSuggestionResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}/title-suggestions/${encodeURIComponent(suggestion.id)}/${resolution}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      adoptProject(response.project);
      setTitleSuggestionNotice(
        resolution === "accepted" ? "Title updated." : "Suggestion set aside.",
      );
      void refreshProjects();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not resolve that title idea.");
    } finally {
      setTitleSuggestionBusy(false);
    }
  };

  const beginCompanionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    companionDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: companionPosition,
      moved: false,
    };
  };

  const moveCompanion = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = companionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    setCompanionPosition({
      x: Math.max(0.04, Math.min(0.96, drag.origin.x + dx / window.innerWidth)),
      y: Math.max(0.12, Math.min(0.92, drag.origin.y + dy / window.innerHeight)),
    });
  };

  const endCompanionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = companionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    companionDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.localStorage.setItem(
      SLATE_COMPANION_POSITION_KEY,
      JSON.stringify(companionPosition),
    );
    if (!drag.moved) setCompanionOpen((current) => !current);
  };

  useEffect(() => {
    const node = companionMessagesRef.current;
    if (companionOpen && node) node.scrollTop = node.scrollHeight;
  }, [companionMessages, companionOpen]);

  const resolveSparkWildcards = async (force = false): Promise<SlateWildcardPreview> => {
    const template = spark.trim();
    if (!SLATE_SUPPORTED_WILDCARD_RE.test(template)) {
      throw new Error("Add an uppercase wildcard such as {PERSON}, {PLACE}, or {PROBLEM} first.");
    }
    if (!force && wildcardPreview?.template === template) return wildcardPreview;
    const response = await slateApi<SlateResolveSparkWildcardsResponse>(
      "/api/slate/wildcards/resolve",
      {
        method: "POST",
        body: JSON.stringify({ template }),
      },
    );
    const preview = {
      template,
      spark: response.spark,
      sparkWildcards: response.sparkWildcards,
    };
    setWildcardPreview(preview);
    return preview;
  };

  const rollSparkWildcards = async (): Promise<void> => {
    setWildcardResolving(true);
    setError(null);
    try {
      await resolveSparkWildcards(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not roll those wildcards.");
    } finally {
      setWildcardResolving(false);
    }
  };

  const insertSparkWildcard = (token: string): void => {
    const textarea = sparkTextareaRef.current;
    const start = textarea?.selectionStart ?? spark.length;
    const end = textarea?.selectionEnd ?? start;
    const before = spark.slice(0, start);
    const after = spark.slice(end);
    const prefix = before && !/\s$/u.test(before) ? " " : "";
    const suffix = after && !/^\s/u.test(after) ? " " : "";
    const insertion = `${prefix}${token}${suffix}`;
    const nextSpark = `${before}${insertion}${after}`;
    const nextCaret = before.length + insertion.length;
    setSpark(nextSpark);
    setWildcardPreview(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const advanceProjectStart = async (): Promise<void> => {
    if (!slateProjectSourceIsReady({ spark, existingMaterial })) {
      setError("Begin with a creative spark or bring in material you already have.");
      return;
    }
    const hasWildcards = SLATE_SUPPORTED_WILDCARD_RE.test(spark);
    setError(null);
    setWildcardResolving(hasWildcards);
    try {
      const wildcardCreation = hasWildcards ? await resolveSparkWildcards() : null;
      const sourceSpark = wildcardCreation?.spark ?? slateProjectSparkForCreation({
        spark,
        existingMaterial,
      });
      setTitle((current) =>
        slateSuggestedProjectTitle({
          title: current,
          spark: sourceSpark,
          existingMaterial,
        }),
      );
      setProjectStartStep("title");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not prepare that beginning.");
    } finally {
      setWildcardResolving(false);
    }
  };

  const createProject = async (titleOverride?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const wildcardCreation = SLATE_SUPPORTED_WILDCARD_RE.test(spark)
        ? await resolveSparkWildcards()
        : null;
      const creationSpark = wildcardCreation?.spark ?? slateProjectSparkForCreation({
        spark,
        existingMaterial,
      });
      let response = await slateApi<SlateProjectResponse>("/api/slate/projects", {
        method: "POST",
        body: JSON.stringify({
          title: slateProjectTitleForCreation(titleOverride ?? title),
          spark: creationSpark,
          ...(wildcardCreation
            ? { sparkWildcards: wildcardCreation.sparkWildcards }
            : {}),
        }),
      });
      if (existingMaterial.trim()) {
        response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(response.project.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              manuscript: existingMaterial,
              phase: "shape",
            }),
          },
        );
      }
      adoptProject(response.project);
      setReturnSession(null);
      setDismissedReturnSessionId(null);
      setContinuityConcern(null);
      snoozedConcernIdRef.current = null;
      await loadProjectSections(
        response.project.id,
        null,
        response.project.structure[0]?.id ?? null,
      );
      await loadLivingSummary(response.project.id);
      setCompanionMessages([]);
      setTitle("");
      setSpark("");
      setProjectStartStep("source");
      setExistingMaterialOpen(false);
      setEarlyTitleOpen(false);
      setWildcardMode(false);
      setWildcardPreview(null);
      setExistingMaterial("");
      setSaveState("saved");
      await refreshProjects();
      queueRecoveryStatusRefresh(response.project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not create the project.");
    } finally {
      setBusy(false);
    }
  };

  const saveStructure = async (structure: SlateStructureItem[]): Promise<void> => {
    if (!projectRef.current) return;
    setProject((current) => (current ? { ...current, structure } : current));
    setBusy(true);
    setError(null);
    try {
      await patchProject({ structure });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not save the structure.");
    } finally {
      setBusy(false);
    }
  };

  const mutateStructureItem = (
    itemId: string,
    patch: Partial<SlateStructureItem>,
  ): void => {
    setProject((current) =>
      current
        ? {
            ...current,
            structure: current.structure.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  };

  const addScene = (): void => {
    if (!project) return;
    const item: SlateStructureItem = {
      id: crypto.randomUUID(),
      kind: "scene",
      title: `Scene ${project.structure.filter((candidate) => candidate.kind === "scene").length + 1}`,
      summary: "Describe what changes in this scene.",
      direction: "",
      status: "planned",
      locked: false,
    };
    const next = [...project.structure, item];
    setSelectedStructureId(item.id);
    void saveStructure(next);
  };

  const lockSelection = (): void => {
    const current = activeSectionRef.current;
    if (!current || selection.end <= selection.start) return;
    const lockedRanges: SlateLockedRange[] = [
      ...current.lockedRanges,
      {
        id: crypto.randomUUID(),
        start: selection.start,
        end: selection.end,
        label: current.prose.slice(selection.start, selection.end).slice(0, 48),
      },
    ];
    const next = { ...current, lockedRanges };
    activeSectionRef.current = next;
    setActiveSection(next);
    setSaveState("saving");
  };

  const selectedStructureItem = useMemo(
    () => project?.structure.find((item) => item.id === selectedStructureId) ?? null,
    [project?.structure, selectedStructureId],
  );
  const pendingRevision = useMemo(
    () => latestPendingSlateRevision(project?.revisions ?? []),
    [project?.revisions],
  );
  const revisionScope = slateRevisionScopeForWorkspace({
    selectionStart: selection.start,
    selectionEnd: selection.end,
    selectedStructureItem,
  });
  const revisionAction = useMemo(
    () =>
      slateRevisionActionForDirection({
        direction: revisionDirection,
        selectionLength: Math.max(0, selection.end - selection.start),
      }),
    [revisionDirection, selection.end, selection.start],
  );

  const requestRevision = (): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection) return;
      try {
        await flushPendingManuscriptSave();
        const body: Record<string, unknown> = {
          action: revisionAction,
          scope: revisionScope,
          direction: revisionDirection,
        };
        if (revisionScope === "selection") {
          const manuscriptSections = await loadSlateManuscriptSections(currentProject.id);
          const projected = slateProjectOffsetsForSectionSelection(
            manuscriptSections,
            currentSection.id,
            selection.start,
            selection.end,
          );
          if (!projected) {
            throw new Error("Select prose inside the focused section before revising it.");
          }
          body.selectionStart = projected.start;
          body.selectionEnd = projected.end;
        } else if (revisionScope === "scene" && selectedStructureItem) {
          body.structureItemId = selectedStructureItem.id;
        }
        await runProjectOperation("/revisions", body);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Slate could not prepare that revision.",
        );
      }
    })();
  };

  const keepLocalSectionEdits = (): void => {
    const local = activeSectionRef.current;
    const server = sectionConflict?.serverSection;
    if (!local || !server || local.id !== server.id) return;
    const rebased: SlateSectionDetail = {
      ...server,
      prose: local.prose,
      proseLength: local.prose.length,
      lockedRanges: local.lockedRanges,
    };
    activeSectionRef.current = rebased;
    lastSavedSectionRef.current = server;
    pendingSectionSaveRef.current = null;
    setActiveSection(rebased);
    setSectionConflict(null);
    setError(null);
    setSaveState("saving");
    void flushPendingManuscriptSave().catch(() => undefined);
  };

  const useSavedSectionVersion = (): void => {
    const server = sectionConflict?.serverSection;
    if (!server) return;
    adoptSection(server);
    setSections((items) =>
      items.map((item) => (item.id === server.id ? server : item)),
    );
    setError(null);
    setSaveState("saved");
  };

  const exportManuscript = (): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject) return;
      const scope = slateExportScopeForWorkspace({
        choice: exportScopeChoice,
        section: currentSection,
        selectionStart: selection.start,
        selectionEnd: selection.end,
      });
      if (!scope) {
        setError("Select prose in the focused section before exporting that selection.");
        return;
      }
      setExporting(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await fetch(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/exports`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ format: exportFormat, scope }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Slate could not prepare that export.");
        }
        const disposition = response.headers.get("content-disposition") ?? "";
        const filename =
          disposition.match(/filename="([^"]+)"/u)?.[1] ??
          `slate-export.${exportFormat === "markdown" ? "md" : exportFormat === "text" ? "txt" : "docx"}`;
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        setExportOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not export the manuscript.");
      } finally {
        setExporting(false);
      }
    })();
  };

  const downloadSlateProjectArchive = async (
    projectId: string,
    options: { flushCurrentProject?: boolean } = {},
  ): Promise<void> => {
    setArchiveBusy(true);
    setError(null);
    try {
      if (options.flushCurrentProject && projectRef.current?.id === projectId) {
        await flushPendingManuscriptSave();
      }
      const response = await fetch(
        `/api/slate/projects/${encodeURIComponent(projectId)}/archive`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Slate could not prepare that backup.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/u)?.[1] ?? "slate-project.slate";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not back up this project.");
    } finally {
      setArchiveBusy(false);
    }
  };

  const downloadSlateArchive = (): void => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    void downloadSlateProjectArchive(currentProject.id, {
      flushCurrentProject: true,
    });
  };

  const deleteSlateProjectFromShelf = (): void => {
    void (async () => {
      const candidate = projectPendingDeletion;
      if (!candidate) return;
      setDeletingProject(true);
      setError(null);
      try {
        await slateApi<{ ok: true }>(
          `/api/slate/projects/${encodeURIComponent(candidate.id)}`,
          { method: "DELETE" },
        );
        setProjects((current) => current.filter((item) => item.id !== candidate.id));
        setProjectPendingDeletion(null);
        await refreshProjects().catch(() => undefined);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not delete that project.",
        );
      } finally {
        setDeletingProject(false);
      }
    })();
  };

  const previewSlateArchive = (file: File): void => {
    void (async () => {
      setArchiveBusy(true);
      setArchiveFile(null);
      setArchivePreview(null);
      setError(null);
      try {
        if (!file.name.toLowerCase().endsWith(".slate")) {
          throw new Error("Choose a .slate project backup.");
        }
        if (file.size > SLATE_ARCHIVE_MAX_BYTES) {
          throw new Error("That .slate backup is too large to open safely.");
        }
        const response = await slateApi<SlateArchivePreviewResponse>(
          "/api/slate/archives/preview",
          {
            method: "POST",
            headers: { "content-type": SLATE_ARCHIVE_MEDIA_TYPE },
            body: file,
          },
        );
        setArchiveFile(file);
        setArchivePreview(response.preview);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not read that backup.");
      } finally {
        setArchiveBusy(false);
      }
    })();
  };

  const restoreSlateArchive = (): void => {
    void (async () => {
      const file = archiveFile;
      if (!file) return;
      setArchiveBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateArchiveImportResponse>(
          "/api/slate/archives/import",
          {
            method: "POST",
            headers: { "content-type": SLATE_ARCHIVE_MEDIA_TYPE },
            body: file,
          },
        );
        setArchiveFile(null);
        setArchivePreview(null);
        setExportOpen(false);
        await refreshProjects();
        await openProject(response.import.projectId);
        queueRecoveryStatusRefresh(response.import.projectId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not restore that backup.");
      } finally {
        setArchiveBusy(false);
      }
    })();
  };

  const dismissSlateArchivePreview = (): void => {
    setArchiveFile(null);
    setArchivePreview(null);
  };

  const enterReturnSession = (): void => {
    const session = returnSession;
    if (!session) return;
    setDismissedReturnSessionId(
      slateReturnSplashDismissalId(session, projectRef.current?.id ?? null),
    );
    const concernTarget = session.synopsis.nextCard.target.kind === "concern";
    const targetSectionId = concernTarget
      ? slateContinuityConcernSectionId({
          concern: continuityConcern,
          sections,
          currentSectionId: activeSectionRef.current?.id ?? null,
        })
      : slateReturnNextCardSectionId({
          synopsis: session.synopsis,
          sections,
          currentSectionId: activeSectionRef.current?.id ?? null,
        });
    if (targetSectionId && targetSectionId !== activeSectionRef.current?.id) {
      void openSection(targetSectionId);
    }
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-tutorial-target="slate-direction"]')
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const resolveContinuityConcern = (): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const concern = continuityConcern;
      if (!currentProject || !concern) return;
      const request = slateConcernResolveRequestForDirection(
        concern,
        continuityDirection,
      );
      if (!request) return;
      setResolvingConcern(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const focusedSectionId = activeSectionRef.current?.id ?? null;
        const focusedStructureId =
          activeSectionRef.current?.structureItemId ?? selectedStructureId;
        const response = await slateApi<SlateContinuityConcernResolveResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/continuity/concerns/${encodeURIComponent(concern.id)}/resolve`,
          {
            method: "POST",
            body: JSON.stringify(request),
          },
        );
        adoptProject(response.project);
        await loadProjectSections(
          currentProject.id,
          focusedSectionId,
          focusedStructureId,
        );
        snoozedConcernIdRef.current = null;
        setContinuityConcern(response.nextConcern);
        setContinuityDirection("");
        setSaveState("saved");
        void refreshProjects();
        queueRecoveryStatusRefresh(currentProject.id);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Continuity could not apply that direction.",
        );
      } finally {
        setResolvingConcern(false);
      }
    })();
  };

  const concernResolveRequest = slateConcernResolveRequestForDirection(
    continuityConcern,
    continuityDirection,
  );
  const showReturnSplash = slateReturnSplashShouldShow({
    session: returnSession,
    selectedProjectId: project?.id ?? null,
    dismissedSessionId: dismissedReturnSessionId,
  });

  const totalManuscriptLength = sections.reduce(
    (total, section) => total + section.proseLength,
    0,
  );
  useEffect(() => {
    if (!project || project.titleSuggestion || titleSuggestionBusy) return;
    const milestone = Math.floor(
      totalManuscriptLength / SLATE_TITLE_REVIEW_INTERVAL_CHARS,
    );
    if (milestone < 1) return;
    const key = `prism_slate_title_review_v1:${project.id}:${milestone}`;
    if (window.localStorage.getItem(key) === "checked") return;
    window.localStorage.setItem(key, "checked");
    void requestTitleSuggestion({ quiet: true });
  }, [
    project,
    requestTitleSuggestion,
    titleSuggestionBusy,
    totalManuscriptLength,
  ]);
  const proseModelOptions = useMemo(() => {
    if (!project || !modelCatalog) return [];
    if (project.proseMode === "offline") return modelCatalog.local;
    if (project.proseMode === "online") return modelCatalog.online;
    return [...modelCatalog.local, ...modelCatalog.online];
  }, [modelCatalog, project]);
  const proseModelValue =
    project?.proseModel && project.proseProvider
      ? `${project.proseProvider}:${project.proseModel}`
      : SLATE_AUTO_MODEL_VALUE;

  if (loading) {
    return (
      <main className={`${styles.shell} ${className}`} data-theme={theme}>
        <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
        <div className={styles.mainNavigation}>{navigationHeader}</div>
        <p className={styles.loading}>Opening the writing desk…</p>
      </main>
    );
  }

  return (
    <main
      className={`${styles.shell} ${className}`}
      data-slate-workspace="true"
      data-theme={theme}
    >
      <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
      <div className={styles.mainNavigation}>{navigationHeader}</div>

      <input
        ref={archiveInputRef}
        className={styles.visuallyHidden}
        type="file"
        accept={`.slate,${SLATE_ARCHIVE_MEDIA_TYPE},application/zip`}
        aria-label="Choose a Slate project backup"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) previewSlateArchive(file);
        }}
      />

      {projectPendingDeletion ? (
        <div className={styles.returnBackdrop} role="presentation">
          <section
            className={styles.deleteProjectDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slate-delete-project-title"
            aria-describedby="slate-delete-project-description"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !deletingProject) {
                setProjectPendingDeletion(null);
              }
            }}
          >
            <p className={styles.eyebrow}>Project actions</p>
            <h1 id="slate-delete-project-title">
              Delete “{projectPendingDeletion.title}”?
            </h1>
            <p id="slate-delete-project-description" className={styles.deleteProjectDescription}>
              Its manuscript, structure, history, and Continuity will be removed from
              this account.
            </p>
            <div className={styles.deleteProjectWarning}>
              <strong>This cannot be undone.</strong>
              <span>
                Download a portable .slate backup first if you may want the project
                again.
              </span>
            </div>
            <footer>
              <button
                type="button"
                className={styles.quietButton}
                disabled={deletingProject}
                autoFocus
                onClick={() => setProjectPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={archiveBusy || deletingProject}
                onClick={() => {
                  void downloadSlateProjectArchive(projectPendingDeletion.id);
                }}
              >
                {archiveBusy ? "Preparing backup…" : "Download backup first"}
              </button>
              <button
                type="button"
                className={styles.destructiveButton}
                disabled={archiveBusy || deletingProject}
                onClick={deleteSlateProjectFromShelf}
              >
                {deletingProject ? "Deleting…" : "Delete project"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {archivePreview && archiveFile ? (
        <div className={styles.returnBackdrop} role="presentation">
          <section
            className={styles.archivePreview}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slate-archive-preview-title"
          >
            <p className={styles.eyebrow}>Slate project backup</p>
            <h1 id="slate-archive-preview-title">Restore {archivePreview.title}?</h1>
            <p className={styles.archiveSeries}>
              {archivePreview.seriesTitle} · backed up {readableUpdatedAt(archivePreview.exportedAt)}
            </p>
            <div className={styles.archiveSummary}>
              <span>{archivePreview.counts.sections} sections</span>
              <span>{archivePreview.counts.revisions + archivePreview.counts.versions + archivePreview.counts.sectionVersions} saved revisions</span>
              <span>{slateContinuityArchiveRowCount(archivePreview.counts)} Continuity records</span>
            </div>
            <div className={styles.archiveSafetyNote}>
              <strong>Your original stays untouched.</strong>
              <span>
                Slate will create a recovered copy with its structure, manuscript,
                history, and Continuity intact.
              </span>
            </div>
            <footer>
              <button
                type="button"
                className={styles.quietButton}
                disabled={archiveBusy}
                onClick={dismissSlateArchivePreview}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={archiveBusy}
                onClick={restoreSlateArchive}
              >
                {archiveBusy ? "Restoring…" : "Restore as a copy"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss Slate error">
            ×
          </button>
        </div>
      ) : null}

      {showReturnSplash && returnSession && project ? (
        <div className={styles.returnBackdrop} role="presentation">
          <section
            className={styles.returnSession}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slate-return-title"
            data-tutorial-target="slate-create-project"
          >
            <p className={styles.eyebrow}>Slate return session</p>
            <h1 id="slate-return-title">Welcome back to {returnSession.synopsis.title}</h1>
            <p className={styles.returnPremise}>
              {returnSession.synopsis.premise || project.spark}
            </p>
            <div className={styles.returnSynopsis}>
              <section>
                <span>Story so far</span>
                <p>{returnSession.synopsis.storySoFar}</p>
              </section>
              <section>
                <span>Where it is going</span>
                <p>{returnSession.synopsis.trajectory}</p>
              </section>
            </div>
            <p className={styles.returnProgress}>
              {returnSession.synopsis.draftedProgress}
              {returnSession.synopsis.threads.due.length > 0
                ? ` · ${returnSession.synopsis.threads.due.length} thread${returnSession.synopsis.threads.due.length === 1 ? "" : "s"} asking for attention`
                : ""}
            </p>
            <section className={styles.returnNext}>
              <span>Continuity’s one recommendation</span>
              <h2>{returnSession.synopsis.nextCard.title}</h2>
              <p>{returnSession.synopsis.nextCard.body}</p>
            </section>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={enterReturnSession}
            >
              Open the desk · {returnSession.synopsis.nextCard.actionLabel}
            </button>
          </section>
        </div>
      ) : null}

      {!project ? (
        <section className={styles.welcome}>
          <div className={styles.welcomeCopy}>
            <p className={styles.eyebrow}>A quiet creative-production desk</p>
            <h1>Bring the spark. Direct the work.</h1>
            <p>
              Shape the story, let Slate carry the drafting labor, then approve only
              the prose that earns its place.
            </p>
          </div>
          <form
            className={styles.createCard}
            data-tutorial-target="slate-create-project"
            onSubmit={(event) => {
              event.preventDefault();
              if (projectStartStep === "source") {
                void advanceProjectStart();
              } else {
                void createProject();
              }
            }}
          >
            {projectStartStep === "source" ? (
              <div className={styles.startStep} data-slate-start-step="source">
                <header className={styles.startStepHeader}>
                  <span>1 of 2</span>
                  <h2>What should Slate begin with?</h2>
                  <p>A premise, a scene, a feeling, or pages you already wrote.</p>
                </header>
                <label>
                  Creative spark <span>one sentence is enough</span>
                  <textarea
                    ref={sparkTextareaRef}
                    value={spark}
                    onChange={(event) => {
                      const nextSpark = event.target.value;
                      setSpark(nextSpark);
                      if (SLATE_SUPPORTED_WILDCARD_RE.test(nextSpark)) {
                        setWildcardMode(true);
                      }
                      setWildcardPreview(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void advanceProjectStart();
                      }
                    }}
                    placeholder="A promise, an image, a problem, a voice…"
                    rows={5}
                  />
                </label>

                <div className={styles.sourceOptions} aria-label="Optional ways to begin">
                  <button
                    type="button"
                    className={styles.quietButton}
                    aria-expanded={existingMaterialOpen}
                    onClick={() => setExistingMaterialOpen((current) => !current)}
                  >
                    {existingMaterialOpen ? "Hide existing material" : "Bring existing material"}
                  </button>
                  <button
                    type="button"
                    className={styles.quietButton}
                    aria-expanded={earlyTitleOpen}
                    onClick={() => setEarlyTitleOpen((current) => !current)}
                  >
                    {title.trim() ? `Title · ${title.trim()}` : "I already have a title"}
                  </button>
                </div>

                {existingMaterialOpen ? (
                  <label>
                    Existing material <span>kept exactly as pasted</span>
                    <textarea
                      value={existingMaterial}
                      onChange={(event) => setExistingMaterial(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void advanceProjectStart();
                        }
                      }}
                      placeholder="Paste notes, a scene, a chapter, or a full draft."
                      rows={8}
                    />
                  </label>
                ) : null}

                {earlyTitleOpen ? (
                  <label>
                    Working title <span>we will confirm it next</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={180}
                    />
                  </label>
                ) : null}

                <div className={styles.wildcardBuilder} data-enabled={wildcardMode ? "true" : undefined}>
                  <button
                    type="button"
                    className={styles.wildcardToggle}
                    aria-pressed={wildcardMode}
                    onClick={() => {
                      setWildcardMode((current) => !current);
                      setWildcardPreview(null);
                    }}
                  >
                    Use {"{wildcards}"} <span>only if you want a little chance</span>
                  </button>
                  {wildcardMode ? (
                    <div className={styles.wildcardControls}>
                      <p>
                        Place uppercase slots in the spark. Slate will roll them before
                        you confirm the title, and keep the original template.
                      </p>
                      <div className={styles.wildcardChips} aria-label="Slate wildcard suggestions">
                        {SLATE_WILDCARD_SUGGESTIONS.map((token) => (
                          <button
                            key={token}
                            type="button"
                            onClick={() => insertSparkWildcard(token)}
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={styles.quietButton}
                        disabled={busy || wildcardResolving || !SLATE_SUPPORTED_WILDCARD_RE.test(spark)}
                        onClick={() => void rollSparkWildcards()}
                      >
                        {wildcardResolving
                          ? "Rolling…"
                          : wildcardPreview
                            ? "Reroll wildcards"
                            : "Preview wildcard roll"}
                      </button>
                      {wildcardPreview ? (
                        <div className={styles.wildcardPreview} role="status">
                          <span>Resolved spark</span>
                          <p>{wildcardPreview.spark}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={
                    busy ||
                    wildcardResolving ||
                    !slateProjectSourceIsReady({ spark, existingMaterial })
                  }
                >
                  {wildcardResolving ? "Preparing…" : "Continue"}
                </button>
                <p className={styles.keyboardHint}>⌘ / Ctrl + Enter continues from either writing field.</p>
                <div className={styles.restoreEntry}>
                  <span>Already have a .slate backup?</span>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={archiveBusy}
                    onClick={() => archiveInputRef.current?.click()}
                  >
                    {archiveBusy ? "Reading backup…" : "Choose backup"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.startStep} data-slate-start-step="title">
                <header className={styles.startStepHeader}>
                  <span>2 of 2</span>
                  <h2>Give the work a name.</h2>
                  <p>Slate suggested a working title. Keep it, change it, or skip naming for now.</p>
                </header>
                <div className={styles.sourceRecap}>
                  <span>{wildcardPreview ? "Resolved spark" : existingMaterial.trim() && !spark.trim() ? "Material ready" : "Your spark"}</span>
                  <p>
                    {wildcardPreview?.spark ?? (spark.trim() || "Your imported pages are ready at the desk.")}
                  </p>
                  {existingMaterial.trim() ? (
                    <small>{existingMaterial.trim().split(/\s+/u).length.toLocaleString()} imported words</small>
                  ) : null}
                </div>
                <label>
                  Working title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={180}
                    autoFocus
                  />
                </label>
                <div className={styles.startActions}>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setEarlyTitleOpen(Boolean(title.trim()));
                      setProjectStartStep("source");
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={busy || !title.trim()}
                  >
                    {busy ? "Creating…" : "Create project"}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.skipTitle}
                  disabled={busy}
                  onClick={() => void createProject("Untitled Story")}
                >
                  Skip naming · use Untitled Story
                </button>
              </div>
            )}
          </form>
          {projects.length > 0 ? (
            <div className={styles.projectShelf}>
              <h2>Projects</h2>
              {projects.map((item) => {
                const menuId = `slate-project-actions-${item.id}`;
                const menuOpen = activeMenu?.id === menuId;
                return (
                  <div
                    key={item.id}
                    className={styles.projectCard}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openProjectActionsMenu(item, {
                        kind: "pointer",
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <button
                      type="button"
                      className={styles.projectCardOpen}
                      onClick={() => void openProject(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{readableUpdatedAt(item.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.projectActionsButton}
                      aria-label={`Project actions for ${item.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-controls={menuOpen ? menuId : undefined}
                      onClick={(event) => {
                        if (menuOpen) {
                          closeMenu();
                          return;
                        }
                        openProjectActionsMenu(item, {
                          kind: "element",
                          element: event.currentTarget,
                          preferredPlacement: "bottom-end",
                        });
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.structureRail} data-tutorial-target="slate-structure">
            <div className={styles.railHeader}>
              <div>
                <p className={styles.eyebrow}>Structure</p>
                <h2>{project.title}</h2>
              </div>
              <button
                type="button"
                className={styles.quietButton}
                onClick={() => {
                  void flushPendingManuscriptSave()
                    .then(() => {
                      projectRef.current = null;
                      activeSectionRef.current = null;
                      lastSavedSectionRef.current = null;
                      setProject(null);
                      setSections([]);
                      setActiveSection(null);
                      setReturnSession(null);
                      setDismissedReturnSessionId(null);
                      setContinuityConcern(null);
                      setContinuityDirection("");
                      setProtectedAt(null);
                      snoozedConcernIdRef.current = null;
                    })
                    .catch(() => undefined);
                }}
              >
                Projects
              </button>
            </div>
            <div className={styles.projectSelect}>
              <select
                aria-label="Open Slate project"
                value={project.id}
                onChange={(event) => void openProject(event.target.value)}
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.shapeButton}
              data-tutorial-target="slate-shape"
              disabled={busy || saveState === "saving"}
              onClick={() => {
                if (project.structure.length > 0 && !window.confirm("Replace the current plan with a newly shaped one? The manuscript will stay untouched.")) return;
                void runProjectOperation("/shape");
              }}
            >
              {project.structure.length > 0 ? "Reshape plan" : "Shape with Slate"}
            </button>
            <div className={styles.structureList}>
              {project.structure.map((item, index) => (
                <article
                  key={item.id}
                  className={styles.structureCard}
                  data-selected={item.id === selectedStructureId ? "true" : undefined}
                  data-locked={item.locked ? "true" : undefined}
                  onClick={() => {
                    setSelectedStructureId(item.id);
                    const matchingSection = slateSectionForStructure(sections, item.id);
                    if (matchingSection) void openSection(matchingSection.id);
                  }}
                >
                  <div className={styles.structureCardTop}>
                    <span>{item.kind} · {item.status}</span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} up`}
                        disabled={busy || index === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(reorderSlateStructure(project.structure, item.id, -1));
                        }}
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} down`}
                        disabled={busy || index === project.structure.length - 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(reorderSlateStructure(project.structure, item.id, 1));
                        }}
                      >↓</button>
                      <button
                        type="button"
                        aria-label={item.locked ? `Unlock ${item.title}` : `Lock ${item.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void saveStructure(project.structure.map((candidate) => candidate.id === item.id ? { ...candidate, locked: !candidate.locked } : candidate));
                        }}
                      >{item.locked ? "◆" : "◇"}</button>
                    </div>
                  </div>
                  <input
                    value={item.title}
                    aria-label="Structure item title"
                    onChange={(event) => mutateStructureItem(item.id, { title: event.target.value })}
                    onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                  />
                  <textarea
                    value={item.summary}
                    aria-label={`${item.title} summary`}
                    rows={3}
                    onChange={(event) => mutateStructureItem(item.id, { summary: event.target.value })}
                    onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                  />
                  {item.id === selectedStructureId ? (
                    <textarea
                      className={styles.sceneDirection}
                      value={item.direction}
                      aria-label={`${item.title} direction`}
                      placeholder="Direction for this section"
                      rows={2}
                      onChange={(event) => mutateStructureItem(item.id, { direction: event.target.value })}
                      onBlur={() => void saveStructure(projectRef.current?.structure ?? project.structure)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className={styles.removeStructureButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      void saveStructure(project.structure.filter((candidate) => candidate.id !== item.id));
                    }}
                  >Remove</button>
                </article>
              ))}
            </div>
            <button type="button" className={styles.addButton} onClick={addScene}>+ Add scene</button>
            <div className={styles.railFacts}>
              <section>
                <h3>Characters</h3>
                {project.characters.length > 0 ? project.characters.map((character) => (
                  <p key={character.id}><strong>{character.name}</strong><span>{character.role}</span></p>
                )) : <span>Shape the project to establish the cast.</span>}
              </section>
              <section>
                <h3>Unresolved threads</h3>
                {project.unresolvedThreads.length > 0 ? project.unresolvedThreads.map((thread) => (
                  <p key={thread.id}>{thread.label}</p>
                )) : <span>Open questions will collect here.</span>}
              </section>
            </div>
          </aside>

          <section className={styles.manuscriptPane}>
            <div className={styles.manuscriptHeader}>
              <div>
                <p className={styles.eyebrow}>{project.title} · {project.phase}</p>
                <h1>{activeSection?.title ?? project.title}</h1>
                <button
                  type="button"
                  className={styles.titleSuggestionTrigger}
                  disabled={titleSuggestionBusy || busy}
                  onClick={() => void requestTitleSuggestion()}
                >
                  {titleSuggestionBusy ? "Prism is listening…" : "Could this title be stronger?"}
                </button>
                {titleSuggestionNotice ? (
                  <span className={styles.titleSuggestionNotice}>{titleSuggestionNotice}</span>
                ) : null}
              </div>
              <div className={styles.manuscriptHeaderActions}>
                <div className={styles.statusStack} role="status" aria-live="polite">
                  <span className={styles.saveStatus} data-state={saveState}>
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "error"
                        ? "Autosave needs attention"
                        : `Saved · ${totalManuscriptLength.toLocaleString()} characters`}
                  </span>
                  {protectedAt ? (
                    <span className={styles.protectedStatus}>
                      Protected · {readableUpdatedAt(protectedAt)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.quietButton}
                  aria-expanded={exportOpen}
                  aria-controls="slate-export-panel"
                  onClick={() => {
                    setExportScopeChoice(
                      selection.end > selection.start ? "selection" : "book",
                    );
                    setExportOpen((current) => !current);
                  }}
                >
                  Export & backup
                </button>
              </div>
            </div>
            {exportOpen ? (
              <section
                id="slate-export-panel"
                className={styles.exportPanel}
                aria-label="Export manuscript"
              >
                <div>
                  <strong>Take a clean copy</strong>
                  <span>Directions, Continuity notes, and review metadata stay private.</span>
                </div>
                <label>
                  <span>Material</span>
                  <select
                    value={exportScopeChoice}
                    onChange={(event) =>
                      setExportScopeChoice(
                        event.target.value as SlateWorkspaceExportScopeChoice,
                      )
                    }
                  >
                    <option value="book">Entire book</option>
                    <option value="focused">Focused {activeSection?.kind ?? "section"}</option>
                    {selection.end > selection.start ? (
                      <option value="selection">Current selection</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  <span>Format</span>
                  <select
                    value={exportFormat}
                    onChange={(event) =>
                      setExportFormat(
                        event.target.value as "docx" | "markdown" | "text",
                      )
                    }
                  >
                    <option value="docx">Word document</option>
                    <option value="markdown">Markdown</option>
                    <option value="text">Plain text</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={exporting || saveState === "saving"}
                  onClick={exportManuscript}
                >
                  {exporting ? "Preparing…" : "Export copy"}
                </button>
                <div className={styles.archiveTools}>
                  <div>
                    <strong>Protect the working project</strong>
                    <span>
                      A portable .slate backup keeps structure, prose history, and
                      Continuity. Account keys and rebuildable caches stay out.
                    </span>
                  </div>
                  <div className={styles.archiveActions}>
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={archiveBusy || saveState === "saving"}
                      onClick={downloadSlateArchive}
                    >
                      {archiveBusy ? "Working…" : "Back up project"}
                    </button>
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={archiveBusy}
                      onClick={() => archiveInputRef.current?.click()}
                    >
                      Restore backup
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            {sections.length > 1 ? (
              <label className={styles.sectionPicker}>
                <span>Focused section</span>
                <select
                  aria-label="Focused manuscript section"
                  value={activeSection?.id ?? ""}
                  disabled={busy || saveState === "saving"}
                  onChange={(event) => void openSection(event.target.value)}
                >
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {sectionConflict ? (
              <section className={styles.sectionConflict} role="alert">
                <div>
                  <strong>Your draft is safe.</strong>
                  <span>
                    This section was saved elsewhere after you opened it. Choose which
                    version should become authoritative.
                  </span>
                </div>
                <details>
                  <summary>Compare saved version</summary>
                  <pre>{sectionConflict.serverSection.prose}</pre>
                </details>
                <footer>
                  <button
                    type="button"
                    className={styles.quietButton}
                    onClick={useSavedSectionVersion}
                  >
                    Use saved version
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={keepLocalSectionEdits}
                  >
                    Keep my edits
                  </button>
                </footer>
              </section>
            ) : null}
            {livingSummary ? (
              <section
                className={styles.livingSummary}
                data-tutorial-target="slate-summary"
                aria-label="Story so far"
              >
                <div>
                  <span>Story so far</span>
                  <small>Living summary · follows accepted prose</small>
                </div>
                <p>{livingSummary.tail || livingSummary.text}</p>
                {livingSummary.text !== livingSummary.tail ? (
                  <details>
                    <summary>Read the full summary</summary>
                    <p>{livingSummary.text}</p>
                  </details>
                ) : null}
              </section>
            ) : null}
            {project.titleSuggestion ? (
              <section className={styles.titleSuggestionCard} aria-label="Suggested project title">
                <div>
                  <span>Prism found a title worth considering</span>
                  <h2>{project.titleSuggestion.title}</h2>
                  <p>{project.titleSuggestion.reason}</p>
                </div>
                <footer>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={titleSuggestionBusy}
                    onClick={() => void resolveTitleSuggestion("dismissed")}
                  >
                    Keep {project.title}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={titleSuggestionBusy}
                    onClick={() => void resolveTitleSuggestion("accepted")}
                  >
                    Use this title
                  </button>
                </footer>
              </section>
            ) : null}
            {project.premise ? <p className={styles.premise}>{project.premise}</p> : null}
            {project.sparkWildcards ? (
              <details className={styles.wildcardOrigin}>
                <summary>Created from {"{wildcards}"}</summary>
                <span>Original spark</span>
                <p>{project.sparkWildcards.template}</p>
                <span>Resolved spark</span>
                <p>{project.spark}</p>
              </details>
            ) : null}
            <textarea
              className={styles.manuscript}
              data-tutorial-target="slate-manuscript"
              value={activeSection?.prose ?? ""}
              disabled={!activeSection}
              onChange={(event) => {
                const current = activeSectionRef.current;
                if (!current) return;
                const prose = event.target.value;
                const next = {
                  ...current,
                  prose,
                  proseLength: prose.length,
                  lockedRanges: transformSlateLockedRangesForTextEdit(
                    current.prose,
                    prose,
                    current.lockedRanges,
                  ),
                };
                activeSectionRef.current = next;
                setActiveSection(next);
                setSections((items) =>
                  items.map((item) =>
                    item.id === next.id ? { ...item, proseLength: prose.length } : item,
                  ),
                );
                setSaveState("saving");
              }}
              onSelect={(event) => setSelection({
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              })}
              placeholder="Shape a plan, select a scene, and let Slate draft—or begin writing directly."
              spellCheck
            />
            <div className={styles.manuscriptFooter}>
              <button type="button" className={styles.quietButton} disabled={busy || selection.end <= selection.start} onClick={lockSelection}>
                Lock selection
              </button>
              {(activeSection?.lockedRanges ?? []).map((range) => (
                <button
                  key={range.id}
                  type="button"
                  className={styles.lockChip}
                  title="Remove this manuscript lock"
                  onClick={() => {
                    const current = activeSectionRef.current;
                    if (!current) return;
                    const next = {
                      ...current,
                      lockedRanges: current.lockedRanges.filter(
                        (candidate) => candidate.id !== range.id,
                      ),
                    };
                    activeSectionRef.current = next;
                    setActiveSection(next);
                    setSaveState("saving");
                  }}
                >◆ {range.label || "Locked prose"} ×</button>
              ))}
            </div>
          </section>

          <aside className={styles.directionPanel} data-tutorial-target="slate-direction">
            <section
              className={styles.proseControls}
              data-tutorial-target="slate-ai-controls"
              aria-label="Slate prose model"
            >
              <div className={styles.proseControlsHeader}>
                <div>
                  <p className={styles.eyebrow}>Prose engine</p>
                  <strong>Choose the hand behind the draft</strong>
                </div>
                {project.lastModel ? (
                  <span title={project.lastModel}>Last · {project.lastModel}</span>
                ) : null}
              </div>
              <div className={styles.proseModePicker} role="group" aria-label="Prose routing">
                {(["offline", "auto", "online"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-active={project.proseMode === mode ? "true" : undefined}
                    disabled={busy}
                    onClick={() => void saveProseMode(mode)}
                  >
                    {mode === "offline" ? "Offline" : mode === "online" ? "Online" : "Auto"}
                  </button>
                ))}
              </div>
              <label className={styles.proseModelPicker}>
                <span>Model</span>
                <select
                  value={proseModelValue}
                  disabled={busy || !modelCatalog}
                  onChange={(event) => void saveProseModel(event.target.value)}
                >
                  <option value={SLATE_AUTO_MODEL_VALUE}>
                    {project.proseMode === "auto"
                      ? "Auto-select from account defaults"
                      : project.proseMode === "offline"
                        ? "Account offline default"
                        : "Account online default"}
                  </option>
                  {proseModelOptions.map((model) => (
                    <option
                      key={slateModelChoiceValue(model)}
                      value={slateModelChoiceValue(model)}
                      disabled={Boolean(model.disabledReason)}
                    >
                      {model.label} · {model.provider === "local" ? "offline" : model.provider}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            {continuityConcern && !pendingRevision ? (
              <section
                className={styles.continuityCard}
                data-severity={continuityConcern.severity}
                data-tutorial-target="slate-revision"
              >
                <p className={styles.eyebrow}>Continuity</p>
                <span className={styles.continuityNotice}>One thing needs your intent</span>
                <h2>{continuityConcern.summary}</h2>
                <p className={styles.continuityExplanation}>
                  {continuityConcern.explanation}
                </p>
                {continuityConcern.passages.length > 0 ? (
                  <details className={styles.continuityEvidence}>
                    <summary>Why Continuity noticed</summary>
                    {continuityConcern.passages.map((passage) => (
                      <blockquote
                        key={`${passage.sourceId}:${passage.start}:${passage.end}`}
                      >
                        {passage.sectionTitle ? <span>{passage.sectionTitle}</span> : null}
                        <p>{passage.quote}</p>
                      </blockquote>
                    ))}
                  </details>
                ) : null}
                <label className={styles.continuityDirection}>
                  <span>{continuityConcern.directionPrompt}</span>
                  <textarea
                    value={continuityDirection}
                    onChange={(event) => setContinuityDirection(event.target.value)}
                    placeholder="For example: this is a rumor, the north gate is canon, or revise the passage…"
                    rows={4}
                  />
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    resolvingConcern ||
                    saveState === "saving" ||
                    !concernResolveRequest
                  }
                  onClick={resolveContinuityConcern}
                >
                  {resolvingConcern
                    ? "Updating Continuity…"
                    : continuityConcern.suggestedAction.label}
                </button>
                <button
                  type="button"
                  className={styles.continuitySnooze}
                  onClick={() => {
                    snoozedConcernIdRef.current = continuityConcern.id;
                    setContinuityConcern(null);
                    setContinuityDirection("");
                  }}
                >
                  Not now · keep writing
                </button>
              </section>
            ) : (
              <>
                <p className={styles.eyebrow}>Direction</p>
                <h2>What happens next?</h2>
                <p className={styles.directionScope}>
                  {selectedStructureItem ? `Selected: ${selectedStructureItem.title}` : "Select a structural card or manuscript passage."}
                </p>
                <textarea
                  value={draftDirection}
                  onChange={(event) => setDraftDirection(event.target.value)}
                  placeholder="One concise instruction for the next draft…"
                  rows={5}
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  data-tutorial-target="slate-draft"
                  disabled={busy || saveState === "saving" || !selectedStructureItem || selectedStructureItem.status === "drafted" || Boolean(activeSection?.prose.trim())}
                  onClick={() => selectedStructureItem && void runProjectOperation("/draft", {
                    structureItemId: selectedStructureItem.id,
                    direction: draftDirection,
                  })}
                >
                  {selectedStructureItem?.status === "drafted"
                    ? "Scene drafted"
                    : activeSection?.prose.trim()
                      ? "Refine existing prose"
                      : "Draft selected section"}
                </button>

                <div className={styles.refineBlock} data-tutorial-target="slate-revision">
                  <div className={styles.refineHeader}>
                    <h3>Refine</h3>
                    <span>{revisionScope}</span>
                  </div>
                  <div className={styles.contextualAction} aria-live="polite">
                    <span>Slate’s next move</span>
                    <strong>{revisionLabel(revisionAction)}</strong>
                  </div>
                  <textarea
                    value={revisionDirection}
                    onChange={(event) => setRevisionDirection(event.target.value)}
                    placeholder="Tell Slate what should change…"
                    rows={3}
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy || saveState === "saving" || !activeSection?.prose.trim() || !!pendingRevision}
                    onClick={requestRevision}
                  >{pendingRevision ? "Resolve current proposal" : "Preview revision"}
                  </button>

                  {pendingRevision ? (
                    <div className={styles.revisionPreview}>
                      <p>Proposed {pendingRevision.action}</p>
                      <div>
                        <section><span>Current</span><pre>{pendingRevision.originalText}</pre></section>
                        <section><span>Proposed</span><pre>{pendingRevision.proposedText || "Cut this passage."}</pre></section>
                      </div>
                      <footer>
                        <button type="button" className={styles.quietButton} disabled={busy} onClick={() => void runProjectOperation(`/revisions/${encodeURIComponent(pendingRevision.id)}/reject`)}>Reject</button>
                        <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void runProjectOperation(`/revisions/${encodeURIComponent(pendingRevision.id)}/accept`)}>Accept revision</button>
                      </footer>
                    </div>
                  ) : null}
                </div>
              </>
            )}

            <p className={styles.providerNote}>
              Routing applies to prose, title counsel, and this project’s Prism
              companion. Every generated prose artifact keeps its provider and
              model receipt in the project backend. Locked material and newer
              human edits remain authoritative.
            </p>
          </aside>
        </div>
      )}
      {project ? (
        <div
          className={styles.companionAnchor}
          data-dock={companionPosition.x < 0.5 ? "left" : "right"}
          style={{
            left: `${companionPosition.x * 100}%`,
            top: `${companionPosition.y * 100}%`,
          }}
        >
          {companionOpen ? (
            <section
              id="slate-project-companion"
              className={styles.companionPanel}
              aria-label="Chat with this Slate project"
            >
              <header>
                <div>
                  <span>Prism · project side chat</span>
                  <strong>{project.title}</strong>
                </div>
                <button
                  type="button"
                  aria-label="Collapse project chat"
                  onClick={() => setCompanionOpen(false)}
                >
                  −
                </button>
              </header>
              <div ref={companionMessagesRef} className={styles.companionMessages}>
                {companionMessages.length === 0 ? (
                  <p className={styles.companionEmpty}>
                    Ask about the draft, test an idea, compare directions, or talk
                    through what the project needs. Nothing here edits the manuscript.
                  </p>
                ) : (
                  companionMessages.map((message) => (
                    <article key={message.id} data-role={message.role}>
                      <span>{message.role === "assistant" ? "Prism" : "You"}</span>
                      <p>{message.content}</p>
                      {message.role === "assistant" && message.model ? (
                        <small>{message.model}</small>
                      ) : null}
                    </article>
                  ))
                )}
                {companionBusy ? (
                  <article data-role="assistant" data-thinking="true">
                    <span>Prism</span>
                    <p>Reading the project…</p>
                  </article>
                ) : null}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendCompanionMessage();
                }}
              >
                <textarea
                  value={companionDraft}
                  onChange={(event) => setCompanionDraft(event.target.value)}
                  placeholder="Talk with the project…"
                  rows={3}
                />
                <button
                  type="submit"
                  disabled={companionBusy || !companionDraft.trim()}
                >
                  Send
                </button>
              </form>
            </section>
          ) : null}
          <button
            type="button"
            className={styles.companionAvatar}
            data-tutorial-target="slate-project-chat"
            aria-label={companionOpen ? "Move or collapse Prism project chat" : "Move or open Prism project chat"}
            aria-expanded={companionOpen}
            aria-controls="slate-project-companion"
            onPointerDown={beginCompanionDrag}
            onPointerMove={moveCompanion}
            onPointerUp={endCompanionDrag}
            onPointerCancel={() => {
              companionDragRef.current = null;
            }}
            onClick={(event) => {
              if (event.detail === 0) setCompanionOpen((current) => !current);
            }}
          >
            <span className={styles.companionAvatarScreen} aria-hidden="true">
              <span>◇</span>
            </span>
            <small>PRISM</small>
          </button>
        </div>
      ) : null}
    </main>
  );
}
