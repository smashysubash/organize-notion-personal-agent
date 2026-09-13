# Data Model

Everything lives under one Notion hub page, **🧠 Second Brain**. Eight
databases, wired together mostly through one shared relation hub (**Topics**)
so cross-cutting queries ("everything about Sleep") are relation traversals,
not string/tag matching.

Fixed data-source IDs for all of these live in `src/config.ts` (`ids`).

## Topics — the graph hub

| Property | Type | Notes |
|---|---|---|
| Name | Title | Canonical topic, e.g. "Sleep", "Finance", "Career" |
| Description | Rich text | Optional |
| Related Projects / Areas / Resources / Ideas | Relation (dual) | One property per content database — the graph edges |

**Find-or-create, always.** Every job that needs to tag something with a topic
calls `loadTopicIndex()` (bulk-loads all Topics once, `src/notion/topics.ts`)
and then `resolveTopic(s)()`, which does a case-insensitive local lookup and
only creates a new Topic page if no match exists. This is what keeps the graph
from fragmenting into "Sleep" / "sleep" / "Sleep Hygiene" duplicates — though
duplicates can still drift in over time (different phrasing), which is exactly
what the **Graph Hygiene Pass** job (see
[`05-periodic-jobs.md`](./05-periodic-jobs.md)) exists to catch and fix.

## Inbox — zero-friction capture

| Property | Type | Notes |
|---|---|---|
| Name | Title | Raw captured text |
| Raw Type | Select | Thought · Link · File · Quick Task |
| Status | Select | Unprocessed · Processing · Filed |
| Source URL | URL | Optional |
| Captured At | Created time | Automatic |

Everything starts here. The Inbox triage job (`src/jobs/triage.ts`) only ever
touches rows where `Status = Unprocessed`, and sets `Status = Filed` once a row
has been routed somewhere — so re-running triage never reprocesses the same
item twice.

## Projects (includes Goals)

| Property | Type | Notes |
|---|---|---|
| Name | Title | |
| Status | Select | Not Started · Active · Blocked · Done · Archived |
| Horizon | Select | Short-term · Long-term (Goal) |
| Deadline | Date | Optional |
| Area | Relation → Areas | |
| Topics | Relation (dual) → Topics | |
| Shareable | Checkbox | Marks eligibility for Portfolio auto-drafting |
| Outcome | Rich text | |
| Portfolio Blurb | Rich text | Filled in by the Portfolio Drafting job on Approve |

A "Goal" is deliberately **not** a separate database — it's just a Project
with `Horizon = Long-term (Goal)`. This was a locked-in design decision to
avoid a redundant parallel structure for what's functionally the same kind of
row (a named thing with a status).

## Areas

| Property | Type | Notes |
|---|---|---|
| Name | Title | Health, Finance, Career, Relationships, Learning, etc. |
| Description | Rich text | |
| Related Projects | Relation (dual) → Projects | |
| Topics | Relation (dual) → Topics | |

Ongoing life domains with no end state — the "self-organizing" category from
the original requirements. Inbox items that read as an ongoing note (not a
one-off task) get attached here via `findOrCreateArea()` in `triage.ts`, which
caches all Areas in memory for the run to avoid a query per item.

## Resources — reference material

| Property | Type | Notes |
|---|---|---|
| Name | Title | |
| Type | Select | Article · Video · Book · Note · Link |
| Topics | Relation (dual) → Topics | |
| Source URL | URL | Optional |
| AI Summary | Rich text | 1-3 lines, written once at file-time |
| Related Area / Project | Relation | Optional |
| Shareable | Checkbox | Portfolio + LinkedIn-draft eligibility signal |
| Status | Select | Active · Archived |
| Portfolio Blurb | Rich text | Filled in by the Portfolio Drafting job on Approve |

When triage routes an Inbox item here, `fetchUrlText()` in `triage.ts` fetches
the URL's raw HTML, strips scripts/styles/tags, and truncates to 4000
characters before handing it to Claude for a capped 1-3 line summary — kept
short deliberately (see [`07-efficiency-and-caching.md`](./07-efficiency-and-caching.md)).

## Daily Journal — one page per day

