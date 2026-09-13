# Setup and Deployment

## One-time setup

1. **Create a Notion internal integration** at
   https://www.notion.so/profile/integrations, signed in as the personal
   workspace's owner. This produces a server-to-server **Internal Integration
   Secret** — a different kind of credential from the interactive MCP/OAuth
   connection a chat session uses; the standalone service needs its own.
2. **Share the "🧠 Second Brain" page with that integration** — open the page
   in Notion → `•••` menu → **Connections** → add the integration. Without
   this, every API call 404s/403s even with a valid key, because an internal
   integration only sees pages explicitly shared with it.
3. **Get an API key for your LLM of choice.** Defaults to Anthropic
   (https://console.anthropic.com/); any OpenAI-compatible provider works too
   — see [`02-architecture.md`](./02-architecture.md) section 5.
4. **Configure environment**:
   ```
   cp .env.example .env
   ```
   Fill in `NOTION_API_KEY` plus your LLM credentials (`ANTHROPIC_API_KEY` by
   default, or `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY`/`LLM_BASE_URL` for
   another provider). Adjust `DIGEST_CRON` / `HYGIENE_CRON` / `LINKEDIN_CRON`
   if you want different timing (standard crontab syntax, evaluated in the
   host machine's local time).
5. **Install and run**:
   ```
   npm install
   npm run dev      # console + scheduler, restarts on file changes
   # or: npm start   # console + scheduler, no watch
   ```
   Open `http://localhost:4173` (or your configured `PORT`).

`config.ts`'s `required()` helper throws immediately with
`Missing required env var: X` if either API key is absent — this is
intentional fail-fast behavior, not a bug, so a misconfigured `.env` is
obvious at startup rather than surfacing as a confusing 401 mid-job.

## Day-to-day capture

Drop anything into the **Inbox** database — any of these create an Inbox row:
- Notion mobile app's quick-add, pointed at Inbox.
- Notion's Web Clipper browser extension, pointed at Inbox.
- Typing directly into Inbox in the Notion app/web.
- Chatting with Claude (or another MCP-capable AI tool) that has access to the
  same workspace — ask it to save something, it creates the row directly.

## Running the jobs

From the console, the top buttons trigger each job on demand (Organize Inbox,
Run Digest, Run Hygiene Pass, Draft Portfolio Blurbs, Draft LinkedIn Posts).
The scheduler additionally runs Digest/Hygiene/Portfolio/LinkedIn
automatically per the cron expressions in `.env` — but **only while the
process is running**.

## Why this needs an always-on host eventually

Scheduled ("weekly") jobs only fire if the Node process is alive at the
scheduled moment. Running `npm run dev`/`npm start` on a personal laptop means
"weekly" jobs silently slip whenever the laptop is off or asleep at that hour.
The code has no dependency on anything Windows- or local-machine-specific, so
moving it to an always-on host is a pure deployment change — no code changes
required.

## Moving the project to another machine (e.g. a home server)

If you're relocating the project — for example to an always-on home server
reachable over your LAN — from a machine that **is** on that LAN (this
service itself typically doesn't have outbound access to a private/home
network, so the transfer has to originate from somewhere that does):

```powershell
# 1. Zip the project, excluding node_modules/dist (rebuilt on the target)
cd "C:\Users\HP\Music\code"
Compress-Archive -Path "organize-notion-personal-agent" -DestinationPath "second-brain-agent.zip" -Force

# 2. Copy it over (adjust user@host for your target)
scp second-brain-agent.zip <user>@<host>:~/

# 3. SSH in and unpack
ssh <user>@<host>
  unzip second-brain-agent.zip
  cd organize-notion-personal-agent
  npm install
  cp .env.example .env   # then edit with real keys directly on the target —
                          # don't paste secrets into a chat session
  npm run dev
```

`.env` itself can be `scp`'d separately if it already has real keys filled in
— `scp` is already end-to-end encrypted and under your direct control, so
that's safe; just never paste real API keys into a chat conversation.

Once running on the target host, the console is reachable at
`http://<host-ip>:4173` from any device on that LAN, and the scheduler keeps
firing as long as that host stays on.

## Verifying a deployment

- Confirm the process started cleanly (`[scheduler] jobs scheduled: {...}`
  logged on startup — see `src/scheduler.ts`).
- Open the console and run each job once by hand to confirm Notion
  connectivity (a fast way to catch a missing/wrong `NOTION_API_KEY` or a page
  that wasn't shared with the integration — see step 2 above).
- Seed a few Inbox rows spanning different triage categories (a link, a diary
  reflection, a fleeting idea, a concrete task, a domain note) and run
  **Organize Inbox** to confirm end-to-end filing before relying on the
  schedule unattended.
