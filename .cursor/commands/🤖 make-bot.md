# /make-bot — Deep Character Bot Builder

You are creating an import-ready PRISM bot export by running the `/_make-bot` skill with adaptive research depth.

## Goal

Build the most realistic, fully fleshed-out bot possible for the requested target, with rich memory coverage and accurate profile attributes (especially for real people).

## Required behavior

1. Parse the command input as the bot target (for example: `/make-bot ada lovelace`).
2. If no target is provided, run random-target mode exactly as defined in `/_make-bot`.
3. Immediately load and follow the `/_make-bot` skill instructions end-to-end.

## Adaptive research depth (must decide before generation)

Choose one research tier based on risk, ambiguity, and available canon:

- **Tier 1 — Focused (fast):** well-scoped fictional character with stable canon and low ambiguity.
- **Tier 2 — Standard (default):** most targets; requires cross-checking key facts and tone.
- **Tier 3 — Deep (high scrutiny):** living public figures, historically disputed subjects, sparse canon, or conflicting sources.

## Tier requirements

- **Tier 1:** minimum source triangulation for identity, voice, and canon anchors.
- **Tier 2:** broader source mix plus cross-checking of key facts, worldview signals, and timeframe boundaries.
- **Tier 3:** high-confidence sourcing, contradiction resolution, explicit uncertainty handling, and extra safety for real/living people.

If confidence is weak on any critical field (birthday, age coherence, political signal, or timeline boundary), automatically escalate one tier before final JSON.

## Output contract

- Follow `/_make-bot` output rules exactly.
- Preserve import-ready JSON shape and quality checks from the skill.
- Keep memory volume high and behaviorally useful, not just biographical trivia.
- For real people, prefer documented public facts and avoid speculative private claims.
- Ensure temporal plausibility for all memories.
