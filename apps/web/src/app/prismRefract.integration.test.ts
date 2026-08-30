import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const refractSource = readFileSync(
  new URL("./prismRefract.ts", import.meta.url),
  "utf8",
);
const universalInputSource = readFileSync(
  new URL("./prismUniversalInputRefract.ts", import.meta.url),
  "utf8",
);
const botPowerRefractSource = readFileSync(
  new URL("./botPowerRefract.ts", import.meta.url),
  "utf8",
);
const companionStyles = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const debateStyles = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Prism Refract integration", () => {
  it("reserves the Prism shortcut for the assistant menu and keeps contextual inputs Wieldable", () => {
    assert.match(
      companionSource,
      /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)[\s\S]*activeRefract\?\.phase === "generating"[\s\S]*Click its rainbow sheen to cancel[\s\S]*if \(activeRefract\) releasePrismRefract\(true\)[\s\S]*activatePrismConversation\(\)[\s\S]*const refracting = refractSessionRef\.current/u,
    );
    assert.doesNotMatch(companionSource, /focusedPrismRefractTargetId/u);
    assert.match(companionSource, /installPrismUniversalInputTargets/u);
    assert.match(universalInputSource, /PROSE_INPUT_TYPES/u);
    assert.match(universalInputSource, /BOUNDED_INPUT_TYPES/u);
    assert.match(universalInputSource, /HTMLSelectElement/u);
    assert.match(universalInputSource, /root\.type === "radio"/u);
    assert.match(universalInputSource, /root\.type === "checkbox"/u);
    assert.match(universalInputSource, /textarea/u);
    assert.match(universalInputSource, /contenteditable/u);
    assert.match(universalInputSource, /registerPrismRefractTarget/u);
    assert.match(universalInputSource, /registerPrismRefractDomTargetResolver/u);
    assert.doesNotMatch(universalInputSource, /aria-keyshortcuts/u);
    assert.match(universalInputSource, /record\.removedNodes/u);
    assert.match(universalInputSource, /PRIVATE_INPUT_PATTERN/u);
    assert.match(universalInputSource, /DESTRUCTIVE_INPUT_PATTERN/u);
    assert.match(universalInputSource, /data-live-session-locked/u);
    assert.match(universalInputSource, /data-replay-active/u);
    assert.match(
      signalSource,
      /id: "signal-create-host"[\s\S]*kind: "choice"/u,
    );
    assert.match(
      signalSource,
      /signal-episode-guest-[\s\S]*signal-episode-topic-[\s\S]*signal-producer-brief-[\s\S]*signal-episode-length-/u,
    );
    assert.match(
      signalSource,
      /signal-show-identity-name-[\s\S]*signal-show-identity-premise-/u,
    );
    assert.match(
      signalSource,
      /signal-show-header-name-[\s\S]*disabled: \(\) => busy \|\| Boolean\(replayEpisode\)/u,
    );
    assert.match(
      pageSource,
      /if \(view === "botcast"\)[\s\S]*<BotcastExperience[\s\S]*\{renderGlobalPrismCompanion\(\)\}/u,
    );
  });

  it("keeps Avatar Studio Power prose reachable by Wield above panel chrome", () => {
    assert.match(
      pageSource,
      /<span>What makes this bot special\?<\/span>[\s\S]*<textarea[\s\S]*id=\{powerPromptRefractTargetId\}[\s\S]*data-prism-refract-target-kind="bot-power"[\s\S]*data-prism-refract-context=\{powerRefractContext\}/u,
    );
    assert.match(companionSource, /buildBotPowerRefractRequestTarget\(\{/u);
    assert.match(pageSource, /botId=\{editingBotId\}/u);
    assert.match(pageSource, /profileContext=\{/u);
    assert.match(
      botPowerRefractSource,
      /Focused Avatar Studio bot draft identity:[\s\S]*Focused bot draft owner:[\s\S]*Current Power context:[\s\S]*Current draft personality and profile:/u,
    );
    assert.match(
      companionSource,
      /prismRefractResultOwnershipIsCurrent\([\s\S]*expectedTargetId: target\.id[\s\S]*currentTargetId: current\?\.target\.id/u,
    );
    assert.match(
      companionSource,
      /element\.id === "bot-generator-prompt"/u,
    );
    assert.match(
      companionSource,
      /buildBotGeneratorRefractRequestTarget\(\{/u,
    );
    assert.match(
      companionSource,
      /buildBotGeneratorBriefRefractContext\(\{/u,
    );
    assert.match(companionSource, /brief: currentValue/u);
    assert.match(
      pageSource,
      /submerged=\{companionSubmergedByMainPanel\}/u,
    );
    assert.match(
      companionStyles,
      /--prism-companion-wielding-z-index:\s*2147483200/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-refracting\][\s\S]*z-index:\s*var\(--prism-companion-wielding-z-index\)/u,
    );
    assert.match(universalInputSource, /"textarea"/u);
  });

  it("keeps universal prose targets available inside Bot Foundry", () => {
    assert.match(
      pageSource,
      /\{botGeneratorBusy \? \(\s*<PrismCompanionPresenceBoundary reason="bot-creation" \/>\s*\) : null\}/u,
    );
    assert.match(
      pageSource,
      /botAvatarCustomizerOpen \|\| botGeneratorOpen/u,
    );
    assert.doesNotMatch(
      universalInputSource,
      /data-prism-system-pause-exempt/u,
    );
    assert.match(
      universalInputSource,
      /data-prism-companion-anchor[\s\S]*data-prism-blocking-loader[\s\S]*data-prism-model-warmup/u,
    );
    assert.match(
      universalInputSource,
      /semanticId[\s\S]*encodeURIComponent\(semanticId\)/u,
    );
  });

  it("keeps Prism available for Debate setup and contextually refracts registered drafts", () => {
    assert.match(
      pageSource,
      /if \(view === "debate"\)[\s\S]*debateDraft: debateCompanionContext\.draft/u,
    );
    assert.match(
      pageSource,
      /onCompanionContextChange=\{setDebateCompanionContext\}[\s\S]*reason="debate-context-loading"[\s\S]*\{renderGlobalPrismCompanion\(\)\}/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-topic"[\s\S]*"debate\.setup\.topic"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-motion"[\s\S]*"debate\.setup\.motion"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-exhibit-seed"[\s\S]*"debate\.setup\.exhibitPair"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-exhibit-adjective"[\s\S]*"debate\.setup\.exhibitObservation"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-player-notes"[\s\S]*"debate\.setup\.playerNotes"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-research-query"[\s\S]*"debate\.setup\.researchQuery"/u,
    );
    assert.match(
      debateSource,
      /id: "debate-setup-scholar-query"[\s\S]*"debate\.setup\.scholarQuery"/u,
    );
    assert.match(
      debateSource,
      /const seed = evidenceObjectSeed\.trim\(\)[\s\S]*"debate\.setup\.exhibitDraft"[\s\S]*debateEvidenceObjectDraftFromPrismCandidate/u,
    );
    assert.doesNotMatch(debateSource, /debate:refract-evidence-object/u);
    assert.doesNotMatch(debateSource, /Add generated search/u);
    assert.match(
      debateSource,
      /run: \(direction\) => synthesize\(direction\)/u,
    );
    assert.match(
      debateSource,
      /id: DEBATE_STUDIO_NAV_MOTION_REFRACT_ID[\s\S]*refractMotionSection/u,
    );
    assert.match(
      debateSource,
      /id: DEBATE_STUDIO_NAV_CAST_REFRACT_ID[\s\S]*refractCastSection/u,
    );
    assert.match(
      debateSource,
      /id: DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID[\s\S]*refractEvidenceSection/u,
    );
    assert.match(
      debateSource,
      /id: DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID[\s\S]*refractArchiveSection/u,
    );
    assert.match(
      debateSource,
      /id: DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID[\s\S]*refreshStageLayoutFromPrism/u,
    );
    assert.match(
      tutorialSource,
      /floating Prism remains available throughout setup[\s\S]*Wield Prism into a glowing setup field/u,
    );
  });

  it("scopes captured-field keys without blocking other inputs", () => {
    assert.match(
      companionSource,
      /event\.key === " "[\s\S]*phase === "ready"[\s\S]*rerollPrismRefract\(\)[\s\S]*Prism is still refracting/u,
    );
    assert.match(
      companionSource,
      /event\.key === "Enter" \|\| event\.key === "Tab"[\s\S]*acceptPrismRefract/u,
    );
    assert.match(
      companionSource,
      /eventTargetsCapturedField[\s\S]*event\.key === "Escape"[\s\S]*phase === "generating"[\s\S]*Click the rainbow sheen to cancel[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /phase === "prompting"[\s\S]*document\.activeElement === refractPromptRef\.current[\s\S]*return/u,
    );
    assert.match(
      companionSource,
      /const preventCapturedFieldInput[\s\S]*event\.preventDefault\(\)[\s\S]*"beforeinput"/u,
    );
    assert.match(
      companionSource,
      /session\.phase === "generating"[\s\S]*click, focus, and type elsewhere[\s\S]*return;[\s\S]*nextEditableControl[\s\S]*session\.phase === "ready"[\s\S]*acceptPrismRefract\(\)/u,
    );
    assert.match(
      companionSource,
      /eventTargetsCapturedField &&[\s\S]*event\.key === "Enter" \|\| event\.key === "Tab"[\s\S]*if \(event\.key === "Tab"\) return/u,
    );
  });

  it("keeps an engaged magic prompt present and overlapping its captured control", () => {
    assert.match(
      companionSource,
      /isIdlePresenceBlocked[\s\S]*refractSessionRef\.current !== null/u,
    );
    assert.doesNotMatch(
      companionSource,
      /invocation === "wield-click"[\s\S]*resetPrismWield\(true\)/u,
    );
    assert.match(
      companionSource,
      /refractPromptRef\.current\?\.form\?\.contains\(eventTarget\)[\s\S]*return/u,
    );
    assert.match(
      companionStyles,
      /data-refracting="prompting"\]\[data-vertical="above"\][\s\S]*bottom: 34px/u,
    );
    assert.match(
      companionStyles,
      /data-refracting="prompting"\]\[data-vertical="below"\][\s\S]*top: 34px/u,
    );
    assert.match(
      companionStyles,
      /data-refracting="prompting"\]\[data-dock="right"\][\s\S]*--prism-refract-target-half-width/u,
    );
  });

  it("rejects stale work and restores cursor/orb state on every release path", () => {
    assert.match(
      companionSource,
      /const requestOwnershipIsCurrent[\s\S]*prismRefractResultOwnershipIsCurrent/u,
    );
    assert.match(
      refractSource,
      /requestRunId === input\.currentRunId[\s\S]*expectedTargetId === input\.currentTargetId[\s\S]*expectedElement === input\.currentElement/u,
    );
    assert.match(companionSource, /refractAbortRef\.current\?\.abort\(\)/u);
    assert.match(
      companionSource,
      /removeAttribute\(PRISM_REFRACT_CURSOR_ATTRIBUTE\)/u,
    );
    assert.doesNotMatch(companionSource, /PRISM_REFRACT_TRAVEL_MS/u);
    assert.doesNotMatch(companionSource, /moveToTarget|phase: "traveling"/u);
    assert.equal(companionSource.includes("const promptsBeforeGeneration ="), true);
    assert.equal(companionSource.includes("Boolean(target.steering)"), true);
    assert.equal(
      companionSource.includes(
        'phase: promptsBeforeGeneration ? "prompting" : "generating"',
      ),
      true,
    );
    assert.match(
      companionSource,
      /className=\{styles\.refractGlyph\}[\s\S]*M16 5\.2 27 25H5Z/u,
    );
    assert.doesNotMatch(companionSource, /"orb-drop"/u);
    assert.match(
      companionSource,
      /const session = refractSessionRef\.current;[\s\S]*refractRunRef\.current \+= 1;[\s\S]*anchorRef\.current\?\.removeAttribute\("data-refracting"\)[\s\S]*updateRefractSession\(null\)/u,
    );
    assert.match(
      companionStyles,
      /\.avatar \{[\s\S]*opacity: 1;[\s\S]*transform: none;[\s\S]*transition:[\s\S]*opacity 180ms ease/u,
    );
  });

  it("wields Prism only into registered eligible controls and preserves native clicks elsewhere", () => {
    assert.match(
      companionSource,
      /current\.phase !== "following"[\s\S]*event\.pointerType === "touch"[\s\S]*event\.button !== 0/u,
    );
    assert.match(
      companionSource,
      /prismRefractTargetIdAtPoint\([\s\S]*!targetId \|\| !registration \|\| registration\.target\.disabled\?\.\(\)[\s\S]*return/u,
    );
    assert.match(
      companionSource,
      /requestPrismRefract\(targetId, "wield-click"\)[\s\S]*if \(!started\)[\s\S]*return[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/u,
    );
    assert.doesNotMatch(refractSource, /shift-click|shiftKey|onClickCapture/u);
  });

  it("cancels from the active sheen and queues each distinct unsettled input once", () => {
    assert.match(
      refractSource,
      /active sheen is the one deliberate in-page cancellation affordance/u,
    );
    assert.doesNotMatch(
      companionSource,
      /decision === "reroll"[\s\S]*rerollPrismRefract\(\)/u,
    );
    assert.match(
      companionSource,
      /decision === "cancel"[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /decision === "accept" \|\| decision === "accept-and-begin"[\s\S]*acceptPrismRefract\(\)/u,
    );
    assert.match(
      companionSource,
      /decision === "queue"[\s\S]*queuePrismRefractRequest\(\{ targetId, invocation \}\)/u,
    );
    assert.match(
      companionSource,
      /active\.registration\.target\.id === request\.targetId[\s\S]*refractQueueRef\.current\.some/u,
    );
    assert.match(
      companionSource,
      /phase !== "ready"[\s\S]*refractQueueRef\.current\.length === 0[\s\S]*takeNextPrismRefractRequest\(\)[\s\S]*target\.accept\(candidate\)[\s\S]*preserveQueue: true/u,
    );
    assert.match(
      companionSource,
      /wieldSuppressedClickRef\.current = shiftedRegistration\.element[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/u,
    );
    assert.match(
      companionSource,
      /requestPrismRefract\(targetId, "wield-click"\)[\s\S]*resetPrismWield\(true, false, \{ skipCursorDock: true \}\)[\s\S]*event\.preventDefault\(\)/u,
    );
  });

  it("keeps only the active field read-only while unrelated inputs remain usable", () => {
    assert.match(
      companionSource,
      /const preventCapturedFieldClick[\s\S]*data-prism-refract-state="generating"\], \[data-prism-refract-state="queued"\]/u,
    );
    assert.match(
      companionSource,
      /window\.addEventListener\("beforeinput", preventCapturedFieldInput, true\)[\s\S]*window\.addEventListener\("focusin", preventCapturedFieldFocus, true\)/u,
    );
    assert.match(
      companionSource,
      /eventTargetsCapturedField[\s\S]*event\.key\.length === 1[\s\S]*event\.preventDefault\(\)/u,
    );
    assert.match(
      companionSource,
      /const preventCapturedFieldFocus[\s\S]*data-prism-refract-state="queued"/u,
    );
    assert.doesNotMatch(
      companionSource,
      /activeElement\.blur/u,
    );
    assert.match(
      globalStyles,
      /data-prism-refract-state="queued"[\s\S]*cursor: progress !important[\s\S]*data-prism-refract-sheen="true"[\s\S]*cursor: pointer !important/u,
    );
  });

  it("arms Wield Prism deliberately and follows through compositor frames", () => {
    assert.match(
      companionSource,
      /type: "modifier-down"[\s\S]*type: "pointer-move"[\s\S]*presentPrismWield\(next\)/u,
    );
    assert.match(
      companionSource,
      /requestAnimationFrame\(flushPrismWieldFrame\)/u,
    );
    assert.match(
      companionSource,
      /anchor\.style\.transform = `translate3d\(\$\{pointer\.x\}px, \$\{pointer\.y\}px, 0\) translate\(-50%, -50%\)`/u,
    );
    assert.doesNotMatch(
      companionSource.match(
        /const flushPrismWieldFrame[\s\S]*?const schedulePrismWieldFrame/u,
      )?.[0] ?? "",
      /setPosition|setState/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\][\s\S]*width: 28px[\s\S]*translate3d/u,
    );
    assert.match(
      companionStyles,
      /data-wield-hover-target="true"[\s\S]*opacity: 0/u,
    );
    assert.match(
      companionSource,
      /clearPrismWieldHover\(\);[\s\S]*anchor\.toggleAttribute\("data-wield-hover-target", Boolean\(targetElement\)\)/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\] \.avatar::after \{[\s\S]*radial-gradient\([\s\S]*#fff[\s\S]*box-shadow:[\s\S]*0 0 18px 5px #ffffff45/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-wielding="true"\] \.orb \{[\s\S]*opacity: 0;[\s\S]*transform: scale\(\.45\)/u,
    );
  });

  it("restores Wield Prism across focus, visibility, motion, surface, and suppression changes", () => {
    assert.match(
      companionSource,
      /const restoreOnBlur = \(\): void => resetPrismWield\(\)[\s\S]*window\.addEventListener\("blur", restoreOnBlur\)/u,
    );
    assert.match(
      companionSource,
      /visibilitychange[\s\S]*restoreOnVisibilityChange/u,
    );
    assert.match(
      companionSource,
      /prefers-reduced-motion: reduce[\s\S]*restoreOnReducedMotionChange/u,
    );
    assert.match(
      companionSource,
      /resetPrismWield\(\);[\s\S]*releasePrismRefract\(true\);[\s\S]*surfaceScope/u,
    );
    assert.match(
      companionSource,
      /if \(!companionSuppressed\) return;[\s\S]*resetPrismWield\(\);[\s\S]*keepFieldRefract[\s\S]*if \(!keepFieldRefract\) \{\s*releasePrismRefract\(true\);/u,
    );
  });

  it("keeps show premises as visible native multiline editors", () => {
    assert.match(
      signalSource,
      /signal-show-identity-premise-[\s\S]*<textarea[\s\S]*className=\{styles\.showLookPremiseInput\}[\s\S]*value=\{showPremiseDraft\}[\s\S]*rows=\{3\}[\s\S]*onBlur/u,
    );
    const identityPremiseBlock =
      signalSource.match(
        /id: `signal-show-identity-premise-\$\{selectedShow\.id\}`[\s\S]*?<\/PrismRefractTarget>/u,
      )?.[0] ?? "";
    assert.doesNotMatch(identityPremiseBlock, /renderPickAwareComposer/u);
  });

  it("releases magic prompts before handing off to the normal action workflow", () => {
    assert.match(
      companionSource,
      /const direction = refractPrompt\.trim\(\);[\s\S]*releasePrismRefract\(false\);[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*target\.run\(direction\)/u,
    );
  });

  it("steers prose before generation and keeps that direction for rerolls", () => {
    assert.equal(
      refractSource.includes('"Make this more creative"'),
      true,
    );
    assert.equal(
      universalInputSource.includes(
        "initialDirection: initialPrismRefractProseDirection",
      ),
      true,
    );
    assert.equal(
      companionSource.includes("refractPromptRef.current?.select()"),
      true,
    );
    assert.equal(companionSource.includes("const submitPrismRefractPrompt"), true);
    assert.equal(
      companionSource.includes("direction: refractPrompt.trim()"),
      true,
    );
    assert.equal(
      companionSource.includes("generatePrismRefractCandidate(generatingSession)"),
      true,
    );
    assert.equal(
      companionSource.includes("direction: session.direction"),
      true,
    );
    assert.equal(companionSource.includes("direction,"), true);
    assert.match(
      tutorialSource,
      /Press Enter to generate, then Space to reroll with that same direction/u,
    );
  });

  it("supports prompt-free immediate and persistent choice Refract actions", () => {
    assert.match(companionSource, /target\.interaction === "immediate"/u);
    assert.match(companionSource, /target\.interaction === "choice"/u);
    assert.match(companionSource, /data-prism-refract-choice-picker="true"/u);
    assert.match(companionSource, /keepOpen === true/u);
    assert.match(companionSource, /choosePrismRefractMagicChoice/u);
    assert.match(refractSource, /interaction\?: "prompt" \| "choice" \| "immediate"/u);
    assert.match(refractSource, /keepOpen\?: boolean/u);
  });

  it("keeps foreground Refract on the global mode, model, and Effort contract", () => {
    assert.doesNotMatch(companionSource, /refractModelPicker/u);
    assert.doesNotMatch(companionSource, /refractRouting/u);
    assert.doesNotMatch(pageSource, /prismRefractLocalModel|prismRefractOnlineModel/u);
    assert.doesNotMatch(pageSource, /\/api\/settings\/prism-refract-model/u);
    assert.match(
      pageSource,
      /const botGeneratorResolvedChoice = resolveModelChoiceForResponseMode\(\{[\s\S]*chatModelChoiceByProvider/u,
    );
    assert.match(
      companionSource,
      /target\.closest\('\[data-compose-model-menu="true"\]'\)/u,
    );
    assert.doesNotMatch(companionSource, /panelView|Refract routing/u);
    assert.doesNotMatch(companionSource, /refractResponseMode|refractLaneBadge/u);
    assert.doesNotMatch(pageSource, /refractResponseMode=/u);
    const magicSubmission =
      companionSource.match(
        /const submitPrismRefractMagic[\s\S]*?const dismissRefractTutorial/u,
      )?.[0] ?? "";
    assert.match(magicSubmission, /refractionGate\.withRefractionLoader/u);
    assert.doesNotMatch(magicSubmission, /runLocalRefraction|provider: "local"/u);
  });

  it("keeps every field or choice visibly refracting through a committed preview paint", () => {
    assert.match(
      companionSource,
      /phase === "generating"[\s\S]*element\.dataset\.prismRefractSheen = "true"/u,
    );
    assert.match(
      companionSource,
      /await nextPrismRefractPaint\(controller\.signal\)[\s\S]*const rawValue = await runPrismRefractGenerationWithTimeout/u,
    );
    assert.doesNotMatch(
      companionSource.match(
        /await nextPrismRefractPaint\(controller\.signal\)[\s\S]*?const rawValue = await runPrismRefractGenerationWithTimeout/u,
      )?.[0] ?? "",
      /prepareLocalModel|activeElement\.blur/u,
    );
    assert.match(
      companionSource,
      /target\.preview\(value\);[\s\S]*waitForPrismRefractPreviewPaint\([\s\S]*kind: "field"[\s\S]*phase: "ready"/u,
    );
    assert.match(
      companionSource,
      /refractSession\?\.registration\.target\.kind === "field"[\s\S]*refractSession\.targetCenter/u,
    );
    assert.match(
      companionSource,
      /targetCenter: \{[\s\S]*rect\.left \+ rect\.width \/ 2[\s\S]*rect\.top \+ rect\.height \/ 2/u,
    );
    assert.match(
      companionSource,
      /target\.preview\(choice\.value\);[\s\S]*waitForPrismRefractPreviewPaint\([\s\S]*kind: "choice"[\s\S]*phase: "ready"/u,
    );
    assert.match(
      companionSource,
      /const clearIncompleteGeneration[\s\S]*active\.phase !== "generating"[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.ok(
      (companionSource.match(/\.finally\(clearIncompleteGeneration\)/gu) ?? [])
        .length >= 2,
      "choice and field generation must both clear incomplete terminal paths",
    );
    assert.match(
      companionSource,
      /currentRegistration\?\.element !== currentSession\.registration\.element[\s\S]*releasePrismRefract\(true\)/u,
    );
    assert.match(
      companionSource,
      /prismRefractFieldPreviewIsVisible[\s\S]*control\.value\.trim\(\) === value/u,
    );
  });

  it("uses one light- and dark-legible rainbow sheen with a static reduced-motion treatment", () => {
    assert.match(
      globalStyles,
      /:root body \[data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*var\(--bg-surface, var\(--baseline-bg\)\)[\s\S]*outline: 2px solid[\s\S]*linear-gradient\([\s\S]*prismRefractSheenFlow 1\.7s linear infinite[\s\S]*prismRefractSheenPulse 920ms/u,
    );
    assert.match(
      globalStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*data-prism-refract-sheen[\s\S]*animation: none !important/u,
    );
    assert.match(
      debateStyles,
      /data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*--prism-refract-sheen-surface: var\(--debate-refract-field\)/u,
    );
    assert.match(
      readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8"),
      /data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*--prism-refract-sheen-surface: var\(--botcast-field\)/u,
    );
  });

  it("centers the triangle while prose generates and removes it after preview paint", () => {
    assert.match(
      companionStyles,
      /\.anchor\[data-refracting="generating"\] \{[\s\S]*left 420ms[\s\S]*top 420ms/u,
    );
    assert.match(
      companionStyles,
      /\.refractGlyph \{[\s\S]*left: 50%;[\s\S]*top: 50%/u,
    );
    assert.match(
      companionStyles,
      /data-refracting="generating"\] \.refractGlyph,[\s\S]*data-refracting="error"\] \.refractGlyph/u,
    );
    assert.doesNotMatch(
      companionStyles,
      /data-refracting="ready"\] \.refractGlyph/u,
    );
  });

  it("removes redundant Signal randomizer/save chrome and preserves normal magic clicks", () => {
    assert.doesNotMatch(signalSource, /Randomize booking|Save name|Save premise|Regenerate name/u);
    assert.doesNotMatch(signalSource, /contextualDiceButton|<Dices/u);
    for (const action of [
      "Complete this show",
      "Book for me",
      "Regenerate blurbs",
      "Create atmosphere",
    ]) {
      assert.match(signalSource, new RegExp(action, "u"));
    }
    assert.match(
      signalSource,
      /kind: "magic"[\s\S]*run: randomizeBooking[\s\S]*onClick=\{\(\) => void randomizeBooking\(\)\}/u,
    );
    assert.match(
      signalSource,
      /const regenerateLogo[\s\S]*startSignalArtworkJob\([\s\S]*"logo"[\s\S]*direction/u,
    );
    assert.doesNotMatch(signalSource, /keywords: \[direction\]/u);
    assert.match(signalSource, /kind="signal_studio"/u);
    assert.match(signalSource, /kind="signal_logo"/u);
    assert.doesNotMatch(signalSource, />Refresh studio</u);
    assert.doesNotMatch(signalSource, />Refresh logo</u);
  });

  it("keeps the ritual skippable, remindable, resettable, and persisted outside the walkthrough", () => {
    assert.match(tutorialSource, /skippable Refract ritual/u);
    assert.match(tutorialSource, /skippable Wield Prism teaching beat/u);
    assert.match(
      tutorialSource,
      /shimmering field stays read-only[\s\S]*click and type elsewhere without interrupting it[\s\S]*active rainbow sheen again to cancel[\s\S]*leave Signal[\s\S]*never borrows the Background model/u,
    );
    assert.match(pageSource, /tutorialProgress\.prismWield/u);
    assert.match(pageSource, /tutorialProgress\.signalRefract/u);
    assert.match(
      pageSource,
      /resolveCompanionTutorial\("prismWield", "completed"\)/u,
    );
    assert.match(
      pageSource,
      /resolveCompanionTutorial\("signalRefract", "completed"\)/u,
    );
    assert.match(
      pageSource,
      /mode === "botcast"[\s\S]*prismWield:[\s\S]*status: "pending"[\s\S]*signalRefract:[\s\S]*status: "pending"/u,
    );
    assert.match(companionSource, /data-prism-wield-tutorial-card="true"/u);
    assert.match(
      companionSource,
      /Release \$\{modifierPresentation\.modifierLabel\} safely/u,
    );
  });
});
