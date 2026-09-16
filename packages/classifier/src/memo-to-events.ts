import type { Argument, FlowEvent } from "@autoflow/core";
import type { ExtractedClaim, ExtractedEvidence, IdFactory } from "./types.ts";

const normalise = (text: string) => text.trim().toLowerCase();

/** Removes blank entries and case-insensitive duplicates by text, keeping first occurrences. */
const distinctByText = <T extends { readonly text: string }>(items: readonly T[]): readonly T[] =>
  items.reduce<{ seen: ReadonlySet<string>; kept: readonly T[] }>(
    (acc, item) => {
      const key = normalise(item.text);
      if (key === "" || acc.seen.has(key)) return acc;
      return { seen: new Set([...acc.seen, key]), kept: [...acc.kept, { ...item, text: item.text.trim() }] };
    },
    { seen: new Set(), kept: [] },
  ).kept;

const evidenceArgument = (claimId: string, evidence: ExtractedEvidence, makeId: IdFactory): Argument => ({
  id: makeId(),
  claimId,
  text: evidence.text,
  stance: "support",
  respondsTo: null,
  source: "memo",
  sourceRefs: evidence.excerpt.trim() === "" ? [] : [evidence.excerpt.trim()],
});

/**
 * Turns extracted claims into the events that seed a flow: one ClaimAdded per claim, followed by an
 * ArgumentAdded (support, source "memo") for each piece of evidence, so a row starts as
 * claim → +evidence → +evidence before the room says anything. Pure.
 */
export const memoToEvents = (claims: readonly ExtractedClaim[], makeId: IdFactory): readonly FlowEvent[] =>
  distinctByText(claims).flatMap((claim, order): readonly FlowEvent[] => {
    const id = makeId();
    const topic = claim.topic.trim();
    const claimAdded: FlowEvent = { type: "ClaimAdded", claim: { id, text: claim.text, order, ...(topic ? { topic } : {}) } };
    const evidence = distinctByText(claim.evidence ?? []).map(
      (e): FlowEvent => ({ type: "ArgumentAdded", argument: evidenceArgument(id, e, makeId) }),
    );
    return [claimAdded, ...evidence];
  });
