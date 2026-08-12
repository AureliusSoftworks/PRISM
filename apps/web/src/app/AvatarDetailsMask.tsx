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
import {
  avatarDetailsCropRgbaRaster,
  avatarDetailsExteriorGlowRaster,
} from "./avatar-details-glow";
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
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [staticRasterUrl, setStaticRasterUrl] = useState<string | null>(null);
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
  const coreRaster = useMemo(
    () =>
      avatarDetailsCropRgbaRaster(
        rasterizedCorePixels,
        rasterSize,
        rasterSize,
      ),
    [rasterSize, rasterizedCorePixels],
  );
  const hasPixels = coreRaster !== null;
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
    const glowCanvas = glowCanvasRef.current;
    const coreCanvas = coreCanvasRef.current;
    const needsGlowPlane = detailLevel !== "audience" && exteriorGlow !== null;
    if (
      !hasPixels ||
      !coreRaster ||
      !coreCanvas ||
      (needsGlowPlane && !glowCanvas)
    ) {
      return;
    }
    const glowContext =
      glowCanvas?.getContext("2d", { alpha: true }) ?? null;
    const coreContext = coreCanvas.getContext("2d", { alpha: true });
    if (!coreContext || (needsGlowPlane && !glowContext)) {
      return;
    }
    const glowImageData = exteriorGlow
      ? glowContext?.createImageData(
          exteriorGlow.bounds.width,
          exteriorGlow.bounds.height,
        ) ?? null
      : null;
    if (glowImageData && exteriorGlow) {
      glowImageData.data.set(exteriorGlow.pixels);
    }
    const coreImageData = coreContext.createImageData(
      coreRaster.bounds.width,
      coreRaster.bounds.height,
    );
    coreImageData.data.set(coreRaster.pixels);
    if (glowContext && glowImageData) {
      glowContext.imageSmoothingEnabled = false;
      glowContext.putImageData(glowImageData, 0, 0);
    }
    coreContext.imageSmoothingEnabled = false;
    coreContext.putImageData(coreImageData, 0, 0);
  }, [
    detailLevel,
    exteriorGlow,
    hasPixels,
    pixelPerfectInk,
    coreRaster,
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
  const rasterBoundsStyle = (
    bounds: { x: number; y: number; width: number; height: number },
  ): CSSProperties => ({
    left: `${(bounds.x / rasterSize) * 100}%`,
    top: `${(bounds.y / rasterSize) * 100}%`,
    width: `${(bounds.width / rasterSize) * 100}%`,
    height: `${(bounds.height / rasterSize) * 100}%`,
  });
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

  return coreRaster ? (
    <span
      className={`${styles.motionPlane} ${depthClassName}${motionClassName}`}
      data-avatar-details-motion-group="true"
      {...sharedPlaneProps}
    >
      {detailLevel !== "audience" && exteriorGlow ? (
        <span
          className={`${styles.emissionPlane} ${styles.glowPlane}`}
          data-avatar-details-emission="glow"
          data-avatar-details-render-detail={detailLevel}
          aria-hidden
        >
          <canvas
            ref={glowCanvasRef}
            width={exteriorGlow.bounds.width}
            height={exteriorGlow.bounds.height}
            className={`${styles.raster} ${styles.croppedRaster} ${styles.glow}`}
            style={rasterBoundsStyle(exteriorGlow.bounds)}
            data-avatar-details-raster="glow"
            aria-hidden
          />
        </span>
      ) : null}
      <span
        className={`${styles.emissionPlane} ${styles.corePlane}`}
        data-avatar-details-emission="core"
        data-avatar-details-render-detail={detailLevel}
        aria-hidden
      >
        <canvas
          ref={coreCanvasRef}
          width={coreRaster.bounds.width}
          height={coreRaster.bounds.height}
          className={`${styles.raster} ${styles.croppedRaster} ${styles.core}`}
          style={rasterBoundsStyle(coreRaster.bounds)}
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
    </span>
  ) : null;
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
