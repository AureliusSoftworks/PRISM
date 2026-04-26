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
| Pairing | `POST /api/pairing/codes`, `POST /api/pairing/exchange` |
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

Implemented rules:

- Cookie sessions remain the browser/web contract.
- Bearer sessions are for native clients and are stored in the Keychain.
- Protected routes accept either the existing cookie token or the bearer token,
  resolving both through the same `sessions` table. Bearer takes precedence if
  both are supplied.
- Logout should invalidate the server-side session token regardless of transport.
- CORS allows `authorization` for browser-based mobile-auth testing.

## Readiness Endpoint

`GET /api/health` returns mobile readiness metadata. `ok` and `uptime` remain
available for older health checks.

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
    "qdrant": "configured",
    "ollama": "configured",
    "openai": "not_configured"
  }
}
```

The iOS/Mac app should treat `ok: true` as "the server process is reachable"
and inspect `services` to show more specific setup guidance. `serverName` comes
from `PRISM_SERVER_NAME` and defaults to `Prism Server`.

## Local-Network Discovery

Prism Server should advertise itself on the LAN so a freshly installed client
can find it without requiring the user to type an IP address.

Implemented discovery channel:

- Bonjour/mDNS service type: `_prism._tcp.`
- Service name: `PRISM_SERVER_NAME`, such as `Jared's Prism`
- Port: API port, normally `8787` for direct API access
- TXT records:
  - `api=1`
  - `version=0.1.0`
  - `pairing=required`
  - `tls=optional`

Prism Server advertises this service when `PRISM_DISCOVERY_ENABLED=true`.
Discovery is intended for native/bare-metal server runs. Default Docker bridge
networking may not propagate mDNS advertisements to the LAN, so native clients
must keep manual URL entry as a fallback.

The client onboarding flow should request Local Network permission before
scanning. Manual server URL entry remains required for custom hosts, remote
hosts, VPN setups, or discovery failure.

## Pairing Flow

Pairing should feel like connecting a trusted local device, not signing into a
cloud account.

Target flow:

1. Prism Server displays a short-lived pairing code and QR code.
2. The iOS/Mac client discovers the server or accepts a manual URL.
3. The authenticated web/server session calls `POST /api/pairing/codes` to
   create a short-lived code.
4. The client sends the pairing code to `POST /api/pairing/exchange`.
5. The server validates the code, creates a normal session row, and returns a
   bearer session token plus the authenticated user profile.
6. The client stores the token in the Keychain and uses it for future requests.

Pairing code creation:

```http
POST /api/pairing/codes
Cookie: localai_session=<web-session>
```

The first web surface for this is the authenticated Settings drawer's
"Pair a device" section. It generates a code-only pairing credential; QR
display remains a later client-polish step.

Response:

```json
{
  "ok": true,
  "pairingCode": {
    "code": "ABCD-EFGH-JKLM",
    "expiresAt": "2026-01-01T00:05:00.000Z"
  }
}
```

Pairing exchange:

```http
POST /api/pairing/exchange
Content-Type: application/json
```

Request:

```json
{
  "code": "ABCD-EFGH-JKLM"
}
```

Response:

```json
{
  "ok": true,
  "token": "<session-token>",
  "expiresAt": "2026-01-02T00:00:00.000Z",
  "user": {
    "id": "<user-id>",
    "email": "user@example.com",
    "displayName": "User",
    "role": "user",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "theme": "system",
    "preferredProvider": "local"
  }
}
```

The device starts with no local Prism account. Accounts remain server-owned.
If the server has not been configured yet, the server app should handle first
account creation before pairing additional clients.

## Native MVP Endpoint Set

The first official client slice only needs:

| Need | Endpoint |
| --- | --- |
| Verify server | `GET /api/health` |
| Pair or log in | `POST /api/pairing/exchange`, then `GET /api/auth/me` |
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
