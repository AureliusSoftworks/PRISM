"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import {
  BALANCED_ONLINE_AUTO_PROVIDER_WEIGHTS,
  formatOnlineAutoProviderWeightsLabel,
  normalizeOnlineAutoProviderWeights,
  type OnlineAutoProviderWeightsV1,
} from "@localai/shared";
import styles from "./OnlineAutoProviderTriangle.module.css";
import {
  nudgeOnlineAutoProviderWeights,
  onlineAutoPointToWeights,
  onlineAutoWeightsToPoint,
} from "./onlineAutoProviderTriangleMath";

export function OnlineAutoProviderTriangle({
  value,
  onChange,
}: {
  value: OnlineAutoProviderWeightsV1;
  onChange: (next: OnlineAutoProviderWeightsV1) => void;
}) {
  const normalized = normalizeOnlineAutoProviderWeights(value);
  const point = onlineAutoWeightsToPoint(normalized);
  const valueText = formatOnlineAutoProviderWeightsLabel(normalized);

  const updateFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    onChange(
      onlineAutoPointToWeights(
        ((event.clientX - bounds.left) / bounds.width) * 300,
        ((event.clientY - bounds.top) / bounds.height) * 250,
      ),
    );
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateFromPointer(event);
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    onChange(nudgeOnlineAutoProviderWeights(normalized, event.key));
  };

  return (
    <div className={styles.shell}>
      <svg
        className={styles.pad}
        viewBox="0 0 300 250"
        role="slider"
        tabIndex={0}
        aria-label="ONLINE Auto provider balance"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(
          Math.max(normalized.openai, normalized.anthropic, normalized.ollama_cloud) * 100,
        )}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id="provider-triangle-base" x1="0" y1="1" x2="1" y2="1">
            <stop offset="0" stopColor="var(--provider-accent-openai)" />
            <stop offset="1" stopColor="var(--provider-accent-anthropic)" />
          </linearGradient>
          <radialGradient id="provider-triangle-cloud" cx="50%" cy="0" r="85%">
            <stop offset="0" stopColor="var(--provider-accent-ollama-cloud, #7de0bd)" stopOpacity=".94" />
            <stop offset="1" stopColor="var(--provider-accent-ollama-cloud, #7de0bd)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path className={styles.base} d="M150 18 L276 232 L24 232 Z" />
        <path className={styles.colorBase} d="M150 18 L276 232 L24 232 Z" />
        <path className={styles.cloudWash} d="M150 18 L276 232 L24 232 Z" />
        <path className={styles.grid} d="M87 125 H213 M66 161 H234 M45 197 H255 M87 125 L150 232 M213 125 L150 232" />
        <circle className={styles.thumbHalo} cx={point.x} cy={point.y} r="12" />
        <circle className={styles.thumb} cx={point.x} cy={point.y} r="7" />
      </svg>
      <div className={styles.vertexLabels} aria-hidden="true">
        <span className={styles.cloudLabel}>Ollama Cloud</span>
        <span className={styles.openAiLabel}>OpenAI</span>
        <span className={styles.anthropicLabel}>Anthropic</span>
      </div>
      <div className={styles.summary} aria-live="polite">{valueText}</div>
      <button
        type="button"
        className={styles.reset}
        onClick={() => onChange({ ...BALANCED_ONLINE_AUTO_PROVIDER_WEIGHTS })}
      >
        Balanced
      </button>
    </div>
  );
}
