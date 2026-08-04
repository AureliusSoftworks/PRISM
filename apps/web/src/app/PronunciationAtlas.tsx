"use client";

import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
} from "@localai/shared";
import { useId, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { AdjustmentPad } from "./AdjustmentPad";
import type {
  AdjustmentPadAdapter,
  AdjustmentPadPoint,
} from "./adjustmentPadModel";
import styles from "./PronunciationAtlas.module.css";
import {
  nudgePronunciationAtlasSelection,
  normalizePronunciationAtlasSelection,
  pronunciationAtlasAnchorForSelection,
  pronunciationAtlasNaturalSelection,
  pronunciationAtlasResolvedBase,
  pronunciationAtlasSelectionAtPoint,
  pronunciationAtlasValueText,
  type PronunciationAtlasSelection,
} from "./pronunciationAtlasModel";

interface PronunciationAtlasPadValue {
  selection: PronunciationAtlasSelection;
  point: AdjustmentPadPoint;
}

export interface PronunciationAtlasProps {
  selection: PronunciationAtlasSelection;
  onPreview: (selection: PronunciationAtlasSelection) => void;
  onCommit: (selection: PronunciationAtlasSelection) => void;
  onCancel?: (selection: PronunciationAtlasSelection) => void;
  onPreviewSource?: () => void;
  onPreviewCurrent?: () => void;
  previewDisabled?: boolean;
  color?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}

function padValueForSelection(
  selection: PronunciationAtlasSelection,
): PronunciationAtlasPadValue {
  const normalized = normalizePronunciationAtlasSelection(selection);
  return {
    selection: normalized,
    point: pronunciationAtlasAnchorForSelection(normalized).point,
  };
}

function PronunciationAtlasMap(): ReactElement {
  return (
    <div className={styles.map} aria-hidden="true">
      <span className={styles.world} />
      <div className={styles.longitudeLines} />
      <div className={styles.scan} />
    </div>
  );
}

function foundationSelectValue(
  selection: PronunciationAtlasSelection,
): LocalVoicePronunciationBase {
  return selection.pronunciationBase;
}

export function PronunciationAtlas({
  selection,
  onPreview,
  onCommit,
  onCancel,
  onPreviewSource,
  onPreviewCurrent,
  previewDisabled = false,
  color,
  disabled = false,
  className,
  label = "Pronunciation Atlas",
}: PronunciationAtlasProps): ReactElement {
  const normalizedSelection = normalizePronunciationAtlasSelection(selection);
  const [draftValue, setDraftValue] =
    useState<PronunciationAtlasPadValue | null>(null);
  const padValue: PronunciationAtlasPadValue =
    draftValue ?? padValueForSelection(normalizedSelection);

  const adapter = useMemo<AdjustmentPadAdapter<PronunciationAtlasPadValue>>(
    () => ({
      toPoint: (value) => value.point,
      fromPoint: (point, current) => ({
        point,
        selection: pronunciationAtlasSelectionAtPoint(point, current.selection),
      }),
      nudge: (value, direction) => {
        const nextSelection = nudgePronunciationAtlasSelection(
          value.selection,
          direction,
        );
        return padValueForSelection(nextSelection);
      },
      valueText: (value) => pronunciationAtlasValueText(value.selection),
    }),
    [],
  );
  const restoreValue = padValueForSelection(
    pronunciationAtlasNaturalSelection(normalizedSelection.sourceLocale),
  );
  const summary = pronunciationAtlasValueText(padValue.selection);
  const sourceBase =
    pronunciationAtlasResolvedBase({
      ...padValue.selection,
      pronunciationBase: "follow-voice",
    }) === "en-GB"
      ? "British"
      : "American";
  const fallbackId = useId();

  const commitSelection = (next: PronunciationAtlasSelection): void => {
    const normalized = normalizePronunciationAtlasSelection(next);
    setDraftValue(null);
    onPreview(normalized);
    onCommit(normalized);
  };

  return (
    <section
      className={`${styles.atlas}${className ? ` ${className}` : ""}`}
      data-pronunciation-atlas="true"
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
          <small>Approximate · private phonemes only</small>
        </span>
        <output aria-live="polite">{summary}</output>
      </div>
      <AdjustmentPad
        label={label}
        value={padValue}
        restoreValue={restoreValue}
        adapter={adapter}
        color={color}
        disabled={disabled}
        onPreview={(next) => {
          setDraftValue(next);
          onPreview(next.selection);
        }}
        onCommit={(next) => {
          const snapped = padValueForSelection(next.selection);
          setDraftValue(null);
          onPreview(snapped.selection);
          onCommit(snapped.selection);
        }}
        onCancel={(restored) => {
          const snapped = padValueForSelection(restored.selection);
          setDraftValue(null);
          onCancel?.(snapped.selection);
        }}
        renderOverlay={() => <PronunciationAtlasMap />}
      />
      <div className={styles.controls}>
        {padValue.selection.influence !== "none" ? (
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
            Drag across the map to introduce a pronunciation influence.
          </small>
        )}
        <details className={styles.listFallback} id={fallbackId}>
          <summary>List view</summary>
          <div>
            <label>
              English foundation
              <select
                value={foundationSelectValue(padValue.selection)}
                disabled={disabled}
                onChange={(event) =>
                  commitSelection({
                    ...padValue.selection,
                    pronunciationBase: event.currentTarget
                      .value as LocalVoicePronunciationBase,
                  })
                }
              >
                <option value="follow-voice">
                  Follow voice · {sourceBase}
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
                onChange={(event) =>
                  commitSelection({
                    ...padValue.selection,
                    influence: event.currentTarget
                      .value as LocalVoiceSpeechprintInfluence,
                  })
                }
              >
                <option value="none">Natural</option>
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
      {onPreviewSource || onPreviewCurrent ? (
        <div className={styles.previewBar} aria-label="Pronunciation previews">
          {onPreviewSource ? (
            <button
              type="button"
              disabled={disabled || previewDisabled}
              onClick={onPreviewSource}
            >
              Source
            </button>
          ) : null}
          {onPreviewCurrent ? (
            <button
              type="button"
              disabled={disabled || previewDisabled}
              data-primary="true"
              onClick={onPreviewCurrent}
            >
              Current
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
