# autoflow

Turns a live investment discussion into a **flow**: the note-taking structure used in
competitive debate. Every claim in the memo gets a row; every argument made about it lands
on that row with an arrow to what it answers; status is derived from what is left standing.

- [Requirements](docs/requirements.md)
- [Architecture decision record](docs/architecture.md)

## Layout

```
packages/core        pure domain: types, events, reducer, status derivation, replay
packages/classifier  ClaimExtractor port + Claude adapter; memo → ClaimAdded events
apps/cli             `autoflow memo <file>`: memo in, seeded flow out
packages/transcription  Transcriber port + Deepgram adapter               — next
apps/server          websocket hub and event log                          — next
apps/web             room / row / transcript views                        — next
```

## Try it: memo → flow

```sh
cp .env.example .env   # then fill in ANTHROPIC_API_KEY or OPENROUTER_API_KEY
pnpm memo examples/larkspur-memo.md                 # prints the flow
pnpm memo examples/larkspur-memo.md --out out/      # also writes flow.events.json and flow.md
pnpm memo examples/larkspur-memo.md --model anthropic/claude-sonnet-5   # OpenRouter model ids are prefixed
```

With an Anthropic key, requests go to Anthropic directly and the default model is `claude-haiku-4-5`.
With only an OpenRouter key, requests go to OpenRouter's Anthropic-compatible endpoint and the
default is `anthropic/claude-haiku-4.5`. Anthropic wins if both are set. The default was chosen by
the eval in `packages/classifier/eval` (results: [docs/model-eval-2026-09-10.md](docs/model-eval-2026-09-10.md)).

The event log in `flow.events.json` is the durable artifact; the flow is replayed from it.

## Develop

```sh
pnpm install
pnpm test            # all packages
pnpm typecheck
pnpm test:coverage
```
