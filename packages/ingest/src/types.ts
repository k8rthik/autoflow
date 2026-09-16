import type { MemoInput } from "@autoflow/classifier";

export type { FigureMediaType, MemoFigure, MemoInput } from "@autoflow/classifier";

/** What every memo becomes before extraction, whatever file it arrived as. */
export interface MemoDocument extends MemoInput {
  readonly title: string;
}

export type IngestErrorCode = "UNSUPPORTED_FORMAT" | "EMPTY_DOCUMENT" | "MALFORMED_DOCUMENT" | "TOO_LARGE";

export interface IngestError {
  readonly code: IngestErrorCode;
  readonly message: string;
}

export type IngestResult = { readonly ok: true; readonly value: MemoDocument } | { readonly ok: false; readonly error: IngestError };
