"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PrismOnboardingStage } from "@localai/shared";
import styles from "./PrismFirstRunLivingLayer.module.css";

export const PRISM_AUTHORED_WELCOME =
  "Hello. I’m Prism. You bring the light; I’ll help you reveal the spectrum. Welcome home.";

export type PrismFirstRunChoice = "slate" | "spectrum" | "tour";

function useModalCanvas(rootRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const siblings = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== root,
      )
      .map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
      }));
    siblings.forEach(({ element }) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.focus({ preventScroll: true });
    return () => {
      siblings.forEach(({ element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [rootRef]);
}

export default function PrismFirstRunLivingLayer({
  stage,
  displayName,
  onContinue,
  onChoice,
  onWelcome,
}: {
  stage: Extract<PrismOnboardingStage, "awakening" | "choices">;
  displayName: string;
  onContinue: () => void;
  onChoice: (choice: PrismFirstRunChoice) => void;
  onWelcome?: (text: string) => void | Promise<void>;
}): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const welcomedRef = useRef(false);
  useModalCanvas(rootRef);

  useEffect(() => {
    if (stage !== "awakening" || welcomedRef.current) return;
    welcomedRef.current = true;
    const timer = window.setTimeout(() => {
      void onWelcome?.(PRISM_AUTHORED_WELCOME);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1850);
    return () => window.clearTimeout(timer);
  }, [onWelcome, stage]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={styles.canvas}
      data-stage={stage}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      tabIndex={-1}
    >
      <div className={styles.darkness} aria-hidden="true" />
      <div className={styles.arrivalLight} aria-hidden="true" />
      <div className={styles.orb} aria-hidden="true">
        <span className={styles.orbCore}>△</span>
      </div>

      {stage === "awakening" ? (
        <section className={styles.awakening}>
          <div className={styles.prismBody} aria-hidden="true">
            <span className={styles.prismHalo} />
            <span className={styles.prismGlass}>
              <span className={styles.prismEyes}>◜ ◝</span>
              <span className={styles.prismMouth}>⌣</span>
            </span>
            <span className={styles.prismMedallion}>△</span>
          </div>
          <div className={styles.awakeningCopy} aria-live="polite">
            <p className={styles.eyebrow}>PRISM AWAKE</p>
            <h1 id={headingId}>
              Hello{displayName.trim() ? `, ${displayName.trim()}` : ""}.
            </h1>
            <p id={descriptionId}>{PRISM_AUTHORED_WELCOME.replace("Hello. ", "")}</p>
            <button type="button" className={styles.primary} onClick={onContinue}>
              Make this place yours <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.choices}>
          <div className={styles.choiceHeading}>
            <p className={styles.eyebrow}>WHERE SHALL WE BEGIN?</p>
            <h1 id={headingId}>Your spectrum is waiting.</h1>
            <p id={descriptionId}>
              Choose a first doorway. Nothing here closes the others.
            </p>
          </div>
          <div className={styles.choiceField}>
            <span className={styles.choiceRay} aria-hidden="true" />
            <button
              type="button"
              className={styles.choice}
              data-choice="slate"
              onClick={() => onChoice("slate")}
            >
              <span className={styles.choiceGlyph} aria-hidden="true">✎</span>
              <strong>Start writing</strong>
              <span>Open a quiet Slate project.</span>
            </button>
            <button
              type="button"
              className={styles.choice}
              data-choice="spectrum"
              onClick={() => onChoice("spectrum")}
            >
              <span className={styles.choiceGlyph} aria-hidden="true">◈</span>
              <strong>Meet the spectrum</strong>
              <span>Begin with the five Prism Originals.</span>
            </button>
            <button
              type="button"
              className={styles.choice}
              data-choice="tour"
              onClick={() => onChoice("tour")}
            >
              <span className={styles.choiceGlyph} aria-hidden="true">△</span>
              <strong>Show me around</strong>
              <span>Let Prism guide the first few steps.</span>
            </button>
          </div>
        </section>
      )}
    </div>,
    document.body,
  );
}
