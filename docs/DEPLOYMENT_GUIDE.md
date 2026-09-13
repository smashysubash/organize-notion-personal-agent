# Coolify Deployment Guide — Second Brain Agent

Deploy the Second Brain Agent to Coolify on your LAN with NVIDIA or Groq free APIs.

---

## Prerequisites

- A machine on your LAN running 24/7 (Proxmox VM, Raspberry Pi 4+, old laptop, etc.)
- Coolify installed on that machine
- Git repository with this code pushed (GitHub, GitLab, Gitea, etc.)
- Notion internal integration created and shared with your "🧠 Second Brain" page

---

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Required
NOTION_API_KEY=secret_xxxxxxxxxxxx

# Choose ONE LLM provider:

# Option A: NVIDIA (Nemotron 3 Ultra, Llama 3.1 405B, etc.)
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi_xxxxxxxxxxxx
# LLM_MODEL=nvidia/nemotron-3-ultra  # optional, defaults to nemotron-3-ultra

# Option B: Groq (Llama 3.1 70B - fastest inference)
# LLM_PROVIDER=groq
# GROQ_API_KEY=gsk_xxxxxxxxxxxx
# LLM_MODEL=llama-3.1-70b-versatile  # optional

# Optional cron overrides (default: Monday mornings)
DIGEST_CRON="0 8 * * 1"
HYGIENE_CRON="0 9 * * 1"
LINKEDIN_CRON="0 10 * * 1"
```

### 2. Deploy to Coolify

1. **Create Application** in Coolify
   - Source: Your Git repo
   - Build Pack: **Dockerfile** (auto-detected)
   - Port: `4173`

2. **Add Environment Variables** in Coolify → Application → Environment:
   - Paste all variables from your `.env`

3. **Optional: Persistent Playbook Volume**
   - Coolify → Application → Volumes → Add:
     - Host: `/opt/second-brain/SECOND_BRAIN_PLAYBOOK.md`
     - Container: `/app/SECOND_BRAIN_PLAYBOOK.md`
     - Read-only: ✓

4. **Deploy**

### 3. Access

- Open `http://<coolify-lan-ip>:4173` from any LAN device
- Or add local DNS: `second-brain.local → <coolify-lan-ip>`

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
| `llama-3.1-70b-versatile` | 128k | Default, best quality |
| `llama-3.1-8b-instant` | 128k | Faster, lower quality |
| `mixtral-8x7b-32768` | 32k | Good alternative |
| `gemma2-9b-it` | 8k | Small, fast |

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