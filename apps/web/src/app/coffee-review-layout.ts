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

function positionAtAngle(angleDeg: number): CoffeeReviewParticipantPosition {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    angleDeg,
    leftPercent:
      REVIEW_CENTER_LEFT_PERCENT + Math.cos(radians) * REVIEW_RADIUS_X_PERCENT,
    topPercent:
      REVIEW_CENTER_TOP_PERCENT + Math.sin(radians) * REVIEW_RADIUS_Y_PERCENT,
  };
}

export function coffeeReviewParticipantLayout(
  rawBotCount: number,
): CoffeeReviewParticipantLayout {
  const botCount = Math.max(0, Math.min(5, Math.floor(rawBotCount)));
  if (botCount === 0) {
    return { player: positionAtAngle(PLAYER_ANGLE_DEG), bots: [] };
  }
  const stepDeg = 360 / (botCount + 1);
  const bots = Array.from({ length: botCount }, (_, index) =>
    positionAtAngle((PLAYER_ANGLE_DEG + stepDeg * (index + 1)) % 360),
  ).sort((left, right) => {
    const verticalDelta = left.topPercent - right.topPercent;
    return Math.abs(verticalDelta) > 0.000_001
      ? verticalDelta
      : left.leftPercent - right.leftPercent;
  });
  return {
    player: positionAtAngle(PLAYER_ANGLE_DEG),
    bots,
  };
}

export function coffeeReviewBotPosition(
  botCount: number,
  layoutIndex: number,
): CoffeeReviewParticipantPosition | null {
  return coffeeReviewParticipantLayout(botCount).bots[layoutIndex] ?? null;
}
