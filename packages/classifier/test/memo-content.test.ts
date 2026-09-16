import { describe, expect, it } from "vitest";
import { buildMemoContent, toMemoInput, type MemoFigure } from "../src/index.ts";

const fig = (index: number): MemoFigure => ({ index, mediaType: "image/png", data: `data${index}` });

describe("buildMemoContent", () => {
  it("wraps plain text in one text block", () => {
    expect(buildMemoContent(toMemoInput("hello"))).toEqual([{ type: "text", text: "hello" }]);
  });

  it("splits at figure references and inserts the image in place, labelled", () => {
    const markdown = "# Memo\n\nGrowth is strong.\n\n![Figure 1](figure:1)\n\nAs shown above.";
    const blocks = buildMemoContent({ markdown, figures: [fig(1)] });
    expect(blocks).toEqual([
      { type: "text", text: "# Memo\n\nGrowth is strong.\n\n[Figure 1]" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
      { type: "text", text: "As shown above." },
    ]);
  });

  it("keeps a reference to a missing figure as text and appends unreferenced figures at the end", () => {
    const blocks = buildMemoContent({ markdown: "![Figure 9](figure:9)\ntext", figures: [fig(2)] });
    expect(blocks).toEqual([
      { type: "text", text: "![Figure 9](figure:9)\ntext" },
      { type: "text", text: "[Figure 2]" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
    ]);
  });

  it("toMemoInput passes a MemoInput through untouched", () => {
    const input = { markdown: "m", figures: [fig(1)] };
    expect(toMemoInput(input)).toBe(input);
  });
});
