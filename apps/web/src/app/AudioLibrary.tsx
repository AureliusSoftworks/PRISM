"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AUDIO_LIBRARY_BIN_LABELS,
  filterAudioLibraryClips,
  type AudioLibraryBin,
  type AudioLibraryClip,
} from "./audioLibraryCatalog";
import { SanctumAudioPlayer } from "./SanctumAudioPlayer";
import styles from "./AudioLibrary.module.css";
import sharedStyles from "./page.module.css";

async function loadAudioLibraryClips(
  bin: AudioLibraryBin,
): Promise<AudioLibraryClip[]> {
  const response = await fetch(
    `/api/audio-library?bin=${encodeURIComponent(bin)}`,
    { credentials: "include" },
  );
  const payload = (await response.json().catch(() => null)) as
    | { clips?: AudioLibraryClip[]; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Audio library is unavailable.");
  }
  return Array.isArray(payload?.clips) ? payload.clips : [];
}

export function AudioLibraryModal({
  bin,
  onClose,
}: {
  bin: AudioLibraryBin;
  onClose: () => void;
}) {
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clips, setClips] = useState<AudioLibraryClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelectedId(null);
    setQuery("");
    void loadAudioLibraryClips(bin)
      .then((next) => {
        if (cancelled) return;
        setClips(next);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setClips([]);
        setLoadError(
          error instanceof Error ? error.message : "Audio library is unavailable.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bin]);

  const filtered = useMemo(
    () => filterAudioLibraryClips(clips, query),
    [clips, query],
  );

  const selected: AudioLibraryClip | null =
    filtered.find((clip) => clip.id === selectedId) ??
    filtered[0] ??
    null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const timeout = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (typeof document === "undefined") return null;

  const groups = new Map<string, AudioLibraryClip[]>();
  for (const clip of filtered) {
    const list = groups.get(clip.groupLabel) ?? [];
    list.push(clip);
    groups.set(clip.groupLabel, list);
  }

  const emptyMessage = loadError
    ? loadError
    : loading
      ? "Loading your clips…"
      : query.trim()
        ? "No clips match this search."
        : `No ${AUDIO_LIBRARY_BIN_LABELS[bin].toLowerCase()} yet. Synthesize or upload clips into this library — built-in product foley stays out of Space Lens.`;

  return createPortal(
    <div
      className={styles.modalBackdrop}
      role="presentation"
      data-audio-library-layer="true"
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-audio-library-bin={bin}
      >
        <header className={`${styles.modalHeader} ${sharedStyles.panelHeader}`}>
          <div className={sharedStyles.panelHeaderTitleText}>
            <small>Local audio library</small>
            <h2 id={headingId}>{AUDIO_LIBRARY_BIN_LABELS[bin]}</h2>
          </div>
          <button
            type="button"
            className={sharedStyles.panelClose}
            onClick={onClose}
            aria-label="Close audio library"
          >
            ×
          </button>
        </header>

        <div className={styles.playerDock}>
          <SanctumAudioPlayer
            src={selected?.url ?? null}
            label={selected?.label ?? null}
            emptyLabel={
              filtered.length === 0
                ? loading
                  ? "Loading…"
                  : "No clips match this search"
                : "Select a clip to audition"
            }
          />
        </div>

        <div className={styles.toolbar}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${AUDIO_LIBRARY_BIN_LABELS[bin].toLowerCase()}…`}
            aria-label={`Search ${AUDIO_LIBRARY_BIN_LABELS[bin]}`}
            disabled={loading}
          />
          <span className={styles.count}>
            {loading
              ? "…"
              : `${filtered.length} clip${filtered.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className={styles.body}>
          {filtered.length === 0 ? (
            <p className={styles.empty}>{emptyMessage}</p>
          ) : (
            [...groups.entries()].map(([groupLabel, groupClips]) => (
              <section key={groupLabel} className={styles.group}>
                <header>
                  <strong>{groupLabel}</strong>
                  <small>
                    {groupClips.length} clip
                    {groupClips.length === 1 ? "" : "s"}
                  </small>
                </header>
                <ul>
                  {groupClips.map((clip) => {
                    const active = selected?.id === clip.id;
                    return (
                      <li key={clip.id}>
                        <button
                          type="button"
                          className={styles.clipRow}
                          data-active={active ? "true" : undefined}
                          onClick={() => setSelectedId(clip.id)}
                        >
                          <span>
                            <strong>{clip.label}</strong>
                            <small>
                              {clip.source === "uploaded"
                                ? "Uploaded"
                                : "Synthesized"}
                            </small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
