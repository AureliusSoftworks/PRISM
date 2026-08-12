# PRISM Design System

The source of truth for cross-applet visual consistency is **`:root` in
`apps/web/src/app/globals.css`**, plus the `next/font` declarations in
`apps/web/src/app/layout.tsx`. Applets reference roles from that layer; they do
not re-author faces, radii, or spacing locally.

`apps/web/src/app/design-tokens-contract.test.ts` pins this contract.

## What is deliberately *not* unified

Per-applet accent hue is authored intent, not drift. `docs/brand-ethos.md` is
explicit that "colors suggest plurality" and that a mode should never be
"permanently reduced to one brand color." Debate leaning violet and Signal
leaning near-black/red is the spectrum working as designed. Unify structure —
type, radius, spacing, control chrome — and leave the palettes distinct.

## Confirmation and reversibility

One canonical mechanism, chosen by what the code can actually undo. The
affordance is derived from reversibility, never from how consequential the
action *feels*. `apps/web/src/app/confirmationPolicy.ts` is the resolver and
`confirmation-contract.test.ts` is the ratchet.

### Why not "just confirm the scary ones"

A confirmation fires on every invocation, including the thousands of
intentional ones. By the time it guards a real mistake the person has already
learned to dismiss it — it is furniture. It taxes the correct path to protect
the rare wrong one, and it guards the wrong question: most real mistakes are
"right action, wrong target," which can only be judged *after* seeing the
result. Undo answers that question; a modal cannot.

### The four affordances

| Affordance  | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `none`      | Just do it. Reversibility lives in the data model.          |
| `undo`      | Act immediately, surface undo at the point of action.       |
| `hold-undo` | Hold the action briefly, offer undo during the hold.        |
| `confirm`   | Modal naming the *specific* consequence.                    |

### Precedence

First match wins.

1. **Leaves the device** — deferrable → `hold-undo`, otherwise `confirm`.
2. **Irreversible** — no inverse operation or snapshot → `confirm`.
3. **Bulk blast radius** — per-item undo isn't real recovery → `confirm`.
4. **Reversible** — an inverse or snapshot exists → `undo`.
5. **Soft** — archived/soft-deleted, restorable from the UI → `none`.

The online boundary always confirms because a transmission is not recallable
even when the local record of it is.

Rule 2 does not fire for a soft action: soft-deletion is itself a recovery
path, so "no inverse operation or snapshot" is read as "no recovery path at
all." This is what keeps `none` reachable — under a bare `!reversible` gate,
rule 4 would claim every case rule 5 could have matched, and the tier would be
dead code.

An action in the `confirm` tier must carry a written reason explaining why it
cannot be undone. Writing the sentence is the test. If no reason can be
written, it belongs in a lower tier — `validateConfirmationActions` enforces
this against the *resolved* tier.

### Undo has requirements

Undo must restore selection, scroll, and focus — not merely the data. An undo
that drops the person back at the top of a list with nothing selected has
recovered the record and lost the work.

Prefer a persistent undo stack to a timed toast. A five-second window is an
accessibility trap: it fails anyone using a screen reader, anyone reading at
their own pace, and anyone who looked away. The server already retains
inverses for 30 days (`PRISM_ACTION_UNDO_RETENTION_MS`); the UI should not be
the component that throws that away after five seconds.

### The bulk paths are the dangerous ones

This is the finding that makes rule 3 load-bearing rather than taste. In both
bots and images, the **bulk** route is strictly *less* recoverable than the
single-item route:

| Route                          | Mechanism                        | Undo            |
| ------------------------------ | -------------------------------- | --------------- |
| `DELETE /api/bots/:id`         | `bots.delete` capability         | 30-day quarantine |
| `DELETE /api/bots/selected`    | raw `DELETE FROM bots`           | none            |
| `DELETE /api/bots`             | raw `DELETE FROM bots`           | none            |
| `DELETE /api/images/:id`       | `images.delete` capability       | quarantine      |
| `DELETE /api/images`           | raw SQL + file unlink            | none            |

The single-item modal and the bulk modal look identical in the UI while
resting on completely different guarantees. Six surfaces are affected.

### Reading tiers off the server

The API already publishes the facts this policy needs.
`PrismCapabilityDescriptorV1` carries `undo`, `risk`, and `provider`, and
`reversibilityFromCapability()` maps them:

| Descriptor field       | Policy input        |
| ---------------------- | ------------------- |
| `undo: "none"`         | irreversible        |
| `undo: "inverse"`      | `reversible`        |
| `undo: "quarantine"`   | `soft`              |
| `risk: "bulk"`         | `bulk`              |
| `provider: "online-required"` | `leavesDevice` |

Actions routed through the capability registry should read their tier from the
descriptor rather than restating it. Actions calling a plain REST route have no
descriptor and must describe themselves — which is itself a signal that the
route may deserve a capability.

### Current state

No call sites have been migrated. The contract test's allowlist holds every
surface found in the first inventory: 9 native browser dialogs and 40
confirmation-shaped surfaces. Of those, **nine already have a real inverse in
the code** and are `confirm` only by habit — the migration backlog. A second
group are permanent entries that were never confirmations at all (consent
gates, password-match fields), and they stay on the list rather than being
migrated.

The contract test also fails when an allowlist entry's last call site
disappears, so the list cannot quietly become fiction.

