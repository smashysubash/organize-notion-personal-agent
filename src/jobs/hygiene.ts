import { ids } from "../config.js";
import { askLLMJSON } from "../llm/client.js";
import { createPage, queryDataSource, updatePage } from "../notion/client.js";
import { title, select, plainText, relationIds } from "../notion/props.js";

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Cheap local pre-filter for likely-duplicate topic name pairs, before spending any LLM tokens. */
function candidatePairs(names: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i].toLowerCase();
      const b = names[j].toLowerCase();
      if (a === b) continue;
      const close = a.includes(b) || b.includes(a) || levenshtein(a, b) <= 2;
      if (close) pairs.push([names[i], names[j]]);
    }
  }
  return pairs;
}

export async function runHygienePass(): Promise<{ suggestions: number }> {
  const [topics, ideas] = await Promise.all([
    queryDataSource(ids.topics),
    queryDataSource(ids.ideasVault),
  ]);

  let count = 0;
  const names = topics.map((t) => plainText(t.properties.Name));
  const pairs = candidatePairs(names);

  if (pairs.length) {
    const decisions = await askLLMJSON<{ a: string; b: string; sameThing: boolean; canonical: string }[]>(
      `These pairs of Topic names look similar. For each, decide if they represent the SAME concept ` +
        `(should be merged) and if so which name should be the canonical (kept) one:\n` +
        `${JSON.stringify(pairs)}\n` +
        `Return JSON array: { a, b, sameThing: boolean, canonical: string }[]`
    );
    for (const d of decisions) {
      if (!d.sameThing) continue;
      const duplicate = d.canonical === d.a ? d.b : d.a;
      await createPage({
        parent: { data_source_id: ids.suggestions },
        properties: {
          Title: title(`Merge Topics: "${duplicate}" → "${d.canonical}"`),
          Type: select("Hygiene Suggestion"),
          Status: select("Pending"),
        },
        children: [
          {
            object: "block", type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: `Approve to merge "${duplicate}" into "${d.canonical}" — every relation moves onto the canonical topic and "${duplicate}" is archived.` } }] },
          },
        ],
      });
      count++;
    }
  }

  for (const idea of ideas) {
    const noLinks =
      relationIds(idea.properties["Related Ideas"]).length === 0 &&
      relationIds(idea.properties["Related Resources"]).length === 0 &&
      relationIds(idea.properties["Topics"]).length === 0;
    if (!noLinks) continue;
    const name = plainText(idea.properties.Name);
    await createPage({
      parent: { data_source_id: ids.suggestions },
      properties: { Title: title(`Orphaned idea: "${name}"`), Type: select("Hygiene Suggestion"), Status: select("Pending") },
      children: [
        { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: `This idea has no links to anything else — worth connecting it to a Topic/Resource, or archiving it.` } }] } },
      ],
    });
    count++;
  }

  return { suggestions: count };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHygienePass().then((r) => console.log(`${r.suggestions} hygiene suggestion(s) created.`));
}
