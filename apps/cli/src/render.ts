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

interface TopicGroup {
  readonly topic: string | null;
  readonly claims: readonly Claim[];
}

/** Consecutive claims sharing a topic form a group, in memo order. Untopiced claims form their own groups. */
export const groupByTopic = (claims: readonly Claim[]): readonly TopicGroup[] =>
  claims.reduce<readonly TopicGroup[]>((groups, claim) => {
    const topic = claim.topic ?? null;
    const last = groups.at(-1);
    if (last && last.topic === topic && topic !== null) return [...groups.slice(0, -1), { topic, claims: [...last.claims, claim] }];
    return [...groups, { topic, claims: [claim] }];
  }, []);

const rowArguments = (state: FlowState, claimId: string): readonly Argument[] =>
  (state.rows[claimId] ?? []).flatMap((id) => {
    const argument = state.arguments[id];
    return argument ? [argument] : [];
  });

const describeArrow = (argument: Argument): string => (argument.respondsTo ? `→ ${argument.respondsTo}` : "→ claim");

const STANCE_MARK: Readonly<Record<Argument["stance"], string>> = { support: "+", attack: "-", question: "?" };

const argumentLine = (argument: Argument, status: RowStatus, position: number, row: readonly Argument[]): string => {
  const drop = status.drops.includes(argument.id) ? "  [drop]" : "";
  const target = argument.respondsTo === null ? "" : `  (answers ${row.findIndex((a) => a.id === argument.respondsTo) + 1})`;
  const source = argument.source === "memo" ? "memo " : "";
  return `    ${String(position + 1).padStart(2)}. ${STANCE_MARK[argument.stance]} ${source}${argument.text}${target}${drop}`;
};

const renderClaimText = (state: FlowState, claim: Claim, index: number): string => {
  const status = statusOf(state, claim.id);
  const header = `${String(index + 1).padStart(2)}. [${STATUS_LABEL[status.status]}] ${claim.text}`;
  const row = rowArguments(state, claim.id);
  const lines = row.map((a, i) => argumentLine(a, status, i, row));
  return [header, ...lines].join("\n");
};

/** Plain-text rendering for a terminal: claims in memo order, grouped under their topic. */
export const renderFlowText = (state: FlowState): string => {
  const claims = orderedClaims(state);
  if (claims.length === 0) return NO_CLAIMS;
  const indexOf = new Map(claims.map((c, i) => [c.id, i]));
  return groupByTopic(claims)
    .map((group) => {
      const rows = group.claims.map((c) => renderClaimText(state, c, indexOf.get(c.id) ?? 0)).join("\n\n");
      return group.topic ? `${group.topic.toUpperCase()}\n\n${rows}` : rows;
    })
    .join("\n\n");
};

/** Markdown rendering suitable for attaching to a deal record. */
export const renderFlowMarkdown = (state: FlowState): string => {
  const claims = orderedClaims(state);
  if (claims.length === 0) return `# Flow\n\n${NO_CLAIMS}\n`;
  const indexOf = new Map(claims.map((c, i) => [c.id, i]));
  const renderClaim = (claim: Claim): string => {
    const status = statusOf(state, claim.id);
    const args = rowArguments(state, claim.id).map(
      (a) => `- **${a.stance}** (${describeArrow(a)}) ${a.text}${status.drops.includes(a.id) ? " _(drop)_" : ""}`,
    );
    const body = args.length > 0 ? args.join("\n") : "_No arguments yet._";
    return `### ${(indexOf.get(claim.id) ?? 0) + 1}. ${claim.text}\n\n**Status:** ${status.status}\n\n${body}`;
  };
  const sections = groupByTopic(claims).map((group) => {
    const rows = group.claims.map(renderClaim).join("\n\n");
    return group.topic ? `## ${group.topic}\n\n${rows}` : rows;
  });
  return `# Flow\n\n${sections.join("\n\n")}\n`;
};
