import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

import {
  DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO,
  DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO,
  DEBATE_MYSTERY_EVIDENCE_CHIME,
  DEBATE_MYSTERY_SFX_COOLDOWN_MS,
  debateMysteryCaptionFallbackShouldStart,
  debateMysteryDialoguePresentationDismissed,
  debateMysteryDeskItemSfxPlan,
  debateMysteryPreparedAudioShouldStart,
  debateMysteryRestoredAudioPerformanceKeyV2,
  debateMysterySfxCueForAction,
  debateMysterySfxVoices,
  debateMysteryTextVoiceModeForPresentation,
  debateMysteryTextVoiceShouldStart,
  debateMysteryTextVoiceShouldStop,
  playDebateMysteryTextVoice,
  playDebateMysteryDeskItemSfx,
  playDebateMysterySfx,
} from "./debateMysterySfx.ts";

test("keeps the durable Archive checkpoint quiet without muting the next case beat", () => {
  const restoredKey = debateMysteryRestoredAudioPerformanceKeyV2({
    playPhase: "investigation",
    dialogueHistory: [{
      lineId: "line-briefing",
      nodeId: "briefing-opening",
      occurredAt: "2026-08-30T20:00:00.000Z",
    }],
    court: null,
  });
  assert.equal(
    restoredKey,
    "briefing-opening:2026-08-30T20:00:00.000Z:line-briefing",
  );
  const playable = {
    audioEnabled: true,
    audioVolume: 0.8,
    interrogationAudioMayStart: true,
    lastPlayedPerformanceKey: null,
    lineId: "line-briefing",
    playbackPerformanceKey: restoredKey!,
    restoredPerformanceKey: restoredKey,
    voicesEnabled: true,
  };
  assert.equal(debateMysteryPreparedAudioShouldStart(playable), false);
  assert.equal(
    debateMysteryPreparedAudioShouldStart({
      ...playable,
      lineId: "line-new-answer",
      playbackPerformanceKey: "talk-answer:next:line-new-answer",
    }),
    true,
    "a newly created dialogue line remains audible",
  );
  assert.equal(
    debateMysteryPreparedAudioShouldStart({
      ...playable,
      lastPlayedPerformanceKey: restoredKey,
      restoredPerformanceKey: null,
    }),
    false,
    "ordinary rerenders still cannot replay the current line",
  );
});

test("holds streamed text for prepared Babble until the local clip starts or fails", () => {
  assert.equal(debateMysteryCaptionFallbackShouldStart({
    preparedAudioExpected: true,
    preparedAudioStatus: "idle",
  }), false);
  assert.equal(debateMysteryCaptionFallbackShouldStart({
    preparedAudioExpected: true,
    preparedAudioStatus: "pending",
  }), false);
  assert.equal(debateMysteryCaptionFallbackShouldStart({
    preparedAudioExpected: true,
    preparedAudioStatus: "started",
  }), false);
  assert.equal(debateMysteryCaptionFallbackShouldStart({
    preparedAudioExpected: true,
    preparedAudioStatus: "unavailable",
  }), true);
  assert.equal(debateMysteryCaptionFallbackShouldStart({
    preparedAudioExpected: false,
    preparedAudioStatus: "idle",
  }), true);
});

test("captures the active trial statement as the restored audio checkpoint", () => {
  assert.equal(
    debateMysteryRestoredAudioPerformanceKeyV2({
      playPhase: "trial",
      dialogueHistory: [],
      court: {
        activeStatementId: "statement-2",
        statements: [
          { lineId: "line-1", statementId: "statement-1", version: 1 },
          { lineId: "line-2", statementId: "statement-2", version: 3 },
        ],
      },
    }),
    "statement:statement-2:3:line-2",
  );
});

test("starts the selected text voice once and never replaces anonymous Casekeeper Babble", () => {
  const narratorBeat = {
    audible: false,
    delivery: "text_only" as const,
    key: "observation:1",
    mode: "bottish" as const,
    playerObservation: false,
    startedKey: null,
    startedMode: null,
    streaming: true,
    visibleText: "The kn",
  };
  assert.equal(debateMysteryTextVoiceShouldStart(narratorBeat), true);
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, visibleText: "   " }),
    false,
    "whitespace-only text stays quiet",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({
      ...narratorBeat,
      startedKey: narratorBeat.key,
      startedMode: "bottish",
    }),
    false,
    "one text presentation starts only once",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, delivery: "anonymous_babble" }),
    false,
    "anonymous speakers own a prepared Babble carrier instead",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, delivery: "spoken" }),
    false,
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, audible: true }),
    false,
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, streaming: false }),
    false,
  );
  const playerObservation = {
    ...narratorBeat,
    mode: "babble" as const,
    playerObservation: true,
    visibleText: "The n",
  };
  assert.equal(
    debateMysteryTextVoiceShouldStart(playerObservation),
    true,
    "player Babble acquires the line while its visible caption is streaming",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...playerObservation, streaming: false }),
    false,
    "player Babble never starts late after the caption has completed",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStart({ ...narratorBeat, mode: "off" }),
    false,
  );
  assert.equal(DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO, 0.28);
});

