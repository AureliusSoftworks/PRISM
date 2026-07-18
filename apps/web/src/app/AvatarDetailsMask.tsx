"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  avatarDetailsHasVisuals,
  avatarDetailsPhosphorCoreRgba,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  rasterizeVisibleAvatarDetailsRgba,
  type AvatarDetailsFaceDepth,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsV1,
} from "./avatar-details";
import styles from "./avatar-details-mask.module.css";

export interface AvatarDetailsMaskProps {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  blinkPhase?: "open" | "closed";
  talking?: boolean;
  depth?: Exclude<AvatarDetailsFaceDepth, "all">;
}

/**
 * Shared persistent semantic ink for Studio, Zen, Coffee, and Signal. Each
 * face-depth band flattens the RGB editor roles into one normalized phosphor
 * silhouette so neighboring roles never create separate bloom stacks.
 */
export function AvatarDetailsMask({
  details,
  color,
  faceGeometry,
  blinkPhase = "open",
  talking = false,
  depth = "above-face",
}: AvatarDetailsMaskProps): React.JSX.Element | null {
  const haloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const normalizedDetails = useMemo(
    () => normalizeAvatarDetails(details),
    [details],
  );
  const hasVisuals = useMemo(
    () => avatarDetailsHasVisuals(normalizedDetails),
    [normalizedDetails],
  );
  const normalizedColor = useMemo(
    () => normalizeAvatarDetailsColor(color),
    [color],
  );
  const pixels = useMemo(
    () =>
      rasterizeVisibleAvatarDetailsRgba(
        normalizedDetails,
        normalizedColor,
        faceGeometry,
        {
          blinking: blinkPhase === "closed",
          talking,
        },
        depth,
      ),
    [
      blinkPhase,
      depth,
      faceGeometry,
      normalizedColor,
      normalizedDetails,
      talking,
    ],
  );
  const hasPixels = useMemo(
    () =>
      pixels.some((channel, index) => index % 4 === 3 && channel > 0),
    [pixels],
  );
  useLayoutEffect(() => {
    const haloCanvas = haloCanvasRef.current;
    const bloomCanvas = bloomCanvasRef.current;
    const coreCanvas = coreCanvasRef.current;
    if (!hasPixels || !haloCanvas || !bloomCanvas || !coreCanvas) {
      return;
    }
    const haloContext = haloCanvas.getContext("2d", { alpha: true });
    const bloomContext = bloomCanvas.getContext("2d", { alpha: true });
    const coreContext = coreCanvas.getContext("2d", { alpha: true });
    if (!haloContext || !bloomContext || !coreContext) {
      return;
    }
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
  }, [hasPixels, pixels]);

  if (!hasVisuals || !hasPixels) return null;

  const canvasStyle = {
    color: normalizedColor,
    ["--avatar-details-phosphor-glow-color" as string]: normalizedColor,
  } as CSSProperties;
  const depthClassName =
    depth === "behind-face" ? styles.behindFace : styles.aboveFace;
  return (
    <>
      <canvas
        ref={haloCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.halo}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-emission="halo"
        data-avatar-details-depth={depth}
        aria-hidden="true"
      />
      <canvas
        ref={bloomCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.bloom}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-emission="bloom"
        data-avatar-details-depth={depth}
        aria-hidden="true"
      />
      <canvas
        ref={coreCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.core}`}
        width={AVATAR_DETAILS_CANVAS_SIZE}
        height={AVATAR_DETAILS_CANVAS_SIZE}
        style={canvasStyle}
        data-avatar-details-mask="true"
        data-avatar-details-emission="core"
        data-avatar-details-rendering="nearest-neighbor"
        data-avatar-details-depth={depth}
        data-avatar-details-mask-size={AVATAR_DETAILS_CANVAS_SIZE}
        aria-hidden="true"
      />
    </>
  );
}
