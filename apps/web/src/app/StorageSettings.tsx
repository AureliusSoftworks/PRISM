"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ImageAssetKind,
  type ImageAssetSmartTidyPreview,
  type ImageAssetStorageKindSummary,
  type ImageAssetStorageSummary,
} from "@localai/shared";
import { AssetLibraryModal } from "./AssetLibrary";
import { AudioLibraryModal } from "./AudioLibrary";
import {
  type AudioLibraryBin,
} from "./audioLibraryCatalog";
import styles from "./StorageSettings.module.css";
import pageStyles from "./page.module.css";

/** Space Lens primitives — applet taxonomy, including empty placeholders. */
const STORAGE_APPLET_ORDER = [
  "general",
  "chat",
  "debate",
  "signal",
  "slate",
  "zen",
  "coffee",
  "audio",
] as const;

type StorageAppletId = (typeof STORAGE_APPLET_ORDER)[number];

interface StorageAppletChild {
  /** Stable child id for drill tiles (kind id, or placeholder slug). */
  id: string;
  label: string;
  /** Null for unwired placeholders (e.g. Audio → Music). */
  kind: ImageAssetKind | null;
}

interface StorageAppletDef {
  id: StorageAppletId;
  label: string;
  color: string;
  /** Asset kinds owned by this primitive. Empty = placeholder (e.g. Audio). */
  kinds: readonly ImageAssetKind[];
  children: readonly StorageAppletChild[];
  /** Keep the tile on the map even when usage is zero. */
  showWhenEmpty: boolean;
}

const STORAGE_APPLETS: Record<StorageAppletId, StorageAppletDef> = {
  general: {
    id: "general",
    label: "General",
    color: "#7ec8b8",
    kinds: ["general_image"],
    children: [
      {
        id: "general_image",
        kind: "general_image",
        label: "Generated images",
      },
    ],
    showWhenEmpty: true,
  },
  chat: {
    id: "chat",
    label: "Chat",
    color: "#f472b6",
    kinds: ["home_atmosphere"],
    children: [
      {
        id: "home_atmosphere",
        kind: "home_atmosphere",
        label: "Home atmospheres",
      },
    ],
    showWhenEmpty: true,
  },
  debate: {
    id: "debate",
    label: "Debate",
    color: "#a78bfa",
    kinds: ["debate_exhibit"],
    children: [
      {
        id: "debate_exhibit",
        kind: "debate_exhibit",
        label: "Exhibits",
      },
    ],
    showWhenEmpty: true,
  },
  signal: {
    id: "signal",
    label: "Signal",
    color: "#60a5fa",
    kinds: ["signal_studio", "signal_logo"],
    children: [
      { id: "signal_studio", kind: "signal_studio", label: "Studios" },
      { id: "signal_logo", kind: "signal_logo", label: "Logos" },
    ],
    showWhenEmpty: true,
  },
  slate: {
    id: "slate",
    label: "Slate",
    color: "#f59e0b",
    kinds: ["slate_cover", "slate_visual_study"],
    children: [
      { id: "slate_cover", kind: "slate_cover", label: "Covers" },
      {
        id: "slate_visual_study",
        kind: "slate_visual_study",
        label: "Visual studies",
      },
    ],
    showWhenEmpty: true,
  },
  zen: {
    id: "zen",
    label: "Zen",
    color: "#34d399",
    kinds: ["zen_atmosphere"],
    children: [
      { id: "zen_atmosphere", kind: "zen_atmosphere", label: "Atmosphere" },
    ],
    showWhenEmpty: true,
  },
  coffee: {
    id: "coffee",
    label: "Coffee",
    color: "#c084fc",
    kinds: ["group_room_atmosphere"],
    children: [
      {
        id: "group_room_atmosphere",
        kind: "group_room_atmosphere",
        label: "Group-room atmosphere",
      },
    ],
    showWhenEmpty: true,
  },
  audio: {
    id: "audio",
    label: "Audio",
    color: "#94a3b8",
    kinds: [],
    children: [
      {
        id: "sound_effects",
        kind: null,
        label: "Sound Effects",
      },
      {
        id: "music",
        kind: null,
        label: "Music",
      },
    ],
    showWhenEmpty: true,
  },
};

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

async function loadAuditCandidateCount(): Promise<number> {
  const response = await fetch("/api/images/cleanup-preview");
  const payload = (await response.json().catch(() => null)) as
    | { preview?: { candidates?: unknown[] }; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Audit preview is unavailable.");
  }
  return Array.isArray(payload?.preview?.candidates)
    ? payload.preview.candidates.length
    : 0;
}

