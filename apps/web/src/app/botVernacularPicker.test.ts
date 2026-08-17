import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOT_VERNACULAR_DEFINITIONS,
  botVernacularDefinitionForId,
} from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("bot Vernacular picker", () => {
  it("renders the word-side twin inside the Accent stage, below the map", () => {
    assert.match(
      pageSource,
      /<PronunciationAtlas[\s\S]{0,900}?\/>\s*<BotVernacularPicker/u,
    );
    assert.match(pageSource, /aria-label="Vernacular"/u);
    // The full catalog drives the choices; no hand-maintained list drifts.
    assert.match(pageSource, /BOT_VERNACULAR_DEFINITIONS\.map/u);
    // Deliberately no strength control: identity, not seasoning.
    assert.doesNotMatch(
      pageSource,
      /vernacularStrength|VernacularStrength/u,
    );
  });

  it("offers the home-pin handshake as a one-tap suggestion, never a side effect", () => {
    assert.match(
      pageSource,
      /pairs with its home accent pin — move it\?/u,
    );
    // The pin only moves from the handshake button's own click handler.
    assert.match(
      pageSource,
      /botVernacularHandshake[\s\S]{0,600}?onClick=\{\(\) => onMovePin\(pairedAccentId\)\}/u,
    );
    assert.doesNotMatch(
      pageSource,
      /useEffect\([\s\S]{0,240}?vernacularHandshakeSelection/u,
    );
    // Saving a vernacular saves immediately like an accent pin commit.
    assert.match(
      pageSource,
      /<BotVernacularPicker[\s\S]{0,700}?saveImmediately: true/u,
    );
  });

  it("keeps the player's own Zen voice free of vernacular rewriting", () => {
    // One picker in the app: the bot Accent stage. The Zen player voice map
    // must never gain one — PRISM does not restyle the player's words.
    assert.equal(
      pageSource.match(/<BotVernacularPicker/gu)?.length,
      1,
    );
    assert.doesNotMatch(
      pageSource,
      /playerVoiceProfile[\s\S]{0,1200}?BotVernacularPicker/u,
    );
  });

  it("styles the picker and handshake chip in the editor's accent language", () => {
    assert.match(pageCssSource, /\.botVernacularPicker \{/u);
    assert.match(
      pageCssSource,
      /\.botVernacularPicker button\[role="radio"\]\[aria-checked="true"\] \{[\s\S]{0,240}?--editor-bot-color/u,
    );
    assert.match(pageCssSource, /\.botVernacularHandshake \{/u);
    assert.match(pageCssSource, /\.botVernacularHandshake \{[^}]*dashed/u);
  });

  it("auditions the chosen vernacular's example line without overriding typed text", () => {
    // Preview priority: player-typed line > vernacular example > generated
    // persona line. Vernacular never rewrites supplied text — it only decides
    // what gets read when the player has not supplied any.
    assert.match(
      pageSource,
      /previewLine\.trim\(\) \|\|\s*vernacularExample \|\|\s*\(await resolvePreviewText\(\)\)/u,
    );
  });

  it("shows every catalog entry with an example line and pairs Scots with Scotland", () => {
    for (const definition of BOT_VERNACULAR_DEFINITIONS) {
      assert.ok(definition.example.length > 0, definition.id);
    }
    assert.equal(
      botVernacularDefinitionForId("scots")?.accentDefinitionId,
      "scottish-english",
    );
    assert.match(pageSource, /definition\.example/u);
  });
});
