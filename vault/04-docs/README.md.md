---
title: "README.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "README.md"
status: "active"
---

# README.md

## AI Summary
<!-- kb:summary:start -->
This note matters in PRISM because it provides essential information on how to set up and use the Prism Server, including downloading and installing the server software, understanding the branch model and release process, and accessing app icons and the App Store Split Roadmap.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/__tests__/providers.test.ts]]
- [[02-apps/api/src/server.ts]]
- [[02-apps/web/src/app/page.tsx]]
- [[04-docs/docs/app-store-distribution.md]]
- [[04-docs/docs/app-store-review.md]]
- [[04-docs/docs/git-safeguards.md]]
- [[04-docs/docs/licensing-and-brand.md]]
- [[04-docs/docs/mobile-api-contract.md]]
- [[04-docs/docs/native-client-mvp.md]]
- [[04-docs/docs/prism-client-app.md]]
- [[04-docs/docs/prism-ios-client.md]]
- [[04-docs/docs/prism-server-app-windows.md]]
- [[04-docs/docs/prism-server-app.md]]
- [[04-docs/docs/production-readiness-gate.md]]
- [[04-docs/docs/release-process.md]]

## Referenced by
- [[07-features/01-per-user-auth-with-encrypted-session-cookies]]
- [[07-features/02-optional-second-ollama-host-add-another-lan-ollama-machine-from-settin]]
- [[07-features/03-dedicated-system-models-user-facing-chat-can-use-local-or-openai-but-p]]
- [[07-features/04-native-client-web-gate-the-hosted-web-shell-requires-a-paired-prism-cl]]
- [[07-features/05-post-auth-hub-with-5-colour-prism-glyph-mode-tiles]]
- [[07-features/06-chat-a-calm-stripped-down-personal-prism-surface-sidebar-history-typin]]
- [[07-features/07-sandbox-the-full-command-center-experience-bots-provider-toggle-lock-f]]
- [[07-features/08-story-library-and-other-disabled-roadmap-tiles-preview-future-bot-expe]]
- [[07-features/09-strict-data-isolation-every-query-is-tenant-scoped-by-user-id]]
- [[07-features/10-mode-specific-memory-model]]
- [[07-features/11-chat-gets-cross-thread-personal-fact-memory-extracted-preferences-in-t]]
- [[07-features/12-candidate-memories-pass-through-an-llm-validation-critic-plus-determin]]
- [[07-features/13-sandbox-gets-a-silent-thread-scoped-rolling-compaction-summary-that-ki]]
- [[07-features/14-incognito-opts-out-of-both-paths-for-the-turn-and-forces-the-provider-]]
- [[07-features/15-customizable-chatbots-with-a-structured-profile-builder-ocean-inspired]]
- [[07-features/16-expanded-bot-glyph-picker-with-hundreds-of-lucide-backed-glyphs-alongs]]
- [[07-features/17-forkable-chats-branch-from-any-message-in-a-conversation-sandbox]]
- [[07-features/18-auto-generated-chat-titles-first-replies-trigger-a-background-local-ll]]
- [[07-features/19-askquestion-bot-tool-assistants-can-optionally-end-a-turn-with-a-prism]]
- [[07-features/20-bot-portability-export-import-individual-bots-as-markdown-files-profil]]
- [[07-features/21-markdown-in-message-bubbles-assistant-and-user-messages-render-github-]]
- [[07-features/22-per-chat-deletion-remove-individual-chats-from-the-sidebar-subtle-that]]
- [[07-features/23-openai-image-generation-dall-e-3-with-gallery-sandbox]]
- [[07-features/24-conversation-export-to-markdown-files-persisted-in-the-database-sandbo]]
- [[07-features/25-mobile-first-ui-responsive-chat-interface-with-slide-out-sidebar]]
- [[07-features/26-dark-light-themes-per-user]]
- [[07-features/27-change-password-from-settings-account-actions]]
- [[07-features/28-self-serve-account-deletion-from-settings]]
- [[07-features/29-automatic-60-day-inactive-account-cleanup]]

## Source path
- `README.md`

## Body preview
```markdown
# Prism

A local-first AI playground. The fidelity and per-account isolation of
ChatGPT Gov, the systems-focus and creative-permission of FL Studio. Runs
headless on a user-owned machine and reachable across the LAN from any
trusted device. Every account is its own sandbox — encrypted memory,
customizable chatbots, OpenAI image generation, forkable conversations,
Markdown rendering in chat and Markdown conversation export.

**Current release:** v0.1.0 (first production build). See [CHANGELOG.md](CHANGELOG.md) for release notes.

**Branch model:** `main` holds tagged, released versions only; all active
development happens on `dev`. Every release is a merge of `dev` into `main`
with a matching `CHANGELOG.md` entry and a semver tag.

## Get Prism Server (GitHub Releases)

The **`server/v<version>`** draft or published release lists **primary** server
artifacts for end users (replace `<version>` with the semver, e.g. `0.1.0`):

| Platform | File on the release |
|----------|----------------------|
| macOS | `Prism-Server-v<version>.dmg` |
| Windows (installer) | `Prism-Server-Setup-v<version>-win-x64.exe` |
| Windows (portable folder) | `Prism-Server-v<version>-win-x64-portable.zip` |
| Linux x86_64 | `Prism-Server-v<version>-linux-x64.tar.gz` |

**Developers / audit:** `prism-server-v<version>-bundle.tar.gz` is a **trimmed
source tree export** (not a turnkey runtime). Use it for inspection, custom
builds, or advanced Linux-from-source workflows — not as the default Linux
download (use the Linux row above).

Workflows: draft + bundle asset from **Release Pipeline (dev -> main)**; platform
builds from **Release Prism Server (all platforms)** (one run) or individual
`release-server-*.yml` workflows. See [docs/release-process.md](docs/release-process.md).

### Local `dev` push guardrail (temporary)

To reduce accidental branch damage without paid GitHub branch-protection
features, this repo currently uses a local `pre-push` hook at
`.git/hooks/pre-push` that blocks:

- deleting `dev` (`git push origin :dev`)
- non-fast-forward updates to `dev` (force-style history rewrites)

This is a **local safety net only** (per clone/machine), not server-side
enforcement. If you cl

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
