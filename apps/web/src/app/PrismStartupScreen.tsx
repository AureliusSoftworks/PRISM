"use client";

import type { CSSProperties } from "react";

import styles from "./prism-startup-screen.module.css";
import { prismStartupTraceText } from "./prismStartupFlavor";
import {
  prismStartupOpticsProgress,
  prismStartupProgressFromLogs,
} from "./prismStartupProgress";

export type PrismStartupLogSource = "prism" | "api" | "web" | "qdrant";

export interface PrismStartupLogLine {
  id: number;
  source: PrismStartupLogSource;
  text: string;
  kind?: "status" | "flavor";
  spectrumIndex?: number;
}

interface PrismStartupScreenProps {
  label: string;
  logs: readonly PrismStartupLogLine[];
  failed?: boolean;
  onRetry?: () => void;
}

const SERVICES = ["Qdrant", "API", "Web"] as const;
const PRISM_STARTUP_MOTION_PHASE_SCRIPT = `(() => {
  const now = Date.now();
  const root = document.documentElement;
  root.style.setProperty("--prism-startup-ring-phase", \`-\${now % 4800}ms\`);
  root.style.setProperty("--prism-startup-halo-phase", \`-\${now % 2600}ms\`);
  root.style.setProperty("--prism-startup-aura-phase", \`-\${now % 2800}ms\`);
  root.style.setProperty("--prism-startup-optics-flow-phase", \`-\${now % 7200}ms\`);
})();`;

type PrismStartupOpticsStyle = CSSProperties & {
  "--prism-startup-beam-progress": string;
  "--prism-startup-beam-remainder": string;
  "--prism-startup-spectrum-progress": string;
  "--prism-startup-spectrum-remainder": string;
};

export function PrismStartupScreen({
  label,
  logs,
  failed = false,
  onRetry,
}: PrismStartupScreenProps): React.JSX.Element {
  const opticsProgress = prismStartupOpticsProgress(
    prismStartupProgressFromLogs(logs),
  );
  const progressPercent = Math.round(opticsProgress.total * 100);
  const displayLabel =
    opticsProgress.total >= 1 ? "Your private workspace is ready." : label;
  const opticsStyle: PrismStartupOpticsStyle = {
    "--prism-startup-beam-progress": String(opticsProgress.beam),
    "--prism-startup-beam-remainder": `${(1 - opticsProgress.beam) * 100}%`,
    "--prism-startup-spectrum-progress": String(opticsProgress.spectrum),
    "--prism-startup-spectrum-remainder": `${(1 - opticsProgress.spectrum) * 100}%`,
  };

  return (
    <main
      className={styles.veil}
      data-prism-startup-screen="true"
      data-prism-startup-stage="workspace"
    >
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: PRISM_STARTUP_MOTION_PHASE_SCRIPT,
        }}
      />
      <div className={styles.focusMask} aria-hidden="true" />

      <div className={styles.center}>
        <div
          className={styles.optics}
          role="progressbar"
          aria-label="Opening Prism"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-valuetext={displayLabel}
          style={opticsStyle}
        >
          <span className={styles.incomingTrack} aria-hidden="true" />
          <span className={styles.incomingBeam} aria-hidden="true" />
          <span className={styles.contactFlare} aria-hidden="true" />
          <svg
            className={styles.spectrum}
            viewBox="0 0 1000 320"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className={`${styles.spectrumRay} ${styles.spectrumRed}`}
              d="M0 160L1000 18"
            />
            <path
              className={`${styles.spectrumRay} ${styles.spectrumAmber}`}
              d="M0 160L1000 82"
            />
            <path
              className={`${styles.spectrumRay} ${styles.spectrumLime}`}
              d="M0 160L1000 142"
            />
            <path
              className={`${styles.spectrumRay} ${styles.spectrumCyan}`}
              d="M0 160L1000 222"
            />
            <path
              className={`${styles.spectrumRay} ${styles.spectrumViolet}`}
              d="M0 160L1000 302"
            />
            <path
              className={`${styles.spectrumGlint} ${styles.spectrumRed}`}
              d="M0 160L1000 18"
              pathLength="1"
            />
            <path
              className={`${styles.spectrumGlint} ${styles.spectrumAmber}`}
              d="M0 160L1000 82"
              pathLength="1"
            />
            <path
              className={`${styles.spectrumGlint} ${styles.spectrumLime}`}
              d="M0 160L1000 142"
              pathLength="1"
            />
            <path
              className={`${styles.spectrumGlint} ${styles.spectrumCyan}`}
              d="M0 160L1000 222"
              pathLength="1"
            />
            <path
              className={`${styles.spectrumGlint} ${styles.spectrumViolet}`}
              d="M0 160L1000 302"
              pathLength="1"
            />
          </svg>
        </div>

        <div className={styles.halo}>
          <div className={styles.orb}>
            <div className={styles.aura} />
            <div className={styles.ring} />
          </div>
          <svg
            className={styles.glyph}
            data-prism-startup-glyph="authenticated"
            viewBox="0 0 56 56"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M28 6L48 43H8L28 6Z" />
          </svg>
        </div>

        <div className={styles.label} role="status" aria-live="polite">
          {displayLabel}
        </div>

        <div
          className={styles.services}
          role="list"
          aria-label="Service status"
        >
          {SERVICES.map((service) => (
            <div
              className={styles.service}
              data-state="ready"
              role="listitem"
              key={service}
            >
              <span className={styles.serviceDot} />
              {service}
            </div>
          ))}
        </div>

        {failed && onRetry ? (
          <button className={styles.retry} type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>

      <div className={styles.console} role="log" aria-label="Boot log">
        <div className={styles.consoleHeader}>
          <svg
            className={styles.consoleSigil}
            viewBox="0 0 58 12"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="prism-startup-spectrum"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0" stopColor="#ff4d6d" />
                <stop offset="0.25" stopColor="#ff9f1c" />
                <stop offset="0.5" stopColor="#b7e63a" />
                <stop offset="0.72" stopColor="#2fd3e3" />
                <stop offset="1" stopColor="#7b5cff" />
              </linearGradient>
            </defs>
            <path className={styles.consoleRay} d="M1 6H13" />
            <path
              className={styles.consolePrism}
              d="M18 1.5 23 10.5H13L18 1.5Z"
            />
            <path
              className={styles.consoleSpectrum}
              d="M23 6H57"
              stroke="url(#prism-startup-spectrum)"
            />
          </svg>
          <span className={styles.consoleBrand}>Prism</span>
          <span className={styles.consoleDivider}>/</span>
          <span className={styles.consoleTitle}>Startup Trace</span>
          <span className={styles.consoleRule} aria-hidden="true" />
        </div>
        <div className={styles.consoleLines}>
          {logs.map((line) => (
            <div
              className={styles.logLine}
              data-kind={line.kind ?? "status"}
              data-spectrum={line.spectrumIndex ?? line.id % 5}
              aria-hidden={line.kind === "flavor" ? "true" : undefined}
              key={line.id}
            >
              <span className={styles.logSource} data-source={line.source}>
                {line.source}
              </span>
              <span className={styles.logText}>
                {prismStartupTraceText(line.text)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
