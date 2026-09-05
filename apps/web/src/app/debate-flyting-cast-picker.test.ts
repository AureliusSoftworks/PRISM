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
  it("uses the shared role-card and Library-grid vocabulary for the three stage seats", () => {
    assert.match(
      flyting,
      /type FlytingCastSeat = "for" \| "against" \| "host"/u,
    );
    assert.doesNotMatch(flyting, /FLYTING_HALL_CAST_SEATS/u);
    assert.match(flyting, /renderFlytingCastSeat/u);
    assert.match(flyting, /<BotPickerToolbar/u);
    assert.match(flyting, /<BotPickerGrid/u);
    assert.match(flyting, /<BotPickerTile/u);
    assert.match(flyting, /data-tutorial-target="debate-flyting-cast"/u);
    assert.match(flyting, /ariaLabel=\{`Bot for \$\{activeCastSeatLabel\}`\}/u);
  });

  it("draws the Hall gallery automatically and freezes only the three stage seats", () => {
    assert.match(flyting, /PRISM fills the gallery automatically/u);
    assert.match(flyting, /Fifteen Library spectators/u);
    assert.match(flyting, /generic Hall\s+spectators fill any empty places/u);
    assert.match(flyting, /debateFlytingHallSpectatorBots\(\{/u);
    assert.match(flyting, /debateFlytingJarlGuardBots\(props\.session\.id\)/u);
    assert.match(flyting, /Jarl's three guards/u);
    assert.match(flyting, /Already seated in the contest/u);
    assert.match(flyting, /"aria-disabled": unavailableReason/u);
    assert.doesNotMatch(flyting, /jurorBotIds/u);
    assert.match(
      flyting,
      /const fixedPlayerHost = seat === "host" && !needsBotHost/u,
    );
  });

  it("orders the cast and floor readout as Pro, Jarl, then Con", () => {
    const roster = flyting.slice(
      flyting.indexOf(
        "className={`${studioStyles.castSlotGrid} ${styles.flytingPrincipalCast}`}",
      ),
      flyting.indexOf(
        "className={styles.gallerySeed}",
        flyting.indexOf(
          "className={`${studioStyles.castSlotGrid} ${styles.flytingPrincipalCast}`}",
        ),
      ),
    );
    assert.ok(roster.indexOf('seat: "for"') < roster.indexOf('seat: "host"'));
    assert.ok(
      roster.indexOf('seat: "host"') < roster.indexOf('seat: "against"'),
    );
    const schematic = flyting.slice(
      flyting.indexOf('aria-label="Mead Hall schematic"'),
      flyting.indexOf(
        "</aside>",
        flyting.indexOf('aria-label="Mead Hall schematic"'),
      ),
    );
    assert.ok(
      schematic.indexOf('label="Pro · left"') <
        schematic.indexOf('label="Jarl"'),
    );
    assert.ok(
      schematic.indexOf('label="Jarl"') <
        schematic.indexOf('label="Con · right"'),
    );
  });

  it("uses the shared visible-grid placement contract for Refract and Space rerolls", () => {
    assert.match(flyting, /randomBotPickerPlacements/u);
    assert.match(
      flyting,
      /placementRefractTarget=\{\s*flytingCastPlacementRefractTarget\s*\}/u,
    );
    assert.match(flyting, /value: "random"[\s\S]{0,120}Random · all/u);
    assert.match(
      flyting,
      /rerollVisible: \(\) =>[\s\S]{0,160}visibleCastBots\.map/u,
    );
    assert.match(
      flyting,
      /data-tutorial-target="debate-flyting-shuffle-cast"/u,
    );
    assert.match(
      flyting,
      /Shuffle cast[\s\S]{0,360}randomizeFlytingCastPlacements|randomizeFlytingCastPlacements[\s\S]{0,360}Shuffle cast/u,
    );
  });

  it("inherits Library groups and bot context actions from Debate Studio", () => {
    assert.match(
      debate,
      /<DebateFlytingSetup[\s\S]{0,180}botGroups=\{botGroups\}/u,
    );
    assert.match(
      debate,
      /<DebateFlytingSetup[\s\S]{0,700}onBotContextMenu=\{props\.onBotContextMenu\}/u,
    );
    assert.match(flyting, /groups=\{flytingPickerGroups\}/u);
    assert.match(flyting, /props\.onBotContextLongPressStart/u);
  });

  it("teaches role-first stage assignment and automatic gallery casting", () => {
    const flytingTutorial = tutorials.slice(
      tutorials.indexOf("const FLYTING_TUTORIAL_STEP"),
      tutorials.indexOf(
        "// Keep this dense tutorial",
        tutorials.indexOf("const FLYTING_TUTORIAL_STEP"),
      ),
    );
    assert.match(flytingTutorial, /select Pro on the left/u);
    assert.match(flytingTutorial, /Con on the right/u);
    assert.match(flytingTutorial, /fifteen Library spectators/u);
    assert.match(flytingTutorial, /generic PRISM spectators/u);
    assert.match(flytingTutorial, /three Jarl guards/u);
    assert.match(flytingTutorial, /shared Library grid/u);
    assert.match(flytingTutorial, /filter by saved group/u);
    assert.match(flytingTutorial, /vertical hue lens/u);
    assert.match(
      flytingTutorial,
      /Shuffle cast seats a fresh Pro, Jarl, and Con/u,
    );
    assert.match(flytingTutorial, /current visible Library view/u);
  });
});
