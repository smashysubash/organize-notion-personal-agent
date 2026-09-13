# Architecture

## High-level diagram

```
  Capture channels                         Scheduled jobs (node-cron, in-process)
  ─────────────────                        ───────────────────────────────────
  Notion app/mobile ─┐                     Digest    (weekly, DIGEST_CRON)
  Web Clipper ────────┼──▶  INBOX (Notion) Hygiene   (weekly, HYGIENE_CRON)
  Chat AI w/ MCP ──────┘    Status=        Portfolio (piggybacks Hygiene's cron)
                            Unprocessed     LinkedIn  (weekly, LINKEDIN_CRON)
                                 │                       │
                                 │                       │
                                 ▼                       ▼
                       ┌────────────────────────────────────┐
                       │           AGENT SERVICE             │
                       │        (Node.js + TypeScript)       │
                       │                                      │
                       │  src/notion/client.ts  — REST wrapper│
                       │  src/llm/client.ts     — LLM calls   │
                       │  src/jobs/*.ts         — job logic   │
                       │  src/scheduler.ts      — node-cron    │
                       │  src/server/app.ts     — Express API │
                       └───────────────┬──────────────────────┘
                                       │ reads/writes via REST
                                       ▼
        ┌───────────────────────────────────────────────────────────┐
        │                     NOTION WORKSPACE                       │
        │  Inbox · Projects(+Goals) · Areas · Resources · Ideas Vault │
        │  Daily Journal · Topics (graph hub) · Suggestions (review Q)│
        │  + native formula/chart stats — zero LLM cost               │
        └───────────────────────────────────────────────────────────┘
                                       ▲
                                       │ approve / dismiss / trigger job
                            ┌──────────┴───────────┐
                            │      WEB CONSOLE      │  static HTML/CSS/JS,
                            │  (served by the same  │  served by Express,
                            │     Express process)  │  talks to /api/*
                            └───────────────────────┘
```

## The pieces, and why each exists

### 1. Notion — the only datastore

Every database (Inbox, Projects, Areas, Resources, Ideas Vault, Daily Journal,
Topics, Suggestions) lives in Notion. The agent service is stateless: it holds
no local database, no cache of records between runs (only some in-process,
per-run caches — see [`07-efficiency-and-caching.md`](./07-efficiency-and-caching.md)).
This means:

- You can inspect or hand-edit anything at any time, in the Notion app itself.
- There's nothing to migrate or back up beyond what Notion already backs up.
- Any other AI tool with access to the same workspace (Claude Code chat,
  Claude.ai, Antigravity, ...) can read/write the exact same data.

### 2. `src/notion/client.ts` — a hand-rolled REST wrapper, not the official SDK

The service talks to Notion's HTTP API directly (`fetch` calls to
`https://api.notion.com/v1`) using API version `2025-09-03`, instead of the
`@notionhq/client` SDK. This was a deliberate choice: that Notion API version
introduced the newer **data sources** model (a database can now contain
multiple data sources), and writing the wrapper by hand gives exact control
over the request/response shapes (`/data_sources/{id}/query`,
`/pages`, `/blocks/{id}/children`, `/search`) without waiting on SDK type
coverage for the newer endpoints.

Functions provided: `queryDataSource` (auto-paginating query), `createPage`,
`updatePage`, `retrievePage`, `trashPage` (soft-delete via `in_trash: true`),
`appendBlocks`, `retrieveBlockChildren` (auto-paginating), `search`.

### 3. `src/notion/props.ts` — property value builders/parsers

Notion's REST API represents a property value as a small JSON object whose
shape depends on the property type (e.g. a title is
`{ title: [{ type: "text", text: { content: "..." } }] }`, a checkbox is
`{ checkbox: true }`). `props.ts` centralizes building these (`title()`,
`richText()`, `select()`, `multiSelect()`, `checkbox()`, `url()`, `date()`,
`relation()`) and parsing them back out (`plainText()`, `selectName()`, etc.),
so job code never touches raw Notion JSON shapes directly. It also has
`markdownToBlocks()`, a minimal Markdown→Notion-blocks converter (paragraphs,
`#`/`##` headings, `-`/`*` bullets) used whenever an LLM-generated body needs
to become page content.

### 4. `src/notion/topics.ts` — the Topics graph resolver

Topics are the shared tag/relation hub. Instead of one search-or-create call
per topic name per item (expensive and slow at any real volume), `topics.ts`
bulk-loads every Topic once per job run into an in-memory
`Map<lowercase name, page id>` (`loadTopicIndex()`), then `resolveTopic()` /
`resolveTopics()` do a local, case-insensitive lookup and only call Notion to
create a page when a name genuinely doesn't exist yet — updating the in-memory
index immediately so a second occurrence of the same new topic within the same
run doesn't create a duplicate.

