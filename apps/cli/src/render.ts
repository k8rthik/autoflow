import { statusOf, type Argument, type Claim, type FlowState, type RowStatus, type Status } from "@autoflow/core";

const STATUS_LABEL: Readonly<Record<Status, string>> = {
  supported: "SUPPORTED",
  contested: "CONTESTED",
  open: "OPEN",
  untested: "untested",
};

const NO_CLAIMS = "No claims on the flow.";

const orderedClaims = (state: FlowState): readonly Claim[] =>
  Object.values(state.claims).toSorted((a, b) => a.order - b.order);

const rowArguments = (state: FlowState, claimId: string): readonly Argument[] =>
  (state.rows[claimId] ?? []).flatMap((id) => {
    const argument = state.arguments[id];
    return argument ? [argument] : [];
  });

const describeArrow = (argument: Argument): string => (argument.respondsTo ? `→ ${argument.respondsTo}` : "→ claim");

const argumentLine = (argument: Argument, status: RowStatus): string => {
  const drop = status.drops.includes(argument.id) ? "  [drop]" : "";
  return `    ${argument.id}  ${argument.stance.padEnd(8)} ${describeArrow(argument).padEnd(10)} ${argument.text}${drop}`;
};

/** Plain-text rendering for a terminal: one block per claim in memo order. */
export const renderFlowText = (state: FlowState): string => {
  const claims = orderedClaims(state);
  if (claims.length === 0) return NO_CLAIMS;
  return claims
    .map((claim, index) => {
      const status = statusOf(state, claim.id);
      const header = `${String(index + 1).padStart(2)}. [${STATUS_LABEL[status.status]}] ${claim.text}`;
      const lines = rowArguments(state, claim.id).map((a) => argumentLine(a, status));
      return [header, ...lines].join("\n");
    })
    .join("\n\n");
};

/** Markdown rendering suitable for attaching to a deal record. */
export const renderFlowMarkdown = (state: FlowState): string => {
  const claims = orderedClaims(state);
  if (claims.length === 0) return `# Flow\n\n${NO_CLAIMS}\n`;
  const sections = claims.map((claim, index) => {
    const status = statusOf(state, claim.id);
    const args = rowArguments(state, claim.id).map(
      (a) => `- **${a.stance}** (${describeArrow(a)}) ${a.text}${status.drops.includes(a.id) ? " _(drop)_" : ""}`,
    );
    const body = args.length > 0 ? args.join("\n") : "_No arguments yet._";
    return `## ${index + 1}. ${claim.text}\n\n**Status:** ${status.status}\n\n${body}`;
  });
  return `# Flow\n\n${sections.join("\n\n")}\n`;
};
