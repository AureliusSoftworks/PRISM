"use client";

import type { CSSProperties, JSX } from "react";
import styles from "./liveSessionChrome.module.css";

export {
  LIVE_SESSION_EFFORT_LABELS,
  liveSessionRoutingChipLabels,
} from "./liveSessionChromeLabels.ts";
export type {
  LiveSessionEffortKey,
  LiveSessionRoutingChipLabels,
} from "./liveSessionChromeLabels.ts";

export function LiveSessionModelChip(props: {
  modelLabel: string;
  effortLabel: string;
  className?: string;
}): JSX.Element {
  const summary = `${props.modelLabel} · ${props.effortLabel}`;
  return (
    <p
      className={`${styles.modelChip}${props.className ? ` ${props.className}` : ""}`}
      data-live-session-model-chip="true"
      title={`Locked for this session: ${summary}`}
      aria-label={`Locked model ${props.modelLabel}, effort ${props.effortLabel}`}
    >
      <span className={styles.modelChipLabel}>{props.modelLabel}</span>
      <span className={styles.modelChipSep} aria-hidden="true">
        ·
      </span>
      <span className={styles.modelChipEffort}>{props.effortLabel}</span>
    </p>
  );
}

/** Small monochrome PRISM wordmark for live session corners. */
export function LiveSessionPrismWatermark(props: {
  theme: "light" | "dark";
  /**
   * Anchor to the nearest positioned ancestor (e.g. the Forum stage frame)
   * instead of the browser viewport chrome.
   */
  contained?: boolean;
  className?: string;
}): JSX.Element {
  const stroke = props.theme === "light" ? "#000000" : "#ffffff";
  return (
    <div
      className={[
        styles.watermark,
        props.contained ? styles.watermarkContained : null,
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-live-session-watermark="true"
      data-watermark-contained={props.contained ? "true" : undefined}
      data-theme={props.theme}
      aria-hidden="true"
    >
      <svg
        className={styles.watermarkMark}
        viewBox="0 0 610 72"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
        style={{ "--live-session-watermark-stroke": stroke } as CSSProperties}
      >
        <g
          fill="none"
          stroke="var(--live-session-watermark-stroke)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="12"
        >
          <path d="M6,66V6h50c10.67,0,16,5.33,16,16s-5.33,16-16,16H18" />
          <g>
            <path d="M134,66V6h50c10.67,0,16,5.33,16,16s-5.33,16-16,16h-38" />
            <path d="M162,38l44,28" />
          </g>
          <path d="M282,6v60" />
          <path d="M430,6h-48c-10.67,0-16,5.33-16,16,0,8,4,12.67,12,14l52,2c9.33,1.33,14,6,14,14,0,9.33-5.33,14-16,14h-48" />
          <g>
            <path d="M508,66V6" />
            <path d="M508,6l48,48,48-48" />
            <path d="M604,6v60" />
          </g>
        </g>
      </svg>
    </div>
  );
}
