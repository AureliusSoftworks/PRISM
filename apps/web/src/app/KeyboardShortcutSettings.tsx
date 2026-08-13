"use client";

import { useMemo, useState } from "react";
import { shouldBlockBrowserKeyboardShortcut } from "./browserShortcutGuards";
import {
  PRISM_KEYBOARD_SHORTCUT_DEFINITIONS,
  defaultPrismKeyboardShortcuts,
  keyboardShortcutConflictAction,
  keyboardShortcutDisplay,
  keyboardShortcutFromEvent,
  type PrismKeyboardShortcutAction,
  type PrismKeyboardShortcutPreferencesV1,
} from "./keyboardShortcuts";
import styles from "./page.module.css";

interface KeyboardShortcutSettingsProps {
  platform: string;
  value: PrismKeyboardShortcutPreferencesV1;
  onChange: (next: PrismKeyboardShortcutPreferencesV1) => void;
}

export function KeyboardShortcutSettings({
  platform,
  value,
  onChange,
}: KeyboardShortcutSettingsProps): React.JSX.Element {
  const [recording, setRecording] =
    useState<PrismKeyboardShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const definitionsByAction = useMemo(
    () =>
      new Map(
        PRISM_KEYBOARD_SHORTCUT_DEFINITIONS.map((definition) => [
          definition.action,
          definition,
        ]),
      ),
    [],
  );

  const stopRecording = (): void => {
    setRecording(null);
    setError(null);
  };

  return (
    <div className={`${styles.form} ${styles.settingsWorkspace}`}>
      <div className={styles.settingsSectionGrid}>
        <section
          className={`${styles.settingsSection} ${styles.settingsSectionWide}`}
          data-settings-section="shortcuts"
          aria-labelledby="settings-shortcuts-title"
        >
          <header className={styles.settingsSectionHeader}>
            <div>
              <span className={styles.settingsEyebrow}>Controls</span>
              <h4 id="settings-shortcuts-title">Keyboard shortcuts</h4>
            </div>
            <div className={styles.settingsSectionHeaderAside}>
              <small>Saved immediately on this device.</small>
            </div>
          </header>
          <p className={styles.keyboardShortcutIntro}>
            Select a shortcut, then press a new key combination. Shortcuts must
            include Shift, Control, Option/Alt, or Command/Meta.
          </p>
          <div className={styles.keyboardShortcutList}>
            {PRISM_KEYBOARD_SHORTCUT_DEFINITIONS.map((definition) => {
              const isRecording = recording === definition.action;
              return (
                <div
                  key={definition.action}
                  className={styles.keyboardShortcutRow}
                  data-recording={isRecording ? "true" : undefined}
                >
                  <span className={styles.keyboardShortcutCopy}>
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                  <button
                    type="button"
                    className={styles.keyboardShortcutRecorder}
                    data-keyboard-shortcut-recorder="true"
                    aria-label={`${isRecording ? "Recording" : "Change"} ${definition.label} shortcut`}
                    onClick={() => {
                      setRecording(definition.action);
                      setError(null);
                    }}
                    onBlur={() => {
                      if (isRecording) stopRecording();
                    }}
                    onKeyDown={(event) => {
                      if (!isRecording) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.key === "Escape") {
                        stopRecording();
                        return;
                      }
                      if (event.key === "Backspace" || event.key === "Delete") {
                        onChange({ ...value, [definition.action]: null });
                        stopRecording();
                        return;
                      }
                      const shortcut = keyboardShortcutFromEvent(event);
                      if (!shortcut) {
                        if (
                          event.key !== "Shift" &&
                          event.key !== "Control" &&
                          event.key !== "Alt" &&
                          event.key !== "Meta"
                        ) {
                          setError("Use at least one modifier key.");
                        }
                        return;
                      }
                      if (
                        shouldBlockBrowserKeyboardShortcut({
                          key: event.key,
                          code: event.code,
                          altKey: event.altKey,
                          ctrlKey: event.ctrlKey,
                          metaKey: event.metaKey,
                          shiftKey: event.shiftKey,
                          targetIsEditable: true,
                        })
                      ) {
                        setError(
                          "That combination is reserved by the browser or operating system.",
                        );
                        return;
                      }
                      const conflict = keyboardShortcutConflictAction(
                        value,
                        definition.action,
                        shortcut,
                      );
                      if (conflict) {
                        const label = definitionsByAction.get(conflict)?.label;
                        setError(`Already used by ${label ?? "another action"}.`);
                        return;
                      }
                      onChange({ ...value, [definition.action]: shortcut });
                      stopRecording();
                    }}
                  >
                    <kbd>
                      {isRecording
                        ? "Press shortcut…"
                        : keyboardShortcutDisplay(
                            value[definition.action],
                            platform,
                          )}
                    </kbd>
                  </button>
                </div>
              );
            })}
          </div>
          {error ? (
            <p className={styles.keyboardShortcutError} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.keyboardShortcutFooter}>
            <small>
              Backspace or Delete clears a shortcut. Escape cancels recording.
            </small>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                onChange(defaultPrismKeyboardShortcuts(platform));
                stopRecording();
              }}
            >
              Restore defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
