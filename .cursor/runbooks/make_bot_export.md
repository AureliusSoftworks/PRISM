# make_bot_export

## Goal
Create a researched, import-ready PRISM `.bot` export for a requested fictional or non-fictional target, save it under `.cursor/output/`, and do not import it unless explicitly requested.

## Inputs
- A target name, character, public person, historical figure, or empty target for random mode.
- Optional import opt-in text: `--import`, `import it`, `auto-import`, `add it to Prism`, `put it in Prism`, or `create and import`.
- Workspace root for the Prism / LocalAI repository.

## Preconditions
- Start from the repository root when saving workspace artifacts.
- Load and follow `~/.cursor/skills/_make-bot/SKILL.md`.
- Prefer Plan Mode first when available. If the mode switch is unavailable or rejected, continue with a compact plan in chat.
- Preserve unrelated working-tree changes.
- Treat living public figures carefully: use public facts and documented public persona only; do not invent private thoughts, private relationships, diagnoses, or private facts.
- Treat `bot.glyph` and `bot.color` as deliberate design choices, not defaults.
- Do not auto-import by default.

## Execution Steps
1. Parse the requested target and import intent.
   - Expected result: the bot target and whether import was explicitly requested are known.
2. Load `~/.cursor/skills/_make-bot/SKILL.md`.
   - Expected result: the current bot export contract, research rules, visual identity rules, profile requirements, and memory rules are available.
3. Attempt to switch to Plan Mode.
   - Expected result: Plan Mode is active, or the rejected/unavailable switch is noted and the workflow continues with a compact plan in chat.
4. State the compact research plan.
   - Expected result: the plan identifies target scope, persona timeframe, sources, personality/worldview dimensions, voice behavior, memory categories, safety boundaries, birth/debut anchors, political/worldview signals when relevant, and proposed glyph/color.
5. Inspect the bot export shape used by the app.
   - Expected result: `schema`, `bot`, `profile`, `systemPrompt`, `memories`, and `exportedAt` requirements are confirmed from the codebase or reference artifact.
6. Inspect Prism's glyph registry before choosing an extended glyph.
   - Expected result: the chosen `bot.glyph` is a real registry key, commonly from `apps/web/src/app/glyphCatalog.ts`.
7. Research the target with web search and reputable sources.
   - Expected result: identity facts, birthday/debut anchors, public role, voice, worldview, appearance, and timeline boundary are sourced.
8. Pick the persona timeframe.
   - Expected result: all facts and memories are plausible from that target's selected perspective and do not include impossible future/posthumous self-knowledge.
9. Separate permanent facts from memories.
   - Expected result: durable identity facts are placed in `profile.facts`; memories focus on behavioral shaping, voice, motivations, values, boundaries, and conversation habits.
10. Draft the structured profile.
    - Expected result: purpose, core, identity, worldview, appearance, and facts fields are filled when research supports them.
11. Check `profile.purpose.statement`.
    - Expected result: the statement starts as a definition-style noun phrase, does not start with `You are` or `I am`, and is at most 120 characters.
12. Draft the system prompt from the profile.
    - Expected result: the prompt includes Purpose, Core personality, Identity details, Worldview, Appearance and presence, Behavioral guidance, and ends with `Only use filled-in profile details. Do not invent certainty for blank fields.`
13. Draft 28-48 memories for a named target, or 24-40 memories for random mode.
    - Expected result: memories address the bot as `You`, use `source: "direct"` only for known durable self-knowledge when appropriate, use `source: "compiled"` for synthesized behavior, and include confidence/certainty/sourceMessageIds.
14. Create `.cursor/output/` if it does not exist.
    - Expected result: the output directory exists inside the workspace.
15. Save the JSON as `.cursor/output/bot-<slug>.bot`.
    - Expected result: the saved file is import-ready and named from the bot display name.
16. Validate the saved file.
    - Expected result: JSON parses, schema is `prism-bot-export-v1`, `bot.color` is `#RRGGBB`, `bot.glyph` exists in the registry, purpose length is within 120 characters, and memory count matches the quality bar.
17. Import only if explicitly requested.
    - Expected result: no import occurs by default; if import was requested, run `node ~/.cursor/skills/_make-bot/import_bot.mjs <path-to-saved-bot-file>` and report helper results.
