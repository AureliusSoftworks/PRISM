import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "page.tsx"), "utf8");
const tutorials = readFileSync(join(here, "modeTutorials.ts"), "utf8");
const nvmCommand = readFileSync(join(here, "nvmCommand.ts"), "utf8");

test("system operations use stable prefix-independent IDs", () => {
  for (const name of [
    "help",
    "compact",
    "clear",
    "atmosphere",
    "restart",
    "new-session",
    "forgive-me",
    "undo",
    "nvm",
  ]) {
    assert.match(page, new RegExp(`id: "builtin:${name}"`, "u"));
    assert.doesNotMatch(page, new RegExp(`id: "builtin:/${name}"`, "u"));
  }
});

test("system execution recognizes dollar commands and leaves slash names to prompts", () => {
  const start = page.indexOf("function isBuiltInOperationalSlashCommand");
  const end = page.indexOf("function isLocalOnlyComposerCommand", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = page.slice(start, end);
  assert.match(source, /normalizedCommand === "\$undo"/u);
  assert.match(source, /normalizedCommand === "\$clear"/u);
  assert.doesNotMatch(source, /normalizedCommand === "\/undo"/u);
  assert.doesNotMatch(source, /normalizedCommand === "\/clear"/u);
});

test("every public system alias is discoverable in the dollar namespace", () => {
  for (const command of [
    "$help",
    "$compact",
    "$clear",
    "$atmosphere",
    "$restart",
    "$new-session",
    "$forgive-me",
    "$undo",
  ]) {
    assert.match(page, new RegExp(command.replace("$", "\\$"), "u"));
  }
  assert.match(page, /aliases: \["summarize"\]/u);
  assert.match(page, /aliases: \["cls"\]/u);
  assert.match(
    page,
    /BUILT_IN_ATMOSPHERE_COMMAND_ALIASES = \["wallpaper", "wall", "background"\]/u,
  );
  assert.match(page, /BUILT_IN_UNDO_COMMAND_ALIASES = \["undo-turn"\]/u);
  assert.match(nvmCommand, /"\$nvm does not take extra text/u);
});

test("player-facing tutorial guidance uses dollar system commands", () => {
  assert.match(tutorials, /\$atmosphere/u);
  assert.match(tutorials, /\$undo/u);
  assert.doesNotMatch(tutorials, /\/(?:atmosphere|undo)\b/u);
});
