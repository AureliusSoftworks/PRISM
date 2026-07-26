"use client";

import {
  useCallback,
  useEffect,
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
  PrismCompanionActionIntent,
  PrismCompanionMessage,
  PrismCompanionResponse,
  PrismCompanionSurfaceReference,
} from "@localai/shared";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import {
  isPrismCompanionShortcut,
  parsePrismCompanionRecovery,
  parsePrismCompanionSpeechEnabled,
  prismCompanionDismissesOnExternalInteraction,
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
  type RegisteredPrismRefractTarget,
} from "./prismRefract";
import type { SpeechCharacterAlignment } from "./speechRevealTimeline";
import styles from "./prismCompanion.module.css";

const PRISM_COMPANION_SYSTEM_PAUSE_REASON = "prism-companion";
const PRISM_SYSTEM_PAUSE_EXEMPT_SELECTOR =
  '[data-prism-system-pause-exempt="true"]';
const PRISM_REFRACT_TRAVEL_MS = 420;
const PRISM_REFRACT_CURSOR_ATTRIBUTE = "data-prism-refract-cursor-hidden";

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
  const [refractTutorialVisible, setRefractTutorialVisible] = useState(false);
  const [refractTutorialStage, setRefractTutorialStage] = useState<
    "summon" | "reroll" | "settle"
  >("summon");
  const companionSuppressed = useSyncExternalStore(
    subscribePrismCompanionSuppression,
    getPrismCompanionSuppressedSnapshot,
    getPrismCompanionSuppressedServerSnapshot,
  );
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const refractPromptRef = useRef<HTMLInputElement | null>(null);
  const positionRef = useRef(position);
  const refractSessionRef = useRef<PrismRefractSession | null>(null);
  const refractReturnPositionRef = useRef<PrismCompanionPosition | null>(null);
  const refractTimerRef = useRef<number | null>(null);
  const refractTravelFrameRef = useRef<number | null>(null);
  const refractAbortRef = useRef<AbortController | null>(null);
  const refractRunRef = useRef(0);
  const refractDropTargetRef = useRef<HTMLElement | null>(null);
  const refractTutorialTargetRef = useRef<HTMLElement | null>(null);
  const refractTutorialStageRef = useRef<"summon" | "reroll" | "settle">(
    "summon",
  );
  const refractTutorialRunRef = useRef(false);
  const onRefractTutorialCompleteRef = useRef(onRefractTutorialComplete);
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

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    stopSpeakingRef.current = onStopSpeaking;
  }, [onStopSpeaking]);

  useEffect(() => {
    onRefractTutorialCompleteRef.current = onRefractTutorialComplete;
  }, [onRefractTutorialComplete]);

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

  useEffect(() => {
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
    };
  }, [persistPosition]);

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
      if (!session) return;
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
      const { element, target } = session.registration;
      if (restoreOriginal && target.kind !== "magic") {
        target.preview(session.originalValue);
      }
      delete element.dataset.prismRefractState;
      if (session.originalAriaBusy === null) element.removeAttribute("aria-busy");
      else element.setAttribute("aria-busy", session.originalAriaBusy);
      if (session.originalAriaReadonly === null) {
        element.removeAttribute("aria-readonly");
      } else {
        element.setAttribute("aria-readonly", session.originalAriaReadonly);
      }
      document.documentElement.removeAttribute(PRISM_REFRACT_CURSOR_ATTRIBUTE);
      const returnPosition =
        refractReturnPositionRef.current ?? positionRef.current;
      refractReturnPositionRef.current = null;
      positionRef.current = returnPosition;
      setPosition(returnPosition);
      updateRefractSession(null);
      setRefractPrompt("");
      setRefractStatus("");
      if (
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

  useEffect(() => {
    releasePrismRefract(true);
  }, [releasePrismRefract, surfaceScope]);

  useEffect(() => {
    delete refractTutorialTargetRef.current?.dataset.prismRefractTutorial;
    refractTutorialTargetRef.current = null;
    refractTutorialRunRef.current = false;
    setRefractTutorialVisible(false);
    updateRefractTutorialStage("summon");
    if (!refractTutorialActive || surface.surfaceId !== "signal") return;
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
    (targetId: string, invocation: PrismRefractInvocation): void => {
      const registration = registeredPrismRefractTarget(targetId);
      if (!registration || registration.target.disabled?.()) return;
      if (
        refractTutorialVisible &&
        refractTutorialStageRef.current === "summon"
      ) {
        refractTutorialRunRef.current = true;
        updateRefractTutorialStage("reroll");
      }
      releasePrismRefract(true);
      setOpen(false);
      cancelSpeech(true);
      stopInertia(false);
      const returnPosition = positionRef.current;
      refractReturnPositionRef.current = returnPosition;
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
    void Promise.resolve(target.run(direction)).catch((error) => {
      onError?.(
        error instanceof Error
          ? error.message
          : `Prism could not start ${target.label}.`,
      );
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

  useEffect(
    () => {
      if (companionSuppressed) return;
      return subscribePrismRefractRequests(({ targetId, invocation }) => {
        beginPrismRefract(targetId, invocation);
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
      if (
        !isPrismCompanionShortcut({
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          platform: navigator.platform,
        })
      ) {
        return;
      }
      event.preventDefault();
      const targetId = focusedPrismRefractTargetId(document.activeElement);
      if (targetId && requestPrismRefract(targetId, "focused-shortcut")) {
        return;
      }
      if (open) setOpen(false);
      else openAndFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    acceptPrismRefract,
    companionSuppressed,
    open,
    openAndFocus,
    releasePrismRefract,
    rerollPrismRefract,
  ]);

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
    setMessages(persistRecovery([...priorMessages, userMessage]));
    try {
      const response = await fetch("/api/prism-companion", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          message: content,
          recoveryMessages: priorMessages,
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

  useEffect(() => {
    if (!companionSuppressed) return;
    setOpen(false);
    setDragging(false);
    dragRef.current = null;
    releasePrismRefract(true);
    stopInertia(true);
    cancelSpeech(true);
  }, [
    cancelSpeech,
    companionSuppressed,
    releasePrismRefract,
    stopInertia,
  ]);

  if (typeof document === "undefined" || companionSuppressed) return null;
  return createPortal(
    <>
      <div
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
                  ? "Shift-click the highlighted field, focus it and use the Prism shortcut, or drag the orb onto it."
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
          aria-keyshortcuts="Alt+Space Control+Space"
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
            ⌥/Ctrl Space
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
      <style>{`html[${PRISM_REFRACT_CURSOR_ATTRIBUTE}="true"], html[${PRISM_REFRACT_CURSOR_ATTRIBUTE}="true"] * { cursor: none !important; }`}</style>
    </>,
    document.body,
  );
}
