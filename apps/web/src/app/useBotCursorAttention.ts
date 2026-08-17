"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  botFaceEyeMovementIsActive,
  type BotFaceEyeMovement,
} from "@localai/shared";
import type { BotFaceGazeFrame } from "./botFaceEyeMovement.ts";
import {
  botCursorAttentionDistanceRatio,
  botCursorAttentionGaze,
  botCursorAttentionProfile,
  botCursorAttentionShouldCatch,
} from "./botCursorAttention.ts";

type CursorAttentionRuntime = {
  engaged: boolean;
  wasNear: boolean;
  engagedUntilMs: number;
  cooldownUntilMs: number;
  previousClientX: number | null;
  previousClientY: number | null;
};

function sampledDuration(minMs: number, spanMs: number): number {
  return minMs + Math.random() * spanMs;
}

export function useBotCursorAttention(args: {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  movement: BotFaceEyeMovement | null | undefined;
  facingScaleX?: -1 | 1;
  /** Eye size; the sole input to how far the gaze travels. */
  eyeScale?: number | null;
}): BotFaceGazeFrame | null {
  const [gaze, setGaze] = useState<BotFaceGazeFrame | null>(null);

  useEffect(() => {
    const movement = args.movement;
    const profile = botCursorAttentionProfile(movement);
    if (
      !args.enabled ||
      !profile ||
      !botFaceEyeMovementIsActive(movement) ||
      typeof window === "undefined"
    ) {
      setGaze(null);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const runtime: CursorAttentionRuntime = {
      engaged: false,
      wasNear: false,
      engagedUntilMs: 0,
      cooldownUntilMs: 0,
      previousClientX: null,
      previousClientY: null,
    };
    let idleTimer: number | null = null;
    let followTimer: number | null = null;

    const clearTimer = (timer: number | null): void => {
      if (timer !== null) window.clearTimeout(timer);
    };
    const disengage = (): void => {
      if (!runtime.engaged) return;
      runtime.engaged = false;
      runtime.cooldownUntilMs = performance.now() + sampledDuration(
        profile.cooldownMinMs,
        profile.cooldownSpanMs,
      );
      clearTimer(idleTimer);
      clearTimer(followTimer);
      idleTimer = null;
      followTimer = null;
      setGaze(null);
    };
    const armIdleRelease = (): void => {
      clearTimer(idleTimer);
      idleTimer = window.setTimeout(
        disengage,
        sampledDuration(profile.idleMinMs, profile.idleSpanMs),
      );
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      const element = args.targetRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distanceRatio = botCursorAttentionDistanceRatio({
        clientX: event.clientX,
        clientY: event.clientY,
        rect,
      });
      const near = distanceRatio <= profile.radiusScale;
      const enteredAttentionRadius = near && !runtime.wasNear;
      runtime.wasNear = near;
      const movedPx =
        runtime.previousClientX === null || runtime.previousClientY === null
          ? Number.POSITIVE_INFINITY
          : Math.hypot(
              event.clientX - runtime.previousClientX,
              event.clientY - runtime.previousClientY,
            );
      runtime.previousClientX = event.clientX;
      runtime.previousClientY = event.clientY;

      if (runtime.engaged) {
        if (
          performance.now() >= runtime.engagedUntilMs ||
          distanceRatio > profile.radiusScale * 1.35
        ) {
          disengage();
          return;
        }
        setGaze(
          botCursorAttentionGaze({
            movement,
            clientX: event.clientX,
            clientY: event.clientY,
            rect,
            facingScaleX: args.facingScaleX,
            eyeScale: args.eyeScale,
          }),
        );
        armIdleRelease();
        return;
      }

      if (
        !enteredAttentionRadius ||
        movedPx < 3 ||
        performance.now() < runtime.cooldownUntilMs ||
        !botCursorAttentionShouldCatch({
          movement,
          distanceRatio,
          randomSample: Math.random(),
        })
      ) {
        return;
      }

      runtime.engaged = true;
      runtime.engagedUntilMs = performance.now() + sampledDuration(
        profile.followMinMs,
        profile.followSpanMs,
      );
      setGaze(
        botCursorAttentionGaze({
          movement,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          facingScaleX: args.facingScaleX,
          eyeScale: args.eyeScale,
        }),
      );
      armIdleRelease();
      followTimer = window.setTimeout(
        disengage,
        runtime.engagedUntilMs - performance.now(),
      );
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      clearTimer(idleTimer);
      clearTimer(followTimer);
    };
  }, [
    args.enabled,
    args.eyeScale,
    args.facingScaleX,
    args.movement,
    args.targetRef,
  ]);

  return gaze;
}
