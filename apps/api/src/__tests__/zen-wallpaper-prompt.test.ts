import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZEN_WALLPAPER_THEME_COUNT,
  composeZenWallpaperPrompt,
  extractZenWallpaperVisualCues,
  normalizeZenWallpaperPromptOverride,
} from "../zen-wallpaper-prompt.ts";

describe("composeZenWallpaperPrompt", () => {
  it("distills transcript debris into compact soft symbolic motifs", () => {
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

    assert.match(
      prompt,
      /^Widescreen ambient wallpaper for a calm Zen chat canvas;/
    );
    assert.match(
      prompt,
      /Wallpaper theme 1\/4 - light signature:/
    );
    assert.match(
      prompt,
      /Make family keepsake warmth the clearest chat-derived influence, supported by moonlight, old city stone, and fiddle-string lines;/
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
    assert.match(prompt, /no borders, frames, mats, letterboxing, pillarboxing, side gutters, or empty bars/i);
    assert.match(prompt, /No readable text, letters, numbers, people, faces, bodies/);
  });

  it("uses concrete conversation motifs for baking and family-memory texture", () => {
    const prompt = composeZenWallpaperPrompt({
      initialUserPrompt:
        "I keep thinking about my grandmother's handwritten recipe card.",
      recentContext: [
        "user: The kitchen smelled like cinnamon cookies cooling on the tray.",
        "assistant: That sounds like a small family keepsake made of warm light, flour, and memory.",
      ].join("\n"),
      botName: "Prism",
      botSystemPrompt: "assistant",
    });

    assert.match(
      prompt,
      /Wallpaper theme 1\/4 - light signature:/
    );
    assert.match(
      prompt,
      /Make warm kitchen light the clearest chat-derived influence, supported by flour-dust texture, cooling tray geometry, and folded stationery;/
    );
    assert.doesNotMatch(prompt, /No strong concrete motif was found/i);
    assert.match(prompt, /rather than barely-there noise/);
    assert.match(prompt, /No readable text, letters, numbers, people, faces, bodies/);
  });

  it("cycles four distinct themed wallpaper prompts through the same chat cues", () => {
    const args = {
      initialUserPrompt:
        "I keep thinking about my grandmother's handwritten recipe card.",
      recentContext: [
        "user: The kitchen smelled like cinnamon cookies cooling on the tray.",
        "assistant: That sounds like a small family keepsake made of warm light, flour, and memory.",
      ].join("\n"),
      botName: "Prism",
      botSystemPrompt: "assistant",
    };
    const prompts = Array.from({ length: ZEN_WALLPAPER_THEME_COUNT }, (_, index) =>
      composeZenWallpaperPrompt({ ...args, generationIndex: index })
    );

    assert.equal(new Set(prompts).size, ZEN_WALLPAPER_THEME_COUNT);
    assert.ok(prompts[0]?.includes("Wallpaper theme 1/4 - light signature"));
    assert.ok(prompts[0]?.includes("Make warm kitchen light the clearest chat-derived influence"));
    assert.ok(prompts[1]?.includes("Wallpaper theme 2/4 - material memory"));
    assert.ok(prompts[1]?.includes("Make flour-dust texture the clearest chat-derived influence"));
    assert.ok(prompts[2]?.includes("Wallpaper theme 3/4 - spatial rhythm"));
    assert.ok(prompts[2]?.includes("Make cooling tray geometry the clearest chat-derived influence"));
    assert.ok(prompts[3]?.includes("Wallpaper theme 4/4 - emotional weather"));
    assert.ok(prompts[3]?.includes("Make folded stationery the clearest chat-derived influence"));
    for (const prompt of prompts) {
      assert.match(prompt, /distinct at a glance/);
      assert.match(prompt, /recognizable broad light, material, silhouette, setting, spatial, or weather decisions/);
      assert.match(prompt, /widescreen, full-bleed, readable, and center-safe/);
    }
  });

  it("spreads long chat cue lists across all four theme prompts", () => {
    const args = {
      initialUserPrompt: [
        "Atmosphere UAT:",
        "remembered kitchen light with flour dust in a window beam,",
        "cooling tray geometry, folded stationery from my grandmother;",
        "moonlit tidal glass and starfield hush;",
        "rain-washed old city stone with fiddle-string lines;",
        "quiet desk geometry with map-line drift, soft signal arcs, still water gradients,",
        "and local-first calm.",
      ].join(" "),
      recentContext: "",
      botName: "Prism",
      botSystemPrompt: "assistant",
    };

    const prompts = Array.from({ length: ZEN_WALLPAPER_THEME_COUNT }, (_, index) =>
      composeZenWallpaperPrompt({ ...args, generationIndex: index })
    );

    assert.ok(prompts[0]?.includes("Make warm kitchen light the clearest chat-derived influence"));
    assert.ok(prompts[1]?.includes("Make folded stationery the clearest chat-derived influence"));
    assert.ok(prompts[1]?.includes("supported by family keepsake warmth, moonlight, and old city stone"));
    assert.ok(prompts[2]?.includes("Make old city stone the clearest chat-derived influence"));
    assert.ok(prompts[2]?.includes("supported by rain-washed light, quiet desk geometry, and map-line drift"));
    assert.ok(prompts[3]?.includes("Make map-line drift the clearest chat-derived influence"));
    assert.ok(prompts[3]?.includes("supported by fiddle-string lines, soft signal geometry, and warm kitchen light"));
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
      /No strong concrete motif was found in the chat, so make pearl dawn light the clear influence/
    );
    assert.match(prompt, /Wallpaper theme 1\/4 - light signature:/);
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

  it("lets style notes override palette while preserving safety constraints", () => {
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
        prompt.indexOf("Do not force prismatic rainbow accents")
    );
    assert.match(prompt, /these notes may override palette and setting/);
    assert.doesNotMatch(prompt, /Mostly charcoal, pearl, and mist-gray/);
    assert.match(prompt, /central prose region comparatively empty/);
    assert.match(prompt, /No readable text, letters, numbers, people, faces, bodies/);
  });

  it("allows vivid persona worlds while keeping the center chat-safe", () => {
    const prompt = composeZenWallpaperPrompt({
      initialUserPrompt: "SpongeBob is excited to talk about jellyfishing.",
      recentContext:
        "user: let's talk about Bikini Bottom at sunrise\nassistant: The pineapple house is glowing under the sea.",
      botName: "SpongeBob",
      botSystemPrompt:
        "You are SpongeBob SquarePants from Bikini Bottom. You love jellyfishing, pineapple house mornings, Krabby Patty warmth, and bright undersea optimism.",
      generationIndex: 2,
    });

    assert.match(prompt, /Active bot\/persona visual context: SpongeBob\./);
    assert.match(prompt, /Bikini Bottom/);
    assert.match(prompt, /Let the active style or persona choose the palette, materials, setting, and vividness/);
    assert.match(prompt, /depict the world or atmosphere rather than the character/);
    assert.match(prompt, /central prose region comparatively empty/);
    assert.match(prompt, /No readable text, letters, numbers, people, faces, bodies, characters, creatures/);
    assert.doesNotMatch(prompt, /Mostly charcoal, pearl, and mist-gray/);
  });
});

describe("extractZenWallpaperVisualCues", () => {
  it("maps baking memory language to soft motif labels", () => {
    assert.deepEqual(
      extractZenWallpaperVisualCues(
        "user: grandma's handwritten recipe card, flour on the kitchen table, cookies cooling on a tray"
      ),
      [
        "warm kitchen light",
        "flour-dust texture",
        "cooling tray geometry",
        "folded stationery",
        "family keepsake warmth",
      ]
    );
  });

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
