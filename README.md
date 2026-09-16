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
packages/ingest      .docx / .md → markdown with tables, plus figures sent to the model as images
apps/cli             `autoflow memo <file>`: memo in, seeded flow out
apps/server          HTTP API: runs extraction server-side, serves sample memos
apps/web             room view: the flow as a sheet, with inline corrections
packages/transcription  Transcriber port + Deepgram adapter               — next
```

## Run the app

```sh
cp .env.example .env   # fill in ANTHROPIC_API_KEY or OPENROUTER_API_KEY
pnpm dev               # server on :3001, web on :5173
```

Open http://localhost:5173, then paste a memo, drop or choose a `.docx` / `.md` file, or pick a
sample, and build the flow. Word documents are converted server-side: tables become markdown tables and
embedded charts, screenshots and graphics are sent to the model as images alongside the text. On the sheet you can
click a claim to rename it, use the row menu to merge or delete it, add arguments with a stance and
an arrow, click an argument to change its stance, re-point its arrow or remove it, and undo or export
the event log. The flow persists in the browser between reloads.

## Try it: memo → flow

```sh
cp .env.example .env   # then fill in ANTHROPIC_API_KEY or OPENROUTER_API_KEY
pnpm memo examples/larkspur-memo.md                 # prints the flow (.docx works too)
pnpm memo examples/larkspur-memo.md --out out/      # also writes flow.events.json and flow.md
pnpm memo examples/larkspur-memo.md --model anthropic/claude-sonnet-5   # OpenRouter model ids are prefixed
```

With an Anthropic key, requests go to Anthropic directly and the default model is `claude-sonnet-5`.
With only an OpenRouter key, requests go to OpenRouter's Anthropic-compatible endpoint and the
default is `anthropic/claude-sonnet-5`. Anthropic wins if both are set. Override with `--model` on the
CLI or `AUTOFLOW_MODEL` in `.env` for the server. The choice is backed by the eval in
`packages/classifier/eval` (results: [docs/model-eval-2026-09-10.md](docs/model-eval-2026-09-10.md)).

The event log in `flow.events.json` is the durable artifact; the flow is replayed from it.

## Develop

```sh
pnpm install
pnpm test            # all packages
pnpm typecheck
pnpm test:coverage
```
