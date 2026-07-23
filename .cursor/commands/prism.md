# /prism — Prism Assistant meta capabilities and UX

Load context for work on the in-app Prism assistant — the meta layer that sits on top of every bot conversation and exposes optional tools (chips, image generation, web search, story controls, Zen placement hints).

## Source of truth

- **Tools appendix** (system prompt injected into every conversation): `apps/api/src/chat.ts` — see `PRISM_ASSISTANT_TOOLS_APPENDIX` around line 3387. This defines every meta tool the assistant can emit and the exact JSON shape it must emit.
- **Parser + renderer** (web): `parseAssistantPrismTools` in `apps/web/src/app/page.tsx` (referenced around lines 755, 8874, 26653, 30479–30624). Strips `<<<PRISM_TOOL>>>…<<<PRISM_TOOL/>>>` from the visible message and dispatches on tool name.
- **Editor highlighting**: `apps/web/src/app/tiptapPrismDevCommandHighlight.ts` (chip classes `tiptapPrismToolToken` and `tiptapPrismToolChipPrefix`).

## Current meta tools

- `AskQuestion` — tap-to-reply chips (2 for yes/no, 4 otherwise).
- `tellFictionalStory` — three-chip action rail after fiction: continue / bookmark / finish.
- `sendGeneratedImage` — inline image request; visible prose stays short.
- `webSearch` — one query per turn; server fetches and shows a source card.
- `zenDisplay` — hidden layout hint used only by Zen surfaces.

## When you run /prism, assume one of these tasks

1. **Add or refine a meta tool** — extend the appendix, the parser, and the renderer in lockstep. Never let the three drift.
2. **Fix an assistant UX bug** — chips misrendering, JSON leaking into visible prose, image-bubble ordering, Zen jitter, dev-tool highlighting glitches.
3. **Improve the assistant's visual presentation** — chip styling, source cards, image bubble timing, transition polish.

## Guardrails

- Meta tools stay optional — no bot should be forced to emit them.
- Never wrap `<<<PRISM_TOOL>>>` blocks in Markdown code fences (leaves empty code boxes).
- Respect lane isolation: `zenDisplay` is Zen-only; other tools must not sneak lane-specific behavior into shared code.
- Preserve backward compatibility — assistant messages already in the DB use the current format.
- Any new outbound fetch triggered by a tool (webSearch, image gen) must respect the LOCAL/ONLINE mode gate.
