# Handoff: Coffee lag — one canvas call costs 200–590ms, and it is not JavaScript-shaped

Jared confirmed the force-quits happened **in the desktop app** — Tauri
WKWebView running the staged production build. Measured against a real,
production, GPU-backed browser, the freeze reproduces and has two causes.

## RESULT (2026-08-19, production build, live 5-bot table, headed browsers)

Group "Dreamscapes & Doubt", llama3.2, 5 seats, bots talking, 1400x948 @dpr2,
driven through Playwright with a **visible, focused** window in both engines.

### 1. `canvas.getImageData` — a single call blocks 141–587 ms

```
                     calls/8s   worst call    cost
WebKit   (headed)       3–4        587 ms     134 ms/s
Chromium (headed)       1–4        271 ms     102 ms/s
Chromium (headless)       4        0.4 ms       —      ← the trap
```

That is `PhosphorPixelGlyph`'s `rasterizeTextMask` (`getImageData` → per-pixel
JS → `putImageData` → `toDataURL`). **One call drops 8–35 frames.** It fires
when glyph content changes, which in Coffee is every mouth shape, on five seats.

**This is the finding the previous session had and threw away.** It measured the
rasterizer as ~1ms and retired it — in a throttled, hidden, headless Chromium,
where the GPU→CPU readback is free. On real hardware it is not. The defect it
described was right; only the cost measurement was wrong.

### 2. Concurrent CSS animations — 2 before the table opens, 45–86 during

Frames degrade with animation count even in windows with **zero** `getImageData`
calls (headed Chromium, window 1: 71 animations, no readback, frame p50 75 ms).

```
coffeeCupSteamRise           18      opacity/transform
botVoiceLight{Bulb,Aura,Core,Emitter}Breath   6 each
crtElectronicBreath / …Counter                6 each
zenLiveBotCrtFaceFlicker      6
crtStaticSnowJitter           6      background-position ← never composited
botAmbientUnderglowBreathe    5
botAmbientHoverDrift          5
zenLivePrism*HueRotate        2      filter ← main-thread every frame
```

Disabling **only** `animation`/`transition` recovers the table:

```
baseline           p95 frame gap 175 ms · 56.5 fps
animation:none     p95 frame gap  34 ms · 58.8 fps
everything off     p95 frame gap  20 ms · 58.8 fps
```

Killing `backdrop-filter` alone, or blend/mask alone, did **not** help. The cost
is animations ticking, not the glass.

### 3. React render cost is not the problem in production

```
production, Zen                 2.8 ms/render
production, Coffee 5 seats      4.7 ms/render
production, live table         5–18 ms/render
JS attributed, live table    17–263 ms/s   (2–26% of the main thread)
```

## Why four sessions of measurement missed both

Every instrument used so far watched **JavaScript**: rAF cost, timer cost,
render counts, `busy ms/s`, fiber churn. Cause #2 is style/paint/composite and
is invisible to all of them. Cause #1 *is* JavaScript, but only shows its true
cost when the page is composited on a real GPU — headless and hidden windows
both make the readback free, and both earlier sessions measured it that way.

**It is not an engine difference.** An earlier draft of this handoff blamed
WebKit; a headed Chromium control disproved that. Both engines collapse. WebKit
is merely worse (587 ms vs 271 ms worst call), and the desktop app is where
Jared plays, which is why he sees it there.

## Where to attack, in order

1. **Get `getImageData`/`toDataURL` off the mouth-shape path.** Highest cost per
   call by far, and the previous session already wrote a fix for the underlying
   defect (`PhosphorPixelGlyph` keys its effect on `[children]`, a fresh identity
   every parent render) that short-circuits when markup and host box are
   unchanged. It sits unverified in a stash. Verify it against the numbers above
   — the acceptance test is worst-call, not average.
2. **Cut concurrently running animations at a live table.** 18 steam loops and
   ~30 per-seat breath/flicker loops are the bulk. Run decorative loops only for
   the speaking seat, cap steam wisps, or drive them from one shared timeline.
3. **`crtStaticSnowJitter` animates `background-position`; the hue-rotates
   animate `filter`.** Neither can ever be composited — they are main-thread
   every frame in every engine. Convert or drop them first among the animations.

## Measurement discipline — the rule that would have saved four sessions

**Never measure rendering cost in a hidden, headless, or unfocused window.**
Hidden tabs suspend rAF and throttle timers; headless browsers skip the GPU
readback entirely. Both make the two real causes here read as zero. Durations of
*executed JavaScript* survive (that is why the forced-render technique below
works anywhere), but anything touching paint, compositing, or canvas readback
must be measured headed, visible, and focused.

## How to re-run any of this

Harnesses are in the scratchpad worktree (`prism-prod/`), all taking
`ENGINE=webkit|chromium`, `HEADED=1`, and `GROUP=`:

- `main-thread.mjs` — wraps every rAF/timer/MessageChannel callback plus the
  canvas calls, reports ms/s per bucket against wall clock, with frame p50/p95.
  **This is the one that found both causes.**
- `live-table.mjs` — opens a live table and samples a timeline.
- `live-ab.mjs` — A/B of CSS effect variants (the animation result above).
- `anim-inventory.mjs` — what is animating, by name and by animated property.
- `anim-ab.mjs` — pauses animation groups by name through the Web Animations
  API. **This one did not work**: animations are recreated continuously, so by
  probe time new unpaused instances existed (`paused 0` in nearly every row) and
  it mostly measured nothing. It is why per-group ranking is still open. The CSS
  variant A/B in `live-ab.mjs` is the load-bearing evidence.
