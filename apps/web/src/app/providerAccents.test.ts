import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROVIDER_ACCENT_ANTHROPIC,
  PROVIDER_ACCENT_ELEVENLABS,
  PROVIDER_ACCENT_ELEVENLABS_ON_DARK,
  PROVIDER_ACCENT_LOCAL,
  PROVIDER_ACCENT_OPENAI,
  providerAccentHex,
} from "./providerAccents.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(join(here, "page.module.css"), "utf8");

describe("provider accents", () => {
  it("locks OpenAI to the hue-inverse of Anthropic terracotta", () => {
    assert.equal(PROVIDER_ACCENT_ANTHROPIC, "#d97757");
    assert.equal(PROVIDER_ACCENT_OPENAI, "#57b9d9");
    assert.equal(providerAccentHex("openai"), PROVIDER_ACCENT_OPENAI);
    assert.equal(providerAccentHex("anthropic"), PROVIDER_ACCENT_ANTHROPIC);
    assert.equal(providerAccentHex("local"), PROVIDER_ACCENT_LOCAL);
    assert.equal(providerAccentHex("elevenlabs"), PROVIDER_ACCENT_ELEVENLABS);
    assert.equal(
      providerAccentHex("elevenlabs", { onDark: true }),
      PROVIDER_ACCENT_ELEVENLABS_ON_DARK,
    );
  });

  it("publishes matching CSS custom properties on both themes", () => {
    for (const theme of ["themeDark", "themeLight"]) {
      assert.match(
        cssSource,
        new RegExp(
          `\\.${theme}[\\s\\S]{0,2400}--provider-accent-openai:\\s*${PROVIDER_ACCENT_OPENAI}`,
          "u",
        ),
      );
      assert.match(
        cssSource,
        new RegExp(
          `\\.${theme}[\\s\\S]{0,2400}--provider-accent-anthropic:\\s*${PROVIDER_ACCENT_ANTHROPIC}`,
          "u",
        ),
      );
    }
  });

  it("wires composer, settings, effort HUD, and lean slider through tokens", () => {
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="openai"\][\s\S]{0,120}var\(--provider-accent-openai\)/u,
    );
    assert.match(
      cssSource,
      /composeModelOption\[data-model-provider="anthropic"\][\s\S]{0,120}var\(--provider-accent-anthropic\)/u,
    );
    assert.match(
      cssSource,
      /settings-model-provider-accent:\s*var\(--provider-accent-openai\)/u,
    );
    assert.match(
      cssSource,
      /model-effort-hud-accent:\s*var\(--provider-accent-openai\)/u,
    );
    assert.match(
      cssSource,
      /settingsOnlineAutoProviderBiasRange::-webkit-slider-runnable-track[\s\S]{0,220}var\(--provider-accent-openai\)/u,
    );
    assert.doesNotMatch(cssSource, /#10a37f/u);
    assert.doesNotMatch(cssSource, /#7db7ff/u);
  });
});