18. Report the saved file link and validation summary.
    - Expected result: the user receives a clickable local file link, glyph, color, memory count, validation result, and whether import was skipped or completed.

## Observed Step Trace
This is the exact process used for `/🤖 make-bot Donald Trump` on 2026-05-22:

1. Loaded `~/.cursor/skills/_make-bot/SKILL.md`.
2. Attempted Plan Mode; the switch was rejected, so the workflow continued with a compact plan in chat.
3. Tried to read `/Users/jared/Desktop/bot-spongebob.json`; it was unavailable, so the app import/export contract was inspected from source.
4. Read `apps/web/src/app/glyphCatalog.ts` to verify valid glyph keys.
5. Read the trend ledger as part of the normal user-initiated bookkeeping path.
6. Searched the web for Donald Trump biography, presidency, birth date, public role, public speaking style, rhetoric, political ideology, Republican alignment, and America First signals.
7. Selected a current public-person scope through his second presidential term as of 2026.
8. Chose `lucideLandmark` and `#B22234`, tied to U.S. presidency/government, Republican/red-tie visual vocabulary, and recognizable library scanning.
9. Searched the codebase for `prism-bot-export-v1`, `botHash`, `deleteProtected`, and profile fields.
10. Read the import/export types and importer flow in `apps/web/src/app/page.tsx`.
11. Read the structured profile shape in `packages/shared/src/botProfile.ts`.
12. Checked for existing `.bot` or bot JSON artifacts in the workspace.
13. Created `.cursor/output/`.
14. Wrote `.cursor/output/bot-donald-trump.bot`.
15. Ran a Node parse/shape check against the saved file and glyph catalog.
16. Reported the file link, glyph, color, memory count, purpose length, and that import was skipped.

## Decision Points
- If no target is provided: choose a random well-documented fictional or non-fictional target and proceed without asking unless the target is risky or unclear.
- If a reference bot file is missing: use the current app import/export source code as the contract.
- If Plan Mode is rejected or unavailable: continue with a compact plan in chat before creating JSON.
- If glyph spelling is uncertain: inspect `apps/web/src/app/glyphCatalog.ts` and choose only a verified key.
- If sources conflict on a critical fact: cross-check additional sources, lower confidence, or omit the fact.
- If the subject is a living person: prefer public persona and documented facts; do not encode private speculation.
- If `profile.purpose.statement` exceeds 120 characters: rewrite it cleanly and move extra nuance to `legacyNotes`.
- If import is not explicitly requested: stop after saving and validating the `.bot` file.

## Error Handling
- Missing target in direct mode: use random-target mode from `_make-bot`.
- Missing output directory: create `.cursor/output/`.
- Missing glyph registry match: choose another verified glyph before saving.
- JSON parse failure: fix the JSON file before reporting completion.
- Invalid color: replace with a six-digit `#RRGGBB` color tied to the target.
- Purpose statement too long: rewrite before final validation.
- Import helper exit code `3`: report that the Prism API is unreachable and link the saved `.bot` file.
- Import helper exit code `4`: report the auth problem and link the saved `.bot` file.
- Unknown state: report what was saved, what validation passed or failed, and the smallest next action.

## Output Contract
Return this structure after execution:

```markdown
Runbook: make_bot_export
Mode: <direct|command-backed>
Result: <completed|partial|blocked>

Saved:
- `<path-to-bot-file>`

Visual Identity:
- Glyph: `<bot.glyph>`
- Color: `<bot.color>`

Validation:
- JSON parse: <passed|failed>
- Schema: <passed|failed>
- Glyph registry: <passed|failed>
- Purpose length: <n>/120
- Memories: <count>

Import:
- <skipped|completed|failed>
```

## Completion Criteria
- `.cursor/output/bot-<slug>.bot` exists.
- Saved file parses as JSON.
- Schema is `prism-bot-export-v1`.
- `bot.color` is a six-digit hex color.
- `bot.glyph` is a verified Prism glyph key.
- `profile.purpose.statement` is definition-first and at most 120 characters.
- Memories are temporally plausible and behaviorally useful.
- The user receives a clickable local file link.

## Handoff Notes
- This runbook documents the repeatable execution path behind `/🤖 make-bot`.
- The `_make-bot` skill remains the source of truth for detailed schema and quality rules.
- The command should point here for operational steps and to `_make-bot` for construction rules.
