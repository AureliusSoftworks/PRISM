"use client";

import type { CSSProperties, JSX } from "react";
import {
  MODEL_EFFORT_ICON_PATHS,
  MODEL_EFFORT_MAX_ICON_PATH,
} from "./modelEffortControl";
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
  effortKey?: import("./liveSessionChromeLabels.ts").LiveSessionEffortKey;
  automatic?: boolean;
  turbo?: boolean;
  turboToggle?: {
    disabled: boolean;
    onChange: (enabled: boolean) => void;
  } | null;
  className?: string;
}): JSX.Element {
  const effortKey = props.effortKey ?? "auto";
  const summary = `${props.modelLabel} · ${props.effortLabel}`;
  const title = props.automatic
    ? `Auto route currently: ${summary}${props.turbo ? ", Turbo" : ""}. This may change on a later generation.`
    : `Locked for this session: ${summary}${props.turbo ? ", Turbo" : ""}`;
  return (
    <p
      className={`${styles.modelChip}${props.className ? ` ${props.className}` : ""}`}
      data-live-session-model-chip="true"
      data-model-selection={props.automatic ? "auto" : "fixed"}
      title={title}
      aria-label={
        props.automatic
          ? `Auto currently using ${props.modelLabel}, effort ${props.effortLabel}${props.turbo ? ", Turbo" : ""}`
          : `Locked model ${props.modelLabel}, effort ${props.effortLabel}${props.turbo ? ", Turbo" : ""}`
      }
      aria-live={props.automatic ? "polite" : undefined}
    >
      <span className={styles.modelChipLabel}>{props.modelLabel}</span>
      <span className={styles.modelChipSep} aria-hidden="true">
        ·
      </span>
      <span className={styles.modelChipEffort}>
        <span
          className={styles.modelChipEffortGlyph}
          data-effort-level={effortKey}
          style={
            {
              "--live-session-effort-icon": `url("${
                effortKey === "max"
                  ? MODEL_EFFORT_MAX_ICON_PATH
                  : MODEL_EFFORT_ICON_PATHS[effortKey]
              }")`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
        {props.turbo ? (
          <span className={styles.modelChipTurbo} aria-hidden="true">
            🔥
          </span>
        ) : null}
        <span>{props.effortLabel}</span>
      </span>
      {props.turboToggle ? (
        <button
          type="button"
          className={styles.modelChipTurboToggle}
          disabled={props.turboToggle.disabled}
          onClick={() => props.turboToggle?.onChange(!props.turbo)}
          aria-label={`Turn Turbo ${props.turbo ? "off" : "on"} for this Debate`}
          title="Turbo changes only future ungenerated Debate turns."
        >
          Turbo {props.turbo ? "on" : "off"}
        </button>
      ) : null}
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
