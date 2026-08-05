"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IMAGE_ASSET_KINDS,
  IMAGE_ASSET_KIND_LABELS,
  type ImageAssetKind,
  type ImageAssetStorageSummary,
} from "@localai/shared";
import { AssetLibraryModal } from "./AssetLibrary";
import styles from "./StorageSettings.module.css";

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

  return (
    <section className={styles.shell} data-settings-section="storage" aria-labelledby="settings-storage-title">
      <header>
        <div>
          <span>Storage</span>
          <h4 id="settings-storage-title">Local asset library</h4>
        </div>
        <button type="button" onClick={() => void refresh()}>Refresh</button>
      </header>
      <p>
        Originals, thumbnails, and encrypted magenta-pass Undo history stay on
        this device. Shared files are counted once, and active project
        references remain protected.
      </p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.totals}>
        <article>
          <small>Library total</small>
          <strong>{summary ? formatBytes(summary.activeBytes) : "—"}</strong>
          <span>{summary?.totalAssetCount ?? 0} reusable sets</span>
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
          <small>Magenta Undo history</small>
          <strong>{summary ? formatBytes(summary.revisionBytes) : "—"}</strong>
          <span>Removed as each pass is undone</span>
        </article>
      </div>
      <div className={styles.kindList}>
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
      <div className={styles.actions}>
        <label>
          <span>Manage asset type</span>
          <select value={kind} onChange={(event) => setKind(event.currentTarget.value as ImageAssetKind)}>
            {IMAGE_ASSET_KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>{IMAGE_ASSET_KIND_LABELS[candidate]}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setManageOpen(true)}>Manage assets</button>
        <button type="button" onClick={onAuditUnused} disabled={auditBusy}>
          {auditBusy ? "Auditing…" : "Audit unused assets"}
        </button>
      </div>
      {summary && summary.systemManagedBytes > 0 ? (
        <small className={styles.systemManaged}>
          {formatBytes(summary.systemManagedBytes)} is system-managed media such
          as derivatives and automatic Coffee surfaces; it stays out of reusable rails.
        </small>
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