- `scripts/perf/desktop-render-probe.js` — paste-in probe for the real desktop
  app's Web Inspector, to confirm any of this on WKWebView proper.

They log in as `admin` / `password`. Group model pins matter: "Bikini Bottom" is
pinned to a model that is not installed, and **"Auto" resolves to
`gemma3:latest`, which is also not installed**, so a table opened on Auto dies at
the first turn with "the local model couldn't get ready". The harnesses pin
Llama 3.2 through the header picker (`aria-label="Model for local replies"`)
first. That Auto-resolution is a separate real bug, recorded and not fixed.

## Still open

- Per-animation-group ranking (see `anim-ab.mjs` above).
- Nothing has been fixed. This session measured; it did not change app code.
- The forced-render / dev-server findings below remain true and useful, but they
  describe the **dev server**, which is not what Jared plays in.

---


# Handoff: Coffee lag — it is the dev server, measured 107×

## RESULT (2026-08-19): 97% of render cost is React's *development* JSX runtime

One `HomeContent` render, same app, same screen, same forced render:

```
dev  (next dev --webpack, :18788)     300 ms
prod (next build + standalone, :3999)   2.8 ms      ← 107× cheaper
```

Coffee, five seats, table setup screen: dev **451 ms** vs prod **4.7 ms**.
Coffee, table open, awaiting topic: prod **2.1 ms**. Coffee with the error
overlay up (582 DOM nodes): prod **3.7 ms**.

**HomeContent creates ~1,100 React elements per render — not 100,000.** The DOM
is 280–580 nodes. There is no element explosion and there is no pathological
app-side computation. In dev each of those ~1,100 `jsxDEV` calls costs
**~250–400 µs**, which is 100× what a `jsx()` call costs anywhere else.

### The bisect that proves it

Replacing `react/jsx-dev-runtime`'s `jsxDEV` with a minimal element factory, at
runtime, in the running dev app, then adding React's dev work back one piece at
a time (ms per `HomeContent` render, Zen screen, ~1,100 elements each):

```
bare factory                     15.1 ms
  + Error("react-stack-top-frame")  294.7 ms   ← the entire cost
  + 3× Object.defineProperty         8.9 ms
  + Object.freeze(props/element)     12.0 ms
  + all three                      303.6 ms
real dev jsxDEV                    299.1 ms
```

`console.createTask` is not involved (re-instantiating the runtime module with
`console.createTask` deleted changed nothing: 302.9 → 305.3 ms). Neither is
`Object.freeze` or `defineProperty`. It is the per-element `Error()` that React
19's dev build constructs to attach an owner stack.

