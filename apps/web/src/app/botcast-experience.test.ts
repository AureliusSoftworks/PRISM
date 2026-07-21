import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const blockingLoaderSource = readFileSync(
  new URL("./PrismBlockingLoader.tsx", import.meta.url),
  "utf8",
);
const artworkActivitySource = readFileSync(
  new URL("./SignalArtworkJobActivity.tsx", import.meta.url),
  "utf8",
);
const artworkJobSource = readFileSync(
  new URL("./signalArtworkJob.ts", import.meta.url),
  "utf8",
);
const artworkActivityCss = readFileSync(
  new URL("./signalArtworkJobActivity.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal experience shell", () => {
  it("uses Signal throughout player-facing applet chrome", () => {
    assert.match(source, /<h1>Signal<\/h1>/u);
    assert.match(source, /aria-label="Signal shows"/u);
    assert.match(source, /aria-label="Signal live cameras"/u);
    assert.match(source, /aria-label="Signal replay playback"/u);
    assert.match(
      pageSource,
      /sidebarHeader=\{renderSharedAppletSidebarHeader\("botcast"\)\}/u,
    );
    assert.doesNotMatch(source, />BOTCAST</u);
  });

  it("records four live camera modes and keeps the saved replay cut fixed", () => {
    assert.match(source, /\["left", "right", "wide", "auto"\] as const/u);
    assert.match(source, /botcastCameraModeAt\(\{/u);
    assert.match(
      source,
      /liveCameraMode === "auto"[\s\S]{0,120}botcastCameraShotAt/u,
    );
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(episode\.id\)\}\/camera`/u,
    );
    assert.match(
      source,
      /JSON\.stringify\(\{ mode, atMs: liveCameraElapsedMs \}\)/u,
    );
    assert.match(source, /aria-pressed=\{liveCameraMode === camera\}/u);
    assert.match(source, /data-tutorial-target="botcast-live-camera"/u);
    const liveStageIndex = source.indexOf("shot: liveShot");
    const liveCameraIndex = source.indexOf(
      "className={styles.liveCameraControls}",
      liveStageIndex,
    );
    const atmosphereMixerIndex = source.indexOf(
      "{renderAtmosphereMixer(show)}",
      liveStageIndex,
    );
    assert.ok(liveStageIndex >= 0);
    assert.ok(liveCameraIndex > liveStageIndex);
    assert.equal(
      atmosphereMixerIndex,
      -1,
      "the show mixer belongs only in the placement workspace",
    );
    assert.doesNotMatch(source, /replayCamera|setReplayCamera|manualShot/u);
    assert.doesNotMatch(source, /className=\{styles\.cameraButtons\}/u);
    assert.match(source, /replayTimeline\.messageStartMs\[index\]/u);
    assert.doesNotMatch(source, /index \* 4_500/u);
    assert.match(css, /\.liveCameraControls\s*\{[^}]*top:\s*-42px/iu);
    assert.match(css, /\.liveCameraControls button\[data-selected="true"\]/u);
  });

  it("cuts on live speech, lingers after it, then uses Wide while a bot thinks", () => {
    assert.match(source, /const liveBotThinking = Boolean/u);
    assert.match(
      source,
      /liveSpeech\?\.reveal\.phase === "preparing"[\s\S]{0,120}livePreparedMessageIsBot/u,
    );
    assert.match(
      source,
      /producerGuestThinkingEndedAtRef\.current !== null[\s\S]{0,120}liveNextSpeakerIsBot/u,
    );
    assert.match(source, /signalLiveAutoCameraShot\(\{/u);
    assert.match(
      source,
      /const liveSpeakingShot =[\s\S]{0,120}liveCameraMode === "auto"/u,
    );
    assert.match(source, /speakingShot: liveSpeakingShot/u);
    assert.match(
      source,
      /postSpeechHoldShot:[\s\S]{0,100}liveCameraMode === "auto"[\s\S]{0,100}liveCameraPostSpeechHoldShot/u,
    );
    assert.match(source, /SIGNAL_LIVE_CAMERA_POST_SPEECH_HOLD_MS = 900/u);
    assert.match(source, /holdLiveCameraAfterSpeech\(message\.speakerRole\)/u);
    assert.match(source, /botThinking: liveBotThinking/u);
    assert.match(
      source,
      /producerGuestThinking:[\s\S]{0,120}liveProducerGuestThinking[\s\S]{0,120}liveCameraMode === "auto"/u,
    );
  });

  it("plays saved listener reactions without taking the primary mic or fixed camera", () => {
    assert.match(source, /botcastListenerReactionForMessage/u);
    assert.match(source, /resolveListenerReactionAtMs/u);
    assert.match(source, /onListenerReaction\?\./u);
    assert.match(source, /listenerReactionHasCrosstalkAudio\(plan\)/u);
    assert.equal(
      [
        ...source.matchAll(
          /if \(botPowerResponseIsSilentV1\(message\.content\)\) return;/gu,
        ),
      ].length,
      2,
    );
    assert.match(
      source,
      /const listenerReactionSpokenCue = botPowerResponseIsSilentV1\(/u,
    );
    assert.match(source, /signalInterruptedSpeakerRetortDelayMs\(/u);
    assert.match(
      source,
      /Math\.max\(0, durationMs - elapsedMs\) \+[\s\S]{0,80}INTERRUPTED_SPEAKER_RETORT_PAUSE_MS/u,
    );
    assert.match(source, /botCrosstalkPrimarySpeakerContent\(/u);
    assert.match(pageSource, /startDelayMs: retortDelayMs/u);
    assert.match(pageSource, /startDelayMs: INTERRUPTED_SPEAKER_RETORT_PAUSE_MS/u);
    assert.match(pageSource, /signal: controller\.signal/u);
    assert.match(
      source,
      /cameraCutEligible[\s\S]{0,120}liveCameraMode === "auto"/u,
    );
    assert.match(
      source,
      /listenerReactionAtMs \+[\s\S]{0,120}interjectionAttempt \? 1_600 : 1_200/u,
    );
    assert.match(source, /data-listener-reaction=/u);
    assert.match(css, /\.listenerReactionText/u);
    assert.match(css, /prefers-reduced-motion[\s\S]*?data-listener-reaction/u);
    assert.match(
      pageSource,
      /onPrefetchListenerReaction=\{prefetchBotcastListenerReaction\}/u,
    );
    assert.match(
      pageSource,
      /onListenerReaction=\{playBotcastListenerReaction\}/u,
    );
  });

  it("keeps Signal quiet while the next bot prepares its turn", () => {
    assert.doesNotMatch(source, /DeadAirAside|deadAirAside/u);
    assert.doesNotMatch(css, /deadAirAside/u);
    assert.doesNotMatch(pageSource, /onDeadAirAside=/u);
  });

  it("attaches Signal cups to the shared sip and return foley lifecycle", () => {
    assert.match(source, /coffeeCupRootRef=\{signalStageRef\}/u);
    assert.match(pageSource, /data-cup-sipping=/u);
  });

  it("lets a Producer guest sip coffee without submitting a transcript turn", () => {
    assert.match(source, /const \[producerGuestSipActive, setProducerGuestSipActive\]/u);
    assert.match(
      source,
      /episode\?\.guestKind === "producer"[\s\S]{0,180}episode\.status === "live"[\s\S]{0,180}botHasCoffeeCup\(liveGuestBot\)/u,
    );
    assert.match(
      source,
      /const sipCoffeeAsProducerGuest = \(\): void => \{[\s\S]{0,700}setProducerGuestSipActive\(true\)[\s\S]{0,700}setProducerGuestSipActive\(false\)/u,
    );
    assert.match(
      source,
      /role === "guest" && manualProducerGuestSip[\s\S]{0,120}sippingOverride: true/u,
    );
    assert.match(
      source,
      /const producerGuestRole =[\s\S]{0,120}role === "guest" && args\.currentEpisode\.guestKind === "producer"/u,
    );
    assert.match(
      source,
      /ambientSipAllowed:\s*!producerGuestRole &&[\s\S]{0,120}roleIsSpeaking/u,
    );
    assert.match(source, /aria-label="Sip coffee on air"/u);
    assert.match(source, /producerGuestIsSpeaking \|\|[\s\S]{0,120}signalGuestCupTravelMode !== "idle"/u);
    assert.match(css, /\.producerGuestSipButton/u);
  });

  it("plays bundled bodily action foley when a Producer guest goes on air", () => {
    assert.match(
      source,
      /onProducerGuestActionSfx\?\.\(message\)[\s\S]{0,120}onPlaybackStart\?\.\(\)/u,
    );
    assert.match(
      source,
      /replayEpisode\?\.guestKind === "producer"[\s\S]{0,220}onProducerGuestActionSfx\?\.\(replayActiveMessage\)/u,
    );
    assert.match(
      pageSource,
      /buildBundledActionSfxPlan\(message\.content\)[\s\S]{0,500}bundledActionSfxIsEligible\([\s\S]{0,800}playPreparedCoffeeActionSfx\(/u,
    );
    assert.match(
      pageSource,
      /onProducerGuestActionSfx=\{playSignalProducerGuestActionSfx\}/u,
    );
  });

  it("renders the authored two-seat stage and empty-chair aftermath", () => {
    assert.match(source, /data-role="host"/u);
    assert.match(source, /data-role="guest"/u);
    assert.match(source, /data-signal-presence="host"/u);
    assert.match(source, /data-signal-presence="guest"/u);
    assert.match(source, /Guest has left the studio/u);
    assert.match(source, /Host has left the studio/u);
    assert.match(
      source,
      /const guestDepartureMonologueOnMic =[\s\S]*?args\.activeMessage\?\.speakerRole === "guest"[\s\S]*?speakingMessageId === args\.activeMessage\.id/u,
    );
    assert.match(
      source,
      /const hostDepartureMonologueOnMic =[\s\S]*?args\.activeMessage\?\.speakerRole === "host"[\s\S]*?speakingMessageId === args\.activeMessage\.id/u,
    );
    assert.match(
      source,
      /const guestDeparted =[\s\S]*?recordedGuestDeparture && !guestDepartureMonologueOnMic/u,
    );
    assert.match(
      source,
      /const hostDeparted =[\s\S]*?recordedHostDeparture && !hostDepartureMonologueOnMic/u,
    );
    assert.match(
      source,
      /case "host_departed":[\s\S]*?return "Host ended the show"/u,
    );
    assert.match(
      css,
      /\.avatarRig\[data-departed="true"\][^}]*signalGuestWalkout 900ms/iu,
    );
    assert.match(css, /@keyframes signalGuestWalkout/iu);
    assert.match(
      css,
      /\.emptyChairLabel[^}]*signalEmptyChairReveal 260ms ease-out 640ms/iu,
    );
    assert.match(source, /Host coffee mug/u);
    assert.match(source, /Guest coffee mug/u);
    assert.match(css, /\.hostSeat\s*\{\s*--signal-seat-x:\s*22\.5%/u);
    assert.match(css, /\.guestSeat\s*\{\s*--signal-seat-x:\s*77\.5%/u);
    assert.match(css, /\.stagePlacement\s*\{[^}]*position:\s*absolute/u);
    assert.match(
      css,
      /\.stagePlacement\s*\{[^}]*transform:\s*translate\(-50%, -50%\)/u,
    );
    assert.doesNotMatch(source, /styles\.nameplate/u);
    assert.doesNotMatch(css, /\.nameplate\s*\{/u);
    assert.match(css, /\.stageMug\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.stageMug\[data-returning="true"\][^}]*320ms/u);
    assert.match(
      css,
      /@keyframes signalStageMugInterruptedReturn\s*\{[\s\S]*?var\(--signal-cup-return-x[\s\S]*?var\(--signal-cup-rest-x\)/u,
    );
    assert.doesNotMatch(
      source,
      /styles\.(?:chair|boomMic|studioDesk|mugLogo)/u,
    );
    assert.doesNotMatch(css, /\.(?:chair|boomMic|studioDesk)\s*\{/u);
    assert.match(source, /const thinkingRole = botcastNextSpeakerRole/u);
    assert.match(source, /const roleIsThinking = \(role: "host" \| "guest"\)/u);
    assert.match(source, /speechReveal\?\.phase === "preparing"/u);
    assert.doesNotMatch(source, /Warming the mic…/u);
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.zenLiveBotPresencePlate\} \$\{styles\.signalBotPresencePlate\}`\}/u,
    );
    assert.match(pageSource, /data-zen-live-bot-presence-plate="true"/u);
    assert.match(
      source,
      /const renderedAvatar = renderAvatar\?\.\(bot,[\s\S]{0,720}if \(bot\.producerGuest\)/u,
    );
    assert.match(
      pageSource,
      /if \(botSummary\.producerGuest\)[\s\S]{0,2400}data-prism-persona="true"[\s\S]{0,2400}glyph=\{zenDefaultPrismGlyph\}[\s\S]{0,1400}frameMaterialSeed=\{PRISM_FACTORY_CLEAN_FRAME_SEED\}/u,
    );
    assert.match(pageSource, /renderMug=\{\(botSummary, mugState\) =>/u);
    assert.match(pageSource, /buildCoffeeCupVisualState\(\{/u);
    assert.match(
      pageSource,
      /styles\.coffeeCup\} \$\{styles\.signalCoffeeCup/u,
    );
    assert.match(source, /sessionStartedAtMs: episodeStartedAtMs/u);
    assert.match(
      source,
      /durationMinutes:\s*args\.currentEpisode\.durationMinutes \?\?\s*DEFAULT_COFFEE_SESSION_DURATION_MINUTES/u,
    );
    assert.match(
      source,
      /const roleIsSpeaking = \(role: "host" \| "guest"\): boolean =>[\s\S]{0,100}speechIsPlaying/u,
    );
    assert.match(source, /speaking: roleIsSpeaking\(role\)/u);
    assert.match(
      source,
      /ambientSipAllowed:\s*!producerGuestRole &&\s*roleIsSpeaking\(role === "host" \? "guest" : "host"\)/u,
    );
    assert.match(
      pageSource,
      /ambientSipAllowed:\s*coffeeAmbientSipSpeakerBotId === null \|\|\s*coffeeAmbientSipSpeakerBotId !== bot\.id/u,
    );
    assert.match(
      source,
      /const botHasCoffeeCup = \(bot: BotcastBotSummary\): boolean =>/u,
    );
    assert.match(source, /if \(powerRateMultiplier <= 0\) return null/u);
    assert.match(source, /powerRateMultiplier,/u);
    assert.match(
      source,
      /hostHasCoffeeCup[\s\S]{0,120}layoutHandle\("hostCup"/u,
    );
    assert.match(
      source,
      /guest && guestHasCoffeeCup[\s\S]{0,120}layoutHandle\("guestCup"/u,
    );
    assert.match(
      pageSource,
      /<BotPowerBadge powers=\{bot\.powers\} passive \/>/u,
    );
    assert.match(source, /data-sip-requested=\{hostSipping/u);
    assert.match(source, /data-sip-requested=\{guestSipping/u);
    assert.match(source, /hostSipping && hostCupTravel\.sipFaceActive/u);
    assert.match(source, /guestSipping && guestCupTravel\.sipFaceActive/u);
    assert.match(
      source,
      /data-sip-face-release-ms=\{signalCupSipFaceReleaseMs/u,
    );
    assert.match(source, /hostCupTravel\.mode === "returning"/u);
    assert.match(source, /guestCupTravel\.mode === "returning"/u);
    assert.match(source, /signalCupTravelByRole\.host\.mode !== "returning"/u);
    assert.match(source, /\}, 500\);/u);
    assert.match(
      source,
      /seed: `signal:\$\{args\.currentEpisode\.id\}:\$\{bot\.id\}:\$\{role\}`/u,
    );
    assert.match(source, /signalStageLocalPointFromViewport\(\{/u);
    assert.match(source, /finishSignalCupReturn\("host", event\)/u);
    assert.match(source, /--signal-cup-rest-x/u);
    assert.match(
      source,
      /data-coffee-plate-emoji-part="mouth"\]\[data-coffee-plate-emoji-glyph="⁎"/u,
    );
    assert.match(source, /signalCupSipTargetFromMouth\(\{/u);
    assert.match(source, /mouthBounds: mouth\.getBoundingClientRect\(\)/u);
    assert.match(source, /setProperty\("--signal-cup-mouth-x"/u);
    assert.match(source, /signalCupShadowProfileForTravel\(\{/u);
    assert.match(source, /data-signal-mug-shadow-role="host"/u);
    assert.match(source, /data-signal-mug-shadow-role="guest"/u);
    assert.match(
      css,
      /\.stageMugShadow\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*8/iu,
    );
    assert.match(
      css,
      /@keyframes signalStageMugShadowSip\s*\{[\s\S]*?--signal-cup-shadow-active-scale-x[\s\S]*?scale\(\.76, \.38\)/u,
    );
    assert.doesNotMatch(
      source,
      /--signal-cup-mouth-[xy][^\n]*studioLayout\.(?:host|guest)Bot/u,
    );
    assert.match(
      css,
      /@keyframes signalStageMugSip\s*\{[\s\S]*?var\(--signal-cup-rest-x\)[\s\S]*?var\(--signal-cup-mouth-x[\s\S]*?var\(--signal-cup-rest-x\)/u,
    );
    assert.match(pageSource, /const cupVisual = mugState\.visual/u);
    assert.match(
      pageSource,
      /data-cup-sipping=\{[\s\S]{0,80}cupVisual\.sipping/u,
    );
    assert.match(pageSource, /resolveCoffeeSeatSipFacePresentation\(\{/u);
    assert.match(pageSource, /cupSipping: avatarState\.sipping/u);
    assert.match(
      pageSource,
      /plateFace=\{sipPresentation\.glyph \?\? undefined\}/u,
    );
    assert.match(
      source,
      /signalVoicePerformanceActionPresentationAtProgress/u,
    );
    assert.match(source, /data-signal-voice-action="true"/u);
    assert.match(source, /data-phase=\{activeVoiceAction\.phase\}/u);
    assert.match(source, /activeVoiceAction\.opacity/u);
    assert.match(source, /\*\{activeVoiceAction\.action\}\*/u);
    assert.match(source, /signalVoicePerformanceTranscriptText\(message\)/u);
    assert.match(css, /\.avatarRig > \.voiceActionText/u);
    assert.match(pageSource, /const cupSide =[\s\S]{0,180}mugState\.facing/u);
    assert.match(pageSource, /data-cup-side=\{cupSide\}/u);
    assert.match(
      pageSource,
      /data-cup-mirrored=\{\s*cupSide === "right" \? "true" : undefined\s*\}/u,
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

  it("adds an off-canvas spotlight and drives the shared Zen bot refraction", () => {
    assert.match(source, /function SignalStudioSpotlight\(\)/u);
    assert.match(source, /className=\{styles\.studioSpotlight\}/u);
    assert.match(source, /data-prism-decorative-motion="true"/u);
    assert.equal(source.match(/<SignalStudioSpotlight \/>/gu)?.length, 2);
    assert.doesNotMatch(source, /studioLight(?:Cable|Fixture|Bulb)/u);
    assert.match(
      css,
      /\.studioSpotlight\s*\{[^}]*top:\s*-56%[^}]*signalStudioSpotlightSweep 7\.2s/iu,
    );
    assert.match(
      css,
      /\.studioSpotlightBeam\s*\{[^}]*mix-blend-mode:\s*screen/iu,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.studioSpotlightBeam\s*\{[^}]*mix-blend-mode:\s*soft-light/iu,
    );
    assert.match(
      css,
      /prefers-reduced-motion[\s\S]*?\.studioSpotlight\s*\{[^}]*animation:\s*none/iu,
    );
    assert.match(pageSource, /data-signal-role=\{avatarState\.role\}/u);
    assert.match(
      pageSource,
      /data-signal-bot-presence="true"[\s\S]*?<BotAmbientPresenceRig[\s\S]*?isTalking=\{avatarState\.talking\}/u,
    );
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\s*\{[^}]*--bot-face-metal-light-rotation:\s*var\(--signal-bot-metal-light-rotation\)/iu,
    );
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\s*\{[^}]*--bot-face-screen-glare-x:\s*var\(--signal-bot-screen-glare-x\)/iu,
    );
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\s*\{[^}]*signalBotZenSpotlightRefraction 7\.2s/iu,
    );
    assert.match(pageCss, /@keyframes signalBotZenSpotlightRefraction/iu);
    assert.doesNotMatch(pageCss, /signalBotStudio(?:Metal|Paint|Glare)/iu);
    assert.doesNotMatch(
      pageCss,
      /\.signalBotPresencePlate \.botFaceFrameMetalLightRaster::before\s*\{/iu,
    );
    assert.match(
      pageCss,
      /prefers-reduced-motion[\s\S]*?\.signalBotPresencePlate\s*\{[^}]*animation:\s*none/iu,
    );
  });

  it("lets producers align show-scoped bots and cups against the studio", () => {
    assert.match(source, />\s*Align stage\s*</u);
    assert.match(source, /data-tutorial-target="botcast-stage-layout"/u);
    assert.match(source, /data-signal-layout-stage="true"/u);
    assert.match(source, /SIGNAL_STUDIO_LAYOUT_LABELS/u);
    assert.match(source, /hostBot:\s*"host bot"/u);
    assert.match(source, /guestCup:\s*"guest cup"/u);
    assert.match(source, /setPointerCapture\(event\.pointerId\)/u);
    assert.match(source, /onPointerMove=\{moveStudioLayoutDrag\}/u);
    assert.match(source, /ArrowLeft:[\s\S]{0,120}ArrowDown:/u);
    assert.match(source, /JSON\.stringify\(\{ studioLayout: layout \}\)/u);
    assert.match(source, /swapBotcastStudioLayoutSeats\(show\.studioLayout\)/u);
    assert.match(source, /signalStudioFacingForRole\(studioLayout, role\)/u);
    assert.match(source, /signalStudioFacingForRole\(layout, role\)/u);
    assert.match(source, />\s*Swap seats\s*</u);
    assert.match(
      source,
      /normalizeBotcastStudioLayout\(args\.show\.studioLayout\)/u,
    );
    assert.match(source, /studioLayout\.hostBot\.x/u);
    assert.match(source, /studioLayout\.guestCup\.y/u);
    assert.match(source, /signalSessionAtmosphereActive\(\{/u);
    assert.match(
      source,
      /episodePresent: Boolean\(episode\),[\s\S]{0,100}replayPlaying,[\s\S]{0,100}studioLayoutEditorOpen/u,
    );
    assert.match(source, /data-signal-stage-layout-modal="true"/u);
    assert.match(source, /randomSignalEpisodeGuestId\(\{/u);
    assert.match(source, /currentGuestId: studioLayoutPreviewGuestId/u);
    assert.match(source, /data-preview-theme=\{previewTheme\}/u);
    assert.match(source, /aria-label="Studio preview theme"/u);
    assert.match(source, /aria-pressed=\{previewTheme === "light"\}/u);
    assert.match(source, /aria-pressed=\{previewTheme === "dark"\}/u);
    assert.match(source, /signalStudioPlacementStyle\(studioLayout, "hostBot"\)/u);
    assert.match(source, /signalStudioPlacementStyle\(studioLayout, "guestCup"\)/u);
    assert.match(source, /signalStudioPlacementStyle\(layout, item\)/u);
    assert.match(
      source,
      /facing: signalStudioFacingForRole\([\s\S]{0,120}selectedShow\.studioLayout[\s\S]{0,120}"host"/u,
    );
    assert.match(css, /\.stageLayoutModal\s*\{[^}]*overflow:\s*hidden[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/u);
    assert.match(css, /\.stageLayoutEditor\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(290px, 350px\)/u);
    assert.match(css, /data-preview-theme="light"/u);
    assert.match(css, /data-preview-theme="dark"/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /Place the \{show\.name\} studio/u);
    assert.match(
      source,
      /studioLayoutEditorOpen && selectedShow && hostBot[\s\S]{0,180}renderStudioLayoutEditor/u,
    );
    assert.match(source, /▶ Test voices/u);
    assert.match(source, /■ Stop check/u);
    assert.match(source, /signalStageSoundcheckMessages\(\{/u);
    assert.match(source, /aria-label="Signal voice level mixer"/u);
    assert.match(source, /aria-label=\{`\$\{role\} \$\{bot\.name\} voice level`\}/u);
    assert.match(source, /voiceLevelControl\(host, "Host"\)/u);
    assert.match(source, /voiceLevelControl\(guest, "Guest"\)/u);
    assert.match(source, /voiceLevelsByBotId: draft\.levels/u);
    assert.match(source, /botcastVoiceLevelForBot\(show\.voiceLevelsByBotId/u);
    assert.match(source, /Saved for each bot on this show/u);
    assert.match(source, /setStudioSoundcheckSpeakerBotId\(bot\.id\)/u);
    assert.match(source, /onProgress: \(elapsedMs, durationMs\) =>/u);
    assert.match(source, /setStudioSoundcheckSpeech\(\(current\) =>/u);
    assert.match(source, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(source, /\{renderAtmosphereMixer\(show\)\}/u);
    assert.equal(
      source.match(/\{renderAtmosphereMixer\(show\)\}/gu)?.length,
      1,
      "the show mixer must render only inside stage placement",
    );
    assert.match(
      css,
      /\.stageLayoutModalBackdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/iu,
    );
    assert.match(
      pageSource,
      /signalStageSoundcheckMessageIsEphemeral\(message\)/u,
    );
    assert.match(
      pageSource,
      /!ephemeralSoundcheck[\s\S]{0,100}signalMessageId: message\.id/u,
    );
    assert.match(
      pageSource,
      /ephemeralSoundcheck[\s\S]{0,80}explicitVoicePreview: true/u,
    );
    assert.match(
      pageSource,
      /botcastMessageIsEphemeralInterruptionBridge\(message\)/u,
    );
    assert.match(
      pageSource,
      /signalEpisodeId: message\.episodeId,[\s\S]{0,100}signalInterruptionBridge: true/u,
    );
    assert.match(
      source,
      /\["--signal-seat-x" as string\]:\s*`\$\{studioLayout\.hostBot\.x\}%`/u,
    );
    assert.match(
      source,
      /\["--signal-seat-x" as string\]:\s*`\$\{studioLayout\.guestBot\.x\}%`/u,
    );
    assert.match(
      css,
      /\.seat\s*\{[^}]*left:\s*var\(--signal-seat-x\)[^}]*transform:\s*translateX\(-50%\)/u,
    );
    assert.match(css, /\.stageLayoutHandle\s*\{[^}]*cursor:\s*grab/u);
    assert.match(css, /\.stageVoiceMixer\s*\{[^}]*display:\s*grid/u);
    assert.match(css, /\.stageVoiceMixerSliders\s*\{[^}]*repeat\(2/u);
    assert.match(css, /\.stagePlacement\s*\{[^}]*width:\s*25%/u);
    assert.match(css, /\.stageMug\s*\{[^}]*width:\s*max\(6\.2%, 58px\)/u);
    assert.match(
      css,
      /\.stageLayoutHandle\[data-kind="bot"\][^}]*width:\s*25%/u,
    );
    assert.match(
      css,
      /\.stageLayoutHandle\[data-kind="cup"\][^}]*max\(6\.2%, 58px\)/u,
    );
    assert.match(
      pageCss,
      /\.signalBotPresencePlate\s*\{[^}]*--zen-live-bot-avatar-size:\s*clamp\(154px, 16vw, 240px\)/iu,
    );
  });

  it("lets the live studio take over the show-management space", () => {
    assert.match(
      source,
      /\{!episode \? \(\s*<header className=\{styles\.header\}>/u,
    );
    assert.match(css, /\.liveLayout\s*\{[^}]*padding:\s*12px 18px/u);
    assert.match(css, /\.liveTopline\s*\{[^}]*max-width:\s*1320px/u);
    assert.match(
      css,
      /\.liveLayout \.stageViewport\s*\{[^}]*max-width:\s*1320px/u,
    );
    assert.match(
      css,
      /\.liveLayout \.controlRoom\s*\{[^}]*max-width:\s*1320px/u,
    );
    assert.match(
      source,
      /const liveSessionActive = episode\?\.status === "live"/u,
    );
    assert.match(source, /data-live-episode=\{liveSessionActive/u);
    assert.match(
      css,
      /\.shell\[data-live-episode="true"\] \.main\s*\{[^}]*overflow-y:\s*hidden/iu,
    );
    assert.match(
      css,
      /\.shell\[data-live-episode="true"\] \.liveLayout \.stageViewport\s*\{[^}]*calc\(\(100dvh - 320px\) \* 1\.7778\)/iu,
    );
    assert.doesNotMatch(source, /className=\{styles\.transcript\}/u);
    assert.match(source, /className=\{styles\.replayTranscript\}/u);
  });

  it("floats Signal errors and updates in dismissible toast notifications", () => {
    assert.match(source, /aria-label="Signal notifications"/u);
    assert.match(source, /data-signal-toast-kind="error"[\s\S]{0,80}role="alert"/u);
    assert.match(source, /data-signal-toast-kind="notice"[\s\S]{0,80}role="status"/u);
    assert.match(source, /aria-label="Dismiss Signal error"/u);
    assert.match(source, /aria-label="Dismiss Signal update"/u);
    assert.match(source, /buildWebDiagnosticReport\(/u);
    assert.match(source, /writeDiagnosticClipboard\(report\)/u);
    assert.match(
      pageSource,
      /function apiErrorWithDiagnostic\([\s\S]{0,420}attachWebRequestDiagnostic\(error,\s*\{[\s\S]{0,180}method:[\s\S]{0,180}path,[\s\S]{0,180}status/iu,
    );
    assert.match(
      pageSource,
      /throw apiErrorWithDiagnostic\([\s\S]{0,180}path,[\s\S]{0,100}options,[\s\S]{0,100}res\.status/iu,
    );
    assert.match(source, /className=\{styles\.signalToastBody\}/u);
    assert.match(source, /Copy Signal diagnostic report to clipboard/u);
    assert.match(
      source,
      /className=\{styles\.signalToastBody\}[\s\S]{0,900}className=\{styles\.signalToastIcon\}[\s\S]{0,300}className=\{styles\.signalToastCopy\}/u,
    );
    assert.match(source, /event\.stopPropagation\(\);[\s\S]{0,80}setError\(null\)/u);
    assert.match(source, /Diagnostic report copied to clipboard\./u);
    const errorCopySource = source.slice(
      source.indexOf("const copySignalErrorToast = async"),
      source.indexOf("return (", source.indexOf("const copySignalErrorToast = async")),
    );
    assert.match(errorCopySource, /await writeDiagnosticClipboard\(report\)/u);
    assert.match(errorCopySource, /catch \{[\s\S]{0,180}copyState: "failed"/u);
    assert.match(source, /const SIGNAL_NOTICE_TOAST_MS = 7_000/u);
    assert.match(
      source,
      /setNotice\(\(current\) => \(current === notice \? null : current\)\)/u,
    );
    assert.doesNotMatch(source, /styles\.(?:error|notice)/u);
    assert.match(
      css,
      /\.signalToastRegion\s*\{[^}]*position:\s*fixed;[^}]*top:\s*82px;[^}]*right:\s*20px/iu,
    );
    assert.match(css, /\.signalToast\s*\{[^}]*pointer-events:\s*auto/iu);
    assert.match(
      css,
      /\.signalToastBody\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)[^}]*cursor:\s*copy/iu,
    );
    assert.match(css, /\.signalToastBody:focus-visible/u);
    assert.match(css, /\.signalToastDiagnosticHint/u);
    assert.match(css, /@keyframes signalToastIn/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.signalToast\s*\{[^}]*animation:\s*none !important/iu,
    );
  });

  it("opens episodes through a skippable show-branded pre-roll inside Signal's viewing pane", () => {
    assert.match(source, /playSignalIntroAudio\(\{/u);
    assert.match(source, /startDelayMs: SIGNAL_EPISODE_INTRO_LEAD_IN_MS/u);
    assert.match(source, /data-phase=\{episodePreRoll\.phase\}/u);
    assert.match(source, /data-kind="intro"/u);
    assert.match(source, /Signal Synth · generated locally/u);
    assert.match(source, />\s*Skip intro\s*</u);
    assert.match(source, /<p>With \{episodePreRoll\.guestName\}<\/p>/u);
    assert.doesNotMatch(source, /Tonight’s guest/u);
    assert.match(
      source,
      /const guest = eligibleBots\.find\(\(bot\) => bot\.id === guestDraftId\)/u,
    );
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(response\.episode\.id\)\}\/advance`/u,
    );
    assert.match(source, /body: JSON\.stringify\(\{ theme \}\)/u);
    assert.match(
      source,
      /playPreparedEpisodeMessage\(\s*opening\.message,\s*opening\.episode,/u,
    );
    assert.match(source, /SIGNAL_OPENING_ADVANCE_ATTEMPTS/u);
    assert.match(
      source,
      /if \(opening\.message \|\| opening\.episode\.status === "completed"\) break/u,
    );
    assert.match(source, /Signal could not get the opening line on mic/u);
    assert.match(
      source,
      /if \(unstartedEpisodeId && !openingMessageReceived\)/u,
    );
    assert.match(source, /method: "DELETE"/u);
    assert.match(
      source,
      /openingMessageReceived = true;[\s\S]{0,120}setTopicDraft\(""\)/u,
    );
    assert.match(source, /SIGNAL_VOICE_START_TIMEOUT_MS = 30_000/u);
    assert.match(source, /voicePreparationTimer = window\.setTimeout/u);
    assert.match(pageSource, /requestSignalVoiceWithFallback\(\{/u);
    assert.match(
      pageSource,
      /requestBuiltin: \(fallbackSignal\)[\s\S]{0,180}profile,[\s\S]{0,80}false,/u,
    );
    assert.match(
      source,
      /onStopUtterance\?\.\(\);[\s\S]{0,80}settle\(false\)/u,
    );
    assert.match(
      source,
      /await Promise\.all\(\[introPlayback\.finished, visualMinimum\]\)/u,
    );
    assert.match(source, /SIGNAL_EPISODE_PRE_ROLL_MIN_MS = 4_200/u);
    assert.match(source, /data-tutorial-target="botcast-intro-audio"/u);
    assert.match(source, /toggleShowIntroPreview/u);
    assert.match(
      source,
      /aria-pressed=\{introPreviewShowId === selectedShow\.id\}/u,
    );
    assert.match(source, /▶ Play ident/u);
    assert.match(source, /■ Stop preview/u);
    assert.doesNotMatch(
      source,
      /studioLayoutEditorOpen \|\|\s*introPreviewShowId/u,
    );
    assert.doesNotMatch(source, /signal-atmosphere-loop-preview/u);
    assert.doesNotMatch(source, /Dev: ambience/u);
    assert.doesNotMatch(css, /\.showIntroDevPreviewButton/u);
    assert.match(source, /Create atmosphere/u);
    assert.match(source, /Use built-in atmosphere/u);
    assert.match(source, /<span>Atmosphere audio<\/span>/u);
    assert.match(
      source,
      /selectedShow\.atmosphereAudio\.source === "elevenlabs"/u,
    );
    assert.match(source, /<SessionAtmosphereLayer/u);
    assert.match(
      source,
      /backgroundUrl=\{selectedShow\?\.atmosphereAudio\.audioUrl\}/u,
    );
    assert.doesNotMatch(source, /grainUrl=\{SIGNAL_STUDIO_GRAIN_URL\}/u);
    assert.match(
      source,
      /selectedShow\?\.atmosphereMix \?\? DEFAULT_SIGNAL_ATMOSPHERE_MIX/u,
    );
    assert.match(source, /backgroundTone="warm-low"/u);
    assert.match(
      source,
      /foleyRoomAcoustics=\{SIGNAL_STUDIO_FOLEY_ROOM_SEND\}/u,
    );
    assert.match(source, /allowMixBoost/u);
    assert.match(source, /ambientFoley=\{false\}/u);
    assert.doesNotMatch(source, /SIGNAL_ATMOSPHERE_DEV_MIXER_ENABLED/u);
    assert.match(source, /data-signal-atmosphere-mixer="true"/u);
    assert.match(source, /Show mix/u);
    assert.match(source, /saved for this show/u);
    assert.match(source, /label: "Studio atmosphere"/u);
    assert.doesNotMatch(source, /label: "Static backdrop"/u);
    assert.match(source, /label: "Tactile Foley"/u);
    assert.match(source, /\/atmosphere-audio\/generate/u);
    assert.match(source, /JSON\.stringify\(\{ atmosphereMix: draft\.mix \}\)/u);
    assert.match(source, /\.\.\.DEFAULT_SIGNAL_ATMOSPHERE_MIX/u);
    assert.match(source, /signalAtmosphereRelativeMixLevel/u);
    assert.match(source, /signalAtmosphereMixLevelFromRelative/u);
    assert.match(source, /max=\{SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX\}/u);
    assert.match(source, /Math\.round\(relativeLevel \* 100\)/u);
    assert.match(css, /\.atmosphereMixerSliders/u);
    assert.match(source, /selectedShowMagicManifest &&/u);
    assert.match(
      pageSource,
      /personaTemperament: signalPersonaTemperamentFor\(bot\.system_prompt\)/u,
    );
    assert.match(
      css,
      /\.episodePreRoll\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;[^}]*position:\s*relative/u,
    );
    assert.doesNotMatch(css, /\.episodePreRoll\s*\{[^}]*position:\s*fixed/u);
    assert.match(
      css,
      /@media \(max-width: 900px\)[\s\S]*?\.episodePreRoll\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*3/u,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.episodePreRoll\s*\{[^}]*color:\s*#171724;[^}]*#f4f6fb/u,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.episodePreRoll > button/u,
    );
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollSignalField i/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollLockup h1/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollMeters i/u);
    assert.match(css, /@keyframes signalPreRollRing/u);
    assert.match(css, /@keyframes signalIntroCurtainOut/u);
    assert.match(css, /\.episodePreRoll\[data-kind="intro"\]::after/u);
    assert.match(css, /\.showIntroPreviewButton\[data-active="true"\]/u);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(pageSource, /introAudioEnabled=/u);
    assert.match(
      pageSource,
      /introAudioVolume=\{settings\?\.voiceVolume \?\? 1\}/u,
    );
  });

  it("lets the active line finish before a compact producer close and outro", () => {
    assert.match(source, /playSignalOutroAudio\(\{/u);
    assert.match(source, /data-kind="outro"/u);
    assert.match(source, /Signal transmission cut/u);
    assert.match(source, /Signal transmission complete/u);
    assert.match(source, /"Skip outro"/u);
    assert.match(source, /"Return to show"/u);
    assert.match(source, /copyEpisodeForReview\(episode\)/u);
    assert.match(source, /Copy for Signal Review/u);
    assert.match(source, /presentedEpisodeOutroIdsRef/u);
    assert.match(
      source,
      /episode\.status !== "completed"[\s\S]{0,220}void playEpisodeOutro\(\{/u,
    );
    const outroSource = source.slice(
      source.indexOf("const playEpisodeOutro = useCallback"),
      source.indexOf("useEffect(() => {\n    if (!introAudioEnabled)"),
    );
    assert.match(outroSource, /phase: "curtain"/u);
    assert.match(outroSource, /phase: "holding"/u);
    assert.match(outroSource, /phase: "complete"/u);
    assert.match(source, /SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS = 2_000/u);
    assert.match(
      outroSource,
      /setEpisodeOutroSfxMutedId\(args\.episode\.id\)[\s\S]{0,320}SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS/u,
    );
    assert.match(
      outroSource,
      /setTimeout\(resolve, SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS\)[\s\S]{0,100}outroRunIdRef\.current !== runId[\s\S]{0,100}setEpisodeOutro\(/u,
    );
    assert.doesNotMatch(outroSource, /setEpisodeOutro\(null\)/u);
    assert.match(
      css,
      /\.episodeOutro\[data-phase="complete"\] \.episodeOutroActions button/u,
    );
    assert.match(css, /\.episodeOutroActions\s*\{/u);
    assert.match(source, /data-episode-outro=\{episodeOutro \? "true" : undefined\}/u);
    assert.doesNotMatch(css, /\.shell\[data-episode-outro="true"\]/u);
    assert.match(
      css,
      /\.episodeOutro\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*66px 0 0 286px;[^}]*contain:\s*layout paint;[^}]*background:\s*var\(--botcast-curtain\)/iu,
    );
    assert.match(css, /@keyframes signalOutroCurtainIn/u);
    assert.match(css, /\.episodeOutro\[data-phase="curtain"\] \.preRollLockup/u);
    assert.match(
      css,
      /@media \(max-width: 900px\)[\s\S]*?\.episodeOutro\s*\{[^}]*inset:\s*66px 0 0;[^}]*min-height:\s*0/iu,
    );
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(episode\.id\)\}\/end`/u,
    );
    assert.doesNotMatch(source, /onAirElapsedMs|episodeOutro\.discarded/u);
    assert.match(
      source,
      /lastAudienceMessageId:\s*episode\.messages\.at\(-1\)\?\.id \?\? null/u,
    );
    assert.match(
      source,
      /lastAudienceEventSequence:\s*episode\.events\.at\(-1\)\?\.sequence \?\? 0/u,
    );
    assert.match(source, /audienceSegmentCount:\s*episode\.segments\.length/u);
    assert.match(
      source,
      /activeSpeechMessageIdRef\.current === null &&[\s\S]{0,80}speakingMessageId === null[\s\S]{0,80}invalidateEpisodeOperation\(\)/u,
    );
    assert.match(
      source,
      /speakingMessageId !== null \|\|[\s\S]{0,100}activeSpeechMessageIdRef\.current !== null \|\|[\s\S]{0,60}busy/u,
    );
    assert.match(
      source,
      /pendingCutRef\.current !== null \|\|[\s\S]{0,80}message\.speakerRole !== "host"/u,
    );
    assert.match(source, /if \(pendingCutRef\.current\) return true;/u);
    assert.match(
      source,
      /response\.message[\s\S]{0,260}playPreparedEpisodeMessageRef\.current[\s\S]{0,360}playEpisodeOutro\(\{/u,
    );
    assert.match(
      source,
      /disabled=\{episode\.status === "completed" \|\| cuttingShow\}/u,
    );
    assert.match(source, /■ Cut show/u);
    assert.match(source, /aria-label="Finish the current line and close the live show"/u);
    assert.match(source, /Finishing…/u);
    assert.doesNotMatch(source, /Signal transmission discarded|Early cut · not saved/u);
    assert.match(css, /\.episodeOutro \.preRollLogo\s*\{[^}]*width:\s*118px/u);
    assert.match(css, /\.liveTopline \.cutShowButton/u);
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.liveTopline \.cutShowButton/u,
    );
    assert.match(
      source,
      /episode\?\.status === "live"[\s\S]{0,180}await cutShow\(\{ waitForOutro: true \}\)/u,
    );
    assert.match(source, /Cut the live show and open \$\{show\.name\}/u);
  });

  it("copies the complete diagnostic record from archived replay", () => {
    assert.match(source, /buildSignalReviewTranscript\(\{/u);
    assert.match(source, /writeSignalReviewClipboard\(transcript\)/u);
    assert.match(source, /copyEpisodeForReview\(replayEpisode\)/u);
    assert.match(
      source,
      /signalReviewCopyLabel\(reviewCopyState, replayEpisode\.id\)/u,
    );
  });

  it("builds a coherent random booking around the selected guest", () => {
    assert.match(source, /randomSignalEpisodeGuestId\(\{/u);
    assert.match(
      source,
      /candidateGuestIds: guestOptions\.map\(\(bot\) => bot\.id\)/u,
    );
    assert.match(source, /setGuestDraftId\(guestId\)/u);
    assert.match(source, /field: "booking"/u);
    assert.match(source, /setTopicDraft\(topic\)/u);
    assert.match(source, /setProducerBriefDraft\(producerBrief\)/u);
    assert.match(source, /↻ Randomize booking/u);
    assert.match(source, /short public title and a richer private angle/u);
    assert.match(source, /Everything remains editable/u);
    assert.match(source, /Episode topic <span>public title<\/span>/u);
    assert.match(source, /A short public title, not the full question/u);
    assert.match(source, /Private producer comments/u);
    const randomizerSource = source.slice(
      source.indexOf("const randomizeBooking"),
      source.indexOf("return (", source.indexOf("const randomizeBooking")),
    );
    assert.doesNotMatch(
      randomizerSource,
      /setEpisodeModelDraft|setEpisodeDurationDraft/u,
    );
    assert.match(randomizerSource, /request<\{/u);
    assert.match(randomizerSource, /preferredProvider: episodeModelProvider/u);
    assert.match(source, /aria-busy=\{bookingSuggestionBusy === "booking"\}/u);
    assert.match(css, /\.randomizeBookingButton/u);
  });

  it("offers model-synthesized dice actions beside both editable booking fields", () => {
    assert.match(
      source,
      /import \{ Dices, LoaderCircle \} from "lucide-react"/u,
    );
    assert.match(
      source,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/booking-suggestion/u,
    );
    assert.match(source, /guestBotId: suggestionGuest\.id/u);
    assert.match(source, /currentTopic: topicDraft/u);
    assert.match(source, /currentProducerBrief: producerBriefDraft/u);
    assert.match(source, /preferredProvider: episodeModelProvider/u);
    assert.match(source, /setTopicDraft\(value\)/u);
    assert.match(source, /setProducerBriefDraft\(value\)/u);
    assert.match(source, /aria-label="Synthesize a relevant episode topic"/u);
    assert.match(
      source,
      /aria-label="Synthesize a relevant private producer brief"/u,
    );
    assert.match(source, /aria-busy=\{bookingSuggestionBusy === "topic"\}/u);
    assert.match(
      source,
      /title=\{[\s\S]{0,120}suggestionGuest[\s\S]{0,120}: "Choose a guest first"[\s\S]{0,20}\}/u,
    );
    assert.match(css, /\.contextualDiceButton\s*\{/u);
    assert.match(css, /\.contextualTextField\[data-multiline="true"\]/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.contextualDiceButton/u,
    );
  });

  it("restores setup from the latest completed episodes without starting one", () => {
    assert.match(
      source,
      /episodes\s*\.filter\(\(item\) => item\.status === "completed"\)\s*\.slice\(0, 5\)/u,
    );
    assert.match(source, /data-tutorial-target="botcast-latest-episodes"/u);
    assert.match(source, /const detail = await loadEpisode\(summary\.id\)/u);
    assert.match(source, /signalEpisodeRetryDraft\(\{/u);
    assert.match(source, /setGuestDraftId\(retry\.guestId\)/u);
    assert.match(source, /setTopicDraft\(retry\.topic\)/u);
    assert.match(source, /setProducerBriefDraft\(retry\.producerBrief\)/u);
    assert.match(source, /setEpisodeModelDraft\(retry\.modelId\)/u);
    assert.match(source, /setEpisodeDurationDraft\(retry\.durationMinutes\)/u);
    assert.match(source, /Use setup/u);
    assert.match(source, /Nothing starts until you\s+say so/u);
    assert.match(css, /\.latestEpisodeList button/u);
  });

  it("keeps Signal coffee cosmetic and scopes producer direction", () => {
    assert.doesNotMatch(source, /top.?off|refill|depletion/iu);
    assert.match(source, /Private host cues/u);
    assert.match(source, /sendCue\(\{ kind: "refocus" \}\)/u);
    assert.match(source, /Wrap it up/u);
    assert.match(source, /Private to the host\. Cues land on their next turn/u);
    assert.doesNotMatch(source, /guide\s+both bots/u);
    assert.match(source, /queuedProducerCueRef/u);
    assert.match(
      source,
      /Queued for host: \{signalProducerCueLabel\(queuedProducerCue\)\}/u,
    );
    assert.match(source, /Interrupt guest now/u);
    assert.match(source, /interruptGuestWithQueuedCue/u);
    assert.match(source, /cueDelivery: BotcastProducerCueDelivery = "next_host_turn"/u);
    assert.match(source, /botcastHostInterruptionLineAt/u);
    assert.match(source, /botcastInterruptionBridgeMessageId/u);
    assert.match(source, /botcastInterruptedGuestContent/u);
    assert.match(source, /guestInterruption \? \{ guestInterruption \} : \{\}/u);
    assert.match(source, /interruptionBridgePlayback/u);
    assert.match(source, /playPreparedEpisodeMessage\([\s\S]{0,180}false,/u);
    assert.match(source, /signalHostCueShouldRedirect/u);
    assert.match(source, /void advanceEpisode\(cue, "redirect_host"/u);
    assert.match(
      source,
      /messageId:\s*activeHostMessage\.id,[\s\S]{0,80}spokenContent,/u,
    );
    assert.match(
      source,
      /elapsedMs \/ Math\.max\(1, durationMs\) >=[\s\S]{0,120}SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS[\s\S]{0,120}prepareFollowingGuest\(\)/u,
    );
    assert.match(source, /const activeGuestMessage =[\s\S]{0,180}speakerRole === "guest"/u);
    assert.match(source, /setEpisode\(optimisticEpisode\)/u);
    assert.match(
      source,
      /const interruptGuestWithQueuedCue = \(\): void => \{[\s\S]{0,6000}setEpisode\(optimisticEpisode\);[\s\S]{0,400}setAutoRun\(true\);[\s\S]{0,400}void advanceEpisode\(/u,
    );
    assert.match(source, /spokenContent,[\s\S]{0,320}nextHostInterruptionBridge/u);
    assert.match(source, /nextHostInterruptionCrosstalkPlan/u);
    assert.match(source, /interruptedSpeakerCuePlayback: "crosstalk"/u);
    assert.match(
      source,
      /interruptionCrosstalkPlan && interrupter[\s\S]{0,220}onListenerReaction\?\./u,
    );
    assert.match(source, /cueDelivery/u);
    assert.doesNotMatch(source, /disabled=\{busy \|\| !producerCueReady/u);
    assert.match(css, /\.producerControls button\[data-queued="true"\]/u);
    assert.match(css, /\.cueGrid\s*\{[^}]*repeat\(5, minmax\(0, 1fr\)\)/u);
    assert.match(css, /\.cueGrid button\s*\{[^}]*min-height:\s*68px/u);
    assert.match(source, /className=\{styles\.producerCueComposer\}/u);
  });

  it("puts the Producer guest on the shared bottom composer without cue cards", () => {
    assert.match(source, /BOTCAST_PRODUCER_GUEST_ID/u);
    assert.match(source, /guestKind: "producer"/u);
    assert.match(source, /guestContext: producerGuestContextDraft/u);
    assert.match(
      source,
      /const producerGuestWantsSurprise =\s*producerGuest && !producerGuestContextDraft\.trim\(\)/u,
    );
    assert.match(
      source,
      /!selectedShow\s*\|\|\s*!guestDraftId\s*\|\|\s*\(!producerGuest && !topicDraft\.trim\(\)\)/u,
    );
    assert.match(
      source,
      /\(!producerGuestSelected && !topicDraft\.trim\(\)\)/u,
    );
    assert.match(source, /Give a direction—or be surprised/u);
    assert.match(source, /optional · leave blank for host’s choice/u);
    assert.match(source, /leave this blank and let the host surprise you/u);
    assert.match(source, /without inventing facts about you/u);
    assert.match(source, /producerGuestWantsSurprise[\s\S]{0,120}"Host’s choice"/u);
    assert.match(
      source,
      /topic: producerGuestWantsSurprise\s*\? current\.topic\s*: response\.episode\.topic/u,
    );
    assert.match(source, /hostBot\?\.muted \|\| hostBot\?\.echoesAddressedSpeech/u);
    assert.match(source, /disabled=\{producerGuestUnavailable\}/u);
    assert.match(source, /Me — unavailable for this host/u);
    assert.match(pageSource, /echoesAddressedSpeech: botPowerEchoesAddressedSpeechV1/u);
    assert.match(source, /renderProducerGuestComposer\?\.\(\{/u);
    assert.match(source, /episode\.guestKind !== "producer" \? \(/u);
    assert.match(source, /currentEpisode\.guestKind === "producer"/u);
    assert.match(source, /guestThinkingMs: producerGuestThinkingMs/u);
    assert.match(source, /episode clock at half speed/u);
    assert.match(source, /replayTimeline\.thinkingRanges\.some/u);
    assert.match(source, /thinking \? "THINKING" : "YOU"/u);
    assert.match(source, /const submittedProducerTurn = producerGuestMessage/u);
    assert.match(
      source,
      /if \(submittedProducerTurn\) \{[\s\S]{0,240}producerGuestThinkingStartedAtRef\.current = null;[\s\S]{0,120}producerGuestThinkingEndedAtRef\.current = null;[\s\S]{0,900}playPreparedEpisodeMessage\(\s*submittedProducerTurn,/u,
    );
    assert.match(source, /data-signal-producer-guest-composer="true"/u);
    assert.match(pageSource, /variant: "signal"/u);
    assert.match(
      pageSource,
      /variant: "signal"[\s\S]{0,1400}mentionBots: EMPTY_COMPOSER_MENTION_PICKS[\s\S]{0,300}commandPicks: EMPTY_COMPOSER_COMMAND_PICKS[\s\S]{0,300}toolPicks: EMPTY_COMPOSER_COMMAND_PICKS[\s\S]{0,300}promptPicks: EMPTY_COMPOSER_COMMAND_PICKS[\s\S]{0,300}wildcardPicks: EMPTY_COMPOSER_COMMAND_PICKS/u,
    );
    assert.match(pageSource, /showQueuedPromptRail: false/u);
    assert.match(
      pageSource,
      /variant: "signal"[\s\S]{0,900}shouldSubmitComposerOnEnter/u,
    );
    assert.match(
      source,
      /producerGuestFallbackComposer[\s\S]{0,900}shouldSubmitComposerOnEnter/u,
    );
  });

  it("keeps Producer speech editable and cuts an audible host truthfully", () => {
    assert.match(source, /signalProducerGuestHostInterruptionContext/u);
    assert.match(
      source,
      /botcastSpeechRevealVisibleText\([\s\S]{0,120}trimEnd\(\)/u,
    );
    assert.match(
      source,
      /spokenContent === activeHostMessage\.content[\s\S]{0,120}!activeHostMessage\.content\.startsWith\(spokenContent\)/u,
    );
    assert.match(source, /interruptProducerGuestHostLocally/u);
    assert.match(source, /invalidateEpisodeOperation\(\)/u);
    assert.match(
      source,
      /\.\.\.\(producerGuestHostInterruption[\s\S]{0,100}\? \{ producerGuestHostInterruption \}[\s\S]{0,40}: \{\}\)/u,
    );
    assert.match(source, /inputDisabled: false/u);
    assert.match(source, /shhActive: producerGuestHostInterruption !== null/u);
    assert.match(source, /onShh: \(\) => void shushProducerGuestHost\(\)/u);
    assert.match(pageSource, /inputDisabled: composer\.inputDisabled/u);
    assert.match(pageSource, /interruptActive: composer\.shhActive/u);
    assert.match(pageSource, /onInterrupt: composer\.onShh/u);
  });

  it("lets two echo-bound bots reach Signal's server-owned opening fallback", () => {
    assert.doesNotMatch(
      source,
      /both have hard echo Powers, so neither can originate the opening/u,
    );
    assert.doesNotMatch(source, /"cast Power compatibility"/u);
  });

  it("preserves the producer cue input focus and caret across speaker changes", () => {
    assert.match(source, /const producerCueInputRef = useRef<HTMLInputElement \| null>\(null\)/u);
    assert.match(source, /ref=\{producerCueInputRef\}/u);
    assert.match(source, /producerCueInputFocusedRef\.current = true/u);
    assert.match(source, /producerCueInputSelectionRef\.current = \{[\s\S]{0,120}selectionStart/u);
    assert.match(
      source,
      /useLayoutEffect\(\(\) => \{[\s\S]{0,260}producerCueInputRef\.current[\s\S]{0,160}input\.focus\(\{ preventScroll: true \}\)[\s\S]{0,160}input\.setSelectionRange\(start, end\);[\s\S]{0,100}\[liveSpeech\?\.messageId, speakingMessageId\]\)/u,
    );
  });

  it("shows a live elapsed episode timer and freezes its completed duration", () => {
    assert.match(source, /function signalEpisodeRuntimeMs\(/u);
    assert.match(source, /if \(episode\.runtimeMs !== null\) return Math\.max\(0, episode\.runtimeMs\)/u);
    assert.match(source, /episode\.modelWarmupHoldDurationMs/u);
    assert.match(source, /className=\{styles\.liveTimer\}/u);
    assert.match(source, /data-running=\{episode\.status === "live"/u);
    assert.match(source, /Episode live for \$\{runtimeLabel\(liveEpisodeElapsedMs\)\}/u);
    assert.match(source, /Final episode duration \$\{runtimeLabel\(liveEpisodeElapsedMs\)\}/u);
    assert.match(css, /\.liveTimer\[data-running="true"\]/u);
  });

  it("lets an annoyed guest visibly attempt to interject without taking the transcript", () => {
    assert.match(source, /listenerReactionPlan\.interjectionAttempt \? 1_600 : 1_200/u);
    assert.match(source, /data-interjection-attempt=\{/u);
    assert.match(css, /\.listenerReactionText\[data-interjection-attempt="true"\]/u);
  });

  it("keeps live turns and stage presence on the real voice clock", () => {
    assert.doesNotMatch(
      source,
      /speakingTimerRef|9_000|split\(\/\\s\+\/u\)\.length \* 280/u,
    );
    assert.match(
      source,
      /Promise\.resolve\([\s\S]{0,80}onUtterance\([\s\S]{0,160}botcastVoiceLevelForBot/u,
    );
    assert.match(source, /onStart: \(durationMs, alignment\)/u);
    assert.match(source, /onProgress: \(elapsedMs, durationMs\)/u);
    assert.match(source, /const speechElapsedMs = args\.replay/u);
    assert.match(source, /speechReveal\?\.phase === "playing"/u);
    assert.match(source, /const SIGNAL_NATURAL_HANDOFF_MS = 40/u);
    assert.match(source, /const SIGNAL_VOICE_COMPLETION_GRACE_MS = 4_000/u);
    assert.match(
      source,
      /botcastSignalStandardCadenceDurationMs\(pacingText\)/u,
    );
    assert.doesNotMatch(source, /tokenCount \* 175|6_500/u);
    assert.match(
      source,
      /resolvedDurationMs \+ SIGNAL_VOICE_COMPLETION_GRACE_MS/u,
    );
    assert.match(source, /settleVoicePlayback\?\.\(true\)/u);
    assert.match(
      source,
      /voiceCompletionTimer !== null[\s\S]{0,180}window\.clearTimeout\(voiceCompletionTimer\)/u,
    );
    assert.match(
      source,
      /episode\.messages\.length \? SIGNAL_NATURAL_HANDOFF_MS : 0/u,
    );
    assert.match(source, /const prepareGuestResponse = useCallback/u);
    assert.match(
      source,
      /!bot\.muted[\s\S]{0,120}!botPowerResponseIsSilentV1\(response\.message\.content\)[\s\S]{0,120}onPrefetchUtterance\?\.\(response\.message, bot\)/u,
    );
    assert.match(
      source,
      /!bot\.muted[\s\S]{0,120}!botPowerResponseIsSilentV1\(message\.content\)[\s\S]{0,120}onPrefetchUtterance\?\.\(message, bot\)/u,
    );
    assert.match(pageSource, /signalVoiceClipCacheRef/u);
    assert.match(pageSource, /const prefetchBotcastUtterance = useCallback/u);
    assert.match(
      pageSource,
      /const preparedClipPromise = signalVoiceClipCacheRef\.current\.get\(message\.id\)/u,
    );
    assert.match(
      pageSource,
      /onPrefetchUtterance=\{prefetchBotcastUtterance\}/u,
    );
    assert.match(source, /hostMessage\.speakerRole !== "host"/u);
    assert.match(source, /prepared \? await prepared\.result : null/u);
    assert.doesNotMatch(
      source,
      /prepared\.warmupFailure\s*=\s*"request_failed"/u,
    );
    assert.match(
      source,
      /if \(preparedResult && !preparedResult\.ok\) throw preparedResult\.error/u,
    );
    assert.match(source, /episodeOperationAbortRef\.current\?\.abort\(\)/u);
    assert.match(source, /signal: controller\.signal/u);
    assert.match(source, /episodeOperationIsCurrent\(controller, runId\)/u);
    assert.match(
      source,
      /if \(!busy && speakingMessageId === null && nextRole === "host"\) \{[\s\S]{0,100}onPrepareUtterance\?\.\(\);[\s\S]{0,80}advanceEpisode\(cue\)/u,
    );
    assert.match(
      source,
      /const played = await onUtterance\(\s*replayPlaybackMessage,\s*bot,/u,
    );
    assert.match(source, /replayVoicePending/u);
    assert.match(source, /replayVoiceRunIdRef\.current !== runId/u);
    assert.doesNotMatch(
      source,
      /onUtterance\(replayPlaybackMessage, bot, \{\}\)/u,
    );
    assert.match(pageSource, /includeAlignment: true/u);
    assert.match(pageSource, /readEnglishVoiceSynthesisClip\(response\)/u);
    assert.match(pageSource, /lifecycle: trackedLifecycle/u);
    assert.match(
      pageSource,
      /settings\.voiceVolume\s*\*\s*normalizeBotcastVoiceLevel\(voiceLevel\)/u,
    );
    assert.match(pageSource, /globalVolume: playbackVolume/u);
    const stopUtteranceSource = source.slice(
      source.indexOf("const stopUtterance = useCallback"),
      source.indexOf("const stopIntroPreview = useCallback"),
    );
    assert.match(
      source,
      /const onStopUtteranceRef = useRef\(onStopUtterance\)/u,
    );
    assert.match(source, /onStopUtteranceRef\.current = onStopUtterance/u);
    assert.match(stopUtteranceSource, /onStopUtteranceRef\.current\?\.\(\)/u);
    assert.match(stopUtteranceSource, /\}, \[\]\);/u);
    assert.doesNotMatch(stopUtteranceSource, /\[onStopUtterance\]/u);
    assert.match(
      pageSource,
      /coffeePlateFaceScaleYFromSeatHorizontalSide\([\s\S]{0,260}avatarState\.facing === "left"[\s\S]{0,220}avatarState\.role === "host"/u,
    );
    assert.match(pageSource, /botAvatarDetailsFacingScaleX\(faceScaleY\)/u);
    assert.match(
      pageSource,
      /<ZenLiveBotMannequin[\s\S]{0,900}isTalking=\{avatarState\.talking\}[\s\S]{0,800}blinkWhileTalking\s+mouthShape=\{avatarState\.mouthShape\}/u,
    );
    assert.match(
      css,
      /\.avatarRig\[data-talking="true"\]\s*\{[^}]*animation:\s*none;[^}]*transform:\s*rotate\(var\(--signal-avatar-lean\)\)/iu,
    );
    assert.doesNotMatch(css, /@keyframes signalBotTalking/iu);
    assert.match(css, /@keyframes signalBotIdle/u);
    assert.match(css, /@keyframes signalBotThinking/u);
    assert.match(css, /\.wordmark \.showLogo\s*\{[^}]*width:\s*68px/iu);
    assert.match(source, /data-signal-cast-credit="true"/u);
    assert.match(
      source,
      /<small>with<\/small>[\s\S]{0,80}<strong>\{args\.host\?\.name \?\? "Host"\}<\/strong>/u,
    );
    assert.match(
      source,
      /<small>featuring<\/small>[\s\S]{0,80}<strong>\{args\.guest\?\.name \?\? "Guest"\}<\/strong>/u,
    );
    assert.match(
      css,
      /\.stageCastCredit\s*\{[^}]*width:\s*min\(66vw, 390px\)[^}]*user-select:\s*none/iu,
    );
    assert.match(
      css,
      /\.stageCastCredit span\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.36fr\) minmax\(0, \.64fr\)/iu,
    );
    assert.match(
      css,
      /\.stageCastCredit small\s*\{[^}]*letter-spacing:\s*\.18em[^}]*text-transform:\s*uppercase/iu,
    );
    assert.match(
      css,
      /\.stageCastCredit strong\s*\{[^}]*text-overflow:\s*ellipsis/iu,
    );
    assert.match(
      css,
      /\.stageViewport\[data-shot="right"\] \.stageScene\s*\{[^}]*scale\(1\.42\)/u,
    );
    assert.match(css, /\.wordmark::before\s*\{[^}]*radial-gradient/iu);
    assert.match(css, /\.wordmark > strong\s*\{[^}]*color:\s*#f8fbff/iu);
    assert.match(
      css,
      /\.wordmark > strong\s*\{[^}]*text-shadow:[^;}]*rgba\(0,0,0,\.98\)/iu,
    );
    assert.match(
      css,
      /prefers-reduced-motion[\s\S]*?\.avatarRig\s*\{[^}]*animation:\s*none/iu,
    );
  });

  it("reserves the full transcript and playback controls for replay", () => {
    assert.doesNotMatch(source, /className=\{styles\.transcript\}/u);
    assert.doesNotMatch(source, /signalTranscriptFollowingRef/u);
    assert.match(source, /className=\{styles\.replayControls\}/u);
    assert.match(source, /className=\{styles\.replayTranscript\}/u);
    assert.match(css, /\.replayControls\s*\{[^}]*background:\s*var\(--botcast-panel\)/u);
    assert.match(css, /\.replayTranscript\s*\{[^}]*max-height:\s*320px/u);
  });

  it("shows only the active live transcript after a small delay", () => {
    assert.match(source, /signalLiveCaptionText\(speechReveal\)/u);
    assert.match(
      source,
      /!args\.replay[\s\S]{0,180}speechReveal\?\.phase === "playing"/u,
    );
    assert.match(source, /data-signal-live-caption="true"/u);
    assert.match(source, /aria-live="off"/u);
    assert.match(
      source,
      /botcastMessageIsAudibleToAudienceV1\(args\.activeMessage\)[\s\S]{0,120}!botPowerResponseIsSilentV1\(args\.activeMessage\.content\)/u,
    );
    assert.doesNotMatch(source, /liveCaptionCues|queueLiveCaptionCue/u);
    assert.match(
      css,
      /\.liveCaption\s*\{[^}]*bottom:\s*6\.5%;[^}]*z-index:\s*18/iu,
    );
  });

  it("keeps hard-muted Signal lines visible but silent with a closed speaking mouth", () => {
    assert.match(source, /botPowerResponseIsSilentV1\(message\.content\)/u);
    assert.match(
      source,
      /bot\.muted \|\|[\s\S]{0,100}botPowerResponseIsSilentV1\(replayActiveMessage\.content\)/u,
    );
    assert.match(
      source,
      /speechIsPlaying &&[\s\S]{0,100}!botPowerResponseIsSilentV1\(args\.activeMessage\?\.content\)/u,
    );
    assert.match(source, /if \(bot\.muted\) continue;/u);
    assert.match(
      source,
      /botcastSnapshotPowersForRoleV1\(episode, "host"\)[\s\S]{0,120}muted: botPowerIsMutedV1\(powers\)/u,
    );
    assert.match(
      source,
      /signalShowCardBlurbs\([\s\S]{0,120}Boolean\(hostBot\?\.muted\),[\s\S]{0,100}Boolean\(hostBot\?\.echoesAddressedSpeech\)/u,
    );
    assert.match(
      source,
      /disabled=\{hostBot\.muted \|\| showIdentityControlsExpanded\}/u,
    );
    assert.match(
      css,
      /\.shell button\.showCardHostTrigger:disabled\s*\{[^}]*opacity:\s*1;[^}]*cursor:\s*not-allowed;/u,
    );
    assert.match(pageSource, /muted: botPowerIsMutedV1\(bot\.powers\)/u);
  });

  it("keeps imperceptible Signal turns out of stage, captions, and voice", () => {
    assert.match(
      source,
      /currentEpisode\.audienceExperience\?\.participants/u,
    );
    assert.match(
      source,
      /!guestDeparted && audienceParticipants\?\.guest\.visible !== false/u,
    );
    assert.match(
      source,
      /\{guestVisibleToAudience && args\.guest \? \(/u,
    );
    assert.match(
      source,
      /data-audience-guest-visible=\{guestVisibleToAudience \? "true" : "false"\}/u,
    );
    assert.doesNotMatch(source, /Guest chair is empty/u);
    assert.doesNotMatch(source, /Booked guest/u);
    assert.match(source, /data-audience-hidden=\{guestHiddenFromAudience/u);
    assert.match(
      source,
      /guestPresentOnStage && args\.guest && renderMug && guestCupVisual/u,
    );
    assert.match(source, /botcastMessageIsAudibleToAudienceV1\(message\) \? \(/u);
    assert.match(source, /!botcastMessageIsAudibleToAudienceV1\(replayActiveMessage\)/u);
    assert.doesNotMatch(css, /data-audience-only/iu);
  });

  it("replays negative Power pressure as a restrained studio treatment", () => {
    assert.match(source, /botcastStrongestNegativeSocialInfluenceAt/u);
    assert.match(
      source,
      /elapsedMs: args\.replay \? replayElapsedMs : Number\.POSITIVE_INFINITY/u,
    );
    assert.match(
      source,
      /data-signal-power-pressure=\{socialPressure\?\.strength\}/u,
    );
    assert.match(
      source,
      /data-signal-power-source=\{socialPressure\?\.sourceRole\}/u,
    );
    assert.match(source, /className=\{styles\.powerPressure\}/u);
    assert.match(
      css,
      /\.powerPressure\s*\{[^}]*--signal-power-origin-x:[^}]*z-index:\s*6/iu,
    );
    assert.match(
      css,
      /\.powerPressure\[data-strength="large"\]\s*\{[^}]*opacity:\s*\.54/iu,
    );
  });

  it("completes missing legacy identity pieces without replacing installed assets", () => {
    const createShowSource = source.slice(
      source.indexOf("const createShow"),
      source.indexOf("const renameShow"),
    );
    assert.doesNotMatch(
      source,
      /synthesizeArtwork|Synthesize studios \+ logo/u,
    );
    assert.doesNotMatch(
      createShowSource,
      /generateShowArtwork|\/brand|\/name/u,
    );
    assert.match(
      source,
      /ready with its built-in PRISM set\. Create its custom look whenever you want one/u,
    );
    assert.match(source, /signalShowMagicManifest\(selectedShow\)/u);
    assert.match(source, /!selectedShowMagicManifest\.complete/u);
    assert.equal(
      source.match(/>\s*Complete this show\s*</gu)?.length ?? 0,
      1,
      "Magic should remain a single resumable action",
    );
    assert.equal(
      source.match(/data-signal-first-look-action=/gu)?.length ?? 0,
      1,
    );
    assert.doesNotMatch(source, />\s*Find a clever name\s*</u);
    assert.match(source, /\/brand/u);
    assert.match(source, /preserveArtwork: true/u);
    assert.match(source, /Writing the missing text identity/u);
    assert.match(source, /setShowNameDraft\(identity\.show\.name\)/u);
    assert.match(
      source,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(sourceShow\.id\)\}\/artwork-job/u,
    );
    assert.match(source, /announceSignalArtworkJob\(response\.job\)/u);
    assert.match(source, /manifest\.missingArtwork/u);
    assert.match(source, /Creating the missing audio package/u);
    assert.match(source, /\/intro-audio\/generate/u);
    assert.match(source, /waiting for Online/u);
    assert.match(source, /aria-label="Complete this show’s identity"/u);
    assert.match(source, /data-tutorial-target="botcast-brand-controls"/u);
    assert.match(css, /\.showLookInvitation button\s*\{[^}]*linear-gradient/iu);
    assert.match(source, /className=\{styles\.showIdentityGearButton\}/u);
    assert.match(source, /aria-expanded=\{showIdentityControlsExpanded\}/u);
    assert.match(
      source,
      /aria-controls=\{`signal-show-identity-controls-\$\{selectedShow\.id\}`\}/u,
    );
    assert.match(source, /hidden=\{!showIdentityControlsExpanded\}/u);
    assert.match(source, /setShowIdentityControlsShowId\(null\)/u);
    assert.match(source, /artworkJob\.completedCount > completedCount/u);
    assert.match(source, /Finished visuals were kept/u);
    assert.match(
      css,
      /\.showIdentityGearButton\s*\{[^}]*right:\s*18px;[^}]*bottom:\s*18px/iu,
    );
    assert.match(
      css,
      /\.showBrandPreview\[data-identity-settings-open="true"\]\s*\{[^}]*height:\s*360px/iu,
    );
    assert.match(
      css,
      /\.showLookControls\s*\{[^}]*width:\s*min\(700px,\s*68%\)/iu,
    );
    assert.match(
      css,
      /\.showLookControlGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/iu,
    );
    assert.match(
      css,
      /@media \(max-width:\s*900px\)[\s\S]*?\.showBrandPreview\[data-identity-settings-open="true"\]\s*\{[^}]*height:\s*auto/iu,
    );
    assert.match(source, /regenerateLogo: true/u);
    assert.match(source, /aria-label="Edit show name"/u);
    assert.match(source, />\s*Save name\s*</u);
    assert.match(source, />\s*Regenerate name\s*</u);
    assert.match(
      source,
      /Regenerate\{" "\}[\s\S]{0,100}hostBot\?\.echoesAddressedSpeech \? "blurb" : "blurbs"/u,
    );
    assert.match(source, />\s*Refresh studio\s*</u);
    assert.match(source, />\s*Refresh Light\s*</u);
    assert.match(source, />\s*Refresh logo\s*</u);
    assert.match(
      source,
      /body: JSON\.stringify\(\{ regenerateAtmosphere: true \}\)/u,
    );
    assert.match(
      source,
      /startSignalArtworkJob\(reset\.show, \["night-studio", "day-studio"\]\)/u,
    );
    assert.match(
      source,
      /reset\.show\.id\)\}\/atmosphere-audio\/generate/u,
    );
    assert.match(source, /studio-specific room-and-Foley atmosphere is ready/u);
    assert.match(source, /regenerateStudio\(\)/u);
    assert.match(source, /regenerateLightStudio\(\)/u);
    assert.match(
      source,
      /startSignalArtworkJob\(selectedShow, \["day-studio"\]\)/u,
    );
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["logo"\]\)/u);
    assert.doesNotMatch(source, /const generateShowArtwork/u);
    assert.doesNotMatch(source, />\s*Refresh Dark\s*</u);
    assert.match(source, /function SignalShowLogo/u);
    assert.match(source, /show\.logo\.fallbackGlyph/u);
    assert.match(source, /data-theme=\{theme\}/u);
    assert.match(css, /--prism-p:\s*#ff4d6d/iu);
    assert.match(css, /--prism-s:\s*#2fd3e3/iu);
    assert.match(css, /\.shell\[data-theme="light"\]/u);
    assert.match(css, /--botcast-logo-surface:/u);
    assert.match(
      css,
      /\.shell\[data-theme="light"\][\s\S]{0,700}--botcast-logo-surface:/u,
    );
    assert.match(css, /\.showLogo img\s*\{[^}]*object-fit:\s*contain/iu);
    assert.match(source, /function SignalFallbackStudio/u);
  });

  it("blocks only for identity handoff, then exposes honest persistent background progress", () => {
    const studioRefreshSource = source.slice(
      source.indexOf("const regenerateStudio"),
      source.indexOf("const regenerateLightStudio"),
    );
    const lightStudioRefreshSource = source.slice(
      source.indexOf("const regenerateLightStudio"),
      source.indexOf("const regenerateLogo"),
    );
    const logoRefreshSource = source.slice(
      source.indexOf("const regenerateLogo"),
      source.indexOf("const generateShowIntroAudio"),
    );
    assert.match(source, /import \{ PrismBlockingLoader \}/u);
    assert.match(source, /setBlockingOperation\(\{/u);
    assert.match(
      source,
      /Handing missing artwork to the background renderer/u,
    );
    assert.match(source, /progress: null/u);
    assert.match(source, /<PrismBlockingLoader/u);
    assert.match(source, /open=\{blockingOperation !== null\}/u);
    assert.match(blockingLoaderSource, /data-prism-blocking-loader="true"/u);
    assert.match(source, /new AbortController\(\)/u);
    assert.match(source, /signal: controller\.signal/u);
    assert.match(source, /controller\.abort\(\)/u);
    assert.match(source, /setBlockingOperation\(null\);\s*setBusy\(false\)/u);
    assert.match(
      source,
      /onCancel=\{[\s\S]{0,80}blockingOperation\?\.cancellable \? cancelBlockingOperation : undefined[\s\S]{0,20}\}/u,
    );
    assert.match(source, /cancelLabel="Cancel synthesis"/u);
    assert.match(pageSource, /<SignalArtworkJobActivity/u);
    assert.match(
      artworkActivitySource,
      /\/api\/botcast\/artwork-jobs\/active/u,
    );
    assert.match(artworkActivitySource, /setInterval/u);
    assert.match(artworkActivitySource, /completedCount/u);
    assert.match(artworkActivitySource, /Elapsed \{elapsed\}/u);
    assert.match(artworkActivitySource, /Waiting for Dark studio/u);
    assert.match(artworkJobSource, /Relighting the completed Dark studio/u);
    assert.match(artworkJobSource, /job\.totalCount === 1/u);
    assert.match(artworkActivitySource, /\/cancel/u);
    assert.match(artworkActivityCss, /signal-artwork-scan/u);
    assert.doesNotMatch(studioRefreshSource, /setBlockingOperation/u);
    assert.doesNotMatch(lightStudioRefreshSource, /setBlockingOperation/u);
    assert.doesNotMatch(logoRefreshSource, /setBlockingOperation/u);
    assert.match(
      studioRefreshSource,
      /rendering in the background[\s\S]{0,180}You can keep using PRISM/u,
    );
    assert.match(
      lightStudioRefreshSource,
      /startSignalArtworkJob\(selectedShow, \["day-studio"\]\)/u,
    );
    assert.doesNotMatch(
      lightStudioRefreshSource,
      /regenerateAtmosphere|atmosphere-audio\/generate|\["night-studio"/u,
    );
    assert.match(lightStudioRefreshSource, /Dark studio stays unchanged/u);
    assert.match(
      logoRefreshSource,
      /rendering in the background\. You can keep using PRISM/u,
    );
  });

  it("refreshes a clever show name without refreshing its visual identity", () => {
    assert.match(source, /aria-label="Edit show name"/u);
    assert.match(
      source,
      /onBlur=\{\(event\) =>[\s\S]{0,100}void renameShow\(event\.currentTarget\.value\)[\s\S]{0,60}\}/u,
    );
    assert.match(source, />\s*Save name\s*</u);
    assert.match(source, />\s*Regenerate name\s*</u);
    assert.match(
      source,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/name/u,
    );
    assert.match(source, /setShowNameDraft\(response\.show\.name\)/u);
    assert.match(source, /title: "Finding another name"/u);
    assert.match(source, /progress: null/u);
    assert.doesNotMatch(
      source,
      /regenerateShowName[\s\S]{0,900}generateShowArtwork/u,
    );
  });

  it("keeps premise inspiration editable and feeds it into show creation", () => {
    assert.match(source, /Premise inspiration <span>optional<\/span>/u);
    assert.match(source, /showPremiseInspirationDraft\.trim\(\)/u);
    assert.match(source, /premise: showPremiseInspirationDraft\.trim\(\)/u);
    assert.match(source, /aria-label="Edit show premise"/u);
    assert.match(source, /void saveShowPremise\(event\.currentTarget\.value\)/u);
    assert.match(source, /JSON\.stringify\(\{ premise \}\)/u);
    assert.match(source, />\s*Save premise\s*</u);
    assert.match(css, /\.showLookPremiseInput/u);
  });

  it("regenerates only the persisted dashboard blurb batch", () => {
    const blurbRefreshSource = source.slice(
      source.indexOf("const regenerateShowBlurbs"),
      source.indexOf("const startSignalArtworkJob"),
    );
    assert.match(source, /data-signal-identity-action="blurbs"/u);
    assert.match(
      source,
      /Regenerate\{" "\}[\s\S]{0,100}hostBot\?\.echoesAddressedSpeech \? "blurb" : "blurbs"/u,
    );
    assert.match(source, /disabled=\{busy \|\| hostBot\?\.muted\}/u);
    assert.match(source, /This host’s Power allows only \.\.\./u);
    assert.match(
      blurbRefreshSource,
      /\/api\/botcast\/shows\/\$\{encodeURIComponent\(selectedShow\.id\)\}\/blurbs/u,
    );
    assert.match(blurbRefreshSource, /replaceShow\(response\.show\)/u);
    assert.match(blurbRefreshSource, /dashboardBlurbs\.length/u);
    assert.match(blurbRefreshSource, /failureReason === "provider_error"/u);
    assert.match(blurbRefreshSource, /response\.recovered/u);
    assert.match(blurbRefreshSource, /across \$\{response\.attempts\} passes/u);
    assert.match(blurbRefreshSource, /one repeating dashboard blurb/u);
    assert.doesNotMatch(
      blurbRefreshSource,
      /artwork-job|\/name|regenerateAtmosphere|regenerateLogo/u,
    );
  });

  it("replaces each Signal show asset through a simple image upload", () => {
    assert.match(source, /data-signal-artwork-action="day-studio"/u);
    assert.match(
      source,
      /Generate a new Light studio from the current Dark studio/u,
    );
    assert.match(
      source,
      /disabled=\{\s*busy \|\|\s*selectedShowArtworkBusy \|\|\s*!selectedShow\.nightAtmosphere\.imageId\s*\}/u,
    );
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

  it("keeps microphones inside the authored studio instead of exposing a separate foreground", () => {
    assert.doesNotMatch(source, /SignalMicrophoneForeground/u);
    assert.doesNotMatch(source, /data-signal-microphone-foreground/u);
    assert.doesNotMatch(source, />\s*Refresh microphones\s*</u);
    assert.doesNotMatch(source, /Microphone foreground scale/u);
    assert.doesNotMatch(source, /uploadShowAsset\("microphones"/u);
    assert.doesNotMatch(source, /regenerateMicrophoneLayer/u);
    assert.doesNotMatch(css, /\.microphoneForeground\s*\{/u);
  });

  it("shows the selected logo and studio artwork on the dashboard", () => {
    assert.match(
      source,
      /className=\{styles\.showBrandPreview\}[\s\S]*?<SignalShowLogo show=\{selectedShow\}/u,
    );
    assert.match(source, /function activeShowAtmosphere/u);
    assert.match(
      source,
      /theme === "light" \? show\.dayAtmosphere : show\.nightAtmosphere/u,
    );
    assert.match(
      source,
      /const dashboardAtmosphere = selectedShow[\s\S]{0,100}activeShowAtmosphere\(selectedShow, theme\)/u,
    );
    assert.match(
      source,
      /const stageAtmosphere = activeShowAtmosphere\(args\.show, theme\)/u,
    );
    assert.match(css, /\.showBrandPreview\s*\{/u);
    assert.match(css, /\.showBrandPreview\s*\{[^}]*min-height:\s*360px/iu);
    assert.match(css, /\.showBrandContent\s*\{[^}]*min-height:\s*360px/iu);
    assert.match(
      css,
      /\.showBrandPreview, \.showBrandContent\s*\{\s*min-height:\s*340px/iu,
    );
    assert.match(css, /\.showBrandAtmosphere\s*\{/u);
    assert.match(
      css,
      /\.showBrandAtmosphere\s*\{[^}]*filter:\s*blur\(3px\)/iu,
    );
    assert.match(
      css,
      /\.showBrandAtmosphere\s*\{[^}]*transform:\s*scale\(1\.035\)/iu,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.showBrandAtmosphere\s*\{[^}]*filter:\s*blur\(3px\)[^}]*mix-blend-mode:\s*normal/iu,
    );
    assert.doesNotMatch(
      css,
      /\.shell\[data-theme="light"\] \.showBrandPreview::after\s*\{[^}]*mix-blend-mode:\s*screen/iu,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.showBrandContent h2\s*\{[^}]*color:\s*var\(--botcast-ink\)/iu,
    );
  });

  it("brings the show card to life with an episode-aware audience pulse", () => {
    assert.match(
      source,
      /signalAudienceSnapshot\(\{\s*showId:\s*selectedShow\.id,\s*episodes\s*\}\)/u,
    );
    assert.match(source, /data-tutorial-target="botcast-audience-pulse"/u);
    assert.match(source, /aria-haspopup="dialog"/u);
    assert.match(source, /setAudiencePulseShowId\(selectedShow\.id\)/u);
    assert.match(source, />\s*Audience pulse\s*</u);
    assert.match(source, /<small>Views<\/small>/u);
    assert.match(source, /showAudience\.ratingConfidence === "early"/u);
    assert.match(source, /"Early rating"/u);
    assert.match(source, /<small>Reviews<\/small>/u);
    assert.match(source, /out of 5/u);
    assert.match(source, /Release an episode to start building an audience\./u);
    assert.match(source, /Waiting for the first listener review\./u);
    assert.match(source, /className=\{styles\.showAudienceQuote\}/u);
    assert.match(
      source,
      /<cite>\s*— \{showAudience\.featuredReview\.listener\}\s*<\/cite>/u,
    );
    assert.match(source, /role="dialog"/u);
    assert.match(source, />Listener reviews<\/h2>/u);
    assert.match(source, /showAudienceReviews\.map\(\(review\) =>/u);
    assert.match(source, /\{review\.rating\.toFixed\(1\)\}/u);
    assert.match(source, /\{review\.comment\}/u);
    assert.match(source, /\{review\.reviewerName\}/u);
    assert.match(
      css,
      /\.showAudienceMetrics\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/iu,
    );
    assert.match(
      css,
      /\.showBrandPreview\[data-identity-settings-open="true"\] \.showAudiencePulse\s*\{[^}]*display:\s*none/iu,
    );
    assert.match(
      css,
      /\.shell\[data-theme="light"\] \.showAudiencePulse\s*\{/u,
    );
    assert.match(css, /\.audiencePulseDialog\s*\{/u);
    assert.match(css, /\.audiencePulseReviewList\s*\{[^}]*overflow:\s*auto/iu);
    assert.match(
      css,
      /@media \(max-width:\s*900px\)[\s\S]*?\.showAudienceQuote\s*\{[^}]*flex-direction:\s*column/iu,
    );
  });

  it("floats the host on the show card and periodically reveals show blurbs", () => {
    assert.match(
      source,
      /signalShowCardBlurbs\([\s\S]{0,120}Boolean\(hostBot\?\.muted\),[\s\S]{0,100}Boolean\(hostBot\?\.echoesAddressedSpeech\)/u,
    );
    assert.match(source, /className=\{styles\.showCardHostPresence\}/u);
    assert.match(
      source,
      /\{hostBot && !showIdentityControlsExpanded && !hostChatOpen \? \([\s\S]{0,180}className=\{styles\.showCardHostPresence\}/u,
      "The dashboard host should yield to show configuration and the focused chat",
    );
    assert.match(
      source,
      /renderAvatar\?\.\(hostBot,[\s\S]{0,220}role:\s*"host"[\s\S]{0,320}facing:\s*signalStudioFacingForRole\([\s\S]{0,240}mouthShape:\s*"closed"/u,
    );
    assert.match(
      pageSource,
      /avatarState\.facing === "left"[\s\S]{0,180}avatarState\.role === "host"/u,
    );
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS/u);
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS/u);
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_GAP_MS/u);
    assert.match(
      source,
      /signalShowCardBlurbs\([\s\S]{0,120}Boolean\(hostBot\?\.muted\),[\s\S]{0,100}Boolean\(hostBot\?\.echoesAddressedSpeech\)/u,
    );
    assert.match(
      source,
      /Math\.floor\(Math\.random\(\) \* showCardQuipCount\)/u,
    );
    assert.match(source, /\(nextIndex \+ 1\) % showCardQuipCount/u);
    assert.doesNotMatch(source, /\(nextIndex \+ 1\) % 4/u);
    assert.match(source, /aria-live="polite"/u);
    assert.match(
      source,
      /const hostShowAccent = selectedShow[\s\S]{0,140}normalizeAccentForTheme/u,
    );
    assert.match(source, /"--botcast-host-accent": hostShowAccent/u);
    assert.match(
      source,
      /"--show-accent" as string\]: normalizeAccentForTheme\([\s\S]{0,100}host\?\.color \?\? show\.accentColor/u,
    );
    assert.match(
      css,
      /\.showRow::before\s*\{[^}]*background:\s*var\(--show-accent\)/iu,
    );
    assert.match(css, /\.showCardHostPresence\s*\{[^}]*bottom:\s*0;/iu);
    assert.match(css, /\.showCardHostFloat\s*\{[^}]*signalShowCardHostFloat/iu);
    assert.match(
      css,
      /\.showCardHostFloat > \*\s*\{[^}]*transform:\s*scale\(1\.5\)/iu,
    );
    assert.match(css, /\.showCardQuipBubble\s*\{/u);
    assert.match(
      css,
      /\.showCardQuipBubble::before\s*\{[^}]*linear-gradient\([^}]*var\(--prism-p\)[^}]*var\(--prism-s\)[^}]*var\(--botcast-host-accent\)/iu,
    );
    assert.match(
      css,
      /\.productionDesk\s*\{[^}]*var\(--botcast-host-accent\)/iu,
    );
    assert.match(
      css,
      /\.episodeNumber\s*\{[^}]*var\(--botcast-host-accent\)/iu,
    );
    assert.match(
      css,
      /prefers-reduced-motion[\s\S]*?\.showCardHostFloat, \.showCardQuipBubble\s*\{[^}]*animation:\s*none/iu,
    );
  });

  it("keeps a widescreen TV frame and centers close-ups within its edges", () => {
    assert.match(
      source,
      /botcastCameraOffsetXPercent\([\s\S]{0,100}args\.shot,[\s\S]{0,100}studioLayout/u,
    );
    assert.match(
      source,
      /botcastCameraOffsetYPercent\([\s\S]{0,100}args\.shot,[\s\S]{0,100}studioLayout/u,
    );
    assert.match(
      css,
      /translate\(var\(--botcast-camera-offset-x, 0%\), var\(--botcast-camera-offset-y, 0%\)\) scale\(1\.42\)/u,
    );
    assert.match(css, /\.stageViewport\s*\{[^}]*aspect-ratio:\s*16 \/ 9/iu);
    assert.doesNotMatch(css, /aspect-ratio:\s*16 \/ 8\.8/iu);
    assert.match(source, /aria-label="Signal episode length"/u);
    assert.match(source, /Auto · natural ending/u);
    assert.match(source, /durationMinutes: episodeDurationDraft/u);
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
    assert.match(
      source,
      /!stageAtmosphere\.imageUrl \? \([\s\S]{0,260}<SignalFallbackStudio[\s\S]{0,120}surface="stage"/u,
    );
    assert.match(
      source,
      /data-studio-source=\{[\s\S]{0,80}dashboardAtmosphere\.imageUrl \? "image" : "fallback"[\s\S]{0,20}\}/u,
    );
    assert.match(
      source,
      /dashboardAtmosphere\.imageUrl \? \([\s\S]{0,180}<div\s+className=\{styles\.showBrandAtmosphere\}[\s\S]{0,160}: \([\s\S]{0,180}<SignalFallbackStudio[\s\S]{0,100}surface="dashboard"/u,
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
    assert.match(css, /var\(--botcast-studio-accent\) 12%/u);
    assert.match(source, /data-accent-variant=\{accentVariant\}/u);
    assert.match(
      source,
      /accentVariant=\{args\.show\.fallbackStudioAccentVariant\}/u,
    );
    assert.match(
      source,
      /accentVariant=\{selectedShow\.fallbackStudioAccentVariant\}/u,
    );
    for (const asset of ["shelf-rhythm", "quiet-frame", "broadcast-circuit"]) {
      assert.match(
        css,
        new RegExp(`/signal-studio/accent-masks/${asset}\\.png`, "u"),
      );
    }
    assert.match(
      css,
      /-webkit-mask-image:\s*var\(--signal-studio-accent-mask\)/u,
    );
    assert.match(css, /mask-image:\s*var\(--signal-studio-accent-mask\)/u);
    assert.match(
      css,
      /-webkit-mask-position:\s*var\(--signal-studio-art-position\)/u,
    );
    assert.match(css, /mask-position:\s*var\(--signal-studio-art-position\)/u);
    assert.match(css, /\.showBrandAtmosphere\s*\{[^}]*opacity:\s*1/iu);
    assert.match(
      css,
      /data-studio-source="image"[^}]*background-image:\s*var\(--botcast-atmosphere\)/iu,
    );
    assert.doesNotMatch(source, /styles\.(?:chair|boomMic|studioDesk)/u);
    assert.doesNotMatch(css, /\.(?:chair|boomMic|studioDesk)\s*\{/u);
  });

  it("keeps all three fallback accent masks aligned, soft, and bounded", () => {
    const encodedMasks = [
      "shelf-rhythm",
      "quiet-frame",
      "broadcast-circuit",
    ].map((asset) =>
        readFileSync(
        new URL(
          `../../public/signal-studio/accent-masks/${asset}.png`,
          import.meta.url,
        ),
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
    assert.match(
      pageSource,
      /const signalResponseMode = responseModeForProvider\(signalProvider\)/u,
    );
    assert.match(
      pageSource,
      /modelOptionsForResponseMode\(modelCatalog, settings, signalResponseMode\)/u,
    );
    assert.match(pageSource, /provider: model\.provider/u);
    assert.match(pageSource, /modelOptions=\{signalModelOptions\}/u);
    assert.match(pageSource, /responseMode=\{signalEpisodeResponseMode\}/u);
    assert.match(pageSource, /accountDefaultModel=/u);
    assert.match(
      pageSource,
      /providerModeToggle=\{renderProviderModeToggle\("", true\)\}/u,
    );
    assert.match(source, /Global response mode/u);
    assert.match(source, /Ephemeral chat follows this unless overridden\./u);
    assert.doesNotMatch(source, />Episode mode</u);
    assert.match(source, /primary may recover through your fallback chain/u);
    assert.match(source, /disabled=\{responseMode === "auto"\}/u);
    assert.match(css, /\.episodeModelControl\s*\{/u);
    assert.match(css, /\.signalGlobalProviderControl\s*\{/u);
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
    assert.match(source, /const startSignalArtworkJob = async/u);
    assert.match(source, /kinds,\s*\.\.\.\(identityMs === null/u);
    assert.match(
      source,
      /startSignalArtworkJob\(reset\.show, \["night-studio", "day-studio"\]\)/u,
    );
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["logo"\]\)/u);
  });

  it("offers episode deletion only beside completed review-copy controls", () => {
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
    assert.match(source, /if \(item\.status !== "completed"\) return/u);
    assert.doesNotMatch(source, /Discard episode/u);
    assert.match(source, /Delete show/u);
    assert.match(source, /Saved studio and logo artwork stays in Images/u);
    assert.match(source, /deleteCancelButtonRef\.current\?\.focus\(\)/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(
      source,
      /className=\{styles\.episodeOutroActions\}[\s\S]{0,1200}copyEpisodeForReview\(episode\)[\s\S]{0,1200}openEpisodeDeletion\(episode/u,
    );
    const episodeCardStart = source.indexOf(
      "<article key={item.id} className={styles.episodeCard}>",
    );
    const episodeCardSource = source.slice(
      episodeCardStart,
      source.indexOf("</article>", episodeCardStart),
    );
    assert.doesNotMatch(episodeCardSource, /openEpisodeDeletion|Delete/u);
    assert.match(css, /\.deleteDialog\s*\{/u);
    assert.match(css, /\.deleteConfirmButton/u);
    assert.match(css, /\.episodeOpenButton/u);
    assert.doesNotMatch(css, /\.episodeDeleteButton/u);
  });

  it("opens a bounded ephemeral host chat from the dashboard avatar", () => {
    assert.match(source, /data-tutorial-target="botcast-host-chat"/u);
    assert.match(source, /className=\{styles\.showCardHostTrigger\}/u);
    assert.match(source, /aria-expanded=\{hostChatOpen\}/u);
    assert.match(source, /onClick=\{toggleSignalHostChat\}/u);
    assert.match(
      source,
      /`\/api\/botcast\/shows\/\$\{encodeURIComponent\(showId\)\}\/host-chat`/u,
    );
    assert.match(source, /SIGNAL_HOST_CHAT_RECOVERY_LIMIT = 3/u);
    assert.match(
      source,
      /messages: priorMessages,[\s\S]{0,100}preferredProvider: hostChatProvider/u,
    );
    assert.match(pageSource, /resolveEphemeralChatProvider\(\{/u);
    assert.match(
      pageSource,
      /settings\?\.ephemeralChatProviderPreferences\.botcast \?\? "global"/u,
    );
    assert.match(pageSource, /hostChatProvider=\{signalHostChatProvider\}/u);
    assert.match(source, /ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}/u);
    assert.match(source, /Off-air · ephemeral · grounded in this show/u);
    assert.match(source, /className=\{styles\.showHostChatFocus\}/u);
    assert.match(source, /className=\{styles\.showHostChatFocusBackdrop\}/u);
    assert.match(source, /className=\{styles\.showHostChatFocusStage\}/u);
    assert.match(source, /role="dialog"[\s\S]{0,80}aria-modal="true"/u);
    assert.match(source, /signalHostChatStreamChunks\(message\.content\)/u);
    assert.match(source, /await streamSignalHostChatResponse\(/u);
    assert.match(source, /data-streaming="true"/u);
    assert.match(
      source,
      /talking: Boolean\(hostChatStreamingMessage\?\.content\)/u,
    );
    assert.match(
      source,
      /thinking: hostChatBusy && !hostChatStreamingMessage/u,
    );
    assert.match(
      source,
      /showCardQuips &&[\s\S]{0,80}!hostChatOpen/u,
    );
    assert.match(css, /\.showHostChatConversation\s*\{/u);
    assert.match(css, /\.showHostChatBubble\s*\{/u);
    assert.match(css, /\.showHostChatComposer\s*\{/u);
    const hostComposerSections =
      source.match(
        /className=\{styles\.showHostChatComposer\}[\s\S]{0,3000}?<\/form>/gu,
      ) ?? [];
    assert.equal(hostComposerSections.length, 1);
    for (const composerSection of hostComposerSections) {
      assert.match(composerSection, /shouldSubmitComposerOnEnter/u);
      assert.match(composerSection, /enterKeyHint="send"/u);
    }
    assert.match(css, /\.showCardHostTrigger\s*\{[^}]*pointer-events: auto/u);
    assert.match(
      css,
      /\.showHostChatFocusBackdrop\s*\{[^}]*backdrop-filter:\s*blur\(12px\)/u,
    );
    assert.match(
      css,
      /\.showHostChatFocusStage\s*\{[^}]*grid-template-columns:/u,
    );
    assert.match(
      css,
      /prefers-reduced-motion[\s\S]*?\.showHostChatBubble/u,
    );
  });

  it("offers a global-default ephemeral chat lane in every mode setting", () => {
    for (const mode of ["chat", "zen", "coffee", "botcast", "slate"]) {
      assert.match(
        pageSource,
        new RegExp(`renderEphemeralChatProviderSetting\\("${mode}"\\)`, "u"),
      );
    }
    assert.match(pageSource, /<option value="global">Use global toggle<\/option>/u);
    assert.match(pageSource, /<option value="local">Always LOCAL<\/option>/u);
    assert.match(pageSource, /<option value="online">Prefer ONLINE<\/option>/u);
    assert.match(
      pageSource,
      /body: JSON\.stringify\(\{ ephemeralChatProviderPreferences \}\)/u,
    );
  });
});
