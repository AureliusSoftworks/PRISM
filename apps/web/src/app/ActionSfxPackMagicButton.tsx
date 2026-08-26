"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Play, Sparkles } from "lucide-react";
import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KIND_LABELS,
  ACTION_SFX_PACK_KINDS,
  ACTION_SFX_PACK_VARIANT_COUNT,
  isActionSfxPackKind,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
  type ActionSfxPackSummaryV1,
} from "@localai/shared";
import {
  actionSfxPackClipUrl,
  fetchActionSfxPackSummary,
  generateActionSfxPackWithProgress,
  rememberActionSfxPackPresence,
  resolveActionSfxPackOwnerId,
} from "./action-sfx-pack-client";
import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture";
import { releaseAudibleAudioElement } from "./audibleAudioRelease";
import styles from "./page.module.css";

const SAMPLE_CLIP_OPTIONS = ACTION_SFX_PACK_KINDS.flatMap((kind) =>
  Array.from({ length: ACTION_SFX_PACK_VARIANT_COUNT }, (_, variantIndex) => ({
    kind,
    variantIndex,
    value: `${kind}:${variantIndex}`,
    label: `${ACTION_SFX_PACK_KIND_LABELS[kind]} · take ${variantIndex + 1}`,
  })),
);

function parseSampleClipValue(
  value: string,
): { kind: ActionSfxPackKind; variantIndex: number } | null {
  const [kindRaw, variantRaw] = value.split(":");
  if (!isActionSfxPackKind(kindRaw)) return null;
  const variantIndex = Number(variantRaw);
  if (
    !Number.isInteger(variantIndex) ||
    variantIndex < 0 ||
    variantIndex >= ACTION_SFX_PACK_VARIANT_COUNT
  ) {
    return null;
  }
  return { kind: kindRaw, variantIndex };
}

