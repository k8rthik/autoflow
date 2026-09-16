import { basename, extname } from "node:path";
import { parseDocx } from "./docx.ts";
import { parseMarkdown } from "./markdown.ts";
import type { IngestResult } from "./types.ts";

export const MAX_UPLOAD_BYTES = 25_000_000;
const DOCX_EXTENSIONS: ReadonlySet<string> = new Set([".docx"]);
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([".md", ".markdown", ".txt"]);

export const SUPPORTED_EXTENSIONS: readonly string[] = [...DOCX_EXTENSIONS, ...TEXT_EXTENSIONS];

const titleFromFilename = (filename: string): string => basename(filename, extname(filename)).replace(/[_-]+/g, " ").trim();

/** Routes a file to the right parser by extension. The single entry point for CLI and server. */
export const ingestFile = async (filename: string, buffer: Buffer): Promise<IngestResult> => {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: { code: "TOO_LARGE", message: `Files must be under ${MAX_UPLOAD_BYTES / 1_000_000} MB` } };
  }
  const ext = extname(filename).toLowerCase();
  const fallbackTitle = titleFromFilename(filename);
  if (DOCX_EXTENSIONS.has(ext)) return parseDocx(buffer, fallbackTitle);
  if (TEXT_EXTENSIONS.has(ext)) return parseMarkdown(buffer.toString("utf8"), fallbackTitle);
  return {
    ok: false,
    error: { code: "UNSUPPORTED_FORMAT", message: `Unsupported file type "${ext || "none"}". Use ${SUPPORTED_EXTENSIONS.join(", ")}` },
  };
};
