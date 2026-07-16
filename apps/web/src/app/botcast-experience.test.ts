import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const source = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");
const blockingLoaderSource = readFileSync(
  new URL("./PrismBlockingLoader.tsx", import.meta.url),
  "utf8",
);
const artworkActivitySource = readFileSync(
  new URL("./SignalArtworkJobActivity.tsx", import.meta.url),
  "utf8",
);
const artworkActivityCss = readFileSync(
  new URL("./signalArtworkJobActivity.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("Signal experience shell", () => {
  it("uses Signal throughout player-facing applet chrome", () => {
    assert.match(source, /<h1>Signal<\/h1>/u);
    assert.match(source, /aria-label="Signal shows"/u);
    assert.match(source, /aria-label="Signal replay cameras"/u);
    assert.match(
      pageSource,
      /sidebarHeader=\{renderSharedAppletSidebarHeader\("botcast"\)\}/u,
    );
    assert.doesNotMatch(source, />BOTCAST</u);
  });

  it("defaults replay to Auto and keeps manual camera selection viewer-local", () => {
    assert.match(source, /useState<BotcastCameraShot>\("auto"\)/u);
    assert.match(source, /\["auto", "left", "right", "wide"\]/u);
    assert.match(source, /setReplayCamera\(camera\)/u);
    assert.match(source, /replayTimeline\.messageStartMs\[index\]/u);
    assert.doesNotMatch(source, /index \* 4_500/u);
    assert.doesNotMatch(source, /PATCH[\s\S]{0,120}replayCamera/u);
  });

  it("renders the authored two-seat stage and empty-chair aftermath", () => {
    assert.match(source, /data-role="host"/u);
    assert.match(source, /data-role="guest"/u);
    assert.match(source, /data-signal-presence="host"/u);
    assert.match(source, /data-signal-presence="guest"/u);
    assert.match(source, /Guest has left the studio/u);
    assert.match(source, /Host coffee mug/u);
    assert.match(source, /Guest coffee mug/u);
    assert.match(css, /\.hostSeat\s*\{\s*left:/u);
    assert.match(css, /\.guestSeat\s*\{\s*right:/u);
    assert.match(css, /\.avatarRig\s*\{[^}]*bottom:\s*20%/u);
    assert.match(css, /\.nameplate\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.stageMug\s*\{[^}]*position:\s*absolute/u);
    assert.doesNotMatch(source, /styles\.(?:chair|boomMic|studioDesk|mugLogo)/u);
    assert.doesNotMatch(css, /\.(?:chair|boomMic|studioDesk)\s*\{/u);
    assert.match(source, /const thinkingRole = botcastNextSpeakerRole/u);
    assert.match(source, /const roleIsThinking = \(role: "host" \| "guest"\)/u);
    assert.match(source, /speechReveal\?\.phase === "preparing"/u);
    assert.match(source, /Warming the mic…/u);
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.zenLiveBotPresencePlate\} \$\{styles\.signalBotPresencePlate\}`\}/u,
    );
    assert.match(pageSource, /data-zen-live-bot-presence-plate="true"/u);
    assert.match(pageSource, /renderMug=\{\(botSummary, mugState\) =>/u);
    assert.match(pageSource, /buildCoffeeCupVisualState\(\{/u);
    assert.match(pageSource, /styles\.coffeeCup\} \$\{styles\.signalCoffeeCup/u);
    assert.match(
      pageSource,
      /data-cup-mirrored=\{\s*mugState\.role === "host" \? "true" : undefined\s*\}/u,
    );
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\s*\{[^}]*--zen-live-bot-face-scale:\s*1\.68/iu,
    );
    assert.match(
      pageCss,
      /\.coffeeCup\.signalCoffeeCup[^}]*position:\s*relative/iu,
    );
  });

  it("keeps Signal coffee cosmetic and producer direction private", () => {
    assert.doesNotMatch(source, /top.?off|refill|depletion/iu);
    assert.match(source, /Private line to host/u);
    assert.match(source, /never spoken or attributed to you/u);
  });

  it("keeps live turns, transcript reveal, and stage presence on the real voice clock", () => {
    assert.doesNotMatch(source, /speakingTimerRef|9_000|split\(\/\\s\+\/u\)\.length \* 280/u);
    assert.match(source, /await onUtterance\(message, bot, lifecycle\)/u);
    assert.match(source, /onStart: \(durationMs, alignment\)/u);
    assert.match(source, /onProgress: \(elapsedMs, durationMs\)/u);
    assert.match(source, /botcastSpeechRevealVisibleText\(liveSpeech\.reveal\)/u);
    assert.match(source, /episode\.messages\.length \? 360 : 0/u);
    assert.match(source, /episodeOperationAbortRef\.current\?\.abort\(\)/u);
    assert.match(source, /signal: controller\.signal/u);
    assert.match(source, /episodeOperationIsCurrent\(controller, runId\)/u);
    assert.match(source, /onPrepareUtterance\?\.\(\);[\s\S]{0,80}setAutoRun\(true\)/u);
    assert.match(source, /const played = await onUtterance\(replayActiveMessage, bot,/u);
    assert.match(source, /replayVoicePending/u);
    assert.match(source, /replayVoiceRunIdRef\.current !== runId/u);
    assert.doesNotMatch(source, /onUtterance\(replayActiveMessage, bot, \{\}\)/u);
    assert.match(pageSource, /includeAlignment: true/u);
    assert.match(pageSource, /readEnglishVoiceSynthesisClip\(response\)/u);
    assert.match(pageSource, /lifecycle: trackedLifecycle/u);
    assert.match(
      pageSource,
      /coffeePlateFaceScaleYFromSeatHorizontalSide\(\s*avatarState\.role === "host" \? -1 : 1/u,
    );
    assert.match(pageSource, /botAvatarDetailsFacingScaleX\(faceScaleY\)/u);
    assert.match(pageSource, /blinkWhileTalking/u);
    assert.match(pageSource, /mouthShape=\{avatarState\.mouthShape\}/u);
    assert.match(css, /\.avatarRig\[data-talking="true"\][^}]*signalBotTalking/iu);
    assert.match(css, /@keyframes signalBotIdle/u);
    assert.match(css, /@keyframes signalBotThinking/u);
    assert.match(css, /\.wordmark \.showLogo\s*\{[^}]*width:\s*68px/iu);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.avatarRig\s*\{[^}]*animation:\s*none/iu);
  });

  it("offers one complete first-look synthesis after creation while keeping PRISM fallbacks immediate", () => {
    const createShowSource = source.slice(
      source.indexOf("const createShow"),
      source.indexOf("const renameShow"),
    );
    const artworkSource = source.slice(
      source.indexOf("const generateShowArtwork"),
      source.indexOf("const createShow"),
    );
    assert.doesNotMatch(source, /synthesizeArtwork|Synthesize studios \+ logo/u);
    assert.doesNotMatch(createShowSource, /generateShowArtwork|\/brand|\/name/u);
    assert.match(source, /ready with its built-in PRISM set\. Create its custom look whenever you want one/u);
    assert.match(source, /function showHasCustomArtwork/u);
    assert.match(source, /!showHasCustomArtwork\(selectedShow\)/u);
    assert.equal(
      source.match(/>\s*Create this show’s look\s*</gu)?.length ?? 0,
      1,
      "The initial no-art state should offer one synthesis action",
    );
    assert.equal(source.match(/data-signal-first-look-action=/gu)?.length ?? 0, 1);
    assert.doesNotMatch(source, />\s*Find a clever name\s*</u);
    assert.match(source, /\/brand/u);
    assert.match(source, /Finding the name and visual identity/u);
    assert.match(source, /setShowNameDraft\(identity\.show\.name\)/u);
    assert.match(
      source,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/artwork-job/u,
    );
    assert.match(source, /announceSignalArtworkJob\(response\.job\)/u);
    assert.match(source, /You can keep using PRISM/u);
    assert.doesNotMatch(
      source,
      /generateShowArtwork\(\s*selectedShow,\s*false/u,
    );
    assert.match(
      source,
      /kinds: readonly SignalArtworkKind\[\] = \["night-studio", "day-studio", "logo"\]/u,
    );
    assert.match(source, /aria-label="Optional custom show artwork"/u);
    assert.match(source, /data-tutorial-target="botcast-brand-controls"/u);
    assert.match(css, /\.showLookInvitation button\s*\{[^}]*linear-gradient/iu);
    assert.match(source, /regenerateLogo: true/u);
    assert.match(source, />\s*Refresh name\s*</u);
    assert.match(source, />\s*Refresh Light\s*</u);
    assert.match(source, />\s*Refresh Dark\s*</u);
    assert.match(source, />\s*Refresh logo\s*</u);
    assert.match(
      source,
      /const kind: SignalArtworkKind = lighting === "day" \? "day-studio" : "night-studio"/u,
    );
    assert.match(source, /generateShowArtwork\(selectedShow, true, \[kind\]\)/u);
    assert.match(source, /regenerateStudioVariant\("day"\)/u);
    assert.match(source, /regenerateStudioVariant\("night"\)/u);
    assert.match(source, /generateShowArtwork\(selectedShow, true, \["logo"\]\)/u);
    assert.match(source, /dayAtmosphereImageUrl/u);
    assert.match(source, /nightAtmosphereImageUrl/u);
    assert.match(source, /workingShow\.dayAtmosphere\.prompt/u);
    assert.match(source, /workingShow\.nightAtmosphere\.prompt/u);
    assert.ok(
      source.indexOf('kind: "nighttime studio"') < source.indexOf('kind: "daytime studio"'),
      "Signal must render the canonical night studio before deriving its day edit",
    );
    assert.match(source, /sourceImageId,/u);
    assert.match(source, /sourceEditKind: "daylight-relight"/u);
    assert.match(source, /quality: preferredImageProvider === "openai" \? "high" : "standard"/u);
    assert.match(
      artworkSource,
      /const sourceImageId = asset\.source === "night"\s*\? canonicalNightImageId/u,
    );
    assert.match(
      artworkSource,
      /canonicalNightImageId = generated\.image\.id;[\s\S]*pendingNightAttachment/u,
    );
    assert.ok(
      artworkSource.indexOf("canonicalNightImageId = generated.image.id") <
        artworkSource.indexOf('method: "PATCH"', artworkSource.indexOf("canonicalNightImageId = generated.image.id")),
      "Signal must retain the new canonical night id before attaching it to the show",
    );
    assert.match(
      artworkSource,
      /nightAtmosphereImageId: recoveringNightAttachment\.imageId/u,
    );
    assert.match(
      artworkSource,
      /pendingDayAttachment = \{[\s\S]*imageId: generated\.image\.id/u,
    );
    assert.match(
      artworkSource,
      /pendingNight \? \{[\s\S]*pendingDay \? \{[\s\S]*dayAtmosphereImageId: pendingDay\.imageId/u,
    );
    assert.doesNotMatch(source, />\s*Refresh studio(?: \+ logo)?\s*</u);
    assert.match(source, /function SignalShowLogo/u);
    assert.match(source, /show\.logo\.fallbackGlyph/u);
    assert.match(source, /data-theme=\{theme\}/u);
    assert.match(css, /--prism-p:\s*#ff4d6d/iu);
    assert.match(css, /--prism-s:\s*#2fd3e3/iu);
    assert.match(css, /\.shell\[data-theme="light"\]/u);
    assert.match(source, /function SignalFallbackStudio/u);
  });

  it("blocks only for identity handoff, then exposes honest persistent background progress", () => {
    assert.match(source, /import \{ PrismBlockingLoader \}/u);
    assert.match(source, /setBlockingOperation\(\{/u);
    assert.match(source, /Handing the artwork to the background renderer/u);
    assert.match(source, /progress: null/u);
    assert.match(source, /<PrismBlockingLoader/u);
    assert.match(source, /open=\{blockingOperation !== null\}/u);
    assert.match(blockingLoaderSource, /data-prism-blocking-loader="true"/u);
    assert.match(source, /new AbortController\(\)/u);
    assert.match(source, /signal: controller\.signal/u);
    assert.match(source, /controller\.abort\(\)/u);
    assert.match(source, /setBlockingOperation\(null\);\s*setBusy\(false\)/u);
    assert.match(source, /onCancel=\{blockingOperation\?\.cancellable \? cancelBlockingOperation : undefined\}/u);
    assert.match(source, /cancelLabel="Cancel synthesis"/u);
    assert.match(pageSource, /<SignalArtworkJobActivity/u);
    assert.match(artworkActivitySource, /\/api\/botcast\/artwork-jobs\/active/u);
    assert.match(artworkActivitySource, /setInterval/u);
    assert.match(artworkActivitySource, /completedCount/u);
    assert.match(artworkActivitySource, /Elapsed \{elapsed\}/u);
    assert.match(artworkActivitySource, /Waiting for Dark studio/u);
    assert.match(artworkActivitySource, /Relighting the completed Dark studio/u);
    assert.match(artworkActivitySource, /\/cancel/u);
    assert.match(artworkActivityCss, /signal-artwork-scan/u);
  });

  it("refreshes a clever show name without refreshing its visual identity", () => {
    assert.match(source, />\s*Refresh name\s*</u);
    assert.match(source, /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/name/u);
    assert.match(source, /setShowNameDraft\(response\.show\.name\)/u);
    assert.match(source, /title: "Finding another name"/u);
    assert.match(source, /progress: null/u);
    assert.doesNotMatch(
      source,
      /regenerateShowName[\s\S]{0,900}generateShowArtwork/u,
    );
  });

  it("replaces each Signal show asset through a simple image upload", () => {
    assert.match(source, />\s*Replace Light\s*</u);
    assert.match(source, />\s*Replace Dark\s*</u);
    assert.match(source, />\s*Replace logo\s*</u);
    assert.match(source, /accept=\{SIGNAL_ASSET_ACCEPT\}/u);
    assert.match(source, /"day-studio"/u);
    assert.match(source, /"night-studio"/u);
    assert.match(
      source,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/assets\/\$\{slot\}\/upload/u,
    );
    assert.match(source, /title: `Replacing \$\{label\}`/u);
    assert.match(source, /Its previous artwork remains in Images/u);
    assert.match(css, /\.assetUploadButton/u);
  });

  it("shows the selected logo and studio artwork on the dashboard", () => {
    assert.match(
      source,
      /className=\{styles\.showBrandPreview\}[\s\S]*?<SignalShowLogo show=\{selectedShow\}/u,
    );
    assert.match(source, /function activeShowAtmosphere/u);
    assert.match(source, /theme === "light" \? show\.dayAtmosphere : show\.nightAtmosphere/u);
    assert.match(
      source,
      /const dashboardAtmosphere = selectedShow[\s\S]{0,100}activeShowAtmosphere\(selectedShow, theme\)/u,
    );
    assert.match(source, /const stageAtmosphere = activeShowAtmosphere\(args\.show, theme\)/u);
    assert.match(css, /\.showBrandPreview\s*\{/u);
    assert.match(css, /\.showBrandAtmosphere\s*\{/u);
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.showBrandAtmosphere\s*\{[^}]*mix-blend-mode:\s*normal/iu,
    );
    assert.doesNotMatch(css, /\.shell\[data-theme="light"\] \.showBrandPreview::after\s*\{[^}]*mix-blend-mode:\s*screen/iu);
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.showBrandContent h2\s*\{[^}]*color:\s*var\(--botcast-ink\)/iu,
    );
  });

  it("uses matched PRISM fallback studios only when a show has no studio image", () => {
    assert.match(source, /normalizeAccentForTheme/u);
    assert.match(source, /function SignalFallbackStudio/u);
    assert.match(
      source,
      /data-surface=\{surface\}[\s\S]{0,100}aria-hidden="true"/u,
    );
    assert.match(
      source,
      /data-studio-source=\{stageAtmosphere\.imageUrl \? "image" : "fallback"\}/u,
    );
    assert.match(source, /!stageAtmosphere\.imageUrl \? \([\s\S]{0,260}<SignalFallbackStudio[\s\S]{0,120}surface="stage"/u);
    assert.match(
      source,
      /data-studio-source=\{dashboardAtmosphere\.imageUrl \? "image" : "fallback"\}/u,
    );
    assert.match(
      source,
      /dashboardAtmosphere\.imageUrl \? \([\s\S]{0,180}<div className=\{styles\.showBrandAtmosphere\}[\s\S]{0,120}: \([\s\S]{0,180}<SignalFallbackStudio[\s\S]{0,100}surface="dashboard"/u,
    );
    assert.doesNotMatch(
      source,
      /data-atmosphere=\{(?:stage|dashboard)Atmosphere\.status\}/u,
    );
    assert.match(css, /url\("\/signal-studio\/studio_dark\.webp"\)/u);
    assert.match(css, /url\("\/signal-studio\/studio_light\.webp"\)/u);
    assert.match(
      css,
      /signalFallbackStudio\[data-surface="dashboard"\][^}]*--signal-studio-art-position:\s*center 68%/iu,
    );
    assert.match(
      css,
      /\.signalFallbackStudio::after\s*\{[^}]*border-radius:\s*50%[^}]*radial-gradient/iu,
    );
    assert.match(
      css,
      /var\(--botcast-studio-accent\) 12%/u,
    );
    assert.match(source, /data-accent-variant=\{accentVariant\}/u);
    assert.match(source, /accentVariant=\{args\.show\.fallbackStudioAccentVariant\}/u);
    assert.match(source, /accentVariant=\{selectedShow\.fallbackStudioAccentVariant\}/u);
    for (const asset of ["shelf-rhythm", "quiet-frame", "broadcast-circuit"]) {
      assert.match(css, new RegExp(`/signal-studio/accent-masks/${asset}\\.png`, "u"));
    }
    assert.match(css, /-webkit-mask-image:\s*var\(--signal-studio-accent-mask\)/u);
    assert.match(css, /mask-image:\s*var\(--signal-studio-accent-mask\)/u);
    assert.match(css, /-webkit-mask-position:\s*var\(--signal-studio-art-position\)/u);
    assert.match(css, /mask-position:\s*var\(--signal-studio-art-position\)/u);
    assert.match(
      css,
      /\.showBrandAtmosphere\s*\{[^}]*opacity:\s*1/iu,
    );
    assert.match(
      css,
      /data-studio-source="image"[^}]*background-image:\s*var\(--botcast-atmosphere\)/iu,
    );
    assert.doesNotMatch(source, /styles\.(?:chair|boomMic|studioDesk)/u);
    assert.doesNotMatch(css, /\.(?:chair|boomMic|studioDesk)\s*\{/u);
  });

  it("keeps all three fallback accent masks aligned, soft, and bounded", () => {
    const encodedMasks = ["shelf-rhythm", "quiet-frame", "broadcast-circuit"].map(
      (asset) =>
        readFileSync(
          new URL(`../../public/signal-studio/accent-masks/${asset}.png`, import.meta.url),
        ),
    );
    for (const encoded of encodedMasks) {
      const mask = PNG.sync.read(encoded);
      assert.equal(mask.width, 1672);
      assert.equal(mask.height, 941);
      let covered = 0;
      let feathered = 0;
      for (let offset = 0; offset < mask.data.length; offset += 4) {
        const alpha = mask.data[offset + 3] ?? 0;
        if (alpha > 0) {
          covered += 1;
          assert.equal(mask.data[offset], 255);
          assert.equal(mask.data[offset + 1], 255);
          assert.equal(mask.data[offset + 2], 255);
        }
        if (alpha > 0 && alpha < 255) feathered += 1;
      }
      assert.ok(covered > 500);
      assert.ok(covered < mask.width * mask.height * 0.08);
      assert.ok(feathered > 100);
      assert.equal(mask.data[3], 0);
      assert.equal(mask.data[(mask.width - 1) * 4 + 3], 0);
    }
    assert.notDeepEqual(encodedMasks[0], encodedMasks[1]);
    assert.notDeepEqual(encodedMasks[1], encodedMasks[2]);
  });

  it("turns SQLite contention into a useful Signal message", () => {
    assert.match(source, /database is locked\|SQLITE_BUSY/u);
    assert.match(
      source,
      /Signal is finishing another save\. Try again in a moment\./u,
    );
  });

  it("locks one account or episode model before recording", () => {
    assert.match(source, /aria-label="Signal episode model"/u);
    assert.match(source, /Account default ·/u);
    assert.match(source, /locked for this recording/u);
    assert.match(
      source,
      /guestBotId: guestDraftId,[\s\S]{0,260}preferredProvider: episodeProvider,[\s\S]{0,120}responseMode,[\s\S]{0,120}modelOverride: selectedModelOption\?\.id \?\? accountDefaultModel/u,
    );
    assert.match(source, /provider: "local" \| "openai" \| "anthropic"/u);
    assert.match(source, /providerLabel\(episodeModelProvider\)/u);
    assert.match(source, /episodeModeLabel\(episode\)/u);
    assert.match(source, /episodeModeLabel\(replayEpisode\)/u);
    assert.match(source, /function episodeModeLabel/u);
    assert.match(source, /episode\.responseMode === "auto"/u);
    assert.doesNotMatch(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(episode\.id\)\}\/advance`[\s\S]{0,220}preferredProvider/u,
    );
    assert.match(pageSource, /const signalResponseMode = responseModeForProvider\(signalProvider\)/u);
    assert.match(pageSource, /modelOptionsForResponseMode\(modelCatalog, settings, signalResponseMode\)/u);
    assert.match(pageSource, /provider: model\.provider/u);
    assert.match(pageSource, /modelOptions=\{signalModelOptions\}/u);
    assert.match(pageSource, /responseMode=\{signalEpisodeResponseMode\}/u);
    assert.match(pageSource, /accountDefaultModel=/u);
    assert.match(pageSource, /providerModeToggle=\{renderProviderModeToggle\("", true\)\}/u);
    assert.match(source, /Episode mode/u);
    assert.match(source, /Choose the response lane for this recording\./u);
    assert.match(source, /primary may recover through your fallback chain/u);
    assert.match(source, /disabled=\{responseMode === "auto"\}/u);
    assert.match(css, /\.episodeModelControl\s*\{/u);
    assert.match(css, /\.episodeProviderControl\s*\{/u);
  });

  it("inherits the active theme in shared panels and uses image settings for artwork", () => {
    assert.match(
      pageSource,
      /if \(view === "botcast"\) \{[\s\S]*?return \(\s*<div className=\{themeClass\}>/u,
    );
    assert.match(
      pageSource,
      /preferredImageProvider=\{settings\?\.preferredImageProvider \?\? "local"\}/u,
    );
    assert.match(source, /preferredProvider: preferredImageProvider/u);
    assert.match(source, /origin: "botcast"/u);
    assert.match(source, /botId: workingShow\.hostBotId/u);
    assert.match(source, /failureMessage \?\?= errorMessage\(artworkError\)/u);
    assert.match(source, /if \(artwork\.failureMessage\) setError\(artwork\.failureMessage\)/u);
  });

  it("offers confirmed show deletion and episode delete or discard without nesting actions", () => {
    assert.match(
      source,
      /`\/api\/botcast\/shows\/\$\{encodeURIComponent\(target\.id\)\}`,[\s\S]{0,100}method: "DELETE"/u,
    );
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(target\.id\)\}`,[\s\S]{0,100}method: "DELETE"/u,
    );
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /Discard episode/u);
    assert.match(source, /Delete show/u);
    assert.match(source, /Saved studio and logo artwork stays in Images/u);
    assert.match(source, /deleteCancelButtonRef\.current\?\.focus\(\)/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(
      source,
      /<article key=\{item\.id\} className=\{styles\.episodeCard\}>[\s\S]*?<\/article>/u,
    );
    assert.match(css, /\.deleteDialog\s*\{/u);
    assert.match(css, /\.deleteConfirmButton/u);
    assert.match(css, /\.episodeOpenButton/u);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.episodeDeleteButton/u);
  });
});
