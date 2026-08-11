"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import type {
  MemoryAcquisitionSensitivity,
  MemoryEcologySettings,
} from "@localai/shared";
import pageStyles from "./page.module.css";
import styles from "./MemorySettings.module.css";

type MemoryClass = "long_term" | "short_term";

interface MemoryProseUsage {
  recordCount: number;
  proseBytes: number;
}

interface MemoryProseOverview {
  longTerm: MemoryProseUsage;
  shortTerm: MemoryProseUsage;
  derived: MemoryProseUsage;
  total: MemoryProseUsage;
}

interface MemorySettingsPayload {
  settings: MemoryEcologySettings;
  overview: MemoryProseOverview;
}

const SENSITIVITY_OPTIONS: Array<{
  value: MemoryAcquisitionSensitivity;
  label: string;
  threshold: string;
  description: string;
}> = [
  {
    value: "cautious",
    label: "Cautious",
    threshold: "70%",
    description: "Only keep the clearest useful details.",
  },
  {
    value: "balanced",
    label: "Balanced",
    threshold: "55%",
    description: "A selective, conversational middle ground.",
  },
  {
    value: "curious",
    label: "Curious",
    threshold: "40%",
    description: "Notice more possibilities; validation still applies.",
  },
];

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}

function recordLabel(count: number): string {
  return `${count.toLocaleString()} prose ${count === 1 ? "record" : "records"}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function parsePayload(payload: Record<string, unknown>): MemorySettingsPayload {
  const settings = payload.settings as MemoryEcologySettings | undefined;
  const overview = payload.overview as MemoryProseOverview | undefined;
  if (
    !settings ||
    typeof settings.learnAboutPlayer !== "boolean" ||
    typeof settings.learnAboutBots !== "boolean" ||
    !overview?.longTerm ||
    !overview.shortTerm ||
    !overview.derived ||
    !overview.total
  ) {
    throw new Error("Memory settings are unavailable.");
  }
  return { settings, overview };
}

async function loadMemorySettings(
  signal?: AbortSignal,
): Promise<MemorySettingsPayload> {
  const response = await fetch("/api/settings/memories", {
    credentials: "include",
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Memory settings are unavailable.",
    );
  }
  return parsePayload(payload);
}

async function patchMemorySettings(
  patch: Partial<MemoryEcologySettings>,
): Promise<MemoryEcologySettings> {
  const response = await fetch("/api/settings/memories", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Memory settings could not be updated.",
    );
  }
  return payload.settings as MemoryEcologySettings;
}

async function deleteMemoryClass(memoryClass: MemoryClass): Promise<number> {
  const response = await fetch(`/api/settings/memories/${memoryClass}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Memories could not be deleted.",
    );
  }
  const result = payload.result as { deletedRecords?: unknown } | undefined;
  return typeof result?.deletedRecords === "number" ? result.deletedRecords : 0;
}

