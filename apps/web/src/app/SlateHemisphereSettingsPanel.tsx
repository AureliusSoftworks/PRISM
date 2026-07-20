"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SlateAiProvider,
  SlateDeliberationConfig,
  SlateDeliberationHemisphereConfig,
} from "@localai/shared";
import {
  emptySlateDeliberationConfig,
  type SlateHemisphereModelOption,
  type SlateHemisphereSettingsSnapshot,
} from "./slateHemisphereSettings";
import styles from "./page.module.css";

const INHERIT_MODEL_VALUE = "inherit";

function modelChoiceValue(model: SlateHemisphereModelOption): string {
  return `${model.provider}:${model.id}`;
}

function configModelChoiceValue(
  config: SlateDeliberationHemisphereConfig,
): string {
  return config.provider && config.model
    ? `${config.provider}:${config.model}`
    : INHERIT_MODEL_VALUE;
}

function configWithModelChoice(
  current: SlateDeliberationHemisphereConfig,
  choice: string,
): SlateDeliberationHemisphereConfig {
  if (choice === INHERIT_MODEL_VALUE) {
    return { ...current, provider: null, model: null };
  }
  const separator = choice.indexOf(":");
  return {
    ...current,
    provider: choice.slice(0, separator) as SlateAiProvider,
    model: choice.slice(separator + 1),
  };
}

function normalizedConfig(config: SlateDeliberationConfig): SlateDeliberationConfig {
  return {
    lux: { ...config.lux, directive: config.lux.directive.trim() },
    umbra: { ...config.umbra, directive: config.umbra.directive.trim() },
  };
}

interface SlateHemisphereSettingsPanelProps {
  snapshot: SlateHemisphereSettingsSnapshot | null;
  saving: boolean;
  error: string | null;
  onSave: (config: SlateDeliberationConfig) => Promise<void>;
}

export function SlateHemisphereSettingsPanel({
  snapshot,
  saving,
  error,
  onSave,
}: SlateHemisphereSettingsPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState<SlateDeliberationConfig>(
    emptySlateDeliberationConfig,
  );

  useEffect(() => {
    setDraft(snapshot?.config ?? emptySlateDeliberationConfig());
  }, [snapshot?.config, snapshot?.projectId]);

  const savedConfig = snapshot?.config ?? emptySlateDeliberationConfig();
  const dirty = useMemo(
    () => JSON.stringify(normalizedConfig(draft)) !== JSON.stringify(savedConfig),
    [draft, savedConfig],
  );

  const updateHemisphere = (
    hemisphere: "lux" | "umbra",
    next: SlateDeliberationHemisphereConfig,
  ): void => {
    setDraft((current) => ({ ...current, [hemisphere]: next }));
  };

  const renderHemisphere = (
    hemisphere: "lux" | "umbra",
    title: string,
    subtitle: string,
    placeholder: string,
  ): React.JSX.Element => {
    const current = draft[hemisphere];
    const selectedValue = configModelChoiceValue(current);
    const selectedIsMissing =
      selectedValue !== INHERIT_MODEL_VALUE &&
      !snapshot?.modelOptions.some(
        (model) => modelChoiceValue(model) === selectedValue,
      );
    return (
      <article
        className={styles.settingsHemisphereCard}
        data-hemisphere={hemisphere}
      >
        <header className={styles.settingsHemisphereHeader}>
          <span aria-hidden="true">{hemisphere === "lux" ? "▲" : "▽"}</span>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </header>
        <label className={styles.settingsHemisphereField}>
          <span>Thinking model</span>
          <select
            value={selectedValue}
            disabled={!snapshot || saving}
            onChange={(event) =>
              updateHemisphere(
                hemisphere,
                configWithModelChoice(current, event.target.value),
              )
            }
          >
            <option value={INHERIT_MODEL_VALUE}>
              Inherit project prose route
            </option>
            {selectedIsMissing ? (
              <option value={selectedValue} disabled>
                {current.model} · unavailable in this route
              </option>
            ) : null}
            {(snapshot?.modelOptions ?? []).map((model) => (
              <option
                key={modelChoiceValue(model)}
                value={modelChoiceValue(model)}
                disabled={Boolean(model.disabledReason)}
              >
                {model.label} · {model.provider === "local" ? "offline" : model.provider}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.settingsHemisphereField}>
          <span>Creative lens</span>
          <textarea
            rows={4}
            maxLength={4_000}
            value={current.directive}
            disabled={!snapshot || saving}
            placeholder={placeholder}
            onChange={(event) =>
              updateHemisphere(hemisphere, {
                ...current,
                directive: event.target.value,
              })
            }
          />
        </label>
      </article>
    );
  };

  return (
    <section
      className={`${styles.settingsSection} ${styles.settingsSectionWide}`}
      data-settings-section="slate-hemispheres"
      aria-labelledby="slate-hemisphere-settings-title"
    >
      <header className={styles.settingsSectionHeader}>
        <div>
          <span className={styles.settingsEyebrow}>Inner dialogue</span>
          <h4 id="slate-hemisphere-settings-title">Lux &amp; Umbra</h4>
        </div>
        <div className={styles.settingsSectionHeaderAside}>
          <small>
            {snapshot
              ? `Project · ${snapshot.projectTitle}`
              : "Open a Slate project to configure"}
          </small>
        </div>
      </header>
      <p className={styles.settingsCompactCopy}>
        Give each side its own model and project-specific creative emphasis.
        Their core roles stay intact: Lux proposes what could live; Umbra tests
        what can survive. Both remain advisory and inherit this project’s
        {snapshot ? ` ${snapshot.proseMode.toUpperCase()}` : ""} privacy route.
      </p>
      <div className={styles.settingsHemisphereGrid}>
        {renderHemisphere(
          "lux",
          "Lux",
          "Generative · luminous · protective",
          "What should Lux protect, amplify, or keep emotionally true?",
        )}
        {renderHemisphere(
          "umbra",
          "Umbra",
          "Adversarial · shadowed · exacting",
          "What should Umbra challenge, distrust, or refuse to let slide?",
        )}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.settingsHemisphereActions}>
        <span>
          {snapshot
            ? dirty
              ? "Unsaved hemisphere changes"
              : "Hemisphere settings are saved with this project."
            : "Choose a project from the Slate writing desk first."}
        </span>
        <button
          type="button"
          disabled={!snapshot || saving || !dirty}
          onClick={() => void onSave(normalizedConfig(draft))}
        >
          {saving ? "Saving…" : "Save hemispheres"}
        </button>
      </div>
    </section>
  );
}
