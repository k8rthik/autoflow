import type { Claim } from "@autoflow/core";
import { useState } from "react";

interface Props {
  readonly claim: Claim;
  readonly onRename: (text: string) => void;
}

/** The claim reads as memo prose; clicking it turns it into a field. Enter commits, Escape cancels. */
export const ClaimText = ({ claim, onRename }: Props) => {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const text = draft?.trim() ?? "";
    if (text !== "" && text !== claim.text) onRename(text);
    setDraft(null);
  };

  if (draft === null) {
    return (
      <button className="claim-text" onClick={() => setDraft(claim.text)} title="Edit claim">
        {claim.text}
      </button>
    );
  }

  return (
    <textarea
      className="claim-text claim-edit"
      value={draft}
      autoFocus
      rows={3}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setDraft(null);
      }}
      aria-label="Claim text"
    />
  );
};
