"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  DEBATE_FORUM_ACCENT_KEY_SOURCE,
  normalizedDebateForumAccentColor,
  renderDebateForumAccentPixels,
} from "./debateForumAccentKeys";
import styles from "./DebateExperience.module.css";

interface ForumAccentKeyRaster {
  height: number;
  pixels: Uint8ClampedArray;
  width: number;
}

const forumAccentKeyRasterCache = new Map<
  string,
  Promise<ForumAccentKeyRaster>
>();

function loadForumAccentKeyRaster(source: string): Promise<ForumAccentKeyRaster> {
  const cached = forumAccentKeyRasterCache.get(source);
  if (cached) return cached;
  const pending = new Promise<ForumAccentKeyRaster>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => reject(new Error(`Unable to load Forum accent keys: ${source}`));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Unable to prepare the Forum accent-key canvas."));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve({
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
      });
    };
    image.src = source;
  });
  forumAccentKeyRasterCache.set(source, pending);
  return pending;
}

function paintForumAccentKeys(
  canvas: HTMLCanvasElement,
  raster: ForumAccentKeyRaster,
  colors: { against: string; for: string; moderator: string },
): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const imageData = context.createImageData(raster.width, raster.height);
  imageData.data.set(renderDebateForumAccentPixels(raster.pixels, colors));
  context.putImageData(imageData, 0, 0);
}

export function DebateForumAccentKeys(props: {
  againstColor: unknown;
  className?: string;
  depth: keyof typeof DEBATE_FORUM_ACCENT_KEY_SOURCE;
  fallback?: boolean;
  forColor: unknown;
  moderatorColor: unknown;
  source?: string;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const source = props.source ?? DEBATE_FORUM_ACCENT_KEY_SOURCE[props.depth];
  const forColor = normalizedDebateForumAccentColor(props.forColor, "for");
  const moderatorColor = normalizedDebateForumAccentColor(
    props.moderatorColor,
    "moderator",
  );
  const againstColor = normalizedDebateForumAccentColor(
    props.againstColor,
    "against",
  );
  const paintKey = `${source}|${forColor}|${moderatorColor}|${againstColor}`;

  useEffect(() => {
    let cancelled = false;
    void loadForumAccentKeyRaster(source)
      .then((raster) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        paintForumAccentKeys(canvas, raster, {
          for: forColor,
          moderator: moderatorColor,
          against: againstColor,
        });
        setReadyKey(paintKey);
      })
      .catch(() => {
        if (!cancelled) setReadyKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [againstColor, forColor, moderatorColor, paintKey, source]);

  const foregroundFallbackClass =
    props.depth === "foreground" ? ` ${styles.lightMaskForeground}` : "";
  return (
    <div
      className={`${styles.forumAccentKeyStack}${props.className ? ` ${props.className}` : ""}`}
      data-depth={props.depth}
      data-ready={readyKey === paintKey ? "true" : "false"}
      data-source={source}
      style={
        {
          "--debate-for-color": forColor,
          "--debate-moderator-color": moderatorColor,
          "--debate-against-color": againstColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className={styles.forumAccentKeyLayer}
        data-role="all"
      />
      {props.fallback === false ? null : (
        <span className={styles.forumAccentKeyFallback}>
          <span
            className={`${styles.lightMaskFor}${foregroundFallbackClass}`}
          />
          <span
            className={`${styles.lightMaskModerator}${foregroundFallbackClass}`}
          />
          <span
            className={`${styles.lightMaskAgainst}${foregroundFallbackClass}`}
          />
        </span>
      )}
    </div>
  );
}
