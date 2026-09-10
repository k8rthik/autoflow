/** One judge verdict per candidate claim. Indices are 0-based into the gold / forbidden lists. */
export interface Alignment {
  readonly candidate: number;
  readonly gold: number | null;
  readonly forbidden: number | null;
  readonly compound: boolean;
}

export interface Scores {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly leak_rate: number;
  readonly compound_rate: number;
  readonly redundant_rate: number;
}

const ratio = (numerator: number, denominator: number): number => (denominator === 0 ? 0 : numerator / denominator);

/**
 * precision: share of candidates that state a gold claim.
 * recall: share of gold claims some candidate states.
 * leak_rate: share of candidates that are a forbidden item (risk, ask, recommendation).
 * compound_rate: share of candidates the judge flagged as two arguable assertions in one.
 * redundant_rate: share of candidates that restate a gold claim another candidate already covered.
 */
export const score = (goldCount: number, candidateCount: number, alignments: readonly Alignment[]): Scores => {
  const matched = alignments.filter((a) => a.gold !== null);
  const distinctGold = new Set(matched.map((a) => a.gold));
  const precision = ratio(matched.length, candidateCount);
  const recall = ratio(distinctGold.size, goldCount);
  return {
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    leak_rate: ratio(alignments.filter((a) => a.forbidden !== null).length, candidateCount),
    compound_rate: ratio(alignments.filter((a) => a.compound).length, candidateCount),
    redundant_rate: ratio(matched.length - distinctGold.size, candidateCount),
  };
};
