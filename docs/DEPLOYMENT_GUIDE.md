# Deployment Guide — Second Brain Agent

Deploy the Second Brain Agent using Docker Compose locally or via Coolify on your LAN/server.

---

## Prerequisites

- A machine running 24/7 (Local server, Proxmox VM, Raspberry Pi 4+, Linux host, etc.)
- Docker & Docker Compose installed (or Coolify)
- Notion internal integration created and shared with your **🧠 Second Brain** page
- LLM API key (NVIDIA, Groq, Anthropic, or OpenAI)

---

## Environment Configuration

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

```bash
# Required Notion Secret
NOTION_API_KEY=secret_xxxxxxxxxxxx

# Choose ONE LLM provider:

# Option A: NVIDIA (Nemotron 3 Ultra, Llama 3.1 405B, etc.)
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi_xxxxxxxxxxxx
# LLM_MODEL=nvidia/nemotron-3-ultra  # optional, defaults to nemotron-3-ultra

# Option B: Groq (Fastest inference)
# LLM_PROVIDER=groq
# GROQ_API_KEY=gsk_xxxxxxxxxxxx
# LLM_MODEL=qwen/qwen3.8-27b  # optional, defaults to qwen/qwen3.8-27b

# Optional cron overrides (default: Monday mornings)
DIGEST_CRON="0 8 * * 1"
HYGIENE_CRON="0 9 * * 1"
LINKEDIN_CRON="0 10 * * 1"
PORT=4173
```

---

## Method 1: Local Docker Compose (Direct from Repo)

Deploy directly on your local machine / server from this repository folder:

### 1. Build and Run in Detached Mode
```bash
docker compose up -d --build
```

### 2. View Logs
```bash
docker compose logs -f
```

### 3. Management Commands
- **Stop**: `docker compose down`
- **Restart**: `docker compose restart`
- **Rebuild after updates**: `docker compose up -d --build`

### 4. Access
- Open `http://localhost:4173` (or `http://<your-host-ip>:4173`) from your browser.

---

## Method 2: Deploy Pre-built Image on Coolify (Recommended — Zero Server Build Time)

The repository includes a GitHub Actions CI/CD workflow that automatically builds multi-arch Docker images (`linux/amd64` and `linux/arm64`) and publishes them to **GitHub Container Registry (GHCR)** on every push to `main` or version tag release.

### 1. In Coolify, Create a Docker Image Resource
1. Go to your Project / Environment in Coolify.
2. Click **+ Add Resource** → **Docker Image**.
3. Set **Image Name**:
   ```
   ghcr.io/smashysubash/organize-notion-personal-agent:latest
   ```
   *(Or specify a pinned version tag like `:v0.1.0`)*
4. Set **Port**: `4173`.

> [!NOTE]
> If your GitHub repository / package is **private**, add GHCR credentials in Coolify:
> - **Coolify** → **Sources / Registries** → **+ Add Registry** → **Custom/GitHub Container Registry**.
> - Server: `ghcr.io`
> - Username: your GitHub username
> - Password: a GitHub Personal Access Token (PAT) with `read:packages` scope.

### 2. Configure Environment Variables
In Coolify → Application → **Environment**:
- Add your variables from `.env` (`NOTION_API_KEY`, `LLM_PROVIDER`, `NVIDIA_API_KEY` / `GROQ_API_KEY`, `PORT=4173`).

### 3. Deploy
- Click **Deploy**. Coolify pulls the pre-built image and starts the container in seconds.

---

## Method 3: Deploy Git Repository on Coolify (Build on Server)

1. **Create Application** in Coolify:
   - Source: Your Git repository (`smashysubash/organize-notion-personal-agent`)
   - Build Pack: **Dockerfile** (auto-detected)
   - Port: `4173`

2. **Add Environment Variables**:
   - Paste all variables from your `.env`.

3. **Deploy**:
   - Click **Deploy**.

---

## How to Create a Release & Publish New Images

Whenever you want to release a new version:

### 1. Using Git Tags (Automated GitHub Actions CI/CD)
```bash
# 1. Commit any recent changes
git add .
git commit -m "Release v0.1.0"
git push origin main

# 2. Create and push a version tag
git tag v0.1.0
git push origin v0.1.0
```

### 2. What GitHub Actions Does Automatically
- Compiles TypeScript and packages production dependencies.
- Builds multi-arch Docker images for both `linux/amd64` (x86 servers, VPS, Proxmox) and `linux/arm64` (Raspberry Pi, Apple Silicon, ARM VPS).
- Publishes images to `ghcr.io/smashysubash/organize-notion-personal-agent:v0.1.0` and `ghcr.io/smashysubash/organize-notion-personal-agent:latest`.
- Creates a GitHub Release with auto-generated changelog notes.

### 3. Update Coolify
In Coolify, simply click **Redeploy** on your application to pull the newest image tag.

---

## LLM Provider Comparison

