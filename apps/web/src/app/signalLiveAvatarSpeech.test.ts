import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botFaceCustomSpeechGlyphForMouthShape,
  replayMouthShapeAtV2,
  type BotcastMessage,
  type ReplayManifestV2,
  type ReplayMouthCueV2,
} from "@localai/shared";

import {
  applyBotcastSpeechRevealSegmentTiming,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
} from "./botcastSpeechReveal.ts";
import { coffeeSeatRenderedMouthGlyph } from "./coffee-seat-rendered-mouth.ts";
import {
  signalLiveActiveMessage,
  signalLivePrimaryAvatarSpeech,
  signalLiveSpeechIsActiveAtElapsedMs,
  signalLiveSpeechPlaybackIsOwned,
  signalLiveSpeechProjectedElapsedMs,
  signalResponseCueMouthShapeAt,
  signalVocalActionMouthShapeAtElapsedMs,
  type SignalResponseCueSpeechState,
  type SignalLiveSpeechState,
} from "./signalLiveAvatarSpeech.ts";
import { zenLiveActionPlateFace } from "./zenLiveActions.ts";

function standardRenderedMouthGlyph(
  shape: ReturnType<typeof signalLivePrimaryAvatarSpeech>["mouthShape"],
): string {
  const baseGlyph = Array.from(
    zenLiveActionPlateFace("neutral", shape).text,
  ).at(-1);
  assert.ok(baseGlyph);
  return coffeeSeatRenderedMouthGlyph({ baseGlyph });
}