**Hypothesis, not established:** the same `Error()` costs 0.5 µs from a small
function and ~250 µs from inside `HomeContent`'s stack, and the first capture at
a given call site is far worse than repeats (582 µs → 13 µs → 4.5 µs). That is
consistent with V8 paying per-call-site source-position work inside a single
enormous function — `HomeContent` is ~90k lines of one function. It does not
fully reconcile (render #2 would then be cheap, and it is not). Treat the
mechanism as open; the bisect table above is the durable result.

### Two confounds, both closed

- **The prod build is HEAD; the working tree has modified `packages/shared/*`**
  (`listenerReaction.ts`, `botVernacular.ts`, `autoFallback.ts`). That is a real
  difference between the two builds — and it cannot explain the gap, because the
  in-place swap (`bare 15.1` vs `real dev jsxDEV 299.1`, same app, same tree,
  same instant) puts 97% of the dev cost *inside* `jsxDEV`. `page.tsx` itself is
  identical to HEAD.
- **Strict mode double-invokes the render body in dev.** `~1,100` is therefore
  `jsxDEV` calls *as counted*, likely ~550 elements evaluated twice, so read
  250–400 µs as per-call, not per-element. It moves nothing: the bisect is a
  within-dev comparison at a fixed call count.

### What this retires

- **"Each `HomeContent` render blocks the main thread for roughly a second."**
  True in dev, and only in dev. In production it is 2–5 ms.
- **"The seat map needs its own memo boundary — a big rock."** Not on this
  evidence. The seat map is ~1,100 elements' worth of the same cheap work; at
  prod cost, five seats re-rendering six times a second is ~3% of a core.
- **The 98%-blocked / 1 FPS live-table numbers.** Real, but they were taken on
  the dev server, so they measure dev's per-element `Error()` capture.

### The one thing that decides whether the mission is closed

**Which build freezes?** The desktop app is production, and its runtime is
current: `apps/desktop/src-tauri/tauri.conf.json` has **no `devUrl`** — it ships
`frontendDist: "../webview"` and bundles `runtime/` as a resource, and
`desktop:stage-runtime:dev` copies the Next standalone output
(`scripts/stage-desktop-runtime.mjs:748`). Both `runtime/` and
`apps/web/.next/standalone` are dated **Aug 18 22:05**, so the desktop app has
been running a fresh production build, not the dev server.

So the question is only: were the force-quits in the **desktop app** or in a
**browser on :18788**? If :18788, this finding is the whole answer. If the
desktop app, Coffee's freeze is still unexplained and this is a (large) DX win
only. **Ask Jared before optimizing anything else.**

### If the dev server is the answer — the fix worth building

An env-gated shim, `PRISM_DEV_FAST_JSX=1`, aliasing `react/jsx-dev-runtime` to a
local module whose `jsxDEV` skips the owner-stack `Error()`. Measured effect:
300 ms → ~15 ms per render, 20×. Cost: React's error overlay loses owner stacks,
and a hand-rolled factory suppresses key warnings unless it reproduces `_store`
faithfully. Aliasing to `react/jsx-runtime` will **not** work — in dev that
resolves to `react-jsx-runtime.development.js`, which captures the same stack
(`grep -c 'react-stack-top-frame'` → 3).

## HOW TO MEASURE THIS AGAIN — visibility no longer required

The previous handoff's warning still holds for FPS, `busy ms/s` and frame gaps.
It does **not** hold for this technique, which is why it worked in a hidden
pane: a render either happens or it does not, and when it happens its duration
is real. React commits on a MessageChannel, which hidden tabs do not throttle.

1. Find the app fiber without relying on names (production is minified): walk
   from `document.body[Object.keys(document.body).find(k => k.startsWith("__reactFiber$"))]`
   up to the root, then down, and take the function component with the most
   hooks — `HomeContent` has exactly **2163**, of which 649 own a queue.
2. Force renders with no semantic change: hook index **16** is a `useState([])`
   whose value is an empty array. `hook.queue.dispatch([])` is a fresh identity
   with identical contents, so React cannot bail out and nothing else changes.
3. Yield between dispatches with a `MessageChannel` round-trip, never
   `setTimeout` — hidden tabs throttle timers to ~1 Hz and a 40×25 ms loop
   becomes 40 s.
4. Count elements by patching the webpack module cache: push a fake chunk onto
   `window.webpackChunk_N_E` to capture `__webpack_require__`, then swap
   `require.c['(app-pages-browser)/../../node_modules/next/dist/compiled/react/jsx-dev-runtime.js'].exports.jsxDEV`
   for a counting wrapper. It is a live property read at every call site, so the
   swap takes effect immediately and restores cleanly.
5. Chrome's JS Self-Profiling API is available in dev now — `next.config.ts`
   sets `Document-Policy: js-profiling` when `NODE_ENV === "development"`.
   `new Profiler({sampleInterval: 2})` → `stop()` → aggregate `samples`/`stacks`/
   `frames`. It named `jsxDEV` in one run. **This header edit is uncommitted and
   is Jared's call to keep.**

## Reproducing the production comparison

```bash
git worktree add --detach <tmp> HEAD
ln -s <repo>/node_modules <tmp>/node_modules
ln -s <repo>/apps/web/node_modules <tmp>/apps/web/node_modules
cp <repo>/.env <tmp>/.env
cd <tmp>/apps/web && npm run build
cp -R .next/static .next/standalone/apps/web/.next/static
cp -R public .next/standalone/apps/web/public
cd .next/standalone/apps/web && PORT=3999 LOCALAI_API_ORIGIN=http://127.0.0.1:18787 node server.js
```

Standalone output ships neither `.next/static` nor `public/` — without those two
copies the page loads HTML with no JS and every number is meaningless. Session
cookies ignore ports, so :3999 is already logged in if :18788 is.

## State of the machine as this was written

- Jared's `npm run dev` (API **and** web) went down mid-session. The most
  likely trigger is the `next.config.ts` edit below: Next dev restarts on a
  config change and `scripts/dev.mjs` supervises both children. Not confirmed —
  the app served requests fine for a while after the edit — but do not treat it
  as an exonerated bystander. **The API was restarted from this session**
  (`npm run dev:api`, backgrounded), so **port 18787 is held by that process**
  and `npm run dev` will fail on a port conflict until it is killed. The dev
  **web** server on :18788 is *not* running; the production build on :3999 is.
- `apps/web/next.config.ts` is modified (the dev-only `Document-Policy` header)
  and uncommitted. Stage it by explicit path; the tree also carries a parallel
  session's work.
- Two Coffee sessions were created in the Bikini Bottom group while testing. The
  production one failed at first turn: the group is pinned to `gemma3:latest`,
  which is not installed in Ollama.
- A live conversing table was never flown. That acceptance test needs a visible,
  focused window and is Jared's to run.

# Handoff: Coffee lag — render cost, measured on a live table

## LIVE-TABLE RESULT (2026-08-18, 221s, `visible` asserted on every sample)

A real 5-bot table (Bikini Bottom, OpenAI, 10 messages). Every sample below was
taken with `visibilityState === "visible"` **and**
`data-prism-visual-lifecycle === "foreground"` verified in the same script.

```
s=0    120 FPS · home 0/s     ← before the topic is picked
s=5      2 FPS · home 10/s
s=10     4 FPS · home 9/s
s=31    14 FPS · home 5/s
s=95     1 FPS · home 4/s
s=221    1 FPS · home 4/s     ← 10 messages in
```

**It does not decay — it collapses within five seconds of the table opening and
stays pinned for the whole session.** `HomeContent` renders a steady 4–6 times
a second throughout.

Main-thread blocking, measured by timer drift (independent of the `busy`
metric, which is normalized and routinely reads >1000ms/s — do not trust it):

```
blocked 10,982ms of 11,182ms = 98%
median gap between 16ms ticks: 1303ms
largest single block: 2588ms
```

**Each `HomeContent` render blocks the main thread for roughly a second.**

### Ruled out, with evidence

- **Paint / CSS.** With `filter`, `backdrop-filter`, `box-shadow`,
  `text-shadow`, `mix-blend-mode`, masks, animations and transitions all forced
  off: still **98% blocked**, median gap 970ms vs 1303ms. Paint is at most ~25%.
- **A render loop.** Fiber state-churn during the live table is spread across
  many hooks and is legitimate (session clock, rhythm state, speech progress).
  The pointless-update loop was real and is fixed (`dc9fcf96`); this is not it.
- **Leaks.** `int`, `dom`, `anim`, `audio`, `heap` all plateau.
- **rAF / timers.** 1ms and 2ms respectively across a 15s window.

### So the remaining bug is render *cost*, and it scales with seats

This reconciles Jared's original export: 60 FPS with the first bots seated,
10 FPS at the fourth arrival, 1 FPS thereafter. It read as gradual decay
because arrivals are staggered; it is really per-seat cost accumulating until
the table is full.

`HomeContent` is one ~149k-line component with no reconciliation boundary, so
every Coffee state change re-evaluates the entire app surface including the
five-seat map (~700 lines of computation per seat upstream of
`coffeeSeatAvatarRenderKey`). `CoffeeSeatAvatarRenderer` is already `memo`'d on
`renderKey` alone, so the avatar subtree is protected — the expense is
everything computed *before* the key.

**Next step is the memoization boundary, and it is a big rock.** Do not start it
as a side quest. The cheap probe first: measure which slice of the render costs
the second — bisect the seat map by short-circuiting parts of it and re-running
the timer-drift measurement above (that harness is the reliable one).

# Handoff: Coffee Mode lag — render loop found and fixed

## RESULT (2026-08-18, measured with `visibilityState === "visible"` asserted)

**Fixed:** `dc9fcf96`. The Coffee lobby's permanent saturation was a React
render loop, not rendering cost and not the glyph rasterizer. The bot-library
group maintenance effect ([page.tsx:60963](apps/web/src/app/page.tsx)) fed
`setBotLibraryGroups` a value that was never `Object.is` equal to the previous
one — `prune` reallocates the outer array, `normalize` rebuilds every object —
so React could never bail out and `HomeContent`, the whole app surface,
committed ~7 times a second forever with nothing to prune.

Found by walking React's fibers: filtering to hooks that own a `queue` (state
hooks, not effect/memo records) cut 2163 hooks to 654, and exactly one changed
between commits — always `array[1]` → `array[1]`, identical contents. Dumping
it gave `[{ id: "builtin:favorites", … }]`.

