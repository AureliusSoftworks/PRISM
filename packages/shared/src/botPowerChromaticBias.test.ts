import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
  botPowerChromaticBiasColorMatchesV1,
  botPowerChromaticBiasCueFromEffectsV1,
  botPowerChromaticBiasEffectsFromIntentV1,
  botPowerChromaticBiasResolvedHueV1,
  botPowerHueLabelV1,
  normalizeBotPowerEffectV1,
} from "./botPower.ts";
import { botIdentityHueDeg, complementaryHueDeg } from "./color.ts";

test("chromatic bias normalizes named and complementary colors", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "chromatic_bias",
      polarity: "love",
      color: { kind: "named", hue: 240, label: "blue" },
      strength: "huge",
    }),
    {
      type: "chromatic_bias",
      polarity: "love",
      color: { kind: "named", hue: 240, label: "blue" },
      strength: "medium",
      matchBandDeg: BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
    },
  );
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "chromatic_bias",
      polarity: "nope",
      color: { kind: "complementary_of_holder" },
    }),
    {
      type: "chromatic_bias",
      polarity: "hate",
      color: { kind: "complementary_of_holder" },
      strength: "medium",
      matchBandDeg: BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
    },
  );
  assert.equal(
    normalizeBotPowerEffectV1({ type: "chromatic_bias", polarity: "love" }),
    null,
  );
});

test("racist with no color compiles to complementary hate", () => {
  const effects = botPowerChromaticBiasEffectsFromIntentV1(
    "Racist",
    "He is racist toward other bots.",
  );
  assert.deepEqual(effects, [
    {
      type: "chromatic_bias",
      polarity: "hate",
      color: { kind: "complementary_of_holder" },
      strength: "large",
      matchBandDeg: BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
    },
  ]);
});

test("named love and hate colors compile from intent", () => {
  const loved = botPowerChromaticBiasEffectsFromIntentV1(
    "Blue Heart",
    "She loves the color blue.",
  );
  assert.equal(loved[0]?.polarity, "love");
  assert.equal(loved[0]?.color.kind === "named" ? loved[0].color.label : "", "blue");

  const hated = botPowerChromaticBiasEffectsFromIntentV1(
    "Red Aversion",
    "He hates red bots.",
  );
  assert.equal(hated[0]?.polarity, "hate");
  assert.equal(hated[0]?.color.kind === "named" ? hated[0].color.label : "", "red");
});

test("racist against a named color binds hate to that hue", () => {
  const effects = botPowerChromaticBiasEffectsFromIntentV1(
    "Racist",
    "Racist against green.",
  );
  assert.equal(effects.length, 1);
  assert.equal(effects[0]?.polarity, "hate");
  assert.equal(
    effects[0]?.color.kind === "named" ? effects[0].color.label : "",
    "green",
  );
});

test("color-cycle wording does not become chromatic bias", () => {
  assert.deepEqual(
    botPowerChromaticBiasEffectsFromIntentV1(
      "Living Spectrum",
      "This bot's color cycles through the rainbow.",
    ),
    [],
  );
});

test("complementary hue matching uses the holder's identity color", () => {
  const effect = botPowerChromaticBiasEffectsFromIntentV1(
    "Racist",
    "He is racist.",
  )[0]!;
  const holderHue = botIdentityHueDeg("#ff0000");
  assert.ok(holderHue !== null);
  const targetHue = botPowerChromaticBiasResolvedHueV1(effect, "#ff0000");
  assert.equal(targetHue, complementaryHueDeg(holderHue!));
  assert.equal(botPowerHueLabelV1(targetHue!), "cyan");
  assert.equal(
    botPowerChromaticBiasColorMatchesV1(targetHue!, "#00fff0"),
    true,
  );
  assert.equal(
    botPowerChromaticBiasColorMatchesV1(targetHue!, "#ff0000"),
    false,
  );
  assert.equal(
    botPowerChromaticBiasResolvedHueV1(effect, "#808080"),
    null,
  );
});

test("chromatic bias cue names matching peers and never the player", () => {
  const cue = botPowerChromaticBiasCueFromEffectsV1({
    effects: [
      {
        type: "chromatic_bias",
        polarity: "hate",
        color: { kind: "complementary_of_holder" },
        strength: "large",
        matchBandDeg: BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
      },
    ],
    holderColor: "#ff0000",
    holderBotId: "hugh",
    peers: [
      { botId: "hugh", name: "Hueist Hugh", color: "#ff0000" },
      { botId: "cyan", name: "Cyan Carl", color: "#00fff0" },
      { botId: "ruby", name: "Ruby Rue", color: "#ff2244" },
    ],
    modeLabel: "Coffee",
    currentAddresseeName: "Cyan Carl",
  });
  assert.match(cue ?? "", /Coffee hue prejudice/iu);
  assert.match(cue ?? "", /Cyan Carl/u);
  assert.doesNotMatch(cue ?? "", /Ruby Rue/u);
  assert.match(cue ?? "", /current addressee, Cyan Carl/iu);
  assert.match(cue ?? "", /never people or the player/iu);
  assert.match(cue ?? "", /no slurs/iu);
});
