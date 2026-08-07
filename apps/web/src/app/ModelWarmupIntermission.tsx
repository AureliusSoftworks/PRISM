"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ModelPreparationExperience,
  ModelPreparationFailure,
} from "@localai/shared";
import { modelPreparationFailureMessage } from "./modelPreparation";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import { beginPrismFullscreenBlockingAudioMute } from "./prismFullscreenBlockingAudio.ts";
import styles from "./model-warmup-intermission.module.css";

export type ModelWarmupIntermissionPhase =
  | "entering"
  | "held"
  | "releasing"
  | "failed";

export type ModelWarmupIntermissionContext =
  | "session"
  | "invent"
  | "refract";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function experienceEyebrow(
  experience: ModelPreparationExperience,
  context: ModelWarmupIntermissionContext,
): string {
  const invent = context === "invent";
  const refract = context === "refract";
  switch (experience) {
    case "coffee":
      if (invent) return "TABLE PREPARE";
      if (refract) return "TABLE REFRACT";
      return "TABLE HELD";
    case "debate":
      if (invent) return "CHAMBER PREPARE";
      if (refract) return "CHAMBER REFRACT";
      return "CHAMBER HELD";
    case "signal":
      if (invent) return "STUDIO PREPARE";
      if (refract) return "STUDIO REFRACT";
      return "STUDIO HELD";
    case "prism":
      if (invent) return "PRISM PREPARE";
      if (refract) return "PRISM REFRACT";
      return "PRISM HELD";
    default: {
      const _exhaustive: never = experience;
      void _exhaustive;
      return "PRISM HELD";
    }
  }
}

export function ModelWarmupIntermission(props: {
  phase: ModelWarmupIntermissionPhase;
  experience: ModelPreparationExperience;
  /** Invent / field refract / mid-session holds. */
  context?: ModelWarmupIntermissionContext;
  model: string | null;
  startedAt: string | null;
  failure?: ModelPreparationFailure | null;
  initial: boolean;
  onRetry?: () => void;
  onExit?: () => void;
  exitLabel?: string;
}): React.JSX.Element | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const startedAtMs = props.startedAt ? Date.parse(props.startedAt) : nowMs;
  const elapsedMs = Number.isFinite(startedAtMs)
    ? Math.max(0, nowMs - startedAtMs)
    : 0;
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (props.phase === "releasing") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.phase, props.startedAt]);
  useEffect(() => {
    if (props.phase === "releasing") return;
    return beginPrismFullscreenBlockingAudioMute();
  }, [props.phase]);

  const failed = props.phase === "failed";
  const context = props.context ?? "session";
  const invent = context === "invent";
  const refract = context === "refract";
  const showInitialExit = props.initial && elapsedMs >= 10_000;
  const showExit = Boolean(
    props.onExit && (!props.initial || showInitialExit || failed),
  );
  const eyebrow = experienceEyebrow(props.experience, context);
  const readyDetail = invent
    ? "Prism is ready to invent."
    : refract
      ? "Prism is ready to refract."
      : "The session is resuming.";
  const warmingDetail = invent
    ? "First starts can take a little longer. Inventing begins once the model is ready."
    : refract
      ? "First starts can take a little longer. Refraction begins once the model is ready."
      : "First starts can take a little longer. The session clock is paused and will resume automatically.";

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <section
      className={styles.overlay}
      data-phase={props.phase}
      data-prism-model-warmup="true"
      data-warmup-context={context}
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <PrismCompanionPresenceBoundary
        reason={`${props.experience}-model-warmup`}
      />
      <div className={styles.card}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <PrismOrb className={styles.prismOrb} />
        <h2>
          {failed
            ? "The local model couldn’t get ready"
            : props.phase === "releasing"
              ? "Ready"
              : "PRISM is preparing the local model"}
        </h2>
        <p>
          {failed
            ? modelPreparationFailureMessage({
                failure: props.failure ?? null,
              })
            : props.phase === "releasing"
              ? readyDetail
              : warmingDetail}
        </p>
        {props.model ? (
          <strong className={styles.model}>{props.model}</strong>
        ) : null}
        {!failed && props.phase !== "releasing" ? (
          <small className={styles.elapsed}>{formatElapsed(elapsedMs)} elapsed</small>
        ) : null}
        {failed || showExit ? (
          <div className={styles.actions}>
            {failed && props.onRetry ? (
              <button type="button" onClick={props.onRetry}>
                Try again
              </button>
            ) : null}
            {showExit ? (
              <button type="button" data-kind="quiet" onClick={props.onExit}>
                {props.exitLabel ?? "Back to setup"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>,
    document.body,
  );
}
