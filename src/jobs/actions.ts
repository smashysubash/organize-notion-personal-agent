import { ids } from "../config.js";
import { retrievePage, retrieveBlockChildren, updatePage, queryDataSource, trashPage, NotionPage } from "../notion/client.js";
import { plainText, select, relation, relationIds, richText } from "../notion/props.js";
import { loadTopicIndex } from "../notion/topics.js";

async function getSuggestionBodyText(pageId: string): Promise<string> {
  const blocks = await retrieveBlockChildren(pageId);
  return blocks
    .map((b: any) => (b[b.type]?.rich_text ?? []).map((t: any) => t.plain_text).join(""))
    .join("\n")
    .trim();
}

const TOPIC_RELATION_SOURCES = [ids.projects, ids.areas, ids.resources, ids.ideasVault, ids.dailyJournal];

async function executeHygieneMerge(title: string): Promise<void> {
  const match = title.match(/Merge Topics: "(.+)" → "(.+)"/);
  if (!match) return; // e.g. "Orphaned idea: ..." — informational, nothing to execute
  const [, duplicateName, canonicalName] = match;
  const index = await loadTopicIndex();
  const duplicateId = index.byName.get(duplicateName.trim().toLowerCase());
  const canonicalId = index.byName.get(canonicalName.trim().toLowerCase());
  if (!duplicateId || !canonicalId) throw new Error(`Could not resolve topic ids for merge: ${title}`);

  for (const dsId of TOPIC_RELATION_SOURCES) {
    const rows = await queryDataSource(dsId, { filter: { property: "Topics", relation: { contains: duplicateId } } });
    for (const row of rows) {
      const current = relationIds(row.properties.Topics).filter((id) => id !== duplicateId);
      if (!current.includes(canonicalId)) current.push(canonicalId);
      await updatePage(row.id, { Topics: relation(current) });
    }
  }
  await trashPage(duplicateId);
}

async function executePortfolioApproval(suggestion: NotionPage): Promise<void> {
  const blurb = await getSuggestionBodyText(suggestion.id);
  const projectIds = relationIds(suggestion.properties["Related Project"]);
  const resourceIds = relationIds(suggestion.properties["Related Resource"]);
  const targetId = projectIds[0] ?? resourceIds[0];
  if (!targetId) return;
  await updatePage(targetId, { "Portfolio Blurb": richText(blurb) });
}

export async function approveSuggestion(suggestionId: string): Promise<void> {
  const suggestion = await retrievePage(suggestionId);
  const type = suggestion.properties.Type?.select?.name;
  const titleText = plainText(suggestion.properties.Title);

  if (type === "Hygiene Suggestion") {
    await executeHygieneMerge(titleText);
  } else if (type === "Portfolio Draft") {
    await executePortfolioApproval(suggestion);
  }
  // Digest / LinkedIn Draft: purely informational, no Notion-side action beyond status.

  await updatePage(suggestionId, { Status: select("Approved") });
}

export async function dismissSuggestion(suggestionId: string): Promise<void> {
  await updatePage(suggestionId, { Status: select("Dismissed") });
}