Fresh-load trajectory after the fix, pane visible throughout:

```
t=2s    11 FPS · busy 973 · home 7/s
t=4s     7 FPS · busy 989 · home 7/s
t=6s     7 FPS · busy 985 · home 7/s
t=8s   120 FPS · busy   0 · home 2/s
t=10s+ 120 FPS · busy   0 · home 0/s   ← steady, indefinitely
```

Independently confirmed by counting frames by hand: 361 frames in 3.00s,
median gap 8ms, max 9ms.

**There is no steady-state rendering cost.** That question is answered.

**Still open:** the first ~7 seconds of a fresh load still run at 7–11 FPS with
`busy` ~980ms/s and `home 7/s`. Smaller and self-clearing, but real, and the
same class of bug — a second stray `array[0]` → `array[0]` update was seen on
hook 269. Also unverified: whether a *live table* now stays smooth for a full
session, which is the original complaint and the real acceptance test.

## MEASUREMENT DISCIPLINE — this cost hours

The Browser pane silently flips between visible and hidden, and the app
*correctly* self-suspends when hidden: `data-prism-visual-lifecycle="suspended"`
on `<html>`, rAF served on an exact 2001ms cadence, main thread idle. In that
state **every duration metric is fiction** — FPS, `busy ms/s`, long-animation-
frame durations (25,855ms in a 10s window), and pending-rAF counts all lie.
Three separate wrong conclusions in this investigation came from trusting them.

Assert `document.visibilityState === "visible"` *inside* the same script that
takes the measurement, and discard anything else. Counts (renders, state
churn, fiber lanes) stay valid either way; durations do not.

# Handoff: Coffee Mode lag — a render loop in the Coffee lobby

## WHERE THIS ACTUALLY STANDS (2026-08-18, measured with a *visible* window)

**Minimal repro, no session required:** open Coffee and sit on the lobby /
table-setup screen. ~300–500 DOM nodes, nothing animating, no table running —
and the main thread is 100% saturated. **86 long tasks totalling 14,992ms in a
15,000ms window**, 3 FPS.

**It is React commit work, and nothing else.** In that same window,
animation-frame callbacks cost **1ms** and timer callbacks cost **2ms**. React
schedules commits on a MessageChannel, which is why no rAF or timer
instrumentation can see it. This is consistent with the
`Maximum update depth exceeded` error that intermittently trips the
"Prism needs a quick refresh" boundary in `<HomeContent>`.

**Bisected: not ours.** The same saturation reproduces on `371fda86`, the
commit *before* the Coffee freeze work — 53 long tasks / 15,307ms / 3 FPS. The
freeze #1 channel, the freeze #2 recovery, and the census badge are all
exonerated, as is the earlier suspicion about `releaseStalledHandoff`.

