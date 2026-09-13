# Overview

## The problem

Capturing a thought, a link, or a diary entry should take zero friction — but
organizing it (deciding where it belongs, tagging it, connecting it to related
ideas) takes effort most people skip. Over time that produces either a messy
pile (unusable) or an over-engineered manual system (abandoned because it's too
much work to maintain).

## The idea

Split capture from organizing:

- **Capture** stays trivially easy: drop anything — a thought, a pasted link, a
  quick task — into a single **Inbox** database in Notion. No decisions required
  at capture time.
- **Organizing** is done by an agent: a small backend service reads the Inbox,
  asks an LLM to classify each item against a fixed set of rules, and
  files it into the right place — automatically summarizing links, appending to
  the day's journal, linking related ideas, tagging topics.
- **Review, not blind trust**: for anything higher-stakes than filing (merging
  two topics, publishing a portfolio blurb, suggesting a LinkedIn post), the
  agent doesn't just do it — it writes a **suggestion** into a review queue, and
  a lightweight web console lets you Approve or Dismiss it with one click.

Notion remains the single source of truth for all data. The agent service holds
no database of its own — it's stateless business logic that reads and writes
Notion via its API, plus a thin review UI in front of the parts that need human
sign-off.

## What it actually does, end to end

1. You dump something into **Inbox** (via Notion itself, its mobile app, its Web
   Clipper, or by asking a chat AI with Notion access to save something for you).
2. You click **Organize Inbox** in the console (or a scheduled/chat-driven run
   does it). The agent classifies each unprocessed item and files it into
   **Resources**, **Daily Journal**, **Ideas Vault**, **Projects**, or **Areas**,
   resolving **Topics** (a shared tag graph) as it goes.
3. On a schedule (or on demand), four more jobs run:
   - **Digest** — a short "what happened since last time" summary.
   - **Graph Hygiene Pass** — finds likely-duplicate Topics and orphaned Ideas,
     proposes fixes.
   - **Portfolio Auto-Drafting** — writes case-study blurbs for anything you've
     flagged `Shareable`.
   - **LinkedIn Draft Suggestions** — drafts 1–3 post ideas from what you've
     captured recently (never posts anything itself).
4. Each of those writes into a **Suggestions** database. The web console shows
   pending suggestions; **Approve** executes the underlying action (merge two
   topics, copy a blurb onto its source page), **Dismiss** just closes it out.
5. You can still browse and edit everything directly in Notion at any time —
   the agent never locks you out of your own data.

## Design principles behind the decisions

- **Notion is the only datastore.** No separate database/vector store to keep in
  sync or lose. Anything the agent does is visible and editable in Notion.
- **Host-agnostic rules.** The classification and job logic lives in one
  document (`SECOND_BRAIN_PLAYBOOK.md`), not hardcoded assumptions about one
  vendor's tool names — so the same rules can be executed by this service, by
  Claude Code chat, or by any other MCP-capable AI with access to the workspace.
- **Human approval for anything irreversible or public-facing.** Filing into
  Inbox destinations happens automatically (low stakes, easy to fix by hand
  later); merging graph nodes, publishing a portfolio blurb, or suggesting a
  public LinkedIn post always goes through the Suggestions review queue first.
- **Never touch LinkedIn's API.** LinkedIn drafts are copy/paste only — see
  [`05-periodic-jobs.md`](./05-periodic-jobs.md) for why.
- **Cost-aware by default.** Batched reads/writes, bulk topic loading, capped
  output lengths, and prompt caching (when using the Anthropic provider) are
  baked into the jobs from the start rather than bolted on later — see
  [`07-efficiency-and-caching.md`](./07-efficiency-and-caching.md).
- **Not locked to one LLM vendor.** `src/llm/client.ts` is a small provider
  abstraction — Anthropic by default, or any OpenAI-compatible backend
  (OpenAI, Ollama, Groq, OpenRouter, local models, ...) via `.env`, with no
  job code changes needed either way.
