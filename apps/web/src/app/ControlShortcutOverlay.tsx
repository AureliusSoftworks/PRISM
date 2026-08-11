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
  readPrismCompanionOrbAnchor,
  type ControlShortcutGuideEntry,
  type PrismCompanionOrbAnchor,
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

export function ControlShortcutGuide({
  platform,
  shortcuts,
}: ControlShortcutGuideProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  const [controlHeld, setControlHeld] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [visible, setVisible] = useState(false);
  const [orbAnchor, setOrbAnchor] = useState<PrismCompanionOrbAnchor | null>(
    null,
  );
  const guideRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

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

  useEffect(() => {
    const tracking = controlShortcutGuideShouldShow({
      controlHeld,
      prismWielding: false,
      recordingShortcut,
    });
    if (!tracking) {
      setOrbAnchor(null);
      return;
    }
    const syncOrb = (): void => {
      const next = readPrismCompanionOrbAnchor();
      setOrbAnchor((current) => {
        if (
          current &&
          next &&
          Math.abs(current.x - next.x) < 0.5 &&
          Math.abs(current.y - next.y) < 0.5 &&
          Math.abs(current.size - next.size) < 0.5
        ) {
          return current;
        }
        return next;
      });
      const node = guideRef.current;
      if (node && next) {
        node.style.setProperty("--orb-x", `${next.x}px`);
        node.style.setProperty("--orb-y", `${next.y}px`);
        node.style.setProperty("--orb-size", `${next.size}px`);
      }
      frameRef.current = window.requestAnimationFrame(syncOrb);
    };
    frameRef.current = window.requestAnimationFrame(syncOrb);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [controlHeld, recordingShortcut]);

  if (!mounted || typeof document === "undefined" || entries.length === 0) {
    return null;
  }

  const bySlot = (slot: ControlShortcutGuideEntry["slot"]) =>
    entries.filter((entry) => entry.slot === slot);

  return createPortal(
    <div
      ref={guideRef}
      className={styles.guide}
      data-prism-control-shortcut-guide="true"
      data-visible={visible ? "true" : undefined}
      data-orb-missing={orbAnchor ? undefined : "true"}
      role="status"
      aria-live="polite"
      aria-hidden={visible ? undefined : "true"}
    >
      <div className={styles.compass} aria-hidden="true">
        <div className={styles.slotUp}>
          {bySlot("up").map((entry) => (
            <GuideChip key={entry.action} entry={entry} />
          ))}
        </div>
        <div className={styles.slotLeft}>
          {bySlot("left").map((entry) => (
            <GuideChip key={entry.action} entry={entry} />
          ))}
        </div>
        <div className={styles.slotHub} aria-hidden="true" />
        <div className={styles.slotRight}>
          {bySlot("right").map((entry) => (
            <GuideChip key={entry.action} entry={entry} />
          ))}
        </div>
        <div className={styles.slotDown}>
          {bySlot("down").map((entry) => (
            <GuideChip key={entry.action} entry={entry} />
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        {bySlot("footer").map((entry) => (
          <GuideChip key={entry.action} entry={entry} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
