---
name: refresh-assets
description: Explicit-only command that safely refreshes PRISM skin and bot assets from the local intake folder. Use only when the user explicitly invokes `$refresh-assets` or `/refresh-assets`; do not trigger from natural-language requests.
---

# Refresh Assets

Use this command only for explicit invocation: `$refresh-assets` or `/refresh-assets`.

## Purpose

Refresh supplied PRISM skin and bot assets, promote approved files into the
runtime, and revalidate deterministic Library and Marketplace bot rendering.

## Inputs

- `source` (optional): intake file or folder. Default:
  `/Users/jared/Documents/Codex Input`.
- `scope` (optional): `auto`, `bot-frame`, `skin`, or `bot-assets`. Default:
  `auto`.
- A trailing note may name files, desired runtime names, or replacement intent.

## Workflow

1. Work from the PRISM repository root. Use the asset workflow for visual QA
   and Beads for a durable task. Preserve unrelated staged and unstaged work.
2. Inventory the source without deleting, renaming, or modifying intake files.
   Inspect each supplied image before deciding how it maps to the runtime.
3. In `auto` scope, classify only clearly supplied skin/bot assets. Ignore
   unrelated files and ask one concise question only when a file's role would
   materially change the result.
4. For bot-frame paint masks:
   - preserve the authored coverage pattern, but quantize it to exactly two
     pixel values: transparent black `(0,0,0,0)` for untouched metal and
     opaque white `(255,255,255,255)` for painted metal;
   - normalize to a 1000x1000 PNG with alpha;
   - derive hardware geometry from
     `apps/web/public/bot-frame/bot-frame-metal-mask.png`, never from a
     generated frame drawing or contact-sheet crop;
   - never retain intermediate RGB or alpha values; threshold coverage after
     clipping to native geometry. Darkness belongs in the runtime paint color,
     not in mask transparency;
   - run `scripts/normalize_bot_frame_mask.mjs` for native aligned sources;
   - run `scripts/reproject_bot_frame_mask.mjs` for generated, contact-sheet,
     or otherwise untrusted geometry so only the angular paint pattern is
     retained and every ring/light/module cutout comes from the native mask;
   - use a meaningful lowercase hyphenated runtime filename and do not
     overwrite an existing asset unless replacement intent is explicit.
5. Promote approved masks to `apps/web/public/bot-frame/`. Update
   `BOT_FRAME_FINISHES` and `BOT_FRAME_FINISH_RECIPES`, then bump the
   `:finish:vN` selector exactly once for the refresh. Keep Default Prism on
   `PRISM_FACTORY_CLEAN_FRAME_SEED` and add no bot schema field. Keep paint
   opacity solid and render the coat above the metal-light layer. Reuse the
   static frame base as the paint substrate, multiply the normalized bot color
   over it, and use only a broad procedural plastic highlight for lighting.
   Painted regions must retain metal texture without receiving the detailed
   moving metal reflection; never encode darkness in mask transparency. Keep
   `bot-frame-led.png` as the final top compositing layer above metal light,
   paint, and plastic response, using `plus-lighter` so the white-alpha raster
   adds emission instead of replacing the painted color beneath it.
6. Refresh Library and Marketplace behavior through the existing render-time
   seeds: Library bots use stable bot IDs and Marketplace bots use stable
   export hashes. Do not rewrite installed bot records or change marketplace
   `botHash` values merely to refresh visual recipes.
7. For other supplied skins or bot assets, follow the nearest existing asset
   and consumer pattern. Preserve subject identity, dimensions, alpha
   semantics, and user-authored detail; avoid broad redesign or unrelated
   asset sweeps.
8. Update focused coverage for the asset list, two-level pixel contract,
   complete recipe table, Library seed path, and every Marketplace bot. Produce
   a comparison preview under `.codex/output/imagegen/` when the change is visual.
9. Run focused tests, targeted lint, and `npm run typecheck` for the web app.
   Report unrelated dirty-worktree failures separately. Close only the Beads
   issue created or claimed for this refresh.
10. Do not commit, push, delete intake files, or include unrelated assets unless
    the user explicitly requests that additional action.

## Output

- List promoted assets and the new deterministic finish count/version.
- State Library/Marketplace refresh coverage and validation results.
- Link the comparison preview when one was produced.
- Mention untouched intake files and unrelated work briefly.
- Keep the response concise and momentum-forward.
