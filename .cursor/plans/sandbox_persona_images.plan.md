---
name: Sandbox persona images
overview: >-
  Sandbox-only persona-aware image generation and per-bot image libraries.
  The chat header Images button opens a panel whose default scope follows the
  visually focused bot; images are stored per bot; navigation mirrors the
  Memories panel (all library vs bot folder, back arrow exits the bot filter).
todos:
  - id: schema-bot-id
    content: Add images.bot_id column + migration; update INSERT and test fixtures
    status: pending
  - id: shared-persona-prefix
    content: Implement buildImagePromptPersonaPrefix in packages/shared + unit tests
    status: pending
  - id: api-generate-list
    content: >-
      Augment POST /api/images/generate for sandbox + bot rows; GET /api/images
      ?botId= and review list limit for “show everything”
    status: pending
  - id: web-images-panel
    content: >-
      Memories-style scope/back; wire header Images button like Memories
      (sandbox + activeBot → bot scope; else all); refreshImages(botId)
    status: pending
  - id: api-tests-images
    content: Add/adjust API tests for sandbox augmentation and bot_id persistence
    status: pending
---

# Sandbox-only persona images + per-bot library

## Entry point (your DOM selection)

The **Images** header control (`aria-label="Images"`, `HomeContent` → `handleImages`) is the primary entry. Behavior should **mirror Memories**:

- **Sandbox** (`view === "sandbox"`) **and** a **visually focused custom bot** (`activeBot` non-null): open the panel in **bot scope** — grid shows only images whose stored `bot_id` matches that bot. Persona-augmented generation applies when generating from a **sandbox** conversation tied to that thread.
- **Any other case** (Chat, Coffee, Hub, Sandbox with **Default / no bot focused**): open in **all** scope — show **all images from all conversations** for that user (subject to API list limits), not filtered by bot.

Persona injection and `bot_id` assignment on new images are **sandbox-only**; other modes keep today’s “raw prompt only” behavior and `bot_id` null.

## Hierarchical navigation (Memories-like)

Reuse the **scope + back** pattern already used by the Memories panel in [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx) (`memoryPanelScope`, `panelBack`, `openMemoriesPanelForBot` / `openAllMemoriesPanel`):

1. **State**: e.g. `imagesPanelScope: 'all' | 'bot'`, `imagesPanelBotId: string | null`.
2. **All scope**: single combined library — “every image,” aligned with “no bot focused.”
3. **Bot scope**: filtered grid; **← Back** returns to **all** scope (clears the bot filter). Same mental model as drilling into a bot’s memories and backing out to the directory.

Optional later polish: a **“browse by bot”** directory row list in **all** scope (counts + tap to drill in). Minimum deliverable is **header-driven bot scope + back to all**.

## Data model

- Add nullable **`bot_id`** on `images` in [`apps/api/src/db.ts`](apps/api/src/db.ts) (migration consistent with existing `ALTER TABLE` patterns).
- On generate, set `bot_id` when the request is tied to a **sandbox** conversation with a non-null **`conversations.bot_id`** (thread-locked bot — your **locked-only** choice). Otherwise `NULL`.
- When conversations are cleared/deleted, existing code sets `images.conversation_id` to `NULL`; **`bot_id` must remain** so images stay under the correct bot in the UI.

## API

- **`POST /api/images/generate`**: If `conversationId` resolves to **`conversation_mode === 'sandbox'`** and `conversations.bot_id` is set, load that bot, build a **short** augmented prompt (see shared helper), send **augmented** text to OpenAI; persist the **user’s original** prompt in `images.prompt` for short `alt` text and honest history.
- **`GET /api/images`**: Optional `botId=` filter (must belong to the user). Omit filter for the full library. Revisit the current **50-row cap** so “show all images” is credible for heavier use (bump limit or add `limit=` with a cap).

## Shared persona helper

- New pure helper in [`packages/shared`](packages/shared) (e.g. `buildImagePromptPersonaPrefix`) using [`parseStoredBotPrompt`](packages/shared/src/botProfile.ts) to pull **appearance** + **identity** (and optionally a capped prose excerpt), with a **hard max length** so we do not dump full system prompts into DALL·E.

## Edge case (composer vs DB)

`activeBot` (header / shell) can briefly disagree with `conversations.bot_id` before the next assistant reply persists a bot switch. **Gallery filter** follows **who opened the panel** (`activeBot`); **new image `bot_id` and persona** follow **`conversations.bot_id`** for that thread. Document in code comments; rare in normal use.

## Files likely touched

- [`apps/api/src/db.ts`](apps/api/src/db.ts), [`apps/api/src/server.ts`](apps/api/src/server.ts), [`apps/api/src/conversations.ts`](apps/api/src/conversations.ts) (fixtures if needed), [`apps/api/src/__tests__/conversations.test.ts`](apps/api/src/__tests__/conversations.test.ts)
- [`packages/shared/src/index.ts`](packages/shared/src/index.ts) + new tests
- [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx), [`apps/web/src/app/page.module.css`](apps/web/src/app/page.module.css)

## Out of scope

- Copyright / safety policy for specific characters (separate work).
- Coffee multi-bot attribution.
- Private/incognito Chat beyond “no persona; all-images behavior when opening Images from non-sandbox or no focused bot.”
