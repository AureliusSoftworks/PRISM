"use client";

import { useEffect } from "react";
import {
  shouldBlockBrowserKeyboardShortcut,
  shouldBlockBrowserMouseShortcut,
  shouldBlockBrowserWheelShortcut,
} from "./browserShortcutGuards";
import { closestTextEditingTarget } from "./editableTextContextMenuModel";

const PRISM_HISTORY_GUARD_STATE_KEY = "__prismHistoryGuard";
const BROWSER_MOUSE_NAVIGATION_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "auxclick",
] as const;

function prismHistoryGuardState(state: unknown): unknown {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    return {
      ...(state as Record<string, unknown>),
      [PRISM_HISTORY_GUARD_STATE_KEY]: true,
    };
  }
  return { [PRISM_HISTORY_GUARD_STATE_KEY]: true };
}

/**
 * Soft barrier against browser-chrome shortcuts in the kiosk-like Prism
 * surface. Determined users can still bypass (menu bar, remote debugging,
 * etc.). Set NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS=1 to disable during browser
 * tooling sessions.
 */
export function BlockBrowserInspection(): null {
  const enabled = process.env.NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS !== "1";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    const guardedPushState: History["pushState"] = (state, title, url) => {
      originalPushState(prismHistoryGuardState(state), title, url);
    };
    const guardedReplaceState: History["replaceState"] = (state, title, url) => {
      originalReplaceState(prismHistoryGuardState(state), title, url);
    };
    const parkCurrentHistoryEntry = (): void => {
      try {
        originalPushState(
          prismHistoryGuardState(window.history.state),
          "",
          window.location.href
        );
      } catch {
        /* Browser history can be unavailable in unusual embedded contexts. */
      }
    };

    window.history.replaceState = guardedReplaceState;
    window.history.pushState = guardedPushState;
    try {
      originalReplaceState(
        prismHistoryGuardState(window.history.state),
        "",
        window.location.href
      );
      parkCurrentHistoryEntry();
    } catch {
      /* Best effort: normal mouse-event blocking still runs below. */
    }

    const onPopState = (event: PopStateEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.setTimeout(parkCurrentHistoryEntry, 0);
    };

    window.addEventListener("popstate", onPopState, { capture: true });
    return () => {
      window.removeEventListener("popstate", onPopState, { capture: true });
      if (window.history.pushState === guardedPushState) {
        window.history.pushState = originalPushState;
      }
      if (window.history.replaceState === guardedReplaceState) {
        window.history.replaceState = originalReplaceState;
      }
    };
  }, []);

  useEffect(() => {
    const onMouseNavigation = (e: MouseEvent) => {
      if (
        shouldBlockBrowserMouseShortcut({
          button: e.button,
          defaultPrevented: e.defaultPrevented,
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    for (const eventName of BROWSER_MOUSE_NAVIGATION_EVENTS) {
      window.addEventListener(eventName, onMouseNavigation, {
        capture: true,
        passive: false,
      });
      document.addEventListener(eventName, onMouseNavigation, {
        capture: true,
        passive: false,
      });
    }

    if (!enabled) {
      return () => {
        for (const eventName of BROWSER_MOUSE_NAVIGATION_EVENTS) {
          window.removeEventListener(eventName, onMouseNavigation, { capture: true });
          document.removeEventListener(eventName, onMouseNavigation, { capture: true });
        }
      };
    }

    const onContextMenu = (e: MouseEvent) => {
      if (closestTextEditingTarget(e.target)) return;
      e.preventDefault();
    };

    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']"
        )
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        shouldBlockBrowserKeyboardShortcut({
          key: e.key,
          code: e.code,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          defaultPrevented: e.defaultPrevented,
          targetIsEditable: isEditableTarget(e.target),
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (
        shouldBlockBrowserWheelShortcut({
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          defaultPrevented: e.defaultPrevented,
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("wheel", onWheel, { capture: true });
      for (const eventName of BROWSER_MOUSE_NAVIGATION_EVENTS) {
        window.removeEventListener(eventName, onMouseNavigation, { capture: true });
        document.removeEventListener(eventName, onMouseNavigation, { capture: true });
      }
    };
  }, [enabled]);

  return null;
}
