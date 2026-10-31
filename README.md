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
packages/storage     EventStore port + SQLite and in-memory adapters for the append-only log
packages/transcription  Transcriber port + Deepgram streaming adapter; room audio → transcript segments
apps/cli             `autoflow memo <file>`: memo in, seeded flow out
apps/server          session hub, HTTP API, websocket fan-out of the event log and transcript, audio in
apps/web             room view: the flow as a sheet, with inline corrections
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
an arrow, click an argument to change its stance, re-point its arrow or remove it, and export the
event log.

Building a flow opens a **room**, and the room is in the URL (`#/s/<id>`). Share that link and
everyone who opens it joins the same flow: corrections are validated on the server and pushed to
every other participant over a websocket. The log lives in SQLite at `data/autoflow.db` (override
with `AUTOFLOW_DB`), so a reload — or a server restart — comes back to the same room.

Corrections are append-only, so there is no undo button: fixing a correction means making another
one, and every step stays in the log.

## Live transcription

Set `DEEPGRAM_API_KEY` in `.env` to turn it on. Without it the server still starts, prints that
transcription is off, and refuses audio connections with close code 4503.

A microphone client opens a websocket to `/ws/sessions/<id>/audio` and sends the recording as binary
frames, in a container Deepgram can read without being told the format: WebM/Opus from the browser's
`MediaRecorder`, Ogg, or WAV. Text frames close the socket with 1003. The server relays the audio to
Deepgram (`nova-3`, interim results on) and sends every segment it hears to everyone on
`/ws/sessions/<id>` as `{ "type": "transcript", "segment": { ... } }`. A segment's id stays the same
while its text is interim, and the segment with `final: true` replaces the earlier ones. If Deepgram
fails or drops the stream, the server closes the microphone's socket with 1011 and the reason.

Segments are not stored yet, and the web app has no transcript view or microphone button yet.

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
