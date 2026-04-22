# LocalAI ChatGov

Local-first, multi-user chat workspace hosted on your Windows machine and accessible across your LAN. Per-user isolation, encrypted memory, customizable chatbots, OpenAI image generation, and conversation export — all running headless via Docker Compose.

## Architecture

```
[Phone/Desktop] → Nginx (:80) → Frontend (:3000) + API (:8787)
                                          │
                              ┌────────────┼────────────┐
                              │            │            │
                          SQLite      Qdrant       Ollama (host)
                       (users, chats,  (vector      (local LLM)
                        memories,      memory
                        exports)       search)
```

## Quick Start (Docker)

```bash
# 1. Clone/copy repo to your Windows host
# 2. Create .env from example
cp .env.example .env
# Edit .env with your secrets (ENCRYPTION_MASTER_KEY, OPENAI_API_KEY, etc.)

# 3. Start everything
docker compose up -d

# 4. Access from any device on your network
# http://<windows-hostname-or-ip>
```

## Quick Start (Dev / Mac)

```bash
cd /Users/jared/Documents/LocalAI-local
cp .env.example .env
npm install --prefix packages/shared
npm install --prefix packages/config
npm install --prefix apps/api
npm install --prefix apps/web
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `8787` | API server port |
| `SESSION_COOKIE_NAME` | `localai_session` | Session cookie key |
| `SESSION_TTL_HOURS` | `24` | Session lifetime |
| `ENCRYPTION_MASTER_KEY` | (dev default) | Master key for per-user key wrapping |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Default local model |
| `OPENAI_API_KEY` | (empty) | Global fallback OpenAI key |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector DB URL |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | Frontend API base |

## Features

- **Per-user auth** with encrypted session cookies
- **Strict data isolation** — every query is tenant-scoped by `user_id`
- **Customizable chatbots** with system prompts, temperature, and model overrides
- **Forkable chats** — branch from any message in a conversation
- **Incognito mode** — no memories saved for the session
- **Automatic memory** — extracts user preferences and stores them encrypted
- **Qdrant vector retrieval** — semantic memory search across summarized conversations
- **OpenAI image generation** (DALL-E 3) with gallery
- **Conversation export** to Markdown files persisted in the database
- **Mobile-first UI** — responsive chat interface with slide-out sidebar
- **Dark/light themes** per user
- **Self-serve account deletion** from Settings
- **Automatic 60-day inactive account cleanup**

## Windows Headless Startup

### Option A: Docker Desktop auto-start (recommended)
Docker Desktop can be configured to start at login and auto-start compose stacks.

### Option B: Scheduled Task
Run `scripts/windows-install-startup-task.ps1` as Administrator to register a task that starts the stack at login.

### Option C: Manual
Place a shortcut to `scripts/windows-startup.bat` in `shell:startup`.

## Backup & Restore

### SQLite
```bash
# Export
docker compose cp api:/app/apps/api/data/localai.db ./backup-localai.db

# Restore
docker compose cp ./backup-localai.db api:/app/apps/api/data/localai.db
docker compose restart api
```

### Qdrant
```bash
# Qdrant data lives in the `qdrant_data` Docker volume
docker run --rm -v localai-local_qdrant_data:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Failed to fetch" on frontend | Ensure API container is running: `docker compose logs api` |
| Ollama not responding | Verify Ollama is running on host and `OLLAMA_HOST` is correct |
| Can't access from phone | Check Windows firewall allows port 80 inbound |
| Qdrant connection refused | `docker compose logs qdrant` — may need to recreate volume |
| Login works but chat fails | Check `ENCRYPTION_MASTER_KEY` matches between restarts |

## Testing

```bash
npm run test --prefix apps/api    # Unit tests
npm run lint --prefix apps/api    # TypeScript lint
npm run lint --prefix apps/web    # ESLint
```

## Future

- Bot-to-bot sandbox conversations
- Streaming token responses
- Cloud backup adapters (S3/R2)
- Richer profile and role system