export function ActionSfxPackMagicButton({
  ownerKind,
  ownerId,
  ownerLabel,
  personaSnippet,
  hasPremiumVoice = true,
  className,
}: {
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  ownerLabel: string;
  personaSnippet?: string | null;
  /** Hint only — server still resolves authored Premium voice as fallback. */
  hasPremiumVoice?: boolean;
  className?: string;
}): React.JSX.Element {
  const sampleSelectId = useId();
  const [pack, setPack] = useState<ActionSfxPackSummaryV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingRegenerateConfirm, setAwaitingRegenerateConfirm] =
    useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sampleClip, setSampleClip] = useState(SAMPLE_CLIP_OPTIONS[0]!.value);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleCleanupRef = useRef<(() => void) | null>(null);
  const regenerateConfirmTimerRef = useRef<number | null>(null);

  const stopSample = useCallback((): void => {
    const audio = sampleAudioRef.current;
    sampleAudioRef.current = null;
    const cleanup = sampleCleanupRef.current;
    sampleCleanupRef.current = null;
    if (audio) {
      void releaseAudibleAudioElement(audio, {
        clearSource: true,
        onReleased: cleanup ?? undefined,
      });
    } else {
      cleanup?.();
    }
    setSamplePlaying(false);
  }, []);

  const clearRegenerateConfirm = useCallback((): void => {
    if (regenerateConfirmTimerRef.current !== null) {
      window.clearTimeout(regenerateConfirmTimerRef.current);
      regenerateConfirmTimerRef.current = null;
    }
    setAwaitingRegenerateConfirm(false);
  }, []);

  useEffect(() => () => stopSample(), [stopSample]);
  useEffect(() => () => clearRegenerateConfirm(), [clearRegenerateConfirm]);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setPack(null);
      return;
    }
    const next = await fetchActionSfxPackSummary({
      origin: window.location.origin,
      ownerKind,
      ownerId,
    });
    setPack(next);
  }, [ownerId, ownerKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runGenerate = async (): Promise<void> => {
    stopSample();
    clearRegenerateConfirm();
    setBusy(true);
    setStatus(null);
    setProgressLabel(`0/${ACTION_SFX_PACK_CLIP_COUNT}…`);
    try {
      const next = await generateActionSfxPackWithProgress({
        origin: window.location.origin,
        ownerKind,
        ownerId,
        ownerLabel,
        personaSnippet: personaSnippet ?? undefined,
        onEvent: (event) => {
          if (event.type === "progress") {
            setProgressLabel(`${event.done}/${event.total}…`);
          } else if (event.type === "start") {
            setProgressLabel(`0/${event.total}…`);
          }
        },
      });
      setPack(next);
      rememberActionSfxPackPresence(
        ownerKind,
        ownerKind === "player" ? "player" : (ownerId ?? ""),
        true,
      );
      setStatus("Vocal action pack ready on this machine.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not generate the vocal action pack.",
      );
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
  };

  const generate = async (): Promise<void> => {
    if (busy || typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setStatus("Save this bot before generating a vocal action pack.");
      return;
    }
    if (!hasPremiumVoice) {
      // Still attempt — server can use authored Premium voice when the draft
      // override looks local-only. Warn first so the player knows why it may fail.
      setStatus(
        "No Premium voice selected in this editor — trying the bot's saved Premium voice…",
      );
    }
    if (pack && !awaitingRegenerateConfirm) {
      setAwaitingRegenerateConfirm(true);
      setStatus(
        `Click again to replace all ${ACTION_SFX_PACK_CLIP_COUNT} local vocal takes.`,
      );
      if (regenerateConfirmTimerRef.current !== null) {
        window.clearTimeout(regenerateConfirmTimerRef.current);
      }
      regenerateConfirmTimerRef.current = window.setTimeout(() => {
        regenerateConfirmTimerRef.current = null;
        setAwaitingRegenerateConfirm(false);
        setStatus((current) =>
          current?.startsWith("Click again to replace") ? null : current,
        );
      }, 5000);
      return;
    }
    await runGenerate();
  };

  const playSample = async (): Promise<void> => {
    if (!pack || typeof window === "undefined" || typeof Audio === "undefined") {
      return;
    }
    const parsed = parseSampleClipValue(sampleClip);
    if (!parsed) return;
    stopSample();
    try {
      const resolvedOwnerId = resolveActionSfxPackOwnerId(ownerKind, ownerId);
      const url = actionSfxPackClipUrl({
        origin: window.location.origin,
        ownerKind,
        ownerId: resolvedOwnerId,
        kind: parsed.kind,
        variantIndex: parsed.variantIndex,
      });
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.72;
      const outputCleanup = routeAudioElementToPrismOutput(audio);
      sampleAudioRef.current = audio;
      sampleCleanupRef.current = outputCleanup;
      const release = (): void => {
        if (sampleAudioRef.current !== audio) return;
        stopSample();
      };
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", release, { once: true });
      setSamplePlaying(true);
      await audio.play();
    } catch {
      stopSample();
      setStatus("Could not play that pack clip.");
    }
  };

  const readyLabel = pack
    ? `Ready · ${new Date(pack.createdAt).toLocaleDateString()}`
    : null;
  const needsSavedBot = ownerKind === "bot" && !ownerId?.trim();
  const canGenerate = !needsSavedBot;

  return (
    <div
      className={`${styles.actionSfxPackMagic}${className ? ` ${className}` : ""}`}
      data-action-sfx-pack-magic="true"
      data-owner-kind={ownerKind}
      data-pack-ready={pack ? "true" : undefined}
      data-has-premium-voice={hasPremiumVoice ? "true" : "false"}
      data-awaiting-regenerate-confirm={
        awaitingRegenerateConfirm ? "true" : undefined
      }
    >
      <div className={styles.actionSfxPackMagicRow}>
        <button
          type="button"
          className={styles.actionSfxPackMagicButton}
          disabled={busy || !canGenerate}
          onClick={() => void generate()}
          aria-label={
            awaitingRegenerateConfirm
              ? "Confirm regenerate local vocal action pack"
              : pack
                ? "Regenerate local vocal action pack"
                : "Generate local vocal action pack"
          }
          title={
            needsSavedBot
              ? "Save this bot before generating a vocal action pack."
              : hasPremiumVoice
                ? "Generate laughs, sighs, gasps, and throat clears in this Premium voice. Stays on this machine; not exported with the bot."
                : "Uses the bot's saved Premium ElevenLabs voice when available."
          }
        >
          <Sparkles size={13} strokeWidth={2.3} aria-hidden="true" />
          <span>
            {busy
              ? (progressLabel ?? "Generating…")
              : awaitingRegenerateConfirm
                ? "Confirm regenerate"
                : pack
                  ? "Regenerate vocal action pack"
                  : "Generate vocal action pack"}
          </span>
        </button>
        {pack ? (
          <div
            className={styles.actionSfxPackSample}
            data-action-sfx-pack-sample="true"
          >
            <label
              className={styles.actionSfxPackSampleLabel}
              htmlFor={sampleSelectId}
            >
              Sample
            </label>
            <select
              id={sampleSelectId}
              className={styles.actionSfxPackSampleSelect}
              value={sampleClip}
              disabled={busy}
              aria-label="Choose a vocal action pack clip to sample"
              onChange={(event) => setSampleClip(event.currentTarget.value)}
            >
              {SAMPLE_CLIP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.actionSfxPackSampleButton}
              disabled={busy}
              aria-label={
                samplePlaying
                  ? "Playing selected vocal action pack clip"
                  : "Play selected vocal action pack clip"
              }
              onClick={() => void playSample()}
            >
              <Play size={13} strokeWidth={2.3} aria-hidden="true" />
              {samplePlaying ? "Playing…" : "Play"}
            </button>
          </div>
        ) : null}
      </div>
      {readyLabel ? (
        <small className={styles.actionSfxPackMagicReady}>{readyLabel}</small>
      ) : (
        <small className={styles.actionSfxPackMagicHint}>
          {needsSavedBot
            ? "Save this bot to unlock vocal action packs"
            : hasPremiumVoice
              ? "Optional · laughs, sighs, gasps & throat clears in this voice"
              : "Uses saved Premium voice · laughs, sighs, gasps & throat clears"}
        </small>
      )}
      {status ? (
        <small className={styles.actionSfxPackMagicStatus} role="status">
          {status}
        </small>
      ) : null}
    </div>
  );
}
