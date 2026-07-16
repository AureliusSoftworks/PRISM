# Prism Licensing And Brand Model

Prism's current public posture is simple: official desktop builds are free to
download and use, and people can optionally support development through one
`$5/month` Patreon lane.

This is not a full legal policy. Before public launch, the exact license file,
trademark notice, contributor terms, brand-use rules, and any store terms should
be reviewed by a qualified attorney.

## Current Positioning

| Area | Current stance | Rationale |
| --- | --- | --- |
| Official Prism desktop builds | Free to download and use | Reduces friction and matches the local-first trust story. |
| Optional support | One `$5/month` Patreon lane | Funds development without creating tiers, paid gates, or access checks. |
| Prism name, logos, icons, marketing copy | Protected brand assets | Forks and third-party clients should not appear official or reuse protected branding. |
| Source/license status | Not final until a `LICENSE` exists | Avoids making final license claims before the legal surface is real. |

## Support Boundary

Support must stay separate from runtime access.

- Do not add purchase checks, paid feature locks, or supporter-only core
  features.
- Do not link Patreon accounts inside Prism during this phase.
- Do not add telemetry or outbound support verification to LOCAL mode.
- If the app later adds a support entry point, make it a quiet Settings/About
  link labeled `Support Prism` that opens Patreon externally.

## Source And License Boundary

Until a real `LICENSE` file is added, public copy should avoid specific
source-license labels for the active product. It is safe to say:

```text
Prism official builds are free to download and use. The final source license
and brand-use policy are still being prepared.
```

If the project later adopts a public source license, update this file, root
copy, release copy, and contributor guidance together.

## Brand Boundary

The identity and experience rules for the refraction emblem, wordmark,
triangle, and user-as-light philosophy live in
[`brand-ethos.md`](brand-ethos.md). Those rules define how official PRISM
surfaces should express the protected brand assets described here.

Allowed for community discussion:

- Refer factually to compatibility with Prism.
- Share feedback, bug reports, setup notes, and non-official experiments.

Not allowed without permission:

- Calling a fork or third-party client "Prism" in a way that implies official
  status.
- Reusing official Prism icons, store artwork, screenshots, or marketing copy.
- Representing a third-party client as the official Prism app.

## Distribution Copy

README and release pages should use clear language aligned with the current
indie model:

```text
Prism official desktop builds are free to download and use from GitHub
Releases. Optional $5/month Patreon support helps fund development but does
not unlock core features, affect local/private mode, or create access checks.
Prism on iPhone is a Progressive Web App served by your Prism desktop app.
```

That keeps expectations clear for users, supporters, and future contributors.
