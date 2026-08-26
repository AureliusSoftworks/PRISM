"use client";

import { useState } from "react";
import {
  compileDeterministicDebateMystery,
  projectDebateMysteryCase,
  resolveDebateMysteryConfig,
  type DebateWhodunnitFormatStateV1,
  type DebateSessionV1,
} from "@localai/shared";
import {
  DebateMysteryPlay,
  type MysteryBotSummary,
} from "../DebateMysteryExperience";
import {
  DebateExperience,
  type DebateBotSummary,
} from "../DebateExperience";

const BOTS: MysteryBotSummary[] = [
  ["bot-1", "Mara Voss", "#d783ff", "◆"],
  ["bot-2", "Basil Wren", "#67dce6", "◇"],
  ["bot-3", "Inez Vale", "#ff9a76", "✦"],
  ["bot-4", "Orson Pike", "#d8c56e", "⬡"],
  ["bot-5", "Ada Finch", "#8ce58f", "△"],
  ["bot-6", "Lucian Grey", "#8aa5ff", "◈"],
  ["bot-7", "Justice Rowan", "#a995ff", "⚖"],
].map(([id, name, color, glyph]) => ({
  id,
  name,
  color,
  glyph,
  hardMuted: false,
}));

function fixtureSession(theoryMode = false): DebateSessionV1 {
  const config = resolveDebateMysteryConfig({
    version: 1,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    inspiration: "A rainbound estate, a vanished codicil, and a stopped hall clock.",
    nonce: "qa-whodunnit-spatial-flow",
    suspectBotIds: BOTS.slice(0, 4).map((bot) => bot.id),
    judgeBotId: BOTS[6]!.id,
    prosecutorPartnerBotId: BOTS[4]!.id,
    rivalDefenseBotId: BOTS[5]!.id,
  });
  const bible = compileDeterministicDebateMystery({
    config,
    suspects: BOTS.slice(0, 4).map((bot, index) => ({
      botId: bot.id,
      exportHash: `qa-export-${index + 1}`,
      name: bot.name,
      color: bot.color,
      glyph: bot.glyph,
    })),
  });
  const projected = projectDebateMysteryCase(bible, config);
  const currentSuspect = projected.suspects[0]!;
  const visibleRoomIds = new Set([
    projected.crimeSceneRoomId,
    currentSuspect.roomId,
    projected.suspects[1]?.roomId,
  ]);
  const formatState = {
    ...projected,
    caseTitle: "The Prism at Midnight",
    currentRoomId: currentSuspect.roomId!,
    ...(theoryMode ? {
      playPhase: "theory" as const,
      actionsRemaining: 0,
      metSuspectSeatIds: projected.suspects.slice(0, 2).map((suspect) => suspect.seatId),
      testimony: [{
        id: "qa-testimony-clock",
        speakerSeatId: currentSuspect.seatId,
        exactQuote: "The hall clock stopped before the storm reached the east windows.",
        discovered: true,
      }],
    } : {}),
    rooms: projected.rooms.map((room) => visibleRoomIds.has(room.id)
      ? { ...room, discovered: true }
      : room),
    partnerJournal: [
      "Rain has sealed the estate. Start with the rooms and the people who chose to stay in them.",
    ],
  };

  return {
    version: 1,
    id: "qa-whodunnit-session",
    revision: 1,
    status: "waiting_for_player",
    phase: "challenge",
    stepKey: "mystery_investigation",
    provider: "local",
    model: "qa-fixture",
    responseMode: "local",
    generationChain: [],
    format: "whodunnit",
    formatVersion: 1,
    formatState,
    formality: "plainspoken",
    setupPresetId: "custom",
    playerRole: "investigator",
    playerSideId: null,
    motion: {} as DebateSessionV1["motion"],
    evidence: {} as DebateSessionV1["evidence"],
    moderatorTitle: "The Court",
    moderatorName: BOTS[6]!.name,
    moderator: { id: BOTS[6]!.id, name: BOTS[6]!.name } as DebateSessionV1["moderator"],
    forAdvocate: { id: BOTS[4]!.id, name: BOTS[4]!.name } as DebateSessionV1["forAdvocate"],
    againstAdvocate: { id: BOTS[5]!.id, name: BOTS[5]!.name } as DebateSessionV1["againstAdvocate"],
    advocacyConsent: [],
    powerPlan: {} as DebateSessionV1["powerPlan"],
    caseBoard: [],
    ballots: [],
    jury: {} as DebateSessionV1["jury"],
    playerVerdict: null,
    winnerSideId: null,
    events: [],
    error: null,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    endedEarlyAt: null,
    completedAt: null,
  };
}

