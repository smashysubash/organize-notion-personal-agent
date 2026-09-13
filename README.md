# Second Brain Agent

A standalone agent service + lightweight web console that organizes a personal Notion "Second Brain" (Inbox → Projects/Areas/Resources/Ideas Vault/Daily Journal, linked through a Topics graph), and proactively drafts a weekly digest, graph-hygiene fixes, portfolio writeups, and LinkedIn post ideas for review.

See `SECOND_BRAIN_PLAYBOOK.md` for the full rules this agent (and any other AI tool you point at the same Notion workspace) follows.

## One-time setup

1. **Create a Notion internal integration**
   - Go to https://www.notion.so/profile/integrations, sign in as the personal workspace's owner.
   - "New integration" → name it (e.g. "Second Brain Agent") → workspace = your personal one.
   - Copy the **Internal Integration Secret**.
2. **Share the Second Brain page with it**
   - Open the "🧠 Second Brain" page in Notion → `•••` menu → **Connections** → add the integration you just created. Without this step the API calls below will 404/403 even with a valid key, since the integration only sees pages explicitly shared with it.
3. **Get an API key for your LLM of choice.** Defaults to Anthropic (https://console.anthropic.com/), but any OpenAI-compatible provider works too — see below.
4. **Configure environment**
   ```
   cp .env.example .env
   ```
   Fill in `NOTION_API_KEY` plus your LLM credentials (`ANTHROPIC_API_KEY` by default, or `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY`/`LLM_BASE_URL` for another provider — see "Using a different LLM" below). Adjust the `*_CRON` schedules if you want different timing (crontab syntax, evaluated in the machine's local time).
5. **Install and run**
   ```
   npm install
   npm run dev      # console + scheduler, restarts on file changes
   # or: npm start   # console + scheduler, no watch
   ```
   Open http://localhost:4173 (or your configured `PORT`).

## Day-to-day capture

Drop anything into the **Inbox** database in Notion — a thought, a pasted link, a quick task. Any of these work, they all just create an Inbox row:
- Notion mobile app's quick-add, pointed at the Inbox database.
- Notion's Web Clipper browser extension, pointed at the Inbox database.
- Typing directly into Inbox in the Notion app/web.
- Chatting with Claude (or another MCP-capable AI tool) that has access to the same Notion workspace — ask it to save something, and it can create the Inbox row directly.

## Running the jobs

From the console (http://localhost:4173), the top buttons trigger each job on demand:
- **Organize Inbox** — files every `Unprocessed` Inbox row into Resources/Projects/Areas/Ideas Vault/Daily Journal.
- **Run Digest**, **Run Hygiene Pass**, **Draft Portfolio Blurbs**, **Draft LinkedIn Posts** — same jobs the scheduler runs automatically, available on demand.

The scheduler (`src/scheduler.ts`) also runs Digest/Hygiene/Portfolio/LinkedIn automatically per the cron expressions in `.env` — but **only while this process is running**. For schedules to fire reliably regardless of whether your machine is on, deploy the service to a small always-on host later (a cheap VM or serverless cron); no code changes are needed for that, just a deployment target.

Every job writes into the **Suggestions** database. The console reads `Status = Pending` rows and lets you **Approve** (executes the action — e.g. a topic merge, or copying a portfolio blurb onto its source page) or **Dismiss** each one. Digests and LinkedIn drafts are informational — Approve on those just marks them reviewed; the agent never posts to LinkedIn on your behalf.

## Using a different LLM

The agent isn't tied to Claude — `src/llm/client.ts` supports multiple provider modes via `LLM_PROVIDER`:

- `LLM_PROVIDER=anthropic` (default) — uses Anthropic SDK directly (`ANTHROPIC_API_KEY` or `LLM_API_KEY`, model via `LLM_MODEL`, defaults to `claude-sonnet-5`). Gets Anthropic prompt caching on the Playbook system prompt.
- `LLM_PROVIDER=nvidia` — NVIDIA free API (Nemotron 3 Ultra, Llama 3.1 405B/70B, Mistral Large 2). Set `NVIDIA_API_KEY`, optionally `LLM_MODEL` (defaults to `nvidia/nemotron-3-ultra`). Free at https://build.nvidia.com
- `LLM_PROVIDER=groq` — Groq free API (Llama 3.1 70B/8B, Mixtral, Gemma 2). Set `GROQ_API_KEY`, optionally `LLM_MODEL` (defaults to `llama-3.1-70b-versatile`). Fastest inference at https://console.groq.com
- `LLM_PROVIDER=openai` — any OpenAI-compatible backend: OpenAI, Ollama, OpenRouter, Together, LM Studio, vLLM, Azure OpenAI, etc. Set `LLM_MODEL`, `LLM_BASE_URL` (defaults to `https://api.openai.com/v1`), `LLM_API_KEY` (or `OPENAI_API_KEY`).

No job code changes needed — every job calls provider-neutral `askLLM`/`askLLMJSON`.

## Coolify Deployment (LAN-only)

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for complete instructions deploying to Coolify on your local network with NVIDIA or Groq free APIs.

## Project layout

```
src/
  config.ts          fixed Notion data-source IDs + env loading
  notion/client.ts    thin REST wrapper (query/create/update/trash/search)
  notion/props.ts     Notion API property builders/parsers + markdown->blocks
  notion/topics.ts     Topics graph find-or-create + bulk-load
  llm/client.ts        pluggable LLM client (Anthropic or any OpenAI-compatible backend), Playbook loaded as system prompt
  jobs/triage.ts        Inbox triage
  jobs/digest.ts        weekly/on-demand digest
  jobs/hygiene.ts       topic-merge + orphaned-idea suggestions
  jobs/portfolio.ts     portfolio blurb drafting
  jobs/linkedin.ts      LinkedIn post-idea drafting (draft-only, never posts)
  jobs/actions.ts       Approve/Dismiss execution logic
  scheduler.ts          node-cron wiring
  server/app.ts          Express API
  server/public/         the web console (static HTML/CSS/JS)
```

## Known limitations (by design, for this version)

- Portfolio drafting runs on a periodic sweep, not an instant reaction to flipping `Shareable` — instant would need a Notion webhook subscription, not built here.
- LinkedIn drafts are never posted automatically — LinkedIn's API tightly restricts automated personal-profile posting, so this stays copy/paste.
- No vector store or separate index — retrieval relies on Notion's own search plus the Topics relation graph.
