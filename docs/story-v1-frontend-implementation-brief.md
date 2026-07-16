# Story V1 Frontend Implementation Brief

This brief translates the UX contract into an implementation contract for the current web shell.

- UX source of truth: `docs/story-v1-ux-contract.md`
- Runtime shell targets: `apps/web/src/app/page.tsx`, `apps/web/src/app/page.module.css`
- Scope: define responsibilities and boundaries; do not fully implement Story generation backend in this step.

## 1) Required `page.tsx` View/State Model Additions

### 1.1 Extend root app view routing for Story

Add Story as a first-class post-auth view in `apps/web/src/app/page.tsx`:

- Extend `type View` from `"hub" | "chat" | "sandbox"` to include `"story"`.
- Update URL parsing (`viewParam`) to resolve `?view=story` to `"story"`.
- Keep existing fallback behavior: unknown `view` values still resolve to `"hub"`.
- Enable the Hub Story tile to navigate via `navigateToView("story")` (remove disabled placeholder behavior when Story shell is ready to mount).

### 1.2 Add Story-local phase model (inside HomeContent)

Introduce Story phase state under the Story view branch:

- `type StoryPhase = "setup" | "generating" | "reading" | "library"`
- `const [storyPhase, setStoryPhase] = useState<StoryPhase>("setup")`
- `const [storyState, setStoryState] = useState<StoryState>(initialStoryState)`

Recommended `StoryState` shape (minimum):

- `sessionId: string | null` - current generation/imported session identity.
- `answers: StorySetupAnswers` - setup form values.
- `autosave: { status: "idle" | "saving" | "saved" | "error"; lastSavedAt: string | null; error: string | null }`
- `readiness: { canGenerate: boolean; blockers: string[] }`
- `generation: { status: "idle" | "planning" | "writing" | "rendering_images" | "done" | "error"; textReady: boolean; imagesReady: number; totalImages: number; recoverableError: string | null }`
- `reader: { openStoryId: string | null; pageIndex: number; textReadyAt: string | null }`
- `library: { items: StoryLibraryItem[]; importState: "idle" | "validating" | "error"; importError: string | null }`

Non-negotiable contract mapping to UX doc:

- Setup answers autosave incrementally after meaningful field changes.
- Reader unlocks as soon as `generation.textReady === true`.
- Missing images must not block reading; image count/backfill state stays live while reading.

### 1.3 URL and persistence contract

- Keep Story session continuity on refresh/reopen by persisting the minimum recoverable state (`sessionId`, `storyPhase`, generation status snapshot).
- Prefer existing app persistence patterns used by this file (React state + existing fetch/session restore pattern), not a new state library.
- If URL-level deep-linking is added later (`?view=story&storyPhase=reading`), phase parsing must sanitize unknown values back to `"setup"`.

## 2) Component/State Boundaries (Setup, Generating, Reading, Library)

Use container-presentational separation within `page.tsx` first, then extract only if complexity grows.

### 2.1 Story shell container (state owner)

Container responsibilities in `page.tsx`:

- Own `storyPhase` and `storyState`.
- Own transitions and guards (`setup -> generating -> reading/library`).
- Own side-effect orchestration (autosave debounce, generation polling/stream updates, image backfill updates, import validation requests).
- Pass only phase-specific props to child render helpers/components.

Suggested render helpers (can start as local functions):

- `renderStorySetup(...)`
- `renderStoryGenerating(...)`
- `renderStoryReading(...)`
- `renderStoryLibrary(...)`

### 2.2 Setup boundary

Setup is responsible for:

- Field capture + inline validation copy.
- Incremental autosave status strip (`Saving...`, `Saved`, `Retry`).
- Computing + displaying readiness blockers.

Setup must not:

- Decide navigation to reading/library directly except via container callbacks.
- Own generation polling lifecycle.

### 2.3 Generating boundary

Generating is responsible for:

- Plain-language stage display (`Planning`, `Writing`, `Rendering images`).
- Surfacing safe next actions (`Open reader now` once text-ready, retry controls for recoverable failures).
- Showing current image progress while rendering continues.

Generating must not:

- Own canonical answer/edit state.
- Mutate library list directly.

### 2.4 Reading boundary

Reading is responsible for:

- Rendering earliest text-ready payload.
- Deterministic placeholder visuals for missing images.
- Non-blocking in-place replacement when backfilled images arrive.
- Status metadata (`x of y images ready`).

Reading must not:

- Re-run generation.
- Hide image failures; it should surface retry affordances via callbacks.

### 2.5 Library boundary

Library is responsible for:

- Story-only item listing (no cross-mode merge in V1).
- Open action that restores correct active phase (`reading` vs `generating`).
- Import/export entry points with strict validation outcomes.

Library must not:

- Coerce invalid `.story` payloads.
- Show partial import as success.

## 3) Event + State Transition Contract

This is the required transition/event graph for frontend behavior.

### 3.1 Incremental answers and autosave

Events:

- `STORY_ANSWER_CHANGED(field, value)`
- `STORY_AUTOSAVE_STARTED`
- `STORY_AUTOSAVE_SUCCEEDED(timestamp)`
- `STORY_AUTOSAVE_FAILED(message)`

Rules:

- Every meaningful answer change queues autosave.
- While pending save, status is `saving`; on success `saved`; on failure `error` with explicit retry action.
- Failed autosave never clears local answers.

### 3.2 Generate unlock condition

Events:

