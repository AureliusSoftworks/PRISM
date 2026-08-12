# Steam Desktop Smoke Matrix

This is the human verification record for the Steam launch track. It is
deliberately separate from automated staging and content tests: a green local
gate does not prove that a packaged desktop build launches on a clean target.

## Current Candidate

| Field | Value |
| --- | --- |
| App ID | `5000460` |
| Last recorded build | `24343089` |
| Historical branch | `default` |
| Future test branch | `prerelease` or another private branch |
| Runtime ports | API `18787`, web `18788` |

The historical macOS result below was recorded after a default-branch smoke
test. Future candidates must be uploaded and tested on a private or prerelease
branch before any public-branch promotion.

## Platform Matrix

| Platform | Clean target | Launch | First run and local services | Quit/relaunch | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | Jared's Mac, BuildID `24343089` | PRISM launched from Steam | Main app and Chat path worked | Quit and relaunch worked | PASS, recorded 2026-07-22 |
| Windows x64 | Clean Windows target | Pending | Pending | Pending | PENDING |
| Linux x64 | Clean Linux target | Pending | Pending | Pending | PENDING |
| SteamOS/Deck | SteamOS target, only if compatibility is claimed | Pending | Pending | Pending | NOT CLAIMED |

## Test Cases

Run every row on each supported platform and record the build ID, OS version,
target cleanliness, result, and a screenshot or log path. Do not put account
credentials, Steam Guard codes, API keys, or private user data in the record.

| ID | Check | Pass condition |
| --- | --- | --- |
| S1 | Install from Steam | The candidate installs without developer files or dev-only Marketplace content. |
| S2 | Steam working directory | Launch succeeds when started from Steam, regardless of the current working directory. |
| S3 | First run | The app reaches its normal first-run/auth surface without a terminal or dev command. |
| S4 | Local services | Packaged API/web services start; the app reaches the main surface on ports `18787`/`18788`. |
| S5 | LOCAL mode | A local turn completes; no unexpected external provider request is observed. |
| S6 | ONLINE clarity | The UI makes the online-provider state apparent before an online request. |
| S7 | Main interaction | Start a conversation, receive a response, and exercise the primary Chat path. |
| S8 | Quit/relaunch | Quit from Steam, relaunch, and confirm the app still starts cleanly. |
| S9 | Reset/reinstall | Uninstall/reinstall behavior matches the documented data-retention expectations. |
| S10 | Failure recovery | Stop/restart the local service or use a blocked network state and confirm the recovery surface is understandable. |

## Evidence Record Template

Copy one block per platform and candidate build:

```text
Platform:
BuildID:
Steam branch:
OS version:
Clean target details:
S1-S10:
Screenshots/logs:
Unexpected behavior:
Tester/date:
```

Windows/Linux clean-target evidence remains required before Valve build review
and before public Steam release.
