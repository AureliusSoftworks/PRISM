# Story V1 Backend Contract

This document defines the concrete backend contract for Story V1:

- Story API endpoints and payload shapes
- Story session/job ledger schema and legal stage transitions
- Idempotency + restart rules for reliable status polling
- Story memory scope boundaries and non-leak rules
- Strict V1 `.story` validation boundary (core checks only)

It is intentionally a contract/spec, not a full runtime implementation plan.

## 1) API Contract (Story V1)

### 1.1 Base conventions

- Base path: `/api/story`
- Auth: same session cookie auth as existing `/api/chat` route.
- Response envelope:
  - Success: `{ "ok": true, ... }`
  - Error: `{ "ok": false, "error": "<human-readable message>" }`
- HTTP semantics:
  - `201` for create operations
  - `200` for successful reads/updates
  - `400` for validation/state errors
  - `404` for missing resources
  - `409` for idempotency conflicts or invalid stage transitions
  - `423` when a retry is blocked by an in-flight lock/attempt

### 1.2 Endpoints and payload shapes

#### `POST /api/story/sessions`

Creates (or reuses) a Story session shell in `setup` stage.

Request body:

```json
{
  "clientSessionToken": "optional-client-generated-stable-id",
  "title": "optional working title",
  "mode": "story",
  "actors": [
    { "botId": "bot_123", "role": "protagonist" },
    { "botId": "bot_456", "role": "guide" }
  ],
  "preferences": {
    "tone": "whimsical",
    "audience": "all-ages",
    "lengthTarget": "short"
  }
}
```

Success (`201`):

```json
{
  "ok": true,
  "session": {
    "id": "story_sess_abc",
    "userId": "user_123",
    "status": "setup",
    "stage": "setup",
    "actors": [
      { "botId": "bot_123", "role": "protagonist" },
      { "botId": "bot_456", "role": "guide" }
    ],
    "createdAt": "2026-05-06T12:00:00.000Z",
    "updatedAt": "2026-05-06T12:00:00.000Z"
  }
}
```

#### `POST /api/story/sessions/:id/answers`

Persists setup answers and triggers synthesis orchestration.

Headers:
- `Idempotency-Key: <required for orchestration-triggering writes>`

Request body:

```json
{
  "answersRevision": 3,
  "answers": {
    "premise": "A tiny city lives inside a music box.",
    "protagonistGoal": "Find the missing melody.",
    "constraints": ["hopeful ending", "no horror"]
  },
  "triggerGeneration": true
}
```

Success (`200`):

```json
{
  "ok": true,
  "session": {
    "id": "story_sess_abc",
    "status": "generating",
    "stage": "outline_pending",
    "answersRevision": 3,
    "updatedAt": "2026-05-06T12:05:00.000Z"
  },
  "job": {
    "id": "story_job_001",
    "stage": "outline",
    "attempt": 1,
    "status": "queued"
  }
}
```

#### `GET /api/story/sessions/:id/status`

Returns durable orchestration status, safe for polling/reload.

Success (`200`):

```json
{
  "ok": true,
  "session": {
    "id": "story_sess_abc",
    "status": "generating",
    "stage": "page_text",
    "answersRevision": 3,
    "textReady": true,
    "imagesReady": false,
    "pageCountReady": 5,
    "lastErrorCode": null,
    "updatedAt": "2026-05-06T12:07:00.000Z"
  },
  "jobs": [
    { "stage": "outline", "status": "succeeded", "attempt": 1 },
    { "stage": "page_text", "status": "running", "attempt": 1 },
    { "stage": "image_prompts", "status": "queued", "attempt": 1 }
  ]
}
```

#### `GET /api/story/sessions/:id/pages`

Returns text-first storybook payload for reading as soon as text is ready.

Success (`200`):

```json
{
  "ok": true,
  "sessionId": "story_sess_abc",
  "textReady": true,
  "imagesReady": false,
  "pages": [
    {
      "index": 1,
      "text": "The music box opened at dusk...",
      "image": {
        "status": "pending",
        "url": null,
        "placeholderLabel": "Image still rendering"
      }
    }
  ]
}
```

#### `POST /api/story/sessions/:id/critique`

Stores post-story critique into Story-only memory scopes.

Request body:

```json
{
  "rating": 4,
  "liked": ["tone", "character chemistry"],
  "disliked": ["ending pace"],
  "freeform": "Great midpoint. Ending was too quick."
}
```

