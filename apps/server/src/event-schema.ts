import type { FlowEvent } from "@autoflow/core";
import { z } from "zod";

/**
 * Validates client-submitted events at the HTTP boundary. `core` stays schema-free by design
 * (architecture §2), so the shape of a `FlowEvent` is restated here rather than imported — the
 * compiler checks the two agree via the `satisfies` assertion at the bottom of this file.
 */
const id = z.string().min(1).max(200);
const text = z.string().trim().min(1).max(2_000);
const stance = z.enum(["support", "attack", "question"]);
const provenance = z.enum(["memo", "prelim", "live", "manual"]);

const ClaimSchema = z.object({
  id,
  text,
  order: z.number().int().min(0),
  topic: z.string().trim().min(1).max(200).optional(),
});

const ArgumentSchema = z.object({
  id,
  claimId: id,
  text,
  stance,
  respondsTo: id.nullable(),
  source: provenance,
  sourceRefs: z.array(z.string().min(1).max(200)).max(100),
});

export const FlowEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ClaimAdded"), claim: ClaimSchema }),
  z.object({ type: z.literal("ClaimRenamed"), claimId: id, text }),
  z.object({ type: z.literal("ClaimRemoved"), claimId: id }),
  z.object({ type: z.literal("ClaimsMerged"), into: id, from: id }),
  z.object({ type: z.literal("ArgumentAdded"), argument: ArgumentSchema }),
  z.object({ type: z.literal("ArgumentEdited"), argumentId: id, text }),
  z.object({ type: z.literal("ArgumentMoved"), argumentId: id, toClaimId: id }),
  z.object({ type: z.literal("ArgumentRestanced"), argumentId: id, stance }),
  z.object({ type: z.literal("ArrowRepointed"), argumentId: id, respondsTo: id.nullable() }),
  z.object({ type: z.literal("ArgumentsMerged"), keep: id, drop: id }),
  z.object({ type: z.literal("ArgumentRemoved"), argumentId: id }),
]);

export type ParsedFlowEvent = z.infer<typeof FlowEventSchema>;

/**
 * Zod types an absent optional as `topic?: string | undefined`, which under
 * `exactOptionalPropertyTypes` is not a domain `Claim` — an absent topic and a topic explicitly set
 * to undefined are different things. Rebuilding the claim without the key settles it. This function
 * returning `FlowEvent` is also the drift check: it stops compiling if the schema and the domain
 * union diverge.
 */
export const toFlowEvent = (event: ParsedFlowEvent): FlowEvent => {
  if (event.type !== "ClaimAdded") return event;
  const { topic, ...claim } = event.claim;
  return { type: "ClaimAdded", claim: topic === undefined ? claim : { ...claim, topic } };
};

export const MAX_EVENTS_PER_SUBMISSION = 200;

export const SubmitEventsSchema = z.object({
  events: z.array(FlowEventSchema).max(MAX_EVENTS_PER_SUBMISSION),
});
