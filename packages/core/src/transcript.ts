export type SegmentId = string;

/**
 * A stretch of recognized speech (requirements §4.3). While `final` is false the text is the
 * recognizer's current guess, and a later segment with the same id replaces it. A final segment
 * never changes again; it is what an argument's `sourceRefs` point back to. A final segment can have
 * empty text when the recognizer withdraws an interim guess, which tells a view to drop that line.
 */
export interface TranscriptSegment {
  readonly id: SegmentId;
  readonly text: string;
  /** Milliseconds from the start of the audio stream the segment was heard on. */
  readonly startMs: number;
  readonly endMs: number;
  readonly final: boolean;
  /** 0 to 1, as reported by the recognizer. */
  readonly confidence: number;
}
