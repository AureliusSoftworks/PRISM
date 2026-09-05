import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botLibraryGroupManagerNameError,
  createBotLibraryGroupManagerDraft,
  describeBotLibraryGroupManagerDraft,
  removeBotLibraryGroupManagerDraft,
  renameBotLibraryGroupManagerDraft,
  setBotLibraryGroupManagerMembers,
} from "./botLibraryGroupManager.ts";
import { buildBotLibraryGroupVisualVariables } from "./botLibraryGroupVisual.ts";

const groups = [
  {
    id: "group:violet",
    name: "Violet",
    description: "",
    botIds: ["bot:a"],
    builtIn: false,
  },
];

describe("Bot Library group manager draft", () => {
  it("stages create-style membership and rename edits without changing saved groups", () => {
    const draft = createBotLibraryGroupManagerDraft(groups);
    const renamed = renameBotLibraryGroupManagerDraft(draft, "group:violet", "Night shift");
    const described = describeBotLibraryGroupManagerDraft(
      renamed,
      "group:violet",
      "Bots for the late shift.",
    );
    const withMembers = setBotLibraryGroupManagerMembers(
      described,
      "group:violet",
      ["bot:a", "bot:b", "bot:b"],
    );

    assert.equal(groups[0]!.name, "Violet");
    assert.deepEqual(groups[0]!.botIds, ["bot:a"]);
    assert.equal(withMembers[0]!.name, "Night shift");
    assert.equal(withMembers[0]!.description, "Bots for the late shift.");
    assert.deepEqual(withMembers[0]!.botIds, ["bot:a", "bot:b"]);
  });

  it("stages custom-group removal while protecting built-in groups", () => {
    const favorites = {
      id: "group:favorites",
      name: "Favorites",
      description: "",
      botIds: ["bot:a"],
      builtIn: true,
    };
    assert.deepEqual(
      removeBotLibraryGroupManagerDraft([favorites, ...groups], "group:violet"),
      [favorites],
    );
    assert.equal(
      removeBotLibraryGroupManagerDraft([favorites, ...groups], favorites.id).length,
      2,
    );
  });

  it("accepts an empty group draft and validates its name before explicit save", () => {
    const empty = setBotLibraryGroupManagerMembers(groups, "group:violet", []);
    assert.deepEqual(empty[0]!.botIds, []);
    assert.equal(botLibraryGroupManagerNameError(empty, "group:violet", "  "), "Group name cannot be empty.");
    assert.equal(botLibraryGroupManagerNameError(empty, "group:violet", "Violet"), null);
  });

  it("derives a usable gradient preview from the selected group members", () => {
    const preview = buildBotLibraryGroupVisualVariables(
      "group:violet",
      [{ color: "#7c3aed" }, { color: "#14b8a6" }],
      "dark",
    );
    assert.match(preview["--bot-library-group-gradient"], /radial-gradient/u);
    assert.match(preview["--bot-library-group-accent"], /^#/u);
  });
});
