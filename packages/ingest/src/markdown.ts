import type { IngestResult } from "./types.ts";

/** Section names that Word memos often style as their first heading; none of them names the deal. */
const GENERIC_HEADINGS: ReadonlySet<string> = new Set([
  "executive summary", "summary", "overview", "table of contents", "contents", "introduction",
  "investment memo", "memo", "deal terms", "investment decision", "recommendation", "thesis",
]);

const cleanHeading = (line: string): string => line.replace(/^#{1,3}\s+/, "").replace(/[*_`]+/g, "").trim();

/**
 * First markdown heading, minus hashes and emphasis; the fallback (usually the file name) when there is
 * no heading or the first heading is a generic section name rather than the memo's title.
 */
export const titleFromMarkdown = (markdown: string, fallback: string): string => {
  const heading = markdown.split("\n").find((line) => /^#{1,3}\s+\S/.test(line));
  if (!heading) return fallback;
  const title = cleanHeading(heading);
  return title === "" || GENERIC_HEADINGS.has(title.toLowerCase().replace(/[:.]+$/, "")) ? fallback : title;
};

export const parseMarkdown = (text: string, fallbackTitle: string): IngestResult => {
  const markdown = text.trim();
  if (markdown === "") return { ok: false, error: { code: "EMPTY_DOCUMENT", message: "The file is empty" } };
  return { ok: true, value: { title: titleFromMarkdown(markdown, fallbackTitle), markdown, figures: [] } };
};
