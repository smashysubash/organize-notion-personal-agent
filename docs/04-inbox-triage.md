# Inbox Triage

File: `src/jobs/triage.ts` · Entry point: `runTriage()` · Triggered by the
console's **Organize Inbox** button, `npm run triage`, or the
`POST /api/jobs/triage/run` API route. Not scheduled — triage is always a
deliberate, on-demand action (see [`02-architecture.md`](./02-architecture.md)
for why).

## What it does, step by step

1. **Pull the batch.** Queries Inbox for `Status = Unprocessed`, capped at 25
   rows per run (`page_size: 25`). If there's nothing to do, it returns early
   with `{ filed: 0, summary: ["Inbox is empty — nothing to triage."] }`
   rather than making any LLM call.

2. **Classify everything in one LLM call.** Every unprocessed item (its name,
   raw type, and source URL if any) is serialized into a single prompt and
   sent to `askClaudeJSON<Classification[]>()` — one round trip classifies the
   whole batch, not one call per item. The requested shape:

   ```ts
   interface Classification {
     id: string;
     destination: "Resources" | "Journal" | "Ideas" | "Projects" | "Areas";
     title: string;
     topics: string[];              // 1-4 short topic names
     resourceType?: "Article" | "Video" | "Book" | "Note" | "Link";
     horizon?: "Short-term" | "Long-term (Goal)";
     deadline?: string;             // "YYYY-MM-DD"
     areaName?: string;
   }
   ```

   The classification rules Claude follows come from the Playbook's decision
   tree (loaded as the system prompt — see below), not from anything hardcoded
   in this prompt string.

3. **Bulk-load Topics once.** `loadTopicIndex()` pulls every existing Topic
   into memory before processing any classification, so resolving each item's
   topic names is a local map lookup, not a Notion search per topic per item.

4. **File each classified item**, wrapped individually in `try/catch` so one
   failure doesn't abort the whole batch (a failure becomes a
   `FAILED to file "..."` line in the summary instead, and that Inbox row is
   left `Unprocessed` for the next run):

   - **Resources** — if there's a `Source URL`, `fetchUrlText()` fetches the
     raw HTML, strips `<script>`/`<style>` blocks and all remaining tags,
     collapses whitespace, and truncates to 4000 characters. That text (or the
     item's own name, if there's no URL) is sent to `askClaude()` for a capped
     1-3 line **AI Summary**. A new Resources page is created with
     `Type`, `AI Summary`, `Topics`, `Status = Active`, `Shareable = false`
     (deliberately off by default — sharing is an explicit later decision),
     and `Source URL` if present.
   - **Journal** — `findOrCreateTodayJournal()` looks up today's Daily Journal
     row by exact date match (creating it if missing), then the raw item text
     is appended as a bullet via `appendBlocks` + `markdownToBlocks`. Existing
     journal content for the day is never overwritten. Topics are attached to
     the day's page if any were resolved.
   - **Ideas** — a new Ideas Vault page is created with `Status = Seed` and the
     resolved Topics. (Cross-linking to existing related ideas, per the
     Playbook's triage rule, is left for a human/future pass — the current
     implementation doesn't attempt automatic idea-to-idea linking at file
     time.)
   - **Projects** — a new Projects page is created with `Status = "Not Started"`,
     `Horizon` (defaulting to `Short-term` if Claude didn't specify one),
     `Topics`, `Shareable = false`, plus `Deadline` if given and `Area` (via
     `findOrCreateArea()`) if an `areaName` was inferred.
   - **Areas** — `findOrCreateArea()` finds the named Area (case-insensitive,
     using an in-memory cache populated on first use per run) or creates it,
     then the raw item text is appended to that Area's page content as a
     bullet, with Topics attached if resolved.

5. **Mark it Filed.** After successfully routing an item, its Inbox row gets
   `Status = "Filed"` so it won't be picked up by a future run.

6. **Return a summary.** `{ filed: number, summary: string[] }` — one line per
   item describing where it went (or that it failed), which the console
   surfaces as the job's result.

## Why this shape

- **One classification call for the whole batch**, not per item — the single
  biggest cost lever for this job (batch size 25 vs. 25 separate round trips).
- **Per-item try/catch** — a bad URL fetch or a malformed classification for
  one item shouldn't block filing the other 24.
- **Idempotent by `Status`** — re-running triage is always safe; only
  `Unprocessed` rows are ever touched, and each one flips to `Filed` exactly
  once it's actually been written somewhere.
- **`Shareable` defaults to false everywhere** — nothing becomes portfolio- or
  LinkedIn-eligible just by being filed; that's a deliberate later toggle,
  keeping the "mostly private, some things public" boundary from the original
  requirements intact.

## Where the actual classification rules live

The decision tree Claude follows ("has a URL and reads reference-shaped →
Resources", "reads like a reflection → Journal", etc.) is **not** in
`triage.ts` — it's in `SECOND_BRAIN_PLAYBOOK.md` under "Inbox Triage
(on-demand)", loaded as the system prompt by `src/llm/client.ts`. This keeps
the rules editable in one place (and portable to other AI tools) without
touching code.
