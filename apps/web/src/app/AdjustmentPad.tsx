"use client";

import { useEffect, useRef } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";

import {
  clampAdjustmentPadPoint,
  type AdjustmentPadAdapter,
  type AdjustmentPadDirection,
  type AdjustmentPadInputSource,
  type AdjustmentPadPoint,
} from "./adjustmentPadModel";
import styles from "./AdjustmentPad.module.css";

export interface AdjustmentPadRenderContext<TValue> {
  value: TValue;
  point: AdjustmentPadPoint;
  disabled: boolean;
}

export interface AdjustmentPadProps<TValue> {
  label: string;
  value: TValue;
  restoreValue: TValue;
  adapter: AdjustmentPadAdapter<TValue>;
  onPreview: (value: TValue, source: AdjustmentPadInputSource) => void;
  onCommit: (value: TValue, source: AdjustmentPadInputSource) => void;
  onCancel?: (restoredValue: TValue) => void;
  renderOverlay?: (context: AdjustmentPadRenderContext<TValue>) => ReactNode;
  color?: string;
  disabled?: boolean;
  className?: string;
}

export function AdjustmentPad<TValue>({
  label,
  value,
  restoreValue,
  adapter,
  onPreview,
  onCommit,
  onCancel,
  renderOverlay,
  color,
  disabled = false,
  className,
}: AdjustmentPadProps<TValue>): ReactElement {
  const padRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(value);
  const pointerSessionRef = useRef<{
    pointerId: number;
    startValue: TValue;
    latestValue: TValue;
  } | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const point = clampAdjustmentPadPoint(adapter.toPoint(value));
  const valueText = adapter.valueText(value);

  const valueFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): TValue | null => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return adapter.fromPoint(
      clampAdjustmentPadPoint({
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }),
      pointerSessionRef.current?.latestValue ?? valueRef.current,
    );
  };

  const cancelPointerSession = (element?: HTMLDivElement): void => {
    const session = pointerSessionRef.current;
    if (!session) return;
    pointerSessionRef.current = null;
    if (element?.hasPointerCapture?.(session.pointerId)) {
      element.releasePointerCapture(session.pointerId);
    }
    onPreview(session.startValue, "pointer");
    onCancel?.(session.startValue);
  };

  useEffect(() => {
    const session = pointerSessionRef.current;
    if (!disabled || !session) return;
    pointerSessionRef.current = null;
    const element = padRef.current;
    if (element?.hasPointerCapture?.(session.pointerId)) {
      element.releasePointerCapture(session.pointerId);
    }
    onPreview(session.startValue, "pointer");
    onCancel?.(session.startValue);
  }, [disabled, onCancel, onPreview]);

  const previewAndCommitKeyboardValue = (nextValue: TValue): void => {
    onPreview(nextValue, "keyboard");
    onCommit(nextValue, "keyboard");
  };

  return (
    <div
      ref={padRef}
      className={`${styles.pad}${className ? ` ${className}` : ""}`}
      data-adjustment-pad="true"
      data-disabled={disabled ? "true" : undefined}
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${label}. ${valueText}. Use arrow keys to adjust and Home to restore.`}
      aria-roledescription="two-dimensional adjustment pad"
      aria-disabled={disabled || undefined}
      style={
        color
          ? ({ "--adjustment-pad-color": color } as CSSProperties)
          : undefined
      }
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        const startValue = valueRef.current;
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          startValue,
          latestValue: startValue,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        const nextValue = valueFromPointer(event);
        if (nextValue != null) {
          pointerSessionRef.current.latestValue = nextValue;
          onPreview(nextValue, "pointer");
        }
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        const nextValue = valueFromPointer(event);
        if (nextValue == null) return;
        session.latestValue = nextValue;
        onPreview(nextValue, "pointer");
        event.preventDefault();
      }}
      onPointerUp={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        const nextValue = valueFromPointer(event) ?? session.latestValue;
        pointerSessionRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPreview(nextValue, "pointer");
        onCommit(nextValue, "pointer");
        event.preventDefault();
      }}
      onPointerCancel={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        cancelPointerSession(event.currentTarget);
        event.preventDefault();
      }}
      onLostPointerCapture={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        cancelPointerSession();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Escape" && pointerSessionRef.current) {
          event.preventDefault();
          cancelPointerSession(event.currentTarget);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          previewAndCommitKeyboardValue(restoreValue);
          return;
        }
        const direction: AdjustmentPadDirection | null =
          event.key === "ArrowLeft"
            ? "left"
            : event.key === "ArrowRight"
              ? "right"
              : event.key === "ArrowUp"
                ? "up"
                : event.key === "ArrowDown"
                  ? "down"
                  : null;
        if (!direction) return;
        event.preventDefault();
        previewAndCommitKeyboardValue(
          adapter.nudge(valueRef.current, direction, event.shiftKey ? 3 : 1),
        );
      }}
    >
      <span className={styles.axisX} aria-hidden="true" />
      <span className={styles.axisY} aria-hidden="true" />
      {renderOverlay?.({ value, point, disabled })}
      <span
        className={styles.thumb}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
