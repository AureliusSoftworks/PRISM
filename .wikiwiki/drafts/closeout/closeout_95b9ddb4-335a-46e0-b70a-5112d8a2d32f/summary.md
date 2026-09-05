# Closeout Summary

## Signal Producer ident preparation — PRISM-pwk1p

Auto selection and opening-line synthesis already overlap the Producer ident. The change adds one eligible ONLINE bot reply to that interval, using the existing private prepared-turn and voice-prefetch pipeline. Opening playback reuses the pending preparation. LOCAL speculation, human-guest answers, active/pending images, and Watch remain on their existing paths.

The persisted warmup hold must release before lookahead starts because its API route invalidates preparations. Operation ownership is rechecked after that await. Late creation handles are discarded, stale poll responses cannot prefetch audio, and startup errors discard the buffer. Speech remains behind the ident and visual gates; Skip retains its existing choreography.

Verification after task-owned writers stopped: 16 focused web checks passed, including executable startup/reuse/cancellation callbacks, opening choreography, bounded waiting, and voice scheduling. The API prepared-turn suite passed 4/4. File-scoped diff checks passed. The wider four-file web run passed 23/24; its sole Watch-card source assertion also fails against unchanged HEAD. Web typecheck reports only pre-existing errors in RoomLightEditorDialog.tsx and roomLightPlacement.ts, with none in the changed Signal files. Authenticated live/audio playback was not tested because the local web/API were unavailable; no ONLINE generation calls were made.

Reviewed firstRunOnboarding.ts and modeTutorials.ts; no control or copy change was needed. No third-party dependency or asset changed. The generic record drafts below include unrelated shared-worktree changes and were not applied. Beads owns the task's completion record.

## Generated workspace inventory

Closeout draft: `closeout_95b9ddb4-335a-46e0-b70a-5112d8a2d32f`

- Profile: `mixed`
- Audience: `all`
- Validation: passed
- Changed files: 114
- Record drafts: 2
- Markdown files rendered: 15
- Site files rendered: 56

## Changed Files

