"use client";

import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  voiceAccentDefinitionForId,
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
  pronunciationAtlasNaturalSelection,
  pronunciationAtlasNearbyCandidates,
  pronunciationAtlasLocationText,
  pronunciationAtlasPointForSelection,
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
  onContinue?: () => void;
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
    point: pronunciationAtlasPointForSelection(normalized),
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
  const padValue: PronunciationAtlasPadValue =
    draftValue ?? padValueForSelection(normalizedSelection);

  const adapter = useMemo<AdjustmentPadAdapter<PronunciationAtlasPadValue>>(
    () => ({
      toPoint: (value) => value.point,
      fromPoint: (point, current) => ({
        point,
        selection: pronunciationAtlasSelectionAtPoint(point, current.selection),
      }),
      nudge: (value, direction, multiplier) => {
        const nextSelection = nudgePronunciationAtlasSelection(
          value.selection,
          direction,
          multiplier,
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
  const summary = pronunciationAtlasLocationText(padValue.selection);
  const nearbyCandidates = pronunciationAtlasNearbyCandidates(
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
          onPreview(next.selection);
        }}
        onCommit={(next) => {
          const committed = padValueForSelection(next.selection);
          setDraftValue(null);
          onCommit(committed.selection);
        }}
        onCancel={(restored) => {
          const committed = padValueForSelection(restored.selection);
          setDraftValue(null);
          onCancel?.(committed.selection);
        }}
        renderOverlay={() => <PronunciationAtlasMap />}
      />
      <div className={styles.nearby}>
        <span>Nearby choices</span>
        <div role="group" aria-label="Nearby accent choices">
          {nearbyCandidates.map((candidate) => {
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
