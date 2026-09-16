import type { Argument } from "@autoflow/core";
import { STANCE_MARK } from "./StanceControl.tsx";

interface Props {
  readonly candidates: readonly Argument[];
  readonly value: string | null;
  readonly onChange: (respondsTo: string | null) => void;
}

/** What an argument answers: the claim itself, or an earlier argument on the same row. */
export const AnswersSelect = ({ candidates, value, onChange }: Props) => (
  <label className="field">
    <span className="muted">answers</span>
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      <option value="">the claim</option>
      {candidates.map((a, i) => (
        <option key={a.id} value={a.id}>
          {i + 1}. {STANCE_MARK[a.stance]} {a.text.slice(0, 60)}
        </option>
      ))}
    </select>
  </label>
);
