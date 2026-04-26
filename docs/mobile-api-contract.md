# Prism Mobile API Contract

This document defines the server contract for official Prism iOS/Mac clients.
The server remains the source of truth for accounts, memory, provider routing,
chat history, bots, exports, and local-first guarantees.

## Current Boundary

The current backend is `apps/api/src/server.ts`. It exposes a JSON HTTP API
under `/api/*`, backed by SQLite, Qdrant, Ollama, and optional OpenAI access.
The existing web frontend reaches the API through the Next.js rewrite in
`apps/web/next.config.ts`; native clients should call the configured Prism
Server base URL directly.

Example native base URL:

```text
http://prism-server.local:8787/api
```

The current route inventory is:

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `DELETE /api/account` |
| Conversations | `GET /api/conversations`, `GET /api/conversations/:id`, `DELETE /api/conversations/:id`, `DELETE /api/conversations`, `POST /api/conversations/:id/rewind`, `POST /api/conversations/:id/fork` |
| Chat | `POST /api/chat` |
| Memories | `GET /api/memories`, `DELETE /api/memories/:id` |
| Settings and models | `GET /api/settings`, `PATCH /api/settings`, `GET /api/models` |
| Backup | `GET /api/backup/export`, `POST /api/backup/import`, `GET /api/backup/versions` |
| Images | `POST /api/images/generate`, `GET /api/images` |
| Bots | `POST /api/bots`, `GET /api/bots`, `PATCH /api/bots/:id`, `DELETE /api/bots/:id`, `DELETE /api/bots` |
| Exports | `POST /api/conversations/:id/export`, `GET /api/exports`, `GET /api/exports/:id` |

`packages/shared/src/index.ts` contains the TypeScript DTOs that should anchor
the mobile model layer. The first mobile pass should translate these types into
Swift models rather than duplicating server logic on-device.

## Authentication Model

Today, the web app authenticates with an HttpOnly session cookie. Native clients
can technically use cookie storage, but the official mobile contract should add
a parallel bearer-session path:

```http
Authorization: Bearer <session-token>
```

Rules:

- Cookie sessions remain the browser/web contract.
- Bearer sessions are for native clients and are stored in the Keychain.
- `requireAuth()` should accept either the existing cookie token or the bearer
  token, resolving both through the same `sessions` table.
- Logout should invalidate the server-side session token regardless of transport.
- CORS should allow `authorization` if any browser-based tooling needs to test
  the mobile transport.

## Readiness Endpoint

`GET /api/health` currently returns a basic process health payload. The mobile
contract should expand it into a readiness endpoint before the native client
depends on it.

Target response shape:

```json
{
  "ok": true,
  "appName": "Prism Server",
  "serverVersion": "0.1.0",
  "apiVersion": 1,
  "pairingEnabled": true,
  "serverName": "Jared's Prism",
  "services": {
    "sqlite": "ready",
    "qdrant": "ready",
    "ollama": "ready",
    "openai": "not_configured"
  }
}
```

The iOS/Mac app should treat `ok: true` as "the server process is reachable"
and inspect `services` to show more specific setup guidance.

## Local-Network Discovery

Prism Server should advertise itself on the LAN so a freshly installed client
can find it without requiring the user to type an IP address.

Recommended discovery channel:

- Bonjour/mDNS service type: `_prism._tcp.`
- Service name: user-visible server name, such as `Jared's Prism`
- Port: API port, normally `8787` for direct API access
- TXT records:
  - `api=1`
  - `version=0.1.0`
  - `pairing=required`
  - `tls=optional`

The client onboarding flow should request Local Network permission before
scanning. Manual server URL entry remains required for custom hosts, remote
hosts, VPN setups, or discovery failure.

## Pairing Flow

Pairing should feel like connecting a trusted local device, not signing into a
cloud account.

Target flow:

1. Prism Server displays a short-lived pairing code and QR code.
2. The iOS/Mac client discovers the server or accepts a manual URL.
3. The client sends the pairing nonce to a future endpoint such as
   `POST /api/pairing/exchange`.
4. The server validates the nonce, creates a normal session row, and returns a
   bearer session token plus the authenticated user profile.
5. The client stores the token in the Keychain and uses it for future requests.

The device starts with no local Prism account. Accounts remain server-owned.
If the server has not been configured yet, the server app should handle first
account creation before pairing additional clients.

## Native MVP Endpoint Set

The first official client slice only needs:

| Need | Endpoint |
| --- | --- |
| Verify server | `GET /api/health` |
| Pair or log in | Future pairing endpoint, then `GET /api/auth/me` |
| List conversations | `GET /api/conversations` |
| Open conversation | `GET /api/conversations/:id` |
| Send chat | `POST /api/chat` |
| Select bot | `GET /api/bots` |
| Read settings | `GET /api/settings`, `GET /api/models` |

Everything else can remain web-only until the native experience proves the
server discovery, pairing, and chat loop on a real device.

## Security Invariants

- Native clients must not write directly to SQLite or Qdrant.
- Native clients must not bypass provider gates. LOCAL and ONLINE behavior stays
  enforced in the server.
- Session tokens must be revocable server-side.
- Pairing codes must be short-lived and single-use.
- Manual server URL entry must clearly identify the server before storing a
  long-lived session.
