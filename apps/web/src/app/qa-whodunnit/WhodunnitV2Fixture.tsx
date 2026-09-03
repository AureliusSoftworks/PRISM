"use client";

import { useState } from "react";
import {
  DEBATE_MYSTERY_PLAY_READINESS_VERSION,
  resolveDebateMysteryConfigV2,
  type DebateMysteryPublicDialogueEntryV2,
  type DebateMysteryRoomV2,
  type DebateMysteryMansionSnapshotV2,
  type DebateSessionV1,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import { DebateMysteryV2Play } from "../DebateMysteryV2Experience";
import type { MysteryBotSummary } from "../DebateMysteryExperience";

const FIXTURE_BOTS: MysteryBotSummary[] = [
  ["qa-v2-ada", "Ada Finch", "#8ce58f", "△"],
  ["qa-v2-basil", "Basil Wren", "#67dce6", "◇"],
  ["qa-v2-inez", "Inez Vale", "#ff9a76", "✦"],
  ["qa-v2-lucian", "Lucian Grey", "#8aa5ff", "◈"],
  ["qa-v2-mara", "Mara Voss", "#d783ff", "◆"],
  ["qa-v2-orson", "Orson Pike", "#d8c56e", "⬡"],
].map(([id, name, color, glyph]) => ({ id, name, color, glyph, hardMuted: false }));

const ROOM_DEFINITIONS: Array<Pick<DebateMysteryRoomV2, "id" | "name" | "floor" | "emoji" | "bundledAssetPath" | "x" | "y" | "width" | "height" | "neighborIds">> = [
  { id: "qa-v2-foyer", name: "Foyer of Unfinished Correspondence", floor: 1, emoji: "⌂", bundledAssetPath: "/debate/mystery/rooms/foyer.webp", x: 1, y: 2, width: 7, height: 7, neighborIds: ["qa-v2-library", "qa-v2-observatory"] },
  { id: "qa-v2-library", name: "The Long-Name Library and Reading Gallery", floor: 1, emoji: "▤", bundledAssetPath: "/debate/mystery/rooms/library.webp", x: 8, y: 2, width: 10, height: 7, neighborIds: ["qa-v2-foyer", "qa-v2-dining"] },
  { id: "qa-v2-dining", name: "North Dining Room", floor: 1, emoji: "◒", bundledAssetPath: "/debate/mystery/rooms/dining-room.webp", x: 18, y: 2, width: 7, height: 7, neighborIds: ["qa-v2-library", "qa-v2-greenhouse"] },
  { id: "qa-v2-observatory", name: "Upper Observatory Corridor", floor: 2, emoji: "◌", bundledAssetPath: "/debate/mystery/rooms/study.webp", x: 3, y: 3, width: 9, height: 7, neighborIds: ["qa-v2-foyer", "qa-v2-greenhouse"] },
  { id: "qa-v2-greenhouse", name: "Winter Greenhouse", floor: 2, emoji: "♧", bundledAssetPath: "/debate/mystery/rooms/conservatory.webp", x: 12, y: 3, width: 10, height: 7, neighborIds: ["qa-v2-observatory", "qa-v2-dining"] },
];

type FixtureControls = {
  theme: "light" | "dark";
  view: "mansion" | "room";
  foundItems: "one" | "many";
  dialogue: boolean;
  audioEnabled: boolean;
  audioVolume: number;
  repairId: number;
};

function fixtureRooms(): DebateMysteryRoomV2[] {
  return ROOM_DEFINITIONS.map((room) => ({
    ...room,
    templateId: room.id === "qa-v2-library" ? "library" : "foyer",
    imageId: null,
    sealedAsset: null,
    accessState: "visited",
    unlocked: true,
    visited: true,
    hotspots: room.id === "qa-v2-library" ? [
      { id: "qa-v2-letter", label: "unread letter", polygon: [{ x: 15, y: 24 }, { x: 35, y: 24 }, { x: 35, y: 54 }, { x: 15, y: 54 }], examined: false, unlocked: true },
      { id: "qa-v2-lamp", label: "reading lamp", polygon: [{ x: 65, y: 18 }, { x: 84, y: 18 }, { x: 84, y: 55 }, { x: 65, y: 55 }], examined: true, unlocked: true },
      // This generic empty area is deliberately not a hotspot: it must remain inert.
    ] : [],
  }));
}

function fixtureSession(args: FixtureControls, mansion?: DebateMysteryMansionSnapshotV2): DebateSessionV1 {
  const config = resolveDebateMysteryConfigV2({
    version: 2,
    preset: "custom",
    floors: 2,
    totalRooms: 5,
    difficulty: "classic",
    artMode: "bundled",
    trialType: "bench",
    inspiration: "A rainbound estate and a small, non-spoiler record test.",
    nonce: "qa-whodunnit-v2-fixture",
    suspectBotIds: FIXTURE_BOTS.slice(0, 4).map((bot) => bot.id),
    prosecutorBotId: FIXTURE_BOTS[4]!.id,
    rivalDefenseBotId: FIXTURE_BOTS[5]!.id,
    jurorBotIds: [],
  });
  if (mansion) config.mansionSnapshot = mansion;
  const rooms: DebateMysteryRoomV2[] = mansion ? mansion.rooms.map((room) => ({
    ...room, sealedAsset: null, accessState: "visited", unlocked: true, visited: true, hotspots: [],
  })) : fixtureRooms();
  const libraryId = mansion ? rooms[0]!.id : "qa-v2-library";
  const dialogue: DebateMysteryPublicDialogueEntryV2[] = args.dialogue ? [{
    nodeId: `room-introduction-${libraryId}-casekeeper`,
    lineId: null,
    delivery: "text_only",
    visibleText: "A fixture dialogue holds the room while the background remains unavailable.",
    speakerSeatId: null,
    speakerBotId: null,
    speakerKind: "narrator",
    occurredAt: "2026-09-02T00:00:00.000Z",
  }] : [];
  const record = [
    { reference: { kind: "evidence" as const, id: "qa-v2-admitted-note" }, title: "Admitted note", description: "A harmless public record item for the visual rail.", emoji: "✉", visualKind: "emoji" as const, imageId: null, sealedAsset: null, admitted: true, updatedAt: "2026-09-02T00:00:00.000Z" },
    { reference: { kind: "evidence" as const, id: "qa-v2-found-key" }, title: "Found brass key", description: "A fixture item with no case conclusion.", emoji: "🗝", visualKind: "emoji" as const, imageId: null, sealedAsset: null, admitted: true, updatedAt: "2026-09-02T00:00:00.000Z" },
    { reference: { kind: "evidence" as const, id: "qa-v2-found-card" }, title: "Found calling card", description: "A second harmless record item for rail density.", emoji: "▣", visualKind: "emoji" as const, imageId: null, sealedAsset: null, admitted: true, updatedAt: "2026-09-02T00:00:00.000Z" },
  ];
  const formatState = {
    version: 2,
    format: "whodunnit",
    playPhase: "investigation",
    compilation: { version: 2, jobId: "qa-v2-complete", stage: "complete", attempt: 1, completedPasses: 1, totalPasses: 1, preparedAudioCount: 0, requiredAudioCount: 0, substeps: [], retryable: false, spoilerSafeMessage: "Fixture ready.", startedAt: "2026-09-02T00:00:00.000Z", elapsedMs: 0, approximateRemainingMs: null, etaBasisPasses: 0, updatedAt: "2026-09-02T00:00:00.000Z" },
    caseTitle: mansion?.presentation.title ?? "The Fixture of Quiet Evidence",
    fictionLabel: "Fictional, non-canonical case",
    caseCharge: { version: 1, incidentId: "qa-v2-inquiry", kind: "theft", title: "Inquiry", subject: "the absent correspondence", accusationPrompt: "File a provisional account from the public record." },
    config,
    victim: { id: "qa-v2-victim", name: "The absent correspondent" },
    suspects: FIXTURE_BOTS.slice(0, 4).map((bot, index) => ({ seatId: `qa-v2-seat-${index + 1}`, botId: bot.id, exportHash: null, name: bot.name, color: bot.color, glyph: bot.glyph, roomId: ROOM_DEFINITIONS[index + 1]?.id ?? libraryId })),
    rooms,
    spatialProjection: null,
    mansionExterior: null,
    sceneRepairUndo: { version: 1, id: `qa-v2-repair-${args.repairId}`, action: "regenerate_evidence_asset", roomId: null, subjectId: "qa-v2-admitted-note", createdAt: "2026-09-02T00:00:00.000Z", assetSubjects: [] },
    crimeSceneRoomId: libraryId,
    openingSweepComplete: true,
    roomIntroductions: args.dialogue ? { [libraryId]: "casekeeper" as const } : { [libraryId]: "complete" as const },
    currentRoomId: libraryId,
    roomView: args.view,
    metSuspectSeatIds: ["qa-v2-seat-1"],
    discoveryIds: [],
    record: args.foundItems === "many" ? record : record.slice(0, 1),
    caseKit: [],
    topics: [{
      nodeId: "qa-v2-basil-alibi",
      suspectSeatId: "qa-v2-seat-2",
      label: "Ask about the reading gallery",
      subject: { category: "room" as const, roomId: libraryId },
      unlocked: true,
      completed: false,
    }],
    dialogueHistory: dialogue,
    identityMirrorTargetSnapshots: {},
    activeDialogueNodeId: null,
    theoryAvailable: true,
    theory: null,
    theoryFiledAt: null,
    court: null,
    verdict: null,
    readiness: { version: DEBATE_MYSTERY_PLAY_READINESS_VERSION, status: "ready", spoilerSafeMessage: "Fixture ready.", contractHash: "qa-v2", checkedAt: "2026-09-02T00:00:00.000Z" },
    audioReady: true,
    voicesEnabled: false,
    localAudioFailure: null,
    calloutHistory: [],
    pendingCallout: null,
    pendingProsecutionChoice: null,
  } satisfies DebateWhodunnitFormatStateV2;
  return {
    version: 1, id: "qa-whodunnit-v2-session", revision: args.repairId, status: "waiting_for_player", phase: "challenge", stepKey: "mystery_investigation", provider: "local", model: "qa-fixture", responseMode: "local", generationChain: [], format: "whodunnit", formatVersion: 1, formatState, formality: "plainspoken", setupPresetId: "custom", playerRole: "investigator", playerSideId: null, motion: {} as DebateSessionV1["motion"], evidence: {} as DebateSessionV1["evidence"], moderatorTitle: "The Court", moderatorName: "Fixture Court", moderator: { id: FIXTURE_BOTS[5]!.id, name: FIXTURE_BOTS[5]!.name } as DebateSessionV1["moderator"], forAdvocate: { id: FIXTURE_BOTS[4]!.id, name: FIXTURE_BOTS[4]!.name } as DebateSessionV1["forAdvocate"], againstAdvocate: { id: FIXTURE_BOTS[5]!.id, name: FIXTURE_BOTS[5]!.name } as DebateSessionV1["againstAdvocate"], advocacyConsent: [], powerPlan: { bots: {} } as DebateSessionV1["powerPlan"], caseBoard: [], ballots: [], jury: {} as DebateSessionV1["jury"], playerVerdict: null, winnerSideId: null, events: [], error: null, createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", endedEarlyAt: null, completedAt: null,
  };
}

export function WhodunnitV2Fixture({ mansion }: { mansion?: DebateMysteryMansionSnapshotV2 } = {}): React.JSX.Element {
  const [fixture, setFixture] = useState<FixtureControls>({ theme: "dark", view: "mansion", foundItems: "many", dialogue: false, audioEnabled: false, audioVolume: 0.7, repairId: 1 });
  const [session, setSession] = useState(() => fixtureSession(fixture, mansion));
  const [roomCompleteStarts, setRoomCompleteStarts] = useState(0);
  const controlsDisabled = false; // Exercise the real dialogue modal, not fixture-side disabling.
  const update = (patch: Partial<typeof fixture>): void => {
    if (controlsDisabled) return;
    const next = { ...fixture, ...patch };
    setFixture(next);
    setSession(fixtureSession(next, mansion));
    setRoomCompleteStarts(0);
  };
  const reset = (): void => {
    const next = { ...fixture, dialogue: false, view: "mansion" as const, foundItems: "many" as const, repairId: fixture.repairId + 1 };
    setFixture(next);
    setSession(fixtureSession(next, mansion));
    setRoomCompleteStarts(0);
  };

  return <main data-theme={fixture.theme} style={{ minHeight: "100vh", "--app-shell-top-nav-height": "90px", background: fixture.theme === "light" ? "#f4f0e7" : "#121018" } as React.CSSProperties}>
    <section aria-label="Whodunnit V2 visual fixture controls" style={{ height: 40, position: "sticky", top: 0, zIndex: 100, display: "flex", flexWrap: "wrap", gap: 8, padding: 10, background: fixture.theme === "light" ? "#fffcf5" : "#211d2b", color: fixture.theme === "light" ? "#1d1824" : "#f5efff", borderBottom: "1px solid currentColor" }}>
      <strong>V2 fixture</strong>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ theme: fixture.theme === "light" ? "dark" : "light" })}>Theme: {fixture.theme === "light" ? "Light" : "Dark"}</button>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ view: "mansion" })}>Map</button>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ view: "room" })}>Room</button>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ foundItems: fixture.foundItems === "one" ? "many" : "one" })}>Found items: {fixture.foundItems}</button>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ dialogue: true, view: "room" })}>Show dialogue</button>
      <button type="button" disabled={controlsDisabled} onClick={() => setFixture((current) => ({ ...current, audioEnabled: !current.audioEnabled }))}>Audio: {fixture.audioEnabled ? "On" : "Off"}</button>
      <label>Volume <input aria-label="Fixture audio volume" type="range" min="0" max="1" step="0.1" value={fixture.audioVolume} onChange={(event) => { const audioVolume = Number(event.currentTarget.value); setFixture((current) => ({ ...current, audioVolume })); }} /></label>
      <output aria-label="Room completion playback starts">Room ident starts: {roomCompleteStarts}</output>
      <button type="button" disabled={controlsDisabled} onClick={() => update({ repairId: fixture.repairId + 1 })}>New repair ID</button>
      <button type="button" onClick={reset}>Reset fixture</button>
      <small>{fixture.dialogue ? "Dialogue test: the native modal must block every background control." : "Synthetic only · North Dining Room → Talk → Ask about the reading gallery plays a held final witness reply."}</small>
    </section>
    <header style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 14px" }}>
      <div data-live-session-context-title-slot="true" />
      <div data-live-session-context-actions-slot="true" />
    </header>
    <DebateMysteryV2Play
      ownerId="qa-whodunnit-v2-in-memory"
      session={session}
      onSessionChange={setSession}
      onExit={() => undefined}
      bots={FIXTURE_BOTS}
      playerName="QA Investigator"
      theme={fixture.theme}
      audioEnabled={fixture.audioEnabled}
      audioVolume={fixture.audioVolume}
      onRoomCompleteCueStarted={() => setRoomCompleteStarts((count) => count + 1)}
      exteriorIntroStarted
      transcriptCopyState="idle"
      reviewCopyState="idle"
      onExteriorIntroStart={() => undefined}
      onCopyVerboseTranscript={async () => undefined}
      onCopyAllReviewData={async () => undefined}
      onSaveMansion={async () => undefined}
      onExportCase={async () => undefined}
      request={async <T,>(path: string, options?: RequestInit): Promise<T> => {
        if (path.endsWith("/mystery-room-art/upgrade")) return { version: 1, status: "unavailable", requiresUpgradeRoomIds: [], readyRoomIds: [], failedRoomIds: [], canUpgrade: false, reason: "The in-memory fixture has no synthesis." } as T;
        if (path.endsWith("/notebook")) return { notebook: { version: 2, revision: 1, leadAnnotations: [], suspectNotes: [], suspectPins: [] } } as T;
        if (path.endsWith("/mystery-action") && typeof options?.body === "string") {
          const action = JSON.parse(options.body) as { action?: string; roomId?: string; hotspotId?: string; suspectSeatId?: string; topicNodeId?: string };
          const state = session.formatState as DebateWhodunnitFormatStateV2;
          if (action.action === "advance_room_introduction") {
            setFixture((current) => ({ ...current, dialogue: false }));
            return { session: { ...session, revision: session.revision + 1, formatState: { ...state, roomIntroductions: { ...state.roomIntroductions, [state.currentRoomId!]: "complete" }, dialogueHistory: [] } } } as T;
          }
          if (action.action === "move") {
            const nextState = { ...state, roomView: action.roomId ? "room" as const : "mansion" as const, currentRoomId: action.roomId ?? state.currentRoomId };
            return { session: { ...session, revision: session.revision + 1, formatState: nextState } } as T;
          }
          if (action.action === "examine" && action.roomId === "qa-v2-library" && action.hotspotId) {
            const nextState = {
              ...state,
              rooms: state.rooms.map((room) => room.id !== action.roomId ? room : { ...room, hotspots: room.hotspots.map((hotspot) => hotspot.id === action.hotspotId ? { ...hotspot, examined: true } : hotspot) }),
              dialogueHistory: [...state.dialogueHistory, { nodeId: `examine-${action.hotspotId}`, lineId: null, delivery: "text_only" as const, visibleText: "The fixture records a small public observation. No hidden conclusion is implied.", speakerSeatId: null, speakerBotId: null, speakerKind: "narrator" as const, caseFileRelevant: true, occurredAt: new Date().toISOString() }],
            };
            return { session: { ...session, revision: session.revision + 1, formatState: nextState } } as T;
          }
          if (action.action === "talk" && action.suspectSeatId === "qa-v2-seat-2" && action.topicNodeId === "qa-v2-basil-alibi") {
            const nextState = {
              ...state,
              topics: state.topics.map((topic) => topic.nodeId === action.topicNodeId ? { ...topic, completed: true } : topic),
              dialogueHistory: [...state.dialogueHistory,
                { nodeId: "qa-v2-prosecutor-question", lineId: null, delivery: "text_only" as const, visibleText: "Basil, what did you notice in the reading gallery?", speakerSeatId: null, speakerBotId: FIXTURE_BOTS[4]!.id, speakerKind: "player" as const, occurredAt: new Date().toISOString() },
                { nodeId: "qa-v2-basil-final-answer", lineId: null, delivery: "text_only" as const, visibleText: "Only the lamp was lit.", speakerSeatId: "qa-v2-seat-2", speakerBotId: FIXTURE_BOTS[1]!.id, speakerKind: "bot" as const, occurredAt: new Date().toISOString() },
              ],
            };
            return { session: { ...session, revision: session.revision + 1, formatState: nextState } } as T;
          }
          throw new Error(`Fixture action '${action.action ?? "unknown"}' is intentionally unsupported.`);
        }
        throw new Error(`Fixture request rejected: ${path}`);
      }}
      renderBotGlyph={(glyph, options) => <span className={options?.className} aria-hidden="true">{glyph ?? "◇"}</span>}
      renderMysteryBotAvatar={(bot, presentation) => <span aria-label={bot.name} style={{ display: "grid", width: "100%", height: "100%", minHeight: presentation === "full" ? "16rem" : "8rem", placeItems: "center", color: bot.color ?? "#a98cff", fontSize: presentation === "full" ? "7rem" : "4rem", textShadow: "0 0 2rem currentColor" }}>{bot.glyph ?? "◇"}</span>}
    />
  </main>;
}
