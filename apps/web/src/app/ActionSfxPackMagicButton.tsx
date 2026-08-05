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
  className,
}: {
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  ownerLabel: string;
  personaSnippet?: string | null;
  className?: string;
}): React.JSX.Element {
  const sampleSelectId = useId();
  const [pack, setPack] = useState<ActionSfxPackSummaryV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sampleClip, setSampleClip] = useState(SAMPLE_CLIP_OPTIONS[0]!.value);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleCleanupRef = useRef<(() => void) | null>(null);

  const stopSample = useCallback((): void => {
    const audio = sampleAudioRef.current;
    sampleAudioRef.current = null;
    sampleCleanupRef.current?.();
    sampleCleanupRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setSamplePlaying(false);
  }, []);

  useEffect(() => () => stopSample(), [stopSample]);

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

  const generate = async (): Promise<void> => {
    if (busy || typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setStatus("Save this bot before generating an action pack.");
      return;
    }
    if (
      pack &&
      !window.confirm(
        "Regenerate replaces all 21 local action sounds for this owner. Continue?",
      )
    ) {
      return;
    }
    stopSample();
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
      setStatus("Action pack ready on this machine.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not generate the action pack.",
      );
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
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

  return (
    <div
      className={`${styles.actionSfxPackMagic}${className ? ` ${className}` : ""}`}
      data-action-sfx-pack-magic="true"
      data-owner-kind={ownerKind}
      data-pack-ready={pack ? "true" : undefined}
    >
      <div className={styles.actionSfxPackMagicRow}>
        <button
          type="button"
          className={styles.actionSfxPackMagicButton}
          disabled={busy || (ownerKind === "bot" && !ownerId?.trim())}
          onClick={() => void generate()}
          aria-label={
            pack
              ? "Regenerate local action SFX pack"
              : "Generate local action SFX pack"
          }
          title="Optional local Action SFX pack — laughs, sighs, bodily bits. Stays on this machine; not exported with the bot."
        >
          <Sparkles size={13} strokeWidth={2.3} aria-hidden="true" />
          <span>
            {busy
              ? (progressLabel ?? "Generating…")
              : pack
                ? "Regenerate action pack"
                : "Generate action pack"}
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
              aria-label="Choose an action pack clip to sample"
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
                  ? "Playing selected action pack clip"
                  : "Play selected action pack clip"
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
          Optional · local Foley for Fancy Actions &amp; Coffee
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
