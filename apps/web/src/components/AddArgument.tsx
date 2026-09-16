import type { Argument, Claim, FlowEvent, Stance } from "@autoflow/core";
import { useState } from "react";
import { newId } from "../lib/ids.ts";
import { AnswersSelect } from "./AnswersSelect.tsx";
import { StanceControl } from "./StanceControl.tsx";

interface Props {
  readonly claim: Claim;
  readonly row: readonly Argument[];
  readonly apply: (event: FlowEvent) => string | null;
  readonly onDone: () => void;
}

/** Appends to the end of the row. Defaults to answering the latest argument, as a response in the room would. */
export const AddArgument = ({ claim, row, apply, onDone }: Props) => {
  const last = row.at(-1);
  const [stance, setStance] = useState<Stance>(last && last.stance !== "support" ? "support" : "attack");
  const [text, setText] = useState("");
  const [respondsTo, setRespondsTo] = useState<string | null>(last?.id ?? null);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const error = apply({
      type: "ArgumentAdded",
      argument: { id: newId(), claimId: claim.id, text: trimmed, stance, respondsTo, source: "manual", sourceRefs: [] },
    });
    if (!error) onDone();
  };

  return (
    <form
      className="add-argument"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <StanceControl value={stance} onChange={setStance} />
      <input
        className="add-text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What was said"
        aria-label="Argument text"
      />
      <AnswersSelect candidates={row} value={respondsTo} onChange={setRespondsTo} />
      <button type="submit" className="btn btn-primary" disabled={text.trim() === ""}>Add</button>
      <button type="button" className="btn" onClick={onDone}>Cancel</button>
    </form>
  );
};