Success (`200`):

```json
{
  "ok": true,
  "saved": true,
  "storyMemoryUpdated": true
}
```

#### `GET /api/story/library`

Lists Story-owned artifacts only.

Success (`200`):

```json
{
  "ok": true,
  "stories": [
    {
      "storyId": "story_001",
      "sessionId": "story_sess_abc",
      "title": "The Lost Melody",
      "completionState": "text_ready",
      "updatedAt": "2026-05-06T12:15:00.000Z",
      "pageCount": 8
    }
  ]
}
```

#### `GET /api/story/library/:storyId`

Fetches full storybook payload for replay.

Success (`200`):

```json
{
  "ok": true,
  "story": {
    "storyId": "story_001",
    "sessionId": "story_sess_abc",
    "title": "The Lost Melody",
    "pages": [
      { "index": 1, "text": "The music box opened...", "imageUrl": null }
    ],
    "actors": [
      { "botId": "bot_123", "role": "protagonist" }
    ],
    "createdAt": "2026-05-06T12:00:00.000Z",
    "updatedAt": "2026-05-06T12:15:00.000Z"
  }
}
```

## 2) Session + Job Ledger Contract

## 2.1 Proposed tables

### `story_sessions`

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL`
- `status TEXT NOT NULL` (`setup|generating|text_ready|ready|failed|abandoned`)
- `stage TEXT NOT NULL` (`setup|outline_pending|outline|page_text|image_prompts|image_render|assemble|complete|failed`)
- `answers_revision INTEGER NOT NULL DEFAULT 0`
- `actors_json TEXT NOT NULL` (validated JSON array)
- `setup_answers_json TEXT NOT NULL DEFAULT '{}'`
- `last_error_code TEXT`
- `last_error_message TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `text_ready INTEGER NOT NULL DEFAULT 0`
- `images_ready INTEGER NOT NULL DEFAULT 0`
- `page_count_ready INTEGER NOT NULL DEFAULT 0`

### `story_jobs`

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `user_id TEXT NOT NULL`
- `stage TEXT NOT NULL` (`outline|page_text|image_prompts|image_render|assemble`)
- `status TEXT NOT NULL` (`queued|running|succeeded|failed|cancelled|superseded`)
- `attempt INTEGER NOT NULL DEFAULT 1`
- `idempotency_key TEXT`
- `dedupe_hash TEXT NOT NULL`
- `input_revision INTEGER NOT NULL`
- `started_at TEXT`
- `finished_at TEXT`
- `error_code TEXT`
- `error_message TEXT`
- `created_at TEXT NOT NULL`

### `story_job_events` (append-only audit)

- `id TEXT PRIMARY KEY`
- `job_id TEXT NOT NULL`
- `session_id TEXT NOT NULL`
- `from_status TEXT`
- `to_status TEXT NOT NULL`
- `event_type TEXT NOT NULL` (`enqueue|start|heartbeat|succeed|fail|cancel|supersede|retry`)
- `payload_json TEXT NOT NULL DEFAULT '{}'`
- `created_at TEXT NOT NULL`

## 2.2 Legal stage transitions

Session-level:

- `setup -> generating`
- `generating -> text_ready` (text available, images still pending)
- `text_ready -> ready` (all required assets ready)
- `generating -> failed`
- `text_ready -> failed` (partial failure after unlock)
- `failed -> generating` (only via explicit retry with new job attempt)
- Any non-terminal -> `abandoned` (user exits/abandons flow)

Job-level:

- `queued -> running -> succeeded`
- `queued -> running -> failed`
- `queued|running -> cancelled`
- `queued|running -> superseded` (newer answers revision invalidates old attempt)
- `failed -> queued` only by creating a new `attempt = prior + 1`

Invalid transitions must return `409`.

## 3) Idempotency and Restart Rules

## 3.1 Write idempotency

- `POST /api/story/sessions/:id/answers` requires `Idempotency-Key` when `triggerGeneration = true`.
- Server dedupe key:
  - `dedupe_hash = hash(user_id + session_id + stage + answers_revision + normalized_input_json + idempotency_key)`
- If duplicate request matches an in-flight/successful job for same dedupe hash:
  - return existing job/session snapshot (do not enqueue new job).
- If same key is reused with different payload:
  - return `409` (`idempotency_conflict`).

## 3.2 Restart safety

