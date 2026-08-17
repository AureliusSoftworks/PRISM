"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  normalizeAccentForTheme,
  normalizeBotIdentityColor,
  type BotAvatarDetailsV1,
  type BotFaceStyle,
  type BotMoodKey,
  type BotVoicePreset,
} from "@localai/shared";

import { AvatarDetailsMask } from "./AvatarDetailsMask";
import { CoffeeSeatPlateEmoji } from "./CoffeeSeatPlateEmoji";
import { avatarDetailsHasVisuals } from "./avatar-details";
import { botAvatarMicroPresentationForSize } from "./avatarRenderedSizeQuality";
import { BOT_AVATAR_CANONICAL_FACE_SCALE_Y } from "./bot-avatar-render-geometry";
import { coffeeSeatPlateGlyph, type CoffeeSeatEmojiMood } from "./coffee-seat-plate";
import type { ZenLiveBotMouthShape } from "./zenLiveMouth";
import styles from "./page.module.css";

/** Micro is a monochrome phosphor fallback: color belongs to its orb only. */
export const BOT_AVATAR_MICRO_PHOSPHOR_COLOR = "#ffffff";

function microAvatarMouthOpen(args: {
  isTalking?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
}): boolean {
  if (args.mouthShape == null) return Boolean(args.isTalking);
  return (
    args.mouthShape === "open-wide" ||
    args.mouthShape === "open-small" ||
    args.mouthShape === "open-round" ||
    args.mouthShape === "at" ||
    args.mouthShape === "click"
  );
}

function microMood(mood: BotMoodKey): CoffeeSeatEmojiMood {
  switch (mood) {
    case "joyful":
      return "happy";
    case "warm":
      return "warm";
    case "guarded":
      return "angry";
    case "strained":
      return "sad";
    case "neutral":
    default:
      return "neutral";
  }
}

/**
 * Shared micro LOD. Micro bots are intentionally inert: no blinking, full
 * viseme animation, cursor attention, chassis motion, phosphor, or
 * independently scheduled work. A live open pose only swaps the mouth to `0`.
 */
