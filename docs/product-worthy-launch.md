# Prism Product-Worthy Launch Checklist

Prism should not be promoted broadly until the official downloads feel safe,
understandable, and honest. The launch goal is not maximum noise; it is a
trustworthy first public loop for people who want a private, local-first AI
workspace.

## Release Readiness

- Mac, Windows, and Linux desktop artifacts are attached to the expected
  `desktop/v<version>` GitHub Release.
- Each installer launches on a clean environment.
- First-run setup explains required local dependencies and recovery steps in
  plain language.
- The app can reach local API/web services after install without manual dev
  commands.
- Factory reset and reinstall behavior are documented.

## Product Trust

- LOCAL mode is verified to stay local for chat, auxiliary work, embeddings,
  and image-generation blocking.
- The README and release notes explain when ONLINE mode may call configured
  cloud providers.
- No support, Patreon, analytics, or payment integration creates outbound
  traffic from the local runtime.
- Privacy claims are consistent across README, release notes, and docs.

## Support Copy

- Public copy says Prism is free to download and use.
- Optional support is one `$5/month` Patreon lane.
- Copy avoids tiers, paid feature locks, purchase language, and supporter-only
  core benefits.
- Any future in-app entry point is quiet: Settings/About, labeled
  `Support Prism`, opening Patreon externally.
- No popup, onboarding prompt, badge, patron login, or telemetry is added for
  the first support pass.

## Launch Assets

- GitHub Release notes include the download links, supported platforms, known
  limitations, and a short privacy/local-mode summary.
- README screenshots are current enough to avoid misleading first-time users.
- A concise announcement draft exists for the first public post.
- Patreon page copy is ready, matches the one-price model, and makes clear that
  support is optional.

## Go/No-Go

Launch only when:

- All required platform smoke tests pass.
- The free-download/support model is consistent in canonical docs.
- Any known product gaps are listed plainly in release notes.
- The support ask feels like patronage, not permission.
