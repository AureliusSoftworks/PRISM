# Prism Outreach Workflow

Status: draft-only workflow. Jared approves and posts publicly.

This workflow exists so Prism can show up in relevant communities without
turning into drive-by promotion. The first audience is privacy/local-AI people:
self-hosters, local model users, and people who care about where their data and
model calls go.

## Operating Rules

- Draft only unless Jared explicitly approves a public post.
- Do not post in any community before a live rule audit.
- Default to `do not post` when self-promotion rules are unclear.
- Prefer useful context, honest limitations, and specific feedback asks over
  broad launch hype.
- Disclose the relationship: "I make Prism."
- Keep Patreon secondary and optional.

## Rule Audit Template

Complete this before drafting for any community.

| Field | Notes |
| --- | --- |
| Community | `[COMMUNITY_NAME]` |
| URL | `[COMMUNITY_URL]` |
| Rule source | `[RULES_URL]` |
| Self-promo policy | `[ALLOWED / LIMITED / NOT ALLOWED / UNCLEAR]` |
| Required flair | `[FLAIR_OR_NONE]` |
| Link policy | `[DIRECT LINK / TEXT POST / COMMENT LINK / NO LINK]` |
| Frequency limits | `[LIMITS_OR_NONE_FOUND]` |
| Best fit | `[POST / COMMENT-ONLY / DO NOT POST]` |
| Why allowed here | `[ONE SENTENCE WITH RULE BASIS]` |
| Draft owner | `Codex drafts; Jared approves/posts` |

## Channel Decision Rules

- `POST`: Rules clearly allow project sharing, launch posts, feedback requests,
  or maker posts, and the draft can add value beyond a link.
- `COMMENT-ONLY`: Rules discourage standalone promotion but allow relevant
  replies when someone asks for tools, local-first workflows, or self-hosted AI.
- `DO NOT POST`: Rules ban promotion, require approval we do not have, or are
  ambiguous after review.

## Post Draft Template

Use only after the rule audit says `POST`.

```text
Title:
[Concrete, non-hype title tailored to the community]

Body:
I make Prism, a local-first AI workspace for people who want more visible
control over where model calls happen.

It is free to download and use. The core idea is simple: routine/private work
should stay local, and online models should be an explicit choice rather than
a surprise.

Why I am sharing it here:
[Tie directly to the community rule/interest. Ask for feedback on a specific
part of the product, such as first-run setup, local-mode clarity, or installer
trust.]

Download:
[GITHUB_RELEASE_URL]

Optional support:
[PATREON_URL]

Disclosure:
I make Prism. Support is optional and does not unlock features.
```

## Comment-Only Template

Use only when a post or thread asks for relevant tools and the rule audit says
`COMMENT-ONLY`.

```text
I make Prism, so obvious disclosure there. It may fit if you want a local-first
AI workspace with explicit local/online control rather than a cloud-only chat
surface.

It is free to download and use: [GITHUB_RELEASE_URL]

Optional support exists, but it does not unlock features or change the app:
[PATREON_URL]
```

## Reply Handling

- Thank people for trying it.
- Answer setup and privacy questions directly.
- Convert real bugs or recurring confusion into repo tasks.
- Do not argue with people who do not want the product.
- Do not push Patreon in replies unless someone asks how to support the work.

## Outreach Packet Checklist

Every outreach draft must include:

- Completed rule audit.
- Draft post or comment.
- One-sentence reason the community is relevant.
- Known limitation to state upfront if relevant.
- Final recommendation: `post`, `comment-only`, or `do not post`.