export function MemorySettings(): React.JSX.Element {
  const [settings, setSettings] = useState<MemoryEcologySettings | null>(null);
  const [overview, setOverview] = useState<MemoryProseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<MemoryClass | null>(null);
  const [clearing, setClearing] = useState<MemoryClass | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const next = await loadMemorySettings(signal);
      setSettings(next.settings);
      setOverview(next.overview);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Memory settings are unavailable.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const save = async (
    patch: Partial<MemoryEcologySettings>,
    message?: string,
  ): Promise<void> => {
    if (!settings || saving) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      setSettings(await patchMemorySettings(patch));
      if (message) setNotice(message);
      if (patch.shortTermRetentionDays !== undefined) await refresh();
    } catch (caught) {
      setSettings(previous);
      setError(
        caught instanceof Error
          ? caught.message
          : "Memory settings could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmClear = async (): Promise<void> => {
    const memoryClass = pendingClear;
    if (!memoryClass || clearing) return;
    setClearing(memoryClass);
    setError(null);
    setNotice(null);
    try {
      const deleted = await deleteMemoryClass(memoryClass);
      setPendingClear(null);
      setNotice(
        `${memoryClass === "long_term" ? "Long-term" : "Short-term"} memories cleared · ${recordLabel(deleted)} deleted. Derived opinions were rechecked against what remains.`,
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Memories could not be deleted.",
      );
    } finally {
      setClearing(null);
    }
  };

  const renderUsageCard = (
    memoryClass: MemoryClass | "derived",
    usage: MemoryProseUsage,
  ): React.JSX.Element => {
    const title =
      memoryClass === "long_term"
        ? "Long-term"
        : memoryClass === "short_term"
          ? "Short-term"
          : "Derived";
    return (
      <article className={styles.usageCard} data-memory-class={memoryClass}>
        <div className={styles.usageIcon} aria-hidden="true">
          {memoryClass === "long_term" ? (
            <ShieldCheck size={19} />
          ) : memoryClass === "short_term" ? (
            <Clock3 size={19} />
          ) : (
            <Sparkles size={19} />
          )}
        </div>
        <div className={styles.usageCopy}>
          <strong>{title}</strong>
          <span>
            {memoryClass === "long_term"
              ? "Stable facts and cross-chat recall summaries."
              : memoryClass === "short_term"
                ? "Working facts that fade unless reinforced."
                : "Evidence-backed opinions that change with their sources."}
          </span>
          <div className={styles.usageNumbers}>
            <b>{formatBytes(usage.proseBytes)}</b>
            <small>{recordLabel(usage.recordCount)} · UTF-8 prose</small>
          </div>
        </div>
        {memoryClass !== "derived" ? (
          <button
            type="button"
            className={pageStyles.dangerButton}
            onClick={() => {
              setNotice(null);
              setPendingClear(memoryClass);
            }}
            disabled={usage.recordCount === 0 || clearing !== null}
          >
            Delete all {title.toLowerCase()}
          </button>
        ) : (
          <small className={styles.derivedNote}>
            Derived items are removed automatically when their evidence no longer
            supports them.
          </small>
        )}
      </article>
    );
  };

  if (loading && !settings) {
    return <div className={styles.state} role="status">Loading memory ecology…</div>;
  }

  if (!settings) {
    return (
      <div className={styles.state} data-state="error" role="alert">
        <span>{error ?? "Memory settings are unavailable."}</span>
        <button type="button" onClick={() => void refresh()}>Try again</button>
      </div>
    );
  }

  const pendingTitle = pendingClear === "long_term" ? "long-term" : "short-term";
  const pendingOther = pendingClear === "long_term" ? "short-term" : "long-term";

  return (
    <div className={`${pageStyles.settingsWorkspace} ${styles.workspace}`}>
      <section
        className={`${pageStyles.settingsSection} ${pageStyles.settingsSectionWide}`}
        data-settings-section="memory-learning"
        aria-labelledby="settings-memory-learning-title"
      >
        <header className={pageStyles.settingsSectionHeader}>
          <div>
            <span className={pageStyles.settingsEyebrow}>Learning</span>
            <h4 id="settings-memory-learning-title">What bots may learn</h4>
          </div>
          <span className={styles.automaticStatus} data-enabled={settings.learnAboutPlayer || settings.learnAboutBots}>
            {saving ? "Saving…" : settings.learnAboutPlayer || settings.learnAboutBots ? "On" : "Paused"}
          </span>
        </header>
        <p className={pageStyles.settingsCompactCopy}>
          These permissions control future automatic learning. Direct remember and
          forget requests always remain available.
        </p>
        <div className={styles.permissionGrid}>
          <label className={styles.automaticToggle}>
            <span>
              <strong>Learn about the player</strong>
              <small>Preferences, background, and useful personal continuity.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.learnAboutPlayer}
              disabled={saving}
              onChange={(event) => void save(
                { learnAboutPlayer: event.currentTarget.checked },
                event.currentTarget.checked
                  ? "Bots may learn useful details about you."
                  : "Automatic learning about you is paused.",
              )}
            />
          </label>
          <label className={styles.automaticToggle}>
            <span>
              <strong>Learn about other bots</strong>
              <small>Relationship moments noticed in Coffee and other live groups.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.learnAboutBots}
              disabled={saving}
              onChange={(event) => void save(
                { learnAboutBots: event.currentTarget.checked },
                event.currentTarget.checked
                  ? "Bots may learn from encounters with other bots."
                  : "Automatic bot-to-bot learning is paused.",
              )}
            />
          </label>
        </div>
      </section>

      <section
        className={`${pageStyles.settingsSection} ${pageStyles.settingsSectionWide}`}
        data-settings-section="memory-calibration"
        aria-labelledby="settings-memory-calibration-title"
      >
        <header className={pageStyles.settingsSectionHeader}>
          <div>
            <span className={pageStyles.settingsEyebrow}>Calibration</span>
            <h4 id="settings-memory-calibration-title">Learning and decay</h4>
          </div>
        </header>
        <p className={pageStyles.settingsCompactCopy}>
          Leniency changes what qualifies—not validation. Tasks, contradictions,
          unsupported claims, and unsafe labels are still rejected.
        </p>

        <fieldset className={styles.sensitivityFieldset} disabled={saving}>
          <legend>Learning sensitivity</legend>
          <div className={styles.sensitivityGrid}>
            {SENSITIVITY_OPTIONS.map((option) => (
              <label key={option.value} data-selected={settings.acquisitionSensitivity === option.value}>
                <input
                  type="radio"
                  name="memory-sensitivity"
                  value={option.value}
                  checked={settings.acquisitionSensitivity === option.value}
                  onChange={() => void save({ acquisitionSensitivity: option.value })}
                />
                <strong>{option.label}<span>{option.threshold}</span></strong>
                <small>{option.description}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.rangeGrid}>
          <label className={styles.rangeControl}>
            <span><strong>Short-term lifetime</strong><output>{settings.shortTermRetentionDays} days</output></span>
            <input
              type="range"
              min="1"
              max="365"
              step="1"
              value={settings.shortTermRetentionDays}
              disabled={saving}
              aria-label="Short-term memory lifetime in days"
              onChange={(event) => setSettings((current) => current ? {
                ...current,
                shortTermRetentionDays: Number(event.currentTarget.value),
              } : current)}
              onPointerUp={(event) => void save({ shortTermRetentionDays: Number(event.currentTarget.value) })}
              onKeyUp={(event) => void save({ shortTermRetentionDays: Number(event.currentTarget.value) })}
            />
            <small>Confidence falls once per elapsed day and reaches zero at the end of this window.</small>
          </label>
          <label className={styles.rangeControl}>
            <span><strong>Long-term threshold</strong><output>{Math.round(settings.longTermPromotionThreshold * 100)}%</output></span>
            <input
              type="range"
              min="70"
              max="100"
              step="1"
              value={Math.round(settings.longTermPromotionThreshold * 100)}
              disabled={saving}
              aria-label="Long-term memory confidence threshold"
              onChange={(event) => setSettings((current) => current ? {
                ...current,
                longTermPromotionThreshold: Number(event.currentTarget.value) / 100,
              } : current)}
              onPointerUp={(event) => void save({ longTermPromotionThreshold: Number(event.currentTarget.value) / 100 })}
              onKeyUp={(event) => void save({ longTermPromotionThreshold: Number(event.currentTarget.value) / 100 })}
            />
            <small>Crossing this confidence promotes a direct memory and stops decay.</small>
          </label>
          <label className={styles.rangeControl}>
            <span><strong>Opinion evidence</strong><output>{settings.inferredMinEvidenceCount} memories</output></span>
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={settings.inferredMinEvidenceCount}
              disabled={saving}
              aria-label="Minimum evidence memories for an opinion"
              onChange={(event) => setSettings((current) => current ? {
                ...current,
                inferredMinEvidenceCount: Number(event.currentTarget.value),
              } : current)}
              onPointerUp={(event) => void save({ inferredMinEvidenceCount: Number(event.currentTarget.value) })}
              onKeyUp={(event) => void save({ inferredMinEvidenceCount: Number(event.currentTarget.value) })}
            />
            <small>Evidence must also come from at least two separate exchanges.</small>
          </label>
          <label className={styles.rangeControl}>
            <span><strong>Opinion confidence</strong><output>{Math.round(settings.inferredConfidenceThreshold * 100)}%</output></span>
            <input
              type="range"
              min="60"
              max="95"
              step="1"
              value={Math.round(settings.inferredConfidenceThreshold * 100)}
              disabled={saving}
              aria-label="Minimum inferred opinion confidence"
              onChange={(event) => setSettings((current) => current ? {
                ...current,
                inferredConfidenceThreshold: Number(event.currentTarget.value) / 100,
              } : current)}
              onPointerUp={(event) => void save({ inferredConfidenceThreshold: Number(event.currentTarget.value) / 100 })}
              onKeyUp={(event) => void save({ inferredConfidenceThreshold: Number(event.currentTarget.value) / 100 })}
            />
            <small>Opinions remain a soft Derived layer and never become canonical long-term facts.</small>
          </label>
        </div>
      </section>

      <section
        className={`${pageStyles.settingsSection} ${pageStyles.settingsSectionWide}`}
        data-settings-section="memories"
        aria-labelledby="settings-memories-title"
      >
        <header className={pageStyles.settingsSectionHeader}>
          <div>
            <span className={pageStyles.settingsEyebrow}>Memory prose</span>
            <h4 id="settings-memories-title">What PRISM remembers</h4>
          </div>
          {overview ? (
            <div className={styles.total} aria-label="Total memory prose usage">
              <Brain size={16} aria-hidden="true" />
              <span>
                <strong>{formatBytes(overview.total.proseBytes)}</strong>
                <small>{recordLabel(overview.total.recordCount)} total</small>
              </span>
            </div>
          ) : null}
        </header>
        <p className={pageStyles.settingsCompactCopy}>
          Sizes count persisted UTF-8 prose—not encryption, embeddings, or database overhead.
        </p>
        {overview ? (
          <div className={styles.usageGrid}>
            {renderUsageCard("long_term", overview.longTerm)}
            {renderUsageCard("short_term", overview.shortTerm)}
            {renderUsageCard("derived", overview.derived)}
          </div>
        ) : (
          <div className={styles.state} role="status">Measuring memory prose…</div>
        )}
        {overview?.total.recordCount === 0 && !error ? (
          <div className={styles.emptyState} role="status">No persisted memory prose yet.</div>
        ) : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>

      {pendingClear ? (
        <div
          className={styles.confirmBackdrop}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !clearing) setPendingClear(null);
          }}
        >
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="memory-clear-title"
            aria-describedby="memory-clear-description"
          >
            <h2 id="memory-clear-title">Delete all {pendingTitle} memories?</h2>
            <p id="memory-clear-description">
              This permanently removes every {pendingTitle} prose record in your
              account. Your {pendingOther} memories stay untouched. Any Derived
              opinion that loses enough evidence will also disappear.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setPendingClear(null)} disabled={clearing !== null} autoFocus>
                Cancel
              </button>
              <button type="button" className={styles.confirmDelete} onClick={() => void confirmClear()} disabled={clearing !== null}>
                {clearing ? "Deleting…" : `Delete ${pendingTitle}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
