import type { Claim } from "@autoflow/core";
import type { ApplyEvent } from "../lib/apply.ts";
import { useState } from "react";

interface Props {
  readonly claim: Claim;
  readonly claims: readonly Claim[];
  readonly apply: ApplyEvent;
}

/** Row-level corrections from requirements 4.1: merge into another row, or delete. */
export const RowMenu = ({ claim, claims, apply }: Props) => {
  const [open, setOpen] = useState(false);
  const others = claims.filter((c) => c.id !== claim.id);

  if (!open) {
    return (
      <button className="btn btn-quiet row-menu-toggle" onClick={() => setOpen(true)} aria-label="Row options">
        ···
      </button>
    );
  }

  return (
    <div className="row-menu">
      {others.length > 0 && (
        <label className="field">
          <span className="muted">Merge into</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void apply({ type: "ClaimsMerged", into: e.target.value, from: claim.id });
            }}
          >
            <option value="" disabled>choose a claim…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>{c.text.slice(0, 70)}</option>
            ))}
          </select>
        </label>
      )}
      <button className="btn btn-danger" onClick={() => void apply({ type: "ClaimRemoved", claimId: claim.id })}>Delete row</button>
      <button className="btn" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
};