## Typeface roles

Faces are loaded once in `layout.tsx` via `next/font/google`.

| Role variable            | Face               |
| ------------------------ | ------------------ |
| `--font-ui-sans`         | Instrument Sans    |
| `--font-title-sans`      | Raleway 300        |
| `--font-chat-serif`      | Lora               |
| `--font-formal-serif`    | Cormorant Garamond |
| `--font-playful-display` | Chewy              |
| `--font-concise-rounded` | Fredoka            |
| `--font-macondo-face`    | Macondo            |
| `--font-technical-mono`  | Noto Sans Mono     |
| `--font-geist-mono`      | Geist Mono         |

### Composed roles

Applets ask for an intent; only `:root` names a face.

| Role                     | Resolves to                                     |
| ------------------------ | ----------------------------------------------- |
| `--font-title`           | Raleway → Instrument Sans → system              |
| `--font-serif`           | Lora → Georgia → serif                          |
| `--font-mono`            | Geist Mono → `ui-monospace` → SF Mono → Menlo   |
| `--font-ui-mono`         | alias of `--font-mono`                          |

`--font-title` was previously authored only on `.appLayout`, so it resolved
inside the shell subtree and silently fell back everywhere else.

`--font-serif`, `--font-mono`, and `--font-ui-mono` were referenced but defined
nowhere. Before: 19 `--font-serif` surfaces rendered Georgia, 7 more asked for
the separate `--font-editorial-serif` and rendered inherited sans, and 7 mono
surfaces (6 `--font-mono`, 1 `--font-ui-mono`) rendered SF Mono/Menlo. After:
`--font-editorial-serif` was folded into `--font-serif` and no longer exists,
so 26 serif surfaces now resolve to Lora and the 7 mono surfaces to Geist Mono.

Serif consumers are `DebateExperience`, `slateMirrorDesk`,
`slateStoryBibleDesk`, and `slateCreativeStudiosDesk`.

### Still unresolved

| Referenced name     | Uses | Where                      | What actually renders |
| ------------------- | ---- | -------------------------- | --------------------- |
| `--font-display`    | 1    | `PrismFirstRunLivingLayer` | Georgia (fallback)    |
| `--font-geist-sans` | 1    | `page.module.css`          | inherited sans        |

Geist Sans is not among the loaded faces at all. Both are listed in
`UNMAPPED_FONT_ROLES` in the contract test, which fails on any *new* dead
reference.

### Keep fallbacks inside `var()`

`--font-geist-sans` is written as `var(--name), ui-sans-serif, …` — with the
fallback *outside* the parentheses. An undefined custom property used without an
in-`var()` fallback makes the whole declaration invalid at computed-value time,
so `font-family` resolves to the inherited value rather than to the listed
faces. The now-removed `--font-editorial-serif` had the same shape.

Verified in-browser against a sans-font parent:

| Declaration                              | Computed `font-family`   |
| ---------------------------------------- | ------------------------ |
| `var(--undefined), Georgia, serif`       | inherited sans           |
| `var(--undefined, ui-serif, Georgia, serif)` | `ui-serif, Georgia, serif` |

This is why the seven former "editorial serif" surfaces were rendering the
inherited **sans**, not a serif at all. When those references were folded into
`--font-serif` the fallback moved inside the parentheses, so they now resolve to
Lora. Keep fallbacks inside `var()`.

## Radius and spacing scales

Both scales use one step name → pixel mapping, so `lg` means 12px whichever
scale it comes from.

| Step  | Value  | Radius | Spacing |
| ----- | ------ | ------ | ------- |
| `3xs` | `2px`  |        | ✓       |
| `2xs` | `4px`  | ✓      | ✓       |
| `xs`  | `6px`  | ✓      | ✓       |
| `sm`  | `8px`  | ✓      | ✓       |
| `md`  | `10px` | ✓      | ✓       |
| `lg`  | `12px` | ✓      | ✓       |
| `xl`  | `14px` | ✓      | ✓       |
| `2xl` | `16px` | ✓      | ✓       |
| `3xl` | `18px` | ✓      | ✓       |
| `4xl` | `20px` | ✓      | ✓       |
| `5xl` | `24px` |        | ✓       |

Plus `--prism-radius-pill` (`999px`) and `--prism-radius-circle` (`50%`).

### On the scales

These name the dominant even spine already in the tree; they do not describe
what the tree currently does. Radius is presently used at every integer from
2–24px plus 28/32/40/44/56/99/180px, and spacing at nearly every integer 1–24px
— `7px` alone appears in 405 spacing declarations and `9px` in 356. The odd
steps are drift to snap onto the nearest token during migration, not additional
rungs.

The scale deliberately runs in 2px increments rather than a doubling ramp,
because the tree's most-used values are that dense: 14px (330 spacing uses) and
18px (185) are as load-bearing as 16px (151), so a 4/8/16/24 ramp would have
nowhere to put them short of changing layout.

Nothing consumes these tokens yet; adding them changed no rendering.

## Missing layers

There is no shared component library — no `components/` directory, no shared
Button, Card, Modal, or Input. Each applet hand-rolls its chrome inside its own
stylesheet, which is why control styling diverges even where intent matches.
There are also no shared surface, border, or text-color tokens; only the two
`--baseline-*` anti-flash colors exist.
