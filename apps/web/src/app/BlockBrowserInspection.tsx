"use client";

import { useEffect } from "react";

/**
 * Soft barrier against opening browser DevTools / Inspect via shortcuts or the
 * context menu. Determined users can still bypass (menu bar, remote debugging,
 * etc.). Does not run in development or when NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS=1.
 */
export function BlockBrowserInspection(): null {
  const enabled =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ALLOW_BROWSER_DEVTOOLS !== "1";

  useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const { key, ctrlKey, shiftKey, metaKey, altKey } = e;
      const k = key.length === 1 ? key.toUpperCase() : key;

      if (k === "F12") {
        e.preventDefault();
        return;
      }

      // Chromium / Edge / Firefox: Ctrl+Shift+I / J / C / K
      if (ctrlKey && shiftKey && ["I", "J", "C", "K"].includes(k)) {
        e.preventDefault();
        return;
      }

      // macOS Chromium: Cmd+Option+I / J / C
      if (metaKey && altKey && ["I", "J", "C"].includes(k)) {
        e.preventDefault();
        return;
      }

      // View source
      if (ctrlKey && k === "U") {
        e.preventDefault();
        return;
      }
      if (metaKey && altKey && k === "U") {
        e.preventDefault();
        return;
      }
    };

    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [enabled]);

  return null;
}
