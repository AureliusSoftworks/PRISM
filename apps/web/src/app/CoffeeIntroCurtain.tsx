"use client";

import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { createPortal } from "react-dom";
import styles from "./CoffeeIntroCurtain.module.css";

/** Short branded curtain before Coffee seat arrivals. */
export const COFFEE_INTRO_CURTAIN_MS = 2200;
export const COFFEE_OUTRO_EMPTY_TABLE_MS = 400;
export const COFFEE_OUTRO_FADE_MS = 760;
export const COFFEE_OUTRO_CARD_MS = 1800;
export const COFFEE_OUTRO_CURTAIN_MS = COFFEE_OUTRO_FADE_MS + COFFEE_OUTRO_CARD_MS;

export function CoffeeIntroCurtain(props: {
  kind?: "intro" | "outro";
  tableName?: string | null;
  theme: "light" | "dark";
  topic?: string | null;
  onSkip?: () => void;
}): JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  const tableLabel = props.tableName?.trim() || "Coffee";
  const topicLabel = props.topic?.trim() || null;
  const kind = props.kind ?? "intro";
  const durationMs = kind === "outro" ? COFFEE_OUTRO_CURTAIN_MS : COFFEE_INTRO_CURTAIN_MS;

  return createPortal(
    <section
      className={styles.curtain}
      data-coffee-intro-curtain="true"
      data-coffee-bookend={kind}
      data-theme={props.theme}
      role="status"
      aria-live="polite"
      aria-label={`${tableLabel} table ${kind}`}
      style={
        {
          "--coffee-intro-duration": `${durationMs}ms`,
          "--coffee-outro-fade-duration": `${COFFEE_OUTRO_FADE_MS}ms`,
        } as CSSProperties
      }
    >
      <div className={styles.field} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.lockup}>
        <p className={styles.eyebrow}>{kind === "outro" ? "COFFEE" : "PRISM presents"}</p>
        <div className={styles.mark} aria-hidden="true">
          <span />
        </div>
        <h1>{tableLabel}</h1>
        {kind === "outro" ? <strong>The table is empty.</strong> : topicLabel ? <strong>{topicLabel}</strong> : null}
        {kind === "intro" ? <small>Pull up a seat</small> : null}
      </div>
      {kind === "intro" && props.onSkip ? (
        <button type="button" className={styles.skip} onClick={props.onSkip}>
          Skip
        </button>
      ) : null}
    </section>,
    document.body,
  );
}
