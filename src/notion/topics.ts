import { ids } from "../config.js";
import { createPage, queryDataSource } from "./client.js";
import { plainText, title } from "./props.js";

export interface TopicIndex {
  byName: Map<string, string>; // lowercase name -> page id
}

/** Bulk-load all Topics once per job run — avoids one search per candidate topic per item. */
export async function loadTopicIndex(): Promise<TopicIndex> {
  const pages = await queryDataSource(ids.topics);
  const byName = new Map<string, string>();
  for (const page of pages) {
    const name = plainText(page.properties.Name).trim().toLowerCase();
    if (name) byName.set(name, page.id);
  }
  return { byName };
}

/** Find-or-create a Topic node by name (case-insensitive), updating the local index. */
export async function resolveTopic(index: TopicIndex, name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const existing = index.byName.get(key);
  if (existing) return existing;

  const page = await createPage({
    parent: { data_source_id: ids.topics },
    properties: { Name: title(name.trim()) },
  });
  index.byName.set(key, page.id);
  return page.id;
}

export async function resolveTopics(index: TopicIndex, names: string[]): Promise<string[]> {
  const ids_: string[] = [];
  for (const name of names) {
    if (!name.trim()) continue;
    ids_.push(await resolveTopic(index, name));
  }
  return ids_;
}
