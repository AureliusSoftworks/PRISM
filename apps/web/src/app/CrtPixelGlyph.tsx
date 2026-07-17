"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type Ref,
} from "react";

import {
  crtPixelGridDimension,
  quantizeCrtGlyphAlpha,
} from "./crt-pixel-glyph";

const CRT_GLYPH_MASK_CACHE_LIMIT = 256;
const crtGlyphMaskCache = new Map<string, string>();

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function elementScaleWithin(
  element: HTMLElement,
  boundary: HTMLElement,
): { x: number; y: number } {
  let scaleX = 1;
  let scaleY = 1;
  for (
    let current: HTMLElement | null = element;
    current && current !== boundary;
    current = current.parentElement
  ) {
    const transform = window.getComputedStyle(current).transform;
    if (!transform || transform === "none") continue;
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      scaleX *= Math.hypot(matrix.a, matrix.b);
      scaleY *= Math.hypot(matrix.c, matrix.d);
    } catch {
      // A malformed or unsupported transform should not prevent the glyph
      // from using the unscaled 128x128 screen grid.
    }
  }
  return {
    x: Math.max(0.01, scaleX),
    y: Math.max(0.01, scaleY),
  };
}

function cacheCrtGlyphMask(key: string, dataUrl: string): void {
  if (crtGlyphMaskCache.size >= CRT_GLYPH_MASK_CACHE_LIMIT) {
    const oldestKey = crtGlyphMaskCache.keys().next().value;
    if (oldestKey) crtGlyphMaskCache.delete(oldestKey);
  }
  crtGlyphMaskCache.set(key, dataUrl);
}

function renderCrtGlyphMask(
  element: HTMLSpanElement,
  glyph: string,
  pixelGridSize: number,
): string | null {
  const screen = element.closest<HTMLElement>("[data-crt-profile]");
  if (!screen) return null;
  const elementWidth = element.offsetWidth;
  const elementHeight = element.offsetHeight;
  const screenWidth = screen.offsetWidth;
  const screenHeight = screen.offsetHeight;
  if (
    elementWidth <= 0 ||
    elementHeight <= 0 ||
    screenWidth <= 0 ||
    screenHeight <= 0
  ) {
    return null;
  }

  const computed = window.getComputedStyle(element);
  const fontSize = Number.parseFloat(computed.fontSize);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;
  const scale = elementScaleWithin(element, screen);
  const sourceWidth = crtPixelGridDimension(
    elementWidth * scale.x,
    screenWidth,
    pixelGridSize,
  );
  const sourceHeight = crtPixelGridDimension(
    elementHeight * scale.y,
    screenHeight,
    pixelGridSize,
  );
  const sourceFontSize = Math.max(
    1,
    (fontSize * scale.y * pixelGridSize) / screenHeight,
  );
  const cacheKey = [
    glyph,
    pixelGridSize,
    elementWidth,
    elementHeight,
    screenWidth,
    screenHeight,
    scale.x.toFixed(3),
    scale.y.toFixed(3),
    computed.fontStyle,
    computed.fontVariant,
    computed.fontWeight,
    computed.fontFamily,
    sourceFontSize.toFixed(3),
  ].join("|");
  const cached = crtGlyphMaskCache.get(cacheKey);
  if (cached) return cached;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
  if (!sourceContext) return null;
  sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
  sourceContext.font = [
    computed.fontStyle,
    computed.fontVariant,
    computed.fontWeight,
    `${sourceFontSize}px`,
    computed.fontFamily,
  ].join(" ");
  sourceContext.textAlign = "left";
  sourceContext.textBaseline = "alphabetic";
  sourceContext.fillStyle = "#ffffff";
  sourceContext.strokeStyle = "#ffffff";
  sourceContext.lineJoin = "round";
  sourceContext.lineWidth = Math.max(0.18, sourceFontSize * 0.024);
  const metrics = sourceContext.measureText(glyph);
  const inkWidth =
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight ||
    metrics.width;
  const inkHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||
    sourceFontSize;
  const drawX = (sourceWidth - inkWidth) / 2 + metrics.actualBoundingBoxLeft;
  const drawY =
    (sourceHeight - inkHeight) / 2 + metrics.actualBoundingBoxAscent;
  sourceContext.strokeText(glyph, drawX, drawY);
  sourceContext.fillText(glyph, drawX, drawY);

  const sourcePixels = sourceContext.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  sourcePixels.data.set(quantizeCrtGlyphAlpha(sourcePixels.data));
  sourceContext.putImageData(sourcePixels, 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = elementWidth;
  outputCanvas.height = elementHeight;
  const outputContext = outputCanvas.getContext("2d", { alpha: true });
  if (!outputContext) return null;
  outputContext.imageSmoothingEnabled = false;
  outputContext.clearRect(0, 0, elementWidth, elementHeight);
  outputContext.drawImage(
    sourceCanvas,
    0,
    0,
    sourceWidth,
    sourceHeight,
    0,
    0,
    elementWidth,
    elementHeight,
  );
  const dataUrl = outputCanvas.toDataURL("image/png");
  cacheCrtGlyphMask(cacheKey, dataUrl);
  return dataUrl;
}

export const CrtPixelGlyph = forwardRef<
  HTMLSpanElement,
  { glyph: string; pixelGridSize?: number | null }
>(function CrtPixelGlyph({ glyph, pixelGridSize }, forwardedRef) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const setElementRef = useCallback(
    (element: HTMLSpanElement | null) => {
      elementRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !pixelGridSize || pixelGridSize <= 0) return;
    const screen = element.closest<HTMLElement>("[data-crt-profile]");
    if (!screen) return;
    let cancelled = false;
    let frameId = 0;
    const render = () => {
      if (cancelled) return;
      const dataUrl = renderCrtGlyphMask(element, glyph, pixelGridSize);
      if (!dataUrl) return;
      element.style.setProperty(
        "--crt-glyph-pixel-mask-image",
        `url("${dataUrl}")`,
      );
      element.dataset.crtGlyphPixelReady = "true";
    };
    const schedule = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(render);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(element);
    resizeObserver.observe(screen);
    schedule();
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      delete element.dataset.crtGlyphPixelReady;
      element.style.removeProperty("--crt-glyph-pixel-mask-image");
    };
  }, [glyph, pixelGridSize]);

  const pixelated = Boolean(pixelGridSize && pixelGridSize > 0);
  return (
    <span
      ref={setElementRef}
      data-crt-glyph-layer="true"
      data-crt-glyph-content={glyph}
      data-crt-glyph-pixel-grid={pixelated ? pixelGridSize : undefined}
    >
      {glyph}
      {pixelated ? (
        <>
          <span data-crt-pixel-emission="halo">
            <span data-crt-pixel-shape="true" />
          </span>
          <span data-crt-pixel-emission="red-convergence">
            <span data-crt-pixel-shape="true" />
          </span>
          <span data-crt-pixel-emission="blue-convergence">
            <span data-crt-pixel-shape="true" />
          </span>
          <span data-crt-pixel-emission="core">
            <span data-crt-pixel-shape="true" />
          </span>
        </>
      ) : null}
    </span>
  );
});
