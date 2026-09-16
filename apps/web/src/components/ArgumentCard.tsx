import type { Argument, FlowEvent } from "@autoflow/core";
import { AnswersSelect } from "./AnswersSelect.tsx";
import { STANCE_MARK, StanceControl } from "./StanceControl.tsx";

interface Props {
  readonly argument: Argument;
  readonly position: number;
  readonly row: readonly Argument[];
  readonly isDrop: boolean;
  readonly editing: boolean;
  readonly onToggleEdit: () => void;
  readonly apply: (event: FlowEvent) => string | null;
}

/**
 * One argument in the sequence. The arrow before it is implied when it answers the previous card;
 * when it answers something earlier, the target's number is shown so the chain stays legible.
 */
export const ArgumentCard = ({ argument, position, row, isDrop, editing, onToggleEdit, apply }: Props) => {
  const previous = row[position - 1];
  const answersPrevious = argument.respondsTo === (previous?.id ?? null);
  const targetIndex = row.findIndex((a) => a.id === argument.respondsTo);
  const earlier = row.slice(0, position);

  return (
    <span className="card-slot">
      {position > 0 && <span className="arrow" aria-hidden="true">→</span>}
      <button
        className={`card ${argument.stance} ${isDrop ? "is-drop" : ""} ${argument.source === "memo" ? "from-memo" : ""}`}
        onClick={onToggleEdit}
        aria-expanded={editing}
        title={isDrop ? "Dropped: nothing answers this" : "Edit argument"}
      >
        <b className={`mark ${argument.stance}`}>{STANCE_MARK[argument.stance]}</b>
        {!answersPrevious && <span className="answers-ref muted">{argument.respondsTo === null ? "↩ claim" : `↩ ${targetIndex + 1}`}</span>}
        <span className="card-text">{argument.text}</span>
      </button>

      {editing && (
        <div className="popover" role="dialog" aria-label="Edit argument">
          <StanceControl value={argument.stance} onChange={(stance) => apply({ type: "ArgumentRestanced", argumentId: argument.id, stance })} />
          <AnswersSelect
            candidates={earlier}
            value={argument.respondsTo}
            onChange={(respondsTo) => apply({ type: "ArrowRepointed", argumentId: argument.id, respondsTo })}
          />
          <div className="popover-actions">
            <button className="btn btn-danger" onClick={() => apply({ type: "ArgumentRemoved", argumentId: argument.id })}>
              Not an argument
            </button>
            <button className="btn" onClick={onToggleEdit}>Done</button>
          </div>
        </div>
      )}
    </span>
  );
};
