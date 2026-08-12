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
    /const seatFaceStyle = identityBorrowTargetActive\s+\? identityPresentationState!\.targetFace/u,
    "Coffee must apply the target before the blackout reveals it",
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

test("Identity Crisis borrows identity while Shapeshifter retains full-form presentation", () => {
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
  assert.match(pageSource, /identityPresentationState!\.targetFace/u);
  assert.match(
    botcastSource,
    /identityMirrorStates\.get\(bot\.id\) \?\?[\s\S]*identityShapeshiftStates\.get\(bot\.id\)[\s\S]*targetBotName\.trim\(\)/u,
    "Signal nameplates and captions must use the borrowed diegetic name",
  );
  assert.match(
    debateSource,
    /displayName: identitySource\?\.name \?\? displayName/u,
    "Debate nameplates must use the borrowed diegetic name",
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
    /if \(args\.effect === "identity_shapeshift"\) return args\.target/u,
    "Shapeshifter must retain complete target presentation",
  );
  assert.match(
    debateIdentitySource,
    /color: args\.holder\.color[\s\S]*voiceProfile: applyBotIdentityMirrorHolderVoiceEffectV1[\s\S]*provider: args\.holder\.provider/u,
    "Debate Identity Crisis must retain holder material and routing boundaries",
  );
  assert.match(
    pageSource,
    /const speakerId =\s+speakerBot\?\.id \?\?\s+utterance\.speaker\?\.id/u,
    "Debate synthesis attribution must remain holder-owned",
  );
});
