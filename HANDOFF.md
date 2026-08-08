# Handoff: Idle bot-frame missing unless talking

Generated: 2026-08-08 · Branch: `dev` · Status: Root cause confirmed by runtime logs; CSS fix not applied yet; debug instrumentation still live

## Mission

User report (verbatim framing): **"The frame is missing UNLESS the bot is talking."**

This is the **full / normal bot-frame avatar** (Avatar Studio / ZenLiveBotMannequin / `BotFaceFrame`), **not** the chat mini avatar. Definition of done:

1. Idle preview shows the metal chassis (`bot-frame-base.png` + tint) with dark-gray unlit LED *dots* only.
2. Talking still lights LEDs / tint in accent as today.
3. Debug instrumentation removed only after a post-fix log run proves `solidCoverRisk: false` while idle and the user confirms visually.
4. Do not regress WebKit identity-raster path (pre-baked tint/LED PNGs).

## Current state

- ✅ **Done (adjacent, earlier in session):** Psychic topic-anchor fix (`PSYCHIC_TOPIC_ANCHOR_RULES` in `apps/api/src/chat.ts`) — closed bead `PRISM-j0hxz`. Not the active bug.
- ✅ **Done (adjacent):** Mini chat avatar (`chatMiniBotAvatar.tsx` + on/off PNGs under `apps/web/public/tools/assets/avatar-small/`). Powers empty Chat/Zen hero via `EmptyStateHeroMiniBot`. Message headers still use `MessageMoodFace` `variant="mini"` **without** wrapping `ChatMiniBotAvatar`. Bead `PRISM-lsrb4` closed. **User explicitly said the missing-frame bug is NOT the mini.**
- ✅ **Done:** Explained to user that normal frame does **not** need a separate lights-off PNG — idle LEDs are recolored via `botFrameLedPaintColor` → `#3A3F46`.
- ✅ **Done:** Build-failed recovery — debug instrumentation caused `cs` possibly-null type error at `page.tsx:18865`; fixed by local `ledBackgroundColor`. `npm run build -w apps/web` succeeded.
- ✅ **Done:** Runtime evidence for idle solid-cover (hypothesis **J**) — see log citations below.
- 🔄 **In progress:** Apply CSS/specificity fix so identity-raster LED layers keep `background-color: transparent` even under idle plate rules; keep instrumentation for verification.
- ⬜ **Not started:** Post-fix Avatar Studio Idle/Talking verification; remove `#region agent log` blocks; optional Debate plate same-class fix audit; commit (user tests first).

**Uncommitted / related working tree (do not casually revert):**

| Path | Role |
|------|------|
| `apps/web/src/app/page.tsx` | `BotFaceFrame` / identity rasters + **live debug logs** (F/G/H/J) + mannequin color resolve |
| `apps/web/src/app/page.module.css` | Idle LED `background-color` rules + `.botFaceFrameIdentityRaster` |
| `apps/web/src/app/botFrameMetalAlloy.ts` | Alloy idle/talking paint helpers (`BOT_FRAME_LED_UNLIT_COLOR`, etc.) |
| `apps/web/src/app/chatMiniBotAvatar.*` | Mini avatar (separate feature; leave alone unless asked) |
| `apps/web/public/tools/assets/avatar-small/*` | Mini on/off assets |
| Many other dirty/untracked files in the repo | Pre-existing / unrelated — **do not scoop into this fix commit** |

Branch tip (committed): `ee14e11b` — unrelated to this bug.

## Runtime evidence (session `6971d8`)

Log file: `.cursor/debug-6971d8.log`  
Ingest: `http://127.0.0.1:7914/ingest/796e4cfe-51fc-4e0c-8265-ef32bc063af2`  
Header: `X-Debug-Session-Id: 6971d8`