export function WhodunnitFixture({
  setupMode = false,
  theoryMode = false,
}: {
  setupMode?: boolean;
  theoryMode?: boolean;
}): React.JSX.Element {
  const [session, setSession] = useState(() => fixtureSession(theoryMode));

  if (setupMode) {
    return (
      <DebateExperience
        bots={BOTS as DebateBotSummary[]}
        initialFormat="whodunnit"
        playerName="QA Investigator"
        storageScopeId="qa-whodunnit"
        theme="dark"
        audioEnabled={false}
        audioVolume={0}
        preferredProvider="local"
        preferredImageProvider="local"
        responseMode="local"
        graphicsQuality="medium"
        onExit={() => undefined}
        request={async <T,>(path: string): Promise<T> => {
          if (path === "/api/debates") return { sessions: [] } as T;
          if (path.startsWith("/api/presence-beats")) return { beats: [] } as T;
          throw new Error("The visual setup fixture does not compile cases.");
        }}
        renderBotGlyph={(glyph, options) => (
          <span className={options?.className} aria-hidden="true">{glyph ?? "◇"}</span>
        )}
      />
    );
  }

  return (
    <DebateMysteryPlay
      session={session}
      onSessionChange={setSession}
      onExit={() => undefined}
      bots={BOTS}
      theme="dark"
      audioEnabled={false}
      audioVolume={0}
      preferredProvider="local"
      responseMode="local"
      request={async <T,>(path: string, options?: RequestInit): Promise<T> => {
        if (path.endsWith("/notebook")) {
          return {
            notebook: {
              version: 2,
              revision: 1,
              leadAnnotations: [],
              suspectNotes: [],
              suspectPins: [],
            },
          } as T;
        }
        if (path.endsWith("/mystery-action") && typeof options?.body === "string") {
          const action = JSON.parse(options.body) as { action?: string; path?: string; roomId?: string };
          if (action.action === "choose_investigation_path" && action.path === "player") {
            const formatState = session.formatState as DebateWhodunnitFormatStateV1;
            return {
              session: {
                ...session,
                revision: session.revision + 1,
                formatState: {
                  ...formatState,
                  investigationApproach: "player",
                },
              },
            } as T;
          }
          if (action.action === "begin_investigation" && action.roomId) {
            const formatState = session.formatState as DebateWhodunnitFormatStateV1;
            return {
              session: {
                ...session,
                revision: session.revision + 1,
                formatState: {
                  ...formatState,
                  activeActivity: {
                    kind: "investigation",
                    roomId: action.roomId,
                    startedAt: new Date().toISOString(),
                    actionCommitted: false,
                  },
                },
              },
            } as T;
          }
        }
        throw new Error("The visual fixture does not perform case mutations.");
      }}
      renderBotGlyph={(glyph, options) => (
        <span className={options?.className} aria-hidden="true">{glyph ?? "◇"}</span>
      )}
      renderMysteryBotAvatar={(bot, presentation) => (
        <span
          aria-label={bot.name}
          style={{
            display: "grid",
            width: "100%",
            height: "100%",
            minHeight: presentation === "full" ? "16rem" : "8rem",
            placeItems: "center",
            color: bot.color ?? "#a98cff",
            fontFamily: "Georgia, serif",
            fontSize: presentation === "full" ? "7rem" : "4rem",
            textShadow: "0 0 2rem currentColor",
          }}
        >
          {bot.glyph ?? "◇"}
        </span>
      )}
    />
  );
}
