# Portable Mansion and Whodunnit Package Threat Model

Status: V1 contract approved for internal implementation. Public sharing UI is
blocked on the internal `.mansion` round-trip and hostile-import tests.

## Security and privacy promises

- Import is an offline operation. It must not call model, image, voice, music,
  telemetry, or package-hosting services.
- Imported bytes remain tenant-scoped and are re-encrypted under the receiving
  account before installation.
- `.mansion` is presentation-only. Culprit, victim, testimony, discovery
  placement, suspect assignments, proof, dialogue, and evidence meaning are
  forbidden anywhere in its manifest.
- `.whodunnit` private case and proof data live only inside the authenticated
  payload and server-private storage. Public headers and projections contain no
  spoilers.
- Packages never execute code and never dereference URLs. Creator, license, and
  provenance URLs are display-only text.

## Trust boundaries

The public header is untrusted preview metadata. The encrypted payload and its
archive are also untrusted until authentication, bounded expansion, manifest
validation, MIME verification, and content-hash verification all succeed.
Database writes and durable file installation happen only after every check,
inside one rollback-capable operation.

Standard spoiler sealing is authenticated encryption with a Prism-managed key.
It discourages casual inspection but is not DRM and is not described as
unextractable. Password protection derives a key from a user-supplied password;
the password and derived key are never stored in the package. Creator signing
is a compatibility seam in V1, not a trust badge.

## Rejected input

Import rejects unsupported major versions; absolute, empty, duplicate, or
traversing paths; symlinks; scripts; HTML; network references; undeclared
entries; hash or MIME mismatches; invalid image dimensions; invalid audio;
excessive entry count, compressed size, expanded size, media pixels, audio
duration, or compression ratio; and any `.mansion` private-field violation.

Authentication and size checks occur before material expansion. Media is
decoded and re-encoded where practical before protected storage. Any failure
leaves no partial database records or installed files.

## Non-goals

- V1 does not provide a marketplace, reputation system, revocation service, or
  DRM.
- A creator signature proves possession of a signing key; it does not prove
  safety, accuracy, ownership, or licensing.
- Generated art and music are optional presentation. Bundled or emoji fallbacks
  keep every imported case playable.

## Required verification before public release

Pin canonical serialization, compatibility handling, private-field rejection,
tamper and password failure, path traversal, archive bombs, malformed media,
cross-user re-encryption, atomic rollback, no-network import, legacy mansion
migration, and a complete offline title-to-verdict playthrough.
