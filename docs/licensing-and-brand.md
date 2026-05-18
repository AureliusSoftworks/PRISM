# Prism Licensing And Brand Model

Prism should separate source transparency from the paid official Apple client.
The goal is to make the server auditable and community-friendly without giving
up the business model for the official frontend.

## Recommended Licensing Split

| Component | Recommended stance | Rationale |
| --- | --- | --- |
| Prism Server | Open source, likely AGPLv3 | The server is the trust anchor and contains the local-first data/runtime guarantees. AGPLv3 preserves reciprocity for networked modifications. |
| Existing web UI | Ship with the server unless later split | It is currently part of the self-hosted server experience and useful for setup/admin. |
| Official Prism macOS client (and future desktop clients) | Proprietary paid download | Polished native shell distributed from GitHub Releases (not the App Store–first model). |
| Prism name, logos, icons, marketing copy | Protected brand assets | Forks and third-party clients should not appear official or reuse protected branding. |

This is not a full legal policy. Before public launch, the exact license files,
trademark notice, contributor terms, and App Store EULA should be reviewed by a
qualified attorney.

## Why Not Fully Open Source Everything

A true open-source license cannot reliably stop someone from building or
shipping a custom frontend that avoids paying for the official app. Open-source
licenses generally allow modification, redistribution, and commercial use.

If preventing competing frontends is more important than open-source status, the
project would need a source-available license instead. That is a valid strategy,
but it should not be described as open source.

## Why Not Block Third-Party Clients

Avoid server-side checks that only permit the official frontend.

Reasons:

- The server is local and source-visible, so lockout checks are easy to remove.
- DRM-style checks undermine the local-first trust story.
- They create support burden for legitimate self-hosted setups.
- They conflict with the product's privacy and user-agency posture.

The better moat is the official client experience: native polish, secure storage, pairing flow, updates, support, and brand trust.

## Brand Boundary

Allowed for community forks:

- Use the open-source server code under its license.
- Build experimental or personal clients.
- Refer factually to compatibility with Prism Server, subject to brand rules.

Not allowed without permission:

- Calling a fork or third-party client "Prism" in a way that implies official
  status.
- Reusing official Prism icons, store artwork, screenshots, or marketing
  copy.
- Representing a third-party client as the official paid Prism client.

## Distribution Copy

README and release pages should use clear language aligned with the current
indie model (GitHub Releases for server + paid client; iPhone via PWA):

```text
Prism Server is open source and available from GitHub Releases.
The Prism client (macOS today; more platforms planned) is distributed from
GitHub Releases and activates with a license code. Prism on iPhone is a
Progressive Web App served by your Prism Server — no App Store download.
```

That keeps expectations clear for users, contributors, and future third-party
developers.
