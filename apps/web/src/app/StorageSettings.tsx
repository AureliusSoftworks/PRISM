"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IMAGE_ASSET_KINDS,
  IMAGE_ASSET_KIND_LABELS,
  type ImageAssetKind,
  type ImageAssetSmartTidyPreview,
  type ImageAssetStorageSummary,
} from "@localai/shared";
import { AssetLibraryModal } from "./AssetLibrary";
import styles from "./StorageSettings.module.css";
import pageStyles from "./page.module.css";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}

async function loadStorage(): Promise<ImageAssetStorageSummary> {
  const response = await fetch("/api/assets/storage");
  const payload = (await response.json().catch(() => null)) as
    | { storage?: ImageAssetStorageSummary; error?: string }
    | null;
  if (!response.ok || !payload?.storage) {
    throw new Error(payload?.error ?? "Storage usage is unavailable.");
  }
  return payload.storage;
}

async function loadSmartTidyPreview(): Promise<ImageAssetSmartTidyPreview> {
  const response = await fetch("/api/assets/smart-tidy/preview");
  const payload = (await response.json().catch(() => null)) as
    | { preview?: ImageAssetSmartTidyPreview; error?: string }
    | null;
  if (!response.ok || !payload?.preview) {
    throw new Error(payload?.error ?? "Smart tidy preview is unavailable.");
  }
  return payload.preview;
}

