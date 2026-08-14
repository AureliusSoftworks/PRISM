"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { Plus, Volume2, VolumeX } from "lucide-react";
import {
  USER_NOTE_BODY_MAX,
  USER_NOTE_TITLE_MAX,
  type ChatMessage,
  type EphemeralChatResolvedProvider,
  type PrismActionProposalV1,
  type PrismActionRunV1,
  type PrismCompanionActionIntent,
  type PrismCompanionCardV1,
  type PrismCompanionMessage,
  type PrismCompanionResponse,
  type PrismRefractResponse,
  type ProviderReasoningEffort,
  type PrismCompanionSurfaceReference,
  type UserNotesPayload,
} from "@localai/shared";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import {
  DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS,
  isPrismCompanionModifierHeld,
  isPrismCompanionModifierKey,
  isPrismCompanionPlatformModifier,
  parsePrismCompanionRecovery,
  parsePrismCompanionSessionRecord,
  parsePrismCompanionSpeechEnabled,
  prismCompanionDismissesOnExternalInteraction,
  prismCompanionModifierPresentation,
  prismCompanionPositionStorageKey,
  prismCompanionPrivateRecoveryStorageKey,
  prismCompanionSessionIsReusable,
  prismCompanionSessionStorageKey,
  prismCompanionSpeechStorageKey,
  prismCompanionSurfaceScope,
  retainPrismCompanionRecovery,
  touchPrismCompanionSessionRecord,
  type PrismCompanionSessionRecord,
} from "./prismCompanionState";
import {
  keyboardShortcutAria,
  keyboardShortcutDisplay,
  keyboardShortcutEventIsRecording,
  keyboardShortcutMatchesEvent,
  keyboardShortcutSpokenLabel,
} from "./keyboardShortcuts";
import {
  boundedPrismCompanionReleaseVelocity,
  clampPrismCompanionPosition,
  createPrismCompanionDragVelocitySample,
  measurePrismCompanionRightPanelInsetPx,
  PRISM_COMPANION_POSITION_BOUNDS,
  resolvePrismCompanionLiveBounds,
  resolvePrismCompanionRightPanelPush,
  resolvePrismCompanionSurfaceGlare,
  samplePrismCompanionDragVelocity,
  stepPrismCompanionInertia,
  type PrismCompanionDragVelocitySample,
  type PrismCompanionLiveBounds,
  type PrismCompanionPosition,
  type PrismCompanionVelocity,
} from "./prismCompanionPhysics";
import {
  playPrismCompanionGlassTap,
  stopPrismCompanionGlassTapAudio,
} from "./prismCompanionSfx";
import {
  finishPrismCompanionSpeechReveal,
  preparePrismCompanionSpeechReveal,
  prismCompanionSpeechVisibleContent,
  progressPrismCompanionSpeechReveal,
  startPrismCompanionSpeechReveal,
  type PrismCompanionSpeechReveal,
} from "./prismCompanionSpeech";
import { setPrismSystemPause } from "./prismVisualLifecycle";
import { PrismOrb } from "./PrismOrb";
import { playPrismHotkeyInaccessibleSfx } from "./prismHotkeySfx";
import { PrismCompanionViewTabs } from "./PrismCompanionViewTabs";
import {
  getPrismCompanionSuppressedServerSnapshot,
  getPrismCompanionSuppressedSnapshot,
  getPrismCompanionSessionNoteServerSnapshot,
  getPrismCompanionSessionNoteSnapshot,
  subscribePrismCompanionSuppression,
} from "./prismCompanionPresence";
import {
  APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS,
  publishAppletSessionNoteSaved,
  type AppletSessionNoteResponse,
} from "./appletSessionNotes";
import {
  PRISM_ORB_HANDOFF_DURATION_MS,
  normalizedPrismOrbPositionForRect,
  queryPrismChatHomeOrbSlot,
} from "./prismOrbHandoff";
import {
  setPrismSoftSynthesisExpanded,
  togglePrismSoftSynthesisExpanded,
  usePrismSoftSynthesisUi,
} from "./prismSoftSynthesisUi.ts";
import { publishPrismCompanionVisualSnapshot } from "./prismCompanionVisualSnapshot";
import {
  usePrismCompanionViewRequest,
  type PrismCompanionView,
} from "./prismCompanionViews.ts";
import {
  setAppNavbarCompanionOpen,
  setAppNavbarWielding,
} from "./appNavbarChrome";
import {
  HOME_BASE_RADIAL_HANDOFF_MS,
  HOME_BASE_RADIAL_HOLD_MS,
  HOME_BASE_RADIAL_TARGET_RADIUS_PX,
  homeBaseRadialRayGeometry,
  homeBaseRadialTargetAtPoint,
  homeBaseRadialTargetLayout,
  resolveHomeBaseRadialTargetRadius,
  nextHomeBaseRadialTargetIndex,
  transitionHomeBaseRadialGesture,
  type HomeBaseRadialGestureState,
  type HomeBaseRadialPoint,
  type HomeBaseRadialTargetPosition,
} from "./homeBaseRadialLauncher";
import {
  PRISM_REFRACT_TARGET_ATTRIBUTE,
  nextPrismRefractChoice,
  prismRefractModifierClickDecision,
  prismRefractResultOwnershipIsCurrent,
  prismRefractTargetIdAtPoint,
  registeredPrismRefractTarget,
  requestPrismRefract,
  runPrismRefractGenerationWithTimeout,
  subscribePrismRefractRequests,
  type PrismRefractInvocation,
  type PrismRefractRequest,
  type RegisteredPrismRefractTarget,
} from "./prismRefract";
import { usePrismRefractionGate } from "./prismRefractionGate";
import {
  createPrismWieldState,
  prismWieldCanArm,
  transitionPrismWield,
  type PrismWieldPoint,
  type PrismWieldState,
} from "./prismWield";
import {
  installPrismUniversalInputTargets,
  type PrismUniversalInputCandidateRequest,
} from "./prismUniversalInputRefract";
import {
  buildBotGeneratorBriefRefractContext,
  buildBotGeneratorRefractRequestTarget,
  buildBotPowerRefractRequestTarget,
} from "./botPowerRefract";
import type { SpeechCharacterAlignment } from "./speechRevealTimeline";
import {
  prismActionLabel,
  prismActionStatusLabel,
} from "./prismActionPresentation";
import styles from "./prismCompanion.module.css";

const PRISM_COMPANION_SYSTEM_PAUSE_REASON = "prism-companion";
const PRISM_SYSTEM_PAUSE_EXEMPT_SELECTOR =
  '[data-prism-system-pause-exempt="true"]';
const PRISM_REFRACT_CURSOR_ATTRIBUTE = "data-prism-refract-cursor-hidden";
const PRISM_REFRACT_PREVIEW_PAINT_FRAMES = 2;
const PRISM_REFRACT_FIELD_PREVIEW_PAINT_ATTEMPTS = 12;
const PRISM_WIELD_CURSOR_ATTRIBUTE = "data-prism-wielding";
/** After settle, dim the idle orb so it stays out of the way. */
export const PRISM_COMPANION_IDLE_DIM_MS = 3_000;
/** After dimming, wait the same span again, then hide the orb completely. */
export const PRISM_COMPANION_IDLE_VANISH_MS = PRISM_COMPANION_IDLE_DIM_MS;

type PrismRefractPhase =
  | "generating"
  | "ready"
  | "prompting"
  | "error";

interface PrismRefractSession {
  registration: RegisteredPrismRefractTarget;
  invocation: PrismRefractInvocation;
  phase: PrismRefractPhase;
  targetWidth: number;
  targetCenter: PrismCompanionPosition;
  originalValue: string;
  candidateValue: string | null;
  rejectedValues: string[];
  originalAriaBusy: string | null;
  originalAriaReadonly: string | null;
}

interface QueuedPrismRefractRequest extends PrismRefractRequest {
  element: HTMLElement;
  originalState: string | undefined;
  originalSheen: string | undefined;
  originalAriaReadonly: string | null;
}

export interface PrismCompanionSpeechPlaybackCallbacks {
  signal: AbortSignal;
  onPlaybackStart: (
    durationMs: number | null,
    alignment?: SpeechCharacterAlignment | null,
  ) => void;
  onPlaybackProgress: (
    elapsedMs: number,
    durationMs: number,
    alignment?: SpeechCharacterAlignment | null,
  ) => void;
}

export type PrismCompanionPresentation = "chat" | "zen" | null;

export interface PrismCompanionConversationMessage
  extends Omit<ChatMessage, "role"> {
  role: "user" | "assistant";
}

export interface PrismCompanionConversationSnapshot {
  id: string;
  title: string;
  mode: "zen";
  botId: null;
  incognito: boolean;
  messages: PrismCompanionConversationMessage[];
  [key: string]: unknown;
}

interface PrismPersonalNote {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrismCompanionFocusedChatHandoff {
  privateMode: boolean;
  conversationId: string;
  conversation: PrismCompanionConversationSnapshot;
}

export interface PrismCompanionProps {
  accountKey: string;
  /** Resolved app theme. Portal-rendered companion chrome cannot inherit the page shell class. */
  theme?: "light" | "dark";
  /** Hide passive chrome behind a main panel while keeping Wield and Refract available. */
  submerged?: boolean;
  keyboardShortcut: string | null;
  surface: PrismCompanionSurfaceReference;
  /** Live global navbar routing snapshot for foreground field Refract. */
  refractRouting?: {
    preferredProvider: EphemeralChatResolvedProvider;
    responseMode: "local" | "online";
    modelOverride: string | null;
    reasoningEffort?: Exclude<ProviderReasoningEffort, "auto">;
    turbo?: boolean;
  };
  /** Chat and Zen share one route; this is the authoritative view boundary. */
  presentation?: PrismCompanionPresentation;
  /** The account's existing "Same session after idle" duration. */
  zenSessionIdleGapMs?: number;
  chatHomeHeroDocked?: boolean;
  /** Home Base-only applet registry entries rendered around the held orb. */
  homeBaseAppletTargets?: readonly PrismCompanionHomeAppletTarget[];
  /** The Zen all-bots canvas orb opens its radial on tap instead of opening chat. */
  zenCanvasOrb?: boolean;
  onHomeBaseAppletSelect?: (appletId: string) => void;
  onContinueFocusedChat?: (
    handoff: PrismCompanionFocusedChatHandoff,
  ) => void | Promise<void>;
  /** Lets the parent refresh its conversation list after assistant activity. */
  onPersistentConversationChange?: (
    conversationId: string,
  ) => void | Promise<void>;
  /** Opens the existing Images panel with this editable prompt prefilled. */
  onOpenImagePrompt?: (prompt: string) => void | Promise<void>;
  onAction: (action: PrismCompanionActionIntent) => void | Promise<void>;
  onSpeak?: (
    text: string,
    provider: EphemeralChatResolvedProvider,
    callbacks: PrismCompanionSpeechPlaybackCallbacks,
  ) => boolean | Promise<boolean>;
  onStopSpeaking?: () => void;
  onError?: (message: string) => void;
  onOrchestrationResult?: (run: PrismActionRunV1) => void | Promise<void>;
  onOpenCreatedBot?: (botId: string) => void | Promise<void>;
  onStartCreatedCoffeeGroup?: (input: {
    groupId: string;
    premise: string;
    botIds: string[];
  }) => void | Promise<void>;
  wieldTutorialActive?: boolean;
  onWieldTutorialComplete?: () => void;
  onWieldTutorialSkip?: () => void;
  onWieldTutorialRemind?: () => void;
  refractTutorialActive?: boolean;
  onRefractTutorialComplete?: () => void;
  onRefractTutorialSkip?: () => void;
  onRefractTutorialRemind?: () => void;
}

export interface PrismCompanionHomeAppletTarget {
  id: string;
  label: string;
  glyph: ReactNode;
  kind?: "applet" | "assistant";
}

function nextPrismRefractPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let remaining = PRISM_REFRACT_PREVIEW_PAINT_FRAMES;
    const nextFrame = (): void => {
      if (signal.aborted || remaining-- <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(nextFrame);
    };
    window.requestAnimationFrame(nextFrame);
  });
}

function prismRefractFieldPreviewIsVisible(
  element: HTMLElement,
  value: string,
): boolean {
  const controls = [
    ...(element.matches("input, textarea, select, [contenteditable=\"true\"]")
      ? [element]
      : []),
    ...element.querySelectorAll<HTMLElement>(
      "input, textarea, select, [contenteditable=\"true\"]",
    ),
  ];
  return controls.some((control) => {
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value.trim() === value;
    }
    return control.textContent?.trim() === value;
  });
}

async function waitForPrismRefractPreviewPaint(input: {
  element: HTMLElement;
  kind: "field" | "choice";
  value: string;
  signal: AbortSignal;
}): Promise<boolean> {
  await nextPrismRefractPaint(input.signal);
  if (input.signal.aborted || input.kind === "choice") return !input.signal.aborted;
  for (let attempt = 0; attempt < PRISM_REFRACT_FIELD_PREVIEW_PAINT_ATTEMPTS; attempt += 1) {
    if (prismRefractFieldPreviewIsVisible(input.element, input.value)) {
      return true;
    }
    await nextPrismRefractPaint(input.signal);
    if (input.signal.aborted) return false;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrismPersonalNote(value: unknown): value is PrismPersonalNote {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function parsePrismConversationSnapshot(
  value: unknown,
): PrismCompanionConversationSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    !Array.isArray(value.messages) ||
    (value.incognito !== true && value.incognito !== false)
  ) {
    return null;
  }
  if (value.mode !== undefined && value.mode !== "zen") return null;
  if (value.botId !== undefined && value.botId !== null) return null;
  const messages = value.messages.flatMap(
    (message): PrismCompanionConversationMessage[] => {
      if (
        !isRecord(message) ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        return [];
      }
      return [
        {
          ...(message as unknown as PrismCompanionConversationMessage),
          id:
            typeof message.id === "string" && message.id.trim()
              ? message.id
              : `prism-message-${crypto.randomUUID()}`,
          role: message.role,
          content: message.content,
          createdAt:
            typeof message.createdAt === "string" && message.createdAt.trim()
              ? message.createdAt
              : new Date(0).toISOString(),
        },
      ];
    },
  );
  return {
    ...value,
    id: value.id.trim(),
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : "Prism",
    mode: "zen",
    botId: null,
    incognito: value.incognito,
    messages,
  } as PrismCompanionConversationSnapshot;
}

function prismConversationMessages(
  conversation: PrismCompanionConversationSnapshot,
): PrismCompanionMessage[] {
  return conversation.messages.flatMap((message): PrismCompanionMessage[] => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(message.userNotes ? { userNotes: message.userNotes } : {}),
      },
    ];
  });
}

function prismConversationReplyProvider(
  conversation: PrismCompanionConversationSnapshot,
): EphemeralChatResolvedProvider {
  const reply = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return reply?.provider === "openai" || reply?.provider === "anthropic"
    ? reply.provider
    : "local";
}

function readPosition(accountKey: string): PrismCompanionPosition {
  if (typeof window === "undefined") return { x: 0.92, y: 0.84 };
  try {
    const value = JSON.parse(
      window.localStorage.getItem(
        prismCompanionPositionStorageKey(accountKey),
      ) ?? "null",
    ) as Partial<PrismCompanionPosition> | null;
    if (typeof value?.x === "number" && typeof value.y === "number") {
      return clampPrismCompanionPosition({ x: value.x, y: value.y });
    }
  } catch {
    // Device-local placement is disposable.
  }
  return { x: 0.92, y: 0.84 };
}

function readSpeechEnabled(accountKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return parsePrismCompanionSpeechEnabled(
      window.localStorage.getItem(
        prismCompanionSpeechStorageKey(accountKey),
      ),
    );
  } catch {
    return true;
  }
}

async function writePrismCompanionClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // LAN development over plain HTTP can still allow the explicit fallback.
    }
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
    previouslyFocused?.focus({ preventScroll: true });
  }
}

function prismCompanionBubbleHasSelection(bubble: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return false;
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (bubble.contains(selection.getRangeAt(index).commonAncestorContainer)) {
      return true;
    }
  }
  return false;
}

function actionLabel(action: PrismCompanionActionIntent): string {
  if (action.type === "navigate") {
    return action.destination === "home" ? "Go Home" : "Open Slate";
  }
  if (action.type === "open_tool") {
    return action.tool === "avatar-studio"
      ? "Open Avatar Studio"
      : `Open ${action.tool[0]?.toUpperCase()}${action.tool.slice(1)}`;
  }
  if (action.type === "create_bot") return "Create a bot";
  if (action.type === "export_bot") return "Export bot";
  return action.direction === "zen-to-slate"
    ? "Send selection to Slate"
    : "Discuss selection in Zen";
}

function companionUserNotesHeadline(userNotes: UserNotesPayload): string {
  const title = userNotes.title?.trim() || "";
  const count =
    typeof userNotes.noteCount === "number"
      ? userNotes.noteCount
      : userNotes.notes?.length;
  switch (userNotes.status) {
    case "saved":
      return title ? `Saved note · ${title}` : "Saved note";
    case "updated":
      return title ? `Updated note · ${title}` : "Updated note";
    case "deleted":
      return title ? `Deleted note · ${title}` : "Deleted note";
    case "listed":
      return typeof count === "number"
        ? `Notes on file · ${count}`
        : "Notes on file";
    case "retrieved":
      return title ? `Opened note · ${title}` : "Opened note";
    case "error":
      return userNotes.error?.trim() || "Note action failed";
    default: {
      const _exhaustive: never = userNotes.status;
      void _exhaustive;
      return "Note";
    }
  }
}

