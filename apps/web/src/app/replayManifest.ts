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
  type ReplayDirectionEventV2,
  type ReplayManifestV1,
  type ReplayManifestV2,
  type ReplayParticipantSnapshotV1,
  type ReplayUtteranceV1,
  defaultReplaySceneV2,
} from "@localai/shared";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  SIGNAL_SYNTH_IDENT_DURATION_MS,
} from "./signalIntroAudio.ts";

const SIGNAL_REPLAY_PRE_ROLL_MIN_MS = 4_200;

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
          SIGNAL_REPLAY_PRE_ROLL_MIN_MS,
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
  capturedReplayEvents?: readonly ReplayEventV1[];
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
      id: "coffee-player",
      name: args.playerName,
      kind: "player",
      role: "player",
      color: null,
      glyph: null,
      seatIndex: null,
      visible: false,
      metadata: {
        offCamera: true,
        carriesCoffeePot: true,
      },
    },
  ];
  const utterances: ReplayUtteranceV1[] = args.conversation.messages
    .filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        message.content.trim().length > 0,
    )
    .map((message) => {
      return {
        id: message.id,
        sourceMessageId: message.id,
        speakerId:
          message.role === "user"
            ? "coffee-player"
            : message.botId ?? message.botName ?? "table",
        speakerRole:
          message.role === "user"
            ? "player"
            : "table-guest",
        text: message.content,
        spokenText: voiceSpokenText(message.content),
        moodKey: message.moodKey ?? "neutral",
        audible:
          message.coffeeObserverProjection?.audible !== false &&
          voiceSpokenText(message.content).length > 0 &&
          message.content.trim() !== "...",
        visible:
          message.coffeeObserverProjection?.visible !== false,
        createdAt: message.createdAt,
        metadata: {
          botColor: message.botColor ?? null,
          botGlyph: message.botGlyph ?? null,
        },
      };
    });
  const savedEvents: ReplayEventV1[] = args.conversation.messages.flatMap(
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
  const savedEventIds = new Set(savedEvents.map((event) => event.id));
  const events = [
    ...savedEvents,
    ...(args.capturedReplayEvents ?? []).filter(
      (event) => !savedEventIds.has(event.id),
    ),
  ];
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
        playerPerspective: "off-camera-pot",
        renderContract: COFFEE_REPLAY_RENDER_CONTRACT,
      },
    },
  };
}

function replayDirectionKindFromSavedEvent(
  kind: string,
): ReplayDirectionEventV2["kind"] | null {
  const normalized = kind.replace(/[_-]/gu, "").toLowerCase();
  if (normalized.includes("camera") || normalized.includes("shot")) return "camera";
  if (normalized.includes("segment")) return "segment";
  if (normalized.includes("thinking")) return "thinking";
  if (normalized.includes("arrival")) return "arrival";
  if (normalized.includes("mood")) return "mood";
  if (normalized.includes("topoff") || normalized.includes("refill")) return "top_off";
  if (normalized.includes("sip")) return "sip";
  if (normalized.includes("action") || normalized.includes("soundboard")) return "action";
  if (normalized.includes("reaction")) return "reaction";
  if (normalized.includes("overlap") || normalized.includes("crosstalk")) return "overlap";
  if (normalized.includes("departure") || normalized.includes("departed")) return "departure";
  if (normalized.includes("mix") || normalized.includes("atmosphere")) return "studio_mix";
  if (normalized.includes("intro")) return "intro";
  if (normalized.includes("outro") || normalized.includes("completed")) return "outro";
  return null;
}

function replayEventAtMs(
  event: ReplayEventV1,
  createdAtMs: number,
): number {
  const explicit = Number(event.payload.atMs);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit);
  const occurredAtMs = event.occurredAt ? Date.parse(event.occurredAt) : Number.NaN;
  return Number.isFinite(occurredAtMs)
    ? Math.max(0, Math.round(occurredAtMs - createdAtMs))
    : 0;
}

function capturedSpeechDirection(
  manifest: ReplayManifestV1,
): ReplayDirectionEventV2[] {
  const createdAtMs = Date.parse(manifest.createdAt);
  const startByMessageId = new Map<string, ReplayEventV1>();
  const endByMessageId = new Map<string, ReplayEventV1>();
  for (const event of manifest.events) {
    if (event.kind !== "capture_timing") continue;
    const messageId =
      typeof event.payload.messageId === "string"
        ? event.payload.messageId.trim()
        : "";
    if (!messageId) continue;
    if (event.payload.phase === "speech_start") startByMessageId.set(messageId, event);
    if (event.payload.phase === "speech_end") endByMessageId.set(messageId, event);
  }
  return manifest.utterances.flatMap((utterance) => {
    const start = startByMessageId.get(utterance.sourceMessageId);
    if (!start) return [];
    const end = endByMessageId.get(utterance.sourceMessageId);
    const atMs = replayEventAtMs(start, createdAtMs);
    const endMs = end ? replayEventAtMs(end, createdAtMs) : atMs + 1;
    return [
      {
        sequence: 0,
        atMs,
        endMs: Math.max(atMs + 1, endMs),
        kind: "speech" as const,
        sourceMessageId: utterance.sourceMessageId,
        payload: {
          speakerId: utterance.speakerId,
          audible: utterance.audible,
          active: true,
          mood: utterance.moodKey,
        },
      },
    ];
  });
}

