/// <reference path="./turndown-plugin-gfm.d.ts" />
import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { isFigureWorthKeeping, isSupportedMediaType } from "./figures.ts";
import { titleFromMarkdown } from "./markdown.ts";
import type { MemoFigure } from "@autoflow/classifier";
import type { IngestResult } from "./types.ts";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
turndown.use(gfm);

/** Symbol-font glyphs (Wingdings bullets, emoji in exports) arrive as U+FFFD; they carry no meaning. */
const stripReplacementChars = (text: string): string => text.replace(/\uFFFD/g, "");

/** Exports from page-based tools print "Title 2", "Title 3" footers into the body. */
const stripPageFooters = (markdown: string, title: string): string => {
  const footer = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+$`, "gm");
  return markdown.replace(footer, "");
};

/** Collapses the runs of blank lines Word documents produce. */
const tidy = (markdown: string): string => markdown.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

/**
 * GFM table cells cannot hold block content. Word puts every cell's text in <p> elements, so flatten
 * each cell to one line, and promote the first row to a header row so the table renders at all.
 */
const flattenTables = (html: string): string =>
  html
    .replace(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/g, (_m, tag: string, attrs: string, inner: string) => {
      const flat = inner.replace(/<\/p>\s*<p[^>]*>/g, " · ").replace(/<\/?p[^>]*>/g, "").replace(/\s+/g, " ").trim();
      return `<t${tag}${attrs}>${flat}</t${tag}>`;
    })
    .replace(/<table>\s*<tr>([\s\S]*?)<\/tr>/g, (_m, firstRow: string) => `<table><tr>${firstRow.replace(/<(\/?)td/g, "<$1th")}</tr>`);

/**
 * .docx → markdown with GFM tables, plus the figures in document order. Each kept image is replaced
 * by a `![Figure n](figure:n)` line so the extractor can interleave it with the surrounding text.
 */
export const parseDocx = async (buffer: Buffer, fallbackTitle: string): Promise<IngestResult> => {
  const figures: MemoFigure[] = [];

  const convertImage = mammoth.images.imgElement(async (image) => {
    if (!isSupportedMediaType(image.contentType)) return { src: "", alt: "" };
    const data = await image.read("base64");
    if (!isFigureWorthKeeping(image.contentType, Buffer.byteLength(data, "base64"))) return { src: "", alt: "" };
    const index = figures.length + 1;
    figures.push({ index, mediaType: image.contentType, data });
    return { src: `figure:${index}`, alt: `Figure ${index}` };
  });

  try {
    const result = await mammoth.convertToHtml({ buffer }, { convertImage });
    const html = flattenTables(stripReplacementChars(result.value).replace(/<img[^>]*src=""[^>]*>/g, ""));
    const raw = turndown.turndown(html);
    const title = titleFromMarkdown(raw, fallbackTitle);
    const markdown = tidy(stripPageFooters(raw, title));
    if (markdown === "") return { ok: false, error: { code: "EMPTY_DOCUMENT", message: "The document has no readable text" } };
    return { ok: true, value: { title, markdown, figures } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: "MALFORMED_DOCUMENT", message: `Could not read the Word document: ${message}` } };
  }
};
