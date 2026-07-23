"use client";

import { useEffect, useState } from "react";
import type { ModelPreparationFailure } from "@localai/shared";
import { modelPreparationFailureMessage } from "./modelPreparation";
import { PrismOrb } from "./PrismOrb";
import { PrismCompanionPresenceBoundary } from "./prismCompanionPresence";
import styles from "./model-warmup-intermission.module.css";

export type ModelWarmupIntermissionPhase =
  | "entering"
  | "held"
  | "releasing"
  | "failed";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ModelWarmupIntermission(props: {
  phase: ModelWarmupIntermissionPhase;
  experience: "coffee" | "signal";
  model: string | null;
  startedAt: string | null;
  failure?: ModelPreparationFailure | null;
  initial: boolean;
  onRetry?: () => void;
  onExit?: () => void;
  exitLabel?: string;
}): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const startedAtMs = props.startedAt ? Date.parse(props.startedAt) : nowMs;
  const elapsedMs = Number.isFinite(startedAtMs)
    ? Math.max(0, nowMs - startedAtMs)
    : 0;
  useEffect(() => {
    if (props.phase === "releasing") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.phase, props.startedAt]);

  const failed = props.phase === "failed";
  const showInitialExit = props.initial && elapsedMs >= 10_000;
  const showExit = Boolean(props.onExit && (!props.initial || showInitialExit || failed));
  return (
    <section
      className={styles.overlay}
      data-phase={props.phase}
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <PrismCompanionPresenceBoundary
        reason={`${props.experience}-model-warmup`}
      />
      <div className={styles.card}>
        <span className={styles.eyebrow}>
          {props.experience === "coffee" ? "TABLE HELD" : "STUDIO HELD"}
        </span>
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
            ? modelPreparationFailureMessage({ failure: props.failure ?? null })
            : props.phase === "releasing"
              ? "The session is resuming."
              : "First starts can take a little longer. The session clock is paused and will resume automatically."}
        </p>
        {props.model ? <strong className={styles.model}>{props.model}</strong> : null}
        {!failed && props.phase !== "releasing" ? (
          <small className={styles.elapsed}>{formatElapsed(elapsedMs)} elapsed</small>
        ) : null}
        {failed || showExit ? (
          <div className={styles.actions}>
            {failed && props.onRetry ? (
              <button type="button" onClick={props.onRetry}>Try again</button>
            ) : null}
            {showExit ? (
              <button type="button" data-kind="quiet" onClick={props.onExit}>
                {props.exitLabel ?? "Back to setup"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
