import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeZenWallpaperPrompt,
  extractZenWallpaperVisualCues,
} from "../zen-wallpaper-prompt.ts";

describe("composeZenWallpaperPrompt", () => {
  it("distills transcript debris into compact abstract visual cues", () => {
    const prompt = composeZenWallpaperPrompt({
      initialUserPrompt: "/funny-story",
      recentContext: [
        "user: /funny-story",
        "assistant: In Tallinn's whispering dawn of '57, A moonlit lullaby sang its name, Luna, born to weave a tale of old.",
        "Her grandmother, Sarah Guitarson, wise, gave her a fiddle with a wistful air.",
        "As Luna's fingers danced upon its strings, the instrument sang of love and losses.",
        "In Eestiotamm's shadow, she'd sit and play, the fiddle's lamentations leading her astray.",
        "Jesters' antics, jesters' tears, a mystic charm, a fleeting magic.",
        "user: sorry let...",
      ].join("\n"),
      botName: "Prism",
      botSystemPrompt: "assistant",
    });

    assert.match(prompt, /^Abstract ambient wallpaper for a calm Zen chat canvas\./);
    assert.match(
      prompt,
      /Subtle abstract cues from moonlight, old city stone, fiddle-string lines, capering motion, dawn mist, woven thread texture, fleeting storybook magic, and melancholy humor\./
    );
    assert.doesNotMatch(prompt, /\bConversation seed\b/i);
    assert.doesNotMatch(prompt, /\bCompanion context\b/i);
    assert.doesNotMatch(prompt, /\bRecent conversation texture\b/i);
    assert.doesNotMatch(prompt, /\bSpecific abstract motif cues\b/i);
    assert.doesNotMatch(prompt, /\buser:/i);
    assert.doesNotMatch(prompt, /\bassistant:/i);
    assert.doesNotMatch(prompt, /\/funny-story/i);
    assert.doesNotMatch(prompt, /\bs fingers\b/i);
    assert.doesNotMatch(prompt, /\bTallinn\b/i);
    assert.doesNotMatch(prompt, /\bLuna\b/i);
    assert.doesNotMatch(prompt, /\bSarah\b/i);
    assert.doesNotMatch(prompt, /\bEestiotamm\b/i);
    assert.match(prompt, /No text, letters, numbers, people, faces, bodies/);
  });

  it("falls back to a quiet abstract brief when the conversation has no visual hooks", () => {
    const prompt = composeZenWallpaperPrompt({
      initialUserPrompt: "okay",
      recentContext: "user: okay\nassistant: sure",
      botName: null,
      botSystemPrompt: null,
    });

    assert.match(
      prompt,
      /Subtle abstract cues from reflective quiet, soft glass haze, and slow atmospheric depth\./
    );
    assert.doesNotMatch(prompt, /\buser:/i);
    assert.doesNotMatch(prompt, /\bassistant:/i);
  });
});

describe("extractZenWallpaperVisualCues", () => {
  it("maps software conversation language to abstract geometry instead of raw terms", () => {
    assert.deepEqual(
      extractZenWallpaperVisualCues(
        "user: improve the local privacy model prompt and server API behavior"
      ),
      ["soft signal geometry"]
    );
  });
});
