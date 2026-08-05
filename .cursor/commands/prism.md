# /prism — Prism Assistant meta capabilities and UX

Load context for work on the in-app Prism assistant — the meta layer that sits on top of every bot conversation and exposes optional tools (chips, image generation, web search, personal notes, story controls, Zen placement hints).

## Source of truth

- **Tools appendix** (system prompt injected into every conversation): `apps/api/src/chat.ts` — see `PRISM_ASSISTANT_TOOLS_APPENDIX`. This defines every meta tool the assistant can emit and the exact JSON shape it must emit.
- **Floating Ask Prism companion**: `apps/api/src/prism-companion.ts` — also teaches and executes `userNotes` (clear shorthand like `bug note: …` plus the same `<<<PRISM_TOOL>>>` path).
- **Parser + types** (shared): `parseAssistantPrismTools` in `packages/shared/src/prismTool.ts`. Strips `<<<PRISM_TOOL>>>…<<<END_PRISM_TOOL>>>` from the visible message and normalizes tool payloads. The web app imports this from `@localai/shared`.
- **Editor highlighting**: `apps/web/src/app/tiptapPrismDevCommandHighlight.ts` (chip classes `tiptapPrismToolToken` and `tiptapPrismToolChipPrefix`).

## Current meta tools

- `AskQuestion` — tap-to-reply chips (2 for yes/no, 4 otherwise).
- `tellFictionalStory` — three-chip action rail after fiction: continue / bookmark / finish.
- `sendGeneratedImage` — inline image request; visible prose stays short.
- `webSearch` — one query per turn; server fetches and shows a source card.
- `userNotes` — personal notes (save / list / get / delete) via Chat lane **or** floating Ask Prism. Create and edit only through conversation; shows a small receipt card. Not Memory and not Slate Room Notes. Blocked in Private/incognito.
- `zenDisplay` — hidden layout hint used only by Zen surfaces.

## When you run /prism, assume one of these tasks

1. **Add or refine a meta tool** — extend the appendix, the shared parser, and the renderer in lockstep. Never let the three drift.
2. **Fix an assistant UX bug** — chips misrendering, JSON leaking into visible prose, image-bubble ordering, Zen jitter, note-receipt glitches, companion note-receipt glitches, dev-tool highlighting glitches.
3. **Improve the assistant's visual presentation** — chip styling, source cards, note receipts, image bubble timing, transition polish.

## Guardrails

- Meta tools stay optional — no bot should be forced to emit them.
- Never wrap `<<<PRISM_TOOL>>>` blocks in Markdown code fences (leaves empty code boxes).
- Respect lane isolation: `zenDisplay` is Zen-only; `userNotes` is Chat + floating Ask Prism (blocked in Private/incognito and other conversation lanes); other tools must not sneak lane-specific behavior into shared code.
- Preserve backward compatibility — assistant messages already in the DB use the current format.
- Any new outbound fetch triggered by a tool (webSearch, image gen) must respect the LOCAL/ONLINE mode gate. Notes stay local SQLite only.
