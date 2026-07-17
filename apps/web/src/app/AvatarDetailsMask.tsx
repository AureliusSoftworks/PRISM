"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  avatarDetailsHasVisuals,
  avatarDetailsPhosphorCoreRgba,
  normalizeAvatarDetailsColor,
  rasterizeAvatarDetailsRgba,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsV1,
} from "./avatar-details";
import styles from "./avatar-details-mask.module.css";

export interface AvatarDetailsMaskProps {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  hiddenForBlink?: boolean;
}

/**
 * Shared persistent pixel layer for Studio, Zen, and Coffee. Drawing the
 * canonical 128px raster directly keeps the previous frame mounted until the
 * next pixels are ready and avoids an object-URL swap for every brush sample.
 */
export function AvatarDetailsMask({
  details,
  color,
  faceGeometry,
  hiddenForBlink = false,
}: AvatarDetailsMaskProps): React.JSX.Element | null {
  const haloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasVisuals = avatarDetailsHasVisuals(details);
  const normalizedColor = normalizeAvatarDetailsColor(color);
  const pixels = rasterizeAvatarDetailsRgba(
    details,
    normalizedColor,
    faceGeometry,
  );

  useLayoutEffect(() => {
    const haloCanvas = haloCanvasRef.current;
    const bloomCanvas = bloomCanvasRef.current;
    const coreCanvas = coreCanvasRef.current;
    if (!hasVisuals || !haloCanvas || !bloomCanvas || !coreCanvas) return;
    const haloContext = haloCanvas.getContext("2d", { alpha: true });
    const bloomContext = bloomCanvas.getContext("2d", { alpha: true });
    const coreContext = coreCanvas.getContext("2d", { alpha: true });
    if (!haloContext || !bloomContext || !coreContext) return;
    const glowImageData = coreContext.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    glowImageData.data.set(pixels);
    const coreImageData = coreContext.createImageData(
      AVATAR_DETAILS_CANVAS_SIZE,
      AVATAR_DETAILS_CANVAS_SIZE,
    );
    coreImageData.data.set(avatarDetailsPhosphorCoreRgba(pixels));
    for (const context of [haloContext, bloomContext]) {
      context.imageSmoothingEnabled = false;
      context.putImageData(glowImageData, 0, 0);
    }
    coreContext.imageSmoothingEnabled = false;
    coreContext.putImageData(coreImageData, 0, 0);
  }, [hasVisuals, pixels]);

  if (!hasVisuals) return null;

  const canvasStyle = {
    color: normalizedColor,
    ["--avatar-details-phosphor-glow-color" as string]: normalizedColor,
  } as CSSProperties;
  return (
    <>
      <canvas
        ref={haloCanvasRef}
        className={`${styles.layer} ${styles.halo}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-hidden-for-blink={
          hiddenForBlink ? "true" : undefined
        }
        data-avatar-details-emission="halo"
        aria-hidden="true"
      />
      <canvas
        ref={bloomCanvasRef}
        className={`${styles.layer} ${styles.bloom}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-hidden-for-blink={
          hiddenForBlink ? "true" : undefined
        }
        data-avatar-details-emission="bloom"
        aria-hidden="true"
      />
      <canvas
        ref={coreCanvasRef}
        className={`${styles.layer} ${styles.core}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-hidden-for-blink={
          hiddenForBlink ? "true" : undefined
        }
        data-avatar-details-mask="true"
        data-avatar-details-emission="core"
        data-avatar-details-rendering="nearest-neighbor"
        data-avatar-details-mask-size={AVATAR_DETAILS_CANVAS_SIZE}
        aria-hidden="true"
      />
    </>
  );
}
