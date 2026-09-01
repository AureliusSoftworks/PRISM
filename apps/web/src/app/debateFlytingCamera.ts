export type FlytingAutoCameraView = "wide" | "left" | "moderator" | "right";

/**
 * Auto camera is driven by audible delivery, not the next holder of the
 * floor. Between lines the whole Mead Hall is the subject.
 */
export function flytingAutoCameraView(
  speakerBotId: string | null,
  bots: {
    forBotId: string;
    againstBotId: string;
    moderatorBotId: string;
  },
): FlytingAutoCameraView {
  if (speakerBotId === bots.forBotId) return "left";
  if (speakerBotId === bots.againstBotId) return "right";
  if (speakerBotId === bots.moderatorBotId) return "moderator";
  return "wide";
}