**The glyph-rasterization section below is superseded as *the cause*.** That
defect is real — `PhosphorPixelSvgGlyph` keys its effect on `[children]`, a
fresh identity every parent render — but it cannot explain a lobby screen with
no avatars on it, and rAF cost of 1ms says it is not the bottleneck. A fix for
it sits unverified in `stash@{0}`; treat it as a separate, smaller win.

**Next step:** the badge now reports `home N/s` — renders per second of the
whole app surface (`notePrismRender("home")` in `HomeContent`). Open Coffee
with the pane visible and read it. A runaway number confirms the loop and
quantifies it; then find the effect in `HomeContent` that sets state with an
unstable dependency on the lobby path. Everything needed is a fifteen-second
observation away.

# Handoff: Coffee Mode lag — superseded sections below


## CORRECTION TO THE SECTION BELOW — read this first

Two claims below are over-stated, and one urgent item is not in it at all.

1. **"`raf` climbing is the leak" is wrong as written.** The measurement ran in
   a Browser pane that never became `visible`. A hidden tab *schedules*
   animation frames but never *executes* them, so pending frames pile up to
   roughly the number of live components regardless of any defect. That growth
   was an artifact. What survives is the **schedule rate** by stack, which is
   visibility-independent and still damning.
2. **The cost figures were never measured.** Profiling callback duration
   returned empty — the callbacks never ran, being hidden. So the *defect* is
   established by code reading plus schedule counts; the *FPS benefit of the
   fix is unverified*. Someone with a visible window has to confirm it.
3. **URGENT, possibly self-inflicted and already pushed.** During testing the
   app repeatedly hit `Maximum update depth exceeded` inside `<HomeContent>`,
   surfacing the "Prism needs a quick refresh" boundary once a Coffee table
   went live. It was NOT attributed. The prime suspect is the freeze #2
   prevention hunk in commit `102674a8` (**pushed to origin/dev**):
   `releaseStalledHandoff` ([page.tsx:128688](apps/web/src/app/page.tsx)) flips
   `cooldown → idle`, and if the turn scheduler immediately re-arms a cooldown
   the two alternate — alternating values are exactly what defeats React's
   same-value bail-out and produces this error. A first table ran four minutes
   clean; later tables errored, which fits a re-queue path rather than a cold
   start. **Reproduce with a visible window before anything else, and if it
   confirms, revert that hunk first** — the recovery half of freeze #2 (the
   wall-clock threshold, the tick, `coffeeTableStallShapeV1`) is independent
   and can stay.

Uncommitted in the working tree: a fix for the glyph defect below
([PhosphorPixelGlyph.tsx](apps/web/src/app/PhosphorPixelGlyph.tsx)) that
short-circuits the rasterizer when the SVG markup and host box are both
unchanged. It typechecks and is deliberately **not** a MutationObserver — that
version was written, tested, and reverted because setting `rasterUrl`
re-renders `children` inside the observed subtree and feeds itself.

## THE CAUSE IS FOUND (measured 2026-08-18, live 5-bot table)

Not the reveal path. Not the GPU. **`PhosphorPixelGlyph` re-rasterizes bot face
glyphs on the main thread as their content changes.**

Measured in the running app with the new badge census, on a live Bikini Bottom
table. Every accumulation counter plateaued except one:

```
t=0    raf 2    int 8    dom 301   anim 2     heap 369   audio 0
t=47   raf 5    int 18   dom 672   anim 84    heap 563   audio 6
t=87   raf 19   int 17   dom 692   anim 121   heap 470   audio 6
t=134  raf 20   int 17   dom 712   anim 112   heap 442   audio 6
t=247  raf 21   int 17   dom 743   anim 118   heap 587   audio 6
```

`int`, `dom`, `anim`, `audio`, `heap` all settle. `raf` climbs 2 → ~21 — a
growing backlog of pending glyph rasterizations. Profiling rAF by creation
stack over 25s (in a *throttled* tab, so these are floor numbers):

```
155  PhosphorPixelSvgGlyph.useLayoutEffect.render   PhosphorPixelGlyph.tsx:377
 70  CrtPixelTextGlyph.useLayoutEffect.render       PhosphorPixelGlyph.tsx:202
 30  CoffeeSeatPlateEmoji.useLayoutEffect           CoffeeSeatPlateEmoji.tsx:237/405
 16  PrismAdaptiveDomQualityGovernor.tick           (one healthy loop)
 16  pixi.js Ticker._tick                           (one healthy loop)
```

`rasterizeTextMask` ([PhosphorPixelGlyph.tsx:147](apps/web/src/app/PhosphorPixelGlyph.tsx))
per call does `getComputedStyle` → border-box measurement → `measureText` →
`fillText` → **`getImageData`** (GPU→CPU readback) → a per-pixel JS loop
(`samplePhosphorAlphaCells`) → `putImageData` → **`toDataURL("image/png")`**, a
synchronous PNG encode. There is a mask cache checked at :227 *before* the
canvas work, so identical content is cheap — but the cache-key computation
itself reads computed style and layout for every glyph on every scheduled
frame, and any new mouth shape / rasterKey is a full miss.

Coffee changes glyph content constantly (mouth shapes across five seats, plate
emoji, nameplates), so this runs several times a second and cannot keep up —
which is exactly why the decay is monotonic and does not recover through a
silent table. It also explains why seating the 4th bot dropped session
c2f6eff5 from 60 to 10 FPS *before any model call*.

