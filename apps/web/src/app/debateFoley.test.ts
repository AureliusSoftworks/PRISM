import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "@localai/shared";
import {
  DEBATE_AUDIENCE_AGITATION_URL,
  DEBATE_AUDIENCE_CROSSTALK_URL,
  DEBATE_AUDIENCE_FOLEY_URLS,
  DEBATE_AUDIENCE_MURMUR_URL,
  DEBATE_AUDIENCE_REACTIONS,
  DEBATE_AUDIENCE_ROOM_BASELINE_URL,
  DEBATE_GAVEL_FOLEY_TRIM,
  DEBATE_GAVEL_FOLEY_URLS,
  DEBATE_GAVEL_ORDER_CAMERA_CUT_MS,
  DEBATE_GAVEL_ATTENTION_CAMERA_SETTLE_MS,
  DEBATE_GAVEL_ORDER_CAMERA_SETTLE_MS,
  debateModeratorGavelCameraSettleMs,
  DEBATE_GAVEL_VISUAL_IMPACT_MS,
  debateAudienceBackgroundUrlForPressureBand,
  debateAudienceBeatForEvent,
  debateDirectedAudiencePlayback,
  debateModeratorGavelCue,
  debateModeratorGavelSpeechLeadMs,
  debateVocalFoleyTargetId,
  debateAmbientVocalFoleyTagText,
  debateAmbientVocalFoleyVoicePerformance,
  debateJuryDeliberationMouthShape,
  debateVocalFoleyVoicePerformance,
  resolveDebateVocalFoleyTagText,
  type DebateFoleyParticipant,
} from "./debateFoley.ts";

interface PcmWav {
  channelCount: number;
  data: Buffer;
  sampleRate: number;
}

function readPcmWav(relativeUrl: string): PcmWav {
  const bytes = readFileSync(
    fileURLToPath(new URL(`../../public${relativeUrl}`, import.meta.url)),
  );
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");

  let channelCount = 0;
  let sampleRate = 0;
  let data = Buffer.alloc(0);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (id === "fmt ") {
      assert.equal(bytes.readUInt16LE(bodyStart), 1);
      channelCount = bytes.readUInt16LE(bodyStart + 2);
      sampleRate = bytes.readUInt32LE(bodyStart + 4);
      assert.equal(bytes.readUInt16LE(bodyStart + 14), 16);
    } else if (id === "data") {
      data = bytes.subarray(bodyStart, bodyStart + size);
    }
    offset = bodyStart + size + (size % 2);
  }
  assert.ok(channelCount > 0);
  assert.ok(sampleRate > 0);
  assert.ok(data.length > 0);
  return { channelCount, data, sampleRate };
}

function loudestFrameMs(wav: PcmWav, startMs: number, endMs: number): number {
  const bytesPerFrame = wav.channelCount * 2;
  const firstFrame = Math.floor((startMs / 1_000) * wav.sampleRate);
  const lastFrame = Math.min(
    Math.ceil((endMs / 1_000) * wav.sampleRate),
    wav.data.length / bytesPerFrame,
  );
  let loudestFrame = firstFrame;
  let loudestAmplitude = -1;
  for (let frame = firstFrame; frame < lastFrame; frame += 1) {
    let amplitude = 0;
    for (let channel = 0; channel < wav.channelCount; channel += 1) {
      amplitude = Math.max(
        amplitude,
        Math.abs(wav.data.readInt16LE(frame * bytesPerFrame + channel * 2)),
      );
    }
    if (amplitude > loudestAmplitude) {
      loudestAmplitude = amplitude;
      loudestFrame = frame;
    }
  }
  return (loudestFrame / wav.sampleRate) * 1_000;
}

