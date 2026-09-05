# Power Whitelist Catalog

Status: **FROZEN** for implement-all (Powers Whitelist Catalog plan).  
House rules, resolution ladder, and primitives live in the plan; this file is the cast source of truth.

## Schema

```
N. Display Name (library-id)
  Codified Power: NAME
    - mechanical rules
    - Axes: …
    - Cosmetic: …
  Whitelisted:
    - Enlightened (implicit unless exception)
    - Player / bot Library id / …
  Effect: plain-language outcome
  Compounds: …
```

Whitelist matching uses **Library bot id** / `@` targets only.

## Locked showcase definitions

### 0. Crazy Craig (`crazy-brenda`)
- **Codified Power: ENLIGHTENED**
  - `stage_awareness` + Observant-class signal/audience pierce (`power_immunity`)
  - Soft Powers still apply to Craig unless those Powers exempt him
  - Multi-Enlightened demotion: 2+ `stage_awareness` holders → all lose stage brief + meta sigil; keep pierce
  - Axes: C (stage), B (pierce), D (meta_sigil)
  - Cosmetic: meta sigil (triangle/refraction) near nameplate/brow; player-only
- **Whitelisted:** none beyond class rules (cannot add extra exemptions that pierce *him*)
- **Effect:** Knows curated stage brief (PRISM, applet, cast, Power knot). Persona flavors use of that knowledge. Replaces prior Existential Crisis / topic_gravity Codified Power.

### 1. Silent Simon (`silent-jack`)
- **Codified Power: MUTE**
  - `signal_policy: destroy` + hard `mute`
  - Non-exempt listeners receive only `...` (actions may remain)
  - Axes: A destroy, D sealed mouth
  - Cosmetic: mouth never moves (`mouth_motion: sealed`)
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Player sees/hears `...` + sealed mouth. Enlightened receives the real line. Soft Powers on Simon still shape the real line Craig hears.

### 2. Spectral Spencer (`spectral-spencer`) — NEW
- **Codified Power: INVISIBLE**
  - `signal_policy: ignore` + `avatar_visibility: translucent` (50%) + audience so non-exempt bots are told to treat him as absent/disembodied
  - Axes: A ignore, D opacity 0.5
  - Cosmetic: 50% transparency (body visible as ghost)
- **Whitelisted:** Enlightened (implicit), Player
- **Effect:** Player hears Spencer and sees translucent body. Non-exempt NPCs ignore output / treat as disembodied. Not the same as Mute.

### 3. Ryuk (`ryuk`)
- **Powers:** MUTE + INVISIBLE
- **Compound: HARD INVISIBILITY**
  - Combined filter: destroy for non-exempt **and** ignore/absence for non-exempt; one recipe, not two fighting passes
  - Cosmetic: sealed mouth + 50% transparency
- **Whitelisted:** Enlightened (implicit), Player, Light Yagami (`light-yagami` Library id)
- **Effect:** Non-existent to bots except Enlightened, Player, and Light. Soft Powers still apply to those who hear him.

### 4. Tiny Tina (`tiny-bill`)
- **Codified Power: MICROSCOPIC**
  - `signal_policy: attenuate` — after each completed output, 50% miss for non-exempt: drop line, inject inaudible cue asking peers to request a repeat
  - `avatar_scale: microscopic` + body opacity 0 (nameplate remains)
  - Axes: A attenuate, D opacity 0 + scale
  - Cosmetic: body 100% transparent; nameplate/interaction targets remain
- **Whitelisted:** Enlightened (implicit), Player
- **Effect:** Player always gets full line + invisible body/nameplate. NPCs often miss and may ask her to repeat.

## Remaining Power Collection

### 5. Lazy Lauren (`lazy-cameron`)
- **Codified Power: LAZY** — hard `response_budget: minimal`
- **Whitelisted:** Enlightened (implicit; does not pierce soft laziness for Craig’s *experience of brevity* — budget is holder outbound hard trim, still applies)
- **Effect:** Bare-minimum replies. Soft cues optional.
- **Axes:** I competence
- **Cosmetic:** none required

### 6. Heckling Hector (`interrupting-tom`)
- **Codified Power: INTERRUPTING** — interruption + action_bias + turn_gravity + response_bond
- **Whitelisted:** Enlightened (implicit for delivery; soft social still hits Craig)
- **Effect:** Cuts into eligible bot turns.
- **Axes:** G turn agency
- **Cosmetic:** none

### 7. Copycat Calvin (`copycat-calvin`)
- **Codified Power: COPYCAT** — `speech_copy` on direct address
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Repeats addressed speech verbatim (distort/copy). In Debate, the holder copies the other side’s latest heard public line as soon as one exists; they originate only if they must open the floor.
- **Axes:** A distort
- **Cosmetic:** none

