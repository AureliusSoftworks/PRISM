export interface CoffeeReviewParticipantPosition {
  angleDeg: number;
  leftPercent: number;
  topPercent: number;
}

export interface CoffeeReviewParticipantLayout {
  player: CoffeeReviewParticipantPosition;
  bots: CoffeeReviewParticipantPosition[];
}

const PLAYER_ANGLE_DEG = 90;
const REVIEW_CENTER_LEFT_PERCENT = 50;
const REVIEW_CENTER_TOP_PERCENT = 50;
const REVIEW_RADIUS_X_PERCENT = 34;
const REVIEW_RADIUS_Y_PERCENT = 38;
// The full ellipse is tuned for a six-seat table. Smaller parties contract
// toward the table so a duo is not parked at the stage edges (Coffee review
// 8e012a9d: "Left and right could be closer to the table").
const REVIEW_MIN_RING_SCALE = 0.62;
const REVIEW_RING_SCALE_STEP = 0.095;

function ringScaleForParticipants(participantCount: number): number {
  return Math.min(
    1,
    Math.max(
      REVIEW_MIN_RING_SCALE,
      REVIEW_MIN_RING_SCALE + REVIEW_RING_SCALE_STEP * (participantCount - 2),
    ),
  );
}

function positionAtAngle(
  angleDeg: number,
  ringScale: number,
): CoffeeReviewParticipantPosition {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    angleDeg,
    leftPercent:
      REVIEW_CENTER_LEFT_PERCENT +
      Math.cos(radians) * REVIEW_RADIUS_X_PERCENT * ringScale,
    topPercent:
      REVIEW_CENTER_TOP_PERCENT +
      Math.sin(radians) * REVIEW_RADIUS_Y_PERCENT * ringScale,
  };
}

export function coffeeReviewParticipantLayout(
  rawBotCount: number,
): CoffeeReviewParticipantLayout {
  const botCount = Math.max(0, Math.min(5, Math.floor(rawBotCount)));
  const ringScale = ringScaleForParticipants(botCount + 1);
  if (botCount === 0) {
    return { player: positionAtAngle(PLAYER_ANGLE_DEG, ringScale), bots: [] };
  }
  const stepDeg = 360 / (botCount + 1);
  const bots = Array.from({ length: botCount }, (_, index) =>
    positionAtAngle((PLAYER_ANGLE_DEG + stepDeg * (index + 1)) % 360, ringScale),
  ).sort((left, right) => {
    const verticalDelta = left.topPercent - right.topPercent;
    return Math.abs(verticalDelta) > 0.000_001
      ? verticalDelta
      : left.leftPercent - right.leftPercent;
  });
  return {
    player: positionAtAngle(PLAYER_ANGLE_DEG, ringScale),
    bots,
  };
}

export function coffeeReviewBotPosition(
  botCount: number,
  layoutIndex: number,
): CoffeeReviewParticipantPosition | null {
  return coffeeReviewParticipantLayout(botCount).bots[layoutIndex] ?? null;
}

/**
 * Live stages park the composer along the bottom edge, so the player's seat
 * rises off the pure review circle just far enough to clear it. Replay keeps
 * the untouched circle — there is no composer over the review stage.
 * 72 over-pulled the player toward the table (review 8e012a9d: "I'm too close
 * to the table"); 76 clears the composer while keeping the player on the ring.
 */
export const COFFEE_LIVE_PLAYER_SEAT_MAX_TOP_PERCENT = 76;

export function coffeeLivePlayerSeatPosition(
  layout: CoffeeReviewParticipantLayout,
): CoffeeReviewParticipantPosition {
  return {
    ...layout.player,
    topPercent: Math.min(
      layout.player.topPercent,
      COFFEE_LIVE_PLAYER_SEAT_MAX_TOP_PERCENT,
    ),
  };
}