export function StorageSettings({
  onAuditUnused,
  auditBusy = false,
}: {
  onAuditUnused: () => void;
  auditBusy?: boolean;
}) {
  const [summary, setSummary] = useState<ImageAssetStorageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ImageAssetKind>("general_image");
  const [manageOpen, setManageOpen] = useState(false);
  const [tidyPreview, setTidyPreview] = useState<ImageAssetSmartTidyPreview | null>(null);
  const [tidyBusy, setTidyBusy] = useState(false);
  const [tidyMessage, setTidyMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setSummary(await loadStorage());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storage usage is unavailable.");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const openSmartTidy = async (): Promise<void> => {
    setTidyMessage(null);
    setTidyBusy(true);
    try {
      setTidyPreview(await loadSmartTidyPreview());
      setReviewOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Smart tidy preview failed.");
    } finally {
      setTidyBusy(false);
    }
  };

  const confirmSmartTidy = async (): Promise<void> => {
    if (!tidyPreview || tidyPreview.candidateCount === 0) {
      setTidyPreview(null);
      return;
    }
    setTidyBusy(true);
    try {
      const response = await fetch("/api/assets/smart-tidy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetSetIds: tidyPreview.assetSetIds }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            result?: { deletedCount: number; recoveryBytes: number };
            error?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Smart tidy failed.");
      }
      const deleted = payload?.result?.deletedCount ?? 0;
      const bytes = payload?.result?.recoveryBytes ?? 0;
      setTidyMessage(
        deleted > 0
          ? `Moved ${deleted} asset${deleted === 1 ? "" : "s"} (${formatBytes(bytes)}) to recovery trash.`
          : "Nothing could be moved right now — some assets may still be referenced.",
      );
      setTidyPreview(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Smart tidy failed.");
    } finally {
      setTidyBusy(false);
    }
  };

  return (
    <section
      className={`${pageStyles.settingsSection} ${pageStyles.settingsSectionWide} ${styles.shell}`}
      data-settings-section="storage"
      aria-labelledby="settings-storage-title"
    >
      <header className={pageStyles.settingsSectionHeader}>
        <div>
          <span className={pageStyles.settingsEyebrow}>Library</span>
          <h4 id="settings-storage-title">Local asset library</h4>
        </div>
        <div className={pageStyles.settingsSectionHeaderAside}>
          <button
            type="button"
            className={pageStyles.linkButton}
            data-settings-action="storage-refresh"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </header>
      <p className={pageStyles.settingsSectionHint}>
        Originals, cold copies, thumbnails, and Undo history stay on this
        device. Prism protects active and frequently reused assets, and can
        quietly cold-store the rest until you need them.
      </p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {tidyMessage ? <p className={styles.tidyMessage} role="status">{tidyMessage}</p> : null}
      <div className={styles.totals} data-settings-target="storage-totals">
        <article>
          <small>Library total</small>
          <strong>{summary ? formatBytes(summary.activeBytes) : "—"}</strong>
          <span>{summary?.totalAssetCount ?? 0} reusable sets</span>
        </article>
        <article>
          <small>Hot</small>
          <strong>{summary ? formatBytes(summary.hotBytes ?? 0) : "—"}</strong>
          <span>Ready to edit</span>
        </article>
        <article>
          <small>Cold</small>
          <strong>{summary ? formatBytes(summary.coldBytes ?? 0) : "—"}</strong>
          <span>Fidelity-preserving WebP</span>
        </article>
        <article>
          <small>Generated</small>
          <strong>{summary ? formatBytes(summary.generatedBytes) : "—"}</strong>
        </article>
        <article>
          <small>Uploaded</small>
          <strong>{summary ? formatBytes(summary.uploadedBytes) : "—"}</strong>
        </article>
        <article>
          <small>Recovery trash</small>
          <strong>{summary ? formatBytes(summary.recoveryTrashBytes) : "—"}</strong>
          <span>Available to Undo until purged</span>
        </article>
        <article>
          <small>Magenta Undo</small>
          <strong>{summary ? formatBytes(summary.revisionBytes) : "—"}</strong>
        </article>
        <article>
          <small>Compress Undo</small>
          <strong>{summary ? formatBytes(summary.compressRevisionBytes ?? 0) : "—"}</strong>
        </article>
      </div>
      <div className={styles.kindList} data-settings-target="storage-kinds">
        {(summary?.byKind ?? []).map((entry) => (
          <button
            key={entry.kind}
            type="button"
            onClick={() => {
              setKind(entry.kind);
              setManageOpen(true);
            }}
          >
            <span>
              <strong>{IMAGE_ASSET_KIND_LABELS[entry.kind]}</strong>
              <small>{entry.count} assets</small>
            </span>
            <span>{formatBytes(entry.bytes)}</span>
          </button>
        ))}
      </div>
      <div className={styles.actions} data-settings-target="storage-actions">
        <label>
          <span>Manage asset type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.currentTarget.value as ImageAssetKind)}
          >
            {IMAGE_ASSET_KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {IMAGE_ASSET_KIND_LABELS[candidate]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-settings-action="storage-manage"
          onClick={() => setManageOpen(true)}
        >
          Manage assets
        </button>
        <button
          type="button"
          data-settings-action="storage-smart-tidy"
          onClick={() => void openSmartTidy()}
          disabled={tidyBusy}
        >
          {tidyBusy ? "Working…" : "Smart tidy"}
        </button>
        <button
          type="button"
          data-settings-action="storage-audit-unused"
          onClick={onAuditUnused}
          disabled={auditBusy}
        >
          {auditBusy ? "Auditing…" : "Audit unused assets"}
        </button>
      </div>
      {summary && summary.systemManagedBytes > 0 ? (
        <small className={styles.systemManaged}>
          {formatBytes(summary.systemManagedBytes)} is system-managed media such
          as derivatives and automatic Coffee surfaces; it stays out of reusable rails.
        </small>
      ) : null}

      {tidyPreview ? (
        <div
          className={styles.tidyPanel}
          role="dialog"
          aria-labelledby="smart-tidy-title"
          data-settings-target="storage-smart-tidy-dialog"
        >
          <header>
            <div>
              <span className={pageStyles.settingsEyebrow}>Smart tidy</span>
              <h5 id="smart-tidy-title">Curated junk Prism can clear</h5>
            </div>
            <button
              type="button"
              className={pageStyles.linkButton}
              onClick={() => setTidyPreview(null)}
              disabled={tidyBusy}
            >
              Not now
            </button>
          </header>
          <p>
            {tidyPreview.candidateCount === 0
              ? "Nothing looks abandoned right now. Frequently reused assets stay protected."
              : `${tidyPreview.candidateCount} asset${tidyPreview.candidateCount === 1 ? "" : "s"} · about ${formatBytes(tidyPreview.reclaimableBytes)}. They move to recovery trash first.`}
          </p>
          {tidyPreview.protectedHighReuseCount > 0 ? (
            <small className={styles.systemManaged}>
              {tidyPreview.protectedHighReuseCount} frequently reused sets stayed protected.
            </small>
          ) : null}
          {reviewOpen && tidyPreview.sampleTitles.length > 0 ? (
            <ul className={styles.tidySamples}>
              {tidyPreview.sampleTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
              {tidyPreview.candidateCount > tidyPreview.sampleTitles.length ? (
                <li>…and {tidyPreview.candidateCount - tidyPreview.sampleTitles.length} more</li>
              ) : null}
            </ul>
          ) : null}
          <div className={styles.tidyActions}>
            {tidyPreview.candidateCount > 0 ? (
              <>
                <button
                  type="button"
                  className={pageStyles.linkButton}
                  onClick={() => setReviewOpen((value) => !value)}
                  disabled={tidyBusy}
                >
                  {reviewOpen ? "Hide samples" : "Review individually"}
                </button>
                <button
                  type="button"
                  className={pageStyles.btnPrimary}
                  onClick={() => void confirmSmartTidy()}
                  disabled={tidyBusy}
                >
                  {tidyBusy ? "Clearing…" : "Clear curated junk"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={pageStyles.btnPrimary}
                onClick={() => setTidyPreview(null)}
              >
                Done
              </button>
            )}
          </div>
        </div>
      ) : null}

      {manageOpen ? (
        <AssetLibraryModal
          kind={kind}
          includeIncomplete
          allowDelete
          onClose={() => {
            setManageOpen(false);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}