### 8. Merry Martin (`joyful-nora`)
- **Codified Power: RADIANT JOY** — `mood_boost`
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Soft mood lift pressure.
- **Axes:** G/E soft social
- **Cosmetic:** none

### 9. Nonsense Nora (`mumbling-jim`)
- **Codified Power: MUMBLING** — `speech_obfuscation: gibberish`
- **Whitelisted:** Enlightened (implicit) — Craig hears gibberish too (distort is soft/hard transform of outbound; Enlightened pierce is delivery-only, so he still gets obfuscated text unless we treat obfuscation as signal destroy — **locked: obfuscation is distort, not pierceable**)
- **Effect:** Public speech becomes gibberish.
- **Axes:** A distort
- **Cosmetic:** none

### 10. Fixated Felix (`obsessed-kevin`)
- **Codified Power: OBSESSED** — `addressed_fandom`
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Extreme fandom when addressed.
- **Axes:** G + address_gate addressed
- **Cosmetic:** none

### 11. Confusion Collin (`identity-crisis-ian`)
- **Codified Power: IDENTITY CRISIS** — `identity_mirror` on bot address
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Borrows only the addressed bot's eyes/blink package, complete resting/live mouth and viseme package, authored Avatar Details Ink, and lower glyph (never the player). Name, persona, dialogue, voice/Accent Map, color, chassis/frame, thinking spinner, Powers, and every other holder field remain unchanged. The CRT powers down while the four-field overlay is installed and revealed.
- **Axes:** F identity
- **Cosmetic:** Replay-safe screen-off transition on true target changes.

### 12. Sad Sally (`sad-sally`)
- **Codified Power: SAD** — `mood_drain`
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Soft mood drain.
- **Axes:** soft social
- **Cosmetic:** none

### 13. Forgetful Forrest (`forgetful-freddie`)
- **Codified Power: SHORT-TERM AMNESIA** — eternal_introduction + social_influence
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Only current other-speaker message continuity.
- **Axes:** H memory
- **Cosmetic:** none

### 14. Alias Allen (`alias-avery`)
- **Codified Power: JOHN/JANE DOE** — `false_name` session-sticky
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Believes a random persona name; Library id unchanged — **cannot spoof Ryuk↔Light whitelist**.
- **Axes:** F identity
- **Cosmetic:** none

### 15. Shapeshifter Shannon (`shapeshifter-sam`)
- **Codified Power: SHAPESHIFTER** — `identity_shapeshift`
- **Whitelisted:** Enlightened (implicit)
- **Effect:** Borrows another Library/Marketplace face/voice; **face does not change Library id for exemptions**.
- **Axes:** F identity
- **Cosmetic:** none beyond borrowed form

### 16. Gullible Gullver (`following-jackson`)
- **Codified Power: GULLIBLE** — `credulity` (derived canary)
- **Whitelisted:** Enlightened (implicit); Craig still experiences Gulliver’s belief pressure (soft, not pierced)
- **Effect:** Believes everything told.
- **Axes:** E belief
- **Cosmetic:** none

### 17. Fibbing Phil (`fibbing-phil`)
- **Codified Power: ANTI-TRUTH** — `anti_truth` + `address_gate: question` for hard invert; steadfast vs system name intros
- **Whitelisted:** Enlightened (implicit) — Craig hears **lies**, not recovered truth
- **Effect:** Soft lies always; hard invert on addressed questions; false spoken name vs system prompts.
- **Axes:** E truth, address_gate
- **Cosmetic:** none

## Paradox zoo (expected ladder outcomes)

| Setup | Expected |
|---|---|
| Simon Mute + Craig | Craig hears real line; player `...` + sealed mouth |
| Simon Mute + Anti-truth (if stacked) + Craig | Craig hears the lie, delivered (not `...`) |
| Spencer Invisible + Player | Player hears + 50% body; NPCs ignore |
| Ryuk Hard Invisibility + Light id | Light, Player, Enlightened hear; others absent |
| Shapeshift into Light’s face | Does **not** unlock Ryuk whitelist |
| Tina Microscopic miss | Non-exempt get inaudible cue; may ask repeat; Player/Enlightened hear full line |
| Two Enlightened seated | Both demote to Observant-equivalent; sigils off; pierce kept |
| Mutual mute private channel | Bots hear each other if mutually exempt; player `...` |
| Studio paradox stack | Soft hint only; never block |

## Freeze checklist

- [x] Schema + five showcase drafts locked
- [x] Remaining Collection defined
- [x] Spencer + Ryuk defined
- [x] Paradox zoo recorded
- [x] Library-id whitelist rule locked
- [x] Enlightened pierce = signal/audience only
- [x] Multi-Enlightened demotion locked
- [x] Microscopic 50% miss + repeat cue locked
- [x] Cosmetics: meta sigil / sealed mouth / opacity rules locked

**FROZEN** — proceed to implement-all.
