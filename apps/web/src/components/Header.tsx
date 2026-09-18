import type { Claim, RowStatus } from "@autoflow/core";
import { useState } from "react";
import type { SessionDoc } from "../lib/session-doc.ts";

interface Props {
  readonly doc: SessionDoc;
  readonly claims: readonly Claim[];
  readonly statuses: Readonly<Record<string, RowStatus>>;
  readonly onLeave: () => void;
}

const count = (statuses: Readonly<Record<string, RowStatus>>, status: RowStatus["status"]) =>
  Object.values(statuses).filter((s) => s.status === status).length;

const download = (doc: SessionDoc) => {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "flow.events.json" });
  a.click();
  URL.revokeObjectURL(url);
};

export const Header = ({ doc, claims, statuses, onLeave }: Props) => {
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const contested = count(statuses, "contested");
  const open = count(statuses, "open");

  return (
    <header className="sheet-header">
      <div>
        <p className="eyebrow">Flow</p>
        <h1 className="sheet-title">{doc.session.title || "Untitled memo"}</h1>
        <p className="sheet-summary muted">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
          {contested > 0 && <> · <span className="attack">{contested} contested</span></>}
          {open > 0 && <> · <span className="question">{open} open</span></>}
        </p>
      </div>
      <nav className="sheet-actions" aria-label="Flow actions">
        <button className="btn" onClick={() => download(doc)}>Export</button>
        {confirmingLeave ? (
          <span className="confirm">
            <span className="muted">Leave this room? The flow stays on the server.</span>
            <button className="btn btn-danger" onClick={onLeave}>Leave</button>
            <button className="btn" onClick={() => setConfirmingLeave(false)}>Stay</button>
          </span>
        ) : (
          <button className="btn" onClick={() => setConfirmingLeave(true)}>New memo</button>
        )}
      </nav>
    </header>
  );
};
