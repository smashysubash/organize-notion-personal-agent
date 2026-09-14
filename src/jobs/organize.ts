import { ids } from "../config.js";
import { askLLMJSON } from "../llm/client.js";
import {
  createPage,
  retrievePage,
  updatePage,
  appendBlocks,
} from "../notion/client.js";
import {
  title,
  richText,
  select,
  checkbox,
  url as urlProp,
  date,
  relation,
  relationIds,
  markdownToBlocks,
} from "../notion/props.js";
import { loadTopicIndex, resolveTopics } from "../notion/topics.js";
import { findOrCreateArea, findOrCreateTodayJournal } from "./triage.js";

export interface ReframedItem {
  destination: "Projects" | "Resources" | "Ideas" | "Journal" | "Areas";
  title: string;
  reframedContent: string;
  topics: string[];
  resourceType?: "Article" | "Video" | "Book" | "Note" | "Link";
  sourceUrl?: string;
  summary?: string;
  horizon?: "Short-term" | "Long-term (Goal)";
  deadline?: string;
  areaName?: string;
}

export interface OrganizedItemResult {
  id: string;
  url: string;
  destination: "Projects" | "Resources" | "Ideas" | "Journal" | "Areas";
  title: string;
  topics: string[];
  summary?: string;
  reframedContent: string;
  error?: string;
}

export interface OrganizeResult {
  ok: boolean;
  totalParsed: number;
  filedCount: number;
  items: OrganizedItemResult[];
  summary: string[];
  inboxPageId?: string;
}

/**
 * Takes raw unstructured text (notes, brain dump, thoughts, meeting notes, links),
 * uses the LLM to reframe and structure the content, and files each resulting item
 * into the appropriate Notion Second Brain database.
 */