- .codex/skills/coffee-review/SKILL.md
- .codex/skills/effort-review/SKILL.md
- .codex/skills/references/prism-review-core.md
- .codex/skills/signal-review/SKILL.md
- .codex/skills/signal-review/references/image-lifecycle.md
- apps/api/Dockerfile
- apps/api/src/__tests__/account-content-registry.test.ts
- apps/api/src/__tests__/db.test.ts
- apps/api/src/__tests__/debate-mystery-assets.test.ts
- apps/api/src/__tests__/debate-mystery-prop-selection.test.ts
- apps/api/src/__tests__/debate-mystery-room-art.test.ts
- apps/api/src/__tests__/debate-mystery-v2.test.ts
- apps/api/src/__tests__/owner-boundary-api.test.ts
- apps/api/src/__tests__/prism-domain-capabilities.test.ts
- apps/api/src/__tests__/settings.test.ts
- apps/api/src/__tests__/signal-successive-images.test.ts
- apps/api/src/account-content-registry.ts
- apps/api/src/account-reset.ts
- apps/api/src/botcast.ts
- apps/api/src/builtin-tts.ts
- apps/api/src/db.ts
- apps/api/src/debate-mystery-assets.ts
- apps/api/src/debate-mystery-prop-selection.ts
- apps/api/src/debate-mystery-room-art.ts
- apps/api/src/debate-mystery-v2.ts
- apps/api/src/debate.ts
- apps/api/src/prism-domain-capabilities.ts
- apps/api/src/server.ts
- apps/api/src/settings.ts
- apps/web/src/app/BotcastExperience.tsx
- apps/web/src/app/DebateExperience.module.css
- apps/web/src/app/DebateExperience.tsx
- apps/web/src/app/DebateFlyting.module.css
- apps/web/src/app/DebateFlyting.tsx
- apps/web/src/app/DebateMysteryExperience.tsx
- apps/web/src/app/DebateMysteryV2Experience.tsx
- apps/web/src/app/FlytingGalleryMotion.tsx
- apps/web/src/app/PhosphorPixelGlyph.tsx
- apps/web/src/app/PronunciationAtlas.module.css
- apps/web/src/app/PronunciationAtlas.tsx
- apps/web/src/app/aboutCredits.test.ts
- apps/web/src/app/aboutCredits.ts
- apps/web/src/app/avatarStudioViewportLayout.test.ts
- apps/web/src/app/botAvatarCustomizerModal.test.ts
- apps/web/src/app/chatMiniBotAvatar.module.css
- apps/web/src/app/chatMiniBotAvatar.test.ts
- apps/web/src/app/coffee-seat-arrival-css.test.ts
- apps/web/src/app/debate-experience.test.ts
- apps/web/src/app/debate-mystery-music.test.ts
- apps/web/src/app/debate-stage-alignment.test.ts
- apps/web/src/app/debate-whodunnit-text-voice.test.ts
- apps/web/src/app/debateAudience.test.ts
- apps/web/src/app/debateAudience.ts
- apps/web/src/app/debateFlytingGalleryMotion.test.ts
- apps/web/src/app/debateFlytingGalleryMotion.ts
- apps/web/src/app/debateFlytingStageAlignment.test.ts
- apps/web/src/app/debateFlytingStageAlignment.ts
- apps/web/src/app/debateFlytingStageAuthoring.test.ts
- apps/web/src/app/debateMysteryInterrogation.test.ts
- apps/web/src/app/debateMysteryInterrogation.ts
- apps/web/src/app/debateMysteryInvestigationArt.test.ts
- apps/web/src/app/debateMysteryInvestigationArt.ts
- apps/web/src/app/debateMysteryMusic.ts
- apps/web/src/app/debateMysteryRoomCinematography.module.css
- apps/web/src/app/debateMysteryRoomCinematographyLayer.tsx
- apps/web/src/app/debateMysterySfx.test.ts
- apps/web/src/app/debateMysterySfx.ts
- apps/web/src/app/debateMysteryV2.module.css
- apps/web/src/app/debateMysteryV2Experience.test.ts
- apps/web/src/app/debateMysteryV2Lens.ts
- apps/web/src/app/debateStageAlignment.ts
- apps/web/src/app/modeTutorials.test.ts
- apps/web/src/app/modeTutorials.ts
- apps/web/src/app/page.module.css
- apps/web/src/app/page.tsx
- apps/web/src/app/phosphorPixelRaster.test.ts
- apps/web/src/app/phosphorPixelRaster.ts
- apps/web/src/app/providerMode.test.ts
- apps/web/src/app/providerMode.ts
- apps/web/src/app/qa-whodunnit/page.tsx
- apps/web/src/app/sceneMediaVignette.module.css
- apps/web/src/app/sceneMediaVignette.test.ts
- apps/web/src/app/signal-turn-lookahead.test.ts
- apps/web/src/app/signalTurnPreparationWait.test.ts
- packages/shared/src/audioVoice.test.ts
- packages/shared/src/audioVoice.ts
- packages/shared/src/debateMystery.test.ts
- packages/shared/src/debateMystery.ts
- packages/shared/src/debateMysteryV2.ts
- packages/shared/src/mansionLayoutV2.ts
- packages/shared/src/modelRouting.test.ts
- packages/shared/src/modelRouting.ts
- packages/shared/src/whodunnitProps.ts
- apps/api/src/__tests__/debate-mystery-evidence-presentation.test.ts
- apps/api/src/__tests__/debate-mystery-investigation-targets.test.ts
- apps/api/src/__tests__/debate-mystery-prism-prop-assets.test.ts
- apps/api/src/__tests__/debate-mystery-room-art-source-lock.test.ts
- apps/api/src/__tests__/system-speech-privacy.test.ts
- apps/api/src/debate-mystery-evidence-presentation.ts
- apps/api/src/debate-mystery-investigation-targets.ts
- apps/api/src/debate-mystery-prism-prop-assets.ts
- apps/api/src/debate-mystery-room-art-source-lock.ts
- apps/api/src/debate-mystery-room-lighting.ts
- apps/web/src/app/RoomLightEditorDialog.tsx
- apps/web/src/app/avatarStudioTlc.test.ts
- apps/web/src/app/debateMysteryV2Lens.test.ts
- apps/web/src/app/flytingGalleryLifecycle.test.ts
- apps/web/src/app/flytingGalleryMotionCache.ts
- apps/web/src/app/qa-whodunnit/WhodunnitV2Fixture.tsx
- apps/web/src/app/roomLightEditor.module.css
- apps/web/src/app/roomLightPlacement.ts
- apps/web/src/app/whodunnitDialogueModal.test.ts
- apps/web/src/app/whodunnitDialogueModal.ts
- apps/web/src/app/whodunnitMapLayout.test.ts

## Record Drafts

- note: TODO: capture the useful documentation context from these changes. (.wikiwiki/drafts/closeout/closeout_95b9ddb4-335a-46e0-b70a-5112d8a2d32f/record-drafts/001-note-todo-capture-the-useful-documentation-context-from-these-changes.json)
- event: Working tree changes (.wikiwiki/drafts/closeout/closeout_95b9ddb4-335a-46e0-b70a-5112d8a2d32f/record-drafts/002-event-working-tree-changes.json)

## Beads Work Context

- Beads is detected; detailed reads were skipped to avoid dirtying `.beads/`.
