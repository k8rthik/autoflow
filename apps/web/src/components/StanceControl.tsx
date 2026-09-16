import type { Stance } from "@autoflow/core";

export const STANCE_MARK: Readonly<Record<Stance, string>> = { support: "+", attack: "–", question: "?" };
const STANCES: readonly Stance[] = ["support", "attack", "question"];

interface Props {
  readonly value: Stance;
  readonly onChange: (stance: Stance) => void;
}

export const StanceControl = ({ value, onChange }: Props) => (
  <span className="segmented" role="group" aria-label="Stance">
    {STANCES.map((stance) => (
      <button key={stance} type="button" className={`seg ${stance}`} aria-pressed={value === stance} onClick={() => onChange(stance)}>
        <b className={`mark ${stance}`}>{STANCE_MARK[stance]}</b> {stance}
      </button>
    ))}
  </span>
);