test("uses player Babble for observations while preserving an explicit Off choice", () => {
  assert.equal(debateMysteryTextVoiceModeForPresentation({
    configuredMode: "bottish",
    playerObservation: true,
  }), "babble");
  assert.equal(debateMysteryTextVoiceModeForPresentation({
    configuredMode: "babble",
    playerObservation: true,
  }), "babble");
  assert.equal(debateMysteryTextVoiceModeForPresentation({
    configuredMode: "off",
    playerObservation: true,
  }), "off");
  assert.equal(debateMysteryTextVoiceModeForPresentation({
    configuredMode: "bottish",
    playerObservation: false,
  }), "bottish");
});

test("stops the active text voice on completion, replacement, or mode change without touching TTS", () => {
  const activeTextBeat = {
    audible: false,
    delivery: "text_only" as const,
    key: "observation:1",
    mode: "bottish" as const,
    playerObservation: false,
    startedKey: "observation:1",
    startedMode: "bottish" as const,
    streaming: true,
  };
  assert.equal(debateMysteryTextVoiceShouldStop(activeTextBeat), false);
  assert.equal(
    debateMysteryTextVoiceShouldStop({ ...activeTextBeat, streaming: false }),
    true,
    "the final visible character ends Bottish",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStop({
      ...activeTextBeat,
      mode: "babble",
      playerObservation: true,
      startedMode: "babble",
      streaming: false,
    }),
    false,
    "a player observation keeps Babble alive until its explicit dismissal",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStop({ ...activeTextBeat, key: "observation:2" }),
    true,
    "replacement cancels the previous carrier",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStop({ ...activeTextBeat, key: null }),
    true,
    "navigation or a phase transition releases the carrier",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStop({
      audible: true,
      delivery: "spoken",
      key: "statement:1",
      mode: "babble",
      playerObservation: false,
      startedKey: null,
      startedMode: null,
      streaming: true,
    }),
    false,
    "spoken TTS never acquires text-Bottish ownership",
  );
  assert.equal(
    debateMysteryTextVoiceShouldStop({ ...activeTextBeat, mode: "babble" }),
    true,
    "switching modes cancels the old carrier before starting the new one",
  );
});

test("dispatches Babble, Bottish, and Off through one bounded presentation contract", async () => {
  const playerVoiceProfile = {
    ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    baseVoiceId: "voice-8" as const,
  };
  const played: Array<{
    instant?: boolean;
    mode: "babble" | "bottish";
    voiceProfile: BotAudioVoiceProfileV1 | null;
    seed: string;
    signal?: AbortSignal;
    text: string;
    volume: number;
  }> = [];
  const play = async (args: {
    instant?: boolean;
    mode: "babble" | "bottish";
    voiceProfile: BotAudioVoiceProfileV1 | null;
    seed: string;
    signal?: AbortSignal;
    text: string;
    volume: number;
  }) => {
    played.push(args);
    return true;
  };
  assert.equal(await playDebateMysteryTextVoice({
    enabled: true,
    mode: "babble",
    voiceProfile: null,
    seed: "missing-player-voice",
    text: "The corridor answers.",
    volume: 0.5,
    play,
  }), false, "player Babble never falls through to Heart/default voice");
  assert.equal(played.length, 0);
  for (const mode of ["babble", "bottish"] as const) {
    assert.equal(await playDebateMysteryTextVoice({
      enabled: true,
      instant: mode === "babble",
      mode,
      voiceProfile: playerVoiceProfile,
      seed: "casekeeper",
      text: "The corridor answers.",
      volume: 0.5,
      play,
    }), true);
  }
  assert.equal(await playDebateMysteryTextVoice({
    enabled: true,
    mode: "off",
    voiceProfile: playerVoiceProfile,
    seed: "casekeeper",
    text: "The corridor answers.",
    volume: 0.5,
    play,
  }), false);
  assert.deepEqual(played, [
    {
      instant: true,
      mode: "babble",
      voiceProfile: playerVoiceProfile,
      seed: "casekeeper",
      signal: undefined,
      text: "The corridor answers.",
      volume: 0.14,
      roomAcoustics: undefined,
    },
    {
      instant: false,
      mode: "bottish",
      voiceProfile: playerVoiceProfile,
      seed: "casekeeper",
      signal: undefined,
      text: "The corridor answers.",
      volume: 0.14,
      roomAcoustics: undefined,
    },
  ]);
});

