"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  PromptWildcardRunMetadata,
  SlateAiProvider,
  SlateContinuityConcernCard,
  SlateContinuityConcernNextResponse,
  SlateContinuityConcernResolveResponse,
  SlateDeliberationMessage,
  SlateDeliberationSpeaker,
  SlateDeliberationTurnResponse,
  SlateGenerateTitleResponse,
  SlateHandoffPreview,
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
  SlateProjectTitleOrigin,
  SlateProseMode,
  SlateRevisionAction,
  SlateResolveSparkWildcardsResponse,
  SlateReturnSession,
  SlateReturnSessionResponse,
  SlateManuscriptPageResponse,
  SlateSectionDetail,
  SlateSectionListResponse,
  SlateSectionSummary,
  SlateStructureItem,
  SlateTitleSuggestionResponse,
} from "@localai/shared";
import {
  slateImportedSectionRequiresPassageScope,
  transformSlateLockedRangesForTextEdit,
} from "@localai/shared";
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
  slateCanvasUpdateMatchesActiveSection,
  slateProjectOffsetsForSectionSelection,
  slateRevisionActionForDirection,
  slateRevisionScopeForWorkspace,
  slateReturnNextCardSectionId,
  slateReturnSplashDismissalId,
  slateReturnSplashShouldShow,
  slateSectionEditableFingerprint,
  slateSectionForStructure,
  type SlateProjectSourceMode,
  type SlateProjectStartStep,
  type SlateWorkspaceExportScopeChoice,
} from "./slateWorkspaceState";
import type {
  SlateHemisphereSettingsSnapshot,
  SlateHemisphereSettingsUpdate,
} from "./slateHemisphereSettings";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import { SlateDirectionQuestion } from "./SlateDirectionQuestion";
import { SlateDirectorBar } from "./SlateDirectorBar";
import { SlateCreativeStudiosDesk } from "./SlateCreativeStudiosDesk";
import { AssetRail } from "./AssetLibrary";
import { SlateFullBookReader } from "./SlateFullBookReader";
import { SlateMirrorDesk } from "./SlateMirrorDesk";
import {
  SlateManuscriptCanvas,
  type SlateCanvasSelection,
} from "./SlateManuscriptCanvas";
import { SlateStoryMap } from "./SlateStoryMap";
import {
  SlateStoryBibleDesk,
  type SlateCharacterEditableField,
  type SlateStoryBibleDeskData,
} from "./SlateStoryBibleDesk";
import {
  slateInferredDirectorScope,
  type SlateDocumentAnchor,
  type SlateDocumentAnnotationV1,
  type SlateDirectorScope,
  type SlateSectionDocumentV1,
} from "./slateManuscriptDocument";
import {
  slateWritingOperationCanContinue,
  slateWritingOperationCanRedirect,
  slateWritingOperationCanStop,
  slateWritingOperationStatusLabel,
  slateWritingOperationStorageKey,
  slateWritingProposalPreview,
  type SlateClarificationRequest,
  type SlateWritingOperation,
  type SlateWritingOperationResponse,
} from "./slateWritingOperations";
import styles from "./slateWorkspace.module.css";

interface SlateWorkspaceProps {
  className?: string;
  navigationHeader: ReactNode;
  theme: "light" | "dark";
  onHemisphereSettingsSnapshot?: (
    snapshot: SlateHemisphereSettingsSnapshot | null,
  ) => void;
  hemisphereSettingsUpdate?: SlateHemisphereSettingsUpdate | null;
  globalCompanionEnabled: boolean;
  onCompanionContextChange?: (
    context: {
      projectId: string;
      projectTitle: string;
      sectionId: string | null;
    } | null,
  ) => void;
  requestedProjectId?: string | null;
  onDiscussSelection?: (source: {
    projectId: string;
    sectionId: string;
    selectionStart: number;
    selectionEnd: number;
  }) => void | Promise<void>;
  renderPickAwareComposer?: (state: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    multiline?: boolean;
    ariaLabel?: string;
    className?: string;
    onBlur?: (value: string) => void;
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  }) => ReactNode;
  expandComposerDraft?: (rawDraft: string) => string | Promise<string>;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type SlateEntryMode = "desk" | "create";
type SlateInspectorMode = "cast" | "continuity" | "history";
type SlateCockpitDrawer = "project" | "story-bible" | "history" | null;

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

interface SlateCompanionBubble {
  key: string;
  message: SlateProjectChatMessage;
  lifetimeMs: number;
}

interface SlateRichSectionDetail extends SlateSectionDetail {
  /** Rich document is authoritative when supplied by the section API. */
  document?: SlateSectionDocumentV1;
  documentHash?: string;
  proseHash?: string;
}

interface SlateRichSectionResponse {
  ok: true;
  section: SlateRichSectionDetail;
}

interface SlateAnnotationListResponse {
  ok: true;
  annotations: SlateDocumentAnnotationV1[];
}

interface SlateAnnotationResponse {
  ok: true;
  annotation: SlateDocumentAnnotationV1;
}

interface SlateSectionConflict {
  localSectionId: string;
  serverSection: SlateRichSectionDetail;
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

interface SlateDeliberationRun {
  id: string;
  controller: AbortController | null;
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

async function slateQuoteHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
const SLATE_ARCHIVE_MEDIA_TYPE = "application/vnd.prism.slate+zip";
const SLATE_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
const SLATE_COMPANION_POSITION_KEY = "prism_slate_companion_position_v1";
const SLATE_VISITED_KEY = "prism_slate_visited_v1";
const SLATE_AUTO_MODEL_VALUE = "auto";
const SLATE_TITLE_REVIEW_INTERVAL_CHARS = 12_000;
const SLATE_COMPANION_RECOVERY_LIMIT = 3;

function slateCompanionBubbleLifetimeMs(
  message: SlateProjectChatMessage,
): number {
  if (message.role === "user") return 9_000;
  return Math.min(42_000, Math.max(14_000, 8_000 + message.content.length * 42));
}

function readSlateHasVisited(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SLATE_VISITED_KEY) === "true";
  } catch {
    return false;
  }
}

function slateTitleReviewWasHandled(projectId: string): boolean {
  try {
    return window.localStorage.getItem(
      `prism_slate_title_review_v2:${projectId}`,
    ) === "reviewed";
  } catch {
    return false;
  }
}

function markSlateTitleReviewHandled(projectId: string): void {
  try {
    window.localStorage.setItem(
      `prism_slate_title_review_v2:${projectId}`,
      "reviewed",
    );
  } catch {
    // The checkpoint can repeat if device-local storage is unavailable.
  }
}

function slateProjectBookStyle(seed: string): CSSProperties {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return {
    "--slate-book-hue": `${(hash >>> 0) % 360}`,
    "--slate-book-tilt": `${(((hash >>> 8) % 7) - 3) * 0.32}deg`,
    "--slate-book-shift": `${(hash >>> 16) % 9}px`,
  } as CSSProperties;
}

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

