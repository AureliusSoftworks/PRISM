"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import {
  DEBATE_FORUM_ACCENT_KEY_SOURCE,
  normalizedDebateForumAccentColor,
  renderDebateForumAccentPixels,
} from "./debateForumAccentKeys";
import styles from "./DebateExperience.module.css";

const FORUM_MASK_WIDTH = 1672;
const FORUM_MASK_HEIGHT = 941;
const sourceCache = new Map<string, Promise<ImageData>>();

function loadForumAccentSource(source: string): Promise<ImageData> {
  const cached = sourceCache.get(source);
  if (cached) return cached;
  const pending = new Promise<ImageData>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        if (
          image.naturalWidth !== FORUM_MASK_WIDTH ||
          image.naturalHeight !== FORUM_MASK_HEIGHT
        ) {
          throw new Error("Forum accent mask dimensions do not match the room.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = FORUM_MASK_WIDTH;
        canvas.height = FORUM_MASK_HEIGHT;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Forum accent mask canvas is unavailable.");
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Forum accent mask failed to load."));
    image.src = source;
  });
  sourceCache.set(source, pending);
  void pending.catch(() => {
    if (sourceCache.get(source) === pending) sourceCache.delete(source);
  });
  return pending;
}

/**
 * Recolor the installed room/podium masks before displaying them. The decoded
 * sources are shared across previews and playback, never shown as raw RGB keys.
 */
export function DebateForumAccentKeys(props: {
  againstColor: unknown;
  className?: string;
  depth: "backdrop" | "foreground";
  fallback?: boolean;
  forColor: unknown;
  moderatorColor: unknown;
  source?: string;
}): React.JSX.Element {
  const forColor = normalizedDebateForumAccentColor(props.forColor, "for");
  const moderatorColor = normalizedDebateForumAccentColor(
    props.moderatorColor,
    "moderator",
  );
  const againstColor = normalizedDebateForumAccentColor(
    props.againstColor,
    "against",
  );
  const source = props.source ?? DEBATE_FORUM_ACCENT_KEY_SOURCE[props.depth];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const foregroundFallbackClass =
    props.depth === "foreground" ? ` ${styles.lightMaskForeground}` : "";

  useLayoutEffect(() => {
    let cancelled = false;
    const stack = stackRef.current;
    const canvas = canvasRef.current;
    if (!stack || !canvas) return;
    stack.dataset.ready = "false";
    stack.dataset.state = "loading";
    void loadForumAccentSource(source)
      .then((pixels) => {
        if (cancelled) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Forum accent canvas is unavailable.");
        const tinted = context.createImageData(pixels.width, pixels.height);
        tinted.data.set(
          renderDebateForumAccentPixels(pixels.data, {
            for: forColor,
            moderator: moderatorColor,
            against: againstColor,
          }),
        );
        context.putImageData(tinted, 0, 0);
        stack.dataset.ready = "true";
        stack.dataset.state = "ready";
      })
      .catch(() => {
        if (!cancelled) stack.dataset.state = "error";
      });
    return () => {
      cancelled = true;
    };
  }, [source, forColor, moderatorColor, againstColor]);

  return (
    <div
      ref={stackRef}
      className={`${styles.forumAccentKeyStack}${props.className ? ` ${props.className}` : ""}`}
      data-depth={props.depth}
      data-ready="false"
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
        className={styles.forumAccentRaster}
        width={FORUM_MASK_WIDTH}
        height={FORUM_MASK_HEIGHT}
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
