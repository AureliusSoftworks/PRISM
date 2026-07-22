import {
  botcastMessageIsAudibleToAudienceV1,
  botcastSnapshotPowersForRoleV1,
  botPowerResponseIsSilentV1,
  voiceSpokenText,
  type BotcastEpisode,
  type BotcastShow,
  type BotAvatarDetailsV1,
  type BotFaceStyle,
  type BotVoicePreset,
  type ReplayEventV1,
  type ReplayManifestV1,
  type ReplayParticipantSnapshotV1,
  type ReplayUtteranceV1,
} from "@localai/shared";

export interface SignalReplayBotVisualSnapshotV1 {
  v: 1;
  faceStyle: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  voicePreset: BotVoicePreset;
  screenMaterialSeed: string;
  frameMaterialSeed: string;
}

export interface ReplayBotSnapshotInput {
  id: string;
  name: string;
  color?: string | null;
  glyph?: string | null;
  replayVisualSnapshot?: SignalReplayBotVisualSnapshotV1 | null;
}

export function buildSignalReplayManifestV1(args: {
  episode: BotcastEpisode;
  show: BotcastShow;
  bots: readonly ReplayBotSnapshotInput[];
  producerName: string;
  theme: "light" | "dark";
}): ReplayManifestV1 {
  const botsById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const host = botsById.get(args.episode.hostBotId);
  const guest = botsById.get(args.episode.guestBotId);
  const guestIsProducer = args.episode.guestKind === "producer";
  const participants: ReplayParticipantSnapshotV1[] = [
    {
      id: args.episode.hostBotId,
      name: host?.name ?? "Host",
      kind: "bot",
      role: "host",
      color: host?.color ?? args.show.accentColor,
      glyph: host?.glyph ?? null,
      seatIndex: 0,
      visible: true,
      metadata: {
        powers: botcastSnapshotPowersForRoleV1(args.episode, "host") ?? [],
        visualSnapshot: host?.replayVisualSnapshot ?? null,
      },
    },
    {
      id: guestIsProducer ? "prism-player" : args.episode.guestBotId,
      name: guestIsProducer
        ? args.episode.guestName || args.producerName
        : guest?.name ?? "Guest",
      kind: guestIsProducer ? "player" : "bot",
      role: "guest",
      color: guestIsProducer ? args.show.accentColor : guest?.color ?? null,
      glyph: guestIsProducer ? "prism" : guest?.glyph ?? null,
      seatIndex: 1,
      visible: true,
      metadata: {
        powers: botcastSnapshotPowersForRoleV1(args.episode, "guest") ?? [],
        visualSnapshot: guest?.replayVisualSnapshot ?? null,
      },
    },
    ...(guestIsProducer
      ? []
      : [
          {
            id: "prism-player",
            name: args.producerName,
            kind: "prism" as const,
            role: "producer",
            color: args.show.accentColor,
            glyph: "prism",
            seatIndex: 2,
            visible: true,
          },
        ]),
  ];
  const utterances: ReplayUtteranceV1[] = args.episode.messages.map((message) => ({
    id: message.id,
    sourceMessageId: message.id,
    speakerId:
      guestIsProducer && message.speakerRole === "guest"
        ? "prism-player"
        : message.botId,
    speakerRole: message.speakerRole,
    text: message.content,
    spokenText: voiceSpokenText(
      message.voicePerformanceText || message.content,
    ),
    moodKey: message.moodKey,
    audible:
      botcastMessageIsAudibleToAudienceV1(message) &&
      !botPowerResponseIsSilentV1(message.content),
    visible: message.audienceDelivery?.speakerVisible !== false,
    createdAt: message.createdAt,
    metadata: {
      stageActionText: message.stageActionText,
      audienceDelivery: message.audienceDelivery ?? null,
    },
  }));
  const events: ReplayEventV1[] = args.episode.events.map((event) => ({
    id: event.id,
    kind: event.kind,
    sourceMessageId:
      typeof event.payload.messageId === "string"
        ? event.payload.messageId
        : typeof event.payload.overlappingMessageId === "string"
          ? event.payload.overlappingMessageId
          : null,
    occurredAt: event.occurredAt,
    payload: event.payload,
  }));
  const atmosphere =
    args.theme === "light" ? args.show.dayAtmosphere : args.show.nightAtmosphere;
  return {
    v: 1,
    surface: "signal",
    sourceId: args.episode.id,
    title: args.episode.title,
    createdAt: args.episode.createdAt,
    completedAt: args.episode.completedAt ?? args.episode.updatedAt,
    privacyMode:
      args.episode.responseMode === "local"
        ? "local"
        : args.episode.responseMode === "online"
          ? "online"
          : "mixed",
    participants,
    utterances,
    events,
    visual: {
      theme: args.theme,
      accentColor: args.show.accentColor,
      atmosphereImageUrl: atmosphere?.imageUrl ?? null,
      metadata: {
        showName: args.show.name,
        microphoneTintMaskUrl:
          atmosphere?.microphoneTintMaskUrl ?? null,
        studioLayout: args.show.studioLayout,
        studioGlowTuning: args.show.studioGlowTuning,
        logoImageUrl: args.show.logo?.imageUrl ?? null,
        runtimeMs: args.episode.runtimeMs,
        introAudioUrl: args.show.introAudio?.audioUrl ?? null,
        introAudioDurationMs: args.show.introAudio?.durationMs ?? null,
        outdentAudioUrl: args.show.introAudio?.outdentAudioUrl ?? null,
        outdentAudioDurationMs: args.show.introAudio?.outdentDurationMs ?? null,
        atmosphereAudioUrl: args.show.atmosphereAudio?.audioUrl ?? null,
        atmosphereAudioDurationMs: args.show.atmosphereAudio?.durationMs ?? null,
        atmosphereMix: args.show.atmosphereMix,
        studioLighting: args.show.studioLighting,
        fallbackStudioAccentVariant: args.show.fallbackStudioAccentVariant,
        renderContract: "signal-studio-dom-v3",
      },
    },
  };
}

