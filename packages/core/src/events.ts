import type { Argument, ArgumentId, Claim, ClaimId, Stance } from "./types.ts";

/**
 * Every change to a flow is one of these. The log of events is the source of truth;
 * `FlowState` is a projection of it. Each correction in requirements §4.7 maps to
 * exactly one event type.
 */
export type FlowEvent =
  | { readonly type: "ClaimAdded"; readonly claim: Claim }
  | { readonly type: "ClaimRenamed"; readonly claimId: ClaimId; readonly text: string }
  | { readonly type: "ClaimRemoved"; readonly claimId: ClaimId }
  | { readonly type: "ClaimsMerged"; readonly into: ClaimId; readonly from: ClaimId }
  | { readonly type: "ArgumentAdded"; readonly argument: Argument }
  | { readonly type: "ArgumentEdited"; readonly argumentId: ArgumentId; readonly text: string }
  | { readonly type: "ArgumentMoved"; readonly argumentId: ArgumentId; readonly toClaimId: ClaimId }
  | { readonly type: "ArgumentRestanced"; readonly argumentId: ArgumentId; readonly stance: Stance }
  | { readonly type: "ArrowRepointed"; readonly argumentId: ArgumentId; readonly respondsTo: ArgumentId | null }
  | { readonly type: "ArgumentsMerged"; readonly keep: ArgumentId; readonly drop: ArgumentId }
  | { readonly type: "ArgumentRemoved"; readonly argumentId: ArgumentId };

export type FlowEventType = FlowEvent["type"];

/** Who caused an event to be appended. */
export type Actor = "classifier" | "participant" | "import";

/** An event as stored in the log. `seq` is the log position; `at` is an ISO-8601 timestamp. */
export interface RecordedEvent {
  readonly seq: number;
  readonly at: string;
  readonly actor: Actor;
  readonly event: FlowEvent;
}
