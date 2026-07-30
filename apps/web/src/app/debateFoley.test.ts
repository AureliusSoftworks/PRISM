import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "@localai/shared";
import {
  DEBATE_AUDIENCE_FOLEY_URLS,
  DEBATE_AUDIENCE_MURMUR_URL,
  DEBATE_AUDIENCE_REACTIONS,
  DEBATE_GAVEL_FOLEY_TRIM,
  DEBATE_GAVEL_FOLEY_URLS,
  DEBATE_GAVEL_ORDER_CAMERA_CUT_MS,
  DEBATE_GAVEL_VISUAL_IMPACT_MS,
  debateModeratorGavelCue,
  debateModeratorGavelSpeechLeadMs,
  debateVocalFoleyTargetId,
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

  it("calls for order when either format is interrupted", () => {
    for (const format of ["forum", "turnabout"] as const) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format,
          event: debateEvent("interjection"),
          moderatorBotId: "moderator",
        }),
        {
          eventId: "event:interjection",
          kind: "order",
          audienceReaction: "order",
        },
      );
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
  });

  it("adds extra procedural strikes around Turnabout challenges", () => {
    for (const kind of ["objection", "revelation"] as const) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format: "turnabout",
          event: debateEvent(kind),
          moderatorBotId: "moderator",
        }),
        { eventId: `event:${kind}`, kind: "attention" },
      );
      assert.equal(
        debateModeratorGavelCue({
          format: "forum",
          event: debateEvent(kind),
          moderatorBotId: "moderator",
        }),
        null,
      );
    }
  });

  it("calls the room to order for moderator rulings and bot verdicts", () => {
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
        audienceReaction: "order",
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

  it("bundles the courtroom murmur, sparse Foley, and synchronized reactions", () => {
    assert.equal(
      DEBATE_AUDIENCE_MURMUR_URL,
      "/audio/debate/courtroom-audience-murmur-loop.mp3",
    );
    assert.deepEqual(DEBATE_AUDIENCE_REACTIONS, {
      session: {
        url: "/audio/debate/courtroom-audience-session-settle.mp3",
        durationMs: 3_000,
        trim: 0.82,
      },
      order: {
        url: "/audio/debate/courtroom-audience-order-hush.mp3",
        durationMs: 2_300,
        trim: 0.42,
      },
    });

    const urls = [
      DEBATE_AUDIENCE_MURMUR_URL,
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
  });
});
