import {
  botcastMessageIsAudibleToAudienceV1,
  type BotcastMessage,
  type BotIdentityMirrorStateV1,
} from "@localai/shared";

export interface SignalResponseCueBot {
  id: string;
  muted?: boolean;
}

export async function boundedSignalReplayFinalization<T>(
  work: Promise<T>,
  timeoutMs = 8_000,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("Signal replay finalization timed out.")),
          Math.max(1, timeoutMs),
        );
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function signalResponseCueBotIsMuted(
  bot: SignalResponseCueBot,
  mirrorStates: ReadonlyMap<string, BotIdentityMirrorStateV1>,
  botsById: ReadonlyMap<string, SignalResponseCueBot>,
  mayBorrowMuteThisTurn = false,
): boolean {
  if (bot.muted || mayBorrowMuteThisTurn) return true;
  const mirrorState = mirrorStates.get(bot.id);
  return Boolean(
    mirrorState && botsById.get(mirrorState.targetBotId)?.muted,
  );
}

export function signalMessageRequestsResponseCue(
  message: Pick<BotcastMessage, "audienceDelivery" | "mutePerformance">,
): boolean {
  return (
    !message.mutePerformance &&
    botcastMessageIsAudibleToAudienceV1(message)
  );
}