| Property | Type | Notes |
|---|---|---|
| Date | Title/Date | One page per day |
| Mood | Select | Optional, currently unused by the agent (manual field) |
| Topics | Relation (dual) → Topics | Optional |
| Body | Page content | Freeform, append-only |

`findOrCreateTodayJournal()` in `triage.ts` looks up today's row by exact date
match before creating a new one, then diary-shaped Inbox items get appended as
a bullet via `appendBlocks` + `markdownToBlocks` — never overwriting the day's
existing content.

## Ideas Vault — atomic, Zettelkasten-style notes

| Property | Type | Notes |
|---|---|---|
| Name | Title | |
| Related Ideas | Relation (self, single property) → Ideas Vault | Backlinks between ideas |
| Related Resources | Relation → Resources | Optional |
| Status | Select | Seed · Developing · Promoted |
| Topics | Relation (dual) → Topics | |

**Known quirk**: `Related Ideas` is a self-relation. Notion's schema tooling
initially produced two separate properties for a symmetric self-relation
(`Related Ideas` and `Related Ideas 1`); the extra one was dropped, leaving a
single property that is **not** automatically kept bidirectional by Notion.
Any code linking two ideas together needs to set the relation on both idea
pages explicitly to preserve symmetry.

`Status = Promoted` ideas are one of the three inputs to the weekly LinkedIn
draft job. Ideas with zero relations in any direction (`Related Ideas`,
`Related Resources`, and `Topics` all empty) are flagged as "orphaned" by the
Graph Hygiene Pass.

## Portfolio — not a stored database

There's no dedicated Portfolio table. It's a filtered/curated **view** over
`Shareable = true` Projects and Resources that have a non-empty
`Portfolio Blurb`. The blurb itself is drafted by the Portfolio Drafting job
and only lands in that field once you Approve the corresponding Suggestion.

## Suggestions — the review queue behind the console

| Property | Type | Notes |
|---|---|---|
| Title | Title | e.g. `Merge Topics: "Sleep Hygiene" → "Sleep"`, `Portfolio blurb: <name>`, `LinkedIn draft: <hook>`, `Digest — 2026-08-30` |
| Type | Select | Digest · Hygiene Suggestion · Portfolio Draft · LinkedIn Draft |
| Status | Select | Pending · Approved · Edited & Approved · Dismissed |
| Related Project / Related Resource | Relation | What a Portfolio Draft suggestion is about |
| Created At | Created time | Used by the Digest job to find its own cutoff |
| (page content) | Blocks | The generated draft/content itself, read by the console and by `actions.ts` |

This is the only database the console writes to directly (via Approve/Dismiss).
Everything else the console shows is filtered `Status = Pending` rows from
here. See [`05-periodic-jobs.md`](./05-periodic-jobs.md) for what each job
writes and [`06-web-console-and-api.md`](./06-web-console-and-api.md) for what
Approve/Dismiss actually execute.

## Native stats — zero LLM cost, by design

A small block on the hub page uses plain Notion formula/rollup properties and
chart views (Projects by Status donut, Resources by Type donut, Ideas by
Status bar chart) — computed entirely by Notion itself. This was an explicit
requirement: anything that's a pure aggregation over existing structured data
should never cost a token or an LLM round-trip.

## The relation graph, visually

```
                     ┌───────────┐
        ┌───────────▶│  Topics   │◀────────────┐
        │            └─────┬─────┘              │
        │      ▲     ▲     │      ▲      ▲      │
        │      │     │     │      │      │      │
   ┌────┴───┐ ┌┴────┐┌────▼───┐┌──┴───┐┌─┴──────┴┐
   │Projects│ │Areas││Resources││Ideas ││ Daily   │
   │        │ │     ││         ││Vault ││ Journal │
   └───┬────┘ └──┬──┘└────┬────┘└──┬───┘└─────────┘
       │         │        │        │  (self-relation:
       │         └────────┘        │   Related Ideas)
       └──────────────(Area)───────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ Suggestions │  (Related Project/Resource)
                              └─────────────┘
```

Every content database relates to Topics; Projects and Areas relate to each
other directly; Ideas relate to Resources and to other Ideas; Suggestions
relates back to whatever Project/Resource a Portfolio Draft is about. This is
what makes retrieval a graph traversal ("show me everything tagged Finance")
instead of a full-text guess.
