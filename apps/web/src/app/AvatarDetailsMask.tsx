"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  normalizeBotFaceGlyphAnimation,
  type BotFaceGlyphAnimation,
} from "@localai/shared";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  avatarDetailsHasVisuals,
  avatarDetailsPhosphorCoreRgba,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  rasterizeAvatarDetailsRgba,
  rasterizeVisibleAvatarDetailsRgba,
  type AvatarDetailsFaceDepth,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsV1,
} from "./avatar-details";
import {
  ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth";
import styles from "./avatar-details-mask.module.css";

export interface AvatarDetailsMaskProps {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  blinkPhase?: "open" | "closed";
  talking?: boolean;
  speechMotionActive?: boolean;
  mouthAnimation?: BotFaceGlyphAnimation | null;
  mouthShape?: ZenLiveBotMouthShape | null;
  depth?: Exclude<AvatarDetailsFaceDepth, "all">;
}

type AvatarDetailsSpeechMotion = Exclude<BotFaceGlyphAnimation, "none">;

interface AvatarDetailsEmissionPlanesProps {
  pixels: Uint8ClampedArray;
  normalizedColor: string;
  depth: Exclude<AvatarDetailsFaceDepth, "all">;
  inkRole: "visible" | "speech";
  motion?: AvatarDetailsSpeechMotion | null;
  mouthShape?: ZenLiveBotMouthShape | null;
}

function AvatarDetailsEmissionPlanes({
  pixels,
  normalizedColor,
  depth,
  inkRole,
  motion = null,
  mouthShape = null,
}: AvatarDetailsEmissionPlanesProps): React.JSX.Element | null {
  const haloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasPixels = useMemo(
    () => pixels.some((channel, index) => index % 4 === 3 && channel > 0),
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

  if (!hasPixels) return null;

  const canvasStyle = {
    color: normalizedColor,
    ["--avatar-details-phosphor-glow-color" as string]: normalizedColor,
    ["--avatar-details-speech-spin-turn-duration" as string]:
      `${ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS}ms`,
  } as CSSProperties;
  const depthClassName =
    depth === "behind-face" ? styles.behindFace : styles.aboveFace;
  const motionClassName = motion ? ` ${styles.speechMotion}` : "";
  const sharedProps = {
    width: AVATAR_DETAILS_CANVAS_SIZE,
    height: AVATAR_DETAILS_CANVAS_SIZE,
    style: canvasStyle,
    "data-avatar-details-depth": depth,
    "data-avatar-details-ink-role": inkRole,
    "data-avatar-details-ink-motion": motion ?? undefined,
    "data-avatar-details-mouth-shape": motion ? mouthShape : undefined,
    "aria-hidden": true,
  } as const;

  return (
    <>
      <canvas
        ref={haloCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.halo}${motionClassName}`}
        data-avatar-details-emission="halo"
        {...sharedProps}
      />
      <canvas
        ref={bloomCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.bloom}${motionClassName}`}
        data-avatar-details-emission="bloom"
        {...sharedProps}
      />
      <canvas
        ref={coreCanvasRef}
        className={`${styles.layer} ${depthClassName} ${styles.core}${motionClassName}`}
        data-avatar-details-mask="true"
        data-avatar-details-emission="core"
        data-avatar-details-rendering="nearest-neighbor"
        data-avatar-details-mask-size={AVATAR_DETAILS_CANVAS_SIZE}
        {...sharedProps}
      />
    </>
  );
}

/**
 * Shared persistent semantic ink for Studio, Zen, Coffee, and Signal. Each
 * face-depth band flattens the RGB editor roles into one normalized phosphor
 * silhouette while idle. During non-default speech motion, speech ink gets a
 * temporary emission plane so it can move without pulling blink/effect ink.
 */
export function AvatarDetailsMask({
  details,
  color,
  faceGeometry,
  blinkPhase = "open",
  talking = false,
  speechMotionActive = talking,
  mouthAnimation = "none",
  mouthShape = null,
  depth = "above-face",
}: AvatarDetailsMaskProps): React.JSX.Element | null {
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
  const normalizedMouthAnimation =
    normalizeBotFaceGlyphAnimation(mouthAnimation) ?? "none";
  const speechMotion: AvatarDetailsSpeechMotion | null =
    talking && speechMotionActive && normalizedMouthAnimation !== "none"
      ? normalizedMouthAnimation
      : null;
  const visiblePixels = useMemo(
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
  const speechPixels = useMemo(
    () =>
      speechMotion
        ? rasterizeAvatarDetailsRgba(
            normalizedDetails,
            normalizedColor,
            faceGeometry,
            "talking",
            depth,
          )
        : null,
    [
      depth,
      faceGeometry,
      normalizedColor,
      normalizedDetails,
      speechMotion,
    ],
  );
  if (!hasVisuals) return null;

  return (
    <>
      <AvatarDetailsEmissionPlanes
        pixels={visiblePixels}
        normalizedColor={normalizedColor}
        depth={depth}
        inkRole="visible"
      />
      {speechPixels && speechMotion ? (
        <AvatarDetailsEmissionPlanes
          pixels={speechPixels}
          normalizedColor={normalizedColor}
          depth={depth}
          inkRole="speech"
          motion={speechMotion}
          mouthShape={mouthShape}
        />
      ) : null}
    </>
  );
}
