import {
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_SCHEMA_VERSION,
  type DebateBotSnapshotV1,
  type DebateSessionV1,
  type GraphicsQuality,
} from "@localai/shared";

export const DEBATE_AUDIENCE_GENERATED_ID_PREFIX =
  "prism:debate-audience:generated:";
export const DEBATE_SPECTATOR_PRISM_REVISION_MARKER =
  ":spectator-prism-v1" as const;

const DEBATE_AUDIENCE_COUNT_BY_QUALITY = {
  low: 9,
  medium: 13,
  high: 15,
} as const satisfies Record<GraphicsQuality, number>;

const DEBATE_AUDIENCE_GENERATED_COLORS = [
  "#76d7c4",
  "#8bb8ff",
  "#c7a8ff",
  "#f09ac0",
  "#efb47c",
  "#d5cf72",
  "#84c872",
  "#a8b0c8",
] as const;

const DEBATE_AUDIENCE_GENERATED_GLYPHS = [
  "circle",
  "diamond",
  "hexagon",
  "origami",
  "pentagon",
  "square",
  "triangle",
] as const;

const DEBATE_AUDIENCE_GENERATED_NAMES = [
  "Mica",
  "Rook",
  "Vela",
  "Orin",
  "Sable",
  "Tavi",
  "Nim",
  "Coda",
] as const;

export interface DebateAudienceLibraryBot {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  avatarDetails?: DebateBotSnapshotV1["avatarDetails"];
  voiceProfile?: DebateBotSnapshotV1["voiceProfile"];
  powers?: DebateBotSnapshotV1["powers"];
  systemPrompt?: string;
}

function debateAudienceStableHash(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function debateAudienceRandom(seed: string): () => number {
  let state = debateAudienceStableHash(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let sample = state;
    sample = Math.imul(sample ^ (sample >>> 15), sample | 1);
    sample ^= sample + Math.imul(sample ^ (sample >>> 7), sample | 61);
    return ((sample ^ (sample >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function debateAudienceBotCount(
  graphicsQuality: GraphicsQuality,
): number {
  return DEBATE_AUDIENCE_COUNT_BY_QUALITY[graphicsQuality];
}

export type DebateAudienceConversationFacing = "left" | "right";
export type DebateAudienceDepthRow = "front" | "rear";

export interface DebateAudienceSeatLayout {
  depthRow: DebateAudienceDepthRow;
  rowIndex: number;
  rowCount: number;
}

export function debateAudienceSeatLayout(
  index: number,
  count: number,
): DebateAudienceSeatLayout {
  const safeCount = Math.max(0, Math.floor(count));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(index)));
  const frontCount = Math.ceil(safeCount / 2);
  if (safeIndex < frontCount) {
    return {
      depthRow: "front",
      rowIndex: safeIndex,
      rowCount: frontCount,
    };
  }
  return {
    depthRow: "rear",
    rowIndex: safeIndex - frontCount,
    rowCount: Math.max(0, safeCount - frontCount),
  };
}

export function debateAudienceConversationFacing(
  index: number,
  count: number,
): DebateAudienceConversationFacing {
  const safeCount = Math.max(1, Math.floor(count));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(index)));
  if (safeCount % 2 === 1 && safeIndex === safeCount - 1) return "left";
  return safeIndex % 2 === 0 ? "right" : "left";
}

export function debateAudienceSeatIsTalker(
  index: number,
  count: number,
): boolean {
  const safeCount = Math.max(0, Math.floor(count));
  const safeIndex = Math.floor(index);
  if (
    safeCount < 2 ||
    safeIndex < 0 ||
    safeIndex >= safeCount ||
    (safeCount % 2 === 1 && safeIndex === safeCount - 1)
  ) {
    return false;
  }
  return safeIndex % 2 === Math.floor(safeIndex / 2) % 2;
}

export function debateAudienceBotIsGenerated(
  bot: Pick<DebateBotSnapshotV1, "id">,
): boolean {
  return bot.id.startsWith(DEBATE_AUDIENCE_GENERATED_ID_PREFIX);
}

/** Default Prism seat reserved for human Spectator sessions only. */
export function debateAudienceBotIsPlayerSpectator(
  bot: Pick<DebateBotSnapshotV1, "id" | "revision">,
): boolean {
  return (
    bot.id === DEBATE_PLAYER_JUDGE_BOT_ID &&
    bot.revision.includes(DEBATE_SPECTATOR_PRISM_REVISION_MARKER)
  );
}

/**
 * Front-row center index for the below-screen gallery (left-biased when even).
 */
export function debateAudienceFrontRowCenterIndex(count: number): number {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount <= 0) return 0;
  const frontCount = Math.ceil(safeCount / 2);
  return Math.floor((frontCount - 1) / 2);
}

/**
 * Observable gallery body for Spectator — reuses the Judge Prism id so the
 * page renderer paints Default Prism, without putting the player on a podium.
 */
export function debateSpectatorPrismAudienceSeat(args: {
  session: Pick<DebateSessionV1, "id" | "provider" | "model" | "playerRole">;
  playerName?: string;
}): DebateBotSnapshotV1 | null {
  if (args.session.playerRole !== "spectator") return null;
  const playerName = args.playerName?.trim() || "You";
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: DEBATE_PLAYER_JUDGE_BOT_ID,
    name: playerName,
    systemPrompt:
      "PRISM is the player’s observable body in the Spectator gallery.",
    role: "juror",
    sideId: null,
    color: "#2fd3e3",
    glyph: "triangle",
    avatarDetails: null,
    voiceProfile: null,
    powers: [],
    provider: args.session.provider,
    model: args.session.model,
    revision: `${args.session.id}${DEBATE_SPECTATOR_PRISM_REVISION_MARKER}`,
  };
}

