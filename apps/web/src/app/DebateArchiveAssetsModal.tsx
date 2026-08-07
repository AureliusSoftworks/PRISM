"use client";

import { useEffect, useMemo, useState } from "react";
import type { DebateEvidenceExhibitV1, DebateSessionListItemV1 } from "@localai/shared";
import {
  PrismRefractTarget,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import {
  DebateExhibitMagentaControls,
  type DebateExhibitMagentaState,
} from "./DebateExhibitMagentaControls";
import styles from "./DebateExperience.module.css";

export interface DebateArchiveExhibitRow {
  exhibit: DebateEvidenceExhibitV1;
  assetSetId: string | null;
  magentaPassCount: number;
  magentaUndoAvailable: boolean;
  imageCacheKey?: string;
}

function exhibitImageUrl(
  exhibit: DebateEvidenceExhibitV1,
  cacheKey?: string,
): string | null {
  if (exhibit.visualKind === "emoji" || !exhibit.imageId) return null;
  const base = `/api/images/${encodeURIComponent(exhibit.imageId)}/file`;
  return cacheKey ? `${base}?v=${encodeURIComponent(cacheKey)}` : base;
}

/** Busy keys must include the debate id — bare exhibit-1… collide across sessions. */
export function archiveExhibitBusyKey(
  debateSessionId: string,
  exhibitId: string,
): string {
  return `${debateSessionId}:${exhibitId}`;
}

export function DebateArchiveAssetsModal(props: {
  session: DebateSessionListItemV1;
  rows: DebateArchiveExhibitRow[];
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  synthesizingExhibitIds: ReadonlySet<string>;
  onClose: () => void;
  onRetry: () => void;
  onSynthesize: (exhibit: DebateEvidenceExhibitV1, direction: string) => void;
  onMagenta: (
    exhibitId: string,
    next: DebateExhibitMagentaState & { updatedAt: string },
  ) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  return (
    <div
      className={styles.confirmBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.busy) {
          props.onClose();
        }
      }}
    >
      <section
        className={styles.archiveAssetsDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-archive-assets-title"
        data-tutorial-target="debate-archive-assets"
      >
        <header className={styles.archiveAssetsHeader}>
          <div>
            <p className={styles.eyebrow}>Proceeding assets</p>
            <h2 id="debate-archive-assets-title">{props.session.title}</h2>
            <p>
              Soft re-synthesize exhibit sprites with Prism, or reduce magenta
              locally. Emoji stays as the stage fallback until a sprite lands.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.busy}
            aria-label="Close exhibit assets"
          >
            ×
          </button>
        </header>
        {props.loading ? (
          <p className={styles.archiveAssetsStatus} role="status">
            Loading exhibits…
          </p>
        ) : props.loadError ? (
          <div className={styles.archiveAssetsStatus} role="alert">
            <p>{props.loadError}</p>
            <button type="button" onClick={props.onRetry}>
              Retry
            </button>
          </div>
        ) : props.rows.length === 0 ? (
          <p className={styles.archiveAssetsStatus}>
            This proceeding has no exhibits.
          </p>
        ) : (
          <ul className={styles.archiveAssetsList} aria-label="Debate exhibits">
            {props.rows.map((row) => {
              const busyKey = archiveExhibitBusyKey(
                props.session.id,
                row.exhibit.id,
              );
              const synthesizing = props.synthesizingExhibitIds.has(busyKey);
              return (
              <ArchiveExhibitAssetCard
                key={row.exhibit.id}
                sessionId={props.session.id}
                row={row}
                busy={props.busy}
                synthesizing={synthesizing}
                onSynthesize={(direction) =>
                  props.onSynthesize(row.exhibit, direction)
                }
                onMagenta={(next) => props.onMagenta(row.exhibit.id, next)}
                onError={props.onError}
              />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ArchiveExhibitAssetCard(props: {
  sessionId: string;
  row: DebateArchiveExhibitRow;
  busy: boolean;
  synthesizing: boolean;
  onSynthesize: (direction: string) => void;
  onMagenta: (next: DebateExhibitMagentaState & { updatedAt: string }) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const { exhibit } = props.row;
  const imageUrl = exhibitImageUrl(exhibit, props.row.imageCacheKey);
  const synthesizeTarget = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: `debate-archive-exhibit-synth:${props.sessionId}:${exhibit.id}`,
      kind: "magic",
      label: `Re-synthesize ${exhibit.title}`,
      disabled: () => props.busy || props.synthesizing,
      run: async (direction) => {
        props.onSynthesize(direction);
      },
    }),
    [exhibit.id, exhibit.title, props],
  );

  return (
    <li className={styles.archiveAssetCard}>
      <div
        className={styles.archiveAssetVisual}
        data-visual-kind={exhibit.visualKind}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">{exhibit.emoji}</span>
        )}
      </div>
      <div className={styles.archiveAssetCopy}>
        <strong>{exhibit.title}</strong>
        <p>{exhibit.observation}</p>
        <small>
          {imageUrl
            ? "Stage sprite attached · emoji remains the fallback"
            : "Emoji fallback · synthesize a soft sprite anytime"}
        </small>
      </div>
      <div className={styles.archiveAssetActions}>
        {props.synthesizing ? (
          <span
            className={styles.archiveAssetSynthSpinner}
            role="status"
            aria-live="polite"
            aria-label={`Synthesizing ${exhibit.title}`}
          >
            <span className={styles.archiveAssetSynthSpinnerWheel} aria-hidden="true" />
          </span>
        ) : (
          <PrismRefractTarget target={synthesizeTarget}>
            {(binding) => (
              <button
                {...binding}
                type="button"
                className={styles.archiveReuseButton}
                disabled={props.busy}
                aria-label={`Re-synthesize ${exhibit.title}. Wield Prism here for creative direction.`}
                onClick={() => props.onSynthesize("")}
              >
                Re-synthesize
              </button>
            )}
          </PrismRefractTarget>
        )}
        <DebateExhibitMagentaControls
          imageId={exhibit.imageId}
          assetSetId={props.row.assetSetId}
          magentaPassCount={props.row.magentaPassCount}
          magentaUndoAvailable={props.row.magentaUndoAvailable}
          disabled={props.busy || props.synthesizing}
          onApplied={props.onMagenta}
          onError={props.onError}
        />
      </div>
    </li>
  );
}

/**
 * Hook-friendly loader for Archive Assets exhibit rows.
 */
export function useDebateArchiveExhibitRows(
  sessionId: string | null,
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): {
  rows: DebateArchiveExhibitRow[];
  setRows: React.Dispatch<React.SetStateAction<DebateArchiveExhibitRow[]>>;
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
} {
  const [rows, setRows] = useState<DebateArchiveExhibitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useMemo(() => {
    return async (): Promise<void> => {
      if (!sessionId) {
        setRows([]);
        setLoadError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const result = await request<{
          exhibits: Array<{
            exhibit: DebateEvidenceExhibitV1;
            assetSetId: string | null;
            magentaPassCount: number;
            magentaUndoAvailable: boolean;
          }>;
        }>(`/api/debates/${encodeURIComponent(sessionId)}/exhibits`);
        setRows(result.exhibits.map((row) => ({ ...row })));
      } catch (caught) {
        setLoadError(
          caught instanceof Error
            ? caught.message
            : "Could not load exhibit assets.",
        );
      } finally {
        setLoading(false);
      }
    };
  }, [request, sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, setRows, loading, loadError, reload };
}
