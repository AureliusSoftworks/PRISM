import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeZenWallpaperPrompt,
  extractZenWallpaperVisualCues,
  normalizeZenWallpaperPromptOverride,
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

  it("keeps blank style notes equivalent to the default prompt", () => {
    const args = {
      initialUserPrompt: "quiet evening",
      recentContext: "user: quiet evening\nassistant: of course",
      botName: null,
      botSystemPrompt: null,
    };

    assert.equal(
      composeZenWallpaperPrompt(args),
      composeZenWallpaperPrompt({ ...args, styleNotes: "   " })
    );
  });

  it("includes style notes before PRISM brand and safety constraints", () => {
    const prompt = composeZenWallpaperPrompt({
      initialUserPrompt: "let's sit by the ocean",
      recentContext: "user: ocean light\nassistant: slowly",
      botName: null,
      botSystemPrompt: null,
      styleNotes: "  slow ocean light, paper\n grain  ",
    });

    assert.match(
      prompt,
      /User atmosphere style notes: slow ocean light, paper grain\./
    );
    assert.ok(
      prompt.indexOf("User atmosphere style notes") <
        prompt.indexOf("Add faint prismatic rainbow accents")
    );
    assert.match(prompt, /Mostly charcoal, pearl, and mist-gray/);
    assert.match(prompt, /No text, letters, numbers, people, faces, bodies/);
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

describe("normalizeZenWallpaperPromptOverride", () => {
  it("preserves custom Atmosphere prompt whitespace while rejecting blank input", () => {
    const prompt = "Line one\n\n  Line two with spacing  ";

    assert.equal(normalizeZenWallpaperPromptOverride(prompt), prompt);
    assert.equal(normalizeZenWallpaperPromptOverride("   \n  "), "");
  });

  it("hard-clamps custom Atmosphere prompts without adding style notes or ellipses", () => {
    assert.equal(normalizeZenWallpaperPromptOverride("abcdef", 4), "abcd");
  });
});
