import {
  botFalseNameChangesV1,
  buildBotFalseNameSeedV1,
  createBotFalseNameStateFromSeedV1,
  normalizeBotFalseNameStateV1,
  type BotFalseNameStateV1,
  type BotFalseNameSurfaceV1,
  type BotPowerFalseNamePoolV1,
} from "@localai/shared";

export function resolveBotFalseNameStateV1(args: {
  surface: BotFalseNameSurfaceV1;
  conversationId: string;
  holderBotId: string;
  holderBotName: string;
  sticky: BotFalseNameStateV1 | null;
  /** When short-term amnesia is active, pass a changing turn token. */
  reshuffleToken?: string | null;
  sourceMessageId: string;
  occurredAt: string;
  pool?: BotPowerFalseNamePoolV1;
}): {
  state: BotFalseNameStateV1;
  justChanged: boolean;
  pending: BotFalseNameStateV1 | null;
} {
  const pool = args.pool ?? "mixed_persona_names";
  const reuseSticky =
    !args.reshuffleToken && args.sticky !== null
      ? normalizeBotFalseNameStateV1(args.sticky)
      : null;
  if (
    reuseSticky &&
    (reuseSticky.pool ?? "mixed_persona_names") === pool
  ) {
    return { state: reuseSticky, justChanged: false, pending: null };
  }
  const next = createBotFalseNameStateFromSeedV1({
    surface: args.surface,
    holderBotId: args.holderBotId,
    holderBotName: args.holderBotName,
    pool,
    seed: buildBotFalseNameSeedV1({
      conversationId: args.conversationId,
      holderBotId: args.holderBotId,
      reshuffleToken: args.reshuffleToken,
      pool,
    }),
    sourceMessageId: args.sourceMessageId,
    occurredAt: args.occurredAt,
  });
  const justChanged =
    botFalseNameChangesV1(args.sticky, next.believedName) ||
    Boolean(args.reshuffleToken) ||
    !args.sticky;
  return {
    state: next,
    justChanged,
    pending: justChanged ? next : null,
  };
}
