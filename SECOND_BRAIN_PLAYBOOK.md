# Second Brain Playbook

This is the single source of truth for how this personal knowledge system works. It is written in host-neutral terms (generic Notion operations, not any one vendor's tool names) so it can be executed by the standalone agent service, by Claude Code chat, by Claude.ai, by Antigravity, or by anything else with Notion access. Mirror this page inside Notion itself so it travels with the data.

## Structure

One hub page **🧠 Second Brain** containing:
- **Inbox** — zero-friction capture. Properties: Name, Raw Type (Thought/Link/File/Quick Task), Status (Unprocessed/Processing/Filed), Source URL, Captured At.
- **Projects** (includes Goals) — Name, Status (Not Started/Active/Blocked/Done/Archived), Horizon (Short-term/Long-term (Goal)), Deadline, Area (relation), Topics (relation), Shareable (checkbox), Outcome.
- **Areas** — ongoing life domains, no end state. Name, Description, Related Projects (relation), Topics (relation).
- **Resources** — reference material. Name, Type (Article/Video/Book/Note/Link), Topics (relation), Source URL, AI Summary, Related Area, Related Project, Shareable, Status (Active/Archived).
- **Ideas Vault** — atomic Zettelkasten-style notes. Name, Related Ideas (self-relation), Related Resources, Status (Seed/Developing/Promoted), Topics (relation).
- **Daily Journal** — one page per day. Name, Date, Mood, Topics (relation), body = freeform diary text (append-only).
- **Topics** — the graph hub. Name, Description, plus the dual-relation back-references from every database above. Find-or-create (case-insensitive match on Name) — never create a near-duplicate node.
- **Suggestions** — the review queue behind the web console. Title, Type (Digest/Hygiene Suggestion/Portfolio Draft/LinkedIn Draft), Status (Pending/Approved/Edited & Approved/Dismissed), Related Project/Resource/Topic, Created At, body = the drafted content.
- **Native stats** (no AI): Notion chart views grouping Projects by Status, Resources by Type, Ideas by Status — pure Notion aggregation, never touch the LLM for these.

## Inbox Triage (on-demand)

For each `Status = Unprocessed` Inbox row, decide in this order (first match wins):

1. Has a Source URL and reads reference-shaped (article/video/tool/doc) → **Resources**. Fetch the URL, write a 1-3 line AI Summary, infer Type, resolve Topics.
2. Reads as a reflection/log of the day ("today I...", "felt...") → append to **today's Daily Journal** page (create if missing).
3. Reads as a short, undeveloped spark with no clear next action → **Ideas Vault**, Status = Seed. Search existing ideas/resources for related concepts and link via relation.
4. Reads as actionable with a concrete outcome → **Projects**. Horizon = Short-term if it has a deadline/is concrete, Long-term if aspirational/ongoing with no end state.
5. Reads as an ongoing life-domain note with no end state and no single action → **Areas** (attach to existing Area, rarely create a new one).
6. Ambiguous → default to Resources (Type = Note), and flag it in the next digest for manual re-filing.

Before creating any new page, search for likely duplicates and link via relation instead of duplicating. Resolve Topics by bulk-loading the Topics database once per run and matching candidate topic names locally (case-insensitive) — never issue one search per topic per item.

## Periodic Jobs

**Digest** (weekly by default, `DIGEST_CRON`) — summarize what changed since the last digest: new Resources/Ideas/Journal entries, Projects that changed Status, Topics that grew. Write one Suggestions row, Type = Digest. Informational only, no approval needed.

**Graph Hygiene Pass** (weekly, `HYGIENE_CRON`) — scan Topics for likely near-duplicate names, and Ideas Vault notes with zero relations in any direction ("islands"). Each finding becomes one Suggestions row, Type = Hygiene Suggestion, with the proposed action stated explicitly ("merge X into Y"). Only execute the merge on explicit Approve: repoint every relation from the duplicate Topic onto the canonical one, then archive the duplicate.

**Portfolio Auto-Drafting** (on Shareable flip, and swept weekly for anything Shareable without a blurb yet) — draft a short case-study-style writeup from the item's content and linked Topics/Resources. Write a Suggestions row, Type = Portfolio Draft. On Approve, copy the blurb onto the source page (a Portfolio Blurb field) so the Portfolio view picks it up.

**LinkedIn Draft Suggestions** (weekly, `LINKEDIN_CRON`, draft-only) — from the week's new/updated Resources, Promoted Ideas, and newly-Shareable Projects, draft 1-3 short LinkedIn post ideas grounded in that content. Write Suggestions rows, Type = LinkedIn Draft. Purely informational — never post, never touch any LinkedIn API. The user copies/edits/posts manually.

## Efficiency Rules

Necessary:
- Batch reads/writes — one query for all rows a job needs; batch page creation instead of one call per item.
- Bulk-load the Topics list once per job run; match candidates locally instead of one search per topic.
- Cap generated text: AI Summary and blurbs to 1-3 lines, digests to a short paragraph per section.
- Skip anything already processed (Status/field checks) — never silently reprocess.
- Use search result highlights for dedup checks instead of fetching full page bodies.

Good to have:
- Cache each database's schema for the process lifetime.
- Use a static system prompt (this Playbook) so LLM calls benefit from prompt caching across a job's many items.
- Memoize generated digests/stats between console page loads.
- Rate-limit/backoff the Notion client under load.

## Boundaries

- Never touch any workspace other than the connected personal "s subash's Notion" workspace.
- Never call any LinkedIn API or post anything automatically — LinkedIn output is draft-only, always reviewed by a human before use.
- Never execute a Hygiene merge without explicit Approve.
<!-- to build -->