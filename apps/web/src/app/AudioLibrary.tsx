"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TEXT_ENTRY_SEARCH_MAX_LENGTH } from "@localai/shared";
import {
  AUDIO_LIBRARY_BIN_LABELS,
  filterAudioLibraryClips,
  type AudioLibraryBin,
  type AudioLibraryClip,
} from "./audioLibraryCatalog";
import { SanctumAudioPlayer } from "./SanctumAudioPlayer";
import styles from "./AudioLibrary.module.css";
import sharedStyles from "./page.module.css";

type SourceFilter = "all" | "mine" | "prism";
type SortFilter = "recent" | "frequent" | "unused" | "size";

async function loadAudioLibraryClips(
  bin: AudioLibraryBin,
): Promise<AudioLibraryClip[]> {
  const response = await fetch(
    `/api/audio-library?category=${encodeURIComponent(bin)}`,
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

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "Bundled";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(clip: AudioLibraryClip): string {
  if (clip.source === "prism") return "PRISM";
  if (clip.source === "uploaded") return "Uploaded";
  if (clip.source === "legacy") return "Indexed";
  return clip.status === "candidate" ? "Candidate" : "Generated";
}

export function AudioLibraryModal({
  bin,
  onClose,
}: {
  bin: AudioLibraryBin;
  onClose: () => void;
}) {
  const headingId = useId();
  const modalRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [appletFilter, setAppletFilter] = useState("all");
  const [sortFilter, setSortFilter] = useState<SortFilter>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clips, setClips] = useState<AudioLibraryClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelectedId(null);
    setQuery("");
    setSourceFilter("all");
    setAppletFilter("all");
    setSortFilter("recent");
    void loadAudioLibraryClips(bin)
      .then((next) => {
        if (cancelled) return;
        setClips(next);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setClips([]);
        setLoadError(error instanceof Error ? error.message : "Audio library is unavailable.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [bin]);

  const sourceClips = useMemo(() => clips.filter((clip) => {
    if (sourceFilter === "mine") return clip.source !== "prism";
    if (sourceFilter === "prism") return clip.source === "prism";
    return true;
  }), [clips, sourceFilter]);
  const applets = useMemo(
    () => [...new Set(clips.map((clip) => clip.applet).filter(Boolean))].sort(),
    [clips],
  );
  const keywordChips = useMemo(() => [
    ...new Set(sourceClips.flatMap((clip) => clip.automaticTags)),
  ].slice(0, 10), [sourceClips]);
  const filtered = useMemo(() => {
    const matching = filterAudioLibraryClips(
      appletFilter === "all"
        ? sourceClips
        : sourceClips.filter((clip) => clip.applet === appletFilter),
      query,
    );
    return [...matching].sort((left, right) => {
      if (sortFilter === "frequent") return right.usageCount - left.usageCount || left.label.localeCompare(right.label);
      if (sortFilter === "unused") return Number(left.usageCount > 0) - Number(right.usageCount > 0) || left.label.localeCompare(right.label);
      if (sortFilter === "size") return (right.bytes ?? 0) - (left.bytes ?? 0) || left.label.localeCompare(right.label);
      return (right.lastAccessedAt ?? "").localeCompare(left.lastAccessedAt ?? "") || left.label.localeCompare(right.label);
    });
  }, [appletFilter, query, sortFilter, sourceClips]);
  const selected = filtered.find((clip) => clip.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    setTagDraft(selected?.playerTags.join(", ") ?? "");
    setTagError(null);
  }, [selected?.id, selected?.playerTags]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const timeout = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const saveTags = async (): Promise<void> => {
    if (!selected || selected.readOnly) return;
    setTagBusy(true);
    setTagError(null);
    const tags = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
    try {
      const response = await fetch(`/api/audio-assets/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { asset?: { playerTags?: string[] }; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not save tags.");
      setClips((current) => current.map((clip) =>
        clip.id === selected.id ? { ...clip, playerTags: payload?.asset?.playerTags ?? tags } : clip,
      ));
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "Could not save tags.");
    } finally {
      setTagBusy(false);
    }
  };

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
      ? "Loading audio assets…"
      : query.trim()
        ? "No assets match this search."
        : `No ${AUDIO_LIBRARY_BIN_LABELS[bin].toLowerCase()} in this source yet.`;

  return createPortal(
    <div className={styles.modalBackdrop} role="presentation" data-audio-library-layer="true">
      <section
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-audio-library-bin={bin}
      >
        <header className={`${styles.modalHeader} ${sharedStyles.panelHeader}`}>
          <div className={sharedStyles.panelHeaderTitleText}>
            <small>Reusable audio assets</small>
            <h2 id={headingId}>{AUDIO_LIBRARY_BIN_LABELS[bin]}</h2>
          </div>
          <button type="button" className={sharedStyles.panelClose} onClick={onClose} aria-label="Close audio library">×</button>
        </header>

        <div className={styles.toolbar}>
          <input
            ref={searchRef}
            type="search"
            maxLength={TEXT_ENTRY_SEARCH_MAX_LENGTH}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search ${AUDIO_LIBRARY_BIN_LABELS[bin].toLowerCase()} by role, context, or keyword…`}
            aria-label={`Search ${AUDIO_LIBRARY_BIN_LABELS[bin]}`}
            disabled={loading}
          />
          <div className={styles.sourceFilters} aria-label="Audio source">
            {(["all", "mine", "prism"] as const).map((source) => (
              <button
                key={source}
                type="button"
                data-active={sourceFilter === source ? "true" : undefined}
                onClick={() => setSourceFilter(source)}
              >
                {source === "all" ? "All" : source === "mine" ? "Mine" : "PRISM"}
              </button>
            ))}
          </div>
          <label className={styles.compactFilter}>
            <span>Applet</span>
            <select value={appletFilter} onChange={(event) => setAppletFilter(event.currentTarget.value)}>
              <option value="all">All applets</option>
              {applets.map((applet) => <option key={applet} value={applet}>{applet}</option>)}
            </select>
          </label>
          <label className={styles.compactFilter}>
            <span>Order</span>
            <select value={sortFilter} onChange={(event) => setSortFilter(event.currentTarget.value as SortFilter)}>
              <option value="recent">Recent</option>
              <option value="frequent">Frequently reused</option>
              <option value="unused">Unused first</option>
              <option value="size">Storage size</option>
            </select>
          </label>
          <span className={styles.count}>{loading ? "…" : `${filtered.length} asset${filtered.length === 1 ? "" : "s"}`}</span>
          {keywordChips.length ? (
            <div className={styles.keywordChips} aria-label="Context keywords">
              {keywordChips.map((tag) => (
                <button key={tag} type="button" data-active={query === tag ? "true" : undefined} onClick={() => setQuery(query === tag ? "" : tag)}>
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.libraryBody}>
          <div className={styles.listPane}>
            {filtered.length === 0 ? (
              <p className={styles.empty}>{emptyMessage}</p>
            ) : [...groups.entries()].map(([groupLabel, groupClips]) => (
              <section key={groupLabel} className={styles.group}>
                <header><strong>{groupLabel}</strong><small>{groupClips.length}</small></header>
                <ul>
                  {groupClips.map((clip) => (
                    <li key={clip.id}>
                      <button
                        type="button"
                        className={styles.clipRow}
                        data-active={selected?.id === clip.id ? "true" : undefined}
                        onClick={() => setSelectedId(clip.id)}
                      >
                        <span><strong>{clip.label}</strong><small>{sourceLabel(clip)} · {clip.scope}</small></span>
                        <small>{formatBytes(clip.bytes)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <aside className={styles.detailPane} aria-label="Selected audio asset details">
            <div className={styles.playerDock}>
              <SanctumAudioPlayer
                src={selected?.url ?? null}
                label={selected?.label ?? null}
                emptyLabel={loading ? "Loading…" : "Select an asset to audition"}
              />
            </div>
            {selected ? (
              <div className={styles.metadata}>
                <div><small>Semantic role</small><strong>{selected.semanticRole.replaceAll("_", " ")}</strong></div>
                <div><small>Scope</small><strong>{selected.scope}</strong></div>
                <div><small>Source</small><strong>{sourceLabel(selected)}</strong></div>
                <div><small>Used by</small><strong>{selected.usageCount || "Not yet referenced"}</strong></div>
                {selected.usageRefs.length ? (
                  <div className={styles.metadataWide}>
                    <small>References</small>
                    <div className={styles.tags}>
                      {selected.usageRefs.map((reference) => (
                        <span key={`${reference.ownerType}:${reference.ownerId}:${reference.role}`}>
                          {reference.ownerType} · {reference.ownerId} · {reference.role.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className={styles.metadataWide}>
                  <small>Context keywords</small>
                  <div className={styles.tags}>
                    {selected.automaticTags.length
                      ? selected.automaticTags.map((tag) => <span key={tag}>{tag}</span>)
                      : <span>Uncataloged legacy context</span>}
                  </div>
                </div>
                <label className={styles.metadataWide}>
                  <small>My tags</small>
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.currentTarget.value)}
                    placeholder={selected.readOnly ? "PRISM assets are read-only" : "Comma-separated keywords"}
                    disabled={selected.readOnly || tagBusy}
                  />
                </label>
                {!selected.readOnly ? (
                  <button type="button" className={styles.saveTags} onClick={() => void saveTags()} disabled={tagBusy}>
                    {tagBusy ? "Saving…" : "Save tags"}
                  </button>
                ) : <small className={styles.readOnly}>Bundled PRISM assets are reusable and do not count toward your storage.</small>}
                {tagError ? <p className={styles.error} role="alert">{tagError}</p> : null}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}
