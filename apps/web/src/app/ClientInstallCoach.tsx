"use client";

import { Bookmark, Download, Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveInstallCoachContent,
  type InstallCoachContent,
  type InstallCoachEnvironment,
} from "./installCoach";
import styles from "./page.module.css";

const INSTALL_COACH_DISMISSED_KEY = "prism.clientInstallCoach.dismissed.v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_COACH_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function iconForKind(kind: InstallCoachContent["kind"]): React.ReactElement {
  if (kind === "android-install") return <Download size={18} aria-hidden="true" />;
  if (kind === "desktop-bookmark") return <Bookmark size={18} aria-hidden="true" />;
  return <Share2 size={18} aria-hidden="true" />;
}

export function ClientInstallCoach(): React.ReactElement | null {
  const [browserEnv, setBrowserEnv] =
    useState<Omit<InstallCoachEnvironment, "dismissed" | "hasBeforeInstallPrompt"> | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setDismissed(readDismissed());
      setBrowserEnv({
        origin: window.location.origin,
        userAgent: window.navigator.userAgent,
        platform: window.navigator.platform,
        maxTouchPoints: window.navigator.maxTouchPoints,
        standalone: isStandalone(),
      });
    }, 0);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const content = useMemo(() => {
    if (installed || !browserEnv) return null;
    return resolveInstallCoachContent({
      ...browserEnv,
      dismissed,
      hasBeforeInstallPrompt: deferredPrompt !== null,
    });
  }, [browserEnv, deferredPrompt, dismissed, installed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_COACH_DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable; ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice?.catch(() => null);
    if (choice?.outcome === "accepted") {
      dismiss();
    }
    setDeferredPrompt(null);
  }, [deferredPrompt, dismiss]);

  if (!content) return null;

  return (
    <aside className={styles.installCoach} aria-label="Save Prism on this device">
      <div className={styles.installCoachIcon}>{iconForKind(content.kind)}</div>
      <div className={styles.installCoachCopy}>
        <strong>{content.title}</strong>
        <p>{content.body}</p>
      </div>
      <div className={styles.installCoachActions}>
        {content.actionLabel && (
          <button type="button" className={styles.installCoachPrimary} onClick={() => void install()}>
            {content.actionLabel}
          </button>
        )}
        <button
          type="button"
          className={styles.installCoachDismiss}
          onClick={dismiss}
          aria-label="Dismiss save Prism tip"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
