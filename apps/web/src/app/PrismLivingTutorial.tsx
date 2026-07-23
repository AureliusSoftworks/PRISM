"use client";

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { ModeTutorial, ModeTutorialStep } from "./modeTutorials";
import styles from "./PrismLivingTutorial.module.css";

export const PRISM_LIVING_TUTORIAL_CAPTION_ID =
  "prism-living-tutorial-caption";

export interface PrismLivingTutorialTargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function prismLivingTutorialCaption(
  body: string,
  maxLength = 220,
): string {
  const normalized = body.replace(/\s+/gu, " ").trim();
  const sentenceEnd = normalized.search(/[.!?](?:\s|$)/u);
  const sentence = sentenceEnd >= 0
    ? normalized.slice(0, sentenceEnd + 1)
    : normalized;
  if (sentence.length <= maxLength) return sentence;
  const clipped = sentence.slice(0, Math.max(1, maxLength - 1));
  const finalSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, finalSpace > 0 ? finalSpace : clipped.length)}…`;
}

export default function PrismLivingTutorial({
  tutorial,
  step,
  stepIndex,
  targetRect,
  onBack,
  onSkip,
  onRemind,
}: {
  tutorial: ModeTutorial;
  step: ModeTutorialStep;
  stepIndex: number;
  targetRect: PrismLivingTutorialTargetRect | null;
  onBack: () => void;
  onSkip: () => void;
  onRemind: () => void;
}): React.JSX.Element | null {
  if (typeof document === "undefined") return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetMidpoint = targetRect
    ? targetRect.left + targetRect.width / 2
    : viewportWidth / 2;
  const captionOnLeft = targetMidpoint > viewportWidth / 2;
  const orbStyle = targetRect
    ? ({
        left: `${clamp(
          captionOnLeft
            ? targetRect.left + targetRect.width
            : targetRect.left,
          34,
          viewportWidth - 34,
        )}px`,
        top: `${clamp(targetRect.top, 34, viewportHeight - 34)}px`,
      } as CSSProperties)
    : undefined;
  const captionStyle = targetRect
    ? ({
        top: `${clamp(targetRect.top + targetRect.height + 20, 86, viewportHeight - 310)}px`,
        ...(captionOnLeft
          ? { left: "24px" }
          : { right: "24px" }),
      } as CSSProperties)
    : undefined;

  return createPortal(
    <div
      className={styles.overlay}
      data-has-target={targetRect ? "true" : "false"}
      aria-label={tutorial.title}
    >
      {targetRect ? (
        <div
          className={styles.spotlight}
          style={
            {
              top: `${targetRect.top - 8}px`,
              left: `${targetRect.left - 8}px`,
              width: `${targetRect.width + 16}px`,
              height: `${targetRect.height + 16}px`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
      ) : null}
      <div className={styles.guideOrb} style={orbStyle} aria-hidden="true">
        <span>△</span>
      </div>
      <section
        id={PRISM_LIVING_TUTORIAL_CAPTION_ID}
        className={styles.caption}
        style={captionStyle}
        role="region"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className={styles.eyebrow}>
          {tutorial.title} · {stepIndex + 1}/{tutorial.steps.length}
        </p>
        <h3>{step.heading}</h3>
        <p>{prismLivingTutorialCaption(step.body)}</p>
        <p className={styles.cue}>
          <span aria-hidden="true">↗</span>
          {targetRect
            ? `Choose ${step.clickLabel} to continue.`
            : `Prism will wait for ${step.clickLabel} to appear.`}
        </p>
        <div className={styles.progress} aria-hidden="true">
          {tutorial.steps.map((_, index) => (
            <span
              key={index}
              data-state={
                index < stepIndex
                  ? "done"
                  : index === stepIndex
                    ? "active"
                    : "pending"
              }
            />
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={onBack} disabled={stepIndex === 0}>
            Back
          </button>
          <button type="button" onClick={onRemind}>
            Remind me later
          </button>
          <button type="button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
