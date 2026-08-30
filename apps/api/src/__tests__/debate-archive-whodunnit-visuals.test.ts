import assert from "node:assert/strict";
import { test } from "node:test";
import type { DebateWhodunnitFormatStateV2 } from "@localai/shared";

import { debateSessionListAdvocateVisuals } from "../debate.ts";

const ordinaryVisuals = {
  forAdvocate: {
    name: "Jared",
    color: "#2fd3e3",
    glyph: "triangle",
  },
  againstAdvocate: {
    name: "Georgia O'Keeffe",
    color: "#ff4d6d",
    glyph: "lucideFlower",
  },
};

const mysteryState = {
  config: {
    prosecutorBotId: "prosecutor-bot",
    rivalDefenseBotId: "defense-bot",
  },
  identityMirrorTargetSnapshots: {
    "prosecutor-bot": {
      version: 1,
      botId: "prosecutor-bot",
      name: "Confusion Collin",
      faceStyle: {},
      avatarDetails: null,
      glyph: "lucideScanFace",
    },
    "defense-bot": {
      version: 1,
      botId: "defense-bot",
      name: "Georgia O'Keeffe",
      faceStyle: {},
      avatarDetails: null,
      glyph: "lucideFlower",
    },
  },
} as unknown as DebateWhodunnitFormatStateV2;

test("Whodunnit Archive represents the embodied Prosecution and Defense bots", () => {
  assert.deepEqual(
    debateSessionListAdvocateVisuals(ordinaryVisuals, mysteryState),
    [
      {
        sideId: "for",
        name: "Confusion Collin",
        color: "#2fd3e3",
        glyph: "lucideScanFace",
      },
      {
        sideId: "against",
        name: "Georgia O'Keeffe",
        color: "#ff4d6d",
        glyph: "lucideFlower",
      },
    ],
  );
});

test("ordinary Debate Archive keeps its participant-versus-advocate visuals", () => {
  assert.deepEqual(debateSessionListAdvocateVisuals(ordinaryVisuals), [
    {
      sideId: "for",
      name: "Jared",
      color: "#2fd3e3",
      glyph: "triangle",
    },
    {
      sideId: "against",
      name: "Georgia O'Keeffe",
      color: "#ff4d6d",
      glyph: "lucideFlower",
    },
  ]);
});
