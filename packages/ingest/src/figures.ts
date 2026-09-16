import type { FigureMediaType } from "@autoflow/classifier";

/** Images smaller than this are icons, spacers and bullets, not figures. */
export const MIN_FIGURE_BYTES = 3_000;
/** The Claude API rejects images above 5 MB; leave headroom for base64 overhead. */
export const MAX_FIGURE_BYTES = 4_500_000;

const SUPPORTED: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export const isSupportedMediaType = (contentType: string): contentType is FigureMediaType => SUPPORTED.has(contentType);

export const FIGURE_LINE = /^!\[Figure (\d+)\]\(figure:(\d+)\)$/;

/** True when the image is worth sending to the model. */
export const isFigureWorthKeeping = (contentType: string, bytes: number): boolean =>
  isSupportedMediaType(contentType) && bytes >= MIN_FIGURE_BYTES && bytes <= MAX_FIGURE_BYTES;
