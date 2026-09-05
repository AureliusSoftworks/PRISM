import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  botVernacularDefinitionForId,
  botVernacularIdForAccentDefinition,
  botVernacularIdFromStoredVoiceProfile,
} from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("pin-derived vernacular", () => {
  it("offers no separate vernacular picker: the Accent pin owns phrasing", () => {
    assert.doesNotMatch(pageSource, /BotVernacularPicker/u);
    assert.doesNotMatch(pageSource, /vernacularHandshakeSelection/u);
    assert.doesNotMatch(pageCssSource, /botVernacularPicker/u);
    assert.match(
      tutorialSource,
      /pin Cockney and the bot phrases things like a Cockney/u,
    );
    assert.match(tutorialSource, /Your messages are never restyled/u);
  });

  it("derives each regional vernacular from its pin, sharing Southern across the South", () => {
    assert.equal(botVernacularIdForAccentDefinition("cockney-english"), "cockney");
    assert.equal(botVernacularIdForAccentDefinition("scottish-english"), "scots");
    assert.equal(
      botVernacularIdForAccentDefinition("irish-english"),
      "hiberno-english",
    );
    assert.equal(botVernacularIdForAccentDefinition("australian-english"), "aussie");
    for (const southern of [
      "southern-us-english",
      "texas-english",
      "appalachian-english",
      "north-florida-english",
    ]) {
      assert.equal(botVernacularIdForAccentDefinition(southern), "southern-us");
    }
    assert.equal(botVernacularIdForAccentDefinition("new-york-english"), "new-york");
    assert.equal(
      botVernacularIdForAccentDefinition("eastern-new-england-english"),
      "new-england",
    );
    assert.equal(botVernacularIdForAccentDefinition("canadian-english"), "canadian");
    assert.equal(botVernacularIdForAccentDefinition("new-zealand-english"), "kiwi");
    // Broad bases and accents without an authored vernacular stay plain.
    for (const plain of [
      "american-english",
      "british-english",
      "modern-rp-english",
      "miami-english",
    ]) {
      assert.equal(botVernacularIdForAccentDefinition(plain), null, plain);
    }
  });

  it("lets an authored regional vernacular outrank the pin", () => {
    // Placeless registers (noir, archaic) are Powers now, not vernaculars.
    assert.equal(
      botVernacularIdFromStoredVoiceProfile({
        accentDefinitionId: "cockney-english",
        vernacularId: "aussie",
      }),
      "aussie",
    );
    assert.equal(
      botVernacularIdFromStoredVoiceProfile({
        accentDefinitionId: "texas-english",
      }),
      "southern-us",
    );
    // Legacy profiles that stored only the Speechprint influence still derive.
    assert.equal(
      botVernacularIdFromStoredVoiceProfile({
        speechprintInfluence: "scottish-english",
      }),
      "scots",
    );
  });

  it("auditions the derived vernacular without overriding typed text", () => {
    assert.match(
      pageSource,
      /botVernacularIdFromStoredVoiceProfile\(normalizedProfile\)/u,
    );
    assert.match(
      pageSource,
      /previewLine\.trim\(\) \|\|\s*vernacularExample \|\|\s*\(await resolvePreviewText\(\)\)/u,
    );
  });

  it("keeps the player's own Zen voice free of vernacular rewriting", () => {
    assert.doesNotMatch(
      pageSource,
      /playerVoiceProfile[\s\S]{0,1200}?[Vv]ernacular/u,
    );
    assert.ok(botVernacularDefinitionForId("scots"));
  });
});
