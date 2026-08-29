"use client";

import { useState, type ChangeEvent, type JSX } from "react";
import type {
  DebateMysteryMansionBundleSummaryV1,
  MansionLayoutV2,
} from "@localai/shared";
import {
  installedMansionOriginV1,
  installedMansionThumbnailSourceV1,
  resolveInstalledMansionPresentationV1,
  type InstalledMansionLibraryUpdateV1,
} from "./installedMansionLibrary";
import WhodunnitSetupDialog from "./WhodunnitSetupDialog";
import MansionEditorDialog from "./MansionEditorDialog";
import { SanctumAudioPlayer } from "./SanctumAudioPlayer";
import { mysteryMansionAmbienceAssetV1 } from "./debateMysteryMansionAmbience";
import styles from "./debateMystery.module.css";

interface MansionEditorDraftV1 {
  mansionId: string;
  title: string;
  description: string;
  titleUsesDefault: boolean;
  descriptionUsesDefault: boolean;
  thumbnailAction: "keep" | "replace" | "default";
  thumbnailDataUrl: string | null;
}

export interface MansionSoundscapeMutationResultV1 {
  ok: boolean;
  error: string | null;
}

export interface InstalledMansionLibraryProps {
  theme: "light" | "dark";
  mansions: DebateMysteryMansionBundleSummaryV1[];
  selectedMansionId: string;
  busy: boolean;
  responseMode: "local" | "online";
  audioVolume: number;
  exportPassword: string;
  onExportPasswordChange: (value: string) => void;
  onSelect: (mansionId: string) => void;
  onRandom: () => void;
  onUpdate: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    update: InstalledMansionLibraryUpdateV1,
  ) => Promise<boolean>;
  onClone: (
    mansion: DebateMysteryMansionBundleSummaryV1,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onSaveTopology: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    layoutV2: MansionLayoutV2,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onGenerateRoomArt: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onAcceptRoomArt: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onDiscardRoomArt: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onExport: (mansion: DebateMysteryMansionBundleSummaryV1) => void;
  onGenerateTheme: (
    mansion: DebateMysteryMansionBundleSummaryV1,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  onAcceptTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onUndoTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onGenerateAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onAcceptAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onUndoAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onRemove: (mansion: DebateMysteryMansionBundleSummaryV1) => void;
}

function readMansionThumbnail(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, or WebP exterior cover."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("Mansion exterior covers must be 8 MB or smaller."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PRISM could not read that thumbnail."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("PRISM could not read that thumbnail."));
    reader.readAsDataURL(file);
  });
}

