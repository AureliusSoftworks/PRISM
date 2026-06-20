# Prism Product-Worthy Launch Tracker

Prism should not be promoted broadly until the official downloads feel safe,
understandable, and honest. The launch goal is not maximum noise; it is a
trustworthy first public loop for people who want a private, local-first AI
workspace.

Status: not ready for broad outreach until every Go/No-Go item is marked
`pass` with evidence.

Related launch assets:

- [`launch/support-copy-pack.md`](launch/support-copy-pack.md)
- [`launch/outreach-workflow.md`](launch/outreach-workflow.md)

## Evidence Tracker

| Area | Requirement | Evidence to record | Status |
| --- | --- | --- | --- |
| macOS artifact | DMG attached to `desktop/v<version>` release and launches on a clean Mac | Version, machine, install notes, screenshot/log path | pending |
| Windows artifact | Installer attached to `desktop/v<version>` release and launches on a clean Windows environment | Version, VM/device, install notes, screenshot/log path | pending |
| Linux artifact | AppImage attached to `desktop/v<version>` release and launches on a clean Linux environment | Version, distro, install notes, screenshot/log path | pending |
| First-run setup | User can reach Prism without dev commands | Steps followed, confusing copy, recovery notes | pending |
| Local services | App reaches local API/web services after install | Health check URL, app screenshot, logs | pending |
| Factory reset | Reset/reinstall behavior is documented and works | Command/path used, data retained/deleted notes | pending |
| LOCAL privacy | LOCAL mode stays local for chat, auxiliary work, embeddings, and image-generation blocking | Test command/log evidence; no unexpected outbound host | pending |
| ONLINE clarity | README/release notes explain when online providers may be called | Doc links and reviewed copy | pending |
| Support boundary | Support copy stays optional and non-gating | Link to reviewed support copy pack | pending |
| Launch copy | Release notes include downloads, limitations, privacy summary, and optional support | Draft link or release notes path | pending |
| Outreach packet | First public draft includes rule audit and manual-posting note | Link to outreach packet | pending |

## Go/No-Go

| Gate | Pass condition | Status |
| --- | --- | --- |
| Downloads | Mac, Windows, and Linux artifacts install and launch cleanly enough for a first public audience | pending |
| Trust | Privacy/local-mode claims are verified against the release candidate | pending |
| Clarity | First-run setup and known limitations are written plainly | pending |
| Support | Patreon copy uses `[PATREON_URL]` only in drafts or the real URL in public copy | pending |
| Outreach | Every community draft has a live rule audit and Jared approval before posting | pending |

## Known Gaps Log

Add entries before launch rather than hiding them in release notes at the last
minute.

| Gap | User impact | Public wording needed? | Owner | Status |
| --- | --- | --- | --- | --- |
| `[GAP]` | `[IMPACT]` | `[YES/NO]` | `[OWNER]` | pending |

## Launch Rule

Launch only when:

- All required platform smoke tests pass.
- The free-download/support model is consistent in canonical docs.
- Any known product gaps are listed plainly in release notes.
- The support ask feels like patronage, not permission.
