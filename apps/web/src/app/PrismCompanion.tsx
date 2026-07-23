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
import type { SpeechCharacterAlignment } from "./speechRevealTimeline";
import styles from "./prismCompanion.module.css";

const PRISM_COMPANION_SYSTEM_PAUSE_REASON = "prism-companion";
const PRISM_SYSTEM_PAUSE_EXEMPT_SELECTOR =
  '[data-prism-system-pause-exempt="true"]';

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
  const companionSuppressed = useSyncExternalStore(
    subscribePrismCompanionSuppression,
    getPrismCompanionSuppressedSnapshot,
    getPrismCompanionSuppressedServerSnapshot,
  );
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const positionRef = useRef(position);
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
  } as CSSProperties;

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    stopSpeakingRef.current = onStopSpeaking;
  }, [onStopSpeaking]);

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
      if (open) setOpen(false);
      else openAndFocus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [companionSuppressed, open, openAndFocus]);

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
    if (event.button !== 0 || event.isPrimary === false) return;
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
      if (open) setOpen(false);
      else openAndFocus();
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    persistPosition(positionRef.current);
  };

  useEffect(() => {
    if (!companionSuppressed) return;
    setOpen(false);
    setDragging(false);
    dragRef.current = null;
    stopInertia(true);
    cancelSpeech(true);
  }, [cancelSpeech, companionSuppressed, stopInertia]);

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
        data-dock={position.x < 0.5 ? "left" : "right"}
        data-vertical={position.y < 0.48 ? "below" : "above"}
        style={anchorStyle}
      >
        <div className={styles.light} aria-hidden="true" />
        <div className={styles.conversation}>
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
            open ? "Move or minimize Prism" : "Move or talk with Prism"
          }
          aria-expanded={open}
          aria-controls="global-prism-companion"
          aria-keyshortcuts="Alt+Space Control+Space"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
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
      </div>
    </>,
    document.body,
  );
}
