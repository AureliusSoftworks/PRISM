"use client";

import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { createPortal } from "react-dom";
import styles from "./CoffeeIntroCurtain.module.css";

/** Short branded curtain before Coffee seat arrivals. */
export const COFFEE_INTRO_CURTAIN_MS = 2200;

export function CoffeeIntroCurtain(props: {
  tableName?: string | null;
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

  return createPortal(
    <section
      className={styles.curtain}
      data-coffee-intro-curtain="true"
      role="status"
      aria-live="polite"
      aria-label={`${tableLabel} table introduction`}
      style={
        {
          "--coffee-intro-duration": `${COFFEE_INTRO_CURTAIN_MS}ms`,
        } as CSSProperties
      }
    >
      <div className={styles.field} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.lockup}>
        <p className={styles.eyebrow}>PRISM presents</p>
        <div className={styles.mark} aria-hidden="true">
          <span />
        </div>
        <h1>{tableLabel}</h1>
        {topicLabel ? <strong>{topicLabel}</strong> : null}
        <small>Pull up a seat</small>
      </div>
      {props.onSkip ? (
        <button type="button" className={styles.skip} onClick={props.onSkip}>
          Skip
        </button>
      ) : null}
    </section>,
    document.body,
  );
}
