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
  type PointerEvent as ReactPointerEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";
import type {
  EphemeralChatResolvedProvider,
  PrismActionProposalV1,
  PrismActionRunV1,
  PrismCompanionActionIntent,
  PrismCompanionCardV1,
  PrismCompanionMessage,
  PrismCompanionResponse,
  PrismCompanionSurfaceReference,
} from "@localai/shared";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import {
  isPrismCompanionModifierHeld,
  isPrismCompanionModifierKey,
  isPrismCompanionPlatformModifier,
  isPrismCompanionShortcut,
  parsePrismCompanionRecovery,
  parsePrismCompanionSpeechEnabled,
  prismCompanionDismissesOnExternalInteraction,
  prismCompanionModifierPresentation,
  prismCompanionPositionStorageKey,
  prismCompanionRecoveryStorageKey,
  prismCompanionSpeechStorageKey,
  prismCompanionSurfaceScope,
  retainPrismCompanionRecovery,
} from "./prismCompanionState";
import {
  boundedPrismCompanionReleaseVelocity,
  clampPrismCompanionPosition,
  resolvePrismCompanionSurfaceGlare,
  samplePrismCompanionDragVelocity,
  stepPrismCompanionInertia,
  type PrismCompanionDragVelocitySample,
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
import {
  getPrismCompanionSuppressedServerSnapshot,
  getPrismCompanionSuppressedSnapshot,
  subscribePrismCompanionSuppression,
} from "./prismCompanionPresence";
import {
  focusedPrismRefractTargetId,
  nextPrismRefractChoice,
  prismRefractTargetIdAtPoint,
  registeredPrismRefractTarget,
  requestPrismRefract,
  subscribePrismRefractRequests,
  type PrismRefractInvocation,
  type PrismRefractOrigin,
  type RegisteredPrismRefractTarget,
} from "./prismRefract";
import {
  PRISM_WIELD_ARM_DELAY_MS,
  createPrismWieldState,
  transitionPrismWield,
  type PrismWieldPoint,
  type PrismWieldState,
} from "./prismWield";
import type { SpeechCharacterAlignment } from "./speechRevealTimeline";
import styles from "./prismCompanion.module.css";

const PRISM_COMPANION_SYSTEM_PAUSE_REASON = "prism-companion";
const PRISM_SYSTEM_PAUSE_EXEMPT_SELECTOR =
  '[data-prism-system-pause-exempt="true"]';
const PRISM_REFRACT_TRAVEL_MS = 420;
const PRISM_REFRACT_CURSOR_ATTRIBUTE = "data-prism-refract-cursor-hidden";
const PRISM_WIELD_CURSOR_ATTRIBUTE = "data-prism-wielding";

type PrismRefractPhase =
  | "traveling"
  | "generating"
  | "ready"
  | "prompting"
  | "error";

interface PrismRefractSession {
  registration: RegisteredPrismRefractTarget;
  invocation: PrismRefractInvocation;
  phase: PrismRefractPhase;
  targetWidth: number;
  originalValue: string;
  candidateValue: string | null;
  rejectedValues: string[];
  originalAriaBusy: string | null;
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

interface PrismCompanionProps {
  accountKey: string;
  surface: PrismCompanionSurfaceReference;
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

export default function PrismCompanion({
  accountKey,
  surface,
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
  const surfaceScope = prismCompanionSurfaceScope(surface);
  const recoveryKey = useMemo(
    () => prismCompanionRecoveryStorageKey(accountKey, surface),
    // The serialized scope is the authoritative identity; callers may create
    // a fresh reference object during otherwise unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountKey, surfaceScope],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<PrismCompanionMessage[]>([]);
  const [actions, setActions] = useState<PrismCompanionActionIntent[]>([]);
  const [cards, setCards] = useState<PrismCompanionCardV1[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentRuns, setRecentRuns] = useState<PrismActionRunV1[]>([]);
  const [speechEnabled, setSpeechEnabled] = useState(() =>
    readSpeechEnabled(accountKey),
  );
  const [speechReveal, setSpeechReveal] =
    useState<PrismCompanionSpeechReveal | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inertial, setInertial] = useState(false);
  const [position, setPosition] = useState<PrismCompanionPosition>(() =>
    readPosition(accountKey),
  );
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
  const companionSuppressed = useSyncExternalStore(
    subscribePrismCompanionSuppression,
    getPrismCompanionSuppressedSnapshot,
    getPrismCompanionSuppressedServerSnapshot,
  );
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const refractPromptRef = useRef<HTMLInputElement | null>(null);
  const positionRef = useRef(position);
  const refractSessionRef = useRef<PrismRefractSession | null>(null);
  const refractReturnPositionRef = useRef<PrismCompanionPosition | null>(null);
  const refractTimerRef = useRef<number | null>(null);
  const refractTravelFrameRef = useRef<number | null>(null);
  const refractMagicHandoffFrameRef = useRef<number | null>(null);
  const refractAbortRef = useRef<AbortController | null>(null);
  const refractRunRef = useRef(0);
  const refractDropTargetRef = useRef<HTMLElement | null>(null);
  const wieldTutorialTargetRef = useRef<HTMLElement | null>(null);
  const wieldTutorialVisibleRef = useRef(false);
  const wieldTutorialStageRef = useRef<"hold" | "target" | "release">("hold");
  const wieldTutorialRunRef = useRef(false);
  const onWieldTutorialCompleteRef = useRef(onWieldTutorialComplete);
  const contextTokenIdsRef = useRef<string[]>([]);
  const refractTutorialTargetRef = useRef<HTMLElement | null>(null);
  const refractTutorialStageRef = useRef<"summon" | "reroll" | "settle">(
    "summon",
  );
  const refractTutorialRunRef = useRef(false);
  const onRefractTutorialCompleteRef = useRef(onRefractTutorialComplete);
  const wieldStateRef = useRef<PrismWieldState>(createPrismWieldState());
  const wieldArmTimerRef = useRef<number | null>(null);
  const wieldFrameRef = useRef<number | null>(null);
  const wieldLastPointerRef = useRef<PrismWieldPoint | null>(null);
  const wieldHoverTargetRef = useRef<HTMLElement | null>(null);
  const wieldReturnPositionRef = useRef<PrismCompanionPosition | null>(null);
  const wieldCaptureReturnPositionRef =
    useRef<PrismCompanionPosition | null>(null);
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
  const speechRunRef = useRef(0);
  const speechAbortRef = useRef<AbortController | null>(null);
  const speechPlaybackActiveRef = useRef(false);
  const pausedBackgroundAnimationsRef = useRef<Set<Animation>>(new Set());
  const pausedBackgroundMediaRef = useRef<Set<HTMLMediaElement>>(new Set());
  const stopSpeakingRef = useRef(onStopSpeaking);
  const dismissOnExternalInteraction =
    prismCompanionDismissesOnExternalInteraction(surface);
  const surfaceGlare = resolvePrismCompanionSurfaceGlare(position);
  const anchorStyle = {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    "--prism-orb-glare-x": `${surfaceGlare.xPct.toFixed(2)}%`,
    "--prism-orb-glare-y": `${surfaceGlare.yPct.toFixed(2)}%`,
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

  const stopInertia = useCallback(
    (persist = false): void => {
      if (inertiaFrameRef.current !== null) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
      inertiaFrameRef.current = null;
      inertiaLastTimeRef.current = null;
      inertiaVelocityRef.current = { x: 0, y: 0 };
      setInertial(false);
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
        return;
      }
      stopInertia(false);
      inertiaVelocityRef.current = boundedVelocity;
      setInertial(true);

      const step = (timeMs: number): void => {
        const previousTime = inertiaLastTimeRef.current ?? timeMs;
        inertiaLastTimeRef.current = timeMs;
        const next = stepPrismCompanionInertia({
          position: positionRef.current,
          velocity: inertiaVelocityRef.current,
          elapsedSeconds: (timeMs - previousTime) / 1_000 || 1 / 60,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
        positionRef.current = next.position;
        inertiaVelocityRef.current = next.velocity;
        setPosition(next.position);
        if (next.bounced) playPrismCompanionGlassTap();
        if (next.moving) {
          inertiaFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        inertiaFrameRef.current = null;
        inertiaLastTimeRef.current = null;
        setInertial(false);
        persistPosition(next.position);
      };

      inertiaFrameRef.current = window.requestAnimationFrame(step);
    },
    [persistPosition, stopInertia],
  );

  const clearPrismWieldHover = useCallback((): void => {
    delete wieldHoverTargetRef.current?.dataset.prismRefractWieldHover;
    wieldHoverTargetRef.current = null;
  }, []);

  const resetPrismWield = useCallback(
    (
      preserveCaptureReturn = false,
      completeTutorialOnRelease = false,
    ): void => {
      const state = wieldStateRef.current;
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
      if (wieldArmTimerRef.current !== null) {
        window.clearTimeout(wieldArmTimerRef.current);
        wieldArmTimerRef.current = null;
      }
      if (wieldFrameRef.current !== null) {
        window.cancelAnimationFrame(wieldFrameRef.current);
        wieldFrameRef.current = null;
      }
      clearPrismWieldHover();
      document.documentElement.removeAttribute(PRISM_WIELD_CURSOR_ATTRIBUTE);
      anchorRef.current?.removeAttribute("data-wielding");
      backdropRef.current?.removeAttribute("data-wielding");
      anchorRef.current?.style.removeProperty("transform");
      wieldReturnPositionRef.current = null;
      if (!preserveCaptureReturn) {
        wieldCaptureReturnPositionRef.current = null;
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
    [clearPrismWieldHover],
  );

  const flushPrismWieldFrame = useCallback((): void => {
    wieldFrameRef.current = null;
    const state = wieldStateRef.current;
    const pointer = state.pointer;
    const anchor = anchorRef.current;
    if (state.phase !== "following" || !pointer || !anchor) return;

    anchor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;

    const targetId = prismRefractTargetIdAtPoint(pointer.x, pointer.y);
    const targetElement = targetId
      ? registeredPrismRefractTarget(targetId)?.element ?? null
      : null;
    if (targetElement === wieldHoverTargetRef.current) return;
    clearPrismWieldHover();
    wieldHoverTargetRef.current = targetElement;
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
      if (wieldArmTimerRef.current !== null) {
        window.clearTimeout(wieldArmTimerRef.current);
        wieldArmTimerRef.current = null;
      }
      if (!wieldReturnPositionRef.current) {
        wieldReturnPositionRef.current = positionRef.current;
      }
      stopInertia(false);
      document.documentElement.setAttribute(
        PRISM_WIELD_CURSOR_ATTRIBUTE,
        "true",
      );
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
    [schedulePrismWieldFrame, stopInertia, updateWieldTutorialStage],
  );

  const startPrismWield = useCallback(
    (pointer: PrismWieldPoint): void => {
      const current = wieldStateRef.current;
      const next = transitionPrismWield(current, {
        type: "modifier-down",
        pointer,
      });
      if (next === current) return;
      wieldStateRef.current = next;
      const epoch = next.epoch;
      wieldArmTimerRef.current = window.setTimeout(() => {
        const beforeArm = wieldStateRef.current;
        const armed = transitionPrismWield(beforeArm, {
          type: "arm",
          epoch,
        });
        if (armed === beforeArm) return;
        wieldStateRef.current = armed;
        presentPrismWield(armed);
      }, PRISM_WIELD_ARM_DELAY_MS);
    },
    [presentPrismWield],
  );

  useLayoutEffect(() => {
    return () => {
      if (inertiaFrameRef.current !== null) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
      stopPrismCompanionGlassTapAudio();
      speechRunRef.current += 1;
      speechAbortRef.current?.abort();
      if (speechPlaybackActiveRef.current) stopSpeakingRef.current?.();
      speechPlaybackActiveRef.current = false;
      persistPosition(positionRef.current);
      resetPrismWield();
    };
  }, [persistPosition, resetPrismWield]);

  useEffect(() => {
    setSpeechEnabled(readSpeechEnabled(accountKey));
  }, [accountKey]);

  useEffect(() => {
    if (!open) {
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
  }, [open]);

  useEffect(() => {
    cancelSpeech(true);
    try {
      setMessages(
        parsePrismCompanionRecovery(window.sessionStorage.getItem(recoveryKey)),
      );
    } catch {
      setMessages([]);
    }
    setActions([]);
    setCards([]);
    contextTokenIdsRef.current = [];
    setDraft("");
    setOpen(false);
  }, [cancelSpeech, recoveryKey, surfaceScope]);

  const persistRecovery = useCallback(
    (next: readonly PrismCompanionMessage[]): PrismCompanionMessage[] => {
      const retained = retainPrismCompanionRecovery(next);
      try {
        window.sessionStorage.setItem(recoveryKey, JSON.stringify(retained));
      } catch {
        // Ephemeral chat remains usable when session storage is unavailable.
      }
      return retained;
    },
    [recoveryKey],
  );

  const openAndFocus = useCallback((): void => {
    setOpen(true);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const markRefractTarget = useCallback(
    (session: PrismRefractSession, phase: PrismRefractPhase): void => {
      const { element } = session.registration;
      element.dataset.prismRefractState = phase;
      element.setAttribute(
        "aria-busy",
        phase === "traveling" || phase === "generating" ? "true" : "false",
      );
      if (session.registration.target.kind !== "magic") {
        element.setAttribute("aria-readonly", "true");
      }
    },
    [],
  );

  const releasePrismRefract = useCallback(
    (restoreOriginal: boolean): void => {
      const session = refractSessionRef.current;
      refractRunRef.current += 1;
      refractAbortRef.current?.abort();
      refractAbortRef.current = null;
      if (refractTimerRef.current !== null) {
        window.clearTimeout(refractTimerRef.current);
        refractTimerRef.current = null;
      }
      if (refractTravelFrameRef.current !== null) {
        window.cancelAnimationFrame(refractTravelFrameRef.current);
        refractTravelFrameRef.current = null;
      }
      if (session) {
        const { element, target } = session.registration;
        if (restoreOriginal && target.kind !== "magic") {
          target.preview(session.originalValue);
        }
        delete element.dataset.prismRefractState;
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
      const returnPosition =
        refractReturnPositionRef.current ?? positionRef.current;
      refractReturnPositionRef.current = null;
      positionRef.current = returnPosition;
      setPosition(returnPosition);
      updateRefractSession(null);
      setRefractPrompt("");
      setRefractStatus("");
      if (
        session &&
        refractTutorialRunRef.current &&
        refractTutorialStageRef.current === "settle"
      ) {
        refractTutorialRunRef.current = false;
        setRefractTutorialVisible(false);
        delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
        refractTutorialTargetRef.current = null;
        onRefractTutorialCompleteRef.current?.();
      }
    },
    [updateRefractSession],
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
  }, [updateWieldTutorialStage, wieldTutorialActive]);

  useEffect(() => {
    delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
    refractTutorialTargetRef.current = null;
    refractTutorialRunRef.current = false;
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
      setRefractTutorialVisible(true);
      return true;
    };
    if (revealWhenReady()) {
      return () => {
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
      delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
      refractTutorialTargetRef.current = null;
    };
  }, [
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
      setRefractStatus(`Prism is refracting ${target.label}.`);

      if (target.kind === "choice") {
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
        const readySession = {
          ...generatingSession,
          phase: "ready" as const,
          candidateValue: choice.value,
        };
        markRefractTarget(readySession, "ready");
        updateRefractSession(readySession);
        setRefractStatus(
          `${choice.label} is ready. Space rerolls, Enter or Tab keeps it, and Escape restores.`,
        );
        return;
      }

      refractAbortRef.current?.abort();
      const controller = new AbortController();
      refractAbortRef.current = controller;
      const runId = ++refractRunRef.current;
      void target
        .generate({
          currentValue: target.read(),
          rejectedValues,
          signal: controller.signal,
        })
        .then((rawValue) => {
          if (
            controller.signal.aborted ||
            runId !== refractRunRef.current ||
            refractSessionRef.current?.registration.element !== element
          ) {
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
          const readySession = {
            ...generatingSession,
            phase: "ready" as const,
            candidateValue: value,
          };
          markRefractTarget(readySession, "ready");
          updateRefractSession(readySession);
          setRefractStatus(
            `${target.label} is ready. Space rerolls, Enter or Tab keeps it, and Escape restores.`,
          );
        })
        .catch((error) => {
          if (
            controller.signal.aborted ||
            runId !== refractRunRef.current
          ) {
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
        });
    },
    [markRefractTarget, onError, updateRefractSession],
  );

  const beginPrismRefract = useCallback(
    (
      targetId: string,
      invocation: PrismRefractInvocation,
      origin?: PrismRefractOrigin,
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
      const wieldReturnPosition =
        invocation === "wield-click"
          ? wieldCaptureReturnPositionRef.current
          : null;
      releasePrismRefract(true);
      if (invocation === "wield-click") {
        resetPrismWield(true);
      }
      setOpen(false);
      cancelSpeech(true);
      stopInertia(false);
      const returnPosition = wieldReturnPosition ?? positionRef.current;
      refractReturnPositionRef.current = returnPosition;
      wieldCaptureReturnPositionRef.current = null;
      if (invocation === "wield-click" && origin) {
        const pointerPosition = clampPrismCompanionPosition({
          x: origin.clientX / Math.max(1, window.innerWidth),
          y: origin.clientY / Math.max(1, window.innerHeight),
        });
        positionRef.current = pointerPosition;
        setPosition(pointerPosition);
      }
      const rect = registration.element.getBoundingClientRect();
      const targetPosition = clampPrismCompanionPosition({
        x: (rect.left + rect.width / 2) / Math.max(1, window.innerWidth),
        y: (rect.top + rect.height / 2) / Math.max(1, window.innerHeight),
      });
      const target = registration.target;
      const originalValue = target.kind === "magic" ? "" : target.read();
      const session: PrismRefractSession = {
        registration,
        invocation,
        phase: "traveling",
        targetWidth: rect.width,
        originalValue,
        candidateValue: null,
        rejectedValues: originalValue ? [originalValue] : [],
        originalAriaBusy: registration.element.getAttribute("aria-busy"),
        originalAriaReadonly:
          registration.element.getAttribute("aria-readonly"),
      };
      registration.element.focus({ preventScroll: true });
      markRefractTarget(session, "traveling");
      updateRefractSession(session);
      setRefractPrompt("");
      setRefractStatus(`Prism is moving into ${target.label}.`);
      if (invocation === "focused-shortcut") {
        document.documentElement.setAttribute(
          PRISM_REFRACT_CURSOR_ATTRIBUTE,
          "true",
        );
      }
      const travelMs = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 1
        : PRISM_REFRACT_TRAVEL_MS;
      const settleAtTarget = (): void => {
        refractTimerRef.current = null;
        const current = refractSessionRef.current;
        if (!current || current.registration.element !== registration.element) {
          return;
        }
        playPrismCompanionGlassTap();
        if (target.kind === "magic") {
          const promptingSession = {
            ...current,
            phase: "prompting" as const,
          };
          markRefractTarget(promptingSession, "prompting");
          updateRefractSession(promptingSession);
          document.documentElement.removeAttribute(
            PRISM_REFRACT_CURSOR_ATTRIBUTE,
          );
          setRefractStatus(
            `Tell Prism how to shape ${target.label}, then press Enter.`,
          );
          window.requestAnimationFrame(() => refractPromptRef.current?.focus());
          return;
        }
        generatePrismRefractCandidate(current);
      };
      const moveToTarget = (): void => {
        refractTravelFrameRef.current = null;
        positionRef.current = targetPosition;
        setPosition(targetPosition);
        refractTimerRef.current = window.setTimeout(settleAtTarget, travelMs);
      };
      if (travelMs === 1) {
        moveToTarget();
      } else {
        // Establish the traveling state before changing coordinates. Applying
        // both in one render makes the browser intermittently skip the flight.
        refractTravelFrameRef.current = window.requestAnimationFrame(
          moveToTarget,
        );
      }
    },
    [
      cancelSpeech,
      generatePrismRefractCandidate,
      markRefractTarget,
      releasePrismRefract,
      stopInertia,
      updateRefractSession,
      updateRefractTutorialStage,
      refractTutorialVisible,
      resetPrismWield,
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
      void Promise.resolve(target.run(direction)).catch((error) => {
        onError?.(
          error instanceof Error
            ? error.message
            : `Prism could not start ${target.label}.`,
        );
      });
    });
  }, [onError, refractPrompt, releasePrismRefract]);

  const dismissRefractTutorial = useCallback(
    (resolution: "skip" | "remind"): void => {
      refractTutorialRunRef.current = false;
      releasePrismRefract(true);
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
      if (companionSuppressed) return;
      return subscribePrismRefractRequests(({ targetId, invocation, origin }) => {
        beginPrismRefract(targetId, invocation, origin);
      });
    },
    [beginPrismRefract, companionSuppressed],
  );

  useEffect(() => {
    if (!refractSession) return;
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
      if (
        eventTarget instanceof Node &&
        session.registration.element.contains(eventTarget)
      ) {
        if (session.registration.target.kind !== "magic") {
          event.preventDefault();
          if (event.button === 0 && session.phase === "ready") {
            acceptPrismRefract();
          }
        }
        return;
      }
      releasePrismRefract(true);
    };
    const preventCapturedFieldInput = (event: InputEvent): void => {
      const session = refractSessionRef.current;
      const eventTarget = event.target;
      if (
        !session ||
        session.registration.target.kind === "magic" ||
        !(eventTarget instanceof Node) ||
        !session.registration.element.contains(eventTarget)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const restoreIfTargetUnmounts = new MutationObserver(() => {
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
    window.addEventListener("beforeinput", preventCapturedFieldInput, true);
    return () => {
      restoreIfTargetUnmounts.disconnect();
      window.removeEventListener("pointermove", revealCursor, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener(
        "beforeinput",
        preventCapturedFieldInput,
        true,
      );
    };
  }, [acceptPrismRefract, refractSession, releasePrismRefract]);

  useEffect(() => {
    return () => {
      refractRunRef.current += 1;
      refractAbortRef.current?.abort();
      if (refractTimerRef.current !== null) {
        window.clearTimeout(refractTimerRef.current);
      }
      if (refractTravelFrameRef.current !== null) {
        window.cancelAnimationFrame(refractTravelFrameRef.current);
      }
      if (refractMagicHandoffFrameRef.current !== null) {
        window.cancelAnimationFrame(refractMagicHandoffFrameRef.current);
      }
      const session = refractSessionRef.current;
      if (session) {
        const { element, target } = session.registration;
        if (target.kind !== "magic") target.preview(session.originalValue);
        delete element.dataset.prismRefractState;
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
      delete refractDropTargetRef.current?.dataset.prismRefractDropTarget;
    };
  }, []);

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
      wieldCaptureReturnPositionRef.current =
        wieldReturnPositionRef.current ?? positionRef.current;
      wieldSuppressedClickRef.current = registration.element;
      let started = false;
      try {
        started = requestPrismRefract(targetId, "wield-click", {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      } catch {
        started = false;
      }
      if (!started) {
        wieldSuppressedClickRef.current = null;
        resetPrismWield();
        return;
      }
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
      if (companionSuppressed) return;
      const refracting = refractSessionRef.current;
      if (refracting) {
        if (
          refracting.phase === "prompting" &&
          document.activeElement === refractPromptRef.current
        ) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          releasePrismRefract(true);
          return;
        }
        if (
          refracting.registration.target.kind !== "magic" &&
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
          refracting.registration.target.kind !== "magic" &&
          (event.key === "Enter" || event.key === "Tab")
        ) {
          if (refracting.phase !== "ready") {
            event.preventDefault();
            setRefractStatus("Prism is still refracting.");
            return;
          }
          if (event.key === "Enter") event.preventDefault();
          acceptPrismRefract();
          return;
        }
        if (
          refracting.registration.target.kind !== "magic" &&
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
      if (
        isPrismCompanionShortcut({
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          platform: navigator.platform,
        })
      ) {
        resetPrismWield();
        event.preventDefault();
        const targetId = focusedPrismRefractTargetId(document.activeElement);
        if (targetId && requestPrismRefract(targetId, "focused-shortcut")) {
          return;
        }
        if (open) setOpen(false);
        else openAndFocus();
        return;
      }

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
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        resetPrismWield();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (isPrismCompanionPlatformModifier(event, platform)) {
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
    open,
    openAndFocus,
    releasePrismRefract,
    resetPrismWield,
    rerollPrismRefract,
    startPrismWield,
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
    if (!content || busy) return;
    cancelSpeech(true);
    const priorMessages = messages;
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
    setMessages(persistRecovery([...priorMessages, userMessage]));
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch("/api/prism-companion", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          message: content,
          recoveryMessages: priorMessages,
          requestId,
          contextTokenIds: contextTokenIdsRef.current,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | PrismCompanionResponse
        | { ok?: false; error?: string };
      if (!response.ok || payload.ok !== true) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Prism could not answer here.",
        );
      }
      setMessages(
        persistRecovery([...priorMessages, userMessage, payload.message]),
      );
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
    } catch (error) {
      setDraft(content);
      const message =
        error instanceof Error ? error.message : "Prism could not answer here.";
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      refractSessionRef.current
    ) {
      return;
    }
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
    const next = clampPrismCompanionPosition({
      x: drag.origin.x + dx / window.innerWidth,
      y: drag.origin.y + dy / window.innerHeight,
    });
    positionRef.current = next;
    setPosition(next);
    const targetId = prismRefractTargetIdAtPoint(
      event.clientX,
      event.clientY,
    );
    const targetElement = targetId
      ? registeredPrismRefractTarget(targetId)?.element ?? null
      : null;
    if (targetElement !== refractDropTargetRef.current) {
      delete refractDropTargetRef.current?.dataset.prismRefractDropTarget;
      refractDropTargetRef.current = targetElement;
      if (targetElement) targetElement.dataset.prismRefractDropTarget = "true";
    }
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
    const dropTargetId = drag.moved
      ? prismRefractTargetIdAtPoint(event.clientX, event.clientY)
      : null;
    delete refractDropTargetRef.current?.dataset.prismRefractDropTarget;
    refractDropTargetRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have ended at a browser boundary.
    }
    if (drag.moved) {
      if (
        dropTargetId &&
        requestPrismRefract(dropTargetId, "orb-drop")
      ) {
        return;
      }
      startInertia({ x: drag.velocityX, y: drag.velocityY });
    } else {
      playPrismCompanionGlassTap();
      persistPosition(positionRef.current);
      if (open) setOpen(false);
      else openAndFocus();
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    delete refractDropTargetRef.current?.dataset.prismRefractDropTarget;
    refractDropTargetRef.current = null;
    persistPosition(positionRef.current);
  };

  useLayoutEffect(() => {
    if (!companionSuppressed) return;
    setOpen(false);
    resetPrismWield();
    setDragging(false);
    dragRef.current = null;
    releasePrismRefract(true);
    stopInertia(true);
    cancelSpeech(true);
  }, [
    cancelSpeech,
    companionSuppressed,
    releasePrismRefract,
    resetPrismWield,
    stopInertia,
  ]);

  if (typeof document === "undefined" || companionSuppressed) return null;
  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={styles.backdrop}
        data-open={open ? "true" : undefined}
        data-prism-system-pause-exempt="true"
        aria-hidden="true"
        onPointerDown={() => {
          if (dismissOnExternalInteraction) setOpen(false);
        }}
      />
      <div
        ref={anchorRef}
        className={styles.anchor}
        data-prism-system-pause-exempt="true"
        data-open={open ? "true" : undefined}
        data-dragging={dragging ? "true" : undefined}
        data-inertial={inertial ? "true" : undefined}
        data-refracting={refractSession?.phase}
        data-dock={position.x < 0.5 ? "left" : "right"}
        data-vertical={position.y < 0.48 ? "below" : "above"}
        style={anchorStyle}
      >
        <div className={styles.light} aria-hidden="true" />
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
                  ? `Wield Prism with ${modifierPresentation.modifierLabel} and click the highlighted field, focus it and use ${modifierPresentation.spokenLabel}, or drag the orb onto it.`
                  : refractTutorialStage === "reroll"
                    ? "Space refracts another candidate. It never types into the captured field."
                    : "Enter or Tab keeps the draft. Escape restores the original."}
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
          {open ? (
            <div
              className={styles.bubbleCloud}
              aria-live="polite"
              aria-label="Ephemeral conversation with Prism"
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
                return (
                  <article
                    key={message.id}
                    className={styles.bubble}
                    data-role={message.role}
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
                  >
                    <span>{message.role === "assistant" ? "Prism" : "You"}</span>
                    <div className={styles.markdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {visibleContent}
                      </ReactMarkdown>
                    </div>
                  </article>
                );
              })}
              {busy ? (
                <article className={styles.thinking} role="status">
                  <span>Prism</span>
                  <p>Refracting…</p>
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
                            {card.run.status === "committed"
                              ? "Committed"
                              : card.run.status === "undone"
                                ? "Restored"
                                : card.run.status === "failed" ||
                                    card.run.status === "undo-failed"
                                  ? card.run.error || "Action failed"
                                  : "In progress"}
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
                        <span>{run.capabilityId}</span>
                        <small>
                          {run.status} ·{" "}
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
          {open ? (
            <form
              id="global-prism-companion"
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
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
                    if (!busy && draft.trim()) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
              />
              <footer>
                <small>Ephemeral · latest 3 recover on this surface</small>
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
                  disabled={busy || !draft.trim()}
                >
                  Send
                </button>
              </footer>
            </form>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.avatar}
          data-tutorial-target="prism-companion"
          aria-label={
            refractSession
              ? `Prism is refracting ${refractSession.registration.target.label}`
              : open
                ? "Move or minimize Prism"
                : "Move or talk with Prism"
          }
          aria-expanded={open}
          aria-controls="global-prism-companion"
          aria-keyshortcuts={modifierPresentation.ariaKeyShortcuts}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          disabled={Boolean(refractSession)}
          onClick={(event) => {
            if (event.detail === 0) {
              playPrismCompanionGlassTap();
              if (open) setOpen(false);
              else openAndFocus();
            }
          }}
        >
          <PrismOrb aura={false} className={styles.orb} />
          <span className={styles.shortcut} aria-hidden="true">
            {modifierPresentation.label}
          </span>
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
