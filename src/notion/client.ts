import { config } from "../config.js";

const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, any>;
}

export async function queryDataSource(
  dataSourceId: string,
  opts: { filter?: unknown; sorts?: unknown[]; page_size?: number } = {}
): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: opts.page_size ?? 100 };
    if (opts.filter) body.filter = opts.filter;
    if (opts.sorts) body.sorts = opts.sorts;
    if (cursor) body.start_cursor = cursor;
    const page = await request<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      `/data_sources/${dataSourceId}/query`,
      "POST",
      body
    );
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
  } while (cursor);
  return results;
}

export async function createPage(opts: {
  parent: { data_source_id: string } | { page_id: string };
  properties: Record<string, unknown>;
  children?: unknown[];
  icon?: { type: "emoji"; emoji: string };
}): Promise<NotionPage> {
  return request<NotionPage>("/pages", "POST", opts);
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  return request<NotionPage>(`/pages/${pageId}`, "PATCH", { properties });
}

export async function retrievePage(pageId: string): Promise<NotionPage> {
  return request<NotionPage>(`/pages/${pageId}`, "GET");
}

export async function trashPage(pageId: string): Promise<void> {
  await request(`/pages/${pageId}`, "PATCH", { in_trash: true });
}

export async function appendBlocks(pageId: string, children: unknown[]): Promise<void> {
  await request(`/blocks/${pageId}/children`, "PATCH", { children });
}

export async function retrieveBlockChildren(blockId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const page = await request<{ results: any[]; has_more: boolean; next_cursor: string | null }>(
      `/blocks/${blockId}/children${qs}`,
      "GET"
    );
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
  } while (cursor);
  return results;
}

export async function search(query: string, filterPages = true): Promise<NotionPage[]> {
  const body: Record<string, unknown> = { query };
  if (filterPages) body.filter = { property: "object", value: "page" };
  const res = await request<{ results: NotionPage[] }>("/search", "POST", body);
  return res.results;
}
