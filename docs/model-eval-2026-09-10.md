# Model selection for memo → claims (eval, September 10, 2026)

**Decision:** default memo extraction to **Claude Haiku 4.5** (`claude-haiku-4-5`, or `anthropic/claude-haiku-4.5` via OpenRouter).
**Harness:** `packages/classifier/eval` (see its README). Five fictional memos, hand-written gold, Opus 4.8 as judge, 2 reps per memo, all models through the same adapter and prompt via OpenRouter.

## Results (gold v2, prompt v2)

| Model | Precision | Recall | F1 | Grounded | Leak | Claims/memo | Latency p50 | p90 | Cost/memo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mistralai/mistral-medium-3.1 | 95% | 100% | 97% | 100% | 0% | 15.2 | 4.3s | 6.5s | $0.0018 |
| anthropic/claude-opus-5 | 96% | 97% | 96% | 100% | 0% | 12.7 | 10.2s | 17.2s | $0.0374 |
| openai/gpt-5.4-mini | 94% | 96% | 95% | 99% | 0% | 18.2 | 4.0s | 5.8s | $0.0036 |
| deepseek/deepseek-v4-flash | 97% | 92% | 94% | 100% | 0% | 12.3 | 62.6s | 135.3s | $0.0005 |
| anthropic/claude-sonnet-5 | 98% | 91% | 94% | 100% | 0% | 11.9 | 14.7s | 22.0s | $0.0182 |
| **anthropic/claude-haiku-4.5** | **99%** | 89% | 94% | 100% | **0%** | 11.7 | **3.8s** | 5.5s | $0.0043 |
| google/gemini-2.5-flash | 89% | 98% | 93% | 100% | 0% | 19.3 | 5.3s | 6.1s | $0.0029 |
| openai/gpt-5.4-nano | 91% | 92% | 91% | 100% | 5% | 15.5 | 5.0s | 7.0s | $0.0010 |
| meta-llama/llama-4-maverick | 100% | 83% | 91% | 94% | 0% | 11.1 | 9.7s | 45.8s | $0.0005 |
| google/gemini-3.1-flash-lite | 100% | 76% | 85% | 98% | 0% | 8.3 | 2.4s | 2.5s | $0.0010 |

Ten runs per model (5 memos × 2 reps). With a sample this small, differences of a few points are noise; differences of ten or more are real.

## Why Haiku

- **Precision is the product's stated priority** ("posting a wrong claim that misleads the room is not acceptable"). Haiku has the highest precision of any model that is not sacrificing recall wholesale, zero leaked risks, and every excerpt verbatim from the memo.
- **Its recall gap is a granularity disagreement, not misses.** Reading the traces, every gold claim Haiku (and Sonnet, and Opus) skipped was a thesis-level summary sentence ("data teams have no equivalent of application monitoring") that they folded into the detailed claim it summarises. Under gold v1, which lacked those sentences, Haiku scored 97% recall.
- **Fastest of the accurate models** at 3.8s median, versus 10 to 15s for Opus and Sonnet, whose adaptive thinking dominates their latency here.
- **Roughly 9× cheaper than Opus.** Note this step runs once per discussion, so cost was never the constraint; latency and precision were. Cost will matter for live classification, which is why the harness exists.
- **First-party availability.** Haiku is on the Anthropic API directly, so production does not depend on OpenRouter.

## Runner-up

Mistral Medium 3.1 topped F1 at a lower price and similar latency. Its extra claims include non-claims (a description of what the company does) and low-value items (the growth channel), which the room would have to prune. Worth re-testing if the prompt is tuned toward more inclusive extraction.

## What changed between v1 and v2

- **Gold:** added five thesis-level claims to `quill` and `stratum` that Opus extracted and gold had omitted.
- **Prompt:** risks and caveats are now excluded "wherever they appear", including hedges embedded inside positive sections. Under v1, Haiku posted three inline caveats from the `northwind` memo as claims in one of two runs; under v2, no model leaked on any run except gpt-5.4-nano.

## Not measured

Real memos. All five are fictional and written by the same author, so they share a style. The next real Atland memo should be added as a case with gold written by the memo author.
