import { ids } from "../config.js";
import { askLLM } from "../llm/client.js";
import { createPage, queryDataSource } from "../notion/client.js";
import { title, select, relation, plainText, relationIds } from "../notion/props.js";
import { loadTopicIndex } from "../notion/topics.js";

/**
 * Sweeps Projects and Resources for Shareable=true items missing a Portfolio
 * Blurb. Instant on-flip drafting would need a Notion webhook subscription
 * (not built in this version) — the weekly sweep covers the same ground.
 */
export async function runPortfolioDrafting(): Promise<{ drafts: number }> {
  const topicIndex = await loadTopicIndex();
  const topicName = (id: string) => [...topicIndex.byName.entries()].find(([, v]) => v === id)?.[0] ?? "";

  const [projects, resources] = await Promise.all([
    queryDataSource(ids.projects, {
      filter: { and: [{ property: "Shareable", checkbox: { equals: true } }, { property: "Portfolio Blurb", rich_text: { is_empty: true } }] },
    }),
    queryDataSource(ids.resources, {
      filter: { and: [{ property: "Shareable", checkbox: { equals: true } }, { property: "Portfolio Blurb", rich_text: { is_empty: true } }] },
    }),
  ]);

  let drafts = 0;

  for (const p of projects) {
    const name = plainText(p.properties.Name);
    const outcome = plainText(p.properties.Outcome);
    const topics = relationIds(p.properties.Topics).map(topicName).filter(Boolean);
    const blurb = await askLLM(
      `Write a short (3-5 sentence) case-study-style portfolio writeup for this project, ` +
        `suitable for showing others. Name: ${name}. Outcome: ${outcome || "N/A"}. Related topics: ${topics.join(", ") || "none"}.`,
      400
    );
    await createPage({
      parent: { data_source_id: ids.suggestions },
      properties: { Title: title(`Portfolio blurb: ${name}`), Type: select("Portfolio Draft"), Status: select("Pending"), "Related Project": relation([p.id]) },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: blurb.trim() } }] } }],
    });
    drafts++;
  }

  for (const r of resources) {
    const name = plainText(r.properties.Name);
    const summary = plainText(r.properties["AI Summary"]);
    const topics = relationIds(r.properties.Topics).map(topicName).filter(Boolean);
    const blurb = await askLLM(
      `Write a short (3-5 sentence) case-study-style portfolio writeup for this resource, ` +
        `suitable for showing others. Name: ${name}. Summary: ${summary || "N/A"}. Related topics: ${topics.join(", ") || "none"}.`,
      400
    );
    await createPage({
      parent: { data_source_id: ids.suggestions },
      properties: { Title: title(`Portfolio blurb: ${name}`), Type: select("Portfolio Draft"), Status: select("Pending"), "Related Resource": relation([r.id]) },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: blurb.trim() } }] } }],
    });
    drafts++;
  }

  return { drafts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPortfolioDrafting().then((r) => console.log(`${r.drafts} portfolio draft(s) created.`));
}
