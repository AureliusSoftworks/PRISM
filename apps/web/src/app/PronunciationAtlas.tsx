"use client";

import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  voiceAccentDefinitionForId,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
} from "@localai/shared";
import { useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { AdjustmentPad } from "./AdjustmentPad";
import type {
  AdjustmentPadAdapter,
  AdjustmentPadPoint,
} from "./adjustmentPadModel";
import styles from "./PronunciationAtlas.module.css";
import {
  normalizePronunciationAtlasSelection,
  nudgePronunciationAtlasSelectionInLens,
  projectPronunciationAtlasPointIntoLens,
  pronunciationAtlasDrillCandidates,
  pronunciationAtlasDrillLensAtPoint,
  pronunciationAtlasLensForId,
  pronunciationAtlasNaturalSelection,
  pronunciationAtlasNearestDrillLens,
  pronunciationAtlasLocationText,
  pronunciationAtlasPointForSelection,
  pronunciationAtlasPointFromLensProjection,
  pronunciationAtlasSelectionAtPoint,
  pronunciationAtlasValueText,
  pronunciationAtlasVariantCandidatesInLens,
  type PronunciationAtlasLens,
  type PronunciationAtlasSelection,
} from "./pronunciationAtlasModel";

interface PronunciationAtlasPadValue {
  selection: PronunciationAtlasSelection;
  /** The pin's lens-space display point; selection.point stays global. */
  point: AdjustmentPadPoint;
}

export interface PronunciationAtlasProps {
  selection: PronunciationAtlasSelection;
  onPreview: (selection: PronunciationAtlasSelection) => void;
  onCommit: (selection: PronunciationAtlasSelection) => void;
  onCancel?: (selection: PronunciationAtlasSelection) => void;
  onContinue?: () => void;
  color?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}

function padValueForSelection(
  selection: PronunciationAtlasSelection,
  lens: PronunciationAtlasLens,
): PronunciationAtlasPadValue {
  const normalized = normalizePronunciationAtlasSelection(selection);
  return {
    selection: normalized,
    point: projectPronunciationAtlasPointIntoLens(
      pronunciationAtlasPointForSelection(normalized),
      lens,
    ),
  };
}

function PronunciationAtlasMap({
  lens,
}: {
  lens: PronunciationAtlasLens;
}): ReactElement {
  const zoomed = lens.size < 1;
  const lensStyle = zoomed
    ? ({
        "--atlas-lens-zoom": `${1 / lens.size}`,
        "--atlas-lens-pos-x": `${(lens.x / (1 - lens.size)) * 100}%`,
        "--atlas-lens-pos-y": `${(lens.y / (1 - lens.size)) * 100}%`,
      } as CSSProperties)
    : undefined;
  // Footprints are the map's own click targets now: the world always shows
  // its regions (clicking one drills in), and zoomed views mark where a
  // deeper drill is available.
  const footprints = pronunciationAtlasDrillCandidates(lens);
  return (
    <div className={styles.map} aria-hidden="true" style={lensStyle}>
      <span className={styles.world} />
      <span className={styles.borders} />
      <div className={styles.longitudeLines} />
      {footprints.map((mark) => {
        const origin = projectPronunciationAtlasPointIntoLens(
          { x: mark.x, y: mark.y },
          lens,
        );
        return (
          <span
            key={mark.id}
            className={styles.lensFootprint}
            style={{
              left: `${origin.x * 100}%`,
              top: `${origin.y * 100}%`,
              width: `${(mark.size / lens.size) * 100}%`,
              height: `${(mark.size / lens.size) * 100}%`,
            }}
          >
            <small>{mark.label}</small>
          </span>
        );
      })}
      <div className={styles.scan} data-prism-decorative-motion="true" />
    </div>
  );
}

function foundationSelectValue(
  selection: PronunciationAtlasSelection,
): LocalVoicePronunciationBase {
  return selection.pronunciationBase;
}

function accentDefinitionIdForSelection(
  pronunciationBase: LocalVoicePronunciationBase,
  influence: LocalVoiceSpeechprintInfluence,
  currentAccentDefinitionId?: string | null,
): string | null {
  const current = voiceAccentDefinitionForId(currentAccentDefinitionId);
  if (
    current?.localSpeechprintFallback === influence &&
    (!current.localPronunciationBaseFallback ||
      current.localPronunciationBaseFallback === pronunciationBase)
  ) {
    return current.id;
  }
  if (influence !== "none") return influence;
  if (pronunciationBase === "en-US") return "american-english";
  if (pronunciationBase === "en-GB") return "british-english";
  return null;
}

export function PronunciationAtlas({
  selection,
  onPreview,
  onCommit,
  onCancel,
  onContinue,
  color,
  disabled = false,
  className,
  label = "Accent map",
}: PronunciationAtlasProps): ReactElement {
  const normalizedSelection = normalizePronunciationAtlasSelection(selection);
  const [draftValue, setDraftValue] =
    useState<PronunciationAtlasPadValue | null>(null);
  // The lens is view state only: it zooms the pad, artwork, and pointer
  // precision while every committed pin stays in global map space.
  const [lensId, setLensId] = useState<string>("world");
  // Pointer clicks that land on a drill target navigate instead of placing
  // the pin; the intent is stashed here and resolved on commit.
  const pendingDrillRef = useRef<string | null>(null);
  const lens = pronunciationAtlasLensForId(lensId);
  const padValue: PronunciationAtlasPadValue =
    draftValue ?? padValueForSelection(normalizedSelection, lens);

  const adapter: AdjustmentPadAdapter<PronunciationAtlasPadValue> = {
    toPoint: (value) => value.point,
    fromPoint: (point, current) => {
      const globalPoint = pronunciationAtlasPointFromLensProjection(point, lens);
      // The world view is navigation-only: every click resolves to a
      // region (nearest, for open-ocean clicks). Zoomed views drill only
      // when the click lands inside a deeper footprint.
      const drill =
        lens.size >= 1
          ? pronunciationAtlasDrillLensAtPoint(globalPoint, lens) ??
            pronunciationAtlasNearestDrillLens(globalPoint, lens)
          : pronunciationAtlasDrillLensAtPoint(globalPoint, lens);
      if (drill) {
        pendingDrillRef.current = drill.id;
        return current;
      }
      pendingDrillRef.current = null;
      return {
        point,
        selection: pronunciationAtlasSelectionAtPoint(
          globalPoint,
          current.selection,
        ),
      };
    },
    nudge: (value, direction, multiplier) => {
      // Keyboard travel stays global and precise; it never drills.
      pendingDrillRef.current = null;
      const nextSelection = nudgePronunciationAtlasSelectionInLens(
        value.selection,
        direction,
        multiplier,
        lens,
      );
      return padValueForSelection(nextSelection, lens);
    },
    valueText: (value) => pronunciationAtlasValueText(value.selection),
  };
  const restoreValue = padValueForSelection(
    pronunciationAtlasNaturalSelection(normalizedSelection.sourceLocale),
    lens,
  );
  const summary = pronunciationAtlasLocationText(padValue.selection);
  const variantCandidates = pronunciationAtlasVariantCandidatesInLens(
    lens,
    padValue.selection,
  );
  const fallbackId = useId();

  const commitSelection = (next: PronunciationAtlasSelection): void => {
    const normalized = normalizePronunciationAtlasSelection(next);
    setDraftValue(null);
    onCommit(normalized);
  };

  return (
    <section
      className={`${styles.atlas}${className ? ` ${className}` : ""}`}
      data-pronunciation-atlas="true"
      data-atlas-view={lens.size < 1 ? "region" : "world"}
      style={
        color
          ? ({ "--pronunciation-atlas-color": color } as CSSProperties)
          : undefined
      }
      aria-label={label}
    >
      <div className={styles.heading}>
        <span>
          <strong>{label}</strong>
          <small>Place a regional pronunciation starting point</small>
        </span>
        <output aria-live="polite">{summary}</output>
      </div>
      <AdjustmentPad
        label={label}
        value={padValue}
        restoreValue={restoreValue}
        adapter={adapter}
        className={styles.pad}
        color={color}
        disabled={disabled}
        onPreview={(next) => {
          setDraftValue(next);
          if (!pendingDrillRef.current) onPreview(next.selection);
        }}
        onCommit={(next) => {
          const drillTarget = pendingDrillRef.current;
          if (drillTarget) {
            // Navigation, not placement: zoom in and leave the pin alone.
            pendingDrillRef.current = null;
            setDraftValue(null);
            setLensId(drillTarget);
            return;
          }
          const committed = padValueForSelection(next.selection, lens);
          setDraftValue(null);
          onCommit(committed.selection);
        }}
        onCancel={(restored) => {
          pendingDrillRef.current = null;
          const committed = padValueForSelection(restored.selection, lens);
          setDraftValue(null);
          onCancel?.(committed.selection);
        }}
        renderOverlay={() => <PronunciationAtlasMap lens={lens} />}
      />
      <div className={styles.lenses} data-atlas-view-bar="true">
        <span>View</span>
        <div role="group" aria-label="Map view">
          {lens.size < 1 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                pendingDrillRef.current = null;
                setDraftValue(null);
                setLensId("world");
              }}
            >
              ◂ World map
            </button>
          ) : null}
          <output>
            {lens.size < 1
              ? lens.label
              : "Click a region to zoom in; pins are placed up close."}
          </output>
        </div>
      </div>
      {variantCandidates.length > 0 ? (
      <div className={styles.nearby}>
        <span>Local variants</span>
        <div role="group" aria-label="Local accent variants">
          {variantCandidates.map((candidate) => {
            const active =
              candidate.selection.accentDefinitionId
                ? candidate.selection.accentDefinitionId ===
                  padValue.selection.accentDefinitionId
                : candidate.selection.influence ===
                    padValue.selection.influence &&
                  (candidate.selection.influence !== "none" ||
                    candidate.selection.pronunciationBase ===
                      padValue.selection.pronunciationBase);
            return (
              <button
                key={candidate.id}
                type="button"
                data-active={active ? "true" : undefined}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => commitSelection(candidate.selection)}
              >
                {candidate.label}
              </button>
            );
          })}
        </div>
      </div>
      ) : null}
      <div className={styles.controls}>
        {padValue.selection.accentDefinitionId ||
        padValue.selection.influence !== "none" ? (
          <div
            className={styles.strength}
            role="group"
            aria-label="Pronunciation influence strength"
          >
            {LOCAL_VOICE_SPEECHPRINT_STRENGTHS.map((strength) => (
              <button
                key={strength}
                type="button"
                data-active={
                  padValue.selection.strength === strength ? "true" : undefined
                }
                aria-pressed={padValue.selection.strength === strength}
                disabled={disabled}
                onClick={() =>
                  commitSelection({ ...padValue.selection, strength })
                }
              >
                {strength === "light"
                  ? "Light"
                  : strength === "strong"
                    ? "Strong"
                    : "Balanced"}
              </button>
            ))}
          </div>
        ) : (
          <small className={styles.naturalHint}>
            Choose a place on the map.
          </small>
        )}
        <details className={styles.listFallback} id={fallbackId}>
          <summary>All accents</summary>
          <div>
            <label>
              English foundation
              <select
                value={foundationSelectValue(padValue.selection)}
                disabled={disabled}
                onChange={(event) => {
                  const pronunciationBase = event.currentTarget
                    .value as LocalVoicePronunciationBase;
                  commitSelection({
                    ...padValue.selection,
                    pronunciationBase,
                    accentDefinitionId: accentDefinitionIdForSelection(
                      pronunciationBase,
                      padValue.selection.influence,
                      padValue.selection.accentDefinitionId,
                    ),
                  });
                }}
              >
                <option value="follow-voice">
                  Automatic foundation
                </option>
                <option value="en-US">American English · Approximate</option>
                <option value="en-GB">British English · Approximate</option>
              </select>
            </label>
            <label>
              Pronunciation influence
              <select
                value={padValue.selection.influence}
                disabled={disabled}
                onChange={(event) => {
                  const influence = event.currentTarget
                    .value as LocalVoiceSpeechprintInfluence;
                  commitSelection({
                    ...padValue.selection,
                    influence,
                    accentDefinitionId: accentDefinitionIdForSelection(
                      padValue.selection.pronunciationBase,
                      influence,
                    ),
                  });
                }}
              >
                <option value="none">Natural voice</option>
                {LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map((capability) => (
                  <option key={capability.id} value={capability.id}>
                    {capability.label}
                  </option>
                ))}
              </select>
            </label>
            {padValue.selection.influence !== "none" ? (
              <label>
                Strength
                <select
                  value={padValue.selection.strength}
                  disabled={disabled}
                  onChange={(event) =>
                    commitSelection({
                      ...padValue.selection,
                      strength: event.currentTarget
                        .value as LocalVoiceSpeechprintStrength,
                    })
                  }
                >
                  <option value="light">Light</option>
                  <option value="balanced">Balanced</option>
                  <option value="strong">Strong</option>
                </select>
              </label>
            ) : null}
          </div>
        </details>
      </div>
      {onContinue ? (
        <div className={styles.previewBar} aria-label="Accent map actions">
          <button
            type="button"
            disabled={disabled || !padValue.selection.point}
            data-primary="true"
            onClick={onContinue}
          >
            Continue to Local
          </button>
        </div>
      ) : null}
    </section>
  );
}
