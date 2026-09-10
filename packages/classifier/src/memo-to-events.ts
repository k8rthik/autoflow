import type { FlowEvent } from "@autoflow/core";
import type { ExtractedClaim, IdFactory } from "./types.ts";

const normalise = (text: string) => text.trim().toLowerCase();

/** Removes blank claims and case-insensitive duplicates, keeping first occurrences. */
const distinctClaims = (claims: readonly ExtractedClaim[]): readonly ExtractedClaim[] =>
  claims.reduce<{ seen: ReadonlySet<string>; kept: readonly ExtractedClaim[] }>(
    (acc, claim) => {
      const key = normalise(claim.text);
      if (key === "" || acc.seen.has(key)) return acc;
      return { seen: new Set([...acc.seen, key]), kept: [...acc.kept, { ...claim, text: claim.text.trim() }] };
    },
    { seen: new Set(), kept: [] },
  ).kept;

/** Turns extracted claims into the ClaimAdded events that seed a flow. Pure. */
export const memoToEvents = (claims: readonly ExtractedClaim[], makeId: IdFactory): readonly FlowEvent[] =>
  distinctClaims(claims).map((claim, order) => ({
    type: "ClaimAdded",
    claim: { id: makeId(), text: claim.text, order },
  }));
