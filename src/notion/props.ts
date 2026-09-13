// Builders for Notion API property VALUES (the raw REST shapes, not the
// simplified SQLite-style values the interactive MCP tools accept).

export const title = (text: string) => ({ title: [{ type: "text", text: { content: text.slice(0, 2000) } }] });
export const richText = (text: string) => ({ rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] });
export const select = (name: string) => ({ select: { name } });
export const multiSelect = (names: string[]) => ({ multi_select: names.map((name) => ({ name })) });
export const checkbox = (value: boolean) => ({ checkbox: value });
export const url = (value: string) => ({ url: value });
export const date = (isoDate: string) => ({ date: { start: isoDate } });
export const relation = (pageIds: string[]) => ({ relation: pageIds.map((id) => ({ id })) });

// Parsers: pull a plain value back out of a Notion API property object.
export function plainText(prop: any): string {
  const arr = prop?.title ?? prop?.rich_text ?? [];
  return arr.map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");
}
export const selectName = (prop: any): string | undefined => prop?.select?.name;
export const multiSelectNames = (prop: any): string[] => (prop?.multi_select ?? []).map((o: any) => o.name);
export const checkboxValue = (prop: any): boolean => Boolean(prop?.checkbox);
export const urlValue = (prop: any): string | undefined => prop?.url ?? undefined;
export const relationIds = (prop: any): string[] => (prop?.relation ?? []).map((r: any) => r.id);
export const dateStart = (prop: any): string | undefined => prop?.date?.start ?? undefined;

// Minimal Markdown -> Notion blocks (paragraphs, #/## headings, - bullets).
// Enough for digests/portfolio blurbs/journal appends; not a full parser.
export function markdownToBlocks(markdown: string): unknown[] {
  const lines = markdown.split("\n");
  const blocks: unknown[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      blocks.push(headingBlock(2, line.slice(3)));
    } else if (line.startsWith("# ")) {
      blocks.push(headingBlock(1, line.slice(2)));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(bulletBlock(line.slice(2)));
    } else {
      blocks.push(paragraphBlock(line));
    }
  }
  return blocks;
}

const richTextArr = (text: string) => [{ type: "text", text: { content: text.slice(0, 2000) } }];
function paragraphBlock(text: string) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richTextArr(text) } };
}
function headingBlock(level: 1 | 2, text: string) {
  const type = level === 1 ? "heading_1" : "heading_2";
  return { object: "block", type, [type]: { rich_text: richTextArr(text) } };
}
function bulletBlock(text: string) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richTextArr(text) } };
}
