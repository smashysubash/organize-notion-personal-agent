import { ids } from "../config.js";
import { askLLM } from "../llm/client.js";
import { createPage, queryDataSource } from "../notion/client.js";
import { title, select, richText, plainText } from "../notion/props.js";

async function since(dataSourceId: string, isoCutoff: string) {
  return queryDataSource(dataSourceId, {
    filter: { timestamp: "last_edited_time", last_edited_time: { after: isoCutoff } },
  });
}

async function lastDigestCutoff(): Promise<string> {
  const prior = await queryDataSource(ids.suggestions, {
    filter: { property: "Type", select: { equals: "Digest" } },
    sorts: [{ property: "Created At", direction: "descending" }],
    page_size: 1,
  });
  if (prior[0]) return prior[0].properties["Created At"]?.created_time ?? weekAgo();
  return weekAgo();
}
const weekAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

export async function runDigest(): Promise<string> {
  const cutoff = await lastDigestCutoff();
  const [resources, ideas, projects, journal, topics] = await Promise.all([
    since(ids.resources, cutoff),
    since(ids.ideasVault, cutoff),
    since(ids.projects, cutoff),
    since(ids.dailyJournal, cutoff),
    since(ids.topics, cutoff),
  ]);

  const facts = {
    newResources: resources.map((p) => plainText(p.properties.Name)),
    newOrUpdatedIdeas: ideas.map((p) => plainText(p.properties.Name)),
    projectChanges: projects.map((p) => `${plainText(p.properties.Name)} (${p.properties.Status?.select?.name})`),
    journalDays: journal.length,
    newTopics: topics.map((p) => plainText(p.properties.Name)),
  };

  const body = await askLLM(
    `Write a short weekly digest (a few short paragraphs, markdown, no more than ~200 words) ` +
      `summarizing this activity in the user's personal Second Brain since the last digest:\n${JSON.stringify(facts, null, 2)}\n` +
      `Be concrete and brief. If everything is empty, just say it was a quiet week.`,
    512
  );

  const label = `Digest — ${new Date().toISOString().slice(0, 10)}`;
  await createPage({
    parent: { data_source_id: ids.suggestions },
    properties: { Title: title(label), Type: select("Digest"), Status: select("Pending") },
    children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: body } }] } }],
  });
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDigest().then((b) => console.log(b));
}
