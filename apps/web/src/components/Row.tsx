import type { Argument, Claim, FlowState, RowStatus } from "@autoflow/core";
import { useState } from "react";
import type { FlowActions } from "../lib/useFlowDoc.ts";
import { AddArgument } from "./AddArgument.tsx";
import { ArgumentCard } from "./ArgumentCard.tsx";
import { ClaimText } from "./ClaimText.tsx";
import { RowMenu } from "./RowMenu.tsx";
import { StatusMark } from "./StatusMark.tsx";

interface Props {
  readonly claim: Claim;
  readonly index: number;
  readonly state: FlowState;
  readonly status: RowStatus;
  readonly claims: readonly Claim[];
  readonly actions: FlowActions;
}

const argumentsOn = (state: FlowState, claimId: string): readonly Argument[] =>
  (state.rows[claimId] ?? []).flatMap((id) => {
    const a = state.arguments[id];
    return a ? [a] : [];
  });

export const Row = ({ claim, index, state, status, claims, actions }: Props) => {
  const args = argumentsOn(state, claim.id);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply: FlowActions["apply"] = (event) => {
    const message = actions.apply(event);
    setError(message);
    return message;
  };

  return (
    <li className={`row row-${status.status}`}>
      <span className="row-number muted">{index + 1}</span>

      <div className="row-claim">
        <ClaimText claim={claim} onRename={(text) => apply({ type: "ClaimRenamed", claimId: claim.id, text })} />
        <RowMenu claim={claim} claims={claims} apply={apply} />
      </div>

      <div className="row-sequence">
        {args.map((argument, i) => (
          <ArgumentCard
            key={argument.id}
            argument={argument}
            position={i}
            row={args}
            isDrop={status.drops.includes(argument.id)}
            editing={editingId === argument.id}
            onToggleEdit={() => setEditingId((id) => (id === argument.id ? null : argument.id))}
            apply={apply}
          />
        ))}
        {adding ? (
          <AddArgument claim={claim} row={args} apply={apply} onDone={() => setAdding(false)} />
        ) : (
          <button className="btn btn-add" onClick={() => setAdding(true)} aria-label={`Add an argument to claim ${index + 1}`}>
            +
          </button>
        )}
        {error && <span className="error row-error" role="alert">{error}</span>}
      </div>

      <StatusMark status={status.status} />
    </li>
  );
};