**Next step is the fix, not more diagnosis.** Do not start by touching avatar
fidelity — the sheds are dead and must stay dead. Attack the cost instead:
skip the whole path when `content` and the node's box are unchanged since the
last raster; hoist the layout/style reads out of the per-frame path; and
consider moving the encode off `toDataURL` (an `ImageBitmap`/blob URL, or
canvas reuse) so a miss costs less.



Generated: 2026-08-19 (updated) · Branch: dev · Status: freeze #1 mitigated, freeze #2's identified vetoes all closed. Unstaged, unflown.

## Mission

Coffee Mode freezes hard enough that Jared has force-quit Prism twice. Definition of done: a 5-bot Coffee table stays typeable for a full session, messages commit in authored order, and the app never needs force-quitting.

**There are two distinct freezes.** Do not conflate them.

## Freeze #1 (saturation) — what landed

Reveal progress no longer travels through `HomeContent` state per character.

- **New module** [apps/web/src/app/coffeeRevealProgressChannel.ts](apps/web/src/app/coffeeRevealProgressChannel.ts) — a module-level store in the house `botHubVoicePreviewMouth` shape: `publishCoffeeRevealProgress(length)`, `subscribeCoffeeRevealProgress`, `coffeeRevealVisibleLength()`, plus `coffeeRevealCoarseShouldCommit` and `COFFEE_REVEAL_COARSE_COMMIT_MS = 120`.
- **Two publish helpers in `HomeContent`** (next to the state, ~`page.tsx:65540`): `advanceCoffeeTypewriterLength({nowMs, length, totalLength})` for the RAF steps (exact to the channel every frame, coarse React mirror once per 120ms mouth phase, always on the final character) and `assignCoffeeTypewriterLength(length)` for discrete jumps (reset / settle / seal).
- **`coffeeTypewriterLengthRef` is gone.** It was assigned during render (`page.tsx:65508`), which only worked because every length change forced a render. All five readers now call `coffeeRevealVisibleLength()`.
- **`coffeeTypewriterLength` state survives but is deliberately coarse** — it drives only mouth-cadence consumers: seat mouth shapes, stage-direction badges, gaze mentions, player plate mouth.
- **New leaf component `CoffeeRevealTypewriterLine`** at module scope (~`page.tsx:31809`), `memo`, `useSyncExternalStore`. It is the only thing that renders per character. Both the bot line and the player line use it; replay passes `fixedLength={coffeeReplayTypewriterLength}`.
- **Center-feed auto-follow moved into the leaf's `useLayoutEffect`**, via the stable `followCoffeeCenterFeedReveal` callback, so the scroll is ordered after the text it follows. The top-level auto-follow effect keeps its other triggers.
- **Three effects converted from a length dependency to a channel subscription**, keeping their closures intact: the automatic cut-in gate, the player action SFX cue, the bot action SFX + authored-reaction cue. All three callees are fired-key idempotent, and the cut-in callback re-checks `coffeeAutomaticCutInConsideredRef` on entry.
- **`coffeeSessionClockMs` stays a dependency of the cut-in effect on purpose.** A holding reveal publishes nothing, and `holdLongEnough` is the branch that exists for that pause — the 1 Hz re-subscribe is what re-checks it. The hold window itself now reads `Date.now()` so a subscription closure cannot age.
- **Both FPS-gated budgets deleted.** `coffeeTypewriterCommitBudgetMs` and `coffeeComposerDraftSyncDelayMs` are gone from [coffee-user-reveal-flow.ts](apps/web/src/app/coffee-user-reveal-flow.ts) (a comment marks the grave). The composer draft sync is back on the committed constant `COFFEE_COMPOSER_PARENT_DRAFT_SYNC_MS = 240`.

Nothing is committed. `page.tsx` also carries Jared's in-flight work — **never `git add -A`**.

## Freeze #2 (deadlock) — what landed

The rhythm state could park on `"cooldown"` with nothing able to release it: `cooldown` disables the composer, the reconciliation effect ([page.tsx:69149](apps/web/src/app/page.tsx)) deliberately refuses to reset out of it, and `clearCoffeeRhythmTimers` cancels the hand-off timer that `cooldown` exists to bridge to without touching the state.

The watchdog that should have caught this **already matched the shape** — `deadPendingReveal` is true during any cooldown, since `queueCoffeeReveal` sets the pending reveal before the state. It could not fire because it measured elapsed time on `coffeeSessionClockMs`, which model warmup deliberately freezes (`if (!modelWarmupActive) setCoffeeSessionClockMs(now)`), *and* that same clock was its only regular re-evaluation driver. A recovery path must not share a clock with the thing it recovers from.

