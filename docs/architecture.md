# Architecture — Decision Record v0.1

**Status:** Proposed, September 10, 2026. Applies to the MVP.
**Companion:** [requirements.md](./requirements.md)

## 1. The one decision that shapes everything else

**The flow is an append-only log of events. Everything the room sees is a projection of that log.**

Read the requirements again with that lens and most of the hard ones fall out for free:

| Requirement | What event sourcing gives us |
|---|---|
| Status is derived, nobody assigns it (4.5) | Status is a pure function of the log. There is no `status` field to get stale. |
| Replay step-by-step (4.9) | Replay is literally re-running the reducer over a prefix of the log. |
| Corrections take effect immediately and are recorded (4.7) | A correction is just another event, same as a classifier decision. Nothing is ever overwritten. |
| Reconstruct the flow after a failure (5) | Transcript segments and events are the durable inputs. Rebuild is `replay(events)`. |
| Argument links back to source text (4.8) | Every `ArgumentAdded` event carries the transcript segment ids it came from. |
| Provisional vs committed (4.6) | Provisional cards are *proposals*, kept in a separate structure outside the log. Committing a proposal appends an event. The log only ever contains what the tool was sure of. |

## 2. Style: hexagonal (ports and adapters) around a pure domain core

```
                 ┌──────────────────────────────────────────────┐
                 │                  apps/web                    │  React + Vite
                 │  room view · row view · transcript · replay  │
                 └───────────────────┬──────────────────────────┘
                                     │ websocket: events + proposals + transcript
                 ┌───────────────────┴──────────────────────────┐
                 │                 apps/server                  │  Node
                 │   session hub · event log · persistence      │
                 └───┬─────────────────┬──────────────────┬─────┘
                     │ port            │ port             │ port
       ┌─────────────┴────┐  ┌─────────┴─────────┐  ┌─────┴──────────┐
       │ transcription    │  │ classifier        │  │ storage        │
       │ (Deepgram, ...)  │  │ (Claude, ...)     │  │ (SQLite, ...)  │
       └──────────────────┘  └───────────────────┘  └────────────────┘
                     all depend on ▼ nothing depends on them
                 ┌──────────────────────────────────────────────┐
                 │               packages/core                  │  zero dependencies
                 │  types · events · reduce() · status() · replay│
                 └──────────────────────────────────────────────┘
```

**Dependency rule.** Arrows point inward only. `core` imports nothing. Adapters import `core`. Apps wire adapters to ports. If a file in `core` ever imports a vendor SDK, that is a bug.

**Why this and not a plain MVC web app.** The domain here (rows, arrows, drops, derived status) is the product. It needs to be exhaustively unit-tested, stable across UI rewrites, and shared verbatim between server and browser. Isolating it in a dependency-free package is what makes that possible. The transcription and LLM vendors, by contrast, are the parts most likely to change; keeping them behind ports means swapping Deepgram for another provider touches one directory.

## 3. Language and framework choices

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere, strict mode | One set of domain types for server and browser. Classifier output schemas are the same objects the reducer consumes. |
| Monorepo | pnpm workspaces | Boring, fast, no extra build tool to learn. Packages import each other by source during the MVP. |
| Domain core | Plain TS, no deps | See §2. Immutable data, functions return new state. |
| Server | Node + Hono + `ws` | Small, fast, WebSocket-native. This is a realtime app, not a content site, so Next.js-style server rendering is the wrong shape. |
| Persistence | SQLite via Drizzle | One file per deployment, trivially backed up alongside the memo. Two tables matter: `events` and `transcript_segments`. |
| Transcription | Deepgram streaming behind a `Transcriber` port | Best current latency and custom-vocabulary support ("keyterms"). Replaceable. |
| Classification | Claude behind a `Classifier` port | Structured outputs into a Zod schema. Memo extraction runs on Haiku 4.5, chosen by eval ([model-eval-2026-09-10.md](./model-eval-2026-09-10.md)). Live classification will be evaluated the same way: fast model for the provisional pass, stronger model to confirm if the eval says it is needed. |
| Web | React + Vite, Zustand, Framer Motion | Framer's layout animations make "card moves rows" a one-prop feature. Zustand holds the projected state and proposal set. |
| Validation | Zod at every boundary | Websocket messages, LLM output, HTTP bodies. `core` stays schema-free; boundaries validate before calling into it. |
| Tests | Vitest | Same runner for core, server, and web. Core targets near-100% coverage; it is small and pure. |