- `story_sessions` and `story_jobs` are source-of-truth for `/status`; never derive status only from in-memory state.
- On API restart:
  - detect `running` jobs with stale heartbeat and mark `failed` or `queued` for retry policy.
  - preserve terminal `succeeded|failed|cancelled|superseded` as immutable.
- Polling clients only consume persisted ledger state; no optimistic-only stage transitions.

## 3.3 Status reliability invariants

- At most one `running` job per `(session_id, stage)`.
- For a given `answers_revision`, stages must execute in order:
  - `outline -> page_text -> image_prompts -> image_render -> assemble`
- `text_ready = 1` is allowed before image completion.
- `ready` requires `text_ready = 1` and all required stage statuses terminal success.

## 4) Story Memory Boundaries (Strict Non-Leak Rules)

Story V1 memory is Story-only and isolated from existing Chat/Sandbox memory behavior.

Story scopes:

- `story_user_profile` (user-level Story preferences)
- `story_bot_notes` (user+bot Story interaction notes)

Non-leak rules (must hold):

1. Story memory is loaded only by Story endpoints and Story synthesis logic.
2. `/api/chat` and existing `processChatMessage()` paths must not read Story scopes.
3. Story critique writes must never write into existing `memories` rows used by Chat/Sandbox.
4. Sandbox thread compaction and Chat cross-thread retrieval must ignore Story scopes.
5. Any future cross-mode recall is deferred and out of V1 scope.

Implementation guardrail:

- Add explicit mode/source discriminator to any shared memory access utility. Default behavior remains existing Chat/Sandbox handling; Story uses separate storage path/queries.

## 5) Strict V1 `.story` Validation Boundary (Core Checks Only)

V1 backend validation is intentionally strict + bounded:

Required checks only:

1. Extension is exactly `.story`.
2. Archive opens and required files exist:
   - `manifest.json`
   - `pages.json`
3. Both JSON files parse.
4. `manifest.version` exists and is in V1 compatibility set.
5. Required top-level fields exist with correct primitive types:
   - `manifest`: `version`, `title`, `createdAt`
   - `pages`: array of page objects with `index` (number) and `text` (string)
6. Page indices are unique, positive, and sortable.

Out of scope for V1 boundary:

- Deep semantic linting of narrative quality
- Asset image content validation beyond reference existence
- Auto-repair or coercion of malformed payloads

Failure semantics:

- Validation failures return `400` with a single human-readable reason string.
- Never partially import on validation failure.
- Never return internal stack traces in API response.

## 6) Mapping to Existing Code Touchpoints

- `apps/api/src/server.ts`
  - Add Story route definitions and envelope/error behavior aligned with existing API conventions.
- `apps/api/src/db.ts`
  - Introduce Story ledger tables (`story_sessions`, `story_jobs`, `story_job_events`) and indexes.
- `apps/api/src/chat.ts`
  - Preserve current Chat/Sandbox memory semantics; ensure Story memory is not introduced here in V1.
- `apps/api/src/memory-inference.ts`
  - Keep current inference path isolated from Story scopes unless explicitly Story-routed later.
- `packages/shared/src/index.ts`
  - Define shared Story DTOs and enum unions for API payloads/stages/status codes.

## 7) Backend Contract Acceptance Checklist (V1)

- [ ] All Story endpoints are specified with request/response envelopes and status semantics.
- [ ] Session + job ledger schema proposal is concrete and includes legal transitions.
- [ ] Idempotency and restart behavior is explicit enough to guarantee reliable polling.
- [ ] Story memory boundaries and non-leak rules are explicit and testable.
- [ ] Strict V1 `.story` validation boundary is defined with only core checks.
- [ ] Existing backend touchpoints are mapped so implementation owners know where changes belong.

## 8) Future Slate snapshot boundary

Story and Slate keep separate tenant-scoped persistence. Future integration must
create immutable, linked snapshots rather than sharing live rows or synchronizing
content. `Develop in Slate` emits a structured narrative source packet containing
chosen and important discarded branches, demonstrated voices, world facts,
dramatic beats, bookmarks, visual references, and procedural-versus-player
provenance. `Rehearse in Story` consumes a Slate scene/outline snapshot and writes
discoveries only to the resulting Story run until the writer explicitly imports
selected material. Runtime endpoints and tables for these later stages are out of
the current Story V1 backend scope. See `docs/slate-v1-product-ux-contract.md`.
