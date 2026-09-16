import type Anthropic from "@anthropic-ai/sdk";
import type { MemoFigure, MemoInput } from "./types.ts";

const FIGURE_LINE = /^!\[Figure (\d+)\]\(figure:\d+\)$/;

export const toMemoInput = (memo: string | MemoInput): MemoInput =>
  typeof memo === "string" ? { markdown: memo, figures: [] } : memo;

const imageBlock = (figure: MemoFigure): Anthropic.ImageBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: figure.mediaType, data: figure.data },
});

const textBlock = (text: string): Anthropic.TextBlockParam => ({ type: "text", text });

/**
 * Builds the user message: markdown split at each figure reference, with the figure's image block
 * inserted in place and labelled, so a chart is read in the context of the text around it.
 * Figures never referenced from the text are appended at the end so nothing is dropped.
 */
export const buildMemoContent = (memo: MemoInput): Anthropic.ContentBlockParam[] => {
  const byIndex = new Map(memo.figures.map((f) => [f.index, f]));
  const used = new Set<number>();
  const blocks: Anthropic.ContentBlockParam[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text !== "") blocks.push(textBlock(text));
    buffer = [];
  };

  for (const line of memo.markdown.split("\n")) {
    const match = FIGURE_LINE.exec(line.trim());
    const figure = match ? byIndex.get(Number(match[1])) : undefined;
    if (!figure) {
      buffer.push(line);
      continue;
    }
    buffer.push(`[Figure ${figure.index}]`);
    flush();
    blocks.push(imageBlock(figure));
    used.add(figure.index);
  }
  flush();

  const unreferenced = memo.figures.filter((f) => !used.has(f.index));
  for (const figure of unreferenced) {
    blocks.push(textBlock(`[Figure ${figure.index}]`));
    blocks.push(imageBlock(figure));
  }
  return blocks.length > 0 ? blocks : [textBlock(memo.markdown)];
};
