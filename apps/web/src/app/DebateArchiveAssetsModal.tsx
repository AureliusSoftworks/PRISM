"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DebateEvidenceExhibitV1,
  DebateSessionListItemV1,
  ImageAssetSet,
} from "@localai/shared";
import { AssetLibraryModal } from "./AssetLibrary";
import { searchDebateEvidenceEmojis } from "./debateEvidenceExhibits";
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
  theme: "light" | "dark";
  rows: DebateArchiveExhibitRow[];
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  synthesizingExhibitIds: ReadonlySet<string>;
  onClose: () => void;
  onRetry: () => void;
  onSynthesize: (exhibit: DebateEvidenceExhibitV1, direction: string) => void;
  onUpload: (exhibit: DebateEvidenceExhibitV1, file: File) => Promise<void>;
  onSelectAsset: (
    exhibit: DebateEvidenceExhibitV1,
    imageId: string,
  ) => Promise<void>;
  onEmoji: (exhibit: DebateEvidenceExhibitV1, emoji: string) => Promise<void>;
  onMagenta: (
    exhibitId: string,
    next: DebateExhibitMagentaState & { updatedAt: string },
  ) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<DebateEvidenceExhibitV1 | null>(null);
  const [libraryTarget, setLibraryTarget] =
    useState<DebateEvidenceExhibitV1 | null>(null);
  const [emojiTarget, setEmojiTarget] =
    useState<DebateEvidenceExhibitV1 | null>(null);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const emojiResults = useMemo(
    () => searchDebateEvidenceEmojis(emojiQuery),
    [emojiQuery],
  );

  const reportActionError = (caught: unknown, fallback: string): void => {
    props.onError(caught instanceof Error ? caught.message : fallback);
  };

  const chooseLibraryAsset = async (asset: ImageAssetSet): Promise<void> => {
    const target = libraryTarget;
    const member =
      asset.members.find((candidate) => candidate.role === "primary") ??
      asset.members[0];
    if (!target || !member) return;
    setActionBusyId(target.id);
    try {
      await props.onSelectAsset(target, member.imageId);
      setLibraryTarget(null);
    } catch (caught) {
      reportActionError(caught, "That library asset could not be attached.");
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div
      className={`${styles.confirmBackdrop} ${styles.archiveAssetsBackdrop}`}
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !props.busy &&
          !actionBusyId
        ) {
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
              locally. You can close this and use any PRISM applet; each sprite
              attaches to this saved exhibit when it lands. Emoji stays as the
              stage fallback until then.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.busy || Boolean(actionBusyId)}
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
                  busy={props.busy || actionBusyId === row.exhibit.id}
                  synthesizing={synthesizing}
                  onEditEmoji={() => {
                    setEmojiTarget(row.exhibit);
                    setEmojiQuery(
                      `${row.exhibit.object} ${row.exhibit.adjective}`,
                    );
                  }}
                  onUpload={() => {
                    uploadTargetRef.current = row.exhibit;
                    if (uploadInputRef.current) {
                      uploadInputRef.current.value = "";
                      uploadInputRef.current.click();
                    }
                  }}
                  onOpenLibrary={() => setLibraryTarget(row.exhibit)}
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
        <input
          ref={uploadInputRef}
          className={styles.visuallyHidden}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const target = uploadTargetRef.current;
            const file = event.currentTarget.files?.[0];
            if (!target || !file) return;
            setActionBusyId(target.id);
            void props
              .onUpload(target, file)
              .catch((caught) =>
                reportActionError(caught, "That exhibit image could not be uploaded."),
              )
              .finally(() => {
                uploadTargetRef.current = null;
                setActionBusyId(null);
              });
          }}
        />
      </section>
      {libraryTarget ? (
        <AssetLibraryModal
          kind="debate_exhibit"
          theme={props.theme}
          context={libraryTarget.title}
          currentImageIds={libraryTarget.imageId ? [libraryTarget.imageId] : []}
          onClose={() => setLibraryTarget(null)}
          onSelect={chooseLibraryAsset}
        />
      ) : null}
      {emojiTarget ? (
        <div
          className={styles.evidenceEmojiSearchBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionBusyId) {
              setEmojiTarget(null);
            }
          }}
        >
          <section
            className={styles.evidenceEmojiSearchModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="debate-archive-emoji-search-title"
          >
            <header>
              <div>
                <span>Fallback emoji</span>
                <h2 id="debate-archive-emoji-search-title">
                  Choose the stage fallback
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEmojiTarget(null)}
                disabled={Boolean(actionBusyId)}
                aria-label="Close fallback emoji picker"
              >
                ×
              </button>
            </header>
            <p className={styles.archiveEmojiAssurance}>
              This changes only the fallback symbol. Any attached sprite stays
              in place.
            </p>
            <label>
              <span>Search</span>
              <input
                autoFocus
                type="search"
                value={emojiQuery}
                placeholder="frame, jar, palette, gallery…"
                onChange={(event) => setEmojiQuery(event.currentTarget.value)}
              />
            </label>
            <div
              className={styles.evidenceEmojiSearchResults}
              aria-label="Three most relevant fallback emojis"
              aria-live="polite"
            >
              {emojiResults.map((result) => (
                <button
                  key={result.emoji}
                  type="button"
                  disabled={Boolean(actionBusyId)}
                  aria-pressed={emojiTarget.emoji === result.emoji}
                  aria-label={`Use ${result.label} fallback ${result.emoji}`}
                  onClick={() => {
                    const target = emojiTarget;
                    setActionBusyId(target.id);
                    void props
                      .onEmoji(target, result.emoji)
                      .then(() => setEmojiTarget(null))
                      .catch((caught) =>
                        reportActionError(
                          caught,
                          "That fallback emoji could not be updated.",
                        ),
                      )
                      .finally(() => setActionBusyId(null));
                  }}
                >
                  <span aria-hidden="true">{result.emoji}</span>
                  <small>{result.label}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ArchiveExhibitAssetCard(props: {
  sessionId: string;
  row: DebateArchiveExhibitRow;
  busy: boolean;
  synthesizing: boolean;
  onEditEmoji: () => void;
  onUpload: () => void;
  onOpenLibrary: () => void;
  onSynthesize: (direction: string) => void;
  onMagenta: (next: DebateExhibitMagentaState & { updatedAt: string }) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const { exhibit } = props.row;
  const imageUrl = exhibitImageUrl(exhibit, props.row.imageCacheKey);
  const hasSprite = Boolean(imageUrl);
  const synthesizeVerb = hasSprite ? "Re-synthesize" : "Synthesize";
  const synthesizeTarget = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: `debate-archive-exhibit-synth:${props.sessionId}:${exhibit.id}`,
      kind: "magic",
      label: `${synthesizeVerb} ${exhibit.title}`,
      disabled: () => props.busy || props.synthesizing,
      run: async (direction) => {
        props.onSynthesize(direction);
      },
    }),
    [exhibit.id, exhibit.title, props, synthesizeVerb],
  );

  return (
    <li className={styles.archiveAssetCard}>
      <button
        type="button"
        className={styles.archiveAssetVisual}
        data-visual-kind={exhibit.visualKind}
        onClick={props.onEditEmoji}
        disabled={props.busy || props.synthesizing}
        aria-label={`Change the fallback emoji for ${exhibit.title}. Current fallback ${exhibit.emoji}. The attached sprite will stay.`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">{exhibit.emoji}</span>
        )}
        {imageUrl ? (
          <span className={styles.archiveAssetFallbackBadge} aria-hidden="true">
            {exhibit.emoji}
          </span>
        ) : null}
      </button>
      <div className={styles.archiveAssetCopy}>
        <strong>{exhibit.title}</strong>
        <p>{exhibit.observation}</p>
        <small>
          {hasSprite
            ? "Stage sprite attached · emoji remains the fallback"
            : "Emoji fallback · synthesize a soft sprite anytime"}
        </small>
      </div>
      <div className={styles.archiveAssetActions}>
        <div className={styles.archiveAssetSourceActions}>
          <button
            type="button"
            onClick={props.onUpload}
            disabled={props.busy || props.synthesizing}
          >
            <span aria-hidden="true">↑</span> Upload
          </button>
          <button
            type="button"
            onClick={props.onOpenLibrary}
            disabled={props.busy || props.synthesizing}
          >
            <span aria-hidden="true">▣</span> Library
          </button>
        </div>
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
                aria-label={`${synthesizeVerb} ${exhibit.title}. Wield Prism here for creative direction.`}
                onClick={() => props.onSynthesize("")}
              >
                {synthesizeVerb}
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
