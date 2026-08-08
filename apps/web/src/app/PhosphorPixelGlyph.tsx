"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import styles from "./phosphor-pixel-glyph.module.css";
import {
  PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX,
  PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  PHOSPHOR_FACE_PIXEL_OVERSCAN_CELLS,
  PHOSPHOR_FACE_SUPERSAMPLE_MAX,
  PHOSPHOR_FACE_SUPERSAMPLE_MIN,
  PHOSPHOR_PIXEL_CELL_SIZE_PX,
  phosphorCanvasFontShorthand,
  phosphorTextAlphabeticBaseline,
  samplePhosphorAlphaCells,
  thresholdPhosphorPixelAlpha,
} from "./phosphorPixelRaster";

const phosphorPixelMaskCache = new Map<string, string>();
const PHOSPHOR_PIXEL_MASK_CACHE_LIMIT = 256;

function cachePhosphorPixelMask(key: string, dataUrl: string): void {
  if (phosphorPixelMaskCache.size >= PHOSPHOR_PIXEL_MASK_CACHE_LIMIT) {
    const oldestKey = phosphorPixelMaskCache.keys().next().value;
    if (typeof oldestKey === "string") phosphorPixelMaskCache.delete(oldestKey);
  }
  phosphorPixelMaskCache.set(key, dataUrl);
}

function upscalePhosphorPixelCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): string | null {
  const sourceContext = source.getContext("2d", { alpha: true });
  if (!sourceContext) return null;
  const sourceImage = sourceContext.getImageData(
    0,
    0,
    source.width,
    source.height,
  );
  sourceImage.data.set(thresholdPhosphorPixelAlpha(sourceImage.data));
  sourceContext.putImageData(sourceImage, 0, 0);

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d", { alpha: true });
  if (!outputContext) return null;
  outputContext.imageSmoothingEnabled = false;
  outputContext.clearRect(0, 0, width, height);
  outputContext.drawImage(
    source,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    width,
    height,
  );
  return output.toDataURL("image/png");
}

function rasterizeTextMask(
  node: HTMLSpanElement,
  content: string,
): { dataUrl: string; overscanPx: number } | null {
  const width = Math.max(1, Math.ceil(node.offsetWidth));
  const height = Math.max(1, Math.ceil(node.offsetHeight));
  if (!content || !content.trim() || width <= 1 || height <= 1) return null;

  const computed = window.getComputedStyle(node);
  const configuredCellSize = Number.parseFloat(
    computed.getPropertyValue("--crt-phosphor-pixel-cell-size"),
  );
  const cellSize = Number.isFinite(configuredCellSize)
    ? Math.max(1, configuredCellSize)
    : PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX;
  const overscanPx = Math.ceil(
    cellSize * PHOSPHOR_FACE_PIXEL_OVERSCAN_CELLS,
  );
  const canvasWidth = width + overscanPx * 2;
  const canvasHeight = height + overscanPx * 2;
  const supersampleScale = Math.max(
    PHOSPHOR_FACE_SUPERSAMPLE_MIN,
    Math.min(
      PHOSPHOR_FACE_SUPERSAMPLE_MAX,
      Math.ceil((window.devicePixelRatio || 1) * 2),
    ),
  );
  const sourceWidth = canvasWidth * supersampleScale;
  const sourceHeight = canvasHeight * supersampleScale;
  const font = phosphorCanvasFontShorthand(computed, supersampleScale);
  const letterSpacing = Number.parseFloat(computed.letterSpacing);
  const scaledLetterSpacing = Number.isFinite(letterSpacing)
    ? `${letterSpacing * supersampleScale}px`
    : "0px";
  const strokeWidth = Math.max(
    0,
    Number.parseFloat(
      computed.getPropertyValue("-webkit-text-stroke-width"),
    ) || 0,
  );
  const cacheKey = [
    "text-full-alpha",
    content,
    width,
    height,
    canvasWidth,
    canvasHeight,
    supersampleScale,
    cellSize,
    font,
    scaledLetterSpacing,
    strokeWidth,
    PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  ].join(":");
  const cached = phosphorPixelMaskCache.get(cacheKey);
  if (cached) return { dataUrl: cached, overscanPx };

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const context = sourceCanvas.getContext("2d", { alpha: true });
  if (!context) return null;
  context.clearRect(0, 0, sourceWidth, sourceHeight);
  context.fillStyle = "#ffffff";
  context.font = font;
  const contextWithLetterSpacing = context as CanvasRenderingContext2D & {
    letterSpacing?: string;
  };
  contextWithLetterSpacing.letterSpacing = scaledLetterSpacing;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const metrics = context.measureText(content);
  const scaledHeight = height * supersampleScale;
  const baseline =
    overscanPx * supersampleScale +
    phosphorTextAlphabeticBaseline(scaledHeight, metrics);
  if (strokeWidth > 0) {
    context.lineJoin = "round";
    context.lineWidth = strokeWidth * supersampleScale;
    context.strokeStyle = "#ffffff";
    context.strokeText(content, sourceWidth / 2, baseline);
  }
  context.fillText(content, sourceWidth / 2, baseline);

  const sourceImage = context.getImageData(0, 0, sourceWidth, sourceHeight);
  const sampledAlpha = samplePhosphorAlphaCells(
    sourceImage.data,
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    cellSize,
    PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  );
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvasWidth;
  outputCanvas.height = canvasHeight;
  const outputContext = outputCanvas.getContext("2d", { alpha: true });
  if (!outputContext) return null;
  const outputImage = outputContext.createImageData(canvasWidth, canvasHeight);
  outputImage.data.set(sampledAlpha);
  outputContext.putImageData(outputImage, 0, 0);
  const dataUrl = outputCanvas.toDataURL("image/png");
  if (dataUrl) cachePhosphorPixelMask(cacheKey, dataUrl);
  return dataUrl ? { dataUrl, overscanPx } : null;
}

function assignForwardedRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export const CrtPixelTextGlyph = forwardRef<
  HTMLSpanElement,
  {
    content: string;
    enabled?: boolean;
    "data-custom-eye-pair-side"?: "left" | "right";
  }
>(function CrtPixelTextGlyph(
  {
    content,
    enabled = false,
    "data-custom-eye-pair-side": customEyePairSide,
  },
  forwardedRef,
): React.JSX.Element {
  const localRef = useRef<HTMLSpanElement | null>(null);
  const [renderedMask, setRenderedMask] = useState<{
    content: string;
    url: string;
    overscanPx: number;
  } | null>(null);
  const setRefs = useCallback(
    (node: HTMLSpanElement | null) => {
      localRef.current = node;
      assignForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const node = localRef.current;
    if (!enabled || !node) {
      queueMicrotask(() => setRenderedMask(null));
      return;
    }
    let cancelled = false;
    let frameId: number | null = null;
    const render = (): void => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        const nextMask = rasterizeTextMask(node, content);
        if (!cancelled && nextMask) {
          setRenderedMask((current) =>
            current?.content === content &&
            current.url === nextMask.dataUrl &&
            current.overscanPx === nextMask.overscanPx
              ? current
              : {
                  content,
                  url: nextMask.dataUrl,
                  overscanPx: nextMask.overscanPx,
                },
          );
        }
      });
    };
    render();
    void document.fonts?.ready.then(render);
    const observer = new ResizeObserver(render);
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [content, enabled]);

  const maskUrl =
    renderedMask?.content === content ? renderedMask.url : null;
  const style = maskUrl
    ? ({
        ["--crt-phosphor-pixel-mask" as string]: `url("${maskUrl}")`,
        ["--crt-phosphor-pixel-overscan" as string]:
          `${renderedMask?.overscanPx ?? 0}px`,
      } as CSSProperties)
    : undefined;
  return (
    <span
      ref={setRefs}
      data-crt-glyph-layer="true"
      data-crt-glyph-content={content}
      data-crt-pixel-mask-ready={maskUrl ? "true" : undefined}
      data-custom-eye-pair-side={customEyePairSide}
      style={style}
    >
      {content}
    </span>
  );
});

async function rasterizeSvgMask(
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<string | null> {
  const cellSize = PHOSPHOR_PIXEL_CELL_SIZE_PX;
  const lowWidth = Math.max(1, Math.ceil(width / cellSize));
  const lowHeight = Math.max(1, Math.ceil(height / cellSize));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(lowWidth));
  clone.setAttribute("height", String(lowHeight));
  clone.setAttribute("color", "#ffffff");
  clone.style.color = "#ffffff";
  const markup = new XMLSerializer().serializeToString(clone);
  const cacheKey = ["svg", width, height, lowWidth, lowHeight, markup].join(":");
  const cached = phosphorPixelMaskCache.get(cacheKey);
  if (cached) return cached;

  const sourceUrl = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize bot glyph"));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = lowWidth;
    canvas.height = lowHeight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, lowWidth, lowHeight);
    const dataUrl = upscalePhosphorPixelCanvas(canvas, width, height);
    if (dataUrl) cachePhosphorPixelMask(cacheKey, dataUrl);
    return dataUrl;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function PhosphorPixelSvgGlyph({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = host?.querySelector("svg");
    if (!host || !svg) return;
    let cancelled = false;
    let frameId: number | null = null;
    const render = (): void => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        const width = Math.max(1, Math.ceil(host.offsetWidth));
        const height = Math.max(1, Math.ceil(host.offsetHeight));
        void rasterizeSvgMask(svg, width, height)
          .then((nextRaster) => {
            if (!cancelled) {
              setRasterUrl((current) =>
                current === nextRaster ? current : nextRaster,
              );
            }
          })
          .catch(() => {});
      });
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [children]);

  return (
    <span
      ref={hostRef}
      className={`${styles.svgHost}${className ? ` ${className}` : ""}`}
      data-phosphor-pixel-svg="true"
      data-phosphor-pixel-ready={rasterUrl ? "true" : undefined}
      aria-hidden="true"
    >
      <span className={styles.svgSource}>{children}</span>
      {rasterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.svgRaster} src={rasterUrl} alt="" />
      ) : null}
    </span>
  );
}
