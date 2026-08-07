# Smart Asset Memory — Phase 1 Opportunity Audit

Frozen thresholds for Phase 2 implementation (Hybrid H + prompt-path only).

## Image prompt / runtime attachments

| Surface | Today | Recommendation |
|---|---|---|
| Debate exhibits in synthesis / vision | Often full `/file` PNG | Temporary attach max longest edge **1024px** WebP q82 |
| Signal studio lighting derivation | Full day/night PNG bytes | Keep full res for lighting math; UI thumbs stay 512 |
| Magenta / Compress edit tools | Full hot PNG | Warm cold assets first; operate on library original |
| Chat / Images gallery tiles | `/thumb` 512 WebP | Keep; viewport unload drops off-screen decode |
| CSS wallpaper / atmosphere backgrounds | Full `/file` | Leave gallery originals; optional future display WebP |

**Frozen Phase 2 defaults**

- `IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX = 1024`
- Player **Compress size**: 50% longest edge when edge ≥ **1536px** (`IMAGE_ASSET_COMPRESS_MIN_EDGE_PX`)
- Automatic cold storage remains lossless WebP (not lossy)

## Audio inventory

| Kind | Storage | Notes |
|---|---|---|
| Replay takes / masters | `replay-media/` files | Largest growth risk after images; per-file caps exist; no library GC |
| Signal intro / atmosphere | SQLite BLOBs | Can bloat `localai.db`; prefer file migration later |
| Action SFX pack clips | SQLite BLOBs | Small clips; keep |
| Avatar SFX data URLs | Voice profile JSON | Cap already ≤4 MB |

**Audio Phase 2 scope (approved here)**

1. Prefer **Opus/WebM or existing mediabunny encode** quality caps on new faithful replay masters (no ffmpeg dependency).
2. Do **not** auto-delete replay takes in Phase 2 without a player-facing tidy rail (follow-up).
3. Document Signal BLOB → file migration as a later phase; out of Phase 2 code unless a single low-risk encode bitrate clamp is already local.

## Implementation checklist (Phase 2)

- [x] Prompt-attachment helper `encodePromptAttachmentRaster`
- [x] Compress + Undo UI beside Magenta
- [x] Cold hot/cold tiers + Smart tidy
- [ ] Call `encodePromptAttachmentRaster` on Debate/Signal vision attach paths where full PNG is currently inlined
- [ ] Optional replay bitrate clamp only if already expressible without new deps

## Privacy

Tag refinement uses local Ollama auxiliary only. LOCAL mode never calls OpenAI for tags or smart memory.
