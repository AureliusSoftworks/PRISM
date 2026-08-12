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
import { avatarDetailsExteriorGlowRaster } from "./avatar-details-glow";
import { resamplePhosphorRgbaForPresentation } from "./phosphorPixelRaster";
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
  rasterSize?: number;
  /** Hard nearest-neighbor cells; used when the Studio pixel grid is visible. */
  pixelPerfectInk?: boolean;
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
  rasterSize: number;
  pixelPerfectInk?: boolean;
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
  rasterSize,
  pixelPerfectInk = false,
}: AvatarDetailsEmissionPlanesProps): React.JSX.Element | null {
  const haloCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [staticRasterUrl, setStaticRasterUrl] = useState<string | null>(null);
  const hasPixels = useMemo(
    () => pixels.some((channel, index) => index % 4 === 3 && channel > 0),
    [pixels],
  );
  const resampleMode = pixelPerfectInk ? "nearest" : "coverage";
  const rasterizedGlowPixels = useMemo(
    () =>
      rasterSize === AVATAR_DETAILS_CANVAS_SIZE
        ? pixels
        : resamplePhosphorRgbaForPresentation(
            pixels,
            AVATAR_DETAILS_CANVAS_SIZE,
            AVATAR_DETAILS_CANVAS_SIZE,
            rasterSize,
            rasterSize,
            resampleMode,
          ),
    [pixels, rasterSize, resampleMode],
  );
  const exteriorGlow = useMemo(
    () =>
      pixelPerfectInk || detailLevel === "audience"
        ? null
        : avatarDetailsExteriorGlowRaster(
            rasterizedGlowPixels,
            rasterSize,
            rasterSize,
            Math.max(
              1,
              Math.round(rasterSize / AVATAR_DETAILS_CANVAS_SIZE),
            ),
          ),
    [detailLevel, pixelPerfectInk, rasterSize, rasterizedGlowPixels],
  );
  const rasterizedCorePixels = useMemo(() => {
    const sourceCorePixels =
      coreColor === "ink" ? pixels : avatarDetailsPhosphorCoreRgba(pixels);
    return rasterSize === AVATAR_DETAILS_CANVAS_SIZE
      ? sourceCorePixels
      : resamplePhosphorRgbaForPresentation(
          sourceCorePixels,
          AVATAR_DETAILS_CANVAS_SIZE,
          AVATAR_DETAILS_CANVAS_SIZE,
          rasterSize,
          rasterSize,
          resampleMode,
        );
  }, [coreColor, pixels, rasterSize, resampleMode]);
  useLayoutEffect(() => {
    if (staticRaster && detailLevel === "audience") {
      if (!hasPixels) {
        queueMicrotask(() => setStaticRasterUrl(null));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = rasterSize;
      canvas.height = rasterSize;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) return;
      const imageData = context.createImageData(
        rasterSize,
        rasterSize,
      );
      imageData.data.set(rasterizedCorePixels);
      context.imageSmoothingEnabled = false;
      context.putImageData(imageData, 0, 0);
      const nextRasterUrl = canvas.toDataURL("image/png");
      queueMicrotask(() => setStaticRasterUrl(nextRasterUrl));
      return;
    }
    const haloCanvas = haloCanvasRef.current;
    const bloomCanvas = bloomCanvasRef.current;
    const coreCanvas = coreCanvasRef.current;
    const needsGlowPlanes = detailLevel === "full" && exteriorGlow !== null;
    const needsBloomPlane =
      detailLevel === "reduced" && exteriorGlow !== null;
    if (
      !hasPixels ||
      !coreCanvas ||
      (needsGlowPlanes && (!haloCanvas || !bloomCanvas)) ||
      (needsBloomPlane && !bloomCanvas)
    ) {
      return;
    }
    const haloContext = haloCanvas?.getContext("2d", { alpha: true }) ?? null;
    const bloomContext =
      bloomCanvas?.getContext("2d", { alpha: true }) ?? null;
    const coreContext = coreCanvas.getContext("2d", { alpha: true });
    if (
      !coreContext ||
      ((needsGlowPlanes || needsBloomPlane) && !bloomContext)
    ) {
      return;
    }
    const glowImageData = exteriorGlow
      ? coreContext.createImageData(
          exteriorGlow.bounds.width,
          exteriorGlow.bounds.height,
        )
      : null;
    if (glowImageData && exteriorGlow) {
      glowImageData.data.set(exteriorGlow.pixels);
    }
    const coreImageData = coreContext.createImageData(
      rasterSize,
      rasterSize,
    );
    coreImageData.data.set(rasterizedCorePixels);
    for (const context of [haloContext, bloomContext]) {
      if (!context || !glowImageData) continue;
      context.imageSmoothingEnabled = false;
      context.putImageData(glowImageData, 0, 0);
    }
    coreContext.imageSmoothingEnabled = false;
    coreContext.putImageData(coreImageData, 0, 0);
  }, [
    detailLevel,
    exteriorGlow,
    hasPixels,
    pixelPerfectInk,
    rasterizedCorePixels,
    rasterSize,
    staticRaster,
  ]);

  if (!hasPixels) return null;

  const planeStyle = {
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
  const glowRasterStyle = exteriorGlow
    ? ({
        left: `${(exteriorGlow.bounds.x / rasterSize) * 100}%`,
        top: `${(exteriorGlow.bounds.y / rasterSize) * 100}%`,
        width: `${(exteriorGlow.bounds.width / rasterSize) * 100}%`,
        height: `${(exteriorGlow.bounds.height / rasterSize) * 100}%`,
      } as CSSProperties)
    : undefined;
  const depthClassName =
    depth === "behind-face" ? styles.behindFace : styles.aboveFace;
  const motionClassName = motion ? ` ${styles.speechMotion}` : "";
  const sharedPlaneProps = {
    style: planeStyle,
    "data-avatar-details-depth": depth,
    "data-avatar-details-ink-role": inkRole,
    "data-avatar-details-ink-motion": motion ?? undefined,
    "data-avatar-details-mouth-shape": motion ? mouthShape : undefined,
    "data-avatar-details-render-detail": detailLevel,
    "data-avatar-details-pixel-perfect": pixelPerfectInk ? "true" : undefined,
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
        width={rasterSize}
        height={rasterSize}
        style={planeStyle}
        data-avatar-details-mask="true"
        data-avatar-details-emission="core"
        data-avatar-details-rendering="static-raster"
        data-avatar-details-depth={depth}
        data-avatar-details-ink-role={inkRole}
        data-avatar-details-render-detail={detailLevel}
        aria-hidden
      />
    ) : null;
  }

  return (
    <>
      {detailLevel === "full" && exteriorGlow ? (
        <span
          className={`${styles.motionPlane} ${depthClassName} ${styles.haloPlane}${motionClassName}`}
          data-avatar-details-emission="halo"
          {...sharedPlaneProps}
        >
          <canvas
            ref={haloCanvasRef}
            width={exteriorGlow.bounds.width}
            height={exteriorGlow.bounds.height}
            className={`${styles.raster} ${styles.croppedGlowRaster} ${styles.halo}`}
            style={glowRasterStyle}
            data-avatar-details-raster="glow"
            aria-hidden
          />
        </span>
      ) : null}
      {detailLevel !== "audience" && exteriorGlow ? (
        <span
          className={`${styles.motionPlane} ${depthClassName} ${styles.bloomPlane}${motionClassName}`}
          data-avatar-details-emission="bloom"
          {...sharedPlaneProps}
        >
          <canvas
            ref={bloomCanvasRef}
            width={exteriorGlow.bounds.width}
            height={exteriorGlow.bounds.height}
            className={`${styles.raster} ${styles.croppedGlowRaster} ${styles.bloom}`}
            style={glowRasterStyle}
            data-avatar-details-raster="glow"
            aria-hidden
          />
        </span>
      ) : null}
      <span
        className={`${styles.motionPlane} ${depthClassName} ${styles.corePlane}${motionClassName}`}
        data-avatar-details-emission="core"
        {...sharedPlaneProps}
      >
        <canvas
          ref={coreCanvasRef}
          width={rasterSize}
          height={rasterSize}
          className={`${styles.raster} ${styles.fullRaster} ${styles.core}`}
          data-avatar-details-mask="true"
          data-avatar-details-raster="core"
          data-avatar-details-rendering={
            pixelPerfectInk || rasterSize === AVATAR_DETAILS_CANVAS_SIZE
              ? "nearest-neighbor"
              : "coverage-sampled"
          }
          data-avatar-details-mask-size={rasterSize}
          aria-hidden
        />
      </span>
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
  rasterSize = AVATAR_DETAILS_CANVAS_SIZE,
  pixelPerfectInk = false,
}: AvatarDetailsMaskProps): React.JSX.Element | null {
  const normalizedRasterSize = Number.isFinite(rasterSize)
    ? Math.max(1, Math.floor(rasterSize))
    : AVATAR_DETAILS_CANVAS_SIZE;
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
        rasterSize={normalizedRasterSize}
        pixelPerfectInk={pixelPerfectInk}
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
          rasterSize={normalizedRasterSize}
          pixelPerfectInk={pixelPerfectInk}
        />
      ) : null}
    </>
  );
}