test("dismisses every completed dialogue presentation without treating its first mount as a close", () => {
  assert.equal(debateMysteryDialoguePresentationDismissed(null, "opening"), false);
  assert.equal(debateMysteryDialoguePresentationDismissed("opening", "opening"), false);
  assert.equal(debateMysteryDialoguePresentationDismissed("opening", "observation"), true);
  assert.equal(debateMysteryDialoguePresentationDismissed("observation", null), true);
  assert.equal(DEBATE_MYSTERY_SFX_COOLDOWN_MS["dialogue-dismiss"], 0);
  assert.equal("dialogue-blip" in DEBATE_MYSTERY_SFX_COOLDOWN_MS, false);
});

test("builds the evidence discovery cue as a restrained descending chime", () => {
  assert.equal(DEBATE_MYSTERY_EVIDENCE_CHIME.length, 3);
  assert.deepEqual(
    DEBATE_MYSTERY_EVIDENCE_CHIME.map((voice) => voice.delayMs),
    [0, 135, 320],
  );
  assert.ok(
    DEBATE_MYSTERY_EVIDENCE_CHIME.every(
      (voice, index, voices) =>
        index === 0 || voice.playbackRate < voices[index - 1]!.playbackRate,
    ),
  );
  assert.ok(
    DEBATE_MYSTERY_EVIDENCE_CHIME.every(
      (voice, index, voices) => index === 0 || voice.gain < voices[index - 1]!.gain,
    ),
  );

  for (const voice of DEBATE_MYSTERY_EVIDENCE_CHIME) {
    const asset = statSync(new URL(`../../public${voice.url}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 7_000);
  }
});

test("gives newly acquired evidence priority over ordinary action navigation", () => {
  assert.equal(
    debateMysterySfxCueForAction({
      action: "travel",
      acquiredEvidence: true,
      nextPlayPhase: "investigation",
    }),
    "evidence",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "travel",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    "navigate",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "begin_interview",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    "enter",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "end_activity",
      acquiredEvidence: false,
      nextPlayPhase: "theory",
    }),
    "theory",
  );
  assert.equal(
    debateMysterySfxCueForAction({
      action: "inspect",
      acquiredEvidence: false,
      nextPlayPhase: "investigation",
    }),
    null,
  );
  assert.equal(debateMysterySfxVoices("evidence").length, 3);
  assert.equal(debateMysterySfxVoices("map").length, 1);
  assert.equal(debateMysterySfxVoices("dialogue-dismiss").length, 1);
  assert.equal(debateMysterySfxVoices("paper").length, 1);
  assert.equal(debateMysterySfxVoices("paper-pickup").length, 1);
  assert.equal(debateMysterySfxVoices("paper-place").length, 1);
  assert.equal(debateMysterySfxVoices("folder").length, 1);
  assert.equal(debateMysterySfxVoices("clip").length, 1);
  assert.equal(debateMysterySfxVoices("pencil").length, 1);
});

test("uses compact, distinct paper recordings for Desk pickup and placement", () => {
  const pickup = debateMysterySfxVoices("paper-pickup")[0]!;
  const placement = debateMysterySfxVoices("paper-place")[0]!;
  assert.equal(pickup.url, "/audio/debate/desk-paper-pickup-01.mp3");
  assert.equal(placement.url, "/audio/debate/desk-paper-place-01.mp3");
  assert.notEqual(pickup.playbackRate, placement.playbackRate);
  for (const voice of [pickup, placement]) {
    const asset = statSync(new URL(`../../public${voice.url}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 7_000);
  }
});

test("uses one physical evidence impact with pickup at exactly half placement volume", () => {
  const item = { adjective: "Brass", object: "key", title: "A brass key" };
  const pickup = debateMysteryDeskItemSfxPlan({ item, moment: "pickup", volume: 0.8 });
  const placement = debateMysteryDeskItemSfxPlan({ item, moment: "place", volume: 0.8 });
  assert.equal(DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO, 0.5);
  assert.equal(pickup.material, "metal");
  assert.equal(pickup.url, placement.url);
  assert.equal(pickup.trim, placement.trim);
  assert.equal(pickup.volume, placement.volume * 0.5);
});

test("keeps every Whodunnit cue behind the shared Audio controls", async () => {
  assert.equal(
    await playDebateMysterySfx({
      cue: "evidence",
      enabled: false,
      volume: 1,
    }),
    false,
  );
  assert.equal(
    await playDebateMysterySfx({
      cue: "navigate",
      enabled: true,
      volume: 0,
    }),
    false,
  );
  assert.equal(
    await playDebateMysteryDeskItemSfx({
      item: { adjective: "Cracked", object: "mug" },
      moment: "place",
      enabled: false,
      volume: 1,
    }),
    false,
  );
});