## 4. Domain model (what `packages/core` owns)

- **Claim.** `{ id, text, order }`. One row per claim.
- **Argument.** `{ id, claimId, text, stance, respondsTo, source, sourceRefs }`.
  `stance` is `support | attack | question`. `respondsTo` is an argument id, or `null` meaning "responds to the claim itself". `source` records provenance: `memo | prelim | live | manual`.
- **FlowState.** Claims, arguments, and per-claim row sequences. Immutable. Only `reduce()` produces new ones.
- **FlowEvent.** Discriminated union: `ClaimAdded`, `ClaimRenamed`, `ClaimRemoved`, `ClaimsMerged`, `ArgumentAdded`, `ArgumentEdited`, `ArgumentMoved`, `ArgumentRestanced`, `ArrowRepointed`, `ArgumentsMerged`, `ArgumentRemoved`. Every requirement-4.7 correction maps to exactly one event.
- **Status.** Derived by `statusOf(state, claimId)`.

### Status rule, made precise

The requirements say status comes from "the end of the row". Rows are sequential, but arrows can point to any earlier argument, so "the end" needs a definition that survives that. The rule the core implements:

1. An argument is **standing** if no later argument responds to it.
2. A **drop** is a standing attack or question.
3. Claim status is `contested` if any standing attack exists, else `open` if any standing question exists, else `supported` if the row has any arguments, else `untested`.

`untested` is a fourth status not in the requirements. An empty row is not "supported"; it is a claim nobody engaged. The room view should show it distinctly. **Flagged for confirmation.**

The rule contains no timestamps, matching the "no time-based heuristics" constraint.

## 5. The provisional layer

Proposals are the classifier's not-yet-committed opinions: `{ id, confidence, sourceRefs, candidate: FlowEvent }`. They live beside the log, never in it. The client renders them ghosted. Three things can happen to a proposal:

- The classifier **firms it up** (confidence crosses the commit threshold) and the server appends its candidate event.
- A participant **promotes** it from the holding area, appending the event with `source: manual`.
- It is **withdrawn** or superseded by a later proposal for the same utterance.

This is how the flow "feels instant" while only ever committing what it is sure of.

## 6. Repository layout

```
autoflow/
  docs/                 requirements, this document, later ADRs
  packages/
    core/               domain: types, events, reducer, status, replay   (done)
    classifier/         ClaimExtractor port + Claude adapter              (done: memo → claims)
    transcription/      Transcriber port + Deepgram adapter               (next)
  apps/
    cli/                `autoflow memo`: memo file in, seeded flow out    (done)
    server/             Hono + ws hub, SQLite event log                   (next)
    web/                React room/row/transcript views                   (next)
```

## 7. Build order for the MVP

1. **Core** with full tests. Done in this scaffold. Everything else is replaceable; this is not.
2. **Memo and prelims import** through the classifier port, producing `ClaimAdded` and `ArgumentAdded` events. Lets us test claim granularity against real memos (open question 1) before touching audio. *Memo half done via `apps/cli`; prelims next.*
3. **Web room view** reading a static event log. Validates the projection visually and the animation model.
4. **Server** with websocket fan-out and SQLite log.
5. **Live transcription** feeding the transcript view only.
6. **Live classification** producing proposals, then commits.
7. Replay, summary, export.

## 8. Things deliberately not decided yet

- Auth and access control. Requirement 5 says "same controls as the memo"; until we know where memos live, this is a stub.
- Deployment target. SQLite on one box is fine for a room; revisit if sessions must be shared across offices.
- Whether the confirmation classifier runs on every proposal or only on those above a floor confidence.
