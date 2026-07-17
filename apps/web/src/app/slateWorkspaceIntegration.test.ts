import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const source = readFileSync(new URL("./SlateWorkspace.tsx", import.meta.url), "utf8");
const workspaceCss = readFileSync(
  new URL("./slateWorkspace.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Slate workspace integration", () => {
  it("renders every registered Slate tutorial target in the live workspace", () => {
    for (const step of MODE_TUTORIALS.slate.steps) {
      const match = step.targetSelector.match(/data-tutorial-target="([^"]+)"/);
      assert.ok(match?.[1], `Could not read target from ${step.targetSelector}`);
      assert.match(source, new RegExp(`data-tutorial-target="${match[1]}"`));
    }
  });

  it("wires project persistence, drafting, revision preview, and explicit decisions", () => {
    assert.match(source, /\/api\/slate\/projects/);
    assert.match(source, /\/sections/);
    assert.match(source, /runProjectOperation\("\/shape"\)/);
    assert.match(source, /runProjectOperation\("\/draft"/);
    assert.match(source, /runProjectOperation\("\/revisions"/);
    assert.match(source, /\/accept`/);
    assert.match(source, /\/reject`/);
    assert.match(source, /Lock selection/);
  });

  it("flushes manuscript autosave before leaving or switching projects", () => {
    assert.match(source, /const openSection[\s\S]*?await flushPendingManuscriptSave\(\);[\s\S]*?\/sections\/\$\{encodeURIComponent\(sectionId\)\}/);
    assert.match(source, /flushPendingManuscriptSave\(\)[\s\S]*?setProject\(null\)/);
    assert.match(source, /window\.addEventListener\("pagehide", preservePendingEditsOnPageHide\)/);
    assert.match(source, /flushPendingManuscriptSave\(\{ keepalive: true \}\)/);
    assert.match(source, /SLATE_KEEPALIVE_BODY_MAX_BYTES/);
    assert.match(source, /window\.removeEventListener\("pagehide"[\s\S]*?flushPendingManuscriptSave\(\)/);
  });

  it("uses revision-safe focused section autosave and preserves local conflict work", () => {
    assert.match(source, /expectedRevision:\s*attempt\.expectedRevision/);
    assert.match(source, /mutationId:\s*attempt\.mutationId/);
    assert.match(source, /crypto\.randomUUID\(\)/);
    assert.match(source, /slate_section_revision_conflict/);
    assert.match(source, /Your draft is safe\./);
    assert.match(source, /Keep my edits/);
    assert.match(source, /Use saved version/);
    assert.match(source, /Focused manuscript section/);
  });

  it("keeps AI drafting subordinate to current prose, locks, and save conflicts", () => {
    assert.match(source, /slate_section_ai_write_conflict/);
    assert.match(source, /slate_shape_write_conflict/);
    assert.match(
      source,
      /slate_shape_write_conflict[\s\S]*?slateApi<SlateProjectResponse>[\s\S]*?adoptProject\(response\.project\)/,
    );
    assert.match(
      source,
      /onChange=\{\(event\)[\s\S]*?transformSlateLockedRangesForTextEdit\([\s\S]*?current\.lockedRanges/,
    );
    assert.match(source, /Boolean\(activeSection\?\.prose\.trim\(\)\)/);
    assert.match(source, /Refine existing prose/);
    assert.match(source, /setSectionConflict\(\{[\s\S]*?serverSection: response\.section/);
  });

  it("downloads clean manuscript exports without attaching or removing a temporary link", () => {
    const exportSource = source.slice(
      source.indexOf("const exportManuscript"),
      source.indexOf("const totalManuscriptLength"),
    );
    assert.match(exportSource, /slateExportScopeForWorkspace/);
    assert.match(exportSource, /\/api\/slate\/projects\/\$\{encodeURIComponent\(currentProject\.id\)\}\/exports/);
    assert.match(exportSource, /await flushPendingManuscriptSave\(\)/);
    assert.match(exportSource, /URL\.createObjectURL\(await response\.blob\(\)\)/);
    assert.match(exportSource, /document\.createElement\("a"\)/);
    assert.match(exportSource, /link\.click\(\)/);
    assert.match(exportSource, /URL\.revokeObjectURL/);
    assert.doesNotMatch(exportSource, /appendChild|removeChild|\.append\(|\.remove\(/);
    assert.match(source, /Take a clean copy/);
    assert.match(source, /Directions, Continuity notes, and review metadata stay private/);
    assert.match(source, /aria-controls="slate-export-panel"/);
  });

  it("keeps the export card branded, theme-owned, and responsive", () => {
    assert.match(
      workspaceCss,
      /\.exportPanel\s*\{[\s\S]*grid-template-columns:[\s\S]*var\(--bg-surface/,
    );
    assert.match(
      workspaceCss,
      /\.exportPanel::before\s*\{[\s\S]*var\(--slate-p\)[\s\S]*var\(--slate-m\)/,
    );
    assert.match(
      workspaceCss,
      /\.manuscriptPane\s*\{[\s\S]*overflow-x: hidden;/,
    );
    assert.match(
      workspaceCss,
      /@media \(max-width: 1400px\)[\s\S]*\.exportPanel\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*\.exportPanel > \.archiveTools\s*\{[\s\S]*flex-direction: column;/,
    );
    assert.match(
      workspaceCss,
      /@media \(max-width: 680px\)[\s\S]*\.exportPanel\s*\{[\s\S]*grid-template-columns: 1fr;/,
    );
  });

  it("previews portable backups and restores only after an explicit copy decision", () => {
    const safetySource = source.slice(
      source.indexOf("const downloadSlateProjectArchive"),
      source.indexOf("const enterReturnSession"),
    );
    assert.match(
      safetySource,
      /\/api\/slate\/projects\/\$\{encodeURIComponent\(projectId\)\}\/archive/,
    );
    assert.match(safetySource, /await flushPendingManuscriptSave\(\)/);
    assert.match(safetySource, /flushCurrentProject: true/);
    assert.match(safetySource, /\/api\/slate\/archives\/preview/);
    assert.match(safetySource, /\/api\/slate\/archives\/import/);
    assert.match(safetySource, /setArchivePreview\(response\.preview\)/);
    assert.match(safetySource, /await openProject\(response\.import\.projectId\)/);
    assert.doesNotMatch(safetySource, /appendChild|removeChild|\.append\(|\.remove\(/);
    assert.match(source, /accept=\{`\.slate,/);
    assert.match(source, /Your original stays untouched\./);
    assert.match(source, /Restore as a copy/);
    assert.match(source, /Account keys and rebuildable caches stay out/);
  });

  it("keeps backup confirmation compact, PRISM-branded, and responsive", () => {
    assert.match(
      workspaceCss,
      /\.archivePreview::before\s*\{[\s\S]*var\(--slate-p\)[\s\S]*var\(--slate-m\)/,
    );
    assert.match(
      workspaceCss,
      /\.archiveSafetyNote\s*\{[\s\S]*var\(--slate-m\)[\s\S]*var\(--bg\)/,
    );
    assert.match(
      workspaceCss,
      /@media \(max-width: 680px\)[\s\S]*\.archivePreview footer,\s*\.deleteProjectDialog footer\s*\{[\s\S]*flex-direction: column-reverse;/,
    );
  });

  it("shows successful recovery quietly beside save status and stays silent while unavailable", () => {
    assert.match(source, /\/recovery\/status/);
    assert.match(
      source,
      /response\.recovery\.coordinator\?\.lastProtectedAt\s*\?\?\s*response\.recovery\.newestVerifiedAt/,
    );
    assert.match(source, /queueRecoveryStatusRefresh\(projectId\)/);
    assert.match(source, /catch \{[\s\S]*Recovery remains deliberately quiet/);
    assert.match(source, /protectedAt \? \([\s\S]*Protected · \{readableUpdatedAt\(protectedAt\)\}/);
    assert.match(
      workspaceCss,
      /\.protectedStatus\s*\{[\s\S]*var\(--slate-s\)[\s\S]*var\(--fg-muted/,
    );
  });

  it("starts new work progressively and creates only after title confirmation", () => {
    const progressiveSource = source.slice(
      source.indexOf("const advanceProjectStart"),
      source.indexOf("const saveStructure"),
    );
    assert.match(source, /useState<SlateProjectStartStep>\("source"\)/);
    assert.match(source, /data-slate-start-step="source"/);
    assert.match(source, /What should Slate begin with\?/);
    assert.match(source, /Bring existing material/);
    assert.match(source, /kept exactly as pasted/);
    assert.match(source, /slateProjectSourceIsReady\(\{ spark, existingMaterial \}\)/);
    assert.match(source, /const advanceProjectStart[\s\S]*?setProjectStartStep\("title"\)/);
    assert.doesNotMatch(
      progressiveSource.slice(0, progressiveSource.indexOf("const createProject")),
      /slateApi<SlateProjectResponse>\("\/api\/slate\/projects"/,
    );
    assert.match(source, /data-slate-start-step="title"/);
    assert.match(source, /Slate suggested a working title/);
    assert.match(source, /slateSuggestedProjectTitle/);
    assert.match(source, /Back/);
    assert.match(source, /Skip naming · use Untitled Story/);
    assert.match(source, /createProject\("Untitled Story"\)/);
    assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
    assert.match(progressiveSource, /manuscript: existingMaterial/);
    assert.match(progressiveSource, /catch \(cause\)[\s\S]*?Slate could not create the project/);
    assert.match(progressiveSource, /setProjectStartStep\("source"\)/);
    assert.match(source, /projects\.map[\s\S]*?openProject\(item\.id\)/);
    assert.match(workspaceCss, /\.startStepHeader[\s\S]*?var\(--slate-s\)/);
    assert.match(workspaceCss, /\.sourceRecap[\s\S]*?var\(--bg/);
  });

  it("offers a calm, explicit project deletion flow from the shelf", () => {
    const deletionSource = source.slice(
      source.indexOf("const deleteSlateProjectFromShelf"),
      source.indexOf("const previewSlateArchive"),
    );
    assert.match(source, /aria-haspopup="menu"/);
    assert.match(source, /usePrismMenu/);
    assert.match(source, /label: "Open project"/);
    assert.match(source, /label: "Delete project"/);
    assert.match(source, /setProjectPendingDeletion\(item\)/);
    assert.match(source, /Delete “\{projectPendingDeletion\.title\}”\?/);
    assert.match(source, /This cannot be undone\./);
    assert.match(source, /Download backup first/);
    assert.match(
      source,
      /downloadSlateProjectArchive\(projectPendingDeletion\.id\)/,
    );
    assert.match(deletionSource, /method: "DELETE"/);
    assert.match(
      deletionSource,
      /current\.filter\(\(item\) => item\.id !== candidate\.id\)/,
    );
    assert.match(deletionSource, /await refreshProjects\(\)\.catch/);
    assert.match(source, /aria-modal="true"/);
    assert.match(
      workspaceCss,
      /\.deleteProjectDialog::before[\s\S]*?var\(--slate-p\)[\s\S]*?var\(--slate-m\)/,
    );
    assert.match(workspaceCss, /\.destructiveButton[\s\S]*?var\(--danger/);
  });

  it("offers optional wildcard project creation with preview and saved provenance", () => {
    assert.match(source, /Use \{\"\{wildcards\}\"\}/);
    assert.match(source, /\/api\/slate\/wildcards\/resolve/);
    assert.match(source, /Preview wildcard roll/);
    assert.match(source, /sparkWildcards/);
    assert.match(source, /Created from \{\"\{wildcards\}\"\}/);
  });

  it("keeps direction document-native instead of rendering a chat transcript", () => {
    assert.match(source, /What happens next\?/);
    assert.match(source, /Resolve current proposal/);
    assert.match(source, /One thing needs your intent/);
    assert.match(source, /slateConcernResolveRequestForDirection/);
    assert.match(source, /continuity\/concerns\/\$\{encodeURIComponent\(concern\.id\)\}\/resolve/);
    assert.match(source, /Not now · keep writing/);
    assert.doesNotMatch(source, /conversationId|message bubble|chat transcript/i);
  });

  it("opens existing projects through a grounded single-action return session", () => {
    assert.match(source, /\/return-sessions/);
    assert.match(source, /Story so far/);
    assert.match(source, /Where it is going/);
    assert.match(source, /Continuity’s one recommendation/);
    assert.match(source, /slateReturnSplashShouldShow/);
    assert.match(source, /slateReturnNextCardSectionId/);
    assert.match(workspaceCss, /\.returnSession::before[\s\S]*var\(--slate-p\)[\s\S]*var\(--slate-m\)/);
  });

  it("uses the shared PRISM app header and keeps its utility panels mounted", () => {
    const slateBranch = pageSource.slice(
      pageSource.indexOf('if (view === "slate")'),
      pageSource.indexOf('if (view === "story")'),
    );
    assert.match(
      slateBranch,
      /sidebarHeader=\{renderSharedAppletSidebarHeader\("slate"\)\}/,
    );
    assert.match(
      slateBranch,
      /navigationHeader=\{renderSharedAppletNavbar\("Slate tools"\)\}/,
    );
    assert.match(slateBranch, /renderSharedPanels\(\)/);
    assert.match(slateBranch, /renderModeTutorialOverlay\(\)/);
    assert.match(source, /sidebarHeader:\s*ReactNode/);
    assert.match(source, /navigationHeader:\s*ReactNode/);
    assert.match(source, /data-theme=\{theme\}/);
  });
});
