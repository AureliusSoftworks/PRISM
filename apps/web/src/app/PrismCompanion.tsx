"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import type {
  EphemeralChatResolvedProvider,
  PrismCapabilityId,
  PrismCompanionActionIntent,
  PrismCompanionMessage,
  PrismCompanionResponse,
  PrismCompanionSurfaceReference,
} from "@localai/shared";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import {
  isPrismCompanionShortcut,
  parsePrismCompanionRecovery,
  prismCompanionPositionStorageKey,
  prismCompanionRecoveryStorageKey,
  prismCompanionSurfaceScope,
  retainPrismCompanionRecovery,
} from "./prismCompanionState";
import styles from "./prismCompanion.module.css";

interface PrismCompanionPosition {
  x: number;
  y: number;
}

interface PrismCompanionProps {
  accountKey: string;
  surface: PrismCompanionSurfaceReference;
  onAction: (action: PrismCompanionActionIntent) => void | Promise<void>;
  onSpeak?: (
    text: string,
    provider: EphemeralChatResolvedProvider,
  ) => void | Promise<void>;
  onError?: (message: string) => void;
  onCapabilitiesRevealed?: (capabilities: PrismCapabilityId[]) => void;
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
      return {
        x: Math.max(0.05, Math.min(0.95, value.x)),
        y: Math.max(0.12, Math.min(0.92, value.y)),
      };
    }
  } catch {
    // Device-local placement is disposable.
  }
  return { x: 0.92, y: 0.84 };
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
  onError,
  onCapabilitiesRevealed,
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
  const [position, setPosition] = useState<PrismCompanionPosition>(() =>
    readPosition(accountKey),
  );
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const positionRef = useRef(position);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PrismCompanionPosition;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
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
  }, [recoveryKey, surfaceScope]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !isPrismCompanionShortcut({
          key: event.key,
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
  }, [open, openAndFocus]);

  const sendMessage = async (): Promise<void> => {
    const content = draft.trim();
    if (!content || busy) return;
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
      if (payload.revealedCapabilities.length > 0) {
        onCapabilitiesRevealed?.(payload.revealedCapabilities);
      }
      if (onSpeak) void onSpeak(payload.message.content, payload.provider);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: positionRef.current,
      moved: false,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    const next = {
      x: Math.max(0.05, Math.min(0.95, drag.origin.x + dx / window.innerWidth)),
      y: Math.max(0.12, Math.min(0.92, drag.origin.y + dy / window.innerHeight)),
    };
    positionRef.current = next;
    setPosition(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    try {
      window.localStorage.setItem(
        prismCompanionPositionStorageKey(accountKey),
        JSON.stringify(positionRef.current),
      );
    } catch {
      // Device-local placement is disposable.
    }
    if (!drag.moved) {
      if (open) setOpen(false);
      else openAndFocus();
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={styles.anchor}
      data-open={open ? "true" : undefined}
      data-dock={position.x < 0.5 ? "left" : "right"}
      data-vertical={position.y < 0.48 ? "below" : "above"}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
    >
      <div className={styles.light} aria-hidden="true" />
      <div className={styles.conversation}>
        {open ? (
          <div
            className={styles.bubbleCloud}
            aria-live="polite"
            aria-label="Ephemeral conversation with Prism"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={styles.bubble}
                data-role={message.role}
              >
                <span>{message.role === "assistant" ? "Prism" : "You"}</span>
                <div className={styles.markdown}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              </article>
            ))}
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
                  if (!busy && draft.trim()) event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <footer>
              <small>Ephemeral · latest 3 recover on this surface</small>
              <button type="submit" disabled={busy || !draft.trim()}>
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
        aria-label={open ? "Move or minimize Prism" : "Move or talk with Prism"}
        aria-expanded={open}
        aria-controls="global-prism-companion"
        aria-keyshortcuts="Alt+Space Control+Space"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            if (open) setOpen(false);
            else openAndFocus();
          }
        }}
      >
        <span className={styles.orb} aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <path d="M16 5.2 27 25H5Z" />
          </svg>
        </span>
        <span className={styles.shortcut} aria-hidden="true">
          ⌥/Ctrl Space
        </span>
      </button>
    </div>,
    document.body,
  );
}