interface LensNode {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  bytes: number;
  count: number;
  share: number;
  /** Leaf opens a bin; branch drills into children. */
  kind: ImageAssetKind | null;
  appletId: StorageAppletId | null;
}

interface PackedTile extends LensNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Soften raw byte weights so tiny bins stay readable.
 * Floor keeps every tile large enough for a short label.
 */
function softenShares(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const powered = weights.map((weight) => Math.pow(Math.max(weight, 1), 0.46));
  const sum = powered.reduce((total, value) => total + value, 0);
  const raw = powered.map((value) => value / sum);
  const minShare = Math.min(0.14, 0.78 / weights.length);
  const floored = raw.map((value) => Math.max(value, minShare));
  const floorSum = floored.reduce((total, value) => total + value, 0);
  return floored.map((value) => value / floorSum);
}

function layoutTreemap(
  items: readonly (LensNode & { layoutWeight: number })[],
  rect: LayoutRect,
  totalWeight: number,
): Array<(LensNode & { layoutWeight: number }) & { rect: LayoutRect }> {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...items[0]!, rect }];
  }

  let splitAt = 1;
  let leftWeight = items[0]!.layoutWeight;
  let bestBalance = Math.abs(totalWeight - 2 * leftWeight);
  for (let index = 1; index < items.length - 1; index += 1) {
    leftWeight += items[index]!.layoutWeight;
    const balance = Math.abs(totalWeight - 2 * leftWeight);
    if (balance < bestBalance) {
      bestBalance = balance;
      splitAt = index + 1;
    }
  }

  const left = items.slice(0, splitAt);
  const right = items.slice(splitAt);
  const leftTotal = left.reduce((sum, entry) => sum + entry.layoutWeight, 0);
  const rightTotal = Math.max(totalWeight - leftTotal, 0.0001);
  const leftShare = leftTotal / totalWeight;

  if (rect.w >= rect.h) {
    const leftW = rect.w * leftShare;
    return [
      ...layoutTreemap(left, { x: rect.x, y: rect.y, w: leftW, h: rect.h }, leftTotal),
      ...layoutTreemap(
        right,
        { x: rect.x + leftW, y: rect.y, w: rect.w - leftW, h: rect.h },
        rightTotal,
      ),
    ];
  }

  const leftH = rect.h * leftShare;
  return [
    ...layoutTreemap(left, { x: rect.x, y: rect.y, w: rect.w, h: leftH }, leftTotal),
    ...layoutTreemap(
      right,
      { x: rect.x, y: rect.y + leftH, w: rect.w, h: rect.h - leftH },
      rightTotal,
    ),
  ];
}

function packLensNodes(nodes: readonly LensNode[]): PackedTile[] {
  if (nodes.length === 0) return [];
  const totalBytes = nodes.reduce((sum, node) => sum + node.bytes, 0);
  const shares = softenShares(nodes.map((node) => Math.max(node.bytes, node.count * 80_000, 1)));
  const weighted = nodes.map((node, index) => ({
    ...node,
    share: totalBytes > 0 ? node.bytes / totalBytes : shares[index]!,
    layoutWeight: shares[index]!,
  }));
  const pad = 1.8;
  const gutter = 1.35;
  const cells = layoutTreemap(
    weighted,
    { x: pad, y: pad, w: 100 - pad * 2, h: 100 - pad * 2 },
    1,
  );
  return cells.map((cell) => ({
    id: cell.id,
    label: cell.label,
    shortLabel: cell.shortLabel,
    color: cell.color,
    bytes: cell.bytes,
    count: cell.count,
    share: cell.share,
    kind: cell.kind,
    appletId: cell.appletId,
    x: cell.rect.x + cell.rect.w / 2,
    y: cell.rect.y + cell.rect.h / 2,
    width: Math.max(cell.rect.w - gutter, 12),
    height: Math.max(cell.rect.h - gutter, 12),
  }));
}

function summarizeKinds(
  byKind: readonly ImageAssetStorageKindSummary[],
): Map<ImageAssetKind, ImageAssetStorageKindSummary> {
  return new Map(byKind.map((entry) => [entry.kind, entry]));
}

