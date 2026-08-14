"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { holdAppNavbarForControlShortcuts } from "./appNavbarChrome";
import {
  CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS,
  controlShortcutGuideEntries,
  controlShortcutGuideShouldShow,
  isControlHeldAlone,
  isControlKeyEvent,
  isOptionHeldAlone,
  isOptionKeyEvent,
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
  const [optionHeld, setOptionHeld] = useState(false);
  const [prismWielding, setPrismWielding] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [visible, setVisible] = useState(false);
  const optionHeldRef = useRef(false);

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
      if (isOptionKeyEvent(event) || isOptionHeldAlone(event)) {
        const nextOptionHeld = isOptionHeldAlone(event);
        optionHeldRef.current = nextOptionHeld;
        setOptionHeld(nextOptionHeld);
        if (!nextOptionHeld) setPrismWielding(false);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      setRecordingShortcut(keyboardShortcutEventIsRecording(event));
      if (isControlKeyEvent(event) || !event.ctrlKey) {
        setControlHeld(false);
      } else {
        setControlHeld(isControlHeldAlone(event));
      }
      if (isOptionKeyEvent(event) || !event.altKey) {
        optionHeldRef.current = false;
        setOptionHeld(false);
        setPrismWielding(false);
      } else {
        const nextOptionHeld = isOptionHeldAlone(event);
        optionHeldRef.current = nextOptionHeld;
        setOptionHeld(nextOptionHeld);
      }
    };
    const onPointerMove = (): void => {
      if (!optionHeldRef.current) return;
      if (document.documentElement.hasAttribute("data-prism-wielding")) {
        setPrismWielding(true);
      }
    };
    const clear = (): void => {
      setControlHeld(false);
      optionHeldRef.current = false;
      setOptionHeld(false);
      setPrismWielding(false);
      setRecordingShortcut(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  useEffect(() => {
    const shouldShow = controlShortcutGuideShouldShow({
      controlHeld,
      optionHeld,
      prismWielding,
      recordingShortcut,
    });
    if (!shouldShow) {
      setVisible(false);
      return;
    }
    // Control keeps its immediate chrome reveal. A stationary Option hold is
    // completely quiet until the delayed Legend itself becomes visible.
    let releaseNavbar = controlHeld
      ? holdAppNavbarForControlShortcuts()
      : null;
    const timer = window.setTimeout(() => {
      releaseNavbar ??= holdAppNavbarForControlShortcuts();
      setVisible(true);
    }, CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      releaseNavbar?.();
    };
  }, [controlHeld, optionHeld, prismWielding, recordingShortcut]);

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
      <span className={styles.title}>PRISM shortcuts</span>
      <span className={styles.shortcuts}>
        {controlRootEntries.map((entry) => (
          <GuideChip key={entry.action} entry={entry} />
        ))}
      </span>
    </div>,
    document.body,
  );
}