- **Recovery, time base** — the stall threshold now measures on `Date.now()`, not the pausable session clock.
- **Recovery, tick** — new `COFFEE_STALL_RECOVERY_TICK_MS = 5_000` interval and `coffeeStallRecoveryTickMs` dep, live only while the phase is `live`/`arriving`, so the watchdog keeps evaluating no matter what holds the session clock. 0.2 Hz; negligible against the render budget.
- **Predicate extracted** — the dead-shape check is now `coffeeTableStallShapeV1` in [coffee-user-reveal-flow.ts](apps/web/src/app/coffee-user-reveal-flow.ts), unit-tested. It gains a `cooldown` clause **and** a `cooldownTimerArmed` input: a healthy cooldown and a stranded one are identical apart from that pending timer, so without it the watchdog would count against every ordinary cooldown.
- **Prevention** — `clearCoffeeRhythmTimers` releases the rhythm to `idle` when it cancels an armed cooldown timer; `beginSpeakingAndScheduleReveal` gained `releaseStalledHandoff()` on the `durationMs === null` path and on a rejected promise. Both are epoch-guarded: a stale epoch means another turn took the floor and owns the state, so those cases still return silently.
- **What actually froze the clock, most likely.** `releaseCoffeeModelWarmup` returns early on `phase === "failed"`, so a failed warmup is terminal until a retry replaces it — and `modelWarmupActive` treated any non-null warmup as active, so a single failed warmup froze `coffeeSessionClockMs` for the rest of the session. That is the mechanism behind a 100-minute wedge, and it fits the timing (a new turn after the 5th seat arrives triggers a warmup). `modelWarmupActive` now excludes the `failed` phase.
- **Recovery deliberately still declines to resume autoplay while a warmup is failed.** Releasing the rhythm un-greys the composer and hands the player the floor; restarting autoplay against a model that is genuinely unavailable would only spin, so the retry affordance owns that. If the wanted behaviour is full self-resume, `releaseCoffeeModelWarmup()` belongs in the recovery body before that gate — it is a product call, not an oversight.
- The three sites that clear `coffeeCooldownTimerRef` directly (~:70051, :72862, :80735) were checked and left alone: they are teardown paths (leaving the view, ending the session) where the predicate's `live`/`arriving` phase check already excludes a stall, and the new `cooldown` clause covers them by recovery anyway.
- Ruled out by inspection, deliberately left alone: `waitForActiveCoffeeSipBeforeTalk` is bounded (`COFFEE_SIP_TALK_FALLBACK_MS = 3_200`), and both `coffeeTurnAbortRef` / `coffeeContinueAbortRef` clear in `finally` with identity guards. `requestInFlight` was **not** loosened — a hung fetch with no timeout remains a theoretical veto on the watchdog, and is the first place to look if a wedge survives this.

**Be honest about what this is.** Which veto actually fired in session `2253b3903a` cannot be determined from source. What shipped is: every veto I could identify is closed, the recovery no longer shares a clock with the thing it recovers from, and the stall shapes are under unit test. If a table wedges again, that is new information, not a regression — start from `requestInFlight`.

## Honest sufficiency — do not call freeze #1 fixed yet

Freeze #2's fix is verifiable from source (pure predicate under unit test, plus source-shape pins on the wiring). Freeze #1's is not, and this is the part that still needs a flight.

Reveal-driven full-surface renders go from ~60 Hz (healthy frames) to ~8.3 Hz. That is a real 7× cut, but **`setCoffeeLiveAvatarSpeech` still commits at mouth-shape rate during voiced speech** (`coffeeLiveAvatarSpeechProgressShouldCommit`, [zenLiveMouth.ts:1220](apps/web/src/app/zenLiveMouth.ts)), which lands at the same cadence. Whether ~8 Hz clears the ratchet depends on whether one `HomeContent` render finishes under 120ms, which cannot be measured from source.

**The discriminating run to ask Jared for:** a 5-bot reveal with voice on, then the same table with voice muted, watching the `busy Nms/s` readout in the FPS badge.
- Muted dramatically better → `setCoffeeLiveAvatarSpeech` is the next target, and the same channel carries it (publish mouth shape per participant instead of a snapshot into state).
- Both still bad → the cost is the ~700 lines of per-seat computation upstream of `coffeeSeatAvatarRenderKey`, and the seat map needs its own memo boundary. Note `CoffeeSeatAvatarRenderer` is already `memo`'d on `renderKey` alone, so the avatar subtree itself is protected — the expense is everything computed *before* the key.

## Next actions (in order)

1. Get the voice-on / voice-muted comparison from Jared and pick the branch above.
2. Nothing for freeze #2 unless a table wedges again. If one does: the recovery now fires on a 45s wall-clock threshold, so a wedge lasting minutes means the watchdog is still being vetoed — check `requestInFlight` first (a fetch with no timeout leaving `coffeeTurnAbortRef` set is the one veto deliberately left in place).
3. **The replay typewriter is the same defect, untouched.** The replay reveal RAF (`page.tsx:68401/68411`) still commits per character into `coffeeReplayTypewriterLength` state — a full-surface reconcile per character while scrubbing a recording. It was left alone because the reported freeze is live-only, but Jared reviews sessions *through* replay, so a freeze while scrubbing is this. Wiring it onto the same channel is mechanical: `CoffeeRevealTypewriterLine` already accepts `fixedLength`, so replay would pass `null` and publish instead.
4. **The composer draft sync can now be removed, and that was not true when this fix was written.** It was left in place because `placeholder` sat in the `useEditor` deps and TipTap mounted with `content: value`, so a Coffee phase flip mid-typing rebuilt the editor from the parent's lagging draft — stopping the sync would have widened that loss window from 240ms to the whole session. `4fcfb179` closed that: the placeholder is read through a ref, and recreation now seeds from `pendingValueRef ?? lastEmittedRef` rather than `value`. With the hazard gone, keystrokes can stop reaching top-level state entirely (publish upward only on send, keeping the coarse `coffeeComposerHasDraft` boolean for the `playerComposing` rhythm at `page.tsx:69053`), which removes the last ~4 Hz of typing-driven full-surface renders. Fly the table first — this may already be inaudible next to the mouth-cadence renders.

