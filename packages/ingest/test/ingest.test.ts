import { describe, expect, it } from "vitest";
import { ingestFile, isFigureWorthKeeping, parseMarkdown, titleFromMarkdown } from "../src/index.ts";
import { buildFixtureDocx, chartPng } from "./fixtures/build-docx.ts";

describe("ingestFile with .docx", () => {
  it("produces markdown with a heading, a flat table, and only the meaningful figure", async () => {
    const result = await ingestFile("Acme Memo.docx", await buildFixtureDocx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { title, markdown, figures } = result.value;

    expect(title).toBe("Investment Memo: Acme");
    expect(markdown).toContain("# Investment Memo: Acme");
    expect(markdown).not.toContain("\uFFFD");
    expect(markdown).not.toMatch(/^Investment Memo: Acme \d+$/m);

    expect(markdown).toMatch(/^\| Metric \| Value \|$/m);
    expect(markdown).toMatch(/^\| ARR · trailing \| \$1\.4M \|$/m);

    expect(figures).toHaveLength(1);
    expect(figures[0]).toMatchObject({ index: 1, mediaType: "image/png" });
    expect(Buffer.from(figures[0]!.data, "base64").equals(chartPng)).toBe(true);
    expect(markdown).toContain("![Figure 1](figure:1)");
    expect(markdown.indexOf("![Figure 1]")).toBeLessThan(markdown.indexOf("Revenue grew"));
  });

  it("reports a corrupt document without throwing", async () => {
    const result = await ingestFile("bad.docx", Buffer.from("not a zip"));
    expect(result).toMatchObject({ ok: false, error: { code: "MALFORMED_DOCUMENT" } });
  });
});

describe("ingestFile with text formats", () => {
  it("accepts markdown and derives the title from the first heading", async () => {
    const result = await ingestFile("memo.md", Buffer.from("# Larkspur\n\nbody"));
    expect(result).toMatchObject({ ok: true, value: { title: "Larkspur", markdown: "# Larkspur\n\nbody", figures: [] } });
  });

  it("falls back to a humanised file name when there is no heading", async () => {
    const result = await ingestFile("quill_seed-memo.txt", Buffer.from("no heading"));
    expect(result.ok && result.value.title).toBe("quill seed memo");
  });

  it("rejects empty, oversized, and unsupported files", async () => {
    expect(await ingestFile("a.md", Buffer.from("  \n"))).toMatchObject({ ok: false, error: { code: "EMPTY_DOCUMENT" } });
    expect(await ingestFile("a.pdf", Buffer.from("x"))).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_FORMAT" } });
    expect(await ingestFile("a.md", Buffer.alloc(25_000_001))).toMatchObject({ ok: false, error: { code: "TOO_LARGE" } });
  });
});

describe("helpers", () => {
  it("keeps only supported, non-icon, non-huge images", () => {
    expect(isFigureWorthKeeping("image/png", 50_000)).toBe(true);
    expect(isFigureWorthKeeping("image/png", 500)).toBe(false);
    expect(isFigureWorthKeeping("image/png", 6_000_000)).toBe(false);
    expect(isFigureWorthKeeping("image/x-emf", 50_000)).toBe(false);
  });

  it("titleFromMarkdown accepts up to h3 and skips deeper or missing headings", () => {
    expect(titleFromMarkdown("intro\n## Deal\n", "f")).toBe("Deal");
    expect(titleFromMarkdown("#### too deep", "f")).toBe("f");
  });

  it("titleFromMarkdown strips emphasis and falls back past generic section headings", () => {
    expect(titleFromMarkdown("# **Larkspur Robotics**", "f")).toBe("Larkspur Robotics");
    expect(titleFromMarkdown("# **Executive Summary**\n\nbody", "Larkspur Memo")).toBe("Larkspur Memo");
    expect(titleFromMarkdown("## Table of Contents:", "Harbor Memo")).toBe("Harbor Memo");
    expect(parseMarkdown("plain", "Name").ok).toBe(true);
  });
});
