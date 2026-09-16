import type { Claim, RowStatus } from "@autoflow/core";
import { useState } from "react";
import type { FlowDoc } from "../lib/store.ts";
import type { FlowActions } from "../lib/useFlowDoc.ts";

interface Props {
  readonly doc: FlowDoc;
  readonly claims: readonly Claim[];
  readonly statuses: Readonly<Record<string, RowStatus>>;
  readonly actions: FlowActions;
}

const count = (statuses: Readonly<Record<string, RowStatus>>, status: RowStatus["status"]) =>
  Object.values(statuses).filter((s) => s.status === status).length;

const download = (doc: FlowDoc) => {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "flow.events.json" });
  a.click();
  URL.revokeObjectURL(url);
};

export const Header = ({ doc, claims, statuses, actions }: Props) => {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const contested = count(statuses, "contested");
  const open = count(statuses, "open");

  return (
    <header className="sheet-header">
      <div>
        <p className="eyebrow">Flow</p>
        <h1 className="sheet-title">{doc.title || "Untitled memo"}</h1>
        <p className="sheet-summary muted">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
          {contested > 0 && <> · <span className="attack">{contested} contested</span></>}
          {open > 0 && <> · <span className="question">{open} open</span></>}
        </p>
      </div>
      <nav className="sheet-actions" aria-label="Flow actions">
        <button className="btn" onClick={actions.undo} disabled={doc.events.length === 0}>Undo</button>
        <button className="btn" onClick={() => download(doc)}>Export</button>
        {confirmingReset ? (
          <span className="confirm">
            <span className="muted">Discard this flow?</span>
            <button className="btn btn-danger" onClick={actions.reset}>Discard</button>
            <button className="btn" onClick={() => setConfirmingReset(false)}>Keep</button>
          </span>
        ) : (
          <button className="btn" onClick={() => setConfirmingReset(true)}>New memo</button>
        )}
      </nav>
    </header>
  );
};