function message(
  id: string,
  content: string,
  speakerRole: "host" | "guest" = "host",
): BotcastMessage {
  return {
    id,
    episodeId: "episode-1",
    speakerRole,
    botId: `${speakerRole}-bot`,
    content,
    stageActionText: null,
    voicePerformanceText: null,
    moodKey: "neutral",
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

function liveSpeech(
  activeMessage: BotcastMessage,
  elapsedMs: number,
  options: { audible?: boolean; durationMs?: number } = {},
): SignalLiveSpeechState {
  const durationMs = options.durationMs ?? 2_400;
  return {
    messageId: activeMessage.id,
    message: activeMessage,
    audible: options.audible ?? true,
    reveal: updateBotcastSpeechReveal(
      startBotcastSpeechReveal({
        text: activeMessage.content,
        durationMs,
      }),
      elapsedMs,
    ),
  };
}

function chunkedLiveSpeech(
  activeMessage: BotcastMessage,
  elapsedMs: number,
): SignalLiveSpeechState {
  const sourceCharacters = Array.from(activeMessage.content);
  const firstEnd = Math.max(1, activeMessage.content.indexOf(" while"));
  let reveal = startBotcastSpeechReveal({
    text: activeMessage.content,
    durationMs: 6_400,
    segmentClock: true,
    segmentTimings: [],
  });
  reveal = applyBotcastSpeechRevealSegmentTiming(reveal, {
    kind: "speech",
    sourceStart: 0,
    sourceEnd: firstEnd,
    startMs: 0,
    endMs: 2_400,
    heard: true,
  });
  reveal = applyBotcastSpeechRevealSegmentTiming(reveal, {
    kind: "speech",
    sourceStart: firstEnd,
    sourceEnd: firstEnd,
    startMs: 2_400,
    endMs: 2_800,
    heard: false,
  });
  reveal = applyBotcastSpeechRevealSegmentTiming(reveal, {
    kind: "speech",
    sourceStart: firstEnd,
    sourceEnd: sourceCharacters.length,
    startMs: 2_800,
    endMs: 6_400,
    heard: true,
  });
  return {
    messageId: activeMessage.id,
    message: activeMessage,
    audible: true,
    reveal: updateBotcastSpeechReveal(reveal, elapsedMs),
  };
}

describe("Signal live avatar speech", () => {
  it("keeps ordinary primary speech owned when only the next turn becomes ready", () => {
    assert.equal(
      signalLiveSpeechPlaybackIsOwned({
        messageId: "current-line",
        activeSpeechMessageId: "current-line",
        operationCurrent: false,
        audibleHandoffMessageId: null,
        voiceChannel: "primary",
      }),
      true,
    );
    assert.equal(
      signalLiveSpeechPlaybackIsOwned({
        messageId: "current-line",
        activeSpeechMessageId: null,
        operationCurrent: false,
        audibleHandoffMessageId: null,
        voiceChannel: "primary",
      }),
      false,
      "an explicit stop clears audible ownership",
    );
    assert.equal(
      signalLiveSpeechPlaybackIsOwned({
        messageId: "incoming-handoff",
        activeSpeechMessageId: "incoming-handoff",
        operationCurrent: false,
        audibleHandoffMessageId: null,
        voiceChannel: "handoff",
      }),
      false,
      "handoff speech still requires live operation or explicit handoff ownership",
    );
  });

  it("keeps the exact lifecycle message when the committed episode snapshot lags", () => {
    const prior = message("prior", "The previous line.", "guest");
    const active = message(
      "active",
      "Correction belongs to the words the audience can hear.",
    );
    const speech = liveSpeech(active, 360);

    assert.equal(
      signalLiveActiveMessage({
        liveSpeech: speech,
        speakingMessageId: active.id,
        episodeMessages: [prior],
      }),
      active,
    );
    assert.equal(
      signalLivePrimaryAvatarSpeech({ liveSpeech: speech, role: "host" })
        .talking,
      true,
    );
  });

  it("changes the live mouth across an audible standard-face utterance", () => {
    const active = message(
      "active",
      "Correction belongs to every clearly articulated vowel and consonant.",
    );
    const shapes = new Set(
      [80, 360, 720, 1_080, 1_440, 1_800].map(
        (elapsedMs) =>
          signalLivePrimaryAvatarSpeech({
            liveSpeech: liveSpeech(active, elapsedMs),
            role: "host",
          }).mouthShape,
      ),
    );

    assert.ok(shapes.size > 1, "audible progress must produce visible visemes");
    const standardMouthGlyphs = new Set(
      Array.from(shapes, (shape) =>
        zenLiveActionPlateFace("neutral", shape).text,
      ),
    );
    assert.ok(
      standardMouthGlyphs.size > 1,
      "a standard viseme mouth such as Correction Connie's must visibly change glyphs",
    );
  });

  it("articulates a spoken response cue from its live audible clock", () => {
    let audibleElapsedMs = 0;
    const speech: SignalResponseCueSpeechState = {
      surface: "signal",
      sessionId: "episode-1",
      responseId: "response-1",
      speakerBotId: "host-bot",
      text: "One moment.",
      durationMs: 1_200,
      alignment: null,
      clock: {
        messageId: "response-1",
        elapsedMs: 0,
        observedAtMs: 10_000,
        readElapsedMs: () => audibleElapsedMs,
      },
    };
    const shapes = new Set(
      [80, 260, 480, 720, 960].map((elapsedMs) => {
        audibleElapsedMs = elapsedMs;
        return signalResponseCueMouthShapeAt({
          speech,
          botId: "host-bot",
          nowMs: 99_000,
        });
      }),
    );

    assert.ok(shapes.size > 1);
    assert.ok(Array.from(shapes).some((shape) => shape !== "closed"));
    assert.equal(
      signalResponseCueMouthShapeAt({
        speech,
        botId: "guest-bot",
        nowMs: 99_000,
      }),
      "closed",
    );
  });

  it("gives heard vocal actions physical action-specific mouth envelopes", () => {
    assert.equal(
      signalVocalActionMouthShapeAtElapsedMs({
        action: "exhales",
        elapsedMs: 240,
        durationMs: 800,
      }),
      "open-round",
    );
    assert.equal(
      signalVocalActionMouthShapeAtElapsedMs({
        action: "coughs",
        elapsedMs: 240,
        durationMs: 800,
      }),
      "open-wide",
    );

    const active = message("vocal-action", "Behind that answer is a cost.");
    let reveal = startBotcastSpeechReveal({
      text: active.content,
      durationMs: 1_600,
      segmentClock: true,
      segmentTimings: [],
    });
    reveal = applyBotcastSpeechRevealSegmentTiming(reveal, {
      kind: "vocal-action",
      action: "exhales",
      sourceStart: 0,
      sourceEnd: 0,
      startMs: 0,
      endMs: 600,
      heard: true,
    });
    const live: SignalLiveSpeechState = {
      messageId: active.id,
      message: active,
      audible: true,
      reveal: updateBotcastSpeechReveal(reveal, 300),
    };
    assert.notEqual(
      signalLivePrimaryAvatarSpeech({ liveSpeech: live, role: "host" })
        .mouthShape,
      "closed",
    );
    assert.equal(
      signalLiveSpeechIsActiveAtElapsedMs({ liveSpeech: live, role: "host" }),
      true,
    );

    const silent: SignalLiveSpeechState = {
      ...live,
      reveal: applyBotcastSpeechRevealSegmentTiming(
        startBotcastSpeechReveal({
          text: active.content,
          durationMs: 1_600,
          segmentClock: true,
          segmentTimings: [],
        }),
        {
          kind: "vocal-action",
          action: "exhales",
          sourceStart: 0,
          sourceEnd: 0,
          startMs: 0,
          endMs: 600,
          heard: false,
        },
      ),
    };
    silent.reveal = updateBotcastSpeechReveal(silent.reveal, 300);
    assert.equal(
      signalLivePrimaryAvatarSpeech({ liveSpeech: silent, role: "host" })
        .mouthShape,
      "closed",
    );
  });

  it("keeps host and guest visemes advancing when audio progress frames stall", () => {
    for (const role of ["host", "guest"] as const) {
      const active = message(
        `${role}-stalled-progress`,
        "Every audible Signal sentence needs more than one visible mouth pose.",
        role,
      );
      const speech = liveSpeech(active, 0, { durationMs: 2_800 });
      const clock = {
        messageId: active.id,
        elapsedMs: 0,
        observedAtMs: 1_000,
      };
      const elapsedSamples = [1_080, 1_360, 1_720, 2_080].map((nowMs) =>
        signalLiveSpeechProjectedElapsedMs({
          liveSpeech: speech,
          clock,
          nowMs,
        }),
      );
      const shapes = new Set(
        elapsedSamples.map(
          (elapsedMs) =>
            signalLivePrimaryAvatarSpeech({
              liveSpeech: speech,
              role,
              elapsedMs,
            }).mouthShape,
        ),
      );

      assert.deepEqual(elapsedSamples, [80, 360, 720, 1_080]);
      assert.ok(
        shapes.size > 1,
        `${role} must keep animating between sparse audio callbacks`,
      );
      assert.equal(
        signalLivePrimaryAvatarSpeech({
          liveSpeech: speech,
          role: role === "host" ? "guest" : "host",
          elapsedMs: elapsedSamples[2],
        }).mouthShape,
        "closed",
      );
    }
  });

  it("samples the premium audible clock instead of projecting wall time", () => {
    const active = message("premium-clock", "Audible timing owns this mouth.", "host");
    const speech = liveSpeech(active, 200, { durationMs: 2_800 });
    let audibleElapsedMs = 320;
    const clock = {
      messageId: active.id,
      elapsedMs: 200,
      observedAtMs: 1_000,
      readElapsedMs: () => audibleElapsedMs,
    };
    assert.equal(
      signalLiveSpeechProjectedElapsedMs({ liveSpeech: speech, clock, nowMs: 2_000 }),
      320,
    );
    audibleElapsedMs = 740;
    assert.equal(
      signalLiveSpeechProjectedElapsedMs({ liveSpeech: speech, clock, nowMs: 2_000 }),
      740,
    );
  });

  it("keeps built-in English voices moving before any segment timing exists", () => {
    for (const role of ["host", "guest"] as const) {
      const active = message(
        `${role}-builtin`,
        "Built-in speech still needs visible mouth motion without provider alignment.",
        role,
      );
      const reveal = startBotcastSpeechReveal({
        text: active.content,
        durationMs: 3_200,
        segmentClock: true,
        segmentTimings: [],
      });
      const frames = [80, 360, 720, 1_080, 1_440, 1_800].map(
        (elapsedMs) =>
          signalLivePrimaryAvatarSpeech({
            liveSpeech: {
              messageId: active.id,
              message: active,
              audible: true,
              reveal: updateBotcastSpeechReveal(reveal, elapsedMs),
            },
            role,
          }),
      );
      const renderedGlyphs = new Set(
        frames.map((frame) => standardRenderedMouthGlyph(frame.mouthShape)),
      );

      assert.ok(frames.every((frame) => frame.talking));
      assert.ok(
        renderedGlyphs.size >= 2,
        `${role} must paint multiple glyphs before built-in English publishes any segment timing`,
      );
      assert.deepEqual(
        signalLivePrimaryAvatarSpeech({
          liveSpeech: {
            messageId: active.id,
            message: active,
            audible: true,
            reveal: updateBotcastSpeechReveal(reveal, 720),
          },
          role: role === "host" ? "guest" : "host",
        }),
        { talking: false, mouthShape: "closed" },
      );
    }
  });

  it("keeps host and guest renderer glyphs advancing after partial segment timing arrives", () => {
    for (const role of ["host", "guest"] as const) {
      const active = message(
        `${role}-partial-alignment`,
        "Bright vowels and crisp closures keep changing while later words are still being synthesized.",
        role,
      );
      const frames = [80, 320, 640, 960, 1_280, 1_600, 1_920, 2_200].map(
        (elapsedMs) =>
          signalLivePrimaryAvatarSpeech({
            liveSpeech: chunkedLiveSpeech(active, elapsedMs),
            role,
          }),
      );
      assert.equal(
        chunkedLiveSpeech(active, 960).reveal.alignment,
        null,
        "partial chunk timing must never masquerade as full provider alignment",
      );
      const renderedGlyphs = new Set(
        frames.map((frame) => standardRenderedMouthGlyph(frame.mouthShape)),
      );

      assert.ok(frames.every((frame) => frame.talking));
      assert.ok(
        renderedGlyphs.size >= 2,
        `${role} must send at least two distinct glyphs to the avatar renderer`,
      );
      assert.deepEqual(
        signalLivePrimaryAvatarSpeech({
          liveSpeech: chunkedLiveSpeech(active, 960),
          role: role === "host" ? "guest" : "host",
        }),
        { talking: false, mouthShape: "closed" },
      );
    }
  });

  it("closes genuine chunk silence and resumes renderer glyph motion afterward", () => {
    const active = message(
      "chunk-gap",
      "Bright vowels and crisp closures keep changing while later words resume after a real pause.",
    );
    assert.deepEqual(
      signalLivePrimaryAvatarSpeech({
        liveSpeech: chunkedLiveSpeech(active, 2_700),
        role: "host",
      }),
      { talking: true, mouthShape: "closed" },
    );
    assert.equal(
      signalLiveSpeechIsActiveAtElapsedMs({
        liveSpeech: chunkedLiveSpeech(active, 2_700),
        role: "host",
      }),
      false,
      "a true synthesized clause gap must settle semantic speaking lights",
    );

    const resumedGlyphs = new Set(
      [2_960, 3_280, 3_680, 4_120, 4_640, 5_200].map((elapsedMs) =>
        standardRenderedMouthGlyph(
          signalLivePrimaryAvatarSpeech({
            liveSpeech: chunkedLiveSpeech(active, elapsedMs),
            role: "host",
          }).mouthShape,
        ),
      ),
    );
    assert.ok(resumedGlyphs.size >= 2);
    assert.equal(
      signalLiveSpeechIsActiveAtElapsedMs({
        liveSpeech: chunkedLiveSpeech(active, 3_280),
        role: "host",
      }),
      true,
    );
  });

  it("keeps semantic activity through a brief closed-mouth phoneme", () => {
    const active = message("brief-closure", "mmm", "host");
    const speech = liveSpeech(active, 500, { durationMs: 1_000 });
    assert.equal(
      signalLivePrimaryAvatarSpeech({ liveSpeech: speech, role: "host" })
        .mouthShape,
      "speech-closed",
    );
    assert.equal(
      signalLiveSpeechIsActiveAtElapsedMs({ liveSpeech: speech, role: "host" }),
      true,
      "a viseme closure inside continuous speech must not strobe lights",
    );
  });

  it("replays the same captured renderer shapes for both participants", () => {
    const mouthTracks = (["host", "guest"] as const).map((role) => {
      const active = message(
        `${role}-recorded`,
        "Bright vowels and crisp closures keep changing while replay preserves every painted pose.",
        role,
      );
      const cues: ReplayMouthCueV2[] = [];
      for (const atMs of [80, 320, 640, 960, 1_280, 1_600, 1_920, 2_200]) {
        const shape = signalLivePrimaryAvatarSpeech({
          liveSpeech: chunkedLiveSpeech(active, atMs),
          role,
        }).mouthShape;
        if (cues.at(-1)?.shape !== shape) cues.push({ atMs, shape });
      }
      cues.push({ atMs: 2_400, shape: "closed" });
      return { participantId: `${role}-bot`, cues };
    });
    const manifest = {
      presentation: { mouthTracks },
    } as ReplayManifestV2;

    for (const role of ["host", "guest"] as const) {
      const replayGlyphs = new Set(
        [80, 320, 640, 960, 1_280, 1_600, 1_920, 2_200].map((atMs) => {
          const shape = replayMouthShapeAtV2(
            manifest,
            `${role}-bot`,
            atMs,
          );
          assert.ok(shape);
          return standardRenderedMouthGlyph(shape);
        }),
      );
      assert.ok(
        replayGlyphs.size >= 2,
        `${role}'s faithful replay must repaint the captured glyph sequence`,
      );
      assert.equal(
        replayMouthShapeAtV2(manifest, `${role}-bot`, 2_400),
        "closed",
      );
    }
  });

  it("preserves built-in, custom mouth, and Custom Speech renderer paths", () => {
    const active = message(
      "renderer-paths",
      "Bright vowels and crisp closures keep changing while every authored mouth path stays intact.",
    );
    const shapes = [80, 320, 640, 960, 1_280, 1_600, 1_920, 2_200].map(
      (elapsedMs) =>
        signalLivePrimaryAvatarSpeech({
          liveSpeech: chunkedLiveSpeech(active, elapsedMs),
          role: "host",
        }).mouthShape,
    );
    const builtInGlyphs = new Set(shapes.map(standardRenderedMouthGlyph));
    const defaultCustomMouthGlyphs = new Set(
      shapes.map((shape) =>
        coffeeSeatRenderedMouthGlyph({
          baseGlyph: standardRenderedMouthGlyph(shape),
          // Default custom-mouth motion deliberately yields to live visemes.
          renderedFaceMouthCharacter: null,
        }),
      ),
    );
    const animatedCustomMouthGlyphs = new Set(
      shapes.map((shape) =>
        coffeeSeatRenderedMouthGlyph({
          baseGlyph: standardRenderedMouthGlyph(shape),
          renderedFaceMouthCharacter: "△",
        }),
      ),
    );
    const poses = ["—", "·", "△", "○"] as const;
    const customSpeechGlyphs = new Set(
      shapes.map((shape) =>
        coffeeSeatRenderedMouthGlyph({
          baseGlyph: standardRenderedMouthGlyph(shape),
          customSpeechGlyph: botFaceCustomSpeechGlyphForMouthShape(
            poses,
            shape,
          ),
          renderedFaceMouthCharacter: "x",
        }),
      ),
    );

    assert.ok(builtInGlyphs.size >= 2);
    assert.deepEqual(defaultCustomMouthGlyphs, builtInGlyphs);
    assert.deepEqual(animatedCustomMouthGlyphs, new Set(["△"]));
    assert.ok(customSpeechGlyphs.size >= 2);
  });

  it("keeps silent fallback, semantic silence, and the other role closed", () => {
    const active = message("active", "A genuinely audible line.");
    assert.deepEqual(
      signalLivePrimaryAvatarSpeech({
        liveSpeech: liveSpeech(active, 500, { audible: false }),
        role: "host",
      }),
      { talking: false, mouthShape: "closed" },
    );
    assert.deepEqual(
      signalLivePrimaryAvatarSpeech({
        liveSpeech: liveSpeech(message("silent", "..."), 500),
        role: "host",
      }),
      { talking: false, mouthShape: "closed" },
    );
    assert.deepEqual(
      signalLivePrimaryAvatarSpeech({
        liveSpeech: liveSpeech(active, 500),
        role: "guest",
      }),
      { talking: false, mouthShape: "closed" },
    );
  });

  it("keeps a true aligned phrase pause closed without ending the utterance", () => {
    const active = message("active", "Hello, world.");
    const speech: SignalLiveSpeechState = {
      messageId: active.id,
      message: active,
      audible: true,
      reveal: updateBotcastSpeechReveal(
        startBotcastSpeechReveal({
          text: active.content,
          durationMs: 1_400,
          alignment: {
            characters: Array.from(active.content),
            characterStartTimesSeconds: Array.from(active.content).map(
              (_character, index) =>
                index < 6 ? index * 0.04 : 0.8 + index * 0.04,
            ),
            characterEndTimesSeconds: Array.from(active.content).map(
              (_character, index) =>
                (index < 6 ? index * 0.04 : 0.8 + index * 0.04) + 0.03,
            ),
          },
        }),
        600,
      ),
    };

    assert.deepEqual(
      signalLivePrimaryAvatarSpeech({ liveSpeech: speech, role: "host" }),
      { talking: true, mouthShape: "closed" },
    );
  });
});
