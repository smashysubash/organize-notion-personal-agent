# Documentation Index

This folder explains what the Second Brain Agent is, how it's built, and how each
part works internally. The top-level `README.md` (repo root) is the quick-start —
these docs go deeper.

Read in this order if you're new to the project:

1. [`01-overview.md`](./01-overview.md) — what the system is, the problem it solves, the core idea.
2. [`02-architecture.md`](./02-architecture.md) — how the pieces (Notion, agent service, LLM, console) fit together and why they're separated this way.
3. [`03-data-model.md`](./03-data-model.md) — every Notion database, its properties, and how they relate to each other (the graph).
4. [`04-inbox-triage.md`](./04-inbox-triage.md) — how a raw dumped thought/link/task gets classified and filed.
5. [`05-periodic-jobs.md`](./05-periodic-jobs.md) — the Digest, Hygiene Pass, Portfolio Drafting, and LinkedIn Draft jobs, in detail.
6. [`06-web-console-and-api.md`](./06-web-console-and-api.md) — the review console UI and the HTTP API behind it.
7. [`07-efficiency-and-caching.md`](./07-efficiency-and-caching.md) — every token/cost/API-call reduction technique actually implemented, and why.
8. [`08-setup-and-deployment.md`](./08-setup-and-deployment.md) — one-time setup, running locally, and moving to an always-on host.

The [`SECOND_BRAIN_PLAYBOOK.md`](../SECOND_BRAIN_PLAYBOOK.md) at the repo root is
the single source of truth for the *rules* (classification logic, job behavior,
boundaries) in host-neutral language — it's loaded verbatim as the LLM's system
prompt, and is also meant to be handed to any other AI tool (Claude Code chat,
Claude.ai, Antigravity, etc.) that has access to the same Notion workspace. These
docs explain the *system* that implements those rules; the Playbook is the rules
themselves.
