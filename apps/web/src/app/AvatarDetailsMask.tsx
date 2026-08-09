"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { BotAvatarDetailsSpeechInkAnimation } from "@localai/shared";

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
import {
  avatarDetailsSpeechMotionOrigin,
  type AvatarDetailsSpeechMotionOrigin,
} from "./avatar-details-speech-motion";
import styles from "./avatar-details-mask.module.css";

export interface AvatarDetailsMaskProps {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  detailLevel?: "full" | "reduced" | "audience";
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  blinkPhase?: "open" | "closed";
  talking?: boolean;
  speechMotionActive?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
  depth?: Exclude<AvatarDetailsFaceDepth, "all">;
  staticRaster?: boolean;
  coreColor?: "phosphor" | "ink";
}

type AvatarDetailsSpeechMotion = Exclude<
  BotAvatarDetailsSpeechInkAnimation,
  "none"
>;

interface AvatarDetailsEmissionPlanesProps {
  pixels: Uint8ClampedArray;
  normalizedColor: string;
  detailLevel: "full" | "reduced" | "audience";
  depth: Exclude<AvatarDetailsFaceDepth, "all">;
  inkRole: "visible" | "speech";
  motion?: AvatarDetailsSpeechMotion | null;
  motionOrigin?: AvatarDetailsSpeechMotionOrigin | null;
  mouthShape?: ZenLiveBotMouthShape | null;
  staticRaster?: boolean;
  coreColor: "phosphor" | "ink";
}

