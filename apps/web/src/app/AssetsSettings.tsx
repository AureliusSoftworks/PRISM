"use client";

import { useEffect, useState } from "react";
import { AudioLibraryModal } from "./AudioLibrary";
import {
  AUDIO_LIBRARY_BINS,
  AUDIO_LIBRARY_BIN_DESCRIPTIONS,
  AUDIO_LIBRARY_BIN_LABELS,
  type AudioLibraryBin,
  type AudioLibraryClip,
} from "./audioLibraryCatalog";
import styles from "./AssetsSettings.module.css";

const AUDIO_LIBRARY_GLYPHS: Record<AudioLibraryBin, string> = {
  music: "♫",
  effects: "✦",
  ambience: "≈",
};

export function AssetsSettings(): React.JSX.Element {
  const [openBin, setOpenBin] = useState<AudioLibraryBin | null>(null);
  const [counts, setCounts] = useState<Partial<Record<AudioLibraryBin, number>>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(AUDIO_LIBRARY_BINS.map(async (bin) => {
      const response = await fetch(`/api/audio-library?category=${bin}`, {
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as
        | { clips?: AudioLibraryClip[] }
        | null;
      return [bin, response.ok && Array.isArray(payload?.clips) ? payload.clips.length : 0] as const;
    })).then((entries) => {
      if (!cancelled) setCounts(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className={styles.assetsSettings} data-settings-section="assets">
      <header className={styles.header}>
        <span>Reusable library</span>
        <h4>Assets</h4>
        <p>
          Browse and audition reusable non-voice audio. Your generated assets and
          PRISM&apos;s bundled library stay searchable together; Storage remains
          responsible for space and cleanup.
        </p>
      </header>

      <div className={styles.cards}>
        {AUDIO_LIBRARY_BINS.map((bin) => (
          <button
            key={bin}
            type="button"
            className={styles.card}
            data-audio-asset-category={bin}
            onClick={() => setOpenBin(bin)}
            data-tutorial-target={`settings-audio-assets-${bin}`}
          >
            <span className={styles.glyph} aria-hidden="true">{AUDIO_LIBRARY_GLYPHS[bin]}</span>
            <span className={styles.cardCopy}>
              <strong>{AUDIO_LIBRARY_BIN_LABELS[bin]}</strong>
              <small>{AUDIO_LIBRARY_BIN_DESCRIPTIONS[bin]}</small>
            </span>
            <span className={styles.count}>{counts[bin] ?? "…"} assets</span>
          </button>
        ))}
      </div>

      <aside className={styles.reuseNote}>
        <strong>Reuse before synthesis</strong>
        <p>
          PRISM may automatically reuse an exact, non-semantic universal match.
          Theme and mansion-identity audio always remains an audition-and-accept decision.
        </p>
      </aside>

      {openBin ? <AudioLibraryModal bin={openBin} onClose={() => setOpenBin(null)} /> : null}
    </section>
  );
}