Captured on idle Prism hub mannequin (`scheduleKey: "bot-hub-default-prism"`, `isTalking: false`):

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| **H** Base chassis missing | **REJECTED** | Base `.botFaceFrame` has `opacity: "1"`, `bgImage` = `bot-frame-base.png?v=1001` |
| **G** Wrong idle paint colors | **PARTIAL** | `accentFrameIdentityColor: null`, `resolvedTintIdentityColor: null`, `resolvedLedIdentityColor: "#3A3F46"` — LED unlit color correct; tint null because Prism default has no accent identity |
| **F** Tint identity blank | **INCONCLUSIVE / not root** | Tint not using identity class (`identityColor: null`); mask still present |
| **J** Solid unlit LED disk covers chassis | **CONFIRMED** | LED layer: `usesIdentityClass: true`, `maskImage: "none"`, `bgColor: "rgb(58, 63, 70)"` (= `#3A3F46`), `solidCoverRisk: true`, `layerZ: "10"`, even after `rasterReady: true` |

Key log lines (paraphrased payloads already in file):

1. Hypothesis J before bake: `bgImage: "none"`, `bgColor: "rgb(58, 63, 70)"`, `maskImage: "none"`, `solidCoverRisk: true`
2. Hypothesis J after bake: `bgImage: "url(\"data:image/png;base64,..."`, **still** `bgColor: "rgb(58, 63, 70)"`, `maskImage: "none"`, `solidCoverRisk: true`
3. Hypothesis H: base frame present with base PNG

**Mechanism:** `.botFaceFrameIdentityRaster` disables masks and wants `background-color: transparent`. Idle plate rule (higher specificity) forces LED `background-color: #3A3F46`. With mask off, transparent pixels of the baked LED PNG reveal a **solid dark disk** at z-index 10 over the metal chassis. When talking, that idle rule does not apply → identity class wins transparency → frame visible.

## Next actions (in order)

1. **Clear** `.cursor/debug-6971d8.log` with the Delete tool only (not `rm`) before the next repro.
2. **Apply the fix** in `apps/web/src/app/page.module.css` (preferred: raise specificity / force transparent bg on identity rasters without breaking unlit LED *dot* color which is baked into the data-URL):
   - Target selectors that currently win over `.botFaceFrameIdentityRaster`:
     - `.zenLiveBotPresencePlate:not([data-talking="true"]):not([data-transitioning="true"]) .botFaceFrameLed` (~30196) sets `background-color: var(--bot-face-frame-led-unlit-color, #3a3f46)`
     - `.debateBotPresencePlate .botFaceFrameLed` (~28808) same pattern
   - Recommended approach (pick one, smallest):
     - A) `.botFaceFrameLed.botFaceFrameIdentityRaster { background-color: transparent !important; }` (or data-attr equivalent with equal/higher specificity than idle plate rules), **or**
     - B) Narrow idle rules to `:not([data-frame-identity-raster])` / `:not([data-frame-identity-raster-ready])` so masked fallback still gets solid+mask, identity path stays transparent+image.
   - Do **not** remove unlit LED color from `botFrameLedPaintColor` — dots must stay `#3A3F46` via the baked raster.
3. Keep all `#region agent log` blocks; optionally tag `runId: "post-fix"`.
4. Ask user to Idle → Talking → Idle in Avatar Studio (and/or Bot Hub Prism) after hard refresh / rebuild.
5. Confirm logs: idle LED `bgColor` transparent / `rgba(0,0,0,0)`, `solidCoverRisk: false`, `maskImage: "none"` still OK, `rasterReady: true`, base frame still present.
6. User visual confirm → then **remove** instrumentation and run focused CSS/unit tests if present (`zen-live-presence-css.test.ts` patterns for idle LED).
7. Commit only after user tests (user rule). Scope commit tightly to frame fix (+ tests); leave mini-avatar / other dirt alone unless asked.

## Decisions & constraints

- **Normal frame ≠ mini frame.** Mini uses on/off PNGs + magenta hue keying. Normal uses `bot-frame-base.png` + tint mask + LED mask / identity rasters. User corrected mid-session when investigation drifted to mini.
- **No separate lights-off asset for normal frame** — product decision already explained; idle = unlit paint color, not a second chassis PNG.
- **Identity rasters exist for WebKit** — comment in `page.tsx` near `BotFaceFrameIdentityRaster`: mask composition intermittently drops under fixed Zen plate; pre-baked RGBA backgrounds are the stable path. Do not “fix” by ripping out identity rasters.
- **Idle LEDs must sit above alloy/tint** (bead `PRISM-oc8ws` / `BOT_FRAME_LED_UNLIT_COLOR`) — fix must not let alloy tint recolor unlit bulbs.
- **Debug mode:** no fix-without-logs (already have logs); do not remove instrumentation until post-fix proof + user confirm; clear log file with Delete tool before runs.
- **User is layman-facing** — explain UI effect first; keep AskQuestion traffic-light for validation when that tool is available.
- **No commit until user playtests.**

