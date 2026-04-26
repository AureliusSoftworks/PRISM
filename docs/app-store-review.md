# Prism App Store Review Checklist

This checklist prepares the official Prism iOS/Mac client for App Store review.
The app should be submitted as a native companion client for a required
user-controlled Prism Server.

## App Metadata

Required positioning:

- Prism is a private AI client for a user-controlled Prism Server.
- Prism Server is required for normal use.
- The server may run on Mac, Windows, or Linux.
- The official Apple client is the paid, polished native frontend.
- User chat data and memory live on the user's server unless the user configures
  optional online provider features.

Avoid implying:

- The iOS app runs local LLMs on-device.
- The app is a standalone cloud AI service.
- The app can function fully without Prism Server.

## Notes For Review

Review notes should include:

- A live demo Prism Server URL or a built-in full-feature demo mode.
- Demo credentials or pairing instructions.
- A short explanation of why Local Network permission is requested.
- Steps for manual host entry if discovery is not available in the review
  environment.
- A description of what data is stored on-device versus on the Prism Server.
- A note that LOCAL provider mode routes through the user's configured local
  provider and ONLINE mode may use OpenAI only when configured server-side.

## Demo Access

App Review must be able to test without building the whole self-hosted stack.
Provide one of:

1. **Hosted demo server**: a temporary Prism Server instance reachable from
   Apple review devices.
2. **Demo mode**: an in-app mode that exercises the full UI with bundled or
   mock data and clearly indicates that it is a demo.

The hosted demo server is closer to production behavior because it validates
pairing, auth, and API calls. Demo mode is useful if external server access is
unreliable during review.

## Native Differentiators

To avoid looking like a repackaged website, the client should visibly include
native Apple-platform behavior:

- SwiftUI navigation and native list/detail layouts.
- Keychain-backed session storage.
- Face ID/Touch ID app lock.
- Local Network discovery UI.
- QR-code or pairing-code flow.
- Native error states for offline server, expired pairing code, and invalid URL.
- Share/export integration in later releases.
- Platform-appropriate settings and disconnect controls.

## Local Network Permission Copy

Suggested purpose string:

```text
Prism uses your local network to find and connect to your Prism Server.
```

The onboarding UI should explain this before the system prompt appears.

## Privacy Nutrition Notes

Privacy labels should be based on what the official Apple client itself
collects or transmits.

Expected posture:

- Account/profile data: used to authenticate with the user's Prism Server.
- User content: transmitted to the user's selected Prism Server.
- Diagnostics: avoid third-party analytics for the first App Store release.
- Tracking: none.

The privacy policy should explain that the server may optionally connect to
OpenAI only when the user configures and chooses ONLINE mode.

## Review Risk Register

| Risk | Mitigation |
| --- | --- |
| Rejected as a web wrapper | Native SwiftUI client, Keychain, Face ID/Touch ID, discovery, pairing, and native settings |
| Reviewer cannot access server | Hosted demo server or complete demo mode |
| Local Network prompt feels surprising | Pre-permission explainer and clear purpose string |
| HTTP LAN server conflicts with ATS expectations | Prefer HTTPS where practical, document development exceptions, and validate real-device behavior early |
| Required server seems hidden | State Prism Server requirement in metadata, onboarding, and review notes |
| Privacy story seems unclear | Separate device data, server data, local provider behavior, and optional OpenAI behavior |

## Pre-Submission Checklist

- App launches to onboarding without a stored session.
- User can discover or manually enter a server.
- Pairing flow succeeds against the review demo server.
- Invalid server, offline server, and expired pairing code states are handled.
- Review notes contain server access instructions.
- Privacy labels and privacy policy match the actual client behavior.
- App does not show unfinished web surfaces or placeholder screens.