function AvatarDetailsEmissionPlanes({
  pixels,
  normalizedColor,
  detailLevel,
  depth,
  inkRole,
  motion = null,
  motionOrigin = null,
  mouthShape = null,
  staticRaster = false,
  coreColor,
}: AvatarDetailsEmissionPlanesProps): React.JSX.Element | null {
  const haloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [staticRasterUrl, setStaticRasterUrl] = useState<string | null>(null);
  const hasPixels = useMemo(
    () => pixels.some((channel, index) => index % 4 === 3 && channel > 0),
    [pixels],
  );
  useLayoutEffect(() => {
    if (staticRaster && detailLevel === "audience") {
      if (!hasPixels) {
        queueMicrotask(() => setStaticRasterUrl(null));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_DETAILS_CANVAS_SIZE;
      canvas.height = AVATAR_DETAILS_CANVAS_SIZE;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) return;
      const imageData = context.createImageData(
        AVATAR_DETAILS_CANVAS_SIZE,
        AVATAR_DETAILS_CANVAS_SIZE,
      );
      imageData.data.set(
        coreColor === "ink" ? pixels : avatarDetailsPhosphorCoreRgba(pixels),
      );
      context.imageSmoothingEnabled = false;
      context.putImageData(imageData, 0, 0);
      const nextRasterUrl = canvas.toDataURL("image/png");
      queueMicrotask(() => setStaticRasterUrl(nextRasterUrl));
      return;
    }
    const haloCanvas = haloCanvasRef.current;
    const bloomCanvas = bloomCanvasRef.current;
    const coreCanvas = coreCanvasRef.current;
    if (
      !hasPixels ||
      !coreCanvas ||
      (detailLevel === "full" && (!haloCanvas || !bloomCanvas)) ||
      (detailLevel === "reduced" && !bloomCanvas)
    ) {
      return;
    }
    const haloContext = haloCanvas?.getContext("2d", { alpha: true }) ?? null;
    const bloomContext =
      bloomCanvas?.getContext("2d", { alpha: true }) ?? null;
    const coreContext = coreCanvas.getContext("2d", { alpha: true });
    if (!coreContext || (detailLevel !== "audience" && !bloomContext)) {
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
    coreImageData.data.set(
      coreColor === "ink" ? pixels : avatarDetailsPhosphorCoreRgba(pixels),
    );
    for (const context of [haloContext, bloomContext]) {
      if (!context) continue;
      context.imageSmoothingEnabled = false;
      context.putImageData(glowImageData, 0, 0);
    }
    coreContext.imageSmoothingEnabled = false;
    coreContext.putImageData(coreImageData, 0, 0);
  }, [coreColor, detailLevel, hasPixels, pixels, staticRaster]);

  if (!hasPixels) return null;

  const canvasStyle = {
    color: normalizedColor,
    ["--avatar-details-phosphor-glow-color" as string]: normalizedColor,
    ["--avatar-details-speech-spin-turn-duration" as string]:
      `${ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS}ms`,
    ["--avatar-details-speech-origin-x" as string]: motionOrigin
      ? `${motionOrigin.xPct}%`
      : undefined,
    ["--avatar-details-speech-origin-y" as string]: motionOrigin
      ? `${motionOrigin.yPct}%`
      : undefined,
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
    "data-avatar-details-render-detail": detailLevel,
    "aria-hidden": true,
  } as const;

  if (staticRaster && detailLevel === "audience") {
    return staticRasterUrl ? (
      // The immutable audience ink is encoded once so WebKit can cache it as
      // an image instead of repainting two retained canvases every stage frame.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={staticRasterUrl}
        alt=""
        className={`${styles.layer} ${depthClassName} ${styles.core}`}
        data-avatar-details-mask="true"
        data-avatar-details-emission="core"
        data-avatar-details-rendering="static-raster"
        {...sharedProps}
      />
    ) : null;
  }

  return (
    <>
      {detailLevel === "full" ? (
        <canvas
          ref={haloCanvasRef}
          className={`${styles.layer} ${depthClassName} ${styles.halo}${motionClassName}`}
          data-avatar-details-emission="halo"
          {...sharedProps}
        />
      ) : null}
      {detailLevel !== "audience" ? (
        <canvas
          ref={bloomCanvasRef}
          className={`${styles.layer} ${depthClassName} ${styles.bloom}${motionClassName}`}
          data-avatar-details-emission="bloom"
          {...sharedProps}
        />
      ) : null}
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
 * silhouette while idle. During authored Speech ink motion, speech ink gets a
 * temporary emission plane so it can move without pulling blink/effect ink or
 * inheriting the separate mouth glyph animation.
 */
export function AvatarDetailsMask({
  details,
  color,
  detailLevel = "full",
  faceGeometry,
  blinkPhase = "open",
  talking = false,
  speechMotionActive = talking,
  mouthShape = null,
  depth = "above-face",
  staticRaster = false,
  coreColor = "phosphor",
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
  const speechInkAnimation =
    normalizedDetails.screen.speechInkAnimation ?? "none";
  const speechMotion: AvatarDetailsSpeechMotion | null =
    detailLevel === "full" &&
    talking &&
    speechMotionActive &&
    speechInkAnimation !== "none"
      ? speechInkAnimation
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
  const speechMotionOrigin = useMemo(() => {
    if (!speechMotion) return null;
    // Use the complete authored Speech item for both depth slices so ink that
    // crosses the mouth seam cannot tear into two independently moving parts.
    const completeSpeechPixels = rasterizeAvatarDetailsRgba(
      normalizedDetails,
      normalizedColor,
      faceGeometry,
      "talking",
      "all",
    );
    return avatarDetailsSpeechMotionOrigin(completeSpeechPixels);
  }, [
    faceGeometry,
    normalizedColor,
    normalizedDetails,
    speechMotion,
  ]);
  if (!hasVisuals) return null;

  return (
    <>
      <AvatarDetailsEmissionPlanes
        pixels={visiblePixels}
        normalizedColor={normalizedColor}
        detailLevel={detailLevel}
        depth={depth}
        inkRole="visible"
        staticRaster={staticRaster}
        coreColor={coreColor}
      />
      {speechPixels && speechMotion ? (
        <AvatarDetailsEmissionPlanes
          pixels={speechPixels}
          normalizedColor={normalizedColor}
          detailLevel={detailLevel}
          depth={depth}
          inkRole="speech"
          motion={speechMotion}
          motionOrigin={speechMotionOrigin}
          mouthShape={mouthShape}
          staticRaster={staticRaster}
          coreColor={coreColor}
        />
      ) : null}
    </>
  );
}
