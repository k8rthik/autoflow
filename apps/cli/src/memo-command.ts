import { memoToEvents, type ClaimExtractor, type ExtractionError, type IdFactory } from "@autoflow/classifier";
import { replay, type FlowEvent, type FlowState } from "@autoflow/core";
import { renderFlowMarkdown, renderFlowText } from "./render.ts";

export interface MemoCommandInput {
  readonly memoText: string;
  readonly extractor: ClaimExtractor;
  readonly makeId: IdFactory;
}

export interface MemoCommandOutput {
  readonly events: readonly FlowEvent[];
  readonly state: FlowState;
  readonly text: string;
  readonly markdown: string;
}

export type MemoCommandResult =
  | { readonly ok: true; readonly value: MemoCommandOutput }
  | { readonly ok: false; readonly error: ExtractionError };

/** Memo text in, seeded flow out. All I/O stays in main.ts so this is testable with a fake extractor. */
export const runMemoCommand = async ({ memoText, extractor, makeId }: MemoCommandInput): Promise<MemoCommandResult> => {
  const extraction = await extractor.extractClaims(memoText);
  if (!extraction.ok) return extraction;

  const events = memoToEvents(extraction.claims, makeId);
  const replayed = replay(events);
  if (!replayed.ok) {
    // memoToEvents only emits ClaimAdded with fresh ids, so this is a programming error, not user input.
    throw new Error(`Generated events failed to replay: ${replayed.error.message}`);
  }

  const state = replayed.value;
  return { ok: true, value: { events, state, text: renderFlowText(state), markdown: renderFlowMarkdown(state) } };
};
