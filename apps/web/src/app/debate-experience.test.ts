import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_JURY_SIZE,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_SCHEMA_VERSION,
  debateEventIsTranscriptHousekeeping,
} from "@localai/shared";
import {
  applyDebateSetupPreset,
  copyDebateMotionSlate,
  debateAlignmentPreviewCast,
  debateMotionRevealState,
  debatePlayerJudgePrefilledCast,
  debatePrefilledCast,
  debateSetupScreensVisited,
  derivedDebateSetupPresetId,
  initialDebateSetupScreensVisited,
  isDebateRequiredSetupScreen,
  mergeDebateEvidenceSources,
  randomDebateCast,
  randomDebatePlayerJudgeCast,
  withDebateSetupScreenVisited,
} from "./debateExperienceState.ts";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./DebateExperience.module.css", import.meta.url)),
  "utf8",
);
const forumSceneSource = readFileSync(
  fileURLToPath(new URL("./DebateForumScene.tsx", import.meta.url)),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const pageCss = readFileSync(
  fileURLToPath(new URL("./page.module.css", import.meta.url)),
  "utf8",
);
const identSource = readFileSync(
  fileURLToPath(new URL("./debateIdentAudio.ts", import.meta.url)),
  "utf8",
);

describe("Debate experience", () => {
  it("presents the moderator introduction instead of treating it as transcript-only", () => {
    assert.match(
      source,
      /function debatePresentationEvents[\s\S]{0,900}event\.kind === "intro" \|\|[\s\S]{0,80}event\.kind === "speech"/u,
    );
    assert.match(
      source,
      /await adoptSession\(null, result\.session, \{ playIntro: true \}\)/u,
    );
    assert.match(
      source,
      /setPresenting\(fresh\.length > 0 \|\| options\.playIntro === true\)/u,
    );
  });

  it("keeps lifecycle and audience-order housekeeping outside the readable record", () => {
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "pause" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "resume" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "audience_order" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "judge_gavel" }),
      false,
    );
    assert.match(
      source,
      /session\.events[\s\S]{0,180}!debateEventIsTranscriptHousekeeping\(event\)[\s\S]{0,100}!debateEventIsJuryComment\(event\)/u,
    );
    assert.match(
      source,
      /DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS\.has\(event\.kind\)[\s\S]{0,180}!debateEventIsTranscriptHousekeeping\(event\)/u,
    );
  });

  it("selects all motion fields atomically without retaining nested references", () => {
    const slate = {
      version: DEBATE_SCHEMA_VERSION,
      id: "slate-1",
      motion: "This house would build.",
      forSide: { label: "Build", brief: "Build the thing." },
      againstSide: { label: "Pause", brief: "Do not build the thing." },
    };
    const selected = copyDebateMotionSlate(slate);
    assert.deepEqual(selected, slate);
    assert.notEqual(selected.forSide, slate.forSide);
    assert.notEqual(selected.againstSide, slate.againstSide);
  });

  it("prefills contextual casts only when no explicit selection is required", () => {
    assert.deepEqual(debatePrefilledCast(["m", "f", "a"]), {
      moderator: "m",
      forAdvocate: "f",
      againstAdvocate: "a",
    });
    assert.deepEqual(debatePrefilledCast(["m", "f", "a", "extra"]), {
      moderator: "",
      forAdvocate: "",
      againstAdvocate: "",
    });
    assert.deepEqual(debatePlayerJudgePrefilledCast(["f", "a"]), {
      moderator: "",
      forAdvocate: "f",
      againstAdvocate: "a",
    });
    assert.deepEqual(debatePlayerJudgePrefilledCast(["m", "f", "a"]), {
      moderator: "",
      forAdvocate: "",
      againstAdvocate: "",
    });
  });

  it("randomly casts three unique Library bots and fails safely with fewer", () => {
    assert.deepEqual(
      randomDebateCast(["m", "f", "a", "extra", "m", ""], () => 0),
      {
        moderator: "f",
        forAdvocate: "a",
        againstAdvocate: "extra",
      },
    );
    assert.equal(
      randomDebateCast(["m", "f"], () => 0.5),
      null,
    );
    assert.deepEqual(
      randomDebatePlayerJudgeCast(["f", "a", "extra"], () => 0),
      {
        moderator: "",
        forAdvocate: "a",
        againstAdvocate: "extra",
      },
    );
    assert.equal(
      randomDebatePlayerJudgeCast(["f"], () => 0.5),
      null,
    );
  });

  it("gives stage alignment a fresh random three-bot Library cast", () => {
    assert.deepEqual(
      debateAlignmentPreviewCast(["m", "f", "a", "extra"], () => 0),
      {
        moderator: "f",
        forAdvocate: "a",
        againstAdvocate: "extra",
      },
    );
    assert.equal(
      debateAlignmentPreviewCast(["m", "f"], () => 0.5),
      null,
    );
  });

  it("registers synthesis with Prism while keeping a visible accessible action", () => {
    assert.match(source, /PrismRefractTarget target=\{synthesisMagic\}/u);
    assert.match(source, /data-tutorial-target="debate-synthesize"/u);
    assert.match(source, /Refract into motions/u);
  });

  it("defaults to a streamlined Basic setup while preserving the current Advanced studio", () => {
    assert.match(source, /useState<DebateSetupMode>\("basic"\)/u);
    assert.match(source, /data-tutorial-target="debate-setup-mode"/u);
    assert.match(source, /aria-label="Debate setup detail"/u);
    assert.match(source, /Basic setup · Prism fills the brief/u);
    assert.match(source, /What should they debate\?/u);
    assert.match(source, /Build the debate/u);
    assert.match(source, /Prism fills the motion and both sides/u);
    assert.match(source, /Try another version/u);
    assert.match(source, /Who should argue\?/u);
    assert.match(source, /Make sure they’re willing/u);
    assert.match(source, /const checkRoles = async \(\): Promise<void> =>/u);
    assert.match(
      source,
      /const comment =[\s\S]{0,420}I’m willing to argue \$\{sideLabel\}/u,
    );
    assert.match(source, /<p>\{comment\}<\/p>/u);
    assert.doesNotMatch(
      source,
      /\{check\.reason \? <p>\{check\.reason\}<\/p> : null\}/u,
    );
    assert.match(
      source,
      /roleChecksComplete[\s\S]{0,120}setStudioPanel\("evidence"\)[\s\S]{0,180}setupMode === "basic"[\s\S]{0,100}void checkRoles\(\)/u,
    );
    assert.doesNotMatch(
      source,
      /checkRoles\(\)\.then\([\s\S]{0,180}setStudioPanel\("evidence"\)/u,
    );
    assert.match(source, /Add optional evidence →/u);
    assert.match(source, /Find sources/u);
    assert.match(source, /Start Debate/u);
    assert.match(source, /data-tutorial-target="debate-rowdiness"/u);
    assert.match(source, /aria-label="Debate rowdiness"/u);
    assert.match(
      source,
      /setFormat\("forum"\)[\s\S]{0,180}setPlayerRole\("judge"\)[\s\S]{0,180}setJuryEnabled\(false\)/u,
    );
    const basicModeTransition = source.slice(
      source.indexOf("const chooseSetupMode"),
      source.indexOf("const chooseFormality"),
    );
    assert.doesNotMatch(basicModeTransition, /setFormality/u);
    assert.match(
      source,
      /setupMode === "advanced"[\s\S]{0,180}styles\.proceedingPresets/u,
    );
    assert.match(source, /DEBATE_SETUP_PRESETS\.map/u);
    assert.match(source, /DEBATE_FORMALITY_SPECTRUM\.map/u);
    assert.match(source, /DEBATE_FORMAT_CATALOG\.map/u);
    assert.match(css, /\.setupModeToggle\s*\{/u);
    assert.match(css, /\.basicMotionCard\s*\{/u);
    assert.match(css, /\[data-debate-setup-mode="basic"\] \.castSlotGrid/u);
  });

  it("freezes one custom moderator title across setup, archive, transcript, and the live card", () => {
    assert.match(source, /useState\("Moderator"\)/u);
    assert.match(source, /data-tutorial-target="debate-moderator-title"/u);
    assert.match(source, /maxLength=\{DEBATE_MODERATOR_TITLE_MAX_LENGTH\}/u);
    assert.match(source, /placeholder="Moderator, The House, The Court…"/u);
    assert.match(
      source,
      /moderatorTitle: normalizeDebateModeratorTitle\(moderatorTitle\)/u,
    );
    assert.match(
      source,
      /normalizeDebateModeratorTitle\(session\.moderatorTitle\), session\.moderator/u,
    );
    assert.match(
      source,
      /roleLabel:[\s\S]{0,180}normalizeDebateModeratorTitle\(session\.moderatorTitle\)/u,
    );
    assert.match(
      source,
      /\{session\.moderatorTitle\} · \{sessionStatusLabel\(session\)\}/u,
    );
    assert.match(css, /\.moderatorTitleField\s*\{/u);
  });

  it("adds an inline editable Territory dice without changing the motion slate", () => {
    assert.match(source, /randomDebateTerritory/u);
    assert.match(source, /data-debate-territory-randomize="true"/u);
    assert.match(source, /aria-label="Generate a random Debate territory"/u);
    assert.match(
      source,
      /setTopic\(\(current\) => randomDebateTerritory\(current\)\)/u,
    );
    assert.match(source, /renderBotGlyph\("dice"/u);
    assert.match(css, /\.territoryRandomizeButton\s*\{/u);
  });

  it("wires Territory to Command Center prompts and wildcard decks", () => {
    assert.match(source, /renderPickAwareComposer\?/u);
    assert.match(source, /expandComposerDraft\?/u);
    assert.match(
      source,
      /id: "debate-territory"[\s\S]{0,500}onChange: setTopic/u,
    );
    assert.doesNotMatch(source, /resolvePicksToPlainText/u);
    assert.match(
      source,
      /const resolvedTopic = expandDebateSeedDraft\(topic\)\.trim\(\)/u,
    );
    assert.doesNotMatch(
      source,
      /if \(resolvedTopic !== topic\) \{\s*setTopic\(resolvedTopic\);/u,
    );
    assert.match(
      source,
      /topic: resolvedTopic/u,
    );
    assert.match(css, /\.pickAwareSetupField\s*\{/u);
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s*\{[\s\S]*?--fg:\s*var\(--debate-studio-ink\)/u,
    );
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s+textarea\[data-rich-overlay="true"\]\s*\{[\s\S]*?background:\s*transparent/u,
    );
  });

  it("reveals motion inputs incrementally without hiding populated downstream work", () => {
    const emptySlate = {
      version: DEBATE_SCHEMA_VERSION,
      id: "custom-motion",
      motion: "",
      forSide: { label: "", brief: "" },
      againstSide: { label: "", brief: "" },
    };
    assert.deepEqual(debateMotionRevealState("", emptySlate), {
      motion: false,
      positions: false,
      briefs: false,
    });
    assert.deepEqual(debateMotionRevealState("Public transit", emptySlate), {
      motion: true,
      positions: false,
      briefs: false,
    });
    assert.deepEqual(
      debateMotionRevealState("Public transit", {
        ...emptySlate,
        motion: "This house would make transit free.",
      }),
      { motion: true, positions: true, briefs: false },
    );
    assert.deepEqual(
      debateMotionRevealState("", {
        ...emptySlate,
        forSide: { label: "Access", brief: "Mobility is a public good." },
        againstSide: { label: "Cost", brief: "" },
      }),
      { motion: true, positions: true, briefs: true },
    );
    assert.match(source, /data-debate-motion-stage="motion"/u);
    assert.match(source, /data-debate-motion-stage="positions"/u);
    assert.match(source, /data-debate-motion-stage="briefs"/u);
    assert.match(css, /@keyframes debate-motion-reveal/u);
  });

  it("keeps randomized research real while allowing editable object exhibits", () => {
    assert.match(source, /randomDebateEvidenceQuery\(motion\.motion, topic\)/u);
    assert.match(
      source,
      /aria-label="Generate randomized evidence search from the current motion"/u,
    );
    assert.match(source, /await research\(query, true\)/u);
    assert.match(source, /Search the public web/u);
    assert.match(
      source,
      /"debate\.setup\.exhibitPair"[\s\S]*rejectedTitles[\s\S]*debateEvidenceObjectFromPrismCandidate/u,
    );
    assert.match(
      source,
      /randomDebateEvidenceObject\(Math\.random, rejectedTitles\)/u,
    );
    assert.match(source, /Prism is refracting…/u);
    assert.match(
      css,
      /addEvidenceButton\[data-generating="true"\][\s\S]*debateRefractRainbowFlow 1\.7s linear infinite/u,
    );
    assert.match(source, /\/api\/debates\/exhibits\/upload/u);
    assert.match(source, /\/api\/debates\/exhibits\/synthesize/u);
    assert.match(
      source,
      /import \{ PrismBlockingLoader \} from "\.\/PrismBlockingLoader"/u,
    );
    assert.match(source, /open=\{evidenceObjectVisualBusy === "synthesize"\}/u);
    assert.match(source, /Generating and cutting out the exhibit/u);
    assert.match(
      source,
      /The exhibit text and emoji fallback remain unchanged while the sprite takes shape/u,
    );
    assert.match(
      source,
      /setEvidenceObjectVisualBusy\("synthesize"\)[\s\S]{0,800}\/api\/debates\/exhibits\/synthesize[\s\S]{0,1600}finally \{[\s\S]{0,120}setEvidenceObjectVisualBusy\(null\)/u,
    );
    assert.match(source, /\/api\/images\/tool-assets\?scope=debate_exhibit/u);
    assert.match(
      source,
      /aria-label="Previously generated Debate exhibit sprites"/u,
    );
    assert.match(
      source,
      /Choosing one restores[\s\S]{0,80}name and options[\s\S]{0,80}image-generation tokens/u,
    );
    assert.match(source, /selectEvidenceExhibitAsset\(asset\)/u);
    assert.match(
      source,
      /debateEvidenceObjectDraftFromStoredExhibitAsset\(asset\)/u,
    );
    assert.match(
      source,
      /applyDebateEvidenceObjectNameEdit\(current, field, value\)/u,
    );
    assert.doesNotMatch(
      source,
      /Name the object before choosing a sprite/u,
    );
    assert.match(css, /\.evidenceExhibitAssetRail/u);
    assert.match(source, /The text record is evidence/u);
    assert.doesNotMatch(source, /openDesktopEmojiPicker\(\)/u);
    assert.match(source, /Choose exhibit emoji\. Current emoji:/u);
    assert.match(source, /searchDebateEvidenceEmojis/u);
    assert.match(source, /Three most relevant emojis/u);
    assert.match(source, /Find the right symbol/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /event\.key !== "Escape"/u);
    assert.match(source, /chooseEvidenceObjectEmoji/u);
    assert.match(css, /\.evidenceEmojiSearchModal\s*\{/u);
    assert.match(
      css,
      /\.evidenceEmojiSearchResults\s*\{[^}]*grid-template-columns:\s*repeat\(3,/u,
    );
    assert.match(
      css,
      /\.evidenceObjectPreview > \.evidenceExhibitVisual\s*\{[^}]*font-size:\s*52px/u,
    );
    assert.match(
      css,
      /\.evidenceObjectPreview > \.evidenceExhibitVisual > span\s*\{[^}]*max-width:\s*88%/u,
    );
    assert.match(
      css,
      /\.evidenceExhibitVisual:has\(>\s*img:not\(\[hidden\]\)\)\s*>\s*span\s*\{[^}]*visibility:\s*hidden/u,
    );
    assert.match(
      source,
      /Emoji stays hidden while that sprite is showing[\s\S]{0,80}returns only if the sprite cannot load/u,
    );
    assert.doesNotMatch(source, /Emoji always remains as the fallback/u);
    assert.doesNotMatch(css, /\.evidenceObjectPreview span,/u);
    assert.match(source, /props\.responseMode === "local"/u);
    assert.doesNotMatch(source, /synthetic-[a-z]/u);
  });

  it("locks prior Brave results while later searches fill distinct source slots", () => {
    const locked = Array.from({ length: 5 }, (_, index) => ({
      id: `brave-${index + 1}`,
      title: `Locked ${index + 1}`,
      url: `https://example.com/locked-${index + 1}`,
      snippet: "",
      publishedAt: null,
    }));
    const incoming = [
      {
        id: "brave-1",
        title: "Duplicate URL",
        url: "https://example.com/locked-1#result",
        snippet: "",
        publishedAt: null,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `brave-${index + 1}`,
        title: `New ${index + 1}`,
        url: `https://example.org/new-${index + 1}`,
        snippet: "",
        publishedAt: null,
      })),
    ];

    const merged = mergeDebateEvidenceSources(locked, incoming);
    assert.equal(merged.length, DEBATE_EVIDENCE_SOURCE_MAX_COUNT);
    assert.deepEqual(merged.slice(0, locked.length), locked);
    assert.equal(
      new Set(merged.map((candidate) => candidate.id)).size,
      DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
    );
    assert.equal(
      merged.filter((candidate) => candidate.url.includes("locked-1")).length,
      1,
    );
    assert.deepEqual(mergeDebateEvidenceSources(merged, incoming), merged);
    assert.match(source, /Search &amp; add/u);
    assert.match(source, /Find more sources/u);
    assert.match(source, /Remove an evidence item to search again/u);
    assert.match(source, /DEBATE_EVIDENCE_ITEM_MAX_COUNT/u);
    assert.match(source, /:\s*"Add evidence"/u);
    assert.doesNotMatch(source, />\s*\+ Add object\s*</u);
    assert.doesNotMatch(source, />\s*Generate object\s*</u);
    assert.match(source, /className=\{styles\.evidenceToolHeader\}/u);
    assert.match(source, /className=\{styles\.evidenceCapacity\}/u);
    assert.match(source, />Add URL</u);
    assert.match(source, /\/api\/debates\/sources\/inspect/u);
    assert.match(source, /What should debaters take from this source\?/u);
    assert.match(source, /LOCAL did not access this page/u);
    assert.match(source, /debateUrlEvidenceSourceFromDraft/u);
    assert.match(source, /data-tutorial-target="debate-add-url"/u);
    assert.match(source, /autoFocus/u);
    assert.match(source, /aria-label="Cancel adding source URL"/u);
    assert.match(source, /event\.key !== "Escape"/u);
    assert.equal(
      (source.match(/onClick=\{openUrlEvidenceEditor\}/gu) ?? []).length,
      2,
    );
    assert.match(css, /\.urlEvidenceEditor\s*\{/u);
    assert.match(
      css,
      /\.dashboard \.basicResearchBox \.evidenceObjectActions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u,
    );
  });

  it("keeps Forum default while exposing a real Turnabout format contract", () => {
    assert.match(source, /useState<DebateFormatId>\("forum"\)/u);
    assert.match(source, /DEBATE_FORMAT_CATALOG\.map/u);
    assert.match(source, /data-tutorial-target="debate-format"/u);
    assert.match(source, /option\.productionName/u);
    assert.match(source, /option\.cadence/u);
    assert.match(
      source,
      /participantForumOnly\s*\? "participant-forum-only"\s*: option\.availability/u,
    );
    assert.match(source, /const disabled =[\s\S]{0,120}participantForumOnly/u);
    assert.match(source, />\s*Coming later\s*</u);
    assert.match(
      source,
      /if \(option\.availability !== "available" \|\| disabled\)/u,
    );
    assert.match(source, /format,\s+motion,/u);
    assert.match(source, /\/turnabout-action/u);
    assert.match(source, /submitTurnaboutAction\("press"/u);
    assert.match(source, /setTurnaboutObjecting/u);
    assert.match(source, /submitTurnaboutAction\(\s*"present_evidence"/u);
    assert.match(source, /submitTurnaboutAction\("pass"/u);
    assert.match(source, /Statement-bound · frozen evidence only/u);
    assert.match(source, /session\.formatState\.floorOwnerBotId/u);
    assert.match(source, /"Record ready"/u);
    assert.match(source, /Return to a proceeding/u);
    assert.match(source, /"The record"/u);
    assert.match(css, /\.formatPicker/u);
    assert.match(
      css,
      /\.formatPicker label\[data-availability="coming_soon"\]/u,
    );
    assert.match(css, /\.turnaboutRecord/u);
    assert.match(css, /\.turnaboutActions/u);
    assert.match(
      css,
      /\.turnaboutActions > div:first-child[\s\S]{0,260}grid-template-columns/u,
    );
    assert.match(css, /turnaboutActions:has\(\.turnaboutEvidencePicker\)/u);
    assert.match(css, /data-debate-format="turnabout"/u);
  });

  it("applies built-in presets without touching proceeding content and derives Custom from manual differences", () => {
    const consent = [
      {
        version: DEBATE_SCHEMA_VERSION,
        format: "forum" as const,
        botId: "for",
        sideId: "for" as const,
        status: "accept" as const,
        reason: null,
        motionHash: "motion",
        botRevision: "bot",
        checkedAt: "2026-07-29T00:00:00.000Z",
      },
    ];
    const current = {
      format: "forum" as const,
      playerRole: "judge" as const,
      juryEnabled: false,
      formality: "heated" as const,
      roleChecks: consent,
      motion: { id: "motion" },
      cast: { moderator: "m", forAdvocate: "f", againstAdvocate: "a" },
      evidence: { notes: "frozen" },
      provider: "local",
      participantSide: "against",
      alignment: { x: 12 },
    };
    const publicForum = applyDebateSetupPreset(current, "public-forum");
    assert.equal(publicForum.format, "forum");
    assert.equal(publicForum.formality, "plainspoken");
    assert.equal(publicForum.playerRole, "spectator");
    assert.equal(publicForum.juryEnabled, true);
    assert.deepEqual(publicForum.roleChecks, []);
    assert.equal(publicForum.motion, current.motion);
    assert.equal(publicForum.cast, current.cast);
    assert.equal(publicForum.evidence, current.evidence);
    assert.equal(publicForum.provider, current.provider);
    assert.equal(publicForum.participantSide, current.participantSide);
    assert.equal(publicForum.alignment, current.alignment);

    const juryTrial = applyDebateSetupPreset(current, "jury-trial");
    assert.equal(juryTrial.format, "turnabout");
    assert.equal(juryTrial.formality, "structured");
    assert.deepEqual(juryTrial.roleChecks, []);
    const universityUnion = applyDebateSetupPreset(
      { ...current, formality: "parliamentary" as const },
      "classic-duel",
    );
    assert.equal(universityUnion.formality, "parliamentary");
    assert.equal(universityUnion.roleChecks, consent);
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "plainspoken",
        playerRole: "spectator",
        juryEnabled: true,
      }),
      "public-forum",
    );
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "plainspoken",
        playerRole: "judge",
        juryEnabled: true,
      }),
      "custom",
    );
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "parliamentary",
        playerRole: "spectator",
        juryEnabled: true,
      }),
      "custom",
    );
  });

  it("requires Topic, Debaters, and Evidence to be opened before Start unlocks", () => {
    assert.equal(
      debateSetupScreensVisited(initialDebateSetupScreensVisited()),
      false,
    );
    assert.equal(isDebateRequiredSetupScreen("archive"), false);
    assert.equal(isDebateRequiredSetupScreen("evidence"), true);
    const afterCast = withDebateSetupScreenVisited(
      initialDebateSetupScreensVisited(),
      "cast",
    );
    assert.equal(debateSetupScreensVisited(afterCast), false);
    const afterEvidence = withDebateSetupScreenVisited(afterCast, "evidence");
    assert.equal(debateSetupScreensVisited(afterEvidence), true);
    assert.equal(
      withDebateSetupScreenVisited(afterEvidence, "archive"),
      afterEvidence,
    );
  });

  it("keeps one five-stop behavior contract behind Advanced formality and Basic rowdiness", () => {
    assert.match(source, /useState<DebateFormalityId>\("plainspoken"\)/u);
    assert.match(source, /DEBATE_FORMALITY_SPECTRUM/u);
    assert.match(
      source,
      /DEBATE_ROWDINESS_SPECTRUM = \[\.\.\.DEBATE_FORMALITY_SPECTRUM\]\.reverse\(\)/u,
    );
    assert.match(source, /data-tutorial-target="debate-formality"/u);
    assert.match(source, /aria-label="Debate formality"/u);
    assert.match(
      source,
      /const chooseFormality[\s\S]{0,180}setFormality\(nextFormality\)[\s\S]{0,100}setRoleChecks\(\[\]\)/u,
    );
    assert.match(source, /data-tutorial-target="debate-rowdiness"/u);
    assert.match(source, /University Union/u);
    assert.match(source, /Daytime Showdown/u);
    assert.match(
      source,
      /Changes the room’s heat, pacing, cut-ins, and moderator pressure/u,
    );
    assert.match(source, /formality,\s+motion,/u);
    assert.match(source, /setFormality\(next\.formality\)/u);
    assert.match(source, /<span>Formality<\/span>/u);
    assert.match(source, /debateFormalityDescriptor\(session\.formality\)/u);
    assert.match(css, /\.formalityControl/u);
    assert.match(css, /\.rowdinessControl/u);
    assert.match(css, /--debate-rowdiness-progress/u);
    assert.match(css, /::-webkit-slider-thumb/u);
  });

  it("routes Forum and Turnabout through distinct room responses", () => {
    assert.match(
      source,
      /session\.format === "turnabout"[\s\S]{0,120}DEBATE_TURNABOUT_FOLEY_ROOM_SEND[\s\S]{0,120}DEBATE_FORUM_FOLEY_ROOM_SEND/u,
    );
    assert.match(source, /format: next\.format/u);
    assert.match(
      page,
      /debateFormat === "turnabout"[\s\S]{0,120}DEBATE_TURNABOUT_VOICE_ROOM_SEND[\s\S]{0,120}DEBATE_FORUM_VOICE_ROOM_SEND/u,
    );
    assert.match(page, /"debate",\s*utterance\.format,/u);
  });

  it("keeps Debate voice playback enabled when optional effects are off", () => {
    assert.match(page, /debateAudioEnabled\(\{/u);
    assert.doesNotMatch(
      page,
      /audioEnabled=\{Boolean\([\s\S]{0,220}voiceEffectsEnabled !== false/u,
    );
  });

  it("prepares English speech before committing the responder camera", () => {
    assert.match(
      source,
      /const voiceReady = utterance[\s\S]{0,100}onPrepareUtterance\?\.\(utterance\)/u,
    );
    assert.match(
      source,
      /await voiceReady;[\s\S]{0,280}setPresentationEventId\(event\.id\)/u,
    );
    assert.match(
      source,
      /setPresentationEventId\(event\.id\);[\s\S]{0,120}setTranscriptVisibleThroughSequence\(event\.sequence\)/u,
    );
    assert.match(
      source,
      /const presentsImmediately =[\s\S]{0,180}!onPrepareUtterance &&/u,
    );
    assert.match(
      source,
      /presentsImmediately[\s\S]{0,80}\? first\.sequence[\s\S]{0,120}previous\?\.events\.at\(-1\)\?\.sequence/u,
    );
    assert.match(source, /!presenting\s*\?\s*\(\[\.\.\.session\.events\]/u);
    assert.match(
      source,
      /const thinkingBotId =\s*voicePreparationSpeakerBotId \?\?/u,
    );
    assert.match(
      page,
      /const prepareDebateUtterance = async[\s\S]{0,2400}prefetchBotcastUtterance\([\s\S]{0,1800}"debate"/u,
    );
    assert.match(
      page,
      /await Promise\.all\(\[clip, prepareEnglishVoice\(\)\]\)/u,
    );
    assert.match(page, /onPrepareUtterance=\{prepareDebateUtterance\}/u);
  });

  it("keeps Proceedings closed until streaming can arm after voice prep", () => {
    assert.match(
      source,
      /Streaming articles must never fall back to the completed speech/u,
    );
    assert.match(
      source,
      /snapshot\.eventId === props\.event\.id[\s\S]{0,80}\? snapshot\.visibleContent[\s\S]{0,40}: ""/u,
    );
    assert.doesNotMatch(
      source,
      /setTranscriptVisibleThroughSequence\(event\.sequence\);[\s\S]{0,220}await voiceReady/u,
    );
  });

  it("does not mislabel Debate events as persisted Signal messages for voice synthesis", () => {
    assert.match(
      page,
      /playbackSurface === "signal"[\s\S]{0,120}\? \{ signalMessageId: message\.id \}/u,
    );
    assert.match(
      page,
      /requestBotcastEnglishClipWithFallback\([\s\S]{0,500}controller\.signal,\s+playbackSurface,/u,
    );
  });

  it("offers all three recovery paths when an advocate declines", () => {
    assert.match(source, /Swap sides/u);
    assert.match(source, /Change bot/u);
    assert.match(source, /Revise motion/u);
  });

  it("captures editor values before functional state updates run", () => {
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setMotion\(\(current\)/u,
    );
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setEvidence\(\(current\)/u,
    );
  });

  it("keeps setup in one studio console with free navigation and a visit-gated Start", () => {
    assert.match(source, /type DebateView = "dashboard" \| "live"/u);
    assert.match(
      source,
      /type DebateStudioPanel = "motion" \| "cast" \| "evidence" \| "archive"/u,
    );
    assert.match(source, /data-debate-surface="dashboard"/u);
    assert.doesNotMatch(source, /type SetupStep/u);
    assert.doesNotMatch(source, /className=\{styles\.stepNav\}/u);
    assert.match(source, /className=\{styles\.studioNav\}/u);
    assert.match(source, /aria-pressed=\{studioPanel === panel\.id\}/u);
    assert.match(
      source,
      /studioPanel === "motion" \? renderMotionStep\(\) : null/u,
    );
    assert.match(
      source,
      /studioPanel === "cast" \? renderCastStep\(\) : null/u,
    );
    assert.match(
      source,
      /studioPanel === "evidence" \? renderEvidenceStep\(\) : null/u,
    );
    assert.match(source, /\{renderForumReadout\(\)\}/u);
    assert.match(source, /\{renderReviewStep\(\)\}/u);
    assert.match(source, /visitedSetupScreens/u);
    assert.match(source, /setupScreensComplete/u);
    assert.match(
      source,
      /debateCanStart =[\s\S]{0,220}setupScreensComplete/u,
    );
    assert.match(
      source,
      /withDebateSetupScreenVisited\(current, studioPanel\)/u,
    );
    assert.match(
      source,
      /setVisitedSetupScreens\(initialDebateSetupScreensVisited\(\)\)/u,
    );
    assert.match(
      source,
      /Open Topic, Debaters, and Evidence before Start\./u,
    );
    assert.match(source, /className=\{styles\.studioNavLaunch\}/u);
    assert.match(
      source,
      /studioNavLaunch[\s\S]{0,220}data-tutorial-target="debate-start"/u,
    );
    assert.match(source, /className=\{styles\.packetSeal\}/u);
    assert.match(
      source,
      /\{debateCanStart \? \([\s\S]{0,420}\? "Start Debate"/u,
    );
    assert.match(source, /canStart=\{debateCanStart\}/u);
    assert.match(source, /onStart=\{\(\) => void startDebate\(\)\}/u);
    assert.match(source, /<BotPickerGrid/u);
    assert.match(source, /activeCastSlot/u);
    assert.match(source, /assignBotToCastSlot/u);
    assert.match(source, /Already cast/u);
    assert.match(source, /"Randomly select all three actors"/u);
    assert.match(source, /onClick=\{randomizeCast\}/u);
    assert.match(
      source,
      /disabled=\{bots\.length < \(playerRole === "spectator" \? 3 : 2\)\}/u,
    );
    assert.match(
      source,
      /DEBATE_STAGE_ALIGNMENT_ENABLED \? \([\s\S]*?className=\{styles\.studioUtilityButton\}[\s\S]*?onClick=\{openStageAlignment\}/u,
    );
    assert.match(source, /\{renderStageAlignmentModal\(null\)\}/u);
    assert.match(
      source,
      /data-alignment-source=\{session \? "session" : "dashboard"\}/u,
    );
    assert.match(source, /fresh random Library cast/u);
    assert.match(
      source,
      /const randomized = debateAlignmentPreviewCast\(\s*stageAlignmentCastCandidates\.map/u,
    );
    assert.match(source, /data-debate-stage-alignment-shuffle="true"/u);
    assert.match(source, /Shuffle cast/u);
    assert.match(page, /avatarDetails:\s*bot\.avatarDetails \?\? null/u);
    assert.match(page, /powers:\s*bot\.powers/u);
    assert.match(page, /systemPrompt:\s*bot\.system_prompt/u);
    assert.match(
      css,
      /\.dashboard \.dashboardRail \.setupActions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/u,
    );
    assert.match(
      css,
      /\.dashboard \.dashboardLayout\s*\{[^}]*grid-template-columns:\s*190px minmax\(620px,\s*1fr\) 342px/u,
    );
    assert.match(
      css,
      /\.dashboard \.dashboardPanel,[\s\S]*?border-radius:\s*0[^}]*background:\s*transparent/u,
    );
    assert.match(
      css,
      /\.studioNavButton\[data-active="true"\]\s*\{[^}]*border-left-color:\s*var\(--debate-studio-accent\)/u,
    );
    assert.match(
      css,
      /\.dashboard \.researchBox\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(280px,\s*1fr\) auto/u,
    );
    assert.match(source, /\/end-early/u);
    assert.match(source, /\/jury\/skip-deliberation/u);
    assert.match(
      source,
      /juryDeliberating \? "Skip deliberation" : "End debate"/u,
    );
    assert.match(
      source,
      /debateAwaitsJuryDeliberationChoice\(activeSession\)/u,
    );
    assert.match(source, /Auto deliberate/u);
    assert.match(source, />\s*Watch Jury\s*</u);
    assert.doesNotMatch(source, />\s*Participate\s*</u);
    assert.match(source, /Skip to ballots/u);
    assert.match(source, /Auto is the default and begins in/u);
    assert.match(source, /juryAutoDeliberationEnabled/u);
    assert.match(source, /juryDecisionTimeoutMs/u);
    assert.match(source, /All five jurors will still cast final ballots/u);
    assert.match(source, /role="alertdialog"/u);
    assert.match(
      source,
      /limited \$\{debatePublicMaterialName\(session\.formality\)\.toLowerCase\(\)\}/u,
    );
    assert.match(
      source,
      /disabled=\{busy \|\| \(!juryDeliberating && presenting\)\}/u,
    );
    assert.match(
      source,
      /if \(presenting\) cancelCurrentPresentation\(\);[\s\S]{0,180}jury\/skip-deliberation/u,
    );
    assert.match(css, /\.juryDeliberationChoice/u);
    assert.match(css, /\.proceedingControlActions \.endEarlyButton/u);
  });

  it("lets a hard-muted moderator create an open-floor Debate instead of blocking cast", () => {
    assert.doesNotMatch(source, /Hard-muted bots cannot moderate/u);
    assert.doesNotMatch(source, /Choose an audible moderator/u);
    assert.match(
      source,
      /This moderator will remain canonically silent[\s\S]*other bots will encounter that silence in character/u,
    );
    assert.match(source, /The moderator left the floor open/u);
    assert.match(source, /No challenge was spoken/u);
    assert.match(source, /Use the open floor however your side would/u);
  });

  it("projects invisible moderators through cast perception without voicing neutral ledger events", () => {
    assert.match(source, /botPowerObserverProjectionFromEffectsV1\(/u);
    assert.match(
      source,
      /cast\.some\(\(participant\) => participant\.id === target\.botId\)/u,
    );
    assert.match(
      source,
      /observerProjection\.visibility === "hidden"\s*\?\s*"hidden"/u,
    );
    assert.match(
      source,
      /if \(event\.speakerKind === "system"\)[\s\S]{0,260}revealEventSilently/u,
    );
    assert.match(source, /latestModeratorEvent\?\.speakerKind === "system"/u);
    assert.match(
      source,
      /event\.speakerKind === "system"[\s\S]{0,260}session\.formality === "parliamentary"[\s\S]{0,120}Public record/u,
    );
    assert.match(
      source,
      /archived\.status === "completed" \? "replay" : "live"/u,
    );
    assert.match(source, /\?perspective=\$\{perspective\}/u);
  });

  it("keeps stable tutorial targets across the complete Duel workflow", () => {
    for (const target of [
      "debate-new",
      "debate-presets",
      "debate-synthesize",
      "debate-cast",
      "debate-jury",
      "debate-jury-roster",
      "debate-jury-chamber",
      "debate-consent",
      "debate-evidence",
      "debate-readiness",
      "debate-start",
      "debate-case-board",
      "debate-camera",
      "debate-copy-transcript",
    ]) {
      assert.match(source, new RegExp(target, "u"));
    }
  });

  it("keeps the live record bounded beside the compact forum", () => {
    assert.match(source, /formatDebateVerboseTranscript/u);
    assert.match(source, /Copy verbose transcript/u);
    assert.match(source, /className=\{styles\.transcriptFeed\}/u);
    assert.match(source, /className=\{styles\.debateRail\}/u);
    assert.match(
      css,
      /\.liveWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*430px\)/u,
    );
    assert.match(css, /\.transcriptFeed\s*\{[^}]*overflow-y:\s*auto/u);
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s*\{[^}]*display:\s*grid[^}]*height:\s*calc\(100dvh - 124px\)[^}]*grid-template-rows:\s*minmax\(220px,\s*46%\)\s+minmax\(0,\s*1fr\)/u,
    );
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s+\.resultCard\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/u,
    );
    assert.match(
      css,
      /\.botStagePresence\s*\{[^}]*width:\s*clamp\(126px,\s*11\.4vw,\s*180px\)/u,
    );
    const visibleKinds =
      source.match(
        /const DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS = new Set\(\[([\s\S]*?)\]\);/u,
      )?.[1] ?? "";
    assert.doesNotMatch(visibleKinds, /"ballot"|"verdict",/u);
  });

  it("presents the motion in the proceedings header and spoken captions at the bottom", () => {
    assert.match(source, /data-debate-motion-title="true"/u);
    assert.match(
      source,
      /title=\{session\.motion\.motion\}[\s\S]{0,80}\{session\.motion\.motion\}/u,
    );
    assert.doesNotMatch(source, /data-debate-stage-title="true"/u);
    assert.doesNotMatch(source, /className=\{styles\.stageTitle\}/u);
    assert.doesNotMatch(source, /className=\{styles\.motionPlinth\}/u);
    assert.match(source, /className=\{styles\.liveCaption\}/u);
    assert.match(source, /data-debate-live-caption="true"/u);
    assert.match(source, /data-caption-rows="adaptive"/u);
    assert.match(source, /debateLiveCaptionPage\(props\.text\)/u);
    assert.doesNotMatch(source, /caption\.scrollTop = caption\.scrollHeight/u);
    assert.match(source, /data-debate-captions-toggle="true"/u);
    assert.match(source, /liveCaptionsEnabled &&/u);
    assert.match(source, /toggleLiveCaptions/u);
    assert.match(source, /writeDebateLiveCaptionsEnabled/u);
    assert.match(
      source,
      /DebateLiveCaptionConsumer[\s\S]{0,700}debateSpokenText\(snapshot\.visibleContent\)\.trim\(\)/u,
    );
    assert.match(
      source,
      /speakerName=\{visibleEventName\([\s\S]{0,100}activeEvent,[\s\S]{0,80}playerName/u,
    );
    assert.match(source, /<strong>\{props\.speakerName\}<\/strong>/u);
    assert.match(
      css,
      /\.liveHeader h1\s*\{[^}]*font-family:\s*var\(--font-serif[^}]*text-overflow:\s*ellipsis/u,
    );
    assert.doesNotMatch(css, /\.stageTitle\s*\{/u);
    assert.doesNotMatch(css, /\.motionPlinth\s*\{/u);
    assert.match(
      css,
      /\.liveCaption\s*\{[^}]*bottom:\s*clamp\(18px,\s*4\.5%,\s*34px\)/u,
    );
    assert.match(
      css,
      /\.liveCaption span\s*\{[^}]*font-weight:\s*510[^}]*text-wrap:\s*pretty/u,
    );
    assert.doesNotMatch(
      css,
      /\.liveCaption span\s*\{[^}]*overflow-y:\s*hidden/u,
    );
  });

  it("keeps non-guided player actions in a full-width command deck without reflowing proceedings", () => {
    assert.match(source, /data-player-window-active=/u);
    assert.match(
      source,
      /session\.status === "waiting_for_player" && !presenting[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /session\.status === "waiting_for_player" &&[\s\S]{0,120}judgeGuidedStep === null \? \([\s\S]*?className=\{styles\.liveCommandDeck\}[\s\S]*?\{renderPlayerWindow\(session\)\}/u,
    );
    assert.match(
      css,
      /\.liveCommandDeck\s*\{[^}]*position:\s*fixed[^}]*place-items:\s*center[^}]*pointer-events:\s*none/u,
    );
    assert.match(
      css,
      /\.liveCommandDeck \.playerWindow\s*\{[^}]*grid-template-columns:\s*minmax\(210px,\s*0\.75fr\)\s+minmax\(360px,\s*1\.45fr\)/u,
    );
  });

  it("puts player-Judge quick choices on the caption screen and reveals the shared composer only for custom prose", () => {
    assert.match(source, /debateJudgeGuidedStepKind/u);
    assert.match(source, /debateJudgeQuickChoices\(kind\)/u);
    assert.match(
      source,
      /data-tutorial-target="debate-judge-guided-controls"/u,
    );
    assert.match(source, /data-choice-kind=/u);
    assert.match(
      source,
      /choice\.action === "dismiss"[\s\S]{0,180}submitJudgeGavelMessage\(undefined, true\)[\s\S]{0,100}passPlayerTurn\(\)/u,
    );
    assert.match(source, /Write below, or roll the dice/u);
    assert.match(source, /Back to quick choices/u);
    assert.match(source, /renderJudgeComposer/u);
    assert.match(source, /\/api\/composer\/random-prompt/u);
    assert.match(source, /Return only the Judge's words/u);
    assert.match(
      source,
      /judgeGuidedStep === "gavel" \|\| judgeGuidedStep === "question"/u,
    );
    assert.match(
      css,
      /\.judgeChoiceDock\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4\.5%/u,
    );
    assert.match(css, /\.judgeQuickChoices\s*,[\s\S]*grid-template-columns/u);
    assert.match(
      css,
      /\.judgeQuickChoices > button\[data-choice-kind="dismiss"\]\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*justify-self:\s*center[^}]*font-size:\s*9px[^}]*opacity:\s*0\.58/u,
    );
    assert.match(page, /variant:\s*"debate"/u);
    assert.match(page, /debateJudgeComposerRef/u);
    assert.match(page, /Draft an editable Judge response/u);
    assert.match(
      pageCss,
      /\.compose\.debateJudgeComposer\s*\{[^}]*position:\s*fixed/u,
    );
  });

  it("puts a timed Sustained or Overruled ruling after a bot speaks its objection", () => {
    assert.match(source, /\/objection-ruling`/u);
    assert.match(source, /pendingRuling\?\.status === "awaiting_ruling"/u);
    assert.match(
      source,
      /data-tutorial-target="debate-judge-objection-ruling"/u,
    );
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /ref=\{objectionRulingDockRef\}/u);
    assert.match(source, /aria-keyshortcuts="S"/u);
    assert.match(source, /aria-keyshortcuts="O"/u);
    assert.match(source, /Sustained <kbd>S<\/kbd>/u);
    assert.match(source, /Overruled <kbd>O<\/kbd>/u);
    assert.match(source, /debateJudgeObjectionRulingShortcut/u);
    assert.match(source, /objectionRulingDockRef\.current\?\.focus\(\)/u);
    assert.match(
      source,
      /input, textarea, select, \[contenteditable="true"\]/u,
    );
    assert.match(source, /No ruling defaults to Overruled\./u);
    assert.match(source, /void submitObjectionRuling\("overruled"\)/u);
    assert.match(
      css,
      /\.judgeObjectionChoices\s*\{[^}]*grid-template-columns:\s*repeat\(2/u,
    );
  });

  it("gives paused, player, verdict, and failed proceedings visible stage states", () => {
    assert.match(source, /className=\{styles\.stageStateOverlay\}/u);
    for (const kind of ["paused", "player", "verdict", "failed"]) {
      assert.match(source, new RegExp(`data-kind="${kind}"`, "u"));
    }
    assert.match(source, /Forum suspended/u);
    assert.match(source, /The floor turns to you/u);
    assert.match(source, /The proceeding is sealed/u);
    assert.match(source, /No prevailing side/u);
    assert.match(css, /\.stageStateOverlay\s*\{[^}]*position:\s*absolute/u);
  });

  it("shows a speech-synced floor clock and marks genuine overtime", () => {
    assert.match(source, /function DebateTurnClock/u);
    assert.match(
      source,
      /debateTurnClockState\(props\.event,\s*props\.speechTiming\)/u,
    );
    assert.match(source, /role="timer"/u);
    assert.match(source, /data-status=\{clock\.status\}/u);
    assert.match(source, /activeTurnClock\?\.status === "overtime"/u);
    assert.match(
      source,
      /<DebateTurnClockConsumer\s+store=\{presentationStore\}\s+sessionId=\{session\.id\}\s+event=\{activeEvent\}/u,
    );
    assert.match(css, /\.turnClock\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.turnClock > strong\s*\{[^}]*font-variant-numeric/u);
    assert.match(
      css,
      /\.turnClock\[data-status="overtime"\]\s*\{[^}]*#ff795f[^}]*animation:\s*debate-turn-clock-overtime/u,
    );
  });

  it("keeps in-room controls, paused copy, and confirmation actions legible in Light Mode", () => {
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog button/u,
    );
    assert.match(source, /className=\{styles\.confirmKeepButton\}/u);
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog \.confirmKeepButton/u,
    );
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog \.confirmDeleteButton/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.liveHeader \.exitButton,\s*\.live\[data-theme="light"\] \.proceedingControlActions button\s*\{[^}]*color:\s*#3b3343;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.stageStateOverlay > small\s*\{[^}]*color:\s*#5f5666/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.eyebrow\s*\{[^}]*color:\s*#6551b2/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.caseBoard > header span,[\s\S]*?\.live\[data-theme="light"\] \.audienceGallery > header small\s*\{[^}]*color:\s*#655c6d/u,
    );
  });

  it("treats proceedings and evidence as keyboard-operable app surfaces", () => {
    assert.match(source, /role="log"/u);
    assert.match(source, /aria-relevant="additions"/u);
    assert.match(source, /tabIndex=\{0\}/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(css, /:focus-visible/u);
  });

  it("uses in-app deletion, safe Markdown, and resilient follow-to-live presentation", () => {
    assert.doesNotMatch(source, /window\.confirm/u);
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /\/api\/prism\/actions\/undo/u);
    assert.match(source, /<ReactMarkdown/u);
    assert.match(source, /remarkPlugins=\{\[remarkGfm\]\}/u);
    assert.match(source, /skipHtml/u);
    assert.match(source, /debateEvidenceFromMarkdownHref/u);
    assert.match(source, /new ResizeObserver/u);
    assert.match(source, /debateTranscriptIsAtLive/u);
    assert.match(source, /↓ Live/u);
    assert.match(source, /cancelCurrentPresentation/u);
    assert.match(
      source,
      /event\.sequence < pausedPresentationEvent\.sequence/u,
    );
    assert.match(source, /lifecycle:\s*\{[\s\S]*onProgress/u);
    assert.match(page, /utterance\.lifecycle \?\? \{\}/u);
    assert.match(css, /\.transcriptMarkdown/u);
    assert.match(css, /\.returnToLiveButton/u);
  });

  it("keeps ordinary Participant interjections as a conversational floor break", () => {
    assert.match(source, /\/interject/u);
    assert.match(source, /Interject now/u);
    assert.match(source, /Conversational cut-in/u);
    assert.match(source, /The moderator will restore the scheduled floor/u);
    assert.match(source, /"interjection"/u);
    assert.match(source, /"moderator_ruling"/u);
    assert.match(source, /debateGalleryReactingIndices/u);
    assert.match(source, /data-listening-reaction/u);
    assert.match(source, /Moderator transition/u);
    assert.match(source, /className=\{styles\.floorStatus\}/u);
    assert.match(css, /\.interjectionBar/u);
    assert.match(css, /\.floorStatus/u);
  });

  it("lets a Participant shout first, then state or withdraw a persisted objection", () => {
    assert.match(source, /\/participant-objection`/u);
    assert.match(source, /\/participant-objection\/resolve/u);
    assert.match(source, /participantObjectionShortcutEnabledRef/u);
    assert.match(source, /event\.key\.toLocaleLowerCase\(\) !== "o"/u);
    assert.match(
      source,
      /input, textarea, select, button, a\[href\],[\s\S]{0,100}\[role="textbox"\]/u,
    );
    assert.match(source, /aria-keyshortcuts="O"/u);
    assert.match(source, />\s*Objection!\s*<kbd/u);
    assert.match(source, /cancelCurrentPresentation\(\)/u);
    assert.match(source, /participant_objection_reason/u);
    assert.match(source, /Objection raised/u);
    assert.match(source, /State the point/u);
    assert.match(
      source,
      /The floor is held\. The moderator will rule when you submit\./u,
    );
    assert.match(
      source,
      /What specifically is wrong with the claim, procedure, or cited evidence\?/u,
    );
    assert.match(source, />\s*Withdraw\s*</u);
    assert.match(source, />\s*Submit objection\s*</u);
    assert.match(
      source,
      /session\.stepKey === "participant_objection_reason"[\s\S]{0,140}session\.participantObjection\?\.status === "awaiting_reason"/u,
    );
    assert.match(
      source,
      /participantObjectionAwaitingReason[\s\S]{0,150}Resolve your objection first/u,
    );
    assert.match(
      source,
      /const previousEventIds = new Set\([\s\S]{0,180}!previousEventIds\.has\(event\.id\)/u,
    );
    assert.match(css, /\.participantFloorRail/u);
    assert.match(css, /\.participantObjectionButton/u);
    assert.match(css, /\.participantObjectionDock/u);
    assert.match(
      css,
      /\.participantObjectionActions button\s*\{[^}]*min-height:\s*44px/u,
    );
    assert.match(
      css,
      /@media \(forced-colors: active\)[\s\S]*?\.participantFloorRail/u,
    );
  });

  it("directs every Participant floor turn through the PRISM advocate podium", () => {
    assert.match(source, /function debateParticipantFloorRole/u);
    assert.match(
      source,
      /session\.playerRole !== "participant"[\s\S]{0,120}event\?\.speakerKind !== "player"/u,
    );
    assert.match(
      source,
      /const participantFloorRole = debateParticipantFloorRole\(\s*session,\s*activeEvent/u,
    );
    assert.match(
      source,
      /activeEvent\?\.speakerKind === "player" && participantPlayerBotId[\s\S]{0,100}\? participantPlayerBotId/u,
    );
    assert.match(
      source,
      /event\?\.kind === "objection" \|\| event\?\.kind === "interjection"/u,
    );
    assert.match(
      source,
      /data-participant-proxy=\{\s*playerControlled \? "true" : undefined/u,
    );
    assert.match(
      source,
      /playerControlled && participantCuttingIn[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /playerControlled && participantObjecting[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /session\.playerRole === "participant" &&\s*session\.playerSideId !== "against"\s*\? null/u,
    );
    assert.match(
      source,
      /session\.playerRole === "participant" &&\s*session\.playerSideId === "against"\s*\? null/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-participant-proxy="true"\]\[data-cut-in="true"\]/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-participant-proxy="true"\]\[data-objecting="true"\]/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,320}\.botStagePresence/u,
    );
    assert.doesNotMatch(source, /styles\.playerPresence/u);
    assert.doesNotMatch(css, /\.playerPresence/u);
  });

  it("names the selected Participant proxy after the account and casts only a Judge and opponent", () => {
    assert.equal(DEBATE_PLAYER_PARTICIPANT_BOT_ID, "prism:player-participant");
    assert.match(source, /const DEBATE_PLAYER_PARTICIPANT_PRISM/u);
    assert.match(source, /function debateParticipantPrismAvatar/u);
    assert.match(
      source,
      /id: DEBATE_PLAYER_JUDGE_BOT_ID,[\s\S]{0,160}role: "advocate"/u,
    );
    assert.match(
      source,
      /if \(event\.speakerKind === "player"\)[\s\S]{0,80}return playerName/u,
    );
    assert.match(
      source,
      /const participantInputRole:[\s\S]{0,180}!presenting[\s\S]{0,180}session\.status === "waiting_for_player"/u,
    );
    assert.match(
      source,
      /const activeRole:[\s\S]{0,100}participantInputRole \?\?/u,
    );
    assert.match(
      source,
      /session\.phase === "opening"[\s\S]{0,100}"Deliver your opening"[\s\S]{0,100}session\.phase === "closing"[\s\S]{0,100}"Deliver your closing"/u,
    );
    assert.match(
      source,
      /participantInputRole && participantPlayerBotId[\s\S]{0,80}\? participantPlayerBotId/u,
    );
    assert.match(
      source,
      /const appearanceBot = playerControlled\s*\? participantPrismBot/u,
    );
    assert.match(
      source,
      /const playerName = props\.playerName\.trim\(\) \|\| "You"/u,
    );
    assert.match(
      source,
      /name:\s*playerName,[\s\S]{0,180}player-controlled visual proxy/u,
    );
    assert.match(
      page,
      /playerName=\{user\?\.displayName\?\.trim\(\) \|\| "You"\}/u,
    );
    assert.match(
      source,
      /fixedParticipantAdvocate[\s\S]{0,260}playerParticipantBot/u,
    );
    assert.match(
      source,
      /playerRole === "participant"\s*\? \["moderator", participantOpponentCastSlot\]/u,
    );
    assert.match(
      source,
      /playerRole === "participant" && playerSideId === "for"\s*\? undefined\s*: cast\.forAdvocate/u,
    );
    assert.match(
      source,
      /playerRole === "participant" && playerSideId === "against"\s*\? undefined\s*: cast\.againstAdvocate/u,
    );
    assert.match(source, /Participant is available in Forum only\./u);
    assert.match(
      source,
      /const participantForumOnly =\s*playerRole === "participant" && option\.id === "turnabout"/u,
    );
    assert.match(
      source,
      /disabled=\{role === "participant" && format !== "forum"\}/u,
    );
    assert.match(source, /function debateParticipantModeratorTitle/u);
    assert.match(source, /`\$\{normalized\} · Judge`/u);
    assert.match(
      css,
      /\.botIdentityPosition\[data-participant-proxy="true"\] \.botIdentityPlate/u,
    );
    assert.doesNotMatch(source, /Pass to partner/u);
    assert.doesNotMatch(source, /partner/iu);
    assert.doesNotMatch(source, /challenge_participant_partner/u);
    assert.doesNotMatch(source, /rebuttal_(?:against|for)_partner/u);
  });

  it("unifies audience order and semantic intervention behind one contextual gavel", () => {
    assert.match(source, /\/judge-gavel`/u);
    assert.match(source, /\/judge-gavel\/order`/u);
    assert.match(source, /\/judge-gavel\/message`/u);
    assert.match(source, /data-tutorial-target="debate-judge-gavel"/u);
    assert.match(source, /const judgeCanCallTime =/u);
    assert.match(source, /activeTurnClock\?\.status === "overtime"/u);
    assert.match(source, /const judgeUnifiedGavelAction =/u);
    assert.match(source, /judgeGavelInterventionEligibleNow/u);
    assert.match(source, /\? \("call-time" as const\)/u);
    assert.match(source, /\? "Call time"/u);
    assert.match(source, /\? "Intervene"/u);
    assert.doesNotMatch(source, /className=\{styles\.judgeInterveneButton\}/u);
    assert.match(source, /judgeGavelCooldownRemainingMs/u);
    assert.match(source, /debateJudgeGavelCooldownBlocks/u);
    assert.match(source, /overtime: judgeCanCallTime/u);
    assert.match(source, /debateJudgeGavelSpaceAction/u);
    assert.match(
      source,
      /interventionAvailable:\s*context\.interventionAvailable/u,
    );
    assert.match(source, /orderAvailable:\s*context\.orderAvailable/u);
    assert.match(source, /blockedNotice:\s*judgeGavelShortcutBlockedNotice/u);
    assert.match(source, /setAutoRecoveryNotice\(context\.blockedNotice\)/u);
    assert.match(source, /data-space-shortcut="true"/u);
    assert.match(source, /gavelShortcutTarget\?\.blur\(\)/u);
    assert.match(source, /Intervention cooling/u);
    assert.match(source, /Gavel still settles gallery/u);
    assert.match(css, /\.judgeGavelCooldownStatus\s*\{/u);
    assert.match(
      css,
      /\.judgeGavelButton\[data-cooling="true"\]\s*\{[^}]*animation:\s*none/u,
    );
    assert.match(
      source,
      /const debateFloorMutationInFlightRef = useRef\(false\)/u,
    );
    assert.match(
      source,
      /busy \|\|\s*audienceOrderSavingRef\.current \|\|\s*debateFloorMutationInFlightRef\.current/u,
    );
    assert.match(source, /event\.currentTarget\.blur\(\)/u);
    assert.match(source, /<kbd aria-hidden="true">Space<\/kbd>/u);
    assert.match(
      source,
      /action === "smash"[\s\S]{0,180}judgeGavelSmashShowmanshipKindRef\.current[\s\S]{0,80}return/u,
    );
    assert.match(
      source,
      /action === "smash"[\s\S]{0,260}orderDebateAudienceRef\.current/u,
    );
    assert.match(
      source,
      /action === "intervene"[\s\S]{0,120}swingJudgeGavelRef\.current/u,
    );
    assert.match(
      source,
      /judgeGavelSmashUntilRef\.current =\s*Date\.now\(\) \+ DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS/u,
    );
    assert.match(
      source,
      /suppressNextJudgeGavelPresentationCueRef\.current = true/u,
    );
    assert.match(
      source,
      /judgeGavelOvertimeBurstActiveRef\.current = overtime/u,
    );
    assert.match(source, /judgeGavelOvertimeStrikeCountRef\.current \+= 1/u);
    assert.match(
      source,
      /window\.setTimeout\(resolve, DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS\)/u,
    );
    assert.match(source, /strikeCount,/u);
    assert.match(
      source,
      /judgeGavelSmashCue \?\? \(presenting \? liveGavelCue : null\)/u,
    );
    assert.match(source, /Address the debaters/u);
    assert.match(source, /Resume without message/u);
    assert.match(source, /Send to the floor/u);
    assert.match(source, /DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH/u);
    assert.match(
      source,
      /event\.kind === "judge_gavel" &&\s*event\.gavelReason === "intervention"[\s\S]{0,260}speechTiming:\s*null/u,
    );
    assert.match(page, /debateJudgeGavelVoiceMood\(utterance\.event\)/u);
    assert.match(source, /data-tutorial-target="debate-proceeding-controls"/u);
    assert.match(source, /Judge proceeding controls/u);
    assert.match(
      source,
      />\s*\{session\.status === "paused" \? "Resume" : "Pause"\}\s*</u,
    );
    assert.match(source, /\?\s*"Skip deliberation"\s*:\s*"End debate"/u);
    assert.doesNotMatch(source, /className=\{styles\.liveControls\}/u);
    assert.doesNotMatch(source, /pauseOnGavelCooldown/u);
    assert.match(
      source,
      /const lifecycleControlGavel =[\s\S]{0,220}event\.stepKey === "pause"[\s\S]{0,80}event\.stepKey === "resume"[\s\S]{0,100}event\.gavelReason === "audience_order"/u,
    );
    assert.match(
      source,
      /options\.automaticJudgeGavel !== true[\s\S]{0,120}!lifecycleControlGavel/u,
    );
    assert.ok(
      (source.match(/automaticJudgeGavel:\s*true/gu) ?? []).length >= 2,
      "Pause and interrupted-presentation Resume must both make lifecycle gavel presentation automatic",
    );
    assert.match(css, /\.proceedingControls/u);
    assert.match(css, /\.proceedingControlActions/u);
    assert.match(css, /\.judgeGavelButton/u);
    assert.doesNotMatch(css, /\.judgeInterveneButton/u);
    assert.match(css, /\.judgeGavelButton kbd/u);
    assert.match(css, /@keyframes debate-judge-gavel-ready/u);
    assert.match(css, /\.playerWindow\[data-kind="judge-gavel"\]/u);
    assert.match(css, /\.floorStatus\[data-kind="judge_gavel"\]/u);
    assert.match(source, /Choose a Judge intervention/u);
    assert.match(source, /submitJudgeQuickChoice/u);
    assert.doesNotMatch(source, /choice\.action === "end"/u);
    assert.match(
      source,
      /className=\{styles\.endEarlyButton\}[\s\S]{0,100}data-action="end"/u,
    );
    assert.match(source, /Final authority/u);
    assert.match(source, /End this Debate\?/u);
    assert.match(source, /function debateJudgeGavelLockedForJury/u);
    assert.match(
      source,
      /const judgeGavelJuryLocked =\s*debateJudgeGavelLockedForJury\(activeSession\) \|\|[\s\S]{0,100}judgeGavelActiveTarget\?\.speakerKind === "juror"/u,
    );
    assert.match(
      source,
      /ceremonialAvailable:\s*!judgeGavelJuryLocked &&[\s\S]{0,120}objectionRuling\?\.status !== "awaiting_ruling" &&[\s\S]{0,80}judgeGavelCeremony\?\.status === "ready"/u,
    );
    assert.match(
      source,
      /debateJudgeGavelLockedForJury\(previous\)[\s\S]{0,100}previous\.judgeGavel\?\.status/u,
    );
    assert.match(
      source,
      /previous\.objectionRuling\?\.status === "awaiting_ruling"/u,
    );
    assert.match(
      source,
      /activeSession\.objectionRuling\?\.status !== "awaiting_ruling"/u,
    );
    assert.match(
      source,
      /const judgeGavelCeremonyReady =\s*!judgeJuryGavelLocked/u,
    );
    assert.match(
      source,
      /session\.status !== "paused" &&\s*!judgeJuryGavelLocked/u,
    );
    assert.match(source, /!judgeObjectionAwaitingRuling/u);
  });

  it("persists and replays audience order without cancelling the live floor", () => {
    const orderStart = source.indexOf(
      "const orderDebateAudience = async (): Promise<void> =>",
    );
    const semanticStart = source.indexOf(
      "const swingJudgeGavel = async",
      orderStart,
    );
    assert.ok(orderStart >= 0 && semanticStart > orderStart);
    const orderSource = source.slice(orderStart, semanticStart);
    assert.match(orderSource, /\/judge-gavel\/order`/u);
    assert.match(orderSource, /heardCharacterCount/u);
    assert.match(orderSource, /setActiveSession/u);
    assert.doesNotMatch(orderSource, /cancelCurrentPresentation/u);
    assert.doesNotMatch(orderSource, /onStopUtterance/u);
    assert.doesNotMatch(orderSource, /setPresenting\(false\)/u);
    assert.match(
      source,
      /activeSession\.status !== "live" \|\|[\s\S]{0,120}audienceOrderSaving \|\|[\s\S]{0,100}presenting/u,
    );
    assert.match(source, /const linkedAudienceOrderCues = new Map/u);
    assert.match(
      source,
      /event\.gavelHeardCharacterCount === undefined[\s\S]{0,240}linkedAudienceOrderCues\.set/u,
    );
    assert.match(
      source,
      /const performLinkedAudienceOrderCues =[\s\S]{0,420}visibleCharacterCount < \(cue\.gavelHeardCharacterCount/u,
    );
    assert.match(
      source,
      /revealEventSilently\(\s*event,\s*spokenText,\s*performLinkedAudienceOrderCues,\s*\)/u,
    );
    assert.match(source, /data-audience-order-response=/u);
    assert.match(source, /returningRoomTone:\s*true/u);
  });

  it("performs a missed Judge gavel cue as a silent camera beat", () => {
    assert.match(
      source,
      /gavelCue &&[\s\S]{0,120}next\.playerRole === "judge"[\s\S]{0,180}requestJudgeGavelCeremonyRef\.current\?\.\(gavelCue\)[\s\S]{0,100}gavelCue = null/u,
    );
    assert.match(source, /data-debate-judge-gavel-cue="true"/u);
    assert.match(source, /The room is waiting on you\./u);
    assert.doesNotMatch(source, /An awkward beat hangs\./u);
    assert.doesNotMatch(source, /No gavel falls\. The bots carry on anyway\./u);
    assert.match(source, /setJudgeGavelMissedCameraView\(/u);
    assert.match(
      source,
      /missed-gavel-camera[\s\S]{0,180}\? "left"\s*: "right"/u,
    );
    assert.match(
      source,
      /setJudgeGavelMissedCameraView\("moderator"\)[\s\S]{0,180}Math\.floor\(DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS \/ 2\)/u,
    );
    assert.match(
      source,
      /judgeGavelCeremony\?\.status === "missed"[\s\S]{0,120}judgeGavelMissedCameraView/u,
    );
    assert.match(
      source,
      /\{judgeGavelCeremony && !judgeJuryGavelLocked \? \(\s*judgeGavelCeremony\.status === "ready" \? \(/u,
    );
    assert.match(
      source,
      /status: "missed"[\s\S]{0,700}finishJudgeGavelCeremony\(gate, false\)/u,
    );
    assert.match(
      source,
      /const strikeJudgeGavelCeremony =[\s\S]{0,420}triggerJudgeGavelSmash\(gate\.cue\.kind\)/u,
    );
    assert.match(
      source,
      /action === "cue"[\s\S]{0,100}strikeJudgeGavelCeremonyRef\.current\?\.\(\)[\s\S]{0,80}return/u,
    );
    assert.match(css, /\.stageStateOverlay\[data-kind="gavel-cue"\]/u);
    assert.match(css, /@keyframes debate-judge-gavel-cue-window/u);
  });

  it("does not let the case board reveal a claim before the room hears it", () => {
    assert.match(source, /function debateCaseBoardAtSequence/u);
    assert.match(source, /event\.sequence <= visibleThroughSequence/u);
    assert.match(source, /Scoreless · heard speech only/u);
    assert.match(
      source,
      /debateCaseBoardAtSequence\(\s*activeSession,\s*transcriptVisibleThroughSequence/u,
    );
  });

  it("uses the camera audience instead of the legacy generic glyph gallery", () => {
    assert.doesNotMatch(source, /7 of many · nonbinding/u);
    assert.doesNotMatch(source, /Nonbinding gallery sample/u);
    assert.match(source, /className=\{styles\.debateAudienceRow\}/u);
  });

  it("keeps the full audience look while stabilizing low-cost portrait effects", () => {
    assert.match(
      source,
      /const liveAudienceBots = useMemo\([\s\S]*debateAudienceBotsForSession\(\{/u,
    );
    assert.match(
      source,
      /count:\s*debateAudienceBotCount\(props\.graphicsQuality\)/u,
    );
    assert.match(
      source,
      /const liveAudienceCastKey = activeSession[\s\S]{0,220}activeSession\.moderator\.id[\s\S]{0,240}activeSession\.jury\.jurors\.map/u,
    );
    assert.match(
      source,
      /excludedBotIds:\s*liveAudienceCastKey\.split\("\\0"\)/u,
    );
    assert.match(
      source,
      /memo\(function DebateAudiencePortrait[\s\S]*talking: liveVocalReaction/u,
    );
    assert.match(source, /className=\{styles\.debateAudienceRow\}/u);
    assert.match(
      source,
      /data-audience-count=\{props\.audienceSeats\.length\}/u,
    );
    assert.match(source, /DebateLiveAudienceGallery/u);
    assert.match(
      source,
      /const audiencePressureBandTrue:[\s\S]{0,160}currentAudiencePressureBand/u,
    );
    assert.match(
      source,
      /debateAudienceVisualPressureBand\([\s\S]{0,80}audiencePressureBandTrue[\s\S]{0,40}debateMaterialQuality/u,
    );
    assert.match(
      source,
      /debateAudienceTalkerIndices\(\{[\s\S]{0,160}audienceBots\.length/u,
    );
    assert.match(
      source,
      /const audienceChattering =[\s\S]{0,140}audiencePressureBand !== "settled"/u,
    );
    assert.match(
      source,
      /data-audience-chattering=\{props\.audienceChattering \? "true" : "false"\}/u,
    );
    assert.doesNotMatch(
      source,
      /const audienceChattering =\s*props\.audioEnabled/u,
    );
    assert.match(source, /debateAudienceConversationFacing\(/u);
    assert.match(source, /debateAudienceSeatLayout\(/u);
    assert.match(source, /debateAudienceSeatIsTalker\(/u);
    assert.match(
      source,
      /\(\["rear", "front"\] as const\)\.map\(\(depthRow\)/u,
    );
    assert.match(source, /data-depth-row=\{depthRow\}/u);
    assert.match(source, /data-conversation-facing=\{conversationFacing\}/u);
    assert.match(source, /className=\{styles\.debateAudienceChatterChip\}/u);
    assert.match(source, /role:\s*"audience"/u);
    assert.match(source, /compact:\s*true/u);
    assert.match(source, /foleyMouthShape/u);
    assert.doesNotMatch(
      source,
      /!juryChamberVisible \? \([\s\S]{0,180}debateAudienceRow/u,
    );
    assert.match(source, /data-audience-placement="below-screen"/u);
    assert.match(
      source,
      /data-audience-pressure=\{props\.audiencePressureAttr \?\? undefined\}/u,
    );
    assert.match(source, /data-audience-order-response=/u);
    assert.match(
      css,
      /\.debateAudienceRow\s*\{[^}]*position:\s*relative[^}]*z-index:\s*1/u,
    );
    const audiencePortraitRule =
      css.match(/\.debateAudienceBotPortrait\s*\{[^}]*\}/u)?.[0] ?? "";
    assert.doesNotMatch(audiencePortraitRule, /filter:/u);
    assert.match(
      css,
      /\.debateAudienceBotPortrait::before\s*\{[^}]*--debate-audience-shade-opacity/u,
    );
    assert.match(
      css,
      /\.debateAudienceBotPortrait\[data-conversation-facing="right"\]\s*\{[^}]*--debate-audience-facing-scale:\s*-1/u,
    );
    assert.match(
      css,
      /\.debateAudienceLayer\[data-depth-row="rear"\]\s*\{[^}]*opacity:\s*0\.5/u,
    );
    assert.match(css, /\.debateAudienceChatterChip\s*\{/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-mouth-crosstalk/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-head-crosstalk/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-cascade-hush/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-awkward-glance/u);
    assert.match(page, /debateAudienceBotIsGenerated\(botSnapshot\)/u);
    assert.match(
      page,
      /randomBotFaceStyle\(\s*debateAudienceRandom\(`face:\$\{botSnapshot\.id\}`\)/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-role="audience"\]/u,
    );
    assert.match(
      page,
      /const staticAudiencePortrait = avatarState\.role === "audience"/u,
    );
    assert.match(page, /blinkEnabled=\{false\}/u);
    assert.match(page, /runtimeEffectsEnabled=\{!staticAudiencePortrait\}/u);
    assert.match(page, /motionActive=\{[\s\S]{0,120}!staticAudiencePortrait/u);
    assert.match(
      source,
      /Keep the authored audience portrait static during ambient chatter/u,
    );
    assert.match(source, /data-vocal-reaction=/u);
  });

  it("uses a persistent five-seat Jury camera with a lower foreground table and ballot pile", () => {
    assert.match(source, /session\.jury\.jurors\.map/u);
    assert.match(
      source,
      /renderJuryChamber\(session, activeEvent, juryThinkingBotId\)/u,
    );
    assert.match(
      source,
      /src=\{`\/coffee-table\/table_\$\{props\.theme\}\.png`\}/u,
    );
    assert.match(source, /className=\{styles\.juryChamberBots\}/u);
    assert.match(source, /className=\{styles\.juryTableRaster\}/u);
    assert.match(source, /className=\{styles\.juryCenterTranscript\}/u);
    assert.match(source, /className=\{styles\.juryBallotPile\}/u);
    assert.match(source, /className=\{styles\.juryBallotSlip\}/u);
    assert.match(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,260}cameraMode === "jury"/u,
    );
    assert.match(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,260}session\.playerRole === "spectator"[\s\S]{0,80}session\.playerRole === "judge"/u,
    );
    assert.doesNotMatch(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,360}cameraMode === "auto"/u,
    );
    assert.match(
      source,
      /session\.jury\.phase === "waiting"[\s\S]{0,180}follows the public floor/u,
    );
    assert.match(
      source,
      /!juryCameraActive[\s\S]{0,180}event\.kind === "jury_deliberation"/u,
    );
    assert.match(
      source,
      /event\.kind === "ballot" &&\s*event\.speakerKind !== "juror"[\s\S]{0,180}\?\.privateReason/u,
    );
    assert.doesNotMatch(
      source,
      /if \(event\.kind === "ballot" && event\.speakerKind === "juror"\) \{[\s\S]{0,180}continue;/u,
    );
    assert.match(
      source,
      /final Jury reasons[\s\S]{0,180}same caption, mouth, and voice path as deliberation/u,
    );
    assert.match(
      source,
      /No juror speech, reaction, voice, or individual ballot/u,
    );
    assert.match(source, /!participantJurySealed/u);
    assert.match(source, /After the verdict/u);
    assert.match(
      source,
      /session\.status === "completed" &&[\s\S]{0,80}!presenting[\s\S]{0,80}!juryChamberVisible/u,
    );
    assert.match(
      source,
      /session\.status === "completed" && !presenting \? \(/u,
    );
    assert.match(
      source,
      /session\.status === "waiting_for_player" &&[\s\S]{0,120}judgeGuidedStep === null \? \(/u,
    );
    assert.match(source, /step === "jury_closing_moderator"/u);
    assert.match(
      page,
      /frozenVoiceProfile:\s*usePlayerVoice\s*\?\s*null\s*:\s*\(utterance\.speaker\?\.voiceProfile \?\? null\)/u,
    );
    assert.match(
      page,
      /frozenVoiceProfile \?\?[\s\S]{0,100}settings\.prismDefaultBotAudioVoiceProfile/u,
    );
    assert.match(css, /\.juryChamberBots\s*\{[^}]*z-index:\s*2/u);
    assert.match(
      css,
      /\.juryTableRaster\s*\{[^}]*top:\s*-8%[^}]*z-index:\s*3/u,
    );
    assert.match(css, /\.juryBallotPile\s*\{[^}]*z-index:\s*5/u);
    assert.match(css, /@keyframes jury-ballot-cast/u);
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="0"\]\s*\{[^}]*left:\s*50%[^}]*top:\s*50%[^}]*width:\s*clamp\(138px,\s*12\.8vw,\s*200px\)/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="1"\]\s*\{[^}]*left:\s*27%[^}]*top:\s*56%[^}]*width:\s*clamp\(146px,\s*13\.5vw,\s*210px\)/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="4"\]\s*\{[^}]*left:\s*87%[^}]*top:\s*64%/u,
    );
    assert.doesNotMatch(css, /\.juryChamberSeat\[data-seat="5"\]/u);
    assert.match(
      css,
      /\.juryBallotSlip\[data-seat="0"\]\s*\{[^}]*--jury-ballot-start-y:\s*-26vh/u,
    );
    assert.match(
      css,
      /\.juryBallotSlip\[data-seat="4"\]\s*\{[^}]*--jury-ballot-start-x:\s*33vw[^}]*--jury-ballot-start-y:\s*-14vh/u,
    );
    assert.match(css, /\.juryCenterTranscript\s*\{[^}]*z-index:\s*5/u);
    assert.match(
      css,
      /\.live\[data-jury-chamber="true"\]\s+\.forum\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*1/u,
    );
    assert.doesNotMatch(css, /height:\s*calc\(100dvh - 58px\)/u);
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/coffee-table/table_light.png", import.meta.url),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/coffee-table/table_dark.png", import.meta.url),
        ),
      ),
      true,
    );
  });

  it("keeps the Participant Jury anonymous and renders the canonical five votes", () => {
    assert.equal(DEBATE_JURY_SIZE, 5);
    assert.match(
      source,
      /participantView\s*\? Array\.from\(\{ length: DEBATE_JURY_SIZE \}/u,
    );
    assert.match(source, /data-anonymous="true"/u);
    assert.match(source, /Anonymous Jury seat \$\{index \+ 1\}/u);
    assert.match(
      source,
      /session\.playerRole === "participant"[\s\S]{0,100}Array\.from\(\{ length: DEBATE_JURY_SIZE \}/u,
    );
    assert.doesNotMatch(source, /Array\.from\(\{ length: 7 \}/u);
    assert.match(
      css,
      /\.juryRosterSeats\s*\{[^}]*grid-template-columns:\s*repeat\(5,/u,
    );
    assert.match(css, /\.juryRosterSeats > span\[data-anonymous="true"\]/u);
  });

  it("queues the latest juror thought and keeps Jury comments out of Proceedings", () => {
    assert.match(source, /debateLatestPendingJuryComment/u);
    assert.match(source, /className=\{styles\.juryThoughtChip\}/u);
    assert.match(
      source,
      /markJuryCommentPlayed\(pendingJuryComment\.id\)[\s\S]{0,700}consumeNewEvents\(beforeComment, throughComment, runId\)/u,
    );
    assert.match(
      source,
      /!debateEventIsJuryComment\(event\)[\s\S]{0,180}transcriptVisibleThroughSequence/u,
    );
    assert.match(source, /data-tutorial-target="debate-jury-record"/u);
    assert.match(source, /Timestamped · separate from proceedings/u);
    assert.match(source, /Copy Jury transcript/u);
    assert.match(source, /debateArchivedJuryRecordIsCopyable\(session\)/u);
    assert.match(
      source,
      /copyArchivedJuryRecord\(session\)[\s\S]{0,180}Copy Jury transcript for/u,
    );
    assert.match(
      source,
      /\/api\/debates\/\$\{encodeURIComponent\(archived\.id\)\}\?perspective=replay/u,
    );
    assert.match(css, /\.archiveJuryCopyButton/u);
    assert.match(css, /\.juryThoughtChip/u);
    assert.match(css, /\.juryRecord/u);
  });

  it("crops the live Forum and Jury chamber to the same cinematic viewport", () => {
    assert.match(
      css,
      /\.forum\s*\{[^}]*width:\s*100%[^}]*min-height:\s*0[^}]*aspect-ratio:\s*2\s*\/\s*1/u,
    );
    assert.match(
      source,
      /className=\{styles\.forum\}\s+data-debate-stage-viewport="live"/u,
    );
  });

  it("uses authored receivers and raster-aligned alpha light masks", () => {
    assert.match(css, /forum-dark\.webp/u);
    assert.match(css, /forum-light\.webp/u);
    assert.match(css, /forum-dark-foreground\.png/u);
    assert.match(css, /forum-light-foreground\.png/u);
    assert.match(css, /\.botPosition\s*\{[^}]*z-index:\s*3/u);
    assert.match(css, /\.podiumForeground\s*\{[^}]*z-index:\s*4/u);
    assert.match(
      css,
      /\.lightMaskFor,[\s\S]*?\.lightMaskModerator\s*\{[^}]*inset:\s*0[^}]*z-index:\s*2/u,
    );
    assert.match(
      css,
      /\.lightMaskForeground\s*\{[^}]*z-index:\s*5[^}]*forum-light-mask-foreground\.png/u,
    );
    assert.match(
      css,
      /-webkit-mask-image:\s*url\("\/debate\/forum-light-mask\.png"\)/u,
    );
    assert.match(
      css,
      /mask-image:\s*url\("\/debate\/forum-light-mask\.png"\)/u,
    );
    assert.match(css, /mask-size:\s*cover/u);
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?:is\(\.lightMaskFor,\s*\.lightMaskAgainst\)\s*\{[^}]*opacity:\s*0/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.lightMaskModerator\s*\{[^}]*background:\s*var\(--debate-moderator-color\)[^}]*moderator-light-mask\.png/u,
    );
    assert.match(source, /className=\{styles\.podiumForeground\}/u);
    assert.match(source, /<DebateForumLightMasks depth="backdrop" \/>/u);
    assert.match(source, /<DebateForumLightMasks depth="foreground" \/>/u);
    assert.match(
      source,
      /className=\{`\$\{styles\.lightMaskFor\}\$\{foregroundClass\}`\}/u,
    );
    assert.match(
      source,
      /className=\{styles\.podiumForeground\}[\s\S]{0,120}<DebateForumLightMasks depth="foreground" \/>/u,
    );
    assert.match(source, /data-active-role=\{activeRole \?\? undefined\}/u);
    assert.doesNotMatch(source, /<DebateForumScene/u);
    assert.doesNotMatch(css, /\.lightMaskFor\s*\{[^}]*clip-path:\s*polygon/u);
    assert.doesNotMatch(
      css,
      /\.lightMaskAgainst\s*\{[^}]*clip-path:\s*polygon/u,
    );
    assert.doesNotMatch(
      css,
      /\.lightMaskModerator\s*\{[^}]*clip-path:\s*polygon/u,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/debate/forum-light-mask.png", import.meta.url),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/moderator-light-mask.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/forum-light-mask-foreground.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/moderator-light-mask-foreground.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.match(
      css,
      /mix-blend-mode:\s*var\(--debate-light-blend-mode-dark,\s*hard-light\)/u,
    );
    assert.match(
      css,
      /mix-blend-mode:\s*var\(--debate-light-blend-mode-light,\s*color\)/u,
    );
    assert.match(forumSceneSource, /blendMode:\s*"hard-light"/u);
    assert.match(css, /prefers-reduced-motion/u);
  });

  it("renders the actual animated bot bodies with a glyph-only fallback", () => {
    assert.match(source, /props\.renderBotAvatar\(appearanceBot/u);
    assert.match(source, /className=\{styles\.botStagePresence\}/u);
    assert.match(source, /className=\{styles\.botGlyphFallback\}/u);
    assert.match(
      page,
      /renderBotGlyph=\{\(glyph, options\) => \([\s\S]{0,180}size=\{options\.size\}[\s\S]{0,120}strokeWidth=\{options\.strokeWidth\}/u,
    );
    assert.match(page, /renderBotAvatar=\{\(botSnapshot, avatarState\) => \{/u);
    assert.match(page, /<ZenLiveBotMannequin/u);
    assert.match(
      page,
      /showThinkingSpinner=\{\s*avatarState\.thinking && !avatarState\.compact\s*\}/u,
    );
    assert.match(page, /isTalking=\{debateMouthActive\}/u);
    assert.match(
      page,
      /avatarDetails=\{\s*playerJudgePrism\s*\?\s*null\s*:\s*botSnapshot\.avatarDetails\s*\}/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\s*\{[^}]*--zen-live-bot-avatar-size:\s*100%[^}]*--zen-live-bot-face-y:\s*43\.8%[^}]*--zen-live-bot-face-scale:\s*1\.68/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-role="moderator"\]:not\(\s*\[data-debate-compact="true"\]\s*\)\s*\.coffeeSeatPlateEmoji:not\(\[data-face-eye-character\]\)\s*\{[^}]*--zen-live-bot-eye-local-x:\s*0\.5/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\s*\{[^}]*--coffee-bot-color:\s*var\(--bot-color,\s*var\(--accent\)\)/u,
    );
  });

  it("keeps compact moderators on the registered avatar geometry and inset turn-owned podium screens", () => {
    assert.match(source, /debateTurnOwnerBotId\(\{/u);
    assert.match(
      source,
      /thinkingBotId,\s*presenting,\s*presentationSpeakerBotId:\s*activeSpeakerId/u,
    );
    assert.match(
      source,
      /compact:\s*role === "moderator" &&\s*cameraView !== "moderator"/u,
    );
    assert.match(source, /compact:\s*role === "moderator"/u);
    assert.match(source, /className=\{styles\.podiumGlyphPosition\}/u);
    assert.match(source, /className=\{styles\.podiumGlyphScreen\}/u);
    assert.match(
      source,
      /data-turn-active=\{\s*turnOwnerBotId === bot\.id \? "true" : undefined/u,
    );
    assert.match(source, /lookAtRole:/u);
    assert.match(page, /const moderatorLookAtRole =/u);
    assert.match(
      page,
      /moderatorLookAtRole === "for"[\s\S]*moderatorLookAtRole === "against"/u,
    );
    assert.match(
      page,
      /data-debate-compact=\{\s*avatarState\.compact \? "true" : undefined/u,
    );
    assert.match(
      page,
      /detailLevel=\{\s*staticAudiencePortrait \? "audience" : "debate"\s*\}/u,
    );
    assert.match(
      source,
      /data-debate-stage-compact=\{\s*role === "moderator" &&\s*cameraView !== "moderator"\s*\? "true"/u,
    );
    assert.match(
      source,
      /data-debate-stage-compact=\{\s*role === "moderator" &&\s*stageAlignmentPreviewCamera !== "moderator"\s*\? "true"/u,
    );
    assert.match(
      page,
      /<ZenLiveBotMannequin[\s\S]{0,180}faceScaleY=\{faceScaleY\}/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*(?:--zen-live-bot-avatar-body-size|--zen-live-bot-face-y|--zen-live-bot-face-scale)/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s+\.zenLiveBotPresenceBody\[data-avatar-details-visuals="true"\]\s*\{/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-debate-stage-compact="true"\]\s*\{[^}]*position:\s*relative[^}]*aspect-ratio:\s*1/u,
    );
    assert.match(
      pageCss,
      /:global\(\[data-debate-stage-compact="true"\]\)\s*>\s*\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*position:\s*absolute[^}]*width:\s*215\.054%[^}]*translateX\(-50%\) scale\(0\.465\)[^}]*transform-origin:\s*50% 100%/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*--bot-ambient-hover-amplitude:\s*0\.5px/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate \.botFaceFrameLed\s*\{[^}]*background:\s*var\(--coffee-bot-color\)[^}]*mask-image:\s*url\("\/bot-frame\/bot-frame-led\.png\?v=1000"\)[^}]*drop-shadow/u,
    );
    assert.match(
      page,
      /\.\.\.botAccentStyle\(\s*playerJudgePrism\s*\?\s*PRISM_DEFAULT_ACCENT\s*:\s*\(botSnapshot\.color \?\? PRISM_DEFAULT_ACCENT\),\s*resolvedTheme,\s*\)/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s+\.botFaceFrame[\s\S]*?display:\s*none/u,
    );
    assert.match(css, /\.podiumGlyphPosition\s*\{[^}]*z-index:\s*5/u);
    assert.match(css, /\.podiumGlyphPosition\s*\{[^}]*opacity:\s*1/u);
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="for"\]\s*\{[^}]*left:\s*calc\(16\.5% \+ var\(--debate-for-glyph-offset-x,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="against"\]\s*\{[^}]*left:\s*calc\(83\.5% \+ var\(--debate-against-glyph-offset-x,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphScreen\s*\{[^}]*background:[\s\S]*?linear-gradient\(145deg,\s*#17191f/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="for"\]\s+\.podiumGlyphScreen\s*\{[^}]*rotateY\(18deg\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="against"\]\s+\.podiumGlyphScreen\s*\{[^}]*rotateY\(-18deg\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="moderator"\]\s+\.podiumGlyphScreen\s*\{[^}]*scale\(0\.5\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?\.podiumGlyphPosition\[data-role="moderator"\][\s\S]*?\.podiumGlyphScreen\s*\{[^}]*scale\(1\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s*\{[^}]*drop-shadow\(\s*0 0 18px color-mix\(in srgb, currentColor 38%, transparent\)\s*\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s+\.podiumGlyphScreen\s*\{[^}]*radial-gradient\([\s\S]*?currentColor 58%/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s+\.podiumGlyphMark\s*\{[^}]*filter:\s*none/u,
    );
  });

  it("keeps non-Judge ambience while pressure-mixing the Judge audience", () => {
    assert.match(source, /<SessionAtmosphereLayer/u);
    assert.match(source, /backgroundUrl=\{DEBATE_AUDIENCE_MURMUR_URL\}/u);
    assert.match(
      source,
      /grainUrl=\{[\s\S]{0,120}DEBATE_AUDIENCE_CROSSTALK_URL/u,
    );
    assert.match(
      source,
      /const DEBATE_AUDIENCE_IDLE_MIX = \{[\s\S]{0,100}background:\s*0\.42/u,
    );
    assert.match(
      source,
      /const DEBATE_AUDIENCE_DUCKED_MIX = \{[\s\S]{0,100}background:\s*0\.1/u,
    );
    assert.match(
      source,
      /audiencePressureBandTrue === null[\s\S]{0,60}\? 320[\s\S]{0,180}\? 4_000[\s\S]{0,80}: 90[\s\S]{0,40}: 900/u,
    );
    assert.match(
      source,
      /debateAudiencePressureMix\(audiencePressureBandTrue\)/u,
    );
    assert.match(source, /DEBATE_AUDIENCE_AGITATION_URL/u);
    assert.match(source, /ambientFoleyUrls=\{DEBATE_AUDIENCE_FOLEY_URLS\}/u);
    assert.doesNotMatch(source, /backgroundRoomAcoustics=\{/u);
    assert.match(source, /DEBATE_AMBIENT_FOLEY_PROFILE/u);
    assert.match(source, /DEBATE_VOCAL_FOLEY_PROFILE/u);
    assert.match(source, /minDelayMs: 14_000/u);
    assert.match(source, /maxDelayMs: 32_000/u);
    assert.match(source, /minDelayMs: 22_000/u);
    assert.match(source, /maxDelayMs: 46_000/u);
    assert.match(
      source,
      /ambientFoleyProfile=\{DEBATE_AMBIENT_FOLEY_PROFILE\}/u,
    );
    assert.match(
      source,
      /deferFoley=\{debateIdentPlaying !== null \|\| \(busy && !presenting\)\}/u,
    );
    assert.match(source, /ambientBotVocalizations/u);
    assert.match(source, /debateVocalFoleyTargetId\(\{/u);
    assert.match(
      source,
      /const visibleFoleyParticipants = juryChamberVisible/u,
    );
    assert.match(source, /active: juror\.id === activeSpeakerId/u);
    assert.match(source, /hardMuted:/u);
    assert.match(source, /data-vocal-foley/u);
    assert.match(page, /avatarState\.foleyMouthShape \?\? "closed"/u);
    assert.match(page, /const DEBATE_THINKING_SFX_MIX_GAIN = 0\.2/u);
    assert.match(
      page,
      /botAvatarSfxForDebateState\([\s\S]{0,260}avatarState\.thinking/u,
    );
    assert.match(page, /DEBATE_FORUM_VOICE_ROOM_SEND/u);
    assert.match(page, /playbackSurface === "debate"/u);
    assert.match(page, /"debate",\s*utterance\.format,\s*\);/u);
    assert.match(source, /const playDebateAudienceReaction = useCallback/u);
    assert.match(source, /DEBATE_AUDIENCE_REACTIONS\[reactionKind\]/u);
    assert.match(
      source,
      /playFoley\(\s*reaction\.url,[\s\S]{0,220}debate-audience-reaction:/u,
    );
  });

  it("lets the public gallery react live without stalling the floor", () => {
    assert.match(source, /debateAudienceBeatForEvent\(\{/u);
    assert.match(
      source,
      /publicContent,\s*seatCount:\s*props\.audienceSeats\.length/u,
    );
    assert.match(
      source,
      /data-live-reacting=\{listenerReaction \? "true" : undefined\}/u,
    );
    assert.match(
      source,
      /data-audience-bounce=\{\s*listenerReaction && allowTransformBounce \? "true" : undefined\s*\}/u,
    );
    assert.match(source, /data-audience-beat=\{/u);
    assert.match(source, /data-listening-reaction=\{/u);
    assert.match(source, /listenerReaction=\{audienceListenerReaction\}/u);
    assert.match(
      source,
      /if \(semanticAudienceReaction\) \{\s*playDebateAudienceReaction\(semanticAudienceReaction, event\.id\);\s*\}\s*if \(event\.kind === "silence"\)/u,
    );
    assert.doesNotMatch(source, /await playDebateAudienceReaction/u);
    assert.doesNotMatch(
      source,
      /window\.setTimeout\(resolve,\s*reaction\.durationMs\)/u,
    );
    assert.match(
      css,
      /\.debateAudienceBotPortrait\[data-audience-bounce="true"\]\s*\{[^}]*animation:\s*debate-audience-live-reaction/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.debateAudienceBotPortrait\[data-audience-bounce="true"\]/u,
    );
  });

  it("puts readable audience pressure and the Judge gavel on the gallery pit", () => {
    assert.match(source, /className=\{styles\.debateAudienceStatus\}/u);
    assert.match(source, /role="meter"/u);
    assert.match(source, /aria-label="Audience rowdiness"/u);
    assert.match(source, /data-tutorial-target="debate-judge-gavel"/u);
    assert.match(source, /"Settle gallery"/u);
    assert.match(source, /audiencePressureScore=\{currentAudiencePressureScore\}/u);
    assert.match(source, /action:\s*judgeUnifiedGavelAction/u);
    assert.match(source, /onActivate:\s*activateJudgeUnifiedGavel/u);
    assert.match(source, /data-action=\{props\.judgeControl\.action\}/u);
    assert.match(css, /\.debateAudienceRow::before/u);
    assert.match(css, /\.debateAudienceRow::after/u);
    assert.match(css, /\.debateAudienceGavelButton/u);
    assert.match(css, /pointer-events:\s*auto/u);
  });

  it("shouts bot objections while keeping the visible transcript literal", () => {
    assert.match(source, /voicePerformanceText\?: string \| null/u);
    assert.match(
      source,
      /voicePerformanceText:\s*event\.kind === "objection"\s*\?\s*`\[shouts\] \$\{spokenText\}`\s*:\s*voicePerformanceTextFromActionCues\(spokenText\)/u,
    );
    assert.match(source, /spokenText,\s*voicePerformanceText:/u);
    assert.match(
      page,
      /const debateVoicePerformanceText =\s*utterance\.voicePerformanceText \?\?\s*\(usePlayerVoice[\s\S]{0,120}voicePerformanceTextFromActionCues\(utterance\.spokenText\)/u,
    );
    assert.match(page, /voicePerformanceText:\s*debateVoicePerformanceText/u);
    assert.match(
      page,
      /botPowerVoiceGainMultiplierV1\(speakerPowers\) \*\s*\(utterance\.event\.kind === "objection" \? 1\.14 : 1\)/u,
    );
  });

  it("keeps historical side colors stable and marks only the active case card", () => {
    assert.match(
      source,
      /card\.createdEventId === activeEvent\?\.id\s*\?\s*"true"/u,
    );
    assert.match(
      css,
      /\.caseBoard[\s\S]{0,100}\.caseColumns[\s\S]{0,100}section\[data-side="for"\][\s\S]{0,100}li\[data-active="true"\]/u,
    );
    assert.match(
      css,
      /\.transcriptFeed article\[data-side="for"\] header strong\s*\{[^}]*var\(--debate-for-color\)/u,
    );
    assert.match(
      css,
      /\.transcriptFeed article\[data-side="against"\] header strong\s*\{[^}]*var\(--debate-against-color\)/u,
    );
    assert.doesNotMatch(
      css,
      /\.transcriptFeed article header strong\s*\{[^}]*var\(--debate-active-color\)/u,
    );
  });

  it("bookends a new live Forum and its completed verdict with the Living Chamber ident", () => {
    assert.match(source, /playDebateIdentAudio\(\{/u);
    assert.match(
      source,
      /await adoptSession\(null, result\.session, \{ playIntro: true \}\)/u,
    );
    assert.match(
      source,
      /setActiveSession\(reuseDebateSessionEventPrefix\(previous, next\)\)[\s\S]{0,220}options\.playIntro[\s\S]{0,140}await playDebateIdent\("intro"\)[\s\S]{0,180}await consumeNewEvents/u,
    );
    assert.match(
      source,
      /previous\.status !== "completed"[\s\S]{0,120}next\.status === "completed"[\s\S]{0,220}DEBATE_IDENT_OUTRO_LEAD_MS[\s\S]{0,180}await playDebateIdent\("outro"\)/u,
    );
    assert.match(source, /setDebateIdentAudioVolume\(props\.audioVolume\)/u);
    assert.match(source, /void stopDebateIdentAudio\(\)/u);
    assert.match(source, /data-debate-ident-overlay="true"/u);
    assert.match(
      source,
      /--debate-ident-duration": `\$\{DEBATE_IDENT_AUDIO\[kind\]\.durationMs\}ms`/u,
    );
    assert.match(source, /PRISM presents/u);
    assert.match(source, /The Forum is adjourned/u);
    assert.match(source, /The Prismatic Forum/u);
    assert.match(source, /Prevailing side/u);
    assert.match(css, /\.identOverlay\[data-kind="intro"\]/u);
    assert.match(css, /\.identOverlay\[data-kind="outro"\]/u);
    assert.match(css, /@keyframes debate-ident-intro-curtain/u);
    assert.match(css, /@keyframes debate-ident-outro-curtain/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.identOverlay/u,
    );
    assert.doesNotMatch(identSource, /RoomAcoustics|roomAcoustics/u);
    assert.match(
      source,
      /deferBotVocalization=\{\s*debateIdentPlaying !== null \|\|\s*presenting \|\|\s*audienceReactingSeatIndices\.size > 0 \|\|\s*\(busy && !presenting\)\s*\}/u,
    );
  });

  it("gives listening advocates and visible jurors face-driven reactions", () => {
    assert.match(
      source,
      /activeSpeakerId !== session\.forAdvocate\.id[\s\S]{0,80}\? listenerReaction/u,
    );
    assert.match(
      source,
      /activeSpeakerId !== session\.againstAdvocate\.id[\s\S]{0,80}\? listenerReaction/u,
    );
    assert.match(source, /const reactingJurorIndices = new Set/u);
    assert.match(source, /reactingJurorIndices\.has\(index\)/u);
    assert.match(source, /data-listening-reaction=\{listenerReaction/u);
    assert.match(source, /foleyMouthShape,\s*listenerReaction,/u);
    assert.match(page, /const debateMoodHint =/u);
    assert.match(page, /avatarState\.listenerReaction === "question"/u);
    assert.match(page, /moodHint=\{debateMoodHint\}/u);
    assert.match(
      css,
      /\.juryChamberSeat:not\(\s*\[data-speaking="true"\]\s*\)\[data-listening-reaction="question"\]/u,
    );
    assert.match(
      css,
      /\.botStagePresence:not\(\s*\[data-speaking="true"\]\s*\)\[data-listening-reaction="attentive"\]/u,
    );
  });

  it("presents saved Persona surprise Foley as a short in-character reaction", () => {
    assert.match(source, /stepKey\.startsWith\("persona_reaction_"\)/u);
    assert.match(source, /"vocal reaction"/u);
    assert.match(source, /"In-character reaction"/u);
    assert.match(
      source,
      /activeEvent\.kind === "reaction"[\s\S]{0,100}activeEvent\.speakerKind === "juror"/u,
    );
  });

  it("keeps the Judge public floor on Auto while allowing the live Jury chamber", () => {
    assert.match(
      source,
      /type DebateCameraView = "wide" \| "left" \| "moderator" \| "right" \| "jury"/u,
    );
    assert.match(source, /type DebateCameraMode = "auto" \| DebateCameraView/u);
    assert.match(source, /const DEBATE_CAMERA_VIEWS/u);
    assert.match(source, /\{ id: "auto", label: "Auto" \}/u);
    assert.match(source, /\{ id: "jury", label: "Jury" \}/u);
    assert.match(source, /useState<DebateCameraMode>\("auto"\)/u);
    assert.match(
      source,
      /if \(activeRole === "for"\) return "left";[\s\S]*if \(activeRole === "moderator"\) return "moderator";[\s\S]*if \(activeRole === "against"\) return "right";[\s\S]*return "wide";/u,
    );
    assert.match(
      source,
      /const effectiveCameraMode = activeSession[\s\S]{0,160}debateCameraModeForSession\(cameraMode, activeSession\)/u,
    );
    assert.match(
      source,
      /function debateCameraModeForSession[\s\S]{0,220}session\.playerRole !== "judge"\) return cameraMode;[\s\S]{0,100}cameraMode === "jury" \? "jury" : "auto"/u,
    );
    assert.match(
      source,
      /const juryCameraActive = activeSession[\s\S]{0,120}debateJuryCameraIsActive\(effectiveCameraMode, activeSession\)/u,
    );
    assert.match(
      source,
      /const forumPreparingNextTurn =\s*busy && !presenting && judgeGavelSmashCue === null/u,
    );
    assert.match(
      source,
      /juryCameraActive[\s\S]{0,100}\? "jury"[\s\S]{0,120}forumPreparingNextTurn[\s\S]{0,40}\? "wide"/u,
    );
    assert.match(
      source,
      /forumPreparingNextTurn[\s\S]{0,80}activeEvidenceItem[\s\S]{0,80}\? "wide"[\s\S]{0,80}activeGavelCue[\s\S]{0,80}debateAutoCameraView\(activeRole\)/u,
    );
    assert.match(source, /tableEvidenceStickyId/u);
    assert.match(source, /resolveDebateTableEvidenceStickyId\(/u);
    assert.match(source, /debateTableEvidenceItem\(/u);
    assert.match(
      source,
      /<DebateEvidencePedestal[\s\S]{0,120}key=\{activeEvidenceItem\.value\.id\}/u,
    );
    assert.match(source, /<DebateEvidencePedestal/u);
    assert.match(source, /data-debate-evidence-document="true"/u);
    assert.match(source, /item\.kind === "source"/u);
    assert.match(
      source,
      /(?:evidencePedestalSprite|evidencePedestalDocument)[\s\S]{0,280}evidencePedestalLabel/u,
    );
    assert.match(source, /Moderator view/u);
    assert.match(source, /Wide view/u);
    assert.match(source, /data-evidence-view=\{evidenceAlignmentView\}/u);
    assert.match(
      source,
      /const evidenceView = debateStageEvidenceViewForCamera\(cameraView\)/u,
    );
    assert.match(
      source,
      /<DebateEvidencePedestal[\s\S]{0,180}view=\{evidenceView\}/u,
    );
    assert.doesNotMatch(
      source,
      /className=\{styles\.evidencePedestalTable\}/u,
    );
    assert.doesNotMatch(
      source,
      /src=\{`\/coffee-table\/table_\$\{theme\}\.png`\}[\s\S]{0,80}evidencePedestal/u,
    );
    assert.match(source, /playDebateExhibitImpactSfx\(/u);
    assert.match(source, /moment: "packet_add"/u);
    assert.match(
      source,
      /debateExhibitImpactForExhibit\(exhibit, "table_place"\)/u,
    );
    assert.match(
      source,
      /tag: `debate-exhibit-place:\$\{exhibit\.id\}:\$\{impact\.material\}`/u,
    );
    assert.match(
      source,
      /data-impact-material=\{\s*exhibit \? resolveDebateExhibitImpactMaterial\(exhibit\) : "paper"\s*\}/u,
    );
    assert.match(
      source,
      /const judgeGavelCameraForced = judgeGavelSmashCue !== null/u,
    );
    assert.match(
      source,
      /const cameraView = judgeGavelCameraForced\s*\? "moderator"/u,
    );
    assert.match(source, /const juryChamberVisible = cameraView === "jury"/u);
    assert.match(
      source,
      /data-locked=\{judgeGavelCameraForced \? "true" : undefined\}/u,
    );
    assert.match(source, /disabled=\{judgeGavelCameraForced\}/u);
    assert.doesNotMatch(
      source,
      /const triggerJudgeGavelSmash[\s\S]{0,420}setCameraMode\("moderator"\)/u,
    );
    assert.match(source, /data-camera-view=\{cameraView\}/u);
    assert.match(source, /data-camera-mode=\{effectiveCameraMode\}/u);
    assert.match(
      source,
      /session\.playerRole === "judge"\s*\? camera\.id === "auto" \|\|[\s\S]{0,100}camera\.id === "jury" && session\.jury\.enabled/u,
    );
    assert.match(
      source,
      /session\.playerRole === "spectator" \? \([\s\S]{0,600}Watch Jury/u,
    );
    assert.match(
      source,
      /session\.playerRole === "judge" \? \([\s\S]{0,400}selectDebateCameraMode\("jury"\)[\s\S]{0,260}Watch Jury/u,
    );
    assert.match(source, /Watch Jury/u);
    assert.match(
      css,
      /\.cameraControls\[data-judge-camera="true"\] button\[data-selected="true"\]/u,
    );
    assert.match(source, /data-tutorial-target="debate-camera"/u);
    assert.match(
      source,
      /className=\{styles\.forumCamera\}[\s\S]*className=\{styles\.podiumForeground\}/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="left"\]\s*\{[^}]*translate3d\(24%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s*\{[^}]*translate3d\(0,\s*0,\s*0\)\s*scale\(1\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="right"\]\s*\{[^}]*translate3d\(-24%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(
      source,
      /<DebateFocusDepthOverlays\s+cameraTransition=\{cameraTransition\}\s+cameraView=\{cameraView\}\s+\/>/u,
    );
    assert.match(source, /data-camera-transition=\{cameraTransition\}/u);
    assert.match(
      source,
      /data-blur-side="right"[\s\S]{0,120}props\.cameraView === "left"/u,
    );
    assert.match(
      source,
      /data-blur-side="left"[\s\S]{0,120}props\.cameraView === "right"/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\s*\{[^}]*z-index:\s*4[^}]*opacity:\s*0[^}]*transition:\s*opacity 720ms[^}]*contain:\s*paint style/u,
    );
    assert.doesNotMatch(
      css,
      /\.debaterFocusDepthOverlay\s*\{[^}]*backdrop-filter/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="right"\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*90deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="left"\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*270deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="right"\]\s*\{[\s\S]{0,420}background:\s*linear-gradient\(\s*270deg[\s\S]{0,780}mask-image:\s*linear-gradient\(\s*90deg,\s*transparent 0 28%,[\s\S]{0,180}#000 82%/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="left"\]\s*\{[\s\S]{0,420}background:\s*linear-gradient\(\s*90deg[\s\S]{0,780}mask-image:\s*linear-gradient\(\s*270deg,\s*transparent 0 28%,[\s\S]{0,180}#000 82%/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\][\s\S]{0,100}\.debaterFocusDepthOverlay\[data-blur-side="right"\][\s\S]{0,120}background:\s*linear-gradient\(\s*270deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\s*\{[^}]*opacity:\s*1/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="cut"\]\s*\{[^}]*transition-delay:\s*260ms/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="move"\]\s*\{[^}]*transition-delay:\s*760ms/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,220}\.debaterFocusDepthOverlay/u,
    );
    assert.match(css, /\.forumCamera\s*\{[^}]*transition:\s*transform 900ms/u);
    assert.match(
      css,
      /\.forumCamera\[data-camera-mode="auto"\]\s*\{[^}]*transition:\s*none/u,
    );
    assert.match(
      source,
      /function debateCameraTransition[\s\S]{0,300}event\?\.kind === "objection" \|\| event\?\.kind === "interjection"[\s\S]{0,80}\? "objection-pan"[\s\S]{0,40}: "cut"/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-transition="objection-pan"\]\s*\{[^}]*transition:\s*transform 900ms/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="objection-pan"\]\s*\{[^}]*transition-delay:\s*760ms/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(53px,\s*4\.65vw,\s*74px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(114px,\s*10vw,\s*160px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-dark\.png/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-light\.png/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.podiumForeground\s*\{[^}]*moderator-dark-foreground\.png/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.forumCamera\[data-camera-view="moderator"\]\s+\.podiumForeground\s*\{[^}]*moderator-light-foreground\.png/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition:not\(\[data-role="moderator"\]\)\s*\{[^}]*opacity:\s*0/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="for"\]\s*\{[^}]*bottom:\s*calc\(30\.5% - var\(--debate-for-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="against"\]\s*\{[^}]*bottom:\s*calc\(30\.5% - var\(--debate-against-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="moderator"\]\s*\{[^}]*bottom:\s*calc\(40\.5% - var\(--debate-moderator-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition\[data-role="moderator"\]\s*\{[^}]*left:\s*calc\(50% \+ var\(--debate-moderator-view-offset-x,\s*0%\)\)[^}]*bottom:\s*calc\(44\.5% - var\(--debate-moderator-view-offset-y,\s*0%\)\)/u,
    );
  });

  it("integrates a persona-tinted moderator-camera gavel with restrained procedural Foley", () => {
    assert.match(source, /function DebateModeratorGavel/u);
    assert.match(source, /data-debate-moderator-gavel="true"/u);
    assert.match(source, /data-gavel-theme=\{props\.theme\}/u);
    assert.match(source, /magentaTintedRasterUrl/u);
    assert.match(source, /moderatorGavelFrameDown/u);
    assert.match(source, /moderatorGavelFrameUp/u);
    assert.match(source, /color=\{session\.moderator\.color/u);
    assert.match(
      source,
      /preloadFoleyUrls=\{DEBATE_GAVEL_FOLEY_PRELOAD_URLS\}/u,
    );
    assert.match(source, /\}, 0\);/u);
    assert.match(source, /DEBATE_GAVEL_FOLEY_URLS\[cueKind\]/u);
    assert.match(source, /trim:\s*DEBATE_GAVEL_FOLEY_TRIM\[cueKind\]/u);
    assert.match(source, /playFoley\(/u);
    assert.match(
      source,
      /controllerHandleRef=\{debateAtmosphereControllerRef\}/u,
    );
    assert.match(source, /debateModeratorGavelSpeechLeadMs\(gavelCue\.kind\)/u);
    assert.match(
      source,
      /setLiveGavelCue\(gavelCue\)[\s\S]{0,260}DEBATE_GAVEL_ORDER_CAMERA_CUT_MS[\s\S]{0,780}setPresentationEventId\(event\.id\)/u,
    );
    assert.match(
      source,
      /const activeGavelCue =\s*judgeGavelSmashCue \?\? \(presenting \? liveGavelCue : null\)/u,
    );
    assert.match(
      source,
      /await adoptSession\(\s*previous,\s*\{\s*\.\.\.result\.session,\s*status:\s*previous\.status,\s*\},\s*\{\s*automaticJudgeGavel:\s*true,\s*\},\s*\);\s*setActiveSession\(result\.session\)/u,
    );
    assert.match(source, /session\.status === "paused" && !presenting/u);
    assert.match(
      source,
      /\(session\.status !== "paused" \|\|\s*activeGavelCue !== null\)/u,
    );
    assert.match(
      source,
      /judgeGavelSmashCue !== null \|\|\s*activeGavelCue\?\.kind !== "order" \|\|\s*presentationEventId === activeGavelCue\.eventId/u,
    );
    assert.match(
      source,
      /visible=\{moderatorPresentation\.visibility !== "hidden"\}/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]{0,100}\.moderatorGavel\[data-visible="true"\][\s\S]{0,100}opacity:\s*1/u,
    );
    assert.match(
      css,
      /\.moderatorGavel\s*\{[^}]*top:\s*44\.5%[^}]*left:\s*53%[^}]*z-index:\s*3/u,
    );
    assert.doesNotMatch(css, /--debate-gavel-scale/u);
    assert.match(
      source,
      /data-preview-pose=\{props\.cue \? undefined : props\.previewPose\}/u,
    );
    assert.match(
      css,
      /\.moderatorGavelFrameDown\s*\{[^}]*--debate-gavel-lowered-offset-x[^}]*--debate-gavel-lowered-rotation[^}]*--debate-gavel-lowered-scale/u,
    );
    assert.match(
      css,
      /\.moderatorGavelFrameUp\s*\{[^}]*--debate-gavel-raised-offset-x[^}]*--debate-gavel-raised-rotation[^}]*--debate-gavel-raised-scale/u,
    );
    assert.doesNotMatch(css, /moderator-gavel-(?:dark|light)-tint-mask\.png/u);
    assert.match(css, /@keyframes debate-gavel-attention/u);
    assert.match(css, /@keyframes debate-gavel-order/u);
    assert.match(css, /@keyframes debate-gavel-attention-frame-up/u);
    assert.match(css, /@keyframes debate-gavel-order-frame-up/u);
    const attentionKeyframes =
      css.match(/@keyframes debate-gavel-attention\s*\{([\s\S]*?)\n\}/u)?.[1] ??
      "";
    const orderKeyframes =
      css.match(/@keyframes debate-gavel-order\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
    assert.doesNotMatch(attentionKeyframes, /rotate\(/u);
    assert.doesNotMatch(orderKeyframes, /rotate\(/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,160}\.moderatorGavelMotion/u,
    );
    for (const relativePath of [
      "../../public/debate/moderator-gavel-dark-down.png",
      "../../public/debate/moderator-gavel-dark-up.png",
      "../../public/debate/moderator-gavel-light-down.png",
      "../../public/debate/moderator-gavel-light-up.png",
      "../../public/audio/debate/gavel-attention-v3.wav",
      "../../public/audio/debate/gavel-order-v3.wav",
    ]) {
      assert.equal(
        existsSync(fileURLToPath(new URL(relativePath, import.meta.url))),
        true,
      );
    }
  });

  it("puts the player Judge's default Prism behind the center role plate", () => {
    assert.equal(DEBATE_PLAYER_JUDGE_BOT_ID, "prism:player-judge");
    assert.match(source, /const DEBATE_PLAYER_JUDGE_PRISM/u);
    assert.match(source, /playerJudgeUsesPrism:\s*playerRole === "judge"/u);
    assert.match(source, /playerVoice:\s*session\.playerRole === "judge"/u);
    assert.match(
      source,
      /roleLabel:[\s\S]{0,180}normalizeDebateModeratorTitle\(session\.moderatorTitle\)/u,
    );
    assert.doesNotMatch(
      source,
      /className=\{styles\.playerPresence\}\s+data-role="judge"/u,
    );
    assert.doesNotMatch(css, /\.playerPresence\[data-role="judge"\]/u);
    assert.match(page, /botSnapshot\.id === DEBATE_PLAYER_JUDGE_BOT_ID/u);
    assert.match(page, /playerJudgePrism\s*\?\s*zenDefaultPrismFaceStyle/u);
    assert.match(
      page,
      /const usePlayerVoice = utterance\.player \|\| utterance\.playerVoice/u,
    );
    assert.match(
      page,
      /voicePerformanceTextFromActionCues\(utterance\.spokenText\)/u,
    );
    assert.match(page, /buildBundledActionSfxPlan\(utterance\.spokenText\)/u);
    assert.match(
      page,
      /playDebatePlayerActionSfx\(playerActionSfxPlan\.kind\)/u,
    );
    assert.match(page, /elevenLabsText:\s*message\.voicePerformanceText/u);
    assert.doesNotMatch(
      page,
      /elevenLabsText:\s*voiceSpokenText\(message\.voicePerformanceText\)/u,
    );
    assert.match(page, /frozenVoiceProfile:\s*usePlayerVoice\s*\?\s*null/u);
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="for"\]\s*\{[^}]*top:\s*calc\(64% \+ var\(--debate-for-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="against"\]\s*\{[^}]*top:\s*calc\(64% \+ var\(--debate-against-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\s*\{[^}]*top:\s*calc\(63\.5% \+ var\(--debate-moderator-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="for"\]\s+\.botIdentityPlate\s*\{[^}]*rotateY\(10deg\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="against"\]\s+\.botIdentityPlate\s*\{[^}]*rotateY\(-10deg\)/u,
    );
  });

  it("provides a persistent Light and Dark stage alignment workspace", () => {
    assert.match(source, /Align stage/u);
    assert.match(
      source,
      /const DEBATE_STAGE_ALIGNMENT_ENABLED = prismBranchIsDev\(\s*process\.env\.NEXT_PUBLIC_PRISM_BRANCH/u,
    );
    assert.match(
      source,
      /if \(!DEBATE_STAGE_ALIGNMENT_ENABLED \|\| !stageAlignmentOpen\) return null/u,
    );
    assert.match(source, /aria-label="More stage controls"/u);
    assert.match(source, /className=\{styles\.cameraAdvanced\}/u);
    assert.match(source, /data-debate-stage-alignment-modal="true"/u);
    assert.match(source, /Save alignment/u);
    assert.match(source, /Reset positions/u);
    assert.match(source, /Drag an item or use arrow keys to nudge by 0\.5%/u);
    assert.match(source, /\(\["light", "dark"\] as const\)/u);
    assert.match(source, /\(\["wide", "moderator"\] as const\)/u);
    assert.match(source, /aria-label="Debate alignment preview camera"/u);
    assert.match(source, /data-camera-view=\{stageAlignmentPreviewCamera\}/u);
    assert.match(
      source,
      /stageAlignmentPreviewCamera === "moderator"\s*\? alignmentCast\.filter\(\(entry\) => entry\.role === "moderator"\)/u,
    );
    assert.match(source, /Reset moderator/u);
    assert.match(source, /moderator bot, nameplate, and glyph plate/u);
    assert.match(source, /DEBATE_STAGE_ALIGNMENT_ITEMS\.map/u);
    assert.match(source, /className=\{styles\.alignmentItemToggle\}/u);
    assert.match(source, /data-alignment-item="bot"/u);
    assert.match(source, /data-alignment-item="nameplate"/u);
    assert.match(source, /data-alignment-item="glyph"/u);
    assert.match(source, /data-debate-stage-sound-check=\{role\}/u);
    assert.match(
      source,
      /aria-label=\{`Sound check \$\{sourceBot\.name\} as \$\{DEBATE_STAGE_ALIGNMENT_LABELS\[role\]\}`\}/u,
    );
    assert.match(source, /aria-pressed=\{soundCheckState === "playing"\}/u);
    assert.match(source, /DEBATE_STAGE_SOUNDCHECK_MESSAGE_PREFIX/u);
    assert.match(source, /stepKey: "alignment_sound_check"/u);
    assert.match(source, /kind: "speech"/u);
    assert.match(source, /speakerBotId: bot\.id/u);
    assert.match(source, /voiceSourceBotId: bot\.id/u);
    assert.match(source, /lifecycle:\s*\{/u);
    assert.match(
      source,
      /onStart: \(durationMs, alignment\) => \{[\s\S]*updateSpeechTiming\(0, playbackDurationMs\)/u,
    );
    assert.match(
      source,
      /onProgress: \(elapsedMs, durationMs\) => \{[\s\S]*updateSpeechTiming\(elapsedMs, playbackDurationMs\)/u,
    );
    assert.match(source, /speechTiming: soundCheckSpeechTiming/u);
    assert.match(
      source,
      /data-speaking=\{\s*soundCheckPlaying \? "true" : undefined\s*\}/u,
    );
    assert.match(
      source,
      /data-turn-active=\{\s*soundCheckPlaying \? "true" : undefined\s*\}/u,
    );
    assert.match(
      source,
      /debateStageAlignmentTarget\("moderator", item, "moderator"\)/u,
    );
    assert.match(
      source,
      /const defaultOffset = debateStageAlignmentOffset\(\s*DEFAULT_DEBATE_STAGE_ALIGNMENT,\s*target,\s*\)/u,
    );
    assert.match(
      source,
      /updateStageAlignmentTarget\(\s*target,\s*defaultOffset,\s*\)/u,
    );
    assert.match(source, /Copy alignment data/u);
    assert.match(source, /formatDebateStageAlignmentClipboard/u);
    assert.match(source, /type="range"/u);
    assert.match(source, /writeDebateStageAlignment/u);
    assert.match(source, /DEBATE_STAGE_LIGHT_BLEND_MODES\.map/u);
    assert.match(source, /className=\{styles\.alignmentLightingBlendSelect\}/u);
    assert.match(
      source,
      /aria-label=\{`\$\{label\} Debate light blend mode`\}/u,
    );
    assert.match(
      source,
      /value=\{\s*stageAlignmentDraft\.lightBlendModes\[theme\]\s*\}/u,
    );
    assert.match(source, /value as DebateStageLightBlendMode/u);
    assert.match(source, /updateDebateStageLightBlendMode/u);
    assert.match(source, /aria-label="Debate moderator gavel controls"/u);
    assert.match(source, /updateDebateStageGavelPose/u);
    assert.match(source, /aria-label="Debate evidence placement controls"/u);
    assert.match(source, /updateDebateStageEvidenceTable/u);
    assert.match(source, /data-debate-evidence-tuner="true"/u);
    assert.match(source, /data-debate-evidence-alignment-preview="true"/u);
    assert.match(source, /pickDebateStageAlignmentEvidenceEmoji/u);
    assert.match(source, /stageAlignmentPreviewEvidenceEmoji/u);
    assert.match(source, /Copy evidence JSON/u);
    assert.match(source, /formatDebateStageEvidenceTableClipboard/u);
    assert.match(source, /data-debate-evidence-copy="true"/u);
    assert.match(source, /data-debate-evidence-reshuffle="true"/u);
    assert.match(source, /<strong>Evidence<\/strong>/u);
    assert.match(
      css,
      /\.evidencePedestal\s*\{[^}]*--debate-evidence-offset-x/u,
    );
    assert.match(css, /\.evidencePedestal\s*\{[^}]*--debate-evidence-scale/u);
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-view="moderator"\]\s*\{[^}]*--debate-moderator-evidence-offset-x/u,
    );
    assert.match(css, /\.evidencePedestalDocument\s*\{/u);
    assert.match(css, /\.evidencePedestal\s*\{[^}]*drop-shadow/u);
    assert.match(css, /\.evidenceAlignmentPreviewEmoji\s*\{/u);
    assert.match(
      css,
      /\.evidenceAlignmentPreviewEmoji\s*\{[^}]*transform:\s*translateY\(8%\)/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\s+\.evidencePedestalSprite\s*>\s*img\s*\{[^}]*object-position:\s*center\s+42%[^}]*transform:\s*translateY\(-8%\)[^}]*filter:\s*none/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\s*>\s*button\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/u,
    );
    assert.match(
      css,
      /\.evidencePedestalLabel\s*\{[^}]*position:\s*absolute[^}]*top:\s*calc\(100%/u,
    );
    assert.doesNotMatch(
      css,
      /\.evidencePedestalLabel\s*\{[^}]*margin-bottom:\s*clamp/u,
    );
    assert.doesNotMatch(
      css,
      /\.evidencePedestalLabel\s*\{[^}]*margin-top:\s*clamp/u,
    );
    assert.doesNotMatch(css, /\.evidencePedestalTable\s*\{/u);
    assert.match(source, /aria-label="Gavel pose to align"/u);
    assert.match(source, /data-debate-gavel-pose=\{pose\}/u);
    assert.match(source, /pose === "lowered" \? "Lowered" : "Raised"/u);
    assert.match(source, /data-debate-gavel-link="true"/u);
    assert.match(source, /aria-pressed=\{stageAlignmentGavelPosesLinked\}/u);
    assert.match(source, /"Unlock gavel poses"/u);
    assert.match(source, /"Lock gavel poses"/u);
    assert.match(
      source,
      /\{\s*\[control\.key\]: nextValue,\s*\},\s*stageAlignmentGavelPosesLinked,/u,
    );
    assert.match(source, /label: "Rotation"/u);
    assert.match(source, /label: "Size"/u);
    assert.match(source, /value = activeGavelPose\[control\.key\]/u);
    assert.match(source, /Copy gavel JSON/u);
    assert.match(source, /formatDebateStageGavelClipboard/u);
    assert.match(source, /data-debate-gavel-copy="true"/u);
    assert.match(source, /aria-label="Preview and export moderator gavel"/u);
    assert.match(source, /data-debate-gavel-test="attention"/u);
    assert.match(source, /data-debate-gavel-test="order"/u);
    assert.match(source, /previewStageAlignmentGavel\("attention"\)/u);
    assert.match(source, /previewStageAlignmentGavel\("order"\)/u);
    assert.match(source, /cue=\{stageAlignmentGavelCue\}/u);
    assert.match(
      source,
      /controllerHandleRef=\{stageAlignmentAtmosphereControllerRef\}/u,
    );
    assert.match(
      source,
      /sessionKey=\{`debate-alignment:\$\{session\?\.id \?\? props\.storageScopeId\}`\}/u,
    );
    assert.match(source, /label: "Horizontal"/u);
    assert.match(source, /label: "Vertical"/u);
    assert.match(
      source,
      /aria-label=\{`\$\{stageAlignmentGavelPose\} gavel \$\{control\.label\.toLowerCase\(\)\}`\}/u,
    );
    assert.match(source, /aria-label="Debate light color mask controls"/u);
    assert.match(source, /updateDebateStageLightMaskOpacity/u);
    assert.match(source, /Debate color mask opacity/u);
    assert.match(source, /Saved separately for Light and Dark/u);
    assert.match(
      source,
      /style=\{debateStageAlignmentStyle\(stageAlignment\)\}/u,
    );
    assert.match(page, /storageScopeId=\{user\?\.id \?\? "signed-out"\}/u);
    assert.match(
      source,
      /styles\.alignmentForum[\s\S]*className=\{styles\.alignmentTuner\}/u,
    );
    assert.match(
      css,
      /\.alignmentViewportColumn\s*\{[^}]*calc\(min\(1760px,\s*calc\(100vw - 32px\)\) - 448px\)/u,
    );
    assert.doesNotMatch(css, /\.alignmentForum\s*\{[^}]*aspect-ratio:/u);
    assert.doesNotMatch(css, /\.alignmentForum\s*\{[^}]*min-height:/u);
    assert.match(css, /\.alignmentTuner\s*\{[^}]*position:\s*relative/u);
    assert.match(css, /\.alignmentTunerRoleActions\s*\{[^}]*display:\s*flex/u);
    assert.match(
      css,
      /\[data-debate-stage-sound-check\]\[data-sound-check-state="playing"\]/u,
    );
    assert.match(
      css,
      /\.alignmentLightingTuner\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?--debate-moderator-view-nameplate-offset-x/u,
    );
    assert.match(css, /--debate-for-glyph-offset-x/u);
    assert.match(css, /--debate-against-nameplate-offset-y/u);
    assert.match(css, /--debate-light-mask-opacity-dark/u);
    assert.match(css, /--debate-light-mask-opacity-light/u);
    assert.match(
      css,
      /\.alignmentViewToggle,[\s\S]*?\.alignmentThemeToggle\s*\{[^}]*border-radius:\s*999px/u,
    );
    assert.doesNotMatch(
      css,
      /\.alignmentTuner\s*\{[^}]*position:\s*(?:absolute|fixed)/u,
    );
  });

  it("keeps both themes and the global companion aware of the Debate surface", () => {
    assert.match(source, /data-theme=\{props\.theme\}/u);
    assert.match(css, /\.lobby\[data-theme="light"\]/u);
    assert.match(css, /\.setup\[data-theme="light"\]/u);
    assert.match(page, /surfaceId: "debate"/u);
  });

  it("uses the shared app navbar and a dedicated scrolling content region", () => {
    assert.match(page, /data-debate-shell="true"/u);
    assert.match(
      page,
      /renderSharedAppletNavbar\("Debate tools",\s*\{[\s\S]*brandAppletId:\s*"debate"[\s\S]*showVoiceSelector:\s*true[\s\S]*liveSessionName:\s*"Debate"[\s\S]*\(\["local", "auto", "online"\] as const\)\.map[\s\S]*<ComposerModelPicker/u,
    );
    assert.match(
      page,
      /options\.brandAppletId[\s\S]*renderSharedAppletSidebarHeader\(options\.brandAppletId\)/u,
    );
    assert.match(page, /data-response-mode=\{debateResponseMode\}/u);
    assert.match(page, /responseMode=\{debateResponseMode\}/u);
    assert.match(source, /responseMode:\s*props\.responseMode/u);
    assert.match(source, /event\.autoRecovery/u);
    assert.match(source, /All configured Auto models failed|Recovered with/u);
    assert.match(page, /autoOptionLabel="Account default"/u);
    assert.match(page, /Uses the account model for the entire Debate\./u);
    assert.doesNotMatch(page, /Cast models/u);
    assert.match(
      page,
      /onLiveSessionActiveChange=\{setDebateLiveSessionActive\}/u,
    );
    assert.match(
      source,
      /const liveSessionActive =\s*view === "live" &&\s*activeSession !== null &&\s*activeSession\.status !== "paused"/u,
    );
    assert.match(source, /modelOverride:\s*props\.modelOverride\?\.model/u);
    assert.doesNotMatch(source, /className=\{styles\.privacyBadge\}/u);
    assert.match(page, /data-debate-scroll-region="true"/u);
    assert.match(
      pageCss,
      /\.debateMain\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/u,
    );
    assert.match(
      pageCss,
      /\.appLayout\.debateShell\s+\.debateMain\s*>\s*\.sharedAppletHeader\s*\{[^}]*height:\s*auto[^}]*position:\s*relative/u,
    );
    assert.match(pageCss, /\.debateScrollRegion\s*\{[^}]*overflow-y:\s*auto/u);
    assert.match(
      css,
      /@media \(min-width: 901px\)\s*\{[\s\S]*\.setupActions\s*\{[^}]*padding-right:\s*104px/u,
    );
    assert.doesNotMatch(
      css,
      /\.lobby,\s*\.setup,\s*\.live\s*\{[^}]*min-height:\s*100vh/u,
    );
  });
});
