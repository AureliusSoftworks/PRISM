import {
  botcastMessageIsAudibleToAudienceV1,
  botcastSnapshotPowersForRoleV1,
  botPowerResponseIsSilentV1,
  buildSignalMusicProfile,
  voiceSpokenText,
  type BotcastEpisode,
  type BotcastReplayEvent,
  type BotcastShow,
  type BotAvatarDetailsV1,
  type BotAvatarSfxV1,
  type BotFaceStyle,
  type BotVoicePreset,
  type SignalPersonaTemperament,
  type ReplayEventV1,
  type ReplayManifestV1,
  type ReplayParticipantSnapshotV1,
  type ReplayUtteranceV1,
} from "@localai/shared";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  SIGNAL_EPISODE_PRE_ROLL_MIN_MS,
  SIGNAL_SYNTH_IDENT_DURATION_MS,
} from "./signalIntroAudio.ts";

export const COFFEE_REPLAY_RENDER_CONTRACT =
  "coffee-table-playwright-v1" as const;

export interface ReplayBotVisualSnapshotV1 {
  v: 1;
  faceStyle: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  voicePreset: BotVoicePreset;
  screenMaterialSeed: string;
  frameMaterialSeed: string;
  avatarSfx?: Pick<
    BotAvatarSfxV1,
    | "audioDataUrl"
    | "playWhileIdle"
    | "playWhileTalking"
    | "playWhileThinking"
    | "volume"
  > | null;
}

export type SignalReplayBotVisualSnapshotV1 = ReplayBotVisualSnapshotV1;

export interface ReplayBotSnapshotInput {
  id: string;
  name: string;
  color?: string | null;
  glyph?: string | null;
  personaTemperament?: SignalPersonaTemperament;
  replayVisualSnapshot?: ReplayBotVisualSnapshotV1 | null;
}

export function buildSignalReplayManifestV1(args: {
  episode: BotcastEpisode;
  show: BotcastShow;
  bots: readonly ReplayBotSnapshotInput[];
  producerName: string;
  theme: "light" | "dark";
  audioEnabled?: boolean;
  audioVolume?: number;
  capturedReplayEvents?: readonly BotcastReplayEvent[];
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
  const episodeEvents = [...args.episode.events];
  const capturedEventSignature = (event: BotcastReplayEvent): string =>
    event.kind === "soundboard_cue"
      ? `soundboard:${String(event.payload.kind)}:${Number(event.payload.atMs)}`
      : event.kind === "capture_timing"
        ? `capture:${String(event.payload.phase)}:${String(event.payload.messageId ?? "")}:${Number(event.payload.atMs)}`
        : `audio:${String(event.payload.kind)}:${Number(event.payload.atMs)}:${String(event.payload.role ?? "")}:${String(event.payload.messageId ?? "")}`;
  const capturedEventSignatures = new Set(
    episodeEvents
      .filter(
        (event) =>
          event.kind === "audio_cue" ||
          event.kind === "soundboard_cue" ||
          event.kind === "capture_timing",
      )
      .map(capturedEventSignature),
  );
  for (const event of args.capturedReplayEvents ?? []) {
    if (
      event.episodeId !== args.episode.id ||
      (event.kind !== "audio_cue" &&
        event.kind !== "soundboard_cue" &&
        event.kind !== "capture_timing")
    ) {
      continue;
    }
    const signature = capturedEventSignature(event);
    if (capturedEventSignatures.has(signature)) continue;
    capturedEventSignatures.add(signature);
    episodeEvents.push(event);
  }
  const events: ReplayEventV1[] = episodeEvents.map((event) => ({
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
  const musicIdentity = args.show.musicIdentity;
  const musicSeed = `${args.show.hostBotId}:${args.show.id}:music:${musicIdentity?.revision ?? 0}`;
  const musicProfile = buildSignalMusicProfile({
    temperament: host?.personaTemperament ?? "neutral",
    seed: musicSeed,
    identity: musicIdentity?.profile,
    premise: args.show.premise,
    hostingStyle: args.show.hostingStyle,
    studioIdentity: args.show.studioIdentity,
  });
  const masterVolume =
    typeof args.audioVolume === "number" && Number.isFinite(args.audioVolume)
      ? Math.max(0, Math.min(1, args.audioVolume))
      : 1;
  const introDurationMs =
    args.show.introAudio?.source === "elevenlabs"
      ? Math.max(3_000, args.show.introAudio.durationMs)
      : SIGNAL_SYNTH_IDENT_DURATION_MS;
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
        introPresentationDurationMs: Math.max(
          SIGNAL_EPISODE_PRE_ROLL_MIN_MS,
          SIGNAL_EPISODE_INTRO_LEAD_IN_MS + introDurationMs,
        ),
        outdentAudioUrl: args.show.introAudio?.outdentAudioUrl ?? null,
        outdentAudioDurationMs: args.show.introAudio?.outdentDurationMs ?? null,
        atmosphereAudioUrl: args.show.atmosphereAudio?.audioUrl ?? null,
        atmosphereAudioDurationMs: args.show.atmosphereAudio?.durationMs ?? null,
        atmosphereMix: args.show.atmosphereMix,
        signalAudioMix: {
          v: 1,
          enabled: args.audioEnabled !== false && masterVolume > 0,
          masterVolume,
        },
        introAudioSource: args.show.introAudio?.source ?? "local",
        musicProfile,
        musicSeed,
        studioLighting: args.show.studioLighting,
        fallbackStudioAccentVariant: args.show.fallbackStudioAccentVariant,
        renderContract: "signal-studio-playwright-v1",
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
          visualSnapshot: bot?.replayVisualSnapshot ?? null,
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
        ((message.role === "assistant" || message.role === "user") &&
          message.content.trim().length > 0) ||
        Boolean(
          message.coffeeReplayEvents?.length ||
            message.coffeeAmbientAction ||
            message.coffeeUserAction,
        ),
    )
    .map((message) => {
      const stateOnly = message.role === "system";
      return {
        id: message.id,
        sourceMessageId: message.id,
        speakerId:
          message.role === "user"
            ? "prism-player"
            : message.botId ?? message.botName ?? "table",
        speakerRole:
          message.role === "user"
            ? "player"
            : stateOnly
              ? "table-event"
              : "table-guest",
        text: stateOnly ? "" : message.content,
        spokenText: stateOnly ? "" : voiceSpokenText(message.content),
        moodKey: message.moodKey ?? "neutral",
        audible:
          !stateOnly &&
          message.coffeeObserverProjection?.audible !== false &&
          voiceSpokenText(message.content).length > 0 &&
          message.content.trim() !== "...",
        visible:
          !stateOnly &&
          message.coffeeObserverProjection?.visible !== false,
        createdAt: message.createdAt,
        metadata: {
          botColor: message.botColor ?? null,
          botGlyph: message.botGlyph ?? null,
          stateOnly,
        },
      };
    });
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
      metadata: {
        playerPerspective: "third-person-prism",
        renderContract: COFFEE_REPLAY_RENDER_CONTRACT,
      },
    },
  };
}
