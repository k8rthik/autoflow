# Claim-extraction eval

Measures how well a model turns a memo into flow claims, so model and prompt changes can be
compared on numbers rather than vibes. Runs through OpenRouter's Anthropic-compatible endpoint so
Anthropic and non-Anthropic models go through the identical adapter and prompt.

## Cases

`cases/*.json` — five fictional memos in `examples/`, each with hand-written **gold** claims (what a
careful analyst would put on the flow) and **forbidden** items (risks the memo raises against
itself, the deal ask, the recommendation) that must not appear as claims. Gold was written by hand,
not by a model, so reference matching does not reward imitating any candidate.

| Case | Shape it tests |
|---|---|
| larkspur | Standard sectioned Series A memo, 16 gold claims |
| quill | Short seed memo that restates claims in summary and conclusion (merging) |
| stratum | Long bullet-form Series B with "why we might be wrong" section |
| northwind | Risks interleaved inside each section, not in their own section (leak test) |
| harbor | Two-paragraph pre-seed note, 4 gold claims (minimal case) |

## Metrics

Judge: `anthropic/claude-opus-4.8` (not a candidate) aligns each candidate claim to a gold claim,
a forbidden item, or neither, and flags compound claims. Scores per run:

- **precision** — candidates that state a gold claim / all candidates. The room-misleading failure.
- **recall** — gold claims covered / all gold. The missed-pillar failure.
- **f1** — harmonic mean; the headline for ranking.
- **grounded_rate** — programmatic: excerpt found verbatim in the memo (hallucination check).
- **leak_rate** — candidates that are a forbidden item.
- **compound_rate** — informational only; the gold itself is bundled enough that the judge flags it too.
- **redundant_rate** — candidates restating a gold claim another candidate already covered.
- latency and token usage from the real response; cost derived at report time from OpenRouter prices.

## Run

```sh
node eval/check-judge.ts                          # oracle ≈100%, null ≈0% — run before a paid pass
node eval/run.ts --model anthropic/claude-haiku-4.5 --reps 2 --variant v2   # variant names a prompt/gold version
node eval/report.ts --variant v2                  # markdown table across all models run under that variant
```

Results land in `eval/results/<variant>/<model>/results.jsonl` (resumable) and `traces/` (raw claims plus
judge verdicts, for reading when a number looks odd). Results are gitignored.

## Not covered

The cases are markdown only. Real memos arrive as `.docx` with tables and figures; the ingest path is
unit-tested, but extraction quality from charts and screenshots has no gold yet. Adding a `.docx` case
means storing the file outside the repo (memos are confidential) and writing gold for its figures.
