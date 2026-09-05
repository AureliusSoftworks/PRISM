"use client";

import { useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import type {
  DebateMysteryMansionBundleSummaryV1,
  MansionLayoutV2,
  MansionPropVariantProgressV1,
  WhodunnitPropArchetypeIdV1,
} from "@localai/shared";
import {
  DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1,
  WHODUNNIT_PROP_ARCHETYPES_V1,
  WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
  WHODUNNIT_SFX_CUE_IDS_V1,
  WHODUNNIT_SFX_CUES_V1,
  debateMysteryMansionHeldByArchiveV1,
  isWhodunnitSfxCueIdV1,
  mansionSfxPackStateFromAssetsV1,
  type WhodunnitSfxCueIdV1,
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
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import { debateMysteryBundledSfxUrlV1 } from "./debateMysterySfx";
import styles from "./debateMystery.module.css";

type VenueSoundDecisionV1 = "accept" | "undo" | null;

interface MansionEditorDraftV1 {
  mansionId: string;
  title: string;
  description: string;
  titleUsesDefault: boolean;
  descriptionUsesDefault: boolean;
  thumbnailAction: "keep" | "replace" | "default";
  thumbnailDataUrl: string | null;
  /** What the editor opened with, so unsaved details are detectable. */
  initial: { title: string; description: string; titleUsesDefault: boolean; descriptionUsesDefault: boolean };
  /** Refracted prop identities held until Save; the server has not seen them. */
  propIdentities: Record<string, { displayName: string; appearanceDescription: string }>;
  /** Music and atmosphere choices that apply on Save. */
  soundDecisions: {
    music: VenueSoundDecisionV1;
    atmosphere: VenueSoundDecisionV1;
    /** Per-cue effect choices, keyed by cue id. */
    effects: Record<string, Exclude<VenueSoundDecisionV1, null>>;
  };
}

/** One themed prop role: its sprite (or the PRISM fallback) and its
 * model-authored name and description. Both are refracted, never typed, and
 * nothing here writes: a refracted identity and a redrawn sprite wait as
 * drafts until the author saves the venue details. */
function VenuePropTile(props: {
  mansion: DebateMysteryMansionBundleSummaryV1;
  archetypeId: WhodunnitPropArchetypeIdV1;
  variant: MansionPropVariantProgressV1 | null;
  draftIdentity: { displayName: string; appearanceDescription: string } | null;
  responseMode: "local" | "online";
  busy: boolean;
  onSynthesize: (kind: "retry" | "regenerate") => void;
  onRefractIdentity: (() => void) | null;
  onDiscardCandidate: (() => void) | null;
}): JSX.Element {
  const definition = WHODUNNIT_PROP_ARCHETYPES_V1[props.archetypeId];
  const savedName = props.variant?.displayName?.trim() ?? "";
  const savedAppearance = props.variant?.appearanceDescription?.trim() ?? "";
  const displayName = props.draftIdentity?.displayName ?? savedName;
  const appearanceDescription = props.draftIdentity?.appearanceDescription ?? savedAppearance;
  const status = props.variant?.status ?? "pending";
  const assetId = props.variant?.assetId ?? null;
  const candidateAssetId = props.variant?.candidateAssetId ?? null;
  const candidateDrawing = props.variant?.candidateStatus === "pending";
  const candidateFailed = props.variant?.candidateStatus === "failed";
  const ready = status === "ready" && Boolean(assetId);
  const drawing = (status === "pending" && (props.variant?.attemptCount ?? 0) > 0) || candidateDrawing;
  const shownAssetId = candidateAssetId ?? assetId;
  const imageUrl = shownAssetId
    ? `/api/debates/mystery-mansions/${encodeURIComponent(props.mansion.id)}/assets/${encodeURIComponent(shownAssetId)}/file`
    : definition.prismFallback.publicPath;
  const chip = candidateAssetId
    ? "Redraw · saves on Save"
    : drawing ? "Drawing…" : candidateFailed ? "Redraw failed" : ready ? "Ready" : status === "failed" ? "Failed" : "PRISM fallback";
  return (
    <article
      className={styles.installedMansionPropTile}
      data-status={candidateAssetId ? "candidate" : ready ? "ready" : drawing ? "drawing" : status}
      data-unsaved={props.draftIdentity || candidateAssetId ? "true" : undefined}
    >
      {/* Direct delivery preserves the sealed route's no-store boundary. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" data-source={shownAssetId ? "venue" : "prism"} draggable={false} />
      <header>
        <small>{definition.label}</small>
        <span>{chip}</span>
      </header>
      <strong>
        {displayName || definition.prismFallback.displayName}
        {props.draftIdentity ? <em className={styles.installedMansionUnsaved}>Unsaved</em> : null}
      </strong>
      <p data-placeholder={appearanceDescription ? undefined : "true"}>
        {appearanceDescription || `Not refracted yet. ${definition.purpose}`}
      </p>
      <div className={styles.installedMansionActionRow}>
        <button
          type="button"
          disabled={props.busy || drawing || !props.onRefractIdentity}
          title="Write a fresh name and description for this role from the venue's style. It waits as a draft until you save."
          onClick={() => props.onRefractIdentity?.()}
        >Refract identity</button>
        {candidateAssetId || candidateFailed ? (
          <button
            type="button"
            disabled={props.busy || !props.onDiscardCandidate}
            title="Drop this redraw. The ready sprite was never touched."
            onClick={() => props.onDiscardCandidate?.()}
          >Discard redraw</button>
        ) : (
          <button
            type="button"
            disabled={props.busy || drawing || props.responseMode === "local" || Boolean(props.draftIdentity)}
            title={props.responseMode === "local"
              ? "Prop synthesis is ONLINE only. LOCAL keeps the current sprite or the PRISM fallback."
              : props.draftIdentity
                ? "Save first so the sprite is drawn to this identity."
                : ready
                  ? "Redraw this prop to its current name and description. The redraw waits beside the ready sprite until you save."
                  : status === "failed"
                    ? "Try this prop again."
                    : "Draw this prop to its name and description; a role without one is refracted first."}
            onClick={() => props.onSynthesize(status === "failed" ? "retry" : "regenerate")}
          >{ready ? "Resynthesize" : status === "failed" ? "Retry" : "Synthesize"}</button>
        )}
      </div>
    </article>
  );
}

/** The venue details editor is a rail of focused views instead of one long scroll. */
type VenueEditorTab = "details" | "cover" | "props" | "sound" | "sharing";

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
  /** Pre-setup parity with Field Repair; results land in the editor's draft. */
  onDetectRoomLights?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<import("@localai/shared").MansionDynamicLightV2[] | null>;
  onDetectRoomAnchors?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<import("@localai/shared").MansionPlacementAnchorV2[] | null>;
  onGenerateOverhead?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onNameRooms?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    entityIds: readonly string[],
  ) => Promise<Record<string, string> | null>;
  onExport: (mansion: DebateMysteryMansionBundleSummaryV1) => void;
  /** Synthesizes the investigation theme. The direction is the player's
   * Refract for this pass; an empty string keeps the canonical prompt. */
  onGenerateTheme: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    direction: string,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  onAcceptTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onUndoTheme: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  /** Synthesizes the environmental bed under the same Refract contract. */
  onGenerateAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1, direction: string) => Promise<MansionSoundscapeMutationResultV1>;
  /** Venue effects pack: one clip per cue, ONLINE only, a preview until Save.
   * The direction is the player's Refract for this pass; an empty string keeps
   * the venue's canonical prompt for that cue. */
  onGenerateSfx?: (mansion: DebateMysteryMansionBundleSummaryV1, cueId: WhodunnitSfxCueIdV1, direction: string) => Promise<MansionSoundscapeMutationResultV1>;
  onAcceptSfx?: (mansion: DebateMysteryMansionBundleSummaryV1, cueId: WhodunnitSfxCueIdV1) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardSfx?: (mansion: DebateMysteryMansionBundleSummaryV1, cueId: WhodunnitSfxCueIdV1) => Promise<MansionSoundscapeMutationResultV1>;
  onUndoSfx?: (mansion: DebateMysteryMansionBundleSummaryV1, cueId: WhodunnitSfxCueIdV1) => Promise<MansionSoundscapeMutationResultV1>;
  /** The parent's in-flight venue synthesis, so the editor shows the refract loader for it. */
  activity?: "generating-music" | "generating-atmosphere" | "generating-props" | "generating-sfx" | null;
  onAcceptAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onUndoAtmosphere: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onGenerateProps: (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>;
  onRetryProp: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  /** Redraws one role from its authored identity, whatever its state. */
  onRegenerateProp?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  /** Refracts one role's model-authored name and description; nobody types
   * them, and the result stays a draft until Save. */
  onRefractPropIdentity?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
  ) => Promise<MansionSoundscapeMutationResultV1 & { identity?: { displayName: string; appearanceDescription: string } }>;
  onSavePropIdentity?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
    identity: { displayName: string; appearanceDescription: string },
  ) => Promise<MansionSoundscapeMutationResultV1>;
  /** A redraw waits beside the ready sprite; Save uses it, Discard drops it. */
  onAcceptPropCandidate?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    archetypeId: string,
  ) => Promise<MansionSoundscapeMutationResultV1>;
  onDiscardPropCandidate?: (
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
  onDetectRoomLights,
  onDetectRoomAnchors,
  onGenerateOverhead,
  onNameRooms,
  onExport,
  onGenerateTheme,
  onAcceptTheme,
  onDiscardTheme,
  onUndoTheme,
  onGenerateAtmosphere,
  onGenerateSfx,
  onAcceptSfx,
  onDiscardSfx,
  onUndoSfx,
  activity = null,
  onAcceptAtmosphere,
  onDiscardAtmosphere,
  onUndoAtmosphere,
  onGenerateProps,
  onRetryProp,
  onRegenerateProp,
  onRefractPropIdentity,
  onSavePropIdentity,
  onAcceptPropCandidate,
  onDiscardPropCandidate,
  onRemove,
}: InstalledMansionLibraryProps): JSX.Element {
  const [editor, setEditor] = useState<MansionEditorDraftV1 | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [exteriorDirection, setExteriorDirection] = useState("");
  const [musicDirection, setMusicDirection] = useState("");
  const [atmosphereDirection, setAtmosphereDirection] = useState("");
  const [effectsDirection, setEffectsDirection] = useState("");
  const [effectCueDirections, setEffectCueDirections] = useState<Partial<Record<WhodunnitSfxCueIdV1, string>>>({});
  const [exteriorCandidate, setExteriorCandidate] = useState<MansionExteriorCandidateV1 | null>(null);
  const [exteriorBusy, setExteriorBusy] = useState(false);
  const [exteriorStaged, setExteriorStaged] = useState(false);
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const [identityBusy, setIdentityBusy] = useState<string | null>(null);
  const [sfxBusy, setSfxBusy] = useState<{ cueId: WhodunnitSfxCueIdV1; index: number; total: number } | null>(null);
  const sfxBatchStopRef = useRef(false);
  const [loaderDismissed, setLoaderDismissed] = useState(false);
  const [editorSavedNotice, setEditorSavedNotice] = useState<string | null>(null);
  const [soundscapeTab, setSoundscapeTab] = useState<"music" | "atmosphere" | "effects">("music");
  const [editorTab, setEditorTab] = useState<VenueEditorTab>("details");
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
      initial: {
        title: presentation.title,
        description: presentation.description,
        titleUsesDefault: presentation.titleOverride === null,
        descriptionUsesDefault: presentation.descriptionOverride === null,
      },
      propIdentities: {},
      soundDecisions: { music: null, atmosphere: null, effects: {} },
    });
    setExteriorStaged(false);
    setDiscardConfirmation(false);
    setSoundscapeTab("music");
    setExteriorDirection("");
    setMusicDirection("");
    setAtmosphereDirection("");
    setEffectsDirection("");
    setEffectCueDirections({});
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
      // Staged only: the refracted exterior becomes the cover when the author saves.
      setExteriorCandidate(null);
      setExteriorStaged(true);
      setEditor((current) => current ? { ...current, thumbnailAction: "replace", thumbnailDataUrl } : current);
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
    setEditorSavedNotice(null);
    try {
      // 1. Library details.
      if (detailsDirty) {
        const saved = await onUpdate(editingMansion, {
          title: editor.titleUsesDefault ? null : title,
          description: editor.descriptionUsesDefault ? null : description,
          ...(editor.thumbnailAction === "replace"
            ? { thumbnailDataUrl: editor.thumbnailDataUrl }
            : editor.thumbnailAction === "default"
              ? { thumbnailDataUrl: null }
              : {}),
        });
        if (!saved) return;
        setEditor((current) => current
          ? { ...current, thumbnailAction: "keep", thumbnailDataUrl: null, initial: { title: current.title, description: current.description, titleUsesDefault: current.titleUsesDefault, descriptionUsesDefault: current.descriptionUsesDefault } }
          : current);
        setExteriorStaged(false);
      }
      // 2. Refracted prop identities.
      for (const [archetypeId, identity] of Object.entries(editor.propIdentities)) {
        if (!onSavePropIdentity) break;
        const result = await onSavePropIdentity(editingMansion, archetypeId, identity);
        if (!result.ok) {
          setEditorError(result.error ?? "A prop's identity could not be saved.");
          return;
        }
        setEditor((current) => {
          if (!current) return current;
          const propIdentities = { ...current.propIdentities };
          delete propIdentities[archetypeId];
          return { ...current, propIdentities };
        });
      }
      // 3. Redrawn sprites waiting beside ready ones.
      for (const variant of editingMansion.propThemeProgress?.variants ?? []) {
        if (variant.candidateStatus !== "ready" || !onAcceptPropCandidate) continue;
        const result = await onAcceptPropCandidate(editingMansion, variant.archetypeId);
        if (!result.ok) {
          setEditorError(result.error ?? "A redrawn prop could not be used.");
          return;
        }
      }
      // 4. Music and atmosphere decisions.
      const soundSteps: Array<["music" | "atmosphere", VenueSoundDecisionV1, (mansion: DebateMysteryMansionBundleSummaryV1) => Promise<MansionSoundscapeMutationResultV1>, string]> = [
        ["music", "accept", onAcceptTheme, "That venue music could not be accepted."],
        ["music", "undo", onUndoTheme, "The previous venue music could not be restored."],
        ["atmosphere", "accept", onAcceptAtmosphere, "That venue atmosphere could not be accepted."],
        ["atmosphere", "undo", onUndoAtmosphere, "The previous venue atmosphere could not be restored."],
      ];
      for (const [lane, decision, handler, fallback] of soundSteps) {
        if (editor.soundDecisions[lane] !== decision) continue;
        const result = await handler(editingMansion);
        if (!result.ok) {
          setEditorError(result.error ?? fallback);
          return;
        }
        setEditor((current) => current
          ? { ...current, soundDecisions: { ...current.soundDecisions, [lane]: null } }
          : current);
      }
      // 5. Effect decisions, one cue at a time.
      for (const [cueId, decision] of Object.entries(editor.soundDecisions.effects)) {
        if (!isWhodunnitSfxCueIdV1(cueId)) continue;
        const handler = decision === "accept" ? onAcceptSfx : onUndoSfx;
        if (!handler) continue;
        const result = await handler(editingMansion, cueId);
        if (!result.ok) {
          setEditorError(result.error ?? `The ${WHODUNNIT_SFX_CUES_V1[cueId].label.toLowerCase()} effect could not be ${decision === "accept" ? "accepted" : "restored"}.`);
          return;
        }
        setEditor((current) => {
          if (!current) return current;
          const effects = { ...current.soundDecisions.effects };
          delete effects[cueId];
          return { ...current, soundDecisions: { ...current.soundDecisions, effects } };
        });
      }
      // The editor stays open: each step above already reset its own part of
      // the draft, so the author lands on a clean, saved venue and keeps working.
      setEditorSavedNotice("Saved. The venue now carries everything you staged.");
    } finally {
      setEditorSaving(false);
    }
  };

  const closeEditor = (): void => {
    setEditor(null);
    setEditorTab("details");
    setExteriorStaged(false);
    setExteriorCandidate(null);
    setDiscardConfirmation(false);
    setEditorSavedNotice(null);
  };
  const stageSoundDecision = (lane: "music" | "atmosphere", decision: Exclude<VenueSoundDecisionV1, null>): void => {
    setEditor((current) => current
      ? { ...current, soundDecisions: { ...current.soundDecisions, [lane]: current.soundDecisions[lane] === decision ? null : decision } }
      : current);
  };
  const detailsDirty = Boolean(editor && (
    editor.thumbnailAction !== "keep" ||
    editor.title !== editor.initial.title ||
    editor.description !== editor.initial.description ||
    editor.titleUsesDefault !== editor.initial.titleUsesDefault ||
    editor.descriptionUsesDefault !== editor.initial.descriptionUsesDefault
  ));
  const propsDirty = Boolean(editor && (
    Object.keys(editor.propIdentities).length > 0 ||
    (editingMansion?.propThemeProgress?.variants ?? []).some((variant) => variant.candidateStatus === "ready")
  ));
  const soundDirty = Boolean(editor && (
    editor.soundDecisions.music !== null ||
    editor.soundDecisions.atmosphere !== null ||
    Object.keys(editor.soundDecisions.effects).length > 0
  ));
  const sfxPack = editingMansion?.sfxPack ?? mansionSfxPackStateFromAssetsV1(editingMansion?.assets ?? []);
  const sfxCueState = (cueId: WhodunnitSfxCueIdV1) => sfxPack.cues.find((cue) => cue.cueId === cueId)!;
  const missingEffectCues = WHODUNNIT_SFX_CUE_IDS_V1.filter((cueId) => {
    const cue = sfxCueState(cueId);
    return !cue.active && !cue.candidate;
  });
  const mansionAssetUrl = (assetId: string): string => editingMansion
    ? `/api/debates/mystery-mansions/${encodeURIComponent(editingMansion.id)}/assets/${encodeURIComponent(assetId)}/file`
    : "";
  const propsDrawing = (editingMansion?.propThemeProgress?.variants ?? []).filter((variant) =>
    (variant.status === "pending" && variant.attemptCount > 0) || variant.candidateStatus === "pending").length;
  const hardSynthesisActive = exteriorBusy || identityBusy !== null || sfxBusy !== null ||
    activity === "generating-music" || activity === "generating-atmosphere";
  useEffect(() => {
    if (!hardSynthesisActive) setLoaderDismissed(false);
  }, [hardSynthesisActive]);
  const stageEffectDecision = (cueId: WhodunnitSfxCueIdV1, decision: Exclude<VenueSoundDecisionV1, null>): void => {
    setEditor((current) => {
      if (!current) return current;
      const effects = { ...current.soundDecisions.effects };
      if (effects[cueId] === decision) delete effects[cueId];
      else effects[cueId] = decision;
      return { ...current, soundDecisions: { ...current.soundDecisions, effects } };
    });
  };
  /** A cue's own prompt wins; otherwise it takes the section direction. Every
   * synthesis path resolves here so one row button and "Resynthesize every
   * effect" can never disagree about which prompt a cue was drawn from. */
  const directionForCue = (cueId: WhodunnitSfxCueIdV1): string =>
    (effectCueDirections[cueId] ?? "").trim() ? effectCueDirections[cueId]! : effectsDirection;
  const cuesWithOwnDirection = WHODUNNIT_SFX_CUE_IDS_V1.filter(
    (cueId) => (effectCueDirections[cueId] ?? "").trim().length > 0,
  );
  // One cue at a time so the loader can name the clip in flight and a batch can
  // stop between clips. Each finished clip is already a preview on the server.
  const synthesizeEffects = async (cueIds: readonly WhodunnitSfxCueIdV1[]): Promise<void> => {
    if (!editingMansion || !onGenerateSfx || sfxBusy || cueIds.length === 0) return;
    sfxBatchStopRef.current = false;
    setLoaderDismissed(false);
    setEditorError(null);
    try {
      for (const [index, cueId] of cueIds.entries()) {
        if (sfxBatchStopRef.current) break;
        setSfxBusy({ cueId, index, total: cueIds.length });
        const result = await onGenerateSfx(editingMansion, cueId, directionForCue(cueId));
        if (!result.ok) {
          setEditorError(result.error ?? `The ${WHODUNNIT_SFX_CUES_V1[cueId].label.toLowerCase()} effect could not be synthesized.`);
          break;
        }
      }
    } finally {
      setSfxBusy(null);
    }
  };
  const editorDirty = detailsDirty || propsDirty || soundDirty;

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
          disabled={busy || mansions.every((mansion) => debateMysteryMansionHeldByArchiveV1(mansion))}
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
            const held = debateMysteryMansionHeldByArchiveV1(mansion);
            const selected = mansion.id === selectedMansionId && !held;
            const holdTitle = mansion.archiveHold?.caseTitle?.trim() || "an ongoing case";
            return (
              <article
                key={mansion.id}
                data-selected={selected ? "true" : undefined}
                data-held={held ? "true" : undefined}
              >
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
                  {held ? (
                    <small className={styles.installedMansionHold} title={DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1}>
                      In use by {holdTitle} in Archive
                    </small>
                  ) : null}
                </div>
                <div className={styles.installedMansionActions} data-held={held ? "true" : undefined}>
                  <button
                    type="button"
                    className={styles.installedMansionSelect}
                    aria-pressed={selected}
                    disabled={busy || held}
                    title={held ? DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1 : undefined}
                    onClick={() => onSelect(mansion.id)}
                  >
                    {selected ? "Selected ✓" : "Use this venue"}
                  </button>
                  {held ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || mansion.portable?.license.allowsRedistribution === false}
                        onClick={() => onExport(mansion)}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        title="Make an editable copy. The original stays reserved for the case still in Archive."
                        onClick={() => {
                          void onClone(mansion).then((copy) => {
                            if (copy) onSelect(copy.id);
                          });
                        }}
                      >
                        Work on a copy
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      data-tutorial-target="whodunnit-edit-mansion"
                      disabled={busy}
                      onClick={() => beginEditing(mansion)}
                    >
                      Edit details
                    </button>
                  )}
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
          onClose={() => { if (editorDirty && !editorSaving) setDiscardConfirmation(true); else closeEditor(); }}
        >
        <section className={styles.installedMansionEditor} data-editor-tab={editorTab}>
          {/* One focused view at a time. Details is the whole job for most
              visits; generation tooling waits behind its own rail entries. */}
          <nav className={styles.installedMansionEditorRail} aria-label="Venue details sections">
            {([
              {
                id: "details" as const,
                label: "Details",
                status: detailsDirty ? "Unsaved" : editor.titleUsesDefault && editor.descriptionUsesDefault ? "Default" : "Custom",
                attention: detailsDirty,
              },
              {
                id: "cover" as const,
                label: "Cover",
                status: exteriorCandidate ? "Candidate waiting" : editor.thumbnailAction !== "keep" ? "Unsaved" : "Custom",
                attention: Boolean(exteriorCandidate) || editor.thumbnailAction !== "keep",
              },
              {
                id: "props" as const,
                label: "Props",
                status: propsDirty ? "Unsaved" : editingMansion.propTheme ? "Complete" : `${editingMansion.propThemeProgress?.readyCount ?? 0}/16 ready`,
                attention: propsDirty,
              },
              {
                id: "sound" as const,
                label: "Sound",
                status: soundDirty
                  ? "Unsaved"
                  : editingMansion.music?.candidate || editingMansion.atmosphere?.candidate || sfxPack.candidateCount > 0
                    ? "Preview waiting"
                    : sfxPack.readyCount > 0 ? `Music · Atmosphere · ${sfxPack.readyCount}/${WHODUNNIT_SFX_CUE_IDS_V1.length} effects` : "Music · Atmosphere · Effects",
                attention: soundDirty || Boolean(editingMansion.music?.candidate || editingMansion.atmosphere?.candidate) || sfxPack.candidateCount > 0,
              },
              {
                id: "sharing" as const,
                label: "Sharing",
                status: editingMansion.portable?.license.allowsRedistribution === false ? "No export" : "Export · Editor",
                attention: false,
              },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={editorTab === tab.id}
                data-active={editorTab === tab.id ? "true" : undefined}
                data-attention={tab.attention ? "true" : undefined}
                onClick={() => setEditorTab(tab.id)}
              >
                {tab.label}
                <small>{tab.status}</small>
              </button>
            ))}
          </nav>
          <div className={styles.installedMansionEditorPane}>
            {editorTab === "details" ? (
              <>
                <h3>Details</h3>
                <p className={styles.installedMansionEditorLede}>How this venue reads in your library. Facts inside the venue never change here.</p>
                <div className={styles.installedMansionDetailsGrid}>
                  <div className={styles.installedMansionCoverPreview}>
                    {editorThumbnailUrl ? <img src={editorThumbnailUrl} alt="Current venue exterior cover" /> : <span aria-hidden="true">{editingMansion.rooms[0]?.emoji ?? "◇"}</span>}
                    <button type="button" disabled={editorSaving} onClick={() => setEditorTab("cover")}>Change cover</button>
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
                        rows={5}
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
                <div className={styles.installedMansionDanger}>
                  <p>Removing deletes this venue from PRISM. Cases already built on it keep their frozen copy.</p>
                  <button
                    type="button"
                    className={styles.savedMansionRemove}
                    disabled={busy || editorSaving}
                    onClick={() => setRemoveConfirmation(editingMansion)}
                  >
                    Remove from PRISM
                  </button>
                </div>
              </>
            ) : null}
            {editorTab === "cover" ? (
              <>
                <h3>Cover</h3>
                <p className={styles.installedMansionEditorLede}>One high-quality establishing view that shows the complete venue in its environment.</p>
                <div className={styles.installedMansionCoverCompare}>
                  <figure>
                    <figcaption>{exteriorStaged ? "Refracted · saves on Save" : editor.thumbnailAction === "replace" ? "Chosen · saves on Save" : "Current"}</figcaption>
                    {editorThumbnailUrl ? <img src={editorThumbnailUrl} alt="Current venue exterior cover" /> : <span aria-hidden="true">{editingMansion.rooms[0]?.emoji ?? "◇"}</span>}
                    <div className={styles.installedMansionActionRow}>
                      <label className={styles.installedMansionFileButton} htmlFor="installed-mansion-thumbnail">Choose exterior cover</label>
                      <input id="installed-mansion-thumbnail" type="file" accept="image/png,image/jpeg,image/webp" disabled={editorSaving} onChange={(event) => void chooseThumbnail(event)} />
                      <button
                        type="button"
                        disabled={editorSaving || editor.thumbnailAction === "default"}
                        onClick={() => setEditor((current) => current ? { ...current, thumbnailAction: "default", thumbnailDataUrl: null } : current)}
                      >
                        Use {editingMansion.portable ? "package" : "original"} exterior
                      </button>
                    </div>
                  </figure>
                  <figure data-candidate={exteriorCandidate ? "true" : undefined}>
                    <figcaption>{exteriorCandidate ? "Candidate" : "Refract a new exterior"}</figcaption>
                    {exteriorCandidate
                      ? <img src={exteriorCandidate.displayUrl} alt="Mystery Venue exterior candidate" />
                      : <span aria-hidden="true">✦</span>}
                    {exteriorCandidate ? (
                      <div className={styles.installedMansionActionRow}>
                        <button type="button" className={styles.installedMansionPrimaryAction} disabled={editorSaving || exteriorBusy} onClick={() => void acceptExteriorCandidate()}>Use this exterior</button>
                        <button type="button" disabled={editorSaving || exteriorBusy} onClick={() => setExteriorCandidate(null)}>Discard candidate</button>
                      </div>
                    ) : (
                      <div className={styles.installedMansionDirection}>
                        <label htmlFor="installed-mansion-exterior-direction">Direction for the Refract</label>
                        <textarea
                          id="installed-mansion-exterior-direction"
                          value={exteriorDirection}
                          maxLength={1_200}
                          rows={3}
                          disabled={editorSaving || exteriorBusy || responseMode === "local"}
                          placeholder={`Optional direction for this ${editingMansion.layoutV2?.venueProfile?.placeNoun ?? "estate"}: time of day, weather, vantage, mood.`}
                          onChange={(event) => setExteriorDirection(event.currentTarget.value)}
                        />
                        <div className={styles.installedMansionActionRow}>
                          <button
                            type="button"
                            className={styles.installedMansionPrimaryAction}
                            disabled={editorSaving || exteriorBusy || responseMode === "local"}
                            onClick={() => void refractExterior()}
                          >
                            {exteriorBusy ? "Refracting…" : "Refract exterior"}
                          </button>
                        </div>
                      </div>
                    )}
                  </figure>
                </div>
                <small className={styles.installedMansionMusicPrivacy}>{responseMode === "local" ? "ONLINE only · LOCAL keeps the neutral or accepted exterior." : "Refract creates a candidate only. Your accepted exterior stays unchanged until you choose Use this exterior."}</small>
              </>
            ) : null}
            {editorTab === "props" ? (
              <>
                <h3>Props</h3>
                <p className={styles.installedMansionEditorLede}>Sixteen physical roles, one object each. PRISM refracts a name and description for every role from the venue's style, so Case Forge knows exactly which object each clue is, and draws its sprite to that identity. Refract or resynthesize any of them here.</p>
                <section
                  className={styles.installedMansionMusic}
                  data-tutorial-target="whodunnit-mansion-prop-theme"
                  data-complete={editingMansion.propTheme ? "true" : undefined}
                >
                  <header className={styles.installedMansionSoundscapeHeader}>
                    <div>
                      <small>Venue evidence wardrobe</small>
                      <h4>{editingMansion.propTheme ? "16/16 themed props" : "Themed evidence props"}</h4>
                    </div>
                    <span>
                      {editingMansion.propThemeProgress?.readyCount ?? 0}/16 ready
                    </span>
                  </header>
                  {editingMansion.propTheme ? (
                    <p>Complete. Future cases reuse this pack without another model call. Recipients use it offline without adding it to their Asset Library.</p>
                  ) : (
                    <>
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
                      </div>
                      <small className={styles.installedMansionMusicPrivacy}>
                        {responseMode === "local"
                          ? "LOCAL uses ready packaged variants and PRISM fallbacks; it never contacts an image provider."
                          : "Generation is restartable, accepts at most two automatic attempts per role, and never blocks a case. A role without an identity is refracted first, then drawn to it."}
                      </small>
                    </>
                  )}
                </section>
                <div className={styles.installedMansionPropGrid} key={editingMansion.id}>
                  {WHODUNNIT_PROP_ARCHETYPE_IDS_V1.map((archetypeId) => (
                    <VenuePropTile
                      key={archetypeId}
                      mansion={editingMansion}
                      archetypeId={archetypeId}
                      variant={editingMansion.propThemeProgress?.variants.find((entry) => entry.archetypeId === archetypeId) ?? null}
                      responseMode={responseMode}
                      busy={busy || editorSaving}
                      onSynthesize={(kind) => void runSoundscapeMutation(
                        (mansion) => kind === "retry" || !onRegenerateProp
                          ? onRetryProp(mansion, archetypeId)
                          : onRegenerateProp(mansion, archetypeId),
                        `The ${WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId].label.toLowerCase()} prop could not be synthesized.`,
                      )}
                      draftIdentity={editor.propIdentities[archetypeId] ?? null}
                      onRefractIdentity={onRefractPropIdentity
                        ? () => void (async () => {
                            setEditorError(null);
                            setLoaderDismissed(false);
                            setIdentityBusy(archetypeId);
                            try {
                              const result = await onRefractPropIdentity(editingMansion, archetypeId);
                              if (!result.ok) {
                                setEditorError(result.error ?? `The ${WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId].label.toLowerCase()} prop's identity could not be refracted.`);
                                return;
                              }
                              const identity = result.identity;
                              if (identity) {
                                setEditor((current) => current
                                  ? { ...current, propIdentities: { ...current.propIdentities, [archetypeId]: identity } }
                                  : current);
                              }
                            } finally {
                              setIdentityBusy(null);
                            }
                          })()
                        : null}
                      onDiscardCandidate={onDiscardPropCandidate
                        ? () => void runSoundscapeMutation(
                            (mansion) => onDiscardPropCandidate(mansion, archetypeId),
                            `The ${WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId].label.toLowerCase()} prop's redraw could not be discarded.`,
                          )
                        : null}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {editorTab === "sound" ? (
              <>
                <h3>Sound</h3>
                <p className={styles.installedMansionEditorLede}>Audition the score separately from the continuous environmental bed and room acoustics.</p>
                <section
                  className={styles.installedMansionMusic}
                  data-tutorial-target="whodunnit-mansion-soundscape"
                >
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
                    <button
                      type="button"
                      role="tab"
                      aria-selected={soundscapeTab === "effects"}
                      data-active={soundscapeTab === "effects" ? "true" : undefined}
                      data-attention={sfxPack.candidateCount > 0 ? "true" : undefined}
                      onClick={() => setSoundscapeTab("effects")}
                    >
                      Effects
                    </button>
                  </div>
                  {soundscapeTab === "music" ? (
                    <div className={styles.installedMansionSoundscapePanel} role="tabpanel" data-soundscape-panel="music">
                      <header>
                        <div>
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
                          <button type="button" disabled={busy || editorSaving} data-staged={editor.soundDecisions.music === "accept" ? "true" : undefined} onClick={() => stageSoundDecision("music", "accept")}>{editor.soundDecisions.music === "accept" ? "Will use this version · Save to apply" : "Use this version"}</button>
                          <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardTheme, "That venue music preview could not be discarded.")}>Discard</button>
                        </div>
                      ) : (
                        <>
                        <div className={styles.installedMansionDirection}>
                          <label htmlFor="installed-mansion-music-direction">Direction for the Refract</label>
                          <textarea
                            id="installed-mansion-music-direction"
                            value={musicDirection}
                            maxLength={600}
                            rows={2}
                            disabled={busy || editorSaving || responseMode === "local"}
                            placeholder="Optional character for this theme: instrument to favor, mood, era. It stays instrument-only, quiet, and dialogue-safe."
                            onChange={(event) => setMusicDirection(event.currentTarget.value)}
                          />
                          <small>
                            {musicDirection.trim()
                              ? "Applies to the next music synthesis."
                              : "Leave it blank to keep the venue's canonical PRISM prompt."}
                          </small>
                        </div>
                        <div className={styles.installedMansionMusicControls}>
                          <button
                            type="button"
                            disabled={busy || editorSaving || responseMode === "local"}
                            onClick={() => void runSoundscapeMutation((mansion) => onGenerateTheme(mansion, musicDirection), "That venue music could not be synthesized.")}
                          >
                            {editingMansion.music?.active ? "Resynthesize music" : "Synthesize music"}
                          </button>
                          {editingMansion.music?.previous ? (
                            <button type="button" disabled={busy || editorSaving} data-staged={editor.soundDecisions.music === "undo" ? "true" : undefined} onClick={() => stageSoundDecision("music", "undo")}>{editor.soundDecisions.music === "undo" ? "Will restore the previous version · Save to apply" : "Undo previous version"}</button>
                          ) : null}
                        </div>
                        </>
                      )}
                      <small className={styles.installedMansionMusicPrivacy}>
                        {responseMode === "local"
                          ? "LOCAL stays fully offline. You can audition packaged or bundled music; switch to ONLINE to synthesize."
                          : "ONLINE synthesis uses ElevenLabs Music. Instrument-only versions remain previews until you explicitly accept them."}
                      </small>
                    </div>
                  ) : soundscapeTab === "atmosphere" ? (
                    <div className={styles.installedMansionSoundscapePanel} role="tabpanel" data-soundscape-panel="atmosphere">
                      <header>
                        <div>
                          <h4>{editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Venue identity bed" : "Bundled environmental bed"}</h4>
                          <p>The world bed continues across rooms while exposure, filtering, emitters, and speech ducking crossfade around it.</p>
                        </div>
                        <span>{ambienceManifest ? `${ambienceManifest.roomProfiles.length} room profiles` : "Automatic"}</span>
                      </header>
                      {atmospherePreviewSource ? (
                        <SanctumAudioPlayer
                          src={atmospherePreviewSource}
                          label={atmosphereTrack?.title ?? `${editingMansion.houseStyle.atmosphere.weather} · ${editingMansion.houseStyle.atmosphere.timeOfDay}`}
                          kicker={editingMansion.atmosphere?.candidate ? "Atmosphere preview" : editingMansion.atmosphere?.active || ambienceManifest?.bespokeSynthesisRequested ? "Venue atmosphere" : "PRISM fallback"}
                          volume={audioVolume}
                        />
                      ) : (
                        <p className={styles.installedMansionAtmosphereFallback}>Silence is the safe fallback when no compatible environmental bed is available.</p>
                      )}
                      <dl className={styles.installedMansionAtmosphereFacts}>
                        <div><dt>Palette</dt><dd>{editingMansion.houseStyle.acousticThemePaletteId}</dd></div>
                        <div><dt>World</dt><dd>{editingMansion.houseStyle.atmosphere.exteriorSetting}</dd></div>
                        <div><dt>Weather</dt><dd>{editingMansion.houseStyle.atmosphere.weather}</dd></div>
                        <div><dt>Room treatment</dt><dd>{ambienceManifest ? `${ambienceManifest.crossfade.roomTransitionMs} ms crossfade · speech duck ${Math.round(ambienceManifest.speechDucking.gain * 100)}%` : "Procedural"}</dd></div>
                      </dl>
                      {editingMansion.atmosphere?.candidate ? (
                        <div className={styles.installedMansionMusicDecision}>
                          <button type="button" disabled={busy || editorSaving} data-staged={editor.soundDecisions.atmosphere === "accept" ? "true" : undefined} onClick={() => stageSoundDecision("atmosphere", "accept")}>{editor.soundDecisions.atmosphere === "accept" ? "Will use this version · Save to apply" : "Use this version"}</button>
                          <button type="button" disabled={busy || editorSaving} onClick={() => void runSoundscapeMutation(onDiscardAtmosphere, "That venue atmosphere preview could not be discarded.")}>Discard</button>
                        </div>
                      ) : (
                        <>
                        <div className={styles.installedMansionDirection}>
                          <label htmlFor="installed-mansion-atmosphere-direction">Direction for the Refract</label>
                          <textarea
                            id="installed-mansion-atmosphere-direction"
                            value={atmosphereDirection}
                            maxLength={600}
                            rows={2}
                            disabled={busy || editorSaving || responseMode === "local"}
                            placeholder="Optional character for this bed: weather, materials, distance. It stays a seamless non-semantic loop with room for speech."
                            onChange={(event) => setAtmosphereDirection(event.currentTarget.value)}
                          />
                          <small>
                            {atmosphereDirection.trim()
                              ? "Applies to the next atmosphere synthesis."
                              : "Leave it blank to keep the venue's canonical PRISM prompt."}
                          </small>
                        </div>
                        <div className={styles.installedMansionMusicControls}>
                          <button
                            type="button"
                            disabled={busy || editorSaving || responseMode === "local"}
                            onClick={() => void runSoundscapeMutation((mansion) => onGenerateAtmosphere(mansion, atmosphereDirection), "That venue atmosphere could not be synthesized.")}
                          >
                            {editingMansion.atmosphere?.active ? "Resynthesize atmosphere" : "Synthesize atmosphere"}
                          </button>
                          {editingMansion.atmosphere?.previous ? (
                            <button type="button" disabled={busy || editorSaving} data-staged={editor.soundDecisions.atmosphere === "undo" ? "true" : undefined} onClick={() => stageSoundDecision("atmosphere", "undo")}>{editor.soundDecisions.atmosphere === "undo" ? "Will restore the previous version · Save to apply" : "Undo previous version"}</button>
                          ) : null}
                        </div>
                        </>
                      )}
                      <small className={styles.installedMansionMusicPrivacy}>
                        {responseMode === "local"
                          ? "LOCAL uses packaged or bundled beds and procedural room mixing without contacting an online generator."
                          : "ONLINE can synthesize one seamless venue-wide bed. Only non-semantic environmental layers may play automatically; clue-bearing sounds require a sealed stage cue."}
                      </small>
                    </div>
                  ) : (
                    <div className={styles.installedMansionSoundscapePanel} role="tabpanel" data-soundscape-panel="effects">
                      <header>
                        <div>
                          <h4>{sfxPack.complete ? "Venue effects pack" : sfxPack.readyCount > 0 ? "Venue effects · partial pack" : "Bundled PRISM effects"}</h4>
                          <p>Every interaction cue can carry the venue's own clip, drawn to its materials and era. Cues without one keep the bundled PRISM sound.</p>
                        </div>
                        <span>{`${sfxPack.readyCount}/${WHODUNNIT_SFX_CUE_IDS_V1.length} venue clips`}</span>
                      </header>
                      <div className={styles.installedMansionDirection}>
                        <label htmlFor="installed-mansion-effects-direction">Direction for the Refract</label>
                        <textarea
                          id="installed-mansion-effects-direction"
                          value={effectsDirection}
                          maxLength={600}
                          rows={2}
                          disabled={busy || editorSaving || responseMode === "local" || sfxBusy !== null || !onGenerateSfx}
                          placeholder="Optional character for these effects: materials, weight, age, room. Every cue keeps its own job and stays a short dry one-shot."
                          onChange={(event) => setEffectsDirection(event.currentTarget.value)}
                        />
                        <small>
                          {effectsDirection.trim()
                            ? cuesWithOwnDirection.length > 0
                              ? `Applies to every effect you synthesize next, except the ${cuesWithOwnDirection.length} with their own prompt below.`
                              : "Applies to every effect you synthesize next, one cue or all of them."
                            : cuesWithOwnDirection.length > 0
                              ? `Blank, so each cue keeps its canonical PRISM prompt except the ${cuesWithOwnDirection.length} with their own below.`
                              : "Leave it blank to keep each cue's canonical PRISM prompt."}
                        </small>
                      </div>
                      <div className={styles.installedMansionMusicControls}>
                        <button
                          type="button"
                          disabled={busy || editorSaving || responseMode === "local" || sfxBusy !== null || !onGenerateSfx || missingEffectCues.length === 0}
                          onClick={() => void synthesizeEffects(missingEffectCues)}
                        >
                          {sfxPack.readyCount > 0 || sfxPack.candidateCount > 0 ? `Synthesize the rest (${missingEffectCues.length})` : "Synthesize all effects"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || editorSaving || responseMode === "local" || sfxBusy !== null || !onGenerateSfx || sfxPack.readyCount === 0}
                          title="Draw a fresh preview for every cue that has no preview waiting. Ready clips stay until you save."
                          onClick={() => void synthesizeEffects(WHODUNNIT_SFX_CUE_IDS_V1.filter((cueId) => !sfxCueState(cueId).candidate))}
                        >
                          Resynthesize every effect
                        </button>
                      </div>
                      <ul className={styles.installedMansionEffectList}>
                        {WHODUNNIT_SFX_CUE_IDS_V1.map((cueId) => {
                          const cue = sfxCueState(cueId);
                          const definition = WHODUNNIT_SFX_CUES_V1[cueId];
                          const decision = editor.soundDecisions.effects[cueId] ?? null;
                          const previewAssetId = cue.candidate?.assetId ?? cue.active?.assetId ?? null;
                          const previewSource = previewAssetId ? mansionAssetUrl(previewAssetId) : debateMysteryBundledSfxUrlV1(cueId);
                          return (
                            <li
                              key={cueId}
                              className={styles.installedMansionEffectRow}
                              data-state={cue.candidate ? "candidate" : cue.active ? "venue" : "bundled"}
                              data-unsaved={decision ? "true" : undefined}
                            >
                              <div>
                                <strong>
                                  {definition.label}
                                  {decision ? <em className={styles.installedMansionUnsaved}>Unsaved</em> : null}
                                </strong>
                                <small>{definition.purpose}</small>
                                <span>{cue.candidate ? "Preview · saves on Save" : cue.active ? "Venue clip" : "Bundled PRISM"}</span>
                              </div>
                              <SanctumAudioPlayer
                                src={previewSource}
                                label={definition.label}
                                kicker={cue.candidate ? "Effect preview" : cue.active ? "Venue effect" : "PRISM fallback"}
                                volume={audioVolume}
                              />
                              <div className={styles.installedMansionActionRow}>
                                {cue.candidate ? (
                                  <>
                                    <button type="button" disabled={busy || editorSaving} data-staged={decision === "accept" ? "true" : undefined} onClick={() => stageEffectDecision(cueId, "accept")}>{decision === "accept" ? "Will use · Save to apply" : "Use this clip"}</button>
                                    <button type="button" disabled={busy || editorSaving || !onDiscardSfx} onClick={() => void runSoundscapeMutation((mansion) => onDiscardSfx!(mansion, cueId), "That effect preview could not be discarded.")}>Discard</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" disabled={busy || editorSaving || responseMode === "local" || sfxBusy !== null || !onGenerateSfx} onClick={() => void synthesizeEffects([cueId])}>{cue.active ? "Resynthesize" : "Synthesize"}</button>
                                    {cue.previous ? (
                                      <button type="button" disabled={busy || editorSaving} data-staged={decision === "undo" ? "true" : undefined} onClick={() => stageEffectDecision(cueId, "undo")}>{decision === "undo" ? "Will restore previous · Save to apply" : "Undo previous"}</button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              {cue.candidate ? null : (
                                <input
                                  className={styles.installedMansionCueDirection}
                                  type="text"
                                  value={effectCueDirections[cueId] ?? ""}
                                  maxLength={300}
                                  disabled={busy || editorSaving || responseMode === "local" || sfxBusy !== null || !onGenerateSfx}
                                  data-cue-direction={cueId}
                                  data-overriding={(effectCueDirections[cueId] ?? "").trim() ? "true" : undefined}
                                  aria-label={`Direction for the ${definition.label.toLocaleLowerCase()} effect`}
                                  placeholder={`Prompt just this cue, or leave it to the direction above${effectsDirection.trim() ? "" : " and PRISM's own"}.`}
                                  onChange={(event) => {
                                    const next = event.currentTarget.value;
                                    setEffectCueDirections((current) => ({ ...current, [cueId]: next }));
                                  }}
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <small className={styles.installedMansionMusicPrivacy}>
                        {responseMode === "local"
                          ? "LOCAL stays fully offline. Bundled effects play; switch to ONLINE to synthesize the venue's own clips."
                          : "ONLINE synthesis uses ElevenLabs sound effects, one short clip per cue. Clips stay previews until you save, and active clips travel with the venue package."}
                      </small>
                    </div>
                  )}
                </section>
              </>
            ) : null}
            {editorTab === "sharing" ? (
              <>
                <h3>Sharing</h3>
                <p className={styles.installedMansionEditorLede}>Take the venue further, or hand it to someone else as a portable package.</p>
                <div className={styles.installedMansionShareRow}>
                  <div>
                    <h4>{editingMansion.derivation ? "Venue Editor" : "Make it yours"}</h4>
                    <p>{editingMansion.derivation ? "Open the rooms, lights, and layout for this venue." : "Duplicate this venue into an editable copy, then open its rooms, lights, and layout."}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.mansionEditorLaunch}
                    data-tutorial-target="whodunnit-open-mansion-editor"
                    disabled={busy || editorSaving}
                    onClick={() => void openMansionEditor()}
                  >
                    {editingMansion.derivation ? "Open Venue Editor" : "Duplicate & edit venue"}
                  </button>
                </div>
                <div className={styles.installedMansionShareRow}>
                  <div>
                    <h4>Export Mystery Venue</h4>
                    <p>{editingMansion.portable?.license.allowsRedistribution === false ? "This package's license does not allow redistribution." : "A portable .mansion file with its exterior, props, and soundscape. Add a password to seal it."}</p>
                    <label className={styles.installedMansionExportPassword}>Optional export password<input type="password" value={exportPassword} autoComplete="new-password" disabled={editorSaving} onChange={(event) => onExportPasswordChange(event.currentTarget.value)} /></label>
                  </div>
                  <button type="button" disabled={busy || editorSaving || editingMansion.portable?.license.allowsRedistribution === false} onClick={() => onExport(editingMansion)}>Export Mystery Venue</button>
                </div>
              </>
            ) : null}
            {editorError ? <p className={styles.installedMansionEditorError} role="alert">{editorError}</p> : null}
            <div className={styles.installedMansionEditorFooter}>
              <small>
                {editorDirty
                  ? [
                      detailsDirty ? "details" : null,
                      Object.keys(editor.propIdentities).length ? `${Object.keys(editor.propIdentities).length} prop identit${Object.keys(editor.propIdentities).length === 1 ? "y" : "ies"}` : null,
                      (editingMansion.propThemeProgress?.variants ?? []).some((variant) => variant.candidateStatus === "ready") ? "redrawn props" : null,
                      soundDirty ? "sound choices" : null,
                    ].filter(Boolean).join(", ").replace(/^./u, (letter) => letter.toUpperCase()) + " will save. Nothing is written until you do."
                  : editorSavedNotice ?? "Nothing is written until you save. Refract and synthesize only make previews."}
              </small>
              <button type="button" className={styles.installedMansionSave} disabled={busy || editorSaving || !editorDirty} onClick={() => void saveEditor()}>{editorSaving ? "Saving…" : "Save changes"}</button>
            </div>
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
          onDetectRoomLights={onDetectRoomLights}
          onDetectRoomAnchors={onDetectRoomAnchors}
          onGenerateOverhead={onGenerateOverhead}
          onNameRooms={onNameRooms}
        />
      ) : null}

      {/* Every synthesis waits behind PRISM's refract loader: hard while a
          request the editor awaits is in flight, docked and soft while prop
          sprites draw in the background. Requests already sent finish on the
          server either way; the hard loader's cancel stops a batch between
          clips or simply hides the wait. */}
      <PrismBlockingLoader
        open={editor !== null && hardSynthesisActive && !loaderDismissed}
        operation="refraction"
        theme={theme}
        eyebrow="PRISM / Venue"
        title={sfxBusy
          ? sfxBusy.total > 1
            ? `Synthesizing venue effects · ${sfxBusy.index + 1} of ${sfxBusy.total}`
            : `Synthesizing the ${WHODUNNIT_SFX_CUES_V1[sfxBusy.cueId].label.toLowerCase()} effect`
          : identityBusy
            ? `Refracting the ${(WHODUNNIT_PROP_ARCHETYPES_V1 as Record<string, { label: string } | undefined>)[identityBusy]?.label.toLowerCase() ?? "prop"} identity`
            : exteriorBusy
              ? "Refracting the exterior"
              : activity === "generating-music"
                ? "Synthesizing venue music"
                : "Synthesizing venue atmosphere"}
        detail={sfxBusy
          ? `${WHODUNNIT_SFX_CUES_V1[sfxBusy.cueId].purpose} The clip lands as a preview; nothing changes until you save.`
          : identityBusy
            ? "A fresh name and description drawn from the venue's style. It waits as a draft until you save."
            : exteriorBusy
              ? "One establishing shot of the venue from outside. Use it or discard it before saving."
              : "A preview you can audition before choosing it. Nothing changes until you save."}
        stepLabel={sfxBusy
          ? WHODUNNIT_SFX_CUES_V1[sfxBusy.cueId].label
          : identityBusy ? "Writing the identity" : exteriorBusy ? "Painting the exterior" : "Composing"}
        progress={sfxBusy && sfxBusy.total > 1 ? sfxBusy.index / sfxBusy.total : null}
        footer="Nothing is written to the venue until you save."
        cancelLabel={sfxBusy && sfxBusy.total > 1 ? "Stop after this clip" : "Hide"}
        cancelConfirmTitle={sfxBusy && sfxBusy.total > 1 ? "Stop synthesizing effects?" : "Hide this wait?"}
        cancelConfirmDetail={sfxBusy && sfxBusy.total > 1
          ? "The clip in flight finishes and stays as a preview. No further clips start."
          : "The request finishes on its own and its preview still lands in the editor."}
        onCancel={() => {
          sfxBatchStopRef.current = true;
          setLoaderDismissed(true);
        }}
      />
      <PrismBlockingLoader
        open={editor !== null && propsDrawing > 0 && !hardSynthesisActive}
        placement="docked"
        theme={theme}
        eyebrow="PRISM / Venue props"
        title={propsDrawing > 1 ? `Drawing ${propsDrawing} prop sprites` : "Drawing a prop sprite"}
        detail="Soft synthesis runs in the background. Redraws of ready props wait beside them until you save."
        stepLabel={propsDrawing > 1 ? `${propsDrawing} in flight` : "One in flight"}
        progress={editingMansion?.propThemeProgress
          ? editingMansion.propThemeProgress.readyCount / WHODUNNIT_PROP_ARCHETYPE_IDS_V1.length
          : null}
        footer="Keep editing. Each sprite swaps in as it lands."
      />
      {discardConfirmation && editor ? (
        <WhodunnitSetupDialog
          open
          id="installed-mansion-discard"
          theme={theme}
          eyebrow="Unsaved changes"
          title="Discard unsaved venue changes?"
          description="Refracted identities, redrawn props, sound choices, and library details you have not saved will be dropped. Previews on the server stay until you discard or replace them."
          role="alertdialog"
          busy={editorSaving}
          onClose={() => setDiscardConfirmation(false)}
        >
          <div className={styles.installedMansionConfirmActions}>
            <button type="button" disabled={editorSaving} onClick={() => setDiscardConfirmation(false)}>Keep editing</button>
            <button type="button" className={styles.savedMansionRemove} disabled={editorSaving} onClick={closeEditor}>Discard changes</button>
          </div>
        </WhodunnitSetupDialog>
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