function buildAppletNodes(
  byKind: readonly ImageAssetStorageKindSummary[],
): LensNode[] {
  const map = summarizeKinds(byKind);
  return STORAGE_APPLET_ORDER.map((appletId) => {
    const applet = STORAGE_APPLETS[appletId];
    let bytes = 0;
    let count = 0;
    for (const kind of applet.kinds) {
      const entry = map.get(kind);
      if (!entry) continue;
      bytes += entry.bytes;
      count += entry.count;
    }
    return {
      id: applet.id,
      label: applet.label,
      shortLabel: applet.label,
      color: applet.color,
      bytes,
      count,
      share: 0,
      kind:
        applet.children.length === 1 ? applet.children[0]!.kind : null,
      appletId: applet.id,
    };
  }).filter(
    (node) =>
      node.count > 0 ||
      node.bytes > 0 ||
      (node.appletId !== null && STORAGE_APPLETS[node.appletId].showWhenEmpty),
  );
}

function buildChildNodes(
  appletId: StorageAppletId,
  byKind: readonly ImageAssetStorageKindSummary[],
): LensNode[] {
  const map = summarizeKinds(byKind);
  const applet = STORAGE_APPLETS[appletId];
  return applet.children
    .map((child) => {
      const entry = child.kind ? map.get(child.kind) : undefined;
      return {
        id: `${appletId}:${child.id}`,
        label: child.label,
        shortLabel: child.label,
        color: applet.color,
        bytes: entry?.bytes ?? 0,
        count: entry?.count ?? 0,
        share: 0,
        kind: child.kind,
        appletId,
      };
    })
    .filter(
      (node) =>
        node.count > 0 || node.bytes > 0 || applet.showWhenEmpty,
    );
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
  const [kind, setKind] = useState<ImageAssetKind>("debate_exhibit");
  const [manageOpen, setManageOpen] = useState(false);
  const [audioBin, setAudioBin] = useState<AudioLibraryBin | null>(null);
  const [tidyPreview, setTidyPreview] = useState<ImageAssetSmartTidyPreview | null>(null);
  const [tidyBusy, setTidyBusy] = useState(false);
  const [tidyMessage, setTidyMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tidyCandidateCount, setTidyCandidateCount] = useState<number | null>(null);
  const [auditCandidateCount, setAuditCandidateCount] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drillAppletId, setDrillAppletId] = useState<StorageAppletId | null>(null);

  const rootNodes = useMemo(
    () => buildAppletNodes(summary?.byKind ?? []),
    [summary],
  );

  const childNodes = useMemo(
    () =>
      drillAppletId
        ? buildChildNodes(drillAppletId, summary?.byKind ?? [])
        : [],
    [drillAppletId, summary],
  );

  const lensNodes = drillAppletId ? childNodes : rootNodes;
  const tiles = useMemo(() => packLensNodes(lensNodes), [lensNodes]);
  const ranked = useMemo(
    () => [...tiles].sort((a, b) => b.bytes - a.bytes || b.count - a.count),
    [tiles],
  );
  const rootMeterShares = useMemo(
    () =>
      softenShares(
        rootNodes.map((node) => Math.max(node.bytes, node.count * 80_000, 1)),
      ),
    [rootNodes],
  );
  const maxBytes = ranked[0]?.bytes ?? 1;
  const focusTile =
    ranked.find((tile) => tile.id === focusId) ?? ranked[0] ?? null;

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const next = await loadStorage();
      setSummary(next);
      const applets = buildAppletNodes(next.byKind);
      setFocusId((current) =>
        current && applets.some((node) => node.id === current)
          ? current
          : applets[0]?.id ?? null,
      );
      setDrillAppletId((current) => {
        if (!current) return null;
        const stillActive =
          buildChildNodes(current, next.byKind).length > 0 ||
          STORAGE_APPLETS[current].showWhenEmpty;
        return stillActive ? current : null;
      });
      const [tidy, audit] = await Promise.all([
        loadSmartTidyPreview().catch(() => null),
        loadAuditCandidateCount().catch(() => null),
      ]);
      setTidyCandidateCount(tidy?.candidateCount ?? 0);
      setAuditCandidateCount(audit ?? 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storage usage is unavailable.");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const openKind = (next: ImageAssetKind): void => {
    setKind(next);
    setManageOpen(true);
  };

  const openAudioBin = (next: AudioLibraryBin): void => {
    setAudioBin(next);
  };

  const activateNode = (node: LensNode): void => {
    setFocusId(node.id);
    if (node.kind) {
      openKind(node.kind);
      return;
    }
    if (!node.appletId) return;
    // Audio child placeholders open the browse + play library.
    if (node.appletId === "audio" && node.id !== node.appletId) {
      if (node.id.endsWith(":sound_effects")) {
        openAudioBin("sound_effects");
        return;
      }
      if (node.id.endsWith(":music")) {
        openAudioBin("music");
        return;
      }
    }
    // Root primitive tile (id matches applet) can drill into child types.
    if (node.id !== node.appletId) return;
    const applet = STORAGE_APPLETS[node.appletId];
    if (applet.children.length === 1 && applet.children[0]?.kind) {
      openKind(applet.children[0].kind);
      return;
    }
    if (applet.children.length > 1) {
      setDrillAppletId(node.appletId);
      setFocusId(null);
    }
  };

  const openSmartTidy = async (): Promise<void> => {
    if (tidyCandidateCount === 0) return;
    setTidyMessage(null);
    setTidyBusy(true);
    try {
      const preview = await loadSmartTidyPreview();
      setTidyPreview(preview);
      setTidyCandidateCount(preview.candidateCount);
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

  const tidyDisabled = tidyBusy || tidyCandidateCount === 0;
  const auditDisabled = auditBusy || auditCandidateCount === 0;
  const libraryTotal = summary?.activeBytes ?? 0;
  const drillLabel = drillAppletId ? STORAGE_APPLETS[drillAppletId].label : null;

  return (
    <section
      className={`${pageStyles.settingsSection} ${pageStyles.settingsSectionWide} ${styles.shell}`}
      data-settings-section="storage"
      aria-labelledby="settings-storage-title"
    >
      <header className={pageStyles.settingsSectionHeader}>
        <div>
          <span className={pageStyles.settingsEyebrow}>Library</span>
          <h4 id="settings-storage-title">Space Lens</h4>
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
        Storage by primitive. Larger tiles hold more space — click a tile to open
        its bin, or drill into Signal and Slate for their asset types. Audio is
        for synthesized or uploaded clips only — not built-in product foley.
      </p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {tidyMessage ? <p className={styles.tidyMessage} role="status">{tidyMessage}</p> : null}

      <div className={styles.meter} data-settings-target="storage-totals">
        <div className={styles.meterTrack}>
          {rootNodes.map((node, index) => (
            <span
              key={node.id}
              className={styles.meterSegment}
              style={{
                width: `${Math.max((rootMeterShares[index] ?? 0) * 100, node.bytes > 0 ? 2 : 0)}%`,
                background: node.color,
                opacity:
                  !drillAppletId || drillAppletId === node.appletId ? 1 : 0.45,
              }}
              title={`${node.label}: ${formatBytes(node.bytes)}`}
            />
          ))}
        </div>
        <div className={styles.meterLegend}>
          <strong>{summary ? formatBytes(libraryTotal) : "—"}</strong>
          <span>
            {summary?.totalAssetCount ?? 0} reusable · hot{" "}
            {summary ? formatBytes(summary.hotBytes ?? 0) : "—"} · cold{" "}
            {summary ? formatBytes(summary.coldBytes ?? 0) : "—"}
          </span>
        </div>
      </div>

      <div
        className={styles.spaceLens}
        data-settings-target="storage-kinds"
        aria-label="Storage space lens"
      >
        <div className={styles.spaceLensList} role="list">
          {drillAppletId ? (
            <button
              type="button"
              className={styles.backRow}
              onClick={() => {
                setDrillAppletId(null);
                setFocusId(drillAppletId);
              }}
            >
              ← All applets
            </button>
          ) : null}
          {ranked.map((tile) => {
            const active = focusTile?.id === tile.id;
            return (
              <button
                key={tile.id}
                type="button"
                role="listitem"
                className={styles.spaceLensRow}
                data-active={active ? "true" : undefined}
                style={{ ["--orb-color" as string]: tile.color }}
                onMouseEnter={() => setFocusId(tile.id)}
                onFocus={() => setFocusId(tile.id)}
                onClick={() => activateNode(tile)}
              >
                <span className={styles.spaceLensSwatch} aria-hidden="true" />
                <span className={styles.spaceLensRowCopy}>
                  <strong>{tile.label}</strong>
                  <small>
                    {tile.count} asset{tile.count === 1 ? "" : "s"}
                    {tile.id === tile.appletId &&
                    tile.appletId &&
                    STORAGE_APPLETS[tile.appletId].children.length > 1
                      ? " · open types"
                      : tile.appletId === "audio" && tile.id !== tile.appletId
                        ? " · browse & play"
                        : !tile.kind && tile.id !== tile.appletId
                          ? " · coming soon"
                          : ""}
                  </small>
                </span>
                <span className={styles.spaceLensRowMeta}>
                  <strong>{formatBytes(tile.bytes)}</strong>
                  <span
                    className={styles.spaceLensBar}
                    aria-hidden="true"
                    style={{
                      width: `${Math.max(10, (tile.bytes / Math.max(maxBytes, 1)) * 100)}%`,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.spaceLensField}>
          {drillLabel ? (
            <div className={styles.lensBreadcrumb}>
              <button
                type="button"
                className={styles.crumbButton}
                onClick={() => {
                  setDrillAppletId(null);
                  setFocusId(drillAppletId);
                }}
              >
                Applets
              </button>
              <span aria-hidden="true">/</span>
              <strong>{drillLabel}</strong>
            </div>
          ) : null}
          <div className={styles.spaceLensGlow} aria-hidden="true" />
          {tiles.map((tile, index) => {
            const active = focusTile?.id === tile.id;
            const dimmed = focusId !== null && !active;
            return (
              <button
                key={tile.id}
                type="button"
                className={styles.spaceOrb}
                data-selected={active ? "true" : undefined}
                data-dimmed={dimmed ? "true" : undefined}
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.width}%`,
                  height: `${tile.height}%`,
                  ["--orb-color" as string]: tile.color,
                  ["--orb-delay" as string]: `${index * 35}ms`,
                  zIndex: active ? 12 : Math.round(tile.width + tile.height),
                }}
                onMouseEnter={() => setFocusId(tile.id)}
                onFocus={() => setFocusId(tile.id)}
                onClick={() => activateNode(tile)}
                aria-label={
                  tile.kind
                    ? `${tile.label}: ${tile.count} assets, ${formatBytes(tile.bytes)}. Click to open.`
                    : `${tile.label}: ${tile.count} assets, ${formatBytes(tile.bytes)}. Click to view types.`
                }
                title={tile.kind ? "Open this bin" : "View asset types"}
              >
                <span className={styles.spaceOrbCore} aria-hidden="true" />
                <span className={styles.spaceOrbLabel}>
                  <strong>{tile.shortLabel}</strong>
                  <small>{formatBytes(tile.bytes)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.carePanel} data-settings-target="storage-actions">
        <div>
          <span className={styles.focusEyebrow}>Library care</span>
          <p>
            Two different cleanups: <strong>Smart tidy</strong> looks for old,
            low-reuse library assets Prism thinks you abandoned.{" "}
            <strong>Audit unused</strong> finds system-managed orphans with no
            remaining references (separate from Clear unused inside a bin).
          </p>
        </div>
        <div className={styles.careActions}>
          <button
            type="button"
            className={styles.actionTidy}
            data-settings-action="storage-smart-tidy"
            onClick={() => void openSmartTidy()}
            disabled={tidyDisabled}
            title={
              tidyCandidateCount === 0
                ? "No abandoned library assets to tidy right now."
                : "Review abandoned, low-reuse library assets."
            }
          >
            {tidyBusy
              ? "Working…"
              : tidyCandidateCount === 0
                ? "Smart tidy · none"
                : `Smart tidy · ${tidyCandidateCount}`}
          </button>
          <button
            type="button"
            className={styles.actionAudit}
            data-settings-action="storage-audit-unused"
            onClick={onAuditUnused}
            disabled={auditDisabled}
            title={
              auditCandidateCount === 0
                ? "No unprotected system orphans to audit."
                : "Audit unreferenced system-managed media."
            }
          >
            {auditBusy
              ? "Auditing…"
              : auditCandidateCount === 0
                ? "Audit unused · none"
                : `Audit unused · ${auditCandidateCount}`}
          </button>
        </div>
      </div>

      {summary ? (
        <div className={styles.quietStats}>
          <span>Recovery trash {formatBytes(summary.recoveryTrashBytes)}</span>
          <span>
            Undo history{" "}
            {formatBytes(
              (summary.revisionBytes ?? 0) + (summary.compressRevisionBytes ?? 0),
            )}
          </span>
          {summary.systemManagedBytes > 0 ? (
            <span>
              {formatBytes(summary.systemManagedBytes)} system-managed (out of reusable rails)
            </span>
          ) : null}
        </div>
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
                <li>
                  …and {tidyPreview.candidateCount - tidyPreview.sampleTitles.length} more
                </li>
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
      {audioBin ? (
        <AudioLibraryModal
          bin={audioBin}
          onClose={() => setAudioBin(null)}
        />
      ) : null}
    </section>
  );
}