## Landmines

- **Specificity trap:** `.botFaceFrameIdentityRaster { background-color: transparent }` loses to `.zenLiveBotPresencePlate:not([data-talking="true"])… .botFaceFrameLed { background-color: #3a3f46 }`. Talking “fixes” visibility by dropping that rule — looks like a talking-only feature bug, but it’s CSS cascade.
- **Even with `rasterReady: true`**, solid `bgColor` under a masked-off layer still covers the chassis through PNG transparency — baking alone does not fix it.
- **Prism default bot** logs showed `accentFrameIdentityColor: null` / tint identity null — still reproduces via LED identity + unlit color. Avatar Studio with a persona accent will also hit the same LED cover path when idle.
- **Debate plate** always sets LED `background-color` unlit (`~28808`) and only swaps color when talking — same solid-disk risk whenever identity rasters disable masks. Fix both Zen idle and Debate rules in one pass.
- **Mini avatar red herring:** prior logs/instrumentation on `chatMiniBotAvatar.tsx` were removed after user correction; do not reopen that path for this bug.
- **Working tree is very dirty** (artifacts, other features). Stage surgically.
- **Desktop build** runs full `next build` typecheck — keep instrumentation type-safe (`cs` nullability already burned once).

## Map

- `apps/web/src/app/page.tsx`
  - `useBotFaceFrameIdentityRaster` / `BotFaceFrameIdentityRaster` ~18774–18900 (instrumentation J/F)
  - `BotFaceFrame` ~18900+ (instrumentation H)
  - `ZenLiveBotMannequin` color resolve ~31134–31184 (instrumentation G); `BotFaceFrame` usage ~31415
  - Avatar Studio preview plate: `data-talking={previewTalking}` ~38885; `isTalking={previewTalking}` on mannequin ~38917
- `apps/web/src/app/page.module.css`
  - Idle Zen LED solid fill ~30165–30208
  - Debate LED fill ~28808–28833
  - `.botFaceFrame` base ~70179
  - `.botFaceFrameLed` ~70412
  - `.botFaceFrameIdentityRaster` ~70489 (`mask-image: none`, `background-color: transparent`)
- `apps/web/src/app/botFrameMetalAlloy.ts` — `botFrameIdentityPaintColor`, `botFrameLedPaintColor`, `BOT_FRAME_LED_UNLIT_COLOR`
- Assets: `apps/web/public/bot-frame/bot-frame-base.png`, `bot-frame-led.png`, `bot-frame-tint-mask.png`
- Tests: `apps/web/src/app/zen-live-presence-css.test.ts`, `botFrameMetalAlloy` tests if present
- Commands:
  - Dev: `npm run dev` (web often via nginx/desktop; this session also saw `127.0.0.1:19788`)
  - Web build: `npm run build -w apps/web`
  - Desktop: `npm run desktop:build:mac-app` (stages runtime + Tauri)
- Debug log path: `/Users/jared/Developer/Web Apps/PRISM/.cursor/debug-6971d8.log`

## Verification

1. Hard refresh or rebuild so CSS fix loads.
2. Avatar Studio → preview **Idle**: metal ring/chassis visible; LEDs dark gray dots only (not a solid dark circle; not missing chassis).
3. Preview **Talking**: accent LEDs + tint behavior unchanged.
4. Read `.cursor/debug-6971d8.log`: idle LED entries show `solidCoverRisk: false` and transparent `bgColor`.
5. Optional: Bot Hub default Prism idle mannequin (same path that produced the confirming logs).
6. Optional: `npm run build -w apps/web` if instrumentation touched.
7. After user 🟢: remove agent logs; add/adjust CSS test asserting identity-raster LED background stays transparent under idle plate selectors.