const participants = [
  {
    id: "for",
    role: "for",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
  {
    id: "moderator",
    role: "moderator",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
  {
    id: "against",
    role: "against",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
] as const satisfies readonly DebateFoleyParticipant[];

function debateEvent(
  kind: DebateEventV1["kind"],
  overrides: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: `event:${kind}`,
    sequence: 1,
    phase: "opening",
    stepKey: kind,
    kind,
    speakerKind: "system",
    speakerBotId: null,
    sideId: null,
    content: kind,
    sourceIds: [],
    createdAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("Debate vocal Foley", () => {
  it("keeps casual mouth sounds out of the formal Forum", () => {
    for (const kind of ["mouth-sound", "lip-smack"] as const) {
      assert.equal(
        debateVocalFoleyTargetId({
          sessionId: "debate-1",
          cueIndex: 0,
          kind,
          participants,
        }),
        null,
      );
    }
  });

  it("prefers the moderator for an inhale or throat-clear", () => {
    for (const kind of ["soft-inhale", "throat-clear"] as const) {
      assert.equal(
        debateVocalFoleyTargetId({
          sessionId: "debate-1",
          cueIndex: 0,
          kind,
          participants,
        }),
        "moderator",
      );
    }
  });

  it("gives a sigh to a listening advocate", () => {
    const target = debateVocalFoleyTargetId({
      sessionId: "debate-1",
      cueIndex: 0,
      kind: "soft-sigh",
      participants: participants.map((participant) => ({
        ...participant,
        active: participant.id === "for",
      })),
    });
    assert.equal(target, "against");
  });

  it("never targets the floor holder, thinker, hidden bot, or hard mute", () => {
    assert.equal(
      debateVocalFoleyTargetId({
        sessionId: "debate-1",
        cueIndex: 2,
        kind: "throat-clear",
        participants: [
          { ...participants[0], active: true },
          { ...participants[1], hardMuted: true },
          { ...participants[2], hidden: true, thinking: true },
        ],
      }),
      null,
    );
  });

  it("treats breathless like hard mute only for soft-inhale and soft-sigh", () => {
    const breathlessParticipants = participants.map((participant) => ({
      ...participant,
      breathless: true,
    }));
    assert.equal(
      debateVocalFoleyTargetId({
        sessionId: "debate-1",
        cueIndex: 0,
        kind: "soft-inhale",
        participants: breathlessParticipants,
      }),
      null,
    );
    assert.equal(
      debateVocalFoleyTargetId({
        sessionId: "debate-1",
        cueIndex: 0,
        kind: "soft-sigh",
        participants: breathlessParticipants,
      }),
      null,
    );
    assert.equal(
      debateVocalFoleyTargetId({
        sessionId: "debate-1",
        cueIndex: 0,
        kind: "throat-clear",
        participants: breathlessParticipants,
      }),
      "moderator",
    );
  });
});

describe("Debate audience beats", () => {
  it("selects one or two stable reacting seats from public event truth", () => {
    const objection = debateEvent("objection", {
      sequence: 7,
      speakerKind: "advocate",
      speakerBotId: "against",
      sideId: "against",
      content: "Objection! That conclusion ignores the heard premise.",
    });
    const beginning = debateAudienceBeatForEvent({
      event: objection,
      publicContent: "Objection!",
      seatCount: 8,
    });
    const complete = debateAudienceBeatForEvent({
      event: objection,
      publicContent: objection.content,
      seatCount: 8,
    });

    assert.equal(complete?.kind, "objection");
    assert.equal(complete?.listenerReaction, "divided");
    assert.equal(complete?.foleyCue, "objection");
    assert.deepEqual(beginning?.seatIndices, complete?.seatIndices);
    assert.ok((complete?.seatIndices.length ?? 0) >= 1);
    assert.ok((complete?.seatIndices.length ?? 0) <= 2);
    assert.ok(complete?.seatIndices.every((index) => index >= 0 && index < 8));
  });

  it("labels ambient vocal Foley for Signal-style overhead tags", () => {
    assert.equal(
      debateAmbientVocalFoleyTagText("throat-clear"),
      "Clears throat",
    );
    assert.equal(debateAmbientVocalFoleyTagText("soft-sigh"), "Sighs");
    assert.equal(debateAmbientVocalFoleyTagText("soft-inhale"), "Inhales");
    assert.equal(debateAmbientVocalFoleyTagText("mouth-sound"), null);
    assert.equal(debateAmbientVocalFoleyTagText("lip-smack"), null);
    assert.equal(
      resolveDebateVocalFoleyTagText({ ambientKind: "throat-clear" }),
      "Clears throat",
    );
    assert.equal(
      resolveDebateVocalFoleyTagText({
        ambientKind: "lip-smack",
        personaReactionContent: "soft laugh of disbelief",
      }),
      "soft laugh of disbelief",
    );
    assert.equal(
      resolveDebateVocalFoleyTagText({
        personaReactionContent: "  clears throat softly  ",
      }),
      "clears throat softly",
    );
  });

  it("speaks ambient and persona Foley with ellipsis captions like Signal", () => {
    assert.deepEqual(debateAmbientVocalFoleyVoicePerformance("throat-clear"), {
      spokenText: "...",
      voicePerformanceText: "[clears throat] ...",
    });
    assert.deepEqual(debateAmbientVocalFoleyVoicePerformance("soft-sigh"), {
      spokenText: "...",
      voicePerformanceText: "[sighs] ...",
    });
    assert.deepEqual(debateAmbientVocalFoleyVoicePerformance("soft-inhale"), {
      spokenText: "...",
      voicePerformanceText: "[exhales] ...",
    });
    assert.equal(debateAmbientVocalFoleyVoicePerformance("mouth-sound"), null);
    assert.deepEqual(debateVocalFoleyVoicePerformance("Sighs"), {
      spokenText: "...",
      voicePerformanceText: "[sighs] ...",
    });
    assert.deepEqual(
      debateVocalFoleyVoicePerformance("soft laugh of disbelief"),
      {
        spokenText: "...",
        voicePerformanceText: "soft laugh of disbelief ...",
      },
    );
  });

  it("honors maxReactingSeats under load", () => {
    const speech = debateEvent("speech", {
      sequence: 3,
      speakerKind: "advocate",
      content:
        "This heated contention splits the gallery into a divided reaction now.",
    });
    const capped = debateAudienceBeatForEvent({
      event: speech,
      publicContent: speech.content,
      seatCount: 12,
      maxReactingSeats: 1,
    });
    assert.equal(capped?.seatIndices.length, 1);
  });

  it("maps saved gallery direction to explicit playback and visual intensity", () => {
    const event = debateEvent("speech", {
      speakerKind: "advocate",
      audienceReaction: {
        kind: "impressed",
        intensity: 3,
        source: "director",
      },
    });
    assert.deepEqual(
      debateDirectedAudiencePlayback(event.audienceReaction),
      { kind: "impressed", intensity: 3 },
    );
    const beat = debateAudienceBeatForEvent({
      event,
      publicContent: event.content,
      seatCount: 7,
    });
    assert.equal(beat?.listenerReaction, "evidence");
    assert.equal(beat?.seatIndices.length, 3);
    assert.equal(beat?.foleyCue, null);
  });

  it("keeps generic questions and concessions visual while reserving audio for procedural events", () => {
    const cases = [
      {
        event: debateEvent("evidence", {
          speakerKind: "advocate",
          content: "The frozen record confirms it. [[source:frozen-1]]",
        }),
        kind: "evidence",
        foleyCue: "evidence",
      },
      {
        event: debateEvent("speech", {
          speakerKind: "advocate",
          content: "Does that answer the actual harm?",
        }),
        kind: "question",
        foleyCue: null,
      },
      {
        event: debateEvent("speech", {
          speakerKind: "advocate",
          content: "I concede that premise.",
        }),
        kind: "concession",
        foleyCue: null,
      },
      {
        event: debateEvent("moderator_ruling", {
          speakerKind: "moderator",
          content: "Overruled. Finish the point.",
        }),
        kind: "ruling",
        foleyCue: "ruling",
      },
    ] as const;

    for (const entry of cases) {
      const beat = debateAudienceBeatForEvent({
        event: entry.event,
        publicContent: entry.event.content,
        seatCount: 7,
      });
      assert.equal(beat?.kind, entry.kind);
      assert.equal(beat?.foleyCue, entry.foleyCue);
      assert.ok((beat?.seatIndices.length ?? 0) >= 1);
      assert.ok((beat?.seatIndices.length ?? 0) <= 2);
    }
  });

  it("does not turn private, silent, or system-only state into a gallery cue", () => {
    for (const event of [
      debateEvent("silence", {
        speakerKind: "advocate",
        content: "...",
      }),
      debateEvent("phase", {
        speakerKind: "system",
        content: "Private transition.",
      }),
      debateEvent("jury_deliberation", {
        speakerKind: "juror",
        content: "Private deliberation.",
      }),
    ]) {
      assert.equal(
        debateAudienceBeatForEvent({
          event,
          publicContent: event.content,
          seatCount: 8,
        }),
        null,
      );
    }
  });
});

describe("Debate moderator gavel", () => {
  it("opens either format with one restrained attention strike", () => {
    for (const format of ["forum", "turnabout"] as const) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format,
          event: debateEvent("intro"),
          moderatorBotId: "moderator",
        }),
        {
          eventId: "event:intro",
          kind: "attention",
          audienceReaction: "session",
        },
      );
    }
  });

  it("lets a canonically silent moderator signal without speech", () => {
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("silence", {
          speakerKind: "moderator",
          speakerBotId: "moderator",
        }),
        moderatorBotId: "moderator",
      }),
      { eventId: "event:silence", kind: "attention" },
    );
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("silence", {
          speakerKind: "moderator",
          speakerBotId: "moderator",
          stepKey: "pause",
        }),
        moderatorBotId: "moderator",
      }),
      { eventId: "event:silence", kind: "order" },
    );
  });

  it("marks phase changes in either format", () => {
    for (const format of ["forum", "turnabout"] as const) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format,
          event: debateEvent("phase"),
          moderatorBotId: "moderator",
        }),
        { eventId: "event:phase", kind: "attention" },
      );
    }
  });

  it("lets the advocate speak an objection before any moderator gavel", () => {
    for (const format of ["forum", "turnabout"] as const) {
      for (const kind of ["interjection", "objection"] as const) {
        assert.equal(
          debateModeratorGavelCue({
            format,
            event: debateEvent(kind, {
              speakerKind: "advocate",
              speakerBotId: "against",
            }),
            moderatorBotId: "moderator",
          }),
          null,
        );
      }
    }
  });

  it("gives the player Judge one time-call strike and a stronger intervention cue", () => {
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("judge_gavel", {
          speakerKind: "player",
          speakerBotId: "prism:player-judge",
          gavelReason: "overtime",
        }),
        moderatorBotId: "prism:player-judge",
      }),
      {
        eventId: "event:judge_gavel",
        kind: "attention",
        audienceReaction: "order",
      },
    );
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "turnabout",
        event: debateEvent("judge_gavel", {
          speakerKind: "player",
          speakerBotId: "prism:player-judge",
          gavelReason: "intervention",
        }),
        moderatorBotId: "prism:player-judge",
      }),
      {
        eventId: "event:judge_gavel",
        kind: "order",
        audienceReaction: "order",
      },
    );
  });

  it("calls a resumed proceeding to order with the stronger gavel cue", () => {
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("judge_gavel", {
          speakerKind: "moderator",
          speakerBotId: "moderator",
          gavelReason: "resume",
        }),
        moderatorBotId: "moderator",
      }),
      {
        eventId: "event:judge_gavel",
        kind: "order",
        audienceReaction: "order",
      },
    );
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "turnabout",
        event: debateEvent("judge_gavel", {
          speakerKind: "player",
          speakerBotId: "prism:player-judge",
          gavelReason: "audience_order",
        }),
        moderatorBotId: "prism:player-judge",
      }),
      {
        eventId: "event:judge_gavel",
        kind: "order",
        audienceReaction: "order",
      },
    );
  });

  it("keeps the extra Turnabout strike for revelations, after objections are heard", () => {
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "turnabout",
        event: debateEvent("revelation"),
        moderatorBotId: "moderator",
      }),
      { eventId: "event:revelation", kind: "attention" },
    );
    assert.equal(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("revelation"),
        moderatorBotId: "moderator",
      }),
      null,
    );
  });

  it("calls the room to order after moderator rulings and bot verdicts without a hush bed", () => {
    const ruling = debateEvent("moderator_ruling", {
      speakerKind: "moderator",
      speakerBotId: "moderator",
    });
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: ruling,
        moderatorBotId: "moderator",
      }),
      {
        eventId: ruling.id,
        kind: "order",
      },
    );
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("moderator_ruling", {
          speakerKind: "player",
          speakerBotId: "prism:player-judge",
          ruling: "overruled",
        }),
        moderatorBotId: "prism:player-judge",
      }),
      {
        eventId: "event:moderator_ruling",
        kind: "order",
      },
    );
    const verdict = debateEvent("verdict");
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: verdict,
        moderatorBotId: "moderator",
      }),
      { eventId: verdict.id, kind: "order" },
    );
    assert.equal(
      debateModeratorGavelCue({
        format: "turnabout",
        event: debateEvent("verdict", { speakerKind: "player" }),
        moderatorBotId: "moderator",
      }),
      null,
    );
  });

  it("keeps ordinary speeches quiet and gives order a longer procedural beat", () => {
    assert.equal(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("speech", {
          speakerKind: "advocate",
          speakerBotId: "for",
        }),
        moderatorBotId: "moderator",
      }),
      null,
    );
    assert.ok(
      debateModeratorGavelSpeechLeadMs("order") >
        debateModeratorGavelSpeechLeadMs("attention"),
    );
    assert.equal(
      DEBATE_GAVEL_FOLEY_URLS.attention,
      "/audio/debate/gavel-attention-v3.wav",
    );
    assert.equal(
      DEBATE_GAVEL_FOLEY_URLS.order,
      "/audio/debate/gavel-order-v3.wav",
    );
    assert.deepEqual(DEBATE_GAVEL_FOLEY_TRIM, {
      attention: 0.86,
      order: 0.92,
    });
  });

  it("bundles the selected murmur, sparse Foley, and synchronized reactions", () => {
    assert.equal(
      DEBATE_AUDIENCE_ROOM_BASELINE_URL,
      "/audio/session-atmosphere/default-studio-room-loop.mp3",
    );
    assert.equal(
      DEBATE_AUDIENCE_MURMUR_URL,
      "/audio/debate/courtroom-audience-murmur-loop.mp3",
    );
    assert.equal(
      debateAudienceBackgroundUrlForPressureBand("settled"),
      DEBATE_AUDIENCE_ROOM_BASELINE_URL,
    );
    assert.equal(
      debateAudienceBackgroundUrlForPressureBand(null),
      DEBATE_AUDIENCE_ROOM_BASELINE_URL,
    );
    assert.equal(
      debateAudienceBackgroundUrlForPressureBand("murmuring"),
      DEBATE_AUDIENCE_MURMUR_URL,
    );
    assert.equal(
      debateAudienceBackgroundUrlForPressureBand("disruptive"),
      DEBATE_AUDIENCE_MURMUR_URL,
    );
    assert.equal(
      DEBATE_AUDIENCE_CROSSTALK_URL,
      "/audio/debate/courtroom-audience-crosstalk-loop.mp3",
    );
    assert.equal(
      DEBATE_AUDIENCE_AGITATION_URL,
      "/audio/debate/courtroom-audience-agitation-swell.mp3",
    );
    assert.deepEqual(DEBATE_AUDIENCE_REACTIONS, {
      session: {
        url: "/audio/debate/courtroom-audience-session-settle.mp3",
        durationMs: 3_000,
        trim: 1,
      },
      gasp: {
        url: "/audio/signal/soundboard/gasp.mp3",
        durationMs: 1_200,
        trim: 0.72,
      },
      order: {
        url: "/audio/debate/courtroom-audience-order-hush.mp3",
        durationMs: 2_300,
        trim: 0.72,
      },
      objection: {
        url: "/audio/debate/courtroom-audience-order-hush.mp3",
        durationMs: 2_300,
        trim: 0.46,
      },
      evidence: {
        url: "/audio/debate/courtroom-paper-shuffle.mp3",
        durationMs: 1_100,
        trim: 0.62,
      },
      question: {
        url: "/audio/debate/courtroom-chair-shift.mp3",
        durationMs: 1_100,
        trim: 0.5,
      },
      concession: {
        url: "/audio/debate/courtroom-audience-session-settle.mp3",
        durationMs: 3_000,
        trim: 0.54,
      },
      ruling: {
        url: "/audio/debate/courtroom-audience-order-hush.mp3",
        durationMs: 2_300,
        trim: 0.62,
      },
      laugh: {
        url: "/audio/signal/soundboard/laughter.mp3",
        durationMs: 1_760,
        trim: 0.62,
      },
      impressed: {
        url: "/audio/signal/soundboard/applause.mp3",
        durationMs: 2_200,
        trim: 0.58,
      },
    });

    const urls = [
      DEBATE_AUDIENCE_ROOM_BASELINE_URL,
      DEBATE_AUDIENCE_MURMUR_URL,
      DEBATE_AUDIENCE_CROSSTALK_URL,
      DEBATE_AUDIENCE_AGITATION_URL,
      ...DEBATE_AUDIENCE_FOLEY_URLS,
      ...Object.values(DEBATE_AUDIENCE_REACTIONS).map(
        (reaction) => reaction.url,
      ),
    ];
    for (const url of urls) {
      const bytes = readFileSync(
        fileURLToPath(new URL(`../../public${url}`, import.meta.url)),
      );
      assert.equal(bytes.toString("ascii", 0, 3), "ID3");
      assert.ok(bytes.length > 10_000, `${url} should contain bundled audio`);
    }
  });

  it("keeps both active gavel cues available in the sound bench", () => {
    const benchSource = readFileSync(
      new URL("../../public/tools/sound-fx-bench.html", import.meta.url),
      "utf8",
    );

    for (const [cue, path] of Object.entries(DEBATE_GAVEL_FOLEY_URLS)) {
      assert.match(
        benchSource,
        new RegExp(`data-demo-cue="debate-gavel-${cue}"`),
      );
      assert.ok(benchSource.includes(path));
    }
  });

  it("pins each PCM impact to its visual strike frame", () => {
    const attention = readPcmWav(DEBATE_GAVEL_FOLEY_URLS.attention);
    const order = readPcmWav(DEBATE_GAVEL_FOLEY_URLS.order);
    const attentionPeakMs = loudestFrameMs(attention, 0, 300);
    const orderFirstPeakMs = loudestFrameMs(order, 0, 300);
    const orderSecondPeakMs = loudestFrameMs(order, 600, 1_050);

    assert.ok(
      attentionPeakMs >= DEBATE_GAVEL_VISUAL_IMPACT_MS.attention &&
        attentionPeakMs <= DEBATE_GAVEL_VISUAL_IMPACT_MS.attention + 20,
    );
    assert.ok(
      orderFirstPeakMs >= DEBATE_GAVEL_VISUAL_IMPACT_MS.order &&
        orderFirstPeakMs <= DEBATE_GAVEL_VISUAL_IMPACT_MS.order + 20,
    );
    assert.ok(Math.abs(orderSecondPeakMs - orderFirstPeakMs - 697) < 2);
    assert.equal(DEBATE_GAVEL_VISUAL_IMPACT_MS.attention, 220);
    assert.equal(DEBATE_GAVEL_VISUAL_IMPACT_MS.order, 272);
    assert.ok(
      DEBATE_GAVEL_ORDER_CAMERA_CUT_MS > DEBATE_GAVEL_VISUAL_IMPACT_MS.order,
    );
    assert.ok(DEBATE_GAVEL_ORDER_CAMERA_CUT_MS < orderSecondPeakMs);
    assert.ok(
      DEBATE_GAVEL_ORDER_CAMERA_SETTLE_MS > DEBATE_GAVEL_ORDER_CAMERA_CUT_MS,
    );
    assert.equal(debateModeratorGavelCameraSettleMs("order"), DEBATE_GAVEL_ORDER_CAMERA_SETTLE_MS);
    assert.equal(
      debateModeratorGavelCameraSettleMs("attention"),
      DEBATE_GAVEL_ATTENTION_CAMERA_SETTLE_MS,
    );
  });

  it("staggers silent Jury deliberation mouth chatter by seat", () => {
    const seat0 = debateJuryDeliberationMouthShape(0, 260);
    const seat2 = debateJuryDeliberationMouthShape(2, 260);
    const later = debateJuryDeliberationMouthShape(0, 910);
    assert.ok(typeof seat0 === "string" && seat0.length > 0);
    assert.notEqual(seat0, seat2);
    assert.notEqual(seat0, later);
  });
});