function readSlateAssetFile(file: File): Promise<string> {
  if (!/^image\/(?:png|jpe?g|webp|gif|avif)$/iu.test(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, WebP, GIF, or AVIF image."));
  }
  if (file.size > 20 * 1024 * 1024) {
    return Promise.reject(new Error("Choose an image smaller than 20 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Slate could not read that image."));
    reader.onerror = () => reject(new Error("Slate could not read that image."));
    reader.readAsDataURL(file);
  });
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

function slateDeliberationNextSpeaker(
  messageCount: number,
  rounds: number,
): SlateDeliberationSpeaker {
  if (messageCount >= rounds * 2) return "synthesis";
  return messageCount % 2 === 0 ? "lux" : "umbra";
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
  navigationHeader,
  theme,
  onHemisphereSettingsSnapshot,
  hemisphereSettingsUpdate,
  globalCompanionEnabled,
  onCompanionContextChange,
  requestedProjectId,
  onDiscussSelection,
  renderPickAwareComposer,
  expandComposerDraft,
}: SlateWorkspaceProps): React.JSX.Element {
  const { activeMenu, openMenu, closeMenu } = usePrismMenu();
  const [projects, setProjects] = useState<SlateProjectSummary[]>([]);
  const [project, setProject] = useState<SlateProjectDetail | null>(null);
  const projectRef = useRef<SlateProjectDetail | null>(null);
  const [sections, setSections] = useState<SlateSectionSummary[]>([]);
  const [activeSection, setActiveSection] =
    useState<SlateRichSectionDetail | null>(null);
  const activeSectionRef = useRef<SlateRichSectionDetail | null>(null);
  const lastSavedSectionRef = useRef<SlateRichSectionDetail | null>(null);
  const pendingSectionSaveRef = useRef<SlateSectionSaveAttempt | null>(null);
  const [sectionConflict, setSectionConflict] = useState<SlateSectionConflict | null>(null);
  const [sectionAnnotations, setSectionAnnotations] = useState<
    SlateDocumentAnnotationV1[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [entryMode, setEntryMode] = useState<SlateEntryMode>("desk");
  const [hadVisitedBeforeThisMount] = useState(readSlateHasVisited);
  const [projectStartStep, setProjectStartStep] =
    useState<SlateProjectStartStep>("source");
  const [projectSourceMode, setProjectSourceMode] =
    useState<SlateProjectSourceMode>("spark");
  const [earlyTitleOpen, setEarlyTitleOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [titleOrigin, setTitleOrigin] =
    useState<SlateProjectTitleOrigin>("writer");
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [creationTitleReason, setCreationTitleReason] = useState<string | null>(null);
  const [generateCoverAfterCreate, setGenerateCoverAfterCreate] = useState(true);
  const [spark, setSpark] = useState("");
  const [wildcardMode, setWildcardMode] = useState(false);
  const [wildcardResolving, setWildcardResolving] = useState(false);
  const [wildcardPreview, setWildcardPreview] = useState<SlateWildcardPreview | null>(null);
  const [existingMaterial, setExistingMaterial] = useState("");
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SlateCanvasSelection>({
    start: 0,
    end: 0,
  });
  const [handoffSources, setHandoffSources] = useState<SlateHandoffPreview[]>([]);
  const requestedProjectOpenedRef = useRef<string | null>(null);
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
  const [storyMapCollapsed, setStoryMapCollapsed] = useState(false);
  const [inspectorMode, setInspectorMode] =
    useState<SlateInspectorMode>("continuity");
  const [focusMode, setFocusMode] = useState(false);
  const [directorScope, setDirectorScope] =
    useState<SlateDirectorScope>("scene");
  const [writingOperation, setWritingOperation] =
    useState<SlateWritingOperation | null>(null);
  const writingOperationRef = useRef<SlateWritingOperation | null>(null);
  const [writingClarification, setWritingClarification] =
    useState<SlateClarificationRequest | null>(null);
  const [writingOperationBusy, setWritingOperationBusy] = useState(false);
  const [cockpitDrawer, setCockpitDrawer] =
    useState<SlateCockpitDrawer>(null);
  const [storyBibleDesk, setStoryBibleDesk] =
    useState<SlateStoryBibleDeskData | null>(null);
  const [storyBibleLoading, setStoryBibleLoading] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [creativeStudiosOpen, setCreativeStudiosOpen] = useState(false);
  const [fullBookOpen, setFullBookOpen] = useState(false);
  const [fullBookLoading, setFullBookLoading] = useState(false);
  const [fullBookSections, setFullBookSections] = useState<
    SlateSectionDetail[]
  >([]);
  const [reviewExporting, setReviewExporting] = useState(false);
  const [reviewExportNotice, setReviewExportNotice] = useState<string | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"docx" | "markdown" | "text">("docx");
  const [exportScopeChoice, setExportScopeChoice] =
    useState<SlateWorkspaceExportScopeChoice>("book");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [archivePreview, setArchivePreview] =
    useState<SlateArchiveImportPreview | null>(null);
  const [coverGeneratingProjectIds, setCoverGeneratingProjectIds] = useState<
    Set<string>
  >(() => new Set());
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<SlateProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [protectedAt, setProtectedAt] = useState<string | null>(null);
  const [modelCatalog, setModelCatalog] = useState<SlateModelCatalog | null>(null);
  const [livingSummary, setLivingSummary] = useState<SlateLivingSummary | null>(null);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionBubbles, setCompanionBubbles] = useState<
    SlateCompanionBubble[]
  >([]);
  const [companionDraft, setCompanionDraft] = useState("");
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionPosition, setCompanionPosition] =
    useState<SlateCompanionPosition>(readSlateCompanionPosition);
  const [titleSuggestionBusy, setTitleSuggestionBusy] = useState(false);
  const [titleSuggestionNotice, setTitleSuggestionNotice] = useState<
    string | null
  >(null);
  const [titleReviewDue, setTitleReviewDue] = useState(false);
  const [deliberationOpen, setDeliberationOpen] = useState(false);
  const [deliberationPrompt, setDeliberationPrompt] = useState("");
  const [deliberationRounds, setDeliberationRounds] = useState(2);
  const [deliberationMessages, setDeliberationMessages] = useState<
    SlateDeliberationMessage[]
  >([]);
  const [deliberationRunning, setDeliberationRunning] = useState(false);
  const [deliberationActiveSpeaker, setDeliberationActiveSpeaker] =
    useState<SlateDeliberationSpeaker | null>(null);
  const [deliberationError, setDeliberationError] = useState<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const sectionSaveInFlightRef = useRef<Promise<void> | null>(null);
  const recoveryRefreshTimerRef = useRef<number | null>(null);
  const sparkTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const coverUploadRef = useRef<HTMLInputElement | null>(null);
  const companionMessagesBufferRef = useRef<SlateProjectChatMessage[]>([]);
  const companionBubbleSequenceRef = useRef(0);
  const companionBubbleTimersRef = useRef<Map<string, number>>(new Map());
  const companionDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: SlateCompanionPosition;
    moved: boolean;
  } | null>(null);
  const deliberationRunRef = useRef<SlateDeliberationRun | null>(null);

  const clearCompanionBubbles = useCallback((): void => {
    for (const timer of companionBubbleTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    companionBubbleTimersRef.current.clear();
    setCompanionBubbles([]);
  }, []);

  const showCompanionBubbles = useCallback(
    (messages: readonly SlateProjectChatMessage[], replace = false): void => {
      const nextMessages = messages.slice(-SLATE_COMPANION_RECOVERY_LIMIT);
      if (replace) {
        for (const timer of companionBubbleTimersRef.current.values()) {
          window.clearTimeout(timer);
        }
        companionBubbleTimersRef.current.clear();
      }
      const bubbles = nextMessages.map((message) => {
        companionBubbleSequenceRef.current += 1;
        return {
          key: `${message.id}:${companionBubbleSequenceRef.current}`,
          message,
          lifetimeMs: slateCompanionBubbleLifetimeMs(message),
        };
      });
      setCompanionBubbles((current) =>
        (replace ? bubbles : [...current, ...bubbles]).slice(
          -SLATE_COMPANION_RECOVERY_LIMIT,
        ),
      );
      for (const bubble of bubbles) {
        const timer = window.setTimeout(() => {
          companionBubbleTimersRef.current.delete(bubble.key);
          setCompanionBubbles((current) =>
            current.filter((candidate) => candidate.key !== bubble.key),
          );
        }, bubble.lifetimeMs);
        companionBubbleTimersRef.current.set(bubble.key, timer);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      for (const timer of companionBubbleTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      companionBubbleTimersRef.current.clear();
    },
    [],
  );

  const stopSlateDeliberation = useCallback((): void => {
    deliberationRunRef.current?.controller?.abort();
    deliberationRunRef.current = null;
    setDeliberationRunning(false);
    setDeliberationActiveSpeaker(null);
  }, []);

  useEffect(
    () => () => {
      deliberationRunRef.current?.controller?.abort();
      deliberationRunRef.current = null;
    },
    [],
  );

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

  const adoptSection = useCallback((next: SlateRichSectionDetail): void => {
    activeSectionRef.current = next;
    lastSavedSectionRef.current = next;
    pendingSectionSaveRef.current = null;
    setActiveSection(next);
    setSectionConflict(null);
    setSelectedStructureId((current) => next.structureItemId ?? current);
    setSelection({ start: 0, end: 0 });
  }, []);

  const adoptWritingOperationResponse = useCallback(
    (response: SlateWritingOperationResponse): void => {
      writingOperationRef.current = response.operation;
      setWritingOperation(response.operation);
      setWritingClarification(
        response.clarification?.status === "pending"
          ? response.clarification
          : null,
      );
      try {
        const storageKey = slateWritingOperationStorageKey(
          response.operation.projectId,
          response.operation.sectionId,
        );
        if (
          response.operation.status === "applied" ||
          response.operation.status === "rejected" ||
          response.operation.status === "cancelled" ||
          response.operation.status === "failed"
        ) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, response.operation.id);
        }
      } catch {
        // The durable operation remains server-owned when local storage is unavailable.
      }
    },
    [],
  );

  const runWritingOperationRequest = useCallback(
    (operation: SlateWritingOperation): void => {
      void slateApi<SlateWritingOperationResponse>(
        `/api/slate/projects/${encodeURIComponent(operation.projectId)}/writing-operations/${encodeURIComponent(operation.id)}/run`,
        {
          method: "POST",
          body: JSON.stringify({
            revisionFingerprint: operation.revisionFingerprint.value,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      )
        .then((response) => {
          if (writingOperationRef.current?.id === operation.id) {
            adoptWritingOperationResponse(response);
          }
        })
        .catch((cause) => {
          if (
            writingOperationRef.current?.id === operation.id &&
            (writingOperationRef.current.status === "compiling" ||
              writingOperationRef.current.status === "generating")
          ) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Slate could not continue that writing operation.",
            );
          }
        });
    },
    [adoptWritingOperationResponse],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    setMirrorOpen(false);
    setCreativeStudiosOpen(false);
  }, [project?.id]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    const projectId = project?.id;
    const sectionId = activeSection?.id;
    writingOperationRef.current = null;
    setWritingOperation(null);
    setWritingClarification(null);
    if (!projectId || !sectionId) return;
    let operationId: string | null = null;
    try {
      operationId = window.localStorage.getItem(
        slateWritingOperationStorageKey(projectId, sectionId),
      );
    } catch {
      return;
    }
    if (!operationId) return;
    let cancelled = false;
    void slateApi<SlateWritingOperationResponse>(
      `/api/slate/projects/${encodeURIComponent(projectId)}/writing-operations/${encodeURIComponent(operationId)}`,
    )
      .then((response) => {
        if (
          !cancelled &&
          response.operation.projectId === projectId &&
          response.operation.sectionId === sectionId
        ) {
          adoptWritingOperationResponse(response);
          if (
            response.operation.status === "compiling" ||
            response.operation.status === "generating"
          ) {
            runWritingOperationRequest(response.operation);
          }
        }
      })
      .catch((cause) => {
        if (
          cause instanceof SlateApiError &&
          (cause.status === 404 || cause.status === 405)
        ) {
          try {
            window.localStorage.removeItem(
              slateWritingOperationStorageKey(projectId, sectionId),
            );
          } catch {
            // The stale pointer is harmless if local storage is unavailable.
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeSection?.id,
    adoptWritingOperationResponse,
    project?.id,
    runWritingOperationRequest,
  ]);

  useEffect(() => {
    const operationId = writingOperation?.id;
    const operationProjectId = writingOperation?.projectId;
    const operationStatus = writingOperation?.status;
    if (
      !operationId ||
      !operationProjectId ||
      (operationStatus !== "compiling" &&
        operationStatus !== "generating")
    ) {
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const poll = async (): Promise<void> => {
      if (cancelled || document.visibilityState !== "visible") {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 750);
        return;
      }
      try {
        const response = await slateApi<SlateWritingOperationResponse>(
          `/api/slate/projects/${encodeURIComponent(operationProjectId)}/writing-operations/${encodeURIComponent(operationId)}`,
        );
        const current = writingOperationRef.current;
        if (
          !cancelled &&
          current?.id === operationId &&
          (current.status === "compiling" ||
            current.status === "generating")
        ) {
          adoptWritingOperationResponse(response);
        }
      } catch {
        // The active run request owns visible failures; polling stays quiet.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 650);
    };
    timer = window.setTimeout(() => void poll(), 250);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    adoptWritingOperationResponse,
    writingOperation?.id,
    writingOperation?.projectId,
    writingOperation?.status,
  ]);

  useEffect(() => {
    onCompanionContextChange?.(
      project
        ? {
            projectId: project.id,
            projectTitle: project.title,
            sectionId: activeSection?.id ?? null,
          }
        : null,
    );
  }, [activeSection?.id, onCompanionContextChange, project]);

  useEffect(
    () => () => {
      onCompanionContextChange?.(null);
    },
    [onCompanionContextChange],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(SLATE_VISITED_KEY, "true");
    } catch {
      // Slate entry history is a device-local convenience, never project state.
    }
  }, []);

  const refreshProjects = useCallback(async (): Promise<SlateProjectSummary[]> => {
    const response = await slateApi<SlateProjectListResponse>("/api/slate/projects");
    setProjects(response.projects);
    return response.projects;
  }, []);

  const synthesizeProjectCover = useCallback(
    async (projectId: string, quiet = false, direction = ""): Promise<void> => {
      setCoverGeneratingProjectIds((current) => {
        const next = new Set(current);
        next.add(projectId);
        return next;
      });
      if (!quiet) setError(null);
      try {
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}/cover`,
          { method: "POST", body: JSON.stringify({ direction }) },
        );
        setProjects((current) =>
          current.map((item) =>
            item.id === projectId ? response.project : item,
          ),
        );
        if (projectRef.current?.id === projectId) {
          adoptProject(response.project);
        }
      } catch (cause) {
        if (!quiet) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Slate could not create that cover.",
          );
        }
      } finally {
        setCoverGeneratingProjectIds((current) => {
          const next = new Set(current);
          next.delete(projectId);
          return next;
        });
      }
    },
    [adoptProject],
  );

  const reuseProjectCover = useCallback(
    async (projectId: string, assetSetId: string): Promise<void> => {
      setError(null);
      try {
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}/cover/reuse`,
          {
            method: "POST",
            body: JSON.stringify({ assetSetId }),
          },
        );
        setProjects((current) =>
          current.map((item) => item.id === projectId ? response.project : item),
        );
        if (projectRef.current?.id === projectId) adoptProject(response.project);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not reuse that cover.");
      }
    },
    [adoptProject],
  );

  const uploadProjectCover = useCallback(
    async (projectId: string, file: File): Promise<void> => {
      setCoverGeneratingProjectIds((current) => new Set(current).add(projectId));
      setError(null);
      try {
        const dataUrl = await readSlateAssetFile(file);
        const response = await slateApi<SlateProjectResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}/cover/upload`,
          { method: "POST", body: JSON.stringify({ dataUrl }) },
        );
        setProjects((current) =>
          current.map((item) => item.id === projectId ? response.project : item),
        );
        if (projectRef.current?.id === projectId) adoptProject(response.project);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not upload that cover.");
      } finally {
        setCoverGeneratingProjectIds((current) => {
          const next = new Set(current);
          next.delete(projectId);
          return next;
        });
        if (coverUploadRef.current) coverUploadRef.current.value = "";
      }
    },
    [adoptProject],
  );

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

  const loadHandoffSources = useCallback(async (projectId: string): Promise<void> => {
    const response = await slateApi<{ handoffs: SlateHandoffPreview[] }>(
      `/api/slate/projects/${encodeURIComponent(projectId)}/handoffs`,
    );
    if (projectRef.current?.id === projectId) setHandoffSources(response.handoffs);
  }, []);

  const loadSectionAnnotations = useCallback(
    async (projectId: string, sectionId: string): Promise<void> => {
      try {
        const response = await slateApi<SlateAnnotationListResponse>(
          `/api/slate/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}/annotations`,
        );
        if (
          projectRef.current?.id === projectId &&
          activeSectionRef.current?.id === sectionId
        ) {
          setSectionAnnotations(response.annotations);
        }
      } catch (cause) {
        if (
          cause instanceof SlateApiError &&
          (cause.status === 404 || cause.status === 405)
        ) {
          // Compatibility seam for servers predating section annotations.
          setSectionAnnotations([]);
          return;
        }
        throw cause;
      }
    },
    [],
  );

  const loadCompanionMessages = useCallback(
    async (projectId: string): Promise<void> => {
      const response = await slateApi<SlateProjectChatResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/chat`,
      );
      if (projectRef.current?.id === projectId) {
        companionMessagesBufferRef.current = response.messages;
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
      ...(snapshot.document ? { document: snapshot.document } : {}),
      lockedRanges: snapshot.lockedRanges,
    });
    const keepalive =
      options.keepalive === true &&
      new TextEncoder().encode(requestBody).byteLength <=
        SLATE_KEEPALIVE_BODY_MAX_BYTES;
    setSaveState("saving");
    const save = slateApi<SlateRichSectionResponse>(
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
            const response = await slateApi<SlateRichSectionResponse>(
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
        setSectionAnnotations([]);
        return;
      }
      const response = await slateApi<SlateRichSectionResponse>(
        `/api/slate/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(preferred.id)}`,
      );
      adoptSection(response.section);
      await loadSectionAnnotations(projectId, response.section.id);
    },
    [adoptSection, loadSectionAnnotations],
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

  const loadStoryBibleDesk = useCallback(
    async (projectId: string, sectionId: string): Promise<void> => {
      setStoryBibleLoading(true);
      try {
        const query = new URLSearchParams({ sectionId });
        const response = await slateApi<
          SlateStoryBibleDeskData & { ok: true }
        >(
          `/api/slate/projects/${encodeURIComponent(projectId)}/story-bible?${query.toString()}`,
        );
        if (
          projectRef.current?.id === projectId &&
          activeSectionRef.current?.id === sectionId
        ) {
          setStoryBibleDesk(response);
        }
      } finally {
        setStoryBibleLoading(false);
      }
    },
    [],
  );

  const updateStoryBibleCharacterField = useCallback(
    async (
      profileId: string,
      field: SlateCharacterEditableField,
      value: string | string[],
      writerLocked: boolean,
    ): Promise<void> => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection) {
        throw new Error("Open a manuscript section before curating Cast.");
      }
      await slateApi(
        `/api/slate/projects/${encodeURIComponent(currentProject.id)}/characters/${encodeURIComponent(profileId)}/fields/${encodeURIComponent(field)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            value,
            writerLocked,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      await loadStoryBibleDesk(currentProject.id, currentSection.id);
    },
    [loadStoryBibleDesk],
  );

  const updateStoryBibleIntendedArc = useCallback(
    async (
      profileId: string,
      input: {
        startState: string;
        destinationState: string;
        writerLocked: boolean;
      },
    ): Promise<void> => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection) {
        throw new Error("Open a manuscript section before curating an arc.");
      }
      await slateApi(
        `/api/slate/projects/${encodeURIComponent(currentProject.id)}/characters/${encodeURIComponent(profileId)}/intended-arc`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...input,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      await loadStoryBibleDesk(currentProject.id, currentSection.id);
    },
    [loadStoryBibleDesk],
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
        setCompanionOpen(false);
        clearCompanionBubbles();
        companionMessagesBufferRef.current = [];
        setCompanionDraft("");
        setDismissedReturnSessionId(null);
        setContinuityConcern(null);
        setStoryBibleDesk(null);
        await Promise.allSettled([
          openReturnSession(projectId),
          loadLivingSummary(projectId),
          loadHandoffSources(projectId),
          ...(globalCompanionEnabled
            ? []
            : [loadCompanionMessages(projectId)]),
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
      clearCompanionBubbles,
      flushPendingManuscriptSave,
      globalCompanionEnabled,
      loadContinuityConcern,
      loadCompanionMessages,
      loadHandoffSources,
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
    [
      openMenu,
      openProject,
      theme,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void refreshProjects()
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
  }, [refreshProjects]);

  useEffect(() => {
    if (
      !requestedProjectId ||
      loading ||
      requestedProjectOpenedRef.current === requestedProjectId ||
      !projects.some((candidate) => candidate.id === requestedProjectId)
    ) {
      return;
    }
    requestedProjectOpenedRef.current = requestedProjectId;
    void openProject(requestedProjectId);
  }, [loading, openProject, projects, requestedProjectId]);

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

  useEffect(() => {
    if (
      !project?.id ||
      !activeSection?.id
    ) {
      return;
    }
    void loadStoryBibleDesk(project.id, activeSection.id).catch((cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Slate could not open the Story Bible.",
      );
    });
  }, [
    activeSection?.id,
    activeSection?.revision,
    loadStoryBibleDesk,
    project?.id,
  ]);

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
        const response = await slateApi<SlateRichSectionResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/sections/${encodeURIComponent(sectionId)}`,
        );
        adoptSection(response.section);
        await loadSectionAnnotations(currentProject.id, response.section.id);
        setSaveState("saved");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Slate could not open that section.");
      } finally {
        setBusy(false);
      }
    },
    [adoptSection, flushPendingManuscriptSave, loadSectionAnnotations],
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
              const response = await slateApi<SlateRichSectionResponse>(
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
    const rawContent = companionDraft.trim();
    const content = (
      (await expandComposerDraft?.(rawContent)) ?? rawContent
    ).trim();
    if (!current || !content || companionBusy) return;
    const optimisticMessage: SlateProjectChatMessage = {
      id: `local-${Date.now()}`,
      projectId: current.id,
      role: "user",
      content,
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setCompanionBusy(true);
    setCompanionDraft("");
    setError(null);
    showCompanionBubbles([optimisticMessage]);
    try {
      await flushPendingManuscriptSave();
      const response = await slateApi<SlateProjectChatResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}/chat`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      if (projectRef.current?.id === current.id) {
        companionMessagesBufferRef.current = response.messages;
        const reply = response.messages.findLast(
          (message) => message.role === "assistant",
        );
        if (reply) showCompanionBubbles([reply]);
      }
    } catch (cause) {
      setCompanionDraft(content);
      setError(cause instanceof Error ? cause.message : "Prism could not answer here.");
    } finally {
      setCompanionBusy(false);
    }
  };

  const openSlateDeliberation = (): void => {
    if (!deliberationPrompt.trim()) {
      setDeliberationPrompt(
        revisionDirection.trim() ||
          draftDirection.trim() ||
          projectRef.current?.direction.trim() ||
          "What is the strongest creative direction from here?",
      );
    }
    setDeliberationError(null);
    setDeliberationOpen(true);
  };

  const startSlateDeliberation = async (): Promise<void> => {
    const current = projectRef.current;
    const prompt = deliberationPrompt.trim();
    if (!current || !prompt || deliberationRunning) return;
    const run: SlateDeliberationRun = {
      id: crypto.randomUUID(),
      controller: null,
    };
    deliberationRunRef.current = run;
    setDeliberationMessages([]);
    setDeliberationError(null);
    setDeliberationRunning(true);
    try {
      await flushPendingManuscriptSave();
      if (deliberationRunRef.current?.id !== run.id) return;
      const focusedSection = activeSectionRef.current;
      const focus = focusedSection
        ? {
            sectionId: focusedSection.id,
            selectionStart:
              selection.end > selection.start ? selection.start : null,
            selectionEnd:
              selection.end > selection.start ? selection.end : null,
          }
        : undefined;
      let messages: SlateDeliberationMessage[] = [];
      const turnCount = deliberationRounds * 2 + 1;
      for (let turn = 0; turn < turnCount; turn += 1) {
        if (
          deliberationRunRef.current?.id !== run.id ||
          projectRef.current?.id !== current.id
        ) {
          return;
        }
        const speaker = slateDeliberationNextSpeaker(
          messages.length,
          deliberationRounds,
        );
        setDeliberationActiveSpeaker(speaker);
        const controller = new AbortController();
        run.controller = controller;
        const response = await slateApi<SlateDeliberationTurnResponse>(
          `/api/slate/projects/${encodeURIComponent(current.id)}/deliberation/turn`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              prompt,
              rounds: deliberationRounds,
              messages: messages.map((message) => ({
                speaker: message.speaker,
                round: message.round,
                content: message.content,
              })),
              ...(focus ? { focus } : {}),
            }),
          },
        );
        if (deliberationRunRef.current?.id !== run.id) return;
        if (response.message.speaker !== speaker) {
          throw new Error("Lux and Umbra lost their turn order.");
        }
        messages = [...messages, response.message];
        setDeliberationMessages(messages);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setDeliberationError(
          cause instanceof Error
            ? cause.message
            : "Lux and Umbra could not continue the exchange.",
        );
      }
    } finally {
      if (deliberationRunRef.current?.id === run.id) {
        deliberationRunRef.current = null;
        setDeliberationRunning(false);
        setDeliberationActiveSpeaker(null);
      }
    }
  };

  const resetSlateDeliberation = (): void => {
    stopSlateDeliberation();
    setDeliberationMessages([]);
    setDeliberationError(null);
  };

  const useSlateDeliberationDirection = (): void => {
    const synthesis = deliberationMessages.findLast(
      (message) => message.speaker === "synthesis",
    );
    if (!synthesis) return;
    if (activeSectionRef.current?.prose.trim()) {
      setRevisionDirection(synthesis.content);
    } else {
      setDraftDirection(synthesis.content);
    }
    setDeliberationOpen(false);
  };

  const requestTitleSuggestion = useCallback(async (force = false): Promise<void> => {
    const current = projectRef.current;
    if (!current || titleSuggestionBusy) return;
    setTitleSuggestionBusy(true);
    setTitleSuggestionNotice(null);
    setError(null);
    try {
      await flushPendingManuscriptSave();
      const response = await slateApi<SlateTitleSuggestionResponse>(
        `/api/slate/projects/${encodeURIComponent(current.id)}/title-suggestions`,
        { method: "POST", body: JSON.stringify({ force }) },
      );
      adoptProject(response.project);
      if (titleReviewDue) {
        markSlateTitleReviewHandled(current.id);
        setTitleReviewDue(false);
      }
      setTitleSuggestionNotice(
        response.project.titleSuggestion
          ? null
          : force
            ? "Prism could not find a distinct alternative yet."
            : "Prism thinks the current title still fits.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prism could not reconsider the title.");
    } finally {
      setTitleSuggestionBusy(false);
    }
  }, [adoptProject, flushPendingManuscriptSave, titleReviewDue, titleSuggestionBusy]);

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
    if (!drag.moved) toggleCompanion();
  };

  const toggleCompanion = (): void => {
    if (companionOpen) {
      setCompanionOpen(false);
      clearCompanionBubbles();
      return;
    }
    setCompanionOpen(true);
    showCompanionBubbles(companionMessagesBufferRef.current, true);
  };

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

  const selectProjectSourceMode = (nextMode: SlateProjectSourceMode): void => {
    setProjectSourceMode(nextMode);
    setError(null);
    setWildcardPreview(null);
    if (nextMode === "material") setWildcardMode(false);
    if (titleOrigin !== "writer") {
      setTitle("");
      setTitleOrigin("writer");
      setCreationTitleReason(null);
    }
  };

  const generateCreationTitle = async (
    preparedSpark?: string,
  ): Promise<boolean> => {
    if (titleGenerating) return false;
    const source =
      projectSourceMode === "material"
        ? existingMaterial
        : (preparedSpark ?? wildcardPreview?.spark ?? spark);
    setTitleGenerating(true);
    setError(null);
    try {
      const response = await slateApi<SlateGenerateTitleResponse>(
        "/api/slate/title-suggestions",
        {
          method: "POST",
          body: JSON.stringify({
            source,
            sourceKind: projectSourceMode,
            ...(title.trim() && title.trim() !== "Untitled Story"
              ? { currentTitle: title.trim() }
              : {}),
          }),
        },
      );
      setTitle(response.title);
      setTitleOrigin(projectSourceMode);
      setCreationTitleReason(response.reason);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Slate could not generate a title from that material.",
      );
      return false;
    } finally {
      setTitleGenerating(false);
    }
  };

  const advanceProjectStart = async (): Promise<void> => {
    if (!slateProjectSourceIsReady({
      sourceMode: projectSourceMode,
      spark,
      existingMaterial,
    })) {
      setError("Begin with a creative spark or bring in material you already have.");
      return;
    }
    const hasWildcards =
      projectSourceMode === "spark" && SLATE_SUPPORTED_WILDCARD_RE.test(spark);
    setError(null);
    setWildcardResolving(hasWildcards);
    try {
      const wildcardCreation = hasWildcards ? await resolveSparkWildcards() : null;
      const sourceSpark = wildcardCreation?.spark ?? slateProjectSparkForCreation({
        sourceMode: projectSourceMode,
        spark,
        existingMaterial,
      });
      setProjectStartStep("title");
      if (title.trim()) {
        setTitleOrigin("writer");
        setCreationTitleReason(null);
      } else {
        setTitle("Untitled Story");
        setTitleOrigin("writer");
        await generateCreationTitle(sourceSpark);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Slate could not prepare that beginning.");
    } finally {
      setWildcardResolving(false);
    }
  };

  const createProject = async (titleOverride?: string): Promise<void> => {
    const shouldGenerateCover = generateCoverAfterCreate;
    setBusy(true);
    setError(null);
    try {
      const wildcardCreation =
        projectSourceMode === "spark" && SLATE_SUPPORTED_WILDCARD_RE.test(spark)
        ? await resolveSparkWildcards()
        : null;
      const creationSpark = wildcardCreation?.spark ?? slateProjectSparkForCreation({
        sourceMode: projectSourceMode,
        spark,
        existingMaterial,
      });
      let response = await slateApi<SlateProjectResponse>("/api/slate/projects", {
        method: "POST",
        body: JSON.stringify({
          title: slateProjectTitleForCreation(titleOverride ?? title),
          titleOrigin: titleOverride ? "writer" : titleOrigin,
          spark: creationSpark,
          ...(wildcardCreation
            ? { sparkWildcards: wildcardCreation.sparkWildcards }
            : {}),
        }),
      });
      if (projectSourceMode === "material" && existingMaterial.trim()) {
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
      setCompanionOpen(false);
      clearCompanionBubbles();
      companionMessagesBufferRef.current = [];
      setTitle("");
      setTitleOrigin("writer");
      setCreationTitleReason(null);
      setSpark("");
      setEntryMode("desk");
      setProjectStartStep("source");
      setProjectSourceMode("spark");
      setEarlyTitleOpen(false);
      setWildcardMode(false);
      setWildcardPreview(null);
      setExistingMaterial("");
      setGenerateCoverAfterCreate(true);
      setSaveState("saved");
      await refreshProjects();
      if (shouldGenerateCover) {
        void synthesizeProjectCover(response.project.id);
      }
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
    const current = projectRef.current;
    if (!current) return;
    const next = {
      ...current,
      structure: current.structure.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    };
    projectRef.current = next;
    setProject(next);
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

  const updateActiveSectionProse = (
    prose: string,
    document?: SlateSectionDocumentV1,
    documentKey = "no-section",
  ): void => {
    const current = activeSectionRef.current;
    if (
      !current ||
      !slateCanvasUpdateMatchesActiveSection({
        activeSectionId: current.id,
        documentKey,
      }) ||
      (prose === current.prose &&
        (!document ||
          JSON.stringify(document) === JSON.stringify(current.document)))
    ) {
      return;
    }
    const next = {
      ...current,
      prose,
      proseLength: prose.length,
      ...(document ? { document } : {}),
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

  const focusDirectorBar = (scope: SlateDirectorScope): void => {
    setDirectorScope(scope);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          '[data-tutorial-target="slate-direction"] textarea',
        )
        ?.focus();
    });
  };

  const createSectionNote = (input: {
    body: string;
    selection: { start: number; end: number };
    blockId: string | null;
    startPosition: SlateDocumentAnchor["startPosition"];
    endPosition: SlateDocumentAnchor["endPosition"];
  }): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection || !input.blockId) return;
      const quote = currentSection.prose.slice(
        input.selection.start,
        input.selection.end,
      );
      const anchor: SlateDocumentAnchor = {
        sourceId: "",
        sectionId: currentSection.id,
        sectionRevision: currentSection.revision,
        start: input.selection.start,
        end: input.selection.end,
        startPosition: input.startPosition,
        endPosition: input.endPosition,
        quoteHash: await slateQuoteHash(quote),
      };
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const latest = activeSectionRef.current;
        if (!latest || latest.id !== currentSection.id) return;
        const response = await slateApi<SlateAnnotationResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/sections/${encodeURIComponent(currentSection.id)}/annotations`,
          {
            method: "POST",
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              blockId: input.blockId,
              anchor: {
                ...anchor,
                sectionRevision: latest.revision,
              },
              kind: "note",
              body: input.body,
            }),
          },
        );
        setSectionAnnotations((current) => [
          ...current.filter(
            (annotation) => annotation.id !== response.annotation.id,
          ),
          response.annotation,
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not save that personal note.",
        );
      }
    })();
  };

  const resolveSectionNote = (annotationId: string): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection) return;
      setError(null);
      try {
        const response = await slateApi<SlateAnnotationResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/sections/${encodeURIComponent(currentSection.id)}/annotations/${encodeURIComponent(annotationId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              resolved: true,
            }),
          },
        );
        setSectionAnnotations((current) =>
          current.filter(
            (annotation) => annotation.id !== response.annotation.id,
          ),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not resolve that personal note.",
        );
      }
    })();
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

  const reloadWritingOperationContext = async (): Promise<void> => {
    const currentProject = projectRef.current;
    const currentSection = activeSectionRef.current;
    if (!currentProject || !currentSection) return;
    const focusedStructureId =
      currentSection.structureItemId ?? selectedStructureId;
    const response = await slateApi<SlateProjectResponse>(
      `/api/slate/projects/${encodeURIComponent(currentProject.id)}`,
    );
    adoptProject(response.project);
    await loadProjectSections(
      currentProject.id,
      currentSection.id,
      focusedStructureId,
    );
    void loadContinuityConcern(currentProject.id).catch(() => undefined);
    void loadLivingSummary(currentProject.id).catch(() => undefined);
    void refreshProjects();
    queueRecoveryStatusRefresh(currentProject.id);
  };

  const createWritingOperation = (
    operation: SlateWritingOperation["intent"]["operation"],
    direction: string,
  ): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (
        !currentProject ||
        !currentSection ||
        (operation !== "unstick" && !direction.trim())
      ) {
        return;
      }
      setWritingOperationBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const latestSection = activeSectionRef.current;
        if (!latestSection || latestSection.id !== currentSection.id) return;
        let selectionAnchor: SlateDocumentAnchor | null = null;
        if (selection.end > selection.start) {
          const quote = latestSection.prose.slice(
            selection.start,
            selection.end,
          );
          selectionAnchor = {
            sourceId: "",
            sectionId: latestSection.id,
            sectionRevision: latestSection.revision,
            start: selection.start,
            end: selection.end,
            startPosition: selection.startPosition ?? null,
            endPosition: selection.endPosition ?? null,
            quoteHash: await slateQuoteHash(quote),
          };
        }
        const response = await slateApi<SlateWritingOperationResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/writing-operations`,
          {
            method: "POST",
            body: JSON.stringify({
              sectionId: latestSection.id,
              idempotencyKey: crypto.randomUUID(),
              operation,
              direction: direction.trim(),
              scope: directorScope,
              ...(selectionAnchor ? { selection: selectionAnchor } : {}),
            }),
          },
        );
        adoptWritingOperationResponse(response);
        if (
          response.operation.status === "compiling" ||
          response.operation.status === "generating"
        ) {
          runWritingOperationRequest(response.operation);
        }
        setDirectorScope(response.operation.intent.scope);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not prepare that writing operation.",
        );
      } finally {
        setWritingOperationBusy(false);
      }
    })();
  };

  const mutateWritingOperation = (
    action: "stop" | "continue" | "redirect" | "accept" | "reject",
    direction?: string,
  ): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const operation = writingOperation;
      if (!currentProject || !operation) return;
      if (action === "redirect" && !direction?.trim()) {
        setError("Add a new direction before redirecting Slate.");
        return;
      }
      setWritingOperationBusy(true);
      setError(null);
      try {
        if (action !== "stop") await flushPendingManuscriptSave();
        const response = await slateApi<SlateWritingOperationResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/writing-operations/${encodeURIComponent(operation.id)}/${action}`,
          {
            method: "POST",
            body: JSON.stringify({
              revisionFingerprint: operation.revisionFingerprint.value,
              idempotencyKey: crypto.randomUUID(),
              ...(direction?.trim() ? { direction: direction.trim() } : {}),
            }),
          },
        );
        adoptWritingOperationResponse(response);
        if (
          (action === "continue" || action === "redirect") &&
          (response.operation.status === "compiling" ||
            response.operation.status === "generating")
        ) {
          runWritingOperationRequest(response.operation);
        }
        setDirectorScope(response.operation.intent.scope);
        if (action === "accept" || action === "reject") {
          await reloadWritingOperationContext();
          setSaveState("saved");
        }
      } catch (cause) {
        if (
          cause instanceof SlateApiError &&
          cause.status === 409 &&
          (cause.code === "slate_clarification_stale" ||
            cause.code === "slate_writing_fingerprint_stale")
        ) {
          try {
            const response = await slateApi<SlateWritingOperationResponse>(
              `/api/slate/projects/${encodeURIComponent(currentProject.id)}/writing-operations/${encodeURIComponent(operation.id)}`,
            );
            adoptWritingOperationResponse(response);
            if (
              response.operation.status === "compiling" ||
              response.operation.status === "generating"
            ) {
              runWritingOperationRequest(response.operation);
            }
          } catch {
            // The visible error still explains why no obsolete output was applied.
          }
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not update that writing operation.",
        );
      } finally {
        setWritingOperationBusy(false);
      }
    })();
  };

  const answerWritingClarification = (
    answer:
      | { kind: "choice"; choiceId: string }
      | { kind: "custom_vibe"; vibe: string },
  ): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const clarification = writingClarification;
      if (!currentProject || !clarification) return;
      setWritingOperationBusy(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await slateApi<SlateWritingOperationResponse>(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/clarifications/${encodeURIComponent(clarification.id)}/answer`,
          {
            method: "POST",
            body: JSON.stringify({
              revisionFingerprint: clarification.revisionFingerprint,
              idempotencyKey: crypto.randomUUID(),
              continuityGeneration: clarification.continuityGeneration,
              mirrorProfileVersionId:
                clarification.mirrorProfileVersionId,
              answer,
            }),
          },
        );
        adoptWritingOperationResponse(response);
        if (
          response.operation.status === "compiling" ||
          response.operation.status === "generating"
        ) {
          runWritingOperationRequest(response.operation);
        }
        setDirectorScope(response.operation.intent.scope);
      } catch (cause) {
        if (
          cause instanceof SlateApiError &&
          cause.status === 409 &&
          cause.code === "slate_clarification_stale" &&
          writingOperation
        ) {
          try {
            const response = await slateApi<SlateWritingOperationResponse>(
              `/api/slate/projects/${encodeURIComponent(currentProject.id)}/writing-operations/${encodeURIComponent(writingOperation.id)}`,
            );
            adoptWritingOperationResponse(response);
            if (
              response.operation.status === "compiling" ||
              response.operation.status === "generating"
            ) {
              runWritingOperationRequest(response.operation);
            }
          } catch {
            // The stale card remains visibly safe even if refresh is unavailable.
          }
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not apply that direction.",
        );
      } finally {
        setWritingOperationBusy(false);
      }
    })();
  };

  const keepLocalSectionEdits = (): void => {
    const local = activeSectionRef.current;
    const server = sectionConflict?.serverSection;
    if (!local || !server || local.id !== server.id) return;
    const rebased: SlateRichSectionDetail = {
      ...server,
      prose: local.prose,
      proseLength: local.prose.length,
      lockedRanges: local.lockedRanges,
      ...(local.document ? { document: local.document } : {}),
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

  const openFullBookReader = (): void => {
    void (async () => {
      const current = projectRef.current;
      if (!current) return;
      setFullBookOpen(true);
      setFullBookLoading(true);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const manuscriptSections = await loadSlateManuscriptSections(current.id);
        if (projectRef.current?.id === current.id) {
          setFullBookSections(manuscriptSections);
        }
      } catch (cause) {
        setFullBookOpen(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not open the full manuscript.",
        );
      } finally {
        setFullBookLoading(false);
      }
    })();
  };

  const exportSlateReview = (): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const currentSection = activeSectionRef.current;
      if (!currentProject || !currentSection) return;
      setReviewExporting(true);
      setReviewExportNotice(null);
      setError(null);
      try {
        await flushPendingManuscriptSave();
        const response = await fetch(
          `/api/slate/projects/${encodeURIComponent(currentProject.id)}/review-export`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sectionId: currentSection.id,
              format: "markdown",
            }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error ?? "Slate could not prepare that review export.",
          );
        }
        const disposition = response.headers.get("content-disposition") ?? "";
        const filename =
          disposition.match(/filename="([^"]+)"/u)?.[1] ??
          `${currentSection.title || "slate-section"}-review.md`;
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        setReviewExportNotice("Focused review exported.");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Slate could not prepare that review export.",
        );
      } finally {
        setReviewExporting(false);
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

  const resolveContinuityConcern = (directionOverride?: string): void => {
    void (async () => {
      const currentProject = projectRef.current;
      const concern = continuityConcern;
      if (!currentProject || !concern) return;
      const request = slateConcernResolveRequestForDirection(
        concern,
        directionOverride ?? continuityDirection,
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
  const showFirstVisitWelcome =
    !hadVisitedBeforeThisMount && projects.length === 0;
  const showProjectCreation = showFirstVisitWelcome || entryMode === "create";
  const existingMaterialOpen = projectSourceMode === "material";

  const totalManuscriptLength = sections.reduce(
    (total, section) => total + section.proseLength,
    0,
  );
  useEffect(() => {
    if (
      !project ||
      project.titleOrigin !== "spark" ||
      project.titleSuggestion ||
      totalManuscriptLength < SLATE_TITLE_REVIEW_INTERVAL_CHARS
    ) {
      setTitleReviewDue(false);
      return;
    }
    setTitleReviewDue(!slateTitleReviewWasHandled(project.id));
  }, [
    project,
    totalManuscriptLength,
  ]);
  const proseLaneMode: "offline" | "online" =
    project?.proseMode === "online" ||
    (project?.proseMode === "auto" &&
      (project.proseProvider === "openai" ||
        project.proseProvider === "anthropic" ||
        project.lastProvider === "openai" ||
        project.lastProvider === "anthropic"))
      ? "online"
      : "offline";
  const proseModelOptions = useMemo(() => {
    if (!project || !modelCatalog) return [];
    return proseLaneMode === "offline"
      ? modelCatalog.local
      : modelCatalog.online;
  }, [modelCatalog, project, proseLaneMode]);
  const proseModelValue =
    project?.proseModel && project.proseProvider
      ? `${project.proseProvider}:${project.proseModel}`
      : SLATE_AUTO_MODEL_VALUE;
  const directorUsesRevision = Boolean(activeSection?.prose.trim());
  const directorDirection = directorUsesRevision
    ? revisionDirection
    : draftDirection;
  const writingQuestionChoices = writingClarification
    ? ([
        {
          id: writingClarification.choices[0].id,
          label: writingClarification.choices[0].label,
          description: writingClarification.choices[0].description,
          direction: "",
        },
        {
          id: writingClarification.choices[1].id,
          label: writingClarification.choices[1].label,
          description: writingClarification.choices[1].description,
          direction: "",
        },
        {
          id: writingClarification.choices[2].id,
          label: writingClarification.choices[2].label,
          description: writingClarification.choices[2].description,
          direction: "",
        },
      ] as const)
    : null;
  const writingProposal =
    writingOperation?.status === "proposed"
      ? writingOperation.proposal
      : null;
  const writingProposalCurrentText = writingProposal
    ? writingProposal.replacementAnchor
      ? (activeSection?.prose.slice(
          writingProposal.replacementAnchor.start,
          writingProposal.replacementAnchor.end,
        ) ?? "")
      : (activeSection?.prose ?? "")
    : "";
  const writingProposalCurrentPreview = slateWritingProposalPreview(
    writingProposalCurrentText,
  );
  const writingProposalProposedPreview = slateWritingProposalPreview(
    writingProposal?.prose ?? "",
  );
  const writingProposalNeedsPassageScope = Boolean(
    writingProposal &&
      activeSection &&
      slateImportedSectionRequiresPassageScope({
        kind: activeSection.kind,
        title: activeSection.title,
        prose: activeSection.prose,
        hasSelection: Boolean(writingProposal.replacementAnchor),
      }),
  );
  const writingOperationBlocksNew =
    writingOperation?.status === "compiling" ||
    writingOperation?.status === "awaiting_clarification" ||
    writingOperation?.status === "generating" ||
    writingOperation?.status === "proposed";
  const currentStoryBible =
    storyBibleDesk && storyBibleDesk.projectId === project?.id
      ? storyBibleDesk
      : null;
  const currentMomentum =
    currentStoryBible &&
    currentStoryBible.momentum.sectionId === activeSection?.id
      ? currentStoryBible.momentum
      : null;
  const inspectorLooseThreads = currentStoryBible
    ? currentStoryBible.storyBible.threads.filter((thread) =>
        thread.status === "open" ||
        thread.status === "due" ||
        thread.status === "missed" ||
        thread.status === "deferred",
      )
    : (project?.unresolvedThreads ?? []);
  const liveWire =
    currentMomentum?.liveWire?.label ??
    inspectorLooseThreads[0]?.label ??
    selectedStructureItem?.summary ??
    project?.premise ??
    "the pressure already alive in this scene";

  const updateDirectorDirection = (value: string): void => {
    if (directorUsesRevision) setRevisionDirection(value);
    else setDraftDirection(value);
    setDirectorScope((current) => slateInferredDirectorScope(value, current));
  };

  const runDirector = (): void => {
    createWritingOperation(
      directorUsesRevision ? revisionAction : "draft",
      directorDirection,
    );
  };

  useEffect(() => {
    const update = hemisphereSettingsUpdate;
    const current = projectRef.current;
    if (!update || !current || update.projectId !== current.id) return;
    const next = { ...current, deliberationConfig: update.config };
    projectRef.current = next;
    setProject(next);
  }, [hemisphereSettingsUpdate]);

  useEffect(() => {
    if (!onHemisphereSettingsSnapshot) return;
    if (!project) {
      onHemisphereSettingsSnapshot(null);
      return;
    }
    onHemisphereSettingsSnapshot({
      projectId: project.id,
      projectTitle: project.title,
      proseMode: project.proseMode,
      config: project.deliberationConfig,
      modelOptions: proseModelOptions,
    });
  }, [onHemisphereSettingsSnapshot, project, proseModelOptions]);

  useEffect(
    () => () => onHemisphereSettingsSnapshot?.(null),
    [onHemisphereSettingsSnapshot],
  );

  const luxDeliberationMessages = deliberationMessages.filter(
    (message) => message.speaker === "lux",
  );
  const umbraDeliberationMessages = deliberationMessages.filter(
    (message) => message.speaker === "umbra",
  );
  const deliberationSynthesis = deliberationMessages.findLast(
    (message) => message.speaker === "synthesis",
  );

  if (loading) {
    return (
      <main className={`${styles.shell} ${className}`} data-theme={theme}>
        <PrismCompanionPresenceBoundary reason="slate-loading" />
        <div className={styles.mainNavigation}>{navigationHeader}</div>
        <div className={styles.loading} role="status" aria-live="polite">
          <PrismOrb className={styles.loadingOrb} />
          <p>Opening the writing desk…</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${styles.shell} ${className}`}
      data-slate-workspace="true"
      data-theme={theme}
      data-focus-mode={focusMode ? "true" : undefined}
    >
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
            <div className={styles.returnSessionBody}>
              <p className={styles.eyebrow}>Welcome back</p>
              <h1 id="slate-return-title">{returnSession.synopsis.title}</h1>
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
            </div>
            <aside
              className={styles.returnCover}
              style={slateProjectBookStyle(project.cover.seed || project.id)}
              data-cover-ready={project.cover.imageUrl ? "true" : undefined}
              aria-hidden="true"
            >
              <span className={`${styles.bookCover} ${styles.returnBookCover}`}>
                {project.cover.imageUrl ? (
                  <Image
                    src={project.cover.imageUrl}
                    alt=""
                    fill
                    sizes="190px"
                    unoptimized
                  />
                ) : null}
                <span className={styles.bookPrismMark} />
                <span className={styles.bookCoverCopy}>
                  <strong>{project.title}</strong>
                  <small>{project.phase}</small>
                </span>
              </span>
            </aside>
          </section>
        </div>
      ) : null}

      {!project ? (
        <section className={showFirstVisitWelcome ? styles.welcome : styles.deskHome}>
          {showFirstVisitWelcome ? (
            <div className={styles.welcomeCopy}>
              <p className={styles.eyebrow}>A quiet creative-production desk</p>
              <h1>Bring the spark. Direct the work.</h1>
              <p>
                Shape the story, let Slate carry the drafting labor, then approve only
                the prose that earns its place.
              </p>
            </div>
          ) : (
            <header className={styles.deskHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {showProjectCreation ? "New project" : "Project shelf"}
                </p>
                <h1>{showProjectCreation ? "Begin the next work." : "Your Slate library."}</h1>
                <p>
                  {showProjectCreation
                    ? "Start with a spark or bring pages you already have."
                    : "Pull a work from the shelf, begin a new volume, or restore a portable backup."}
                </p>
              </div>
              <div className={styles.deskActions}>
                {showProjectCreation ? (
                  <button
                    type="button"
                    className={styles.quietButton}
                    onClick={() => setEntryMode("desk")}
                  >
                    Back to library
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={archiveBusy}
                    onClick={() => archiveInputRef.current?.click()}
                  >
                    {archiveBusy ? "Reading backup…" : "Restore backup"}
                  </button>
                )}
              </div>
            </header>
          )}
          {showProjectCreation ? (
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
                {!existingMaterialOpen ? (
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
                ) : null}

                <div className={styles.sourceOptions} aria-label="Ways to begin">
                  <button
                    type="button"
                    className={styles.quietButton}
                    aria-pressed={existingMaterialOpen}
                    onClick={() =>
                      selectProjectSourceMode(
                        existingMaterialOpen ? "spark" : "material",
                      )
                    }
                  >
                    {existingMaterialOpen
                      ? "Use a creative spark instead"
                      : "Bring existing material"}
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
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setTitleOrigin("writer");
                      }}
                      maxLength={180}
                    />
                  </label>
                ) : null}

                {!existingMaterialOpen ? (
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
                ) : null}

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={
                    busy ||
                    wildcardResolving ||
                    !slateProjectSourceIsReady({
                      sourceMode: projectSourceMode,
                      spark,
                      existingMaterial,
                    })
                  }
                >
                  {wildcardResolving ? "Preparing…" : "Continue"}
                </button>
                <p className={styles.keyboardHint}>⌘ / Ctrl + Enter continues from the active writing field.</p>
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
                  <p>
                    {titleOrigin === "writer"
                      ? title.trim() === "Untitled Story"
                        ? "Name it yourself, ask Slate to generate a title, or keep it untitled for now."
                        : "Keep the working title you supplied, change it, or skip naming for now."
                      : `Slate generated a working title from your ${existingMaterialOpen ? "material" : "spark"}. Keep it, change it, or ask for another.`}
                  </p>
                </header>
                <div className={styles.sourceRecap}>
                  <span>{wildcardPreview ? "Resolved spark" : existingMaterialOpen ? "Material ready" : "Your spark"}</span>
                  <p>
                    {wildcardPreview?.spark ?? (existingMaterialOpen
                      ? "Your imported pages are ready at the desk."
                      : spark.trim())}
                  </p>
                  {existingMaterialOpen && existingMaterial.trim() ? (
                    <small>{existingMaterial.trim().split(/\s+/u).length.toLocaleString()} imported words</small>
                  ) : null}
                </div>
                <div className={styles.titleGenerator}>
                  <label>
                    Working title
                    <input
                      value={title}
                      disabled={titleGenerating}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setTitleOrigin("writer");
                        setCreationTitleReason(null);
                      }}
                      maxLength={180}
                      autoFocus
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={busy || titleGenerating}
                    onClick={() => void generateCreationTitle()}
                  >
                    {titleGenerating
                      ? "Finding the title…"
                      : title.trim() === "Untitled Story"
                        ? "Generate title"
                        : "Generate another title"}
                  </button>
                  {creationTitleReason ? <p>{creationTitleReason}</p> : null}
                </div>
                <label className={styles.coverChoice}>
                  <input
                    type="checkbox"
                    checked={generateCoverAfterCreate}
                    disabled={busy || titleGenerating}
                    onChange={(event) =>
                      setGenerateCoverAfterCreate(event.target.checked)
                    }
                  />
                  <span>
                    <strong>Create a book cover</strong>
                    <small>
                      Slate opens the manuscript first, then uses your saved image
                      provider to render the cover.
                    </small>
                  </span>
                </label>
                <div className={styles.startActions}>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={busy || titleGenerating}
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
                    disabled={busy || titleGenerating || !title.trim()}
                  >
                    {busy
                      ? "Creating…"
                      : titleGenerating
                        ? "Finding the title…"
                        : "Create project"}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.skipTitle}
                  disabled={busy || titleGenerating}
                  onClick={() => void createProject("Untitled Story")}
                >
                  Skip naming · use Untitled Story
                </button>
              </div>
            )}
            </form>
          ) : null}
          {!showProjectCreation ? (
            <div className={styles.projectShelf}>
              <div className={styles.shelfHeading}>
                <h2>{projects.length > 0 ? "Recently edited" : "First shelf"}</h2>
                <span>
                  {projects.length} {projects.length === 1 ? "volume" : "volumes"}
                </span>
              </div>
              <div className={styles.shelfBooks}>
                {projects.map((item) => {
                  const menuId = `slate-project-actions-${item.id}`;
                  const menuOpen = activeMenu?.id === menuId;
                  const coverGenerating = coverGeneratingProjectIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={styles.projectBook}
                      style={slateProjectBookStyle(item.cover.seed || item.id)}
                      data-cover-ready={item.cover.imageUrl ? "true" : undefined}
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
                        className={styles.projectBookOpen}
                        onClick={() => void openProject(item.id)}
                      >
                        <span className={styles.bookCover}>
                          {item.cover.imageUrl ? (
                            <Image
                              src={item.cover.imageUrl}
                              alt=""
                              fill
                              sizes="156px"
                              unoptimized
                            />
                          ) : null}
                          <span className={styles.bookPrismMark} aria-hidden="true" />
                          <span className={styles.bookCoverCopy}>
                            <strong>{item.title}</strong>
                            <small>{item.phase}</small>
                          </span>
                          {coverGenerating ? (
                            <span className={styles.bookRendering}>Rendering cover…</span>
                          ) : null}
                        </span>
                        <span className={styles.bookDetails}>
                          <span>{item.manuscriptLength.toLocaleString()} characters</span>
                          <span>Edited {readableUpdatedAt(item.updatedAt)}</span>
                        </span>
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
                <button
                  type="button"
                  className={styles.newProjectBook}
                  data-tutorial-target="slate-create-project"
                  onClick={() => setEntryMode("create")}
                >
                  <span aria-hidden="true">＋</span>
                  <strong>New project</strong>
                  <small>Place another work on the shelf</small>
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <div
          className={styles.workspace}
          data-story-map-collapsed={storyMapCollapsed ? "true" : undefined}
        >
          <SlateStoryMap
            title={project.title}
            projectId={project.id}
            projects={projects}
            items={project.structure}
            sections={sections}
            selectedId={selectedStructureId}
            busy={busy || saveState === "saving"}
            collapsed={storyMapCollapsed}
            onToggleCollapsed={() =>
              setStoryMapCollapsed((current) => !current)
            }
            onOpenProjects={() => {
              void flushPendingManuscriptSave()
                .then(() => {
                  projectRef.current = null;
                  activeSectionRef.current = null;
                  lastSavedSectionRef.current = null;
                  setProject(null);
                  setSections([]);
                  setActiveSection(null);
                  setHandoffSources([]);
                  setEntryMode("desk");
                  setReturnSession(null);
                  setDismissedReturnSessionId(null);
                  setContinuityConcern(null);
                  setContinuityDirection("");
                  setProtectedAt(null);
                  setFocusMode(false);
                  setCockpitDrawer(null);
                  snoozedConcernIdRef.current = null;
                })
                .catch(() => undefined);
            }}
            onOpenProject={(projectId) => void openProject(projectId)}
            onSelect={(item) => {
              setSelectedStructureId(item.id);
              const matchingSection = slateSectionForStructure(sections, item.id);
              if (matchingSection) void openSection(matchingSection.id);
            }}
            onShape={() => {
              if (
                project.structure.length > 0 &&
                !window.confirm(
                  "Replace the current plan with a newly shaped one? The manuscript will stay untouched.",
                )
              ) {
                return;
              }
              void runProjectOperation("/shape");
            }}
            onAddScene={addScene}
            onMutate={mutateStructureItem}
            onSave={() =>
              void saveStructure(
                projectRef.current?.structure ?? project.structure,
              )
            }
            onMove={(itemId, direction) =>
              void saveStructure(
                reorderSlateStructure(
                  projectRef.current?.structure ?? project.structure,
                  itemId,
                  direction,
                ),
              )
            }
            onRemove={(itemId) =>
              void saveStructure(
                (projectRef.current?.structure ?? project.structure).filter(
                  (candidate) => candidate.id !== itemId,
                ),
              )
            }
          />
          <aside className={styles.legacyStructureRail} aria-hidden="true">
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
                      setHandoffSources([]);
                      setEntryMode("desk");
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
                <div className={styles.bookIdentityActions}>
                  <button
                    type="button"
                    className={styles.titleSuggestionTrigger}
                    disabled={titleSuggestionBusy || busy}
                    onClick={() => void requestTitleSuggestion(true)}
                  >
                    {titleSuggestionBusy ? "Prism is listening…" : "Generate a new title"}
                  </button>
                </div>
                {titleSuggestionNotice ? (
                  <span className={styles.titleSuggestionNotice}>{titleSuggestionNotice}</span>
                ) : null}
                <input
                  ref={coverUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadProjectCover(project.id, file);
                  }}
                />
                <AssetRail
                  kind="slate_cover"
                  label="Book covers"
                  context={project.id}
                  currentImageIds={[project.cover.imageId]}
                  refreshKey={project.cover.imageId}
                  disabled={coverGeneratingProjectIds.has(project.id)}
                  onUpload={() => coverUploadRef.current?.click()}
                  onSynthesize={(direction) =>
                    synthesizeProjectCover(project.id, false, direction)
                  }
                  onSelect={(asset) => reuseProjectCover(project.id, asset.id)}
                />
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
                  onClick={openFullBookReader}
                >
                  Read full book
                </button>
                <button
                  type="button"
                  className={styles.quietButton}
                  aria-pressed={focusMode}
                  onClick={() => setFocusMode((current) => !current)}
                >
                  {focusMode ? "Leave focus" : "Focus"}
                </button>
                <button
                  type="button"
                  className={styles.quietButton}
                  data-tutorial-target="slate-project-tools"
                  aria-expanded={cockpitDrawer === "project"}
                  onClick={() =>
                    setCockpitDrawer((current) =>
                      current === "project" ? null : "project",
                    )
                  }
                >
                  Project tools
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
            {titleReviewDue && !project.titleSuggestion ? (
              <section
                className={styles.titleSuggestionCard}
                data-kind="title-checkpoint"
                aria-label="Working title checkpoint"
                aria-live="polite"
              >
                <div>
                  <span>Working title checkpoint</span>
                  <h2>The draft has grown beyond its opening spark.</h2>
                  <p>
                    Check whether “{project.title}” still names the work it has become.
                    Slate will suggest a change only if it finds a stronger fit.
                  </p>
                </div>
                <footer>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={titleSuggestionBusy}
                    onClick={() => void requestTitleSuggestion()}
                  >
                    {titleSuggestionBusy ? "Reviewing…" : "Review working title"}
                  </button>
                </footer>
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
            {handoffSources.length > 0 ? (
              <details className={styles.handoffSources}>
                <summary>
                  Source material from Zen
                  <span>{handoffSources.length}</span>
                </summary>
                <p>
                  Reference only. These excerpts do not alter the manuscript or
                  enter Continuity.
                </p>
                <div>
                  {handoffSources.map((handoff) => (
                    <article key={handoff.id}>
                      <span>{handoff.sourceLabel}</span>
                      <blockquote>{handoff.sourceText}</blockquote>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
            <SlateManuscriptCanvas
              documentKey={activeSection?.id ?? "no-section"}
              value={activeSection?.prose ?? ""}
              document={activeSection?.document}
              disabled={!activeSection}
              placeholder="Begin writing directly, or use the Director below to shape what comes next."
              annotations={sectionAnnotations}
              onChange={updateActiveSectionProse}
              onSelectionChange={setSelection}
              onLockSelection={lockSelection}
              onDirectSelection={() => focusDirectorBar("passage")}
              onCreateNote={createSectionNote}
              onResolveNote={resolveSectionNote}
              onDiscussSelection={
                onDiscussSelection && activeSection
                  ? () => {
                      void onDiscussSelection({
                        projectId: project.id,
                        sectionId: activeSection.id,
                        selectionStart: selection.start,
                        selectionEnd: selection.end,
                      });
                    }
                  : undefined
              }
            />
            {writingClarification && writingQuestionChoices ? (
              <SlateDirectionQuestion
                kind={
                  writingClarification.trigger === "unstick_me"
                    ? "unstick"
                    : "continuity"
                }
                eyebrow={
                  writingClarification.trigger === "unstick_me"
                    ? "Unstick me · three live paths"
                    : "Continuity · your intent is needed"
                }
                title={writingClarification.prompt}
                explanation={
                  writingClarification.trigger === "unstick_me"
                    ? "Choose one canon-grounded pressure, or describe the vibe in your own words. Slate resumes automatically."
                    : "This writing operation paused before prose was generated. Your manuscript remains fully editable."
                }
                choices={writingQuestionChoices}
                evidence={
                  writingClarification.sourceEvidence.length > 0 ? (
                    <details className={styles.continuityEvidence}>
                      <summary>Why Continuity noticed</summary>
                      {writingClarification.sourceEvidence.map((evidence) => (
                        <blockquote key={evidence.concernId ?? evidence.summary}>
                          <p>{evidence.summary}</p>
                        </blockquote>
                      ))}
                    </details>
                  ) : undefined
                }
                busy={writingOperationBusy}
                onChoose={(choice) =>
                  answerWritingClarification({
                    kind: "choice",
                    choiceId: choice.id,
                  })
                }
                onVibe={(vibe) =>
                  answerWritingClarification({
                    kind: "custom_vibe",
                    vibe,
                  })
                }
                onDismiss={() => mutateWritingOperation("stop")}
              />
            ) : null}
            {writingProposal ? (
              <section
                className={`${styles.revisionPreview} ${styles.inlineProposal}`}
                aria-label="Inline prose proposal"
              >
                <p>
                  Proposed {writingOperation?.intent.operation}
                  {writingOperation?.provider
                    ? ` · ${writingOperation.provider} / ${writingOperation.model ?? "automatic model"}`
                    : ""}
                </p>
                {writingProposalNeedsPassageScope ? (
                  <p className={styles.proposalScopeWarning} role="alert">
                    This proposal targets the entire imported manuscript. Reject
                    it, select the passage you want to change, then direct Slate
                    again. Your manuscript has not been altered.
                  </p>
                ) : null}
                <div>
                  <section>
                    <span>
                      Current
                      {writingProposalCurrentPreview.truncated
                        ? ` · excerpt of ${writingProposalCurrentPreview.wordCount.toLocaleString("en-US")} words`
                        : ""}
                    </span>
                    <pre>{writingProposalCurrentPreview.text}</pre>
                  </section>
                  <section>
                    <span>
                      Proposed
                      {writingProposalProposedPreview.truncated
                        ? ` · excerpt of ${writingProposalProposedPreview.wordCount.toLocaleString("en-US")} words`
                        : ""}
                    </span>
                    <pre>
                      {writingProposalProposedPreview.text ||
                        "Cut this passage."}
                    </pre>
                  </section>
                </div>
                <footer>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={writingOperationBusy}
                    onClick={() => mutateWritingOperation("reject")}
                  >
                    Reject
                  </button>
                  {slateWritingOperationCanContinue(writingOperation) &&
                  !writingProposalNeedsPassageScope ? (
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={writingOperationBusy}
                      onClick={() => mutateWritingOperation("continue")}
                    >
                      Continue
                    </button>
                  ) : null}
                  {slateWritingOperationCanRedirect(writingOperation) &&
                  !writingProposalNeedsPassageScope ? (
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={
                        writingOperationBusy || !directorDirection.trim()
                      }
                      title={
                        directorDirection.trim()
                          ? "Cancel this direction and restart from the same validated section"
                          : "Add a new direction in the Director bar first"
                      }
                      onClick={() =>
                        mutateWritingOperation("redirect", directorDirection)
                      }
                    >
                      Redirect
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={
                      writingOperationBusy ||
                      writingProposalNeedsPassageScope
                    }
                    title={
                      writingProposalNeedsPassageScope
                        ? "Reject this whole-manuscript proposal and select a passage first"
                        : undefined
                    }
                    onClick={() => mutateWritingOperation("accept")}
                  >
                    Accept proposal
                  </button>
                </footer>
              </section>
            ) : null}
            {!writingProposal &&
            writingOperation &&
            writingOperation.status !== "awaiting_clarification" ? (
              <section
                className={styles.writingOperationStatus}
                data-status={writingOperation.status}
                aria-live="polite"
              >
                <div>
                  <span>Writing operation</span>
                  <strong>
                    {slateWritingOperationStatusLabel(
                      writingOperation.status,
                    )}
                  </strong>
                  {writingOperation.failureMessage ? (
                    <small>{writingOperation.failureMessage}</small>
                  ) : (
                    <small>
                      AI prose stays outside the manuscript until you accept it.
                    </small>
                  )}
                </div>
                <footer>
                  {slateWritingOperationCanStop(writingOperation) ? (
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={writingOperationBusy}
                      onClick={() => mutateWritingOperation("stop")}
                    >
                      Stop
                    </button>
                  ) : null}
                  {slateWritingOperationCanContinue(writingOperation) ? (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={writingOperationBusy}
                      onClick={() => mutateWritingOperation("continue")}
                    >
                      Continue safely
                    </button>
                  ) : null}
                  {slateWritingOperationCanRedirect(writingOperation) ? (
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={
                        writingOperationBusy || !directorDirection.trim()
                      }
                      onClick={() =>
                        mutateWritingOperation("redirect", directorDirection)
                      }
                    >
                      Redirect
                    </button>
                  ) : null}
                </footer>
              </section>
            ) : null}
            {!writingProposal && !writingOperation && pendingRevision ? (
              <section
                className={`${styles.revisionPreview} ${styles.inlineProposal}`}
                aria-label="Inline prose proposal"
              >
                <p>Proposed {pendingRevision.action}</p>
                <div>
                  <section>
                    <span>Current</span>
                    <pre>{pendingRevision.originalText}</pre>
                  </section>
                  <section>
                    <span>Proposed</span>
                    <pre>
                      {pendingRevision.proposedText || "Cut this passage."}
                    </pre>
                  </section>
                </div>
                <footer>
                  <button
                    type="button"
                    className={styles.quietButton}
                    disabled={busy}
                    onClick={() =>
                      void runProjectOperation(
                        `/revisions/${encodeURIComponent(pendingRevision.id)}/reject`,
                      )
                    }
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy}
                    onClick={() =>
                      void runProjectOperation(
                        `/revisions/${encodeURIComponent(pendingRevision.id)}/accept`,
                      )
                    }
                  >
                    Accept proposal
                  </button>
                </footer>
              </section>
            ) : null}
            <textarea
              className={styles.legacyManuscript}
              hidden
              tabIndex={-1}
              aria-hidden="true"
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
            <div className={styles.legacyManuscriptFooter}>
              <button type="button" className={styles.quietButton} disabled={busy || selection.end <= selection.start} onClick={lockSelection}>
                Lock selection
              </button>
              {onDiscussSelection ? (
                <button
                  type="button"
                  className={styles.quietButton}
                  data-tutorial-target="slate-discuss-selection"
                  disabled={
                    busy ||
                    !activeSection ||
                    selection.end <= selection.start
                  }
                  onClick={() => {
                    if (!activeSection) return;
                    void onDiscussSelection({
                      projectId: project.id,
                      sectionId: activeSection.id,
                      selectionStart: selection.start,
                      selectionEnd: selection.end,
                    });
                  }}
                >
                  Discuss in Zen
                </button>
              ) : null}
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
            <SlateDirectorBar
              direction={directorDirection}
              scope={directorScope}
              targetLabel={
                selection.end > selection.start
                  ? `${selection.end - selection.start} selected characters`
                  : (selectedStructureItem?.title ??
                    activeSection?.title ??
                    "Focused section")
              }
              actionLabel={
                writingProposal || pendingRevision
                  ? "Resolve current proposal"
                  : directorUsesRevision
                    ? "Preview proposal"
                    : "Draft section"
              }
              busy={writingOperationBusy}
              unstickDisabled={
                writingOperationBusy ||
                writingOperationBlocksNew ||
                saveState === "saving" ||
                !activeSection
              }
              disabled={
                saveState === "saving" ||
                Boolean(pendingRevision) ||
                writingOperationBlocksNew ||
                !activeSection ||
                !directorDirection.trim()
              }
              onDirectionChange={updateDirectorDirection}
              onScopeChange={setDirectorScope}
              onRun={runDirector}
              onUnstick={() => {
                createWritingOperation("unstick", "");
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  runDirector();
                }
              }}
            />
          </section>

          <aside
            className={styles.inspector}
            data-tutorial-target="slate-inspector"
            aria-label="Slate Inspector"
          >
            <header className={styles.inspectorHeader}>
              <div>
                <p className={styles.eyebrow}>Inspector</p>
                <h2>
                  {inspectorMode === "cast"
                    ? "Cast"
                    : inspectorMode === "continuity"
                      ? "Continuity"
                      : "History"}
                </h2>
              </div>
              <div role="tablist" aria-label="Inspector view">
                {(["cast", "continuity", "history"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={inspectorMode === mode}
                    data-active={inspectorMode === mode ? "true" : undefined}
                    onClick={() => setInspectorMode(mode)}
                  >
                    {mode[0]?.toUpperCase()}
                    {mode.slice(1)}
                  </button>
                ))}
              </div>
            </header>
            {inspectorMode === "cast" ? (
              <div className={styles.inspectorBody}>
                <p className={styles.inspectorIntro}>
                  Source-linked people currently visible in this project.
                </p>
                {project.characters.length > 0 ? (
                  <div className={styles.castList}>
                    {project.characters.map((character) => (
                      <article key={character.id}>
                        <span aria-hidden="true">
                          {character.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <strong>{character.name}</strong>
                          <small>{character.role || "Role still emerging"}</small>
                          {character.voice ? <p>{character.voice}</p> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyInspector}>
                    Shape the work or write a little more; the cast will gather
                    here without interrupting you.
                  </p>
                )}
                <button
                  type="button"
                  className={styles.openHistoryDesk}
                  data-tutorial-target="slate-story-bible"
                  onClick={() => setCockpitDrawer("story-bible")}
                >
                  Open focused Story Bible
                </button>
              </div>
            ) : inspectorMode === "continuity" ? (
              <div className={styles.inspectorBody}>
                {continuityConcern ? (
                  <button
                    type="button"
                    className={styles.inspectorAttention}
                    onClick={() =>
                      document
                        .querySelector<HTMLElement>(
                          '[aria-label="Continuity direction"]',
                        )
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                  >
                    <span>Intent needed</span>
                    <strong>{continuityConcern.summary}</strong>
                    <small>Resolve in the manuscript</small>
                  </button>
                ) : (
                  <div className={styles.continuityQuiet}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>No hard conflict in focus</strong>
                      <small>Direct writing remains uninterrupted.</small>
                    </div>
                  </div>
                )}
                {livingSummary ? (
                  <section
                    className={styles.inspectorSummary}
                    data-tutorial-target="slate-summary"
                    aria-label="Story so far"
                  >
                    <span>Story so far</span>
                    <p>{livingSummary.tail || livingSummary.text}</p>
                    {livingSummary.text !== livingSummary.tail ? (
                      <details>
                        <summary>Read full summary</summary>
                        <p>{livingSummary.text}</p>
                      </details>
                    ) : null}
                  </section>
                ) : null}
                <section className={styles.liveWire}>
                  <span>Live Wire</span>
                  <strong>{liveWire}</strong>
                  <small>The pressure Slate will carry into the next move.</small>
                </section>
                <section className={styles.threadTray}>
                  <header>
                    <span>Loose ends</span>
                    <small>{inspectorLooseThreads.length}</small>
                  </header>
                  {inspectorLooseThreads.length > 0 ? (
                    inspectorLooseThreads.map((thread) => (
                      <p key={thread.id}>{thread.label}</p>
                    ))
                  ) : (
                    <p>No unresolved thread is asking for attention.</p>
                  )}
                </section>
                <button
                  type="button"
                  className={styles.openHistoryDesk}
                  onClick={() => setCockpitDrawer("story-bible")}
                >
                  Open Cast, Arcs, Threads, Timeline & World
                </button>
              </div>
            ) : (
              <div className={styles.inspectorBody}>
                <p className={styles.inspectorIntro}>
                  Accepted, rejected, and pending proposals—kept separate from
                  the manuscript.
                </p>
                <div className={styles.historyList}>
                  {project.revisions.slice(0, 5).map((revision) => (
                    <article key={revision.id}>
                      <div>
                        <span data-status={revision.status}>
                          {revision.status}
                        </span>
                        <strong>
                          {revision.action} · {revision.scope}
                        </strong>
                      </div>
                      <small>
                        {readableUpdatedAt(revision.createdAt)} ·{" "}
                        {revision.provider}/{revision.model}
                      </small>
                    </article>
                  ))}
                  {project.revisions.length === 0 ? (
                    <p className={styles.emptyInspector}>
                      Proposals will appear here after Slate offers its first
                      revision.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.openHistoryDesk}
                  onClick={() => setCockpitDrawer("history")}
                >
                  Open focused History
                </button>
              </div>
            )}
          </aside>

          <aside
            className={styles.legacyDirectionPanel}
            aria-hidden="true"
          >
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
                {(["offline", "online"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-active={proseLaneMode === mode ? "true" : undefined}
                    disabled={busy}
                    onClick={() => void saveProseMode(mode)}
                  >
                    {mode === "offline" ? "LOCAL" : "ONLINE"}
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
                    Auto — PRISM chooses model + effort
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
                  onClick={() => resolveContinuityConcern()}
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

            <section
              className={styles.deliberationLaunch}
              data-tutorial-target="slate-deliberation"
            >
              <div>
                <span>▲ Lux</span>
                <i aria-hidden="true">/</i>
                <span>▽ Umbra</span>
              </div>
              <h3>Think in counterpoint</h3>
              <p>
                Watch two opposing hemispheres develop and pressure-test one
                creative direction, then decide whether it belongs in the work.
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={openSlateDeliberation}
              >
                Open inner dialogue
              </button>
            </section>

            <p className={styles.providerNote}>
              Routing applies to prose, title counsel, Lux/Umbra, and this
              project’s Prism companion. Every generated prose artifact keeps its provider and
              model receipt in the project backend. Locked
              material and newer human edits remain authoritative.
            </p>
          </aside>
        </div>
      )}
      {project && cockpitDrawer ? (
        <div
          className={styles.cockpitDrawerBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCockpitDrawer(null);
          }}
        >
          <aside
            className={styles.cockpitDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slate-cockpit-drawer-title"
          >
            <header>
              <div>
                <p className={styles.eyebrow}>
                  {cockpitDrawer === "project"
                    ? "Project drawer"
                    : "Focused desk"}
                </p>
                <h2 id="slate-cockpit-drawer-title">
                  {cockpitDrawer === "history"
                    ? "History & developer review"
                    : cockpitDrawer === "story-bible"
                      ? "Story Bible"
                      : "Project tools"}
                </h2>
                <p>
                  {cockpitDrawer === "history"
                    ? `Focused on ${activeSection?.title ?? project.title}.`
                    : cockpitDrawer === "story-bible"
                      ? "Curated narrative intelligence, never the raw Continuity ledger."
                      : "Routing, exports, recovery, and project identity stay here until needed."}
                </p>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                aria-label="Close focused drawer"
                onClick={() => setCockpitDrawer(null)}
              >
                ×
              </button>
            </header>

            {cockpitDrawer === "project" ? (
              <div className={styles.drawerBody}>
                <section className={styles.drawerSection}>
                  <header>
                    <span>Project identity</span>
                    <small>{project.phase}</small>
                  </header>
                  <div className={styles.drawerActions}>
                    <button
                      type="button"
                      className={styles.quietButton}
                      disabled={titleSuggestionBusy || busy}
                      onClick={() => void requestTitleSuggestion(true)}
                    >
                      {titleSuggestionBusy
                        ? "Prism is listening…"
                        : "Generate a new title"}
                    </button>
                  </div>
                </section>

                <section
                  className={styles.drawerSection}
                  data-tutorial-target="slate-ai-controls"
                  aria-label="Slate prose model"
                >
                  <header>
                    <span>Prose engine</span>
                    {project.lastModel ? (
                      <small title={project.lastModel}>
                        Last · {project.lastModel}
                      </small>
                    ) : null}
                  </header>
                  <div
                    className={styles.proseModePicker}
                    role="group"
                    aria-label="Prose routing"
                  >
                    {(["offline", "online"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        data-active={
                          proseLaneMode === mode ? "true" : undefined
                        }
                        disabled={busy}
                        onClick={() => void saveProseMode(mode)}
                      >
                        {mode === "offline" ? "LOCAL" : "ONLINE"}
                      </button>
                    ))}
                  </div>
                  <label className={styles.proseModelPicker}>
                    <span>Model</span>
                    <select
                      value={proseModelValue}
                      disabled={busy || !modelCatalog}
                      onChange={(event) =>
                        void saveProseModel(event.target.value)
                      }
                    >
                      <option value={SLATE_AUTO_MODEL_VALUE}>
                        Auto — PRISM chooses model + effort
                      </option>
                      {proseModelOptions.map((model) => (
                        <option
                          key={slateModelChoiceValue(model)}
                          value={slateModelChoiceValue(model)}
                          disabled={Boolean(model.disabledReason)}
                        >
                          {model.label} ·{" "}
                          {model.provider === "local"
                            ? "offline"
                            : model.provider}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.drawerNote}>
                    Offline is a hard local-only route. Mirror will shape voice,
                    never output length.
                  </p>
                </section>

                <section className={styles.drawerSection}>
                  <header>
                    <span>Clean manuscript export</span>
                    <small>Writer-facing prose only</small>
                  </header>
                  <div className={styles.drawerFields}>
                    <label>
                      <span>Material</span>
                      <select
                        value={exportScopeChoice}
                        onChange={(event) =>
                          setExportScopeChoice(
                            event.target
                              .value as SlateWorkspaceExportScopeChoice,
                          )
                        }
                      >
                        <option value="book">Entire book</option>
                        <option value="focused">
                          Focused {activeSection?.kind ?? "section"}
                        </option>
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
                            event.target.value as
                              | "docx"
                              | "markdown"
                              | "text",
                          )
                        }
                      >
                        <option value="docx">Word document</option>
                        <option value="markdown">Markdown</option>
                        <option value="text">Plain text</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={exporting || saveState === "saving"}
                    onClick={exportManuscript}
                  >
                    {exporting ? "Preparing…" : "Export clean copy"}
                  </button>
                  <p className={styles.drawerNote}>
                    Directions, Continuity notes, and review metadata stay
                    private.
                  </p>
                </section>

                <section className={styles.drawerSection}>
                  <header>
                    <span>Recovery</span>
                    <small>
                      {protectedAt
                        ? `Protected ${readableUpdatedAt(protectedAt)}`
                        : "Quiet background protection"}
                    </small>
                  </header>
                  <p className={styles.drawerNote}>
                    A portable .slate backup keeps structure, prose history, and
                    Continuity. Account keys and rebuildable caches stay out.
                  </p>
                  <div className={styles.drawerActions}>
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
                </section>

                <section className={styles.drawerSection}>
                  <header>
                    <span>Creative desk</span>
                    <small>Temporary, never manuscript chrome</small>
                  </header>
                  <div className={styles.drawerActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setCockpitDrawer("story-bible")}
                    >
                      Open Story Bible
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setCockpitDrawer(null);
                        setCreativeStudiosOpen(true);
                      }}
                    >
                      Open Creative Studios
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setCockpitDrawer(null);
                        setMirrorOpen(true);
                      }}
                    >
                      Open Mirror
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      data-tutorial-target="slate-deliberation"
                      onClick={() => {
                        setCockpitDrawer(null);
                        openSlateDeliberation();
                      }}
                    >
                      Open Lux / Umbra inner dialogue
                    </button>
                  </div>
                </section>
              </div>
            ) : cockpitDrawer === "story-bible" ? (
              <div className={styles.drawerBody}>
                <SlateStoryBibleDesk
                  data={storyBibleDesk}
                  loading={storyBibleLoading}
                  onUpdateCharacterField={updateStoryBibleCharacterField}
                  onUpdateIntendedArc={updateStoryBibleIntendedArc}
                />
              </div>
            ) : (
              <div className={styles.drawerBody}>
                <section className={styles.reviewExportSection}>
                  <header>
                    <div>
                      <span>Developer handoff</span>
                      <h3>Export Slate Review</h3>
                    </div>
                    <small>Current synthesized section only</small>
                  </header>
                  <p>
                    Export accepted prose, writing-operation receipts,
                    clarification decisions, ordered Continuity provenance,
                    Story Bible projections, and bounded examples for this
                    section.
                  </p>
                  <div className={styles.reviewSafety}>
                    <strong>Diagnostic, not hidden reasoning.</strong>
                    <span>
                      Credentials, chain-of-thought, transient headers, and
                      sibling-book prose are excluded.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={
                      reviewExporting ||
                      saveState === "saving" ||
                      !activeSection
                    }
                    onClick={exportSlateReview}
                  >
                    {reviewExporting
                      ? "Preparing focused review…"
                      : `Export review · ${activeSection?.title ?? "No section"}`}
                  </button>
                  {reviewExportNotice ? (
                    <small role="status">{reviewExportNotice}</small>
                  ) : null}
                </section>

                <section className={styles.drawerSection}>
                  <header>
                    <span>Proposal provenance & examples</span>
                    <small>{project.revisions.length} revisions</small>
                  </header>
                  <div className={styles.provenanceList}>
                    {project.revisions.map((revision) => (
                      <details key={revision.id}>
                        <summary>
                          <span data-status={revision.status}>
                            {revision.status}
                          </span>
                          <strong>
                            {revision.action} · {revision.scope}
                          </strong>
                          <small>{readableUpdatedAt(revision.createdAt)}</small>
                        </summary>
                        <dl>
                          <div>
                            <dt>Provider</dt>
                            <dd>
                              {revision.provider} / {revision.model}
                            </dd>
                          </div>
                          <div>
                            <dt>Direction</dt>
                            <dd>
                              {revision.direction || "No extra direction"}
                            </dd>
                          </div>
                        </dl>
                        <div className={styles.provenanceExamples}>
                          <section>
                            <span>Accepted source example</span>
                            <pre>{revision.originalText}</pre>
                          </section>
                          <section>
                            <span>Proposal example</span>
                            <pre>
                              {revision.proposedText || "Cut this passage."}
                            </pre>
                          </section>
                        </div>
                      </details>
                    ))}
                    {project.revisions.length === 0 ? (
                      <p className={styles.drawerNote}>
                        No revision provenance exists for this project yet.
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <header>
                    <span>Recovery checkpoints</span>
                    <small>{project.versions.length}</small>
                  </header>
                  <div className={styles.versionList}>
                    {project.versions.map((version) => (
                      <article key={version.id}>
                        <strong>{version.reason}</strong>
                        <small>{readableUpdatedAt(version.createdAt)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      ) : null}
      {project && mirrorOpen ? (
        <SlateMirrorDesk
          projectId={project.id}
          onClose={() => setMirrorOpen(false)}
        />
      ) : null}
      {project && creativeStudiosOpen ? (
        <SlateCreativeStudiosDesk
          projectId={project.id}
          currentSectionId={activeSection?.id ?? null}
          sections={sections.map((section) => ({
            id: section.id,
            title: section.title,
          }))}
          onClose={() => setCreativeStudiosOpen(false)}
        />
      ) : null}
      {project && fullBookOpen ? (
        <SlateFullBookReader
          projectTitle={project.title}
          sections={fullBookSections}
          loading={fullBookLoading}
          onClose={() => setFullBookOpen(false)}
          onEditSection={(sectionId) => {
            setFullBookOpen(false);
            void openSection(sectionId);
          }}
        />
      ) : null}
      {project && deliberationOpen ? (
        <div className={styles.deliberationBackdrop}>
          <section
            className={styles.deliberationDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slate-deliberation-title"
          >
            <header className={styles.deliberationHeader}>
              <div>
                <p className={styles.eyebrow}>Slate · inner dialogue</p>
                <h2 id="slate-deliberation-title">A mind in two hemispheres.</h2>
                <p>
                  Lux opens possibility. Umbra tests what survives. The center
                  returns one direction for you to accept, reshape, or ignore.
                </p>
              </div>
              <button
                type="button"
                className={styles.deliberationClose}
                aria-label="Close inner dialogue"
                onClick={() => {
                  stopSlateDeliberation();
                  setDeliberationOpen(false);
                }}
              >
                ×
              </button>
            </header>

            <form
              className={styles.deliberationPromptDeck}
              onSubmit={(event) => {
                event.preventDefault();
                void startSlateDeliberation();
              }}
            >
              <label>
                <span>Creative question</span>
                <textarea
                  value={deliberationPrompt}
                  disabled={deliberationRunning}
                  rows={2}
                  placeholder="What choice should this story make next?"
                  onChange={(event) => setDeliberationPrompt(event.target.value)}
                />
              </label>
              <fieldset disabled={deliberationRunning}>
                <legend>Depth</legend>
                <div>
                  {[1, 2, 3].map((rounds) => (
                    <button
                      key={rounds}
                      type="button"
                      data-active={deliberationRounds === rounds ? "true" : undefined}
                      onClick={() => setDeliberationRounds(rounds)}
                    >
                      {rounds}
                    </button>
                  ))}
                </div>
                <small>{deliberationRounds * 2} visible turns + synthesis</small>
              </fieldset>
              {deliberationRunning ? (
                <button
                  type="button"
                  className={styles.deliberationStop}
                  onClick={stopSlateDeliberation}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={!deliberationPrompt.trim()}
                >
                  {deliberationMessages.length > 0 ? "Think again" : "Begin the exchange"}
                </button>
              )}
            </form>

            <div
              className={styles.deliberationMind}
              data-active-speaker={deliberationActiveSpeaker ?? "none"}
            >
              <section className={styles.deliberationHemisphere} data-side="lux">
                <header>
                  <span className={styles.deliberationSigil} aria-hidden="true">
                    ▲
                  </span>
                  <div>
                    <span className={styles.deliberationIdentity}>
                      <strong>Lux</strong>
                      <i>Light</i>
                    </span>
                    <span>Generative hemisphere · opens the field</span>
                  </div>
                </header>
                <div className={styles.deliberationThoughtStream} aria-live="polite">
                  {luxDeliberationMessages.length > 0 ? (
                    luxDeliberationMessages.map((message) => (
                      <article key={message.id}>
                        <span>Round {message.round}</span>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </article>
                    ))
                  ) : (
                    <div className={styles.deliberationEmpty}>
                      <span aria-hidden="true">✦</span>
                      <p>Possibility gathers here.</p>
                      <small>Lux will find the living shape inside the question.</small>
                    </div>
                  )}
                  {deliberationActiveSpeaker === "lux" ? (
                    <div className={styles.deliberationThinking} role="status">
                      <span />
                      <span />
                      <span />
                      Lux is forming the opening direction…
                    </div>
                  ) : null}
                </div>
              </section>

              <div className={styles.deliberationSeam} aria-hidden="true">
                <span className={styles.deliberationCurrent} />
                <div className={styles.deliberationCore}>
                  <span data-side="lux" />
                  <span data-side="umbra" />
                  <i />
                </div>
                <span className={styles.deliberationSeamState}>
                  {deliberationActiveSpeaker === "synthesis"
                    ? "resolving"
                    : deliberationSynthesis
                      ? "resolved"
                      : deliberationRunning
                        ? "recursive current"
                        : "ready"}
                </span>
              </div>

              <section className={styles.deliberationHemisphere} data-side="umbra">
                <header>
                  <span className={styles.deliberationSigil} aria-hidden="true">
                    ▽
                  </span>
                  <div>
                    <span className={styles.deliberationIdentity}>
                      <strong>Umbra</strong>
                      <i>Shadow</i>
                    </span>
                    <span>Adversarial hemisphere · tests what survives</span>
                  </div>
                </header>
                <div className={styles.deliberationThoughtStream} aria-live="polite">
                  {umbraDeliberationMessages.length > 0 ? (
                    umbraDeliberationMessages.map((message) => (
                      <article key={message.id}>
                        <span>Round {message.round}</span>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </article>
                    ))
                  ) : (
                    <div className={styles.deliberationEmpty}>
                      <span aria-hidden="true">✦</span>
                      <p>Pressure waits in the dark.</p>
                      <small>Umbra will find the fault line before the story does.</small>
                    </div>
                  )}
                  {deliberationActiveSpeaker === "umbra" ? (
                    <div className={styles.deliberationThinking} role="status">
                      <span />
                      <span />
                      <span />
                      Umbra is testing the proposition…
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <section
              className={styles.deliberationSynthesis}
              data-active={deliberationActiveSpeaker === "synthesis" ? "true" : undefined}
              aria-live="polite"
            >
              <header>
                <span>◇</span>
                <div>
                  <p className={styles.eyebrow}>Center seam</p>
                  <h3>Creative direction</h3>
                </div>
              </header>
              {deliberationSynthesis ? (
                <div className={styles.deliberationSynthesisText}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {deliberationSynthesis.content}
                  </ReactMarkdown>
                </div>
              ) : deliberationActiveSpeaker === "synthesis" ? (
                <div className={styles.deliberationThinking} role="status">
                  <span />
                  <span />
                  <span />
                  The hemispheres are resolving their disagreement…
                </div>
              ) : (
                <p>The surviving direction will cross the seam here.</p>
              )}
            </section>

            {deliberationError ? (
              <p className={styles.deliberationError} role="alert">
                {deliberationError}
              </p>
            ) : null}

            <footer className={styles.deliberationFooter}>
              <span>
                Ephemeral · project-aware · uses this project’s {proseLaneMode === "offline" ? "LOCAL" : "ONLINE"} route
              </span>
              <div>
                {deliberationMessages.length > 0 ? (
                  <button
                    type="button"
                    className={styles.quietButton}
                    onClick={resetSlateDeliberation}
                  >
                    Clear
                  </button>
                ) : null}
                {deliberationSynthesis ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={useSlateDeliberationDirection}
                  >
                    Use as {activeSection?.prose.trim() ? "revision" : "draft"} direction
                  </button>
                ) : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
      {project && !globalCompanionEnabled ? (
        <div
          className={styles.companionAnchor}
          data-dock={companionPosition.x < 0.5 ? "left" : "right"}
          data-vertical={companionPosition.y < 0.48 ? "below" : "above"}
          style={{
            left: `${companionPosition.x * 100}%`,
            top: `${companionPosition.y * 100}%`,
          }}
        >
          <div className={styles.companionConversation}>
            {companionBubbles.length > 0 || companionBusy ? (
              <div
                className={styles.companionBubbleCloud}
                aria-live="polite"
                aria-label="Ephemeral project conversation"
              >
                {companionBubbles.map((bubble) => (
                  <article
                    key={bubble.key}
                    className={styles.companionBubble}
                    data-role={bubble.message.role}
                    style={
                      {
                        "--companion-bubble-life": `${bubble.lifetimeMs}ms`,
                      } as CSSProperties
                    }
                  >
                    <span>
                      {bubble.message.role === "assistant" ? "Prism" : "You"}
                    </span>
                    <div className={styles.companionMarkdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {bubble.message.content}
                      </ReactMarkdown>
                    </div>
                  </article>
                ))}
                {companionBusy ? (
                  <article
                    className={styles.companionThinkingBubble}
                    data-role="assistant"
                    role="status"
                  >
                    <span>Prism</span>
                    <p>Refracting the idea…</p>
                  </article>
                ) : null}
              </div>
            ) : null}
            {companionOpen ? (
              <form
                id="slate-project-companion"
                className={styles.companionComposerBubble}
                aria-label={`Talk with ${project.title}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendCompanionMessage();
                }}
              >
                {renderPickAwareComposer ? (
                  renderPickAwareComposer({
                    value: companionDraft,
                    onChange: setCompanionDraft,
                    placeholder: "Catch the next idea…",
                    multiline: true,
                    ariaLabel: "Message the project companion",
                    disabled: companionBusy,
                    className: styles.companionPickAwareField,
                    onKeyDown: (event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        toggleCompanion();
                      } else if (
                        shouldSubmitComposerOnEnter({
                          key: event.key,
                          shiftKey: event.shiftKey,
                          isComposing: event.nativeEvent.isComposing,
                        })
                      ) {
                        event.preventDefault();
                        if (!companionBusy && companionDraft.trim()) {
                          (
                            event.currentTarget.closest("form") as
                              | HTMLFormElement
                              | null
                          )?.requestSubmit();
                        }
                      }
                    },
                  })
                ) : (
                  <textarea
                    value={companionDraft}
                    onChange={(event) => setCompanionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        toggleCompanion();
                      } else if (
                        shouldSubmitComposerOnEnter({
                          key: event.key,
                          shiftKey: event.shiftKey,
                          isComposing: event.nativeEvent.isComposing,
                        })
                      ) {
                        event.preventDefault();
                        if (!companionBusy && companionDraft.trim()) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
                    placeholder="Catch the next idea…"
                    aria-label="Message the project companion"
                    rows={2}
                    enterKeyHint="send"
                  />
                )}
                <footer>
                  <small>Ideas fade · the last 3 can recover after a close</small>
                  <button
                    type="submit"
                    disabled={companionBusy || !companionDraft.trim()}
                  >
                    Send
                  </button>
                </footer>
              </form>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.companionAvatar}
            data-tutorial-target="slate-project-chat"
            aria-label={
              companionOpen
                ? "Move or close the ephemeral Prism companion"
                : "Move or open the ephemeral Prism companion"
            }
            aria-expanded={companionOpen}
            aria-controls="slate-project-companion"
            onPointerDown={beginCompanionDrag}
            onPointerMove={moveCompanion}
            onPointerUp={endCompanionDrag}
            onPointerCancel={() => {
              companionDragRef.current = null;
            }}
            onClick={(event) => {
              if (event.detail === 0) toggleCompanion();
            }}
          >
            <span className={styles.companionAvatarOrb} aria-hidden="true">
              <svg viewBox="0 0 32 32" focusable="false">
                <path d="M16 5.2 27 25H5Z" />
              </svg>
            </span>
          </button>
        </div>
      ) : null}
    </main>
  );
}
