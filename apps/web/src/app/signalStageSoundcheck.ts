import type { BotcastMessage } from "@localai/shared";

export const SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX =
  "signal-stage-soundcheck:";

const SIGNAL_STAGE_SOUNDCHECK_EXCHANGES = [
  {
    host: (guest: string) =>
      `${guest}, give me a quick level check. How does the room feel from your chair?`,
    guest: (host: string) =>
      `Clear and comfortable, ${host}. I can hear you sitting just above the room.`,
  },
  {
    host: (guest: string) =>
      `${guest}, let’s hear how these two voices share the space.`,
    guest: (host: string) =>
      `Right here with you, ${host}. The studio feels balanced from my side.`,
  },
  {
    host: (guest: string) =>
      `Quick sound check, ${guest}. Tell me what you’re hearing.`,
    guest: (host: string) =>
      `Your voice is clear, ${host}. The room tone is tucked in underneath us.`,
  },
  {
    host: (guest: string) =>
      `${guest}, one line for the room before we go live.`,
    guest: (host: string) =>
      `Levels feel good, ${host}. I’m ready when you are.`,
  },
] as const;

export function signalStageSoundcheckExchangeIndex(
  randomUnit: number = Math.random(),
): number {
  const normalized = Number.isFinite(randomUnit)
    ? Math.max(0, Math.min(0.999999999, randomUnit))
    : 0;
  return Math.floor(normalized * SIGNAL_STAGE_SOUNDCHECK_EXCHANGES.length);
}

export function signalStageSoundcheckMessages(args: {
  showId: string;
  hostBotId: string;
  hostName: string;
  guestBotId: string;
  guestName: string;
  runId: number;
  exchangeIndex?: number;
  createdAt?: string;
}): readonly [BotcastMessage, BotcastMessage] {
  const rawIndex = args.exchangeIndex ?? signalStageSoundcheckExchangeIndex();
  const exchange =
    SIGNAL_STAGE_SOUNDCHECK_EXCHANGES[
      Math.abs(Math.floor(rawIndex)) % SIGNAL_STAGE_SOUNDCHECK_EXCHANGES.length
    ] ?? SIGNAL_STAGE_SOUNDCHECK_EXCHANGES[0];
  const createdAt = args.createdAt ?? new Date().toISOString();
  const episodeId = `${SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX}${args.showId}:${args.runId}`;
  const message = (
    speakerRole: "host" | "guest",
    botId: string,
    content: string,
  ): BotcastMessage => ({
    id: `${episodeId}:${speakerRole}`,
    episodeId,
    speakerRole,
    botId,
    content,
    stageActionText: null,
    voicePerformanceText: null,
    moodKey: "neutral",
    createdAt,
  });
  return [
    message("host", args.hostBotId, exchange.host(args.guestName)),
    message("guest", args.guestBotId, exchange.guest(args.hostName)),
  ];
}

export function signalStageSoundcheckMessageIsEphemeral(
  message: Pick<BotcastMessage, "id" | "episodeId">,
): boolean {
  return (
    message.id.startsWith(SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX) &&
    message.episodeId.startsWith(SIGNAL_STAGE_SOUNDCHECK_MESSAGE_PREFIX)
  );
}
