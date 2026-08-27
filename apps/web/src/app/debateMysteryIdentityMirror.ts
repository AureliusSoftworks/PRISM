import {
  DEBATE_SCHEMA_VERSION,
  applyBotIdentityMirrorFaceV1,
  botDirectlyAddressesBotV1,
  botIdentityMirrorQuotedTargetNameV1,
  type BotFaceStyle,
  type DebateBotSnapshotV1,
  type DebateMysteryIdentityMirrorTargetSnapshotV1,
  type DebateMysteryPublicDialogueEntryV2,
  type DebateSessionV1,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";

export interface DebateMysteryIdentityMirrorPresentationV1 {
  holderBotId: string;
  targetBotId: string;
  targetKind: "bot" | "player";
  targetName: string;
  /** The first public entry that established the holder's current form. */
  sourceDialogueKey: string;
  occurredAt: string;
}

export function debateMysteryIdentityMirrorTargetBotSnapshotV1(
  target: DebateMysteryIdentityMirrorTargetSnapshotV1,
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: target.botId,
    name: target.name,
    systemPrompt: "Frozen Whodunnit Identity Crisis presentation target.",
    role: "advocate",
    sideId: null,
    color: null,
    glyph: target.glyph,
    avatarDetails: target.avatarDetails,
    voiceProfile: null,
    replayVisualSnapshot: {
      v: 1,
      faceStyle: target.faceStyle,
      avatarDetails: target.avatarDetails,
      voicePreset: "neutral",
      screenMaterialSeed: `whodunnit-mirror-screen:${target.botId}`,
      frameMaterialSeed: `whodunnit-mirror-frame:${target.botId}`,
    },
    powers: [],
    provider: "local",
    model: "frozen-whodunnit-identity-target",
    revision: `frozen-whodunnit-identity-target:${target.botId}`,
  };
}

export const debateMysteryQuotedIdentityNameV1 =
  botIdentityMirrorQuotedTargetNameV1;

/** Complete frozen public face for live, saved, and replayed Whodunnit forms. */
export function debateMysteryIdentityMirrorFaceV1(
  holder: DebateMysteryIdentityMirrorTargetSnapshotV1,
  target: DebateMysteryIdentityMirrorTargetSnapshotV1,
): BotFaceStyle {
  return applyBotIdentityMirrorFaceV1(holder.faceStyle, target.faceStyle);
}

function dialogueKey(entry: DebateMysteryPublicDialogueEntryV2): string {
  return `${entry.nodeId}:${entry.lineId ?? "text"}:${entry.occurredAt}`;
}

function holderHasIdentityMirror(
  session: Pick<DebateSessionV1, "powerPlan">,
  botId: string,
): boolean {
  return session.powerPlan.bots[botId]?.effects.some(
    ({ effect }) => effect.type === "identity_mirror" && effect.trigger === "direct_bot_address",
  ) ?? false;
}

/**
 * Resolve Identity Crisis directly from the frozen Power plan and durable public
 * dialogue history. Whodunnit never authorizes a live model, so this must not
 * infer a target from turn order or mutable profile data.
 */
export function debateMysteryIdentityMirrorPresentationsV1(args: {
  session: Pick<DebateSessionV1, "powerPlan">;
  state: Pick<
    DebateWhodunnitFormatStateV2,
    | "config"
    | "suspects"
    | "topics"
    | "dialogueHistory"
    | "identityMirrorTargetSnapshots"
  >;
  botNamesById: ReadonlyMap<string, string>;
}): ReadonlyMap<string, DebateMysteryIdentityMirrorPresentationV1> {
  const botIdBySeatId = new Map(
    args.state.suspects.map((suspect) => [suspect.seatId, suspect.botId]),
  );
  const participantBotIds = new Set<string>([
    ...args.state.suspects.map((suspect) => suspect.botId),
    args.state.config.prosecutorBotId,
    args.state.config.rivalDefenseBotId,
    ...(args.state.config.judgeBotId === "prism:player-judge"
      ? []
      : [args.state.config.judgeBotId]),
    ...args.state.config.jurorBotIds,
  ]);
  const holderBotIds = [...participantBotIds].filter((botId) =>
    holderHasIdentityMirror(args.session, botId),
  );
  const presentationByHolder = new Map<
    string,
    DebateMysteryIdentityMirrorPresentationV1
  >();

  const legacyRecipientBotId = (entry: DebateMysteryPublicDialogueEntryV2): string | null => {
    const topic = args.state.topics.find((candidate) => candidate.nodeId === entry.nodeId);
    if (topic) return botIdBySeatId.get(topic.suspectSeatId) ?? null;
    const addressedSuspect = args.state.suspects.find((suspect) =>
      entry.nodeId.startsWith(`present-${suspect.seatId}-`),
    );
    if (addressedSuspect) return addressedSuspect.botId;
    if (/^(?:talk|present|choice)-.*(?:response|reaction)/u.test(entry.nodeId)) {
      return args.state.config.prosecutorBotId;
    }
    return null;
  };

  for (const entry of args.state.dialogueHistory) {
    const speakerBotId = entry.speakerBotId;
    if (!speakerBotId || !participantBotIds.has(speakerBotId)) continue;
    const explicitRecipientBotId = entry.intendedRecipientBotId ?? (
      entry.intendedRecipientSeatId
        ? botIdBySeatId.get(entry.intendedRecipientSeatId) ?? null
        : legacyRecipientBotId(entry)
    );
    for (const holderBotId of holderBotIds) {
      if (holderBotId === speakerBotId) continue;
      const holderName = args.botNamesById.get(holderBotId);
      const directAddressedByName = holderName
        ? botDirectlyAddressesBotV1({
            text: entry.visibleText,
            targetBotId: holderBotId,
            targetBotName: holderName,
          })
        : false;
      if (explicitRecipientBotId !== holderBotId && !directAddressedByName) continue;

      const current = presentationByHolder.get(holderBotId);
      // Consecutive direct addresses by the same bot retain the first source,
      // so a re-render or later line never restarts the blackout transition.
      if (current?.targetBotId === speakerBotId) continue;
      const targetName =
        args.state.identityMirrorTargetSnapshots[speakerBotId]?.name ??
        args.botNamesById.get(speakerBotId) ??
        speakerBotId;
      // In Participant cases the selected Prosecutor is the embodied player's
      // public identity even when a frozen authored line retained bot-kind
      // provenance. Spectator cases keep the Prosecutor as an ordinary bot.
      const targetKind =
        args.state.config.playerRole !== "spectator" &&
        speakerBotId === args.state.config.prosecutorBotId
          ? "player"
          : "bot";
      presentationByHolder.set(holderBotId, {
        holderBotId,
        targetBotId: speakerBotId,
        targetKind,
        targetName,
        sourceDialogueKey: dialogueKey(entry),
        occurredAt: entry.occurredAt,
      });
    }
  }
  return presentationByHolder;
}
