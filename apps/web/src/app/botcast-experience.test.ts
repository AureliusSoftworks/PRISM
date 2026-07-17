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
const artworkJobSource = readFileSync(
  new URL("./signalArtworkJob.ts", import.meta.url),
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
    assert.match(source, /liveCameraMode === "auto"[\s\S]{0,120}botcastCameraShotAt/u);
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(episode\.id\)\}\/camera`/u,
    );
    assert.match(source, /JSON\.stringify\(\{ mode, atMs: liveCameraElapsedMs \}\)/u);
    assert.match(source, /aria-pressed=\{liveCameraMode === camera\}/u);
    assert.match(source, /data-tutorial-target="botcast-live-camera"/u);
    assert.doesNotMatch(source, /replayCamera|setReplayCamera|manualShot/u);
    assert.doesNotMatch(source, /className=\{styles\.cameraButtons\}/u);
    assert.match(source, /replayTimeline\.messageStartMs\[index\]/u);
    assert.doesNotMatch(source, /index \* 4_500/u);
    assert.match(css, /\.liveCameraControls\s*\{[^}]*top:\s*-42px/iu);
    assert.match(css, /\.liveCameraControls button\[data-selected="true"\]/u);
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
    assert.match(css, /\.stagePlacement\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.stagePlacement\s*\{[^}]*transform:\s*translate\(-50%, -50%\)/u);
    assert.match(css, /\.nameplate\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.stageMug\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.stageMug\[data-returning="true"\][^}]*320ms/u);
    assert.match(
      css,
      /@keyframes signalStageMugInterruptedReturn\s*\{[\s\S]*?var\(--signal-cup-return-x[\s\S]*?var\(--signal-cup-rest-x\)/u,
    );
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
    assert.match(source, /powerRateMultiplier: resolveCupRateMultiplier\?\.\(bot\) \?\? 1/u);
    assert.match(pageSource, /<BotPowerBadge powers=\{bot\.powers\} passive \/>/u);
    assert.match(source, /data-sip-requested=\{hostSipping/u);
    assert.match(source, /data-sip-requested=\{guestSipping/u);
    assert.match(source, /hostCupTravel\.mode === "returning"/u);
    assert.match(source, /guestCupTravel\.mode === "returning"/u);
    assert.match(source, /signalCupTravelByRole\.host\.mode !== "returning"/u);
    assert.match(source, /\}, 500\);/u);
    assert.match(source, /seed: `signal:\$\{args\.currentEpisode\.id\}:\$\{bot\.id\}:\$\{role\}`/u);
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
    assert.doesNotMatch(
      source,
      /--signal-cup-mouth-[xy][^\n]*studioLayout\.(?:host|guest)Bot/u,
    );
    assert.match(
      css,
      /@keyframes signalStageMugSip\s*\{[\s\S]*?var\(--signal-cup-rest-x\)[\s\S]*?var\(--signal-cup-mouth-x[\s\S]*?var\(--signal-cup-rest-x\)/u,
    );
    assert.match(pageSource, /const cupVisual = mugState\.visual/u);
    assert.match(pageSource, /data-cup-sipping=\{[\s\S]{0,80}cupVisual\.sipping/u);
    assert.match(pageSource, /resolveCoffeeSeatSipFacePresentation\(\{/u);
    assert.match(pageSource, /cupSipping: avatarState\.sipping/u);
    assert.match(pageSource, /plateFace=\{sipPresentation\.glyph \?\? undefined\}/u);
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

  it("adds an off-canvas spotlight and drives the shared Zen bot refraction", () => {
    assert.match(source, /function SignalStudioSpotlight\(\)/u);
    assert.match(source, /className=\{styles\.studioSpotlight\}/u);
    assert.match(source, /data-prism-decorative-motion="true"/u);
    assert.equal(source.match(/<SignalStudioSpotlight \/>/gu)?.length, 2);
    assert.doesNotMatch(source, /studioLight(?:Cable|Fixture|Bulb)/u);
    assert.match(css, /\.studioSpotlight\s*\{[^}]*top:\s*-56%[^}]*signalStudioSpotlightSweep 7\.2s/iu);
    assert.match(css, /\.studioSpotlightBeam\s*\{[^}]*mix-blend-mode:\s*screen/iu);
    assert.match(css, /\.shell\[data-theme="light"\] \.studioSpotlightBeam\s*\{[^}]*mix-blend-mode:\s*soft-light/iu);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.studioSpotlight\s*\{[^}]*animation:\s*none/iu);
    assert.match(pageSource, /data-signal-role=\{avatarState\.role\}/u);
    assert.match(
      pageSource,
      /data-signal-bot-presence="true"[\s\S]*?<BotAmbientPresenceRig[\s\S]*?isTalking=\{avatarState\.talking\}/u,
    );
    assert.match(pageCss, /\.signalBotPresencePlate\s*\{[^}]*--bot-face-metal-light-rotation:\s*var\(--signal-bot-metal-light-rotation\)/iu);
    assert.match(pageCss, /\.signalBotPresencePlate\s*\{[^}]*--bot-face-screen-glare-x:\s*var\(--signal-bot-screen-glare-x\)/iu);
    assert.match(pageCss, /\.signalBotPresencePlate\s*\{[^}]*signalBotZenSpotlightRefraction 7\.2s/iu);
    assert.match(pageCss, /@keyframes signalBotZenSpotlightRefraction/iu);
    assert.doesNotMatch(pageCss, /signalBotStudio(?:Metal|Paint|Glare)/iu);
    assert.doesNotMatch(pageCss, /\.signalBotPresencePlate \.botFaceFrameMetalLightRaster::before\s*\{/iu);
    assert.match(pageCss, /prefers-reduced-motion[\s\S]*?\.signalBotPresencePlate\s*\{[^}]*animation:\s*none/iu);
  });

  it("lets producers align show-scoped bots and cups against the studio", () => {
    assert.match(source, /"Align stage"/u);
    assert.match(source, /data-tutorial-target="botcast-stage-layout"/u);
    assert.match(source, /data-signal-layout-stage="true"/u);
    assert.match(source, /SIGNAL_STUDIO_LAYOUT_LABELS/u);
    assert.match(source, /hostBot:\s*"host bot"/u);
    assert.match(source, /guestCup:\s*"guest cup"/u);
    assert.match(source, /setPointerCapture\(event\.pointerId\)/u);
    assert.match(source, /onPointerMove=\{moveStudioLayoutDrag\}/u);
    assert.match(source, /ArrowLeft:[\s\S]{0,120}ArrowDown:/u);
    assert.match(source, /JSON\.stringify\(\{ studioLayout: layout \}\)/u);
    assert.match(source, /normalizeBotcastStudioLayout\(args\.show\.studioLayout\)/u);
    assert.match(source, /studioLayout\.hostBot\.x/u);
    assert.match(source, /studioLayout\.guestCup\.y/u);
    assert.match(css, /\.stageLayoutHandle\s*\{[^}]*cursor:\s*grab/u);
    assert.match(css, /\.stagePlacement\s*\{[^}]*width:\s*25%/u);
    assert.match(css, /\.stageMug\s*\{[^}]*width:\s*max\(6\.2%, 58px\)/u);
    assert.match(css, /\.stageLayoutHandle\[data-kind="bot"\][^}]*width:\s*25%/u);
    assert.match(css, /\.stageLayoutHandle\[data-kind="cup"\][^}]*max\(6\.2%, 58px\)/u);
    assert.match(pageCss, /\.signalBotPresencePlate\s*\{[^}]*--zen-live-bot-avatar-size:\s*clamp\(154px, 16vw, 240px\)/iu);
  });

  it("lets the live studio take over the show-management space", () => {
    assert.match(
      source,
      /\{!episode \? \(\s*<header className=\{styles\.header\}>/u,
    );
    assert.match(
      source,
      /\{notice && !episode \? <div className=\{styles\.notice\}/u,
    );
    assert.match(css, /\.liveLayout\s*\{[^}]*padding:\s*12px 18px/u);
    assert.match(css, /\.liveTopline\s*\{[^}]*max-width:\s*1320px/u);
    assert.match(css, /\.liveLayout \.stageViewport\s*\{[^}]*max-width:\s*1320px/u);
    assert.match(css, /\.liveLayout \.controlRoom\s*\{[^}]*max-width:\s*1320px/u);
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
      /\.shell\[data-live-episode="true"\] \.controlRoom\s*\{[^}]*height:\s*clamp\(210px, 24dvh, 260px\)/iu,
    );
  });

  it("opens episodes through a skippable show-branded pre-roll inside Signal's viewing pane", () => {
    assert.match(source, /playSignalIntroAudio\(\{/u);
    assert.match(source, /startDelayMs: SIGNAL_EPISODE_INTRO_LEAD_IN_MS/u);
    assert.match(source, /data-phase=\{episodePreRoll\.phase\}/u);
    assert.match(source, /Signal Synth · generated locally/u);
    assert.match(source, />Skip intro</u);
    assert.match(source, /<p>With \{episodePreRoll\.guestName\}<\/p>/u);
    assert.doesNotMatch(source, /Tonight’s guest/u);
    assert.match(source, /const guest = eligibleBots\.find\(\(bot\) => bot\.id === guestDraftId\)/u);
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(response\.episode\.id\)\}\/advance`/u,
    );
    assert.match(source, /prepareGuestResponse\(opening\.episode, opening\.message\)/u);
    assert.match(source, /SIGNAL_OPENING_ADVANCE_ATTEMPTS/u);
    assert.match(source, /if \(opening\.message \|\| opening\.episode\.status === "completed"\) break/u);
    assert.match(source, /Signal could not get the opening line on mic/u);
    assert.match(source, /if \(unstartedEpisodeId && !openingMessageReceived\)/u);
    assert.match(source, /method: "DELETE"/u);
    assert.match(source, /openingMessageReceived = true;[\s\S]{0,120}setTopicDraft\(""\)/u);
    assert.match(source, /SIGNAL_VOICE_START_TIMEOUT_MS = 30_000/u);
    assert.match(source, /voicePreparationTimer = window\.setTimeout/u);
    assert.match(source, /onStopUtterance\?\.\(\);[\s\S]{0,80}settle\(false\)/u);
    assert.match(source, /await Promise\.all\(\[introPlayback\.finished, visualMinimum\]\)/u);
    assert.match(source, /data-tutorial-target="botcast-intro-audio"/u);
    assert.match(source, /toggleShowIntroPreview/u);
    assert.match(source, /aria-pressed=\{introPreviewShowId === selectedShow\.id\}/u);
    assert.match(source, /▶ Play intro/u);
    assert.match(source, /■ Stop preview/u);
    assert.match(source, /stopIntroPreview\(\);\s*onPrepareUtterance/u);
    assert.match(source, /Create with ElevenLabs/u);
    assert.match(source, /Use Signal Synth/u);
    assert.match(source, /<span>Opening ident<\/span>/u);
    assert.match(source, /!showHasCustomArtwork\(selectedShow\) \? \(/u);
    assert.match(pageSource, /personaTemperament: signalPersonaTemperamentFor\(bot\.system_prompt\)/u);
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
    assert.match(css, /\.shell\[data-theme="light"\] \.episodePreRoll > button/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollSignalField i/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollLockup h1/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.preRollMeters i/u);
    assert.match(css, /@keyframes signalPreRollRing/u);
    assert.match(css, /\.showIntroPreviewButton\[data-active="true"\]/u);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(pageSource, /introAudioEnabled=/u);
    assert.match(pageSource, /introAudioVolume=\{settings\?\.voiceVolume \?\? 1\}/u);
  });

  it("lands natural endings and producer cuts on a compact local outro", () => {
    assert.match(source, /playSignalOutroAudio\(\{/u);
    assert.match(source, /data-kind="outro"/u);
    assert.match(source, /Signal transmission cut/u);
    assert.match(source, /Signal transmission complete/u);
    assert.match(source, />Skip outro</u);
    assert.match(source, /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(episodeId\)\}\/end`/u);
    assert.match(source, /invalidateEpisodeOperation\(\);[\s\S]{0,180}setCuttingShow\(true\)/u);
    assert.match(source, /disabled=\{episode\.status === "completed" \|\| cuttingShow\}/u);
    assert.match(source, /■ Cut show/u);
    assert.match(css, /\.episodeOutro \.preRollLogo\s*\{[^}]*width:\s*118px/u);
    assert.match(css, /\.liveTopline \.cutShowButton/u);
    assert.match(css, /\.shell\[data-theme="light"\] \.liveTopline \.cutShowButton/u);
    assert.match(
      source,
      /episode\?\.status === "live"[\s\S]{0,180}await cutShow\(\{ waitForOutro: true \}\)/u,
    );
    assert.match(source, /Cut the live show and open \$\{show\.name\}/u);
  });

  it("randomizes only the editable Signal booking fields locally", () => {
    assert.match(source, /randomSignalEpisodeBooking\(\{/u);
    assert.match(source, /candidateGuestIds: guestOptions\.map\(\(bot\) => bot\.id\)/u);
    assert.match(source, /setGuestDraftId\(booking\.guestId\)/u);
    assert.match(source, /setTopicDraft\(booking\.topic\)/u);
    assert.match(source, /setProducerBriefDraft\(booking\.producerBrief\)/u);
    assert.match(source, /↻ Randomize booking/u);
    assert.match(source, /Everything remains editable/u);
    const randomizerSource = source.slice(
      source.indexOf("const randomizeBooking"),
      source.indexOf("return (", source.indexOf("const randomizeBooking")),
    );
    assert.doesNotMatch(
      randomizerSource,
      /setEpisodeModelDraft|setEpisodeDurationDraft|request</u,
    );
    assert.match(css, /\.randomizeBookingButton/u);
  });

  it("keeps Signal coffee cosmetic and scopes producer direction", () => {
    assert.doesNotMatch(source, /top.?off|refill|depletion/iu);
    assert.match(source, /Producer cue cards/u);
    assert.match(source, /Wrap it up/u);
    assert.match(source, /Episode cues such as Wrap it up guide both bots/u);
    assert.match(source, /never spoken or attributed to you/u);
    assert.match(source, /queuedProducerCueRef/u);
    assert.match(source, /Queued: \{signalProducerCueLabel\(queuedProducerCue\)\}/u);
    assert.match(source, /The host will use it on their next turn/u);
    assert.doesNotMatch(source, /disabled=\{busy \|\| !producerCueReady/u);
    assert.match(css, /\.producerControls button\[data-queued="true"\]/u);
  });

  it("keeps live turns, transcript reveal, and stage presence on the real voice clock", () => {
    assert.doesNotMatch(source, /speakingTimerRef|9_000|split\(\/\\s\+\/u\)\.length \* 280/u);
    assert.match(source, /Promise\.resolve\(onUtterance\(message, bot, lifecycle\)\)/u);
    assert.match(source, /onStart: \(durationMs, alignment\)/u);
    assert.match(source, /onProgress: \(elapsedMs, durationMs\)/u);
    assert.match(source, /botcastSpeechRevealVisibleText\(liveSpeech\.reveal\)/u);
    assert.match(source, /const SIGNAL_NATURAL_HANDOFF_MS = 240/u);
    assert.match(source, /episode\.messages\.length \? SIGNAL_NATURAL_HANDOFF_MS : 0/u);
    assert.match(source, /const prepareGuestResponse = useCallback/u);
    assert.match(source, /hostMessage\.speakerRole !== "host"/u);
    assert.match(source, /prepared \? await prepared\.result : null/u);
    assert.match(source, /episodeOperationAbortRef\.current\?\.abort\(\)/u);
    assert.match(source, /signal: controller\.signal/u);
    assert.match(source, /episodeOperationIsCurrent\(controller, runId\)/u);
    assert.match(
      source,
      /if \(!busy && speakingMessageId === null && nextRole === "host"\) \{[\s\S]{0,100}onPrepareUtterance\?\.\(\);[\s\S]{0,80}advanceEpisode\(cue\)/u,
    );
    assert.match(source, /const played = await onUtterance\(replayActiveMessage, bot,/u);
    assert.match(source, /replayVoicePending/u);
    assert.match(source, /replayVoiceRunIdRef\.current !== runId/u);
    assert.doesNotMatch(source, /onUtterance\(replayActiveMessage, bot, \{\}\)/u);
    assert.match(pageSource, /includeAlignment: true/u);
    assert.match(pageSource, /readEnglishVoiceSynthesisClip\(response\)/u);
    assert.match(pageSource, /lifecycle: trackedLifecycle/u);
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
      /coffeePlateFaceScaleYFromSeatHorizontalSide\(\s*avatarState\.role === "host" \? -1 : 1/u,
    );
    assert.match(pageSource, /botAvatarDetailsFacingScaleX\(faceScaleY\)/u);
    assert.match(
      pageSource,
      /<ZenLiveBotMannequin[\s\S]{0,420}isTalking=\{avatarState\.talking\}[\s\S]{0,180}blinkWhileTalking\s+mouthShape=\{avatarState\.mouthShape\}/u,
    );
    assert.match(
      css,
      /\.avatarRig\[data-talking="true"\]\s*\{[^}]*animation:\s*none;[^}]*transform:\s*rotate\(var\(--signal-avatar-lean\)\)/iu,
    );
    assert.doesNotMatch(css, /@keyframes signalBotTalking/iu);
    assert.match(css, /@keyframes signalBotIdle/u);
    assert.match(css, /@keyframes signalBotThinking/u);
    assert.match(css, /\.wordmark \.showLogo\s*\{[^}]*width:\s*68px/iu);
    assert.match(css, /\.stageViewport\[data-shot="right"\] \.stageScene\s*\{[^}]*scale\(1\.42\)/u);
    assert.match(css, /\.wordmark::before\s*\{[^}]*radial-gradient/iu);
    assert.match(css, /\.wordmark strong\s*\{[^}]*color:\s*#f8fbff/iu);
    assert.match(css, /\.wordmark strong\s*\{[^}]*text-shadow:[^;}]*rgba\(0,0,0,\.98\)/iu);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.avatarRig\s*\{[^}]*animation:\s*none/iu);
  });

  it("offers one complete first-look synthesis after creation while keeping PRISM fallbacks immediate", () => {
    const createShowSource = source.slice(
      source.indexOf("const createShow"),
      source.indexOf("const renameShow"),
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
    assert.match(
      source,
      /kinds: \["night-studio", "day-studio", "logo"\]/u,
    );
    assert.match(source, /aria-label="Optional custom show artwork"/u);
    assert.match(source, /data-tutorial-target="botcast-brand-controls"/u);
    assert.match(css, /\.showLookInvitation button\s*\{[^}]*linear-gradient/iu);
    assert.match(source, /className=\{styles\.showIdentityGearButton\}/u);
    assert.match(source, /aria-expanded=\{showIdentityControlsExpanded\}/u);
    assert.match(source, /aria-controls=\{`signal-show-identity-controls-\$\{selectedShow\.id\}`\}/u);
    assert.match(source, /hidden=\{!showIdentityControlsExpanded\}/u);
    assert.match(source, /setShowIdentityControlsShowId\(null\)/u);
    assert.match(css, /\.showIdentityGearButton\s*\{[^}]*right:\s*18px;[^}]*bottom:\s*18px/iu);
    assert.match(source, /regenerateLogo: true/u);
    assert.match(source, /aria-label="Edit show name"/u);
    assert.match(source, />\s*Save name\s*</u);
    assert.match(source, />\s*Regenerate name\s*</u);
    assert.match(source, />\s*Refresh studio\s*</u);
    assert.match(source, />\s*Refresh logo\s*</u);
    assert.match(source, /body: JSON\.stringify\(\{ regenerateAtmosphere: true \}\)/u);
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["night-studio", "day-studio"\]\)/u);
    assert.match(source, /regenerateStudio\(\)/u);
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["logo"\]\)/u);
    assert.doesNotMatch(source, /const generateShowArtwork/u);
    assert.doesNotMatch(source, />\s*Refresh Light\s*</u);
    assert.doesNotMatch(source, />\s*Refresh Dark\s*</u);
    assert.match(source, /function SignalShowLogo/u);
    assert.match(source, /show\.logo\.fallbackGlyph/u);
    assert.match(source, /data-theme=\{theme\}/u);
    assert.match(css, /--prism-p:\s*#ff4d6d/iu);
    assert.match(css, /--prism-s:\s*#2fd3e3/iu);
    assert.match(css, /\.shell\[data-theme="light"\]/u);
    assert.match(source, /function SignalFallbackStudio/u);
  });

  it("blocks only for identity handoff, then exposes honest persistent background progress", () => {
    const studioRefreshSource = source.slice(
      source.indexOf("const regenerateStudio"),
      source.indexOf("const regenerateLogo"),
    );
    const logoRefreshSource = source.slice(
      source.indexOf("const regenerateLogo"),
      source.indexOf("const generateShowIntroAudio"),
    );
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
    assert.match(artworkJobSource, /Relighting the completed Dark studio/u);
    assert.match(artworkJobSource, /job\.totalCount === 1/u);
    assert.match(artworkActivitySource, /\/cancel/u);
    assert.match(artworkActivityCss, /signal-artwork-scan/u);
    assert.doesNotMatch(studioRefreshSource, /setBlockingOperation/u);
    assert.doesNotMatch(logoRefreshSource, /setBlockingOperation/u);
    assert.match(studioRefreshSource, /rendering in the background\. You can keep using PRISM/u);
    assert.match(logoRefreshSource, /rendering in the background\. You can keep using PRISM/u);
  });

  it("refreshes a clever show name without refreshing its visual identity", () => {
    assert.match(source, /aria-label="Edit show name"/u);
    assert.match(source, /onBlur=\{\(event\) => void renameShow\(event\.currentTarget\.value\)\}/u);
    assert.match(source, />\s*Save name\s*</u);
    assert.match(source, />\s*Regenerate name\s*</u);
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
    assert.match(css, /\.showBrandPreview\s*\{[^}]*min-height:\s*360px/iu);
    assert.match(css, /\.showBrandContent\s*\{[^}]*min-height:\s*360px/iu);
    assert.match(css, /\.showBrandPreview, \.showBrandContent\s*\{\s*min-height:\s*340px/iu);
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

  it("brings the show card to life with an episode-aware audience pulse", () => {
    assert.match(
      source,
      /signalAudienceSnapshot\(\{\s*showId:\s*selectedShow\.id,\s*episodes\s*\}\)/u,
    );
    assert.match(source, /data-tutorial-target="botcast-audience-pulse"/u);
    assert.match(source, />Audience pulse</u);
    assert.match(source, /<small>Views<\/small>/u);
    assert.match(source, /<small>Rating<\/small>/u);
    assert.match(source, /<small>Reviews<\/small>/u);
    assert.match(source, /out of 5/u);
    assert.match(source, /Release an episode to start building an audience\./u);
    assert.match(source, /<blockquote className=\{styles\.showAudienceQuote\}>/u);
    assert.match(css, /\.showAudienceMetrics\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/iu);
    assert.match(
      css,
      /\.showBrandPreview\[data-identity-settings-open="true"\] \.showAudiencePulse\s*\{[^}]*display:\s*none/iu,
    );
    assert.match(css, /\.shell\[data-theme="light"\] \.showAudiencePulse\s*\{/u);
    assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.showAudienceQuote\s*\{[^}]*flex-direction:\s*column/iu);
  });

  it("floats the host on the show card and periodically reveals fallback quips", () => {
    assert.match(source, /fallbackSignalShowCardQuips\(selectedShow\)/u);
    assert.match(source, /className=\{styles\.showCardHostPresence\}/u);
    assert.match(
      source,
      /renderAvatar\?\.\(hostBot,[\s\S]{0,180}role:\s*"host"[\s\S]{0,80}mouthShape:\s*"closed"/u,
    );
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS/u);
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS/u);
    assert.match(source, /SIGNAL_SHOW_CARD_QUIP_GAP_MS/u);
    assert.match(source, /aria-live="polite"/u);
    assert.match(source, /const hostShowAccent = selectedShow[\s\S]{0,140}normalizeAccentForTheme/u);
    assert.match(source, /"--botcast-host-accent": hostShowAccent/u);
    assert.match(
      source,
      /"--show-accent" as string\]: normalizeAccentForTheme\([\s\S]{0,100}host\?\.color \?\? show\.accentColor/u,
    );
    assert.match(css, /\.showRow::before\s*\{[^}]*background:\s*var\(--show-accent\)/iu);
    assert.match(css, /\.showCardHostPresence\s*\{[^}]*bottom:\s*0;/iu);
    assert.match(css, /\.showCardHostFloat\s*\{[^}]*signalShowCardHostFloat/iu);
    assert.match(css, /\.showCardHostFloat > \*\s*\{[^}]*transform:\s*scale\(1\.5\)/iu);
    assert.match(css, /\.showCardQuipBubble\s*\{/u);
    assert.match(
      css,
      /\.showCardQuipBubble::before\s*\{[^}]*linear-gradient\([^}]*var\(--prism-p\)[^}]*var\(--prism-s\)[^}]*var\(--botcast-host-accent\)/iu,
    );
    assert.match(css, /\.productionDesk\s*\{[^}]*var\(--botcast-host-accent\)/iu);
    assert.match(css, /\.episodeNumber\s*\{[^}]*var\(--botcast-host-accent\)/iu);
    assert.match(
      css,
      /prefers-reduced-motion[\s\S]*?\.showCardHostFloat, \.showCardQuipBubble\s*\{[^}]*animation:\s*none/iu,
    );
  });

  it("keeps a widescreen TV frame and centers close-ups within its edges", () => {
    assert.match(source, /botcastCameraOffsetXPercent\([\s\S]{0,100}args\.shot,[\s\S]{0,100}studioLayout/u);
    assert.match(source, /botcastCameraOffsetYPercent\([\s\S]{0,100}args\.shot,[\s\S]{0,100}studioLayout/u);
    assert.match(css, /translate\(var\(--botcast-camera-offset-x, 0%\), var\(--botcast-camera-offset-y, 0%\)\) scale\(1\.42\)/u);
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
    assert.match(source, /const startSignalArtworkJob = async/u);
    assert.match(source, /kinds,\s*\.\.\.\(identityMs === null/u);
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["night-studio", "day-studio"\]\)/u);
    assert.match(source, /startSignalArtworkJob\(reset\.show, \["logo"\]\)/u);
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