export default function PrismCompanion({
  accountKey,
  theme = "dark",
  submerged = false,
  keyboardShortcut,
  surface,
  refractRouting,
  presentation = null,
  zenSessionIdleGapMs = DEFAULT_PRISM_COMPANION_SESSION_IDLE_GAP_MS,
  chatHomeHeroDocked = false,
  homeBaseAppletTargets = [],
  zenCanvasOrb = false,
  onHomeBaseAppletSelect,
  onContinueFocusedChat,
  onPersistentConversationChange,
  onOpenImagePrompt,
  onAction,
  onSpeak,
  onStopSpeaking,
  onError,
  onOrchestrationResult,
  onOpenCreatedBot,
  onStartCreatedCoffeeGroup,
  wieldTutorialActive = false,
  onWieldTutorialComplete,
  onWieldTutorialSkip,
  onWieldTutorialRemind,
  refractTutorialActive = false,
  onRefractTutorialComplete,
  onRefractTutorialSkip,
  onRefractTutorialRemind,
}: PrismCompanionProps): React.JSX.Element | null {
  const refractionGate = usePrismRefractionGate();
  const surfaceScope = prismCompanionSurfaceScope(surface);
  const privateRecoveryKey = useMemo(
    () => prismCompanionPrivateRecoveryStorageKey(accountKey),
    [accountKey],
  );
  const sessionStorageKey = useMemo(
    () => prismCompanionSessionStorageKey(accountKey),
    [accountKey],
  );
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<PrismCompanionView>("chat");
  const [draft, setDraft] = useState("");
  const [synthesisDraft, setSynthesisDraft] = useState("");
  const [synthesisBusy, setSynthesisBusy] = useState(false);
  const [synthesisStatus, setSynthesisStatus] = useState("");
  const [personalNotes, setPersonalNotes] = useState<PrismPersonalNote[]>([]);
  const [personalNotesLoading, setPersonalNotesLoading] = useState(false);
  const [personalNoteBusy, setPersonalNoteBusy] = useState(false);
  const [personalNoteStatus, setPersonalNoteStatus] = useState("");
  const [personalNoteId, setPersonalNoteId] = useState<string | null>(null);
  const [personalNoteTitle, setPersonalNoteTitle] = useState("");
  const [personalNoteBody, setPersonalNoteBody] = useState("");
  const [personalNoteDeleteConfirm, setPersonalNoteDeleteConfirm] =
    useState(false);
  const [sessionNoteDraft, setSessionNoteDraft] = useState("");
  const [sessionNoteSaving, setSessionNoteSaving] = useState(false);
  const [sessionNoteStatus, setSessionNoteStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [savedMessages, setSavedMessages] = useState<PrismCompanionMessage[]>(
    [],
  );
  const [privateMessages, setPrivateMessages] = useState<
    PrismCompanionMessage[]
  >([]);
  const [savedConversation, setSavedConversation] =
    useState<PrismCompanionConversationSnapshot | null>(null);
  const [privateConversation, setPrivateConversation] =
    useState<PrismCompanionConversationSnapshot | null>(null);
  const [sessionRecord, setSessionRecord] =
    useState<PrismCompanionSessionRecord | null>(null);
  const messages = privateMode ? privateMessages : savedMessages;
  const interactionLocked = busy || conversationLoading;
  const [actions, setActions] = useState<PrismCompanionActionIntent[]>([]);
  const [cards, setCards] = useState<PrismCompanionCardV1[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentRuns, setRecentRuns] = useState<PrismActionRunV1[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(() =>
    readSpeechEnabled(accountKey),
  );
  const [speechReveal, setSpeechReveal] =
    useState<PrismCompanionSpeechReveal | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inertial, setInertial] = useState(false);
  const [idleDimmed, setIdleDimmed] = useState(false);
  const [idleHidden, setIdleHidden] = useState(false);
  const [position, setPosition] = useState<PrismCompanionPosition>(() =>
    readPosition(accountKey),
  );
  const [chatHomeDockPosition, setChatHomeDockPosition] =
    useState<PrismCompanionPosition | null>(null);
  const [chatHomeDockReturning, setChatHomeDockReturning] = useState(false);
  const [homeBaseRadialGesture, setHomeBaseRadialGesture] = useState<
    HomeBaseRadialGestureState<string>
  >({ phase: "idle" });
  const [homeBaseRadialSource, setHomeBaseRadialSource] =
    useState<HomeBaseRadialPoint | null>(null);
  const [homeBaseRadialPointer, setHomeBaseRadialPointer] =
    useState<HomeBaseRadialPoint | null>(null);
  const [homeBaseRadialLayout, setHomeBaseRadialLayout] = useState<
    HomeBaseRadialTargetPosition<string>[]
  >([]);
  const [homeBaseRadialTargetRadius, setHomeBaseRadialTargetRadius] =
    useState(HOME_BASE_RADIAL_TARGET_RADIUS_PX);
  const [refractSession, setRefractSession] =
    useState<PrismRefractSession | null>(null);
  const [refractPrompt, setRefractPrompt] = useState("");
  const [refractStatus, setRefractStatus] = useState("");
  const [wieldTutorialVisible, setWieldTutorialVisible] = useState(false);
  const [wieldTutorialStage, setWieldTutorialStage] = useState<
    "hold" | "target" | "release"
  >("hold");
  const [refractTutorialVisible, setRefractTutorialVisible] = useState(false);
  const [refractTutorialStage, setRefractTutorialStage] = useState<
    "summon" | "reroll" | "settle"
  >("summon");
  const modifierPresentation = useMemo(
    () =>
      prismCompanionModifierPresentation(
        typeof navigator === "undefined" ? "" : navigator.platform,
      ),
    [],
  );
  const shortcutPresentation = useMemo(() => {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return {
      aria: keyboardShortcutAria(keyboardShortcut),
      label: keyboardShortcutDisplay(keyboardShortcut, platform),
      spokenLabel: keyboardShortcutSpokenLabel(keyboardShortcut, platform),
    };
  }, [keyboardShortcut]);
  const companionSuppressed = useSyncExternalStore(
    subscribePrismCompanionSuppression,
    getPrismCompanionSuppressedSnapshot,
    getPrismCompanionSuppressedServerSnapshot,
  );
  const sessionNoteContext = useSyncExternalStore(
    subscribePrismCompanionSuppression,
    getPrismCompanionSessionNoteSnapshot,
    getPrismCompanionSessionNoteServerSnapshot,
  );
  const softSynthesisUi = usePrismSoftSynthesisUi();
  const viewRequest = usePrismCompanionViewRequest();
  const softSynthesisActive = softSynthesisUi.jobCount > 0;
  const chatHomeOrbDocked =
    chatHomeHeroDocked &&
    !open &&
    !(softSynthesisActive && softSynthesisUi.expanded) &&
    refractSession === null;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const personalNoteTitleRef = useRef<HTMLInputElement | null>(null);
  const refractPromptRef = useRef<HTMLInputElement | null>(null);
  const sessionNoteContextRef = useRef(sessionNoteContext);
  const sessionNoteTypingStartedAtRef = useRef<string | null>(null);
  const surfaceRef = useRef(surface);
  const positionRef = useRef(position);
  const chatHomeDockPositionRef = useRef<PrismCompanionPosition | null>(null);
  const chatHomeDockReturnTimerRef = useRef<number | null>(null);
  const homeBaseRadialGestureRef =
    useRef<HomeBaseRadialGestureState<string>>(homeBaseRadialGesture);
  const homeBaseRadialHoldTimerRef = useRef<number | null>(null);
  const homeBaseRadialHandoffTimerRef = useRef<number | null>(null);
  const homeBaseRadialRunRef = useRef(0);
  const homeBaseRadialSuppressClickRef = useRef(false);
  const homeBaseRadialTargetRefs = useRef(new Map<string, HTMLButtonElement>());
  const refractSessionRef = useRef<PrismRefractSession | null>(null);
  const refractQueueRef = useRef<QueuedPrismRefractRequest[]>([]);
  const refractQueueAdvanceRunRef = useRef(0);
  const refractMagicHandoffFrameRef = useRef<number | null>(null);
  const refractAbortRef = useRef<AbortController | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const refractRunRef = useRef(0);
  const wieldTutorialTargetRef = useRef<HTMLElement | null>(null);
  const wieldTutorialVisibleRef = useRef(false);
  const wieldTutorialStageRef = useRef<"hold" | "target" | "release">("hold");
  const wieldTutorialRunRef = useRef(false);
  const onWieldTutorialCompleteRef = useRef(onWieldTutorialComplete);
  const contextTokenIdsRef = useRef<string[]>([]);
  const refractTutorialTargetRef = useRef<HTMLElement | null>(null);
  const refractTutorialVisibleRef = useRef(false);
  const refractTutorialStageRef = useRef<"summon" | "reroll" | "settle">(
    "summon",
  );
  const refractTutorialRunRef = useRef(false);
  const onRefractTutorialCompleteRef = useRef(onRefractTutorialComplete);
  const wieldStateRef = useRef<PrismWieldState>(createPrismWieldState());
  const wieldFrameRef = useRef<number | null>(null);
  const wieldLastPointerRef = useRef<PrismWieldPoint | null>(null);
  const wieldVelocitySampleRef =
    useRef<PrismCompanionDragVelocitySample | null>(null);
  const openRef = useRef(open);
  const prismWieldAvailabilityRef = useRef({
    companionMenuOpen: open,
    softSynthesisMenuOpen:
      softSynthesisActive && softSynthesisUi.expanded,
    homeDocked: chatHomeOrbDocked,
  });
  const handledViewRequestRef = useRef(viewRequest.requestId);
  const sessionNoteSavingRef = useRef(false);
  const personalNotesLoadedRef = useRef(false);
  const sessionRecordRef = useRef<PrismCompanionSessionRecord | null>(null);
  const savedConversationRef =
    useRef<PrismCompanionConversationSnapshot | null>(null);
  const privateConversationRef =
    useRef<PrismCompanionConversationSnapshot | null>(null);
  const privateConversationIdRef = useRef<string | null>(null);
  const sessionOpenPromiseRef =
    useRef<Promise<PrismCompanionConversationSnapshot> | null>(null);
  const conversationRequestRef = useRef<AbortController | null>(null);
  const draggingRef = useRef(dragging);
  const inertialRef = useRef(inertial);
  const idleDimmedRef = useRef(false);
  const idleHiddenRef = useRef(false);
  const idleDimTimerRef = useRef<number | null>(null);
  const idleVanishTimerRef = useRef<number | null>(null);
  const wieldHoverTargetRef = useRef<HTMLElement | null>(null);
  const wieldReturnPositionRef = useRef<PrismCompanionPosition | null>(null);
  const wieldSuppressedClickRef = useRef<HTMLElement | null>(null);
  const wieldSuppressedClickTimerRef = useRef<number | null>(null);
  const dragRef = useRef<
    | (PrismCompanionDragVelocitySample & {
        pointerId: number;
        startX: number;
        startY: number;
        origin: PrismCompanionPosition;
        moved: boolean;
      })
    | null
  >(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const inertiaLastTimeRef = useRef<number | null>(null);
  const inertiaVelocityRef = useRef<PrismCompanionVelocity>({ x: 0, y: 0 });
  const liveBoundsRef = useRef<PrismCompanionLiveBounds>(
    PRISM_COMPANION_POSITION_BOUNDS,
  );
  const rightPanelInsetPxRef = useRef(0);
  const speechRunRef = useRef(0);
  const speechAbortRef = useRef<AbortController | null>(null);
  const speechPlaybackActiveRef = useRef(false);
  const pausedBackgroundAnimationsRef = useRef<Set<Animation>>(new Set());
  const pausedBackgroundMediaRef = useRef<Set<HTMLMediaElement>>(new Set());
  const stopSpeakingRef = useRef(onStopSpeaking);
  const dismissOnExternalInteraction =
    prismCompanionDismissesOnExternalInteraction(surface);
  const surfaceGlare = resolvePrismCompanionSurfaceGlare(position);
  const refractTargetPosition =
    refractSession?.registration.target.kind === "field"
      ? refractSession.targetCenter
      : null;
  const visiblePosition = refractTargetPosition
    ? refractTargetPosition
    : chatHomeOrbDocked && chatHomeDockPosition
      ? chatHomeDockPosition
      : position;
  const visibleSurfaceGlare = chatHomeOrbDocked && chatHomeDockPosition
    ? resolvePrismCompanionSurfaceGlare(chatHomeDockPosition)
    : surfaceGlare;
  const anchorStyle = {
    left: `${visiblePosition.x * 100}%`,
    top: `${visiblePosition.y * 100}%`,
    "--prism-orb-glare-x": `${visibleSurfaceGlare.xPct.toFixed(2)}%`,
    "--prism-orb-glare-y": `${visibleSurfaceGlare.yPct.toFixed(2)}%`,
    "--prism-refract-target-half-width": `${Math.max(
      0,
      (refractSession?.targetWidth ?? 0) / 2,
    )}px`,
  } as CSSProperties;

  const updateRefractSession = useCallback(
    (next: PrismRefractSession | null): void => {
      refractSessionRef.current = next;
      setRefractSession(next);
    },
    [],
  );

  const updateRefractTutorialStage = useCallback(
    (stage: "summon" | "reroll" | "settle"): void => {
      refractTutorialStageRef.current = stage;
      setRefractTutorialStage(stage);
    },
    [],
  );

  const updateWieldTutorialStage = useCallback(
    (stage: "hold" | "target" | "release"): void => {
      wieldTutorialStageRef.current = stage;
      setWieldTutorialStage(stage);
    },
    [],
  );

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sessionNoteContextRef.current = sessionNoteContext;
  }, [sessionNoteContext]);

  useEffect(() => {
    surfaceRef.current = surface;
  }, [surface]);

  useEffect(() => {
    sessionRecordRef.current = sessionRecord;
  }, [sessionRecord]);

  useEffect(() => {
    savedConversationRef.current = savedConversation;
  }, [savedConversation]);

  useEffect(() => {
    privateConversationRef.current = privateConversation;
  }, [privateConversation]);

  useEffect(() => {
    // View switches and full-screen work temporarily suppress the portal.
    // Resume from the normal snapshot after that boundary lifts, then dock.
    if (companionSuppressed) {
      chatHomeDockPositionRef.current = null;
      setChatHomeDockPosition(null);
      setChatHomeDockReturning(false);
      return;
    }
    if (!chatHomeOrbDocked) {
      if (chatHomeDockPositionRef.current === null) return;
      chatHomeDockPositionRef.current = null;
      setChatHomeDockPosition(null);
      setChatHomeDockReturning(true);
      if (chatHomeDockReturnTimerRef.current !== null) {
        window.clearTimeout(chatHomeDockReturnTimerRef.current);
      }
      chatHomeDockReturnTimerRef.current = window.setTimeout(() => {
        chatHomeDockReturnTimerRef.current = null;
        setChatHomeDockReturning(false);
      }, PRISM_ORB_HANDOFF_DURATION_MS);
      return;
    }

    setChatHomeDockReturning(false);
    let frame = 0;
    const syncChatHomeDock = (): void => {
      const slot = queryPrismChatHomeOrbSlot();
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      const next = normalizedPrismOrbPositionForRect(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      if (!next) return;
      const current = chatHomeDockPositionRef.current;
      if (
        current &&
        Math.abs(current.x - next.x) < 0.00005 &&
        Math.abs(current.y - next.y) < 0.00005
      ) {
        return;
      }
      chatHomeDockPositionRef.current = next;
      setChatHomeDockPosition(next);
    };
    const syncEveryFrame = (): void => {
      syncChatHomeDock();
      frame = window.requestAnimationFrame(syncEveryFrame);
    };

    // The Home title can move without resizing its slot (font loads, sidebars,
    // zoom, CSS transitions, and sibling content all do this). Read its live
    // compositor geometry while docked and publish only meaningful changes.
    frame = window.requestAnimationFrame(syncEveryFrame);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [chatHomeOrbDocked, companionSuppressed]);

  useLayoutEffect(() => {
    publishPrismCompanionVisualSnapshot({
      position: visiblePosition,
      available: !companionSuppressed,
    });
    return () => {
      publishPrismCompanionVisualSnapshot({
        position:
          chatHomeDockPositionRef.current ?? positionRef.current,
        available: false,
      });
    };
  }, [companionSuppressed, visiblePosition]);

  useEffect(() => {
    stopSpeakingRef.current = onStopSpeaking;
  }, [onStopSpeaking]);

  useEffect(() => {
    onRefractTutorialCompleteRef.current = onRefractTutorialComplete;
  }, [onRefractTutorialComplete]);

  useEffect(() => {
    onWieldTutorialCompleteRef.current = onWieldTutorialComplete;
  }, [onWieldTutorialComplete]);

  const cancelSpeech = useCallback((stopAudio: boolean): void => {
    speechRunRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    setSpeechReveal(null);
    if (stopAudio && speechPlaybackActiveRef.current) {
      stopSpeakingRef.current?.();
    }
    speechPlaybackActiveRef.current = false;
  }, []);

  const copyPrismCompanionMessage = useCallback(
    async (message: PrismCompanionMessage): Promise<void> => {
      try {
        await writePrismCompanionClipboard(message.content);
        setCopiedMessageId(message.id);
        if (copyFeedbackTimerRef.current !== null) {
          window.clearTimeout(copyFeedbackTimerRef.current);
        }
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          copyFeedbackTimerRef.current = null;
          setCopiedMessageId((current) =>
            current === message.id ? null : current,
          );
        }, 1_600);
      } catch {
        onError?.("Prism could not copy that message.");
      }
    },
    [onError],
  );

  const persistPosition = useCallback(
    (next: PrismCompanionPosition): void => {
      try {
        window.localStorage.setItem(
          prismCompanionPositionStorageKey(accountKey),
          JSON.stringify(next),
        );
      } catch {
        // Device-local placement is disposable.
      }
    },
    [accountKey],
  );

  const clearIdleDim = useCallback((): void => {
    if (idleDimTimerRef.current !== null) {
      window.clearTimeout(idleDimTimerRef.current);
      idleDimTimerRef.current = null;
    }
    if (idleVanishTimerRef.current !== null) {
      window.clearTimeout(idleVanishTimerRef.current);
      idleVanishTimerRef.current = null;
    }
    idleDimmedRef.current = false;
    idleHiddenRef.current = false;
    setIdleDimmed(false);
    setIdleHidden(false);
  }, []);

  const isIdlePresenceBlocked = useCallback((): boolean => {
    const wieldPhase = wieldStateRef.current.phase;
    const wieldVisualActive =
      wieldPhase !== "idle" && wieldPhase !== "pending";
    return (
      openRef.current ||
      draggingRef.current ||
      inertialRef.current ||
      wieldVisualActive ||
      wieldTutorialVisibleRef.current ||
      refractTutorialVisibleRef.current ||
      refractSessionRef.current !== null ||
      softSynthesisActive ||
      chatHomeOrbDocked
    );
  }, [chatHomeOrbDocked, softSynthesisActive]);

  const scheduleIdleVanish = useCallback((): void => {
    if (idleVanishTimerRef.current !== null) {
      window.clearTimeout(idleVanishTimerRef.current);
      idleVanishTimerRef.current = null;
    }
    if (isIdlePresenceBlocked() || idleHiddenRef.current) {
      return;
    }
    idleVanishTimerRef.current = window.setTimeout(() => {
      idleVanishTimerRef.current = null;
      if (isIdlePresenceBlocked()) {
        return;
      }
      idleHiddenRef.current = true;
      setIdleHidden(true);
    }, PRISM_COMPANION_IDLE_VANISH_MS);
  }, [isIdlePresenceBlocked]);

  const scheduleIdleDim = useCallback((): void => {
    if (idleDimTimerRef.current !== null) {
      window.clearTimeout(idleDimTimerRef.current);
      idleDimTimerRef.current = null;
    }
    if (idleVanishTimerRef.current !== null) {
      window.clearTimeout(idleVanishTimerRef.current);
      idleVanishTimerRef.current = null;
    }
    if (isIdlePresenceBlocked()) {
      return;
    }
    if (idleHiddenRef.current) {
      return;
    }
    if (idleDimmedRef.current) {
      scheduleIdleVanish();
      return;
    }
    idleDimTimerRef.current = window.setTimeout(() => {
      idleDimTimerRef.current = null;
      if (isIdlePresenceBlocked()) {
        return;
      }
      idleDimmedRef.current = true;
      setIdleDimmed(true);
      scheduleIdleVanish();
    }, PRISM_COMPANION_IDLE_DIM_MS);
  }, [isIdlePresenceBlocked, scheduleIdleVanish]);

  useEffect(() => {
    openRef.current = open;
    if (open) clearIdleDim();
    else scheduleIdleDim();
  }, [clearIdleDim, open, scheduleIdleDim]);

  useEffect(() => {
    if (chatHomeOrbDocked) clearIdleDim();
    else if (!openRef.current) scheduleIdleDim();
  }, [chatHomeOrbDocked, clearIdleDim, scheduleIdleDim]);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    inertialRef.current = inertial;
  }, [inertial]);

  const publishSoftSynthesisPosition = useCallback(
    (next: PrismCompanionPosition): void => {
      if (!softSynthesisActive) return;
      publishPrismCompanionVisualSnapshot({
        position: next,
        available: !companionSuppressed,
      });
    },
    [companionSuppressed, softSynthesisActive],
  );

  const stopInertia = useCallback(
    (persist = false): void => {
      if (inertiaFrameRef.current !== null) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
      inertiaFrameRef.current = null;
      inertiaLastTimeRef.current = null;
      inertiaVelocityRef.current = { x: 0, y: 0 };
      setInertial(false);
      inertialRef.current = false;
      if (persist) persistPosition(positionRef.current);
    },
    [persistPosition],
  );

  const startInertia = useCallback(
    (velocity: PrismCompanionVelocity): void => {
      const boundedVelocity = boundedPrismCompanionReleaseVelocity(velocity);
      if (
        Math.hypot(boundedVelocity.x, boundedVelocity.y) === 0 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        persistPosition(positionRef.current);
        setInertial(false);
        inertialRef.current = false;
        scheduleIdleDim();
        return;
      }
      stopInertia(false);
      inertiaVelocityRef.current = boundedVelocity;
      setInertial(true);
      inertialRef.current = true;

      const step = (timeMs: number): void => {
        const previousTime = inertiaLastTimeRef.current ?? timeMs;
        inertiaLastTimeRef.current = timeMs;
        const next = stepPrismCompanionInertia({
          position: positionRef.current,
          velocity: inertiaVelocityRef.current,
          elapsedSeconds: (timeMs - previousTime) / 1_000 || 1 / 60,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          bounds: liveBoundsRef.current,
        });
        positionRef.current = next.position;
        inertiaVelocityRef.current = next.velocity;
        publishSoftSynthesisPosition(next.position);
        setPosition(next.position);
        if (next.bounced) playPrismCompanionGlassTap();
        if (next.moving) {
          inertiaFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        inertiaFrameRef.current = null;
        inertiaLastTimeRef.current = null;
        setInertial(false);
        inertialRef.current = false;
        persistPosition(next.position);
        scheduleIdleDim();
      };

      inertiaFrameRef.current = window.requestAnimationFrame(step);
    },
    [
      persistPosition,
      publishSoftSynthesisPosition,
      scheduleIdleDim,
      stopInertia,
    ],
  );

  const syncRightPanelCollisionBounds = useCallback((): void => {
    if (typeof window === "undefined") return;
    const viewportWidth = Math.max(1, window.innerWidth);
    const rightInsetPx = measurePrismCompanionRightPanelInsetPx(
      document,
      viewportWidth,
    );
    const previousInsetPx = rightPanelInsetPxRef.current;
    const previousMaxX = liveBoundsRef.current.maxX;
    const nextBounds = resolvePrismCompanionLiveBounds({
      viewportWidth,
      rightInsetPx,
    });
    rightPanelInsetPxRef.current = rightInsetPx;
    liveBoundsRef.current = nextBounds;

    // Don't shove the orb while the user is actively dragging or wielding it.
    if (
      dragRef.current ||
      draggingRef.current ||
      wieldStateRef.current.phase !== "idle"
    ) {
      return;
    }

    const wallAdvancing = rightInsetPx > previousInsetPx + 0.5;
    if (
      wallAdvancing &&
      positionRef.current.x > nextBounds.maxX + 0.0005
    ) {
      // Already fleeing the wall — ride the moving edge without stacking shove.
      if (inertialRef.current && inertiaVelocityRef.current.x < 0) {
        const parked = {
          x: nextBounds.maxX,
          y: positionRef.current.y,
        };
        positionRef.current = parked;
        setPosition(parked);
        return;
      }

      const push = resolvePrismCompanionRightPanelPush({
        position: positionRef.current,
        velocity: inertiaVelocityRef.current,
        previousMaxX,
        nextMaxX: nextBounds.maxX,
        viewportWidth,
      });
      if (push.pushed) {
        clearIdleDim();
        positionRef.current = push.position;
        setPosition(push.position);
        playPrismCompanionGlassTap();
        startInertia(push.velocity);
        return;
      }
    }

    const clamped = clampPrismCompanionPosition(
      positionRef.current,
      nextBounds,
    );
    if (
      clamped.x !== positionRef.current.x ||
      clamped.y !== positionRef.current.y
    ) {
      positionRef.current = clamped;
      setPosition(clamped);
    }
  }, [clearIdleDim, startInertia]);

  useEffect(() => {
    if (companionSuppressed || typeof window === "undefined") return;

    let rafId = 0;
    const scheduleSync = (): void => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncRightPanelCollisionBounds();
      });
    };

    const panelResizeObserver = new ResizeObserver(scheduleSync);
    const observePanels = (): void => {
      for (const node of document.querySelectorAll("[data-prism-panel]")) {
        if (node instanceof Element) panelResizeObserver.observe(node);
      }
    };

    const mutationObserver = new MutationObserver(() => {
      observePanels();
      scheduleSync();
    });
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "data-right-panel-open",
        "data-prism-panel",
        "data-closing",
      ],
      childList: true,
      subtree: true,
    });
    observePanels();
    scheduleSync();
    window.addEventListener("resize", scheduleSync);
    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      mutationObserver.disconnect();
      panelResizeObserver.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [companionSuppressed, syncRightPanelCollisionBounds]);

  const clearPrismWieldHover = useCallback((): void => {
    delete wieldHoverTargetRef.current?.dataset.prismRefractWieldHover;
    wieldHoverTargetRef.current = null;
    anchorRef.current?.removeAttribute("data-wield-hover-target");
  }, []);

  const resetPrismWield = useCallback(
    (
      preserveCaptureReturn = false,
      completeTutorialOnRelease = false,
      options: { skipCursorDock?: boolean } = {},
    ): void => {
      const state = wieldStateRef.current;
      const wasFollowing = state.phase === "following";
      const wasPending = state.phase === "pending";
      const releasePointer = state.pointer ?? wieldLastPointerRef.current;
      const releaseVelocity = wasFollowing
        ? {
            x: wieldVelocitySampleRef.current?.velocityX ?? 0,
            y: wieldVelocitySampleRef.current?.velocityY ?? 0,
          }
        : { x: 0, y: 0 };
      const shouldCompleteTutorial =
        completeTutorialOnRelease &&
        state.phase === "following" &&
        wieldTutorialVisibleRef.current &&
        wieldTutorialRunRef.current &&
        wieldTutorialStageRef.current === "release";
      if (state.phase !== "idle") {
        const returning = transitionPrismWield(state, {
          type: "return",
          epoch: state.epoch,
        });
        wieldStateRef.current = transitionPrismWield(returning, {
          type: "finish",
          epoch: returning.epoch,
        });
      }
      if (wieldFrameRef.current !== null) {
        window.cancelAnimationFrame(wieldFrameRef.current);
        wieldFrameRef.current = null;
      }
      clearPrismWieldHover();
      document.documentElement.removeAttribute(PRISM_WIELD_CURSOR_ATTRIBUTE);
      setAppNavbarWielding(false);
      anchorRef.current?.removeAttribute("data-wielding");
      backdropRef.current?.removeAttribute("data-wielding");
      anchorRef.current?.style.removeProperty("transform");
      wieldReturnPositionRef.current = null;
      wieldVelocitySampleRef.current = null;
      if (
        !options.skipCursorDock &&
        !preserveCaptureReturn &&
        wasFollowing &&
        releasePointer &&
        typeof window !== "undefined" &&
        window.innerWidth > 0 &&
        window.innerHeight > 0
      ) {
        clearIdleDim();
        const next = clampPrismCompanionPosition(
          {
            x: releasePointer.x / window.innerWidth,
            y: releasePointer.y / window.innerHeight,
          },
          liveBoundsRef.current,
        );
        positionRef.current = next;
        setPosition(next);
        startInertia(releaseVelocity);
      } else if (
        !options.skipCursorDock &&
        !preserveCaptureReturn &&
        !wasPending
      ) {
        scheduleIdleDim();
      }
      if (shouldCompleteTutorial) {
        wieldTutorialRunRef.current = false;
        wieldTutorialVisibleRef.current = false;
        setWieldTutorialVisible(false);
        delete wieldTutorialTargetRef.current?.dataset.prismWieldTutorial;
        wieldTutorialTargetRef.current = null;
        onWieldTutorialCompleteRef.current?.();
      }
    },
    [clearIdleDim, clearPrismWieldHover, scheduleIdleDim, startInertia],
  );

  const flushPrismWieldFrame = useCallback((): void => {
    wieldFrameRef.current = null;
    const state = wieldStateRef.current;
    const pointer = state.pointer;
    const anchor = anchorRef.current;
    if (state.phase !== "following" || !pointer || !anchor) return;

    anchor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;

    if (sessionNoteContextRef.current) {
      clearPrismWieldHover();
      return;
    }

    const targetId = prismRefractTargetIdAtPoint(pointer.x, pointer.y);
    const registration = targetId
      ? registeredPrismRefractTarget(targetId)
      : null;
    const targetElement =
      registration && !registration.target.disabled?.()
        ? registration.element
        : null;
    if (targetElement === wieldHoverTargetRef.current) return;
    clearPrismWieldHover();
    wieldHoverTargetRef.current = targetElement;
    anchor.toggleAttribute("data-wield-hover-target", Boolean(targetElement));
    if (targetElement) {
      targetElement.dataset.prismRefractWieldHover = "true";
      if (
        wieldTutorialVisibleRef.current &&
        wieldTutorialStageRef.current === "target"
      ) {
        updateWieldTutorialStage("release");
      }
    }
  }, [clearPrismWieldHover, updateWieldTutorialStage]);

  const schedulePrismWieldFrame = useCallback((): void => {
    if (wieldFrameRef.current !== null) return;
    wieldFrameRef.current = window.requestAnimationFrame(flushPrismWieldFrame);
  }, [flushPrismWieldFrame]);

  const presentPrismWield = useCallback(
    (state: PrismWieldState): void => {
      if (state.phase !== "following") return;
      if (!wieldReturnPositionRef.current) {
        wieldReturnPositionRef.current = positionRef.current;
      }
      clearIdleDim();
      stopInertia(false);
      // Pointer movement is the sole visual Wield boundary. A stationary
      // modifier hold leaves the ordinary cursor and resting Prism untouched.
      const pointer = state.pointer ?? wieldLastPointerRef.current;
      wieldVelocitySampleRef.current = pointer
        ? createPrismCompanionDragVelocitySample(
            pointer.x,
            pointer.y,
            performance.now(),
          )
        : null;
      document.documentElement.setAttribute(
        PRISM_WIELD_CURSOR_ATTRIBUTE,
        "true",
      );
      setAppNavbarWielding(true);
      anchorRef.current?.setAttribute("data-wielding", "true");
      backdropRef.current?.setAttribute("data-wielding", "true");
      if (
        wieldTutorialVisibleRef.current &&
        wieldTutorialStageRef.current === "hold"
      ) {
        wieldTutorialRunRef.current = true;
        updateWieldTutorialStage("target");
      }
      schedulePrismWieldFrame();
    },
    [
      clearIdleDim,
      schedulePrismWieldFrame,
      stopInertia,
      updateWieldTutorialStage,
    ],
  );

  const startPrismWield = useCallback(
    (pointer: PrismWieldPoint): void => {
      if (!prismWieldCanArm(prismWieldAvailabilityRef.current)) return;
      const current = wieldStateRef.current;
      const next = transitionPrismWield(current, {
        type: "modifier-down",
        pointer,
      });
      if (next === current) return;
      wieldStateRef.current = next;
    },
    [],
  );

  useLayoutEffect(() => {
    const menuOpen =
      open || (softSynthesisActive && softSynthesisUi.expanded);
    prismWieldAvailabilityRef.current = {
      companionMenuOpen: open,
      softSynthesisMenuOpen:
        softSynthesisActive && softSynthesisUi.expanded,
      homeDocked: chatHomeOrbDocked,
    };
    if (
      (!menuOpen && !chatHomeOrbDocked) ||
      wieldStateRef.current.phase === "idle"
    ) {
      return;
    }
    resetPrismWield(false, false, { skipCursorDock: true });
  }, [
    chatHomeOrbDocked,
    open,
    resetPrismWield,
    softSynthesisActive,
    softSynthesisUi.expanded,
  ]);

  useLayoutEffect(() => {
    return () => {
      if (inertiaFrameRef.current !== null) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
      if (idleDimTimerRef.current !== null) {
        window.clearTimeout(idleDimTimerRef.current);
        idleDimTimerRef.current = null;
      }
      if (idleVanishTimerRef.current !== null) {
        window.clearTimeout(idleVanishTimerRef.current);
        idleVanishTimerRef.current = null;
      }
      if (chatHomeDockReturnTimerRef.current !== null) {
        window.clearTimeout(chatHomeDockReturnTimerRef.current);
      }
      stopPrismCompanionGlassTapAudio();
      conversationRequestRef.current?.abort();
      conversationRequestRef.current = null;
      sessionOpenPromiseRef.current = null;
      speechRunRef.current += 1;
      speechAbortRef.current?.abort();
      if (speechPlaybackActiveRef.current) stopSpeakingRef.current?.();
      speechPlaybackActiveRef.current = false;
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      persistPosition(positionRef.current);
      resetPrismWield(false, false, { skipCursorDock: true });
    };
  }, [persistPosition, resetPrismWield]);

  useEffect(() => {
    setSpeechEnabled(readSpeechEnabled(accountKey));
  }, [accountKey]);

  useEffect(() => {
    setAppNavbarCompanionOpen(open);
    return () => setAppNavbarCompanionOpen(false);
  }, [open]);

  const pauseBackgroundForCompanionConversation =
    open && !sessionNoteContext;
  useEffect(() => {
    if (!pauseBackgroundForCompanionConversation) {
      setPrismSystemPause(PRISM_COMPANION_SYSTEM_PAUSE_REASON, false);
      return;
    }

    setPrismSystemPause(PRISM_COMPANION_SYSTEM_PAUSE_REASON, true);
    const pausedAnimations = pausedBackgroundAnimationsRef.current;
    const pausedMedia = pausedBackgroundMediaRef.current;
    const isBackgroundElement = (node: unknown): node is Element =>
      node instanceof Element &&
      !node.closest(PRISM_SYSTEM_PAUSE_EXEMPT_SELECTOR);
    const pauseBackgroundAnimations = (): void => {
      for (const animation of document.getAnimations()) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (!isBackgroundElement(target)) continue;
        if (animation.playState !== "running") continue;
        animation.pause();
        pausedAnimations.add(animation);
      }
    };
    const pauseBackgroundMedia = (media: HTMLMediaElement): void => {
      if (!isBackgroundElement(media) || media.paused) return;
      media.pause();
      pausedMedia.add(media);
    };
    const handleBackgroundTimelineStart = (): void => {
      pauseBackgroundAnimations();
    };
    const handleBackgroundMediaPlay = (event: Event): void => {
      if (event.target instanceof HTMLMediaElement) {
        pauseBackgroundMedia(event.target);
      }
    };

    pauseBackgroundAnimations();
    document
      .querySelectorAll<HTMLMediaElement>("audio, video")
      .forEach(pauseBackgroundMedia);
    document.addEventListener(
      "animationstart",
      handleBackgroundTimelineStart,
      true,
    );
    document.addEventListener(
      "transitionrun",
      handleBackgroundTimelineStart,
      true,
    );
    document.addEventListener("play", handleBackgroundMediaPlay, true);

    return () => {
      document.removeEventListener(
        "animationstart",
        handleBackgroundTimelineStart,
        true,
      );
      document.removeEventListener(
        "transitionrun",
        handleBackgroundTimelineStart,
        true,
      );
      document.removeEventListener("play", handleBackgroundMediaPlay, true);
      setPrismSystemPause(PRISM_COMPANION_SYSTEM_PAUSE_REASON, false);
      for (const animation of pausedAnimations) {
        if (animation.playState === "paused") animation.play();
      }
      pausedAnimations.clear();
      for (const media of pausedMedia) {
        if (media.isConnected && media.paused && !media.ended) {
          void media.play().catch(() => undefined);
        }
      }
      pausedMedia.clear();
    };
  }, [pauseBackgroundForCompanionConversation]);

  const persistPrivateRecovery = useCallback(
    (next: readonly PrismCompanionMessage[]): PrismCompanionMessage[] => {
      try {
        window.sessionStorage.setItem(
          privateRecoveryKey,
          JSON.stringify(retainPrismCompanionRecovery(next)),
        );
      } catch {
        // Private chat remains usable when session storage is unavailable.
      }
      return [...next];
    },
    [privateRecoveryKey],
  );

  const persistSessionRecord = useCallback(
    (next: PrismCompanionSessionRecord | null): void => {
      sessionRecordRef.current = next;
      setSessionRecord(next);
      try {
        if (next) {
          window.sessionStorage.setItem(
            sessionStorageKey,
            JSON.stringify(next),
          );
        } else {
          window.sessionStorage.removeItem(sessionStorageKey);
        }
      } catch {
        // The saved conversation remains canonical even without a tab hint.
      }
    },
    [sessionStorageKey],
  );

  const notifyPersistentConversationChange = useCallback(
    (conversationId: string): void => {
      if (!onPersistentConversationChange) return;
      void Promise.resolve(onPersistentConversationChange(conversationId)).catch(
        () => onError?.("Prism updated the chat, but Conversations could not refresh."),
      );
    },
    [onError, onPersistentConversationChange],
  );

  const applySavedConversation = useCallback(
    (conversation: PrismCompanionConversationSnapshot): void => {
      savedConversationRef.current = conversation;
      setSavedConversation(conversation);
      setSavedMessages(prismConversationMessages(conversation));
    },
    [],
  );

  const applyPrivateConversation = useCallback(
    (conversation: PrismCompanionConversationSnapshot): void => {
      privateConversationRef.current = conversation;
      privateConversationIdRef.current = conversation.id;
      setPrivateConversation(conversation);
      setPrivateMessages(
        persistPrivateRecovery(prismConversationMessages(conversation)),
      );
    },
    [persistPrivateRecovery],
  );

  const loadPersistentConversation = useCallback(
    async (
      conversationId: string,
      signal?: AbortSignal,
    ): Promise<PrismCompanionConversationSnapshot | null> => {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
        {
          credentials: "same-origin",
          signal,
        },
      );
      if (response.status === 404) return null;
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversation?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Prism could not open its saved chat.",
        );
      }
      const conversation = parsePrismConversationSnapshot(payload.conversation);
      if (
        !conversation ||
        conversation.incognito ||
        (typeof conversation.hubBotId === "string" &&
          conversation.hubBotId.trim())
      ) {
        return null;
      }
      return conversation;
    },
    [],
  );

  const ensurePersistentConversation = useCallback(async (): Promise<
    PrismCompanionConversationSnapshot
  > => {
    const pending = sessionOpenPromiseRef.current;
    if (pending) return pending;

    const controller = new AbortController();
    conversationRequestRef.current?.abort();
    conversationRequestRef.current = controller;
    setConversationLoading(true);
    const inFlight = (async (): Promise<PrismCompanionConversationSnapshot> => {
      const nowMs = Date.now();
      const cached = sessionRecordRef.current;
      if (
        prismCompanionSessionIsReusable(cached, nowMs, zenSessionIdleGapMs)
      ) {
        const existing = await loadPersistentConversation(
          cached.conversationId,
          controller.signal,
        );
        if (existing) {
          const touched = touchPrismCompanionSessionRecord(existing.id, nowMs);
          persistSessionRecord(touched);
          applySavedConversation(existing);
          notifyPersistentConversationChange(existing.id);
          return existing;
        }
      }

      persistSessionRecord(null);
      const response = await fetch("/api/conversations/zen/open", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId: null, newSession: true }),
        signal: controller.signal,
      });
      const opened = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversationId?: string;
      };
      if (!response.ok || !opened.conversationId?.trim()) {
        throw new Error(
          typeof opened.error === "string"
            ? opened.error
            : "Prism could not start a saved chat.",
        );
      }
      const conversationId = opened.conversationId.trim();
      const conversation = await loadPersistentConversation(
        conversationId,
        controller.signal,
      );
      if (!conversation) {
        throw new Error("Prism started a chat that could not be reopened.");
      }
      persistSessionRecord(
        touchPrismCompanionSessionRecord(conversationId, Date.now()),
      );
      applySavedConversation(conversation);
      notifyPersistentConversationChange(conversationId);
      return conversation;
    })();
    sessionOpenPromiseRef.current = inFlight;
    try {
      return await inFlight;
    } finally {
      if (sessionOpenPromiseRef.current === inFlight) {
        sessionOpenPromiseRef.current = null;
      }
      if (conversationRequestRef.current === controller) {
        conversationRequestRef.current = null;
      }
      setConversationLoading(false);
    }
  }, [
    applySavedConversation,
    loadPersistentConversation,
    notifyPersistentConversationChange,
    persistSessionRecord,
    zenSessionIdleGapMs,
  ]);

  useEffect(() => {
    cancelSpeech(true);
    conversationRequestRef.current?.abort();
    conversationRequestRef.current = null;
    sessionOpenPromiseRef.current = null;
    let nextSession: PrismCompanionSessionRecord | null = null;
    let nextPrivateMessages: PrismCompanionMessage[] = [];
    try {
      nextSession = parsePrismCompanionSessionRecord(
        window.sessionStorage.getItem(sessionStorageKey),
      );
      nextPrivateMessages = parsePrismCompanionRecovery(
        window.sessionStorage.getItem(privateRecoveryKey),
      );
    } catch {
      // Start with clean tab-local state when storage is unavailable.
    }
    sessionRecordRef.current = nextSession;
    setSessionRecord(nextSession);
    savedConversationRef.current = null;
    setSavedConversation(null);
    setSavedMessages([]);
    privateConversationRef.current = null;
    privateConversationIdRef.current = null;
    setPrivateConversation(null);
    setPrivateMessages(nextPrivateMessages);
    setPrivateMode(false);
    setConversationLoading(false);
    setActions([]);
    setCards([]);
    contextTokenIdsRef.current = [];
    personalNotesLoadedRef.current = false;
    setPersonalNotes([]);
    setPersonalNoteId(null);
    setPersonalNoteTitle("");
    setPersonalNoteBody("");
    setPersonalNoteStatus("");
    setDraft("");
    setOpen(false);
  }, [
    accountKey,
    cancelSpeech,
    privateRecoveryKey,
    sessionStorageKey,
  ]);

  useEffect(() => {
    cancelSpeech(true);
    setActions([]);
    setCards([]);
    contextTokenIdsRef.current = [];
    setDraft("");
    setOpen(false);
  }, [cancelSpeech, surfaceScope]);

  useEffect(() => {
    setOpen(false);
    setSessionNoteDraft("");
    setSessionNoteStatus("");
    setSessionNoteSaving(false);
  }, [sessionNoteContext]);

  const inheritChatHomeDockPosition = useCallback((): void => {
    const dockPosition = chatHomeDockPositionRef.current;
    if (!dockPosition) return;
    positionRef.current = dockPosition;
    setPosition(dockPosition);
  }, []);

  const presentAssistantConversation = useCallback((): void => {
    clearIdleDim();
    setPanelView("chat");
    setPrismSoftSynthesisExpanded(false);
    setOpen(true);
    if (!privateMode) {
      void ensurePersistentConversation().catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError?.(
          error instanceof Error
            ? error.message
            : "Prism could not open its saved chat.",
        );
      });
    }
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [
    clearIdleDim,
    ensurePersistentConversation,
    onError,
    privateMode,
  ]);

  const openAndFocus = useCallback((): void => {
    inheritChatHomeDockPosition();
    presentAssistantConversation();
  }, [inheritChatHomeDockPosition, presentAssistantConversation]);

  const openAndFocusNearPoint = useCallback(
    (point: HomeBaseRadialPoint): void => {
      stopInertia();
      const next = clampPrismCompanionPosition(
        {
          x: point.x / Math.max(1, window.innerWidth),
          y: point.y / Math.max(1, window.innerHeight),
        },
        liveBoundsRef.current,
      );
      positionRef.current = next;
      setPosition(next);
      persistPosition(next);
      presentAssistantConversation();
    },
    [persistPosition, presentAssistantConversation, stopInertia],
  );

  const toggleSoftSynthesisFromOrb = useCallback((): void => {
    if (!softSynthesisUi.expanded) inheritChatHomeDockPosition();
    setOpen(false);
    togglePrismSoftSynthesisExpanded();
  }, [inheritChatHomeDockPosition, softSynthesisUi.expanded]);

  const openSessionNote = useCallback((): void => {
    clearIdleDim();
    sessionNoteTypingStartedAtRef.current = null;
    setSessionNoteDraft("");
    setOpen(true);
    setSessionNoteStatus("");
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [clearIdleDim]);

  const saveSessionNote = useCallback(async (): Promise<void> => {
    const entry = sessionNoteDraft.trim();
    if (
      !sessionNoteContext ||
      !entry ||
      sessionNoteSaving ||
      sessionNoteSavingRef.current
    ) {
      return;
    }
    const savingContext = sessionNoteContext;
    sessionNoteSavingRef.current = true;
    setSessionNoteSaving(true);
    setSessionNoteStatus("Saving…");
    try {
      const response = await fetch("/api/session-notes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sessionNoteContext,
          entry,
          startedAt:
            sessionNoteTypingStartedAtRef.current ?? new Date().toISOString(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | AppletSessionNoteResponse
        | { error?: string };
      if (!response.ok || !("ok" in payload) || payload.ok !== true) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Prism could not save this session note.",
        );
      }
      if (
        sessionNoteContextRef.current?.surface === savingContext.surface &&
        sessionNoteContextRef.current.sessionId === savingContext.sessionId
      ) {
        if (payload.note) publishAppletSessionNoteSaved(payload.note);
        sessionNoteTypingStartedAtRef.current = null;
        setSessionNoteDraft("");
        setSessionNoteStatus("Note added to transcript");
        setOpen(false);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Prism could not save this session note.";
      setSessionNoteStatus(message);
      onError?.(message);
    } finally {
      sessionNoteSavingRef.current = false;
      setSessionNoteSaving(false);
    }
  }, [onError, sessionNoteContext, sessionNoteDraft, sessionNoteSaving]);

  const activatePrismConversation = useCallback(
    (): void => {
      if (sessionNoteContext) {
        if (openRef.current) setOpen(false);
        else openSessionNote();
        return;
      }
      if (openRef.current) setOpen(false);
      else openAndFocus();
    },
    [openAndFocus, openSessionNote, sessionNoteContext],
  );

  const resetPersonalNoteEditor = useCallback((): void => {
    setPersonalNoteId(null);
    setPersonalNoteTitle("");
    setPersonalNoteBody("");
    setPersonalNoteDeleteConfirm(false);
    setPersonalNoteStatus("");
    window.requestAnimationFrame(() => personalNoteTitleRef.current?.focus());
  }, []);

  const editPersonalNote = useCallback((note: PrismPersonalNote): void => {
    setPersonalNoteId(note.id);
    setPersonalNoteTitle(note.title);
    setPersonalNoteBody(note.body);
    setPersonalNoteDeleteConfirm(false);
    setPersonalNoteStatus("");
    window.requestAnimationFrame(() => personalNoteTitleRef.current?.focus());
  }, []);

  const loadPersonalNotes = useCallback(
    async (force = false): Promise<void> => {
      if (privateMode || (personalNotesLoadedRef.current && !force)) return;
      setPersonalNotesLoading(true);
      setPersonalNoteStatus("");
      try {
        const response = await fetch("/api/prism/notes", {
          credentials: "same-origin",
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (
          !response.ok ||
          !isRecord(payload) ||
          !Array.isArray(payload.notes) ||
          !payload.notes.every(isPrismPersonalNote)
        ) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Prism could not open your notes.",
          );
        }
        personalNotesLoadedRef.current = true;
        setPersonalNotes(payload.notes);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Prism could not open your notes.";
        setPersonalNoteStatus(message);
        onError?.(message);
      } finally {
        setPersonalNotesLoading(false);
      }
    },
    [onError, privateMode],
  );

  const savePersonalNote = useCallback(async (): Promise<void> => {
    const title = personalNoteTitle.trim();
    const body = personalNoteBody.trim();
    if (privateMode || personalNoteBusy || !title || !body) return;
    setPersonalNoteBusy(true);
    setPersonalNoteDeleteConfirm(false);
    setPersonalNoteStatus("Saving…");
    try {
      const response = await fetch(
        personalNoteId
          ? `/api/prism/notes/${encodeURIComponent(personalNoteId)}`
          : "/api/prism/notes",
        {
          method: personalNoteId ? "PUT" : "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, body }),
        },
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        !isRecord(payload) ||
        !isPrismPersonalNote(payload.note)
      ) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Prism could not save this note.",
        );
      }
      const savedNote = payload.note;
      personalNotesLoadedRef.current = true;
      setPersonalNotes((current) => [
        savedNote,
        ...current.filter((note) => note.id !== savedNote.id),
      ]);
      setPersonalNoteId(savedNote.id);
      setPersonalNoteTitle(savedNote.title);
      setPersonalNoteBody(savedNote.body);
      setPersonalNoteStatus(personalNoteId ? "Note updated" : "Note saved");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Prism could not save this note.";
      setPersonalNoteStatus(message);
      onError?.(message);
    } finally {
      setPersonalNoteBusy(false);
    }
  }, [
    onError,
    personalNoteBody,
    personalNoteBusy,
    personalNoteId,
    personalNoteTitle,
    privateMode,
  ]);

  const deletePersonalNote = useCallback(async (): Promise<void> => {
    if (!personalNoteId || privateMode || personalNoteBusy) return;
    setPersonalNoteBusy(true);
    setPersonalNoteStatus("Deleting…");
    try {
      const response = await fetch(
        `/api/prism/notes/${encodeURIComponent(personalNoteId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Prism could not delete this note.",
        );
      }
      setPersonalNotes((current) =>
        current.filter((note) => note.id !== personalNoteId),
      );
      resetPersonalNoteEditor();
      setPersonalNoteStatus("Note deleted");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Prism could not delete this note.";
      setPersonalNoteStatus(message);
      onError?.(message);
    } finally {
      setPersonalNoteBusy(false);
    }
  }, [
    onError,
    personalNoteBusy,
    personalNoteId,
    privateMode,
    resetPersonalNoteEditor,
  ]);

  const openSynthesisPrompt = useCallback(async (): Promise<void> => {
    const prompt = synthesisDraft.trim();
    if (!prompt || synthesisBusy || !onOpenImagePrompt) return;
    setSynthesisBusy(true);
    setSynthesisStatus("Opening Images…");
    try {
      await onOpenImagePrompt(prompt);
      setSynthesisDraft("");
      setSynthesisStatus("");
      setOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Prism could not open Images.";
      setSynthesisStatus(message);
      onError?.(message);
    } finally {
      setSynthesisBusy(false);
    }
  }, [onError, onOpenImagePrompt, synthesisBusy, synthesisDraft]);

  useEffect(() => {
    if (viewRequest.requestId === handledViewRequestRef.current) return;
    handledViewRequestRef.current = viewRequest.requestId;

    if (viewRequest.view === "synthesis" && softSynthesisActive) {
      if (!softSynthesisUi.expanded) inheritChatHomeDockPosition();
      setPanelView("synthesis");
      setOpen(false);
      setPrismSoftSynthesisExpanded(true);
      return;
    }

    setPrismSoftSynthesisExpanded(false);
    if (viewRequest.view === "chat") {
      openAndFocus();
      return;
    }

    inheritChatHomeDockPosition();
    clearIdleDim();
    setPanelView(viewRequest.view);
    setOpen(true);
    if (viewRequest.view === "notes") {
      void loadPersonalNotes();
      window.requestAnimationFrame(() => personalNoteTitleRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [
    clearIdleDim,
    inheritChatHomeDockPosition,
    loadPersonalNotes,
    openAndFocus,
    softSynthesisActive,
    softSynthesisUi.expanded,
    viewRequest,
  ]);

  const generatePrismUniversalInputCandidate = useCallback(
    async ({
      field,
      currentValue,
      rejectedValues,
      element,
      signal,
    }: PrismUniversalInputCandidateRequest): Promise<string> => {
      const target =
        element.dataset.prismRefractTargetKind === "bot-power"
          ? buildBotPowerRefractRequestTarget({
              botId: element.dataset.prismRefractBotId || null,
              botName: element.dataset.prismRefractBotName || "New bot",
              context: element.dataset.prismRefractContext || field.context,
              maxLength: field.maxLength,
            })
          : element.id === "bot-generator-prompt"
          ? buildBotGeneratorRefractRequestTarget({
              context: buildBotGeneratorBriefRefractContext({
                brief: currentValue,
              }),
              maxLength: field.maxLength ?? 2_000,
            })
          : { kind: "prism.input.text", surface: surfaceRef.current, ...field };
      const response = await fetch("/api/prism/refract", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target,
          currentValue,
          rejectedValues,
          ...(refractRouting ?? {}),
        }),
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as
        | PrismRefractResponse
        | { error?: string };
      if (
        !response.ok ||
        !("ok" in payload) ||
        payload.ok !== true ||
        typeof payload.value !== "string"
      ) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Prism could not fill ${field.label}.`,
        );
      }
      return payload.value;
    },
    [refractRouting],
  );

  useEffect(() => {
    if (sessionNoteContext) return;
    return installPrismUniversalInputTargets({
      generate: generatePrismUniversalInputCandidate,
    });
  }, [
    generatePrismUniversalInputCandidate,
    sessionNoteContext,
  ]);

  const restoreQueuedPrismRefractTarget = useCallback(
    (entry: QueuedPrismRefractRequest): void => {
      const { element } = entry;
      if (entry.originalState === undefined) {
        delete element.dataset.prismRefractState;
      } else {
        element.dataset.prismRefractState = entry.originalState;
      }
      if (entry.originalSheen === undefined) {
        delete element.dataset.prismRefractSheen;
      } else {
        element.dataset.prismRefractSheen = entry.originalSheen;
      }
      if (entry.originalAriaReadonly === null) {
        element.removeAttribute("aria-readonly");
      } else {
        element.setAttribute("aria-readonly", entry.originalAriaReadonly);
      }
    },
    [],
  );

  const clearPrismRefractQueue = useCallback((): void => {
    refractQueueAdvanceRunRef.current += 1;
    for (const entry of refractQueueRef.current) {
      restoreQueuedPrismRefractTarget(entry);
    }
    refractQueueRef.current = [];
  }, [restoreQueuedPrismRefractTarget]);

  const takeNextPrismRefractRequest = useCallback(
    (): PrismRefractRequest | null => {
      while (refractQueueRef.current.length > 0) {
        const entry = refractQueueRef.current.shift();
        if (!entry) return null;
        restoreQueuedPrismRefractTarget(entry);
        const registration = registeredPrismRefractTarget(entry.targetId);
        if (
          registration &&
          registration.target.kind !== "magic" &&
          !registration.target.disabled?.()
        ) {
          return { targetId: entry.targetId, invocation: entry.invocation };
        }
      }
      return null;
    },
    [restoreQueuedPrismRefractTarget],
  );

  const queuePrismRefractRequest = useCallback(
    (request: PrismRefractRequest): boolean => {
      const active = refractSessionRef.current;
      if (
        !active ||
        active.registration.target.kind === "magic" ||
        active.registration.target.id === request.targetId ||
        refractQueueRef.current.some(
          (entry) => entry.targetId === request.targetId,
        )
      ) {
        return false;
      }
      const registration = registeredPrismRefractTarget(request.targetId);
      if (
        !registration ||
        registration.target.kind === "magic" ||
        registration.target.disabled?.()
      ) {
        return false;
      }
      const { element } = registration;
      refractQueueRef.current.push({
        ...request,
        element,
        originalState: element.dataset.prismRefractState,
        originalSheen: element.dataset.prismRefractSheen,
        originalAriaReadonly: element.getAttribute("aria-readonly"),
      });
      element.dataset.prismRefractState = "queued";
      delete element.dataset.prismRefractSheen;
      element.setAttribute("aria-readonly", "true");
      const activeLabel = active.registration.target.label;
      const queuedLabel = registration.target.label;
      setRefractStatus(
        `${queuedLabel} is queued after ${activeLabel}.`,
      );
      return true;
    },
    [],
  );

  const refreshQueuedPrismRefractTargets = useCallback((): void => {
    for (const entry of refractQueueRef.current) {
      const registration = registeredPrismRefractTarget(entry.targetId);
      if (
        !registration ||
        registration.target.kind === "magic" ||
        registration.element === entry.element
      ) {
        continue;
      }
      restoreQueuedPrismRefractTarget(entry);
      const nextElement = registration.element;
      entry.element = nextElement;
      entry.originalState = nextElement.dataset.prismRefractState;
      entry.originalSheen = nextElement.dataset.prismRefractSheen;
      entry.originalAriaReadonly = nextElement.getAttribute("aria-readonly");
      nextElement.dataset.prismRefractState = "queued";
      delete nextElement.dataset.prismRefractSheen;
      nextElement.setAttribute("aria-readonly", "true");
    }
  }, [restoreQueuedPrismRefractTarget]);

  const markRefractTarget = useCallback(
    (session: PrismRefractSession, phase: PrismRefractPhase): void => {
      const { element } = session.registration;
      element.dataset.prismRefractState = phase;
      if (phase === "generating" && session.registration.target.kind !== "magic") {
        element.dataset.prismRefractSheen = "true";
      } else {
        delete element.dataset.prismRefractSheen;
      }
      element.setAttribute(
        "aria-busy",
        phase === "generating" ? "true" : "false",
      );
      if (session.registration.target.kind !== "magic") {
        element.setAttribute("aria-readonly", "true");
      }
    },
    [],
  );

  const releasePrismRefract = useCallback(
    (
      restoreOriginal: boolean,
      options: { preserveQueue?: boolean } = {},
    ): void => {
      const session = refractSessionRef.current;
      refractRunRef.current += 1;
      refractAbortRef.current?.abort();
      refractAbortRef.current = null;
      if (session) {
        const { element, target } = session.registration;
        if (restoreOriginal && target.kind !== "magic") {
          target.preview(session.originalValue);
        }
        delete element.dataset.prismRefractState;
        delete element.dataset.prismRefractSheen;
        if (session.originalAriaBusy === null) {
          element.removeAttribute("aria-busy");
        } else {
          element.setAttribute("aria-busy", session.originalAriaBusy);
        }
        if (session.originalAriaReadonly === null) {
          element.removeAttribute("aria-readonly");
        } else {
          element.setAttribute("aria-readonly", session.originalAriaReadonly);
        }
      }
      document.documentElement.removeAttribute(PRISM_REFRACT_CURSOR_ATTRIBUTE);
      anchorRef.current?.removeAttribute("data-refracting");
      if (!options.preserveQueue) clearPrismRefractQueue();
      updateRefractSession(null);
      setRefractPrompt("");
      setRefractStatus("");
      scheduleIdleDim();
      if (
        session &&
        refractTutorialRunRef.current &&
        refractTutorialStageRef.current === "settle"
      ) {
        refractTutorialRunRef.current = false;
        refractTutorialVisibleRef.current = false;
        setRefractTutorialVisible(false);
        delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
        refractTutorialTargetRef.current = null;
        onRefractTutorialCompleteRef.current?.();
      }
    },
    [clearPrismRefractQueue, scheduleIdleDim, updateRefractSession],
  );

  useLayoutEffect(() => {
    resetPrismWield();
    releasePrismRefract(true);
  }, [releasePrismRefract, resetPrismWield, surfaceScope]);

  useEffect(() => {
    delete wieldTutorialTargetRef.current?.dataset.prismWieldTutorial;
    wieldTutorialTargetRef.current = null;
    wieldTutorialRunRef.current = false;
    wieldTutorialVisibleRef.current = false;
    setWieldTutorialVisible(false);
    updateWieldTutorialStage("hold");
    if (!wieldTutorialActive) return;
    const revealWhenReady = (): boolean => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-prism-refract-id]"),
      ).find((element) => {
        const targetId = element.dataset.prismRefractId;
        const registration = targetId
          ? registeredPrismRefractTarget(targetId)
          : null;
        return (
          registration?.element === element &&
          !registration.target.disabled?.()
        );
      });
      if (!target) return false;
      wieldTutorialTargetRef.current = target;
      target.dataset.prismWieldTutorial = "true";
      clearIdleDim();
      wieldTutorialVisibleRef.current = true;
      setWieldTutorialVisible(true);
      return true;
    };
    if (revealWhenReady()) {
      return () => {
        wieldTutorialVisibleRef.current = false;
        delete wieldTutorialTargetRef.current?.dataset.prismWieldTutorial;
        wieldTutorialTargetRef.current = null;
      };
    }
    const observer = new MutationObserver(() => {
      if (revealWhenReady()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      wieldTutorialVisibleRef.current = false;
      delete wieldTutorialTargetRef.current?.dataset.prismWieldTutorial;
      wieldTutorialTargetRef.current = null;
    };
  }, [clearIdleDim, updateWieldTutorialStage, wieldTutorialActive]);

  useEffect(() => {
    delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
    refractTutorialTargetRef.current = null;
    refractTutorialRunRef.current = false;
    refractTutorialVisibleRef.current = false;
    setRefractTutorialVisible(false);
    updateRefractTutorialStage("summon");
    if (
      wieldTutorialActive ||
      !refractTutorialActive ||
      surface.surfaceId !== "signal"
    ) {
      return;
    }
    const revealWhenReady = (): boolean => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-prism-refract-id]"),
      ).find((element) => {
        const targetId = element.dataset.prismRefractId;
        const registration = targetId
          ? registeredPrismRefractTarget(targetId)
          : null;
        return (
          registration?.element === element &&
          !registration.target.disabled?.()
        );
      });
      if (!target) return false;
      refractTutorialTargetRef.current = target;
      target.dataset.prismRefractTutorial = "true";
      clearIdleDim();
      refractTutorialVisibleRef.current = true;
      setRefractTutorialVisible(true);
      return true;
    };
    if (revealWhenReady()) {
      return () => {
        refractTutorialVisibleRef.current = false;
        delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
        refractTutorialTargetRef.current = null;
      };
    }
    const observer = new MutationObserver(() => {
      if (revealWhenReady()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      refractTutorialVisibleRef.current = false;
      delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
      refractTutorialTargetRef.current = null;
    };
  }, [
    clearIdleDim,
    refractTutorialActive,
    surface.surfaceId,
    updateRefractTutorialStage,
    wieldTutorialActive,
  ]);

  const generatePrismRefractCandidate = useCallback(
    (session: PrismRefractSession): void => {
      const { target, element } = session.registration;
      if (target.kind === "magic") return;
      const rejectedValues = [...session.rejectedValues];
      const generatingSession = { ...session, phase: "generating" as const };
      markRefractTarget(generatingSession, "generating");
      updateRefractSession(generatingSession);
      const queuedCount = refractQueueRef.current.length;
      setRefractStatus(
        queuedCount > 0
          ? `Prism is refracting ${target.label}. ${queuedCount} more queued. Keep working elsewhere, or click the rainbow sheen to cancel.`
          : `Prism is refracting ${target.label}. Keep working elsewhere, or click the rainbow sheen to cancel.`,
      );

      refractAbortRef.current?.abort();
      const controller = new AbortController();
      refractAbortRef.current = controller;
      const runId = ++refractRunRef.current;
      const requestOwnershipIsCurrent = (): boolean => {
        const current = registeredPrismRefractTarget(target.id);
        return prismRefractResultOwnershipIsCurrent({
          aborted: controller.signal.aborted,
          requestRunId: runId,
          currentRunId: refractRunRef.current,
          expectedTargetId: target.id,
          currentTargetId: current?.target.id ?? null,
          expectedElement: element,
          currentElement: current?.element ?? null,
        });
      };

      if (target.kind === "choice") {
        void (async () => {
          try {
            await nextPrismRefractPaint(controller.signal);
            if (!requestOwnershipIsCurrent()) return;
            const choice = nextPrismRefractChoice(
              target.choices(),
              target.read(),
              rejectedValues,
            );
            if (!choice) {
              const errorSession = {
                ...generatingSession,
                phase: "error" as const,
              };
              target.preview(session.originalValue);
              markRefractTarget(errorSession, "error");
              updateRefractSession(errorSession);
              setRefractStatus(`There is no other valid ${target.label} choice.`);
              return;
            }
            target.preview(choice.value);
            const previewPainted = await waitForPrismRefractPreviewPaint({
              element,
              kind: "choice",
              value: choice.value,
              signal: controller.signal,
            });
            if (!previewPainted || !requestOwnershipIsCurrent()) {
              return;
            }
            const readySession = {
              ...generatingSession,
              phase: "ready" as const,
              candidateValue: choice.value,
            };
            markRefractTarget(readySession, "ready");
            updateRefractSession(readySession);
            setRefractStatus(
              `${choice.label} is ready. Click away, Enter, or Tab keeps it. Space rerolls. Escape restores.`,
            );
          } catch (error) {
            if (!requestOwnershipIsCurrent()) return;
            target.preview(session.originalValue);
            const errorSession = {
              ...generatingSession,
              phase: "error" as const,
              candidateValue: null,
            };
            markRefractTarget(errorSession, "error");
            updateRefractSession(errorSession);
            const message =
              error instanceof Error
                ? error.message
                : `Prism could not refract ${target.label}.`;
            setRefractStatus(
              `${message} Space retries and Escape restores the field.`,
            );
            onError?.(message);
          }
        })();
        return;
      }

      void (async () => {
        try {
          await nextPrismRefractPaint(controller.signal);
          if (!requestOwnershipIsCurrent()) {
            return;
          }
          // Foreground field Refract follows the globally selected provider
          // and model. Its in-field sheen is the complete loading treatment;
          // local cold starts must never summon the fullscreen model warmer.
          const rawValue = await runPrismRefractGenerationWithTimeout({
            signal: controller.signal,
            run: (generationSignal) => target.generate({
              currentValue: target.read(),
              rejectedValues,
              signal: generationSignal,
            }),
          });
          if (!requestOwnershipIsCurrent()) {
            return;
          }
          const value = rawValue.trim();
          if (
            !value ||
            rejectedValues.some(
              (rejected) =>
                rejected.trim().toLocaleLowerCase() ===
                value.toLocaleLowerCase(),
            )
          ) {
            throw new Error("Prism returned the same idea.");
          }
          target.preview(value);
          const previewPainted = await waitForPrismRefractPreviewPaint({
            element,
            kind: "field",
            value,
            signal: controller.signal,
          });
          if (!previewPainted) {
            throw new Error(`Prism could not display the refracted ${target.label}.`);
          }
          if (!requestOwnershipIsCurrent()) {
            return;
          }
          const readySession = {
            ...generatingSession,
            phase: "ready" as const,
            candidateValue: value,
          };
          markRefractTarget(readySession, "ready");
          updateRefractSession(readySession);
          setRefractStatus(
            `${target.label} is ready. Click away, Enter, or Tab keeps it. Space rerolls. Escape restores.`,
          );
        } catch (error) {
          if (!requestOwnershipIsCurrent()) {
            return;
          }
          target.preview(session.originalValue);
          const errorSession = {
            ...generatingSession,
            phase: "error" as const,
            candidateValue: null,
          };
          markRefractTarget(errorSession, "error");
          updateRefractSession(errorSession);
          const message =
            error instanceof Error
              ? error.message
              : `Prism could not refract ${target.label}.`;
          setRefractStatus(
            `${message} Space retries and Escape restores the field.`,
          );
          onError?.(message);
        }
      })();
    },
    [
      markRefractTarget,
      onError,
      updateRefractSession,
    ],
  );

  const beginPrismRefract = useCallback(
    (
      targetId: string,
      invocation: PrismRefractInvocation,
      options: { preserveQueue?: boolean } = {},
    ): void => {
      const registration = registeredPrismRefractTarget(targetId);
      if (!registration || registration.target.disabled?.()) return;
      if (
        refractTutorialVisible &&
        refractTutorialStageRef.current === "summon"
      ) {
        refractTutorialRunRef.current = true;
        updateRefractTutorialStage("reroll");
      }
      releasePrismRefract(true, options);
      // Refract is an active interaction, even while its direction prompt is
      // waiting on the player. Cancel any idle presence timer that the release
      // above scheduled so the prompt cannot disappear mid-entry.
      clearIdleDim();
      setOpen(false);
      cancelSpeech(true);
      stopInertia(false);
      const rect = registration.element.getBoundingClientRect();
      const target = registration.target;
      const originalValue = target.kind === "magic" ? "" : target.read();
      const session: PrismRefractSession = {
        registration,
        invocation,
        phase: target.kind === "magic" ? "prompting" : "generating",
        targetWidth: rect.width,
        targetCenter: {
          x: Math.min(
            1,
            Math.max(0, (rect.left + rect.width / 2) / window.innerWidth),
          ),
          y: Math.min(
            1,
            Math.max(0, (rect.top + rect.height / 2) / window.innerHeight),
          ),
        },
        originalValue,
        candidateValue: null,
        rejectedValues: originalValue ? [originalValue] : [],
        originalAriaBusy: registration.element.getAttribute("aria-busy"),
        originalAriaReadonly:
          registration.element.getAttribute("aria-readonly"),
      };
      if (target.kind === "magic") {
        registration.element.focus({ preventScroll: true });
      }
      markRefractTarget(session, session.phase);
      updateRefractSession(session);
      setRefractPrompt("");
      setRefractStatus(
        `Prism is refracting ${target.label}. Keep working elsewhere, or click the rainbow sheen to cancel.`,
      );
      if (invocation === "focused-shortcut") {
        document.documentElement.setAttribute(
          PRISM_REFRACT_CURSOR_ATTRIBUTE,
          "true",
        );
      }
      playPrismCompanionGlassTap();
      if (target.kind === "magic") {
        document.documentElement.removeAttribute(PRISM_REFRACT_CURSOR_ATTRIBUTE);
        setRefractStatus(
          `Tell Prism how to shape ${target.label}, then press Enter.`,
        );
        window.requestAnimationFrame(() => refractPromptRef.current?.focus());
      } else {
        generatePrismRefractCandidate(session);
      }
    },
    [
      cancelSpeech,
      clearIdleDim,
      generatePrismRefractCandidate,
      markRefractTarget,
      releasePrismRefract,
      stopInertia,
      updateRefractSession,
      updateRefractTutorialStage,
      refractTutorialVisible,
    ],
  );

  const acceptPrismRefract = useCallback((): void => {
    const session = refractSessionRef.current;
    if (
      !session ||
      session.registration.target.kind === "magic" ||
      session.phase !== "ready" ||
      session.candidateValue === null
    ) {
      return;
    }
    // The queue transition owns committing this candidate. A click or keypress
    // in the single paint frame before it advances must not discard the rest.
    if (refractQueueRef.current.length > 0) return;
    const { target } = session.registration;
    const candidate = session.candidateValue;
    releasePrismRefract(false);
    void Promise.resolve(target.accept(candidate)).catch((error) => {
      onError?.(
        error instanceof Error
          ? error.message
          : `Prism could not keep ${target.label}.`,
      );
    });
  }, [onError, releasePrismRefract]);

  const rerollPrismRefract = useCallback((): void => {
    const session = refractSessionRef.current;
    if (
      !session ||
      session.registration.target.kind === "magic" ||
      (session.phase !== "ready" && session.phase !== "error")
    ) {
      return;
    }
    if (
      refractTutorialRunRef.current &&
      refractTutorialStageRef.current === "reroll"
    ) {
      updateRefractTutorialStage("settle");
    }
    const rejectedValues = [
      ...session.rejectedValues,
      ...(session.candidateValue ? [session.candidateValue] : []),
    ].slice(-8);
    generatePrismRefractCandidate({
      ...session,
      candidateValue: null,
      rejectedValues,
    });
  }, [
    generatePrismRefractCandidate,
    updateRefractTutorialStage,
  ]);

  const submitPrismRefractMagic = useCallback((): void => {
    const session = refractSessionRef.current;
    if (
      !session ||
      session.phase !== "prompting" ||
      session.registration.target.kind !== "magic"
    ) {
      return;
    }
    const target = session.registration.target;
    const direction = refractPrompt.trim();
    releasePrismRefract(false);
    refractMagicHandoffFrameRef.current = window.requestAnimationFrame(() => {
      refractMagicHandoffFrameRef.current = null;
      void (async () => {
        try {
          if (refractionGate && !target.ownsPresentation) {
            // Magic Refract actions own their normal request routing. The
            // presentation layer must not prewarm or substitute a local/Aux
            // model when the navbar is set to another provider or model.
            await refractionGate.withRefractionLoader({
              loader: {
                title: target.label,
                detail: "Prism is shaping this Wield action with your navbar routing.",
                stepLabel: "Refracting",
              },
              work: async () => {
                await Promise.resolve(target.run(direction));
              },
            });
            return;
          }
          await Promise.resolve(target.run(direction));
        } catch (error) {
          onError?.(
            error instanceof Error
              ? error.message
              : `Prism could not start ${target.label}.`,
          );
        }
      })();
    });
  }, [
    onError,
    refractPrompt,
    refractionGate,
    releasePrismRefract,
  ]);

  const dismissRefractTutorial = useCallback(
    (resolution: "skip" | "remind"): void => {
      refractTutorialRunRef.current = false;
      releasePrismRefract(true);
      refractTutorialVisibleRef.current = false;
      setRefractTutorialVisible(false);
      delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
      refractTutorialTargetRef.current = null;
      if (resolution === "skip") onRefractTutorialSkip?.();
      else onRefractTutorialRemind?.();
    },
    [
      onRefractTutorialRemind,
      onRefractTutorialSkip,
      releasePrismRefract,
    ],
  );

  const dismissWieldTutorial = useCallback(
    (resolution: "skip" | "remind"): void => {
      resetPrismWield();
      wieldTutorialRunRef.current = false;
      wieldTutorialVisibleRef.current = false;
      setWieldTutorialVisible(false);
      delete wieldTutorialTargetRef.current?.dataset.prismWieldTutorial;
      wieldTutorialTargetRef.current = null;
      if (resolution === "skip") onWieldTutorialSkip?.();
      else onWieldTutorialRemind?.();
    },
    [
      onWieldTutorialRemind,
      onWieldTutorialSkip,
      resetPrismWield,
    ],
  );

  useEffect(
    () => {
      if (sessionNoteContext) return;
      return subscribePrismRefractRequests(({ targetId, invocation }) => {
        const active = refractSessionRef.current;
        if (!active) {
          beginPrismRefract(targetId, invocation);
          return;
        }
        if (
          active.registration.target.id !== targetId &&
          refractQueueRef.current.length > 0
        ) {
          queuePrismRefractRequest({ targetId, invocation });
          return;
        }
        const decision = prismRefractModifierClickDecision({
          activeTargetId: active.registration.target.id,
          activeTargetKind: active.registration.target.kind,
          clickedTargetId: targetId,
          canAccept:
            active.phase === "ready" && active.candidateValue !== null,
        });
        if (decision === "cancel") {
          releasePrismRefract(true);
          return;
        }
        if (decision === "queue") {
          queuePrismRefractRequest({ targetId, invocation });
          return;
        }
        if (decision === "accept" || decision === "accept-and-begin") {
          acceptPrismRefract();
        }
        if (decision === "begin" || decision === "accept-and-begin") {
          beginPrismRefract(targetId, invocation);
        }
      });
    },
    [
      acceptPrismRefract,
      beginPrismRefract,
      queuePrismRefractRequest,
      releasePrismRefract,
      sessionNoteContext,
    ],
  );

  useEffect(() => {
    if (!refractSession) return;
    const platform = navigator.platform;
    const revealCursor = (): void => {
      document.documentElement.removeAttribute(PRISM_REFRACT_CURSOR_ATTRIBUTE);
    };
    const handlePointerDown = (event: PointerEvent): void => {
      const session = refractSessionRef.current;
      if (!session) return;
      const eventTarget = event.target;
      if (
        eventTarget instanceof Node &&
        refractPromptRef.current?.form?.contains(eventTarget)
      ) {
        return;
      }
      if (
        eventTarget instanceof Element &&
        eventTarget.closest('[data-prism-refract-tutorial-card="true"]')
      ) {
        return;
      }
      const shiftedRefractTarget =
        event.button === 0 &&
        isPrismCompanionModifierHeld(event, platform) &&
        eventTarget instanceof Element
          ? eventTarget.closest<HTMLElement>(
              `[${PRISM_REFRACT_TARGET_ATTRIBUTE}]`,
            )
          : null;
      const shiftedRefractTargetId = shiftedRefractTarget?.getAttribute(
        PRISM_REFRACT_TARGET_ATTRIBUTE,
      );
      const shiftedRegistration = shiftedRefractTargetId
        ? registeredPrismRefractTarget(shiftedRefractTargetId)
        : null;
      if (
        shiftedRegistration?.element === shiftedRefractTarget &&
        !shiftedRegistration.target.disabled?.()
      ) {
        requestPrismRefract(shiftedRegistration.target.id, "modifier-click");
        wieldSuppressedClickRef.current = shiftedRegistration.element;
        if (wieldSuppressedClickTimerRef.current !== null) {
          window.clearTimeout(wieldSuppressedClickTimerRef.current);
        }
        wieldSuppressedClickTimerRef.current = window.setTimeout(() => {
          wieldSuppressedClickRef.current = null;
          wieldSuppressedClickTimerRef.current = null;
        }, 1_500);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const queuedTarget =
        eventTarget instanceof Element
          ? eventTarget.closest<HTMLElement>(
              '[data-prism-refract-state="queued"]',
            )
          : null;
      if (queuedTarget) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        eventTarget instanceof Node &&
        session.registration.element.contains(eventTarget)
      ) {
        if (session.registration.target.kind !== "magic") {
          event.preventDefault();
          event.stopPropagation();
          if (event.button === 0) {
            if (session.phase === "generating" || session.phase === "error") {
              releasePrismRefract(true);
            } else if (session.phase === "ready") {
              acceptPrismRefract();
            }
          }
        }
        return;
      }
      if (
        session.registration.target.kind !== "magic" &&
        session.phase === "generating"
      ) {
        // Refraction belongs to its captured field, not global focus. Let the
        // player click, focus, and type elsewhere while this request runs.
        return;
      }
      const nextEditableControl =
        event.button === 0 && eventTarget instanceof Element
          ? eventTarget.closest<
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement
              | HTMLElement
            >(
              'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
            )
          : null;
      const nextEditableControlDisabled =
        nextEditableControl instanceof HTMLInputElement ||
        nextEditableControl instanceof HTMLTextAreaElement ||
        nextEditableControl instanceof HTMLSelectElement
          ? nextEditableControl.disabled
          : nextEditableControl?.getAttribute("aria-disabled") === "true";
      if (
        nextEditableControl &&
        !nextEditableControlDisabled &&
        session.registration.target.kind !== "magic" &&
        session.phase === "ready" &&
        session.candidateValue !== null
      ) {
        // Keep the settled candidate without swallowing the pointer event so
        // the next control receives its normal click and focus behavior.
        acceptPrismRefract();
        return;
      }
      // Clicking off the captured field affirms a settled draft; Escape still restores.
      if (
        session.registration.target.kind !== "magic" &&
        session.phase === "ready" &&
        session.candidateValue !== null
      ) {
        acceptPrismRefract();
        return;
      }
      if (session.registration.target.kind === "magic") {
        releasePrismRefract(true);
      }
    };
    const preventCapturedFieldClick = (event: MouseEvent): void => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;
      const blockedTarget = eventTarget.closest<HTMLElement>(
        '[data-prism-refract-state="generating"], [data-prism-refract-state="queued"]',
      );
      if (!blockedTarget) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const preventCapturedFieldInput = (event: InputEvent): void => {
      const session = refractSessionRef.current;
      const eventTarget = event.target;
      const queuedTarget =
        eventTarget instanceof Element
          ? eventTarget.closest<HTMLElement>(
              '[data-prism-refract-state="queued"]',
            )
          : null;
      if (
        !queuedTarget &&
        (!session ||
          session.registration.target.kind === "magic" ||
          !(eventTarget instanceof Node) ||
          !session.registration.element.contains(eventTarget))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const preventCapturedFieldFocus = (event: FocusEvent): void => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof HTMLElement)) return;
      const blockedTarget = eventTarget.closest<HTMLElement>(
        '[data-prism-refract-state="queued"]',
      );
      if (!blockedTarget) return;
      eventTarget.blur();
      event.stopPropagation();
    };
    const restoreIfTargetUnmounts = new MutationObserver(() => {
      refreshQueuedPrismRefractTargets();
      const currentSession = refractSessionRef.current;
      if (currentSession && !currentSession.registration.element.isConnected) {
        releasePrismRefract(true);
      }
    });
    restoreIfTargetUnmounts.observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("pointermove", revealCursor, {
      capture: true,
      once: true,
    });
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", preventCapturedFieldClick, true);
    window.addEventListener("beforeinput", preventCapturedFieldInput, true);
    window.addEventListener("focusin", preventCapturedFieldFocus, true);
    return () => {
      restoreIfTargetUnmounts.disconnect();
      window.removeEventListener("pointermove", revealCursor, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", preventCapturedFieldClick, true);
      window.removeEventListener(
        "beforeinput",
        preventCapturedFieldInput,
        true,
      );
      window.removeEventListener("focusin", preventCapturedFieldFocus, true);
    };
  }, [
    acceptPrismRefract,
    refreshQueuedPrismRefractTargets,
    refractSession,
    releasePrismRefract,
  ]);

  useEffect(() => {
    if (
      !refractSession ||
      refractSession.phase !== "ready" ||
      refractSession.candidateValue === null ||
      refractQueueRef.current.length === 0
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const current = refractSessionRef.current;
      if (
        !current ||
        current.phase !== "ready" ||
        current.candidateValue === null ||
        current.registration.target.kind === "magic"
      ) {
        return;
      }
      const next = takeNextPrismRefractRequest();
      if (!next) return;
      const advanceRun = ++refractQueueAdvanceRunRef.current;
      const { target } = current.registration;
      const candidate = current.candidateValue;
      releasePrismRefract(false, { preserveQueue: true });
      void Promise.resolve(target.accept(candidate))
        .then(() => {
          if (advanceRun !== refractQueueAdvanceRunRef.current) return;
          refreshQueuedPrismRefractTargets();
          beginPrismRefract(next.targetId, next.invocation, {
            preserveQueue: true,
          });
        })
        .catch((error) => {
          if (advanceRun !== refractQueueAdvanceRunRef.current) return;
          clearPrismRefractQueue();
          onError?.(
            error instanceof Error
              ? error.message
              : `Prism could not keep ${target.label}.`,
          );
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    beginPrismRefract,
    clearPrismRefractQueue,
    onError,
    refreshQueuedPrismRefractTargets,
    refractSession,
    releasePrismRefract,
    takeNextPrismRefractRequest,
  ]);

  useEffect(() => {
    return () => {
      refractRunRef.current += 1;
      refractAbortRef.current?.abort();
      if (refractMagicHandoffFrameRef.current !== null) {
        window.cancelAnimationFrame(refractMagicHandoffFrameRef.current);
      }
      const session = refractSessionRef.current;
      if (session) {
        const { element, target } = session.registration;
        if (target.kind !== "magic") target.preview(session.originalValue);
        delete element.dataset.prismRefractState;
        delete element.dataset.prismRefractSheen;
        if (session.originalAriaBusy === null) {
          element.removeAttribute("aria-busy");
        } else {
          element.setAttribute("aria-busy", session.originalAriaBusy);
        }
        if (session.originalAriaReadonly === null) {
          element.removeAttribute("aria-readonly");
        } else {
          element.setAttribute(
            "aria-readonly",
            session.originalAriaReadonly,
          );
        }
      }
      document.documentElement.removeAttribute(PRISM_REFRACT_CURSOR_ATTRIBUTE);
      clearPrismRefractQueue();
    };
  }, [clearPrismRefractQueue]);

  const setSpeechPreference = useCallback(
    (enabled: boolean): void => {
      setSpeechEnabled(enabled);
      try {
        window.localStorage.setItem(
          prismCompanionSpeechStorageKey(accountKey),
          String(enabled),
        );
      } catch {
        // Device-local voice preference is disposable.
      }
      if (!enabled) cancelSpeech(true);
    },
    [accountKey, cancelSpeech],
  );

  const speakResponse = useCallback(
    (
      message: PrismCompanionMessage,
      provider: EphemeralChatResolvedProvider,
    ): void => {
      if (!speechEnabled || !onSpeak) {
        setSpeechReveal(null);
        return;
      }

      cancelSpeech(false);
      const runId = speechRunRef.current;
      const controller = new AbortController();
      speechAbortRef.current = controller;
      setSpeechReveal(
        preparePrismCompanionSpeechReveal(message.id, message.content),
      );
      let playbackStarted = false;

      void Promise.resolve(
        onSpeak(message.content, provider, {
          signal: controller.signal,
          onPlaybackStart: (durationMs, alignment) => {
            if (
              controller.signal.aborted ||
              speechRunRef.current !== runId
            ) {
              return;
            }
            playbackStarted = true;
            speechPlaybackActiveRef.current = true;
            if (durationMs == null || durationMs <= 0) return;
            setSpeechReveal((current) =>
              current?.messageId === message.id
                ? startPrismCompanionSpeechReveal(
                    current,
                    durationMs,
                    alignment,
                  )
                : current,
            );
          },
          onPlaybackProgress: (elapsedMs, durationMs, alignment) => {
            if (
              controller.signal.aborted ||
              speechRunRef.current !== runId
            ) {
              return;
            }
            playbackStarted = true;
            speechPlaybackActiveRef.current = true;
            setSpeechReveal((current) => {
              if (!current || current.messageId !== message.id) return current;
              const started =
                current.timeline.phase === "preparing"
                  ? startPrismCompanionSpeechReveal(
                      current,
                      durationMs,
                      alignment,
                    )
                  : current;
              return progressPrismCompanionSpeechReveal(started, elapsedMs);
            });
          },
        }),
      )
        .then((played) => {
          if (
            controller.signal.aborted ||
            speechRunRef.current !== runId
          ) {
            return;
          }
          speechAbortRef.current = null;
          speechPlaybackActiveRef.current = false;
          setSpeechReveal((current) => {
            if (!current || current.messageId !== message.id) return current;
            return played && playbackStarted
              ? finishPrismCompanionSpeechReveal(current)
              : null;
          });
        })
        .catch(() => {
          if (
            controller.signal.aborted ||
            speechRunRef.current !== runId
          ) {
            return;
          }
          speechAbortRef.current = null;
          speechPlaybackActiveRef.current = false;
          setSpeechReveal(null);
        });
    },
    [cancelSpeech, onSpeak, speechEnabled],
  );

  useEffect(() => {
    if (!open || !dismissOnExternalInteraction) return;
    const dismissIfExternal = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && anchorRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", dismissIfExternal, true);
    window.addEventListener("focusin", dismissIfExternal, true);
    return () => {
      window.removeEventListener("pointerdown", dismissIfExternal, true);
      window.removeEventListener("focusin", dismissIfExternal, true);
    };
  }, [dismissOnExternalInteraction, open]);

  useEffect(() => {
    const platform = navigator.platform;
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      const pointer = { x: event.clientX, y: event.clientY };
      wieldLastPointerRef.current = pointer;
      const current = wieldStateRef.current;
      if (current.phase !== "pending" && current.phase !== "following") return;
      if (!prismWieldCanArm(prismWieldAvailabilityRef.current)) {
        resetPrismWield(false, false, { skipCursorDock: true });
        return;
      }
      if (!isPrismCompanionModifierHeld(event, platform)) {
        resetPrismWield();
        return;
      }
      const next = transitionPrismWield(current, {
        type: "pointer-move",
        epoch: current.epoch,
        pointer,
      });
      wieldStateRef.current = next;
      if (current.phase === "pending" && next.phase === "following") {
        presentPrismWield(next);
      } else if (next.phase === "following") {
        const sample = wieldVelocitySampleRef.current;
        if (sample) {
          samplePrismCompanionDragVelocity(
            sample,
            pointer.x,
            pointer.y,
            event.timeStamp || performance.now(),
          );
        } else {
          wieldVelocitySampleRef.current = createPrismCompanionDragVelocitySample(
            pointer.x,
            pointer.y,
            event.timeStamp || performance.now(),
          );
        }
        schedulePrismWieldFrame();
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      const current = wieldStateRef.current;
      if (
        current.phase !== "following" ||
        event.pointerType === "touch" ||
        event.button !== 0
      ) {
        return;
      }
      if (!isPrismCompanionModifierHeld(event, platform)) {
        resetPrismWield();
        return;
      }
      if (sessionNoteContextRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const targetId = prismRefractTargetIdAtPoint(
        event.clientX,
        event.clientY,
      );
      const registration = targetId
        ? registeredPrismRefractTarget(targetId)
        : null;
      if (!targetId || !registration || registration.target.disabled?.()) {
        return;
      }

      const captured = transitionPrismWield(current, {
        type: "capture",
        epoch: current.epoch,
        pointer: { x: event.clientX, y: event.clientY },
      });
      if (captured.phase !== "captured") return;
      wieldStateRef.current = captured;
      wieldSuppressedClickRef.current = registration.element;
      let started = false;
      try {
        started = requestPrismRefract(targetId, "wield-click");
      } catch {
        started = false;
      }
      if (!started) {
        wieldSuppressedClickRef.current = null;
        resetPrismWield();
        return;
      }
      // The captured field now owns Prism's visual. Retire the free cursor-orb
      // transform immediately—even while the modifier remains held—so the
      // triangle can travel to the field center and later modifier-clicks can
      // join the active Refract queue.
      resetPrismWield(true, false, { skipCursorDock: true });
      event.preventDefault();
      event.stopPropagation();
      if (wieldSuppressedClickTimerRef.current !== null) {
        window.clearTimeout(wieldSuppressedClickTimerRef.current);
      }
      wieldSuppressedClickTimerRef.current = window.setTimeout(() => {
        wieldSuppressedClickRef.current = null;
        wieldSuppressedClickTimerRef.current = null;
      }, 1_500);
    };
    const suppressCapturedNativeClick = (event: MouseEvent): void => {
      const suppressedTarget = wieldSuppressedClickRef.current;
      if (!suppressedTarget) return;
      const eventTarget = event.target;
      if (
        eventTarget instanceof Node &&
        suppressedTarget.contains(eventTarget)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
      wieldSuppressedClickRef.current = null;
      if (wieldSuppressedClickTimerRef.current !== null) {
        window.clearTimeout(wieldSuppressedClickTimerRef.current);
        wieldSuppressedClickTimerRef.current = null;
      }
    };
    const restoreOnVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") resetPrismWield();
    };
    const restoreOnBlur = (): void => resetPrismWield();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const restoreOnReducedMotionChange = (): void => resetPrismWield();
    const restoreIfHoverTargetUnmounts = new MutationObserver(() => {
      const hoverTarget = wieldHoverTargetRef.current;
      if (hoverTarget && !hoverTarget.isConnected) resetPrismWield();
    });
    restoreIfHoverTargetUnmounts.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("click", suppressCapturedNativeClick, true);
    window.addEventListener("blur", restoreOnBlur);
    document.addEventListener("visibilitychange", restoreOnVisibilityChange);
    reducedMotion.addEventListener("change", restoreOnReducedMotionChange);
    return () => {
      restoreIfHoverTargetUnmounts.disconnect();
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("click", suppressCapturedNativeClick, true);
      window.removeEventListener("blur", restoreOnBlur);
      document.removeEventListener(
        "visibilitychange",
        restoreOnVisibilityChange,
      );
      reducedMotion.removeEventListener(
        "change",
        restoreOnReducedMotionChange,
      );
      resetPrismWield();
    };
  }, [
    presentPrismWield,
    resetPrismWield,
    schedulePrismWieldFrame,
  ]);

  useEffect(() => {
    const platform = navigator.platform;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (companionSuppressed) {
        if (
          !event.repeat &&
          !keyboardShortcutEventIsRecording(event) &&
          keyboardShortcutMatchesEvent(keyboardShortcut, event)
        ) {
          event.preventDefault();
          event.stopPropagation();
          playPrismHotkeyInaccessibleSfx();
        }
        return;
      }
      if (keyboardShortcutEventIsRecording(event)) return;
      if (sessionNoteContext) {
        if (keyboardShortcutMatchesEvent(keyboardShortcut, event)) {
          event.preventDefault();
          event.stopPropagation();
          activatePrismConversation();
          return;
        }
        if (
          isPrismCompanionModifierKey(event, platform)
        ) {
          if (event.repeat || wieldStateRef.current.phase !== "idle") return;
          const pointer =
            wieldLastPointerRef.current ??
            (() => {
              const rect = anchorRef.current?.getBoundingClientRect();
              return {
                x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
              };
            })();
          startPrismWield(pointer);
          return;
        }
        const wielding = wieldStateRef.current;
        if (
          (wielding.phase === "pending" || wielding.phase === "following") &&
          event.key === "Escape"
        ) {
          event.preventDefault();
          event.stopPropagation();
          resetPrismWield();
        }
        return;
      }
      if (keyboardShortcutMatchesEvent(keyboardShortcut, event)) {
        const activeRefract = refractSessionRef.current;
        if (activeRefract?.phase === "generating") {
          event.preventDefault();
          event.stopPropagation();
          setRefractStatus(
            "Prism is still refracting. Click its rainbow sheen to cancel.",
          );
          return;
        }
        if (activeRefract) releasePrismRefract(true);
        resetPrismWield();
        event.preventDefault();
        event.stopPropagation();
        activatePrismConversation();
        return;
      }
      const refracting = refractSessionRef.current;
      if (refracting) {
        const eventTargetsCapturedField =
          refracting.registration.target.kind !== "magic" &&
          event.target instanceof Node &&
          refracting.registration.element.contains(event.target);
        if (
          refracting.phase === "prompting" &&
          document.activeElement === refractPromptRef.current
        ) {
          return;
        }
        if (event.key === "Escape") {
          if (!eventTargetsCapturedField) return;
          event.preventDefault();
          event.stopPropagation();
          if (refracting.phase === "generating") {
            setRefractStatus(
              "Click the rainbow sheen to cancel this refraction.",
            );
            return;
          }
          releasePrismRefract(true);
          return;
        }
        if (
          eventTargetsCapturedField &&
          event.key === " "
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (
            refracting.phase === "ready" ||
            refracting.phase === "error"
          ) {
            rerollPrismRefract();
          } else {
            setRefractStatus("Prism is still refracting.");
          }
          return;
        }
        if (
          eventTargetsCapturedField &&
          (event.key === "Enter" || event.key === "Tab")
        ) {
          if (refracting.phase !== "ready") {
            if (event.key === "Tab") return;
            event.preventDefault();
            setRefractStatus("Prism is still refracting.");
            return;
          }
          if (event.key === "Enter") event.preventDefault();
          acceptPrismRefract();
          return;
        }
        if (
          eventTargetsCapturedField &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          (event.key.length === 1 ||
            event.key === "Backspace" ||
            event.key === "Delete" ||
            event.key.startsWith("Arrow") ||
            event.key === "Home" ||
            event.key === "End")
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      if (refracting) return;

      if (isPrismCompanionModifierKey(event, platform)) {
        if (event.repeat || wieldStateRef.current.phase !== "idle") return;
        const pointer =
          wieldLastPointerRef.current ??
          (() => {
            const rect = anchorRef.current?.getBoundingClientRect();
            return {
              x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
              y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
            };
          })();
        startPrismWield(pointer);
        return;
      }

      const wielding = wieldStateRef.current;
      if (wielding.phase === "pending" || wielding.phase === "following") {
        // Option may chord with navbar shortcuts without ending the hold.
        // The Alt keyup remains the single release boundary for Wield.
        if (isPrismCompanionModifierHeld(event, platform)) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        resetPrismWield();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (
        isPrismCompanionPlatformModifier(event, platform)
      ) {
        resetPrismWield(false, true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    acceptPrismRefract,
    companionSuppressed,
    keyboardShortcut,
    activatePrismConversation,
    releasePrismRefract,
    resetPrismWield,
    rerollPrismRefract,
    startPrismWield,
    sessionNoteContext,
  ]);

  const rememberPrismContextTokens = useCallback(
    (nextCards: readonly PrismCompanionCardV1[]): void => {
      const discovered = nextCards.flatMap((card): string[] => {
        if (card.type !== "result") return [];
        const result = card.run.result;
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          return [];
        }
        const token = result.contextToken;
        if (!token || typeof token !== "object" || Array.isArray(token)) {
          return [];
        }
        return typeof token.id === "string" && token.id.trim()
          ? [token.id.trim()]
          : [];
      });
      if (discovered.length === 0) return;
      contextTokenIdsRef.current = Array.from(
        new Set([...discovered, ...contextTokenIdsRef.current]),
      ).slice(0, 8);
    },
    [],
  );

  const reconcileOrchestrationResult = useCallback(
    async (run: PrismActionRunV1): Promise<void> => {
      try {
        await onOrchestrationResult?.(run);
      } catch {
        onError?.(
          "Prism completed the action, but this screen could not refresh automatically.",
        );
      }
    },
    [onError, onOrchestrationResult],
  );

  const applyPrismProposal = useCallback(
    async (proposal: PrismActionProposalV1): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        const response = await fetch("/api/prism/actions/execute", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.id,
            confirmation: true,
            idempotencyKey: `companion-apply:${proposal.id}`,
            surface,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as
          | { ok: true; run: PrismActionRunV1 }
          | { ok?: false; error?: string };
        if (!response.ok || payload.ok !== true) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Prism could not apply that proposal.",
          );
        }
        const nextCards: PrismCompanionCardV1[] = [
          {
            schemaVersion: proposal.schemaVersion,
            type: "result",
            title:
              payload.run.status === "committed"
                ? "Complete"
                : "Could not complete",
            run: payload.run,
          },
        ];
        setCards(nextCards);
        rememberPrismContextTokens(nextCards);
        if (
          payload.run.affectedEntities.length > 0 ||
          payload.run.undoAvailable ||
          payload.run.nonReversibleConsequences.length > 0
        ) {
          setRecentRuns((current) => [
            payload.run,
            ...current.filter((run) => run.id !== payload.run.id),
          ].slice(0, 12));
        }
        await reconcileOrchestrationResult(payload.run);
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "Prism could not apply that proposal.",
        );
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      onError,
      reconcileOrchestrationResult,
      rememberPrismContextTokens,
      surface,
    ],
  );

  const undoPrismRun = useCallback(
    async (runId: string): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        const response = await fetch("/api/prism/actions/undo", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId, surface }),
        });
        const payload = (await response.json().catch(() => ({}))) as
          | { ok: true; run: PrismActionRunV1 }
          | { ok?: false; error?: string };
        if (!response.ok || payload.ok !== true) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Prism could not undo that action.",
          );
        }
        setCards([
          {
            schemaVersion: payload.run.schemaVersion,
            type: "result",
            title: payload.run.status === "undone" ? "Undone" : "Undo failed",
            run: payload.run,
          },
        ]);
        setRecentRuns((current) =>
          current.map((run) =>
            run.id === payload.run.id ? payload.run : run,
          ),
        );
        await reconcileOrchestrationResult(payload.run);
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "Prism could not undo that action.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, onError, reconcileOrchestrationResult, surface],
  );

  const togglePrismHistory = useCallback(async (): Promise<void> => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    try {
      const response = await fetch("/api/prism/actions?limit=12", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        runs?: PrismActionRunV1[];
      };
      if (response.ok && payload.ok === true && Array.isArray(payload.runs)) {
        setRecentRuns(
          payload.runs.filter(
            (run) =>
              run.affectedEntities.length > 0 ||
              run.undoAvailable ||
              run.nonReversibleConsequences.length > 0,
          ),
        );
      }
    } catch {
      onError?.("Prism could not load recent activity.");
    }
  }, [historyOpen, onError]);

  const sendMessage = async (): Promise<void> => {
    const content = draft.trim();
    if (!content || interactionLocked) return;
    cancelSpeech(true);
    let priorMessages = messages;
    const userMessage: PrismCompanionMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setBusy(true);
    setDraft("");
    setActions([]);
    setCards([]);
    const requestId = crypto.randomUUID();
    try {
      const persistentConversation = privateMode
        ? null
        : await ensurePersistentConversation();
      if (persistentConversation) {
        priorMessages = prismConversationMessages(persistentConversation);
      }
      const optimisticMessages = [...priorMessages, userMessage];
      if (privateMode) {
        setPrivateMessages(persistPrivateRecovery(optimisticMessages));
      } else {
        setSavedMessages(optimisticMessages);
      }
      const orchestrationResponse = await fetch("/api/prism-companion", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          message: content,
          recoveryMessages: priorMessages,
          requestId,
          contextTokenIds: contextTokenIdsRef.current,
          orchestrationOnly: true,
          privateMode,
          ...(persistentConversation
            ? { persistConversationId: persistentConversation.id }
            : {}),
        }),
      });
      if (orchestrationResponse.status !== 204) {
        const payload = (await orchestrationResponse
          .json()
          .catch(() => ({}))) as
          | PrismCompanionResponse
          | { ok?: false; error?: string };
        if (!orchestrationResponse.ok || payload.ok !== true) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Prism could not answer here.",
          );
        }
        const nextMessages = [
          ...priorMessages,
          userMessage,
          payload.message,
        ];
        if (privateMode) {
          setPrivateMessages(persistPrivateRecovery(nextMessages));
        } else {
          if (!persistentConversation) {
            throw new Error("Prism could not identify its saved chat.");
          }
          const persistedReceipt = await loadPersistentConversation(
            persistentConversation.id,
          );
          if (!persistedReceipt) {
            throw new Error("Prism saved an action receipt that could not be reopened.");
          }
          applySavedConversation(persistedReceipt);
          persistSessionRecord(
            touchPrismCompanionSessionRecord(persistedReceipt.id, Date.now()),
          );
          notifyPersistentConversationChange(persistedReceipt.id);
        }
        setActions(payload.actions);
        const nextCards = Array.isArray(payload.cards) ? payload.cards : [];
        setCards(nextCards);
        rememberPrismContextTokens(nextCards);
        for (const card of nextCards) {
          if (card.type === "result") {
            await reconcileOrchestrationResult(card.run);
          }
        }
        speakResponse(payload.message, payload.provider);
        return;
      }

      const privateTranscript = priorMessages.map(
        (message): ChatMessage => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          ...(message.userNotes ? { userNotes: message.userNotes } : {}),
        }),
      );
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: privateMode
            ? (privateConversationRef.current?.id ??
              privateConversationIdRef.current ??
              undefined)
            : persistentConversation?.id,
          message: content,
          mode: "zen",
          facetBotId: null,
          zenHomeBotId: null,
          preferredProvider: "local",
          prismCompanionSurface: surface,
          prismCompanionRequest: true,
          ...(privateMode
            ? {
                incognito: true,
                ephemeralMessages: privateTranscript,
              }
            : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversation?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Prism could not answer here.",
        );
      }
      const conversation = parsePrismConversationSnapshot(payload.conversation);
      if (!conversation || conversation.incognito !== privateMode) {
        throw new Error("Prism returned an invalid chat transcript.");
      }
      const nextMessages = prismConversationMessages(conversation);
      const reply = [...nextMessages]
        .reverse()
        .find((message) => message.role === "assistant");
      if (privateMode) {
        applyPrivateConversation(conversation);
      } else {
        applySavedConversation(conversation);
        persistSessionRecord(
          touchPrismCompanionSessionRecord(conversation.id, Date.now()),
        );
        notifyPersistentConversationChange(conversation.id);
      }
      if (reply) {
        speakResponse(reply, prismConversationReplyProvider(conversation));
      }
    } catch (error) {
      if (privateMode) {
        setPrivateMessages(persistPrivateRecovery(priorMessages));
      } else {
        setSavedMessages(priorMessages);
      }
      setDraft(content);
      const message =
        error instanceof Error ? error.message : "Prism could not answer here.";
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const togglePrivateMode = useCallback((): void => {
    if (interactionLocked) return;
    cancelSpeech(true);
    const nextPrivateMode = !privateMode;
    if (nextPrivateMode && !privateConversationIdRef.current) {
      privateConversationIdRef.current = `prism-private-${crypto.randomUUID()}`;
    }
    setPrivateMode(nextPrivateMode);
    setActions([]);
    setCards([]);
    setHistoryOpen(false);
    contextTokenIdsRef.current = [];
    if (!nextPrivateMode) {
      void ensurePersistentConversation().catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError?.(
          error instanceof Error
            ? error.message
            : "Prism could not restore its saved chat.",
        );
      });
    }
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [
    cancelSpeech,
    ensurePersistentConversation,
    interactionLocked,
    onError,
    privateMode,
  ]);

  const continueInFocusedChat = useCallback(async (): Promise<void> => {
    if (interactionLocked || !onContinueFocusedChat) return;
    try {
      const conversation = privateMode
        ? {
            ...(privateConversationRef.current ?? {}),
            id:
              privateConversationIdRef.current ??
              `prism-private-${crypto.randomUUID()}`,
            title:
              privateConversationRef.current?.title ?? "Private Prism chat",
            mode: "zen" as const,
            botId: null,
            incognito: true,
            messages: privateMessages.map(
              (message): PrismCompanionConversationMessage => ({
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
                ...(message.userNotes ? { userNotes: message.userNotes } : {}),
              }),
            ),
          }
        : savedConversationRef.current ??
          (await ensurePersistentConversation());
      setOpen(false);
      cancelSpeech(true);
      await onContinueFocusedChat({
        privateMode,
        conversationId: conversation.id,
        conversation,
      });
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Prism could not continue in focused chat.",
      );
    }
  }, [
    cancelSpeech,
    ensurePersistentConversation,
    interactionLocked,
    onContinueFocusedChat,
    onError,
    privateMessages,
    privateMode,
  ]);

  useEffect(() => {
    if (!softSynthesisActive) return;
    setPanelView("synthesis");
    setOpen(false);
    clearIdleDim();
  }, [clearIdleDim, softSynthesisActive]);

  useEffect(() => {
    if (softSynthesisActive) clearIdleDim();
  }, [clearIdleDim, softSynthesisActive]);

  const publishHomeBaseRadialState = useCallback(
    (next: HomeBaseRadialGestureState<string>): void => {
      homeBaseRadialGestureRef.current = next;
      setHomeBaseRadialGesture(next);
    },
    [],
  );

  const clearHomeBaseRadialTimers = useCallback((): void => {
    if (homeBaseRadialHoldTimerRef.current !== null) {
      window.clearTimeout(homeBaseRadialHoldTimerRef.current);
      homeBaseRadialHoldTimerRef.current = null;
    }
    if (homeBaseRadialHandoffTimerRef.current !== null) {
      window.clearTimeout(homeBaseRadialHandoffTimerRef.current);
      homeBaseRadialHandoffTimerRef.current = null;
    }
  }, []);

  const cancelHomeBaseRadial = useCallback(
    (restoreFocus = true): void => {
      clearHomeBaseRadialTimers();
      homeBaseRadialRunRef.current += 1;
      const result = transitionHomeBaseRadialGesture(
        homeBaseRadialGestureRef.current,
        { type: "cancel" },
      );
      publishHomeBaseRadialState(result.state);
      setHomeBaseRadialPointer(null);
      setHomeBaseRadialLayout([]);
      setHomeBaseRadialTargetRadius(HOME_BASE_RADIAL_TARGET_RADIUS_PX);
      if (restoreFocus) {
        window.requestAnimationFrame(() => avatarRef.current?.focus());
      }
    },
    [clearHomeBaseRadialTimers, publishHomeBaseRadialState],
  );

  const measureHomeBaseRadial = useCallback((): {
    source: HomeBaseRadialPoint;
    layout: HomeBaseRadialTargetPosition<string>[];
    targetRadius: number;
  } | null => {
    const rect = avatarRef.current?.getBoundingClientRect();
    if (!rect || homeBaseAppletTargets.length === 0) return null;
    const source = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const targetRadius = resolveHomeBaseRadialTargetRadius(
      window.innerWidth,
      window.innerHeight,
      source,
    );
    if (targetRadius <= 0) return null;
    return {
      source,
      layout: homeBaseRadialTargetLayout(
        homeBaseAppletTargets.map((target) => target.id),
        source,
        { width: window.innerWidth, height: window.innerHeight },
      ),
      targetRadius,
    };
  }, [homeBaseAppletTargets]);

  const beginHomeBaseRadialHandoff = useCallback(
    (targetId: string, nextState: HomeBaseRadialGestureState<string>): void => {
      publishHomeBaseRadialState(nextState);
      playPrismCompanionGlassTap();
      const run = homeBaseRadialRunRef.current + 1;
      homeBaseRadialRunRef.current = run;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      homeBaseRadialHandoffTimerRef.current = window.setTimeout(
        () => {
          homeBaseRadialHandoffTimerRef.current = null;
          if (homeBaseRadialRunRef.current !== run) return;
          const selectedTarget = homeBaseAppletTargets.find(
            (target) => target.id === targetId,
          );
          const selectedPosition = homeBaseRadialLayout.find(
            (target) => target.id === targetId,
          );
          const finished = transitionHomeBaseRadialGesture(
            homeBaseRadialGestureRef.current,
            { type: "finish" },
          );
          publishHomeBaseRadialState(finished.state);
          setHomeBaseRadialPointer(null);
          setHomeBaseRadialLayout([]);
          setHomeBaseRadialTargetRadius(HOME_BASE_RADIAL_TARGET_RADIUS_PX);
          if (selectedTarget?.kind === "assistant") {
            openAndFocusNearPoint(
              selectedPosition ??
                homeBaseRadialSource ?? {
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                },
            );
          } else {
            onHomeBaseAppletSelect?.(targetId);
          }
        },
        reducedMotion ? 40 : HOME_BASE_RADIAL_HANDOFF_MS,
      );
    },
    [
      homeBaseAppletTargets,
      homeBaseRadialLayout,
      homeBaseRadialSource,
      onHomeBaseAppletSelect,
      openAndFocusNearPoint,
      publishHomeBaseRadialState,
    ],
  );

  const selectHomeBaseRadialTarget = useCallback(
    (targetId: string): void => {
      const result = transitionHomeBaseRadialGesture(
        homeBaseRadialGestureRef.current,
        { type: "select", targetId },
      );
      if (result.effect !== "select-target") return;
      beginHomeBaseRadialHandoff(targetId, result.state);
    },
    [beginHomeBaseRadialHandoff],
  );

  const openHomeBaseRadialFromKeyboard = useCallback((): void => {
    const measurement = measureHomeBaseRadial();
    if (!measurement) return;
    const initialId = homeBaseAppletTargets[0]?.id ?? null;
    const result = transitionHomeBaseRadialGesture(
      homeBaseRadialGestureRef.current,
      { type: "open-keyboard", initialId },
    );
    if (result.state.phase !== "open") return;
    setHomeBaseRadialSource(measurement.source);
    setHomeBaseRadialPointer(null);
    setHomeBaseRadialLayout(measurement.layout);
    setHomeBaseRadialTargetRadius(measurement.targetRadius);
    publishHomeBaseRadialState(result.state);
    window.requestAnimationFrame(() => {
      if (initialId) homeBaseRadialTargetRefs.current.get(initialId)?.focus();
    });
  }, [homeBaseAppletTargets, measureHomeBaseRadial, publishHomeBaseRadialState]);

  const beginHomeBaseRadialPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      homeBaseAppletTargets.length === 0 ||
      homeBaseRadialGestureRef.current.phase !== "idle"
    ) {
      return;
    }
    clearHomeBaseRadialTimers();
    homeBaseRadialSuppressClickRef.current = false;
    const measurement = measureHomeBaseRadial();
    if (!measurement) return;
    setHomeBaseRadialSource(measurement.source);
    setHomeBaseRadialPointer({ x: event.clientX, y: event.clientY });
    setHomeBaseRadialTargetRadius(measurement.targetRadius);
    const pressed = transitionHomeBaseRadialGesture(
      homeBaseRadialGestureRef.current,
      { type: "press", pointerId: event.pointerId },
    );
    publishHomeBaseRadialState(pressed.state);
    event.currentTarget.setPointerCapture(event.pointerId);
    homeBaseRadialHoldTimerRef.current = window.setTimeout(() => {
      homeBaseRadialHoldTimerRef.current = null;
      const opened = transitionHomeBaseRadialGesture(
        homeBaseRadialGestureRef.current,
        { type: "hold", pointerId: event.pointerId },
      );
      if (opened.state.phase !== "open") return;
      setHomeBaseRadialLayout(measurement.layout);
      publishHomeBaseRadialState(opened.state);
    }, HOME_BASE_RADIAL_HOLD_MS);
  };

  const moveHomeBaseRadialPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const state = homeBaseRadialGestureRef.current;
    if (
      (state.phase !== "pressing" && state.phase !== "open") ||
      state.pointerId !== event.pointerId
    ) {
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    setHomeBaseRadialPointer(pointer);
    if (state.phase === "open") {
      const targetId = homeBaseRadialTargetAtPoint(
        homeBaseRadialLayout,
        pointer,
        homeBaseRadialTargetRadius,
      );
      const aimed = transitionHomeBaseRadialGesture(state, {
        type: "aim",
        targetId,
      });
      publishHomeBaseRadialState(aimed.state);
    }
  };

  const endHomeBaseRadialPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    clearHomeBaseRadialTimers();
    const state = homeBaseRadialGestureRef.current;
    if (
      (state.phase !== "pressing" && state.phase !== "open") ||
      state.pointerId !== event.pointerId
    ) {
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    const sourceInside =
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom;
    const targetId =
      state.phase === "open"
        ? homeBaseRadialTargetAtPoint(
            homeBaseRadialLayout,
            pointer,
            homeBaseRadialTargetRadius,
          )
        : null;
    const released = transitionHomeBaseRadialGesture(state, {
      type: "release",
      targetId,
      sourceInside,
    });
    if (
      state.phase === "open" ||
      !sourceInside ||
      released.effect === "activate-source"
    ) {
      homeBaseRadialSuppressClickRef.current = true;
      window.setTimeout(() => {
        homeBaseRadialSuppressClickRef.current = false;
      }, 0);
    }
    if (released.effect === "select-target" && targetId) {
      beginHomeBaseRadialHandoff(targetId, released.state);
    } else {
      publishHomeBaseRadialState(released.state);
      setHomeBaseRadialPointer(null);
      setHomeBaseRadialLayout([]);
      if (released.effect === "activate-source" && zenCanvasOrb) {
        const measurement = measureHomeBaseRadial();
        if (measurement) {
          const opened = transitionHomeBaseRadialGesture(released.state, {
            type: "open-keyboard",
            initialId: null,
          });
          setHomeBaseRadialSource(measurement.source);
          setHomeBaseRadialPointer(null);
          setHomeBaseRadialLayout(measurement.layout);
          setHomeBaseRadialTargetRadius(measurement.targetRadius);
          publishHomeBaseRadialState(opened.state);
        }
      } else if (released.effect === "activate-source") {
        playPrismCompanionGlassTap();
        activatePrismConversation();
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have ended at the browser boundary.
    }
  };

  const cancelHomeBaseRadialPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    const state = homeBaseRadialGestureRef.current;
    if (
      (state.phase === "pressing" || state.phase === "open") &&
      state.pointerId === event.pointerId
    ) {
      cancelHomeBaseRadial();
    }
  };

  const handleHomeBaseRadialKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
  ): void => {
    const state = homeBaseRadialGestureRef.current;
    if (state.phase !== "open") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelHomeBaseRadial();
      return;
    }
    const targetIds = homeBaseAppletTargets.map((target) => target.id);
    const currentIndex = state.highlightedId
      ? targetIds.indexOf(state.highlightedId)
      : -1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = nextHomeBaseRadialTargetIndex(currentIndex, targetIds.length, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = nextHomeBaseRadialTargetIndex(currentIndex, targetIds.length, -1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = targetIds.length - 1;
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      state.highlightedId
    ) {
      event.preventDefault();
      selectHomeBaseRadialTarget(state.highlightedId);
      return;
    }
    if (nextIndex === null || nextIndex < 0) return;
    event.preventDefault();
    const targetId = targetIds[nextIndex]!;
    const aimed = transitionHomeBaseRadialGesture(state, {
      type: "aim",
      targetId,
    });
    publishHomeBaseRadialState(aimed.state);
    homeBaseRadialTargetRefs.current.get(targetId)?.focus();
  };

  useEffect(() => {
    if (chatHomeOrbDocked) return;
    if (homeBaseRadialGestureRef.current.phase !== "idle") {
      cancelHomeBaseRadial(false);
    }
  }, [cancelHomeBaseRadial, chatHomeOrbDocked]);

  useEffect(() => {
    if (homeBaseRadialGesture.phase === "idle") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelHomeBaseRadial();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelHomeBaseRadial, homeBaseRadialGesture.phase]);

  useEffect(
    () => () => {
      clearHomeBaseRadialTimers();
      homeBaseRadialRunRef.current += 1;
    },
    [clearHomeBaseRadialTimers],
  );

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      wieldStateRef.current.phase !== "idle" ||
      refractSessionRef.current
    ) {
      return;
    }
    // Dimmed orb is click-to-wake only — no drag until it is opaque again.
    if (
      idleDimmedRef.current &&
      presentation !== "zen" &&
      !sessionNoteContextRef.current
    ) {
      clearIdleDim();
      playPrismCompanionGlassTap();
      return;
    }
    clearIdleDim();
    stopInertia(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: positionRef.current,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTimeMs: event.timeStamp || performance.now(),
      velocityX: 0,
      velocityY: 0,
      moved: false,
    };
    setDragging(false);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    samplePrismCompanionDragVelocity(
      drag,
      event.clientX,
      event.clientY,
      event.timeStamp || performance.now(),
    );
    const next = clampPrismCompanionPosition(
      {
        x: drag.origin.x + dx / window.innerWidth,
        y: drag.origin.y + dy / window.innerHeight,
      },
      liveBoundsRef.current,
    );
    positionRef.current = next;
    publishSoftSynthesisPosition(next);
    setPosition(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      samplePrismCompanionDragVelocity(
        drag,
        event.clientX,
        event.clientY,
        event.timeStamp || performance.now(),
      );
    }
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have ended at a browser boundary.
    }
    if (drag.moved) {
      startInertia({ x: drag.velocityX, y: drag.velocityY });
    } else {
      playPrismCompanionGlassTap();
      persistPosition(positionRef.current);
      if (softSynthesisActive) {
        toggleSoftSynthesisFromOrb();
        return;
      }
      activatePrismConversation();
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    draggingRef.current = false;
    persistPosition(positionRef.current);
    scheduleIdleDim();
  };

  useLayoutEffect(() => {
    if (!companionSuppressed) return;
    setOpen(false);
    clearIdleDim();
    resetPrismWield();
    setDragging(false);
    dragRef.current = null;
    // Keep in-flight field/choice Refract alive under warmup overlays.
    // Aborting here used to cancel the same rewrite that opened a hard wait.
    const session = refractSessionRef.current;
    const keepFieldRefract =
      session != null &&
      session.registration.target.kind !== "magic" &&
      (session.phase === "generating" ||
        session.phase === "ready" ||
        session.phase === "error");
    if (!keepFieldRefract) {
      releasePrismRefract(true);
    }
    stopInertia(true);
    cancelSpeech(true);
  }, [
    cancelSpeech,
    clearIdleDim,
    companionSuppressed,
    releasePrismRefract,
    resetPrismWield,
    stopInertia,
  ]);

  const homeBaseRadialVisible =
    homeBaseRadialGesture.phase === "open" ||
    homeBaseRadialGesture.phase === "igniting";
  const homeBaseRadialHighlightedId =
    homeBaseRadialGesture.phase === "open"
      ? homeBaseRadialGesture.highlightedId
      : null;
  const homeBaseRadialHighlightedPosition = homeBaseRadialHighlightedId
    ? homeBaseRadialLayout.find(
        (target) => target.id === homeBaseRadialHighlightedId,
      ) ?? null
    : null;
  const homeBaseRadialRay =
    homeBaseRadialGesture.phase === "open" &&
    homeBaseRadialGesture.pointerId !== null &&
    homeBaseRadialSource &&
    homeBaseRadialPointer
      ? homeBaseRadialRayGeometry(
          homeBaseRadialSource,
          homeBaseRadialHighlightedPosition ?? homeBaseRadialPointer,
          homeBaseRadialHighlightedPosition
            ? HOME_BASE_RADIAL_TARGET_RADIUS_PX
            : 0,
        )
      : null;
  const homeBaseRadialSelectedId =
    homeBaseRadialGesture.phase === "igniting"
      ? homeBaseRadialGesture.selectedId
      : null;
  const homeBaseRadialSelectedTarget = homeBaseAppletTargets.find(
    (target) => target.id === homeBaseRadialSelectedId,
  );

  if (typeof document === "undefined" || companionSuppressed) return null;
  if (sessionNoteContext) {
    return createPortal(
      <>
        <div
          ref={backdropRef}
          className={styles.backdrop}
          data-open={open ? "true" : undefined}
          data-prism-system-pause-exempt="true"
          aria-hidden="true"
          onPointerDown={() => setOpen(false)}
        />
        <div
          ref={anchorRef}
          className={styles.anchor}
          data-prism-companion-anchor="true"
          data-prism-system-pause-exempt="true"
          data-open={open ? "true" : undefined}
          data-session-note="true"
          data-dragging={dragging ? "true" : undefined}
          data-inertial={inertial ? "true" : undefined}
          data-dock={position.x < 0.5 ? "left" : "right"}
          data-vertical={position.y < 0.48 ? "below" : "above"}
          style={anchorStyle}
        >
          <div className={styles.focusOrb} aria-hidden="true" />
          <div className={styles.conversation}>
            {open ? (
              <form
                id="global-prism-session-note"
                className={`${styles.composer} ${styles.sessionNoteComposer}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveSessionNote();
                }}
              >
                <div className={styles.sessionNoteHeading}>
                  <span>Session note</span>
                  <small>First keystroke marks transcript · overlaps merge</small>
                </div>
                <textarea
                  ref={composerRef}
                  value={sessionNoteDraft}
                  rows={3}
                  maxLength={APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS}
                  aria-label="Session note"
                  placeholder="Capture a fresh note…"
                  enterKeyHint="done"
                  disabled={sessionNoteSaving}
                  onChange={(event) => {
                    const nextDraft = event.target.value;
                    if (
                      sessionNoteTypingStartedAtRef.current === null &&
                      nextDraft.length > 0
                    ) {
                      sessionNoteTypingStartedAtRef.current =
                        new Date().toISOString();
                    }
                    setSessionNoteDraft(nextDraft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setOpen(false);
                    } else if (
                      shouldSubmitComposerOnEnter({
                        key: event.key,
                        shiftKey: event.shiftKey,
                        isComposing: event.nativeEvent.isComposing,
                      })
                    ) {
                      event.preventDefault();
                      if (!sessionNoteSaving && sessionNoteDraft.trim()) {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }
                  }}
                />
                <footer>
                  <small role="status" aria-live="polite">
                    {sessionNoteStatus ||
                      "Enter adds note · Shift+Enter continues this note"}
                  </small>
                  <button
                    type="submit"
                    className={styles.sendButton}
                    disabled={sessionNoteSaving || !sessionNoteDraft.trim()}
                  >
                    {sessionNoteSaving ? "Adding…" : "Add note"}
                  </button>
                </footer>
              </form>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.avatar}
            data-prism-companion-avatar="true"
            data-session-note-trigger="true"
            aria-label={open ? "Close session note" : "Open session note"}
            aria-expanded={open}
            aria-controls="global-prism-session-note"
            aria-keyshortcuts={shortcutPresentation.aria}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onClick={(event) => {
              if (event.detail !== 0) return;
              playPrismCompanionGlassTap();
              activatePrismConversation();
            }}
          >
            <span className={styles.sessionNotePlus} aria-hidden="true">
              <Plus strokeWidth={2.35} />
            </span>
            {keyboardShortcut ? (
              <span className={styles.shortcut} aria-hidden="true">
                {shortcutPresentation.label}
              </span>
            ) : null}
          </button>
        </div>
      </>,
      document.body,
    );
  }
  return createPortal(
    <>
      {homeBaseRadialVisible && homeBaseRadialSource ? (
        <>
          <div
            className={styles.homeBaseRadialBackdrop}
            data-theme={theme}
            data-prism-system-pause-exempt="true"
            data-phase={homeBaseRadialGesture.phase}
            aria-hidden="true"
            onPointerDown={() => cancelHomeBaseRadial()}
          />
          <div
            id="prism-home-base-radial-launcher"
            className={styles.homeBaseRadialField}
            data-theme={theme}
            data-prism-system-pause-exempt="true"
            data-home-base-radial-launcher="true"
            data-phase={homeBaseRadialGesture.phase}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a PRISM applet"
            aria-describedby="prism-home-base-radial-instructions"
            onKeyDown={handleHomeBaseRadialKeyboard}
          >
            {homeBaseRadialRay?.points ? (
              <svg
                className={styles.homeBaseRadialRay}
                viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="home-base-radial-ray-gradient"
                    gradientUnits="userSpaceOnUse"
                    x1={homeBaseRadialSource.x}
                    y1={homeBaseRadialSource.y}
                    x2={homeBaseRadialPointer?.x ?? homeBaseRadialSource.x}
                    y2={homeBaseRadialPointer?.y ?? homeBaseRadialSource.y}
                  >
                    <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
                    <stop offset="0.24" stopColor="var(--companion-s)" stopOpacity="0.74" />
                    <stop offset="0.68" stopColor="var(--companion-m)" stopOpacity="0.58" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0.28" />
                  </linearGradient>
                </defs>
                <polygon
                  points={homeBaseRadialRay.points}
                  fill="url(#home-base-radial-ray-gradient)"
                  data-source-width={homeBaseRadialRay.sourceWidth.toFixed(2)}
                  data-target-width={homeBaseRadialRay.targetWidth.toFixed(2)}
                />
              </svg>
            ) : null}
            {homeBaseRadialLayout.map((position, index) => {
              const target = homeBaseAppletTargets.find(
                (candidate) => candidate.id === position.id,
              );
              if (!target) return null;
              const highlighted =
                homeBaseRadialHighlightedId === target.id;
              const selected = homeBaseRadialSelectedId === target.id;
              return (
                <button
                  key={target.id}
                  ref={(element) => {
                    if (element) {
                      homeBaseRadialTargetRefs.current.set(target.id, element);
                    } else {
                      homeBaseRadialTargetRefs.current.delete(target.id);
                    }
                  }}
                  id={`prism-home-applet-${target.id}`}
                  type="button"
                  className={styles.homeBaseRadialTarget}
                  data-home-base-applet-target={target.id}
                  data-highlighted={highlighted ? "true" : undefined}
                  data-selected={selected ? "true" : undefined}
                  aria-label={`Open ${target.label}`}
                  aria-current={highlighted ? "true" : undefined}
                  tabIndex={highlighted || selected ? 0 : -1}
                  style={
                    {
                      left: position.x,
                      top: position.y,
                      ["--home-radial-hue" as string]: `${
                        (index * 360) / Math.max(1, homeBaseRadialLayout.length)
                      }deg`,
                    } as CSSProperties
                  }
                  onPointerEnter={() => {
                    const state = homeBaseRadialGestureRef.current;
                    if (state.phase !== "open") return;
                    publishHomeBaseRadialState(
                      transitionHomeBaseRadialGesture(state, {
                        type: "aim",
                        targetId: target.id,
                      }).state,
                    );
                  }}
                  onFocus={() => {
                    const state = homeBaseRadialGestureRef.current;
                    if (state.phase !== "open") return;
                    publishHomeBaseRadialState(
                      transitionHomeBaseRadialGesture(state, {
                        type: "aim",
                        targetId: target.id,
                      }).state,
                    );
                  }}
                  onClick={() => selectHomeBaseRadialTarget(target.id)}
                >
                  <span className={styles.homeBaseRadialTargetGlass} aria-hidden="true">
                    <span className={styles.homeBaseRadialTargetGlyph}>
                      {target.glyph}
                    </span>
                  </span>
                  <span className={styles.homeBaseRadialTargetLabel}>
                    {target.label}
                  </span>
                </button>
              );
            })}
            {homeBaseRadialSelectedTarget ? (
              <span
                className={styles.homeBaseRadialHandoffLabel}
                role="status"
                aria-live="polite"
              >
                Opening {homeBaseRadialSelectedTarget.label}…
              </span>
            ) : null}
            <p
              id="prism-home-base-radial-instructions"
              className={styles.srOnly}
              role="status"
              aria-live="polite"
            >
              {homeBaseRadialSelectedTarget
                ? `Opening ${homeBaseRadialSelectedTarget.label}`
                : "Drag toward an applet and release, or use arrow keys and Enter. Escape cancels."}
            </p>
          </div>
        </>
      ) : null}
      <div
        ref={backdropRef}
        className={styles.backdrop}
        data-open={open ? "true" : undefined}
        data-submerged={submerged ? "true" : undefined}
        data-prism-system-pause-exempt="true"
        data-presentation={presentation ?? undefined}
        aria-hidden="true"
        onPointerDown={() => {
          if (dismissOnExternalInteraction) setOpen(false);
        }}
      />
      <div
        ref={anchorRef}
        className={styles.anchor}
        data-theme={theme}
        data-submerged={submerged ? "true" : undefined}
        data-prism-companion-anchor="true"
        data-prism-system-pause-exempt="true"
        data-open={open ? "true" : undefined}
        data-dragging={dragging ? "true" : undefined}
        data-inertial={inertial ? "true" : undefined}
        data-idle-dimmed={
          idleDimmed && !chatHomeOrbDocked ? "true" : undefined
        }
        data-idle-hidden={
          idleHidden && !chatHomeOrbDocked ? "true" : undefined
        }
        data-chat-home-orb-docked={
          chatHomeOrbDocked && chatHomeDockPosition ? "true" : undefined
        }
        data-chat-home-orb-returning={
          chatHomeDockReturning ? "true" : undefined
        }
        data-home-base-radial-phase={
          homeBaseRadialGesture.phase !== "idle"
            ? homeBaseRadialGesture.phase
            : undefined
        }
        data-soft-synthesis={softSynthesisActive ? "true" : undefined}
        data-refracting={refractSession?.phase}
        data-dock={position.x < 0.5 ? "left" : "right"}
        data-vertical={position.y < 0.48 ? "below" : "above"}
        style={anchorStyle}
      >
        <div className={styles.focusOrb} aria-hidden="true" />
        <div className={styles.conversation}>
          {wieldTutorialVisible ? (
            <section
              className={styles.refractTutorial}
              data-prism-wield-tutorial-card="true"
              aria-live="polite"
            >
              <span>First light · Wield Prism</span>
              <strong>
                {wieldTutorialStage === "hold"
                  ? `Hold ${modifierPresentation.modifierLabel} by itself.`
                  : wieldTutorialStage === "target"
                    ? "Guide Prism toward the glowing control."
                    : `Release ${modifierPresentation.modifierLabel} safely.`}
              </strong>
              <p>
                {wieldTutorialStage === "hold"
                  ? "After a brief intentional hold, Prism contracts into your pointer without closing this conversation."
                  : wieldTutorialStage === "target"
                    ? "Registered creative controls answer with a restrained spectral glow. Ordinary controls remain untouched."
                    : "Let go without clicking. Your cursor returns immediately and Prism remembers where it was. When Prism completes a product change, its receipt offers Undo—and “undo that” reverses the latest meaningful action."}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => dismissWieldTutorial("remind")}
                >
                  Do it later
                </button>
                <button
                  type="button"
                  onClick={() => dismissWieldTutorial("skip")}
                >
                  Skip
                </button>
              </div>
            </section>
          ) : null}
          {refractTutorialVisible ? (
            <section
              className={styles.refractTutorial}
              data-prism-refract-tutorial-card="true"
              aria-live="polite"
            >
              <span>Signal ritual · Refract</span>
              <strong>
                {refractTutorialStage === "summon"
                  ? "Summon Prism into a creative control."
                  : refractTutorialStage === "reroll"
                    ? "Let the first draft settle, then press Space."
                    : "Keep it—or restore what you had."}
              </strong>
              <p>
                {refractTutorialStage === "summon"
                  ? `Wield Prism with ${modifierPresentation.modifierLabel} and click the highlighted field, or focus it and use ${shortcutPresentation.spokenLabel}.`
                  : refractTutorialStage === "reroll"
                    ? "Space refracts another candidate. It never types into the captured field."
                    : "Click away, Enter, or Tab keeps the draft. Escape restores the original."}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => dismissRefractTutorial("remind")}
                >
                  Do it later
                </button>
                <button
                  type="button"
                  onClick={() => dismissRefractTutorial("skip")}
                >
                  Skip
                </button>
              </div>
            </section>
          ) : null}
          {refractSession?.phase === "prompting" &&
          refractSession.registration.target.kind === "magic" ? (
            <form
              className={styles.refractPrompt}
              data-prism-refract-prompt="true"
              onSubmit={(event) => {
                event.preventDefault();
                submitPrismRefractMagic();
              }}
            >
              <label htmlFor="prism-refract-direction">
                How should Prism shape this pass?
              </label>
              <input
                ref={refractPromptRef}
                id="prism-refract-direction"
                value={refractPrompt}
                maxLength={500}
                autoComplete="off"
                onChange={(event) => setRefractPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    releasePrismRefract(true);
                  }
                }}
              />
              <small>Enter shapes this pass · Escape cancels</small>
            </form>
          ) : null}
          {open && panelView === "chat" ? (
            <div
              className={styles.bubbleCloud}
              aria-live="polite"
              aria-label={
                privateMode
                  ? "Private conversation with Prism"
                  : "Saved conversation with Prism"
              }
            >
              {messages.map((message, index) => {
                const revealing =
                  message.role === "assistant" &&
                  speechReveal?.messageId === message.id
                    ? speechReveal
                    : null;
                const visibleContent =
                  message.role === "assistant"
                    ? prismCompanionSpeechVisibleContent(
                        revealing,
                        message.id,
                        message.content,
                      )
                    : message.content;
                const copied = copiedMessageId === message.id;
                const speakerLabel =
                  message.role === "assistant" ? "Prism" : "You";
                return (
                  <article
                    key={message.id}
                    className={styles.bubble}
                    title="Click to copy"
                    data-role={message.role}
                    data-copied={copied ? "true" : undefined}
                    data-recent={
                      index >= Math.max(0, messages.length - 2)
                        ? "true"
                        : undefined
                    }
                    data-speaking={
                      revealing?.timeline.phase === "playing"
                        ? "true"
                        : undefined
                    }
                    data-speech-preparing={
                      revealing?.timeline.phase === "preparing"
                        ? "true"
                        : undefined
                    }
                    onClick={(event) => {
                      const target = event.target;
                      if (
                        target instanceof Element &&
                        target.closest(
                          "a, button, input, textarea, select, summary",
                        )
                      ) {
                        return;
                      }
                      if (
                        prismCompanionBubbleHasSelection(event.currentTarget)
                      ) {
                        return;
                      }
                      void copyPrismCompanionMessage(message);
                    }}
                  >
                    <header className={styles.bubbleHeader}>
                      <span>{speakerLabel}</span>
                      <button
                        type="button"
                        className={styles.copyButton}
                        aria-label={
                          copied
                            ? `${speakerLabel} message copied`
                            : `Copy ${speakerLabel} message`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyPrismCompanionMessage(message);
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </header>
                    <div className={styles.markdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {visibleContent}
                      </ReactMarkdown>
                    </div>
                    {message.role === "assistant" && message.userNotes ? (
                      <aside
                        className={styles.userNotesCard}
                        aria-label="Personal note receipt"
                        data-status={message.userNotes.status}
                      >
                        <span className={styles.userNotesEyebrow}>Notes</span>
                        <span className={styles.userNotesHeadline}>
                          {companionUserNotesHeadline(message.userNotes)}
                        </span>
                        {message.userNotes.status === "listed" &&
                        message.userNotes.notes &&
                        message.userNotes.notes.length > 0 ? (
                          <ul className={styles.userNotesList}>
                            {message.userNotes.notes.slice(0, 8).map((note) => (
                              <li key={note.id}>{note.title}</li>
                            ))}
                          </ul>
                        ) : null}
                      </aside>
                    ) : null}
                    <div
                      className={styles.srOnly}
                      role="status"
                      aria-live="polite"
                    >
                      {copied ? `${speakerLabel} message copied` : ""}
                    </div>
                  </article>
                );
              })}
              {interactionLocked ? (
                <article className={styles.thinking} role="status">
                  <span>Prism</span>
                  <p>
                    {conversationLoading
                      ? "Opening your Prism chat…"
                      : "Refracting…"}
                  </p>
                </article>
              ) : null}
              {actions.length > 0 ? (
                <div className={styles.actions} aria-label="Prism suggestions">
                  {actions.map((action, index) => (
                    <button
                      key={`${action.type}-${index}`}
                      type="button"
                      onClick={() => void onAction(action)}
                    >
                      {actionLabel(action)}
                    </button>
                  ))}
                </div>
              ) : null}
              {cards.length > 0 ? (
                <div
                  className={styles.orchestrationCards}
                  aria-label="Prism actions"
                >
                  {cards.map((card, index) => (
                    <article
                      key={`${card.type}-${index}`}
                      className={styles.orchestrationCard}
                      data-card-type={card.type}
                    >
                      <span>{card.title}</span>
                      {card.type === "proposal" ? (
                        <>
                          <strong>{card.proposal.preview.summary}</strong>
                          {card.proposal.preview.targets.length > 0 ? (
                            <p>
                              {card.proposal.preview.targets.length} target
                              {card.proposal.preview.targets.length === 1
                                ? ""
                                : "s"}
                              {card.proposal.preview.diffs.length > 0
                                ? ` · ${card.proposal.preview.diffs.length} changes`
                                : ""}
                            </p>
                          ) : null}
                          {card.proposal.preview.provider ||
                          card.proposal.preview.model ||
                          card.proposal.preview.estimatedCostMicroUsd !==
                            null ? (
                            <small>
                              {[
                                card.proposal.preview.provider
                                  ? `Provider: ${card.proposal.preview.provider}`
                                  : null,
                                card.proposal.preview.model
                                  ? `Model: ${card.proposal.preview.model}`
                                  : null,
                                card.proposal.preview.estimatedCostMicroUsd !==
                                null
                                  ? `Estimated cost: $${(
                                      card.proposal.preview
                                        .estimatedCostMicroUsd / 1_000_000
                                    ).toFixed(4)}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          ) : null}
                          {card.proposal.preview.diffs.length > 0 ? (
                            <details>
                              <summary>Review exact changes</summary>
                              {card.proposal.preview.diffs.map(
                                (diff, diffIndex) => (
                                  <p key={`${diff.entity.id}-${diffIndex}`}>
                                    <strong>{diff.entity.label}</strong>
                                    <br />
                                    <small>
                                      {JSON.stringify(diff.before)} →{" "}
                                      {JSON.stringify(diff.after)}
                                    </small>
                                  </p>
                                ),
                              )}
                            </details>
                          ) : null}
                          {card.proposal.preview.consequences.map(
                            (consequence) => (
                              <small key={consequence}>{consequence}</small>
                            ),
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void applyPrismProposal(card.proposal)
                            }
                          >
                            Apply
                          </button>
                        </>
                      ) : card.type === "result" ? (
                        <>
                          <strong>
                            {card.run.status === "failed" ||
                            card.run.status === "undo-failed"
                              ? card.run.error ||
                                prismActionStatusLabel(card.run.status)
                              : prismActionStatusLabel(card.run.status)}
                          </strong>
                          {card.run.affectedEntities.length > 0 ? (
                            <p>
                              {card.run.affectedEntities.length} item
                              {card.run.affectedEntities.length === 1
                                ? ""
                                : "s"}
                            </p>
                          ) : null}
                          {card.run.nonReversibleConsequences.map(
                            (consequence) => (
                              <small key={consequence}>{consequence}</small>
                            ),
                          )}
                          {card.run.undoAvailable ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void undoPrismRun(card.run.id)}
                            >
                              Undo
                            </button>
                          ) : null}
                          {card.run.capabilityId === "bots.create" &&
                          card.run.affectedEntities[0]?.entityType === "bot" ? (
                            <div className={styles.resultActions}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void onOpenCreatedBot?.(
                                    card.run.affectedEntities[0]!.id,
                                  )
                                }
                              >
                                Avatar Studio
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setDraft(
                                    `Refine ${card.run.affectedEntities[0]!.label}: `,
                                  );
                                  composerRef.current?.focus();
                                }}
                              >
                                Refine
                              </button>
                            </div>
                          ) : null}
                          {card.run.capabilityId === "library.group.create" ? (
                            <div className={styles.resultActions}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const result = card.run.result;
                                  if (
                                    !result ||
                                    typeof result !== "object" ||
                                    Array.isArray(result)
                                  ) {
                                    return;
                                  }
                                  const navigation = result.navigation;
                                  const group = result.group;
                                  if (
                                    !navigation ||
                                    typeof navigation !== "object" ||
                                    Array.isArray(navigation) ||
                                    typeof navigation.groupId !== "string" ||
                                    !group ||
                                    typeof group !== "object" ||
                                    Array.isArray(group) ||
                                    !Array.isArray(group.botIds)
                                  ) {
                                    return;
                                  }
                                  void onStartCreatedCoffeeGroup?.({
                                    groupId: navigation.groupId,
                                    premise:
                                      typeof result.premise === "string"
                                        ? result.premise
                                        : "",
                                    botIds: group.botIds.filter(
                                      (botId): botId is string =>
                                        typeof botId === "string",
                                    ),
                                  });
                                }}
                              >
                                Start Coffee
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setDraft(
                                    `Refine ${card.run.affectedEntities[0]?.label ?? "this Coffee group"}: `,
                                  );
                                  composerRef.current?.focus();
                                }}
                              >
                                Refine
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : card.type === "clarification" ? (
                        <strong>{card.question}</strong>
                      ) : card.type === "progress" ? (
                        <>
                          <strong>{card.run.status}</strong>
                          {card.progress !== null ? (
                            <progress max={1} value={card.progress} />
                          ) : null}
                        </>
                      ) : (
                        <strong>{card.body}</strong>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}
              {historyOpen ? (
                <div
                  className={styles.actionHistory}
                  aria-label="Recent Prism activity"
                >
                  {recentRuns.length > 0 ? (
                    recentRuns.map((run) => (
                      <article key={run.id}>
                        <span>{prismActionLabel(run.capabilityId)}</span>
                        <small>
                          {prismActionStatusLabel(run.status)} ·{" "}
                          {new Date(run.createdAt).toLocaleString()}
                        </small>
                        {run.undoAvailable ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void undoPrismRun(run.id)}
                          >
                            Undo
                          </button>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <small>No persistent Prism actions yet.</small>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          {open && panelView === "chat" ? (
            <form
              id="global-prism-companion"
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <PrismCompanionViewTabs
                activeView="chat"
                synthesisJobCount={softSynthesisUi.jobCount}
              />
              <textarea
                ref={composerRef}
                value={draft}
                rows={2}
                maxLength={4_000}
                aria-label="Message Prism"
                placeholder="Ask Prism…"
                enterKeyHint="send"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                  } else if (
                    shouldSubmitComposerOnEnter({
                      key: event.key,
                      shiftKey: event.shiftKey,
                      isComposing: event.nativeEvent.isComposing,
                    })
                  ) {
                    event.preventDefault();
                    if (!interactionLocked && draft.trim()) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
              />
              <div className={styles.composerStatus}>
                <button
                  type="button"
                  className={styles.privacyToggle}
                  data-enabled={privateMode ? "true" : "false"}
                  aria-pressed={privateMode}
                  disabled={interactionLocked}
                  onClick={togglePrivateMode}
                >
                  Private
                </button>
                <small>
                  {privateMode
                    ? "Not in history or memory"
                    : "Saved Prism chat"}
                </small>
                {onContinueFocusedChat ? (
                  <button
                    type="button"
                    className={styles.continueButton}
                    disabled={interactionLocked}
                    onClick={() => void continueInFocusedChat()}
                  >
                    Continue in focused chat
                  </button>
                ) : null}
              </div>
              <footer>
                <button
                  type="button"
                  className={styles.historyToggle}
                  aria-expanded={historyOpen}
                  onClick={() => void togglePrismHistory()}
                >
                  Activity
                </button>
                <button
                  type="button"
                  className={styles.voiceToggle}
                  data-enabled={speechEnabled ? "true" : "false"}
                  aria-label={
                    speechEnabled
                      ? "Mute Prism voice"
                      : "Enable Prism voice"
                  }
                  aria-pressed={speechEnabled}
                  title={
                    speechEnabled
                      ? "Prism voice is on"
                      : "Prism voice is muted"
                  }
                  onClick={() => setSpeechPreference(!speechEnabled)}
                >
                  {speechEnabled ? (
                    <Volume2 size={13} strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <VolumeX size={13} strokeWidth={2.25} aria-hidden="true" />
                  )}
                  <span>{speechEnabled ? "Voice on" : "Muted"}</span>
                </button>
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={interactionLocked || !draft.trim()}
                >
                  Send
                </button>
              </footer>
            </form>
          ) : null}
          {open && panelView === "synthesis" ? (
            <form
              id="global-prism-synthesis"
              className={`${styles.composer} ${styles.sessionNoteComposer} ${styles.synthesisComposer}`}
              onSubmit={(event) => {
                event.preventDefault();
                void openSynthesisPrompt();
              }}
            >
              <PrismCompanionViewTabs
                activeView="synthesis"
                synthesisJobCount={softSynthesisUi.jobCount}
              />
              <div className={styles.sessionNoteHeading}>
                <span>Synthesis</span>
                <small>Continue in Images</small>
              </div>
              <button
                type="button"
                className={styles.synthesisEmptyOrb}
                aria-label="Focus image prompt"
                onClick={() => composerRef.current?.focus()}
              >
                <Plus aria-hidden="true" />
              </button>
              <textarea
                ref={composerRef}
                value={synthesisDraft}
                rows={3}
                maxLength={4_000}
                aria-label="Image prompt"
                placeholder="Describe what you want to synthesize…"
                enterKeyHint="send"
                onChange={(event) => {
                  setSynthesisDraft(event.target.value);
                  setSynthesisStatus("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                  } else if (
                    shouldSubmitComposerOnEnter({
                      key: event.key,
                      shiftKey: event.shiftKey,
                      isComposing: event.nativeEvent.isComposing,
                    })
                  ) {
                    event.preventDefault();
                    if (!synthesisBusy && synthesisDraft.trim()) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
              />
              <footer>
                <small aria-live="polite">
                  {synthesisStatus || "Enter opens this prompt in Images"}
                </small>
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={
                    synthesisBusy ||
                    !synthesisDraft.trim() ||
                    !onOpenImagePrompt
                  }
                >
                  Open Images
                </button>
              </footer>
            </form>
          ) : null}
          {open && panelView === "notes" ? (
            <form
              id="global-prism-notes"
              className={`${styles.composer} ${styles.sessionNoteComposer} ${styles.personalNotesComposer}`}
              onSubmit={(event) => {
                event.preventDefault();
                void savePersonalNote();
              }}
            >
              <PrismCompanionViewTabs
                activeView="notes"
                synthesisJobCount={softSynthesisUi.jobCount}
              />
              <div className={styles.sessionNoteHeading}>
                <span>Notes</span>
                {!privateMode ? (
                  <button
                    type="button"
                    className={styles.noteSecondaryButton}
                    onClick={resetPersonalNoteEditor}
                  >
                    New note
                  </button>
                ) : (
                  <small>Saved to your account</small>
                )}
              </div>
              {privateMode ? (
                <div className={styles.personalNoteBlocked} role="status">
                  Personal notes stay outside Private chat. Switch Chat back to
                  Saved to view or edit them.
                </div>
              ) : personalNotesLoading ? (
                <div className={styles.personalNoteBlocked} role="status">
                  Opening your notes…
                </div>
              ) : (
                <>
                  {personalNotes.length > 0 ? (
                    <div
                      className={styles.personalNotesRail}
                      aria-label="Saved notes"
                    >
                      {personalNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className={styles.personalNoteChoice}
                          data-selected={
                            personalNoteId === note.id ? "true" : undefined
                          }
                          onClick={() => editPersonalNote(note)}
                        >
                          <span>{note.title}</span>
                          <small>
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <small className={styles.personalNoteEmpty}>
                      No notes yet. Leave something for your future self.
                    </small>
                  )}
                  <label className={styles.srOnly} htmlFor="prism-note-title">
                    Note title
                  </label>
                  <input
                    ref={personalNoteTitleRef}
                    id="prism-note-title"
                    className={styles.personalNoteTitle}
                    value={personalNoteTitle}
                    maxLength={USER_NOTE_TITLE_MAX}
                    autoComplete="off"
                    placeholder="Note title"
                    onChange={(event) => {
                      setPersonalNoteTitle(event.target.value);
                      setPersonalNoteDeleteConfirm(false);
                      setPersonalNoteStatus("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                      } else if (event.key === "Enter") {
                        event.preventDefault();
                        composerRef.current?.focus();
                      }
                    }}
                  />
                  <label className={styles.srOnly} htmlFor="prism-note-body">
                    Note body
                  </label>
                  <textarea
                    ref={composerRef}
                    id="prism-note-body"
                    value={personalNoteBody}
                    rows={5}
                    maxLength={USER_NOTE_BODY_MAX}
                    aria-label="Note body"
                    placeholder="Leave yourself a note…"
                    enterKeyHint="send"
                    onChange={(event) => {
                      setPersonalNoteBody(event.target.value);
                      setPersonalNoteDeleteConfirm(false);
                      setPersonalNoteStatus("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                      } else if (
                        shouldSubmitComposerOnEnter({
                          key: event.key,
                          shiftKey: event.shiftKey,
                          isComposing: event.nativeEvent.isComposing,
                        })
                      ) {
                        event.preventDefault();
                        if (
                          !personalNoteBusy &&
                          personalNoteTitle.trim() &&
                          personalNoteBody.trim()
                        ) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
                  />
                  <footer>
                    {personalNoteId ? (
                      <button
                        type="button"
                        className={styles.noteDeleteButton}
                        data-confirm={
                          personalNoteDeleteConfirm ? "true" : undefined
                        }
                        disabled={personalNoteBusy}
                        onClick={() => {
                          if (personalNoteDeleteConfirm) {
                            void deletePersonalNote();
                          } else {
                            setPersonalNoteDeleteConfirm(true);
                            setPersonalNoteStatus("Press Delete again to confirm");
                          }
                        }}
                      >
                        {personalNoteDeleteConfirm ? "Confirm delete" : "Delete"}
                      </button>
                    ) : null}
                    <small aria-live="polite">
                      {personalNoteStatus || "Enter saves · Shift+Enter adds a line"}
                    </small>
                    <button
                      type="submit"
                      className={styles.sendButton}
                      disabled={
                        personalNoteBusy ||
                        !personalNoteTitle.trim() ||
                        !personalNoteBody.trim()
                      }
                    >
                      {personalNoteId ? "Update note" : "Save note"}
                    </button>
                  </footer>
                </>
              )}
            </form>
          ) : null}
        </div>
        <button
          ref={avatarRef}
          type="button"
          className={styles.avatar}
          data-tutorial-target="prism-companion"
          data-prism-companion-avatar="true"
          aria-label={
            chatHomeOrbDocked
              ? zenCanvasOrb
                ? "Choose a PRISM applet"
                : "Open Prism assistant. Hold for applets."
              : softSynthesisActive
              ? softSynthesisUi.expanded
                ? "Minimize soft synthesis"
                : `Show soft synthesis · ${softSynthesisUi.jobCount} job${softSynthesisUi.jobCount === 1 ? "" : "s"}`
              : refractSession
                ? `Prism is refracting ${refractSession.registration.target.label}`
                : open
                  ? `Move or minimize Prism ${panelView}`
                  : "Move or talk with Prism"
          }
          aria-expanded={
            chatHomeOrbDocked
              ? homeBaseRadialVisible
              : softSynthesisActive
                ? softSynthesisUi.expanded
                : open
          }
          aria-controls={
            chatHomeOrbDocked
              ? homeBaseRadialVisible
                ? "prism-home-base-radial-launcher"
                : undefined
              : softSynthesisActive
                ? undefined
              : panelView === "synthesis"
                ? "global-prism-synthesis"
                : panelView === "notes"
                  ? "global-prism-notes"
                  : "global-prism-companion"
          }
          aria-keyshortcuts={
            chatHomeOrbDocked ? undefined : shortcutPresentation.aria
          }
          aria-haspopup={chatHomeOrbDocked ? "dialog" : undefined}
          onPointerDown={
            chatHomeOrbDocked ? beginHomeBaseRadialPointer : beginDrag
          }
          onPointerMove={
            chatHomeOrbDocked ? moveHomeBaseRadialPointer : moveDrag
          }
          onPointerUp={
            chatHomeOrbDocked ? endHomeBaseRadialPointer : endDrag
          }
          onPointerCancel={
            chatHomeOrbDocked ? cancelHomeBaseRadialPointer : cancelDrag
          }
          onLostPointerCapture={
            chatHomeOrbDocked ? cancelHomeBaseRadialPointer : undefined
          }
          onKeyDown={(event) => {
            if (!chatHomeOrbDocked) return;
            if (homeBaseRadialGestureRef.current.phase === "open") {
              handleHomeBaseRadialKeyboard(event);
              return;
            }
            if (
              homeBaseRadialGestureRef.current.phase === "idle" &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openHomeBaseRadialFromKeyboard();
            }
          }}
          disabled={Boolean(refractSession)}
          onClick={(event) => {
            if (chatHomeOrbDocked) {
              if (homeBaseRadialSuppressClickRef.current) {
                homeBaseRadialSuppressClickRef.current = false;
                event.preventDefault();
                return;
              }
              if (zenCanvasOrb) {
                openHomeBaseRadialFromKeyboard();
                return;
              }
              playPrismCompanionGlassTap();
              activatePrismConversation();
              return;
            }
            if (event.detail === 0) {
              playPrismCompanionGlassTap();
              if (softSynthesisActive) {
                toggleSoftSynthesisFromOrb();
                return;
              }
              activatePrismConversation();
            }
          }}
        >
          <PrismOrb aura={false} className={styles.orb} />
          {softSynthesisActive ? (
            <span
              className={styles.softJobChip}
              data-prism-soft-job-chip="true"
              aria-hidden="true"
            >
              {softSynthesisUi.jobCount > 99 ? "99+" : softSynthesisUi.jobCount}
            </span>
          ) : null}
          {keyboardShortcut && !chatHomeOrbDocked ? (
            <span className={styles.shortcut} aria-hidden="true">
              {shortcutPresentation.label}
            </span>
          ) : null}
        </button>
        <span className={styles.refractGlyph} aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <path d="M16 5.2 27 25H5Z" />
          </svg>
        </span>
        <span className={styles.srOnly} role="status" aria-live="polite">
          {refractStatus}
        </span>
      </div>
      <style>{`html[${PRISM_REFRACT_CURSOR_ATTRIBUTE}="true"], html[${PRISM_REFRACT_CURSOR_ATTRIBUTE}="true"] *, html[${PRISM_WIELD_CURSOR_ATTRIBUTE}="true"], html[${PRISM_WIELD_CURSOR_ATTRIBUTE}="true"] * { cursor: none !important; }`}</style>
    </>,
    document.body,
  );
}
