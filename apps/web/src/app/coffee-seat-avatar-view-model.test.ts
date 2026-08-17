import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeLiveSeatThinkingBotId,
  coffeeSeatAvatarViewModelKey,
  type CoffeeSeatAvatarViewModel,
} from "./coffee-seat-avatar-view-model.ts";

const idleSeat: CoffeeSeatAvatarViewModel = {
  identityKey: "sol",
  theme: "dark",
  quality: "full",
  hoverActive: false,
  layoutIndex: 2,
  glyph: "palette",
  faceStyle: { eyes: "••", mouth: "—" },
  faceScaleY: 1,
  voicePreset: "soft",
  talking: false,
  avatarSfx: null,
  avatarSfxState: "idle",
  sipMouth: false,
  emptyCupFrown: false,
  mouthShape: "closed",
  mood: "neutral",
  plateFace: null,
  restingPlateFace: null,
  thinking: false,
  eyeAttentionState: "idle",
  eyeTargetDirection: 0,
  screenMaterialSeed: "screen-sol",
  frameMaterialSeed: "frame-sol",
  avatarDetails: null,
  avatarDetailsColor: "#00e5ff",
  leadershipGroupCount: 0,
};

describe("Coffee seat avatar view model", () => {
  it("keeps the selected live seat thinking through player-line reveal", () => {
    assert.equal(
      coffeeLiveSeatThinkingBotId({
        rhythmState: "userTableTyping",
        pendingSpeakerBotId: "rowan",
        activeTurnJob: {
          phase: "thinking",
          speakerBotId: "rowan",
        },
        responseCuePlaying: false,
      }),
      "rowan",
    );
  });

  it("uses the thinking job speaker while pending-speaker state catches up", () => {
    assert.equal(
      coffeeLiveSeatThinkingBotId({
        rhythmState: "botThinking",
        pendingSpeakerBotId: null,
        activeTurnJob: {
          phase: "thinking",
          speakerBotId: "mira",
        },
        responseCuePlaying: false,
      }),
      "mira",
    );
  });

  it("does not reuse a thinking seat after speech or an active response cue begins", () => {
    const thinkingState = {
      rhythmState: "botThinking",
      pendingSpeakerBotId: "rowan",
      activeTurnJob: {
        phase: "thinking",
        speakerBotId: "rowan",
      },
      responseCuePlaying: false,
    } as const;
    assert.equal(
      coffeeLiveSeatThinkingBotId({
        ...thinkingState,
        rhythmState: "tableTyping",
      }),
      null,
    );
    assert.equal(
      coffeeLiveSeatThinkingBotId({
        ...thinkingState,
        responseCuePlaying: true,
      }),
      null,
    );
  });

  it("keeps an inactive seat stable across center typewriter ticks", () => {
    const before = coffeeSeatAvatarViewModelKey(idleSeat);
    const centerTypewriterTick = 42;
    void centerTypewriterTick;
    const after = coffeeSeatAvatarViewModelKey({ ...idleSeat });
    assert.equal(after, before);
  });

  it("updates only when avatar-visible speech or identity state changes", () => {
    const idle = coffeeSeatAvatarViewModelKey(idleSeat);
    assert.notEqual(
      coffeeSeatAvatarViewModelKey({
        ...idleSeat,
        talking: true,
        avatarSfxState: "talking",
        mouthShape: "wide",
      }),
      idle,
    );
    assert.notEqual(
      coffeeSeatAvatarViewModelKey({
        ...idleSeat,
        faceStyle: { eyes: "◇◇", mouth: "⌣" },
      }),
      idle,
    );
    assert.notEqual(
      coffeeSeatAvatarViewModelKey({
        ...idleSeat,
        thinking: true,
        eyeAttentionState: "thinking",
      }),
      idle,
      "the memoized seat must commit its authored thinking screen",
    );
    assert.notEqual(
      coffeeSeatAvatarViewModelKey({ ...idleSeat, presentation: "mini" }),
      idle,
      "the memoized seat must swap chassis when the rendered Coffee cast grows",
    );
    assert.notEqual(
      coffeeSeatAvatarViewModelKey({ ...idleSeat, loadShed: true }),
      idle,
      "the memoized seat must drop materials when the table is missing frames",
    );
  });

  it("preserves authored identity for Mira, Pia, Iris, Sol, and Rowan across Coffee phases", () => {
    const seats = [
      { id: "mira", glyph: "focus", eyes: "◇◇", color: "#8c62ff" },
      { id: "pia", glyph: "heart-handshake", eyes: "••", color: "#ff5c77" },
      { id: "iris", glyph: "circuit", eyes: "◇◇", color: "#b9ff00" },
      { id: "sol", glyph: "palette", eyes: "☀☀", color: "#00e5ff" },
      { id: "rowan", glyph: "map", eyes: "≋≋", color: "#ffae24" },
    ] as const;

    for (const seat of seats) {
      const authored = {
        ...idleSeat,
        identityKey: `coffee-session:live:${seat.id}`,
        glyph: seat.glyph,
        faceStyle: { eyes: seat.eyes, mouth: "—" },
        screenMaterialSeed: `screen-${seat.id}`,
        frameMaterialSeed: `frame-${seat.id}`,
        avatarDetails: { ink: `ink-${seat.id}`, art: `art-${seat.id}` },
        avatarDetailsColor: seat.color,
      } satisfies CoffeeSeatAvatarViewModel;
      const identity = [
        authored.identityKey,
        authored.glyph,
        authored.faceStyle,
        authored.screenMaterialSeed,
        authored.frameMaterialSeed,
        authored.avatarDetails,
        authored.avatarDetailsColor,
      ];
      const phases: CoffeeSeatAvatarViewModel[] = [
        authored,
        { ...authored, thinking: true, eyeAttentionState: "thinking" },
        {
          ...authored,
          talking: true,
          voiceLightLevel: 0.8,
          avatarSfxState: "talking",
          mouthShape: "wide",
        },
        { ...authored, sipMouth: true, mouthShape: "closed" },
        { ...authored, thinking: false, avatarSfxState: "recovery" },
      ];

      for (const phase of phases) {
        assert.deepEqual(
          [
            phase.identityKey,
            phase.glyph,
            phase.faceStyle,
            phase.screenMaterialSeed,
            phase.frameMaterialSeed,
            phase.avatarDetails,
            phase.avatarDetailsColor,
          ],
          identity,
          `${seat.id} identity changed during a Coffee phase`,
        );
      }
    }
  });
});
