import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appFile = (name: string): URL => new URL(`./${name}`, import.meta.url);
const source = (name: string): string => readFileSync(appFile(name), "utf8");

describe("quiet pre-session alignment", () => {
  it("uses native applet hierarchy instead of a visible shared setup layer", () => {
    const applets = [
      source("page.tsx"),
      source("BotcastExperience.tsx"),
      source("DebateExperience.tsx"),
    ].join("\n");

    assert.equal(existsSync(appFile("SessionSetupRitual.tsx")), false);
    assert.equal(existsSync(appFile("SessionSetupRitual.module.css")), false);
    assert.doesNotMatch(applets, /\.\/SessionSetupRitual/u);
    assert.doesNotMatch(
      applets,
      /SessionRitualFrame|SessionThresholdCard|SessionSetupReuseNotice/u,
    );
  });

  it("keeps Coffee's group home and compact, reversible Table Setup desk", () => {
    const coffee = source("page.tsx");
    const coffeeStyles = source("page.module.css");

    assert.match(coffee, /coffeeTableSetupOpen/u);
    assert.match(coffee, />\s*Set the table\s*/u);
    assert.match(coffee, /<h2>Table Setup<\/h2>/u);
    assert.match(coffee, /← Back to group/u);
    assert.match(coffee, /onClick=\{closeCoffeeTableSetup\}/u);
    assert.match(
      coffee,
      /const closeCoffeeTableSetup = \(\) => \{[\s\S]*?clearCoffeeRestoredSessionSetup\(\);[\s\S]*?setCoffeeTableSetupOpen\(false\);/u,
    );
    assert.match(coffee, /className=\{styles\.coffeeRestoredSetupNotice\}/u);
    assert.match(coffee, /data-tutorial-target="coffee-recent-sessions"/u);
    assert.match(coffee, /className=\{styles\.coffeeTableSetupFooter\}/u);
    assert.match(coffee, /coffeeTableGuestSummary/u);
    assert.match(coffee, /coffeeTableTopicSummary/u);
    assert.match(coffee, /coffeeTableVisitSummary/u);
    assert.match(coffee, /coffeeTablePresetSummary/u);
    assert.match(coffee, /coffeeTableLaunchStatus/u);
    assert.match(coffee, /more needed/u);
    assert.equal(
      coffee.match(
        /onClick=\{\(\) => void startCoffeeSessionFromSelectedSetup\(\)\}/gu,
      )?.length,
      1,
    );
    assert.match(coffeeStyles, /\.coffeeTableSetupHeader/u);
    assert.match(coffeeStyles, /\.coffeeTableSetupFooter/u);
    assert.match(
      coffeeStyles,
      /\[data-coffee-table-setup="true"\][\s\S]*?> :first-child,[\s\S]*?> :nth-child\(3\)[\s\S]*?display: none;/u,
    );
  });

  it("keeps Signal editorial with reuse and one native launch row", () => {
    const signal = source("BotcastExperience.tsx");

    assert.match(signal, /className=\{styles\.productionDesk\}/u);
    assert.match(signal, /className=\{styles\.productionHeading\}/u);
    assert.match(signal, /Book the guest\. Set the angle\./u);
    assert.match(signal, /className=\{styles\.latestEpisodesHeading\}/u);
    assert.match(signal, /data-tutorial-target="botcast-latest-episodes"/u);
    assert.equal(
      signal.match(/className=\{styles\.episodeLaunchRow\}/gu)?.length,
      1,
    );
    assert.match(signal, /playbackModeDraft === "watch"/u);
    assert.match(signal, /producerGuestSelected/u);
    assert.match(signal, /Book a guest before beginning the episode/u);
    assert.match(signal, /Add an episode topic before beginning/u);
  });

  it("leaves Debate's procedural Studio and existing review presentation intact", () => {
    const debate = source("DebateExperience.tsx");

    assert.match(debate, />Debate Studio</u);
    assert.match(debate, /className=\{styles\.studioNav\}/u);
    assert.match(debate, /<span>Proceeding<\/span>/u);
    assert.match(debate, /className=\{styles\.setupCopy\}/u);
    assert.match(
      debate,
      /className=\{`\$\{styles\.setupPanel\} \$\{styles\.readinessPanel\}`\}/u,
    );
    assert.match(debate, /data-tutorial-target="debate-readiness"/u);
    assert.match(debate, /className=\{styles\.setupActions\}/u);
    assert.match(debate, />\s*\{busy \? "Saving…" : "Save Debate"\}/u);
    assert.match(debate, />\s*\{busy \? "Opening…" : "Start Debate"\}/u);
    assert.match(
      debate,
      /<p className=\{styles\.notice\} role="status">[\s\S]*?\{setupRestoreNotice\}/u,
    );
  });
});
