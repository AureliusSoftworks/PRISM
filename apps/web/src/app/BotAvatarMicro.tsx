"use client";

import type { CSSProperties } from "react";
import type { BotAvatarDetailsV1, BotFaceStyle, BotMoodKey } from "@localai/shared";

import { AvatarDetailsMask } from "./AvatarDetailsMask";
import { CoffeeSeatPlateEmoji } from "./CoffeeSeatPlateEmoji";
import { avatarDetailsHasVisuals } from "./avatar-details";
import { BOT_AVATAR_CANONICAL_FACE_SCALE_Y } from "./bot-avatar-render-geometry";
import { coffeeSeatPlateGlyph, type CoffeeSeatEmojiMood } from "./coffee-seat-plate";
import styles from "./page.module.css";

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
 * Shared micro LOD. Micro bots are intentionally inert: no blinking, talking,
 * cursor attention, chassis motion, phosphor, or independently scheduled work.
 */
export function BotAvatarMicro(props: {
  moodKey?: BotMoodKey;
  placement?: "leading" | "trailing";
  color?: string | null;
  faceStyle?: BotFaceStyle | null;
  avatarDetails?: BotAvatarDetailsV1 | null;
  className?: string;
}): React.JSX.Element {
  const moodKey = props.moodKey ?? "neutral";
  const placement = props.placement ?? "trailing";
  const plateFace = coffeeSeatPlateGlyph(microMood(moodKey), "closed");
  const color = props.color?.trim();
  const hasAvatarDetails = avatarDetailsHasVisuals(props.avatarDetails);
  const renderInk = (
    depth: "behind-face" | "above-face",
  ): React.JSX.Element | null =>
    hasAvatarDetails ? (
      <span
        className={styles.botAvatarMicroInk}
        data-avatar-details-depth={depth}
      >
        <AvatarDetailsMask
          details={props.avatarDetails}
          color={color}
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
      data-avatar-details-visuals={hasAvatarDetails ? "true" : undefined}
      style={
        {
          ...(color ? { ["--coffee-bot-color" as string]: color } : {}),
          ["--coffee-plate-emoji-face-scale-y" as string]:
            BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
          ["--avatar-details-facing-scale-x" as string]: "1",
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span
        className={styles.botAvatarMicroScreen}
        data-bot-avatar-micro-screen="true"
      >
        <span className={styles.botAvatarMicroScreenContent}>
          {renderInk("behind-face")}
          <span className={styles.botAvatarMicroFaceRig}>
            <CoffeeSeatPlateEmoji
              enabled={false}
              pixelated
              hardPixels
              motionMode="static"
              isTalking={false}
              mouthShape="closed"
              scheduleKey="bot-avatar-micro-static"
              showQuestionMark={false}
              baseText={plateFace.text}
              rotateDeg={plateFace.rotateDeg}
              voicePreset="neutral"
              faceEyesFont={props.faceStyle?.eyesFont}
              faceEyeCharacter={props.faceStyle?.eyeCharacter}
              faceMouthFont={props.faceStyle?.mouthFont}
              faceMouthCharacter={props.faceStyle?.mouthCharacter}
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
    </span>
  );
}
