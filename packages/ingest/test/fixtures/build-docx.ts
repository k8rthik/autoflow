import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const chartPng = readFileSync(join(here, "chart.png"));
export const dotPng = readFileSync(join(here, "dot.png"));

const cell = (lines: readonly string[]) => new TableCell({ children: lines.map((t) => new Paragraph(t)) });

/** A small memo with a heading, prose, a two-paragraph table cell, a real figure and an icon-sized image. */
export const buildFixtureDocx = async (): Promise<Buffer> => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Investment Memo: Acme", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun("Acme sells widgets. \uFFFD The market is large.")] }),
          new Paragraph("Acme 1"),
          new Table({
            rows: [
              new TableRow({ children: [cell(["Metric"]), cell(["Value"])] }),
              new TableRow({ children: [cell(["ARR", "trailing"]), cell(["$1.4M"])] }),
            ],
          }),
          new Paragraph({ children: [new ImageRun({ type: "png", data: chartPng, transformation: { width: 96, height: 96 } })] }),
          new Paragraph("Revenue grew as the chart shows."),
          new Paragraph({ children: [new ImageRun({ type: "png", data: dotPng, transformation: { width: 1, height: 1 } })] }),
          new Paragraph("Acme 2"),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
};