export async function reframeAndOrganize(rawText: string): Promise<OrganizeResult> {
  const prompt = `You are the organizing agent for the user's Notion Second Brain.
Analyze the following raw user input text. The user can enter any unstructured thoughts, brain dumps, meeting notes, tasks, ideas, bookmarks, reflections, or snippets.

Your job is to REFRAME and BREAK DOWN this input into 1 or more cohesive, clean, actionable, and structured items.
For each item, determine:
1. "destination": Choose exactly one:
   - "Projects": For actionable tasks, goals, deliverables, or projects with a concrete outcome.
   - "Resources": For reference material, tools, links, books, articles, guides, or bookmarks.
   - "Ideas": For undeveloped sparks, concepts, hypotheses, creative ideas, or seed thoughts.
   - "Journal": For personal reflections, logs of what happened today, feelings, diary notes.
   - "Areas": For ongoing life domains (e.g. Health, Career, Finance, Personal) without a fixed completion date.
2. "title": A clear, concise, reframed title that captures the essence of the item.
3. "reframedContent": The reframed, polished, and structured content in Markdown (bullet points, clear headers, actionable next steps, key takeaways, or cleaned up journal reflection). Do NOT leave it messy or raw.
4. "topics": 1 to 4 concise topic names (e.g. ["Engineering", "TypeScript"], ["Health", "Fitness"]).
5. Additional fields where applicable:
   - For Projects: "horizon" ("Short-term" or "Long-term (Goal)"), "deadline" ("YYYY-MM-DD" if mentioned or inferable), "areaName" (e.g. "Work", "Personal")
   - For Resources: "resourceType" ("Article" | "Video" | "Book" | "Note" | "Link"), "sourceUrl" (extract URL if mentioned in text), "summary" (1-3 line crisp summary)
   - For Areas: "areaName"

Input text to reframe & organize:
---
${rawText}
---

Return a JSON array of items matching this TypeScript schema:
Array<{
  destination: "Projects" | "Resources" | "Ideas" | "Journal" | "Areas";
  title: string;
  reframedContent: string;
  topics: string[];
  resourceType?: "Article" | "Video" | "Book" | "Note" | "Link";
  sourceUrl?: string;
  summary?: string;
  horizon?: "Short-term" | "Long-term (Goal)";
  deadline?: string;
  areaName?: string;
}>`;

  let classifiedItems: ReframedItem[] = [];
  try {
    classifiedItems = await askLLMJSON<ReframedItem[]>(prompt, 2048);
  } catch (err) {
    console.error("[reframeAndOrganize] LLM JSON parsing failed:", (err as Error).message);
    // Fallback: create a single item classified as Resource or Idea
    classifiedItems = [
      {
        destination: rawText.includes("http://") || rawText.includes("https://") ? "Resources" : "Ideas",
        title: rawText.trim().split("\n")[0].slice(0, 80) || "Captured Note",
        reframedContent: rawText.trim(),
        topics: ["Quick Capture"],
        resourceType: "Note",
      },
    ];
  }

  if (!Array.isArray(classifiedItems) || classifiedItems.length === 0) {
    classifiedItems = [
      {
        destination: "Ideas",
        title: rawText.trim().split("\n")[0].slice(0, 80) || "Captured Note",
        reframedContent: rawText.trim(),
        topics: ["Quick Capture"],
      },
    ];
  }

  // Load topics index once for efficient matching
  const topicIndex = await loadTopicIndex();
  const summary: string[] = [];
  const results: OrganizedItemResult[] = [];
  let filedCount = 0;

  for (const item of classifiedItems) {
    const rawTopics = Array.isArray(item.topics) ? item.topics : [];
    const topicIds = await resolveTopics(topicIndex, rawTopics);
    const itemBlocks = markdownToBlocks(item.reframedContent ?? "");
    const safeBlocks = itemBlocks.slice(0, 100);

    try {
      if (item.destination === "Projects") {
        let areaId: string | undefined;
        if (item.areaName) {
          try {
            areaId = await findOrCreateArea(item.areaName);
          } catch (e) {
            console.warn(`[organize] Could not find or create area "${item.areaName}":`, (e as Error).message);
          }
        }

        const props: Record<string, unknown> = {
          Name: title(item.title),
          Status: select("Not Started"),
          Horizon: select(item.horizon ?? "Short-term"),
          Topics: relation(topicIds),
          Shareable: checkbox(false),
        };
        if (item.deadline) props.Deadline = date(item.deadline);
        if (areaId) props.Area = relation([areaId]);

        const pageOpts: any = {
          parent: { data_source_id: ids.projects },
          properties: props,
        };
        if (safeBlocks.length > 0) pageOpts.children = safeBlocks;

        const page = await createPage(pageOpts);
        results.push({
          id: page.id,
          url: page.url,
          destination: "Projects",
          title: item.title,
          topics: rawTopics,
          reframedContent: item.reframedContent,
          summary: `Project (${item.horizon ?? "Short-term"})${item.deadline ? ` due ${item.deadline}` : ""}`,
        });
        summary.push(`Projects: "${item.title}"`);
        filedCount++;
      } else if (item.destination === "Resources") {
        const props: Record<string, unknown> = {
          Name: title(item.title),
          Type: select(item.resourceType ?? "Note"),
          "AI Summary": richText((item.summary || item.reframedContent).slice(0, 2000)),
          Topics: relation(topicIds),
          Status: select("Active"),
          Shareable: checkbox(false),
        };
        if (item.sourceUrl) props["Source URL"] = urlProp(item.sourceUrl);

        const pageOpts: any = {
          parent: { data_source_id: ids.resources },
          properties: props,
        };
        if (safeBlocks.length > 0) pageOpts.children = safeBlocks;

        const page = await createPage(pageOpts);
        results.push({
          id: page.id,
          url: page.url,
          destination: "Resources",
          title: item.title,
          topics: rawTopics,
          reframedContent: item.reframedContent,
          summary: item.summary ?? item.reframedContent.slice(0, 160),
        });
        summary.push(`Resources: "${item.title}"`);
        filedCount++;
      } else if (item.destination === "Ideas") {
        const pageOpts: any = {
          parent: { data_source_id: ids.ideasVault },
          properties: {
            Name: title(item.title),
            Status: select("Seed"),
            Topics: relation(topicIds),
          },
        };
        if (safeBlocks.length > 0) pageOpts.children = safeBlocks;

        const page = await createPage(pageOpts);
        results.push({
          id: page.id,
          url: page.url,
          destination: "Ideas",
          title: item.title,
          topics: rawTopics,
          reframedContent: item.reframedContent,
          summary: `Ideas Vault: Seed note`,
        });
        summary.push(`Ideas Vault: "${item.title}"`);
        filedCount++;
      } else if (item.destination === "Journal") {
        const journalId = await findOrCreateTodayJournal();
        const headerBlock = markdownToBlocks(`### ${item.title}`);
        await appendBlocks(journalId, [...headerBlock, ...safeBlocks]);

        if (topicIds.length) {
          try {
            const page = await retrievePage(journalId);
            const current = relationIds(page.properties.Topics);
            const merged = Array.from(new Set([...current, ...topicIds]));
            await updatePage(journalId, { Topics: relation(merged) });
          } catch (e) {
            console.warn("[organize] Could not update Journal topics:", (e as Error).message);
          }
        }

        const journalPage = await retrievePage(journalId);
        results.push({
          id: journalId,
          url: journalPage.url,
          destination: "Journal",
          title: item.title,
          topics: rawTopics,
          reframedContent: item.reframedContent,
          summary: `Appended to Today's Daily Journal`,
        });
        summary.push(`Daily Journal: "${item.title}"`);
        filedCount++;
      } else if (item.destination === "Areas") {
        const areaName = item.areaName ?? item.title;
        const areaId = await findOrCreateArea(areaName);
        const headerBlock = markdownToBlocks(`### ${item.title}`);
        await appendBlocks(areaId, [...headerBlock, ...safeBlocks]);

        if (topicIds.length) {
          try {
            const page = await retrievePage(areaId);
            const current = relationIds(page.properties.Topics);
            const merged = Array.from(new Set([...current, ...topicIds]));
            await updatePage(areaId, { Topics: relation(merged) });
          } catch (e) {
            console.warn("[organize] Could not update Area topics:", (e as Error).message);
          }
        }

        const areaPage = await retrievePage(areaId);
        results.push({
          id: areaId,
          url: areaPage.url,
          destination: "Areas",
          title: item.title,
          topics: rawTopics,
          reframedContent: item.reframedContent,
          summary: `Attached to Area "${areaName}"`,
        });
        summary.push(`Areas: attached to "${areaName}"`);
        filedCount++;
      }
    } catch (err) {
      console.error(`[organize] Failed to file item "${item.title}":`, (err as Error).message);
      summary.push(`FAILED to file "${item.title}": ${(err as Error).message}`);
      results.push({
        id: "",
        url: "",
        destination: item.destination,
        title: item.title,
        topics: rawTopics,
        reframedContent: item.reframedContent,
        error: (err as Error).message,
      });
    }
  }

  // Audit trail: Log original captured input to Inbox as Filed
  let inboxPageId: string | undefined;
  try {
    const previewName = rawText.trim().replace(/\s+/g, " ").slice(0, 90) || "Quick Capture";
    const rawType = rawText.includes("http://") || rawText.includes("https://") ? "Link" : "Thought";
    const inboxPage = await createPage({
      parent: { data_source_id: ids.inbox },
      properties: {
        Name: title(previewName),
        "Raw Type": select(rawType),
        Status: select("Filed"),
      },
      children: markdownToBlocks(`**Original Captured Input:**\n\n${rawText.slice(0, 4000)}`),
    });
    inboxPageId = inboxPage.id;
  } catch (err) {
    console.warn("[organize] Could not log capture to Inbox:", (err as Error).message);
  }

  return {
    ok: filedCount > 0,
    totalParsed: classifiedItems.length,
    filedCount,
    items: results,
    summary,
    inboxPageId,
  };
}
