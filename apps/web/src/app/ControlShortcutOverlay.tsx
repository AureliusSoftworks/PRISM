"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { holdAppNavbarForControlShortcuts } from "./appNavbarChrome";
import {
  CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS,
  controlShortcutGuideEntries,
  controlShortcutGuideShouldShow,
  isControlHeldAlone,
  isControlKeyEvent,
  type ControlShortcutGuideEntry,
} from "./controlShortcutGuide";
import {
  keyboardShortcutEventIsRecording,
  type PrismKeyboardShortcutPreferencesV1,
} from "./keyboardShortcuts";
import styles from "./ControlShortcutGuide.module.css";

interface ControlShortcutGuideProps {
  platform: string;
  shortcuts: PrismKeyboardShortcutPreferencesV1;
}

function GuideChip({
  entry,
}: {
  entry: ControlShortcutGuideEntry;
}): React.JSX.Element {
  return (
    <span className={styles.chip} data-action={entry.action}>
      <kbd className={styles.chipKbd}>{entry.display}</kbd>
      <span className={styles.chipLabel}>{entry.label}</span>
    </span>
  );
}

const CONTROL_ROOT_ACTIONS = new Set<ControlShortcutGuideEntry["action"]>([
  "turbo",
  "modelPicker",
  "effortPicker",
  "speechType",
]);

export function ControlShortcutGuide({
  platform,
  shortcuts,
}: ControlShortcutGuideProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  const [controlHeld, setControlHeld] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [visible, setVisible] = useState(false);

  const entries = useMemo(
    () => controlShortcutGuideEntries(shortcuts, platform),
    [platform, shortcuts],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      setRecordingShortcut(keyboardShortcutEventIsRecording(event));
      if (isControlKeyEvent(event) || isControlHeldAlone(event)) {
        setControlHeld(isControlHeldAlone(event));
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      setRecordingShortcut(keyboardShortcutEventIsRecording(event));
      if (isControlKeyEvent(event) || !event.ctrlKey) {
        setControlHeld(false);
      } else {
        setControlHeld(isControlHeldAlone(event));
      }
    };
    const clear = (): void => {
      setControlHeld(false);
      setRecordingShortcut(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  useEffect(() => {
    const shouldShow = controlShortcutGuideShouldShow({
      controlHeld,
      prismWielding: false,
      recordingShortcut,
    });
    if (!shouldShow) {
      setVisible(false);
      return;
    }
    // Reveal the navbar immediately — never flash shortcut UI over a tucked bar.
    const releaseNavbar = holdAppNavbarForControlShortcuts();
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      releaseNavbar();
    };
  }, [controlHeld, recordingShortcut]);

  if (!mounted || typeof document === "undefined" || entries.length === 0) {
    return null;
  }

  const controlRootEntries = entries.filter((entry) =>
    CONTROL_ROOT_ACTIONS.has(entry.action),
  );

  return createPortal(
    <div
      className={styles.guide}
      data-prism-control-shortcut-guide="true"
      data-visible={visible ? "true" : undefined}
      role="status"
      aria-live="polite"
      aria-hidden={visible ? undefined : "true"}
    >
      <span className={styles.title}>Control shortcuts</span>
      <span className={styles.shortcuts}>
        {controlRootEntries.map((entry) => (
          <GuideChip key={entry.action} entry={entry} />
        ))}
      </span>
    </div>,
    document.body,
  );
}
