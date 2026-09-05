"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type {
  ActionSfxPackOwnerKind,
  EnglishPacingProfileV1,
} from "@localai/shared";
import {
  calibrateEnglishPacingProfileRequest,
  fetchEnglishPacingProfile,
} from "./english-pacing-profile-client";
import styles from "./page.module.css";

export function EnglishPacingCalibrateMagicButton({
  ownerKind,
  ownerId,
  hasPremiumVoice = true,
  className,
}: {
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  /** Hint only — server still resolves authored Premium voice as fallback. */
  hasPremiumVoice?: boolean;
  className?: string;
}): React.JSX.Element {
  const [profile, setProfile] = useState<EnglishPacingProfileV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingRegenerateConfirm, setAwaitingRegenerateConfirm] =
    useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const regenerateConfirmTimerRef = useRef<number | null>(null);

  const clearRegenerateConfirm = useCallback((): void => {
    if (regenerateConfirmTimerRef.current !== null) {
      window.clearTimeout(regenerateConfirmTimerRef.current);
      regenerateConfirmTimerRef.current = null;
    }
    setAwaitingRegenerateConfirm(false);
  }, []);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setProfile(null);
      return;
    }
    const next = await fetchEnglishPacingProfile({
      origin: window.location.origin,
      ownerKind,
      ownerId,
    });
    setProfile(next);
  }, [ownerId, ownerKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => () => clearRegenerateConfirm(), [clearRegenerateConfirm]);

  const runCalibrate = async (): Promise<void> => {
    clearRegenerateConfirm();
    setBusy(true);
    setStatus(null);
    try {
      const next = await calibrateEnglishPacingProfileRequest({
        origin: window.location.origin,
        ownerKind,
        ownerId,
      });
      setProfile(next);
      setStatus(
        `English pauses ready · comma ${next.commaMs}ms · clause ${next.clauseMs}ms · stop ${next.strongMs}ms`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not calibrate English pacing.",
      );
    } finally {
      setBusy(false);
    }
  };

  const calibrate = async (): Promise<void> => {
    if (busy || typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setStatus("Save this bot before calibrating English pacing.");
      return;
    }
    if (!hasPremiumVoice) {
      setStatus(
        "No Premium voice selected in this editor — trying the bot's saved Premium voice…",
      );
    }
    if (profile && !awaitingRegenerateConfirm) {
      setAwaitingRegenerateConfirm(true);
      setStatus("Click again to replace the local English pause timings.");
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
    await runCalibrate();
  };

  const readyLabel = profile
    ? `Ready · ${new Date(profile.calibratedAt).toLocaleDateString()}`
    : null;
  const needsSavedBot = ownerKind === "bot" && !ownerId?.trim();
  const canGenerate = !needsSavedBot;

  return (
    <div
      className={`${styles.actionSfxPackMagic}${className ? ` ${className}` : ""}`}
      data-english-pacing-calibrate-magic="true"
      data-owner-kind={ownerKind}
      data-profile-ready={profile ? "true" : undefined}
      data-has-premium-voice={hasPremiumVoice ? "true" : "false"}
      data-awaiting-regenerate-confirm={
        awaitingRegenerateConfirm ? "true" : undefined
      }
    >
      <div className={styles.actionSfxPackMagicRow}>
        <button
          type="button"
          className={styles.botAvatarSfxMagicButton}
          disabled={!canGenerate || busy}
          onClick={() => void calibrate()}
          title="Bake Premium pause timings for offline English"
        >
          <Sparkles size={13} strokeWidth={2.3} aria-hidden="true" />
          {busy
            ? "Calibrating…"
            : awaitingRegenerateConfirm
              ? "Click again to recalibrate"
              : profile
                ? "Recalibrate English pacing"
                : "Calibrate English pacing"}
        </button>
        {readyLabel ? (
          <span className={styles.actionSfxPackReadyLabel}>{readyLabel}</span>
        ) : null}
      </div>
      <p className={styles.actionSfxPackHint}>
        ONLINE Premium timing bake for local English pauses. Lives with Voice
        settings — stays on this machine.
      </p>
      {status ? (
        <p className={styles.actionSfxPackStatus} role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