| Provider | Command | Models | Speed | Best For |
|----------|---------|--------|-------|----------|
| **NVIDIA** | `LLM_PROVIDER=nvidia` | Nemotron 3 Ultra, Llama 3.1 405B/70B, Mistral Large 2 | Good | Reasoning quality, variety |
| **Groq** | `LLM_PROVIDER=groq` | Llama 3.1 70B/8B, Mixtral, Gemma 2 | **Fastest** | Speed, high throughput |
| **OpenAI-compatible** | `LLM_PROVIDER=openai` | Any (Ollama, OpenRouter, Together, etc.) | Varies | Custom/self-hosted |

### NVIDIA Models (free at build.nvidia.com)
| Model ID | Context | Notes |
|----------|---------|-------|
| `nvidia/nemotron-3-ultra` | 4k | Default, strong reasoning |
| `nvidia/nemotron-4-340b-instruct` | 4k | Larger, higher quality |
| `meta/llama-3.1-405b-instruct` | 128k | Meta's largest |
| `meta/llama-3.1-70b-instruct` | 128k | Faster, still strong |
| `mistralai/mistral-large-2-instruct` | 128k | Good alternative |

### Groq Models (free at console.groq.com)
| Model ID | Context | Notes |
|----------|---------|-------|
| `qwen/qwen3.8-27b` | 128k | Default, fast & high quality instruction following |
| `openai/gpt-oss-120b` | 128k | Large open-weights reasoning model |
| `openai/gpt-oss-20b` | 128k | Fast open-weights model |
| `qwen/qwen3.6-27b` | 128k | Good alternative |

---

## LAN-Only Coolify Configuration

### Disable Public Exposure

1. **Coolify → Settings → General**
   - **Public Domain**: Leave empty
   - **Force HTTPS**: `false`

2. **Coolify → Settings → Proxy (Traefik)**
   - Traefik binds to `0.0.0.0:80/443` but only LAN reaches it
   - No Let's Encrypt certificates issued

### Access via LAN IP

```
http://192.168.1.50:4173    # Coolify host LAN IP
```

### Optional: Local DNS

**Pi-hole / AdGuard Home / Router DNS:**
```
second-brain.local  →  192.168.1.50
```

**Or `/etc/hosts` on each machine:**
```
192.168.1.50  second-brain.local
```

Then access: `http://second-brain.local:4173`

### Optional: Coolify Auth

Coolify → Application → Settings → **Authentication**
- Enable **Coolify Auth** (OIDC/GitHub/Generic OAuth)
- Adds login page before app loads

---

## Notion Setup (Required)

### 1. Create Internal Integration
1. Go to https://www.notion.so/profile/integrations
2. **New integration** → Name: "Second Brain Agent"
3. Workspace: Your personal workspace
4. Copy **Internal Integration Secret** → `NOTION_API_KEY`

### 2. Share Second Brain Page
1. Open your "🧠 Second Brain" page in Notion
2. `•••` menu → **Connections** → Add "Second Brain Agent"
3. Without this, API calls return 404/403

---

## Verification Checklist

After deployment, verify:

- [ ] Console loads at `http://<lan-ip>:4173`
- [ ] Logs show: `[scheduler] jobs scheduled: { digest: ..., hygiene: ..., linkedin: ... }`
- [ ] Click **"Organize Inbox"** → creates Suggestions in Notion
- [ ] Check Notion → Suggestions database → rows appear with `Status = Pending`
- [ ] Click **Approve** on a suggestion → executes action in Notion

---

## Troubleshooting

### "Missing required env var: NOTION_API_KEY"
- Add `NOTION_API_KEY` in Coolify Environment variables
- Redeploy

### "LLM request failed (401): Invalid API key"
- Verify `NVIDIA_API_KEY` or `GROQ_API_KEY` is correct
- Check key has not expired

### "Notion API ... failed (403): Forbidden"
- Share the "🧠 Second Brain" page with the integration
- Wait ~30 seconds for Notion to propagate permissions

### Scheduler not running
- Check Coolify logs for `startScheduler()` call
- Ensure container stays running (restart policy: `unless-stopped`)

### Port already in use
- Change `PORT` in env vars (e.g., `4174`)
- Update Coolify Application → Port to match

---

## Updating

```bash
# Push changes to Git
git add .
git commit -m "Update"
git push

# In Coolify: Application → Deploy
```

Or enable **Auto Deploy** in Coolify → Application → Settings.

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────┐
│  Coolify Host (LAN)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Traefik Proxy (HTTP only, LAN only)                │    │
│  │  Port 80 → Container 4173                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  second-brain-agent container                       │    │
│  │  - Node.js 22 Alpine                                │    │
│  │  - Express server + node-cron scheduler             │    │
│  │  - Notion API (data sources)                        │    │
│  │  - LLM: NVIDIA / Groq / OpenAI-compatible           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (builder → runtime) |
| `docker-compose.yml` | Local dev with `docker compose up` |
| `src/config.ts` | Provider presets: `nvidia`, `groq`, `anthropic`, `openai` |
| `SECOND_BRAIN_PLAYBOOK.md` | System prompt for all LLM calls |
| `.env.example` | Template for environment variables |

---

## Support

- **Issues**: https://github.com/your-repo/issues
- **Notion API**: https://developers.notion.com
- **NVIDIA API**: https://build.nvidia.com
- **Groq API**: https://console.groq.com
- **Coolify Docs**: https://coolify.io/docs