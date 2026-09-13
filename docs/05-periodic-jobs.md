# Periodic Jobs

Four jobs run on a schedule (`src/scheduler.ts`, via `node-cron`) and are also
individually triggerable from the console or CLI. All four write into the
**Suggestions** database rather than acting directly on your data — see
[`06-web-console-and-api.md`](./06-web-console-and-api.md) for what happens on
Approve/Dismiss.

Default schedules (overridable in `.env`): Digest `0 8 * * 1` (Monday 8am),
Hygiene `0 9 * * 1` (Monday 9am, Portfolio Drafting piggybacks the same cron
entry), LinkedIn `0 10 * * 1` (Monday 10am). Cron strings are evaluated in the
host machine's local time.

## Digest — `src/jobs/digest.ts` → `runDigest()`

**Purpose**: a short "what happened since last time" summary. Purely
informational — no Approve action beyond marking it reviewed.

**How the cutoff is computed**: `lastDigestCutoff()` queries Suggestions for
the most recent `Type = Digest` row (sorted by `Created At` descending) and
uses its `Created At` timestamp as the cutoff; if no prior digest exists, it
falls back to 7 days ago (`weekAgo()`). This makes the job self-scheduling —
running it more or less often than weekly still produces a correct "since last
time" window, since it never depends on a fixed number-of-days assumption.

**What it gathers**: five parallel `last_edited_time`-filtered queries
(Resources, Ideas Vault, Projects, Daily Journal, Topics) for anything edited
after the cutoff, reduced to plain names (and, for Projects, name + current
Status) — never full page content.

**Generation**: one `askClaude()` call with those facts as JSON, asking for
"a few short paragraphs, markdown, no more than ~200 words" — explicitly
capped, and explicitly told to just say "it was a quiet week" if everything's
empty rather than padding.

**Output**: one Suggestions row, `Type = "Digest"`, `Status = "Pending"`,
titled `Digest — YYYY-MM-DD`, with the generated markdown as page content
(via a single paragraph block containing the raw text).

## Graph Hygiene Pass — `src/jobs/hygiene.ts` → `runHygienePass()`

**Purpose**: catch two kinds of graph rot — near-duplicate Topic nodes, and
Ideas Vault notes that ended up with zero connections to anything.

**Duplicate-topic detection, in two stages**:

1. **Cheap local pre-filter, no LLM involved.** `candidatePairs()` compares
   every pair of Topic names and flags a pair as a "candidate" if one name is
   a substring of the other, or their Levenshtein edit distance is ≤ 2
   (`levenshtein()` is a small hand-rolled DP implementation, no external
   library). This turns an O(n²) LLM-judgment problem into an O(n²) *string*
   comparison (cheap) that only produces a short candidate list.
2. **LLM confirms only the candidates.** The (usually short) candidate list is
   sent in one `askClaudeJSON()` call, asking for each pair whether it's
   really the "SAME concept" and which name should be canonical. Only pairs
   confirmed `sameThing: true` become suggestions.

For each confirmed duplicate, one Suggestions row is created: `Type =
"Hygiene Suggestion"`, titled exactly
`Merge Topics: "<duplicate>" → "<canonical>"` — **this exact string format is
load-bearing**: `src/jobs/actions.ts` regex-parses this title on Approve to
know which two topics to merge (see next doc).

**Orphaned-idea detection**: for every Ideas Vault row, if `Related Ideas`,
`Related Resources`, and `Topics` are all empty, it's flagged with a
Suggestions row titled `Orphaned idea: "<name>"`. This one is purely
informational — Approve has no special action for it (see `actions.ts`, it
falls through to "no Notion-side action beyond status").

## Portfolio Auto-Drafting — `src/jobs/portfolio.ts` → `runPortfolioDrafting()`

**Purpose**: write a shareable case-study blurb for anything you've flagged
`Shareable` but that doesn't have one yet.

**Trigger model**: this is a **sweep**, not an instant reaction to flipping
`Shareable` — it queries Projects and Resources where
`Shareable = true AND Portfolio Blurb is_empty`. An instant on-flip version
would require a Notion webhook subscription, which isn't built in this
version (noted directly in the code as a deliberate scope cut); the weekly
sweep catches the same items, just not immediately.

**Generation**: for each matching Project, a `askClaude()` call using its
Name, Outcome, and related Topic names (resolved back to strings via the
bulk-loaded Topic index, matching id → name) produces a 3-5 sentence
case-study writeup. Resources get the same treatment using Name + AI Summary
instead of Outcome.

**Output**: one Suggestions row per item, `Type = "Portfolio Draft"`, titled
`Portfolio blurb: <name>`, with `Related Project` or `Related Resource` set so
`actions.ts` knows where to copy the blurb on Approve.

## LinkedIn Draft Suggestions — `src/jobs/linkedin.ts` → `runLinkedInDrafts()`

**Purpose**: turn a week's worth of captured content into 1-3 ready-to-edit
LinkedIn post ideas — **draft-only, always**.

**Why draft-only, never auto-posted**: LinkedIn's API tightly restricts
automated posting to a personal profile. Rather than build something fragile
against that restriction (or something that could violate LinkedIn's terms),
this feature was scoped from the start to end at "readable text in a review
queue" — the code never calls any LinkedIn endpoint, and the Playbook's
Boundaries section states this explicitly as a hard rule, not just an
implementation detail.

**What it gathers**: Resources edited in the last 7 days, Ideas with
`Status = "Promoted"`, and `Shareable` Projects edited in the last 7 days. If
all three are empty, the job returns `{ drafts: 0 }` immediately — no LLM call
is made for an empty week.

**Generation**: one `askClaudeJSON()` call with those facts, explicitly
instructed to draft "1-3 short LinkedIn post ideas (a punchy hook + a 3-6
sentence draft post each) grounded in what's actually here — don't invent
facts not present." Returns `{ hook: string; post: string }[]`.

**Output**: one Suggestions row per idea, `Type = "LinkedIn Draft"`, titled
`LinkedIn draft: <hook>`, with the drafted post text as page content. Approve
on these is purely a "reviewed" marker (see `actions.ts`) — there is no
publish action, by design.

## Why Portfolio Drafting shares Hygiene's cron entry

`src/scheduler.ts` registers `runPortfolioDrafting` on `config.cron.hygiene`
rather than giving it a fifth env var — both are "weekly sweep, low urgency"
jobs, so reusing one schedule avoids proliferating cron config for jobs that
don't need independent timing. If you want them decoupled later, split it into
its own `cron.schedule(...)` call with a new env var — no other code depends
on them running together.