function buildReplayDirectionV2(
  manifest: ReplayManifestV1,
  capturedDirection: readonly ReplayDirectionEventV2[] = [],
): ReplayDirectionEventV2[] {
  const createdAtMs = Date.parse(manifest.createdAt);
  const semanticEvents = manifest.events.flatMap((event) => {
    if (event.kind === "capture_timing") {
      const phase = event.payload.phase;
      if (phase === "intro_start" || phase === "outro_start") {
        return [
          {
            sequence: 0,
            atMs: replayEventAtMs(event, createdAtMs),
            kind: phase === "intro_start" ? "intro" as const : "outro" as const,
            sourceMessageId: event.sourceMessageId,
            payload: { active: true },
          },
        ];
      }
      return [];
    }
    const kind = replayDirectionKindFromSavedEvent(event.kind);
    if (!kind) return [];
    // V2 thinking comes only from the committed on-screen presentation hook.
    // Server request/job timestamps are not equivalent to the spinner interval.
    if (kind === "thinking") return [];
    return [
      {
        sequence: 0,
        atMs: replayEventAtMs(event, createdAtMs),
        kind,
        sourceMessageId: event.sourceMessageId,
        payload: { ...event.payload },
      },
    ];
  });
  const explicitlyDirectedSpeechIds = new Set(
    capturedDirection.flatMap((event) =>
      event.kind === "speech" && event.sourceMessageId
        ? [event.sourceMessageId]
        : [],
    ),
  );
  const deduped = [
    ...capturedSpeechDirection(manifest).filter(
      (event) =>
        !event.sourceMessageId ||
        !explicitlyDirectedSpeechIds.has(event.sourceMessageId),
    ),
    ...semanticEvents,
    ...capturedDirection,
  ]
    .sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence)
    .filter((event, index, events) => {
      const previous = events[index - 1];
      return !(
        previous &&
        previous.atMs === event.atMs &&
        previous.kind === event.kind &&
        previous.sourceMessageId === event.sourceMessageId &&
        JSON.stringify(previous.payload) === JSON.stringify(event.payload)
      );
    });
  return deduped.map((event, index) => ({
    ...event,
    sequence: index + 1,
  }));
}

function replayManifestV2FromV1(
  manifest: ReplayManifestV1,
  capturedDirection: readonly ReplayDirectionEventV2[] = [],
): ReplayManifestV2 {
  const direction = buildReplayDirectionV2(manifest, capturedDirection);
  const initialScene = defaultReplaySceneV2(manifest.participants);
  if (manifest.surface === "signal") {
    initialScene.camera = "wide";
  } else {
    const arrivingParticipantIds = new Set(
      direction.flatMap((event) => {
        if (event.kind !== "arrival") return [];
        const participantId =
          typeof event.payload.participantId === "string"
            ? event.payload.participantId
            : typeof event.payload.botId === "string"
              ? event.payload.botId
              : null;
        return participantId ? [participantId] : [];
      }),
    );
    for (const participantId of arrivingParticipantIds) {
      const participant = initialScene.participants[participantId];
      if (!participant) continue;
      participant.present = false;
      participant.visible = false;
    }
  }
  const directedWithSnapshot = [
    {
      sequence: 1,
      atMs: 0,
      kind: "scene_snapshot" as const,
      sourceMessageId: null,
      payload: { scene: initialScene },
    },
    ...direction.map((event, index) => ({
      ...event,
      sequence: index + 2,
    })),
  ];
  return {
    v: 2,
    surface: manifest.surface,
    sourceId: manifest.sourceId,
    title: manifest.title,
    createdAt: manifest.createdAt,
    completedAt: manifest.completedAt,
    privacyMode: manifest.privacyMode,
    participants: manifest.participants,
    utterances: manifest.utterances,
    initialScene,
    direction: directedWithSnapshot,
    visual: manifest.visual,
  };
}

export function buildSignalReplayManifestV2(
  args: Parameters<typeof buildSignalReplayManifestV1>[0] & {
    capturedDirection?: readonly ReplayDirectionEventV2[];
  },
): ReplayManifestV2 {
  const { capturedDirection = [], ...legacyArgs } = args;
  return replayManifestV2FromV1(
    buildSignalReplayManifestV1(legacyArgs),
    capturedDirection,
  );
}

export function buildCoffeeReplayManifestV2(
  args: Parameters<typeof buildCoffeeReplayManifestV1>[0] & {
    capturedDirection?: readonly ReplayDirectionEventV2[];
  },
): ReplayManifestV2 {
  const { capturedDirection = [], ...legacyArgs } = args;
  return replayManifestV2FromV1(
    buildCoffeeReplayManifestV1(legacyArgs),
    capturedDirection,
  );
}
