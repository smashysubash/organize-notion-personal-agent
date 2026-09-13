# Efficiency and Cost Techniques

This project was built with token/API-cost efficiency as a first-class
requirement, not an afterthought. Every technique below is actually
implemented in the current code — this doc maps each one to where it lives.

## Necessary (implemented everywhere they apply)

### 1. Batch reads and writes instead of per-item round trips

`runTriage()` (`src/jobs/triage.ts`) pulls up to 25 Inbox rows in a **single**
`queryDataSource` call, then classifies **all of them in one LLM call**
(`askLLMJSON<Classification[]>`) rather than one classification request
per item. This is the single largest cost lever in the whole system — a
25-item triage run makes one classification call, not 25.

### 2. Bulk-load the Topics graph once per run, resolve locally

`loadTopicIndex()` (`src/notion/topics.ts`) fetches every Topic exactly once
per job run into an in-memory `Map`. `resolveTopic()`/`resolveTopics()` then
do a case-insensitive local lookup and only hit the Notion API to create a
page when a name genuinely doesn't exist — and immediately updates the local
map so a repeated new-topic name within the same run doesn't create it twice.
Used by `triage.ts`, `portfolio.ts` (to map topic ids back to names for the
blurb prompt), and `actions.ts` (to resolve merge-target topic ids).

### 3. Cap generated text length

- Resource `AI Summary`: 1-3 lines (`askLLM(..., 256)` max tokens).
- Digest body: "no more than ~200 words" (`askLLM(..., 512)`).
- Portfolio blurbs: "3-5 sentence" (`askLLM(..., 400)`).
- LinkedIn drafts: "3-6 sentence" posts, capped at `900` tokens for up to 3
  of them combined.
- Fetched URL content is truncated to 4000 characters (`fetchUrlText()`)
  *before* it's sent to the LLM at all — the input side is capped, not just
  the output.

Shorter generations cost less to produce and cost less every time they're
re-read later (by a human, or by a future digest/summary pass).

### 4. Skip anything already processed

- Inbox rows only get touched while `Status = "Unprocessed"`; triage flips
  each one to `"Filed"` as its last step, so re-running the job never
  reprocesses old items or re-spends tokens on them.
- Portfolio Drafting filters directly in the Notion query itself
  (`Shareable = true AND Portfolio Blurb is_empty`) — items that already have
  a blurb are never fetched, let alone re-sent to the LLM.
- The LinkedIn job returns `{ drafts: 0 }` immediately, with **zero LLM
  calls**, if there's simply nothing new to draft from that week.

### 5. Cheap local pre-filtering before spending LLM judgment

The Graph Hygiene Pass (`src/jobs/hygiene.ts`) never asks an LLM to compare
every pair of Topics directly (which would be O(n²) *LLM calls* on top of an
already-O(n²) comparison). Instead, `candidatePairs()` does a pure string
comparison first (substring containment, or Levenshtein distance ≤ 2 via a
small hand-rolled `levenshtein()`), and only the short resulting candidate
list — usually a handful of pairs even with a large Topics database — goes to
the LLM in one batched `askLLMJSON()` call.

## Good to have (implemented)

### 6. Prompt caching on the static system prompt (Anthropic provider)

When `LLM_PROVIDER=anthropic` (the default), `src/llm/client.ts` marks the
Playbook system-prompt block `cache_control: { type: "ephemeral" }`. Since the
Playbook is large, static,
and identical across every single call the process makes (across all jobs,
not just within one job run), this means only the *first* call after cache
expiry pays full price for that block — every subsequent call within the
cache TTL is billed at the much cheaper cached-read rate. Given how many LLM
calls a single job run can make (one per orphaned-idea suggestion, one per
portfolio draft, etc.), this compounds meaningfully. The `OpenAICompatibleProvider`
path (`LLM_PROVIDER=openai`) has no equivalent yet — some backends behind it
(e.g. OpenAI itself) do automatic prompt caching server-side with no client
changes needed, others (e.g. most local models) don't cache at all.

### 7. Per-run in-memory caches for reference data

Beyond the Topics index, `triage.ts` also keeps an `areaCache` (all Areas,
loaded lazily on first Area lookup in a run) so repeated Inbox items destined
for the same or different Areas within one run don't each trigger a fresh
`queryDataSource` call.

### 8. A stateless, resilient job design

Every job function is independently callable and idempotent against its own
filter conditions — this isn't strictly a "cost" technique, but it's what
makes the other techniques safe: because re-running any job only ever
processes the subset of data that genuinely still needs it (unprocessed
Inbox rows, blurb-less Shareable items, un-digested activity since the last
cutoff), there's no cost penalty to running jobs more often than "necessary,"
which in turn makes on-demand console buttons cheap to offer alongside the
scheduled runs.

## Deliberately not implemented (and why)

- **No separate vector store / embedding index.** Retrieval relies on
  Notion's own search plus the Topics relation graph (see
  [`03-data-model.md`](./03-data-model.md)) — a vector store would be another
  system to keep in sync, another cost center, and Notion's own search over a
  moderately-sized personal workspace is more than sufficient.
- **No instant on-`Shareable`-flip portfolio drafting.** That would need a
  Notion webhook subscription running continuously to watch for property
  changes; the weekly sweep achieves the same end state at a fraction of the
  operational complexity, at the cost of at most a week's latency on a
  low-urgency action.
- **No LinkedIn API integration of any kind** — not a cost optimization, but
  a hard scope boundary (see [`05-periodic-jobs.md`](./05-periodic-jobs.md)).
