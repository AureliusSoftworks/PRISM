import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const botcastSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const debateIdentitySource = readFileSync(
  new URL("./debateIdentityPresentation.ts", import.meta.url),
  "utf8",
);
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const blackoutSource = readFileSync(
  new URL("./IdentityPresentationBlackout.tsx", import.meta.url),
  "utf8",
);
const blackoutCss = readFileSync(
  new URL("./identityPresentationBlackout.module.css", import.meta.url),
  "utf8",
);

test("borrowed identities install while one shared CRT blackout is active", () => {
  assert.match(
    pageSource,
    /const identityPresentationState =\s+identityMirrorState \?\? identityShapeshiftState/u,
    "Identity Crisis must keep presentation precedence over Shapeshifter",
  );
  assert.match(
    pageSource,
    /const seatFaceStyle = identityMirrorState\s+\? resolveBotIdentityMirrorFaceV1\(/u,
    "Coffee must install the four-field face overlay before the blackout reveals it",
  );
  assert.match(
    botcastSource,
    /identityMirrorTargetFaceActive: Boolean\(\s*identityMirrorState \?\? identityShapeshiftState,?\s*\)/u,
    "Signal must install the target for the complete blackout window",
  );
  assert.match(
    pageSource,
    /data-identity-presentation-blackout=/u,
  );
  assert.match(
    css,
    /\[data-identity-presentation-blackout="true"\][\s\S]*--crt-strength:\s*0 !important/u,
  );
  assert.match(
    blackoutSource,
    /data-identity-presentation-blackout-overlay="true"/u,
  );
  assert.match(
    blackoutSource,
    /animationDelay:\s*`\$\{-elapsedMs\}ms`/u,
    "reloads must resume the persisted blackout phase instead of restarting it",
  );
  assert.match(
    blackoutCss,
    /position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*animation:\s*identity-presentation-blackout 760ms/u,
    "the shared transition must cover the full active experience",
  );
  assert.match(
    pageSource,
    /active=\{identityBorrowTransitionActive\}/u,
    "Coffee must use the shared full-screen transition",
  );
  assert.match(
    pageSource,
    /active=\{Boolean\(botSummary\.identityMirrorTransitionActive\)\}/u,
    "Signal must use the shared full-screen transition",
  );
  assert.match(
    debateSource,
    /<DebateIdentityPresentationBlackout[\s\S]{0,180}change=\{identityPresentationChange\}/u,
    "Debate must use the same full-screen transition for its live transformed cast",
  );
});

test("Chat and Zen schedule one persisted transition end without rerender loops", () => {
  assert.match(
    pageSource,
    /function useIdentityPresentationBlackout[\s\S]*Date\.parse\(state\.occurredAt\)[\s\S]*remainingMs \+ 1[\s\S]*\[state\?\.occurredAt, state\?\.sourceMessageId\]/u,
  );
  assert.match(
    pageSource,
    /identityPresentationBlackout=\{\s*zenLivePresenceIdentityBlackout\s*\}/u,
  );
  assert.doesNotMatch(
    pageSource,
    /setInterval\([^)]*identity/iu,
    "ordinary rerenders must not create a transition clock loop",
  );
});

test("Identity Crisis overlays the target face, Ink, glyph, and quoted public name only", () => {
  assert.match(
    pageSource,
    /const identityFullFormPresentationState = identityMirrorState\s+\? null\s+: identityShapeshiftState/u,
    "Coffee must reserve target materials for Shapeshifter",
  );
  assert.match(
    pageSource,
    /const fullFormPresentationIdentity = identityMirrorState\s+\? null\s+: identityShapeshiftState/u,
    "Signal must reserve target materials for Shapeshifter",
  );
  for (const field of [
    "targetColor",
    "targetVoicePreset",
    "targetFrameMaterialSeed",
  ]) {
    assert.match(
      pageSource,
      new RegExp(`(?:identityFullFormPresentationState|fullFormPresentationIdentity)\\?\\.${field}`, "u"),
      `${field} must remain available to Shapeshifter only`,
    );
  }
  assert.match(pageSource, /presentationIdentity\.targetGlyph/u);
  assert.match(pageSource, /resolveBotIdentityMirrorFaceV1/u);
  assert.match(
    pageSource,
    /identityMirrorState\s*\?\s*botIdentityMirrorQuotedTargetNameV1\([\s\S]{0,100}identityMirrorState\.targetBotName/u,
    "Coffee nameplates must take the target's literally quoted public name",
  );
  assert.match(
    botcastSource,
    /const mirroredIdentity = bot\s+\?\s*botIdentityMirrorQuotedTargetNameV1\([\s\S]{0,100}identityMirrorStates\.get\(bot\.id\)\?\.targetBotName/u,
    "Signal nameplates and captions must take the target's literally quoted public name",
  );
  assert.match(
    debateSource,
    /displayName: identityMirrorDisplayName \|\| displayName/u,
    "Debate nameplates must take the target's literally quoted public name",
  );
  assert.match(
    debateSource,
    /identityLabel: identitySource\s*\?\s*shapeshifting\s*\?\s*`Appearing as \$\{identitySource\.name\}`\s*:\s*null\s*:\s*falseName/u,
    "Identity Crisis must not duplicate the quoted public name as a secondary label",
  );
  assert.match(
    debateSource,
    /identityEffect === "identity_mirror"[\s\S]*identitySource\?\.glyph \?\? bot\.glyph[\s\S]*: bot\.glyph/u,
    "Identity Crisis borrows the glyph while Shapeshifter keeps the holder glyph",
  );
  assert.match(
    pageSource,
    /resolveBotIdentity(?:Mirror|Shapeshift)AvatarDetailsV1/u,
    "target Avatar Details Ink must resolve from the persisted snapshot",
  );
  assert.match(
    pageSource,
    /if \(args\.botSummary\.identityMirrorState\)[\s\S]*resolveBotIdentityMirrorVoiceV1[\s\S]*resolveBotIdentityShapeshiftVoiceV1/u,
    "Signal audio must keep mirror and full-form voice semantics separate",
  );
  assert.match(
    debateSource,
    /debateIdentityAppearanceBotV1\(\{/u,
    "Debate render and voice paths must use the ownership-aware snapshot",
  );
  assert.match(
    debateIdentitySource,
    /if \(args\.effect === "identity_shapeshift"\) \{[\s\S]{0,80}\.\.\.args\.target,[\s\S]{0,200}name: args\.holder\.name,[\s\S]{0,120}color: args\.holder\.color,[\s\S]{0,40}glyph: args\.holder\.glyph,/u,
    "Shapeshifter wears the target's form while keeping the holder's name, color, and glyph",
  );
  assert.match(
    debateIdentitySource,
    /applyBotIdentityMirrorFaceV1\([\s\S]*return \{\s*\.\.\.args\.holder,[\s\S]*botIdentityMirrorQuotedTargetNameV1\(args\.target\.name\)[\s\S]*glyph: args\.target\.glyph,[\s\S]*voiceProfile: applyBotIdentityMirrorHolderVoiceEffectV1/u,
    "Debate Identity Crisis must retain holder identity while borrowing the face, Ink, glyph, and quoted name",
  );
  assert.match(
    debateSource,
    /voiceSourceBotId: shapeshifting \? \(identitySource\?\.id \?\? bot\.id\) : bot\.id/u,
    "Identity Crisis speech must remain routed through the holder",
  );
  assert.match(
    pageSource,
    /const speakerId =\s+speakerBot\?\.id \?\?\s+utterance\.speaker\?\.id/u,
    "Debate synthesis attribution must remain holder-owned",
  );
});
