import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LOCAL_VOICE_SPEECHPRINT_CAPABILITIES } from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const atlasSource = readFileSync(
  new URL("./PronunciationAtlas.tsx", import.meta.url),
  "utf8",
);
const atlasModelSource = readFileSync(
  new URL("./pronunciationAtlasModel.ts", import.meta.url),
  "utf8",
);
const atlasCssSource = readFileSync(
  new URL("./PronunciationAtlas.module.css", import.meta.url),
  "utf8",
);
const pageCssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const actionSfxSource = readFileSync(
  new URL("./coffee-action-sfx.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const atlasMap = new URL(
  "../../public/voice/pronunciation-atlas-earth-equirectangular-v2.svg",
  import.meta.url,
);

describe("cross-accent local voice pronunciation controls", () => {
  it("uses the Foundry adjustment console for bots and Default PRISM", () => {
    assert.match(pageSource, /value: "pronunciation", label: "1 Accent"/u);
    assert.match(pageSource, /value: "local", label: "2 TTS"/u);
    assert.match(pageSource, /value: "premium", label: "3 Premium"/u);
    assert.match(pageSource, /data-bot-voice-local-stage="true"/u);
    assert.match(pageSource, /data-bot-voice-premium-stage="true"/u);
    assert.match(pageSource, /data-bot-voice-identity-stage=/u);
    assert.match(pageSource, /<PronunciationAtlas/u);
    assert.match(pageSource, /data-adjustment-target=/u);
    assert.match(atlasSource, /label = "Accent map"/u);
    assert.doesNotMatch(atlasSource, /Accent Map pronunciation/u);
    assert.doesNotMatch(atlasSource, /role="switch"/u);
    assert.match(pageSource, /aria-label="TTS pronunciation help"/u);
    assert.match(pageSource, /ttsPronunciationEnabled:/u);
    assert.match(pageSource, /aria-label="Premium pronunciation help"/u);
    assert.match(pageSource, /premiumPronunciationEnabled:/u);
    assert.doesNotMatch(atlasModelSource, /activatePronunciation/u);
    assert.doesNotMatch(
      pageSource,
      /activeAdjustmentTarget === "pronunciation" \? null : activeAdjustmentOptions/,
    );
  });

  it("applies curated Marketplace pronunciation defaults without losing imported overrides", () => {
    const defaultStart = pageSource.indexOf(
      'if (typeof options?.pronunciationHelpEnabledDefault === "boolean")',
    );
    const defaultEnd = pageSource.indexOf(
      "if (options?.generateThinkingSfx)",
      defaultStart,
    );
    assert.ok(defaultStart >= 0 && defaultEnd > defaultStart);
    const defaultSource = pageSource.slice(defaultStart, defaultEnd);
    assert.match(defaultSource, /authoredAudioVoiceProfile/u);
    assert.match(defaultSource, /audioVoiceProfileOverride/u);
    assert.equal(
      defaultSource.match(
        /(?:tts|premium)PronunciationEnabled:\s*options\.pronunciationHelpEnabledDefault/gu,
      )?.length,
      4,
    );
    assert.match(
      pageSource,
      /generateThinkingSfx: true,[\s\S]*?pronunciationHelpEnabledDefault:[\s\S]*?marketplaceAccentPronunciationDefault\(bundle\.entry\)/u,
    );
    assert.match(pageSource, /botAudioVoiceProfileHasExplicitAccentPronunciationSetting\([\s\S]*?installedOverrideValue/u);
    assert.match(pageSource, /premiumPronunciationEnabled:[\s\S]*?marketplaceAccentPronunciationDefault\(/u);
    assert.match(pageSource, /marketplaceAccentPronunciationDefault\(\s*prepared\.entry,/u);
    assert.match(
      pageSource,
      /if \(installedOverride && installedOverrideChanged\)[\s\S]*?marketplacePatch\.audioVoiceProfileOverride = installedOverride/u,
    );
  });

  it("offers no player accent map — player speech defers to Default PRISM", () => {
    assert.doesNotMatch(pageSource, /label="Zen accent map"/u);
    assert.doesNotMatch(pageSource, /playerAudioVoiceProfile/u);
  });

  it("keeps Avatar Studio map interactions save-only and auditions beneath the bot", () => {
    const avatarAtlasSource = pageSource.slice(
      pageSource.indexOf("selection={avatarPronunciationSelection}"),
      pageSource.indexOf(
        'if (activeControlTab === "voice" && !avatarVoiceAccentReady)',
      ),
    );
    assert.match(
      avatarAtlasSource,
      /onCommit=\{\(selection\) => \{\s*const nextProfile = profileWithPronunciationAtlasSelection\([\s\S]*?onAudioVoiceProfileChange\(nextProfile, \{ saveImmediately: true \}\);\s*\}\}/u,
    );
    assert.doesNotMatch(
      avatarAtlasSource,
      /void playPronunciationAtlasPreview\(nextProfile\)/,
    );
    assert.doesNotMatch(avatarAtlasSource, /onPreviewSource|onPreviewCurrent/u);
    assert.match(
      pageSource,
      /voiceTestDock=\{\s*<BotAvatarVoiceTestDock[\s\S]*?onPreview=\{playAvatarVoicePreview\}/u,
    );
  });

  it("keeps pin preview, commit, and nearby choices silent in every map", () => {
    assert.match(
      atlasSource,
      /onPreview=\{\(next\) => \{\s*setDraftValue\(next\);\s*if \(!pendingDrillRef\.current\) onPreview\(next\.selection\);\s*\}\}/u,
    );
    assert.match(
      atlasSource,
      /onCommit=\{\(next\) => \{[\s\S]*?onCommit\(committed\.selection\);[\s\S]*?\}\}/u,
    );
    assert.match(
      atlasSource,
      /onClick=\{\(\) => commitSelection\(candidate\.selection\)\}/u,
    );
    assert.match(
      atlasSource,
      /data-pronunciation-atlas-variant="true"[\s\S]*?data-accent-definition-id/u,
    );
    const silentInteractionSource = atlasSource.slice(
      atlasSource.indexOf("<AdjustmentPad"),
      atlasSource.indexOf("<div className={styles.controls}>"),
    );
    assert.doesNotMatch(
      silentInteractionSource,
      /onPreviewSource|onPreviewCurrent|previewVoice|playPronunciationAtlasPreview|previewSelectedVoice/u,
    );
  });

  it("keeps synthesis out of the map and inside the bot's audition dock", () => {
    assert.doesNotMatch(
      atlasSource,
      /onPreviewSource|onPreviewCurrent|previewVoice|playPronunciationAtlasPreview|previewSelectedVoice|\.play\(/u,
    );
    assert.match(pageSource, /aria-label="Test this bot's voice"/u);
    assert.match(pageSource, /onClick=\{\(\) => void playChoice\(choice\)\}/u);
    assert.match(pageSource, /onClick=\{\(\) => void playChoice\("current"\)\}/u);
    const auditionDockSource = pageSource.slice(
      pageSource.indexOf("function BotAvatarVoiceTestDock"),
      pageSource.indexOf("function botAvatarFaceIsDefault"),
    );
    assert.match(auditionDockSource, /onKeyDown=\{\(event\) =>/u);
    assert.match(auditionDockSource, /event\.key !== "Enter"/u);
    assert.doesNotMatch(auditionDockSource, /autoPlay|useEffect/u);
  });

  it("drills into crowded regions through ephemeral lenses that never persist", () => {
    // The lens zooms the pad, artwork, and pointer math; committed pins stay
    // in global map space and no lens id ever rides the saved selection.
    // Lens chips are gone: the map itself is the navigator. The world view
    // stashes drill intent instead of placing the pin, and a single control
    // returns to the globe.
    assert.doesNotMatch(atlasSource, /PRONUNCIATION_ATLAS_LENSES\.map/u);
    assert.match(atlasSource, /aria-label="Map view"/u);
    assert.match(atlasSource, /◂ World map/u);
    assert.match(atlasSource, /pendingDrillRef\.current = drill\.id;\s*return current;/u);
    assert.match(atlasSource, /pronunciationAtlasNearestDrillLens\(globalPoint, lens\)/u);
    assert.match(atlasSource, /useState<string>\("world"\)/u);
    assert.match(
      atlasSource,
      /pronunciationAtlasPointFromLensProjection\(\s*point,\s*lens,?\s*\)/u,
    );
    assert.doesNotMatch(atlasSource, /lensId:\s|lens:\s*lens/u);
    // Switching lenses drops any stale draft measured in the old lens frame.
    assert.match(atlasSource, /setDraftValue\(null\);\s*setLensId/u);
    // The artwork zoom is pure CSS custom properties over the pinned mask.
    assert.match(atlasCssSource, /--atlas-lens-zoom: 1;/u);
    assert.match(
      atlasCssSource,
      /mask-size: calc\(var\(--atlas-lens-zoom\) \* 100%\)/u,
    );
    assert.match(
      atlasCssSource,
      /mask-position: var\(--atlas-lens-pos-x\) var\(--atlas-lens-pos-y\)/u,
    );
  });

  it("surfaces countries and states only when drilled in, with footprint marks", () => {
    // Borders are a second georeferenced Natural Earth mask that stays
    // invisible on the world's clean silhouette and fades in with the lens.
    assert.match(
      atlasCssSource,
      /url\("\/voice\/pronunciation-atlas-borders-equirectangular-v1\.svg"\)/u,
    );
    assert.match(
      atlasCssSource,
      /\.borders[\s\S]{0,900}?opacity: clamp\(0, \(var\(--atlas-lens-zoom\) - 1\.4\) \* 0\.18, 0\.42\)/u,
    );
    // Deeper-lens footprints render as labeled marks inside the map overlay;
    // hovering or focusing a chip previews that lens's footprint.
    assert.match(atlasSource, /pronunciationAtlasDrillCandidates\(lens\)/u);
    assert.match(atlasSource, /className=\{styles\.lensFootprint\}/u);
    // The map layer stays presentation-only; footprints live inside the
    // aria-hidden overlay and never introduce interactive anchor nodes.
    assert.match(atlasSource, /className=\{styles\.map\} aria-hidden="true"/u);
  });

  it("never renders an Accent Map audition button", () => {
    assert.doesNotMatch(atlasSource, />\s*Original\s*</u);
    assert.doesNotMatch(atlasSource, />\s*With accent\s*</u);
  });

  it("offers Russian-influenced English through the shared Speechprint catalog", () => {
    assert.equal(
      LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
        (capability) => capability.id === "russian-influenced-english",
      )?.label,
      "Russian-influenced English",
    );
    assert.match(atlasSource, /pronunciationAtlasNamedCandidates/u);
  });

  it("offers international and regional American pronunciation without map nodes", () => {
    for (const id of [
      "italian-influenced-english",
      "australian-english",
      "canadian-english",
      "new-york-english",
      "southern-us-english",
    ]) {
      assert.ok(
        LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.some(
          (capability) => capability.id === id,
        ),
      );
    }
    assert.doesNotMatch(atlasSource, /PRONUNCIATION_ATLAS_ANCHORS\.map/u);
    assert.doesNotMatch(atlasCssSource, /\.anchor\b/u);
  });

  it("offers broadly local coverage across every inhabited continent", () => {
    for (const id of [
      "latin-american-spanish-influenced-english",
      "mexican-spanish-influenced-english",
      "north-african-arabic-influenced-english",
      "nigerian-english",
      "east-african-english",
      "south-african-english",
      "pakistani-english",
      "cantonese-influenced-english",
      "filipino-english",
      "indonesian-influenced-english",
      "new-zealand-english",
      "pacific-island-english",
    ]) {
      assert.ok(
        LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.some(
          (capability) => capability.id === id,
        ),
        id,
      );
    }
  });

  it("uses one full-frame georeferenced Earth mask instead of procedural land polygons", () => {
    assert.doesNotMatch(atlasSource, /<path d=/u);
    assert.match(
      atlasCssSource,
      /url\("\/voice\/pronunciation-atlas-earth-equirectangular-v2\.svg"\)/u,
    );
    assert.match(atlasCssSource, /\.map\s*\{[\s\S]*?inset:\s*0;/u);
    assert.equal(existsSync(atlasMap), true);
    const mapSource = readFileSync(atlasMap, "utf8");
    assert.match(mapSource, /Natural Earth 1:50m land, public domain/u);
    assert.match(mapSource, /Projection: equirectangular/u);
    assert.match(mapSource, /viewBox="0 0 1774 887"/u);
    assert.match(mapSource, /preserveAspectRatio="none"/u);
  });

  it("commits and persists the exact dropped map point", () => {
    assert.doesNotMatch(atlasSource, /const snapped/u);
    assert.match(atlasSource, /pronunciationAtlasPointForSelection/u);
    assert.match(
      atlasModelSource,
      /pronunciationMapPoint: normalizedSelection\.point/u,
    );
  });

  it("offers nearby accent choices and a single stage-level audition dock", () => {
    assert.doesNotMatch(atlasSource, /Nearby choices/u);
    assert.match(atlasSource, /Local variants/u);
    assert.match(atlasSource, /variantCandidates\.length > 0/u);
    assert.match(atlasSource, /pronunciationAtlasVariantCandidatesInLens/u);
    assert.match(pageSource, /className=\{styles\.botAvatarVoiceTestDock\}/u);
    assert.match(pageSource, /English[\s\S]*Premium[\s\S]*Babble[\s\S]*Bottish/u);
    assert.match(pageSource, /Nothing is added to chat\./u);
  });

  it("keeps the Laugh recipe on the Accent step, above the step action", () => {
    assert.match(pageSource, /function BotVoiceLaughRecipe\(/u);
    assert.match(
      pageSource,
      /<PronunciationAtlas[\s\S]*?onContinue=\{\(\) => setActiveAdjustmentTarget\("local"\)\}[\s\S]*?<BotVoiceLaughRecipe/u,
    );
    assert.match(pageSource, /data-tutorial-target="avatar-local-laugh"/u);
    // The section is authored identity, so no eligibility gate may hide it.
    assert.doesNotMatch(pageSource, /laughControlAvailable/u);
    assert.match(atlasSource, /\{children\}\n      \{onContinue \? \(/u);
    assert.match(atlasSource, /children\?: ReactNode;/u);
    assert.match(
      pageSource,
      /instantTtsSpeaksLaugh[\s\S]*?localVoiceSource === "portable"/u,
    );
    assert.match(pageSource, /Samples always play in Instant TTS\./u);
  });

  it("offers a truthful Premium laugh switch wired through every lane", () => {
    assert.match(pageSource, /aria-label="Premium authored laugh"/u);
    assert.match(pageSource, /data-premium-laugh-toggle="true"/u);
    assert.match(pageSource, /premiumLaughEnabled: !premiumLaughEnabled/u);
    assert.match(
      pageCssSource,
      /\.botVoiceLocalLaughLaneToggle > button\[data-active="true"\]/u,
    );
    // Premium speaks the authored laugh, so the pack clip must stand down.
    assert.match(
      actionSfxSource,
      /profile\.premiumLaughEnabled === true[\s\S]*?elevenlabs/u,
    );
    // Projection rewrites the carrier, so censored and aligned takes opt out.
    assert.match(
      serverSource,
      /const premiumSpeechText =\s*\n\s*boundary\.censorRanges\.length === 0 && !request\.includeAlignment/u,
    );
    assert.match(serverSource, /text: premiumSpeechText,/u);
    assert.match(
      serverSource,
      /profile\.premiumLaughEnabled === true && Boolean\(profile\.localLaughSyllable\)/u,
    );
  });
});
