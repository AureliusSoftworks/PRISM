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
  avatarDetailsPhosphorCoreRgba,
  normalizeAvatarDetails,
  normalizeAvatarDetailsColor,
  normalizeAvatarDetailsFaceGeometry,
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
  /** Overrides the authored idle-rest Speech layer without affecting Blink/Effect ink. */
  speechInkVisible?: boolean;
  speechMotionActive?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
  depth?: Exclude<AvatarDetailsFaceDepth, "all">;
  staticRaster?: boolean;
  coreColor?: "phosphor" | "ink";
  rasterSize?: number;
  /** Uses hard source-cell expansion while retaining the normal phosphor glow. */
  crispPresentation?: boolean;
  /** Hard nearest-neighbor cells; used when the Studio pixel grid is visible. */
  pixelPerfectInk?: boolean;
}

type AvatarDetailsSpeechMotion = Exclude<
  BotAvatarDetailsSpeechInkAnimation,
  "none"
>;

// This is only the no-ink sentinel. It lets the component retain a stable hook
// order while avoiding a 128 x 128 RGBA allocation for the common no-details
// case. It is never rendered because `hasVisuals` returns before the planes.
const EMPTY_AVATAR_DETAILS_RGBA = new Uint8ClampedArray(0);

function avatarDetailsMaskFaceGeometry(
  eyeScale: number | undefined,
  eyeOffsetX: number | undefined,
  eyeOffsetY: number | undefined,
  mouthScale: number | undefined,
  mouthOffsetX: number | undefined,
  mouthOffsetY: number | undefined,
  mouthRotationDeg: number | undefined,
): AvatarDetailsFaceGeometry {
  return normalizeAvatarDetailsFaceGeometry({
    eyeScale,
    eyeOffsetX,
    eyeOffsetY,
    mouthScale,
    mouthOffsetX,
    mouthOffsetY,
    mouthRotationDeg,
  });
}

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
  crispPresentation?: boolean;
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
  crispPresentation = false,
  pixelPerfectInk = false,
}: AvatarDetailsEmissionPlanesProps): React.JSX.Element | null {
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [staticRasterUrl, setStaticRasterUrl] = useState<string | null>(null);
  const resampleMode =
    pixelPerfectInk || crispPresentation ? "nearest" : "coverage";
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
        data-avatar-details-resampling={resampleMode}
        data-avatar-details-depth={depth}
        data-avatar-details-ink-role={inkRole}
        data-avatar-details-render-detail={detailLevel}
        aria-hidden
      />
    ) : null;
  }

  return coreRaster ? (
    <>
      {detailLevel !== "audience" && exteriorGlow ? (
        <span
          className={`${styles.motionPlane} ${styles.lightPlane}${motionClassName}`}
          data-avatar-details-motion-group="true"
          {...sharedPlaneProps}
        >
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
        </span>
      ) : null}
      <span
        className={`${styles.motionPlane} ${depthClassName}${motionClassName}`}
        data-avatar-details-motion-group="true"
        {...sharedPlaneProps}
      >
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
              pixelPerfectInk ||
              crispPresentation ||
              rasterSize === AVATAR_DETAILS_CANVAS_SIZE
                ? "nearest-neighbor"
                : "coverage-sampled"
            }
            data-avatar-details-resampling={resampleMode}
            data-avatar-details-mask-size={rasterSize}
            aria-hidden
          />
        </span>
      </span>
    </>
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
  speechInkVisible,
  speechMotionActive = talking,
  mouthShape = null,
  depth = "above-face",
  staticRaster = false,
  coreColor = "phosphor",
  rasterSize = AVATAR_DETAILS_CANVAS_SIZE,
  crispPresentation = false,
  pixelPerfectInk = false,
}: AvatarDetailsMaskProps): React.JSX.Element | null {
  const normalizedRasterSize = Number.isFinite(rasterSize)
    ? Math.max(1, Math.floor(rasterSize))
    : AVATAR_DETAILS_CANVAS_SIZE;
  const normalizedDetails = useMemo(
    () => normalizeAvatarDetails(details),
    [details],
  );
  const hasVisuals =
    normalizedDetails.screen.stamps.length > 0 ||
    normalizedDetails.screen.paintMaskBase64 !== null ||
    Boolean(normalizedDetails.screen.paintColorMapBase64);
  // Live seats can reconstruct their complete face style on pose changes.
  // Memoize from only the normalized geometry primitives that ink uses, not
  // the containing style object's identity. Reading the raw values on every
  // render keeps mutable Studio authoring responsive without a stale cache.
  const faceGeometryEyeScale = faceGeometry?.eyeScale;
  const faceGeometryEyeOffsetX = faceGeometry?.eyeOffsetX;
  const faceGeometryEyeOffsetY = faceGeometry?.eyeOffsetY;
  const faceGeometryMouthScale = faceGeometry?.mouthScale;
  const faceGeometryMouthOffsetX = faceGeometry?.mouthOffsetX;
  const faceGeometryMouthOffsetY = faceGeometry?.mouthOffsetY;
  const faceGeometryMouthRotationDeg = faceGeometry?.mouthRotationDeg;
  const normalizedFaceGeometry = useMemo(
    () =>
      avatarDetailsMaskFaceGeometry(
        faceGeometryEyeScale,
        faceGeometryEyeOffsetX,
        faceGeometryEyeOffsetY,
        faceGeometryMouthScale,
        faceGeometryMouthOffsetX,
        faceGeometryMouthOffsetY,
        faceGeometryMouthRotationDeg,
      ),
    [
      faceGeometryEyeScale,
      faceGeometryEyeOffsetX,
      faceGeometryEyeOffsetY,
      faceGeometryMouthScale,
      faceGeometryMouthOffsetX,
      faceGeometryMouthOffsetY,
      faceGeometryMouthRotationDeg,
    ],
  );
  const normalizedColor = useMemo(
    () => normalizeAvatarDetailsColor(color),
    [color],
  );
  const speechInkAnimation =
    normalizedDetails.screen.speechInkAnimation ?? "none";
  // A surface may hide the authored idle-rest Speech layer for a whole performance
  // (`speechInkVisible === false`); that override never cancels the authored animation.
  // While the bot talks, animated Speech ink renders in its own plane regardless.
  const speechMotion: AvatarDetailsSpeechMotion | null =
    detailLevel === "full" &&
    talking &&
    speechMotionActive &&
    speechInkAnimation !== "none"
      ? speechInkAnimation
      : null;
  const visiblePixels = useMemo(
    () =>
      hasVisuals
        ? rasterizeVisibleAvatarDetailsRgba(
            normalizedDetails,
            normalizedColor,
            normalizedFaceGeometry,
            {
              blinking: blinkPhase === "closed",
              talking,
              // Animated Speech ink renders in its own emission plane. An
              // explicit surface override can also keep the authored idle-rest
              // layer hidden until a performance has fully completed.
              speechInkVisible: speechMotion ? false : speechInkVisible,
            },
            depth,
          )
        : EMPTY_AVATAR_DETAILS_RGBA,
    [
      blinkPhase,
      depth,
      hasVisuals,
      normalizedColor,
      normalizedDetails,
      normalizedFaceGeometry,
      speechInkVisible,
      speechMotion,
      talking,
    ],
  );
  const speechPixels = useMemo(
    () =>
      hasVisuals && speechMotion
        ? rasterizeAvatarDetailsRgba(
            normalizedDetails,
            normalizedColor,
            normalizedFaceGeometry,
            "talking",
            depth,
          )
        : null,
    [
      depth,
      hasVisuals,
      normalizedColor,
      normalizedDetails,
      normalizedFaceGeometry,
      speechMotion,
    ],
  );
  const speechMotionOrigin = useMemo(() => {
    if (!hasVisuals || !speechMotion) return null;
    // Use the complete authored Speech item for both depth slices so ink that
    // crosses the mouth seam cannot tear into two independently moving parts.
    const completeSpeechPixels = rasterizeAvatarDetailsRgba(
      normalizedDetails,
      normalizedColor,
      normalizedFaceGeometry,
      "talking",
      "all",
    );
    return avatarDetailsSpeechMotionOrigin(completeSpeechPixels);
  }, [
    hasVisuals,
    normalizedColor,
    normalizedDetails,
    normalizedFaceGeometry,
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
        crispPresentation={crispPresentation}
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
          crispPresentation={crispPresentation}
          pixelPerfectInk={pixelPerfectInk}
        />
      ) : null}
    </>
  );
}
