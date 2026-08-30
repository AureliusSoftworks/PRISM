import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

const flyting = read("./DebateFlyting.tsx");
const debate = read("./DebateExperience.tsx");
const tutorials = read("./modeTutorials.ts");

describe("Flyting cast picker", () => {
  it("uses the shared role-card and Library-grid vocabulary for every Hall seat", () => {
    assert.match(flyting, /const FLYTING_HALL_CAST_SEATS/u);
    assert.match(flyting, /renderFlytingCastSeat/u);
    assert.match(flyting, /<BotPickerToolbar/u);
    assert.match(flyting, /<BotPickerGrid/u);
    assert.match(flyting, /<BotPickerTile/u);
    assert.match(flyting, /data-tutorial-target="debate-flyting-cast"/u);
    assert.match(flyting, /ariaLabel=\{`Bot for \$\{activeCastSeatLabel\}`\}/u);
  });

  it("keeps Hall Surprise seats editable and freezes manual pins with the proceeding", () => {
    assert.match(
      flyting,
      /Array\.from\(\{ length: DEBATE_JURY_SIZE \}, \(\) => null\)/u,
    );
    assert.match(flyting, /Already seated in the Hall/u);
    assert.match(flyting, /"aria-disabled": unavailableReason/u);
    assert.match(flyting, /jurorBotIds,\s*\n\s*\},/u);
    assert.match(flyting, /const fixedPlayerHost = seat === "host" && !needsBotHost/u);
  });

  it("inherits Library groups and bot context actions from Debate Studio", () => {
    assert.match(debate, /<DebateFlytingSetup[\s\S]{0,180}botGroups=\{botGroups\}/u);
    assert.match(
      debate,
      /<DebateFlytingSetup[\s\S]{0,700}onBotContextMenu=\{props\.onBotContextMenu\}/u,
    );
    assert.match(flyting, /groups=\{flytingPickerGroups\}/u);
    assert.match(flyting, /props\.onBotContextLongPressStart/u);
  });

  it("teaches role-first assignment, search, groups, hue, and Surprise behavior", () => {
    const flytingTutorial = tutorials.slice(
      tutorials.indexOf("const FLYTING_TUTORIAL_STEP"),
      tutorials.indexOf("// Keep this dense tutorial", tutorials.indexOf("const FLYTING_TUTORIAL_STEP")),
    );
    assert.match(flytingTutorial, /select the Pro, Con, Host, or one of four Hall role cards/u);
    assert.match(flytingTutorial, /shared Library grid/u);
    assert.match(flytingTutorial, /filter by saved group/u);
    assert.match(flytingTutorial, /vertical hue lens/u);
    assert.match(flytingTutorial, /Hall seats begin on Surprise me/u);
  });
});