interface CoffeeReplayMessageInput {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  botId?: string | null;
  botName?: string;
  botColor?: string;
  botGlyph?: string;
  provider?: string;
  moodKey?: "joyful" | "warm" | "neutral" | "guarded" | "strained";
  coffeeReplayEvents?: Array<{ kind: string }>;
  coffeeObserverProjection?: { audible?: boolean; visible?: boolean };
  coffeeAmbientAction?: object;
  coffeeUserAction?: object;
}

export function buildCoffeeReplayManifestV1(args: {
  conversation: {
    id: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
    botGroupIds?: string[];
    coffeeSeatBotIds?: Array<string | null>;
    coffeePowerPlan?: { bots?: Record<string, unknown> } | null;
    messages: CoffeeReplayMessageInput[];
  };
  bots: readonly ReplayBotSnapshotInput[];
  playerName: string;
  prismColor: string | null;
  prismGlyph: string | null;
  theme: "light" | "dark";
}): ReplayManifestV1 {
  const botsById = new Map(args.bots.map((bot) => [bot.id, bot]));
  const seatBotIds = (args.conversation.coffeeSeatBotIds?.filter(
    (id): id is string => Boolean(id),
  ) ?? args.conversation.botGroupIds ?? []).slice(0, 5);
  const participants: ReplayParticipantSnapshotV1[] = [
    ...seatBotIds.map((botId, seatIndex) => {
      const bot = botsById.get(botId);
      return {
        id: botId,
        name: bot?.name ?? "Bot",
        kind: "bot" as const,
        role: "table-guest",
        color: bot?.color ?? null,
        glyph: bot?.glyph ?? null,
        seatIndex,
        visible: true,
        metadata: {
          powers: args.conversation.coffeePowerPlan?.bots?.[botId] ?? null,
        },
      };
    }),
    {
      id: "prism-player",
      name: args.playerName,
      kind: "prism",
      role: "player",
      color: args.prismColor,
      glyph: args.prismGlyph ?? "prism",
      seatIndex: seatBotIds.length,
      visible: true,
    },
  ];
  const utterances: ReplayUtteranceV1[] = args.conversation.messages
    .filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        message.content.trim().length > 0,
    )
    .map((message) => ({
      id: message.id,
      sourceMessageId: message.id,
      speakerId:
        message.role === "user" ? "prism-player" : message.botId ?? message.botName ?? "bot",
      speakerRole: message.role === "user" ? "player" : "table-guest",
      text: message.content,
      spokenText: voiceSpokenText(message.content),
      moodKey: message.moodKey ?? "neutral",
      audible:
        message.coffeeObserverProjection?.audible !== false &&
        voiceSpokenText(message.content).length > 0 &&
        message.content.trim() !== "...",
      visible: message.coffeeObserverProjection?.visible !== false,
      createdAt: message.createdAt,
      metadata: {
        botColor: message.botColor ?? null,
        botGlyph: message.botGlyph ?? null,
      },
    }));
  const events: ReplayEventV1[] = args.conversation.messages.flatMap(
    (message) => {
      const replayEvents = (message.coffeeReplayEvents ?? []).map(
        (event, index) => ({
          id: `${message.id}:event:${index}`,
          kind: event.kind,
          sourceMessageId: message.id,
          occurredAt: message.createdAt,
          payload: { ...event },
        }),
      );
      const ambient = message.coffeeAmbientAction
        ? [
            {
              id: `${message.id}:ambient`,
              kind: "ambientAction",
              sourceMessageId: message.id,
              occurredAt: message.createdAt,
              payload: { ...message.coffeeAmbientAction },
            },
          ]
        : [];
      const userAction = message.coffeeUserAction
        ? [
            {
              id: `${message.id}:user-action`,
              kind: "userAction",
              sourceMessageId: message.id,
              occurredAt: message.createdAt,
              payload: { ...message.coffeeUserAction },
            },
          ]
        : [];
      return [...replayEvents, ...ambient, ...userAction] satisfies ReplayEventV1[];
    },
  );
  const generatedProviders = args.conversation.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.provider)
    .filter((provider): provider is string => Boolean(provider));
  const privacyMode =
    generatedProviders.length === 0 || generatedProviders.every((provider) => provider === "local")
      ? "local"
      : generatedProviders.every((provider) => provider !== "local")
        ? "online"
        : "mixed";
  const createdAt = args.conversation.createdAt ??
    args.conversation.messages[0]?.createdAt ?? new Date(0).toISOString();
  const completedAt = args.conversation.updatedAt ??
    args.conversation.messages.at(-1)?.createdAt ?? createdAt;
  return {
    v: 1,
    surface: "coffee",
    sourceId: args.conversation.id,
    title: args.conversation.title || "Coffee Session",
    createdAt,
    completedAt,
    privacyMode,
    participants,
    utterances,
    events,
    visual: {
      theme: args.theme,
      accentColor: args.prismColor,
      atmosphereImageUrl: null,
      metadata: { playerPerspective: "third-person-prism" },
    },
  };
}
