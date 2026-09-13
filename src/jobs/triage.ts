import { ids } from "../config.js";
import { askLLMJSON, askLLM } from "../llm/client.js";
import { createPage, queryDataSource, updatePage, appendBlocks, NotionPage } from "../notion/client.js";
import {
  title, richText, select, checkbox, url as urlProp, date, relation,
  plainText, urlValue, markdownToBlocks,
} from "../notion/props.js";
import { loadTopicIndex, resolveTopics } from "../notion/topics.js";

interface Classification {
  id: string;
  destination: "Resources" | "Journal" | "Ideas" | "Projects" | "Areas";
  title: string;
  topics: string[];
  resourceType?: "Article" | "Video" | "Book" | "Note" | "Link";
  horizon?: "Short-term" | "Long-term (Goal)";
  deadline?: string;
  areaName?: string;
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

async function findOrCreateTodayJournal(): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const existing = await queryDataSource(ids.dailyJournal, {
    filter: { property: "Date", date: { equals: todayIso } },
  });
  if (existing[0]) return existing[0].id;
  const page = await createPage({
    parent: { data_source_id: ids.dailyJournal },
    properties: { Name: title(todayIso), Date: date(todayIso) },
  });
  return page.id;
}

let areaCache: NotionPage[] | null = null;
async function findOrCreateArea(name: string): Promise<string> {
  if (!areaCache) areaCache = await queryDataSource(ids.areas);
  const match = areaCache.find((p) => plainText(p.properties.Name).trim().toLowerCase() === name.trim().toLowerCase());
  if (match) return match.id;
  const page = await createPage({
    parent: { data_source_id: ids.areas },
    properties: { Name: title(name.trim()) },
  });
  areaCache.push(page);
  return page.id;
}

export async function runTriage(): Promise<{ filed: number; summary: string[] }> {
  const unprocessed = await queryDataSource(ids.inbox, {
    filter: { property: "Status", select: { equals: "Unprocessed" } },
    page_size: 25,
  });
  if (unprocessed.length === 0) return { filed: 0, summary: ["Inbox is empty — nothing to triage."] };

  const items = unprocessed.map((p) => ({
    id: p.id,
    name: plainText(p.properties.Name),
    rawType: p.properties["Raw Type"]?.select?.name,
    sourceUrl: urlValue(p.properties["Source URL"]),
  }));

  const classifications = await askLLMJSON<Classification[]>(
    `Classify each Inbox item per the Inbox Triage rules in the Playbook. ` +
      `Items:\n${JSON.stringify(items, null, 2)}\n\n` +
      `Return a JSON array, one object per item, matching this TypeScript type:\n` +
      `{ id: string, destination: "Resources"|"Journal"|"Ideas"|"Projects"|"Areas", ` +
      `title: string, topics: string[] (1-4 short topic names), ` +
      `resourceType?: "Article"|"Video"|"Book"|"Note"|"Link", ` +
      `horizon?: "Short-term"|"Long-term (Goal)", deadline?: "YYYY-MM-DD", areaName?: string }`
  );

  const topicIndex = await loadTopicIndex();
  const summary: string[] = [];
  let filed = 0;

  for (const c of classifications) {
    const original = items.find((i) => i.id === c.id);
    if (!original) continue;
    const topicIds = await resolveTopics(topicIndex, c.topics ?? []);

    try {
      if (c.destination === "Resources") {
        const fetched = original.sourceUrl ? await fetchUrlText(original.sourceUrl) : "";
        const aiSummary = await askLLM(
          `Write a 1-3 line summary of this content for a personal knowledge base. ` +
            `Title: ${c.title}\nContent: ${fetched || original.name}`,
          256
        );
        const props: Record<string, unknown> = {
          Name: title(c.title),
          Type: select(c.resourceType ?? "Note"),
          "AI Summary": richText(aiSummary.trim()),
          Topics: relation(topicIds),
          Status: select("Active"),
          Shareable: checkbox(false),
        };
        if (original.sourceUrl) props["Source URL"] = urlProp(original.sourceUrl);
        await createPage({ parent: { data_source_id: ids.resources }, properties: props });
        summary.push(`Resources: "${c.title}"`);
      } else if (c.destination === "Journal") {
        const journalId = await findOrCreateTodayJournal();
        await appendBlocks(journalId, markdownToBlocks(`- ${original.name}`));
        if (topicIds.length) {
          await updatePage(journalId, { Topics: relation(topicIds) });
        }
        summary.push(`Daily Journal: appended "${original.name.slice(0, 60)}"`);
      } else if (c.destination === "Ideas") {
        await createPage({
          parent: { data_source_id: ids.ideasVault },
          properties: { Name: title(c.title), Status: select("Seed"), Topics: relation(topicIds) },
        });
        summary.push(`Ideas Vault: "${c.title}"`);
      } else if (c.destination === "Projects") {
        const props: Record<string, unknown> = {
          Name: title(c.title),
          Status: select("Not Started"),
          Horizon: select(c.horizon ?? "Short-term"),
          Topics: relation(topicIds),
          Shareable: checkbox(false),
        };
        if (c.deadline) props.Deadline = date(c.deadline);
        if (c.areaName) props.Area = relation([await findOrCreateArea(c.areaName)]);
        await createPage({ parent: { data_source_id: ids.projects }, properties: props });
        summary.push(`Projects: "${c.title}"`);
      } else if (c.destination === "Areas") {
        const areaId = await findOrCreateArea(c.areaName ?? c.title);
        await appendBlocks(areaId, markdownToBlocks(`- ${original.name}`));
        if (topicIds.length) await updatePage(areaId, { Topics: relation(topicIds) });
        summary.push(`Areas: attached to "${c.areaName ?? c.title}"`);
      }

      await updatePage(c.id, { Status: select("Filed") });
      filed++;
    } catch (err) {
      summary.push(`FAILED to file "${original.name.slice(0, 40)}": ${(err as Error).message}`);
    }
  }

  return { filed, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTriage().then((r) => {
    console.log(`Filed ${r.filed} item(s):`);
    r.summary.forEach((s) => console.log(" -", s));
  });
}