## Decisions & constraints

- **Avatar tier shedding is dead everywhere and must stay dead.** Coffee seats, Signal stage, and Debate stage all pin `minimumRenderedSizeTier="full"`. `busy 3519ms/s` disproved the GPU theory.
- **This repo has no Prettier.** No config, no dependency, no format script — `page.tsx` is hand-formatted and `npx prettier --write` reformats ~4,200 lines of it. It was run once this session and reverted by 3-way merge against `prettier(HEAD)`; do not run it.
- Jared prefers fixes delivered without proactive test runs — run tests to verify a fix you doubt, or when touching a hot path like this one.
- Work directly on `dev`. Never branch, never push unless asked. Jared also commits from Cursor.

## Landmines

- **FPS-gated intervals are feedback loops, not fixes.** They widen as frames collapse and narrow as they recover, so they oscillate — the same flaw that retired the load sheds. `coffeeRevealProgressChannel.ts` carries no frame-rate input at all; keep it that way.
- **Hunk-level staging silently drops hunks.** Filtering `git diff` hunks into `git apply --cached` breaks once earlier hunks are staged. After any partial staging, verify: `git show HEAD:<path> | grep -c "<removed symbol>"`.
- **`page.tsx` is ~149k lines and one component.** That is *why* this bug is severe — there is no smaller reconciliation boundary.
- The `busy Nms/s` readout settles GPU-vs-CPU arguments. `busy 0ms/s` at 66 FPS = deadlock; `busy 3519ms/s` at 1 FPS = reconciliation storm. Use it before theorizing.
- The ordering inversion in review `47d7aa3d` (Jared's `Soooooooo` recorded 12s before Peter's reply to the prior message) is **plausibly** relieved by this fix but unverified. `coffeePendingRevealAfterUserRef` and `coffeeDeferBotRevealForPlayerLineRef` sequence by timing, not by an explicit commit order — if the inversion survives, that is where to look.

## Map

- [apps/web/src/app/coffeeRevealProgressChannel.ts](apps/web/src/app/coffeeRevealProgressChannel.ts) — the channel.
- [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx) — `CoffeeRevealTypewriterLine` ~:31809, coarse state + publish helpers ~:65530, reveal RAF loops ~:69100-69390, cut-in subscription ~:69543, SFX subscriptions ~:73560/:73630, draft sync ~:88790, `activeTypewriterLength` ~:135921.
- [apps/web/src/app/voiceLightEnvelope.ts](apps/web/src/app/voiceLightEnvelope.ts) — per-element publish pattern, :144-194.
- [apps/web/src/app/botHubVoicePreviewMouth.ts](apps/web/src/app/botHubVoicePreviewMouth.ts) — the external-store shape the channel copies.
- Commands: `npm run dev` · `node --test apps/web/src/app/<file>.test.ts` · `npm run typecheck` · `npm run lint`
- Environment: web on :18788, API on :18787. Jared runs the app; **logged-in UI checks are his**.

## Verification (state as of this handoff)

- `npm run typecheck` — fully clean. (The two `SessionReviewRecordingEvidence` errors noted earlier were resolved by the parallel session.)
- `npm run lint` — 0 errors in the touched files. Three pre-existing errors remain in `CoffeeSeatPlateEmoji.tsx` and `PronunciationAtlas.tsx`.
- `node --test apps/web/src/app/*.test.ts` (the whole web suite, not just `coffee-*`) — **zero new failures attributable to this change**, verified by diffing the failure set against a detached worktree at `HEAD` with `node_modules` symlinked. Re-run against `f3160dc0`: 177 failures now vs 182 at `HEAD`; 6 fixed, 1 new. That one new failure — `traps focus, makes the background inert, and restores the opener` in `bot-group-room-atmosphere-integration.test.ts` — is Jared's in-flight work: the test pins `node.setAttribute("inert", "")`, which he replaced with the still-uncommitted `applyPrismInert(node)` / `releasePrismInert(node)` (4 occurrences in the tree, 0 at `HEAD`).
  Reproduce the comparison with: `git worktree add --detach <tmp> HEAD`, symlink root and `apps/web` `node_modules` in, run the suite in both, `comm -23` the sorted `✖` lines.
- Re-run after the freeze #2 fix, against `371fda86`: 177 failures now vs 182 at `HEAD`, same single non-attributable `inert` failure.
- Updated source-shape pins: `coffee-live-immersion.test.ts` asserts the channel wiring, that neither FPS-gated helper can return, and the whole freeze #2 recovery path; `coffee-user-reveal-flow.test.ts` covers the channel's publish/subscribe, the fixed coarse cadence, and `coffeeTableStallShapeV1` (including that a healthy armed cooldown is *not* a stall and a stranded one is).
- One pre-existing pin was rewritten rather than widened: `never wedges the table on stuck reveals or dead thinking seats` anchored on a byte distance (`[\s\S]{0,700}`) between `stuckThinkingShape` and the threshold constant, and broke the moment a comment landed between them. It now anchors on the relationship (`if (!stuckThinkingShape) { coffeeStuckThinkingSinceMsRef.current = null;`).
