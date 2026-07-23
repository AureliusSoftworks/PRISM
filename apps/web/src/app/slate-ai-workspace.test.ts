import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workspace = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./slateWorkspace.module.css", import.meta.url),
  "utf8",
);
const globalCompanion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const globalCompanionStyles = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Slate AI workspace controls", () => {
  it("keeps prose routing project-scoped with an explicit model picker", () => {
    assert.match(workspace, /\["offline", "auto", "online"\]/u);
    assert.match(workspace, /data-tutorial-target="slate-ai-controls"/u);
    assert.match(workspace, /saveProseModel/u);
    assert.match(workspace, /Every generated prose artifact keeps its provider and\s+model receipt/u);
  });

  it("surfaces the living summary and advisory title decision on the canvas", () => {
    assert.match(workspace, /data-tutorial-target="slate-summary"/u);
    assert.match(workspace, /livingSummary\.tail/u);
    assert.match(workspace, /SLATE_TITLE_REVIEW_INTERVAL_CHARS = 12_000/u);
    assert.match(workspace, /project\.titleOrigin !== "spark"/u);
    assert.match(workspace, /Working title checkpoint/u);
    assert.match(workspace, /Review working title/u);
    assert.doesNotMatch(workspace, /requestTitleSuggestion\(\{ quiet: true \}\)/u);
    assert.match(workspace, /resolveTitleSuggestion\("accepted"\)/u);
  });

  it("hands safe Slate metadata to the movable global Prism companion", () => {
    assert.match(workspace, /globalCompanionEnabled: boolean/u);
    assert.match(workspace, /onCompanionContextChange/u);
    assert.match(workspace, /projectId: project\.id/u);
    assert.match(workspace, /sectionId: activeSection\?\.id \?\? null/u);
    assert.match(workspace, /project && !globalCompanionEnabled/u);
    assert.match(page, /globalCompanionEnabled/u);
    assert.match(page, /onCompanionContextChange=\{setSlateCompanionContext\}/u);
    assert.match(globalCompanion, /data-tutorial-target="prism-companion"/u);
    assert.match(globalCompanion, /onPointerDown=\{beginDrag\}/u);
    assert.match(globalCompanion, /<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}>/u);
    assert.match(globalCompanion, /latest 3 recover on this surface/u);
    assert.match(
      globalCompanion,
      /className=\{styles\.composer\}[\s\S]{0,3000}shouldSubmitComposerOnEnter/u,
    );
    assert.match(
      globalCompanion,
      /className=\{styles\.composer\}[\s\S]{0,3000}enterKeyHint="send"/u,
    );
    assert.match(globalCompanion, /<path d="M16 5\.2 27 25H5Z"/u);
    assert.match(globalCompanionStyles, /\.avatar\s*\{/u);
    assert.match(globalCompanionStyles, /\.avatar::before\s*\{/u);
    assert.match(globalCompanionStyles, /\.bubble,/u);
    assert.match(globalCompanionStyles, /prefers-reduced-motion: reduce/u);
    assert.doesNotMatch(globalCompanionStyles, /\.companionPanel\s*\{/u);
  });

  it("renders a stoppable two-hemisphere Lux and Umbra deliberation surface", () => {
    assert.match(workspace, /data-tutorial-target="slate-deliberation"/u);
    assert.match(workspace, /A mind in two hemispheres\./u);
    assert.match(workspace, /slateDeliberationNextSpeaker/u);
    assert.match(workspace, /\/deliberation\/turn/u);
    assert.match(workspace, /stopSlateDeliberation/u);
    assert.match(workspace, /Use as \{activeSection\?\.prose\.trim\(\)/u);
    assert.match(workspace, /aria-modal="true"/u);
    assert.match(workspace, /data-active-speaker/u);
    assert.match(styles, /\.deliberationHemisphere\[data-side="lux"\]/u);
    assert.match(styles, /\.deliberationHemisphere\[data-side="umbra"\]/u);
    assert.match(styles, /@keyframes slateLuxHemispherePulse/u);
    assert.match(styles, /@keyframes slateUmbraHemispherePulse/u);
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.deliberationHemisphere/u,
    );
  });

  it("publishes active-project hemisphere settings to the Settings surface", () => {
    assert.match(workspace, /onHemisphereSettingsSnapshot/u);
    assert.match(workspace, /hemisphereSettingsUpdate/u);
    assert.match(workspace, /config: project\.deliberationConfig/u);
    assert.match(workspace, /modelOptions: proseModelOptions/u);
  });
});