- `STORY_READINESS_RECOMPUTED`
- `STORY_GENERATE_REQUESTED`
- `STORY_GENERATE_STARTED(sessionId)`

Rules:

- `Generate story` enabled only when `readiness.canGenerate === true`.
- If not ready, show concrete blockers (field-level where possible).
- Generate can only start from setup phase.

### 3.3 Generation-to-reader unlock + image backfill

Events:

- `STORY_TEXT_READY(payload)`
- `STORY_IMAGES_PROGRESS(readyCount, totalCount)`
- `STORY_IMAGE_BACKFILLED(imageKey, url)`
- `STORY_IMAGES_FAILED_RECOVERABLE(message)`

Rules:

- On `STORY_TEXT_READY`, reader becomes available immediately (primary CTA in generating: `Open reader now`).
- Entering reading does not pause image updates.
- `STORY_IMAGE_BACKFILLED` updates the currently visible reading payload in place.
- Recoverable image failures keep reader accessible and expose retry actions.

### 3.4 Library/open/import transitions

Events:

- `STORY_LIBRARY_OPENED`
- `STORY_LIBRARY_ITEM_OPENED(itemId, resumePhase)`
- `STORY_IMPORT_REQUESTED(file)`
- `STORY_IMPORT_VALIDATION_FAILED(message)`
- `STORY_IMPORT_SUCCEEDED(itemId)`

Rules:

- Opening a library item restores correct mode (`generating` if in-flight, `reading` if text-ready).
- Import failures remain in library flow with actionable errors.
- Fatal validation failures block open and do not mutate library state.

## 4) CSS Module Responsibilities (`page.module.css`)

Story UI should reuse existing shell tokens and patterns first.

### 4.1 Token and primitive reuse

- Reuse existing theme/custom properties (`--bg-*`, `--fg-*`, `--line`, `--accent-*`).
- Reuse shared utility classes where appropriate (`.muted`, `.error`, `.panelNotice` behavior patterns).
- Keep focus-visible and reduced-motion behavior consistent with existing controls.

### 4.2 Story class naming guidance

Use Story-prefixed class names in `apps/web/src/app/page.module.css`:

- Shell/layout: `.storyShell`, `.storyHeader`, `.storyBody`, `.storyFooter`
- Phase wrappers: `.storySetup`, `.storyGenerating`, `.storyReading`, `.storyLibrary`
- Status/feedback: `.storyAutosaveStatus`, `.storyProgressStage`, `.storyImageProgress`, `.storyInlineError`
- CTA hierarchy: `.storyPrimaryAction`, `.storySecondaryAction`, `.storyTertiaryAction`
- Placeholder/backfill: `.storyImagePlaceholder`, `.storyImagePendingLabel`, `.storyImageReady`

Guidance:

- Use one semantic class per responsibility; avoid overloaded classes with phase-specific side effects.
- Favor data attributes for phase/status toggles (`data-phase`, `data-status`) when style changes are state-driven.
- Avoid introducing new color constants; derive from existing variables.

### 4.3 Accessibility/style contract

- Status regions that change asynchronously (autosave/progress/errors) should use appropriate live-region semantics in JSX.
- Placeholder labels must remain readable in both themes.
- Buttons must preserve keyboard/focus affordances already used in this stylesheet.

## 5) Error and Fallback Handling Responsibilities

Map directly to UX contract edge states:

- Setup autosave fail: persistent inline banner + retry action; keep inputs intact.
- Generation fail before text-ready: retry generation CTA + preserve setup answers.
- Text-ready but image pipeline stalled: reader remains unlocked + retry image render action.
- Session reload during generating: restore phase + latest known stage instead of dropping user to setup.
- Import validation failure: remain in library import flow with actionable message.
- Story open failure from library: retry + safe `Back to library` fallback.

Error copy constraints:

- Human-readable, action-oriented, no raw stack traces.
- Prefer single clear reason plus one next action.

## 6) Developer_1 Acceptance Checklist (Execution Contract)

Use this checklist when implementing Story shell work in `page.tsx` / `page.module.css`:

- [ ] `View` supports `"story"` and Story route parses from URL safely.
- [ ] Hub Story tile routes into Story shell (no disabled placeholder once shell exists).
- [ ] Story phase model exists with explicit `setup/generating/reading/library` boundaries.
- [ ] Incremental autosave states render clearly (`Saving...` / `Saved` / `Retry`).
- [ ] Generate CTA is gated by explicit readiness logic and blocker messaging.
- [ ] Reader unlocks on text-ready without waiting for full image completion.
- [ ] Missing images use deterministic placeholders with visible pending label.
- [ ] Backfilled images replace placeholders in place during reading.
- [ ] Library open restores correct phase per item state.
- [ ] `.story` import validation failures are strict, actionable, and non-destructive.
- [ ] Story CSS classes follow Story prefix guidance and reuse existing theme tokens.
- [ ] Error paths always offer a safe next action (retry/back) with no dead ends.

## 7) Out of Scope for This Brief

- Backend API design details and storage schema.
- Full implementation of generation engine.
- Refactoring unrelated Chat/Sandbox runtime behavior.
- Slate workspace UI and cross-applet handoff UI. Story remains independently
  routed. A later `Develop in Slate` entry creates an explicit source snapshot
  and asks for output scale and faithfulness before opening Slate; it must not
  pass a raw transcript or silently share mutable state. See
  `docs/slate-v1-product-ux-contract.md`.
