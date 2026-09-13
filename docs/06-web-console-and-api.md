# Web Console and API

The console is deliberately **lightweight**: a review/approval surface for
AI-generated suggestions, not a Notion replacement. Notion stays directly
browsable on its own for everything else.

## Server: `src/server/app.ts`

A single Express app, created by `createApp()` and started from
`src/index.ts` on `config.port` (default `4173`). It does two things:

1. Serves the static console (`express.static` over `src/server/public/`).
2. Exposes a small JSON API.

### `GET /api/suggestions?status=Pending`

Queries the Suggestions database filtered by `Status` (defaults to
`"Pending"` if `?status=` is omitted), sorted by `Created At` descending, and
enriches each row with its page-content text (via `retrieveBlockChildren` +
concatenating `rich_text.plain_text` across blocks) before returning:

```jsonc
[
  {
    "id": "...",
    "url": "https://notion.so/...",
    "title": "Merge Topics: \"Sleep Hygiene\" → \"Sleep\"",
    "type": "Hygiene Suggestion",
    "status": "Pending",
    "body": "Approve to merge \"Sleep Hygiene\" into \"Sleep\" — ..."
  }
]
```

### `POST /api/suggestions/:id/approve`

Calls `approveSuggestion(id)` from `src/jobs/actions.ts` (see below), then
returns `{ ok: true }`. Errors surface as `500 { error: message }`.

### `POST /api/suggestions/:id/dismiss`

Calls `dismissSuggestion(id)`, which just sets `Status = "Dismissed"` — no
other Notion-side effect, ever.

### `POST /api/jobs/:name/run`

Dispatches to one of the five job functions by name — `triage`, `digest`,
`hygiene`, `portfolio`, `linkedin` — via a small lookup table, and returns
`{ ok: true, result }` where `result` is whatever that job function returned
(e.g. `{ filed: 3, summary: [...] }` for triage). Unknown job names return
`404 { error: "unknown job" }`.

## What Approve actually executes — `src/jobs/actions.ts`

Approve is **not just a status flip**. `approveSuggestion()` looks at the
suggestion's `Type` and dispatches:

- **`Hygiene Suggestion`** → `executeHygieneMerge(title)`. Regex-parses the
  title `Merge Topics: "(.+)" → "(.+)"` (this is why that exact title format
  from `hygiene.ts` matters — see
  [`05-periodic-jobs.md`](./05-periodic-jobs.md)). If the title doesn't match
  that pattern (e.g. an `"Orphaned idea: ..."` suggestion), the function
  returns immediately — no-op, informational only. When it does match:
  1. Resolves both topic names to page ids via `loadTopicIndex()`.
  2. For every database that can hold a Topics relation
     (`Projects, Areas, Resources, Ideas Vault, Daily Journal` —
     `TOPIC_RELATION_SOURCES`), queries rows whose `Topics` relation contains
     the duplicate topic id, and repoints each one: removes the duplicate id,
     adds the canonical id (if not already present), and writes the updated
     relation list back.
  3. Trashes the duplicate Topic page (`trashPage`, a soft delete via
     `in_trash: true` — recoverable from Notion's trash, not a hard delete).
- **`Portfolio Draft`** → `executePortfolioApproval(suggestion)`. Reads the
  suggestion's page-content text (the blurb) and copies it verbatim into the
  linked Project's or Resource's `Portfolio Blurb` property (whichever of
  `Related Project`/`Related Resource` is set).
- **`Digest` / `LinkedIn Draft`** → no Notion-side action beyond the status
  flip below — these are purely informational, and Approve just means "I've
  seen this."

In every case, after the type-specific action (if any), the suggestion's own
`Status` is set to `"Approved"`.

`dismissSuggestion()` is uniform across all types: it only ever sets
`Status = "Dismissed"`.

## Frontend: `src/server/public/`

Three files, no build step, no framework:

- **`index.html`** — a header with five job-trigger buttons (Organize Inbox,
  Run Digest, Run Hygiene Pass, Draft Portfolio Blurbs, Draft LinkedIn Posts),
  a tab bar to filter by Suggestion `Type` (All / Digests / Hygiene /
  Portfolio / LinkedIn), and a `<main id="list">` container for suggestion
  cards.
- **`app.js`** — vanilla JS, no dependencies:
  - `loadSuggestions()` fetches `Status=Pending` suggestions, filters
    client-side by the active tab (`currentType`), and renders a card per
    item via `cardHtml()`.
  - Each card shows title, type, body text, an **Open in Notion** link
    (`item.url`, the page's own Notion URL), and action buttons — **Approve**
    is hidden entirely for `Digest`-type cards (there's nothing to execute,
    only "seen"), **Dismiss** always shows.
  - `act(id, action)` posts to `/api/suggestions/:id/:action` and reloads the
    list.
  - Job buttons post to `/api/jobs/:name/run`, disabling themselves and
    showing "Running…" for the duration of the request.
  - `escapeHtml()` guards every piece of user/LLM-generated text before
    interpolating it into the DOM, since suggestion titles/bodies are
    untrusted-ish content (LLM output, and ultimately your own free-text
    Inbox captures) being rendered as HTML.
- **`style.css`** — a small `prefers-color-scheme`-aware light/dark palette
  via CSS custom properties (`--bg`, `--card`, `--border`, `--text`,
  `--muted`, `--accent`), no external stylesheet or framework.

## Why this shape

- **No client-side framework** — a single-user personal console with five
  buttons and a filtered list doesn't need one; keeping it to three static
  files with zero build step matches the "lightweight, not a Notion
  replacement" requirement directly.
- **Server does the heavy lifting, client just renders** — all Notion API
  calls, LLM calls, and Approve-logic branching happen server-side; the
  frontend only ever talks to the small `/api/*` surface above.
- **Type-aware Approve button visibility** — a UI-level acknowledgment that
  not every Suggestion type has an executable action; hiding Approve where
  it would be meaningless (Digest) avoids implying an action exists when it
  doesn't.
