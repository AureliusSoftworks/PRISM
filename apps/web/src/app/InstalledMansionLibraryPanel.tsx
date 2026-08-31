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

export interface MansionExteriorCandidateV1 {
  id: string;
  displayUrl: string;
  scaleClass: string;
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
  onRefractExterior: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    direction: string,
  ) => Promise<MansionExteriorCandidateV1 | null>;
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
  onRegenerateRoomArt: (
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
  onGenerateProps: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onRetryProp: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  onRemove: (mansion: DebateMysteryMansionBundleSummaryV1) => void;
}

function readMansionThumbnail(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, or WebP exterior cover."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("Mystery Venue exterior covers must be 8 MB or smaller."));
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
  onRefractExterior,
  onClone,
  onSaveTopology,
  onGenerateRoomArt,
  onAcceptRoomArt,
  onDiscardRoomArt,
  onRegenerateRoomArt,
  onExport,
  onGenerateTheme,
  onAcceptTheme,
  onDiscardTheme,
  onUndoTheme,
  onGenerateAtmosphere,
  onAcceptAtmosphere,
  onDiscardAtmosphere,
  onUndoAtmosphere,
  onGenerateProps,
  onRetryProp,
  onRemove,
}: InstalledMansionLibraryProps): JSX.Element {
  const [editor, setEditor] = useState<MansionEditorDraftV1 | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [exteriorDirection, setExteriorDirection] = useState("");
  const [exteriorCandidate, setExteriorCandidate] = useState<MansionExteriorCandidateV1 | null>(null);
  const [exteriorBusy, setExteriorBusy] = useState(false);
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
    setExteriorDirection("");
    setExteriorCandidate(null);
    setEditorError(null);
  };

  const refractExterior = async (): Promise<void> => {
    if (!editingMansion || responseMode === "local") return;
    setExteriorBusy(true);
    setEditorError(null);
    try {
      setExteriorCandidate(await onRefractExterior(editingMansion, exteriorDirection));
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : "That venue exterior could not be refracted.");
    } finally {
      setExteriorBusy(false);
    }
  };

  const acceptExteriorCandidate = async (): Promise<void> => {
    if (!editingMansion || !exteriorCandidate) return;
    setExteriorBusy(true);
    setEditorError(null);
    try {
      const response = await fetch(exteriorCandidate.displayUrl);
      if (!response.ok) throw new Error("The exterior preview is no longer available.");
      const thumbnailDataUrl = await readMansionThumbnail(
        new File([await response.blob()], "mystery-venue-exterior.png", { type: "image/png" }),
      );
      const saved = await onUpdate(editingMansion, { thumbnailDataUrl });
      if (saved) {
        setExteriorCandidate(null);
        setEditor((current) => current ? { ...current, thumbnailAction: "keep", thumbnailDataUrl: null } : current);
      }
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : "That venue exterior could not be accepted.");
    } finally {
      setExteriorBusy(false);
    }
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
          <h3>Mystery Venues</h3>
          <p>Choose a place for this case, or edit how it appears in your library.</p>
        </div>
        <button
          type="button"
          className={styles.randomMansionButton}
          data-tutorial-target="whodunnit-random-mansion"
          disabled={busy || mansions.length === 0}
          onClick={onRandom}
        >
          <span aria-hidden="true">✦</span>
          Random Mystery Venue
        </button>
      </header>

      {mansions.length === 0 ? (
        <div className={styles.installedMansionsEmpty}>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>No Mystery Venues installed yet</strong>
            <small>Import a Mystery Venue (.mansion), or create one from a setting description.</small>
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
                  <small>{mansion.layoutV2?.venueProfile?.tierLabels.join(" · ") ?? `${mansion.floors} floor${mansion.floors === 1 ? "" : "s"}`} · {mansion.totalRooms} rooms · {mansion.suspectCount} suspects</small>
                  <small data-tutorial-target="whodunnit-mansion-prop-theme">
                    {mansion.propTheme
                      ? "16/16 themed props"
                      : mansion.propThemeProgress && mansion.propThemeProgress.readyCount > 0
                        ? `${mansion.propThemeProgress.readyCount}/16 themed props · ${mansion.propThemeProgress.failedCount > 0 ? `${mansion.propThemeProgress.failedCount} need Retry` : "generation in progress"}`
                        : "Uses PRISM prop fallbacks"}
                  </small>
                </div>
                <div className={styles.installedMansionActions}>
                  <button
                    type="button"
                    className={styles.installedMansionSelect}
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => onSelect(mansion.id)}
                  >
                    {selected ? "Selected ✓" : "Use this venue"}
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
          title="Edit venue details"
          description="Customize its exterior cover, title, description, and sharing details in your Mystery Venues library."
          size="wide"
          busy={editorSaving}
          onClose={() => setEditor(null)}
        >
        <section className={styles.installedMansionEditor}>
          <div className={styles.installedMansionEditorGrid}>
            <div className={styles.installedMansionThumbnailEditor}>
              {editorThumbnailUrl ? <img src={editorThumbnailUrl} alt="Current venue exterior cover" /> : <span aria-hidden="true">{editingMansion.rooms[0]?.emoji ?? "◇"}</span>}
              <div>
                <label htmlFor="installed-mansion-thumbnail">Choose exterior cover</label>
                <input id="installed-mansion-thumbnail" type="file" accept="image/png,image/jpeg,image/webp" disabled={editorSaving} onChange={(event) => void chooseThumbnail(event)} />
                <small>Use one high-quality establishing view that shows the complete venue in its environment.</small>
                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => setEditor((current) => current ? { ...current, thumbnailAction: "default", thumbnailDataUrl: null } : current)}
                >
                  Use {editingMansion.portable ? "package" : "original"} exterior
                </button>
                <label htmlFor="installed-mansion-exterior-direction">Exterior Refract direction</label>
                <input
                  id="installed-mansion-exterior-direction"
                  value={exteriorDirection}
                  maxLength={1_200}
                  disabled={editorSaving || exteriorBusy || responseMode === "local"}
                  placeholder={`Optional direction for this ${editingMansion.layoutV2?.venueProfile?.placeNoun ?? "estate"}`}
                  onChange={(event) => setExteriorDirection(event.currentTarget.value)}
                />
                <button
                  type="button"
                  disabled={editorSaving || exteriorBusy || responseMode === "local"}
                  onClick={() => void refractExterior()}
                >
                  {exteriorBusy ? "Refracting…" : "Refract exterior"}
                </button>
                <small>{responseMode === "local" ? "ONLINE only · LOCAL keeps the neutral or accepted exterior." : "Creates a candidate only. Your accepted exterior stays unchanged until you choose Use this exterior."}</small>
                {exteriorCandidate ? (
                  <div>
                    <img src={exteriorCandidate.displayUrl} alt="Mystery Venue exterior candidate" />
                    <button type="button" disabled={editorSaving || exteriorBusy} onClick={() => void acceptExteriorCandidate()}>Use this exterior</button>
                    <button type="button" disabled={editorSaving || exteriorBusy} onClick={() => setExteriorCandidate(null)}>Discard candidate</button>
                  </div>
                ) : null}
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
            data-tutorial-target="whodunnit-mansion-prop-theme"
          >
            <header className={styles.installedMansionSoundscapeHeader}>
              <div>
                <small>Venue evidence wardrobe</small>
                <h4>{editingMansion.propTheme ? "16/16 themed props" : "Themed evidence props"}</h4>
                <p>
                  One reusable visual replacement for every functional role. Recipients use this pack offline without adding it to their Asset Library.
                </p>
              </div>
              <span>
                {editingMansion.propThemeProgress?.readyCount ?? 0}/16 ready
              </span>
            </header>
            {editingMansion.propTheme ? (
              <p>Complete. Future cases reuse this pack without another model call.</p>
            ) : (
              <div className={styles.installedMansionMusicControls}>
                <button
                  type="button"
                  disabled={busy || editorSaving || responseMode === "local"}
                  onClick={() => void runSoundscapeMutation(
                    onGenerateProps,
                    "That venue prop pack could not be started.",
                  )}
                >
                  {editingMansion.propThemeProgress?.readyCount
                    ? "Continue missing props"
                    : "Generate themed prop pack"}
                </button>
                {(editingMansion.propThemeProgress?.variants ?? [])
                  .filter((variant) => variant.status === "failed")
                  .map((variant) => (
                    <button
                      key={variant.archetypeId}
                      type="button"
                      disabled={busy || editorSaving || responseMode === "local"}
                      onClick={() => void runSoundscapeMutation(
                        (mansion) => onRetryProp(mansion, variant.archetypeId),
                        `The ${variant.archetypeId.replaceAll("_", " ")} prop could not be retried.`,
                      )}
                    >
                      Retry {variant.archetypeId.replaceAll("_", " ")}
                    </button>
                  ))}
              </div>
            )}
            <small className={styles.installedMansionMusicPrivacy}>
              {responseMode === "local"
                ? "LOCAL uses ready packaged variants and PRISM fallbacks; it never contacts an image provider."
                : "Generation is restartable, accepts at most two automatic attempts per role, and never blocks a case."}
            </small>
          </section>
          <section
            className={styles.installedMansionMusic}
            data-tutorial-target="whodunnit-mansion-soundscape"
          >
            <header className={styles.installedMansionSoundscapeHeader}>
              <div>
                <small>Venue soundscape</small>
                <h4>Music and atmosphere</h4>
                <p>Audition the score separately from the continuous environmental bed and room acoustics.</p>
              </div>
            </header>
            <div className={styles.installedMansionSoundscapeTabs} role="tablist" aria-label="Venue soundscape">
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
                  kicker={editingMansion.music?.candidate ? "Music preview" : editingMansion.music?.active ? "Venue theme" : "PRISM fallback"}
                  volume={audioVolume}
                />
                {editingMansion.music?.candidate ? (
                  <div className={styles.installedMansionMusicDecision}>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onAcceptTheme, "That venue music could not be accepted.")}>Use this version</button>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardTheme, "That venue music preview could not be discarded.")}>Discard</button>
                  </div>
                ) : (
                  <div className={styles.installedMansionMusicControls}>
                    <button
                      type="button"
                      disabled={busy || editorSaving || responseMode === "local"}
                      onClick={() => void runSoundscapeMutation(onGenerateTheme, "That venue music could not be synthesized.")}
                    >
                      {editingMansion.music?.active ? "Resynthesize music" : "Synthesize music"}
                    </button>
                    {editingMansion.music?.previous ? (
                      <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onUndoTheme, "The previous venue music could not be restored.")}>Undo previous version</button>
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
                    <h4>{editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Venue identity bed" : "Bundled theme palette"}</h4>
                    <p>The world bed continues across rooms while exposure, filtering, emitters, and speech ducking crossfade around it.</p>
                  </div>
                  <span>{ambienceManifest ? `${ambienceManifest.roomProfiles.length} room profiles` : "Automatic"}</span>
                </header>
                {atmospherePreviewSource ? (
                  <SanctumAudioPlayer
                    src={atmospherePreviewSource}
                    label={atmosphereTrack?.title ?? `${editingMansion.houseStyle.atmosphere.weather} · ${editingMansion.houseStyle.atmosphere.timeOfDay}`}
                    kicker={editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Venue atmosphere" : "PRISM acoustic library"}
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
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onAcceptAtmosphere, "That venue atmosphere could not be accepted.")}>Use this version</button>
                    <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardAtmosphere, "That venue atmosphere preview could not be discarded.")}>Discard</button>
                  </div>
                ) : (
                  <div className={styles.installedMansionMusicControls}>
                    <button
                      type="button"
                      disabled={busy || editorSaving || responseMode === "local"}
                      onClick={() => void runSoundscapeMutation(onGenerateAtmosphere, "That venue atmosphere could not be synthesized.")}
                    >
                      {editingMansion.atmosphere?.active ? "Resynthesize atmosphere" : "Synthesize atmosphere"}
                    </button>
                    {editingMansion.atmosphere?.previous ? (
                      <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onUndoAtmosphere, "The previous venue atmosphere could not be restored.")}>Undo previous version</button>
                    ) : null}
                  </div>
                )}
                <small className={styles.installedMansionMusicPrivacy}>
                  {responseMode === "local"
                    ? "LOCAL uses packaged or bundled beds and procedural room mixing without contacting an online generator."
                    : "ONLINE can synthesize one seamless venue-wide bed. Only non-semantic environmental layers may play automatically; clue-bearing sounds require a sealed stage cue."}
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
                {editingMansion.derivation ? "Open Venue Editor" : "Duplicate & edit venue"}
              </button>
              <label>Optional export password<input type="password" value={exportPassword} autoComplete="new-password" disabled={editorSaving} onChange={(event) => onExportPasswordChange(event.currentTarget.value)} /></label>
              <button type="button" disabled={busy || editorSaving || editingMansion.portable?.license.allowsRedistribution === false} onClick={() => onExport(editingMansion)}>Export Mystery Venue</button>
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
          onRegenerateRoomArt={onRegenerateRoomArt}
        />
      ) : null}

      {removeConfirmation ? (
        <WhodunnitSetupDialog
          open
          id="installed-mansion-remove"
          theme={theme}
          eyebrow="Remove installed venue"
          title={`Remove ${resolveInstalledMansionPresentationV1(removeConfirmation).title}?`}
          description="This removes the local installed copy and its library details. Export it first if you want to keep the Mystery Venue file."
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
              Keep venue
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