export default function InstalledMansionLibrary({
  theme,
  mansions,
  selectedMansionId,
  busy,
  responseMode,
  audioVolume,
  exportPassword,
  onExportPasswordChange,
  onSelect,
  onRandom,
  onUpdate,
  onClone,
  onSaveTopology,
  onGenerateRoomArt,
  onAcceptRoomArt,
  onDiscardRoomArt,
  onExport,
  onGenerateTheme,
  onAcceptTheme,
  onDiscardTheme,
  onUndoTheme,
  onGenerateAtmosphere,
  onAcceptAtmosphere,
  onDiscardAtmosphere,
  onUndoAtmosphere,
  onRemove,
}: InstalledMansionLibraryProps): JSX.Element {
  const [editor, setEditor] = useState<MansionEditorDraftV1 | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [soundscapeTab, setSoundscapeTab] = useState<"music" | "atmosphere">("music");
  const [removeConfirmation, setRemoveConfirmation] =
    useState<DebateMysteryMansionBundleSummaryV1 | null>(null);
  const [topologyMansion, setTopologyMansion] =
    useState<DebateMysteryMansionBundleSummaryV1 | null>(null);
  const editingMansion = editor
    ? mansions.find((mansion) => mansion.id === editor.mansionId) ?? null
    : null;
  const editingPresentation = editingMansion
    ? resolveInstalledMansionPresentationV1(editingMansion)
    : null;

  const beginEditing = (mansion: DebateMysteryMansionBundleSummaryV1): void => {
    const presentation = resolveInstalledMansionPresentationV1(mansion);
    setEditor({
      mansionId: mansion.id,
      title: presentation.title,
      description: presentation.description,
      titleUsesDefault: presentation.titleOverride === null,
      descriptionUsesDefault: presentation.descriptionOverride === null,
      thumbnailAction: "keep",
      thumbnailDataUrl: null,
    });
    setSoundscapeTab("music");
    setEditorError(null);
  };

  const chooseThumbnail = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !editor) return;
    try {
      const thumbnailDataUrl = await readMansionThumbnail(file);
      setEditor((current) => current
        ? { ...current, thumbnailAction: "replace", thumbnailDataUrl }
        : current);
      setEditorError(null);
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : "That thumbnail could not be read.");
    }
  };

  const saveEditor = async (): Promise<void> => {
    if (!editor || !editingMansion) return;
    const title = editor.title.trim();
    const description = editor.description.trim();
    if (!title || !description) {
      setEditorError("Keep a title and description, or use their original defaults.");
      return;
    }
    setEditorSaving(true);
    setEditorError(null);
    const saved = await onUpdate(editingMansion, {
      title: editor.titleUsesDefault ? null : title,
      description: editor.descriptionUsesDefault ? null : description,
      ...(editor.thumbnailAction === "replace"
        ? { thumbnailDataUrl: editor.thumbnailDataUrl }
        : editor.thumbnailAction === "default"
          ? { thumbnailDataUrl: null }
          : {}),
    });
    setEditorSaving(false);
    if (saved) setEditor(null);
  };

  const openMansionEditor = async (): Promise<void> => {
    if (!editingMansion) return;
    setEditorSaving(true);
    setEditorError(null);
    const editable = editingMansion.derivation
      ? editingMansion
      : await onClone(editingMansion);
    setEditorSaving(false);
    if (!editable) return;
    setEditor(null);
    setTopologyMansion(editable);
  };

  const runSoundscapeMutation = async (
    mutation: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>,
    fallback: string,
  ): Promise<void> => {
    if (!editingMansion) return;
    setEditorError(null);
    try {
      const result = await mutation(editingMansion);
      if (!result.ok) setEditorError(result.error ?? fallback);
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : fallback);
    }
  };

  const editorThumbnailUrl = editor && editingMansion && editingPresentation
    ? editor.thumbnailAction === "replace"
      ? editor.thumbnailDataUrl
      : installedMansionThumbnailSourceV1(
          editingMansion,
          editor.thumbnailAction === "default"
            ? editingPresentation.defaultThumbnailAssetId
            : editingPresentation.thumbnailAssetId,
        )
    : null;
  const themePreview = editingMansion?.music?.candidate ?? editingMansion?.music?.active ?? null;
  const themePreviewSource = editingMansion && themePreview
    ? `/api/debates/mystery-mansions/${encodeURIComponent(editingMansion.id)}/assets/${encodeURIComponent(themePreview.assetId)}/file`
    : "/audio/debate/whodunnit/the-midnight-clue.mp3";
  const sharedAtmospherePreview = editingMansion
    ? mysteryMansionAmbienceAssetV1(editingMansion.houseStyle, editingMansion.id)
    : null;
  const atmosphereTrack = editingMansion?.atmosphere?.candidate ?? editingMansion?.atmosphere?.active ?? null;
  const atmospherePreviewSource = editingMansion && atmosphereTrack
    ? `/api/debates/mystery-mansions/${encodeURIComponent(editingMansion.id)}/assets/${encodeURIComponent(atmosphereTrack.assetId)}/file`
    : sharedAtmospherePreview?.url ?? null;
  const ambienceManifest = editingMansion?.houseStyle.ambience ?? null;

  return (
    <section
      className={styles.installedMansions}
      data-tutorial-target="whodunnit-installed-mansions"
    >
      <header className={styles.installedMansionsHeader}>
        <div>
          <small>Installed library</small>
          <h3>Installed Mansions</h3>
          <p>Choose a house for this case, or edit how it appears in your library.</p>
        </div>
        <button
          type="button"
          className={styles.randomMansionButton}
          data-tutorial-target="whodunnit-random-mansion"
          disabled={busy || mansions.length === 0}
          onClick={onRandom}
        >
          <span aria-hidden="true">✦</span>
          Random installed mansion
        </button>
      </header>

      {mansions.length === 0 ? (
        <div className={styles.installedMansionsEmpty}>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>No mansions installed yet</strong>
            <small>Import a .mansion below, or finish exploring a house and save its mansion level.</small>
          </div>
        </div>
      ) : (
        <div className={styles.installedMansionGrid}>
          {mansions.map((mansion) => {
            const presentation = resolveInstalledMansionPresentationV1(mansion);
            const thumbnailUrl = installedMansionThumbnailSourceV1(
              mansion,
              presentation.thumbnailAssetId,
            );
            const origin = installedMansionOriginV1(mansion);
            const selected = mansion.id === selectedMansionId;
            return (
              <article key={mansion.id} data-selected={selected ? "true" : undefined}>
                <div className={styles.installedMansionThumbnail}>
                  {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">{mansion.rooms[0]?.emoji ?? "◇"}</span>
                  )}
                  <span
                    className={styles.installedMansionOrigin}
                    data-origin={origin.kind}
                    title={origin.description}
                    aria-label={`Origin: ${origin.description}`}
                  >
                    <i aria-hidden="true">{origin.kind === "imported" ? "↓" : origin.kind === "derived" ? "↗" : "✦"}</i>
                    <strong>{origin.label}</strong>
                  </span>
                </div>
                <div className={styles.installedMansionCopy}>
                  <h4>{presentation.title}</h4>
                  <p>{presentation.description}</p>
                  <small>{mansion.floors} floor{mansion.floors === 1 ? "" : "s"} · {mansion.totalRooms} rooms · {mansion.suspectCount} suspects</small>
                </div>
                <div className={styles.installedMansionActions}>
                  <button
                    type="button"
                    className={styles.installedMansionSelect}
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => onSelect(mansion.id)}
                  >
                    {selected ? "Selected ✓" : "Use this mansion"}
                  </button>
                  <button
                    type="button"
                    data-tutorial-target="whodunnit-edit-mansion"
                    disabled={busy}
                    onClick={() => beginEditing(mansion)}
                  >
                    Edit details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor && editingMansion && editingPresentation ? (
        <WhodunnitSetupDialog
          open={!removeConfirmation}
          id="installed-mansion-editor"
          theme={theme}
          eyebrow="Library details"
          title="Edit mansion details"
          description="Customize its exterior cover, title, description, and sharing details in your Installed Mansions library."
          size="wide"
          busy={editorSaving}
          onClose={() => setEditor(null)}
        >
        <section className={styles.installedMansionEditor}>
          <div className={styles.installedMansionEditorGrid}>
            <div className={styles.installedMansionThumbnailEditor}>
              {editorThumbnailUrl ? <img src={editorThumbnailUrl} alt="Current mansion exterior cover" /> : <span aria-hidden="true">{editingMansion.rooms[0]?.emoji ?? "◇"}</span>}
              <div>
                <label htmlFor="installed-mansion-thumbnail">Choose exterior cover</label>
                <input id="installed-mansion-thumbnail" type="file" accept="image/png,image/jpeg,image/webp" disabled={editorSaving} onChange={(event) => void chooseThumbnail(event)} />
                <small>Use one high-quality outside view that shows the complete mansion in its geography.</small>
                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => setEditor((current) => current ? { ...current, thumbnailAction: "default", thumbnailDataUrl: null } : current)}
                >
                  Use {editingMansion.portable ? "package" : "original"} exterior
                </button>
              </div>
            </div>
            <div className={styles.installedMansionEditorFields}>
              <div>
                <span><label htmlFor="installed-mansion-title">Library title</label><em>{editor.titleUsesDefault ? "Default" : "Custom"}</em></span>
                <input
                  id="installed-mansion-title"
                  value={editor.title}
                  maxLength={180}
                  disabled={editorSaving}
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    setEditor((current) => current
                      ? { ...current, title, titleUsesDefault: false }
                      : current);
                  }}
                />
                <button type="button" disabled={editorSaving || editor.titleUsesDefault} onClick={() => setEditor((current) => current ? { ...current, title: editingPresentation.defaultTitle, titleUsesDefault: true } : current)}>Use {editingMansion.portable ? "package" : "original"} title</button>
              </div>
              <div>
                <span><label htmlFor="installed-mansion-description">Library description</label><em>{editor.descriptionUsesDefault ? "Default" : "Custom"}</em></span>
                <textarea
                  id="installed-mansion-description"
                  value={editor.description}
                  maxLength={1_200}
                  rows={4}
                  disabled={editorSaving}
                  onChange={(event) => {
                    const description = event.currentTarget.value;
                    setEditor((current) => current
                      ? { ...current, description, descriptionUsesDefault: false }
                      : current);
                  }}
                />
                <button type="button" disabled={editorSaving || editor.descriptionUsesDefault} onClick={() => setEditor((current) => current ? { ...current, description: editingPresentation.defaultDescription, descriptionUsesDefault: true } : current)}>Use {editingMansion.portable ? "package" : "original"} description</button>
              </div>
            </div>
          </div>
          <section
            className={styles.installedMansionMusic}
            data-tutorial-target="whodunnit-mansion-soundscape"
          >
            <header className={styles.installedMansionSoundscapeHeader}>
              <div>
                <small>Mansion soundscape</small>
                <h4>Music and atmosphere</h4>
                <p>Audition the score separately from the continuous environmental bed and room acoustics.</p>
              </div>
            </header>
            <div className={styles.installedMansionSoundscapeTabs} role="tablist" aria-label="Mansion soundscape">
              <button
                type="button"
                role="tab"
                aria-selected={soundscapeTab === "music"}
                data-active={soundscapeTab === "music" ? "true" : undefined}
                onClick={() => setSoundscapeTab("music")}
              >
                Music
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={soundscapeTab === "atmosphere"}
                data-active={soundscapeTab === "atmosphere" ? "true" : undefined}
                onClick={() => setSoundscapeTab("atmosphere")}
              >
                Atmosphere
              </button>
            </div>
            {soundscapeTab === "music" ? (
              <div className={styles.installedMansionSoundscapePanel} role="tabpanel" data-soundscape-panel="music">
                <header>
                  <div>
                    <small>Furniture music</small>
                    <h4>{editingMansion.music?.candidate ? "Music preview" : editingMansion.music?.active ? "Packaged investigation theme" : "Bundled PRISM fallback"}</h4>
                    <p>Instrument-only noir phrases emerge between long quiet intervals. Environmental sound remains in Atmosphere.</p>
                  </div>
                  {editingMansion.music?.candidate ? <span>Not active yet</span> : null}
                </header>
                <SanctumAudioPlayer
                  src={themePreviewSource}
                  label={themePreview?.title ?? "The Midnight Clue"}
                  kicker={editingMansion.music?.candidate ? "Music preview" : editingMansion.music?.active ? "Mansion theme" : "PRISM fallback"}
                  volume={audioVolume}
                />
                {editingMansion.music?.candidate ? (
                  <div className={styles.installedMansionMusicDecision}>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onAcceptTheme, "That mansion music could not be accepted.")}>Use this version</button>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardTheme, "That mansion music preview could not be discarded.")}>Discard</button>
                  </div>
                ) : (
                  <div className={styles.installedMansionMusicControls}>
                    <button
                      type="button"
                      disabled={busy || editorSaving || responseMode === "local"}
                      onClick={() => void runSoundscapeMutation(onGenerateTheme, "That mansion music could not be synthesized.")}
                    >
                      {editingMansion.music?.active ? "Resynthesize music" : "Synthesize music"}
                    </button>
                    {editingMansion.music?.previous ? (
                      <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onUndoTheme, "The previous mansion music could not be restored.")}>Undo previous version</button>
                    ) : null}
                  </div>
                )}
                <small className={styles.installedMansionMusicPrivacy}>
                  {responseMode === "local"
                    ? "LOCAL stays fully offline. You can audition packaged or bundled music; switch to ONLINE to synthesize."
                    : "ONLINE synthesis uses ElevenLabs Music. Instrument-only versions remain previews until you explicitly accept them."}
                </small>
              </div>
            ) : (
              <div className={styles.installedMansionSoundscapePanel} role="tabpanel" data-soundscape-panel="atmosphere">
                <header>
                  <div>
                    <small>Continuous atmosphere</small>
                    <h4>{editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Mansion identity bed" : "Bundled theme palette"}</h4>
                    <p>The world bed continues across rooms while exposure, filtering, emitters, and speech ducking crossfade around it.</p>
                  </div>
                  <span>{ambienceManifest ? `${ambienceManifest.roomProfiles.length} room profiles` : "Automatic"}</span>
                </header>
                {atmospherePreviewSource ? (
                  <SanctumAudioPlayer
                    src={atmospherePreviewSource}
                    label={atmosphereTrack?.title ?? `${editingMansion.houseStyle.atmosphere.weather} · ${editingMansion.houseStyle.atmosphere.timeOfDay}`}
                    kicker={editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Mansion atmosphere" : "PRISM acoustic library"}
                    volume={audioVolume}
                  />
                ) : (
                  <p className={styles.installedMansionAtmosphereFallback}>Silence is the safe fallback when no compatible environmental bed is available.</p>
                )}
                <dl className={styles.installedMansionAtmosphereFacts}>
                  <div><dt>Palette</dt><dd>{editingMansion.houseStyle.acousticThemePaletteId}</dd></div>
                  <div><dt>World</dt><dd>{editingMansion.houseStyle.atmosphere.exteriorSetting}</dd></div>
                  <div><dt>Weather</dt><dd>{editingMansion.houseStyle.atmosphere.weather}</dd></div>
                  <div><dt>Room treatment</dt><dd>{ambienceManifest ? `${ambienceManifest.crossfade.roomTransitionMs} ms crossfade · speech duck ${Math.round(ambienceManifest.speechDucking.gain * 100)}%` : "Derived by room type and exposure"}</dd></div>
                </dl>
                {editingMansion.atmosphere?.candidate ? (
                  <div className={styles.installedMansionMusicDecision}>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onAcceptAtmosphere, "That mansion atmosphere could not be accepted.")}>Use this version</button>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardAtmosphere, "That mansion atmosphere preview could not be discarded.")}>Discard</button>
                  </div>
                ) : (
                  <div className={styles.installedMansionMusicControls}>
                    <button
                      type="button"
                      disabled={busy || editorSaving || responseMode === "local"}
                      onClick={() => void runSoundscapeMutation(onGenerateAtmosphere, "That mansion atmosphere could not be synthesized.")}
                    >
                      {editingMansion.atmosphere?.active ? "Resynthesize atmosphere" : "Synthesize atmosphere"}
                    </button>
                    {editingMansion.atmosphere?.previous ? (
                      <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onUndoAtmosphere, "The previous mansion atmosphere could not be restored.")}>Undo previous version</button>
                    ) : null}
                  </div>
                )}
                <small className={styles.installedMansionMusicPrivacy}>
                  {responseMode === "local"
                    ? "LOCAL uses packaged or bundled beds and procedural room mixing without contacting an online generator."
                    : "ONLINE can synthesize one seamless mansion-wide bed. Only non-semantic environmental layers may play automatically; clue-bearing sounds require a sealed stage cue."}
                </small>
              </div>
            )}
          </section>
          {editorError ? <p className={styles.installedMansionEditorError} role="alert">{editorError}</p> : null}
          <div className={styles.installedMansionEditorFooter}>
            <div>
              <button
                type="button"
                className={styles.mansionEditorLaunch}
                data-tutorial-target="whodunnit-open-mansion-editor"
                disabled={busy || editorSaving}
                onClick={() => void openMansionEditor()}
              >
                {editingMansion.derivation ? "Open Mansion Editor" : "Duplicate & edit mansion"}
              </button>
              <label>Optional export password<input type="password" value={exportPassword} autoComplete="new-password" disabled={editorSaving} onChange={(event) => onExportPasswordChange(event.currentTarget.value)} /></label>
              <button type="button" disabled={busy || editorSaving || editingMansion.portable?.license.allowsRedistribution === false} onClick={() => onExport(editingMansion)}>Export Mansion</button>
              <button
                type="button"
                className={styles.savedMansionRemove}
                disabled={busy || editorSaving}
                onClick={() => setRemoveConfirmation(editingMansion)}
              >
                Remove from PRISM
              </button>
            </div>
            <button type="button" className={styles.installedMansionSave} disabled={busy || editorSaving} onClick={() => void saveEditor()}>{editorSaving ? "Saving…" : "Save library details"}</button>
          </div>
        </section>
        </WhodunnitSetupDialog>
      ) : null}

      {topologyMansion && !removeConfirmation ? (
        <MansionEditorDialog
          theme={theme}
          mansion={topologyMansion}
          busy={busy}
          responseMode={responseMode}
          onClose={() => setTopologyMansion(null)}
          onSave={onSaveTopology}
          onGenerateRoomArt={onGenerateRoomArt}
          onAcceptRoomArt={onAcceptRoomArt}
          onDiscardRoomArt={onDiscardRoomArt}
        />
      ) : null}

      {removeConfirmation ? (
        <WhodunnitSetupDialog
          open
          id="installed-mansion-remove"
          theme={theme}
          eyebrow="Remove installed mansion"
          title={`Remove ${resolveInstalledMansionPresentationV1(removeConfirmation).title}?`}
          description="This removes the local installed copy and its library details. Export it first if you want to keep the mansion file."
          role="alertdialog"
          busy={busy}
          onClose={() => setRemoveConfirmation(null)}
        >
          <div className={styles.installedMansionConfirmActions}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoveConfirmation(null)}
            >
              Keep mansion
            </button>
            <button
              type="button"
              className={styles.savedMansionRemove}
              disabled={busy}
              onClick={() => {
                onRemove(removeConfirmation);
                setRemoveConfirmation(null);
                setEditor(null);
              }}
            >
              Remove from PRISM
            </button>
          </div>
        </WhodunnitSetupDialog>
      ) : null}
    </section>
  );
}
