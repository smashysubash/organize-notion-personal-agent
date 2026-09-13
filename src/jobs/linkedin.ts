import { ids } from "../config.js";
import { askLLMJSON } from "../llm/client.js";
import { createPage, queryDataSource } from "../notion/client.js";
import { title, select, plainText } from "../notion/props.js";

const weekAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

/** Draft-only. Never calls any LinkedIn API — output lives in Suggestions for the user to copy/edit/post themselves. */
export async function runLinkedInDrafts(): Promise<{ drafts: number }> {
  const cutoff = weekAgo();
  const [resources, promotedIdeas, shareableProjects] = await Promise.all([
    queryDataSource(ids.resources, { filter: { timestamp: "last_edited_time", last_edited_time: { after: cutoff } } }),
    queryDataSource(ids.ideasVault, { filter: { property: "Status", select: { equals: "Promoted" } } }),
    queryDataSource(ids.projects, {
      filter: { and: [{ property: "Shareable", checkbox: { equals: true } }, { timestamp: "last_edited_time", last_edited_time: { after: cutoff } }] },
    }),
  ]);

  const facts = {
    recentResources: resources.map((p) => plainText(p.properties.Name)),
    promotedIdeas: promotedIdeas.map((p) => plainText(p.properties.Name)),
    shareableProjects: shareableProjects.map((p) => plainText(p.properties.Name)),
  };

  if (!facts.recentResources.length && !facts.promotedIdeas.length && !facts.shareableProjects.length) {
    return { drafts: 0 };
  }

  const ideas = await askLLMJSON<{ hook: string; post: string }[]>(
    `Based on this week's activity in the user's personal knowledge base, draft 1-3 short LinkedIn ` +
      `post ideas (a punchy hook + a 3-6 sentence draft post each) grounded in what's actually here — ` +
      `don't invent facts not present:\n${JSON.stringify(facts, null, 2)}\n` +
      `Return JSON array: { hook: string, post: string }[]`,
    900
  );

  for (const idea of ideas) {
    await createPage({
      parent: { data_source_id: ids.suggestions },
      properties: { Title: title(`LinkedIn draft: ${idea.hook}`), Type: select("LinkedIn Draft"), Status: select("Pending") },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: idea.post } }] } }],
    });
  }

  return { drafts: ideas.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLinkedInDrafts().then((r) => console.log(`${r.drafts} LinkedIn draft(s) created.`));
}
