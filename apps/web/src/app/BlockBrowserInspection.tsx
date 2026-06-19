"use client";

import { useEffect } from "react";
import {
  shouldBlockBrowserKeyboardShortcut,
  shouldBlockBrowserWheelShortcut,
} from "./browserShortcutGuards";

/**
 * Soft barrier against browser-chrome shortcuts in the kiosk-like Prism
 * surface. Determined users can still bypass (menu bar, remote debugging,
 * etc.). Set NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS=1 to disable during browser
 * tooling sessions.
 */
export function BlockBrowserInspection(): null {
  const enabled = process.env.NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS !== "1";

  useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (e: MouseEvent) => {
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
    };
  }, [enabled]);

  return null;
}