### 5. `src/llm/client.ts` — a pluggable LLM client, not a Claude-only one

Loads `SECOND_BRAIN_PLAYBOOK.md` from disk once at process startup and sends
it as the **system prompt** on every LLM call. Two entry points used by every
job, provider-neutral:

- `askLLM(prompt, maxTokens)` — returns raw text.
- `askLLMJSON<T>(prompt, maxTokens)` — appends a "respond with ONLY valid
  JSON" instruction, strips a stray ```` ```json ```` fence if the model added
  one anyway, and `JSON.parse`s the reply. Used wherever a job needs
  structured output (classifications, hygiene-merge decisions, LinkedIn draft
  objects).

Behind those two functions is a small `LLMProvider` interface with two
implementations, selected by `LLM_PROVIDER` in `.env`:

- **`AnthropicProvider`** (default) — uses `@anthropic-ai/sdk` directly,
  marking the Playbook system-prompt block
  `cache_control: { type: "ephemeral" }` so Anthropic's prompt cache avoids
  re-billing the full Playbook on every one of the many calls a job run
  makes. Model defaults to `claude-sonnet-5`, overridable via `LLM_MODEL`.
- **`OpenAICompatibleProvider`** — a plain `fetch` to
  `{LLM_BASE_URL}/chat/completions`, the wire format shared by OpenAI itself,
  Ollama, Groq, OpenRouter, Together, LM Studio, vLLM, Azure OpenAI, etc. No
  extra SDK dependency — same "hand-rolled REST wrapper" approach already
  used for the Notion client (see below). Requires `LLM_MODEL`; `LLM_BASE_URL`
  defaults to `https://api.openai.com/v1`; `LLM_API_KEY` is optional since
  many local backends don't check one.

Switching providers is purely a `src/config.ts` / `.env` concern
(`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL`) — job code never
references a provider or model name directly.

### 6. `src/jobs/*.ts` — the actual business logic

Each job is a plain async function, independently runnable from the CLI
(`npm run triage`, etc. — each file has an `if (import.meta.url === ...)`
block) or from the Express API. See
[`04-inbox-triage.md`](./04-inbox-triage.md) and
[`05-periodic-jobs.md`](./05-periodic-jobs.md) for what each one does.
`src/jobs/actions.ts` holds the **Approve/Dismiss** execution logic invoked by
the console.

### 7. `src/scheduler.ts` — node-cron wiring

Registers `runDigest`, `runHygienePass`, `runPortfolioDrafting` (on the same
schedule as hygiene), and `runLinkedInDrafts` against cron expressions from
`.env` (`DIGEST_CRON`, `HYGIENE_CRON`, `LINKEDIN_CRON`), each wrapped in a
`safeRun()` helper that logs and swallows errors so one job's failure can't
crash the process or block the others. Inbox triage is **not** scheduled — it
stays on-demand (console button, CLI, or chat), matching the "capture is
zero-friction, filing is a deliberate action" split described in the overview.

### 8. `src/server/app.ts` + `src/server/public/` — the web console

A single Express app serves both the static console (`public/index.html`,
`style.css`, `app.js`) and a small JSON API (`/api/suggestions`,
`/api/suggestions/:id/approve`, `/api/suggestions/:id/dismiss`,
`/api/jobs/:name/run`). See
[`06-web-console-and-api.md`](./06-web-console-and-api.md) for the full API
surface and UI behavior.

### 9. `src/config.ts` — configuration and fixed IDs

Two exports:
- `config` — loaded from `.env` via a `required()` helper that throws loudly
  (`Missing required env var: X`) if `NOTION_API_KEY` or the active LLM
  provider's required key (`ANTHROPIC_API_KEY` by default) is absent, rather
  than failing silently later. Also holds `llm` (provider/model/key/base URL,
  see above), `port`, and the three cron schedule strings.
- `ids` — the fixed Notion data-source IDs for this specific workspace's
  Second Brain structure (hub page + all 8 databases), created once during
  initial setup. These aren't secrets, so they live in code, not `.env`.

## Why a standalone service instead of "just a chat skill"

The rules (`SECOND_BRAIN_PLAYBOOK.md`) are intentionally host-neutral so they
*could* be run by asking any MCP-capable AI chat to follow them by hand. But
day-to-day, this project runs as a real backend service because two of its
requirements can't be satisfied by a chat session alone:

- **Scheduled jobs** need something running continuously, independent of
  whether a chat window happens to be open (see
  [`08-setup-and-deployment.md`](./08-setup-and-deployment.md) for the
  always-on-host discussion).
- **A review console** needs a persistent HTTP server to serve the UI and
  back it with an API, which a chat session doesn't provide.

The Playbook stays the shared brain either way — the service is simply the
primary, always-available executor of it.