export function BotAvatarMicro(props: {
  moodKey?: BotMoodKey;
  placement?: "leading" | "trailing";
  color?: string | null;
  voicePreset?: BotVoicePreset;
  faceStyle?: BotFaceStyle | null;
  /** Micro reduces an open pose (or talking fallback) to one literal `0`. */
  isTalking?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
  avatarDetails?: BotAvatarDetailsV1 | null;
  /** Identity glyph shown alone when the Micro footprint reaches 28px. */
  glyph?: ReactNode;
  renderSizePx?: number;
  scheduleKey?: string;
  className?: string;
}): React.JSX.Element {
  const moodKey = props.moodKey ?? "neutral";
  const placement = props.placement ?? "trailing";
  const plateFace = coffeeSeatPlateGlyph(microMood(moodKey), "closed");
  const color = props.color?.trim();
  const identityColor = normalizeBotIdentityColor(color) ?? "#7c6cff";
  const identityColorDark = normalizeAccentForTheme(identityColor, "dark");
  const identityColorLight = normalizeAccentForTheme(identityColor, "light");
  const hasAvatarDetails = avatarDetailsHasVisuals(props.avatarDetails);
  const presentation = botAvatarMicroPresentationForSize(props.renderSizePx);
  const showMicroFaceFeatures = presentation === "face";
  const showIdentityPixel = presentation === "block" || presentation === "pixel";
  const mouthOpen = microAvatarMouthOpen({
    isTalking: props.isTalking,
    mouthShape: props.mouthShape,
  });
  const renderInk = (
    depth: "behind-face" | "above-face",
  ): React.JSX.Element | null =>
    hasAvatarDetails && showMicroFaceFeatures ? (
      <span
        className={styles.botAvatarMicroInk}
        data-avatar-details-depth={depth}
      >
        <AvatarDetailsMask
          details={props.avatarDetails}
          color={BOT_AVATAR_MICRO_PHOSPHOR_COLOR}
          detailLevel="audience"
          faceGeometry={props.faceStyle}
          blinkPhase="open"
          talking={false}
          speechMotionActive={false}
          mouthShape="closed"
          depth={depth}
          staticRaster
          coreColor="ink"
          rasterSize={36}
        />
      </span>
    ) : null;

  return (
    <span
      className={`${styles.messageMoodBadge} ${props.className ?? ""}`}
      data-mood={moodKey}
      data-placement={placement}
      data-face="coffee"
      data-variant="micro"
      data-avatar-render-tier="micro"
      data-avatar-micro-presentation={presentation}
      data-avatar-details-visuals={
        hasAvatarDetails && showMicroFaceFeatures ? "true" : undefined
      }
      style={
        {
          ...(color ? { ["--coffee-bot-color" as string]: color } : {}),
          ["--bot-avatar-micro-render-size" as string]:
            props.renderSizePx === undefined ? undefined : `${props.renderSizePx}px`,
          ["--bot-avatar-micro-identity-color-dark" as string]: identityColorDark,
          ["--bot-avatar-micro-identity-color-light" as string]: identityColorLight,
          ...(showIdentityPixel
            ? {
                width: presentation === "pixel" ? "1px" : "4px",
                height: presentation === "pixel" ? "1px" : "4px",
              }
            : {}),
          ["--bot-avatar-micro-face-phosphor-color" as string]:
            BOT_AVATAR_MICRO_PHOSPHOR_COLOR,
          ["--coffee-plate-emoji-face-scale-y" as string]:
            BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
          ["--avatar-details-facing-scale-x" as string]: "1",
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {showIdentityPixel ? (
        <span className={styles.botAvatarMicroIdentityPixel} />
      ) : (
        <span
          className={styles.botAvatarMicroScreen}
          data-bot-avatar-micro-screen="true"
        >
          {presentation === "glyph" ? (
            <span className={styles.botAvatarMicroGlyph}>{props.glyph}</span>
          ) : (
            <span className={styles.botAvatarMicroScreenContent}>
              <span className={styles.botAvatarMicroFaceContent}>
                {renderInk("behind-face")}
                <span className={styles.botAvatarMicroFaceRig}>
                  <CoffeeSeatPlateEmoji
                    enabled={false}
                    pixelated
                    hardPixels
                    motionMode="static"
                    isTalking={false}
                    mouthShape="closed"
                    scheduleKey={props.scheduleKey ?? "bot-avatar-micro-static"}
                    showQuestionMark={false}
                    baseText={plateFace.text}
                    rotateDeg={plateFace.rotateDeg}
                    voicePreset={props.voicePreset ?? "neutral"}
                    faceEyesFont={props.faceStyle?.eyesFont}
                    faceEyeCharacter={props.faceStyle?.eyeCharacter}
                    faceMouthFont={props.faceStyle?.mouthFont}
                    faceMouthCharacter={
                      mouthOpen ? "0" : props.faceStyle?.mouthCharacter
                    }
                    faceMouthAnimation={props.faceStyle?.mouthAnimation}
                    faceMouthSpeechPoses={props.faceStyle?.mouthSpeechPoses}
                    faceFontWeight={props.faceStyle?.weight}
                    faceEyeScale={props.faceStyle?.eyeScale}
                    faceEyeOffsetX={props.faceStyle?.eyeOffsetX}
                    faceEyeOffsetY={props.faceStyle?.eyeOffsetY}
                    faceEyeRotationDeg={props.faceStyle?.eyeRotationDeg}
                    faceEyeCount={props.faceStyle?.eyeCount}
                    faceBlinkCount={props.faceStyle?.blinkCount}
                    faceEyeSpacing={props.faceStyle?.eyeSpacing}
                    faceMouthScale={props.faceStyle?.mouthScale}
                    faceMouthOffsetX={props.faceStyle?.mouthOffsetX}
                    faceMouthOffsetY={props.faceStyle?.mouthOffsetY}
                    faceMouthRotationDeg={props.faceStyle?.mouthRotationDeg}
                    faceBlinkBar={props.faceStyle?.blinkBar}
                    faceBlinkScale={props.faceStyle?.blinkScale}
                    faceBlinkOffsetX={props.faceStyle?.blinkOffsetX}
                    faceBlinkOffsetY={props.faceStyle?.blinkOffsetY}
                    faceBlinkRotationDeg={props.faceStyle?.blinkRotationDeg}
                    faceEyeMovement="still"
                    forceBlinkPhase="open"
                    className={`${styles.messageMoodCoffeeFace} ${styles.messageMoodMicroFace}`}
                  />
                </span>
                {renderInk("above-face")}
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