function libraryAudienceSnapshot(
  bot: DebateAudienceLibraryBot,
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bot.id,
    name: bot.name,
    systemPrompt: bot.systemPrompt ?? "",
    role: "juror",
    sideId: null,
    color: bot.color,
    glyph: bot.glyph,
    avatarDetails: bot.avatarDetails ?? null,
    voiceProfile: bot.voiceProfile ?? null,
    powers: bot.powers ?? [],
    provider: "local",
    model: "",
    revision: `audience-library:${bot.id}`,
  };
}

function generatedAudienceSnapshot(
  sessionId: string,
  index: number,
  random: () => number,
): DebateBotSnapshotV1 {
  const colorIndex = Math.floor(
    random() * DEBATE_AUDIENCE_GENERATED_COLORS.length,
  );
  const glyphIndex = Math.floor(
    random() * DEBATE_AUDIENCE_GENERATED_GLYPHS.length,
  );
  const nameIndex = Math.floor(
    random() * DEBATE_AUDIENCE_GENERATED_NAMES.length,
  );
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: `${DEBATE_AUDIENCE_GENERATED_ID_PREFIX}${sessionId}:${index}`,
    name:
      DEBATE_AUDIENCE_GENERATED_NAMES[nameIndex] ?? `Spectator ${index + 1}`,
    systemPrompt: "",
    role: "juror",
    sideId: null,
    color: DEBATE_AUDIENCE_GENERATED_COLORS[colorIndex] ?? "#a8b0c8",
    glyph: DEBATE_AUDIENCE_GENERATED_GLYPHS[glyphIndex] ?? "circle",
    avatarDetails: null,
    voiceProfile: null,
    powers: [],
    provider: "local",
    model: "",
    revision: `audience-generated:${index}`,
  };
}

export function debateAudienceBotsForSession(args: {
  sessionId: string;
  count: number;
  bots: readonly DebateAudienceLibraryBot[];
  excludedBotIds?: readonly string[];
  spectatorPrism?: DebateBotSnapshotV1 | null;
}): DebateBotSnapshotV1[] {
  const count = Math.max(0, Math.floor(args.count));
  const spectatorPrism =
    args.spectatorPrism && debateAudienceBotIsPlayerSpectator(args.spectatorPrism)
      ? args.spectatorPrism
      : null;
  const fillerCount = spectatorPrism ? Math.max(0, count - 1) : count;
  const excluded = new Set(args.excludedBotIds ?? []);
  if (spectatorPrism) excluded.add(spectatorPrism.id);
  const random = debateAudienceRandom(
    `${args.sessionId}:${args.bots
      .map((bot) => bot.id)
      .sort()
      .join(":")}`,
  );
  const libraryBots = [...args.bots]
    .filter((bot) => bot.id.trim().length > 0 && !excluded.has(bot.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (let index = libraryBots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [libraryBots[index], libraryBots[swapIndex]] = [
      libraryBots[swapIndex]!,
      libraryBots[index]!,
    ];
  }

  const audience = libraryBots.slice(0, fillerCount).map(libraryAudienceSnapshot);
  while (audience.length < fillerCount) {
    audience.push(
      generatedAudienceSnapshot(args.sessionId, audience.length, random),
    );
  }
  if (!spectatorPrism || count === 0) return audience;
  const center = debateAudienceFrontRowCenterIndex(count);
  const withPlayer = [...audience];
  withPlayer.splice(Math.min(center, withPlayer.length), 0, spectatorPrism);
  return withPlayer.slice(0, count);
}
